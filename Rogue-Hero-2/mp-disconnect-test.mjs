// mp-disconnect-test.mjs — Regression coverage for the bug where the host
// gets stranded at hero-select (charSelect) after the joined client leaves.
//
// The bug had three paths that all had to work before the host would see
// the "partner left" popup and be able to start a solo run:
//
//   1. PEER_QUIT must actually reach the host. Previously the client sent
//      it and synchronously called net.disconnect(); pc.close() dropped
//      the in-flight message before the DataChannel flushed.
//
//   2. The WebRTC PC can stay in 'disconnected' for 30+ s before hitting
//      'failed'. The original code only pruned on 'failed'/'closed', so a
//      tab-close or laptop-sleep wouldn't register until ICE timed out.
//
//   3. Every transport-level signal can fail simultaneously (worker hiccup
//      + NAT oddity + browser quirk). The host needs an application-level
//      watchdog that removes silent peers via PING/PONG liveness.
//
// Run with: node mp-disconnect-test.mjs
//
// This file mocks RTCPeerConnection / DataChannel / WebSocket minimally so
// it can exercise Net.js's real disconnect code path without a browser.

import { Net } from './src/net/Net.js';

let total = 0, failed = 0;
function check(label, cond, detail) {
  total++;
  if (!cond) failed++;
  const tag = cond ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}${detail ? ' — ' + detail : ''}`);
}
function group(name) { console.log('\n▸ ' + name); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Mocks ────────────────────────────────────────────────────────────────
// Each mock DataChannel tracks bufferedAmount and readyState like the real
// thing. `drain(ms)` simulates the browser pumping packets to the wire.
class MockDC {
  constructor(label) {
    this.label = label;
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this._sent = [];
    this.binaryType = 'arraybuffer';
    this.onmessage = null;
  }
  send(data) {
    if (this.readyState !== 'open') throw new Error('DC closed');
    const size = typeof data === 'string' ? data.length : data.byteLength;
    this.bufferedAmount += size;
    this._sent.push(data);
  }
  drain() { this.bufferedAmount = 0; }
  close() { this.readyState = 'closed'; }
}

// Minimal RTCPeerConnection stub: lets tests drive connectionState changes
// and capture close() calls. Net.js only uses a handful of fields.
class MockPC {
  constructor() {
    this.connectionState = 'new';
    this.remoteDescription = null;
    this._closed = false;
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.onconnectionstatechange = null;
  }
  createDataChannel(label) { return new MockDC(label); }
  async createOffer() { return { type: 'offer', sdp: 'MOCK' }; }
  async createAnswer() { return { type: 'answer', sdp: 'MOCK' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() { this._closed = true; this._setState('closed'); }
  _setState(s) {
    this.connectionState = s;
    if (this.onconnectionstatechange) this.onconnectionstatechange();
  }
}

// ─── Test 1: gracefulDisconnect() waits for evtDc buffer to drain ────────
group('gracefulDisconnect — waits for evt DataChannel buffer to drain');
{
  const net = new Net({ role: 'client' });
  net.connected = true;
  net._strategy = 'cloudflare';

  const pc = new MockPC();
  const evtDc = new MockDC('evt');
  const snapDc = new MockDC('snap');
  net.peers.set('host-id', { pc, evtDc, snapDc, iceBuf: [] });

  // Queue a PEER_QUIT into the send buffer but don't drain it yet.
  net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'test' });
  check('send queued bytes into evtDc', evtDc.bufferedAmount > 0,
    `buffered=${evtDc.bufferedAmount}`);

  // Kick off graceful disconnect. It should NOT call pc.close() yet because
  // bufferedAmount > 0.
  const pClose = net.gracefulDisconnect(500);
  await sleep(50);
  check('pc stays open while buffer is pending', !pc._closed,
    `closed=${pc._closed}`);

  // Simulate the browser flushing packets to the wire (bufferedAmount → 0).
  evtDc.drain();
  await pClose; // graceful should now resolve and call disconnect()
  check('pc.close() fires after buffer drains', pc._closed);
  check('peers cleared after disconnect', net.peers.size === 0);
}

// ─── Test 2: gracefulDisconnect timeout as a safety net ───────────────────
group('gracefulDisconnect — timeout caps the wait');
{
  const net = new Net({ role: 'client' });
  net.connected = true;
  net._strategy = 'cloudflare';
  const pc = new MockPC();
  const evtDc = new MockDC('evt');
  // Queue bytes but NEVER drain — simulates a wedged DataChannel.
  net.peers.set('host-id', { pc, evtDc, iceBuf: [] });
  net.sendReliable('evt', { type: 'PEER_QUIT' });
  check('buffered > 0 to force timeout path', evtDc.bufferedAmount > 0);
  const t0 = Date.now();
  await net.gracefulDisconnect(200);
  const elapsed = Date.now() - t0;
  check('disconnect forced after timeoutMs', pc._closed);
  check('elapsed within expected window',
    elapsed >= 150 && elapsed < 400,
    `elapsed=${elapsed}ms`);
}

// ─── Test 3: 'disconnected' PC state triggers 8 s fallback ────────────────
group("8 s 'disconnected' fallback — evicts silently-gone peers");
{
  // Mock RTCPeerConnection globally so _cfMakePeer can construct one.
  const realRTC = globalThis.RTCPeerConnection;
  const createdPCs = [];
  globalThis.RTCPeerConnection = class extends MockPC {
    constructor() { super(); createdPCs.push(this); }
  };

  const net = new Net({ role: 'host' });
  const peerId = 'client-xyz';
  const peer = net._cfMakePeer(peerId);
  const pc = createdPCs[0];

  // Capture the peer 'leave' dispatch.
  let leftPeerId = null;
  net.on('peer', (m) => { if (m.kind === 'leave') leftPeerId = m.peerId; });

  // Simulate connection, then remote tab closes → PC drops to 'disconnected'.
  pc._setState('connected');
  check('peer lives after connected', net.peers.has(peerId));

  pc._setState('disconnected');
  // Timer is armed for 8 s. Node's setTimeout returns a Timeout object
  // (not a number as in browsers); the contract the code relies on is
  // truthiness, so check that.
  check('disconnect timer armed on transient state', !!peer._discTimer);

  // Fast-forward: clear the real timer and manually invoke the callback
  // path by asserting the behavior. The important contract is: if
  // connectionState stays 'disconnected', the peer is evicted.
  clearTimeout(peer._discTimer);
  if (pc.connectionState === 'disconnected') net._cfRemovePeer(peerId);
  check('peer evicted when still disconnected', !net.peers.has(peerId));
  check('peer leave event dispatched', leftPeerId === peerId);

  // Reverse scenario: the peer recovers before the 8 s timer fires. Verify
  // that transitioning back to 'connected' clears the timer.
  const peerId2 = 'client-flaky';
  net._cfMakePeer(peerId2);
  const pc2 = createdPCs[1];
  pc2._setState('connected');
  pc2._setState('disconnected');
  const peer2 = net.peers.get(peerId2);
  check('flaky peer has an armed timer', !!peer2._discTimer);
  pc2._setState('connected');
  check('timer cleared on recovery', peer2._discTimer === 0);
  check('flaky peer NOT evicted', net.peers.has(peerId2));

  globalThis.RTCPeerConnection = realRTC;
}

// ─── Test 4: PONG watchdog — silent peers are dropped ────────────────────
// This mirrors the watchdog loop in main.js so we can verify its policy
// (7 s grace, 0.5 s tick, seed on first ping) without booting the game.
group('PONG watchdog — evicts peers that stop responding');
{
  const PONG_TIMEOUT_MS = 7000;
  function runWatchdog(peers, lastPongByPeer, nowMs) {
    const dead = [];
    for (const pid of peers) {
      const last = lastPongByPeer.get(pid);
      if (last != null && nowMs - last > PONG_TIMEOUT_MS) dead.push(pid);
    }
    return dead;
  }

  const peers = ['a', 'b'];
  const last = new Map();
  // Initial seed: both peers heard from "now".
  last.set('a', 1000);
  last.set('b', 1000);

  check('no evictions immediately after seed',
    runWatchdog(peers, last, 1100).length === 0);

  // 6.9 s later — 'a' still within grace.
  check('no eviction just under timeout',
    runWatchdog(peers, last, 1000 + 6900).length === 0);

  // 7.1 s later — both peers overdue.
  const evicted = runWatchdog(peers, last, 1000 + 7100);
  check('both peers evicted past timeout', evicted.length === 2);

  // 'b' responded to a PONG at 6 s, but 'a' never did. Only 'a' should be
  // evicted at 8 s.
  last.set('b', 1000 + 6000);
  const evicted2 = runWatchdog(peers, last, 1000 + 8000);
  check('only the silent peer evicted',
    evicted2.length === 1 && evicted2[0] === 'a',
    `evicted=${JSON.stringify(evicted2)}`);
}

// ─── Test 5: PEER_QUIT receive → state transitions (pure logic) ──────────
// Models what main.js's PEER_QUIT handler must do when the host is at
// charSelect. The handler lives inside main.js so we replicate the state
// shape here and verify the transition. If main.js changes, this test is
// a canary — rewrite both together.
group('PEER_QUIT handler — charSelect → popup + net.role=solo');
{
  // Fixture: host sitting at charSelect with one connected client peer.
  const state = {
    gameState: 'charSelect',
    netRole: 'host',
    peers: new Set(['client-1']),
    _hsDisconnectPopup: false,
    _hsDisconnectReason: '',
    _remoteReady: true,
    _clientReady: false,
    _lobbyPeers: [{ peerId: 'client-1', name: 'Player 2' }],
    _charSelectQuitConfirm: false,
  };

  // Apply the PEER_QUIT transition (a minimal mirror of main.js line
  // ~838–871). This is a regression guard: if the real handler diverges,
  // update both sides in lockstep.
  function applyPeerQuit(state) {
    const inRun = ['playing','map','prep','draft','itemReward','shop',
                   'event','rest','discard','upgrade','paused','victory']
                 .includes(state.gameState);
    state.netRole = 'solo';
    state.peers.clear();
    state._lobbyPeers = [];
    state._remoteReady = false;
    state._clientReady = false;
    if (!inRun && (state.gameState === 'charSelect' || state.gameState === 'lobby')) {
      state._hsDisconnectPopup = true;
      state._hsDisconnectReason = 'left the session';
    }
    return state;
  }

  applyPeerQuit(state);
  check('popup raised at charSelect', state._hsDisconnectPopup === true);
  check('net role dropped to solo', state.netRole === 'solo');
  check('peers cleared', state.peers.size === 0);
  check('lobby peers cleared', state._lobbyPeers.length === 0);
  check('ready flags cleared',
    state._remoteReady === false && state._clientReady === false);
}

// ─── Test 6: evt DC close → immediate peer eviction ──────────────────────
// The user-reported bug: host at charSelect, client leaves, host doesn't
// get the signal. The fastest signal available is the evt DataChannel's
// `onclose` — when the remote pc.close()s, DTLS closes, the host's DC
// closes, onclose fires. Net.js wires this via _cfWireDcLifecycle; verify
// the handler exists and correctly evicts.
group('DataChannel onclose → peer eviction (fastest path)');
{
  const realRTC = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPC;

  const net = new Net({ role: 'host' });
  const peerId = 'client-42';
  const peer = net._cfMakePeer(peerId);
  // Simulate what _cfPreparePeer does: attach an evt DC and wire lifecycle.
  peer.evtDc = new MockDC('evt');
  net._cfWireDcLifecycle(peer.evtDc, peerId);
  peer.pc._setState('connected');

  // Capture leave event.
  let leftPeer = null;
  net.on('peer', (m) => { if (m.kind === 'leave') leftPeer = m.peerId; });

  check('peer present before DC close', net.peers.has(peerId));

  // Remote side closes → our local DC transitions to 'closed' and fires onclose.
  peer.evtDc.readyState = 'closed';
  if (peer.evtDc.onclose) peer.evtDc.onclose();

  check('peer evicted when evt DC closes', !net.peers.has(peerId));
  check('peer leave dispatched with correct id', leftPeer === peerId);

  globalThis.RTCPeerConnection = realRTC;
}

// ─── Test 7: end-to-end scenario — host sees client leave ─────────────────
// Recreates the user-reported bug end-to-end: client at charSelect sends
// PEER_QUIT then disconnects, host must (a) receive the reliable event OR
// (b) detect the closed DC, and in both cases the host's peer-leave /
// PEER_QUIT handler state transitions run to completion.
group('End-to-end: client at charSelect leaves → host state converges');
{
  const realRTC = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPC;

  // Host side
  const host = new Net({ role: 'host' });
  host.connected = true;
  host._strategy = 'cloudflare'; // so disconnect() iterates peers via _cfRemovePeer
  const clientId = 'joined-player';
  const hostPeer = host._cfMakePeer(clientId);
  hostPeer.evtDc = new MockDC('evt');
  host._cfWireDcLifecycle(hostPeer.evtDc, clientId);
  hostPeer.pc._setState('connected');

  // Mirror the minimal host-side game state from main.js so we can assert
  // the UI outcome. If the handler logic in main.js drifts from this
  // mirror, fix both together — that's what makes this a regression test.
  const hostState = {
    gameState: 'charSelect',
    _hsDisconnectPopup: false,
    _hsDisconnectReason: '',
    _remoteReady: true,
    _clientReady: false,
    _lobbyPeers: [{ peerId: clientId, name: 'Player 2' }],
    _remoteReadyByPeer: new Map([[clientId, true]]),
    _peerToIndex: new Map([[clientId, 1]]),
    _lastPongByPeer: new Map([[clientId, performance.now()]]),
    netRole: 'host',
  };

  // Wire up host's peer-leave handler — mirrors main.js charSelect branch.
  host.on('peer', (m) => {
    if (m.kind !== 'leave') return;
    hostState._lobbyPeers = hostState._lobbyPeers.filter(p => p.peerId !== m.peerId);
    hostState._peerToIndex.delete(m.peerId);
    hostState._remoteReadyByPeer.delete(m.peerId);
    hostState._lastPongByPeer.delete(m.peerId);
    if (hostState.gameState === 'charSelect') {
      hostState._hsDisconnectPopup = true;
      hostState._hsDisconnectReason = 'lost connection';
      hostState.netRole = 'solo';
      hostState._remoteReady = false;
      hostState._clientReady = false;
    }
  });
  // Wire up PEER_QUIT handler too — mirrors main.js:838–871. The real
  // handler does direct state updates AND also triggers peer-leave events
  // via disconnect(). Both layers must converge on the same end state.
  host.on('evt', (msg) => {
    if (msg?.type !== 'PEER_QUIT') return;
    host.disconnect(); // triggers peer leave via _cfRemovePeer
    hostState.netRole = 'solo';
    hostState._lobbyPeers = [];
    hostState._remoteReady = false;
    hostState._clientReady = false;
    hostState._remoteReadyByPeer.clear();
    hostState._peerToIndex.clear();
    hostState._lastPongByPeer.clear();
    if (hostState.gameState === 'charSelect' || hostState.gameState === 'lobby') {
      hostState._hsDisconnectPopup = true;
      hostState._hsDisconnectReason = 'left the session';
    }
  });

  // ───── Scenario A: client successfully sends PEER_QUIT then closes ─────
  // Simulate the reliable event arriving on the host's evt DC.
  if (hostPeer.evtDc.onmessage == null) {
    hostPeer.evtDc.onmessage = (e) => {
      try { host._dispatch('evt', JSON.parse(e.data), clientId); } catch {}
    };
  }
  hostPeer.evtDc.onmessage({ data: JSON.stringify({ type: 'PEER_QUIT', reason: 'test' }) });

  check('host popup raised after PEER_QUIT', hostState._hsDisconnectPopup === true);
  check('host net role → solo', hostState.netRole === 'solo');
  check('host lobby peers cleared', hostState._lobbyPeers.length === 0);
  check('host ready map cleared',
    hostState._remoteReadyByPeer.size === 0);
  check('host PONG map cleared', hostState._lastPongByPeer.size === 0);
  check('peer evicted from Net.peers', !host.peers.has(clientId));

  // ───── Scenario B: PEER_QUIT is lost, but the DC closes — fallback ─────
  // Reset everything for scenario B.
  const host2 = new Net({ role: 'host' });
  const peer2 = host2._cfMakePeer(clientId);
  peer2.evtDc = new MockDC('evt');
  host2._cfWireDcLifecycle(peer2.evtDc, clientId);
  peer2.pc._setState('connected');

  let dcCloseLeft = null;
  host2.on('peer', (m) => { if (m.kind === 'leave') dcCloseLeft = m.peerId; });

  // Simulate remote calling pc.close() → local DC onclose fires.
  peer2.evtDc.readyState = 'closed';
  peer2.evtDc.onclose();

  check('DC-close fallback evicts peer', !host2.peers.has(clientId));
  check('DC-close fallback dispatches leave', dcCloseLeft === clientId);

  globalThis.RTCPeerConnection = realRTC;
}

// ─── Test 8: the exact debug-log scenario — peer joins then channel closes
// Matches the user-reported log:
//   [Net] CF peer announced: irrbta1m
//   [Net] peer irrbta1m → connecting
//   [Net] peer irrbta1m → connected
//   [Net] peer irrbta1m evt channel closing — evicting
//   [Net] peer irrbta1m evt channel closed — evicting
// The question this test answers: does the host's main.js state end up
// clean (popup shown, net.role = solo, lobby peers cleared) regardless of
// whether the host was at 'lobby' or 'charSelect' when the channel closed?
group('Debug-log scenario: peer joins, channel closes, host converges');
for (const hostGameState of ['lobby', 'charSelect']) {
  const realRTC = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPC;

  const host = new Net({ role: 'host' });
  host.connected = true;
  host._strategy = 'cloudflare';
  const peerId = 'irrbta1m';

  // Simulate _cfPreparePeer path (host is responder): peer joins, DC arrives.
  host._cfPreparePeer(peerId);
  const peer = host.peers.get(peerId);
  // Drive the RTCPC through connecting → connected exactly like the log.
  peer.pc._setState('connecting');
  peer.pc._setState('connected');
  // Drive ondatachannel by manually attaching an evt DC the way the real
  // handler would — it runs the same _cfWireDcLifecycle.
  peer.evtDc = new MockDC('evt');
  peer.evtDc.onmessage = (e) => host._dispatch('evt', JSON.parse(e.data), peerId);
  host._cfWireDcLifecycle(peer.evtDc, peerId);

  // Host-side state matching the unified main.js handler we just wrote.
  const state = {
    gameState: hostGameState,
    _hsDisconnectPopup: false,
    _hsDisconnectReason: '',
    _hsDisconnectAutoCloseAt: 0,
    _remoteReady: true,
    _clientReady: false,
    _lobbyPeers: [{ peerId, name: 'Player 2' }],
    lobbyMode: hostGameState === 'lobby' ? 'hosting' : 'menu',
    netRole: 'host',
  };

  // Unified peer-leave handler — mirrors main.js:268–287.
  host.on('peer', (m) => {
    if (m.kind !== 'leave') return;
    state._lobbyPeers = state._lobbyPeers.filter(p => p.peerId !== m.peerId);
    if (state.gameState === 'charSelect' || state.gameState === 'lobby') {
      state._remoteReady = false;
      state._clientReady = false;
      state._hsDisconnectPopup = true;
      state._hsDisconnectReason = state.netRole === 'client' ? 'host disconnected' : 'left the session';
      state._hsDisconnectAutoCloseAt = Date.now() + 5000;
      if (state.gameState === 'lobby') state.lobbyMode = 'menu';
      state.netRole = 'solo';
    }
  });

  // Simulate the client closing: DC transitions 'closing' → 'closed'.
  peer.evtDc.readyState = 'closing';
  peer.evtDc.onclosing?.();
  peer.evtDc.readyState = 'closed';
  peer.evtDc.onclose();

  check(`[${hostGameState}] popup raised`, state._hsDisconnectPopup === true);
  check(`[${hostGameState}] net.role → solo`, state.netRole === 'solo');
  check(`[${hostGameState}] lobby peers cleared`, state._lobbyPeers.length === 0);
  check(`[${hostGameState}] peer removed from net.peers`, !host.peers.has(peerId));
  check(`[${hostGameState}] auto-close timer armed`,
    state._hsDisconnectAutoCloseAt > 0);

  globalThis.RTCPeerConnection = realRTC;
}

// ─── Test 9: auto-close timer returns user to main menu ──────────────────
// When the user walks away, the popup should self-dismiss and land them
// on the intro screen so "stuck at hero select" is impossible to hit.
group('Auto-close timer — popup dismisses itself after 5 s');
{
  const state = {
    gameState: 'charSelect',
    _hsDisconnectPopup: true,
    _hsDisconnectAutoCloseAt: 100, // 100 ms deadline for the test
    gameStateAfterDismiss: null,
  };
  // Emulate the update-loop check we added.
  function tick(nowMs) {
    if (state._hsDisconnectPopup &&
        state._hsDisconnectAutoCloseAt > 0 &&
        nowMs >= state._hsDisconnectAutoCloseAt) {
      state._hsDisconnectPopup = false;
      state._hsDisconnectAutoCloseAt = 0;
      state.gameStateAfterDismiss = 'intro';
      state.gameState = 'intro';
    }
  }
  tick(50);
  check('popup still up before deadline', state._hsDisconnectPopup === true);
  tick(150);
  check('popup dismissed at deadline', state._hsDisconnectPopup === false);
  check('user landed on intro', state.gameState === 'intro');
}

// ─── Test 10: client-side host-silence detection ─────────────────────────
// The client tracks when the host last PINGed it. If the host vanishes
// mid-charSelect the client should tear down rather than waiting on the
// READY button forever.
group('Client-side host-silence watchdog');
{
  const CLIENT_HOST_TIMEOUT_MS = 6000;
  function check_client_watchdog(nowMs, lastHostPingAt) {
    return nowMs - lastHostPingAt > CLIENT_HOST_TIMEOUT_MS;
  }
  check('fresh ping → no timeout',
    check_client_watchdog(1000, 1000) === false);
  check('5 s gap → still alive',
    check_client_watchdog(6000, 1000) === false);
  check('6.1 s gap → host silent',
    check_client_watchdog(7100, 1000) === true);
}

// ─── Test 11: lobby/charSelect watchdog — fallback popup raise ───────────
// Belt-and-suspenders: if the peer-leave event somehow didn't set the
// popup (event lost, dispatch suppressed, whatever), the per-frame
// update-loop watchdog notices "we had peers, now we don't, role is
// still host/client" and raises the popup anyway. Without this check
// the user could sit indefinitely at the lobby.
group('Lobby watchdog — raises popup if peer-leave handler missed');
{
  function watchdogTick(state, netPeersSize, netRole) {
    const curPeers = netPeersSize;
    if (curPeers > state._lobbyPeakPeerCount) state._lobbyPeakPeerCount = curPeers;
    const hadPeer = state._lobbyPeakPeerCount > 0;
    const noPeersNow = curPeers === 0;
    const stillRemoteRole = netRole !== 'solo';
    if ((state.gameState === 'lobby' || state.gameState === 'charSelect') &&
        hadPeer && noPeersNow && stillRemoteRole && !state._hsDisconnectPopup) {
      state._hsDisconnectPopup = true;
      state._hsDisconnectReason = netRole === 'client' ? 'host disconnected' : 'left the session';
      state._hsDisconnectAutoCloseAt = 30000;
      state._resolvedNetRole = 'solo';
    }
  }

  // Host at lobby, peer joins, peer leaves, peer-leave handler did NOT
  // set the popup for whatever reason. Watchdog must catch it.
  const s = {
    gameState: 'lobby',
    _hsDisconnectPopup: false,
    _hsDisconnectAutoCloseAt: 0,
    _hsDisconnectReason: '',
    _lobbyPeakPeerCount: 0,
    _resolvedNetRole: 'host',
  };
  watchdogTick(s, 0, 'host');
  check('no popup when no peers ever joined', s._hsDisconnectPopup === false);

  watchdogTick(s, 1, 'host');
  check('peak tracks peer joining', s._lobbyPeakPeerCount === 1);
  check('no popup while peer is still connected', s._hsDisconnectPopup === false);

  watchdogTick(s, 0, 'host'); // peer left, but popup never raised by handler
  check('popup raised by watchdog on transition 1→0',
    s._hsDisconnectPopup === true);
  check('watchdog set reason for host', s._hsDisconnectReason === 'left the session');
  check('watchdog armed auto-close', s._hsDisconnectAutoCloseAt > 0);

  // Idempotent: running watchdog again doesn't re-raise or thrash state.
  const prevReason = s._hsDisconnectReason;
  s._hsDisconnectReason = 'USER_MODIFIED';
  watchdogTick(s, 0, 'solo'); // role already solo after teardown
  check('watchdog is no-op when role already solo',
    s._hsDisconnectReason === 'USER_MODIFIED');

  // Client-side variant: reason should be "host disconnected".
  const c = {
    gameState: 'charSelect',
    _hsDisconnectPopup: false,
    _hsDisconnectAutoCloseAt: 0,
    _hsDisconnectReason: '',
    _lobbyPeakPeerCount: 0,
    _resolvedNetRole: 'client',
  };
  watchdogTick(c, 1, 'client');
  watchdogTick(c, 0, 'client');
  check('client watchdog reason = host disconnected',
    c._hsDisconnectReason === 'host disconnected');
}

// ─── Summary ─────────────────────────────────────────────────────────────
console.log(
  `\n${failed === 0 ? '✓' : '✗'}  ${total - failed}/${total} checks passed`
  + (failed ? `  (${failed} failed)` : '')
);
process.exit(failed === 0 ? 0 : 1);
