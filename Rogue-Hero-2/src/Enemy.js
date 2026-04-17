import { Entity } from './Entity.js';
import { events } from './EventBus.js';

// ── BASE ENEMY ──────────────────────────────────────────────────
export class Enemy extends Entity {
  constructor(x, y, r, hp, type) {
    super(x, y, r);
    this.hp = hp;
    this.maxHp = hp;
    this.type = type;
    this.isBoss = type.startsWith('boss');
    this.state = 'idle';
    this.staggerTimer = 0;
    this.hitFlash = 0;
    this.telegraphTimer = 0;
    this.telegraphDuration = 1.0;
    this.attackCooldown = 0;
    this.marked = false;
    this.markedTimer = 0;
    this.slowTimer = 0;
    this.slowMult = 1.0;
    this.difficultySpdMult = 1.0;
    // Spawn animation
    this.spawnTimer = 0.35;
    this.spawning = true;
  }

  spdMult() {
    let m = this.difficultySpdMult;
    if (this.slowTimer > 0) m *= this.slowMult;
    return m;
  }

  updateTimers(dt, player) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.markedTimer > 0) this.markedTimer = Math.max(0, this.markedTimer - dt);
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    // IDEA-05: Phantom Ink — reset aggro while player is dodging (non-boss only)
    if (!this.isBoss && player && player._phantomInkActive && this.state === 'chase') {
      this.state = 'idle';
    }
    // Elite regeneration
    if (this.regenRate && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regenRate * dt);
    }
  }

  stagger(dur) {
    this.staggerTimer = Math.max(this.staggerTimer, dur);
    if (this.state === 'telegraph') this.state = 'chase';
  }

  // Apply an elite modifier (call once after construction in spawnEnemies)
  applyEliteModifier(mod) {
    this.eliteMod = mod;
    if (mod === 'armored') {
      this.armorMult = 0.5;        // takes 50% damage
      this.hp = Math.round(this.hp * 1.3);
      this.maxHp = this.hp;
    } else if (mod === 'berserk') {
      this.difficultySpdMult *= 1.35;  // faster
      this.berserkDmgMult = 1.5;       // hits harder (applied in emit)
    } else if (mod === 'regenerating') {
      this.regenRate = 4;              // 4 HP/sec
      this.hp = Math.round(this.hp * 1.2);
      this.maxHp = this.hp;
    }
  }

  takeDamage(amount) {
    if (this.armorMult) amount = Math.max(1, Math.round(amount * this.armorMult));
    if (this.marked) { amount = Math.round(amount * 2); this.marked = false; }
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (this.hp <= 0) this.alive = false;
    return amount;
  }

  updateSpawn(dt) {
    if (!this.spawning) return false;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawning = false; }
    return true; // Still spawning — skip AI
  }

  // Called in a batched pass from main.js after all enemy bodies — do not call inside drawBody
  drawHealthBar(ctx, color) {
    const w = Math.max(36, this.r * 3.5);
    const bh = 7;
    const bx = this.x - w / 2;
    const by = this.y - this.r - 16;
    const pct = Math.max(0, this.hp / this.maxHp);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 1, by - 1, w + 2, bh + 2);

    // Color based on health %
    const barColor = pct > 0.6 ? color : (pct > 0.3 ? '#ffaa00' : '#ff3333');
    ctx.fillStyle = barColor;
    ctx.fillRect(bx, by, w * pct, bh);

    // Segment ticks (every 25% of max HP) — single path to avoid 3× stroke calls
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = 1; s <= 3; s++) {
      const tx = bx + w * (s / 4);
      ctx.moveTo(tx, by); ctx.lineTo(tx, by + bh);
    }
    ctx.stroke();
  }

  drawBody(ctx, label, color, now) {
    // Drop shadow
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.r * 0.6, this.r * 1.2, this.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Spawn animation: scale up
    let scale = 1;
    if (this.spawning) {
      scale = 1 - (this.spawnTimer / 0.35);
      scale = scale * scale; // ease-in
    }

    const drawR = this.r * scale;
    ctx.beginPath();
    ctx.arc(this.x, this.y, drawR, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : color;
    ctx.fill();

    // Spawn flash ring
    if (this.spawning) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawR + 15 * (1 - scale), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - scale)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (this.marked) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff44ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.markedTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawR + 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.staggerTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawR + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,180,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    // Font is set once per frame by the draw loop in main.js (bold 13px monospace)
    ctx.textAlign = 'center';
    ctx.fillText(label, this.x, this.y - this.r - 20);

    // Cache color so the batched health bar pass in main.js can draw it without extra state
    this._hbColor = color;

    // Elite modifier glow ring + badge
    if (this.eliteMod) {
      const modColor = this.eliteMod === 'armored' ? '#aaaacc' : (this.eliteMod === 'berserk' ? '#ff2200' : '#44ff44');
      const modTag   = this.eliteMod === 'armored' ? 'ARMORED' : (this.eliteMod === 'berserk' ? 'BERSERK' : 'REGEN');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = modColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = modColor;
      ctx.font = 'bold 9px monospace';
      ctx.fillText(modTag, this.x, this.y - this.r - 32);
    }

    // Named-elite persistent aura (Juggernaut, Stalker, Corruptor, etc.)
    if (this.isElite) {
      const pulse = 0.35 + Math.sin(now * 0.0035) * 0.2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawR + 10, 0, Math.PI * 2);
      ctx.strokeStyle = this._eliteAuraColor || '#ff8844';
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Low-HP danger indicator (<20% health)
    if (this.alive && this.hp / this.maxHp < 0.2) {
      const flicker = Math.sin(now * 0.018) > 0;
      if (flicker) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawR + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,30,30,0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Draw intent icon above enemy when telegraphing
  _drawIntentIcon(ctx, now) {
    if (this.state !== 'telegraph' || this.spawning) return;
    const p = Math.max(0, 1 - (this.telegraphTimer / this.telegraphDuration));
    const blink = Math.sin(now / 80) > 0;
    if (!blink) return;
    const iy = this.y - this.r - 26;
    ctx.save();
    ctx.globalAlpha = 0.55 + p * 0.45;
    ctx.fillStyle = p > 0.7 ? '#ff2200' : '#ff8844';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('!', this.x, iy);
    ctx.restore();
  }

  drawTelegraph(ctx, now) {}
}

// ── CHASER ──────────────────────────────────────────────────────
export class Chaser extends Enemy {
  constructor(x, y) {
    super(x, y, 14, 55, 'chaser');
    this.telegraphDuration = 0.35;
    this.sprintTimer = 0;
    this.sprintCooldown = 0;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.sprintTimer = Math.max(0, this.sprintTimer - dt);
    this.sprintCooldown = Math.max(0, this.sprintCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const baseSpd = 190 * (0.8 + (tempo.value / 100) * 0.5) * this.spdMult();
    // Sprint burst: 1.6× speed when player is at range and Tempo is Hot/Critical
    if (dist > 200 && tempo.value >= 70 && this.sprintCooldown <= 0 && this.state === 'chase') {
      this.sprintTimer = 0.5;
      this.sprintCooldown = 3.0;
    }
    const spd = baseSpd * (this.sprintTimer > 0 ? 1.6 : 1.0);

    if (this.state === 'idle' && dist < 900 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 75 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > 40) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 85) events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
        this.attackCooldown = 0.9;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 85 * p, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 50, 50, ${0.15 + p * 0.15})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 0, 0, ${0.3 + p * 0.5})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'CHASER', '#cc3333', now);
  }
}

// ── SNIPER ──────────────────────────────────────────────────────
export class Sniper extends Enemy {
  constructor(x, y) {
    super(x, y, 11, 40, 'sniper');
    this.telegraphDuration = 0.9;
    this.attackTargetAngle = 0;
    this.projectileManager = null;
    this.burstShotsLeft = 0;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    // PERF-04: early exit when far from player
    if (dx*dx+dy*dy > 900*900) return;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 85 * this.spdMult();

    if (this.state === 'idle' && dist < 900 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (this.hp < this.maxHp * 0.3) {
        // Flee at high speed when low HP
        if (dist < 700) { this.x -= (dx / dist) * 140 * this.spdMult() * dt; this.y -= (dy / dist) * 140 * this.spdMult() * dt; }
      } else if (dist < 150) { this.x -= (dx / dist) * spd * dt; this.y -= (dy / dist) * spd * dt; }
      else if (dist > 350) { this.x += (dx / dist) * spd * dt; this.y += (dy / dist) * spd * dt; }
      else if (this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this.attackTargetAngle = Math.atan2(dy, dx);
        this.burstShotsLeft = 2;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
      this.attackTargetAngle += (targetAngle - this.attackTargetAngle) * 1.5 * dt;
      if (this.telegraphTimer <= 0) {
        if (this.projectileManager) {
          this.projectileManager.spawn(
            this.x, this.y,
            Math.cos(this.attackTargetAngle), Math.sin(this.attackTargetAngle),
            400, 2, '#88cc33', 'sniper'
          );
        }
        this.burstShotsLeft--;
        if (this.burstShotsLeft > 0) {
          this.telegraphTimer = 0.25; // Short delay before second shot
        } else {
          this.attackCooldown = 1.8;
          this.state = 'chase';
        }
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.attackTargetAngle) * 900, this.y + Math.sin(this.attackTargetAngle) * 900);
      ctx.strokeStyle = `rgba(255, 50, 50, ${p * 0.7})`;
      ctx.lineWidth = 3 + (4 * p);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.x, this.y, 6 + 3 * Math.sin(now / 80), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 80, 80, ${p})`;
      ctx.fill();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'SNIPER', '#88aa33', now);
  }
}

// ── BRUISER (ELITE) ─────────────────────────────────────────────
export class Bruiser extends Enemy {
  constructor(x, y) {
    super(x, y, 24, 220, 'bruiser');
    this.telegraphDuration = 1.3;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt * 0.4; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 160 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else {
        this.x += (dx / dist) * 180 * this.spdMult() * dt;
        this.y += (dy / dist) * 180 * this.spdMult() * dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 190) events.emit('ENEMY_MELEE_HIT', { damage: 4, source: this });
        this.attackCooldown = 2.2;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 190, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 0, 0, ${p * 0.25})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 0, 0, ${0.4 + Math.sin(now / 60) * 0.3})`;
      ctx.lineWidth = 3 + p * 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.x, this.y, 190 * p, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#660066';
    ctx.lineWidth = 3;
    ctx.stroke();
    this.drawBody(ctx, '★ BRUISER', '#9922aa', now);
  }
}

// ── TURRET ──────────────────────────────────────────────────────
export class Turret extends Enemy {
  constructor(x, y) {
    super(x, y, 16, 60, 'turret');
    this.telegraphDuration = 1.4;
    this.aimAngle = 0;
    this.shotsFired = 0;
    this.burstCount = 3;
    this.projectileManager = null;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    // PERF-04: early exit for stationary enemies when player is very far
    if (dx*dx+dy*dy > 900*900) return;
    const targetAngle = Math.atan2(dy, dx);
    this.aimAngle += (targetAngle - this.aimAngle) * 3 * dt;

    if (this.state === 'idle' && dx*dx+dy*dy < 562500) this.state = 'chase';

    if (this.state === 'chase' && this.attackCooldown <= 0) {
      this.state = 'telegraph';
      this.telegraphTimer = this.telegraphDuration;
      this.shotsFired = 0;
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        // Fire real projectile
        if (this.projectileManager) {
          this.projectileManager.spawn(
            this.x, this.y,
            Math.cos(this.aimAngle), Math.sin(this.aimAngle),
            360, 2, '#ffaa00', 'turret'
          );
        }
        this.shotsFired++;
        if (this.shotsFired < this.burstCount) {
          this.telegraphTimer = 0.3;
        } else {
          this.attackCooldown = 2.2;
          this.state = 'chase';
        }
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(this.aimAngle) * 500, this.y + Math.sin(this.aimAngle) * 500);
    ctx.strokeStyle = 'rgba(255, 180, 0, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / (this.shotsFired > 0 ? 0.3 : this.telegraphDuration));
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.aimAngle) * 500, this.y + Math.sin(this.aimAngle) * 500);
      ctx.strokeStyle = `rgba(255, 180, 0, ${0.3 + p * 0.5})`;
      ctx.lineWidth = 4 + p * 4;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.strokeStyle = '#aa8800';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(this.aimAngle) * (this.r + 10), this.y + Math.sin(this.aimAngle) * (this.r + 10));
    ctx.strokeStyle = this.hitFlash > 0 ? '#fff' : '#ddaa22';
    ctx.lineWidth = 5;
    ctx.stroke();
    this.drawBody(ctx, 'TURRET', '#ddaa22', now);
  }
}

// ── TELEPORTER ──────────────────────────────────────────────────
export class Teleporter extends Enemy {
  constructor(x, y) {
    super(x, y, 13, 45, 'teleporter');
    this.telegraphDuration = 0.7;
    this.aoeTimer = 0;
    this.aoeActive = false;
    this.aoeX = 0;
    this.aoeY = 0;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.aoeActive) {
      this.aoeTimer -= dt;
      if (this.aoeTimer <= 0) {
        this.aoeActive = false;
        const adx = player.x - this.aoeX, ady = player.y - this.aoeY;
        if (adx * adx + ady * ady < 100 * 100) events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
      }
    }

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist > 60) {
        this.x += (dx / dist) * 105 * this.spdMult() * dt;
        this.y += (dy / dist) * 105 * this.spdMult() * dt;
      }
      if (dist <= 130 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        this.aoeX = this.x;
        this.aoeY = this.y;
        this.aoeActive = true;
        this.aoeTimer = 0.8;
        const tAngle = Math.random() * Math.PI * 2;
        this.x = player.x + Math.cos(tAngle) * (200 + Math.random() * 150);
        this.y = player.y + Math.sin(tAngle) * (200 + Math.random() * 150);
        this.attackCooldown = 2.5;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 100, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 50, 255, ${p * 0.2})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(180, 50, 255, ${0.3 + p * 0.5})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (this.aoeActive) {
      const p = 1 - (this.aoeTimer / 0.8);
      ctx.beginPath();
      ctx.arc(this.aoeX, this.aoeY, 100, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 50, 255, ${p * 0.35})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.aoeX, this.aoeY, 100 * (1 - p), 0, Math.PI * 2);
      ctx.strokeStyle = '#cc44ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 50, 255, ${0.15 + 0.1 * Math.sin(now / 200)})`;
    ctx.fill();
    this.drawBody(ctx, 'BLINK', '#bb44ff', now);
  }
}

// ── SWARM ───────────────────────────────────────────────────────
export class Swarm extends Enemy {
  constructor(x, y) {
    super(x, y, 8, 18, 'swarm');
    this.telegraphDuration = 0.2;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 250 * this.spdMult();

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 45 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > 25) {
        this.x += (dx / dist) * spd * dt + (Math.random() - 0.5) * 40 * dt;
        this.y += (dy / dist) * spd * dt + (Math.random() - 0.5) * 40 * dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 50) events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
        this.attackCooldown = 0.45;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, 35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 100, 0, 0.25)';
      ctx.fill();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, '', '#ff8800', now);
  }
}

// ── HEALER ──────────────────────────────────────────────────────
export class Healer extends Enemy {
  constructor(x, y) {
    super(x, y, 14, 50, 'healer');
    this.healTimer = 0;
    this.healInterval = 2.2;
    this.healRange = 200;
    this.healAmount = 5;
    this.healFlash = 0;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.healFlash = Math.max(0, this.healFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (this.hp < this.maxHp * 0.3) {
        // Flee at full speed when low HP
        if (dist < 700) { this.x -= (dx / dist) * 165 * this.spdMult() * dt; this.y -= (dy / dist) * 165 * this.spdMult() * dt; }
      } else if (dist < 200) {
        this.x -= (dx / dist) * 95 * this.spdMult() * dt;
        this.y -= (dy / dist) * 95 * this.spdMult() * dt;
      } else if (dist > 400) {
        this.x += (dx / dist) * 65 * this.spdMult() * dt;
        this.y += (dy / dist) * 65 * this.spdMult() * dt;
      }
    }

    this.healTimer += dt;
    if (this.healTimer >= this.healInterval && allEnemies) {
      this.healTimer = 0;
      this.healFlash = 0.3;
      for (const e of allEnemies) {
        if (e === this || !e.alive) continue;
        const edx = e.x - this.x, edy = e.y - this.y;
        if (edx * edx + edy * edy < this.healRange * this.healRange) {
          // Percentage heal so it scales with difficulty/buffed enemies
          const healAmt = Math.max(1, Math.round(e.maxHp * 0.12));
          e.hp = Math.min(e.maxHp, e.hp + healAmt);
        }
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.healFlash > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.healRange, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(50, 255, 100, ${this.healFlash * 0.3})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(50, 255, 100, ${this.healFlash})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.healRange, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(50, 255, 100, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(this.x - 2, this.y - 7, 4, 14);
    ctx.fillRect(this.x - 7, this.y - 2, 14, 4);
    this.drawBody(ctx, 'HEALER', '#22cc66', now);
  }
}

// ── MIRROR ──────────────────────────────────────────────────────
export class Mirror extends Enemy {
  constructor(x, y) {
    super(x, y, 15, 75, 'mirror');
    this.telegraphDuration = 1.0;
    this.mirrorAngle = 0;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist < 100) {
        this.x -= (dx / dist) * 115 * this.spdMult() * dt;
        this.y -= (dy / dist) * 115 * this.spdMult() * dt;
      } else if (dist > 200) {
        this.x += (dx / dist) * 90 * this.spdMult() * dt;
        this.y += (dy / dist) * 90 * this.spdMult() * dt;
      } else if (this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this.mirrorAngle = Math.atan2(dy, dx);
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      this.mirrorAngle = Math.atan2(player.y - this.y, player.x - this.x);
      if (this.telegraphTimer <= 0) {
        if (dist <= 160) events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
        this.attackCooldown = 1.5;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 160 * p, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.2 + p * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.x, this.y, 80 * p, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 200, 255, ${p * 0.3})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const shimmer = Math.sin(now / 200) * 0.3 + 0.7;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(100, 200, 255, ${0.1 * shimmer})`;
    ctx.fill();
    this.drawBody(ctx, 'MIRROR', `rgb(100, ${Math.round(180 + shimmer * 40)}, 255)`, now);
  }
}

// ── TEMPO VAMPIRE ───────────────────────────────────────────────
export class TempoVampire extends Enemy {
  constructor(x, y) {
    super(x, y, 13, 50, 'tempovampire');
    this.telegraphDuration = 0.4;
    this.drainFlash = 0;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.drainFlash = Math.max(0, this.drainFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 135 * (0.7 + (tempo.value / 100) * 0.8) * this.spdMult();

    if (this.state === 'idle' && dist < 520 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 50 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > 35) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 60) {
          events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
          events.emit('DRAIN');
          this.drainFlash = 0.3;
        }
        this.attackCooldown = 0.9;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 60, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 50, 180, ${p * 0.25})`;
      ctx.fill();
    }
    if (this.drainFlash > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, 50 * (1 - this.drainFlash / 0.3), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 50, 180, ${this.drainFlash})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'VAMPIRE', '#cc44aa', now);
  }
}

// ── SHIELD DRONE ────────────────────────────────────────────────
export class ShieldDrone extends Enemy {
  constructor(x, y) {
    super(x, y, 14, 55, 'shielddrone');
    this._angle = Math.random() * Math.PI * 2;
    this._wasShielded = true;
  }

  _isShielded(tempo) { return tempo.value < 70; }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this._angle += dt * 2.5;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 90 * (0.7 + (tempo.value / 100) * 0.8) * this.spdMult();

    if (dist > 70) {
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    }

    if (dist < this.r + player.r + 2 && this.attackCooldown <= 0) {
      this.attackCooldown = 1.0;
      events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
    }

    this._wasShielded = this._isShielded(tempo);
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  // Override takeDamage - immune when shielded
  takeDamage(amount, tempo) {
    if (tempo && this._isShielded(tempo)) {
      this.hitFlash = 0.07;
      return 0;
    }
    return super.takeDamage(amount);
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const shielded = this._wasShielded;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#8844ff';
    ctx.fill();

    if (shielded) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this._angle);
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 8, 0, Math.PI * 1.4);
      ctx.strokeStyle = '#bb88ff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 8, 0, Math.PI * 1.4);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = shielded ? '#cc99ff' : '#9966cc';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(shielded ? 'DRONE 🔒' : 'DRONE', this.x, this.y - this.r - 20);
    this.drawHealthBar(ctx, shielded ? '#8844ff' : '#aa66ff');
  }
}

// ── PHANTOM (Act 4) ─────────────────────────────────────────────
export class Phantom extends Enemy {
  constructor(x, y) {
    super(x, y, 11, 40, 'phantom');
    this.telegraphDuration = 0.3;
    this.blinkTimer = 0.8 + Math.random() * 0.4;
    this.invulnTimer = 0;
  }

  takeDamage(amount) {
    if (this.invulnTimer > 0) { this.hitFlash = 0.05; return 0; }
    return super.takeDamage(amount);
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 230 * this.spdMult();

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 55 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > 30) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 65) events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
        this.attackCooldown = 0.7;
        this.state = 'chase';
      }
    }

    // Blink
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 0.7 + Math.random() * 0.5;
      this.invulnTimer = 0.2;
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2;
      const bDist = 80 + Math.random() * 80;
      this.x = player.x + Math.cos(angle + Math.PI) * bDist;
      this.y = player.y + Math.sin(angle + Math.PI) * bDist;
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.globalAlpha = this.invulnTimer > 0 ? 0.3 : 1.0;
    this.drawBody(ctx, 'PHANTOM', '#8844ff', now);
    ctx.globalAlpha = 1.0;
  }
}

// ── BLOCKER (Act 4) ──────────────────────────────────────────────
export class Blocker extends Enemy {
  constructor(x, y) {
    super(x, y, 20, 200, 'blocker');
    this.faceAngle = 0;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt * 0.5; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Always face player
    this.faceAngle = Math.atan2(dy, dx);

    if (dist > 60) {
      this.x += (dx / dist) * 110 * this.spdMult() * dt;
      this.y += (dy / dist) * 110 * this.spdMult() * dt;
    } else if (this.attackCooldown <= 0) {
      this.attackCooldown = 1.5;
      events.emit('ENEMY_MELEE_HIT', { damage: 3, source: this });
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  // Block projectiles from the front half
  isBlockingAngle(angle) {
    const diff = Math.abs(((angle - this.faceAngle) + Math.PI) % (Math.PI * 2) - Math.PI);
    return diff < Math.PI * 0.4; // block 80° frontal arc
  }

  draw(ctx, now) {
    if (!this.alive) return;
    // Shield arc on front
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.faceAngle);
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 8, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.strokeStyle = this.hitFlash > 0 ? '#ffffff' : '#88aacc';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    this.drawBody(ctx, 'BLOCKER', '#446688', now);
  }
}

// ── BOMBER (Act 3+) ──────────────────────────────────────────────
export class Bomber extends Enemy {
  constructor(x, y) {
    super(x, y, 16, 70, 'bomber');
    this._pulseTimer = 0;
    this._exploded = false;
  }

  _explode(player) {
    if (this._exploded) return;
    this._exploded = true;
    const dx = player.x - this.x, dy = player.y - this.y;
    if (dx * dx + dy * dy < 110 * 110) {
      events.emit('ENEMY_MELEE_HIT', { damage: 3, source: this });
    }
    events.emit('SCREEN_SHAKE', { duration: 0.25, intensity: 0.5 });
    events.emit('PLAY_SOUND', 'crash');
    this.alive = false;
  }

  takeDamage(amount) {
    const result = super.takeDamage(amount);
    if (!this.alive) this._willExplodeOnDeath = true;
    return result;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._pulseTimer += dt;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 50) {
      this._explode(player);
      return;
    }

    this.x += (dx / dist) * 130 * this.spdMult() * dt;
    this.y += (dy / dist) * 130 * this.spdMult() * dt;

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const pulse = Math.sin(this._pulseTimer * 8) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 6 + pulse * 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 120, 0, ${0.15 + pulse * 0.2})`;
    ctx.fill();
    this.drawBody(ctx, 'BOMBER', `rgb(${Math.round(180 + pulse * 75)}, ${Math.round(80 - pulse * 40)}, 0)`, now);
  }

  drawTelegraph(ctx, now) {
    const pulse = Math.sin(this._pulseTimer * 8) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 110, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 100, 0, ${0.08 + pulse * 0.12})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ── MARKSMAN (Act 4+) ────────────────────────────────────────────
export class Marksman extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 45, 'marksman');
    this.telegraphDuration = 1.1;
    this.aimAngle = 0;
    this.projectileManager = null;
    this._prevPlayerX = 0;
    this._prevPlayerY = 0;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 80 * this.spdMult();

    // Track player velocity for predictive aim
    const pvx = (player.x - this._prevPlayerX) / dt;
    const pvy = (player.y - this._prevPlayerY) / dt;
    this._prevPlayerX = player.x;
    this._prevPlayerY = player.y;

    if (this.state === 'idle' && dist < 950 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist < 180) { this.x -= (dx / dist) * spd * dt; this.y -= (dy / dist) * spd * dt; }
      else if (dist > 400) { this.x += (dx / dist) * spd * dt; this.y += (dy / dist) * spd * dt; }
      else if (this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        // Predictive aim: lead the target by ~0.5s
        const leadT = Math.min(0.5, dist / 320);
        this.aimAngle = Math.atan2(dy + pvy * leadT, dx + pvx * leadT);
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (this.projectileManager) {
          this.projectileManager.spawn(this.x, this.y,
            Math.cos(this.aimAngle), Math.sin(this.aimAngle),
            425, 2, '#ffaa44', 'marksman');
        }
        this.attackCooldown = 1.6;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.aimAngle) * 900, this.y + Math.sin(this.aimAngle) * 900);
      ctx.strokeStyle = `rgba(255, 170, 68, ${0.2 + p * 0.6})`;
      ctx.lineWidth = 2 + p * 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'MARKSMAN', '#cc8822', now);
  }
}

// ── BRAWLER BOSS (Floor 1) ──────────────────────────────────────
export class BossBrawler extends Enemy {
  constructor(x, y) {
    super(x, y, 30, 350, 'boss_brawler');
    this.dashTimer = 3.5;
    this.dashActive = false;
    this.dashDirX = 0;
    this.dashDirY = 0;
    this.dashDur = 0;
    this.hasSplit = false;
    this.spawnTimer = 0.6;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    // Phase 2: at 50% HP spawn adds but BOSS SURVIVES
    if (!this.hasSplit && this.hp <= this.maxHp * 0.5) {
      this.hasSplit = true;
      if (allEnemies) {
        const c1 = new Chaser(this.x - 50, this.y);
        const c2 = new Chaser(this.x + 50, this.y);
        c1.hp = c1.maxHp = 80;
        c2.hp = c2.maxHp = 80;
        allEnemies.push(c1, c2);
      }
      events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.7 });
      events.emit('PLAY_SOUND', 'crash');
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.dashTimer -= dt;
    if (this.dashTimer <= 0 && !this.dashActive) {
      this.dashTimer = 3.5;
      if (dist > 1) {
        this.dashDirX = dx / dist;
        this.dashDirY = dy / dist;
        this.dashActive = true;
        this.dashDur = 0.3;
      }
    }

    if (this.dashActive) {
      this.dashDur -= dt;
      this.x += this.dashDirX * 600 * dt;
      this.y += this.dashDirY * 600 * dt;
      if (this.dashDur <= 0) this.dashActive = false;
      if (dist < this.r + player.r + 4 && this.attackCooldown <= 0) {
        this.attackCooldown = 0.5;
        events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
      }
    } else {
      const spd = 210 * (0.7 + (tempo.value / 100) * 0.8) * this.spdMult();
      if (dist > this.r + player.r) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = 0.9;
        events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.dashActive) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,80,0,0.6)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,80,0,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
    this.drawBody(ctx, '★ BRAWLER', '#cc2200', now);
  }
}

// ── CONDUCTOR BOSS (Floor 2) ────────────────────────────────────
export class BossConductor extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 500, 'boss_conductor');
    this.fireTimer = 3.0;
    this.droneTimer = 20.0;
    this.phase = 1;
    this._angle = 0;
    this.projectileManager = null;
    this.spawnTimer = 0.6;
  }

  _isImmune(allEnemies) {
    if (!allEnemies) return false;
    return allEnemies.some(e => e !== this && e.alive && e.type === 'shielddrone');
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._angle += dt * 1.5;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      events.emit('SCREEN_SHAKE', { duration: 0.3, intensity: 0.5 });
      events.emit('PLAY_SOUND', 'crash');
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 50 * (0.7 + (tempo.value / 100) * 0.5) * this.spdMult();

    if (dist < 180) {
      this.x -= (dx / dist) * spd * dt;
      this.y -= (dy / dist) * spd * dt;
    } else if (dist > 280) {
      this.x += (dx / dist) * spd * 0.5 * dt;
      this.y += (dy / dist) * spd * 0.5 * dt;
    }

    const baseRate = this.phase === 2 ? 1.3 : 2.0;
    const fireRate = Math.max(0.45, baseRate * (1.5 - (tempo.value / 100) * 0.6));
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = fireRate;
      if (this.projectileManager) {
        const shots = this.phase === 2 ? 5 : 3;
        this.projectileManager.spawnSpread(this.x, this.y, player.x, player.y, shots, 0.45, 310, 2, '#aa44ff', 'conductor');
      }
    }

    const droneRate = this.phase === 2 ? 12.0 : 20.0;
    this.droneTimer -= dt;
    if (this.droneTimer <= 0 && allEnemies) {
      this.droneTimer = droneRate;
      const drones = allEnemies.filter(e => e.alive && e.type === 'shielddrone');
      if (drones.length < 2) {
        const angle = Math.random() * Math.PI * 2;
        const sx = this.x + Math.cos(angle) * 90;
        const sy = this.y + Math.sin(angle) * 90;
        if (roomMap) {
          const c = roomMap.clamp(sx, sy, 14);
          allEnemies.push(new ShieldDrone(c.x, c.y));
        } else {
          allEnemies.push(new ShieldDrone(sx, sy));
        }
      }
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  takeDamage(amount, tempo, allEnemies) {
    if (this._isImmune(allEnemies)) { this.hitFlash = 0.05; return 0; }
    return super.takeDamage(amount);
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#9944cc';
    ctx.fill();
    ctx.fillStyle = '#cc66ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ CONDUCTOR', this.x, this.y - this.r - 18);
    this.drawHealthBar(ctx, '#aa44ff');
  }
}

// ── ECHO BOSS (Floor 3 — Final) ────────────────────────────────
export class BossEcho extends Enemy {
  constructor(x, y) {
    super(x, y, 38, 700, 'boss_echo');
    this.fireTimer = 2.2;
    this.phase = 1;
    this.bossTempoVal = 0;
    this.spawnEnemyTimer = 15.0;
    this._angle = 0;
    this.projectileManager = null;
    this.spawnTimer = 0.8;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this._angle += dt;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    if (this.phase === 1 && this.hp <= this.maxHp * 0.66) {
      this.phase = 2;
      events.emit('SCREEN_SHAKE', { duration: 0.3, intensity: 0.5 });
      events.emit('PHASE_TRANSITION', { phase: 2 }); // IDEA-04
    }
    if (this.phase === 2 && this.hp <= this.maxHp * 0.33) {
      this.phase = 3;
      events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.7 });
      events.emit('PHASE_TRANSITION', { phase: 3 }); // IDEA-04
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = (this.phase >= 2 ? 110 : 75) * (0.7 + (tempo.value / 100) * 0.8) * this.spdMult();

    if (dist > this.r + player.r + 8) {
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    } else if (this.attackCooldown <= 0) {
      this.attackCooldown = 1.0;
      events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
    }

    const fireRate = this.phase >= 3 ? 1.1 : (this.phase === 2 ? 1.5 : 2.0);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = fireRate;
      if (this.projectileManager) {
        const shots = this.phase >= 3 ? 4 : (this.phase === 2 ? 3 : 2);
        this.projectileManager.spawnSpread(this.x, this.y, player.x, player.y, shots, 0.32, 240, 1, '#cc44cc', 'echo');
      }
    }

    // Boss Tempo bar (phase 2+)
    if (this.phase >= 2) {
      const riseRate = this.phase >= 3 ? 35 : 20;
      this.bossTempoVal += riseRate * dt;
      if (this.bossTempoVal >= 100) {
        this.bossTempoVal = 45;
        const cr = 90;
        const pdx = player.x - this.x, pdy = player.y - this.y;
        if (pdx * pdx + pdy * pdy < (cr + player.r) * (cr + player.r)) {
          events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
        }
        events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.4 });
        events.emit('PLAY_SOUND', 'crash');
      }
    }

    // Phase 3: spawn enemies
    if (this.phase >= 3 && allEnemies) {
      this.spawnEnemyTimer -= dt;
      if (this.spawnEnemyTimer <= 0) {
        this.spawnEnemyTimer = 14.0;
        const classes = [Chaser, TempoVampire, Swarm];
        const T = classes[Math.floor(Math.random() * classes.length)];
        const sx = roomMap ? roomMap.FLOOR_X1 + 100 + Math.random() * (roomMap.FLOOR_X2 - roomMap.FLOOR_X1 - 200) : this.x + 100;
        const sy = roomMap ? roomMap.FLOOR_Y1 + 80 + Math.random() * (roomMap.FLOOR_Y2 - roomMap.FLOOR_Y1 - 160) : this.y + 100;
        allEnemies.push(new T(sx, sy));
      }
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const pr = this.r + 7 + Math.sin(this._angle * 3) * 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, pr), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180,80,220,0.38)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#7722aa';
    ctx.fill();

    if (this.phase >= 2) {
      const bw = 64, bh = 6;
      const bx = this.x - bw / 2, by = this.y - this.r - 22;
      ctx.fillStyle = '#222';
      ctx.fillRect(bx, by, bw, bh);
      const bCol = this.bossTempoVal >= 90 ? '#ff3333' : (this.bossTempoVal >= 70 ? '#ff8800' : '#aa44cc');
      ctx.fillStyle = bCol;
      ctx.fillRect(bx, by, bw * (this.bossTempoVal / 100), bh);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BOSS TEMPO', this.x, by - 1);
    }

    ctx.fillStyle = '#cc66ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ THE ECHO', this.x, this.y - this.r - (this.phase >= 2 ? 30 : 12));
    const barY = this.y - this.r - 12 + (this.phase >= 2 ? -18 : 0);
    ctx.fillStyle = '#222';
    ctx.fillRect(this.x - 32, barY, 64, 5);
    ctx.fillStyle = '#cc44cc';
    ctx.fillRect(this.x - 32, barY, 64 * Math.max(0, this.hp / this.maxHp), 5);
  }
}

// ── NECROMANCER BOSS (Act 4) ─────────────────────────────────────
export class BossNecromancer extends Enemy {
  constructor(x, y) {
    super(x, y, 30, 600, 'boss_necromancer');
    this.fireTimer = 3.0;
    this.reviveTimer = 25.0;
    this.shieldActive = false;
    this.shieldHp = 0;
    this.phase = 1;
    this._angle = 0;
    this.projectileManager = null;
    this.spawnTimer = 0.8;

    // Register once in constructor — NOT in updateLogic (would leak a new listener every frame)
    events.on('CRASH_ATTACK', () => {
      if (this.alive && this.shieldActive) {
        this.shieldActive = false;
        events.emit('SCREEN_SHAKE', { duration: 0.3, intensity: 0.5 });
      }
    });
  }

  takeDamage(amount, tempo, allEnemies) {
    if (this.shieldActive) { this.hitFlash = 0.05; return 0; }
    return super.takeDamage(amount);
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._angle += dt * 1.2;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    // Phase 2: shield at 50% HP
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.shieldActive = true;
      this.shieldHp = 120;
      this.fireTimer = Math.min(this.fireTimer, 1.5);
      events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.6 });
      events.emit('PLAY_SOUND', 'crash');
      events.emit('PHASE_TRANSITION', { phase: 2 }); // IDEA-04
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 60 * (0.7 + (tempo.value / 100) * 0.5) * this.spdMult();

    if (dist < 200) {
      this.x -= (dx / dist) * spd * dt;
      this.y -= (dy / dist) * spd * dt;
    } else if (dist > 320) {
      this.x += (dx / dist) * spd * 0.6 * dt;
      this.y += (dy / dist) * spd * 0.6 * dt;
    }

    const fireRate = this.phase === 2 ? 1.8 : 2.8;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = fireRate;
      if (this.projectileManager) {
        const shots = this.phase === 2 ? 4 : 3;
        // Homing: aim slightly toward player + spiral offset
        for (let i = 0; i < shots; i++) {
          const angle = Math.atan2(dy, dx) + (i - (shots - 1) / 2) * 0.4;
          this.projectileManager.spawn(this.x, this.y,
            Math.cos(angle), Math.sin(angle),
            200, 2, '#88ff44', 'necromancer');
        }
      }
    }

    // Revive / spawn minion
    this.reviveTimer -= dt;
    if (this.reviveTimer <= 0 && allEnemies) {
      this.reviveTimer = this.phase === 2 ? 16.0 : 25.0;
      // Scan for a dead enemy to revive — no array allocation
      let deadCount = 0;
      for (const e of allEnemies) { if (!e.alive && e !== this) deadCount++; }
      let revived = null;
      if (deadCount > 0) {
        let pick = Math.floor(Math.random() * deadCount);
        for (const e of allEnemies) { if (!e.alive && e !== this && pick-- === 0) { revived = e; break; } }
      }
      if (revived) {
        revived.alive = true;
        revived.hp = Math.round(revived.maxHp * 0.5);
        revived.spawning = true;
        revived.spawnTimer = 0.4;
        events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.3 });
      } else {
        allEnemies.push(new Chaser(
          this.x + Math.cos(this._angle) * 100,
          this.y + Math.sin(this._angle) * 100
        ));
      }
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;

    if (this.shieldActive) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this._angle);
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#88ff44';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = '#44ff44';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHIELD — USE CRASH!', this.x, this.y - this.r - 28);
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#226633';
    ctx.fill();

    ctx.fillStyle = '#88ff44';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ NECROMANCER', this.x, this.y - this.r - (this.shieldActive ? 40 : 18));
    this.drawHealthBar(ctx, '#44cc66');
  }
}

// ── APEX BOSS (Act 5 — Final) ────────────────────────────────────
export class BossApex extends Enemy {
  constructor(x, y) {
    super(x, y, 42, 1000, 'boss_apex');
    this.phase = 1;
    this.fireTimer = 2.0;
    this.crashTimer = 8.0;
    this.summonTimer = 20.0;
    this._angle = 0;
    this.dashTimer = 3.0;
    this.dashActive = false;
    this.dashDirX = 0;
    this.dashDirY = 0;
    this.dashDur = 0;
    this.attackCooldownTimer = 0;
    this.projectileManager = null;
    this.spawnTimer = 1.0;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    this.projectileManager = projMgr;
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._angle += dt * 1.8;
    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    if (this.phase === 1 && this.hp <= this.maxHp * 0.66) {
      this.phase = 2;
      events.emit('SCREEN_SHAKE', { duration: 0.5, intensity: 0.8 });
      events.emit('PLAY_SOUND', 'crash');
      events.emit('PHASE_TRANSITION', { phase: 2 }); // IDEA-04
    }
    if (this.phase === 2 && this.hp <= this.maxHp * 0.33) {
      this.phase = 3;
      events.emit('SCREEN_SHAKE', { duration: 0.6, intensity: 1.0 });
      events.emit('PLAY_SOUND', 'crash');
      events.emit('PHASE_TRANSITION', { phase: 3 }); // IDEA-04
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Phase 1: Melee Rush
    if (this.phase === 1) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && !this.dashActive && dist > 1) {
        this.dashTimer = 3.5;
        this.dashDirX = dx / dist;
        this.dashDirY = dy / dist;
        this.dashActive = true;
        this.dashDur = 0.4;
      }
      if (this.dashActive) {
        this.dashDur -= dt;
        this.x += this.dashDirX * 550 * dt;
        this.y += this.dashDirY * 550 * dt;
        if (this.dashDur <= 0) this.dashActive = false;
        if (dist < this.r + player.r + 6 && this.attackCooldownTimer <= 0) {
          this.attackCooldownTimer = 0.6;
          events.emit('ENEMY_MELEE_HIT', { damage: 3, source: this });
        }
      } else {
        const spd = 120 * this.spdMult();
        if (dist > this.r + player.r) {
          this.x += (dx / dist) * spd * dt;
          this.y += (dy / dist) * spd * dt;
        } else if (this.attackCooldownTimer <= 0) {
          this.attackCooldownTimer = 0.9;
          events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
        }
      }
    }

    // Phase 2: Projectile Storm
    if (this.phase === 2) {
      const spd = 80 * this.spdMult();
      if (dist < 220) {
        this.x -= (dx / dist) * spd * dt;
        this.y -= (dy / dist) * spd * dt;
      } else if (dist > 350) {
        this.x += (dx / dist) * spd * 0.5 * dt;
        this.y += (dy / dist) * spd * 0.5 * dt;
      }
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 1.2;
        if (this.projectileManager) {
          this.projectileManager.spawnSpread(this.x, this.y, player.x, player.y, 6, 0.5, 260, 2, '#ff4400', 'apex');
        }
      }
    }

    // Phase 3: All attacks + summons
    if (this.phase === 3) {
      const spd = 100 * this.spdMult();
      if (dist > this.r + player.r) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      } else if (this.attackCooldownTimer <= 0) {
        this.attackCooldownTimer = 0.7;
        events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
      }
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 1.8;
        if (this.projectileManager) {
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + this._angle;
            this.projectileManager.spawn(this.x, this.y, Math.cos(angle), Math.sin(angle), 220, 1, '#ffaa00', 'apex');
          }
        }
      }
      this.summonTimer -= dt;
      if (this.summonTimer <= 0 && allEnemies) {
        this.summonTimer = 15.0;
        const types = [Chaser, TempoVampire, Phantom];
        const T = types[Math.floor(Math.random() * types.length)];
        const a = Math.random() * Math.PI * 2;
        const sx = this.x + Math.cos(a) * 120, sy = this.y + Math.sin(a) * 120;
        allEnemies.push(new T(sx, sy));
        allEnemies.push(new T(this.x - Math.cos(a) * 120, this.y - Math.sin(a) * 120));
      }
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.phase === 1 && this.dashActive) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,80,0,0.7)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const pr = this.r + 10 + Math.sin(this._angle * 2) * 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, pr, 0, Math.PI * 2);
    const phaseColors = ['rgba(255,80,0,0.3)', 'rgba(255,0,0,0.3)', 'rgba(255,200,0,0.35)'];
    ctx.strokeStyle = phaseColors[this.phase - 1] || phaseColors[0];
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    const bodyColors = ['#aa2200', '#cc0000', '#ff8800'];
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : (bodyColors[this.phase - 1] || bodyColors[0]);
    ctx.fill();

    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`★ THE APEX [P${this.phase}]`, this.x, this.y - this.r - 18);
    this.drawHealthBar(ctx, bodyColors[this.phase - 1] || '#ff4400');
  }
}

// ── JUGGERNAUT (Elite) ────────────────────────────────────────────
export class Juggernaut extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 350, 'juggernaut');
    this.isElite = true; this._eliteAuraColor = '#aa44ff';
    this.telegraphDuration = 0.9;
    this.chargeCooldown = 3.5;
    this.chargeVx = 0;
    this.chargeVy = 0;
    this.chargeActive = false;
    this.chargeTimer = 0;
    this.recoveryTimer = 0;
    this.canBeStaggered = false;
  }

  takeDamage(amount) {
    // 50% reduction while moving (not in recovery or stagger)
    if (this.chargeActive || (this.state === 'chase' && this.recoveryTimer <= 0)) {
      amount = Math.round(amount * 0.5);
    }
    return super.takeDamage(amount);
  }

  stagger(dur) {
    if (this.canBeStaggered) super.stagger(dur);
    // Otherwise stagger is ignored
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);
    this.chargeCooldown = Math.max(0, this.chargeCooldown - dt);

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'idle' && dist < 900 && !player._phantomInkActive) this.state = 'chase';

    if (this.chargeActive) {
      this.chargeTimer -= dt;
      this.x += this.chargeVx * dt;
      this.y += this.chargeVy * dt;
      const cdx = player.x - this.x, cdy = player.y - this.y;
      if (Math.sqrt(cdx*cdx+cdy*cdy) < this.r + 20) {
        events.emit('ENEMY_MELEE_HIT', { damage: 4, source: this });
      }
      if (this.chargeTimer <= 0 || (roomMap && (this.x < roomMap.FLOOR_X1+this.r || this.x > roomMap.FLOOR_X2-this.r || this.y < roomMap.FLOOR_Y1+this.r || this.y > roomMap.FLOOR_Y2-this.r))) {
        this.chargeActive = false;
        this.recoveryTimer = 0.8;
        this.canBeStaggered = true;
        this.chargeCooldown = 3.5;
      }
      if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
      return;
    }

    if (this.recoveryTimer > 0) {
      this.canBeStaggered = true;
      return;
    }
    this.canBeStaggered = false;

    if (this.state === 'chase') {
      const spd = 80 * this.spdMult();
      const angle = Math.atan2(dy, dx);
      // Orbit at medium range
      const orbitDist = 200;
      if (dist > orbitDist + 40) {
        this.x += (dx / dist) * spd * dt;
        this.y += (dy / dist) * spd * dt;
      } else if (dist < orbitDist - 40) {
        this.x -= (dx / dist) * spd * dt;
        this.y -= (dy / dist) * spd * dt;
      } else {
        // Circle
        this.x += -Math.sin(angle) * spd * dt;
        this.y += Math.cos(angle) * spd * dt;
      }

      if (this.chargeCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        // Store initial aim angle
        const aimDx = player.x - this.x, aimDy = player.y - this.y;
        this.chargeVx = aimDx; this.chargeVy = aimDy; // temp direction
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      // Track player during wind-up
      const aimDx = player.x - this.x, aimDy = player.y - this.y;
      this.chargeVx = aimDx; this.chargeVy = aimDy;
      if (this.telegraphTimer <= 0) {
        // Lock in direction at fire time
        const cdx = player.x - this.x, cdy = player.y - this.y;
        const cdist = Math.sqrt(cdx*cdx+cdy*cdy) || 1;
        const chargeSpd = 1250;
        this.chargeVx = (cdx/cdist)*chargeSpd;
        this.chargeVy = (cdy/cdist)*chargeSpd;
        this.chargeTimer = 0.4;
        this.chargeActive = true;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph' && !this.chargeActive) {
      // Draw trajectory line toward player
      const p = 1 - (this.telegraphTimer / this.telegraphDuration);
      ctx.save();
      ctx.globalAlpha = 0.3 + p * 0.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      const ang = Math.atan2(this.chargeVy || 0, this.chargeVx || 0);
      ctx.lineTo(this.x + Math.cos(ang)*500, this.y + Math.sin(ang)*500);
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    if (this.recoveryTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,200,0,0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = this.chargeActive ? '#ff6600' : '#888888';
    ctx.lineWidth = 4;
    ctx.stroke();
    this.drawBody(ctx, 'JUGGERNAUT', '#553366', now);
  }
}

// ── STALKER ───────────────────────────────────────────────────────
export class Stalker extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 60, 'stalker');
    this.isElite = true; this._eliteAuraColor = '#ff4488';
    this.telegraphDuration = 0.4;
    this.opacity = 0.15;
    this.isVisible = false;
    this.revealTimer = 0;
    this.circleAngle = Math.random() * Math.PI * 2;
  }

  takeDamage(amount) {
    this.revealTimer = 1.5;
    this.isVisible = true;
    return super.takeDamage(amount);
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; this.isVisible = true; return; }

    if (this.revealTimer > 0) {
      this.revealTimer = Math.max(0, this.revealTimer - dt);
      if (this.revealTimer <= 0) this.isVisible = false;
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'idle' && dist < 900 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      this.isVisible = false;
      const spd = 155 * this.spdMult();
      this.circleAngle += dt * 0.8;
      const targetX = player.x + Math.cos(this.circleAngle) * 250;
      const targetY = player.y + Math.sin(this.circleAngle) * 250;
      const tdx = targetX - this.x, tdy = targetY - this.y;
      const tdist = Math.sqrt(tdx*tdx + tdy*tdy) || 1;
      this.x += (tdx/tdist) * spd * dt;
      this.y += (tdy/tdist) * spd * dt;

      if (dist < 180 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this.isVisible = true;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      this.isVisible = true;
      if (this.telegraphTimer <= 0) {
        // Sprint at player
        const sdx = player.x - this.x, sdy = player.y - this.y;
        const sdist = Math.sqrt(sdx*sdx+sdy*sdy) || 1;
        const sprintSpd = 300;
        const sprintTime = 0.6;
        // Teleport toward player quickly
        const travelDist = Math.min(sdist, sprintSpd * sprintTime);
        this.x += (sdx/sdist) * travelDist;
        this.y += (sdy/sdist) * travelDist;
        const newDx = player.x - this.x, newDy = player.y - this.y;
        if (Math.sqrt(newDx*newDx+newDy*newDy) < this.r + 20) {
          events.emit('ENEMY_MELEE_HIT', { damage: 3, source: this });
        }
        this.attackCooldown = 1.4;
        this.state = 'chase';
        this.isVisible = false;
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const targetOpacity = (this.isVisible || this.hitFlash > 0) ? 1.0 : 0.15;
    this.opacity += (targetOpacity - this.opacity) * 0.15;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    const col = this.state === 'telegraph' ? '#00ffff' : '#334455';
    this.drawBody(ctx, 'STALKER', col, now);
    ctx.restore();
  }
}

// ── SPLITTER ──────────────────────────────────────────────────────
export class Split extends Enemy {
  constructor(x, y) {
    super(x, y, 9, 30, 'split');
    this.telegraphDuration = 0.3;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 145 * this.spdMult();

    if (this.state === 'idle') this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 55 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > 30) {
        this.x += (dx/dist)*spd*dt;
        this.y += (dy/dist)*spd*dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 70) events.emit('ENEMY_MELEE_HIT', { damage: 1, source: this });
        this.attackCooldown = 0.6;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'SPLIT', '#ff8833', now);
  }
}

export class Splitter extends Enemy {
  constructor(x, y) {
    super(x, y, 16, 90, 'splitter');
    this.telegraphDuration = 0.6;
    this._hasSplit = false;
  }

  takeDamage(amount) {
    const waAlive = this.alive;
    const result = super.takeDamage(amount);
    // On death: emit event so main.js can spawn splits
    if (waAlive && !this.alive && !this._hasSplit) {
      this._hasSplit = true;
      events.emit('SPLITTER_DIED', { x: this.x, y: this.y, difficultySpdMult: this.difficultySpdMult });
    }
    return result;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 140 * this.spdMult();

    if (this.state === 'idle' && dist < 900 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      if (dist <= 80 && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > 50) {
        this.x += (dx/dist)*spd*dt;
        this.y += (dy/dist)*spd*dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (dist <= 100) events.emit('ENEMY_MELEE_HIT', { damage: 2, source: this });
        this.attackCooldown = 1.1;
        this.state = 'chase';
      }
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.r);
    ctx.lineTo(this.x, this.y + this.r);
    ctx.strokeStyle = 'rgba(255,100,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    this.drawBody(ctx, 'SPLITTER', '#ff6622', now);
  }
}

// ── CORRUPTOR ─────────────────────────────────────────────────────
export class Corruptor extends Enemy {
  constructor(x, y) {
    super(x, y, 14, 70, 'corruptor');
    this.isElite = true; this._eliteAuraColor = '#00ddaa';
    this.telegraphDuration = 1.0;
    this.auraRadius = 150;
    this.shieldActive = true;
    this.shieldHp = Math.round(70 * 0.25);
  }

  takeDamage(amount) {
    if (this.shieldActive) {
      this.shieldHp -= amount;
      this.hitFlash = 0.12;
      if (this.shieldHp <= 0) {
        this.shieldActive = false;
        this.shieldHp = 0;
      }
      return 0; // no real damage while shielded
    }
    return super.takeDamage(amount);
  }

  isPlayerInAura(player) {
    const dx = player.x - this.x, dy = player.y - this.y;
    return dx*dx+dy*dy < this.auraRadius*this.auraRadius;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      // Reposition only if player moves away
      if (dist > 350) {
        const spd = 55 * this.spdMult();
        this.x += (dx/dist)*spd*dt;
        this.y += (dy/dist)*spd*dt;
      }
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this.attackCooldown = 2.8;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (projMgr) {
          const cdx = player.x - this.x, cdy = player.y - this.y;
          const cdist = Math.sqrt(cdx*cdx+cdy*cdy) || 1;
          projMgr.spawn(this.x, this.y, cdx/cdist, cdy/cdist, 150, 1, '#00aa99', 'corruptor', false, { corruptShot: true });
        }
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  drawTelegraph(ctx, now) {
    const pulse = (Math.sin(now / 400) + 1) * 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.auraRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,150,120,${0.15 + pulse * 0.15})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.shieldActive) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,200,160,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'CORRUPTOR', '#1a6655', now);
  }
}

// ── BERSERKER ENEMY ───────────────────────────────────────────────
export class BerserkerEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, 18, 100, 'berserker_enemy');
    this.isElite = true; this._eliteAuraColor = '#ff2200';
    this.telegraphDuration = 1.5;
    this.isBerserk = false;
    this.roarTimer = 0;
  }

  updateLogic(dt, player, tempo, roomMap) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    if (this.roarTimer > 0) { this.roarTimer -= dt; return; }

    // Phase transition at 50% HP
    if (!this.isBerserk && this.hp <= this.maxHp * 0.5) {
      this.isBerserk = true;
      this.roarTimer = 0.6;
      this.telegraphDuration = 0.4;
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const baseSpd = this.isBerserk ? 280 : 175;
    const spd = baseSpd * this.spdMult();

    if (this.state === 'idle' && dist < 670 && !player._phantomInkActive) this.state = 'chase';

    const hitRange = 95;
    if (this.state === 'chase') {
      if (dist <= hitRange && this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
      } else if (dist > hitRange - 10) {
        this.x += (dx/dist)*spd*dt;
        this.y += (dy/dist)*spd*dt;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      const staggerReduction = this.isBerserk ? 0.25 : 1.0;
      if (this.telegraphTimer <= 0) {
        if (dist <= hitRange + 15) events.emit('ENEMY_MELEE_HIT', { damage: this.isBerserk ? 5 : 4, source: this });
        const cd = this.isBerserk ? 0.6 : 1.8;
        this.attackCooldown = cd;
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    if (this.isBerserk) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 5 + Math.sin(now/80)*3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,0,0,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (this.roarTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 20 * (1 - this.roarTimer / 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,50,0,0.4)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    this.drawBody(ctx, 'BERSERKER', this.isBerserk ? '#cc0000' : '#664466', now);
  }
}

// ── RICOCHET DRONE ─────────────────────────────────────────────────
export class RicochetDrone extends Enemy {
  constructor(x, y) {
    super(x, y, 11, 45, 'ricochet_drone');
    this.telegraphDuration = 0.4;
    this.orbitAngle = Math.random() * Math.PI * 2;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = 105 * this.spdMult();

    if (this.state === 'idle' && dist < 750 && !player._phantomInkActive) this.state = 'chase';

    if (this.state === 'chase') {
      this.orbitAngle += dt * 0.7;
      const targetDist = 300;
      const tx = player.x + Math.cos(this.orbitAngle) * targetDist;
      const ty = player.y + Math.sin(this.orbitAngle) * targetDist;
      const tdx = tx - this.x, tdy = ty - this.y;
      const tdist = Math.sqrt(tdx*tdx+tdy*tdy) || 1;
      this.x += (tdx/tdist)*spd*dt;
      this.y += (tdy/tdist)*spd*dt;

      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this.attackCooldown = 2.2;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        if (projMgr) {
          const cdx = player.x - this.x, cdy = player.y - this.y;
          const cdist = Math.sqrt(cdx*cdx+cdy*cdy) || 1;
          projMgr.spawn(this.x, this.y, cdx/cdist, cdy/cdist, 280, 2, '#ffffff', 'ricochet_drone', false, { bouncesLeft: 3, roomRef: roomMap });
        }
        this.state = 'chase';
      }
    }
    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,220,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    this.drawBody(ctx, 'DRONE', '#aabbcc', now);
  }
}

// ── TIMEKEEPER ────────────────────────────────────────────────────
// ── DISRUPTOR — silence enemy: prevents player from using cards briefly ──────
export class Disruptor extends Enemy {
  constructor(x, y) {
    super(x, y, 16, 40, 'disruptor');
    this.telegraphDuration = 1.8;
    this._silenceCooldown = 2.0; // starts ready quickly
    this._silenceRange = 190;
    this._pulsePct = 0; // animation
  }

  updateLogic(dt, player, tempo, room, enemies, projectiles) {
    if (!this.alive) return;
    this.updateTimers(dt);
    if (this.updateSpawn(dt)) return;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 110 * this.spdMult();

    // Maintain medium engagement distance
    if (this.state !== 'telegraph') {
      if (dist > 220) {
        const nx = dx / dist, ny = dy / dist;
        const pos = room.clamp(this.x + nx * speed * dt, this.y + ny * speed * dt, this.r);
        this.x = pos.x; this.y = pos.y;
      } else if (dist < 130) {
        // Back away
        const nx = dx / dist, ny = dy / dist;
        const pos = room.clamp(this.x - nx * speed * dt, this.y - ny * speed * dt, this.r);
        this.x = pos.x; this.y = pos.y;
      }
    }

    // Silence pulse
    this._silenceCooldown -= dt;
    if (this._silenceCooldown <= 0 && dist < this._silenceRange + this.r) {
      if (this.state !== 'telegraph') {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this._pulsePct = 0;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      this._pulsePct = 1 - (this.telegraphTimer / this.telegraphDuration);
      if (this.telegraphTimer <= 0) {
        this.state = 'chase';
        this._silenceCooldown = 5.0;
        if (dist < this._silenceRange + this.r) {
          events.emit('PLAYER_SILENCED', { duration: 1.5 });
        }
      }
    }
  }

  drawTelegraph(ctx, now) {
    if (this.state !== 'telegraph') return;
    const pct = this._pulsePct;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this._silenceRange * pct, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(200,50,255,${0.25 + pct * 0.45})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Interference rings
    for (let r = 0.3; r < 1; r += 0.35) {
      if (pct < r) continue;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this._silenceRange * r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,50,255,${0.15})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'DISRUPTOR', '#2a0040', now);
    // Pulse aura indicator
    const pulse = (Math.sin(now / 400) + 1) * 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 6 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,40,255,${0.3 + pulse * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

export class Timekeeper extends Enemy {
  constructor(x, y) {
    super(x, y, 15, 80, 'timekeeper');
    this.isElite = true; this._eliteAuraColor = '#44ddff';
    this.telegraphDuration = 0.5;
    this.auraRadius = 160;
    this.rotAngle = 0;
  }

  isPlayerInAura(player) {
    const dx = player.x - this.x, dy = player.y - this.y;
    return dx*dx+dy*dy < this.auraRadius*this.auraRadius;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    this.rotAngle += dt * 0.8;
    if (this.state === 'idle') this.state = 'chase';

    if (this.state === 'chase') {
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this.attackCooldown = 3.5;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        // Fire 4 projectiles in cross pattern
        if (projMgr) {
          const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
          for (const [vx,vy] of dirs) {
            projMgr.spawn(this.x, this.y, vx, vy, 200, 2, '#9966cc', 'timekeeper');
          }
        }
        this.state = 'chase';
      }
    }
    // Timekeeper never moves
  }

  drawTelegraph(ctx, now) {
    const pulse = (Math.sin(now/600) + 1) * 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.auraRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(80,40,140,${0.2 + pulse * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rotating outer ring indicator
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotAngle);
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 8, 0, Math.PI * 1.5);
    ctx.strokeStyle = '#9966cc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx, now) {
    if (!this.alive) return;
    this.drawBody(ctx, 'TIMEKEEPER', '#3a1a6a', now);
  }
}

// ── SENTINEL ───────────────────────────────────────────────────────
// Stationary turret that fires rotating cross patterns. Rewards movement.
export class Sentinel extends Enemy {
  constructor(x, y) {
    super(x, y, 18, 150, 'sentinel');
    this.rotAngle = Math.random() * Math.PI * 2;
    this.telegraphDuration = 1.2;
    this.phase = 1;
    this._fireTimer = 2.3;
    this._chargePct = 0;
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    if (!this.alive) return;
    if (this.updateSpawn(dt)) return;
    this.updateTimers(dt);
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }
    // PERF-04: stationary enemy early exit
    const dx2 = player.x - this.x, dy2 = player.y - this.y;
    if (dx2*dx2+dy2*dy2 > 900*900) return;

    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.rotAngle += Math.PI / 4;
    }

    this.rotAngle += dt * (this.phase === 2 ? 0.7 : 0.45);

    if (this.state !== 'telegraph') {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
        this._fireTimer = this.phase === 2 ? 2.2 : 3.0;
        this.state = 'telegraph';
        this.telegraphTimer = this.telegraphDuration;
        this._chargePct = 0;
      }
    }

    if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      this._chargePct = 1 - (this.telegraphTimer / this.telegraphDuration);
      if (this.telegraphTimer <= 0) {
        this.state = 'idle';
        const count = this.phase === 2 ? 8 : 4;
        if (projMgr) {
          for (let i = 0; i < count; i++) {
            const angle = this.rotAngle + (i / count) * Math.PI * 2;
            projMgr.spawn(this.x, this.y, Math.cos(angle), Math.sin(angle), 230, 2, '#ff8800', 'sentinel');
          }
        }
        this._chargePct = 0;
      }
    }
    // Sentinel never moves
  }

  drawTelegraph(ctx, now) {
    if (this.state === 'telegraph') {
      const pct = this._chargePct;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (1 + pct * 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,140,0,${0.3 + pct * 0.5})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotAngle);
    const side = this.r * 2;
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#ff8800';
    ctx.fillRect(-side / 2, -side / 2, side, side);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#cc5500';
    ctx.fillRect(0, -4, this.r + 6, 8);
    if (this.phase === 2) {
      for (let i = 1; i < 4; i++) {
        ctx.save();
        ctx.rotate((i / 4) * Math.PI * 2);
        ctx.fillRect(0, -3, this.r + 5, 6);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SENTINEL', this.x, this.y - this.r - 20);
    this.drawHealthBar(ctx, '#ff8800');
    this._drawIntentIcon(ctx, now);
  }
}

// ── BOSS: THE ARCHIVIST ────────────────────────────────────────────
// Copies the last card the player played and mirrors its attack pattern.
export class BossArchivist extends Enemy {
  constructor(x, y) {
    super(x, y, 34, 800, 'boss_archivist');
    this.phase = 1;
    this._angle = 0;
    this._attackTimer = 2.5;
    this._telegraphing = false;
    this._telegraphTimer = 0;
    this._telegraphDuration = 1.6;
    this._attackCooldown = 0;
    this._copiedColor = '#aa88ff';
    this._copiedName = '???';
    this._copiedType = null;

    this._onCardPlayed = ({ cardType, cardColor, cardName }) => {
      this._copiedColor = cardColor || '#aa88ff';
      this._copiedName = cardName || '???';
      this._copiedType = cardType || null;
    };
    events.on('CARD_PLAYED', this._onCardPlayed);
  }

  updateLogic(dt, player, tempo, roomMap, allEnemies, projMgr) {
    if (!this.alive) {
      events.off('CARD_PLAYED', this._onCardPlayed);
      return;
    }
    if (this.updateSpawn(dt)) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._angle += dt * 1.1;
    if (this.staggerTimer > 0) { this.staggerTimer -= dt; return; }

    if (this.phase === 1 && this.hp <= this.maxHp * 0.6) {
      this.phase = 2;
      events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.6 });
      events.emit('PLAY_SOUND', 'crash');
      events.emit('PHASE_TRANSITION', { phase: 2 }); // IDEA-04
    }
    if (this.phase === 2 && this.hp <= this.maxHp * 0.25) {
      this.phase = 3;
      events.emit('SCREEN_SHAKE', { duration: 0.5, intensity: 0.9 });
      events.emit('PLAY_SOUND', 'crash');
      events.emit('PHASE_TRANSITION', { phase: 3 }); // IDEA-04
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (this._telegraphing) {
      this._telegraphTimer -= dt;
      if (this._telegraphTimer <= 0) {
        this._telegraphing = false;
        this._doAttack(player, projMgr, dist, dx, dy);
        this._attackTimer = 2.2 - this.phase * 0.25;
      }
      return;
    }

    // Orbit around player
    const targetDist = 200 + this.phase * 20;
    const spd = (85 + this.phase * 18) * this.spdMult();
    if (dist > targetDist + 30) {
      this.x += (dx / dist) * spd * dt;
      this.y += (dy / dist) * spd * dt;
    } else if (dist < targetDist - 30) {
      this.x -= (dx / dist) * spd * dt;
      this.y -= (dy / dist) * spd * dt;
    } else {
      const perp = { x: -dy / dist, y: dx / dist };
      this.x += perp.x * spd * 0.55 * dt;
      this.y += perp.y * spd * 0.55 * dt;
    }

    this._attackTimer -= dt;
    if (this._attackTimer <= 0) {
      this._telegraphing = true;
      this._telegraphTimer = this._telegraphDuration;
    }

    if (roomMap) { const c = roomMap.clamp(this.x, this.y, this.r); this.x = c.x; this.y = c.y; }
  }

  // BUG-07: cleanup listener so bleed-kill doesn't leave a stale event subscription
  cleanup() {
    events.off('CARD_PLAYED', this._onCardPlayed);
  }

  _doAttack(player, projMgr, dist, dx, dy) {
    if (!projMgr) return;
    const count = this.phase === 3 ? 7 : (this.phase === 2 ? 5 : 3);
    const rangedTypes = new Set(['shot', 'projectile', 'beam', 'ground', 'orbit', 'trap', 'echo', 'sigil']);
    if (this._copiedType && rangedTypes.has(this._copiedType)) {
      // Radial burst
      for (let i = 0; i < count + 2; i++) {
        const angle = (i / (count + 2)) * Math.PI * 2 + this._angle;
        projMgr.spawn(this.x, this.y, Math.cos(angle), Math.sin(angle), 250, 2, this._copiedColor, 'archivist');
      }
    } else {
      // Aimed spread toward player
      const baseAngle = Math.atan2(player.y - this.y, player.x - this.x);
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (i - (count - 1) / 2) * 0.38;
        projMgr.spawn(this.x, this.y, Math.cos(angle), Math.sin(angle), 240, 2, this._copiedColor, 'archivist');
      }
      if (dist < this.r + 70) {
        events.emit('ENEMY_MELEE_HIT', { damage: 3 + this.phase, source: this });
      }
    }
  }

  drawTelegraph(ctx, now) {
    if (!this._telegraphing) return;
    const pct = 1 - (this._telegraphTimer / this._telegraphDuration);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 15 + pct * 10, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(170,100,255,${0.2 + pct * 0.5})`;
    ctx.lineWidth = 2 + pct * 2;
    ctx.stroke();
    if (this._copiedType) {
      ctx.fillStyle = this._copiedColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`COPYING: ${this._copiedName}`, this.x, this.y - this.r - 34);
    }
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const pr = this.r + 12 + Math.sin(this._angle * 2) * 5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, pr, 0, Math.PI * 2);
    ctx.strokeStyle = this._copiedType ? this._copiedColor : `rgba(170,100,255,0.4)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    this.drawBody(ctx, 'ARCHIVIST', '#6622aa', now);

    if (this._copiedType) {
      ctx.fillStyle = this._copiedColor;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`[${this._copiedName}]`, this.x, this.y + 5);
    }
  }
}
