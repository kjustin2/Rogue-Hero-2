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

// RH2 multiplayer fix audit:
//
//  - The BitTorrent `torrent` strategy depends on public WebTorrent trackers
//    (wss://tracker.webtorrent.dev et al.) which are frequently down or
//    blocked by firewalls; two computers calling joinRoom will silently never
//    discover each other. Switching to the `nostr` strategy routes signaling
//    over a pool of public Nostr relays which are much more reliable.
//
//  - Trystero's default iceServers points at global.stun.twilio.com (DNS
//    often refuses to resolve it → the `errorcode: -105` spam). We pass a
//    full iceServers list (Google + Cloudflare STUN plus a free openrelay
//    TURN) so both candidate gathering and symmetric-NAT traversal succeed.
//
//  - On connect we now surface peer/relay errors via `status` events, so the
//    lobby UI can actually tell the user what failed rather than silently
//    staying on "Connecting…" forever.

// NOTE: empirical test (multiplayer-test.html, 2026-04-17) — public Nostr
// relays accept the WebSocket but silently drop Trystero's signaling events,
// so two peers on the same relay set never discovered each other. The torrent
// strategy (WebTorrent trackers) connected reliably in ~11s in the same test.
// Keep nostr as a fallback in case trackers are blocked on a given network.
const TRYSTERO_PRIMARY_CDN   = 'https://esm.sh/trystero@0.21.6/torrent';
const TRYSTERO_FALLBACK_CDN  = 'https://esm.sh/trystero@0.21.6/nostr';
const APP_ID = 'rogue-hero-2';

const RTC_CONFIG = {
  iceServers: [
    // Multiple STUN so candidate gathering succeeds even if one host is down
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Free TURN fallback — required when both peers are behind symmetric
    // NAT (the common "two residential networks" case the user hit). These
    // are openrelay's public credentials; fine for small games.
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

let _trysteroModule = null;
let _trysteroStrategy = null; // 'nostr' | 'torrent'
async function _loadTrystero() {
  if (_trysteroModule) return _trysteroModule;
  // Try nostr first, then fall back to torrent if the nostr module/relays
  // are unreachable. Either way we end up with a working `joinRoom`.
  try {
    _trysteroModule = await import(/* @vite-ignore */ TRYSTERO_PRIMARY_CDN);
    _trysteroStrategy = 'torrent';
    console.log('[Net] Trystero loaded (torrent strategy)');
    return _trysteroModule;
  } catch (e) {
    console.warn('[Net] torrent module unreachable — trying nostr:', e?.message || e);
  }
  try {
    _trysteroModule = await import(/* @vite-ignore */ TRYSTERO_FALLBACK_CDN);
    _trysteroStrategy = 'nostr';
    console.log('[Net] Trystero loaded (nostr fallback)');
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
      this.connected = false;
      this._dispatch('status', { kind: 'error', msg: 'Trystero unavailable — check internet / firewall' });
      return;
    }

    console.log(`[Net] joinRoom — strategy=${_trysteroStrategy}, room="${roomCode}", appId="${APP_ID}"`);
    try {
      this.room = tryst.joinRoom(
        { appId: APP_ID, rtcConfig: RTC_CONFIG, password: APP_ID },
        roomCode,
        // Trystero v0.21+ accepts an onError callback as 3rd arg
        (err) => {
          console.warn('[Net] room error:', err);
          this._dispatch('status', { kind: 'error', msg: `Room error: ${err?.message || err}` });
        },
      );
    } catch (e) {
      console.warn('[Net] joinRoom threw:', e);
      this.connected = false;
      this._dispatch('status', { kind: 'error', msg: 'joinRoom failed: ' + (e?.message || e) });
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
      console.log('[Net] peer joined:', id);
      this.peers.set(id, {});
      this._dispatch('peer', { kind: 'join', peerId: id }, id);
      this._dispatch('status', { kind: 'peer', msg: `Peer connected (${this.peers.size} total)` });
    });
    this.room.onPeerLeave(id => {
      console.log('[Net] peer left:', id);
      this.peers.delete(id);
      this._dispatch('peer', { kind: 'leave', peerId: id }, id);
    });

    // Surface ICE failures per peer so the lobby can hint at NAT/firewall issues.
    if (typeof this.room.onPeerError === 'function') {
      this.room.onPeerError((id, err) => {
        console.warn(`[Net] peer ${id} error:`, err);
        this._dispatch('status', { kind: 'peer-error', msg: `Peer ${id} error — likely firewall/NAT` });
      });
    }

    this.connected = true;
    window._trysteroModRef = tryst; // expose for lobby relay-count display
    this._dispatch('status', { kind: 'connected', room: roomCode });
    console.log(`[Net] connected to room "${roomCode}" (waiting for peers)`);

    // Diagnostic: dump which trackers/relays actually connected. If both peers
    // share zero open URLs they will never discover each other regardless of
    // strategy. Logs at 3s and 12s after join.
    const dumpRelays = () => {
      try {
        if (typeof tryst.getRelaySockets !== 'function') return;
        const sockets = tryst.getRelaySockets();
        const entries = Object.entries(sockets);
        const open = entries.filter(([_, ws]) => ws && ws.readyState === 1).map(([url]) => url);
        const dead = entries.filter(([_, ws]) => !ws || ws.readyState !== 1).map(([url]) => url);
        console.log(`[Net] ${_trysteroStrategy} relays OPEN (${open.length}):`, open);
        if (dead.length) console.log(`[Net] ${_trysteroStrategy} relays NOT open (${dead.length}):`, dead);
        this._dispatch('status', { kind: 'relays', msg: `${open.length} ${_trysteroStrategy} relays open` });
      } catch (e) { console.warn('[Net] relay dump failed:', e); }
    };
    setTimeout(dumpRelays, 3000);
    setTimeout(dumpRelays, 12000);
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
  stats() { return { ...this._sendStats, peerCount: this.peers.size, role: this.role, strategy: _trysteroStrategy }; }
  strategy() { return _trysteroStrategy; }
}
