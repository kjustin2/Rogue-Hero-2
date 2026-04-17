// Net.js — Transport layer (WebRTC DataChannel + WebSocket fallback).
// Stub: provides a stable API that main.js can call regardless of mode.
//
// API:
//   const net = new Net({ role: 'host'|'client'|'solo', signalUrl });
//   await net.connect(roomCode);
//   net.sendUnreliable(channel, payload);  // positions, ~15 Hz
//   net.sendReliable(channel, payload);    // events
//   net.on(channel, (msg, peerId) => { ... });
//   net.disconnect();
//
// In solo mode every method is a no-op so the rest of the game stays
// agnostic about whether networking is wired in.

export class Net {
  constructor(opts = {}) {
    this.role = opts.role || 'solo';
    this.signalUrl = opts.signalUrl || null;
    this.peers = new Map();          // peerId → { dcReliable, dcUnreliable, pc, rtt }
    this.handlers = new Map();       // channel → Set<fn>
    this.connected = false;
    this.localPeerId = Math.random().toString(36).slice(2, 10);
    this._sendStats = { bytesOut: 0, bytesIn: 0, msgsOut: 0, msgsIn: 0 };
    this._lastSentByChannel = new Map();
  }

  on(channel, fn) {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel).add(fn);
    return () => this.handlers.get(channel).delete(fn);
  }

  _dispatch(channel, msg, peerId) {
    this._sendStats.msgsIn++;
    const set = this.handlers.get(channel);
    if (set) for (const fn of set) fn(msg, peerId);
  }

  async connect(_roomCode) {
    if (this.role === 'solo') { this.connected = true; return; }
    // TODO: WebRTC handshake via signaling relay (e.g. Cloudflare Worker).
    // For now we mark connected and let main.js fall back to local-only.
    console.warn('[Net] WebRTC stub — running local-only.');
    this.connected = true;
  }

  // Best-effort, unordered, no-retry — for positions / cursor movement
  sendUnreliable(channel, payload) {
    if (!this.connected || this.role === 'solo') return;
    const last = this._lastSentByChannel.get(channel);
    // Bandwidth gate: drop redundant snapshots
    if (last && JSON.stringify(payload) === last) return;
    this._lastSentByChannel.set(channel, JSON.stringify(payload));
    for (const peer of this.peers.values()) {
      if (peer.dcUnreliable && peer.dcUnreliable.readyState === 'open') {
        try {
          const buf = JSON.stringify({ ch: channel, p: payload });
          peer.dcUnreliable.send(buf);
          this._sendStats.bytesOut += buf.length;
          this._sendStats.msgsOut++;
        } catch (e) { /* ignore */ }
      }
    }
  }

  // Ordered, reliable — for events (card play, kill, room transition)
  sendReliable(channel, payload) {
    if (!this.connected || this.role === 'solo') return;
    for (const peer of this.peers.values()) {
      if (peer.dcReliable && peer.dcReliable.readyState === 'open') {
        try {
          const buf = JSON.stringify({ ch: channel, p: payload });
          peer.dcReliable.send(buf);
          this._sendStats.bytesOut += buf.length;
          this._sendStats.msgsOut++;
        } catch (e) { /* ignore */ }
      }
    }
  }

  disconnect() {
    for (const p of this.peers.values()) { try { p.pc?.close(); } catch (e) {} }
    this.peers.clear();
    this.connected = false;
  }

  // Stats accessor for the in-game multiplayer pane
  stats() { return { ...this._sendStats, peerCount: this.peers.size, role: this.role }; }
}
