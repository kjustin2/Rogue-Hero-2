// HostSim.js — Position snapshot broadcaster + reliable event forwarder.
// Both host and client run this:
//   - Each side broadcasts its OWN player position (skipping _isRemote placeholders).
//   - Only the host additionally broadcasts enemy positions (host is authoritative for enemies).
//   - Host forwards world events to clients; client forwards player-state events to host.
//
// Remote placeholders on each side are updated by snapshots arriving from the other side.

import { events } from '../EventBus.js';
import { SnapshotEncoder } from './Snapshot.js';

export class HostSim {
  constructor(net) {
    this.net = net;
    this.encoder = new SnapshotEncoder();
    this.frame = 0;
    this.snapshotInterval = 1 / 20; // 20 Hz — smoother remote motion than 15 Hz, modest bandwidth bump
    this._snapshotAccum = 0;
    // Per-frame DAMAGE_DEALT batcher: AoE / channel attacks can fire 20+
    // hits per frame; sending one reliable message per hit floods the evt
    // channel. Instead, sum damage per enemy id and flush once per tick.
    this._damageBatch = new Map();  // id → accumulated amount

    // Events the HOST forwards to clients (world/enemy/run state).
    const hostForwardedEvents = [
      'KILL', 'BOSS_PHASE',
      'ZONE_TRANSITION', 'ROOM_ENTERED',
      'CONTROLS_INVERT', 'COLD_CRASH', 'CRASH_ATTACK',
      'SPAWN_PUDDLE', 'SPAWN_BLOOMSPAWN', 'SPAWN_HOLLOW_CLONE',
      'CHOIR_HEAL',
    ];
    for (const evtName of hostForwardedEvents) {
      events.on(evtName, (payload) => {
        if (this.net.role === 'host' && this.net.peers.size > 0) {
          this.net.sendReliable('evt', { name: evtName, p: payload });
        }
      });
    }

    // Visual card effects forwarded BOTH directions so each player sees
    // the other's big moves. World-entity spawns (traps, orbs, sigils,
    // echoes, ground waves) are re-spawned on the remote side as
    // visual-only (marked `_netRemote` in main.js spawn handlers so the
    // update loop skips damage application — otherwise both sides would
    // apply damage and double it up).
    const visualCardEvents = [
      'SPAWN_BEAM_FLASH',
      'SPAWN_TRAP', 'SPAWN_ORBS', 'SPAWN_SIGIL', 'SPAWN_ECHO', 'SPAWN_GROUND_WAVE',
      'NET_PROJECTILE_SPAWN',
    ];
    for (const evtName of visualCardEvents) {
      events.on(evtName, (payload) => {
        if (this.net.role === 'solo' || this.net.peers.size === 0) return;
        if (payload && payload._netOrigin === 'remote') return; // don't echo
        const safe = { ...payload }; delete safe._netOrigin;
        this.net.sendReliable('evt', { name: evtName, p: safe, _visual: true });
      });
    }

    // Client → host: damage dealt to enemies. We BATCH these per frame so
    // wide-hit cards (beams, channels, AoE) don't spam reliable messages.
    // Host applies damage authoritatively on arrival; if it kills the
    // enemy, KILL mirrors back via hostForwardedEvents. Host does NOT
    // forward its own damage events.
    events.on('DAMAGE_DEALT', (payload) => {
      if (this.net.role !== 'client' || this.net.peers.size === 0) return;
      if (!payload || !payload.id || !payload.amount) return;
      const prev = this._damageBatch.get(payload.id) || 0;
      this._damageBatch.set(payload.id, prev + payload.amount);
    });

    // Player-state events both sides forward (each describes the LOCAL player going down/up).
    // Receiver applies to its `_isRemote` placeholder (= the OTHER player).
    // Skip events that came from a remote `_isRemote` player (those originated on the peer).
    const bidirectionalEvents = ['PLAYER_DOWNED', 'PLAYER_REVIVED'];
    for (const evtName of bidirectionalEvents) {
      events.on(evtName, (payload) => {
        if (this.net.role === 'solo' || this.net.peers.size === 0) return;
        const p = payload?.player;
        if (p?._isRemote) return; // don't echo a remote-owned event back
        // Strip the player ref (non-serializable cycles) and send only what receiver needs
        const minimal = { playerIndex: p?.playerIndex, playerId: p?.id };
        this.net.sendReliable('evt', { name: evtName, p: minimal });
      });
    }
  }

  // Drop all cached per-entity state — call on room transitions so reused
  // enemy IDs don't leak stale positions across snapshots, and pending
  // damage batches don't bleed into the next fight.
  reset() {
    this.encoder.reset();
    this._damageBatch.clear();
    if (this._lastEnemyHp) this._lastEnemyHp.clear();
    this._snapshotAccum = 0;
    // Note: we do NOT reset this.frame — decoder uses monotonically
    // increasing frame numbers to reject stale snaps; rewinding would
    // cause the first post-reset snap to be ignored until the counter
    // catches up.
  }

  // Broadcast per-enemy HP on change. Small, cheap: only enemies whose HP
  // changed since the last send are included. Uses the reliable channel —
  // frequency is bounded by how often HP actually changes (player hits).
  _broadcastEnemyHp(enemies) {
    if (this.net.role !== 'host') return;
    if (!this._lastEnemyHp) this._lastEnemyHp = new Map();
    const hps = [];
    const seenIds = new Set();
    for (const e of enemies) {
      if (!e || !e.id) continue;
      seenIds.add(e.id);
      const prev = this._lastEnemyHp.get(e.id);
      if (prev === undefined || prev !== e.hp) {
        hps.push([e.id, Math.max(0, Math.round(e.hp))]);
        this._lastEnemyHp.set(e.id, e.hp);
      }
    }
    // Drop cached HP entries for enemies that no longer exist.
    for (const id of this._lastEnemyHp.keys()) {
      if (!seenIds.has(id)) this._lastEnemyHp.delete(id);
    }
    if (hps.length === 0) return;
    this.net.sendReliable('evt', { name: 'ENEMY_HP_SYNC', p: { hps } });
  }

  // Flush accumulated per-enemy damage into one reliable message.
  _flushDamageBatch() {
    if (this._damageBatch.size === 0) return;
    if (this.net.role !== 'client' || this.net.peers.size === 0) {
      this._damageBatch.clear();
      return;
    }
    // Compact array form: [[id, amount], …] — smaller over the wire than
    // an object-of-objects, and still trivial to JSON-stringify.
    const hits = [];
    for (const [id, amount] of this._damageBatch) hits.push([id, amount]);
    this._damageBatch.clear();
    this.net.sendReliable('evt', { name: 'DAMAGE_BATCH', p: { hits } });
  }

  // Call from main loop after sim step: broadcasts position snapshot.
  // Rate adapts to game state: `snapshotInterval` (20 Hz) during combat,
  // 2 Hz on idle screens (draft, shop, map). Saves ~90% bandwidth outside
  // fights. Also flushes the pending DAMAGE_BATCH each tick.
  tick(dt, players, enemies) {
    if (this.net.role === 'solo' || this.net.peers.size === 0) return;
    this.frame++;
    // Drain pending client-side damage first — damage is time-sensitive,
    // don't gate it on the position-snapshot interval.
    this._flushDamageBatch();
    // Host is authoritative for enemy HP. After damage is applied (either
    // from host's own attacks or from DAMAGE_BATCH above), broadcast the
    // delta'd HPs so the client's HP bars + kill state match. Runs before
    // the position-snapshot rate gate so HP stays responsive even outside
    // the 20 Hz pose stream.
    this._broadcastEnemyHp(enemies);
    this._snapshotAccum += dt;
    const inPlaying = (typeof window !== 'undefined' && window._gameState === 'playing');
    const interval = inPlaying ? this.snapshotInterval : 0.5; // 2Hz outside combat
    if (this._snapshotAccum < interval) return;
    this._snapshotAccum = 0;

    let nextId = 1;
    const tagged = [];
    // Each side broadcasts its own (non-remote) player(s).
    for (const p of players) {
      if (!p.id) p.id = 'p' + (p.playerIndex ?? nextId++);
      if (!p._isRemote && p.alive !== false) tagged.push(p);
    }
    // Only the host broadcasts enemy positions (authoritative).
    if (this.net.role === 'host') {
      for (const e of enemies) {
        if (!e.id) e.id = 'e' + (nextId++);
        if (e.alive) tagged.push(e);
      }
    }

    if (tagged.length === 0) return;
    // Use binary encoding when available — ~12× smaller than the JSON path.
    if (this.encoder.encodePositionsBinary) {
      const buf = this.encoder.encodePositionsBinary(this.frame, tagged);
      this.net.sendUnreliable('snap', buf);
    } else {
      const snap = this.encoder.encodePositions(this.frame, tagged);
      this.net.sendUnreliable('snap', snap);
    }
  }
}
