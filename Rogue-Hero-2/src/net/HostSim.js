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
    this.snapshotInterval = 1 / 15; // 15 Hz
    this._snapshotAccum = 0;

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

    // Client → host: damage dealt to enemies. Host applies it authoritatively
    // and (if it kills the enemy) emits KILL which is mirrored back via the
    // hostForwardedEvents path. Host does NOT forward its own damage events.
    events.on('DAMAGE_DEALT', (payload) => {
      if (this.net.role !== 'client' || this.net.peers.size === 0) return;
      this.net.sendReliable('evt', { name: 'DAMAGE_DEALT', p: payload });
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

  // Call from main loop after sim step: broadcasts position snapshot at 15Hz.
  tick(dt, players, enemies) {
    if (this.net.role === 'solo' || this.net.peers.size === 0) return;
    this.frame++;
    this._snapshotAccum += dt;
    if (this._snapshotAccum < this.snapshotInterval) return;
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
    const snap = this.encoder.encodePositions(this.frame, tagged);
    this.net.sendUnreliable('snap', snap);
  }
}
