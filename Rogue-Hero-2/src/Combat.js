import { events } from './EventBus.js';

export class CombatManager {
  constructor(tempoSystem, particleSystem, audioSystem, projectileManager) {
    this.tempo = tempoSystem;
    this.particles = particleSystem;
    this.audio = audioSystem;
    this.projectiles = projectileManager || null;
    this.postDodgeCritActive = false;
    this.postDodgeCritTimer = 0;
    this.lastCardType = null; // for synergy combos

    events.on('CRASH_ATTACK', ({ x, y, radius, dmg }) => {
      this.circularHitbox(x, y, radius, dmg, true);
      // Crash burst visual
      this.particles.spawnCrashBurst(x, y, radius);
    });

    events.on('PERFECT_DODGE', () => {
      this.postDodgeCritActive = true;
      this.postDodgeCritTimer = 1.5;
    });
  }

  setLists(enemies, player) {
    this.enemies = enemies;
    this.player = player;
  }

  update(dt) {
    if (this.postDodgeCritTimer > 0) {
      this.postDodgeCritTimer -= dt;
      if (this.postDodgeCritTimer <= 0) this.postDodgeCritActive = false;
    }
  }

  circularHitbox(x, y, radius, dmg, severeStagger = false) {
    if (!this.enemies) return false;
    let hitAny = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < (radius + e.r) * (radius + e.r)) {
        this.applyDamageToEnemy(e, dmg);
        if (e.alive && (severeStagger || this.tempo.value < 30)) {
          e.stagger(severeStagger ? 0.6 : 0.25);
        }
        hitAny = true;
      }
    }
    return hitAny;
  }

  applyDamageToEnemy(enemy, amount) {
    // Post-dodge crit (Shadow passive)
    if (this.postDodgeCritActive && this.tempo.classPassives?.postDodgeCrit) {
      amount = Math.round(amount * 2);
      this.postDodgeCritActive = false;
      this.particles.spawnDamageNumber(enemy.x, enemy.y - 30, 'CRIT!');
    }
    // Marked for Death: 2× damage
    if (enemy.markedTimer > 0) {
      amount = Math.round(amount * 2);
    }
    // Wraith Death's Edge: 2× damage at low HP, kills heal
    if (this.tempo.classPassives?.deathsEdge && this.player && this.player.hp <= 2) {
      amount = Math.round(amount * 2);
    }

    // Resonance rune double damage
    if (this.player && this.player._resonanceActive > 0) {
      amount = Math.round(amount * 2);
    }

    // ShieldDrone/Conductor immunity check
    if (enemy.type === 'shielddrone') {
      const actualDmg = enemy.takeDamage(amount, this.tempo);
      if (actualDmg === 0) return false; // Was shielded
      this.particles.spawnDamageNumber(enemy.x, enemy.y, actualDmg);
    } else if (enemy.type === 'boss_conductor') {
      const actualDmg = enemy.takeDamage(amount, this.tempo, this.enemies);
      if (actualDmg === 0) return false;
      this.particles.spawnDamageNumber(enemy.x, enemy.y, actualDmg);
    } else {
      enemy.takeDamage(amount);
      this.particles.spawnDamageNumber(enemy.x, enemy.y, amount);
    }

    if (!enemy.alive) {
      this.particles.spawnBurst(enemy.x, enemy.y, '#dd3333');
      events.emit('KILL');
      events.emit('PLAY_SOUND', 'kill');

      // Wraith Death's Edge kill-heal
      if (this.tempo.classPassives?.deathsEdge && this.player && this.player.hp <= 2) {
        this.player.heal(1);
        this.particles.spawnDamageNumber(this.player.x, this.player.y - 20, '+1 HP');
      }

      // Check if this was the last enemy — manual scan avoids array allocation per kill
      let aliveCount = 0;
      for (const e of this.enemies) { if (e.alive && e !== enemy) aliveCount++; }
      if (aliveCount === 0) {
        events.emit('LAST_KILL', { x: enemy.x, y: enemy.y });
      }
      return true;
    }
    return false;
  }

  executeCard(player, cardDef, inputPos) {
    if (player.budget < cardDef.cost) return false;

    player.budget -= cardDef.cost;
    // Berserker's Oath (BUG-01): consume a stack to waive AP cost
    if (player.oathStacks > 0) {
      player.budget += cardDef.cost;
      player.oathStacks--;
      if (player.oathStacks === 0) player.oathComboWindow = false;
    }
    this.tempo.setValue(this.tempo.value + cardDef.tempoShift);
    // IDEA-12: Brutal tempoCost curse — extra -5 Tempo per card played
    if (this.player && this.player._tempoCursed) {
      this.tempo._add(-5);
    }
    let dmgMult = this.tempo.damageMultiplier();

    // Shadow Cloak (BUG-01): latch and clear before any damage so multi-hit cards all get 3×
    if (this.player && this.player._shadowCloakActive) {
      dmgMult *= 3;
      this.player._shadowCloakActive = false;
      this.particles.spawnDamageNumber(this.player.x, this.player.y - 30, 'CLOAK!');
    }

    // IDEA-08: Fortify rest buff — +10% damage, consumed after first card played
    if (this.player && this.player._fortifyBuff) {
      dmgMult *= 1.1;
    }

    // Synergy combo: bonus when this card type follows a specific previous type
    const _prevType = this.lastCardType;
    this.lastCardType = cardDef.type;
    dmgMult *= this._getSynergyMult(_prevType, cardDef.type);

    // Card resonance: 3+ cards of same type in hand = +20% damage of that type
    if (player._resonanceType && player._resonanceType === cardDef.type) {
      dmgMult *= 1.2;
    }

    // Cursed cards: HP cost (in addition to any other effects)
    if (cardDef.cursed && cardDef.hpCost) {
      player.takeDamage(cardDef.hpCost);
      this.particles.spawnBurst(player.x, player.y, '#ff0044');
      this.particles.spawnDamageNumber(player.x, player.y - 20, `-${cardDef.hpCost} HP CURSED`);
    }
    // Forbidden Surge: pure tempo + HP cost, no damage
    if (cardDef.id === 'forbidden_surge') {
      this.particles.spawnRing(player.x, player.y, 90, '#8800ff');
      this.particles.spawnDamageNumber(player.x, player.y - 35, `+${cardDef.tempoShift} TEMPO!`);
      events.emit('PLAY_SOUND', 'crash');
      events.emit('CARD_PLAYED', { cardType: cardDef.type, cardColor: cardDef.color, cardName: cardDef.name });
      return true;
    }
    const cardColor = cardDef.color || '#ffffff';
    const isCritical = this.tempo.value >= 90;

    // Stance modifiers
    if (player.stance === 'blade_dance' && (cardDef.type === 'melee' || cardDef.type === 'cleave')) {
      dmgMult *= 1.4;
    }
    if (player.stance === 'iron_aegis' && (cardDef.type === 'melee' || cardDef.type === 'cleave')) {
      // no dmg change for aegis — defense stance doesn't buff offense
    }
    if (player.stance === 'tempo_shift') {
      // Handled in tempo system
    }

    // Blood Pact: costs HP
    if (cardDef.id === 'blood_pact') {
      player.takeDamage(1);
      this.particles.spawnBurst(player.x, player.y, '#ff2266');
    }
    // Glass Cannon / self-damage cards
    if (cardDef.selfDamage) {
      player.takeDamage(cardDef.selfDamage);
      this.particles.spawnBurst(player.x, player.y, '#ff0044');
      this.particles.spawnDamageNumber(player.x, player.y - 20, `-${cardDef.selfDamage} HP`);
    }
    // Riposte: if used within 0.6s of dodge, cost is 0 (refund already spent budget)
    if (cardDef.riposte && player.recentDodgeTimer > 0.1) {
      player.budget += cardDef.cost; // refund
    }
    // Death's Bargain: cannot use at ≤2 HP
    if (cardDef.deathsBargain) {
      if (player.hp <= 2) {
        player.budget += cardDef.cost;
        this.particles.spawnDamageNumber(player.x, player.y - 30, 'NOT NOW!');
        return false;
      }
      player.takeDamage(2);
      this.particles.spawnBurst(player.x, player.y, '#cc0000');
    }
    // Last Stand: only at ≤2 HP
    if (cardDef.lastStand && player.hp > 2) {
      player.budget += cardDef.cost;
      this.particles.spawnDamageNumber(player.x, player.y - 30, 'NOT NOW!');
      return false;
    }
    // Tempo Flip: override tempo shift here
    if (cardDef.tempoFlip) {
      const shift = this.tempo.value > 50 ? -30 : 30;
      this.tempo._add(shift);
      this.particles.spawnRing(player.x, player.y, 60, '#44ffff');
      events.emit('PLAY_SOUND', 'hit');
      events.emit('CARD_PLAYED', { cardType: cardDef.type, cardColor: cardDef.color, cardName: cardDef.name });
      return true;
    }
    // Berserker's Oath: lose 2 HP, set oath stacks
    if (cardDef.berserkerOath) {
      player.takeDamage(2);
      player.oathStacks = 5;
      player.oathComboWindow = true;
      this.particles.spawnRing(player.x, player.y, 80, '#ff3300');
      this.particles.spawnDamageNumber(player.x, player.y - 30, 'OATH!');
      events.emit('PLAY_SOUND', 'heavyHit');
      events.emit('CARD_PLAYED', { cardType: cardDef.type, cardColor: cardDef.color, cardName: cardDef.name });
      return true;
    }
    // Phase Step: invincibility bubble
    if (cardDef.phaseStep) {
      player.dodging = true;
      player.dodgeTimer = 0.5;
      player.dodgeCooldown = Math.max(player.dodgeCooldown, 0.5);
      this.particles.spawnBurst(player.x, player.y, '#ccaaff');
      events.emit('PLAY_SOUND', 'dodge');
      events.emit('CARD_PLAYED', { cardType: cardDef.type, cardColor: cardDef.color, cardName: cardDef.name });
      return true;
    }

    // Emit CARD_PLAYED so enemies like the Archivist can track the player's cards
    events.emit('CARD_PLAYED', { cardType: cardDef.type, cardColor: cardDef.color, cardName: cardDef.name });

    // ── MELEE ──
    if (cardDef.type === 'melee') {
      // Mirror Strike: hit in 4 cardinal directions
      if (cardDef.mirrorStrike) {
        return this._mirrorStrike(player, cardDef, dmgMult, cardColor);
      }

      if (isCritical) {
        // CRITICAL PIERCE: hit ALL enemies in range, not just nearest
        return this._meleePierce(player, cardDef, dmgMult, cardColor);
      }

      const _meleeRange = cardDef.range;
      let nearest = null, nearestDist = Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const d2 = dx * dx + dy * dy;
        const threshold = _meleeRange + e.r;
        if (d2 < threshold * threshold && d2 < nearestDist) { nearest = e; nearestDist = d2; }
      }
      if (nearest) {
        // Combo tracking
        player.comboTimer = 2.0;
        player.comboCount++;
        events.emit('COMBO_HIT', { hitNum: Math.min(player.comboCount, 3) });
        if (player.comboCount >= 2) {
          events.emit('COMBO_DISPLAY', { count: player.comboCount, x: nearest.x, y: nearest.y - 30 });
        }

        let hitMult = player.comboCount >= 3 ? 1.4 : 1;
        // Ice Spike: 3× damage in COLD zone
        if (cardDef.coldMultiplier && this.tempo.value < 30) {
          hitMult *= cardDef.coldMultiplier;
          this.particles.spawnDamageNumber(nearest.x, nearest.y - 30, 'COLD ×3!');
        }
        // Counter Slash / Riposte: bonus damage if used shortly after a dodge
        if ((cardDef.postDodgeBonus || cardDef.riposte) && player.recentDodgeTimer > 0) {
          hitMult *= 1.5;
          this.particles.spawnDamageNumber(nearest.x, nearest.y - 20, 'COUNTER!');
        }
        // Guard stacks bonus (Vanguard Punisher + Iron Retort)
        const guardStacks = player.guardStacks || 0;
        if (cardDef.ironRetort) hitMult *= (1 + guardStacks * 8 / cardDef.damage);
        if (guardStacks > 0 && this.tempo.classPassives?.punisher &&
            (cardDef.type === 'cleave' || cardDef.cost >= 3)) {
          hitMult *= (1 + guardStacks * 0.25);
        }
        // Death Blow: triple damage below 20% HP
        if (cardDef.executeLowMult && nearest.hp / nearest.maxHp < 0.20) {
          hitMult *= 3;
          this.particles.spawnDamageNumber(nearest.x, nearest.y - 30, 'DEATH BLOW!');
        }
        // Echo resonance pulse: secondary hit if Tempo ±band of 50 (Resonance Crystal widens to ±15)
        const isEchoResonant = this.tempo.classPassives?.resonancePulse &&
          Math.abs(this.tempo.value - 50) <= this.tempo.resonanceBand();

        const dmg = Math.round(cardDef.damage * dmgMult * hitMult);

        // Frenzy: multi-hit
        if (cardDef.multiHit && cardDef.multiHit > 1) {
          for (let h = 0; h < cardDef.multiHit; h++) {
            if (!nearest.alive) break;
            this.applyDamageToEnemy(nearest, dmg);
            player.comboCount++;
            events.emit('COMBO_HIT', { hitNum: Math.min(player.comboCount, 3) });
          }
        } else {
          let killed = this.applyDamageToEnemy(nearest, dmg);
          if (cardDef.id === 'vampire_bite' && killed) {
            player.heal(1);
            this.particles.spawnDamageNumber(player.x, player.y - 20, '+1 HP');
          }
        }

        if (cardDef.id === 'shield_bash' && nearest.alive) nearest.stagger(0.8);
        if (cardDef.bleed && nearest.alive) { nearest.bleedTimer = 3.0; nearest.bleedDmg = 3; }
        // Whip Lash: apply slow
        if (cardDef.slow && nearest.alive) {
          nearest.slowTimer = 0.5;
          nearest.slowMult = 0.5;
        }

        if (nearest.alive && this.tempo.value < 30) nearest.stagger(0.5);

        // Echo resonance pulse: radial AoE 100px at 40% damage
        if (isEchoResonant) {
          const pulseDmg = Math.round(dmg * 0.4);
          for (const other of this.enemies) {
            if (!other.alive || other === nearest) continue;
            const pdx = other.x - nearest.x, pdy = other.y - nearest.y;
            if (pdx * pdx + pdy * pdy < (100 + other.r) * (100 + other.r)) {
              this.applyDamageToEnemy(other, pulseDmg);
            }
          }
          this.particles.spawnRing(nearest.x, nearest.y, 100, '#00eedd');
        }

        if (cardDef.cost > 2) events.emit('SCREEN_SHAKE', { duration: 0.15, intensity: 0.3 });
        this.particles.spawnSlash(player.x, player.y, nearest.x, nearest.y, cardColor);
        this.particles.spawnBurst(nearest.x, nearest.y, cardColor);
        events.emit('PLAY_SOUND', cardDef.cost > 2 ? 'heavyHit' : 'hit');
        return true;
      } else {
        // Miss
        if (cardDef.apRefundOnMiss) {
          player.budget += cardDef.cost;
          this.particles.spawnDamageNumber(player.x, player.y - 20, 'MISS (refund)');
        }
        this.particles.spawnRing(player.x, player.y, cardDef.range, 'rgba(255,255,255,0.2)');
        events.emit('PLAY_SOUND', 'miss');
        return true;
      }
    }

    // ── CLEAVE ──
    if (cardDef.type === 'cleave') {
      let cleaveMult = 1.0;
      // Vanguard Punisher bonus
      const guardStacks = player.guardStacks || 0;
      if (guardStacks > 0 && this.tempo.classPassives?.punisher) {
        cleaveMult *= (1 + guardStacks * 0.25);
      }
      // Earthshaker hot bonus
      if (cardDef.hotBonus && this.tempo.value >= 70) {
        cleaveMult *= 1.5;
        this.particles.spawnDamageNumber(player.x, player.y - 30, 'HOT!');
      }
      const dmg = Math.round(cardDef.damage * dmgMult * cleaveMult);
      const isColdZone = this.tempo.value < 30;
      let hitAny = false;
      let cleaveHitCount = 0;
      // Helper to do one pass of the cleave
      const doCleavePass = () => {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - player.x, dy = e.y - player.y;
          const threshold = cardDef.range + e.r;
          if (dx * dx + dy * dy < threshold * threshold) {
            const finalDmg = (cardDef.executeLow && e.hp / e.maxHp < 0.15) ? e.hp + 999 : dmg;
            this.applyDamageToEnemy(e, finalDmg);
            if (e.alive) e.stagger(0.15);
            hitAny = true;
            cleaveHitCount++;
          }
        }
      };
      doCleavePass();
      // Death Spiral: cursed cleave — player takes 1 HP per enemy struck
      if (cardDef.selfDamagePerHit && cleaveHitCount > 0) {
        const selfDmg = cardDef.selfDamagePerHit * cleaveHitCount;
        player.takeDamage(selfDmg);
        this.particles.spawnBurst(player.x, player.y, '#880000');
        this.particles.spawnDamageNumber(player.x, player.y - 30, `-${selfDmg} HP SPIRAL`);
      }
      // Frost Reave: double hit in COLD zone
      if (cardDef.coldDoubleHit && isColdZone) {
        doCleavePass();
        this.particles.spawnDamageNumber(player.x, player.y - 30, 'DOUBLE REAVE!');
      }
      let angle = Math.atan2(inputPos.y - player.y, inputPos.x - player.x);
      this.particles.spawnSlash(player.x, player.y, player.x + Math.cos(angle) * 80, player.y + Math.sin(angle) * 80, cardColor);
      this.particles.spawnRing(player.x, player.y, cardDef.range, cardColor);
      if (hitAny) {
        events.emit('SCREEN_SHAKE', { duration: 0.08, intensity: 0.15 });
        events.emit('PLAY_SOUND', 'hit');
      } else {
        events.emit('PLAY_SOUND', 'miss');
      }
      return true;
    }

    // ── DASH ──
    // Dashes toward enemy but stops at safe distance (outside contact range).
    // Brief invincibility window so the player doesn't immediately take contact damage.
    if (cardDef.type === 'dash') {
      const _dashRange = cardDef.range;
      let nearest = null, nearestDist = Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const d2 = dx * dx + dy * dy;
        const threshold = _dashRange + e.r;
        if (d2 < threshold * threshold && d2 < nearestDist) { nearest = e; nearestDist = d2; }
      }
      if (nearest) {
        const dx = nearest.x - player.x, dy = nearest.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Safe stop distance: just outside contact range
        const safeStop = player.r + nearest.r + 18;
        this.particles.spawnBurst(player.x, player.y, cardColor);
        if (dist > safeStop) {
          player.x += (dx / dist) * (dist - safeStop);
          player.y += (dy / dist) * (dist - safeStop);
        }
        // Dash-through (BUG-02): overshoot to far side of enemy
        if (cardDef.dashThrough) {
          player.x += (dx / dist) * (nearest.r * 2 + player.r * 2 + 20);
          player.y += (dy / dist) * (nearest.r * 2 + player.r * 2 + 20);
        }
        // Brief invincibility so the player doesn't take immediate contact damage
        player.dodging = true;
        player.dodgeTimer = 0.18;
        player.dodgeCooldown = Math.max(player.dodgeCooldown, 0.18);

        const dmg = Math.round(cardDef.damage * dmgMult);
        this.applyDamageToEnemy(nearest, dmg);
        if (cardDef.id === 'shadow_mark' && nearest.alive) {
          nearest.marked = true;
          this.particles.spawnDamageNumber(nearest.x, nearest.y - 20, 'MARKED');
        }
        events.emit('SCREEN_SHAKE', { duration: 0.1, intensity: 0.25 });
        this.particles.spawnSlash(player.x, player.y, nearest.x, nearest.y, cardColor);
        events.emit('PLAY_SOUND', 'hit');
        return true;
      } else {
        // No enemy in range — dash toward cursor, no invincibility cost
        const dx = inputPos.x - player.x, dy = inputPos.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
          this.particles.spawnBurst(player.x, player.y, cardColor);
          player.x += (dx / dist) * Math.min(dist, 140);
          player.y += (dy / dist) * Math.min(dist, 140);
          player.dodging = true;
          player.dodgeTimer = 0.12;
          player.dodgeCooldown = Math.max(player.dodgeCooldown, 0.12);
        }
        events.emit('PLAY_SOUND', 'dodge');
        return true;
      }
    }

    // ── PROJECTILE (radial AoE) ──
    if (cardDef.type === 'projectile') {
      const dmg = Math.round(cardDef.damage * dmgMult);
      this.particles.spawnRing(player.x, player.y, cardDef.range, cardColor);

      // War Cry: stagger all + player speed boost, no damage
      if (cardDef.warCry) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - player.x, dy = e.y - player.y;
          if (dx * dx + dy * dy < (cardDef.range + e.r) * (cardDef.range + e.r)) {
            e.stagger(1.2);
          }
        }
        player.speedBoostTimer = 1.5;
        player.speedBoostMult = 1.2;
        this.particles.spawnBurst(player.x, player.y, '#ffaa22');
        events.emit('PLAY_SOUND', 'heavyHit');
        return true;
      }

      // Resonant Pulse: double dmg at Tempo ±band of 50 (BUG-03: uses resonanceBand() not hardcoded 5)
      let projDmg = dmg;
      if (cardDef.resonantPulse && Math.abs(this.tempo.value - 50) <= this.tempo.resonanceBand()) {
        projDmg = dmg * 2;
        this.particles.spawnDamageNumber(player.x, player.y - 30, 'RESONANCE!');
      }

      let hitAny = false;
      let hitCount = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < (cardDef.range + e.r) * (cardDef.range + e.r)) {
          this.applyDamageToEnemy(e, projDmg);
          hitAny = true;
          hitCount++;
          // Knockback
          if (cardDef.knockback && e.alive) {
            const dist = Math.sqrt(dist2) || 1;
            e.x += (dx / dist) * cardDef.knockback;
            e.y += (dy / dist) * cardDef.knockback;
          }
          // Soul drain: steal tempo per enemy
          if (cardDef.tempoSteal) {
            this.tempo._add(cardDef.tempoSteal);
          }
          // Stagger for stagger cards
          if (cardDef.id === 'frost_nova' || cardDef.id === 'iron_wall' ||
              cardDef.id === 'thunder_clap' || cardDef.id === 'cold_wave' || cardDef.id === 'war_cry') {
            const staggerDur = cardDef.id === 'iron_wall' ? 1.5 : (cardDef.id === 'cold_wave' ? 0.8 : 1.0);
            if (e.alive) e.stagger(staggerDur);
          }
        }
      }

      // Glacial Press: in COLD zone, apply extra freeze + heal
      if (cardDef.coldHeal && this.tempo.value < 30) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - player.x, dy = e.y - player.y;
          if (dx*dx + dy*dy < (cardDef.range + e.r) * (cardDef.range + e.r)) {
            if (e.alive && cardDef.coldStagger) e.stagger(cardDef.coldStagger);
          }
        }
        player.heal(cardDef.coldHeal);
        this.particles.spawnDamageNumber(player.x, player.y - 30, 'COLD BLESSING!');
      }

      // Also do stagger for frost_nova etc if not already done above
      if ((cardDef.id === 'frost_nova' || cardDef.id === 'iron_wall' || cardDef.id === 'thunder_clap' || cardDef.id === 'cold_wave') && !hitAny) {
        // already handled above in loop
      }

      // Leech: heal based on enemies hit
      if (cardDef.leech && hitCount > 0) {
        const healAmt = Math.min(hitCount, 2);
        player.heal(healAmt);
        this.particles.spawnDamageNumber(player.x, player.y - 30, `+${healAmt} HP`);
      }

      // Last Stand: if killed all, restore 2 HP
      if (cardDef.lastStand) {
        const remaining = this.enemies.filter(e => e.alive);
        if (remaining.length === 0) {
          player.heal(2);
          this.particles.spawnDamageNumber(player.x, player.y - 30, '+2 HP');
        }
      }

      events.emit('PLAY_SOUND', 'heavyHit');
      if (hitAny) events.emit('SCREEN_SHAKE', { duration: 0.1, intensity: 0.2 });
      return true;
    }

    // ── SHOT (fires real projectiles toward cursor) ──
    if (cardDef.type === 'shot') {
      if (!this.projectiles) return false;
      const dx = inputPos.x - player.x, dy = inputPos.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / dist, dirY = dy / dist;
      const dmg = Math.round(cardDef.damage * dmgMult);
      const speed = cardDef.shotSpeed || 420;
      const count = cardDef.shotCount || 1;
      const spread = cardDef.shotSpread || 0;
      const col = cardDef.color || '#88ffdd';

      const freezes = cardDef.freezes || false;
      const meta = {
        ricochetBounces: cardDef.ricochetBounces || 0,
        clusterAoE: cardDef.clusterAoE || 0,
        executeLowShot: cardDef.executeLowShot || 0,
        piercingShot: cardDef.piercingShot || false,
      };

      const life = cardDef.range / speed;

      if (count === 1) {
        this.projectiles.spawn(player.x, player.y, dirX, dirY, speed, dmg, col, 'player', freezes, life, meta);
      } else {
        this.projectiles.spawnSpread(player.x, player.y, inputPos.x, inputPos.y, count, spread, speed, dmg, col, 'player', freezes, life);
      }

      // Visual feedback — small muzzle burst
      this.particles.spawnBurst(player.x, player.y, col);
      events.emit('PLAY_SOUND', 'hit');
      return true;
    }

    // ── BEAM ──
    if (cardDef.type === 'beam') {
      return this._executeBeam(player, cardDef, inputPos, dmgMult, cardColor);
    }

    // ── TRAP ──
    if (cardDef.type === 'trap') {
      const tx = inputPos.x, ty = inputPos.y;
      events.emit('SPAWN_TRAP', {
        x: tx, y: ty,
        radius: cardDef.trapRadius || 35,
        damage: Math.round(cardDef.damage * dmgMult),
        stagger: cardDef.trapStagger || 0,
        freeze: cardDef.trapFreeze || 0,
        aoe: cardDef.trapAoE || 0,
        volatile: cardDef.trapVolatile || false,
        life: cardDef.trapLife || 6.0,
        color: cardColor,
        def: cardDef,
      });
      this.particles.spawnRing(tx, ty, (cardDef.trapRadius || 35) + 8, cardColor);
      this.particles.spawnDamageNumber(tx, ty - 20, 'TRAP');
      events.emit('PLAY_SOUND', 'hit');
      return true;
    }

    // ── ORBIT ──
    if (cardDef.type === 'orbit') {
      events.emit('SPAWN_ORBS', {
        count: cardDef.orbCount || 3,
        radius: cardDef.orbRadius || 80,
        damage: Math.round(cardDef.damage * dmgMult),
        life: cardDef.orbLife || 3.0,
        speed: cardDef.orbSpeed || 2.5,
        color: cardColor,
        freeze: cardDef.orbFreeze || 0,
        spiral: cardDef.orbSpiral || false,
      });
      this.particles.spawnRing(player.x, player.y, cardDef.orbRadius || 80, cardColor);
      events.emit('PLAY_SOUND', 'hit');
      return true;
    }

    // ── CHANNEL ──
    if (cardDef.type === 'channel') {
      events.emit('START_CHANNEL', {
        def: cardDef,
        dmgMult,
        playerRef: player,
      });
      this.particles.spawnBurst(player.x, player.y, cardColor);
      events.emit('PLAY_SOUND', 'hit');
      return true;
    }

    // ── SIGIL ──
    if (cardDef.type === 'sigil') {
      events.emit('SPAWN_SIGIL', {
        x: player.x, y: player.y,
        def: cardDef,
        dmg: Math.round((cardDef.damage || 0) * dmgMult),
      });
      this.particles.spawnRing(player.x, player.y, 45, cardColor);
      this.particles.spawnDamageNumber(player.x, player.y - 25, 'SIGIL');
      events.emit('PLAY_SOUND', 'hit');
      return true;
    }

    // ── ECHO ──
    if (cardDef.type === 'echo') {
      events.emit('SPAWN_ECHO', {
        x: player.x, y: player.y,
        inputX: inputPos.x, inputY: inputPos.y,
        def: cardDef,
        dmg: Math.round(cardDef.damage * dmgMult),
        delay: cardDef.echoDelay || 0.7,
      });
      this.particles.spawnBurst(player.x, player.y, cardColor + '88');
      events.emit('PLAY_SOUND', 'dodge');
      return true;
    }

    // ── GROUND ──
    if (cardDef.type === 'ground') {
      const gdx = inputPos.x - player.x, gdy = inputPos.y - player.y;
      const glen = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
      events.emit('SPAWN_GROUND_WAVE', {
        x: player.x, y: player.y,
        dx: gdx / glen, dy: gdy / glen,
        def: cardDef,
        dmg: Math.round(cardDef.damage * dmgMult),
        length: cardDef.range || 500,
      });
      this.particles.spawnBurst(player.x, player.y, cardColor);
      events.emit('PLAY_SOUND', 'heavyHit');
      return true;
    }

    // ── COUNTER ──
    if (cardDef.type === 'counter') {
      player.parryWindow = {
        timer: cardDef.parryWindow || 0.5,
        maxTimer: cardDef.parryWindow || 0.5,
        power: cardDef.counterDmg || 35,
        def: cardDef,
      };
      this.particles.spawnRing(player.x, player.y, 55, cardColor);
      this.particles.spawnDamageNumber(player.x, player.y - 30, 'PARRY!');
      events.emit('PLAY_SOUND', 'perfect');
      return true;
    }

    // ── STANCE ──
    if (cardDef.type === 'stance') {
      const newStance = (player.stance === cardDef.stanceId) ? null : cardDef.stanceId;
      player.stance = newStance;
      this.particles.spawnRing(player.x, player.y, 60, cardColor);
      this.particles.spawnDamageNumber(player.x, player.y - 30,
        newStance ? `[${cardDef.stanceId.replace('_', ' ').toUpperCase()}]` : '[NEUTRAL]');
      events.emit('PLAY_SOUND', 'itemPickup');
      return true;
    }

    // ── UTILITY ──
    if (cardDef.type === 'utility') {
      if (cardDef.id === 'second_wind') {
        player.heal(1);
        this.particles.spawnDamageNumber(player.x, player.y - 30, '+1 HP');
        events.emit('PLAY_SOUND', 'itemPickup');
      } else if (cardDef.id === 'adrenaline') {
        // tempo shift already applied above
        this.particles.spawnRing(player.x, player.y, 60, '#ffff44');
        events.emit('PLAY_SOUND', 'hit');
      } else if (cardDef.id === 'smoke_screen') {
        player.dodging = true;
        player.dodgeTimer = 0.8;
        player.dodgeCooldown = 0.8;
        this.particles.spawnBurst(player.x, player.y, '#aaaaaa');
        events.emit('PLAY_SOUND', 'dodge');
      } else if (cardDef.markForDeath) {
        // Mark nearest enemy in range
        const _markRange = cardDef.range;
        let nearest = null, nearestDist = Infinity;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - player.x, dy = e.y - player.y;
          const d2 = dx * dx + dy * dy;
          const threshold = _markRange + e.r;
          if (d2 < threshold * threshold && d2 < nearestDist) { nearest = e; nearestDist = d2; }
        }
        if (nearest) {
          nearest.markedTimer = 4.0;
          this.particles.spawnDamageNumber(nearest.x, nearest.y - 30, 'DOOMED');
          events.emit('PLAY_SOUND', 'hit');
        } else {
          events.emit('PLAY_SOUND', 'miss');
        }
      }
      return true;
    }

    return false;
  }

  _executeBeam(player, cardDef, inputPos, dmgMult, cardColor) {
    const px = player.x, py = player.y;
    const dx = inputPos.x - px, dy = inputPos.y - py;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;
    const beamWidth = cardDef.beamWidth || 8;

    // For tempo_blade: damage = current Tempo value
    const dmg = cardDef.tempoBlade
      ? Math.round(this.tempo.value)
      : Math.round(cardDef.damage * dmgMult);

    // Collect enemies along the beam, sorted by distance
    const hitList = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = e.x - px, ey = e.y - py;
      const proj = ex * nx + ey * ny;
      if (proj < 0) continue;
      const perpDist = Math.abs(ex * ny - ey * nx);
      if (perpDist < e.r + beamWidth) hitList.push({ e, proj });
    }
    hitList.sort((a, b) => a.proj - b.proj);

    let hitAny = false;
    for (const { e } of hitList) {
      this.applyDamageToEnemy(e, dmg);
      if (cardDef.nullRay && e.alive) {
        e.state = 'chase';
        e.telegraphTimer = 0;
        this.particles.spawnDamageNumber(e.x, e.y - 20, 'SILENCE!');
      }
      if (cardDef.coldBeam && e.alive) e.stagger(1.5);
      hitAny = true;
      if (!cardDef.beamPierce) break;
    }

    // Visual: beam line flash via particles
    events.emit('SPAWN_BEAM_FLASH', {
      x1: px, y1: py,
      x2: px + nx * 900, y2: py + ny * 900,
      color: cardColor, width: beamWidth
    });

    if (hitAny) {
      events.emit('SCREEN_SHAKE', { duration: 0.1, intensity: 0.15 });
      events.emit('PLAY_SOUND', 'hit');
    } else {
      events.emit('PLAY_SOUND', 'miss');
    }
    return true;
  }

  // Mirror Strike: hit in all 4 cardinal directions
  _mirrorStrike(player, cardDef, dmgMult, cardColor) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const dmg = Math.round(cardDef.damage * dmgMult);
    let hitAny = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      if (dx*dx+dy*dy < (cardDef.range + e.r) * (cardDef.range + e.r)) {
        this.applyDamageToEnemy(e, dmg);
        hitAny = true;
      }
    }
    for (const [cx, cy] of dirs) {
      this.particles.spawnSlash(player.x, player.y, player.x + cx*cardDef.range, player.y + cy*cardDef.range, cardColor);
    }
    if (hitAny) {
      events.emit('SCREEN_SHAKE', { duration: 0.12, intensity: 0.25 });
      events.emit('PLAY_SOUND', 'heavyHit');
    } else {
      events.emit('PLAY_SOUND', 'miss');
    }
    return true;
  }

  // Critical-state pierce: melee hits ALL enemies in range
  _meleePierce(player, cardDef, dmgMult, cardColor) {
    const dmg = Math.round(cardDef.damage * dmgMult);
    let hitAny = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      const threshold = cardDef.range + e.r;
      if (dx * dx + dy * dy < threshold * threshold) {
        this.applyDamageToEnemy(e, dmg);
        this.particles.spawnSlash(player.x, player.y, e.x, e.y, cardColor);
        hitAny = true;
      }
    }
    if (hitAny) {
      events.emit('SCREEN_SHAKE', { duration: 0.15, intensity: 0.35 });
      events.emit('PLAY_SOUND', 'heavyHit');
      this.particles.spawnRing(player.x, player.y, cardDef.range, '#ff3333');
    } else {
      this.particles.spawnRing(player.x, player.y, cardDef.range, 'rgba(255,100,100,0.3)');
      events.emit('PLAY_SOUND', 'miss');
    }
    return true;
  }

  // Synergy multiplier: bonus damage when this card type follows a good previous type.
  _getSynergyMult(prevType, curType) {
    if (!prevType) return 1.0;
    const key = `${prevType}+${curType}`;
    const table = {
      'stance+melee': 1.4, 'stance+cleave': 1.4, 'stance+dash': 1.35,
      'dash+melee': 1.3, 'melee+dash': 1.25,
      'shot+shot': 1.2, 'projectile+shot': 1.2, 'shot+projectile': 1.2,
      'counter+melee': 1.4, 'counter+dash': 1.35,
      'utility+melee': 1.2, 'utility+dash': 1.2, 'utility+shot': 1.2,
    };
    const mult = table[key] || 1.0;
    if (mult > 1.0) {
      this.particles.spawnDamageNumber(
        this.player ? this.player.x : 0,
        this.player ? this.player.y - 44 : 0,
        'SYNERGY!'
      );
    }
    return mult;
  }

  // Hot state dash-attack: dodge INTO enemy = contact damage
  checkDashAttack(player, tempoValue) {
    if (!player.dodging || tempoValue < 70) return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      const threshold = player.r + e.r + 12;
      if (dx * dx + dy * dy < threshold * threshold) {
        const dmg = Math.round(8 * this.tempo.damageMultiplier());
        this.applyDamageToEnemy(e, dmg);
        this.particles.spawnBurst(e.x, e.y, '#ff8800');
        events.emit('PLAY_SOUND', 'hit');
        break; // Only hit one enemy per dash
      }
    }
  }

  drawRangeIndicator(ctx, player, hand, cardDefs, selectedCardSlot) {
    if (!player) return;
    let ranges = [];
    const selectedCardId = hand[selectedCardSlot];
    
    for (let cardId of hand) {
      if (!cardId) continue;
      const def = cardDefs[cardId];
      if (!def) continue;
      const existing = ranges.find(r => r.range === def.range);
      if (!existing) {
        ranges.push({ range: def.range, color: def.color || '#ffffff', name: def.name, isSelected: cardId === selectedCardId });
      } else if (cardId === selectedCardId) {
        existing.isSelected = true;
      }
    }
    ranges.sort((a, b) => a.range - b.range);

    ctx.save();
    ctx.setLineDash([]);
    for (const r of ranges) {
      if (r.isSelected) {
        // Layered alpha rings — no shadowBlur (avoids expensive per-frame Gaussian blur)
        const glowWidths = [[12, '12'], [6, '30'], [2, 'cc']];
        for (const [lw, hex] of glowWidths) {
          ctx.strokeStyle = r.color + hex;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.arc(player.x, player.y, r.range, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Very faint fill
        ctx.fillStyle = r.color + '09';
        ctx.beginPath();
        ctx.arc(player.x, player.y, r.range, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.setLineDash([4, 8]);
        ctx.strokeStyle = r.color + '33';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(player.x, player.y, r.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  drawReticles(ctx, hand, cardDefs, now) {
    if (!this.enemies || !this.player) return;

    let maxRange = 0;
    for (let cardId of hand) {
      if (!cardId) continue;
      const def = cardDefs[cardId];
      if (def && def.range > maxRange) maxRange = def.range;
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      const threshold = maxRange + e.r;
      if (dx * dx + dy * dy < threshold * threshold) {
        const t = now / 400;
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 8, t, t + Math.PI * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 8, t + Math.PI, t + Math.PI * 1.5);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 80, 80, 0.6)';
        ctx.beginPath();
        const py = e.y - e.r - 22;
        ctx.moveTo(e.x, py - 4);
        ctx.lineTo(e.x + 4, py);
        ctx.lineTo(e.x, py + 4);
        ctx.lineTo(e.x - 4, py);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}
