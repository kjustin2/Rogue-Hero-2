// Projectile.js — Visible, dodgeable projectiles
import { events } from './EventBus.js';

class Projectile {
  constructor(x, y, dx, dy, speed, damage, color, source, freezes, life, meta) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.speed = speed || 260;
    this.damage = damage || 1;
    this.color = color || '#ff8800';
    this.source = source || 'enemy';
    this.freezes = freezes || false;
    this.r = 5;
    this.alive = true;
    this.life = life || 2.0;
    // Fixed-size ring buffer for trail — slots are real objects updated in-place (no per-frame allocation)
    this.trail = [{ x, y }, { x, y }, { x, y }];
    this._trailIdx = 0;
    this.nearMissTriggered = false;

    // Meta props
    const m = meta || {};
    this.ricochetBounces = m.ricochetBounces || 0;
    this.clusterAoE = m.clusterAoE || 0;
    this.executeLowShot = m.executeLowShot || 0;
    this.pierceCount = m.piercingShot ? 3 : 1;
    this.pierced = 0;
    this.lastHitEnemy = null;
  }
}

export class ProjectileManager {
  constructor() {
    this.projectiles = [];
  }

  spawn(x, y, dx, dy, speed, damage, color, source, freezes, life, meta) {
    this.projectiles.push(new Projectile(x, y, dx, dy, speed, damage, color, source, freezes, life, meta));
  }

  spawnSpread(x, y, targetX, targetY, count, spreadAngle, speed, damage, color, source, freezes, life) {
    const baseAngle = Math.atan2(targetY - y, targetX - x);
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i - (count - 1) / 2) * spreadAngle;
      this.spawn(x, y, Math.cos(angle), Math.sin(angle), speed, damage, color, source, freezes, life);
    }
  }

  clear() {
    this.projectiles.length = 0;
  }

  // enemies list must be set for player-shot collision
  setEnemies(enemies) { this._enemies = enemies; }

  update(dt, player, room) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { this._remove(i); continue; }

      // Update trail slot in-place — no allocation
      const ts = p.trail[p._trailIdx];
      ts.x = p.x; ts.y = p.y;
      p._trailIdx = (p._trailIdx + 1) % 3;

      p.x += p.dx * p.speed * dt;
      p.y += p.dy * p.speed * dt;

      // Wall collision
      if (room && (p.x < room.FLOOR_X1 || p.x > room.FLOOR_X2 ||
                   p.y < room.FLOOR_Y1 || p.y > room.FLOOR_Y2)) {
        this._remove(i);
        continue;
      }

      // Pillar collision (if room has pillars)
      if (room && room.pillars) {
        let hitPillar = false;
        for (const pil of room.pillars) {
          if (p.x >= pil.x && p.x <= pil.x + pil.w && p.y >= pil.y && p.y <= pil.y + pil.h) {
            hitPillar = true;
            break;
          }
        }
        if (hitPillar) { this._remove(i); continue; }
      }

      // Player-shot hits enemies
      if (p.source === 'player' && this._enemies) {
        let shouldRemove = false;
        for (const e of this._enemies) {
          if (!e.alive) continue;
          if (e === p.lastHitEnemy) continue; // skip last hit for ricochet
          const dx = p.x - e.x, dy = p.y - e.y;
          if (dx * dx + dy * dy < (p.r + e.r) * (p.r + e.r)) {
            events.emit('PLAYER_SHOT_HIT', {
              enemy: e,
              damage: p.damage,
              freeze: p.freezes,
              clusterAoE: p.clusterAoE,
              executeLowShot: p.executeLowShot,
              hitX: p.x,
              hitY: p.y,
            });
            p.lastHitEnemy = e;

            // Ricochet: redirect to nearest other enemy
            if (p.ricochetBounces > 0) {
              let nearest = null, nearestDist = Infinity;
              for (const ne of this._enemies) {
                if (!ne.alive || ne === e) continue;
                const ndx = ne.x - p.x, ndy = ne.y - p.y;
                const nd = ndx * ndx + ndy * ndy;
                if (nd < nearestDist) { nearestDist = nd; nearest = ne; }
              }
              if (nearest) {
                const rdx = nearest.x - p.x, rdy = nearest.y - p.y;
                const rdist = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
                p.dx = rdx / rdist;
                p.dy = rdy / rdist;
                p.damage = Math.round(p.damage * 0.75);
                p.ricochetBounces--;
                // Ensure enough life to reach nearest
                const travelTime = Math.sqrt(nearestDist) / p.speed;
                p.life = Math.max(p.life, travelTime + 0.1);
                shouldRemove = false;
              } else {
                // No target to bounce to — remove
                shouldRemove = true;
              }
            } else {
              p.pierced++;
              shouldRemove = p.pierced >= p.pierceCount;
            }
            break;
          }
        }
        if (shouldRemove) { this._remove(i); continue; }
      }

      // Enemy/boss projectile hits player (skip if dodging — i-frames)
      if (p.source !== 'player' && player && player.alive && !player.dodging) {
        const dx = p.x - player.x, dy = p.y - player.y;
        if (dx * dx + dy * dy < (p.r + player.r) * (p.r + player.r)) {
          events.emit('ENEMY_MELEE_HIT', { damage: p.damage, source: p });
          this._remove(i);
          continue;
        }
      }

      // Perfect dodge detection — projectile passes through player during i-frames (once per projectile)
      if (player && player.alive && player.dodging && !p.nearMissTriggered) {
        const dx = p.x - player.x, dy = p.y - player.y;
        const threshold = p.r + player.r + 22;
        if (dx * dx + dy * dy < threshold * threshold) {
          p.nearMissTriggered = true;
          events.emit('NEAR_MISS_PROJECTILE', { x: p.x, y: p.y });
        }
      }
    }
  }

  _remove(i) {
    this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
    this.projectiles.pop();
  }

  draw(ctx) {
    for (const p of this.projectiles) {
      // Trail (ring buffer — iterate in insertion order, skip null slots)
      ctx.fillStyle = p.color;
      for (let i = 0; i < 3; i++) {
        const t = p.trail[i];
        const age = ((i - p._trailIdx + 3) % 3) + 1; // 1=newest-1, 3=oldest
        ctx.globalAlpha = (1 - age / 3) * 0.3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, p.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Bullet body
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      // Bright core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
