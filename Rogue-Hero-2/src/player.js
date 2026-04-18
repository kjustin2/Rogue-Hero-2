import { Entity } from './Entity.js';
import { events } from './EventBus.js';
import { drawPlayerShape, drawPlayerAura } from './Cosmetics.js';

export class Player extends Entity {
  constructor(x, y, hp, maxHp, baseSpeed) {
    super(x, y, 14);
    this.hp = hp;
    this.maxHp = maxHp;
    this.BASE_SPEED = baseSpeed;
    this.budget = 0;
    this.maxBudget = 5;
    this.apRegen = 0.7;
    this.attackCooldown = 0;
    this.dodgeCooldown = 0;
    this.dodging = false;
    this.dodgeTimer = 0;
    this.dodgeDuration = 0.15;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.hitFlash = 0;
    this.classPassives = null;

    // Perfect Dodge
    this.perfectDodgeWindow = 0;       // How long perfect dodge detection is active
    this.perfectDodgeTriggered = false; // Already emitted this dodge
    this.trailTimer = 0;
  }

  setClassPassives(passives) {
    this.classPassives = passives;
    this._classPassives = passives;
    // Vanguard 6 AP cap
    if (passives && passives.maxAP) {
      this.maxBudget = passives.maxAP;
    }
    // Vanguard: longer dodge cooldown applied via dodgeCooldown override
  }

  heal(amount) {
    this.hp = Math.min(this.hp + amount, this.maxHp);
  }

  updateLogic(dt, input, tempo, roomMap) {
    if (!this.alive) return;

    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    // BUG-01: oathComboWindow holds the combo timer while Berserker's Oath stacks remain
    if (!this.oathComboWindow) this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.comboCount = 0;

    // AP regen (Corruptor aura reduces by 60%)
    const regenMult = this._corruptorAura ? 0.4 : 1.0;
    this.budget = Math.min(this.budget + this.apRegen * regenMult * dt, this.maxBudget);

    // Speed: base × tempo × War Cry boost × Timekeeper slow × Brutal curse
    let spdMult = tempo.speedMultiplier();
    if (this._timekeeperAura) spdMult *= 0.45;
    if (this.speedBoostTimer > 0) spdMult *= (this.speedBoostMult || 1.2);
    if (this._cursedSpeedMult) spdMult *= this._cursedSpeedMult; // IDEA-12: Brutal curse
    if (this.downed) spdMult *= 0.35; // RH2: crawl speed while downed
    const spd = this.BASE_SPEED * spdMult;

    // Dodge
    if (this.dodging) {
      this.dodgeTimer -= dt;
      if (this.dodgeTimer <= 0) {
        this.dodging = false;
        this.perfectDodgeWindow = 0;
        // Landing impact ring
        this._landingRing = { t: performance.now() / 1000, x: this.x, y: this.y };
      }
    }

    // Movement — input scheme controls which keys are accepted:
    //   'arrows' = arrows only (P1 in 2P co-op)
    //   'wasd'   = WASD only (P2 in 2P co-op — uses player2View)
    //   'both' (default) = arrows + WASD (solo)
    if (!this.dodging) {
      let mx = 0, my = 0;
      const scheme = this._inputScheme || 'both';
      const wantArrows = scheme === 'both' || scheme === 'arrows';
      const wantWASD   = scheme === 'both' || scheme === 'wasd';
      if ((wantWASD && input.isDown('a')) || (wantArrows && input.isDown('arrowleft')))  mx -= 1;
      if ((wantWASD && input.isDown('d')) || (wantArrows && input.isDown('arrowright'))) mx += 1;
      if ((wantWASD && input.isDown('w')) || (wantArrows && input.isDown('arrowup')))    my -= 1;
      if ((wantWASD && input.isDown('s')) || (wantArrows && input.isDown('arrowdown')))  my += 1;

      if (mx !== 0 || my !== 0) {
        const len = Math.sqrt(mx * mx + my * my);
        this.vx = (mx / len) * spd;
        this.vy = (my / len) * spd;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      } else {
        this.vx = 0;
        this.vy = 0;
      }

      // Dodge trigger (disabled while downed) — _dodgeKey defaults to space
      const dodgeKey = this._dodgeKey || ' ';
      if (!this.downed && input.consumeKey(dodgeKey) && this.dodgeCooldown <= 0) {
        const fortifiedDodge = this.classPassives && this.classPassives.fortifiedDodge;
        // Can't dodge in Critical (90+) unless Fortified Dodge
        if (tempo.value >= 90 && !fortifiedDodge) {
          events.emit('OVERLOADED', { x: this.x, y: this.y });
        } else {
          this.dodging = true;
          this.dodgeTimer = this.dodgeDuration;
          this.dodgeCooldown = (this.classPassives && this.classPassives.dodgeCooldown) || 0.3;
          // Dodging cancels silence
          if (this.silenced) { this.silenced = false; this.silenceTimer = 0; }
          // Perfect dodge window
          const basePerfWindow = 0.12;
          const windowMult = (this.classPassives && this.classPassives.perfectDodgeWindowMult) || 1.0;
          this.perfectDodgeWindow = basePerfWindow * windowMult;
          this.perfectDodgeTriggered = false;

          const dmx = input.mouse.x - this.x, dmy = input.mouse.y - this.y;
          const dist = Math.sqrt(dmx * dmx + dmy * dmy);
          if (dist > 5) {
            this.vx = (dmx / dist) * spd * 2.5;
            this.vy = (dmy / dist) * spd * 2.5;
          } else if (this.vx !== 0 || this.vy !== 0) {
            const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            this.vx = (this.vx / len) * spd * 2.5;
            this.vy = (this.vy / len) * spd * 2.5;
          }
          events.emit('DODGE');
          events.emit('PLAY_SOUND', 'dodge');
        }
      }
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // Perfect dodge detection — check if a projectile or enemy attack was near during i-frames
    if (this.perfectDodgeWindow > 0) {
      this.perfectDodgeWindow -= dt;
    }

    // Trail particles — always when cosmetic trail equipped, else only at Hot/Critical
    this.trailTimer -= dt;
    const _teq = window._equippedCosmetics;
    const _hasTrailCosmetic = _teq && _teq.trailDef;
    const _isMoving = this.vx !== 0 || this.vy !== 0;
    if ((_hasTrailCosmetic ? _isMoving : (tempo.value >= 70 && _isMoving)) && this.trailTimer <= 0) {
      this.trailTimer = 0.04;
      let trailColor;
      if (_teq && _teq.trailDef) {
        if (_teq.trailDef.getColor) {
          trailColor = _teq.trailDef.getColor(performance.now() / 1000);
        } else {
          trailColor = _teq.trailDef.value || tempo.stateColor();
        }
      } else {
        trailColor = tempo.stateColor();
      }
      events.emit('PLAYER_TRAIL', { x: this.x, y: this.y, color: trailColor });
    }

    // Room clamp — cancel velocity in constrained direction to prevent wall-sliding
    if (roomMap) {
      const prevX = this.x, prevY = this.y;
      const c = roomMap.clamp(this.x, this.y, this.r);
      if (Math.abs(c.x - prevX) > 0.5) this.vx = 0;
      if (Math.abs(c.y - prevY) > 0.5) this.vy = 0;
      this.x = c.x;
      this.y = c.y;
    }
  }

  // Called by projectile system / enemy attack when a near-miss happens during dodge
  checkPerfectDodge() {
    if (this.dodging && this.perfectDodgeWindow > 0 && !this.perfectDodgeTriggered) {
      this.perfectDodgeTriggered = true;
      events.emit('PERFECT_DODGE');
      events.emit('PLAY_SOUND', 'perfect');
      // Slow-mo
      const slowDur = (this.classPassives?.perfectDodgeWindowMult === 2.0) ? 0.8 : 0.4;
      events.emit('SLOW_MO', { dur: slowDur, scale: 0.3 });
      return true;
    }
    return false;
  }

  takeDamage(amount) {
    if (!this.alive || this.dodging || this.downed) return;
    // Frost passive: 30% damage reduction in Cold
    if (this.classPassives?.coldDamageReduction && this.hp > 0) {
      // This will be checked against tempo value in main.js
    }
    this.hp -= amount;
    this.hitFlash = 0.15;
    events.emit('PLAY_SOUND', 'playerHit');
    events.emit('DAMAGE_TAKEN');
    if (this.hp <= 0) {
      // RH2: in MP, transition to downed state instead of dying outright.
      // main.js sets `this._coopMode = true` when there are 2+ players.
      if (this._coopMode) {
        this.downed = true;
        this.downedTimer = 0;
        this.reviveProgress = 0;
        this.hp = 0;
        this.vx = 0; this.vy = 0;
        events.emit('PLAYER_DOWNED', { player: this });
      } else {
        this.alive = false;
      }
    }
  }

  // RH2: While downed, allow only 1-cost cards and disable dodge.
  // Call from card-play guard in main.js.
  canPlayCardWhileDowned(cardDef) {
    if (!this.downed) return true;
    return cardDef && cardDef.cost <= 1;
  }

  draw(ctx, tempo) {
    if (!this.alive) return;
    const eq = window._equippedCosmetics;
    const t = performance.now() / 1000;

    // Landing impact ring
    if (this._landingRing) {
      const age = t - this._landingRing.t;
      const dur = 0.32;
      if (age < dur) {
        const p = age / dur;
        ctx.beginPath();
        ctx.arc(this._landingRing.x, this._landingRing.y, 14 + p * 30, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,200,255,${(1 - p) * 0.6})`;
        ctx.lineWidth = 2 - p;
        ctx.stroke();
      }
    }

    // Multi-ghost dodge afterimage trail (3 staggered ghosts)
    if (this.dodging) {
      const trailCol = eq?.trailDef?.value || 'rgba(51,170,255,0.5)';
      for (let gi = 3; gi >= 1; gi--) {
        const off = gi * 0.055;
        ctx.beginPath();
        ctx.arc(this.x - this.vx * off, this.y - this.vy * off, this.r - gi * 0.8, 0, Math.PI * 2);
        ctx.globalAlpha = 0.38 - gi * 0.09;
        ctx.fillStyle = trailCol;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Tempo-zone ambient aura ring
    {
      const tempoVal = tempo ? tempo.value : 50;
      const zoneColor = tempo ? tempo.stateColor() : '#ffffff';
      const pulseFreq = tempoVal >= 90 ? 14 : tempoVal >= 70 ? 6 : 3;
      const jitter    = tempoVal >= 90 ? Math.sin(t * 28) * 2.5 : 0;
      const auraA     = 0.15 + Math.sin(t * pulseFreq) * 0.08;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 7 + jitter, 0, Math.PI * 2);
      ctx.strokeStyle = zoneColor;
      ctx.globalAlpha = auraA;
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Drop shadow
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.r*0.6, this.r*1.3, this.r*0.4, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Aura (drawn below body)
    if (eq?.auraDef) {
      drawPlayerAura(ctx, this.x, this.y, this.r, eq.auraDef.value, t, tempo.value);
    }

    // Resolve fill color and draw body
    const shapeName = eq?.shapeDef?.value || 'circle';
    let fillColor;
    if (this.hitFlash > 0) {
      if (eq?.flashDef?.getFlashColor) {
        fillColor = eq.flashDef.getFlashColor();
      } else {
        fillColor = eq?.flashDef?.value || '#ffffff';
      }
    } else if (this.dodging) {
      fillColor = 'rgba(100,180,255,0.8)';
    } else if (eq?.bodyDef?.animated && eq.bodyDef.animFn) {
      // Super Legendary body animFn draws itself
      eq.bodyDef.animFn(ctx, this.x, this.y, this.r, t);
      fillColor = null;
    } else {
      fillColor = eq?.bodyDef?.value || tempo.stateColor();
    }

    if (fillColor !== null) {
      if (eq?.shapeDef?.animated && eq.shapeDef.animFn) {
        eq.shapeDef.animFn(ctx, this.x, this.y, this.r, t, fillColor);
      } else {
        ctx.fillStyle = fillColor;
        drawPlayerShape(ctx, this.x, this.y, this.r, shapeName);
        ctx.fill();
      }
    }

    // Outline cosmetic
    if (eq?.outlineDef) {
      if (eq.outlineDef.animated && eq.outlineDef.animFn) {
        eq.outlineDef.animFn(ctx, this.x, this.y, this.r, t);
      } else {
        ctx.strokeStyle = eq.outlineDef.value;
        ctx.lineWidth = 1.5;
        drawPlayerShape(ctx, this.x, this.y, this.r, shapeName);
        ctx.stroke();
      }
    }

    // Inner highlight (skip if Super Legendary body)
    if (!eq?.bodyDef?.animated) {
      ctx.beginPath();
      ctx.arc(this.x - 3, this.y - 3, this.r*0.35, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    // Direction indicator
    if (this.vx || this.vy) {
      const angle = Math.atan2(this.vy, this.vx);
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(angle)*(this.r+4), this.y + Math.sin(angle)*(this.r+4));
      ctx.lineTo(this.x + Math.cos(angle-0.5)*(this.r-2), this.y + Math.sin(angle-0.5)*(this.r-2));
      ctx.lineTo(this.x + Math.cos(angle+0.5)*(this.r-2), this.y + Math.sin(angle+0.5)*(this.r-2));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
    }

    // Critical state glow (reactive aura handles this itself)
    if (tempo.value >= 90 && eq?.auraDef?.value !== 'reactive') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r+5, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,50,50,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawHelpers(ctx, this, tempo);
  }
}

function drawHelpers(ctx, player, tempo) {
  // Perfect dodge available indicator (small text)
  if (tempo.value < 90 && !player.dodging && player.dodgeCooldown <= 0) {
    ctx.fillStyle = 'rgba(100,200,255,0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE', player.x, player.y + player.r + 14);
  }
}
