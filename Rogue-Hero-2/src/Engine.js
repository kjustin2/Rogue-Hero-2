import { events } from './EventBus.js';

// States where full 60fps is needed — everything else runs at 30fps to save CPU/battery
const FULL_FPS_STATES = new Set(['playing', 'paused', 'prep', 'draft']);

export class Engine {
  constructor(updateFn, renderFn, getState) {
    this.updateFn = updateFn;
    this.renderFn = renderFn;
    this.getState = getState || (() => 'playing');
    this.lastTime = performance.now();
    this.hitStop = 0;
    this.slowMoTimer = 0;
    this.slowMoScale = 1.0;
    this.running = false;

    events.on('HIT_STOP', dur => { this.hitStop = Math.max(this.hitStop, dur); });
    events.on('SLOW_MO', ({ dur, scale }) => { this.slowMoTimer = Math.max(this.slowMoTimer, dur); this.slowMoScale = scale; });
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }
  
  stop() {
    this.running = false;
  }

  loop(timestamp) {
    if (!this.running) return;
    requestAnimationFrame(t => this.loop(t));

    // Throttle to 30fps in menu/non-combat states to save CPU and battery
    const needFullFps = FULL_FPS_STATES.has(this.getState());
    if (!needFullFps && timestamp - this.lastTime < 1000 / 30) return;

    // Cap dt to prevent massive jumps on tab blur
    let realDt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    // Handle hit-stop (freezes logic, but unscaled realDt reduces the timer)
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      this.renderFn();
      return;
    }

    // Handle slow-mo
    let logicDt = realDt;
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDt;
      logicDt *= this.slowMoScale;
    } else {
      this.slowMoScale = 1.0;
    }

    this.updateFn(logicDt, realDt);
    this.renderFn();
  }
}
