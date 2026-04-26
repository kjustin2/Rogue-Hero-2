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
      const _all = (window._players && window._players.list) || [player];
      const _standing = _all.filter(p => p && p.alive && !p.downed);
      const ps = _standing.length ? _standing : _all; // fall back if everyone is downed
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
      const _all = (window._players && window._players.list) || [player];
      const _standing = _all.filter(p => p && p.alive && !p.downed);
      const ps = _standing.length ? _standing : _all; // fall back if everyone is downed
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
    // F4 boss. Tuning history: 350 → 800 HP earlier; this revision
    // amplifies aggression instead of HP. The fight should *feel* like a
    // king relentlessly closing distance and summoning clones, not a
    // damage sponge.
    super(x, y, 28, 800, 'boss_hollow_king');
    this.phase = 1;
    this.cloneSpawnTimer = 3;       // first summon arrives sooner
    this.lungeTimer = 4.5;          // P2+ lunge dash on a separate cadence
    this._lungeCharge = 0;          // 0 = idle, >0 = charging telegraph
    this._lungeDir = { x: 1, y: 0 };
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

    // Lunge attack (phase 2+): charge for 0.5 s, then sprint forward in
    // a straight line for 0.35 s at high speed. Big tell, big damage on
    // contact — the "I'm coming for you" payoff that the previous slow
    // chase lacked.
    if (this._lungeCharge > 0) {
      this._lungeCharge -= dt;
      if (this._lungeCharge <= 0) {
        this._lungeActive = 0.35;
        // Re-aim at the player at the moment of release; pre-release this
        // is set when the charge starts so the player has ~0.5 s to dodge.
      }
    } else if (this._lungeActive > 0) {
      const lspd = 520 * this.spdMult();
      this.x += this._lungeDir.x * lspd * dt;
      this.y += this._lungeDir.y * lspd * dt;
      this._lungeActive -= dt;
      // Hit-test along the lunge path.
      if (dist < this.r + 30) {
        events.emit('ENEMY_MELEE_HIT', { damage: 5, source: this });
        events.emit('SCREEN_SHAKE', { duration: 0.25, intensity: 0.6 });
        this._lungeActive = 0; // single-hit dash
      }
    } else {
      // Regular pursuit. Faster baseline so the boss feels relentless even
      // before P3 transition.
      if (dist > 60) {
        const spd = (this.phase === 3 ? 280 : (this.phase === 2 ? 195 : 160)) * this.spdMult();
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      } else if (this.attackCooldown <= 0) {
        // Tighter melee cadence + heavier hits per phase. P3 swings ~1.7×/s.
        events.emit('ENEMY_MELEE_HIT', { damage: this.phase >= 3 ? 4 : 3, source: this });
        this.attackCooldown = this.phase >= 3 ? 0.55 : (this.phase === 2 ? 0.7 : 0.8);
      }
      // Charge a lunge from medium-far distance in P2+. Player sees the
      // 0.5 s charge tell before the dash fires.
      if (this.phase >= 2 && dist > 140 && dist < 480) {
        this.lungeTimer -= dt;
        if (this.lungeTimer <= 0) {
          this.lungeTimer = this.phase >= 3 ? 3.5 : 4.5;
          this._lungeCharge = 0.5;
          const lDist = dist || 1;
          this._lungeDir = { x: dx / lDist, y: dy / lDist };
          events.emit('SCREEN_SHAKE', { duration: 0.15, intensity: 0.25 });
          events.emit('PLAY_SOUND', 'sigil');
        }
      }
    }

    if (this.phase >= 2) {
      this.cloneSpawnTimer -= dt;
      if (this.cloneSpawnTimer <= 0) {
        // Faster clone summons. In P3 the king is essentially summoning
        // back-to-back.
        this.cloneSpawnTimer = this.phase >= 3 ? 2.6 : 3.6;
        // P3 spawns a pair to swarm the player while the king pursues.
        const cloneCount = this.phase >= 3 ? 2 : 1;
        for (let i = 0; i < cloneCount; i++) {
          events.emit('SPAWN_HOLLOW_CLONE', {
            x: this.x + (Math.random() - 0.5) * 220,
            y: this.y + (Math.random() - 0.5) * 220,
          });
        }
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }
  drawBody(ctx, _l, _c, now) {
    // Lunge charge: bright crimson telegraph line so the dash has a
    // visible "running start".
    if (this._lungeCharge > 0) {
      const t = 1 - this._lungeCharge / 0.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this._lungeDir.x * (60 + t * 220), this.y + this._lungeDir.y * (60 + t * 220));
      ctx.strokeStyle = `rgba(255,80,80,${0.4 + t * 0.5})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    super.drawBody(ctx, 'HOLLOW KING', '#660066', now);
  }
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
    // Drift target: a slot the boss tries to reach so it actively pursues
    // the closest player instead of sitting at spawn waiting for someone
    // to come to it. Repicked when reached or every ~2 s.
    this._driftTarget = { x, y };
    this._driftRepick = 0;
  }
  updateLogic(dt, player, _tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.cycleTimer += dt;
    for (const wp of this.weakPoints) wp.angle += dt * 0.7;
    // Radial shock on every 4 s cycle — SPAWN_GROUND_WAVE is directional and
    // requires a card def; emitting one without a def threw inside the
    // update loop and froze the game. Do the radial damage directly.
    this._pulseFx = Math.max(0, (this._pulseFx || 0) - dt);
    if (this.cycleTimer > 4) {
      this.cycleTimer = 0;
      this._pulseFx = 0.5;
      const PULSE_RADIUS = 220;
      const all = (window._players && window._players.list) || [player];
      for (const p of all) {
        if (!p || !p.alive) continue;
        const dx = p.x - this.x, dy = p.y - this.y;
        if (dx * dx + dy * dy < PULSE_RADIUS * PULSE_RADIUS) {
          events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this, target: p });
        }
      }
    }
    // Movement: pursue the nearest live player at a slow drift speed so
    // the pulse zone stays threatening even if the players try to camp at
    // long range. Pre-fix Vault Engine just sat at spawn — players could
    // chip from outside the 220 px pulse forever.
    const all = (window._players && window._players.list) || [player];
    let target = null, bestD2 = Infinity;
    for (const p of all) {
      if (!p || !p.alive || p.downed) continue;
      const dx = p.x - this.x, dy = p.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; target = p; }
    }
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Aggressive pursuit. Pre-buff the engine drifted at 70 px/s which
      // still let players outpace it; 200 px/s is below most player base
      // speeds (~290) so kiting is still possible, but the pulse zone now
      // has real reach. Sprints harder when far away.
      const baseSpd = dist > 320 ? 240 : 200;
      const spd = baseSpd * this.spdMult();
      // Stop closing inside 110 px — prevents the boss from glueing to a
      // single player, which would make ranged kiting impossible.
      if (dist > 110) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      }
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
    if (this._pulseFx > 0) {
      const t = 1 - this._pulseFx / 0.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 40 + t * 180, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,170,0,${(1 - t) * 0.8})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

// ── BOSS: AURORA (Voidline) ────────────────────────────────────────
// Telegraphs gravity wells centered on random alive players.
export class BossAurora extends Enemy {
  constructor(x, y) {
    // F5 (final) boss — pre-fix the wells fired ENEMY_MELEE_HIT WITHOUT
    // checking whether the player was inside the circle, so the telegraph
    // was meaningless ("hits me whether I'm in or out"). Also nerfed HP
    // 600 → 480 since the broken telegraph was forcing players into mash
    // builds to outpace it. Damage tuned to match the now-meaningful
    // dodgeability.
    super(x, y, 40, 480, 'boss_aurora');
    this.wellTimer = 1.0;          // initial breathing room before first well
    this.wellPeriod = 2.8;
    this.wellDmg = 5;
    this.wells = [];
    // Telegraph timing constants — exposed so the draw step can render a
    // matching "fill" animation that grows as the well approaches detonate.
    this.WELL_TELEGRAPH = 1.6;
    this.WELL_RADIUS = 90;
  }
  updateLogic(dt, player, _tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt, player);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    this.wellTimer -= dt;
    if (this.wellTimer <= 0) {
      this.wellTimer = this.wellPeriod;
      const _all = (window._players && window._players.list) || [player];
      const _standing = _all.filter(p => p && p.alive && !p.downed);
      const ps = _standing.length ? _standing : _all;
      const target = ps[Math.floor(Math.random() * ps.length)];
      if (target && target.alive) {
        this.wells.push({
          x: target.x, y: target.y,
          t: this.WELL_TELEGRAPH,
          r: this.WELL_RADIUS,
          // Lock in target colour so we can paint a personalised marker; helps
          // 4P parties tell which player is the focus of an incoming well.
          targetIdx: typeof target.playerIndex === 'number' ? target.playerIndex : 0,
        });
        events.emit('PLAY_SOUND', 'sigil');
      }
    }
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const w = this.wells[i];
      w.t -= dt;
      if (w.t <= 0) {
        // Bug fix: only damage players ACTUALLY inside the well's radius.
        // The pre-fix path emitted a generic ENEMY_MELEE_HIT that the global
        // resolver routed to the local player regardless of position.
        const _all = (window._players && window._players.list) || [player];
        for (const p of _all) {
          if (!p || !p.alive || p.downed) continue;
          const ddx = p.x - w.x, ddy = p.y - w.y;
          const tr = w.r + p.r;
          if (ddx * ddx + ddy * ddy < tr * tr) {
            events.emit('ENEMY_MELEE_HIT', { damage: this.wellDmg, source: this, target: p });
          }
        }
        events.emit('SCREEN_SHAKE', { duration: 0.18, intensity: 0.35 });
        events.emit('PLAY_SOUND', 'crash');
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
      const total = this.WELL_TELEGRAPH;
      const elapsed = total - w.t;
      const tFrac = Math.max(0, Math.min(1, elapsed / total));
      // Outer ring — boundary of the kill zone, drawn solid so it's
      // unambiguous where the safe edge is.
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(220,150,255,${0.55 + tFrac * 0.4})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      // Inner fill — grows from 0 → full as the well approaches detonation.
      // Gives a clear "imminent" tell so the player knows when to clear.
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r * tFrac, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,80,255,${0.18 + tFrac * 0.35})`;
      ctx.fill();
      // Last 0.35s: cross-hair style danger flash.
      if (w.t < 0.35) {
        const flash = (Math.sin(now * 30) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r - 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,80,180,${0.6 + flash * 0.4})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
    super.drawBody(ctx, 'AURORA', '#cc88ff', now);
  }
}
