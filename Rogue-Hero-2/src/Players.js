// Players.js — Multi-player array manager for RH2.
// Wraps an Array<Player> with helpers for downed/revive, Group Tempo
// Resonance, and broadcast updates. Solo play uses this with length === 1.
//
// IMPORTANT: This is additive infrastructure. main.js can keep its
// existing `player` reference as `players[0]` while this is wired in.

import { Player } from './player.js';
import { events } from './EventBus.js';

// Ally-color palette by player index (overridable per character)
export const PLAYER_HALO_COLORS = ['#44ddff', '#ff7744', '#aaff66', '#cc88ff'];

export class Players {
  constructor() {
    this.list = [];
    this.maxCount = 4;
    this.netRoles = []; // 'local' | 'remote' | 'host'
  }

  add(player, opts = {}) {
    if (this.list.length >= this.maxCount) return false;
    player.playerIndex = this.list.length;
    player.haloColor   = opts.haloColor || PLAYER_HALO_COLORS[player.playerIndex];
    player.netRole     = opts.netRole || 'local';
    player.downed      = false;
    player.downedTimer = 0;
    player.reviveProgress = 0;
    this.list.push(player);
    this.netRoles.push(player.netRole);
    return true;
  }

  reset() {
    this.list.length = 0;
    this.netRoles.length = 0;
  }

  get count() { return this.list.length; }
  get primary() { return this.list[0]; }
  get(i) { return this.list[i]; }
  forEach(cb) { for (let i = 0; i < this.list.length; i++) cb(this.list[i], i); }

  anyAlive() {
    for (const p of this.list) if (p.alive && !p.downed) return true;
    return false;
  }

  allDownedOrDead() {
    for (const p of this.list) if (p.alive && !p.downed) return false;
    return true;
  }

  // ── Downed / Revive ──────────────────────────────────────────────
  // Call from main.js when a player's HP would hit 0 in MP context
  goDown(player) {
    if (player.downed || !player.alive) return;
    player.downed = true;
    player.downedTimer = 0;
    player.hp = 0;
    player.vx = 0; player.vy = 0;
    events.emit('PLAYER_DOWNED', { player });
  }

  // Run each frame after movement: any standing ally near a downed
  // player progresses revive; 2.0 s contact = full revive at 30% HP.
  updateRevives(dt) {
    for (const p of this.list) {
      if (!p.alive || !p.downed) continue;
      // In remote MP, the `_isRemote` placeholder is owned by the OTHER side —
      // their machine handles its revive and broadcasts PLAYER_REVIVED back.
      if (p._isRemote) continue;
      let inContact = false;
      for (const a of this.list) {
        if (a === p || !a.alive || a.downed) continue;
        const dx = a.x - p.x, dy = a.y - p.y;
        if (dx * dx + dy * dy < (a.r + p.r + 8) ** 2) { inContact = true; break; }
      }
      if (inContact) {
        p.reviveProgress = Math.min(1, p.reviveProgress + dt / 2.0);
        if (p.reviveProgress >= 1) {
          p.downed = false;
          p.reviveProgress = 0;
          p.hp = Math.max(1, Math.round(p.maxHp * 0.3));
          events.emit('PLAYER_REVIVED', { player: p });
          // Tide passive: revive heals self
          for (const a of this.list) {
            if (a !== p && a.alive && a._classPassives?.reviveHealSelf) {
              a.heal(a._classPassives.reviveHealSelf);
            }
          }
        }
      } else if (p.reviveProgress > 0) {
        p.reviveProgress = Math.max(0, p.reviveProgress - dt * 0.5);
      }
    }
  }

  // ── Group Tempo Resonance ────────────────────────────────────────
  // Returns a damage multiplier based on how many players share zone.
  // 2 → 1.10, 3 → 1.20, 4 → 1.30. Solo or no match → 1.0.
  resonanceMultiplier(tempoZoneByIndex) {
    const counts = { COLD: 0, FLOWING: 0, HOT: 0, CRITICAL: 0 };
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      if (!p.alive || p.downed) continue;
      const zone = tempoZoneByIndex[i];
      if (zone) counts[zone] = (counts[zone] || 0) + 1;
    }
    let max = 0;
    for (const k in counts) if (counts[k] > max) max = counts[k];
    if (max <= 1) return 1.0;
    if (max === 2) return 1.10;
    if (max === 3) return 1.20;
    return 1.30;
  }

  // Tempo zone for a single player (mirror of TempoSystem.stateName)
  static zoneFor(value) {
    if (value < 30) return 'COLD';
    if (value < 70) return 'FLOWING';
    if (value < 90) return 'HOT';
    return 'CRITICAL';
  }
}

// Factory: build a Player instance from a character def.
export function makePlayer(charDef, x, y) {
  const p = new Player(x, y, charDef.hp, charDef.maxHp, charDef.baseSpeed);
  p.apRegen = charDef.apRegen;
  p.charId = charDef.id;
  p.color = charDef.color;
  p.setClassPassives(charDef.passives);
  return p;
}
