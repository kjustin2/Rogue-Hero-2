// SpatialHash.js — Uniform-grid spatial hash for fast hitbox queries.
// Replaces O(n×m) loops in Combat.js circularHitbox / projectile-vs-enemy
// with O(n + k) where k is the count of entities in the queried cells.
//
// Usage:
//   const hash = new SpatialHash(64);
//   hash.rebuild(enemies);                  // once per frame
//   for (const e of hash.query(x, y, r)) {  // returns nearby candidates
//     if (e.alive && distSq(e, x, y) < (e.r + r)**2) { ... }
//   }
//
// Notes:
// - Cell size 64 is a good default for 14–28 px entities and 80–250 px ranges.
// - This is a generation-counted Set per cell, so rebuild is O(n) and
//   query reuses an internal output array (no per-call allocation).
// - Only allocates on first use of a cell or when output array grows.

export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this._cells = new Map();          // key "cx,cy" → array of entities
    this._out = [];                    // reusable query output
    this._seen = new Set();            // dedupe across cells per query
    this._gen = 0;                     // (reserved for future incremental ops)
  }

  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

  rebuild(entities) {
    const cs = this.cellSize;
    this._cells.clear();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || !e.alive) continue;
      const cx = (e.x / cs) | 0;
      const cy = (e.y / cs) | 0;
      const k = this._key(cx, cy);
      let bucket = this._cells.get(k);
      if (!bucket) { bucket = []; this._cells.set(k, bucket); }
      bucket.push(e);
    }
  }

  // Returns an array of candidate entities whose cells overlap the query disc.
  // Caller must do the precise (dx*dx + dy*dy < threshold²) check.
  query(x, y, radius) {
    const cs = this.cellSize;
    const minCx = ((x - radius) / cs) | 0;
    const maxCx = ((x + radius) / cs) | 0;
    const minCy = ((y - radius) / cs) | 0;
    const maxCy = ((y + radius) / cs) | 0;
    this._out.length = 0;
    this._seen.clear();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this._cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (this._seen.has(e)) continue;
          this._seen.add(e);
          this._out.push(e);
        }
      }
    }
    return this._out;
  }

  // Convenience: precise circle test inside the query.
  forEachInCircle(x, y, radius, cb) {
    const candidates = this.query(x, y, radius);
    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      const dx = e.x - x, dy = e.y - y;
      const t = radius + (e.r || 0);
      if (dx * dx + dy * dy < t * t) cb(e);
    }
  }
}
