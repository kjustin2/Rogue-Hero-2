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
    // In menu mode, B button → escape (back) instead of dodge. Gameplay
    // leaves B mapped to dodge since that's the combat expectation.
    const inMenu = !!(opts && opts.inMenu);
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

      const isP1 = i === 0;
      if (i > 1) continue; // we only support pads 0 and 1 for now

      // Cursor + A button ALWAYS work for pad 0 so menus are navigable even
      // before the player has clicked the gamepad toggle on. (P2's A maps to
      // 'q' which is in-game; gate it behind enabled to avoid keyboard fights.)
      if (isP1 && this.canvas) {
        const mag2 = rx * rx + ry * ry;
        if (mag2 > 0.04) {
          const speed = 12;
          this.mouse.x = Math.max(0, Math.min(this.canvas.width,  this.mouse.x + rx * speed));
          this.mouse.y = Math.max(0, Math.min(this.canvas.height, this.mouse.y + ry * speed));
        }
        if (btns[0] && !prevBtns[0]) {
          this.mouse.justClicked = true;
          this.mouse.leftDown = true;
        } else if (!btns[0] && prevBtns[0]) {
          this.mouse.leftDown = false;
        }
        // Start always advances menus (lobby code, draft, etc.)
        if (btns[9] && !prevBtns[9]) this.justPressed.add('enter');
        // Back/Select always escapes
        if (btns[8] && !prevBtns[8]) this.justPressed.add('escape');
        // In menus, B (btn 1) acts as back so players don't have to hunt for
        // the tiny Select/Back button on Xbox pads. Suppress the dodge-space
        // emit below since we're not in gameplay.
        if (inMenu && btns[1] && !prevBtns[1]) this.justPressed.add('escape');
      }

      // Everything else (movement, dodge, card slot keys, in-game P2 fire)
      // is gated by the per-slot enable so a connected-but-disabled pad can't
      // fight the keyboard during gameplay.
      if (!enabled) continue;

      // Edge-trigger buttons → justPressed map.
      // Mapping (Xbox layout, both pads):
      //   A      → attack / click / confirm (P2 emits 'q')
      //   B      → dodge (P1: space, P2: e) / back in menus (escape)
      //   X      → cycle PREVIOUS card slot
      //   Y      → cycle NEXT card slot
      //   LB     → quick-select card slot 1
      //   RB     → quick-select card slot 4
      //   D-pad  → direct slot select (Up=1, Right=2, Down=3, Left=4)
      //   Start  → enter (start combat / advance menus)
      const dodgeKey = isP1 ? ' ' : 'e';
      const fireKey  = isP1 ? null : 'q';   // P1 fires via mouse click
      // P1 in solo uses 1-4; in coop uses 7-0 (right cluster). P2 always 1-4.
      const cardKeys = isP1 ? (localCoop ? ['7','8','9','0'] : ['1','2','3','4']) : ['1','2','3','4'];

      // P2's A → fire 'q' (only when enabled, since this is gameplay input)
      if (!isP1 && fireKey) {
        if (btns[0] && !prevBtns[0]) this.justPressed.add(fireKey);
      }
      // B button (idx 1): dodge. In menus the always-on block above remaps B
      // to 'escape', so skip the dodge emit here to avoid double-firing it.
      if (btns[1] && !prevBtns[1] && !(isP1 && inMenu)) {
        this.justPressed.add(dodgeKey);
      }
      // X (idx 2): cycle PREVIOUS card slot (right-click on P1; key on P2).
      if (btns[2] && !prevBtns[2]) {
        if (isP1) this.mouse.justRightClicked = true;
        else this.justPressed.add(cardKeys[0]);
      }
      // Y (idx 3): cycle NEXT card slot — main "scroll cards" button.
      if (btns[3] && !prevBtns[3]) {
        if (isP1) this.mouse.justRightClicked = true;
        else this.justPressed.add(cardKeys[1]);
      }
      // LB (idx 4): jump to card slot 1
      if (btns[4] && !prevBtns[4]) this.justPressed.add(cardKeys[0]);
      // RB (idx 5): jump to card slot 4
      if (btns[5] && !prevBtns[5]) this.justPressed.add(cardKeys[3]);
      // D-pad (idx 12-15): direct slot select Up=1, Right=2, Down=3, Left=4
      if (btns[12] && !prevBtns[12]) this.justPressed.add(cardKeys[0]);
      if (btns[13] && !prevBtns[13]) this.justPressed.add(cardKeys[2]);
      if (btns[14] && !prevBtns[14]) this.justPressed.add(cardKeys[3]);
      if (btns[15] && !prevBtns[15]) this.justPressed.add(cardKeys[1]);

      // Right stick on P1's pad → move the mouse cursor for aim (in-game).
      // Menu cursor movement is already handled in the always-on block above;
      // this duplicate covers in-game aim — same code, same speed.
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

  // Live state for the sanity-test UI: { connected, enabled, btns, lx, ly, rx, ry }
  getGamepadState(slot) {
    const g = this._gpState && this._gpState[slot];
    if (!g) return { connected: false, enabled: false, btns: [], lx: 0, ly: 0, rx: 0, ry: 0 };
    return g;
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

  // Update P2 reticle. Default mode is auto-aim toward closest enemy. While
  // P2 holds I/J/K/L, switch to MANUAL aim — the reticle nudges in that
  // direction at a constant speed and stays put. Releasing all I/J/K/L
  // returns to auto-aim. Called each frame by main.js before p2.updateLogic.
  updateP2Reticle(p2, dt, enemies) {
    if (!this._p2View) return;
    const v = this._p2View;
    if (!v._aimInit) { v._aimX = p2.x + 60; v._aimY = p2.y; v._aimInit = true; }
    // Manual aim override — I/J/K/L like a virtual stick.
    const up = this.keys.has('i'), down = this.keys.has('k');
    const lt = this.keys.has('j'), rt = this.keys.has('l');
    const manual = up || down || lt || rt;
    if (manual) {
      v._manualMode = true;
      v._manualHoldTimer = 1.5; // stay manual for 1.5s after last input
      const speed = 480; // px/s — feels close to a fast cursor
      if (lt) v._aimX -= speed * dt;
      if (rt) v._aimX += speed * dt;
      if (up) v._aimY -= speed * dt;
      if (down) v._aimY += speed * dt;
      // Clamp to canvas
      if (this.canvas) {
        v._aimX = Math.max(0, Math.min(this.canvas.width, v._aimX));
        v._aimY = Math.max(0, Math.min(this.canvas.height, v._aimY));
      }
    } else if (v._manualMode) {
      v._manualHoldTimer -= dt;
      if (v._manualHoldTimer <= 0) v._manualMode = false;
    }
    if (!v._manualMode) {
      // Auto-aim: closest alive enemy
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
        const tx = target.x, ty = target.y;
        const lerp = Math.min(1, dt * 8);
        v._aimX += (tx - v._aimX) * lerp;
        v._aimY += (ty - v._aimY) * lerp;
      } else {
        const tx = p2.x + 80, ty = p2.y;
        const lerp = Math.min(1, dt * 4);
        v._aimX += (tx - v._aimX) * lerp;
        v._aimY += (ty - v._aimY) * lerp;
      }
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
