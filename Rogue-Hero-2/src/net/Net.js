// Net.js — Transport layer (WebRTC DataChannel via Trystero).
//
// Public API (unchanged — solo mode is a no-op so the rest of the game
// stays agnostic about whether networking is wired in):
//   const net = new Net({ role: 'host'|'client'|'solo' });
//   await net.connect(roomCode);
//   net.sendUnreliable('snap', payload);
//   net.sendReliable('evt', payload);
//   net.on(channel, (msg, peerId) => { ... });
//   net.disconnect();
//
// Trystero gives us free WebRTC mesh discovery via public BitTorrent /
// Nostr trackers — no signaling backend to host. The library is pulled
// from esm.sh on first connect so the project keeps its zero-build
// constraint. If the CDN is blocked the module silently falls back to
// solo (game still runs, just no remote peers).

const TRYSTERO_CDN = 'https://esm.sh/trystero@0.20.0/torrent';
const APP_ID = 'rogue-hero-2';

let _trysteroModule = null;
async function _loadTrystero() {
  if (_trysteroModule) return _trysteroModule;
  try {
    _trysteroModule = await import(/* @vite-ignore */ TRYSTERO_CDN);
    return _trysteroModule;
  } catch (e) {
    console.warn('[Net] Trystero CDN unreachable — running solo:', e?.message || e);
    return null;
  }
}

export class Net {
  constructor(opts = {}) {
    this.role = opts.role || 'solo';
    this.signalUrl = opts.signalUrl || null; // unused with Trystero, kept for compatibility
    this.peers = new Map();          // peerId → {}
    this.handlers = new Map();       // channel → Set<fn>
    this.connected = false;
    this.localPeerId = Math.random().toString(36).slice(2, 10);
    this._sendStats = { bytesOut: 0, bytesIn: 0, msgsOut: 0, msgsIn: 0 };
    this.room = null;
    this._sendSnap = null;
    this._sendEvt = null;
  }

  on(channel, fn) {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel).add(fn);
    return () => this.handlers.get(channel).delete(fn);
  }

  _dispatch(channel, msg, peerId) {
    this._sendStats.msgsIn++;
    if (typeof msg === 'string') this._sendStats.bytesIn += msg.length;
    const set = this.handlers.get(channel);
    if (set) for (const fn of set) fn(msg, peerId);
  }

  // RH2: warm the CDN module and exercise WebRTC permissions before the user
  // tries to host. Resolves to true if Trystero is reachable. Idempotent.
  async preflight() {
    if (this._preflightPromise) return this._preflightPromise;
    this._preflightPromise = (async () => {
      const tryst = await _loadTrystero();
      if (!tryst || !tryst.joinRoom) {
        this._preflightOk = false;
        this._dispatch('status', { kind: 'error', msg: 'Trystero unavailable' });
        return false;
      }
      this._preflightOk = true;
      this._dispatch('status', { kind: 'ready', msg: 'Trystero loaded' });
      return true;
    })();
    return this._preflightPromise;
  }

  async connect(roomCode) {
    if (this.role === 'solo') { this.connected = true; return; }
    if (!roomCode) { console.warn('[Net] connect() needs a room code'); return; }

    const tryst = await _loadTrystero();
    if (!tryst || !tryst.joinRoom) {
      // CDN failed — degrade gracefully so the lobby UI just shows "no peers"
      this.connected = false;
      this._dispatch('status', { kind: 'error', msg: 'Trystero unavailable' });
      return;
    }

    try {
      this.room = tryst.joinRoom({ appId: APP_ID }, roomCode);
    } catch (e) {
      console.warn('[Net] joinRoom failed:', e);
      this.connected = false;
      this._dispatch('status', { kind: 'error', msg: 'joinRoom failed' });
      return;
    }

    // Two trystero "actions" — one for snapshots, one for events
    const [sendSnap, getSnap] = this.room.makeAction('snap');
    const [sendEvt,  getEvt]  = this.room.makeAction('evt');
    this._sendSnap = sendSnap;
    this._sendEvt  = sendEvt;
    getSnap((p, peerId) => this._dispatch('snap', p, peerId));
    getEvt((p,  peerId) => this._dispatch('evt',  p, peerId));

    this.room.onPeerJoin(id => {
      this.peers.set(id, {});
      this._dispatch('peer', { kind: 'join', peerId: id }, id);
    });
    this.room.onPeerLeave(id => {
      this.peers.delete(id);
      this._dispatch('peer', { kind: 'leave', peerId: id }, id);
    });

    this.connected = true;
    this._dispatch('status', { kind: 'connected', room: roomCode });
  }

  // Best-effort, unordered — for positions / cursor movement
  sendUnreliable(channel, payload) {
    if (!this.connected || this.role === 'solo' || !this._sendSnap) return;
    if (channel !== 'snap') return;
    try {
      this._sendSnap(payload);
      this._sendStats.msgsOut++;
    } catch (e) { /* ignore transient send errors */ }
  }

  // Ordered, reliable — for events (card play, kill, room transition)
  sendReliable(channel, payload) {
    if (!this.connected || this.role === 'solo' || !this._sendEvt) return;
    if (channel !== 'evt') return;
    try {
      this._sendEvt(payload);
      this._sendStats.msgsOut++;
    } catch (e) { /* ignore */ }
  }

  disconnect() {
    try { this.room?.leave(); } catch (e) { /* ignore */ }
    this.peers.clear();
    this.room = null;
    this._sendSnap = null;
    this._sendEvt = null;
    this.connected = false;
  }

  // Stats accessor for the in-game multiplayer pane
  stats() { return { ...this._sendStats, peerCount: this.peers.size, role: this.role }; }
}
