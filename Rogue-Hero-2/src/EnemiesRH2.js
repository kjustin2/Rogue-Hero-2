// EnemiesRH2.js — New enemy classes for Rogue Hero 2.
// All extend the base Enemy from Enemy.js and follow the same conventions:
//   - call updateSpawn / updateTimers
//   - emit ENEMY_MELEE_HIT { damage, source: this } for player damage
//   - call room.clamp() after movement
//   - never call events.on() inside updateLogic (constructor-only)
//
// main.js should import these and add to its Enemy roster spawn pool.

import { Enemy } from './Enemy.js';
import { events } from './EventBus.js';

// ── TETHER WITCH ────────────────────────────────────────────────────
// Anti-spread support. If party members in window._players are > 300 px
// apart, ticks 1 dmg to the spread pair. In solo: passive low-threat.
export class TetherWitch extends Enemy {
  constructor(x, y) {
    super(x, y, 16, 70, 'tether_witch');
    this.tetherDist = 300;
    this.tickTimer = 0;
  }
  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (this.state === 'idle' && dist < 700 && !player._phantomInkActive) this.state = 'chase';
    if (this.state === 'chase' && dist > 250) {
      const spd = 110 * this.spdMult();
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    }

    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer = 0.6;
      const ps = (window._players && window._players.list) || [player];
      if (ps.length >= 2) {
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i], b = ps[j];
            if (!a.alive || !b.alive) continue;
            const ddx = a.x - b.x, ddy = a.y - b.y;
            if (ddx * ddx + ddy * ddy > this.tetherDist * this.tetherDist) {
              events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this, target: a });
              events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this, target: b });
            }
          }
        }
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _label, _color, now) { super.drawBody(ctx, 'TETHER', '#cc44ee', now); }
}

// ── MIRE TOAD ──────────────────────────────────────────────────────
// Spits puddles that slow + apply Wet (Frost cards do +50% to Wet).
export class MireToad extends Enemy {
  constructor(x, y) {
    super(x, y, 18, 65, 'mire_toad');
    this.spitCooldown = 2.5;
    this.telegraphDuration = 0.7;
    this._spitTarget = null;
  }
  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.spitCooldown -= dt;

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (this.state === 'idle' && dist < 600 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase' && dist > 220) {
      const spd = 90 * this.spdMult();
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    } else if (this.state === 'chase' && this.spitCooldown <= 0) {
      this.state = 'telegraph';
      this.telegraphTimer = this.telegraphDuration;
      this._spitTarget = { x: player.x, y: player.y };
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0 && this._spitTarget) {
        events.emit('SPAWN_PUDDLE', {
          x: this._spitTarget.x, y: this._spitTarget.y,
          r: 70, slow: 0.4, wet: 3, life: 4
        });
        this.spitCooldown = 3.0;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) { super.drawBody(ctx, 'TOAD', '#558844', now); }
}

// ── BLOOMSPAWN ──────────────────────────────────────────────────────
// Reactive splitter. Buds a smaller copy every 5s up to maxBuds.
export class Bloomspawn extends Enemy {
  constructor(x, y) {
    super(x, y, 14, 50, 'bloomspawn');
    this.budTimer = 5.0;
    this.maxBuds = 4;
  }
  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.budTimer -= dt;
    if (this.budTimer <= 0 && this.maxBuds > 0) {
      this.maxBuds--;
      this.budTimer = 5.0;
      events.emit('SPAWN_BLOOMSPAWN', {
        x: this.x + (Math.random() - 0.5) * 40,
        y: this.y + (Math.random() - 0.5) * 40,
      });
    }
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (this.state === 'idle' && dist < 600 && !player._phantomInkActive) this.state = 'chase';
    if (this.state === 'chase' && dist > 60) {
      const spd = 120 * this.spdMult();
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) { super.drawBody(ctx, 'BLOOM', '#aacc44', now); }
}

// ── IRON CHOIR ──────────────────────────────────────────────────────
// Buff bot that heals nearby allies; silence-vulnerable.
export class IronChoir extends Enemy {
  constructor(x, y) {
    super(x, y, 16, 80, 'iron_choir');
    this.singTimer = 0;
    this.songRadius = 130;
  }
  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.singTimer += dt;
    if (this.singTimer > 0.5) {
      this.singTimer = 0;
      events.emit('CHOIR_HEAL', { x: this.x, y: this.y, r: this.songRadius, hp: 1 });
    }
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (this.state === 'idle' && dist < 800) this.state = 'chase';
    if (this.state === 'chase' && dist > 280) {
      const spd = 70 * this.spdMult();
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.songRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,150,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    super.drawBody(ctx, 'CHOIR', '#ddcc88', now);
  }
}

// ── STATIC HOUND ───────────────────────────────────────────────────
// Lightning bruiser. Charges in a line; damages on contact.
export class StaticHound extends Enemy {
  constructor(x, y) {
    super(x, y, 14, 60, 'static_hound');
    this.chargeCooldown = 2.0;
    this.charging = false;
    this.chargeDir = { x: 0, y: 0 };
    this.chargeTimer = 0;
  }
  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.chargeCooldown -= dt;

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (this.state === 'idle' && dist < 700 && !player._phantomInkActive) this.state = 'chase';

    if (this.charging) {
      this.chargeTimer -= dt;
      this.x += this.chargeDir.x * 480 * dt;
      this.y += this.chargeDir.y * 480 * dt;
      if (this.chargeTimer <= 0) this.charging = false;
      const ps = (window._players && window._players.list) || [player];
      for (const p of ps) {
        if (!p.alive) continue;
        const pdx = p.x - this.x, pdy = p.y - this.y;
        if (pdx * pdx + pdy * pdy < (p.r + this.r + 4) ** 2) {
          events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this, target: p });
          this.charging = false;
        }
      }
    } else if (this.state === 'chase' && this.chargeCooldown <= 0 && dist > 130 && dist < 360) {
      this.charging = true;
      this.chargeTimer = 0.55;
      this.chargeDir = { x: dx / dist, y: dy / dist };
      this.chargeCooldown = 2.6;
    } else if (this.state === 'chase' && dist > 60) {
      const spd = 150 * this.spdMult();
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) { super.drawBody(ctx, this.charging ? 'ZAP!' : 'HOUND', '#88ccff', now); }
}

// ── BOSS: HOLLOW KING ──────────────────────────────────────────────
// 3 phases: chase / spawn clones / "controls invert" (8 s window)
export class BossHollowKing extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 350, 'boss_hollow_king');
    this.phase = 1;
    this.cloneSpawnTimer = 5;
  }
  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const hpPct = this.hp / this.maxHp;
    const newPhase = hpPct > 0.66 ? 1 : (hpPct > 0.33 ? 2 : 3);
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      events.emit('BOSS_PHASE', { boss: this, phase: this.phase });
      if (this.phase === 3) events.emit('CONTROLS_INVERT', { duration: 8 });
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 60) {
      const spd = (this.phase === 3 ? 220 : 140) * this.spdMult();
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    } else if (this.attackCooldown <= 0) {
      events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
      this.attackCooldown = 0.9;
    }

    if (this.phase >= 2) {
      this.cloneSpawnTimer -= dt;
      if (this.cloneSpawnTimer <= 0) {
        this.cloneSpawnTimer = 6;
        events.emit('SPAWN_HOLLOW_CLONE', {
          x: this.x + (Math.random() - 0.5) * 200,
          y: this.y + (Math.random() - 0.5) * 200,
        });
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) { super.drawBody(ctx, 'HOLLOW KING', '#660066', now); }
}

// ── BOSS: VAULT ENGINE ─────────────────────────────────────────────
// 4 rotating weak points. Players must hit them in tempo with each
// other (rewards Group Tempo Resonance).
export class BossVaultEngine extends Enemy {
  constructor(x, y) {
    super(x, y, 36, 500, 'boss_vault_engine');
    this.weakPoints = [
      { angle: 0, hp: 1 }, { angle: Math.PI / 2, hp: 1 },
      { angle: Math.PI, hp: 1 }, { angle: 3 * Math.PI / 2, hp: 1 },
    ];
    this.cycleTimer = 0;
  }
  updateLogic(dt, player, _tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.cycleTimer += dt;
    for (const wp of this.weakPoints) wp.angle += dt * 0.7;
    if (this.cycleTimer > 4) {
      this.cycleTimer = 0;
      events.emit('SPAWN_GROUND_WAVE', { x: this.x, y: this.y, dx: 0, dy: 0, radial: true, dmg: 2 });
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) {
    super.drawBody(ctx, 'VAULT ENGINE', '#bb9933', now);
    for (const wp of this.weakPoints) {
      if (wp.hp <= 0) continue;
      const wx = this.x + Math.cos(wp.angle) * 50;
      const wy = this.y + Math.sin(wp.angle) * 50;
      ctx.beginPath();
      ctx.arc(wx, wy, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffaa00';
      ctx.fill();
    }
  }
}

// ── BOSS: AURORA (Voidline) ────────────────────────────────────────
// Telegraphs gravity wells centered on random alive players.
export class BossAurora extends Enemy {
  constructor(x, y) {
    super(x, y, 40, 600, 'boss_aurora');
    this.wellTimer = 0;
    this.wells = [];
  }
  updateLogic(dt, player, _tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.wellTimer -= dt;
    if (this.wellTimer <= 0) {
      this.wellTimer = 2.5;
      const ps = (window._players && window._players.list) || [player];
      const target = ps[Math.floor(Math.random() * ps.length)];
      if (target && target.alive) this.wells.push({ x: target.x, y: target.y, t: 1.6, r: 90 });
    }
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const w = this.wells[i];
      w.t -= dt;
      if (w.t <= 0) {
        events.emit('ENEMY_MELEE_HIT', { damage: 3, source: this });
        this.wells.splice(i, 1);
      }
    }
    const cx = window.CANVAS_W / 2, cy = window.CANVAS_H / 2;
    const dx = cx - this.x, dy = cy - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 5) { this.x += (dx / d) * 50 * dt; this.y += (dy / d) * 50 * dt; }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) {
    for (const w of this.wells) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180,120,255,' + (0.3 + (1.6 - w.t) * 0.4) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    super.drawBody(ctx, 'AURORA', '#cc88ff', now);
  }
}
