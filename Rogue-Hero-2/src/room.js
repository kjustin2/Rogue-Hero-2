export class RoomManager {
  constructor(canvasWidth, canvasHeight) {
    this.w = canvasWidth;
    this.h = canvasHeight;
    this.WALL = 64;
    this.FLOOR_X1 = this.WALL;
    this.FLOOR_Y1 = this.WALL;
    this.FLOOR_X2 = this.w - this.WALL;
    this.FLOOR_Y2 = this.h - this.WALL;
    this._gridCache = null;
    this.pillars = [];
    this.variant = 'standard'; // standard, pillars, arena, corridor
    this.theme = 0;
  }

  // Generate room variant — called before each combat
  generateVariant(floor, rng) {
    this.pillars = [];
    this._gridCache = null; // Force redraw

    const r = rng ? rng() : Math.random();
    if (r < 0.3)      this.variant = 'standard';
    else if (r < 0.55) this.variant = 'pillars';
    else if (r < 0.75) this.variant = 'arena';
    else               this.variant = 'corridor';

    this.theme = floor % 3;

    const fw = this.FLOOR_X2 - this.FLOOR_X1;
    const fh = this.FLOOR_Y2 - this.FLOOR_Y1;

    if (this.variant === 'pillars') {
      // 2-4 random pillars with gap enforcement (min 90px between pillars)
      const count = 2 + Math.floor((rng ? rng() : Math.random()) * 3);
      const MIN_GAP = 90;
      for (let i = 0; i < count; i++) {
        let attempts = 0, placed = false;
        while (attempts < 20 && !placed) {
          attempts++;
          const pw = 30 + Math.floor((rng ? rng() : Math.random()) * 35);
          const ph = 30 + Math.floor((rng ? rng() : Math.random()) * 35);
          const px = this.FLOOR_X1 + 60 + Math.floor((rng ? rng() : Math.random()) * (fw - 120 - pw));
          const py = this.FLOOR_Y1 + 60 + Math.floor((rng ? rng() : Math.random()) * (fh - 120 - ph));
          // Check gap against existing pillars
          let tooClose = false;
          for (const ep of this.pillars) {
            const gapX = Math.max(0, Math.max(ep.x, px) - Math.min(ep.x + ep.w, px + pw));
            const gapY = Math.max(0, Math.max(ep.y, py) - Math.min(ep.y + ep.h, py + ph));
            if (gapX < MIN_GAP && gapY < MIN_GAP) { tooClose = true; break; }
          }
          if (!tooClose) { this.pillars.push({ x: px, y: py, w: pw, h: ph }); placed = true; }
        }
      }
    } else if (this.variant === 'arena') {
      // Four corner pillars
      const ps = 35;
      const margin = 100;
      this.pillars.push({ x: this.FLOOR_X1 + margin, y: this.FLOOR_Y1 + margin, w: ps, h: ps });
      this.pillars.push({ x: this.FLOOR_X2 - margin - ps, y: this.FLOOR_Y1 + margin, w: ps, h: ps });
      this.pillars.push({ x: this.FLOOR_X1 + margin, y: this.FLOOR_Y2 - margin - ps, w: ps, h: ps });
      this.pillars.push({ x: this.FLOOR_X2 - margin - ps, y: this.FLOOR_Y2 - margin - ps, w: ps, h: ps });
    } else if (this.variant === 'corridor') {
      // Two shorter walls with wide center gaps — enemies can navigate through
      const wallH = 20;
      const gapW = 220; // wide gap so enemies can always path through
      const topY = this.FLOOR_Y1 + Math.floor(fh * 0.33);
      const botY = this.FLOOR_Y1 + Math.floor(fh * 0.63);
      const wallW = Math.floor(fw * 0.28); // each wall segment is 28% of floor width
      const margin = Math.floor(fw * 0.06); // small margin from edges

      // Top wall: left segment + right segment, gap in center-left area
      const topGapX = this.FLOOR_X1 + margin + wallW;
      this.pillars.push({ x: this.FLOOR_X1 + margin, y: topY, w: wallW, h: wallH });
      this.pillars.push({ x: topGapX + gapW, y: topY, w: wallW, h: wallH });

      // Bottom wall: offset gap position for variety
      const botGapX = this.FLOOR_X1 + margin + Math.floor(wallW * 0.4);
      this.pillars.push({ x: this.FLOOR_X1 + margin, y: botY, w: Math.floor(wallW * 0.4), h: wallH });
      this.pillars.push({ x: botGapX + gapW, y: botY, w: wallW, h: wallH });
    }
  }

  clamp(x, y, r) {
    let nx = Math.max(this.FLOOR_X1 + r, Math.min(this.FLOOR_X2 - r, x));
    let ny = Math.max(this.FLOOR_Y1 + r, Math.min(this.FLOOR_Y2 - r, y));

    // Pillar collision — push out
    for (const p of this.pillars) {
      if (nx + r > p.x && nx - r < p.x + p.w && ny + r > p.y && ny - r < p.y + p.h) {
        const overlapLeft   = (nx + r) - p.x;
        const overlapRight  = (p.x + p.w) - (nx - r);
        const overlapTop    = (ny + r) - p.y;
        const overlapBottom = (p.y + p.h) - (ny - r);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft)       nx = p.x - r;
        else if (minOverlap === overlapRight) nx = p.x + p.w + r;
        else if (minOverlap === overlapTop)   ny = p.y - r;
        else                                  ny = p.y + p.h + r;
      }
    }

    return { x: nx, y: ny };
  }

  _getThemeColors() {
    // RH2: prefer biome palette when set; falls back to legacy theme rotation.
    if (this.biome && this.biome.palette) {
      const p = this.biome.palette;
      // Background = darker than floor; pillarStroke = brighter accent variant
      const bg = this._darker(p.floor, 0.55);
      return {
        bg,
        floor: p.floor,
        grid: p.grid,
        pillar: p.pillar,
        pillarStroke: p.accent,
        accent: p.accent,
      };
    }
    if (this.theme === 1) return { bg: '#1a1820', floor: '#12110e', grid: 'rgba(255,200,100,0.025)', pillar: '#332a1e', pillarStroke: '#554422' };
    if (this.theme === 2) return { bg: '#1a1424', floor: '#0e0a14', grid: 'rgba(180,100,255,0.025)', pillar: '#2a1e33', pillarStroke: '#442255' };
    return { bg: '#1a1a24', floor: '#0e0e14', grid: 'rgba(255,255,255,0.03)', pillar: '#222233', pillarStroke: '#334455' };
  }

  _darker(hex, k) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    const r = Math.max(0, Math.floor(((v >> 16) & 0xff) * k));
    const g = Math.max(0, Math.floor(((v >>  8) & 0xff) * k));
    const b = Math.max(0, Math.floor((v        & 0xff) * k));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  _buildGridCache() {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d');
    const tc = this._getThemeColors();

    const fw = this.FLOOR_X2 - this.FLOOR_X1;
    const fh = this.FLOOR_Y2 - this.FLOOR_Y1;
    const cx = this.FLOOR_X1 + fw / 2;
    const cy = this.FLOOR_Y1 + fh / 2;

    ctx.fillStyle = tc.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(fw, fh) * 0.7);
    grad.addColorStop(0, tc.bg);
    grad.addColorStop(1, tc.floor);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 30;
    ctx.fillRect(this.FLOOR_X1, this.FLOOR_Y1, fw, fh);
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 1;
    const CELL_SIZE = 64;
    for (let x = this.FLOOR_X1; x <= this.FLOOR_X2; x += CELL_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, this.FLOOR_Y1); ctx.lineTo(x, this.FLOOR_Y2); ctx.stroke();
    }
    for (let y = this.FLOOR_Y1; y <= this.FLOOR_Y2; y += CELL_SIZE) {
      ctx.beginPath(); ctx.moveTo(this.FLOOR_X1, y); ctx.lineTo(this.FLOOR_X2, y); ctx.stroke();
    }

    // Floor variation: scorch/dirt marks (seeded by variant + pillar count)
    {
      const seed0 = (this.variant.charCodeAt(0) * 31 + this.pillars.length * 7 + 1) | 0;
      const numMarks = 5 + (seed0 % 5);
      for (let m = 0; m < numMarks; m++) {
        // LCG-style hash per mark — no Math.random so cache stays deterministic
        const s1 = ((seed0 * 1664525 + 1013904223 + m * 22695477) >>> 0);
        const s2 = ((s1   * 1664525 + 1013904223) >>> 0);
        const s3 = ((s2   * 1664525 + 1013904223) >>> 0);
        const mx2 = this.FLOOR_X1 + 20 + (s1 % (fw - 40));
        const my2 = this.FLOOR_Y1 + 20 + (s2 % (fh - 40));
        const mr  = 10 + (s3 % 28);
        ctx.beginPath();
        ctx.arc(mx2, my2, mr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fill();
      }
    }

    // Pillar drop shadows (drawn before the pillar bodies)
    const shadowOff = 9;
    for (const p of this.pillars) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(p.x + shadowOff, p.y + shadowOff, p.w, p.h);
    }

    // Draw pillars with vertical detail line for depth
    for (const p of this.pillars) {
      ctx.fillStyle = tc.pillar;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = tc.pillarStroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      // Inner highlight + shadow (free since cached)
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + 2, p.y + 2); ctx.lineTo(p.x + p.w - 2, p.y + 2);
      ctx.moveTo(p.x + 2, p.y + 2); ctx.lineTo(p.x + 2, p.y + p.h - 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.moveTo(p.x + p.w - 1, p.y + 4); ctx.lineTo(p.x + p.w - 1, p.y + p.h - 1);
      ctx.moveTo(p.x + 4, p.y + p.h - 1); ctx.lineTo(p.x + p.w - 1, p.y + p.h - 1);
      ctx.stroke();
    }

    // ── Floor crack patterns — seeded, scattered hairlines for texture ──
    {
      const seedCk = ((this.variant.charCodeAt(0) || 1) * 53 + 17) | 0;
      const numCracks = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < numCracks; i++) {
        const s1 = ((seedCk * 1664525 + 1013904223 + i * 22695477) >>> 0);
        const s2 = ((s1 * 1664525 + 1013904223) >>> 0);
        const s3 = ((s2 * 1664525 + 1013904223) >>> 0);
        const cx0 = this.FLOOR_X1 + 30 + (s1 % (fw - 60));
        const cy0 = this.FLOOR_Y1 + 30 + (s2 % (fh - 60));
        const len = 14 + (s3 % 30);
        const ang = ((s1 ^ s2) % 360) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx0 + Math.cos(ang) * len, cy0 + Math.sin(ang) * len);
        // Branching mini-line
        const ang2 = ang + 0.6;
        ctx.moveTo(cx0 + Math.cos(ang) * len * 0.5, cy0 + Math.sin(ang) * len * 0.5);
        ctx.lineTo(cx0 + Math.cos(ang) * len * 0.5 + Math.cos(ang2) * len * 0.4,
                   cy0 + Math.sin(ang) * len * 0.5 + Math.sin(ang2) * len * 0.4);
        ctx.stroke();
      }
    }

    // ── Wall edge lighting — subtle gradient on wall borders ──
    {
      const wallAlpha = 0.18;
      const lg = ctx.createLinearGradient(0, this.FLOOR_Y1, 0, this.FLOOR_Y1 + 20);
      lg.addColorStop(0, `rgba(255,255,255,${wallAlpha})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(this.FLOOR_X1, this.FLOOR_Y1, fw, 20);

      const lg2 = ctx.createLinearGradient(0, this.FLOOR_Y2 - 20, 0, this.FLOOR_Y2);
      lg2.addColorStop(0, 'rgba(0,0,0,0)');
      lg2.addColorStop(1, 'rgba(0,0,0,0.30)');
      ctx.fillStyle = lg2;
      ctx.fillRect(this.FLOOR_X1, this.FLOOR_Y2 - 20, fw, 20);
    }

    this._gridCache = canvas;
  }

  // Visual refresh #7: parallax the floor grid against foreground shake so
  // heavy hits punch harder. Renderer.beginShakeScope() has already translated
  // the whole canvas by (shakeX, shakeY); drawing the grid at the inverse of
  // 0.6× that offset cancels most of the translation, leaving the grid to
  // move at 0.4× the foreground. parallaxShakeX/Y default to 0 so callers
  // that don't pass shake (map/menus) get unchanged behavior.
  draw(ctx, parallaxShakeX = 0, parallaxShakeY = 0) {
    if (!this._gridCache) this._buildGridCache();
    ctx.drawImage(this._gridCache, -parallaxShakeX * 0.6, -parallaxShakeY * 0.6);
  }
}
