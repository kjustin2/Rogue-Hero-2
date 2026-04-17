// Reconcile.js — Client-side prediction + reconciliation for own player.
// Pattern (from CS:GO et al.):
//   - locally simulate own player on every input frame
//   - host snapshot arrives with authoritative position
//   - if drift > 8 px, gently snap; otherwise ignore (we trust the local sim)
//
// Other entities (allies, enemies) are interpolated 100 ms behind the
// newest snapshot — see Snapshot.SnapshotDecoder.

const DRIFT_THRESHOLD = 8;       // px
const RECONCILE_LERP   = 0.3;    // partial pull toward authoritative

export class Reconcile {
  constructor() {
    this.pendingInputs = [];   // [{ frame, dx, dy, dt }]
  }

  recordInput(frame, dx, dy, dt) {
    this.pendingInputs.push({ frame, dx, dy, dt });
    if (this.pendingInputs.length > 120) this.pendingInputs.shift();
  }

  // Apply an authoritative snapshot for own player.
  applyOwn(player, authoritativeX, authoritativeY, ackedFrame) {
    const dx = authoritativeX - player.x;
    const dy = authoritativeY - player.y;
    const drift = Math.sqrt(dx * dx + dy * dy);
    if (drift > DRIFT_THRESHOLD) {
      player.x += dx * RECONCILE_LERP;
      player.y += dy * RECONCILE_LERP;
    }
    // Drop already-acked inputs
    while (this.pendingInputs.length && this.pendingInputs[0].frame <= ackedFrame) {
      this.pendingInputs.shift();
    }
  }

  // Smoothly interpolate a remote entity from snapshot history.
  // entity is the local placeholder; latest is { x, y, ts }; renderDelay
  // pulls us slightly behind to hide jitter.
  interpolateRemote(entity, latest, renderDelayMs = 100) {
    if (!latest) return;
    const ageMs = performance.now() - latest.ts;
    const t = Math.max(0, Math.min(1, 1 - (ageMs - renderDelayMs) / 200));
    entity.x = entity.x + (latest.x - entity.x) * (1 - t * 0.7);
    entity.y = entity.y + (latest.y - entity.y) * (1 - t * 0.7);
  }
}
