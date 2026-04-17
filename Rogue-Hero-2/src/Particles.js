// Module-level reusable structures for particle draw batching — avoids per-frame object/array allocation
const _batchGroups = Object.create(null);
const _batchKeys = [];
const PARTICLE_CAP = 400;

// Free-list pool — dead particles are returned here and reused by _pushParticle
// After a short warm-up, zero heap allocations occur for particles
const _particlePool = [];

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.visuals = [];
    this.screenEffects = [];
  }

  _pushParticle(opts) {
    if (this.particles.length >= PARTICLE_CAP) return;
    // Reuse a pooled object if available — avoids heap allocation after warm-up
    const p = _particlePool.length > 0 ? _particlePool.pop() : {};
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx; p.vy = opts.vy;
    p.r = opts.r; p.color = opts.color;
    p.life = opts.life; p.maxLife = opts.maxLife;
    p.drag = opts.drag;
    this.particles.push(p);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        _particlePool.push(p); // return to pool for reuse
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      let t = this.texts[i];
      t.life -= dt;
      t.vy += 70 * dt;
      t.x += (t.vx || 0) * dt;
      t.y += t.vy * dt;
      if (t.life <= 0) {
        this.texts[i] = this.texts[this.texts.length - 1];
        this.texts.pop();
      }
    }

    for (let i = this.visuals.length - 1; i >= 0; i--) {
      let v = this.visuals[i];
      v.life -= dt;
      if (v.life <= 0) {
        this.visuals[i] = this.visuals[this.visuals.length - 1];
        this.visuals.pop();
      }
    }

    for (let i = this.screenEffects.length - 1; i >= 0; i--) {
      let s = this.screenEffects[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.screenEffects[i] = this.screenEffects[this.screenEffects.length - 1];
        this.screenEffects.pop();
      }
    }
  }

  draw(ctx, canvasW, canvasH) {
    // Particles — grouped by (color, alpha-bucket) to batch draw calls.
    // Alpha is rounded to nearest 5% so nearby-lifetime particles share a path.
    if (this.particles.length > 0) {
      // Reset module-level group map (no allocation — just clear counts)
      for (let i = 0; i < _batchKeys.length; i++) _batchGroups[_batchKeys[i]].count = 0;
      _batchKeys.length = 0;

      const cW = canvasW || 9999, cH = canvasH || 9999;
      for (const p of this.particles) {
        if (p.x + p.r < 0 || p.x - p.r > cW || p.y + p.r < 0 || p.y - p.r > cH) continue;
        const alpha = Math.round((p.life / p.maxLife) * 20) / 20; // 0.05 granularity
        const key = p.color + '|' + alpha;
        let g = _batchGroups[key];
        if (!g) {
          g = { color: p.color, alpha, ps: [], count: 0 };
          _batchGroups[key] = g;
        }
        if (g.count === 0) _batchKeys.push(key);
        g.ps[g.count++] = p;
      }
      for (let k = 0; k < _batchKeys.length; k++) {
        const g = _batchGroups[_batchKeys[k]];
        ctx.fillStyle = g.color;
        ctx.globalAlpha = g.alpha;
        ctx.beginPath();
        for (let j = 0; j < g.count; j++) {
          const p = g.ps[j];
          const r = p.r * g.alpha;
          if (r <= 0) continue;
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    // Damage numbers — track last font to skip redundant ctx.font assignments
    // Shadow pass (dark offset) replaces ctx.strokeText to avoid expensive glyph outline computation
    if (this.texts.length > 0) {
      ctx.textAlign = 'center';
      let lastFont = null;
      // Single dark-shadow pass first, then color pass — avoids per-number state toggle
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      for (let i = 0; i < this.texts.length; i++) {
        const t = this.texts[i];
        const alpha = Math.max(0, t.life / t.maxLife);
        ctx.globalAlpha = alpha;
        const font = `bold ${t.size || 16}px monospace`;
        if (font !== lastFont) { ctx.font = font; lastFont = font; }
        ctx.fillText(t.text, t.x + 1, t.y + 1);
      }
      lastFont = null;
      for (let i = 0; i < this.texts.length; i++) {
        const t = this.texts[i];
        const alpha = Math.max(0, t.life / t.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.color;
        const font = `bold ${t.size || 16}px monospace`;
        if (font !== lastFont) { ctx.font = font; lastFont = font; }
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1.0;
    }

    // Visual effects (slashes, rings, crash bursts, perfect dodge)
    for (let i = 0; i < this.visuals.length; i++) {
      const v = this.visuals[i];
      const progress = 1 - (v.life / v.maxLife);
      const alpha = v.life / v.maxLife;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = v.color;

      if (v.type === 'slash') {
        ctx.lineWidth = 18 * (1 - progress);
        ctx.beginPath();
        const dist = 65;
        const cx = v.x + Math.cos(v.angle) * (dist * 0.5);
        const cy = v.y + Math.sin(v.angle) * (dist * 0.5);
        ctx.arc(cx, cy, dist, v.angle - Math.PI / 3, v.angle + Math.PI / 3);
        ctx.stroke();
        ctx.lineWidth = 6 * (1 - progress);
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, dist - 4, v.angle - Math.PI / 4, v.angle + Math.PI / 4);
        ctx.stroke();

      } else if (v.type === 'ring') {
        ctx.lineWidth = 6 * (1 - progress);
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.targetRadius * progress, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = v.color;
        ctx.globalAlpha = alpha * 0.08;
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.targetRadius * progress, 0, Math.PI * 2);
        ctx.fill();

      } else if (v.type === 'crashburst') {
        const r = v.targetRadius * Math.sqrt(progress);
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath();
        ctx.arc(v.x, v.y, Math.max(0, r), 0, Math.PI * 2);
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth = 5 * (1 - progress) + 1;
        ctx.stroke();
        if (progress < 0.25) {
          ctx.globalAlpha = Math.max(0, (0.25 - progress) * 4 * 0.25);
          ctx.fillStyle = '#ff8800';
          ctx.beginPath();
          ctx.arc(v.x, v.y, Math.max(0, r), 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (v.type === 'perfectdodge') {
        ctx.globalAlpha = alpha * 0.75;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 84 * progress, 0, Math.PI * 2);
        ctx.strokeStyle = '#aaddff';
        ctx.lineWidth = 3;
        ctx.stroke();

      } else if (v.type === 'trailparticle') {
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = v.color;
        ctx.fillRect(v.x - 5, v.y - 5, 10, 10);
      }
    }
    ctx.globalAlpha = 1.0;

    // Screen-level effects (kill flash, zone pulse, room clear)
    if (canvasW && canvasH) {
      for (let i = 0; i < this.screenEffects.length; i++) {
        const s = this.screenEffects[i];
        const t = 1 - (s.life / s.maxLife);
        if (s.type === 'killflash') {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.18);
          ctx.fillStyle = s.color;
          ctx.fillRect(0, 0, canvasW, canvasH);

        } else if (s.type === 'zonepulse') {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.25);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 20 * (1 - t);
          ctx.strokeRect(0, 0, canvasW, canvasH);

        } else if (s.type === 'roomclear') {
          const wave = canvasW * t;
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.3);
          const grad = ctx.createLinearGradient(wave - 120, 0, wave, 0);
          grad.addColorStop(0, 'rgba(51,221,102,0)');
          grad.addColorStop(1, 'rgba(51,221,102,1)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, Math.min(wave, canvasW), canvasH);

        } else if (s.type === 'statelabel') {
          const scaleT = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
          const size = Math.round(24 + scaleT * 14);
          ctx.globalAlpha = Math.max(0, scaleT);
          ctx.fillStyle = s.color;
          ctx.font = `bold ${size}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(s.text, canvasW / 2, 110);

        } else if (s.type === 'lastkill') {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.12);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasW, canvasH);

        } else if (s.type === 'crashtext') {
          // Big CRASH! text center-screen with glow
          const scaleT = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
          const size = Math.round(48 + scaleT * 32);
          ctx.globalAlpha = Math.max(0, scaleT * 0.95);
          ctx.save();
          ctx.shadowColor = '#ff4400';
          ctx.shadowBlur = 40;
          ctx.fillStyle = '#ff6600';
          ctx.font = `bold ${size}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('CRASH!', canvasW / 2, canvasH / 2 - 30);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(size * 0.5)}px monospace`;
          ctx.fillText(`${s.dmg} DMG`, canvasW / 2, canvasH / 2 + 20);
          ctx.restore();
        } else if (s.type === 'roomEntryFlash') {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.55);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasW, canvasH);
        } else if (s.type === 'crashFlash') {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.65);
          ctx.fillStyle = '#ff5500';
          ctx.fillRect(0, 0, canvasW, canvasH);
        } else if (s.type === 'coldCrashFlash') {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.7);
          ctx.fillStyle = '#44aaff';
          ctx.fillRect(0, 0, canvasW, canvasH);
        }
      }
      ctx.globalAlpha = 1.0;
    }
  }

  spawnBurst(x, y, color) {
    const count = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      this._pushParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random() * 3,
        color,
        life: 0.25 + Math.random() * 0.2,
        maxLife: 0.45,
        drag: 0.90
      });
    }
  }

  spawnCrashBurst(x, y, radius) {
    this.visuals.push({
      type: 'crashburst', x, y, targetRadius: radius,
      life: 0.4, maxLife: 0.4, color: '#ff4400'
    });
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = radius * (0.4 + Math.random() * 0.6);
      this._pushParticle({
        x, y,
        vx: Math.cos(angle) * dist * 2,
        vy: Math.sin(angle) * dist * 2,
        r: 3 + Math.random() * 5,
        color: '#ff8800',
        life: 0.35, maxLife: 0.4, drag: 0.88
      });
    }
  }

  spawnDamageNumber(x, y, amount) {
    const isText = typeof amount === 'string';
    this.texts.push({
      x: x + (Math.random() * 24 - 12),
      y: y - 10,
      vx: (Math.random() - 0.5) * 40,
      vy: -80,
      text: String(amount),
      color: isText ? '#44ff88' : '#ffffff',
      size: isText ? 14 : 16,
      life: 0.8, maxLife: 0.8
    });
  }

  // Damage type colored numbers
  spawnTypedNumber(x, y, amount, type) {
    const colors = {
      melee: '#ffffff',
      projectile: '#ffaa44',
      crash: '#ff4400',
      cold: '#66ccff',
      hot: '#ff8800',
      critical: '#ff3333',
      heal: '#44ff88',
    };
    this.texts.push({
      x: x + (Math.random() * 24 - 12), y: y - 10,
      vx: (Math.random() - 0.5) * 40, vy: -80,
      text: String(amount),
      color: colors[type] || '#ffffff',
      size: type === 'critical' ? 22 : 16,
      life: 0.8, maxLife: 0.8
    });
  }

  spawnSlash(x, y, targetX, targetY, color) {
    const angle = Math.atan2(targetY - y, targetX - x);
    this.visuals.push({
      type: 'slash', x, y, angle, color,
      life: 0.18, maxLife: 0.18
    });
  }

  spawnRing(x, y, targetRadius, color) {
    this.visuals.push({
      type: 'ring', x, y, targetRadius, color,
      life: 0.3, maxLife: 0.3
    });
  }

  spawnPerfectDodge(x, y) {
    this.visuals.push({ type: 'perfectdodge', x, y, life: 0.32, maxLife: 0.32, color: '#aaddff' });
  }

  spawnTrail(x, y, color) {
    this.visuals.push({ type: 'trailparticle', x, y, life: 0.15, maxLife: 0.15, color });
  }

  // ── SCREEN EFFECTS ──

  spawnKillFlash(color) {
    this.screenEffects.push({ type: 'killflash', life: 0.12, maxLife: 0.12, color: color || '#ffffff' });
  }

  spawnZonePulse(color) {
    this.screenEffects.push({ type: 'zonepulse', life: 0.45, maxLife: 0.45, color });
  }

  spawnStateLabel(text, color) {
    this.screenEffects.push({ type: 'statelabel', life: 0.55, maxLife: 0.55, text, color });
  }

  spawnRoomClear() {
    this.screenEffects.push({ type: 'roomclear', life: 0.7, maxLife: 0.7 });
  }

  spawnLastKill() {
    this.screenEffects.push({ type: 'lastkill', life: 0.2, maxLife: 0.2 });
  }

  spawnCrashText(dmg) {
    this.screenEffects.push({ type: 'crashtext', life: 0.9, maxLife: 0.9, dmg });
  }

  spawnRoomEntryFlash() {
    this.screenEffects.push({ type: 'roomEntryFlash', life: 0.3, maxLife: 0.3 });
  }

  spawnCrashFlash() {
    this.screenEffects.push({ type: 'crashFlash', life: 0.18, maxLife: 0.18 });
  }

  spawnColdCrashFlash() {
    this.screenEffects.push({ type: 'coldCrashFlash', life: 0.35, maxLife: 0.35 });
  }

  spawnOverloaded(x, y) {
    this.texts.push({
      x, y: y - 20,
      vx: 0, vy: -60,
      text: 'OVERLOADED!',
      color: '#ff3333',
      size: 18,
      life: 0.8, maxLife: 0.8
    });
  }

  spawnComboDisplay(count, x, y) {
    if (count < 2) return;
    const label = count >= 3 ? `×${count} COMBO FINISH!` : `×${count} COMBO`;
    const col = count >= 3 ? '#ffaa00' : '#ffffff';
    this.texts.push({
      x, y,
      vx: 0, vy: -50,
      text: label,
      color: col,
      size: count >= 3 ? 22 : 16,
      life: 0.85, maxLife: 0.85
    });
  }
}
