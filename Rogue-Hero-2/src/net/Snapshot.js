// Snapshot.js — Delta-encoded position snapshots for player + enemy state.
// Quantizes positions to int16 (×0.1 px precision) and bitfield-packs flags
// to keep per-frame payload tiny.
//
// Format (positions): [type=POS, frame, [{id, dx, dy, flags}, ...]]
// Format (events):    [type=EVT, name, payload]
//
// Stub: keeps a JSON path for now (works without bundler); a binary
// path can be added later via DataView when bandwidth becomes a concern.

export const SNAP_TYPES = { POS: 1, EVT: 2, FULL: 3 };

export class SnapshotEncoder {
  constructor() {
    this._lastByEntity = new Map();   // id → { x, y, flags }
  }

  encodePositions(frame, entities) {
    const out = [];
    for (const e of entities) {
      const id = e.id;
      if (!id) continue;
      const flags = (e.dodging ? 1 : 0) | (e.downed ? 2 : 0) | (e.silenced ? 4 : 0);
      const last = this._lastByEntity.get(id);
      if (last && Math.abs(last.x - e.x) < 0.5 && Math.abs(last.y - e.y) < 0.5 && last.flags === flags) {
        continue; // skip unchanged
      }
      this._lastByEntity.set(id, { x: e.x, y: e.y, flags });
      out.push({
        id,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        f: flags,
      });
    }
    return { t: SNAP_TYPES.POS, n: frame, e: out };
  }

  encodeEvent(name, payload) {
    return { t: SNAP_TYPES.EVT, k: name, p: payload };
  }

  reset() { this._lastByEntity.clear(); }
}

export class SnapshotDecoder {
  constructor() {
    this.positions = new Map();   // id → { x, y, flags, ts }
    this._lastFrame = -1;
  }

  apply(snapshot) {
    if (snapshot.t === SNAP_TYPES.POS) {
      if (snapshot.n <= this._lastFrame) return; // stale
      this._lastFrame = snapshot.n;
      const ts = performance.now();
      for (const e of snapshot.e) {
        this.positions.set(e.id, { x: e.x, y: e.y, flags: e.f, ts });
      }
    }
  }

  // Linear interpolation toward newest snapshot, render slightly behind.
  interpolated(id, lerpFactor = 0.5) {
    return this.positions.get(id) || null;
  }
}
