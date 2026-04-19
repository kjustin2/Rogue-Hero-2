// Snapshot.js — Position snapshot codec.
//
// Two paths:
//   - JSON envelope (legacy fallback for solo / debug)
//   - Binary encoding (production): ~12× smaller than JSON
//
// Binary wire format for POS snapshots:
//   u8  : magic (0xA1)
//   u8  : snap type (1=POS, 3=FULL)
//   u32 : frame number (LE)
//   u8  : entity count
//   per entity (6 bytes):
//     u8 : id-byte (mapped from string via idToByte)
//     i16: x * 10 (LE)        — supports ±3276.7 px (more than canvas size)
//     i16: y * 10 (LE)
//     u8 : flags bitfield (1=dodging, 2=downed, 4=silenced)

export const SNAP_TYPES = { POS: 1, EVT: 2, FULL: 3 };
const SNAP_MAGIC = 0xA1;

// Stable id ↔ byte mapping. Players are 1–10, enemies 11–254. Reserved 0/255.
// Returns 0 if unknown — receiver will skip.
export function idToByte(id) {
  if (!id) return 0;
  // 'p0'..'p3' → 1..4
  if (id[0] === 'p') {
    const n = parseInt(id.slice(1), 10);
    if (!isNaN(n) && n >= 0 && n < 10) return 1 + n;
  }
  // 'e1'..'eN' → 11..254
  if (id[0] === 'e') {
    const n = parseInt(id.slice(1), 10);
    if (!isNaN(n) && n >= 1 && n <= 244) return 10 + n;
  }
  return 0;
}
export function byteToId(b) {
  if (!b) return null;
  if (b >= 1 && b <= 10) return 'p' + (b - 1);
  if (b >= 11 && b <= 254) return 'e' + (b - 10);
  return null;
}

export class SnapshotEncoder {
  constructor() {
    this._lastByEntity = new Map();   // id → { x, y, flags }
    this._scratchOut = [];            // reused per encode (no GC)
    this._entryPool = [];             // reusable entry objects
    this._envelope = { t: SNAP_TYPES.POS, n: 0, e: null };
  }

  encodePositions(frame, entities) {
    // Reuse the scratch output array (length-reset, push) instead of allocating.
    const out = this._scratchOut;
    out.length = 0;
    let poolIdx = 0;
    for (const e of entities) {
      const id = e.id;
      if (!id) continue;
      const flags = (e.dodging ? 1 : 0) | (e.downed ? 2 : 0) | (e.silenced ? 4 : 0);
      const last = this._lastByEntity.get(id);
      if (last && Math.abs(last.x - e.x) < 0.5 && Math.abs(last.y - e.y) < 0.5 && last.flags === flags) {
        continue; // skip unchanged
      }
      // Update last-seen state (in-place to avoid object allocation)
      if (last) { last.x = e.x; last.y = e.y; last.flags = flags; }
      else this._lastByEntity.set(id, { x: e.x, y: e.y, flags });
      // Recycle entry objects from a pool
      let entry = this._entryPool[poolIdx++];
      if (!entry) {
        entry = { id: '', x: 0, y: 0, f: 0 };
        this._entryPool.push(entry);
      }
      entry.id = id;
      entry.x = Math.round(e.x * 10) / 10;
      entry.y = Math.round(e.y * 10) / 10;
      entry.f = flags;
      out.push(entry);
    }
    this._envelope.n = frame;
    this._envelope.e = out;
    return this._envelope;
  }

  encodeEvent(name, payload) {
    return { t: SNAP_TYPES.EVT, k: name, p: payload };
  }

  // ── Binary encoder ──────────────────────────────────────────────────────────
  // Returns an ArrayBuffer (compact wire format) ready for DataChannel.send().
  // Reuses a scratch buffer to avoid GC pressure.
  encodePositionsBinary(frame, entities) {
    // Compute changed-entity list (same delta filter as the JSON path).
    const out = this._scratchBin || (this._scratchBin = []);
    out.length = 0;
    for (const e of entities) {
      const id = e.id;
      if (!id) continue;
      const flags = (e.dodging ? 1 : 0) | (e.downed ? 2 : 0) | (e.silenced ? 4 : 0);
      const last = this._lastByEntity.get(id);
      if (last && Math.abs(last.x - e.x) < 0.5 && Math.abs(last.y - e.y) < 0.5 && last.flags === flags) {
        continue;
      }
      if (last) { last.x = e.x; last.y = e.y; last.flags = flags; }
      else this._lastByEntity.set(id, { x: e.x, y: e.y, flags });
      const b = idToByte(id);
      if (!b) continue; // unmappable id — skip silently
      out.push(b, e.x, e.y, flags);
    }
    const n = out.length / 4;
    const byteLen = 7 + n * 6;
    if (!this._scratchBuf || this._scratchBuf.byteLength < byteLen) {
      this._scratchBuf = new ArrayBuffer(Math.max(byteLen, 256));
      this._scratchView = new DataView(this._scratchBuf);
      this._scratchU8   = new Uint8Array(this._scratchBuf);
    }
    const dv = this._scratchView;
    dv.setUint8(0, SNAP_MAGIC);
    dv.setUint8(1, SNAP_TYPES.POS);
    dv.setUint32(2, frame >>> 0, true);
    dv.setUint8(6, Math.min(255, n));
    let off = 7;
    for (let i = 0; i < out.length; i += 4) {
      const b = out[i], x = out[i + 1], y = out[i + 2], f = out[i + 3];
      dv.setUint8(off, b);
      // Quantize to 0.1 px, clamp to int16
      const xq = Math.max(-32768, Math.min(32767, Math.round(x * 10)));
      const yq = Math.max(-32768, Math.min(32767, Math.round(y * 10)));
      dv.setInt16(off + 1, xq, true);
      dv.setInt16(off + 3, yq, true);
      dv.setUint8(off + 5, f);
      off += 6;
    }
    // Return a view sized exactly to the data (DataChannel.send slices it)
    return this._scratchU8.subarray(0, byteLen);
  }

  reset() { this._lastByEntity.clear(); }
}

export class SnapshotDecoder {
  constructor() {
    this.positions = new Map();   // id → { x, y, flags, ts }
    this._lastFrame = -1;
  }

  // Clear stale entries — call on room transitions so reused enemy IDs
  // (e1, e2, …) don't interpolate remote placeholders from last room's
  // position to the new spawn location. _lastFrame is also reset so the
  // next POS snap is accepted even if the encoder frame counter rewinds.
  reset() {
    this.positions.clear();
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

  // ── Binary decoder ──────────────────────────────────────────────────────────
  // Returns true if the buffer was a recognized binary snapshot (and was
  // applied). Returns false if it doesn't match the magic byte — caller can
  // then fall back to JSON parse.
  applyBinary(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 7) return false;
    const dv = new DataView(arrayBuffer);
    if (dv.getUint8(0) !== SNAP_MAGIC) return false;
    const type = dv.getUint8(1);
    if (type !== SNAP_TYPES.POS && type !== SNAP_TYPES.FULL) return false;
    const frame = dv.getUint32(2, true);
    if (type === SNAP_TYPES.POS && frame <= this._lastFrame) return true; // stale, ack-consumed
    this._lastFrame = frame;
    const n = dv.getUint8(6);
    const ts = performance.now();
    let off = 7;
    for (let i = 0; i < n; i++) {
      const b = dv.getUint8(off);
      const xq = dv.getInt16(off + 1, true);
      const yq = dv.getInt16(off + 3, true);
      const f = dv.getUint8(off + 5);
      const id = byteToId(b);
      if (id) this.positions.set(id, { x: xq * 0.1, y: yq * 0.1, flags: f, ts });
      off += 6;
    }
    return true;
  }

  // Linear interpolation toward newest snapshot, render slightly behind.
  interpolated(id, lerpFactor = 0.5) {
    return this.positions.get(id) || null;
  }
}
