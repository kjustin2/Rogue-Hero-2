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
    return false;
  }

  // ── RH2: Player-2 view (arrow keys + numpad). Returns an object that
  // looks enough like the primary InputManager that player.updateLogic
  // can run unchanged. mouse.x/y track the P2 reticle (numpad-aimed).
  // P2 controls:
  //   movement: arrow keys
  //   dodge: rshift (Right Shift) — Space stays for P1
  //   aim: numpad 4/8/6/2 (or hold-and-rotate), reticle follows P2
  //   fire: numpad 0
  //   cycle card: numpad . (period)
  //   card slots: numpad 1/2/3/4
  player2View() {
    const self = this;
    if (this._p2View) return this._p2View;
    const view = {
      _aimX: 0, _aimY: 0,
      mouse: { x: 0, y: 0, leftDown: false, rightDown: false, justClicked: false, justRightClicked: false },
      isDown(key) {
        // remap WASD calls in player.js to arrow keys
        if (key === 'a' || key === 'arrowleft')  return self.keys.has('arrowleft');
        if (key === 'd' || key === 'arrowright') return self.keys.has('arrowright');
        if (key === 'w' || key === 'arrowup')    return self.keys.has('arrowup');
        if (key === 's' || key === 'arrowdown')  return self.keys.has('arrowdown');
        return false;
      },
      consumeKey(key) {
        // Space → numpad 5 / RShift for P2 dodge
        if (key === ' ') return self._consumeAny(['shift', 'numpad5']);
        return self.consumeKey(key);
      },
    };
    this._p2View = view;
    return view;
  }

  // Update P2 reticle relative to a player position; called each frame
  // by main.js with players.list[1] before player2.updateLogic.
  updateP2Reticle(p2, dt) {
    if (!this._p2View) return;
    const v = this._p2View;
    let dx = 0, dy = 0;
    if (this.keys.has('numpad4')) dx -= 1;
    if (this.keys.has('numpad6')) dx += 1;
    if (this.keys.has('numpad8')) dy -= 1;
    if (this.keys.has('numpad2')) dy += 1;
    // Move reticle relative to p2; default 220 px ahead of P2
    if (!v._aimInit) { v._aimX = p2.x + 60; v._aimY = p2.y; v._aimInit = true; }
    if (dx || dy) {
      const len = Math.sqrt(dx * dx + dy * dy);
      v._aimX += (dx / len) * 600 * dt;
      v._aimY += (dy / len) * 600 * dt;
    }
    // Keep reticle near P2 (radius cap)
    const rdx = v._aimX - p2.x, rdy = v._aimY - p2.y;
    const d = Math.sqrt(rdx * rdx + rdy * rdy);
    const max = 320;
    if (d > max) { v._aimX = p2.x + (rdx / d) * max; v._aimY = p2.y + (rdy / d) * max; }
    v.mouse.x = v._aimX; v.mouse.y = v._aimY;
    // Fire: numpad 0
    if (this.justPressed.has('numpad0')) {
      this.justPressed.delete('numpad0');
      v.mouse.justClicked = true;
      v.mouse.leftDown = true;
    } else {
      v.mouse.justClicked = false;
      v.mouse.leftDown = this.keys.has('numpad0');
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
