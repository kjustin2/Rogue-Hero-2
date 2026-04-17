import { CardDefinitions } from './DeckManager.js';
import { CosmeticById, CosmeticDefinitions, BOX_TIERS, RARITY_COLORS, RARITY_LABELS, CATEGORY_LABELS, drawPlayerShape, drawPlayerAura, getPrismaticColor } from './Cosmetics.js';

// ── Color Palette ────────────────────────────────────────────────
export const PAL = {
  COLD:       '#4a9eff',
  FLOWING:    '#44dd88',
  HOT:        '#ff8833',
  CRITICAL:   '#ff3333',
  UI_BG:      '#0d0d14',
  UI_PANEL:   '#1a1a2e',
  UI_BORDER:  '#2a2a4a',
  TEXT:       '#e8e8f0',
  MUTED:      '#8888aa',
  GOLD:       '#ffd700',
  RARE:       '#bb44ff',
  UNCOMMON:   '#44dd88',
  COMMON:     '#aaaacc',
  ELITE:      '#ff6644',
};

export class UI {
  constructor(canvas, tempoSystem, player, deckManager, cardDefs) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.tempo = tempoSystem;
    this.player = player;
    this.deckManager = deckManager;
    this.cardDefs = cardDefs;
    this.selectedPrepSlot = 0;
    this.selectedCardSlot = 0;
    this.handBoxes = [];
    this.prepBoxes = [];
    this.statsReturnBox = null;
    this.cosmeticShopBoxes = [];
    this.cosmeticPanelBoxes = [];
    this.itemManager = null;
    this.enemies = null;
    this.runStats = null;
    this._pulseTimer = 0;
    this._bossEnemy = null;
    this._hoveredCard = -1;
    this._mouseX = 0;
    this._mouseY = 0;
    // Gradient caches — rebuilt on resize, reused every frame
    this._tempoGrad = null;
    this._tempoGradX = -1;
    this._tempoGradW = -1;
    this._vigGrads = null;   // { cold, hot, critical } — one CanvasGradient per zone
    this._vigGradW = 0;
    this._vigGradH = 0;
    // Tempo value string cache — only rebuild when the integer value changes
    this._lastTempoInt = -1;
    this._lastTempoStr = '';
    // Inventory overlay (map screen)
    this.showInventory = false;
    // Prep screen: card selected from collection waiting to be slotted
    this.prepPendingCard = null;
    // IDEA-06: active sigils array (set from main.js each frame)
    this.activeSigils = null;
    // New unlocks to show on stats screen
    this.newUnlocks = [];
    // Item reward animation
    this._itemRewardAnimStart = null;
  }

  setItemManager(im) { this.itemManager = im; }
  setEnemies(enemies) { this.enemies = enemies; }
  setRunStats(stats) { this.runStats = stats; }
  setMouse(x, y) { this._mouseX = x; this._mouseY = y; }
  resetItemReward() { this._itemRewardAnimStart = null; }

  update(dt) {
    this._pulseTimer += dt;
    // Find boss if present
    this._bossEnemy = null;
    if (this.enemies) {
      for (const e of this.enemies) {
        if (e.alive && e.isBoss) { this._bossEnemy = e; break; }
      }
    }
  }

  draw(ctx) {
    this._drawZoneVignette(ctx);
    if (this._bossEnemy) this._drawBossBar(ctx);
    this._drawHP(ctx);
    this._drawBudget(ctx);
    if (this.itemManager) this._drawRelics(ctx);
    if (this.enemies) this._drawMinimap(ctx);
    if (this.deckManager && this.cardDefs) this._drawHand(ctx);
    this._drawTempoBar(ctx);
    if (this.player && this.player.silenced) this._drawSilencedIndicator(ctx);
    // IDEA-06: sigil HUD indicator
    if (this.activeSigils && this.activeSigils.length > 0) this._drawSigilCount(ctx);
    // IDEA-09: combo bar
    if (this.player && this.player.comboCount > 0) this._drawComboBar(ctx);
  }

  // ── Reusable prominent action button ────────────────────────────────
  // Returns hit-box { x, y, w, h }. Caller stores it and checks clicks.
  _drawActionButton(ctx, label, sublabel, x, y, w, h, color = '#1450a0') {
    const pulse = 0.72 + 0.28 * Math.sin(Date.now() / 280);
    ctx.save();
    // Background
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85 + 0.15 * pulse;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    // Pulsing border (double-draw instead of shadowBlur)
    ctx.globalAlpha = 0.4 * pulse;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.stroke();
    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 22px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + (sublabel ? -3 : 7));
    if (sublabel) {
      ctx.fillStyle = 'rgba(180,220,255,0.7)';
      ctx.font = '11px monospace';
      ctx.fillText(sublabel, x + w / 2, y + h / 2 + 13);
    }
    ctx.restore();
    return { x, y, w, h };
  }

  // IDEA-06: sigil count indicator near relics area
  _drawSigilCount(ctx) {
    const active = this.activeSigils.filter(s => !s.triggered).length;
    if (active === 0) return;
    const x = this.width - 110, y = 18;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(x, y, 90, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#ff8833';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SGL: ${active}`, x + 8, y + 15);
    ctx.restore();
  }

  // IDEA-09: combo bar — shows combo count and decay timer
  _drawComboBar(ctx) {
    if (!this.player) return;
    const count = this.player.comboCount;
    const timer = this.player.comboTimer || 0;
    const maxComboTimer = 2.0;
    const BAR_W = 120, BAR_H = 8;
    const bx = (this.width - BAR_W) / 2;
    const by = 60;

    const col = count >= 3 ? '#ff3333' : (count >= 2 ? '#ff8800' : '#ffdd00');

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 4, by - 20, BAR_W + 8, 36);

    ctx.fillStyle = col;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`×${count} COMBO`, this.width / 2, by - 4);

    // Decay bar
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by, BAR_W, BAR_H);
    const fill = Math.min(1, timer / maxComboTimer);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, BAR_W * fill, BAR_H);
    ctx.restore();
  }

  _drawSilencedIndicator(ctx) {
    const t = this.player.silenceTimer || 0;
    const pulse = (Math.sin(this._pulseTimer * 8) + 1) * 0.5;
    ctx.save();
    ctx.fillStyle = `rgba(180,50,255,${0.18 + pulse * 0.12})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = `rgba(200,80,255,${0.75 + pulse * 0.25})`;
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SILENCED', this.width / 2, this.height / 2 - 60);
    ctx.fillStyle = 'rgba(200,80,255,0.7)';
    ctx.font = '16px monospace';
    ctx.fillText(`Cards disabled  —  ${t.toFixed(1)}s`, this.width / 2, this.height / 2 - 28);
    ctx.restore();
  }

  // ── Zone vignette — subtle colored border tint based on tempo state
  _drawZoneVignette(ctx) {
    const v = this.tempo.value;
    if (v < 30 || v >= 70) {
      let zoneKey, alpha;
      if (v < 30) { zoneKey = 'cold'; alpha = 0.06 + (30 - v) / 30 * 0.08; }
      else if (v < 90) { zoneKey = 'hot'; alpha = 0.05 + (v - 70) / 20 * 0.08; }
      else { zoneKey = 'critical'; alpha = 0.08 + Math.sin(this._pulseTimer * 5) * 0.04; }
      // Rebuild gradient cache when canvas size changes
      if (!this._vigGrads || this._vigGradW !== this.width || this._vigGradH !== this.height) {
        this._vigGradW = this.width; this._vigGradH = this.height;
        const mk = (col) => {
          const g = ctx.createRadialGradient(this.width/2, this.height/2, this.height * 0.25, this.width/2, this.height/2, this.height * 0.85);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, col);
          return g;
        };
        this._vigGrads = { cold: mk(PAL.COLD), hot: mk(PAL.HOT), critical: mk(PAL.CRITICAL) };
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this._vigGrads[zoneKey];
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1.0;
    }
  }

  // ── Tempo bar — center screen, above the card hand
  _drawTempoBar(ctx) {
    const CARD_H = 192; // must match _drawHand
    const BAR_W = Math.min(580, this.width - 100);
    const BAR_H = 22;
    const bx = (this.width - BAR_W) / 2;
    // Position above the card hand with clear breathing room
    const by = this.height - CARD_H - 22 - BAR_H - 44; // increased gap

    ctx.save();
    if (this.tempoZoneOccupied) ctx.globalAlpha = 0.35;

    // Crash flash overlay — triggered externally via ui.triggerTempoCrash()
    if (this._tempoCrashFlash > 0) {
      this._tempoCrashFlash = Math.max(0, this._tempoCrashFlash - 0.025);
    }

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(bx - 4, by - 22, BAR_W + 8, BAR_H + 30);

    // Zone colored gradient fill bar — cached; only rebuilt on resize
    const fill = Math.min(BAR_W, (this.tempo.value / 100) * BAR_W);
    if (!this._tempoGrad || this._tempoGradX !== bx || this._tempoGradW !== BAR_W) {
      this._tempoGradX = bx; this._tempoGradW = BAR_W;
      const g = ctx.createLinearGradient(bx, by, bx + BAR_W, by);
      g.addColorStop(0,    PAL.COLD);
      g.addColorStop(0.30, PAL.COLD);
      g.addColorStop(0.31, PAL.FLOWING);
      g.addColorStop(0.70, PAL.FLOWING);
      g.addColorStop(0.71, PAL.HOT);
      g.addColorStop(0.90, PAL.HOT);
      g.addColorStop(0.91, PAL.CRITICAL);
      g.addColorStop(1.0,  PAL.CRITICAL);
      this._tempoGrad = g;
    }
    const grad = this._tempoGrad;

    // Dark track
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(bx, by, BAR_W, BAR_H);

    // Fill with clipping
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, fill, BAR_H);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, BAR_W, BAR_H);

    // Glow overlay at High tempo
    if (this.tempo.value >= 70) {
      const glowA = 0.12 + Math.sin(this._pulseTimer * 5) * 0.07;
      ctx.fillStyle = `rgba(255,100,0,${glowA})`;
      ctx.fillRect(bx, by, fill, BAR_H);
    }
    ctx.restore();

    // Zone divider ticks + labels
    const zones = [
      { pct: 0.30, label: 'COLD' },
      { pct: 0.70, label: 'FLOWING' },
      { pct: 0.90, label: 'HOT' },
    ];
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    for (const z of zones) {
      const tx = bx + BAR_W * z.pct;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, by - 4); ctx.lineTo(tx, by + BAR_H + 4); ctx.stroke();
      ctx.fillStyle = PAL.MUTED;
      ctx.fillText(z.label, tx, by - 6);
    }
    // CRIT label at far right
    ctx.fillText('CRIT', bx + BAR_W * 0.955, by - 6);

    // Bar border
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, BAR_W, BAR_H);

    // Needle (triangle pointer) — vibrates at Critical
    const isCritical = this.tempo.value >= 90;
    const needleJitter = isCritical ? Math.sin(this._pulseTimer * 28) * 2.5 : 0;
    const needleX = bx + fill + needleJitter;
    ctx.fillStyle = isCritical ? PAL.CRITICAL : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(needleX, by - 5);
    ctx.lineTo(needleX - 5, by - 14);
    ctx.lineTo(needleX + 5, by - 14);
    ctx.closePath();
    ctx.fill();

    // Value number — cache string, only rebuild when integer changes
    const tempoInt = Math.round(this.tempo.value);
    if (tempoInt !== this._lastTempoInt) { this._lastTempoInt = tempoInt; this._lastTempoStr = String(tempoInt); }
    const zoneColor = this.tempo.stateColor();
    ctx.fillStyle = zoneColor;
    ctx.font = `bold ${isCritical ? 14 : 13}px monospace`;
    // textAlign is already 'center' from the zone labels loop above
    ctx.fillText(this._lastTempoStr, needleX, by - 16);

    // Zone name + multipliers
    const dmgMult = this.tempo.damageMultiplier();
    const spdMult = this.tempo.speedMultiplier();
    ctx.fillStyle = zoneColor;
    ctx.font = 'bold 12px monospace';
    // textAlign still 'center'
    ctx.fillText(this.tempo.stateName(), this.width / 2, by + BAR_H + 16);

    ctx.fillStyle = dmgMult >= 1.3 ? PAL.HOT : (dmgMult < 1.0 ? PAL.COLD : PAL.MUTED);
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`DMG ×${dmgMult.toFixed(1)}`, bx, by + BAR_H + 16);

    ctx.fillStyle = spdMult >= 1.2 ? PAL.FLOWING : (spdMult < 1.0 ? PAL.COLD : PAL.MUTED);
    ctx.textAlign = 'right';
    ctx.fillText(`SPD ×${spdMult.toFixed(1)}`, bx + BAR_W, by + BAR_H + 16);

    // Crash flash: white sweep over bar fading out
    if (this._tempoCrashFlash > 0) {
      ctx.globalAlpha = this._tempoCrashFlash * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, BAR_W, BAR_H);
      ctx.globalAlpha = this.tempoZoneOccupied ? 0.35 : 1;
    }

    ctx.restore(); // end tempoZoneOccupied fade scope
  }

  triggerTempoCrash() {
    this._tempoCrashFlash = 1.0;
  }

  // ── HP — top left, bigger segments with color shift
  _drawHP(ctx) {
    if (!this.player) return;
    const hp = this.player.hp, maxHp = this.player.maxHp;
    const segW = Math.min(20, Math.floor((this.width * 0.2) / maxHp));
    const segH = 18, segGap = 3;
    const startX = 18, y = 18;

    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText('HP', startX, y + segH - 3);

    // HP ghost bar — tracks damage taken and slowly decays
    const nowMs = performance.now();
    const currentPct = hp / maxHp;
    if (this._hpGhostPct === undefined) this._hpGhostPct = currentPct;
    if (currentPct < this._hpGhostPct) {
      this._hpGhostPct = Math.max(this._hpGhostPct, currentPct); // snap ghost to current if below
      this._hpGhostHoldUntil = nowMs + 500;
    } else {
      this._hpGhostPct = currentPct; // snap up immediately when healed
    }
    if (nowMs > (this._hpGhostHoldUntil || 0)) {
      this._hpGhostPct = Math.max(currentPct, this._hpGhostPct - 0.003);
    }

    const hpRatio = hp / maxHp;
    const fillColor = hpRatio > 0.5 ? '#ee4444' : (hpRatio > 0.25 ? '#ff8800' : '#ff2200');
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const totalBarW = maxHp * (segW + segGap) - segGap;
    // Ghost fill
    if (this._hpGhostPct > currentPct) {
      ctx.fillStyle = 'rgba(255,80,80,0.28)';
      ctx.fillRect(startX + 30 + Math.floor(currentPct * maxHp) * (segW + segGap), y,
        Math.ceil((this._hpGhostPct - currentPct) * totalBarW), segH);
    }
    for (let i = 0; i < maxHp; i++) {
      const sx = startX + 30 + i * (segW + segGap);
      ctx.fillStyle = i < hp ? fillColor : '#222';
      ctx.fillRect(sx, y, segW, segH);
      ctx.strokeRect(sx, y, segW, segH);
    }
  }

  // ── AP bar — top left below HP
  _drawBudget(ctx) {
    if (!this.player) return;
    const b = this.player.budget, mb = this.player.maxBudget;
    const segW = 18, segH = 14, segGap = 3;
    const startX = 18, y = 44;

    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4488ff';
    ctx.fillText('AP', startX, y + segH - 2);

    // Track newly filled pips for flash animation
    const budgetInt = Math.floor(b);
    if (budgetInt > (this._lastBudgetInt || 0) && (this._lastBudgetInt || 0) >= 0) {
      this._apFlashSlot = budgetInt - 1;
      this._apFlashStart = performance.now();
    }
    this._lastBudgetInt = budgetInt;

    for (let i = 0; i < mb; i++) {
      const sx = startX + 30 + i * (segW + segGap);
      const filled = i < Math.floor(b);
      const isFlashing = i === this._apFlashSlot && performance.now() - (this._apFlashStart || 0) < 220;
      ctx.fillStyle = filled ? (isFlashing ? '#aaddff' : '#44aaff') : '#1a2a44';
      ctx.fillRect(sx, y, segW, segH);
      if (isFlashing) {
        ctx.fillStyle = 'rgba(180,230,255,0.45)';
        ctx.fillRect(sx, y, segW, segH);
      }
      ctx.strokeStyle = '#223355';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, y, segW, segH);
    }
    // Partial fill
    if (b < mb) {
      const partial = b % 1;
      const idx = Math.floor(b);
      const sx = startX + 30 + idx * (segW + segGap);
      ctx.fillStyle = 'rgba(68,170,255,0.45)';
      ctx.fillRect(sx, y + segH * (1 - partial), segW, segH * partial);
    }

    // AP number
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${b.toFixed(1)}/${mb}`, startX + 30 + mb * (segW + segGap) + 4, y + segH - 2);
  }

  // ── Relics — top left below AP
  _drawRelics(ctx) {
    if (!this.itemManager || !this.itemManager.equipped.length) return;
    const y = 68;
    const startX = 18;
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RELICS', startX, y - 2);

    const ItemDefinitions = window._itemDefs;
    if (!ItemDefinitions) return;
    for (let i = 0; i < this.itemManager.equipped.length; i++) {
      const id = this.itemManager.equipped[i];
      const def = ItemDefinitions[id];
      if (!def) continue;
      const rx = startX + i * 26;
      const ry = y + 2;
      const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);
      ctx.fillStyle = PAL.UI_PANEL;
      ctx.fillRect(rx, ry, 22, 22);
      ctx.strokeStyle = rarCol;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, 22, 22);
      ctx.fillStyle = def.color || '#aaa';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name[0].toUpperCase(), rx + 11, ry + 15);
    }
  }

  // ── Minimap — top right, better scaled
  _drawMinimap(ctx) {
    if (!this.enemies || !this.player) return;
    const mapSize = 90;
    const mx = this.width - mapSize - 12, my = 12;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mx, my, mapSize, mapSize);
    ctx.strokeStyle = PAL.UI_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mapSize, mapSize);

    // Use room bounds instead of canvas size for scale
    const roomW = window.CANVAS_W || this.width;
    const roomH = window.CANVAS_H || this.height;
    const scaleX = (mapSize - 4) / roomW;
    const scaleY = (mapSize - 4) / roomH;
    const ox = mx + 2, oy = my + 2;

    // Player dot
    ctx.fillStyle = PAL.FLOWING;
    const px = ox + this.player.x * scaleX;
    const py = oy + this.player.y * scaleY;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Enemy dots — track last fillStyle to avoid redundant ctx.fillStyle assignments
    let lastMinimapFill = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const fill = e.isBoss ? PAL.CRITICAL : PAL.HOT;
      if (fill !== lastMinimapFill) { ctx.fillStyle = fill; lastMinimapFill = fill; }
      const ex = ox + e.x * scaleX, ey = oy + e.y * scaleY;
      if (e.isBoss) {
        ctx.fillRect(ex - 3, ey - 3, 6, 6);
      } else {
        ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
      }
    }
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MAP', mx + mapSize / 2, my + mapSize + 10);
  }

  // ── Boss health bar — top center, full-width
  _drawBossBar(ctx) {
    const e = this._bossEnemy;
    if (!e || !e.alive) return;
    const BAR_W = Math.min(600, this.width - 200);
    const BAR_H = 18;
    const bx = (this.width - BAR_W) / 2;
    const by = 10;
    const pct = Math.max(0, e.hp / e.maxHp);

    // Background panel
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(bx - 8, by - 6, BAR_W + 16, BAR_H + 20);

    // Bar track
    ctx.fillStyle = '#1a0008';
    ctx.fillRect(bx, by, BAR_W, BAR_H);

    // Fill
    const bossCol = pct > 0.5 ? '#cc2222' : (pct > 0.25 ? '#ff5500' : '#ff0000');
    ctx.fillStyle = bossCol;
    ctx.fillRect(bx, by, BAR_W * pct, BAR_H);

    // Glow
    const glowA = 0.1 + Math.sin(this._pulseTimer * 4) * 0.05;
    ctx.fillStyle = `rgba(255,50,50,${glowA})`;
    ctx.fillRect(bx, by, BAR_W * pct, BAR_H);

    ctx.strokeStyle = 'rgba(255,100,100,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, BAR_W, BAR_H);

    // Phase markers at 66% and 33%
    ctx.strokeStyle = 'rgba(255,220,220,0.55)';
    ctx.lineWidth = 1.5;
    for (const phasePct of [0.66, 0.33]) {
      const tx = bx + BAR_W * phasePct;
      ctx.beginPath(); ctx.moveTo(tx, by - 3); ctx.lineTo(tx, by + BAR_H + 3); ctx.stroke();
    }

    // Boss name
    const bossNames = { boss_brawler: 'THE BRAWLER', boss_conductor: 'THE CONDUCTOR', boss_echo: 'THE ECHO', boss_necromancer: 'THE NECROMANCER', boss_apex: 'THE APEX' };
    ctx.fillStyle = '#ff6666';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bossNames[e.type] || 'BOSS', this.width / 2, by + BAR_H + 12);

    // HP numbers
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${e.hp} / ${e.maxHp}`, bx + BAR_W, by - 2);
  }

  // ── Card hand — bottom center with hover lift
  _drawHand(ctx) {
    const hand = this.deckManager.hand;
    const CARD_W = 155, CARD_H = 192, GAP = 10, RADIUS = 10;
    const totalW = this.deckManager.HAND_SIZE * CARD_W + (this.deckManager.HAND_SIZE - 1) * GAP;
    const startX = (this.width - totalW) / 2;
    const baseY = this.height - CARD_H - 22;

    ctx.save();
    if (this.cardZoneOccupied) ctx.globalAlpha = 0.35;

    this.handBoxes = [];
    this._hoveredCard = -1;

    for (let i = 0; i < 4; i++) {
      const cardId = hand[i];
      // Skip wide sentinels — they're drawn by the parent slot
      if (cardId === '__wide') continue;

      let def = null;
      let canAfford = false;
      const sw = cardId ? ((CardDefinitions[cardId] && CardDefinitions[cardId].slotWidth) || 1) : 1;
      const cardDrawW = sw * CARD_W + (sw - 1) * GAP;

      if (cardId) {
        def = this.deckManager.getCardDef(cardId);
        canAfford = this.player && this.player.budget >= def.cost;
      }

      const x = startX + i * (CARD_W + GAP);

      // Hover lift — disabled during battle so cards don't jump when aiming
      const mx = this._mouseX, my = this._mouseY;
      const isHovered = !this.battleMode && mx >= x && mx <= x + cardDrawW && my >= baseY - 20 && my <= baseY + CARD_H;
      if (isHovered) this._hoveredCard = i;
      const y = baseY - (isHovered ? 18 : 0);

      ctx.save();

      // Card background — solid fill avoids per-card gradient allocation each frame
      ctx.fillStyle = (cardId && canAfford) ? 'rgba(28, 32, 48, 0.95)' : 'rgba(13, 13, 18, 0.90)';
      ctx.beginPath();
      ctx.roundRect(x, y, cardDrawW, CARD_H, RADIUS);
      ctx.fill();

      const isActive = this.selectedCardSlot === i;

      // Active card: solid coloured top bar instead of glow overlay
      if (isActive) {
        ctx.fillStyle = '#44ff88';
        ctx.fillRect(x, y, cardDrawW, 4);
      }

      // Left color stripe + rarity indicator
      if (cardId && def) {
        ctx.fillStyle = canAfford ? (def.color || '#5577aa') : '#333';
        ctx.fillRect(x, y + (isActive ? 4 : 0), 3, CARD_H - (isActive ? 4 : 0));
        // Rarity pip at bottom-left corner
        const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : null);
        if (rarCol && canAfford) {
          ctx.fillStyle = rarCol;
          ctx.beginPath();
          ctx.arc(x + 10, y + CARD_H - 10, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Prep screen: highlight slot that will be replaced if pending card is picked
      const isPendingTarget = this.prepPendingCard && (
        (this.deckManager.hand[i] && this.deckManager.hand[i] !== '__wide') ||
        !this.deckManager.hand[i]
      );

      // Border — plain stroke, no shadow
      if (isActive && !this.prepPendingCard) {
        ctx.strokeStyle = '#44ff88';
        ctx.lineWidth = 3;
      } else if (isPendingTarget && isHovered) {
        ctx.strokeStyle = '#ffdd44';
        ctx.lineWidth = 3;
      } else if (isPendingTarget) {
        ctx.strokeStyle = 'rgba(255,220,68,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
      } else if (isHovered && cardId && canAfford) {
        ctx.strokeStyle = def?.color || '#5577aa';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = cardId ? (canAfford ? '#3a4466' : '#222233') : '#1a1a2a';
        ctx.lineWidth = 1.5;
      }
      ctx.beginPath();
      ctx.roundRect(x, y, cardDrawW, CARD_H, RADIUS);
      ctx.stroke();
      ctx.setLineDash([]);

      // Wide card indicator
      if (sw > 1) {
        ctx.fillStyle = 'rgba(255,200,0,0.12)';
        ctx.fillRect(x + CARD_W + 1, y + 2, (sw - 1) * (CARD_W + GAP) - GAP - 1, CARD_H - 4);
      }

      // Slot number
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`[${i + 1}]`, x + CARD_W - 8, y + 16);

      if (cardId && def) {
        // Card name — scale down font for long names to avoid overlapping AP badge
        const nameFontSize = def.name.length > 11 ? 13 : 16;
        ctx.fillStyle = canAfford ? '#ffffff' : '#666';
        ctx.font = `bold ${nameFontSize}px monospace`;
        ctx.textAlign = 'center';
        // Shift center right slightly to clear the AP badge on the left
        ctx.fillText(def.name, x + CARD_W / 2 + 8, y + 32);

        // Divider line under name
        ctx.strokeStyle = (def.color || '#5577aa') + (canAfford ? 'aa' : '44');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 38); ctx.lineTo(x + CARD_W - 10, y + 38); ctx.stroke();

        // AP cost badge
        const costCol = canAfford ? '#44aaff' : '#223355';
        ctx.fillStyle = costCol;
        ctx.beginPath();
        ctx.arc(x + 16, y + 16, 13, 0, Math.PI * 2);
        ctx.fill();
        if (canAfford) {
          ctx.strokeStyle = '#88ddff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.cost, x + 16, y + 21);

        // Tempo shift — prominent
        const tsCol = def.tempoShift > 0 ? (canAfford ? PAL.HOT : '#553322') : (canAfford ? PAL.COLD : '#223344');
        ctx.fillStyle = tsCol;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText((def.tempoShift > 0 ? '+' : '') + def.tempoShift + ' Tempo', x + CARD_W / 2, y + 55);

        // Type badge
        ctx.fillStyle = canAfford ? (def.color || PAL.MUTED) : '#444';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(def.type.toUpperCase(), x + CARD_W / 2, y + 70);

        // Range
        ctx.fillStyle = canAfford ? '#888' : '#444';
        ctx.font = '11px monospace';
        ctx.fillText(`${def.range}px range`, x + CARD_W / 2, y + 84);

        // Description — larger font, more line height
        ctx.fillStyle = canAfford ? '#cccccc' : '#555';
        ctx.font = '12px monospace';
        this._wrapText(ctx, def.desc, x + 8, y + 108, CARD_W - 16, 15);
      }

      // Active indicator — small pill above card, no glow
      if (isActive && cardId) {
        ctx.fillStyle = '#44ff88';
        ctx.fillRect(x + CARD_W / 2 - 28, y - 18, 56, 14);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ACTIVE', x + CARD_W / 2, y - 8);
      }

      // Unavailable dimming
      if (cardId && !canAfford) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_W, CARD_H, RADIUS);
        ctx.fill();
      }

      this.handBoxes.push({ x, y: baseY, w: cardDrawW, h: CARD_H + 20, slotIndex: i });
      ctx.restore();
    }

    // Control hint
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[Left-Click] Attack  |  [Right-Click / 1-4] Switch Card  |  [ESC] Pause', this.width / 2, this.height - 5);

    ctx.restore(); // end cardZoneOccupied fade scope
  }

  // ───────────── PREP SCREEN ─────────────
  drawPrepScreen(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EQUIP LOADOUT', this.width / 2, 52);

    if (this.prepPendingCard) {
      const pDef = this.deckManager.getCardDef(this.prepPendingCard);
      ctx.fillStyle = '#111a22';
      ctx.beginPath();
      ctx.roundRect(this.width / 2 - 280, 64, 560, 36, 6);
      ctx.fill();
      ctx.strokeStyle = '#ffdd44';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`"${pDef?.name || this.prepPendingCard}" selected  —  now click a hand SLOT to equip it`, this.width / 2, 87);
    } else {
      ctx.fillStyle = '#778899';
      ctx.font = '14px monospace';
      ctx.fillText('Step 1: click a card below to select it.   Step 2: click a hand slot (top) to equip it.', this.width / 2, 80);
    }
    ctx.fillStyle = PAL.GOLD;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('Press ENTER to fight!', this.width / 2, 108);

    this._drawHand(ctx);

    // When a card is pending, draw pulsing arrows above each equippable hand slot
    if (this.prepPendingCard && this.handBoxes.length > 0) {
      const pulse = (Math.sin(this._pulseTimer * 6) + 1) * 0.5;
      ctx.fillStyle = `rgba(255,221,68,${0.5 + pulse * 0.5})`;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      for (const hb of this.handBoxes) {
        const slotId = this.deckManager.hand[hb.slotIndex];
        if (slotId === '__wide') continue;
        const arrowX = hb.x + hb.w / 2;
        const arrowY = hb.y - 28;
        ctx.fillText('▼', arrowX, arrowY);
      }
    }

    const GAP = 16;
    const CARD_W = 240, CARD_H = 310;
    const COLS = Math.floor((this.width - 40) / (CARD_W + GAP));
    const totalW = COLS * (CARD_W + GAP) - GAP;
    const startX = (this.width - totalW) / 2;
    const startY = 140;

    this.prepBoxes = [];
    const collection = this.deckManager.collection;
    for (let i = 0; i < collection.length; i++) {
      const x = startX + (i % COLS) * (CARD_W + GAP);
      const y = startY + Math.floor(i / COLS) * (CARD_H + GAP);
      const cardId = collection[i];
      const def = this.deckManager.getCardDef(cardId);
      if (!def) continue;
      const equippedSlot = this.deckManager.hand.indexOf(cardId);
      const isEquipped = equippedSlot >= 0;

      const isPending = this.prepPendingCard === cardId;
      const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);
      ctx.fillStyle = isPending ? '#1a2a1a' : (isEquipped ? '#1a1a2a' : PAL.UI_BG);
      ctx.fillRect(x, y, CARD_W, CARD_H);
      // Rarity top bar
      ctx.fillStyle = rarCol + '55';
      ctx.fillRect(x, y, CARD_W, 3);
      ctx.fillStyle = def.color || '#5577aa';
      ctx.fillRect(x, y + 3, 3, CARD_H - 3);
      ctx.strokeStyle = isPending ? '#ffdd44' : (isEquipped ? PAL.GOLD : rarCol + '88');
      ctx.lineWidth = isPending ? 3 : (isEquipped ? 2 : 1);
      ctx.strokeRect(x, y, CARD_W, CARD_H);

      if (isEquipped) {
        ctx.fillStyle = PAL.GOLD;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`SLOT ${equippedSlot + 1}`, x + CARD_W - 5, y + 18);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.TEXT;
      ctx.font = 'bold 20px monospace';
      ctx.fillText(def.name, x + CARD_W / 2, y + 36);
      ctx.fillStyle = rarCol;
      ctx.font = '14px monospace';
      ctx.fillText((def.rarity || 'common').toUpperCase(), x + CARD_W / 2, y + 56);
      ctx.fillStyle = '#44aaff';
      ctx.font = '15px monospace';
      ctx.fillText(`${def.cost} AP | ${def.range}px`, x + CARD_W / 2, y + 78);
      ctx.fillStyle = def.tempoShift > 0 ? PAL.HOT : PAL.COLD;
      ctx.font = 'bold 15px monospace';
      ctx.fillText((def.tempoShift > 0 ? '+' : '') + def.tempoShift + ' Tempo', x + CARD_W / 2, y + 100);
      ctx.fillStyle = def.color || '#888';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(def.type.toUpperCase(), x + CARD_W / 2, y + 122);
      ctx.fillStyle = PAL.MUTED;
      ctx.font = '14px monospace';
      this._wrapText(ctx, def.desc, x + 10, y + 146, CARD_W - 20, 20);
      this.prepBoxes.push({ x, y, w: CARD_W, h: CARD_H, cardId });
    }

    // START COMBAT button (prominent, bottom-right)
    const btnW = 280, btnH = 58;
    const btnX = this.width - btnW - 24;
    const btnY = this.height - btnH - 24;
    this.prepFightBox = this._drawActionButton(ctx, '⚔  START COMBAT', 'or press ENTER', btnX, btnY, btnW, btnH, '#4a1010');
  }

  _drawCardTooltip(ctx, cardId, mx, my) {
    const def = this.deckManager.getCardDef(cardId);
    if (!def) return;
    const TW = 200, TH = 200;
    let tx = mx + 16;
    let ty = my - TH / 2;
    if (tx + TW > this.width - 10) tx = mx - TW - 16;
    if (ty < 10) ty = 10;
    if (ty + TH > this.height - 10) ty = this.height - TH - 10;

    const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);

    ctx.save();
    ctx.fillStyle = '#0d0d18';
    ctx.beginPath();
    ctx.roundRect(tx, ty, TW, TH, 10);
    ctx.fill();
    ctx.strokeStyle = rarCol;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = rarCol;
    ctx.fillRect(tx, ty, TW, 3);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(def.name, tx + TW / 2, ty + 22);

    ctx.strokeStyle = (def.color || '#5577aa') + '88';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx + 10, ty + 28); ctx.lineTo(tx + TW - 10, ty + 28); ctx.stroke();

    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${def.cost} AP`, tx + TW / 2, ty + 46);

    ctx.fillStyle = def.tempoShift > 0 ? PAL.HOT : PAL.COLD;
    ctx.font = '11px monospace';
    ctx.fillText((def.tempoShift > 0 ? '+' : '') + def.tempoShift + ' Tempo', tx + TW / 2, ty + 62);

    if (def.damage > 0) {
      ctx.fillStyle = '#ff9988';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`${def.damage} DMG  |  ${def.range}px`, tx + TW / 2, ty + 82);
    }

    ctx.fillStyle = rarCol;
    ctx.font = 'bold 9px monospace';
    ctx.fillText((def.rarity || 'common').toUpperCase() + ' · ' + def.type.toUpperCase(), tx + TW / 2, ty + 98);

    ctx.fillStyle = '#ccccdd';
    ctx.font = '10px monospace';
    this._wrapText(ctx, def.desc, tx + 10, ty + 118, TW - 20, 14);

    ctx.restore();
  }

  handlePrepClick(mx, my) {
    // If a card is pending, clicking a hand slot equips it
    if (this.prepPendingCard) {
      if (this.handBoxes) {
        for (const h of this.handBoxes) {
          if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
            this.deckManager.equipCard(h.slotIndex, this.prepPendingCard);
            this.prepPendingCard = null;
            return;
          }
        }
      }
      // Clicking elsewhere cancels pending
      if (this.prepBoxes) {
        for (const b of this.prepBoxes) {
          if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
            // Clicking same card cancels, clicking different card switches selection
            if (b.cardId === this.prepPendingCard) {
              this.prepPendingCard = null;
            } else {
              this.prepPendingCard = b.cardId;
            }
            return;
          }
        }
      }
      this.prepPendingCard = null;
      return;
    }

    // No pending card: clicking collection card starts selection
    if (this.prepBoxes) {
      for (const b of this.prepBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          this.prepPendingCard = b.cardId;
          return;
        }
      }
    }
  }

  // ───────────── ITEM REWARD SCREEN ─────────────
  drawItemReward(ctx, choices, itemDefs) {
    const now = Date.now();
    if (!this._itemRewardAnimStart) this._itemRewardAnimStart = now;
    const elapsed = now - this._itemRewardAnimStart;

    // ── Easing helpers ──
    const clamp01 = t => Math.max(0, Math.min(1, t));
    const easeOutBack = t => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    // ── Timing ──
    const CARD_0_START  = 420;   // ms when first card starts flying in
    const CARD_STAGGER  = 160;   // ms between subsequent cards
    const CARD_DUR      = 500;   // ms each card takes to arrive
    const READY_AT = CARD_0_START + (choices.length - 1) * CARD_STAGGER + CARD_DUR + 80;
    const ready = elapsed >= READY_AT;

    const cx = this.width / 2;

    // ── Background ──
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, this.width, this.height);

    // ── Light rays (intro burst) ──
    const rayDur = 900;
    if (elapsed < rayDur) {
      const rayAlpha = clamp01(1 - elapsed / rayDur) * 0.30;
      ctx.save();
      ctx.translate(cx, 230);
      const rotation = elapsed * 0.00025;
      for (let r = 0; r < 14; r++) {
        const angle = (r / 14) * Math.PI * 2 + rotation;
        const spread = 0.038;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle - spread) * 700, Math.sin(angle - spread) * 700);
        ctx.lineTo(Math.cos(angle + spread) * 700, Math.sin(angle + spread) * 700);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,215,0,${rayAlpha})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Expanding rings (3 waves) ──
    for (let ring = 0; ring < 3; ring++) {
      const ringT = clamp01((elapsed - ring * 90) / 450);
      if (ringT <= 0) continue;
      const ringR = easeOutCubic(ringT) * 320;
      const ringAlpha = (1 - ringT) * 0.65;
      ctx.save();
      ctx.strokeStyle = `rgba(255,215,0,${ringAlpha})`;
      ctx.lineWidth = 4 - ring;
      ctx.beginPath();
      ctx.arc(cx, 230, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Center flash ──
    if (elapsed < 220) {
      const flashAlpha = clamp01(1 - elapsed / 220) * 0.55;
      const flashR = easeOutCubic(elapsed / 220) * 140;
      const grad = ctx.createRadialGradient(cx, 230, 0, cx, 230, flashR);
      grad.addColorStop(0, `rgba(255,255,200,${flashAlpha})`);
      grad.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, 230, Math.max(1, flashR), 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Title ──
    const titleT = clamp01(elapsed / 380);
    if (titleT > 0) {
      const titleScale = easeOutBack(titleT);
      const titleAlpha = clamp01(elapsed / 220);
      ctx.save();
      ctx.globalAlpha = titleAlpha;
      ctx.translate(cx, 75);
      ctx.scale(titleScale, titleScale);
      // Double-draw glow instead of shadowBlur (perf-safe)
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,180,0,0.3)';
      ctx.fillText('\u2756 CHOOSE A RELIC \u2756', -2, 2);
      ctx.fillText('\u2756 CHOOSE A RELIC \u2756', 2, -2);
      ctx.fillStyle = PAL.GOLD;
      ctx.fillText('\u2756 CHOOSE A RELIC \u2756', 0, 0);
      ctx.restore();
    }

    // ── Cards ──
    const CARD_W = 240, CARD_H = 280, GAP = 32;
    const totalW = choices.length * CARD_W + (choices.length - 1) * GAP;
    const startX = (this.width - totalW) / 2;
    const finalY = 130;
    const HP_RELICS = new Set(['iron_pulse','deadweight','cold_blood','abyss_heart','lifesteal_fang','last_rites']);
    this.itemBoxes = [];

    for (let i = 0; i < choices.length; i++) {
      const cardStartTime = CARD_0_START + i * CARD_STAGGER;
      const rawT = (elapsed - cardStartTime) / CARD_DUR;
      const cardT = clamp01(rawT);
      if (cardT <= 0) continue;

      const finalX = startX + i * (CARD_W + GAP);
      const def = itemDefs[choices[i]];
      if (!def) continue;
      const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);

      // Position: fly in from below with overshoot
      const posEased = easeOutBack(cardT);
      const flyFromY = this.height + 60;
      const curY = finalY + (flyFromY - finalY) * (1 - posEased);

      // Scale: grow from 0.75 smoothly
      const scaleAnim = 0.75 + 0.25 * easeOutCubic(cardT);

      // Hover & float (only when fully arrived)
      const mx = this._mouseX, my = this._mouseY;
      const isHovered = ready &&
        mx >= finalX && mx <= finalX + CARD_W &&
        my >= finalY && my <= finalY + CARD_H;
      const hoverScale = ready ? (isHovered ? 1.07 : 1.0) : 1.0;
      const floatY = ready ? Math.sin(elapsed * 0.00155 + i * 1.15) * 6 : 0;

      // Arrival glow: brief extra shadow in the first 150ms
      const arrivalGlow = clamp01(1 - (elapsed - cardStartTime - CARD_DUR) / 200);

      ctx.save();
      ctx.globalAlpha = Math.min(1, cardT * 3);
      // Pivot around the card center for scale
      ctx.translate(finalX + CARD_W / 2, curY + floatY + CARD_H / 2);
      ctx.scale(scaleAnim * hoverScale, scaleAnim * hoverScale);
      ctx.translate(-CARD_W / 2, -CARD_H / 2);

      // Card body
      ctx.fillStyle = PAL.UI_PANEL;
      ctx.beginPath();
      ctx.roundRect(0, 0, CARD_W, CARD_H, 14);
      ctx.fill();

      // Top color bar
      ctx.fillStyle = def.color || '#aaa';
      ctx.fillRect(0, 0, CARD_W, 5);

      // Border — double-stroke approach (outer faint + inner solid) instead of shadowBlur
      if (isHovered || arrivalGlow > 0) {
        const glowA = isHovered ? 0.55 : 0.45 * arrivalGlow;
        ctx.save();
        ctx.globalAlpha *= glowA;
        ctx.strokeStyle = isHovered ? rarCol : (def.color || PAL.GOLD);
        ctx.lineWidth = isHovered ? 8 : 10;
        ctx.beginPath();
        ctx.roundRect(0, 0, CARD_W, CARD_H, 14);
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = rarCol;
      ctx.lineWidth = isHovered ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.roundRect(0, 0, CARD_W, CARD_H, 14);
      ctx.stroke();

      // Icon circle — outer ring instead of shadowBlur
      const iconCol = def.color || '#aaa';
      ctx.fillStyle = iconCol + '44';
      ctx.beginPath();
      ctx.arc(CARD_W / 2, 54, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = iconCol;
      ctx.beginPath();
      ctx.arc(CARD_W / 2, 54, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name[0], CARD_W / 2, 63);

      // Name
      ctx.fillStyle = PAL.TEXT;
      ctx.font = 'bold 19px monospace';
      ctx.fillText(def.name, CARD_W / 2, 102);

      // Rarity
      ctx.fillStyle = rarCol;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(def.rarity.toUpperCase(), CARD_W / 2, 122);

      // Description
      ctx.fillStyle = '#ccc';
      ctx.font = '14px monospace';
      this._wrapText(ctx, def.desc, 14, 148, CARD_W - 28, 20);

      // Wraith HP warning
      if (this.player && this.player._classPassives && this.player._classPassives.noHealingFromRelics &&
          (HP_RELICS.has(choices[i]) || def.desc.toLowerCase().includes(' hp'))) {
        ctx.fillStyle = PAL.MUTED;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No HP effect (Wraith)', CARD_W / 2, CARD_H - 12);
      }

      // Sparkle orbit for non-common relics
      if (ready && def.rarity !== 'common') {
        const sparkCount = def.rarity === 'rare' ? 6 : 4;
        for (let s = 0; s < sparkCount; s++) {
          const sa = (elapsed * 0.00085 + s * Math.PI * 2 / sparkCount) % (Math.PI * 2);
          const orbitR = 38 + Math.sin(elapsed * 0.0022 + s * 1.4) * 5;
          const sx = CARD_W / 2 + Math.cos(sa) * orbitR;
          const sy = 54 + Math.sin(sa) * orbitR;
          const sAlpha = 0.45 + 0.55 * Math.sin(elapsed * 0.0035 + s * 2.1);
          ctx.fillStyle = `rgba(255,255,255,${sAlpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, def.rarity === 'rare' ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // Register hit box only once cards are settled
      if (ready) {
        this.itemBoxes.push({ x: finalX, y: finalY, w: CARD_W, h: CARD_H, itemId: choices[i] });
      }
    }

    // ── Skip button (only after cards are in) ──
    if (ready) {
      const btnW = 260, btnH = 52;
      const btnX = this.width / 2 - btnW / 2;
      const btnY = this.height - btnH - 20;
      this.skipItemBox = this._drawActionButton(ctx, '▶  SKIP', 'or press ENTER', btnX, btnY, btnW, btnH, '#1a1a3a');
    } else {
      this.skipItemBox = null;
    }
  }

  handleItemClick(mx, my) {
    if (!this.itemBoxes) return null;
    // Check skip button first
    if (this.skipItemBox) {
      const b = this.skipItemBox;
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return '__skip';
    }
    for (const b of this.itemBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.itemId;
    }
    return null;
  }

  // ───────────── UPGRADE SCREEN ─────────────
  drawUpgradeScreen(ctx, choices) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('UPGRADE A CARD', this.width / 2, 75);
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '14px monospace';
    ctx.fillText('Upgrades: +50% dmg, +25% tempo, cost-1 at +2 (max 2)', this.width / 2, 105);

    const CARD_W = 265, CARD_H = 240, GAP = 18;
    const totalW = choices.length * CARD_W + (choices.length - 1) * GAP;
    const startX = (this.width - totalW) / 2;
    const startY = 130;
    this.upgradeBoxes = [];

    for (let i = 0; i < choices.length; i++) {
      const x = startX + i * (CARD_W + GAP), y = startY;
      const cardId = choices[i];
      const def = this.deckManager.getCardDef(cardId);
      if (!def) continue;
      const level = this.deckManager.upgrades[cardId] || 0;
      const baseCard = this.cardDefs[cardId];

      ctx.fillStyle = PAL.UI_PANEL;
      ctx.beginPath();
      ctx.roundRect(x, y, CARD_W, CARD_H, 10);
      ctx.fill();
      ctx.fillStyle = def.color || '#aaa';
      ctx.fillRect(x, y, 4, CARD_H);
      ctx.strokeStyle = '#44aaff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, CARD_W, CARD_H, 10);
      ctx.stroke();

      ctx.fillStyle = PAL.TEXT;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + CARD_W / 2, y + 44);

      ctx.fillStyle = PAL.HOT;
      ctx.font = '18px monospace';
      ctx.fillText(`Lv ${level + 1} → ${level + 2}`, x + CARD_W / 2, y + 72);

      // IDEA-02: show before/after damage
      const nextDmg = baseCard && baseCard.damage > 0 ? Math.round(baseCard.damage * (1 + 0.5 * (level + 1))) : null;
      ctx.fillStyle = PAL.FLOWING;
      ctx.font = '17px monospace';
      if (nextDmg !== null && nextDmg > 0) {
        ctx.fillText(`DMG: ${def.damage} → ${nextDmg}`, x + CARD_W / 2, y + 100);
      } else {
        ctx.fillStyle = PAL.MUTED;
        ctx.fillText('No damage', x + CARD_W / 2, y + 100);
      }

      // Show tempo shift before/after
      const nextTempo = baseCard && baseCard.tempoShift !== 0
        ? Math.round(baseCard.tempoShift * (1 + 0.25 * (level + 1))) : null;
      ctx.fillStyle = '#88ccff';
      ctx.font = '15px monospace';
      if (nextTempo !== null) {
        ctx.fillText(`Tempo: ${def.tempoShift > 0 ? '+' : ''}${def.tempoShift} → ${nextTempo > 0 ? '+' : ''}${nextTempo}`, x + CARD_W / 2, y + 124);
      }

      // Show cost before/after
      const nextCost = (level + 1) >= 2 ? Math.max(0, (baseCard ? baseCard.cost : def.cost) - 1) : def.cost;
      ctx.fillStyle = nextCost < def.cost ? PAL.GOLD : PAL.MUTED;
      ctx.font = '15px monospace';
      ctx.fillText(`Cost: ${def.cost} AP → ${nextCost} AP`, x + CARD_W / 2, y + 148);

      ctx.fillStyle = '#44ff88';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('CLICK TO UPGRADE', x + CARD_W / 2, y + CARD_H - 16);

      this.upgradeBoxes = this.upgradeBoxes || [];
      this.upgradeBoxes.push({ x, y, w: CARD_W, h: CARD_H, cardId });
    }

    const btnW = 280, btnH = 52;
    const btnX = this.width / 2 - btnW / 2;
    const btnY = this.height - btnH - 20;
    this.skipUpgradeBox = this._drawActionButton(ctx, '▶  SKIP UPGRADE', 'or press ENTER', btnX, btnY, btnW, btnH, '#1a1a3a');
  }

  handleUpgradeClick(mx, my) {
    if (this.skipUpgradeBox) {
      const b = this.skipUpgradeBox;
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return '__skip';
    }
    if (!this.upgradeBoxes) return null;
    for (const b of this.upgradeBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.cardId;
    }
    return null;
  }

  // ───────────── EVENT SCREEN ─────────────
  // eventType: 'standard' | 'merchant' | 'blacksmith'
  drawEventScreen(ctx, eventType) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, this.width, this.height);

    const TITLES = {
      standard:   ['STRANGE ENCOUNTER', '#ff88ff', 'A mysterious figure offers you a deal...'],
      merchant:   ['WANDERING MERCHANT', '#ffcc44', 'The merchant eyes your equipment hungrily...'],
      blacksmith: ['THE BLACKSMITH',     '#ff8833', 'The forge glows hot. A blade awaits refinement.'],
    };
    const [title, titleColor, subtitle] = TITLES[eventType] || TITLES.standard;

    ctx.fillStyle = titleColor;
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, this.width / 2, 75);
    ctx.fillStyle = '#ccc';
    ctx.font = '15px monospace';
    ctx.fillText(subtitle, this.width / 2, 130);

    let options;
    if (eventType === 'merchant') {
      options = [
        { label: 'Sell your oldest card → +3 HP', key: '1', color: '#ffcc44' },
        { label: 'Trade 1 HP → Random Relic',      key: '2', color: '#ff6666' },
        { label: 'Pass — touch nothing',           key: '3', color: '#667788' },
      ];
    } else if (eventType === 'blacksmith') {
      options = [
        { label: 'Upgrade any card for FREE',   key: '1', color: '#ff8833' },
        { label: 'Heal 1 HP — the forge\'s warmth', key: '2', color: PAL.FLOWING },
        { label: 'Pass — leave the forge',      key: '3', color: '#667788' },
      ];
    } else {
      options = [
        { label: 'Trade 1 HP → Random Relic',       key: '1', color: '#ff6666' },
        { label: 'Rest: Heal 2 HP',                  key: '2', color: PAL.FLOWING },
        { label: 'Gamble: 50% +2 HP or −1 HP',       key: '3', color: PAL.HOT },
      ];
    }

    this.eventBoxes = [];
    for (let i = 0; i < options.length; i++) {
      const y = 190 + i * 76;
      const opt = options[i];
      ctx.fillStyle = PAL.UI_PANEL;
      ctx.beginPath();
      ctx.roundRect(this.width / 2 - 250, y, 500, 62, 8);
      ctx.fill();
      ctx.strokeStyle = opt.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = opt.color;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`[${opt.key}] ${opt.label}`, this.width / 2, y + 38);
      this.eventBoxes.push({ x: this.width / 2 - 250, y, w: 500, h: 62, index: i });
    }
  }

  handleEventClick(mx, my) {
    if (!this.eventBoxes) return -1;
    for (const b of this.eventBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.index;
    }
    return -1;
  }

  // ───────────── SHOP SCREEN ─────────────
  drawShopScreen(ctx, shopCards, cardDefs) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CARD SHOP', this.width / 2, 58);
    ctx.fillStyle = PAL.MUTED;
    ctx.font = '14px monospace';
    ctx.fillText('Cost: 1 HP per card. Click to buy.', this.width / 2, 88);

    const CARD_W = 200, CARD_H = 270, GAP = 24;
    const totalW = shopCards.length * CARD_W + (shopCards.length - 1) * GAP;
    const startX = (this.width - totalW) / 2;
    const startY = 118;
    this.shopBoxes = [];

    for (let i = 0; i < shopCards.length; i++) {
      const x = startX + i * (CARD_W + GAP), y = startY;
      const def = cardDefs[shopCards[i]];
      if (!def) continue;
      ctx.fillStyle = PAL.UI_PANEL;
      ctx.fillRect(x, y, CARD_W, CARD_H);
      ctx.fillStyle = def.color || '#aaa';
      ctx.fillRect(x, y, CARD_W, 3);
      ctx.strokeStyle = '#334466';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, CARD_W, CARD_H);

      ctx.fillStyle = PAL.TEXT;
      ctx.font = 'bold 19px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + CARD_W / 2, y + 35);
      ctx.fillStyle = '#ff6666';
      ctx.font = 'bold 17px monospace';
      ctx.fillText('Buy: 1 HP', x + CARD_W / 2, y + 62);
      ctx.fillStyle = '#44aaff';
      ctx.font = '15px monospace';
      ctx.fillText(`${def.cost} AP | ${def.range}px range`, x + CARD_W / 2, y + 87);
      ctx.fillStyle = def.tempoShift > 0 ? PAL.HOT : PAL.COLD;
      ctx.font = '14px monospace';
      ctx.fillText(`${def.tempoShift > 0 ? '+' : ''}${def.tempoShift} Tempo`, x + CARD_W / 2, y + 107);
      if (def.damage > 0) {
        ctx.fillStyle = '#ff9988';
        ctx.font = '14px monospace';
        ctx.fillText(`${def.damage} DMG`, x + CARD_W / 2, y + 125);
      }
      if (def.hpCost || def.selfDamage || def.cursed) {
        ctx.fillStyle = '#ff4455';
        ctx.font = 'bold 12px monospace';
        const cw = [];
        if (def.hpCost) cw.push(`Costs ${def.hpCost} HP`);
        if (def.selfDamage) cw.push(`Costs ${def.selfDamage} HP`);
        if (def.cursed) cw.push('CURSED');
        ctx.fillText(cw.join(' · '), x + CARD_W / 2, y + 143);
      }
      ctx.fillStyle = PAL.MUTED;
      ctx.font = '12px monospace';
      this._wrapText(ctx, def.desc, x + 12, y + 162, CARD_W - 24, 15);
      this.shopBoxes.push({ x, y, w: CARD_W, h: CARD_H, cardId: shopCards[i] });
    }

    const btnW = 300, btnH = 52;
    const btnX = this.width / 2 - btnW / 2;
    const btnY = this.height - btnH - 20;
    this.leaveShopBox = this._drawActionButton(ctx, '▶  LEAVE SHOP', 'or press ENTER', btnX, btnY, btnW, btnH, '#0d2a12');
  }

  handleShopClick(mx, my) {
    if (this.leaveShopBox) {
      const b = this.leaveShopBox;
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return '__leave';
    }
    if (!this.shopBoxes) return null;
    for (const b of this.shopBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.cardId;
    }
    return null;
  }

  // ───────────── STATS SCREEN ─────────────
  drawStatsScreen(ctx, stats, score, leaderboard, waitingForInput = false) {
    ctx.fillStyle = 'rgba(0,0,0,0.93)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = stats.won ? PAL.FLOWING : PAL.CRITICAL;
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(stats.won ? 'VICTORY!' : 'DEFEATED', this.width / 2, 68);

    if (!stats.won) {
      ctx.fillStyle = PAL.MUTED;
      ctx.font = '16px monospace';
      ctx.fillText('Better luck next time.', this.width / 2, 100);
    }

    ctx.fillStyle = PAL.GOLD;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`SCORE: ${score}`, this.width / 2, 136);

    const lines = [
      ['Kills', stats.kills || 0],
      ['Rooms Cleared', stats.roomsCleared || 0],
      ['Floor Reached', stats.floor || 1],
      ['Cards Played', stats.cardsPlayed || 0],
      ['Perfect Dodges', stats.perfectDodges || 0],
      ['Highest Combo', stats.highestCombo || 0],
      ['Manual Crashes', stats.manualCrashes || 0],
      ['Relics Collected', stats.itemsCollected || 0],
      ['Run Time', `${Math.floor(stats.elapsedTime || 0)}s`],
    ];

    const startY = 172;
    const panelW = 320, panelX = this.width / 2 - panelW / 2;
    ctx.fillStyle = PAL.UI_PANEL;
    ctx.fillRect(panelX, startY - 8, panelW, lines.length * 26 + 16);
    ctx.strokeStyle = PAL.UI_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, startY - 8, panelW, lines.length * 26 + 16);

    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * 26;
      ctx.fillStyle = PAL.MUTED;
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(lines[i][0], panelX + 16, y + 16);
      ctx.textAlign = 'right';
      ctx.fillStyle = PAL.TEXT;
      ctx.fillText(String(lines[i][1]), panelX + panelW - 16, y + 16);
    }

    // Leaderboard
    if (leaderboard && leaderboard.length > 0) {
      const lbY = startY + lines.length * 26 + 28;
      ctx.fillStyle = PAL.HOT;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LEADERBOARD', this.width / 2, lbY);
      for (let i = 0; i < Math.min(5, leaderboard.length); i++) {
        const entry = leaderboard[i];
        const y = lbY + 28 + i * 22;
        ctx.fillStyle = i === 0 ? PAL.GOLD : PAL.MUTED;
        ctx.font = i === 0 ? 'bold 14px monospace' : '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}. ${entry.character || '?'} — ${entry.score} pts (Floor ${entry.floor || '?'})`, this.width / 2, y);
      }
    }

    // Final deck (cards you had when the run ended)
    if (stats.finalDeck && stats.finalDeck.length > 0) {
      const deckY = startY + lines.length * 26 + 28;
      const lbOffset = (leaderboard && leaderboard.length > 0)
        ? Math.min(5, leaderboard.length) * 22 + 60
        : 0;
      const deckStartY = deckY + lbOffset;
      const dCW = 220, dCH = 90, dCGap = 12;
      const dCols = Math.max(1, Math.floor((this.width - 40) / (dCW + dCGap)));
      ctx.fillStyle = PAL.MUTED;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`FINAL DECK (${stats.finalDeck.length} cards)`, this.width / 2, deckStartY + 18);
      const dStartX = (this.width - (Math.min(stats.finalDeck.length, dCols) * (dCW + dCGap) - dCGap)) / 2;
      for (let i = 0; i < stats.finalDeck.length; i++) {
        const def = this.cardDefs[stats.finalDeck[i]];
        if (!def) continue;
        const col = i % dCols, row = Math.floor(i / dCols);
        const dcx = dStartX + col * (dCW + dCGap);
        const dcy = deckStartY + 30 + row * (dCH + dCGap);
        const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);
        ctx.fillStyle = '#111120';
        ctx.beginPath();
        ctx.roundRect(dcx, dcy, dCW, dCH, 6);
        ctx.fill();
        // Left color accent bar
        ctx.fillStyle = def.color || '#5577aa';
        ctx.fillRect(dcx, dcy, 3, dCH);
        ctx.strokeStyle = rarCol;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(dcx, dcy, dCW, dCH, 6);
        ctx.stroke();
        // Card name
        ctx.fillStyle = PAL.TEXT;
        ctx.font = 'bold 17px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.name, dcx + dCW / 2, dcy + 22);
        // Type + cost
        ctx.fillStyle = PAL.MUTED;
        ctx.font = '13px monospace';
        ctx.fillText(`${def.type} · ${def.cost}AP`, dcx + dCW / 2, dcy + 41);
        // Damage + tempo
        if (def.damage > 0 || def.tempoShift !== 0) {
          const parts = [];
          if (def.damage > 0) parts.push(`${def.damage} DMG`);
          if (def.tempoShift !== 0) parts.push(`${def.tempoShift > 0 ? '+' : ''}${def.tempoShift} T`);
          ctx.fillStyle = def.tempoShift > 0 ? PAL.HOT : PAL.COLD;
          ctx.font = '12px monospace';
          ctx.fillText(parts.join('  '), dcx + dCW / 2, dcy + 58);
        }
        // Description (truncated)
        ctx.fillStyle = '#aaa';
        ctx.font = '11px monospace';
        const descMax = dCW - 16;
        let descText = def.desc || '';
        if (ctx.measureText(descText).width > descMax) {
          while (descText.length > 0 && ctx.measureText(descText + '…').width > descMax) descText = descText.slice(0, -1);
          descText += '…';
        }
        ctx.fillText(descText, dcx + dCW / 2, dcy + 74);
      }
    }

    // Unlocks section rendered first (behind button) — position at very bottom
    const unlockRows = (this.newUnlocks && this.newUnlocks.length > 0) ? this.newUnlocks.length : 0;
    if (unlockRows > 0) {
      const uy = this.height - 20 - unlockRows * 22;
      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.GOLD;
      ctx.font = 'bold 13px monospace';
      ctx.fillText('UNLOCKED THIS RUN:', this.width / 2, uy - 18);
      for (let i = 0; i < this.newUnlocks.length; i++) {
        ctx.fillStyle = PAL.FLOWING;
        ctx.font = '12px monospace';
        ctx.fillText(this.newUnlocks[i], this.width / 2, uy + i * 22);
      }
    }

    // Button drawn last so it appears above unlocks; position it above the unlock strip
    const unlockReserved = unlockRows > 0 ? (unlockRows * 22 + 44) : 0;
    const btnW = Math.min(400, this.width - 80);
    const btnH = 56;
    const btnX = this.width / 2 - btnW / 2;
    const btnY = this.height - unlockReserved - btnH - 24;

    if (waitingForInput) {
      this.statsReturnBox = null;
      ctx.fillStyle = '#555';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Please wait...', this.width / 2, btnY + 34);
    } else {
      this.statsReturnBox = { x: btnX, y: btnY, w: btnW, h: btnH };
      // Bright pulsing background so it's unmissable
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 300);
      ctx.fillStyle = `rgba(20,80,160,${pulse})`;
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = `rgba(100,200,255,${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(btnX, btnY, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▶  RETURN TO MENU', this.width / 2, btnY + 34);
      ctx.fillStyle = 'rgba(150,200,255,0.6)';
      ctx.font = '11px monospace';
      ctx.fillText('or press ENTER', this.width / 2, btnY + 50);
    }
  }

  // ───────────── INVENTORY OVERLAY ─────────────
  drawInventoryOverlay(ctx) {
    const ItemDefinitions = window._itemDefs || {};
    // Full-screen panel
    const panelW = this.width - 40;
    const panelH = this.height - 40;
    const px = 20, py = 20;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#0d0d1c';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 16);
    ctx.fill();
    ctx.strokeStyle = '#334466';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = PAL.TEXT;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INVENTORY', this.width / 2, py + 38);

    // Cards section
    const cardList = this.deckManager.collection;
    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CARDS (${cardList.length}/${this.deckManager.MAX_DECK_SIZE})`, px + 20, py + 66);

    const CW = 220, CH = 150, CGAP = 14;
    const CCOLS = Math.max(1, Math.floor((panelW - 40) / (CW + CGAP)));
    for (let i = 0; i < cardList.length; i++) {
      const def = this.deckManager.getCardDef(cardList[i]);
      if (!def) continue;
      const col = i % CCOLS, row = Math.floor(i / CCOLS);
      const cx = px + 20 + col * (CW + CGAP);
      const cy = py + 76 + row * (CH + CGAP);

      const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.roundRect(cx, cy, CW, CH, 6);
      ctx.fill();
      ctx.fillStyle = def.color || '#5577aa';
      ctx.fillRect(cx, cy, CW, 4);
      ctx.strokeStyle = rarCol + '99';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx, cy, CW, CH, 6);
      ctx.stroke();

      const inHand = this.deckManager.hand.indexOf(cardList[i]) >= 0;
      if (inHand) {
        ctx.fillStyle = '#44ff8822';
        ctx.beginPath();
        ctx.roundRect(cx, cy, CW, CH, 6);
        ctx.fill();
        ctx.fillStyle = '#44ff88';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('IN HAND', cx + CW - 6, cy + 14);
      }

      const lvl = this.deckManager.upgrades[cardList[i]] || 0;
      ctx.fillStyle = PAL.TEXT;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name + (lvl > 0 ? ' +' + lvl : ''), cx + CW / 2, cy + 28);
      ctx.fillStyle = rarCol;
      ctx.font = '12px monospace';
      ctx.fillText((def.rarity || 'common').toUpperCase(), cx + CW / 2, cy + 44);
      ctx.fillStyle = '#44aaff';
      ctx.font = '13px monospace';
      ctx.fillText(`${def.cost}AP · ${def.type}`, cx + CW / 2, cy + 62);
      ctx.fillStyle = def.tempoShift > 0 ? PAL.HOT : PAL.COLD;
      ctx.fillText((def.tempoShift > 0 ? '+' : '') + def.tempoShift + ' Tempo', cx + CW / 2, cy + 78);
      ctx.fillStyle = '#ccc';
      ctx.font = '12px monospace';
      this._wrapText(ctx, def.desc, cx + 8, cy + 96, CW - 16, 15);
    }

    // Relics section
    const relicList = this.itemManager ? this.itemManager.equipped : [];
    const cardRowsH = Math.ceil(cardList.length / CCOLS) * (CH + CGAP);
    const relicStartY = py + 76 + cardRowsH + 16;
    if (relicList.length > 0) {
      ctx.fillStyle = PAL.GOLD;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`RELICS (${relicList.length})`, px + 20, relicStartY);

      const RW = 240, RH = 80, RGAP = 12;
      const RCOLS = Math.max(1, Math.floor((panelW - 40) / (RW + RGAP)));
      for (let i = 0; i < relicList.length; i++) {
        const def = ItemDefinitions[relicList[i]];
        if (!def) continue;
        const col = i % RCOLS, row = Math.floor(i / RCOLS);
        const rx = px + 20 + col * (RW + RGAP);
        const ry = relicStartY + 12 + row * (RH + RGAP);
        const rarCol = def.rarity === 'rare' ? PAL.RARE : (def.rarity === 'uncommon' ? PAL.UNCOMMON : PAL.COMMON);
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.roundRect(rx, ry, RW, RH, 6);
        ctx.fill();
        ctx.strokeStyle = rarCol;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(rx, ry, RW, RH, 6);
        ctx.stroke();
        ctx.fillStyle = PAL.TEXT;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.name, rx + RW / 2, ry + 22);
        ctx.fillStyle = rarCol;
        ctx.font = '12px monospace';
        ctx.fillText(def.rarity.toUpperCase(), rx + RW / 2, ry + 38);
        ctx.fillStyle = '#bbb';
        ctx.font = '12px monospace';
        this._wrapText(ctx, def.desc, rx + 8, ry + 54, RW - 16, 13);
      }
    }

    ctx.fillStyle = PAL.MUTED;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press [I] or ESC to close', this.width / 2, py + panelH - 14);
  }

  // ───────────── DISCARD SCREEN ─────────────
  drawDiscardScreen(ctx, newCardId) {
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, this.width, this.height);

    const isBurnMode = newCardId === '__BURN__';
    ctx.fillStyle = isBurnMode ? '#ffaa44' : PAL.CRITICAL;
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isBurnMode ? 'REMOVE A CARD' : 'DECK FULL', this.width / 2, 62);

    ctx.fillStyle = PAL.TEXT;
    ctx.font = '15px monospace';
    ctx.fillText(isBurnMode ? 'Choose a card to permanently remove from your deck:' : 'You already have 6 cards. Choose one to DISCARD:', this.width / 2, 92);

    const newDef = isBurnMode ? null : (this.deckManager.getCardDef(newCardId) || CardDefinitions[newCardId]);
    if (newDef) {
      ctx.fillStyle = PAL.FLOWING;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`New card: ${newDef.name} (${newDef.cost}AP, ${newDef.type}) — click an existing card to replace it`, this.width / 2, 116);
    }

    const CARD_W = 165, CARD_H = 205, GAP = 14;
    const all = this.deckManager.collection;
    const totalW = all.length * CARD_W + (all.length - 1) * GAP;
    const startX = (this.width - totalW) / 2;
    const startY = 140;
    this.discardBoxes = [];

    for (let i = 0; i < all.length; i++) {
      const cardId = all[i];
      const def = this.deckManager.getCardDef(cardId);
      if (!def) continue;
      const x = startX + i * (CARD_W + GAP), y = startY;

      const mx = this._mouseX, my = this._mouseY;
      const isHovered = mx >= x && mx <= x + CARD_W && my >= y && my <= y + CARD_H;

      ctx.fillStyle = isHovered ? '#2a0a0a' : '#1a1a2e';
      ctx.fillRect(x, y, CARD_W, CARD_H);
      ctx.fillStyle = def.color || '#5577aa';
      ctx.fillRect(x, y, CARD_W, 3);
      ctx.strokeStyle = isHovered ? PAL.CRITICAL : (def.color || '#334466');
      ctx.lineWidth = isHovered ? 3 : 1.5;
      ctx.strokeRect(x, y, CARD_W, CARD_H);

      ctx.fillStyle = PAL.TEXT;
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + CARD_W / 2, y + 28);
      ctx.fillStyle = '#44aaff';
      ctx.font = '14px monospace';
      ctx.fillText(`${def.cost}AP | ${def.range}px`, x + CARD_W / 2, y + 49);
      ctx.fillStyle = def.tempoShift > 0 ? PAL.HOT : PAL.COLD;
      ctx.font = '13px monospace';
      ctx.fillText((def.tempoShift > 0 ? '+' : '') + def.tempoShift + ' Tempo', x + CARD_W / 2, y + 68);
      ctx.fillStyle = def.color || '#888';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(def.type.toUpperCase(), x + CARD_W / 2, y + 86);
      ctx.fillStyle = PAL.MUTED;
      ctx.font = '12px monospace';
      this._wrapText(ctx, def.desc, x + 8, y + 105, CARD_W - 16, 15);

      if (isHovered) {
        ctx.fillStyle = PAL.CRITICAL;
        ctx.font = 'bold 14px monospace';
        ctx.fillText('DISCARD THIS', x + CARD_W / 2, y + CARD_H - 12);
      }

      this.discardBoxes.push({ x, y, w: CARD_W, h: CARD_H, cardId });
    }
  }

  handleDiscardClick(mx, my) {
    if (!this.discardBoxes) return null;
    for (const b of this.discardBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.cardId;
    }
    return null;
  }

  // ─────────────────────────────────────��─────────────────────────
  // Returns array of wrapped lines without drawing (uses approximate char width for monospace)
  _wrapTextLines(text, maxWidth, fontSize) {
    if (!text) return [];
    const avgCharW = fontSize * 0.62;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharW));
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (test.length > charsPerLine && line) { lines.push(line); line = word; }
      else { line = test; }
    }
    if (line) lines.push(line);
    return lines;
  }

  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'center';
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x + maxWidth / 2, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x + maxWidth / 2, y);
    ctx.textAlign = prevAlign;
  }
}

function require_itemDefs() {
  return { ItemDefinitions: window._itemDefs || {} };
}

// ── RARITY sort order (best first)
const _RARITY_ORDER_REV = ['superleg','legendary','rare','uncommon','common'];

UI.prototype.drawCosmeticShop = function(ctx, meta, t) {
  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, this.height);
  bg.addColorStop(0, '#070712'); bg.addColorStop(1, '#0c0a1e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, this.width, this.height);

  // Title
  ctx.save();
  ctx.shadowColor = getPrismaticColor(t, 80, 60); ctx.shadowBlur = 30;
  ctx.fillStyle = getPrismaticColor(t, 70, 80);
  ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center';
  ctx.fillText('★  COSMETICS SHOP  ★', this.width/2, 52);
  ctx.restore();

  // Gold
  ctx.fillStyle = PAL.GOLD; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`${meta.getGold()} Gold`, this.width/2, 84);

  // Box stats
  const owned = meta.getOwned();
  ctx.fillStyle = PAL.MUTED; ctx.font = '13px monospace';
  ctx.fillText(`Owned: ${owned.length} / ${CosmeticDefinitions.length}  ·  Boxes opened: ${meta._ensureCosmetics().totalBoxesOpened||0}`, this.width/2, 106);

  this.cosmeticShopBoxes = [];

  // Box buttons — 2-per-row grid, large cards
  const tiers = ['bronze','silver','gold','prismatic','shadowed','elemental','infernal','shapebox'];
  const perRow = 2;
  const gap = 24;
  const BW = Math.min(420, (this.width - 80 - gap) / perRow);
  const BH = 200;
  const gridW = BW * perRow + gap;
  const startX = (this.width - gridW) / 2;
  const startY = 124;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const info = BOX_TIERS[tier];
    if (!info) continue;
    const col = i % perRow, row = Math.floor(i / perRow);
    const bx = startX + col * (BW + gap);
    const by = startY + row * (BH + gap);
    const canAfford = meta.getGold() >= info.cost;

    // Background + border
    ctx.fillStyle = canAfford ? '#111828' : '#0a0a12';
    ctx.beginPath(); ctx.roundRect(bx, by, BW, BH, 14); ctx.fill();
    if (canAfford) {
      ctx.save();
      ctx.shadowColor = info.glowColor; ctx.shadowBlur = 14;
    }
    ctx.strokeStyle = canAfford ? info.glowColor : '#333344'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(bx, by, BW, BH, 14); ctx.stroke();
    if (canAfford) ctx.restore();

    // Box icon (left side)
    const iconX = bx + 22, iconY = by + 24, iconS = 64;
    if (tier === 'prismatic') {
      ctx.strokeStyle = getPrismaticColor(t, 100, 65); ctx.lineWidth = 2.5;
      ctx.fillStyle = getPrismaticColor(t, 70, 30) + '55';
    } else {
      ctx.strokeStyle = info.color; ctx.lineWidth = 2.5;
      ctx.fillStyle = info.color + '44';
    }
    ctx.beginPath(); ctx.roundRect(iconX, iconY, iconS, iconS, 8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(iconX, iconY, iconS, iconS, 8); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
    ctx.fillText('BOX', iconX + iconS/2, iconY + iconS/2 + 6);

    // Tier name
    const tx = bx + iconS + 36;
    ctx.fillStyle = tier === 'prismatic' ? getPrismaticColor(t, 90, 80) : info.glowColor;
    ctx.font = 'bold 22px monospace'; ctx.textAlign = 'left';
    ctx.fillText(info.label, tx, by + 48);

    // Cost
    ctx.fillStyle = canAfford ? PAL.GOLD : '#555566'; ctx.font = 'bold 18px monospace';
    ctx.fillText(`${info.cost} Gold`, tx, by + 74);

    // Odds line
    ctx.fillStyle = PAL.MUTED; ctx.font = '13px monospace';
    const w = _getTierWeightLine(tier);
    if (w) ctx.fillText(w, bx + 22, by + 118);

    // Category filter line
    if (info.categoryFilter) {
      ctx.fillStyle = '#6688aa'; ctx.font = '12px monospace';
      ctx.fillText('Only: ' + info.categoryFilter.join(', '), bx + 22, by + 138);
    }

    // Buy button
    const btnX = bx + 16, btnY = by + BH - 52, btnW = BW - 32, btnH = 40;
    ctx.fillStyle = canAfford ? '#1a3a1a' : '#111111';
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 8); ctx.fill();
    ctx.strokeStyle = canAfford ? '#44ff88' : '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 8); ctx.stroke();
    ctx.fillStyle = canAfford ? '#44ff88' : '#444455'; ctx.font = 'bold 17px monospace'; ctx.textAlign = 'center';
    ctx.fillText(canAfford ? 'OPEN BOX' : 'Need more gold', bx + BW/2, btnY + 27);
    if (canAfford) this.cosmeticShopBoxes.push({ x:btnX, y:btnY, w:btnW, h:btnH, action:'buy_box', tier });
  }

  // Back button
  const rows = Math.ceil(tiers.length / perRow);
  const backW = 200, backH = 48, backX = (this.width - backW) / 2;
  const backY = startY + rows * (BH + gap) + 8;
  ctx.fillStyle = '#1a1a2a';
  ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 10); ctx.fill();
  ctx.strokeStyle = '#445566'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = PAL.MUTED; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
  ctx.fillText('← Back', this.width/2, backY + 32);
  this.cosmeticShopBoxes.push({ x:backX, y:backY, w:backW, h:backH, action:'back' });
};

function _getTierWeightLine(tier) {
  const w = { bronze:'C:60% U:28% R:10% L:2% SL:0.5%', silver:'C:30% U:40% R:24% L:5% SL:1%', gold:'U:20% R:55% L:23% SL:2%', prismatic:'R:30% L:60% SL:10%' };
  return w[tier] || '';
}

// ── COSMETIC PANEL ──────────────────────────────────────────────────────────────

UI.prototype.drawCosmeticPanel = function(ctx, charId, activeTab, meta, t) {
  const { Characters } = window._charData || {};
  const ch = Characters && Characters[charId];

  // Background
  ctx.fillStyle = '#07070f'; ctx.fillRect(0, 0, this.width, this.height);

  // Header
  const charColor = ch ? ch.color : '#aaaacc';
  ctx.fillStyle = charColor; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`Customize: ${ch?.name || charId}`, this.width/2, 42);
  ctx.fillStyle = PAL.MUTED; ctx.font = '13px monospace';
  ctx.fillText('Click any owned cosmetic to equip it  ·  Click again to unequip', this.width/2, 64);

  this.cosmeticPanelBoxes = [];

  // Category tabs
  const cats = Object.keys(CATEGORY_LABELS);
  const tabW = Math.min(150, (this.width-40)/cats.length);
  const tabH = 46;
  const tabsX = (this.width - cats.length*tabW)/2;
  const tabsY = 78;
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    const tx = tabsX + i*tabW;
    const isActive = cat === activeTab;
    ctx.fillStyle = isActive ? '#1a2a3a' : '#0d0d18';
    ctx.beginPath(); ctx.roundRect(tx, tabsY, tabW-3, tabH, 6); ctx.fill();
    ctx.strokeStyle = isActive ? charColor : '#222233'; ctx.lineWidth = isActive?2.5:1;
    ctx.stroke();
    ctx.fillStyle = isActive ? charColor : PAL.MUTED;
    ctx.font = isActive ? 'bold 14px monospace' : '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(CATEGORY_LABELS[cat], tx+tabW/2-1, tabsY+29);
    this.cosmeticPanelBoxes.push({ x:tx, y:tabsY, w:tabW-3, h:tabH, action:'tab', tab:cat });
  }

  const contentY = tabsY + tabH + 12;
  const equipped = meta.getEquipped(charId);

  // Preview panel — right side
  const prevW = 250, prevH = this.height - contentY - 16;
  const prevX = this.width - prevW - 16;
  const prevY = contentY;
  ctx.fillStyle = '#0f0f1c';
  ctx.beginPath(); ctx.roundRect(prevX, prevY, prevW, prevH, 10); ctx.fill();
  ctx.strokeStyle = charColor + '66'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle = charColor; ctx.font='bold 16px monospace'; ctx.textAlign='center';
  ctx.fillText('PREVIEW', prevX+prevW/2, prevY+24);

  // Draw preview player
  const pCX = prevX+prevW/2, pCY = prevY+100;
  const pR = 36;
  const eq = meta.getEquipped(charId);
  const bodyDef = CosmeticById[eq.bodyColor];
  const outlineDef = CosmeticById[eq.outlineColor];
  const shapeDef = CosmeticById[eq.shape];
  const auraDef = CosmeticById[eq.aura];
  const shapeName = shapeDef?.value || 'circle';

  if (auraDef) drawPlayerAura(ctx, pCX, pCY, pR, auraDef.value, t, 50);

  if (bodyDef?.animated && bodyDef.animFn) {
    bodyDef.animFn(ctx, pCX, pCY, pR, t);
  } else {
    const fillCol = bodyDef?.value || charColor;
    if (shapeDef?.animated && shapeDef.animFn) {
      shapeDef.animFn(ctx, pCX, pCY, pR, t, fillCol);
    } else {
      ctx.fillStyle = fillCol;
      drawPlayerShape(ctx, pCX, pCY, pR, shapeName);
      ctx.fill();
    }
  }
  if (outlineDef) {
    if (outlineDef.animated && outlineDef.animFn) {
      outlineDef.animFn(ctx, pCX, pCY, pR, t);
    } else {
      ctx.strokeStyle = outlineDef.value; ctx.lineWidth=1.5;
      drawPlayerShape(ctx, pCX, pCY, pR, shapeName); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.arc(pCX-2, pCY-2, pR*0.3, 0, Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.fill();

  // Equipped slots list in preview
  let slotY = prevY+170;
  ctx.textAlign='left';
  for (const cat of cats) {
    const eqId = eq[cat];
    const eDef = CosmeticById[eqId];
    ctx.fillStyle = PAL.MUTED; ctx.font='12px monospace';
    ctx.fillText(CATEGORY_LABELS[cat]+':', prevX+12, slotY);
    ctx.fillStyle = eDef ? (RARITY_COLORS[eDef.rarity]||'#fff') : '#333344';
    ctx.font = eDef ? 'bold 12px monospace' : '12px monospace';
    ctx.fillText(eDef ? eDef.name : 'None', prevX+12, slotY+16);
    slotY += 36;
  }

  // Grid of owned items in active tab
  const gridX = 16, gridW = prevX - 32;
  const owned = meta.getOwned();
  const inCat = owned
    .map(id => CosmeticById[id])
    .filter(c => c && c.category === activeTab)
    .sort((a,b) => _RARITY_ORDER_REV.indexOf(a.rarity) - _RARITY_ORDER_REV.indexOf(b.rarity));

  const IW=178, IH=68, IGAP=10;
  const cols = Math.max(1, Math.floor((gridW+IGAP)/(IW+IGAP)));
  const equippedId = eq[activeTab];

  if (inCat.length === 0) {
    ctx.fillStyle = PAL.MUTED; ctx.font='14px monospace'; ctx.textAlign='center';
    ctx.fillText('No owned cosmetics in this category.', gridX+gridW/2, contentY+60);
    ctx.fillText('Open boxes in the Cosmetics Shop!', gridX+gridW/2, contentY+82);
  }

  for (let ii = 0; ii < inCat.length; ii++) {
    const cDef = inCat[ii];
    const col = ii%cols, row = Math.floor(ii/cols);
    const ix = gridX + col*(IW+IGAP);
    const iy = contentY + row*(IH+IGAP);
    if (iy + IH > this.height - 16) break;

    const isEquipped = cDef.id === equippedId;
    const rarCol = RARITY_COLORS[cDef.rarity] || '#888';

    ctx.fillStyle = isEquipped ? '#1a2a1a' : '#0f0f1c';
    ctx.beginPath(); ctx.roundRect(ix, iy, IW, IH, 6); ctx.fill();
    ctx.strokeStyle = isEquipped ? '#44ff88' : rarCol+'66'; ctx.lineWidth = isEquipped?2:1;
    ctx.stroke();
    // Top rarity bar
    ctx.fillStyle = rarCol; ctx.fillRect(ix+2, iy+2, IW-4, 3);

    // Mini cosmetic swatch
    const swX=ix+10, swY=iy+IH/2, swR=18;
    if (cDef.category==='bodyColor') {
      if (cDef.animated && cDef.animFn) { cDef.animFn(ctx, swX+swR, swY, swR, t); }
      else { ctx.fillStyle=cDef.value||'#888'; ctx.beginPath(); ctx.arc(swX+swR,swY,swR,0,Math.PI*2); ctx.fill(); }
    } else if (cDef.category==='shape' && cDef.value) {
      ctx.fillStyle='#44dd88';
      if (cDef.animated&&cDef.animFn) { cDef.animFn(ctx,swX+swR,swY,swR,t,'#44dd88'); }
      else { drawPlayerShape(ctx,swX+swR,swY,swR,cDef.value); ctx.fill(); }
    } else if (cDef.category==='outlineColor') {
      ctx.fillStyle='#1a1a2a'; ctx.beginPath(); ctx.arc(swX+swR,swY,swR,0,Math.PI*2); ctx.fill();
      if (cDef.animated&&cDef.animFn) { cDef.animFn(ctx,swX+swR,swY,swR,t); }
      else { ctx.strokeStyle=cDef.value; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(swX+swR,swY,swR,0,Math.PI*2); ctx.stroke(); }
    } else if (cDef.category==='trail') {
      const tc=cDef.id==='trail_prism'?getPrismaticColor(t):cDef.value||'#888';
      ctx.fillStyle=tc; ctx.fillRect(swX,swY-5,swR*2,10);
    } else if (cDef.category==='flash') {
      const fc=cDef.animated?getPrismaticColor(t):cDef.value||'#fff';
      ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(swX+swR,swY,swR,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=fc+'88'; ctx.beginPath(); ctx.arc(swX+swR,swY,swR,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=fc; ctx.beginPath(); ctx.arc(swX+swR,swY,swR*0.5,0,Math.PI*2); ctx.fill();
    } else if (cDef.category==='deathBurst') {
      ctx.fillStyle=cDef.value||'#888';
      for (let pi=0;pi<6;pi++) {
        const pa=(pi/6)*Math.PI*2; const pr=swR;
        ctx.beginPath(); ctx.moveTo(swX+swR,swY); ctx.lineTo(swX+swR+Math.cos(pa)*pr,swY+Math.sin(pa)*pr); ctx.stroke();
        ctx.beginPath(); ctx.arc(swX+swR+Math.cos(pa)*pr,swY+Math.sin(pa)*pr,3,0,Math.PI*2); ctx.fill();
      }
    } else if (cDef.category==='aura') {
      ctx.fillStyle='#44dd88'; ctx.beginPath(); ctx.arc(swX+swR,swY,swR*0.5,0,Math.PI*2); ctx.fill();
      drawPlayerAura(ctx,swX+swR,swY,swR*0.5,cDef.value,t,50);
    } else if (cDef.category==='killEffect') {
      // Starburst icon
      ctx.strokeStyle=RARITY_COLORS[cDef.rarity]||'#fff'; ctx.lineWidth=1.5;
      for(let _ki2=0;_ki2<8;_ki2++){
        const _ka=((_ki2)/8)*Math.PI*2;
        ctx.beginPath(); ctx.moveTo(swX+swR,swY);
        ctx.lineTo(swX+swR+Math.cos(_ka)*swR,swY+Math.sin(_ka)*swR); ctx.stroke();
      }
      ctx.fillStyle=RARITY_COLORS[cDef.rarity]||'#fff';
      ctx.beginPath(); ctx.arc(swX+swR,swY,4,0,Math.PI*2); ctx.fill();
    } else if (cDef.category==='title') {
      ctx.fillStyle=cDef.animated?getPrismaticColor(t,100,70):(cDef.color||'#ffdd88');
      ctx.font='bold 9px monospace'; ctx.textAlign='left';
      const _tv=cDef.value||'';
      ctx.fillText(_tv.length>10?_tv.slice(0,10)+'…':_tv, swX, swY+4);
    } else {
      const pc=cDef.value&&cDef.value.startsWith('#')?cDef.value:'#44dd88';
      ctx.fillStyle=pc; ctx.beginPath(); ctx.arc(swX+swR,swY,swR,0,Math.PI*2); ctx.fill();
    }

    // Name + rarity
    ctx.fillStyle=isEquipped?'#88ffaa':'#ddeeff'; ctx.font=`${isEquipped?'bold ':''}14px monospace`; ctx.textAlign='left';
    ctx.fillText(cDef.name, ix+IW*0.36, iy+26);
    ctx.fillStyle=rarCol; ctx.font='11px monospace';
    ctx.fillText(RARITY_LABELS[cDef.rarity]||cDef.rarity, ix+IW*0.36, iy+42);
    if (isEquipped) {
      ctx.fillStyle='#44ff88'; ctx.font='bold 11px monospace';
      ctx.fillText('EQUIPPED', ix+IW*0.36, iy+58);
    }

    const action = isEquipped ? 'unequip' : 'equip';
    this.cosmeticPanelBoxes.push({ x:ix, y:iy, w:IW, h:IH, action, category:activeTab, cosmeticId:cDef.id });
  }

  // Back button
  const backW=210, backH=46;
  const backX=prevX+(prevW-backW)/2, backY=this.height-backH-16;
  ctx.fillStyle='#1a1a2a'; ctx.beginPath(); ctx.roundRect(backX,backY,backW,backH,10); ctx.fill();
  ctx.strokeStyle='#556677'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle=PAL.MUTED; ctx.font='bold 17px monospace'; ctx.textAlign='center';
  ctx.fillText('\u2190 Back', backX+backW/2, backY+30);
  this.cosmeticPanelBoxes.push({ x:backX, y:backY, w:backW, h:backH, action:'back' });
};
