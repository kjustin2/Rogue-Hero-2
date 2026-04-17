import { events } from './EventBus.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Camera shake
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeElapsed = 0;

    // Cached overlay canvases (rebuilt on resize)
    this._scanlineCanvas = null;
    this._vignetteCanvas = null;

    // Off-screen buffer for bloom pass
    this._bloomCanvas = null;
    this._bloomCtx = null;

    // Chromatic-aberration edge flash
    this.caTimer = 0;
    this._caMaxTime = 0.14;

    // Listen for shake events
    events.on('SCREEN_SHAKE', ({ duration, intensity }) => {
      this.shakeDuration = Math.max(this.shakeDuration - this.shakeElapsed, duration);
      this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
      this.shakeElapsed = 0;
    });
  }

  updateShake(dt) {
    if (this.shakeElapsed < this.shakeDuration) {
      this.shakeElapsed += dt;
      const decay = 1 - this.shakeElapsed / this.shakeDuration;
      this.shakeOffsetX = (Math.random() * 2 - 1) * this.shakeIntensity * decay * 14;
      this.shakeOffsetY = (Math.random() * 2 - 1) * this.shakeIntensity * decay * 14;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeIntensity = 0;
    }
  }

  // Trigger brief edge CA flash — call on crashes or heavy hits
  triggerCA() {
    this.caTimer = this._caMaxTime;
  }

  updateCA(dt) {
    if (this.caTimer > 0) this.caTimer = Math.max(0, this.caTimer - dt);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  beginShakeScope() {
    this.ctx.save();
    this.ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
  }

  endShakeScope() {
    this.ctx.restore();
  }

  // ── Cached scanline overlay ────────────────────────────────────
  _buildScanlines() {
    const off = document.createElement('canvas');
    off.width = this.width; off.height = this.height;
    const ctx = off.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = 1; y < this.height; y += 3) ctx.fillRect(0, y, this.width, 1);
    this._scanlineCanvas = off;
  }

  drawScanlines() {
    if (!this._scanlineCanvas || this._scanlineCanvas.width !== this.width) this._buildScanlines();
    this.ctx.drawImage(this._scanlineCanvas, 0, 0);
  }

  // ── Cached screen vignette ────────────────────────────────────
  _buildVignette() {
    const off = document.createElement('canvas');
    off.width = this.width; off.height = this.height;
    const ctx = off.getContext('2d');
    const cx = this.width / 2, cy = this.height / 2;
    const grad = ctx.createRadialGradient(cx, cy, this.height * 0.28, cx, cy, this.height * 0.82);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
    this._vignetteCanvas = off;
  }

  drawVignette() {
    if (!this._vignetteCanvas || this._vignetteCanvas.width !== this.width) this._buildVignette();
    this.ctx.drawImage(this._vignetteCanvas, 0, 0);
  }

  // ── Bloom post-processing — call after scene is fully rendered ─
  applyBloom() {
    if (!this._bloomCanvas || this._bloomCanvas.width !== this.width || this._bloomCanvas.height !== this.height) {
      this._bloomCanvas = document.createElement('canvas');
      this._bloomCanvas.width = this.width;
      this._bloomCanvas.height = this.height;
      this._bloomCtx = this._bloomCanvas.getContext('2d');
    }
    this._bloomCtx.clearRect(0, 0, this.width, this.height);
    this._bloomCtx.drawImage(this.canvas, 0, 0);
    this.ctx.save();
    this.ctx.filter = 'blur(10px)';
    this.ctx.globalCompositeOperation = 'lighter';
    this.ctx.globalAlpha = 0.09;
    this.ctx.drawImage(this._bloomCanvas, 0, 0);
    this.ctx.restore();
  }

  // ── Edge chromatic-aberration flash ───────────────────────────
  drawCAFlash() {
    if (this.caTimer <= 0) return;
    const p = this.caTimer / this._caMaxTime;
    const w = this.width, h = this.height;
    this.ctx.save();
    const rg = this.ctx.createLinearGradient(0, 0, w * 0.28, 0);
    rg.addColorStop(0, `rgba(255,0,30,${p * 0.38})`);
    rg.addColorStop(1, 'rgba(255,0,30,0)');
    this.ctx.fillStyle = rg;
    this.ctx.fillRect(0, 0, w, h);
    const bg = this.ctx.createLinearGradient(w * 0.72, 0, w, 0);
    bg.addColorStop(0, 'rgba(0,80,255,0)');
    bg.addColorStop(1, `rgba(0,80,255,${p * 0.38})`);
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();
  }

  // ── Custom crosshair cursor ────────────────────────────────────
  drawCursor(mx, my, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color || '#ffffff';
    ctx.fillStyle   = color || '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.88;
    const s = 9, g = 4;
    ctx.beginPath();
    ctx.moveTo(mx - g - s, my); ctx.lineTo(mx - g, my);
    ctx.moveTo(mx + g,     my); ctx.lineTo(mx + g + s, my);
    ctx.moveTo(mx, my - g - s); ctx.lineTo(mx, my - g);
    ctx.moveTo(mx, my + g);     ctx.lineTo(mx, my + g + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
