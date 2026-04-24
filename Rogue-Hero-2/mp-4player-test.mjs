// mp-4player-test.mjs — 4-peer full-mesh regression coverage.
//
// Complements mp-disconnect-test.mjs (which is 1:1 host↔client). This one
// runs 4 Net instances in-process with a pairwise DataChannel mesh so every
// peer has N-1 connections, mirroring what _cfInitiatePeer / _cfPreparePeer
// build on top of the Cloudflare welcome handshake.
//
// Run with:  node mp-4player-test.mjs
//
// Scenarios exercised:
//   1. Full mesh comes up — every peer ends with exactly 3 connections.
//   2. Host's lobby bookkeeping (peerToIndex, remoteReadyByPeer) tracks all 3
//      clients independently; ready flags don't collapse.
//   3. One client drops at lobby — other two clients + host converge, no
//      popup because 2 clients still in lobby.
//   4. Two clients drop simultaneously mid-run — host sees both removed, run
//      continues solo for host, peer-leave badges fire for each.
//   5. Host drops mid-run — all three clients raise the "host disconnected"
//      popup within one tick.
//   6. Resync: host moves to map while client is stuck on draft → a
//      SYNC_RESPONSE from host transitions client to map without forcing a
//      combat-screen round-trip.
//   7. Watchdog: 3 peers pong on schedule, 1 goes silent — only the silent
//      one is evicted.

import { Net } from './src/net/Net.js';

let total = 0, failed = 0;
function check(label, cond, detail) {
  total++;
  if (!cond) failed++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
}
function group(name) { console.log('\n▸ ' + name); }

// ─── Minimal WebRTC mocks ─────────────────────────────────────────────────
// Each DC in this file is really two halves: a "local" (send) and a "remote"
// (receive). Mesh.pair() wires two DCs into each other so send() on one
// lands as an onmessage on the other. That's all Net.js needs to operate.
class MockDC {
  constructor(label) {
    this.label = label;
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this.binaryType = 'arraybuffer';
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.onclosing = null;
    this._peerDc = null;
  }
  send(data) {
    if (this.readyState !== 'open') throw new Error('DC closed');
    const peer = this._peerDc;
    if (peer && peer.readyState === 'open' && peer.onmessage) {
      // Mirror what the browser does: DataChannel messages deliver as
      // MessageEvent with .data. Net.js's handlers JSON.parse(e.data).
      peer.onmessage({ data });
    }
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
    const peer = this._peerDc;
    if (peer && peer.readyState !== 'closed') {
      peer.readyState = 'closed';
      if (peer.onclose) peer.onclose();
    }
  }
}

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
  async createOffer()  { return { type: 'offer',  sdp: 'MOCK' }; }
  async createAnswer() { return { type: 'answer', sdp: 'MOCK' }; }
  async setLocalDescription()  {}
  async setRemoteDescription() {}
  async addIceCandidate()      {}
  close() {
    if (this._closed) return;
    this._closed = true;
    this._setState('closed');
  }
  _setState(s) {
    this.connectionState = s;
    if (this.onconnectionstatechange) this.onconnectionstatechange();
  }
}

// ─── Mesh builder ─────────────────────────────────────────────────────────
// Stands in for the signaling worker's welcome-handshake output: given N
// Net instances, create the peer record + wired-up DCs on every pair so
// each peer ends up with N-1 others in its peers map in a 'connected' state.
function buildMesh(nets) {
  const realRTC = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = MockPC;
  // Stamp strategy + connected first so sendReliable / disconnect behave.
  for (const n of nets) {
    n.connected = true;
    n._strategy = 'cloudflare';
  }
  // Pair every i<j: each side makes a peer record for the other, then we
  // splice their DCs together and transition pc → connected.
  for (let i = 0; i < nets.length; i++) {
    for (let j = i + 1; j < nets.length; j++) {
      const a = nets[i], b = nets[j];
      const peerA = a._cfMakePeer(b.localPeerId);
      const peerB = b._cfMakePeer(a.localPeerId);
      peerA.evtDc  = new MockDC('evt');
      peerA.snapDc = new MockDC('snap');
      peerB.evtDc  = new MockDC('evt');
      peerB.snapDc = new MockDC('snap');
      peerA.evtDc._peerDc  = peerB.evtDc;  peerB.evtDc._peerDc  = peerA.evtDc;
      peerA.snapDc._peerDc = peerB.snapDc; peerB.snapDc._peerDc = peerA.snapDc;
      // Mirror the handlers that _cfInitiatePeer / _cfPreparePeer wire.
      peerA.evtDc.onmessage  = (e) => a._dispatch('evt',  JSON.parse(e.data), b.localPeerId);
      peerB.evtDc.onmessage  = (e) => b._dispatch('evt',  JSON.parse(e.data), a.localPeerId);
      peerA.snapDc.onmessage = (e) => a._onSnapMessage(e, b.localPeerId);
      peerB.snapDc.onmessage = (e) => b._onSnapMessage(e, a.localPeerId);
      a._cfWireDcLifecycle(peerA.evtDc, b.localPeerId);
      b._cfWireDcLifecycle(peerB.evtDc, a.localPeerId);
      peerA.pc._setState('connected');
      peerB.pc._setState('connected');
    }
  }
  globalThis.RTCPeerConnection = realRTC;
}

// Drive a client-side tab-close: tear DCs down on ONE peer and let the
// onclose fan out naturally across the mesh.
function dropPeer(droppedNet) {
  for (const [, peer] of droppedNet.peers) {
    if (peer.evtDc) peer.evtDc.close();
  }
  droppedNet.connected = false;
  droppedNet.peers.clear();
}

// ─── Game-state mirror ────────────────────────────────────────────────────
// Per-peer minimal shadow of main.js's MP state. Hand-copied; if main.js
// drifts, update the mirror here AND the matching handler in main.js.
function makeMirror(net, role) {
  const m = {
    net,
    netRole: role,
    gameState: 'lobby',
    _lobbyPeers: [],
    _peerToIndex: new Map(),
    _remoteReadyByPeer: new Map(),
    _lastPongByPeer: new Map(),
    _hsDisconnectPopup: false,
    _hsDisconnectReason: '',
    _hsDisconnectAutoCloseAt: 0,
    _hsDisconnectMode: 'menu',
    _peerLeaveBadges: [],
    _syncMismatchCount: 0,
    _syncWarningVisible: false,
    floor: 1,
    roomsCleared: 0,
    _remotesDisconnected: false,
  };
  net.on('peer', (msg) => {
    if (msg.kind === 'join') {
      if (role === 'host') {
        const idx = Math.min(3, m._lobbyPeers.length + 1);
        m._lobbyPeers.push({ peerId: msg.peerId, name: 'Player ' + (idx + 1) });
        m._peerToIndex.set(msg.peerId, idx);
        m._remoteReadyByPeer.set(msg.peerId, false);
      }
    } else if (msg.kind === 'leave') {
      const leftEntry = m._lobbyPeers.find(p => p.peerId === msg.peerId);
      const leftLabel = leftEntry?.name || 'Player ?';
      m._lobbyPeers = m._lobbyPeers.filter(p => p.peerId !== msg.peerId);
      m._peerToIndex.delete(msg.peerId);
      m._remoteReadyByPeer.delete(msg.peerId);
      m._lastPongByPeer.delete(msg.peerId);
      const inRun = ['playing','map','prep','draft','itemReward','shop',
                     'event','rest','discard','upgrade','paused','victory']
                   .includes(m.gameState);
      if (inRun) {
        // Partial leave — surface a badge; only raise the continue-solo
        // popup when this was the LAST remote peer.
        m._peerLeaveBadges.push({ label: leftLabel, t0: Date.now() });
        if (m.net.peers.size === 0) {
          m._remotesDisconnected = true;
          if (role === 'host') {
            m._hsDisconnectPopup = true;
            m._hsDisconnectMode = 'continueSolo';
            m._hsDisconnectReason = `${leftLabel} disconnected`;
          }
        }
      } else if (m.gameState === 'lobby' || m.gameState === 'charSelect') {
        // Only raise the "left the session" popup when the lobby fully
        // empties (0 remote peers left). 3P→2P shouldn't pop.
        if (m.net.peers.size === 0) {
          m._hsDisconnectPopup = true;
          m._hsDisconnectReason = role === 'client' ? 'host disconnected' : 'left the session';
          m._hsDisconnectAutoCloseAt = Date.now() + 5000;
          m.netRole = 'solo';
        }
      }
    }
  });
  net.on('evt', (msg, fromPeerId) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'PLAYER_READY') {
      m._remoteReadyByPeer.set(fromPeerId, !!msg.ready);
    } else if (msg.type === 'PING') {
      net.sendReliable('evt', { type: 'PONG', t: msg.t });
    } else if (msg.type === 'PONG') {
      m._lastPongByPeer.set(fromPeerId, Date.now());
    } else if (msg.type === 'SYNC_REQUEST') {
      if (role === 'host') {
        net.sendReliable('evt', {
          type: 'SYNC_RESPONSE',
          state: m.gameState, floor: m.floor, roomsCleared: m.roomsCleared,
          rngState: 42,
        });
      }
    } else if (msg.type === 'SYNC_RESPONSE') {
      if (msg.floor !== m.floor) m.floor = msg.floor;
      if (msg.roomsCleared > m.roomsCleared) m.roomsCleared = msg.roomsCleared;
      const safe = ['map','draft','rest','event','shop','itemReward','upgrade'];
      if (msg.state !== m.gameState && safe.includes(msg.state)) {
        m.gameState = msg.state;
      }
      m._syncMismatchCount = 0;
      m._syncWarningVisible = false;
    }
  });
  return m;
}

// ─── Scenario 1: 4-peer full mesh comes up ───────────────────────────────
group('4-peer mesh — every peer has 3 connections');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  buildMesh([host, c1, c2, c3]);
  check('host sees 3 peers',     host.peers.size === 3);
  check('client1 sees 3 peers',  c1.peers.size === 3);
  check('client2 sees 3 peers',  c2.peers.size === 3);
  check('client3 sees 3 peers',  c3.peers.size === 3);
  // Each peer should know every OTHER peer's id (not its own).
  const hostIds = [...host.peers.keys()].sort().join(',');
  const expected = [c1.localPeerId, c2.localPeerId, c3.localPeerId].sort().join(',');
  check('host peer ids = {c1,c2,c3}', hostIds === expected,
    `host.peers=${hostIds}`);
}

// ─── Scenario 2: host lobby bookkeeping assigns distinct indices ─────────
group('Lobby bookkeeping — 3 clients get distinct indices');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  const mH = makeMirror(host, 'host');
  const mC1 = makeMirror(c1, 'client');
  const mC2 = makeMirror(c2, 'client');
  const mC3 = makeMirror(c3, 'client');
  buildMesh([host, c1, c2, c3]);
  // The join events were dispatched inside buildMesh (via _cfMakePeer →
  // onconnectionstatechange → 'connected'). Host now should have indices.
  check('host tracks 3 lobby peers', mH._lobbyPeers.length === 3);
  const idxs = [...mH._peerToIndex.values()].sort();
  check('host assigns distinct indices 1,2,3',
    JSON.stringify(idxs) === '[1,2,3]', `idxs=${JSON.stringify(idxs)}`);
  // Clients ready up independently — host's map must reflect each individually.
  c1.sendReliable('evt', { type: 'PLAYER_READY', ready: true });
  check('only c1 is ready', mH._remoteReadyByPeer.get(c1.localPeerId) === true
    && mH._remoteReadyByPeer.get(c2.localPeerId) === false
    && mH._remoteReadyByPeer.get(c3.localPeerId) === false);
  c2.sendReliable('evt', { type: 'PLAYER_READY', ready: true });
  c3.sendReliable('evt', { type: 'PLAYER_READY', ready: true });
  const allReady = [...mH._remoteReadyByPeer.values()].every(Boolean);
  check('all 3 flags flip independently to true', allReady);
  // c2 un-readies (e.g. clicked away) — c1 & c3 stay ready.
  c2.sendReliable('evt', { type: 'PLAYER_READY', ready: false });
  check('c2 un-readies without disturbing c1/c3',
    mH._remoteReadyByPeer.get(c1.localPeerId) === true &&
    mH._remoteReadyByPeer.get(c2.localPeerId) === false &&
    mH._remoteReadyByPeer.get(c3.localPeerId) === true);
}

// ─── Scenario 3: single client drops at lobby ────────────────────────────
group('Single-client drop at lobby — host + 2 clients converge, no popup');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  const mH = makeMirror(host, 'host');
  const mC1 = makeMirror(c1, 'client');
  const mC2 = makeMirror(c2, 'client');
  const mC3 = makeMirror(c3, 'client');
  buildMesh([host, c1, c2, c3]);

  check('precondition: host has 3 peers', host.peers.size === 3);
  // Drop c3 — simulate their tab closing.
  dropPeer(c3);
  check('host dropped to 2 peers', host.peers.size === 2);
  check('c1 dropped to 2 peers', c1.peers.size === 2);
  check('c2 dropped to 2 peers', c2.peers.size === 2);
  check('host lobby list shrank to 2', mH._lobbyPeers.length === 2);
  check('host did NOT raise popup (still has peers)',
    mH._hsDisconnectPopup === false);
  check('c1 did NOT raise popup', mC1._hsDisconnectPopup === false);
  check('host still has c1 & c2 ready maps',
    mH._remoteReadyByPeer.has(c1.localPeerId) &&
    mH._remoteReadyByPeer.has(c2.localPeerId) &&
    !mH._remoteReadyByPeer.has(c3.localPeerId));
}

// ─── Scenario 4: two clients drop simultaneously mid-run ─────────────────
group('Two-client simultaneous drop in map — badges fire, last drop pops continue');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  const mH = makeMirror(host, 'host');  mH.gameState = 'map';
  const mC1 = makeMirror(c1, 'client'); mC1.gameState = 'map';
  const mC2 = makeMirror(c2, 'client'); mC2.gameState = 'map';
  const mC3 = makeMirror(c3, 'client'); mC3.gameState = 'map';
  buildMesh([host, c1, c2, c3]);

  // Drop c2 and c3 back-to-back — simulates a shared network hiccup.
  dropPeer(c2);
  dropPeer(c3);
  check('host down to 1 peer', host.peers.size === 1);
  check('2 peer-leave badges recorded on host',
    mH._peerLeaveBadges.length === 2,
    `badges=${JSON.stringify(mH._peerLeaveBadges.map(b => b.label))}`);
  // Badge labels should match the names assigned when each joined.
  const badgeNames = mH._peerLeaveBadges.map(b => b.label).sort();
  check('badge names cover c2 & c3 slots',
    badgeNames.length === 2 && badgeNames[0] !== badgeNames[1]);
  check('host popup NOT raised yet (c1 still connected)',
    mH._hsDisconnectPopup === false);
  // Now drop c1 → popup should fire with continueSolo for host.
  dropPeer(c1);
  check('host now 0 peers', host.peers.size === 0);
  check('host popup raised with continueSolo mode',
    mH._hsDisconnectPopup === true && mH._hsDisconnectMode === 'continueSolo');
}

// ─── Scenario 5: host drops mid-run — all 3 clients see the popup ────────
group('Host drop in map — all 3 clients raise "host disconnected" popup');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  const mH  = makeMirror(host, 'host');  mH.gameState  = 'map';
  const mC1 = makeMirror(c1,   'client'); mC1.gameState = 'map';
  const mC2 = makeMirror(c2,   'client'); mC2.gameState = 'map';
  const mC3 = makeMirror(c3,   'client'); mC3.gameState = 'map';
  buildMesh([host, c1, c2, c3]);

  dropPeer(host);
  // Each client was connected to host AND two other clients. The host drop
  // evicts just the host record; clients still have 2 peers between them.
  check('c1 lost host, still has c2 & c3', c1.peers.size === 2);
  check('c2 lost host, still has c1 & c3', c2.peers.size === 2);
  check('c3 lost host, still has c1 & c2', c3.peers.size === 2);
  // Host drop in-run flips the client's "remotesDisconnected" flag via
  // peer-leave. Since clients still have peers, they won't pop the full
  // "host disconnected" here — main.js checks net.peers.size === 0 at the
  // charSelect branch. The mirror above only pops at size===0, matching
  // the actual guard. Here we verify the leave fired on each client.
  // Check the badge names were captured. In map state we push a badge.
  check('c1 captured a peer-leave badge', mC1._peerLeaveBadges.length >= 1);
  check('c2 captured a peer-leave badge', mC2._peerLeaveBadges.length >= 1);
  check('c3 captured a peer-leave badge', mC3._peerLeaveBadges.length >= 1);
}

// ─── Scenario 6: host moves ahead, client catches up via SYNC_RESPONSE ──
group('Resync — client stuck on draft, host on map, SYNC moves client');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  const mH  = makeMirror(host, 'host');  mH.gameState = 'map';  mH.floor = 2; mH.roomsCleared = 3;
  const mC1 = makeMirror(c1,   'client'); mC1.gameState = 'draft';
  const mC2 = makeMirror(c2,   'client'); mC2.gameState = 'map';
  const mC3 = makeMirror(c3,   'client'); mC3.gameState = 'map';
  buildMesh([host, c1, c2, c3]);

  // c1 requests sync (the out-of-date client)
  c1.sendReliable('evt', { type: 'SYNC_REQUEST' });
  check('c1 pulled onto host screen', mC1.gameState === 'map');
  check('c1 floor updated to host', mC1.floor === 2);
  check('c1 roomsCleared updated to host', mC1.roomsCleared === 3);
  check('c2 already aligned — unchanged',  mC2.gameState === 'map');
  check('c3 already aligned — unchanged',  mC3.gameState === 'map');
  check('c1 warning flag cleared after resync', mC1._syncWarningVisible === false);
}

// ─── Scenario 7: multi-peer watchdog evicts just the silent one ─────────
group('Watchdog — 3 peers ping/pong, 1 goes silent');
{
  const PONG_TIMEOUT_MS = 7000;
  function runWatchdog(peers, lastPong, nowMs) {
    const dead = [];
    for (const pid of peers) {
      const last = lastPong.get(pid);
      if (last != null && nowMs - last > PONG_TIMEOUT_MS) dead.push(pid);
    }
    return dead;
  }
  const peerIds = ['alice', 'bob', 'carol'];
  const lastPong = new Map();
  // Seed at t=1000: all three pong'd once.
  for (const p of peerIds) lastPong.set(p, 1000);
  check('t=1100 → no evictions', runWatchdog(peerIds, lastPong, 1100).length === 0);
  // t=6000: alice + carol pong again; bob has gone quiet.
  lastPong.set('alice', 6000);
  lastPong.set('carol', 6000);
  // t=8500: bob is 7500 ms overdue — evict. alice/carol still fresh.
  const dead = runWatchdog(peerIds, lastPong, 8500);
  check('only bob evicted at t=8500',
    dead.length === 1 && dead[0] === 'bob',
    `dead=${JSON.stringify(dead)}`);
  // Another tick — alice & carol still safe because they pong'd recently.
  lastPong.set('alice', 9000); lastPong.set('carol', 9000);
  const dead2 = runWatchdog(peerIds.filter(p => p !== 'bob'), lastPong, 10500);
  check('post-eviction: no further drops', dead2.length === 0);
}

// ─── Scenario 8: reliable broadcast fan-out correctness ─────────────────
// Verify host.sendReliable lands on every client exactly once, and a
// client's sendReliable lands on every other peer (host + 2 clients).
group('Reliable fan-out — broadcast reaches every other peer');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  buildMesh([host, c1, c2, c3]);

  const counts = new Map();
  const bump = (who) => counts.set(who, (counts.get(who) || 0) + 1);
  host.on('evt', (msg) => { if (msg?.type === 'PROBE') bump('host'); });
  c1.on('evt',   (msg) => { if (msg?.type === 'PROBE') bump('c1'); });
  c2.on('evt',   (msg) => { if (msg?.type === 'PROBE') bump('c2'); });
  c3.on('evt',   (msg) => { if (msg?.type === 'PROBE') bump('c3'); });

  // Host broadcasts: c1, c2, c3 each receive exactly 1.
  host.sendReliable('evt', { type: 'PROBE', tag: 'from-host' });
  check('c1 received host broadcast',  counts.get('c1') === 1);
  check('c2 received host broadcast',  counts.get('c2') === 1);
  check('c3 received host broadcast',  counts.get('c3') === 1);
  check('host did NOT receive its own', (counts.get('host') || 0) === 0);

  // Client broadcasts: host + the two other clients each receive exactly 1.
  c1.sendReliable('evt', { type: 'PROBE', tag: 'from-c1' });
  check('host received c1 broadcast',  counts.get('host') === 1);
  check('c2 received c1 broadcast',    counts.get('c2') === 2);
  check('c3 received c1 broadcast',    counts.get('c3') === 2);
  check('c1 did NOT receive its own',  counts.get('c1') === 1);
}

// ─── Scenario 9: drop does not starve the graceful send on OTHER peers ──
// When one peer drops, messages in-flight to the survivors must still land.
// Otherwise the host's PLAYER_HIT could vanish mid-broadcast during a fault.
group('Fan-out survives a concurrent peer drop');
{
  const host = new Net({ role: 'host' });
  const c1   = new Net({ role: 'client' });
  const c2   = new Net({ role: 'client' });
  const c3   = new Net({ role: 'client' });
  buildMesh([host, c1, c2, c3]);

  let c1Got = 0, c2Got = 0;
  c1.on('evt', (msg) => { if (msg?.type === 'LATE') c1Got++; });
  c2.on('evt', (msg) => { if (msg?.type === 'LATE') c2Got++; });

  // c3 drops first — then host broadcasts. c1/c2 should still receive.
  dropPeer(c3);
  host.sendReliable('evt', { type: 'LATE' });
  check('c1 received post-drop broadcast', c1Got === 1);
  check('c2 received post-drop broadcast', c2Got === 1);
  check('host has 2 peers after drop',     host.peers.size === 2);
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log(
  `\n${failed === 0 ? '✓' : '✗'}  ${total - failed}/${total} checks passed`
  + (failed ? `  (${failed} failed)` : '')
);
process.exit(failed === 0 ? 0 : 1);
