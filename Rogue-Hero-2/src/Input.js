export class InputManager {
  constructor(canvas) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { x: 0, y: 0, leftDown: false, rightDown: false, justClicked: false, justRightClicked: false };
    this.canvas = canvas;

    // Touch state
    this.isTouchDevice = false;
    this.touchJoystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
    this.touchButtons = [];

    // Gamepad state — populated by pollGamepads() each frame
    this._gpState = [null, null, null, null];

    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', e => {
        console.log('[Input] Gamepad connected:', e.gamepad?.id || '?');
      });
      window.addEventListener('gamepaddisconnected', e => {
        console.log('[Input] Gamepad disconnected:', e.gamepad?.id || '?');
      });
    }

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.justPressed.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', e => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.justPressed.clear();
      this.mouse.leftDown = false;
      this.mouse.rightDown = false;
      this.touchJoystick.active = false;
    });

    window.addEventListener('mousemove', e => this.updateMousePos(e));

    canvas.addEventListener('mousedown', e => {
      this.updateMousePos(e);
      if (e.button === 0) { this.mouse.leftDown = true; this.mouse.justClicked = true; }
      if (e.button === 2) { this.mouse.rightDown = true; this.mouse.justRightClicked = true; }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.leftDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Touch controls
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this.isTouchDevice = true;
      for (const touch of e.changedTouches) {
        const pos = this._touchPos(touch);
        // Left half = joystick
        if (pos.x < canvas.width / 2) {
          this.touchJoystick.active = true;
          this.touchJoystick.startX = pos.x;
          this.touchJoystick.startY = pos.y;
          this.touchJoystick.dx = 0;
          this.touchJoystick.dy = 0;
          this.touchJoystick.id = touch.identifier;
        } else {
          // Right half = attack / interact
          this.mouse.x = pos.x;
          this.mouse.y = pos.y;
          this.mouse.justClicked = true;
          this.mouse.leftDown = true;

          // Check virtual button zones
          const relY = pos.y / canvas.height;
          if (relY < 0.3) {
            this.justPressed.add(' '); // Dodge
          } else {
            // Map to card slots based on position
            const relX = (pos.x - canvas.width / 2) / (canvas.width / 2);
            const slot = Math.min(3, Math.floor(relX * 4));
            this.justPressed.add((slot + 1).toString());
          }
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (this.touchJoystick.active && touch.identifier === this.touchJoystick.id) {
          const pos = this._touchPos(touch);
          this.touchJoystick.dx = pos.x - this.touchJoystick.startX;
          this.touchJoystick.dy = pos.y - this.touchJoystick.startY;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
      for (const touch of e.changedTouches) {
        if (this.touchJoystick.active && touch.identifier === this.touchJoystick.id) {
          this.touchJoystick.active = false;
          this.touchJoystick.dx = 0;
          this.touchJoystick.dy = 0;
        }
      }
      this.mouse.leftDown = false;
    });
  }

  _touchPos(touch) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  }

  updateMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mouse.x = (e.clientX - rect.left) * scaleX;
    this.mouse.y = (e.clientY - rect.top) * scaleY;
  }

  // Virtual joystick direction keys
  isDown(key) {
    if (this.keys.has(key)) return true;
    // Map touch joystick to WASD
    if (this.touchJoystick.active) {
      const deadzone = 15;
      if (key === 'a' || key === 'arrowleft')  return this.touchJoystick.dx < -deadzone;
      if (key === 'd' || key === 'arrowright') return this.touchJoystick.dx > deadzone;
      if (key === 'w' || key === 'arrowup')    return this.touchJoystick.dy < -deadzone;
      if (key === 's' || key === 'arrowdown')  return this.touchJoystick.dy > deadzone;
    }
    // Map gamepad #0 left stick → P1 movement.
    // In solo P1 reads either WASD or arrows; in coop P1 reads arrows (P2 takes WASD).
    // Only forward to WASD in solo so pad 0 doesn't double-control P2 when both share.
    const gp0 = this._gpState[0];
    if (gp0 && gp0.connected && gp0.enabled !== false) {
      const dz = 0.30;
      const allowWasd = !gp0.localCoop;
      if ((key === 'arrowleft'  || (allowWasd && key === 'a')) && gp0.lx < -dz) return true;
      if ((key === 'arrowright' || (allowWasd && key === 'd')) && gp0.lx >  dz) return true;
      if ((key === 'arrowup'    || (allowWasd && key === 'w')) && gp0.ly < -dz) return true;
      if ((key === 'arrowdown'  || (allowWasd && key === 's')) && gp0.ly >  dz) return true;
    }
    // Gamepad #1 left stick → P2's WASD (in coop the keyboard P2 uses arrows; pad takes over)
    const gp1 = this._gpState[1];
    if (gp1 && gp1.connected && gp1.enabled !== false) {
      const dz = 0.30;
      if (key === 'a' && gp1.lx < -dz) return true;
      if (key === 'd' && gp1.lx >  dz) return true;
      if (key === 'w' && gp1.ly < -dz) return true;
      if (key === 's' && gp1.ly >  dz) return true;
    }
    return false;
  }

  // RH2: poll connected gamepads each frame. P1 = pad 0, P2 = pad 1.
  // Buttons: A(0)=attack, B(1)=dodge, X/Y/LB/RB → card slots 1-4.
  // Right stick on pad 0 moves the mouse cursor for aim.
  // `opts.enabledP1` / `opts.enabledP2` gate per-slot input so a plugged-in
  // controller never silently overrides the keyboard. `opts.localCoop` swaps
  // the P1 card-slot keys to match coop's 7890 cluster instead of 1234.
  pollGamepads(opts) {
    const enabledP1 = !opts || opts.enabledP1 !== false; // default on for backward compat
    const enabledP2 = !!(opts && opts.enabledP2);
    const localCoop = !!(opts && opts.localCoop);
    if (!this._gpState) this._gpState = [null, null, null, null];
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const pad = pads && pads[i];
      const prev = this._gpState[i];
      if (!pad || !pad.connected) {
        if (prev) this._gpState[i] = { connected: false, lx: 0, ly: 0, btns: [] };
        continue;
      }
      const lx = pad.axes[0] || 0;
      const ly = pad.axes[1] || 0;
      const rx = pad.axes[2] || 0;
      const ry = pad.axes[3] || 0;
      const btns = pad.buttons.map(b => !!b.pressed);
      const prevBtns = (prev && prev.btns) || [];
      const enabled = (i === 0) ? enabledP1 : (i === 1 ? enabledP2 : false);
      const newState = { connected: true, lx, ly, rx, ry, btns, enabled, localCoop };
      this._gpState[i] = newState;

      // Per-slot enable: still track connected/state for UI, but skip input dispatch
      const isP1 = i === 0;
      if (!enabled) continue;
      if (i > 1) continue; // we only support pads 0 and 1 for now

      // Edge-trigger buttons → justPressed map
      const dodgeKey = isP1 ? ' ' : 'e';
      const fireKey  = isP1 ? null : 'q';   // P1 fires via mouse click
      // P1 in solo uses 1-4; in coop uses 7-0 (right cluster). P2 always 1-4 (left cluster).
      const cardKeys = isP1 ? (localCoop ? ['7','8','9','0'] : ['1','2','3','4']) : ['1','2','3','4'];

      // A button (idx 0)
      if (btns[0] && !prevBtns[0]) {
        if (isP1) {
          this.mouse.justClicked = true;
          this.mouse.leftDown = true;
        } else if (fireKey) {
          this.justPressed.add(fireKey);
        }
      } else if (!btns[0] && prevBtns[0] && isP1) {
        this.mouse.leftDown = false;
      }
      // B button (idx 1) → dodge
      if (btns[1] && !prevBtns[1]) this.justPressed.add(dodgeKey);
      // X / Y → cycle card slot
      if (btns[2] && !prevBtns[2]) this.justPressed.add(cardKeys[0]);
      if (btns[3] && !prevBtns[3]) this.justPressed.add(cardKeys[1]);
      // Bumpers (4/5) → card 3/4
      if (btns[4] && !prevBtns[4]) this.justPressed.add(cardKeys[2]);
      if (btns[5] && !prevBtns[5]) this.justPressed.add(cardKeys[3]);

      // Start (9) → enter (menus / start combat)
      if (btns[9] && !prevBtns[9]) this.justPressed.add('enter');

      // Right stick on P1's pad → move the mouse cursor for aim
      if (isP1 && this.canvas) {
        const mag2 = rx * rx + ry * ry;
        if (mag2 > 0.04) {
          const speed = 12; // px/frame at full deflection
          this.mouse.x = Math.max(0, Math.min(this.canvas.width,  this.mouse.x + rx * speed));
          this.mouse.y = Math.max(0, Math.min(this.canvas.height, this.mouse.y + ry * speed));
        }
      }
    }
  }

  // True if the slot's pad is physically connected (regardless of enable flag).
  isGamepadConnected(slot) {
    const g = this._gpState && this._gpState[slot];
    return !!(g && g.connected);
  }

  // True if any gamepad is currently connected (UI hint)
  hasGamepad() {
    if (!this._gpState) return false;
    return this._gpState.some(g => g && g.connected);
  }

  // ── RH2: Player-2 view (left-hand cluster, no mouse).
  //   movement: W A S D
  //   aim:      auto — toward nearest alive enemy (set by updateP2Reticle)
  //   attack:   Q   (becomes p2View.mouse.justClicked)
  //   dodge:    E   (mapped from consumeKey(' '))
  //   cards:    1 / 2 / 3 / 4 → consumeKey('1'..'4') passes through directly
  player2View() {
    const self = this;
    if (this._p2View) return this._p2View;
    const view = {
      _aimX: 0, _aimY: 0,
      mouse: { x: 0, y: 0, leftDown: false, rightDown: false, justClicked: false, justRightClicked: false },
      isDown(key) {
        // P2 owns WASD only — never arrows
        if (key === 'a') return self.keys.has('a');
        if (key === 'd') return self.keys.has('d');
        if (key === 'w') return self.keys.has('w');
        if (key === 's') return self.keys.has('s');
        // Block arrow lookups so player.js movement check never reads P1's keys
        return false;
      },
      consumeKey(key) {
        if (key === ' ') return self._consumeAny(['e']);  // P2 dodge
        return self.consumeKey(key);
      },
    };
    this._p2View = view;
    return view;
  }

  // Update P2 reticle: auto-aim toward the closest alive enemy.
  // Called each frame by main.js before p2.updateLogic, with the enemies list.
  updateP2Reticle(p2, dt, enemies) {
    if (!this._p2View) return;
    const v = this._p2View;
    if (!v._aimInit) { v._aimX = p2.x + 60; v._aimY = p2.y; v._aimInit = true; }
    // Find closest alive enemy
    let target = null, bestD = Infinity;
    if (enemies) {
      for (const e of enemies) {
        if (!e.alive || e._dying) continue;
        const dx = e.x - p2.x, dy = e.y - p2.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; target = e; }
      }
    }
    if (target) {
      // Smooth-chase the target so the reticle isn't snappy
      const tx = target.x, ty = target.y;
      const lerp = Math.min(1, dt * 8);
      v._aimX += (tx - v._aimX) * lerp;
      v._aimY += (ty - v._aimY) * lerp;
    } else {
      // Idle: park reticle slightly ahead of P2's facing
      const tx = p2.x + 80, ty = p2.y;
      const lerp = Math.min(1, dt * 4);
      v._aimX += (tx - v._aimX) * lerp;
      v._aimY += (ty - v._aimY) * lerp;
    }
    v.mouse.x = v._aimX; v.mouse.y = v._aimY;
    // Q press → fire selected card
    if (this.justPressed.has('q')) {
      this.justPressed.delete('q');
      v.mouse.justClicked = true;
      v.mouse.leftDown = true;
    } else {
      v.mouse.justClicked = false;
      v.mouse.leftDown = this.keys.has('q');
    }
  }

  _consumeAny(keys) {
    for (const k of keys) {
      if (this.justPressed.has(k)) { this.justPressed.delete(k); return true; }
    }
    return false;
  }

  consumeClick() {
    if (this.mouse.justClicked) {
      this.mouse.justClicked = false;
      return true;
    }
    return false;
  }

  consumeRightClick() {
    if (this.mouse.justRightClicked) {
      this.mouse.justRightClicked = false;
      return true;
    }
    return false;
  }

  consumeKey(key) {
    if (this.justPressed.has(key)) {
      this.justPressed.delete(key);
      return true;
    }
    return false;
  }

  clearFrame() {
    this.mouse.justClicked = false;
    this.mouse.justRightClicked = false;
    this.justPressed.clear();
  }

  // Draw virtual controls (only on touch devices)
  drawTouchControls(ctx) {
    if (!this.isTouchDevice) return;

    // Left side: joystick
    const jx = 100, jy = ctx.canvas.height - 120, jr = 50;
    ctx.beginPath();
    ctx.arc(jx, jy, jr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (this.touchJoystick.active) {
      const maxDist = 40;
      let dx = this.touchJoystick.dx, dy = this.touchJoystick.dy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
      ctx.beginPath();
      ctx.arc(jx + dx, jy + dy, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    // Right side: card buttons
    const btnW = 55, btnH = 40, btnGap = 8;
    const btnStartX = ctx.canvas.width - (btnW * 4 + btnGap * 3) - 20;
    const btnY = ctx.canvas.height - 70;
    for (let i = 0; i < 4; i++) {
      const bx = btnStartX + i * (btnW + btnGap);
      ctx.fillStyle = 'rgba(68,170,255,0.15)';
      ctx.fillRect(bx, btnY, btnW, btnH);
      ctx.strokeStyle = 'rgba(68,170,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, btnY, btnW, btnH);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, bx + btnW / 2, btnY + 26);
    }

    // Dodge button
    const dodgeX = ctx.canvas.width - 80, dodgeY = ctx.canvas.height - 180;
    ctx.beginPath();
    ctx.arc(dodgeX, dodgeY, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100,200,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,200,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DODGE', dodgeX, dodgeY + 4);
  }
}
