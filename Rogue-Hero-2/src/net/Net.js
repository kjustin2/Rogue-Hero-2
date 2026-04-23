// Net.js — Transport layer (WebRTC DataChannels).
//
// Primary path: Cloudflare Worker signaling (set CF_SIGNAL_URL after deploying
// workers/signaling.js). Worker relays SDP/ICE only; all game data flows
// directly peer-to-peer via WebRTC DataChannels.
//
// Fallback path: Trystero BitTorrent trackers — zero infra, but ICE success
// rate is lower on restrictive networks.
//
// Public API (unchanged):
//   const net = new Net({ role: 'host'|'client'|'solo' });
//   await net.connect(roomCode);
//   net.sendUnreliable('snap', payload);   // positions — unordered, lossy
//   net.sendReliable('evt', payload);      // events  — ordered, reliable
//   net.on(channel, (msg, peerId) => {});
//   net.disconnect();

// ─── SET THIS after running `wrangler deploy` (see MULTIPLAYER_SETUP.md) ────
const CF_SIGNAL_URL = 'wss://rh2-signal.jpk91.workers.dev'; // e.g. 'wss://rh2-signal.yourname.workers.dev'
// ────────────────────────────────────────────────────────────────────────────

const TRYSTERO_TORRENT = 'https://esm.sh/trystero@0.21.6/torrent';
const TRYSTERO_NOSTR   = 'https://esm.sh/trystero@0.21.6/nostr';
const APP_ID = 'rogue-hero-2';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Free TURN for symmetric-NAT traversal.
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

// ── Trystero module cache ─────────────────────────────────────────────────────
let _trysteroModule   = null;
let _trysteroStrategy = null;

async function _loadTrystero() {
  if (_trysteroModule) return _trysteroModule;
  try {
    _trysteroModule = await import(/* @vite-ignore */ TRYSTERO_TORRENT);
    _trysteroStrategy = 'torrent';
    console.log('[Net] Trystero loaded (torrent)');
    return _trysteroModule;
  } catch (e) {
    console.warn('[Net] torrent CDN unreachable, trying nostr:', e?.message);
  }
  try {
    _trysteroModule = await import(/* @vite-ignore */ TRYSTERO_NOSTR);
    _trysteroStrategy = 'nostr';
    console.log('[Net] Trystero loaded (nostr fallback)');
    return _trysteroModule;
  } catch (e) {
    console.warn('[Net] all CDN paths unreachable — solo only:', e?.message);
    return null;
  }
}

// ── Net class ─────────────────────────────────────────────────────────────────
export class Net {
  constructor(opts = {}) {
    this.role        = opts.role || 'solo';
    this.peers       = new Map();   // peerId → { pc?, snapDc?, evtDc? }
    this.handlers    = new Map();   // channel → Set<fn>
    this.connected   = false;
    this.localPeerId = Math.random().toString(36).slice(2, 10);
    this._sendStats  = { bytesOut: 0, bytesIn: 0, msgsOut: 0, msgsIn: 0 };
    // Trystero references (null when using CF path)
    this.room      = null;
    this._sendSnap = null;
    this._sendEvt  = null;
    // CF signaling WebSocket
    this._ws       = null;
    // 'cloudflare' | 'torrent' | 'nostr' | null
    this._strategy = null;
  }

  // ── Event subscription ──────────────────────────────────────────────────────
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

  // ── Preflight ───────────────────────────────────────────────────────────────
  async preflight() {
    if (this._preflightPromise) return this._preflightPromise;
    this._preflightPromise = (async () => {
      if (CF_SIGNAL_URL) {
        try {
          const httpUrl = CF_SIGNAL_URL.replace(/^wss?:\/\//, 'https://');
          const r = await fetch(httpUrl, { signal: AbortSignal.timeout(5000) });
          if (r.ok) {
            this._preflightOk = true;
            this._dispatch('status', { kind: 'ready', msg: 'Signal server ready (Cloudflare)' });
            return true;
          }
        } catch { /* fall through to Trystero check */ }
      }
      const tryst = await _loadTrystero();
      if (!tryst?.joinRoom) {
        this._preflightOk = false;
        this._dispatch('status', { kind: 'error', msg: 'No transport available — check internet' });
        return false;
      }
      this._preflightOk = true;
      this._dispatch('status', { kind: 'ready', msg: 'Ready (Trystero)' });
      return true;
    })();
    return this._preflightPromise;
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  async connect(roomCode) {
    if (this.role === 'solo') { this.connected = true; return; }
    if (!roomCode) { console.warn('[Net] connect() requires a room code'); return; }

    if (CF_SIGNAL_URL) {
      try {
        await this._connectDirect(roomCode);
        return;
      } catch (e) {
        console.warn('[Net] CF signaling failed — falling back to Trystero:', e?.message || e);
      }
    }
    await this._connectTrystero(roomCode);
  }

  // ── Cloudflare Worker path ───────────────────────────────────────────────────

  async _connectDirect(roomCode) {
    const wsUrl = `${CF_SIGNAL_URL}/${roomCode}`;
    console.log('[Net] CF signaling →', wsUrl);

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this._ws = ws;
      const timer = setTimeout(() => reject(new Error('CF WS timeout')), 12000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', peerId: this.localPeerId }));
      };

      ws.onmessage = async (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }

        if (msg.type === 'welcome') {
          clearTimeout(timer);
          this._strategy = 'cloudflare';
          this.connected = true;
          window._trysteroModRef = null;
          this._dispatch('status', { kind: 'connected', room: roomCode });
          console.log(`[Net] CF connected room="${roomCode}" existing peers: [${msg.peers.join(', ')}]`);
          for (const pid of msg.peers) {
            await this._cfInitiatePeer(pid);
          }
          resolve();
        } else if (msg.type === 'peer_joined') {
          console.log('[Net] CF peer announced:', msg.peerId);
          this._cfPreparePeer(msg.peerId);
        } else if (msg.type === 'signal') {
          await this._cfHandleSignal(msg.from, msg.data);
        } else if (msg.type === 'peer_left') {
          this._cfRemovePeer(msg.peerId);
        }
      };

      ws.onerror = () => { clearTimeout(timer); reject(new Error('CF WebSocket error')); };
      ws.onclose = () => {
        if (!this.connected) { clearTimeout(timer); reject(new Error('CF WebSocket closed early')); }
      };
    });
  }

  _cfMakePeer(peerId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peer = { pc, snapDc: null, evtDc: null, iceBuf: [], _discTimer: 0 };
    this.peers.set(peerId, peer);

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        this._cfSignalSend(peerId, { type: 'candidate', candidate: evt.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log(`[Net] peer ${peerId} → ${s}`);
      if (s === 'connected') {
        if (peer._discTimer) { clearTimeout(peer._discTimer); peer._discTimer = 0; }
        this._dispatch('peer', { kind: 'join', peerId }, peerId);
        this._dispatch('status', { kind: 'peer', msg: `Peer connected (${this.peers.size} total)` });
      } else if (s === 'failed' || s === 'closed') {
        if (peer._discTimer) { clearTimeout(peer._discTimer); peer._discTimer = 0; }
        this._cfRemovePeer(peerId);
      } else if (s === 'disconnected') {
        // Transient: ICE may heal in a few seconds. Keep the peer record,
        // but arm a fallback timer so a peer that went away silently (tab
        // closed, crashed, sleeping laptop) is removed within a bounded
        // window — otherwise main.js never sees a 'leave' until the ~30 s
        // ICE timeout transitions us to 'failed'.
        this._dispatch('status', { kind: 'peer-error', msg: `Peer ${peerId} link unstable — attempting recovery` });
        if (peer._discTimer) clearTimeout(peer._discTimer);
        peer._discTimer = setTimeout(() => {
          peer._discTimer = 0;
          if (pc.connectionState === 'disconnected') {
            console.log(`[Net] peer ${peerId} stuck disconnected — forcing leave`);
            this._cfRemovePeer(peerId);
          }
        }, 8000);
      }
    };

    return peer;
  }

  // Snap channel may carry either binary (compact) or JSON (legacy). We
  // detect at receive time so an old peer can still talk to a new one.
  _onSnapMessage(e, peerId) {
    if (e.data instanceof ArrayBuffer) {
      this._dispatch('snap', e.data, peerId);
    } else {
      // Legacy / JSON path
      try { this._dispatch('snap', JSON.parse(e.data), peerId); } catch {}
    }
  }

  // We are the initiator: create offer + data channels.
  // Wire close/error handlers on a DataChannel so a remote-initiated close
  // (the peer called pc.close() or their tab disappeared) evicts the peer
  // immediately instead of waiting for connectionState to limp through
  // 'disconnected' → 'failed' (can take 30+ s on some networks).
  _cfWireDcLifecycle(dc, peerId) {
    const onGone = (why) => {
      console.log(`[Net] peer ${peerId} evt channel ${why} — evicting`);
      this._cfRemovePeer(peerId);
    };
    dc.onclose = () => onGone('closed');
    dc.onerror = () => onGone('errored');
    // Some WebRTC implementations surface a remote close only via
    // onclosing; dispatch the same eviction to cover that path too.
    if ('onclosing' in dc) dc.onclosing = () => onGone('closing');
  }

  async _cfInitiatePeer(peerId) {
    const peer = this._cfMakePeer(peerId);
    // snap: unordered/lossy for positions; evt: ordered/reliable for game events
    peer.snapDc = peer.pc.createDataChannel('snap', { ordered: false, maxRetransmits: 0 });
    peer.evtDc  = peer.pc.createDataChannel('evt',  { ordered: true });
    peer.snapDc.binaryType = 'arraybuffer';
    peer.snapDc.onmessage = (e) => this._onSnapMessage(e, peerId);
    peer.evtDc.onmessage  = (e) => this._dispatch('evt',  JSON.parse(e.data), peerId);
    this._cfWireDcLifecycle(peer.evtDc, peerId);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this._cfSignalSend(peerId, { type: 'offer', sdp: peer.pc.localDescription });
  }

  // We are the responder: wait for ondatachannel.
  _cfPreparePeer(peerId) {
    const peer = this._cfMakePeer(peerId);
    peer.pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      if (dc.label === 'snap') {
        peer.snapDc = dc;
        dc.binaryType = 'arraybuffer';
        dc.onmessage = (e) => this._onSnapMessage(e, peerId);
      } else if (dc.label === 'evt') {
        peer.evtDc = dc;
        dc.onmessage = (e) => this._dispatch('evt', JSON.parse(e.data), peerId);
        this._cfWireDcLifecycle(dc, peerId);
      }
    };
  }

  async _cfHandleSignal(fromId, data) {
    let peer = this.peers.get(fromId);
    if (!peer) { this._cfPreparePeer(fromId); peer = this.peers.get(fromId); }
    try {
      if (data.type === 'offer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this._cfSignalSend(fromId, { type: 'answer', sdp: peer.pc.localDescription });
        for (const c of peer.iceBuf) await peer.pc.addIceCandidate(new RTCIceCandidate(c));
        peer.iceBuf = [];
      } else if (data.type === 'answer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        for (const c of peer.iceBuf) await peer.pc.addIceCandidate(new RTCIceCandidate(c));
        peer.iceBuf = [];
      } else if (data.type === 'candidate') {
        if (peer.pc.remoteDescription) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          peer.iceBuf.push(data.candidate);
        }
      }
    } catch (e) {
      console.warn('[Net] signal handling error:', e?.message || e);
    }
  }

  _cfRemovePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer._discTimer) { clearTimeout(peer._discTimer); peer._discTimer = 0; }
    // Delete from the map BEFORE closing — pc.close() can trigger a
    // synchronous 'closed' transition on onconnectionstatechange which
    // would re-enter _cfRemovePeer for the same peerId. Deleting first
    // makes the re-entry a fast no-op via the `if (!peer) return` guard.
    this.peers.delete(peerId);
    try { peer.pc.close(); } catch {}
    this._dispatch('peer', { kind: 'leave', peerId }, peerId);
  }

  // Flush pending reliable events, then tear down. Callers about to leave
  // (menu back-out, tab unload, game over → menu) must use this instead of
  // a synchronous sendReliable + disconnect, otherwise pc.close() drops the
  // in-flight message before it reaches the wire and the other side has to
  // wait for the 8 s 'disconnected' fallback (or 30 s ICE timeout) to notice.
  // Resolves after the DataChannel send buffers drain or the 500 ms cap hits.
  async gracefulDisconnect(timeoutMs = 500) {
    if (!this.connected || this.role === 'solo') { this.disconnect(); return; }
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    await new Promise((resolve) => {
      const tick = () => {
        let pending = 0;
        for (const peer of this.peers.values()) {
          pending += (peer.evtDc?.bufferedAmount || 0);
        }
        if (pending === 0 || now() - start >= timeoutMs) resolve();
        else setTimeout(tick, 25);
      };
      tick();
    });
    this.disconnect();
  }

  _cfSignalSend(toPeerId, data) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'signal', to: toPeerId, from: this.localPeerId, data }));
    }
  }

  // ── Trystero fallback path ───────────────────────────────────────────────────

  async _connectTrystero(roomCode) {
    const tryst = await _loadTrystero();
    if (!tryst?.joinRoom) {
      this.connected = false;
      this._dispatch('status', { kind: 'error', msg: 'No transport available — check internet/firewall' });
      return;
    }

    console.log(`[Net] Trystero joinRoom strategy=${_trysteroStrategy} room="${roomCode}"`);
    try {
      this.room = tryst.joinRoom(
        { appId: APP_ID, rtcConfig: RTC_CONFIG, password: APP_ID },
        roomCode,
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

    const [sendSnap, getSnap] = this.room.makeAction('snap');
    const [sendEvt,  getEvt]  = this.room.makeAction('evt');
    this._sendSnap = sendSnap;
    this._sendEvt  = sendEvt;
    getSnap((p, peerId) => this._dispatch('snap', p, peerId));
    getEvt((p,  peerId) => this._dispatch('evt',  p, peerId));

    this.room.onPeerJoin(id => {
      this.peers.set(id, {});
      this._dispatch('peer', { kind: 'join', peerId: id }, id);
      this._dispatch('status', { kind: 'peer', msg: `Peer connected (${this.peers.size} total)` });
    });
    this.room.onPeerLeave(id => {
      this.peers.delete(id);
      this._dispatch('peer', { kind: 'leave', peerId: id }, id);
    });
    if (typeof this.room.onPeerError === 'function') {
      this.room.onPeerError((id, err) => {
        console.warn(`[Net] peer ${id} error:`, err);
        this._dispatch('status', { kind: 'peer-error', msg: `Peer ${id} error — likely firewall/NAT` });
      });
    }

    this._strategy = _trysteroStrategy;
    this.connected = true;
    window._trysteroModRef = tryst;
    this._dispatch('status', { kind: 'connected', room: roomCode });
    console.log(`[Net] Trystero connected room="${roomCode}" (${_trysteroStrategy})`);

    // Log which trackers/relays are actually open (visible in DevTools).
    const dumpRelays = () => {
      try {
        if (typeof tryst.getRelaySockets !== 'function') return;
        const sockets = tryst.getRelaySockets();
        const entries = Object.entries(sockets);
        const open = entries.filter(([, ws]) => ws?.readyState === 1).map(([u]) => u);
        const dead = entries.filter(([, ws]) => ws?.readyState !== 1).map(([u]) => u);
        console.log(`[Net] ${_trysteroStrategy} OPEN (${open.length}):`, open);
        if (dead.length) console.log(`[Net] ${_trysteroStrategy} DEAD (${dead.length}):`, dead);
        this._dispatch('status', { kind: 'relays', open: open.length, total: entries.length });
      } catch {}
    };
    setTimeout(dumpRelays, 3000);
    setTimeout(dumpRelays, 12000);
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  // Best-effort, unordered — position snapshots.
  // Payload may be a Uint8Array/ArrayBuffer (binary, preferred) or a plain
  // object (JSON fallback). Auto-detects and uses the right send path.
  sendUnreliable(channel, payload) {
    if (!this.connected || this.role === 'solo' || channel !== 'snap') return;
    const isBin = payload && (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload));
    if (this._strategy === 'cloudflare') {
      if (isBin) {
        const buf = payload instanceof ArrayBuffer ? payload : payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        for (const peer of this.peers.values()) {
          if (peer.snapDc?.readyState === 'open') {
            try { peer.snapDc.send(buf); this._sendStats.msgsOut++; this._sendStats.bytesOut += buf.byteLength; } catch {}
          }
        }
      } else {
        const json = JSON.stringify(payload);
        for (const peer of this.peers.values()) {
          if (peer.snapDc?.readyState === 'open') {
            try { peer.snapDc.send(json); this._sendStats.msgsOut++; this._sendStats.bytesOut += json.length; } catch {}
          }
        }
      }
    } else if (this._sendSnap) {
      try { this._sendSnap(payload); this._sendStats.msgsOut++; } catch {}
    }
  }

  // Ordered, reliable — game events (kill, room transition, card play, etc.).
  sendReliable(channel, payload) {
    if (!this.connected || this.role === 'solo' || channel !== 'evt') return;
    if (this._strategy === 'cloudflare') {
      const json = JSON.stringify(payload);
      for (const peer of this.peers.values()) {
        if (peer.evtDc?.readyState === 'open') {
          try { peer.evtDc.send(json); this._sendStats.msgsOut++; } catch {}
        }
      }
    } else if (this._sendEvt) {
      try { this._sendEvt(payload); this._sendStats.msgsOut++; } catch {}
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────────────────

  disconnect() {
    if (this._strategy === 'cloudflare') {
      for (const [pid] of [...this.peers]) this._cfRemovePeer(pid);
      try { this._ws?.close(); } catch {}
      this._ws = null;
    } else {
      try { this.room?.leave(); } catch {}
      this.room      = null;
      this._sendSnap = null;
      this._sendEvt  = null;
    }
    this.peers.clear();
    this.connected = false;
    this._strategy = null;
  }

  // ── Stats / introspection ────────────────────────────────────────────────────

  stats()    { return { ...this._sendStats, peerCount: this.peers.size, role: this.role, strategy: this._strategy }; }
  strategy() { return this._strategy; }
}
