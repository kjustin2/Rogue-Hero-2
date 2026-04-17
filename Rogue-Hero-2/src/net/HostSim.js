// HostSim.js — Host-only authoritative simulation extensions.
// On the host, enemy AI / projectile spawns / drops / RNG run normally;
// it broadcasts snapshots and events. On a client, these systems are
// replaced by interpolation reads from snapshots received over the net.
//
// This module only does the orchestration; the underlying systems
// (Combat, Enemy, Projectile, RunManager) are unchanged.

import { events } from '../EventBus.js';
import { SnapshotEncoder } from './Snapshot.js';

export class HostSim {
  constructor(net) {
    this.net = net;
    this.encoder = new SnapshotEncoder();
    this.frame = 0;
    this.snapshotInterval = 1 / 15; // 15 Hz
    this._snapshotAccum = 0;

    // Forward synchronous world events as reliable messages.
    const reliableEvents = [
      'KILL', 'PLAYER_DOWNED', 'PLAYER_REVIVED', 'BOSS_PHASE',
      'ZONE_TRANSITION', 'ROOM_CLEARED', 'ROOM_ENTERED',
      'CONTROLS_INVERT', 'COLD_CRASH', 'CRASH_ATTACK',
      'SPAWN_PUDDLE', 'SPAWN_BLOOMSPAWN', 'SPAWN_HOLLOW_CLONE',
      'CHOIR_HEAL', 'BOSS_PHASE',
    ];
    for (const evtName of reliableEvents) {
      events.on(evtName, (payload) => {
        if (this.net.role === 'host') this.net.sendReliable('evt', { name: evtName, p: payload });
      });
    }
  }

  // Call from main loop after sim step: broadcasts position snapshot.
  tick(dt, players, enemies) {
    if (this.net.role !== 'host') return;
    this.frame++;
    this._snapshotAccum += dt;
    if (this._snapshotAccum < this.snapshotInterval) return;
    this._snapshotAccum = 0;

    // Tag entities with stable ids for snapshot diffing
    let nextId = 1;
    const tagged = [];
    for (const p of players) { if (!p.id) p.id = 'p' + (p.playerIndex ?? nextId++); tagged.push(p); }
    for (const e of enemies) { if (!e.id) e.id = 'e' + (nextId++); if (e.alive) tagged.push(e); }

    const snap = this.encoder.encodePositions(this.frame, tagged);
    this.net.sendUnreliable('snap', snap);
  }
}
