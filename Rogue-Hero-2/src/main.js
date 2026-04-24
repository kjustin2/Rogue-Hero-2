import { Engine } from './Engine.js';
import { EventBus, events } from './EventBus.js';
import { InputManager } from './Input.js';
import { Renderer } from './Renderer.js';
import { Player } from './player.js';
import { Chaser, Sniper, Bruiser, Turret, Teleporter, Swarm, Healer, Mirror, TempoVampire, ShieldDrone, Phantom, Blocker, Bomber, Marksman, BossBrawler, BossConductor, BossEcho, BossNecromancer, BossApex, Juggernaut, Stalker, Splitter, Split, Corruptor, BerserkerEnemy, RicochetDrone, Timekeeper, Disruptor, Sentinel, BossArchivist } from './Enemy.js';
import { TempoSystem } from './tempo.js';
import { CombatManager } from './Combat.js';
import { ParticleSystem } from './Particles.js';
import { AudioSynthesizer } from './audio.js';
import { UI, rangeLabel } from './ui.js';
import { RoomManager } from './room.js';
import { DeckManager, CardDefinitions, CARD_UNLOCK_TIERS } from './DeckManager.js';
import { RunManager } from './RunManager.js';
import { MetaProgress, calculateScore } from './MetaProgress.js';
import { Characters, CharacterList, DIFFICULTY_NAMES, DIFFICULTY_COLORS, DIFFICULTY_MODS } from './Characters.js';
import { ItemManager, ItemDefinitions } from './Items.js';
import { ProjectileManager } from './Projectile.js';
import { CosmeticById, BOX_TIERS, rollBox, drawPlayerShape, drawPlayerAura, RARITY_COLORS, RARITY_LABELS, CATEGORY_LABELS, getPrismaticColor, drawKillEffect } from './Cosmetics.js';
// ── RH2 multiplayer/biome additions ──
import { Players, makePlayer, PLAYER_HALO_COLORS } from './Players.js';
import { SpatialHash } from './SpatialHash.js';
import { Biomes, pickBiomeForFloor } from './Biomes.js';
import { Net } from './net/Net.js';
import { HostSim } from './net/HostSim.js';
import { Lobby } from './net/Lobby.js';
import { SnapshotDecoder } from './net/Snapshot.js';
import { Reconcile } from './net/Reconcile.js';
import { TetherWitch, MireToad, Bloomspawn, IronChoir, StaticHound, BossHollowKing, BossVaultEngine, BossAurora } from './EnemiesRH2.js';
import { initDevConsole } from './DevConsole.js';

// Expose defs for UI (avoids circular imports)
window._itemDefs = ItemDefinitions;
window._cosmeticDefs = CosmeticById;
window._charData = { Characters };

// Polyfill ctx.roundRect for browsers that don't support it (Chrome <99, Firefox <112)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y, x + w, y + h, radius);
    this.arcTo(x + w, y + h, x, y + h, radius);
    this.arcTo(x, y + h, x, y, radius);
    this.arcTo(x, y, x + w, y, radius);
    this.closePath();
  };
}

console.log('[Init] Rogue Hero booting...');
const canvas = document.getElementById('game');
if (!canvas) console.error('[Init] FATAL: canvas#game not found!');
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.CANVAS_W = canvas.width;
  window.CANVAS_H = canvas.height;
  if (room) { room.w = canvas.width; room.h = canvas.height; }
  if (ui) { ui.width = canvas.width; ui.height = canvas.height; }
});
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.CANVAS_W = canvas.width;
window.CANVAS_H = canvas.height;

// Hide native cursor globally — DOM cursor overlay replaces it.
// Outer DIV is 0×0 (so no bounding rectangle is ever visible), with all
// marks absolutely-positioned relative to its anchor. Uses a plain HTML
// div tree (not inline SVG) because some Electron/Chromium builds fail to
// hit-test or position an SVG root with `style.transform` — users reported
// the cursor disappearing and clicks failing in the packaged build.
(function _initDomCursor() {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { cursor: none !important; }
    @keyframes _gcSpin { from { transform: translate(-50%,-50%) rotate(0deg); }
                          to { transform: translate(-50%,-50%) rotate(360deg); } }
    @keyframes _gcDot  { 0%,100% { transform: translate(-50%,-50%) scale(1);   opacity: 0.88; }
                          50%    { transform: translate(-50%,-50%) scale(1.6); opacity: 1; } }
    #game-cursor { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 9999; width: 0; height: 0; overflow: visible; }
    #game-cursor .gc-bars { position: absolute; left: 0; top: 0; animation: _gcSpin 6s linear infinite; transform-origin: 0 0; pointer-events: none; }
    #game-cursor .gc-dot  { position: absolute; left: 0; top: 0; animation: _gcDot 1.4s ease-in-out infinite; pointer-events: none; }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'game-cursor';

  // Rotating crosshair — spin group positioned at anchor, bars offset within it.
  const spinHost = document.createElement('div');
  spinHost.className = 'gc-bars';
  const mkBar = (w, h, tx, ty) => {
    const b = document.createElement('div');
    Object.assign(b.style, {
      position: 'absolute', left: '0', top: '0',
      width: w + 'px', height: h + 'px',
      background: '#ffffff', opacity: '0.88', borderRadius: '1px',
      transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%)`,
      pointerEvents: 'none',
    });
    return b;
  };
  // Arm endpoints at ±13, arm lengths 9 → inner edge at ±4 (8 px gap).
  spinHost.appendChild(mkBar(9, 1.5, -8.5, 0));
  spinHost.appendChild(mkBar(9, 1.5, 8.5, 0));
  spinHost.appendChild(mkBar(1.5, 9, 0, -8.5));
  spinHost.appendChild(mkBar(1.5, 9, 0, 8.5));
  root.appendChild(spinHost);

  const dot = document.createElement('div');
  dot.className = 'gc-dot';
  Object.assign(dot.style, {
    width: '3px', height: '3px', borderRadius: '50%',
    background: '#ffffff', opacity: '0.88',
  });
  root.appendChild(dot);

  document.body.appendChild(root);

  window.addEventListener('mousemove', e => {
    root.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });

  window._gameCursorDiv = root;
})();

function setCursorColor(hex) {
  const el = window._gameCursorDiv;
  if (!el) return;
  const spin = el.querySelector('.gc-bars');
  if (spin) for (const b of spin.children) b.style.background = hex;
  const d = el.querySelector('.gc-dot');
  if (d) d.style.background = hex;
}

const input = new InputManager(canvas);
const renderer = new Renderer(canvas);
const tempo = new TempoSystem();
const particles = new ParticleSystem();
const audio = new AudioSynthesizer();
const projectiles = new ProjectileManager();
const combat = new CombatManager(tempo, particles, audio, projectiles);
const room = new RoomManager(canvas.width, canvas.height);
const deckManager = new DeckManager();
const runManager = new RunManager();
const meta = new MetaProgress();
const itemManager = new ItemManager();
console.log('[Init] All systems created. Cards:', Object.keys(CardDefinitions).length, 'Items:', Object.keys(ItemDefinitions).length);
// Restore saved volume
audio.setMasterVolume(meta.getMasterVolume());

let player = new Player(400, 360);
// player.id and playerIndex are set in startNewRun() based on net.role
let enemies = [];
combat.setLists(enemies, player);

// ── RH2 multi-player infrastructure ──────────────────────────────
// Players list: index 0 is the primary; index 1+ are added when
// `localCoop` is enabled (toggle with F2 in char select) or when
// remote peers join via the Lobby.
const players = new Players();
players.add(player);
window._players = players;        // exposed for enemies that target party
const spatialHash = new SpatialHash(64);
const net = new Net({ role: 'solo' });
// Expose so cross-module code (Combat.js, enemy AI) can read current role
// without importing main.js and creating a cycle.
window._net = net;
const lobby = new Lobby(net);
const hostSim = new HostSim(net);
const snapDecoder = new SnapshotDecoder();
const reconcile = new Reconcile();
// Apply incoming position snapshots to the player & remote-entity placeholders.
// Solo: never fires (Net.connect is no-op).
net.on('snap', (snap, senderPeerId) => {
  // Co-op model: each side is authoritative for its OWN player position.
  // Snap arrives at 15Hz — we ONLY store positions here. The actual smooth
  // movement happens every frame in the main update loop so a 60fps client
  // doesn't visibly stutter to 15fps.
  // Accept binary (ArrayBuffer) or JSON-decoded object. The peerId is passed
  // to the decoder so 3–4 player mesh traffic doesn't cross-reject frames.
  if (snap instanceof ArrayBuffer) {
    if (!snapDecoder.applyBinary(snap, senderPeerId)) return;
  } else if (snap && snap.e) {
    snapDecoder.apply(snap, senderPeerId);
  } else {
    return;
  }
  // Apply boolean flags immediately (they're event-like, not motion)
  for (const p of players.list) {
    if (!p || !p.id || !p._isRemote) continue;
    const remote = snapDecoder.positions.get(p.id);
    if (!remote) continue;
    if (typeof remote.flags === 'number') {
      p.downed = (remote.flags & 2) !== 0;
      p.dodging = (remote.flags & 1) !== 0;
    }
  }
});
// Forward Net status events into the lobby UI so users actually see what
// happened (peer connected, ICE failed, room error, etc.) rather than the
// banner staying on a stale "Connecting…".
net.on('status', (s) => {
  if (!s) return;
  if (gameState !== 'lobby') return;
  if (s.kind === 'peer')        lobbyStatusMsg = `🟢 ${s.msg}`;
  else if (s.kind === 'connected')  lobbyStatusMsg = `Connected — Share code ${s.room}`;
  else if (s.kind === 'error')      lobbyStatusMsg = `⚠ ${s.msg}`;
  else if (s.kind === 'peer-error') lobbyStatusMsg = `⚠ ${s.msg}`;
});
// Handle peer connect / disconnect
net.on('peer', (msg) => {
  if (!msg) return;
  if (msg.kind === 'join') {
    if (net.role === 'host') {
      _lobbyPeers.push({ peerId: msg.peerId, name: 'Player ' + (net.peers.size + 1) });
      // Assign this peer a slot (1, 2, or 3) and broadcast the full map so
      // every peer agrees on who is whom. This is what unlocks 3–4 player
      // routing for CHAR_SELECTED / PLAYER_HP / PLAYER_DOWNED / etc.
      _hostAssignPeerIndex(msg.peerId);
      _hostBroadcastPeerIndices();
      if (gameState === 'lobby') lobbyStatusMsg = `Player connected! ${net.peers.size} peer(s) in room`;
    } else if (net.role === 'client' && gameState === 'lobby') {
      lobbyMode = 'connected';
      lobbyStatusMsg = 'Connected to host — waiting for them to start…';
    }
  } else if (msg.kind === 'leave') {
    // Resolve a human-readable label for this peer BEFORE we drop them from
    // the lobby roster — so the partial-leave badge can name them.
    const _leftLobbyEntry = _lobbyPeers.find(p => p.peerId === msg.peerId);
    const _leftLabel = (() => {
      if (_leftLobbyEntry?.name) return _leftLobbyEntry.name;
      const idx = _peerToIndex.get(msg.peerId);
      if (typeof idx === 'number') return 'Player ' + (idx + 1);
      return 'A player';
    })();
    _lobbyPeers = _lobbyPeers.filter(p => p.peerId !== msg.peerId);
    // Forget the departed peer's index/charId/ready so a later rejoin
    // doesn't inherit stale state.
    _peerToIndex.delete(msg.peerId);
    _remoteCharIds.delete(msg.peerId);
    _remoteReadyByPeer.delete(msg.peerId);
    _lastPongByPeer.delete(msg.peerId);
    if (net.role === 'host') _hostBroadcastPeerIndices();
    const inRun = ['playing','map','prep','draft','itemReward','shop','event','rest','discard','upgrade','paused','victory'].includes(gameState);
    if (inRun) {
      _remoteDisconnected = true;
      _remoteDisconnectTimer = 12; // long enough for the user to actually read it
      // 3–4P: only prune the specific peer that left. If no remote allies
      // remain, fall back to solo gameplay just like the 2P case did.
      players.list = players.list.filter(p => p._remotePeerId !== msg.peerId);
      // Drop stale per-peer state specifically for the departed peer.
      _remotePhaseDoneByPeer.delete(msg.peerId);
      _prepReadyByPeer.delete(msg.peerId);
      _remoteMapVoteByPeer.delete(msg.peerId);
      _remoteRestVoteByPeer.delete(msg.peerId);
      const remotesLeft = players.list.some(p => p._isRemote);
      if (!remotesLeft) {
        if (net.role === 'client') {
          // Client just lost its host mid-run. The host is authoritative for
          // map generation, enemy state and RNG — a demotion to solo would
          // either strand us on a half-generated map (e.g. the map screen
          // before a node is committed) or desync vs. state we never owned.
          // Route back to the main menu via the blocking popup so the user
          // explicitly acknowledges the loss before being silently dropped.
          _hsDisconnectPopup = true;
          _hsDisconnectMode = 'menu'; // single-button: client can't continue solo
          _hsDisconnectReason = 'host disconnected';
          _hsDisconnectAutoCloseAt = performance.now() + 30000;
          try { net.disconnect(); } catch {}
          net.role = 'solo';
          _lobbyPeers = [];
          _remoteReady = false;
          _clientReady = false;
          players.list = players.list.filter(p => !p._isRemote);
          if (player) player._coopMode = false;
          _remotePhaseDone = true;
          _localPhaseDone = true;
          _prepReadyLocal = true;
          _prepReadyRemote = true;
          _remotePhaseDoneByPeer.clear();
          _prepReadyByPeer.clear();
          _remoteMapVoteByPeer.clear();
          _remoteRestVoteByPeer.clear();
          selectedCharId = null;
          lobbyMode = 'menu';
          lobbyStatusMsg = '';
          gameState = 'intro';
          audio.silenceMusic();
          audio.playBGM('menu');
        } else {
          // Host lost its last remote ally — the host owns the sim, so we
          // CAN continue solo. Show a two-button popup so the host explicitly
          // chooses [CONTINUE SOLO] or [RETURN TO MENU]. Without this popup
          // the host previously got only the brief banner, which the user
          // reported as "the host didn't receive anything so they didn't
          // know a joined player even left".
          _hsDisconnectPopup = true;
          _hsDisconnectMode = 'continueSolo';
          _hsDisconnectReason = `${_leftLabel} disconnected`;
          // No auto-close: host stays paused on the popup until they choose.
          _hsDisconnectAutoCloseAt = 0;
          if (player) player._coopMode = false;
          _remotePhaseDone = true;
          _localPhaseDone = true;
          _prepReadyLocal = true;
          _prepReadyRemote = true;
          _remotePhaseDoneByPeer.clear();
          _prepReadyByPeer.clear();
          _remoteMapVoteByPeer.clear();
          _remoteRestVoteByPeer.clear();
        }
      } else {
        // With other allies still connected, just recompute aggregates so
        // gates open correctly if the departed peer was the last holdout.
        // Surface a brief named badge so the remaining peers see WHO left
        // rather than the roster silently shrinking.
        _peerLeaveBadge = { label: _leftLabel, t0: performance.now() / 1000 };
        _recomputeRemoteAggregates();
      }
      // Audio cue + screen shake so the disconnect is impossible to miss
      events.emit('PLAY_SOUND', 'crash');
      events.emit('SCREEN_SHAKE', { duration: 0.5, intensity: 0.6 });
    } else if (gameState === 'charSelect' || gameState === 'lobby') {
      // Unified pre-run teardown — any peer leaving during lobby/charSelect
      // ends the remote session for the remaining side. The popup owns
      // transition back to intro on user dismissal, and the 30 s
      // auto-dismiss timer guarantees we don't strand the user.
      _remoteReady = false;
      _clientReady = false;
      _hsDisconnectPopup = true;
      _hsDisconnectReason = net.role === 'client' ? 'host disconnected' : 'left the session';
      _hsDisconnectAutoCloseAt = performance.now() + 30000;
      lobbyStatusMsg = net.role === 'client'
        ? 'Host disconnected'
        : 'Remote lobby ended — a player left';
      try { net.disconnect(); } catch {}
      net.role = 'solo';
      _lobbyPeers = [];
      if (gameState === 'lobby') lobbyMode = 'menu';
      players.list = players.list.filter(p => !p._isRemote);
      if (player) player._coopMode = false;
    }
  }
});
// Handle reliable events from host. Two formats coexist:
//   Direct game events:  { type: 'FOO', ...data }
//   HostSim-relayed:     { name: 'FOO', p: payload }
// Monkeypatch sendReliable so the debug overlay sees every outgoing event
const _origSendReliable = net.sendReliable.bind(net);
net.sendReliable = (channel, payload) => {
  if (channel === 'evt') _logNetEvent('out', payload?.type || payload?.name || '?');
  return _origSendReliable(channel, payload);
};

net.on('evt', (msg, senderPeerId) => {
  if (!msg) return;
  const type = msg.type || msg.name;
  if (!type) return;
  _logNetEvent('in', type);
  const p = msg.p ?? msg; // HostSim wraps extra data in .p; direct events are flat

  if (type === 'PEER_INDEX_ASSIGN') {
    // Host is authoritative for the peer→index mapping. Rebuild the local
    // map from the broadcast and figure out our own slot so UI labels and
    // placeholders use the right indices for 3–4 player setups.
    _peerToIndex.clear();
    const indices = msg.indices || p.indices || {};
    for (const k in indices) _peerToIndex.set(k, indices[k]);
    if (net.role === 'client') {
      const myIdx = _peerToIndex.get(net.localPeerId);
      if (typeof myIdx === 'number') _myPlayerIndex = myIdx;
    }

  } else if (type === 'CHAR_SELECTED') {
    const newCharId = p.charId || msg.charId;
    const prev = _remoteCharIds.get(senderPeerId);
    // Peer changed characters after readying → clear their ready flag so
    // they have to re-confirm on the new pick.
    if (prev && newCharId && newCharId !== prev && _remoteReadyByPeer.get(senderPeerId)) {
      _remoteReadyByPeer.set(senderPeerId, false);
    }
    _remoteCharIds.set(senderPeerId, newCharId);
    _remoteCharId = newCharId; // legacy alias — most UI still reads this
    // Aggregate: any remote still ready? (used by legacy 2-player paths)
    let anyReady = false;
    for (const [, r] of _remoteReadyByPeer) if (r) { anyReady = true; break; }
    _remoteReady = anyReady;
    // Update the specific placeholder's charId if it's already been built.
    const slot = _remotePlayerFor(senderPeerId);
    if (slot) slot.charId = newCharId;

  } else if (type === 'PLAYER_READY') {
    if (net.role === 'host') {
      _remoteReadyByPeer.set(senderPeerId, true);
      const cid = p.charId || msg.charId;
      if (cid) { _remoteCharIds.set(senderPeerId, cid); _remoteCharId = cid; }
      _remoteReady = true;
    }

  } else if (type === 'START_LOBBY') {
    lobby.seed = msg.seed;
    _clientReady = false;
    _remoteReady = false;
    gameState = 'charSelect';
    audio.playBGM('menu');

  } else if (type === 'GAME_STARTED') {
    lobby.seed = msg.seed;
    _remoteCharId = msg.charId; // host's charId — used for the remote placeholder
    if (!selectedCharId) selectedCharId = 'blade'; // fallback if client never picked
    // Client must use the host's difficulty so enemy HP/speed/modifier RNG
    // consumption lines up — otherwise enemy HP (and the elite-modifier
    // rolls) diverge and kills stop syncing.
    if (typeof msg.difficulty === 'number') selectedDifficulty = msg.difficulty;
    // If the client was still in the lobby screen when GAME_STARTED raced in
    // (host sent START_LOBBY + GAME_STARTED on the same DataChannel frame),
    // clear the lobby UI state so nothing lingers behind the run.
    lobbyMode = 'menu';
    lobbyJoinCode = '';
    lobbyStatusMsg = '';
    _clientReady = false;
    _remoteReady = false;
    startNewRun(msg.seed);
    // Tell host which character we chose
    net.sendReliable('evt', { type: 'CHAR_SELECTED', charId: selectedCharId });

  } else if (type === 'MAP_NODE_CHOSEN') {
    if (net.role !== 'client') return;
    const { nodeType, nodeId, shopCards: sc, eventType: et } = msg;
    // Advance the client's map graph so the next map screen shows the
    // correct reachable nodes instead of sticking at the previous layer.
    if (nodeId && runManager.nodeMap && runManager.nodeMap[nodeId]) {
      runManager.selectNodeById(nodeId);
    }
    // Clear map-vote state — the node has been resolved.
    _localMapVote = null;
    _remoteMapVote = null;
    _remoteMapVoteByPeer.clear();
    if (nodeType === 'rest') {
      restChoiceBoxes = [];
      gameState = 'rest';
    } else if (nodeType === 'event') {
      currentEventType = et;
      gameState = 'event';
    } else if (nodeType === 'shop') {
      shopCards = sc || [];
      gameState = 'shop';
    } else {
      // Combat node (fight / elite / boss): remember it so subsequent
      // ENEMY_SPAWN_LIST finds the right context, but DON'T run spawnEnemies
      // here — that would consume the client's (possibly-drifted) RNG for
      // the room variant + enemy roster, then get stomped by the host's
      // authoritative ENEMY_SPAWN_LIST which is reliable-ordered right
      // after this message. Deferring all combat setup to ENEMY_SPAWN_LIST
      // keeps the client perfectly in sync with the host's generated fight.
      currentCombatNode = { type: nodeType, id: nodeId };
    }

  } else if (type === 'ROOM_CLEARED') {
    if (net.role !== 'client') return;
    // Force-clear any remaining local enemies and mirror host's state transition
    enemies = [];
    roomsCleared++;
    audio.silenceMusic();
    _showScoreTicker();
    // Host consumes one RNG value for the floor-curse roll regardless of
    // difficulty (see handleCombatClear). Client MUST consume the same
    // value here or the RNG stream drifts, and every subsequent draft /
    // shop / spawn / elite-modifier roll diverges — that's the root cause
    // of "both players see different enemies / maps" on later floors.
    runManager.getRng()();
    // Sync floor advance from boss kills so client's map matches host's
    if (typeof msg.floor === 'number' && msg.floor !== runManager.floor) {
      runManager.floor = msg.floor;
      runManager.generateMap();
      currentBiome = pickBiomeForFloor(runManager.floor, runManager.getRng());
      window._biome = currentBiome;
      if (room) room.biome = currentBiome;
      _pendingFloorBanner = runManager.floor;
    }
    if (msg.isVictory) {
      gameState = 'victory';
      _victoryAnimStart = null;
      _victoryReady = false;
      events.emit('PLAY_SOUND', 'victoryFanfare');
      audio.silenceMusic();
    } else if (msg.nextState === 'draft') {
      generateDraft();
      gameState = 'draft';
      _draftRevealTimer = 0;
      _draftRevealMax = draftChoices.length;
      _fadeAlpha = 0.6; _fadeDir = -1;
      audio.playBGM('map');
    } else {
      gameState = 'map';
      _fadeAlpha = 0.6; _fadeDir = -1;
      audio.playBGM('map');
    }
    // Snap to host's post-clear RNG position after our own matching
    // consumption above. If everything was in sync this is a no-op;
    // if anything drifted it corrects it before the next floor's roll.
    if (typeof msg.rngState === 'number') {
      runManager.setRngState(msg.rngState);
    }

  } else if (type === 'KILL') {
    // Mark matching enemy dead on client (best-effort; IDs may drift if RNG diverged)
    const id = p?.id || msg.id;
    if (id && gameState === 'playing') {
      const e = enemies.find(en => en.id === id);
      if (e && e.alive) {
        e.alive = false;
        events.emit('PLAY_SOUND', 'kill');
        // Visual: death particles so the client sees the ally finishing off.
        particles.spawnBurst(e.x, e.y, '#dd3333');
        if (particles.spawnFractureShards) particles.spawnFractureShards(e.x, e.y, e.color || '#ff8866');
      }
    }

  } else if (type === 'DAMAGE_DEALT' || type === 'DAMAGE_BATCH') {
    // Host receives damage events from clients and applies them authoritatively.
    // DAMAGE_BATCH is the per-frame compacted form (many hits in one reliable
    // message); DAMAGE_DEALT is the single-hit legacy/fallback form. Both
    // collapse to the same handler below.
    if (net.role !== 'host') return;
    const hits = (type === 'DAMAGE_BATCH' && p?.hits)
      ? p.hits
      : [[p?.id || msg.id, p?.amount || msg.amount]];
    for (const h of hits) {
      if (!h) continue;
      const dmgId = h[0];
      const dmgAmount = h[1];
      if (!dmgId || !dmgAmount) continue;
      const target = enemies.find(en => en.id === dmgId);
      if (!target || !target.alive) continue;
      // Shield-aware variants so host HP matches client HP post-hit.
      // (Plain takeDamage bypasses shielddrone/conductor mitigation, which
      // would leave the host believing the enemy took more damage than the
      // client did, desynchronising future kill-check timing.)
      if (target.type === 'shielddrone') target.takeDamage(dmgAmount, tempo);
      else if (target.type === 'boss_conductor') target.takeDamage(dmgAmount, tempo, enemies);
      else target.takeDamage(dmgAmount);
      // Visual feedback on the host so they can see their ally's hits
      // landing. Before this the host saw silent HP drain and couldn't tell
      // whether the client was attacking at all.
      particles.spawnDamageNumber(target.x, target.y, dmgAmount);
      particles.spawnBurst(target.x, target.y, '#ffcc66');
      if (!target.alive) {
        events.emit('KILL', { id: target.id });
        events.emit('PLAY_SOUND', 'kill');
      }
    }

  } else if (type === 'PLAYER_DOWNED') {
    // Mark the remote placeholder as downed so local revive logic + UI work.
    // Route to the sender's slot so 3–4 player games mark the RIGHT ally.
    const rp = _remotePlayerFor(senderPeerId);
    if (rp) {
      rp.downed = true;
      rp.hp = 0;
      rp.reviveProgress = 0;
    }
    // Belt-and-suspenders: if this event plus our current state means
    // everyone is down, trigger the wipe immediately instead of waiting
    // for the next update tick. Previously the wipe could be missed on
    // the side that received the DOWNED event last.
    if (player && player._coopMode && playerDeathTimer === 0 &&
        gameState === 'playing' && players.allDownedOrDead()) {
      console.log('[Run] Co-op wipe via PLAYER_DOWNED');
      runStats.floor = runManager.floor;
      runStats.finalDeck = [...deckManager.collection];
      runStats.won = false;
      checkRunUnlocks(false);
      playerDeathTimer = 1.2;
      // Notify the peer so the other side can also transition to stats
      // even if its own wipe detector missed this frame.
      if (net.role !== 'solo' && net.peers.size > 0) {
        net.sendReliable('evt', { type: 'GAME_OVER', reason: 'wipe' });
      }
    }

  } else if (type === 'PLAYER_REVIVED') {
    const rp = _remotePlayerFor(senderPeerId);
    if (rp) {
      rp.downed = false;
      rp.reviveProgress = 0;
      rp.hp = Math.max(1, Math.round(rp.maxHp * 0.3));
    }

  } else if (type === 'MAP_VOTE') {
    // Peer voted on a map node. Track per-peer so 3–4P doesn't short-circuit
    // on the first vote that arrives.
    const vote = msg.nodeId || p.nodeId;
    if (senderPeerId) _remoteMapVoteByPeer.set(senderPeerId, vote);
    _remoteMapVote = vote; // legacy singleton for 2P-style readers
    _checkMapVoteResolution();

  } else if (type === 'REST_VOTE') {
    const act = msg.action || p.action;
    if (senderPeerId) _remoteRestVoteByPeer.set(senderPeerId, act);
    _remoteRestVote = act;
    _checkRestVoteResolution();

  } else if (type === 'DECK_CARD_ADDED' || type === 'DECK_CARD_REMOVED') {
    // Decks are PER-PLAYER. A peer's draft / shop / discard choice must not
    // mutate our local deck — they pick independently from the same offered
    // cards (draft is RNG-seeded so both sides see the same 3 options, but
    // each player keeps the one they chose). Ignore the broadcast.

  } else if (type === 'PING') {
    // Echo back with the original t so the sender can compute RTT
    net.sendReliable('evt', { type: 'PONG', t: msg.t });
    // Client-side liveness: remember the host is alive. Watched in the
    // main update loop so a vanished host doesn't leave the client stuck
    // on the READY button forever.
    if (net.role === 'client') _lastHostPingAt = performance.now();

  } else if (type === 'PONG') {
    const t = msg.t || p.t;
    if (typeof t === 'number') _pushRtt(performance.now() - t);
    // Mark peer as alive for the PONG watchdog. senderPeerId is the peer
    // that sent this PONG back to us.
    if (senderPeerId) _lastPongByPeer.set(senderPeerId, performance.now());

  } else if (type === 'SYNC_HEARTBEAT' && net.role === 'client') {
    // Host periodically broadcasts authoritative run state. Compare to
    // local state and surface any persistent mismatch so a silently desynced
    // run (missed ROOM_CLEARED / MAP_NODE_CHOSEN / etc.) stops pretending
    // everything is fine.
    const hostState = msg.state;
    const hostFloor = msg.floor | 0;
    const hostRooms = msg.roomsCleared | 0;
    // Paused is a local-only overlay over 'playing' — treat as a match.
    const stateMatches = (
      hostState === gameState ||
      (hostState === 'playing' && gameState === 'paused') ||
      (gameState === 'playing' && hostState === 'paused')
    );
    const floorMatches = hostFloor === (runManager.floor | 0);
    const roomsMatch = hostRooms === (roomsCleared | 0);
    if (stateMatches && floorMatches && roomsMatch) {
      _syncMismatchCount = 0;
      _syncMismatchReason = '';
      _syncWarningVisible = false;
    } else {
      _syncMismatchCount++;
      _syncMismatchReason = !stateMatches
        ? `screen mismatch (host: ${hostState}, us: ${gameState})`
        : !floorMatches
          ? `floor mismatch (host: ${hostFloor}, us: ${runManager.floor | 0})`
          : `rooms-cleared mismatch (host: ${hostRooms}, us: ${roomsCleared | 0})`;
      // Two consecutive mismatched heartbeats (~6 s) → show the banner and
      // ask the host to send a SYNC_RESPONSE with enough state to actually
      // recover. Throttled to every 6 s now (used to be 15 s) because the
      // response is actionable — repeated requests will converge faster
      // than waiting for the user to give up and quit.
      if (_syncMismatchCount >= 2) {
        _syncWarningVisible = true;
        const nowMs = performance.now();
        if (nowMs - _syncRecoveryRequestedAt > 6000) {
          _syncRecoveryRequestedAt = nowMs;
          console.warn('[Sync] mismatch detected:', _syncMismatchReason, '— requesting SYNC_RESPONSE');
          net.sendReliable('evt', { type: 'SYNC_REQUEST', reason: _syncMismatchReason });
        }
      }
    }

  } else if (type === 'SYNC_REQUEST') {
    // Host-side: a client flagged itself out of sync. Send a richer
    // SYNC_RESPONSE (state + the data the client needs to actually
    // transition to that state — shopCards / eventType / nodeType etc).
    // The old behaviour was to just re-send a heartbeat, which let the
    // client KNOW about the mismatch but provided no recovery path.
    if (net.role === 'host' && net.peers.size > 0) {
      const resp = {
        type: 'SYNC_RESPONSE',
        state: gameState,
        floor: runManager.floor | 0,
        roomsCleared: roomsCleared | 0,
        rngState: runManager.getRngState(),
      };
      // Bundle state-specific payload so the client can re-enter the
      // current screen without missing context (the original transition
      // events — MAP_NODE_CHOSEN / ROOM_CLEARED — may have been lost or
      // silently dropped on a brief WebRTC hiccup).
      if (gameState === 'shop') {
        resp.shopCards = shopCards;
      } else if (gameState === 'event') {
        resp.eventType = currentEventType;
      } else if ((gameState === 'prep' || gameState === 'playing') && currentCombatNode) {
        resp.combatNode = { type: currentCombatNode.type, id: currentCombatNode.id };
      }
      net.sendReliable('evt', resp);
      // Also re-emit the last heartbeat so the legacy mismatch counter
      // resets on clients that don't have the SYNC_RESPONSE handler yet.
      net.sendReliable('evt', {
        type: 'SYNC_HEARTBEAT',
        state: gameState,
        floor: runManager.floor | 0,
        roomsCleared: roomsCleared | 0,
        enemiesAlive: gameState === 'playing' ? enemies.reduce((a, e) => a + (e && e.alive ? 1 : 0), 0) : 0,
      });
    }

  } else if (type === 'SYNC_RESPONSE' && net.role === 'client') {
    // Authoritative resync from the host. Apply whichever pieces fit so
    // the client converges back onto the host's screen. This is the path
    // that closes the "out of sync → can't reconnect" loop the user reported
    // (specifically: post-fight draft → map transition where the client
    // gets stranded on draft while the host moves on).
    const targetState = msg.state;
    const targetFloor = msg.floor | 0;
    const targetRooms = msg.roomsCleared | 0;
    const alreadyHere = (
      targetState === gameState ||
      (targetState === 'playing' && gameState === 'paused') ||
      (gameState === 'playing' && targetState === 'paused')
    );
    // Snap RNG so any subsequent host-driven roll lines up regardless of
    // what we did wrong before.
    if (typeof msg.rngState === 'number') {
      try { runManager.setRngState(msg.rngState); } catch {}
    }
    if (targetFloor !== (runManager.floor | 0)) {
      runManager.floor = targetFloor;
      runManager.generateMap();
      currentBiome = pickBiomeForFloor(runManager.floor, runManager.getRng());
      window._biome = currentBiome;
      if (room) room.biome = currentBiome;
    }
    if (targetRooms > (roomsCleared | 0)) roomsCleared = targetRooms;
    if (!alreadyHere) {
      console.warn(`[Sync] forcing client transition: ${gameState} → ${targetState}`);
      // Drop any in-progress per-screen state from the screen we were on
      // so the host's screen doesn't inherit stale votes / draft picks.
      _localMapVote = null;
      _remoteMapVote = null;
      _remoteMapVoteByPeer.clear();
      _localRestVote = null;
      _remoteRestVote = null;
      _remoteRestVoteByPeer.clear();
      // Apply the host's screen. Some states need a small bit of setup so
      // the screen has something to render on the next frame.
      if (targetState === 'map') {
        gameState = 'map';
        _fadeAlpha = 0.6; _fadeDir = -1;
        audio.playBGM('map');
      } else if (targetState === 'draft') {
        // Try to regenerate draft choices so the client has something to
        // pick (host may have already moved on by the next heartbeat).
        try { generateDraft(); } catch {}
        gameState = 'draft';
        _draftRevealTimer = 0;
        _draftRevealMax = draftChoices.length;
        _fadeAlpha = 0.6; _fadeDir = -1;
      } else if (targetState === 'rest') {
        restChoiceBoxes = [];
        gameState = 'rest';
      } else if (targetState === 'event' && msg.eventType) {
        currentEventType = msg.eventType;
        gameState = 'event';
      } else if (targetState === 'shop' && Array.isArray(msg.shopCards)) {
        shopCards = msg.shopCards;
        gameState = 'shop';
      } else if (targetState === 'itemReward') {
        // Item reward is per-player — generate a local choice if we have
        // none, otherwise just enter the screen and let the player pick.
        try {
          itemChoices = itemManager.generateChoices(3, selectedCharId, players.count > 1);
        } catch {}
        gameState = 'itemReward';
        if (ui.resetItemReward) ui.resetItemReward();
      } else if (targetState === 'upgrade') {
        try { upgradeChoices = deckManager.getUpgradeChoices(); } catch {}
        gameState = 'upgrade';
      } else if (targetState === 'prep' || targetState === 'playing') {
        // Combat states need the spawn list. The client can't reconstruct
        // enemies from the heartbeat alone, so we enter prep but flag it
        // for the host to re-broadcast ENEMY_SPAWN_LIST. Host receives a
        // RESYNC_COMBAT request below.
        if (msg.combatNode) currentCombatNode = msg.combatNode;
        net.sendReliable('evt', { type: 'RESYNC_COMBAT_REQUEST' });
      } else {
        // victory / discard / unknown: best-effort transition.
        gameState = targetState;
      }
    }
    // Reset the mismatch counter — any persistent drift will be re-detected
    // by the next heartbeat comparison.
    _syncMismatchCount = 0;
    _syncMismatchReason = '';
    _syncWarningVisible = false;

  } else if (type === 'RESYNC_COMBAT_REQUEST' && net.role === 'host') {
    // Client lost combat sync — re-broadcast ENEMY_SPAWN_LIST built from
    // the host's current enemies + room state. Only meaningful while we're
    // actually in combat. We reuse the same wire shape spawnEnemies emits
    // so the existing client-side ENEMY_SPAWN_LIST handler can process it
    // without a special "this is a resync" code path.
    if ((gameState === 'prep' || gameState === 'playing') && currentCombatNode && room) {
      const compact = [];
      for (const e of enemies) {
        if (!e || !e.alive) continue;
        compact.push({
          id: e.id, type: e.type,
          x: Math.round(e.x), y: Math.round(e.y),
          hp: e.hp, maxHp: e.maxHp,
          elite: e.eliteMod || null,
        });
      }
      try {
        net.sendReliable('evt', {
          type: 'ENEMY_SPAWN_LIST',
          nodeType: currentCombatNode.type,
          nodeId: currentCombatNode.id,
          floor: runManager.floor,
          variant: room.variant,
          pillars: (room.pillars || []).map(pp => ({ x: pp.x, y: pp.y, w: pp.w, h: pp.h })),
          enemies: compact,
          rngState: runManager.getRngState(),
        });
      } catch (e) {
        console.warn('[Sync] resync combat broadcast failed:', e?.message || e);
      }
    }

  } else if (type === 'PHASE_DONE') {
    // Peer finished their post-combat decision phase. In 3–4P the map only
    // advances once EVERY peer has reported done (aggregated below).
    if (senderPeerId) _remotePhaseDoneByPeer.set(senderPeerId, true);
    _recomputeRemoteAggregates();

  } else if (type === 'PREP_READY') {
    // Peer hit READY. Track per-peer so 3–4P waits for all clients; combat
    // only starts when _prepReadyLocal + every remote ready flag is true.
    if (senderPeerId) _prepReadyByPeer.set(senderPeerId, true);
    _recomputeRemoteAggregates();
    if (net.role === 'host' && _prepReadyLocal && _prepReadyRemote && gameState === 'prep') {
      net.sendReliable('evt', { type: 'BATTLE_START' });
      _startCombatNow();
    }

  } else if (type === 'BATTLE_START') {
    // Host has determined both players are ready — client flips into combat
    if (net.role === 'client' && gameState === 'prep') {
      _startCombatNow();
    }

  } else if (type === 'GAME_OVER') {
    // Either side can declare run over (e.g., all players downed, or boss escape)
    if (gameState === 'playing' || gameState === 'prep' || gameState === 'map' || gameState === 'draft') {
      runStats.floor = runManager.floor;
      runStats.finalDeck = [...deckManager.collection];
      runStats.won = false;
      checkRunUnlocks(false);
      playerDeathTimer = 0.8;
      input.clearFrame();
    }

  } else if (type === 'ENEMY_HP_SYNC') {
    // Host broadcasts enemy HPs after each damage batch / own attack.
    // Client mirrors so the HP bar is always canonical and enemies die at
    // the same instant on both screens.
    if (net.role !== 'client') return;
    const hps = p?.hps || msg.hps || [];
    for (const pair of hps) {
      if (!pair) continue;
      const [id, hp] = pair;
      const e = enemies.find(en => en.id === id);
      if (!e) continue;
      e.hp = hp;
      if (hp <= 0) {
        if (e.alive) {
          e.alive = false;
          particles.spawnBurst(e.x, e.y, '#dd3333');
          if (particles.spawnFractureShards) particles.spawnFractureShards(e.x, e.y, e.color || '#ff8866');
          events.emit('PLAY_SOUND', 'kill');
          // Mirror the host's death animation timer so dead enemies actually
          // get pruned from the client's array (otherwise they linger until
          // ROOM_CLEARED wipes everything — hurts SpatialHash rebuild cost
          // and leaves stale targets for projectile near-miss checks).
          if (typeof e.cleanup === 'function') e.cleanup();
          const _dur = e.isBoss ? 2.5 : 0.6;
          e._dying = true;
          e._deathTimer = _dur;
          e._deathDuration = _dur;
          if (e.isBoss) {
            e._bossDeathPos = { x: e.x, y: e.y };
            events.emit('SCREEN_SHAKE', { duration: 1.2, intensity: 1.0 });
            particles.spawnCrashBurst(e.x, e.y);
          }
        }
      }
    }

  } else if (type === 'SPAWN_SPLIT') {
    // Host-authoritative mid-fight spawn: Splitter's children. IDs in the
    // payload match what host uses in POS snapshots + KILL events, so HP /
    // death sync lines up without a separate reconciliation pass.
    if (net.role !== 'client') return;
    const spawns = msg.spawns || p?.spawns || [];
    const spdMult = msg.difficultySpdMult || p?.difficultySpdMult || 1;
    for (const data of spawns) {
      if (!data || !data.id) continue;
      if (enemies.some(en => en.id === data.id)) continue; // dedupe on retransmit
      const s = new Split(data.x, data.y);
      s.difficultySpdMult = spdMult;
      if (typeof data.hp === 'number')    s.hp = data.hp;
      if (typeof data.maxHp === 'number') s.maxHp = data.maxHp;
      s.id = data.id;
      enemies.push(s);
    }
    combat.setLists(enemies, player);
    projectiles.setEnemies(enemies);
    ui.setEnemies(enemies);

  } else if (type === 'ENEMY_SPAWN_LIST') {
    // Host is authoritative. This message fully drives combat-node setup on
    // the client — enemies, room variant, pillars, floor/biome, state
    // transition — so the client never runs its own spawnEnemies() for the
    // combat path. That removes the RNG-drift class of bugs (client sees
    // a different roster or pillar layout than host).
    if (net.role !== 'client') return;
    const list = msg.enemies || p?.enemies || [];
    const rebuilt = [];
    for (const data of list) {
      const e = _spawnEnemyFromSync(data);
      if (e) rebuilt.push(e);
    }
    for (const oldE of enemies) { if (typeof oldE.cleanup === 'function') oldE.cleanup(); }
    enemies = rebuilt;
    // Dynamic-spawn IDs need to continue past the max host-assigned id so
    // any future Splitter child allocator on the client side wouldn't
    // collide (defensive — clients only allocate locally for solo fallback).
    let maxEid = 0;
    for (const e of enemies) {
      if (e.id && e.id[0] === 'e') {
        const n = parseInt(e.id.slice(1), 10);
        if (!isNaN(n) && n > maxEid) maxEid = n;
      }
    }
    _nextDynamicEnemyId = maxEid + 1;
    // Sync floor / biome so subsequent RNG consumers (draft, curse roll)
    // stay lockstep with host even if divergence happened earlier.
    if (typeof msg.floor === 'number' && msg.floor !== runManager.floor) {
      runManager.floor = msg.floor;
      currentBiome = pickBiomeForFloor(runManager.floor, runManager.getRng());
      window._biome = currentBiome;
      if (room) room.biome = currentBiome;
    }
    // Snap seeded-RNG state to the host's post-spawn position. This is the
    // single most important sync line for map generation — the host's
    // spawnEnemies consumed values the client never did, so without this
    // the next-floor generateMap() produces a different node layout.
    if (typeof msg.rngState === 'number') {
      runManager.setRngState(msg.rngState);
    }
    // Overwrite room variant + pillars with host's authoritative layout so
    // both players play the same physical arena (pillar collisions, enemy
    // pathing, card-placement all line up).
    if (typeof msg.variant === 'string') {
      room.variant = msg.variant;
      room._gridCache = null;
    }
    if (Array.isArray(msg.pillars)) {
      room.pillars = msg.pillars.map(pp => ({ x: pp.x, y: pp.y, w: pp.w, h: pp.h }));
      room._gridCache = null;
    }
    // Transition into combat (prep phase) now that the fight is fully set
    // up. Previously the MAP_NODE_CHOSEN handler did this; we moved it here
    // so the combat state never exists without a matching enemy roster.
    if (currentCombatNode && (currentCombatNode.type === 'fight' ||
        currentCombatNode.type === 'elite' || currentCombatNode.type === 'boss')) {
      player.x = room.FLOOR_X1 + 100;
      player.y = (room.FLOOR_Y1 + room.FLOOR_Y2) / 2;
      // Per-room resets that host's spawnEnemies does locally — must mirror
      // here since we skip client-side spawnEnemies for the combat path.
      tempo.value = itemManager.startingTempo();
      tempo.targetValue = tempo.value;
      itemManager.resetRoom();
      projectiles.clear();
      particles.particles.length = 0;
      particles.visuals.length = 0;
      player.comboCount = 0;
      player.comboTimer = 0;
      player._undyingUsed = false;
      player.guardStacks = 0;
      player._guardDecayTimer = 0;
      player.silenced = false;
      player.silenceTimer = 0;
      traps.length = 0;
      orbs.length = 0;
      echoes.length = 0;
      sigils.length = 0;
      groundWaves.length = 0;
      beamFlashes.length = 0;
      channelState = null;
      killEffects.length = 0;
      if (currentCombatNode.type === 'boss') { _showBossIntro('FLOOR ' + runManager.floor + ' BOSS'); audio.playBGM('boss'); }
      else audio.playBGM('normal');
      gameState = 'prep';
    }
    combat.setLists(enemies, player);
    ui.setEnemies(enemies);
    projectiles.setEnemies(enemies);
    snapDecoder.reset();
    if (hostSim && hostSim.reset) hostSim.reset();

  } else if (type === 'PLAYER_HP') {
    // Peer's local HP changed — mirror onto the remote placeholder so
    // the map / stats UI shows the other player's true HP after heals,
    // damage, rests, shops, and events. Without this, each side only
    // knew its own HP and the ally card on the map drifted.
    {
      const rp = _remotePlayerFor(senderPeerId);
      if (rp) {
        if (typeof msg.hp === 'number')    rp.hp    = msg.hp;
        if (typeof msg.maxHp === 'number') rp.maxHp = msg.maxHp;
        if (typeof msg.alive === 'boolean') rp.alive = msg.alive;
        // `downed` piggybacks on PLAYER_HP so we don't depend on the
        // discrete PLAYER_DOWNED event racing with a simultaneous wipe.
        if (typeof msg.downed === 'boolean') rp.downed = msg.downed;
      }
    }
    // Re-check wipe condition — the placeholder's flags just changed and
    // we may now satisfy allDownedOrDead after being one-flag-short.
    if (player && player._coopMode && playerDeathTimer === 0 &&
        gameState === 'playing' && players.allDownedOrDead()) {
      console.log('[Run] Co-op wipe via PLAYER_HP');
      runStats.floor = runManager.floor;
      runStats.finalDeck = [...deckManager.collection];
      runStats.won = false;
      checkRunUnlocks(false);
      playerDeathTimer = 1.2;
      if (net.role !== 'solo' && net.peers.size > 0) {
        net.sendReliable('evt', { type: 'GAME_OVER', reason: 'wipe' });
      }
    }

  } else if (type === 'PLAYER_AP') {
    // Mirror peer's AP onto the remote placeholder so the co-op summary
    // panel's AP bar actually fills. Without this the placeholder's
    // `budget` stays at its construction default (0) and the UI shows
    // a permanently empty bar.
    {
      const rp = _remotePlayerFor(senderPeerId);
      if (rp) {
        if (typeof msg.budget === 'number')    rp.budget    = msg.budget;
        if (typeof msg.maxBudget === 'number') rp.maxBudget = msg.maxBudget;
      }
    }

  } else if (type === 'PLAYER_HIT') {
    // Host is authoritative for enemy attacks. When the host's enemy hits
    // our remote placeholder, they forward the damage here so we apply it
    // to our actual local player.
    const dmg = msg.damage || p?.damage || 0;
    if (dmg > 0 && player && player.alive) {
      // Apply difficulty multiplier locally (host uses their own; we use ours
      // — after GAME_STARTED they're in sync).
      const scaled = Math.round(dmg * (DIFFICULTY_MODS[selectedDifficulty]?.dmgMult || 1));
      player.takeDamage(scaled);
      particles.spawnKillFlash('#ff2222');
      events.emit('HIT_STOP', 0.08);
      events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.4 });
      renderer.triggerCA();
    }

  } else if (type === 'SPAWN_BEAM_FLASH'
             || type === 'SPAWN_TRAP' || type === 'SPAWN_ORBS'
             || type === 'SPAWN_SIGIL' || type === 'SPAWN_ECHO'
             || type === 'SPAWN_GROUND_WAVE') {
    // Replay the teammate's card spawn locally so both players can see
    // traps / orbs / sigils / echoes / ground waves / beam flashes the
    // other player placed. `_netOrigin: 'remote'` blocks HostSim from
    // echoing, and the local SPAWN_* handlers tag the entity as
    // `_netRemote: true` so its update loop skips damage application.
    const payload = { ...(p || msg) };
    delete payload.type; delete payload.name;
    payload._netOrigin = 'remote';
    events.emit(type, payload);

  } else if (type === 'NET_PROJECTILE_SPAWN') {
    // Teammate fired a projectile — spawn a visual-only copy on our side.
    // source='remote_player' is not 'player' (so it won't collide with
    // our enemies) and not 'enemy' / named-enemy (so it won't hit our
    // players). Damage is resolved on the originating side.
    const pl = p || msg;
    if (projectiles) {
      projectiles.spawn(pl.x, pl.y, pl.dx, pl.dy, pl.speed, pl.damage,
                        pl.color, 'remote_player', pl.freezes, pl.life, pl.meta);
    }

  } else if (type === 'BOSS_PHASE') {
    // Already handled visually via position snapshots; just play a sound cue
    events.emit('PLAY_SOUND', 'bossRoar');

  } else if (type === 'PEER_QUIT') {
    // The other player intentionally left (quit to menu / restart). Tear
    // down the session immediately instead of waiting for WebRTC to notice
    // the closed channel (which can take many seconds on some networks).
    const inRun = ['playing','map','prep','draft','itemReward','shop','event','rest','discard','upgrade','paused','victory'].includes(gameState);
    const wasClient = net.role === 'client';
    try { net.disconnect(); } catch {}
    net.role = 'solo';
    _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
    _remoteDisconnected = true;
    _remoteDisconnectTimer = 12;
    players.list = players.list.filter(p => !p._isRemote);
    if (player) player._coopMode = false;
    _remotePhaseDone = true; _localPhaseDone = true;
    _prepReadyLocal = true;  _prepReadyRemote = true;
    events.emit('PLAY_SOUND', 'crash');
    events.emit('SCREEN_SHAKE', { duration: 0.5, intensity: 0.6 });
    if (!inRun) {
      // Lobby / charSelect: show a blocking popup AND arm the auto-close
      // timer so the user always lands back on the main menu even if they
      // walked away from the screen.
      lobbyMode = 'menu';
      lobbyStatusMsg = 'Remote player left the session';
      _remoteReady = false; _clientReady = false;
      if (gameState === 'charSelect' || gameState === 'lobby') {
        _hsDisconnectPopup = true;
        _hsDisconnectMode = 'menu';
        _hsDisconnectReason = 'left the session';
        _hsDisconnectAutoCloseAt = performance.now() + 30000;
      }
    } else if (wasClient) {
      // Client can't continue a run the host was driving — bounce to the
      // main menu with the same blocking popup used by lobby/charSelect.
      _hsDisconnectPopup = true;
      _hsDisconnectMode = 'menu';
      _hsDisconnectReason = 'host disconnected';
      _hsDisconnectAutoCloseAt = performance.now() + 30000;
      selectedCharId = null;
      lobbyMode = 'menu';
      lobbyStatusMsg = '';
      gameState = 'intro';
      audio.silenceMusic();
      audio.playBGM('menu');
    } else {
      // Host in-run, client cleanly quit: pop the two-button modal so the
      // host explicitly chooses to continue solo or return to menu. The
      // 12 s banner still draws underneath as a continuous reminder.
      _hsDisconnectPopup = true;
      _hsDisconnectMode = 'continueSolo';
      _hsDisconnectReason = 'left the session';
      _hsDisconnectAutoCloseAt = 0; // no auto-close — host chooses
    }
  }
});
let localCoop = false;             // toggled by F2 in char select
let currentBiome = Biomes.verdant; // updated per floor in startNewRun
window._biome = currentBiome;
const ui = new UI(canvas, tempo, player, deckManager, CardDefinitions);
ui.setItemManager(itemManager);

// Link tempo to items
tempo.itemManager = itemManager;

// Game states: intro, charSelect, map, prep, playing, draft, dead, victory, itemReward, event, shop, upgrade, stats
let gameState = 'intro';
let draftChoices = [];
let roomsCleared = 0;
let currentCombatNode = null;
let selectedCharId = null;
let selectedDifficulty = 0;
let totalHealedThisRun = 0;
let newUnlocks = [];
let currentEventType = 'standard'; // 'standard' | 'merchant' | 'blacksmith'
let noDashCardsUsedThisRun = true; // for cross-run unlock tracking
const FLOORS_TO_WIN = 5;

// Active card slot (left-click fires this, right-click cycles)
let selectedCardSlot = 0;
let selectedCardSlotP2 = 0;

// Slow-mo state
let slowMoTimer = 0;
let slowMoScale = 1.0;

// Item reward state
let itemChoices = [];
let upgradeChoices = [];
let killEffects = [];
let shopCards = [];

// Last-kill slow-mo
let lastKillSlowTimer = 0;

// Pause menu
let pauseMenuBoxes = [];
let prevStateBeforePause = null;
let pauseQuitConfirm = false;
let pauseShowControls = false;

// Gamepad menu focus — tracks the last gameState so menu handlers can tell
// they've just been entered and snap the virtual cursor onto a sensible
// default (e.g. the current map node) rather than starting wherever the
// cursor last was. Updated at the tail of update() each frame.
let _prevMenuGameState = null;
// Deferred-snap flag: `clickSpheres` isn't populated until drawMap() runs,
// which is AFTER update() on the first map frame. Flag stays true until a
// snap actually lands so the gamepad cursor centers on the next node even
// when the map geometry wasn't ready on entry.
let _mapSnapPending = false;
// Same story for prep: `ui.handBoxes` / `ui.prepBoxes` are populated in
// drawPrepScreen(), which runs post-update. Latch on entry and retry the
// snap until the first collection card is known.
let _prepSnapPending = false;

// Intro screen state
let introResetConfirm = false;
let introBoxes = [];

// Discard state
let discardPendingCardId = null;
let discardReturnState = 'map';

// Stats screen: delay before accepting input so a death-click doesn't instantly skip it
let statsInputDelay = 0;

// Player death: brief animation delay before transitioning to stats
let playerDeathTimer = 0;

// Victory celebration animation
let _victoryAnimStart = null; // timestamp when victory state began
let _victoryReady = false;    // player can advance after 2.5s

// RH2: brief edge-glow when Group Tempo Resonance activates
let _resonanceFlashTimer = 0;

// RH2 multiplayer lobby state
let tutorialPage = 0;            // RH2 #15: index into tutorial pages
let lobbyMode = 'menu';          // 'menu' | 'hosting' | 'joining'
let lobbyJoinCode = '';          // text being typed for join
let lobbyStatusMsg = '';         // bottom-line status text
let lobbyBoxes = [];
let _remoteCharId = null;        // legacy single-remote alias (points at first remote's charId)
let _remoteCharIds = new Map();  // peerId → charId for every remote peer (3-4 player support)
let _peerToIndex = new Map();    // peerId → playerIndex assigned by host (host = 0)
let _myPlayerIndex = 0;          // this peer's assigned slot — host stays 0, clients 1..3
let _remoteReady = false;        // legacy: "any remote ready" aggregate (kept for UI)
let _remoteReadyByPeer = new Map(); // peerId → boolean ready flag
let _clientReady = false;        // client: local player has clicked READY in charSelect
let _remoteDisconnected = false; // in-game: remote peer disconnected mid-run
let _remoteDisconnectTimer = 0;  // seconds until banner auto-hides
// Sync heartbeat: host broadcasts { state, floor, roomsCleared } every ~3 s
// during runs; client compares to local state. A persistent mismatch surfaces
// the out-of-sync banner so the session stops silently drifting. A first
// mismatch also triggers a one-shot recovery request (SYNC_REQUEST → the host
// resends the current state) so transient missed events can self-heal.
let _syncHeartbeatAccum = 0;        // host-side send cadence
let _syncMismatchCount = 0;         // consecutive mismatched heartbeats
let _syncMismatchReason = '';       // short human label for the banner
let _syncWarningVisible = false;    // banner gate — flips true after N mismatches
let _syncRecoveryRequestedAt = 0;   // throttle SYNC_REQUEST (ms epoch)
// Pre-run disconnect popup (charSelect / lobby): blocks until the player
// acknowledges, then returns to intro. Separate from the in-run banner so
// players actually notice they're alone before committing to a solo run.
let _hsDisconnectPopup = false;
let _hsDisconnectReason = ''; // short human label ("left session" / "lost connection")
let _hsDisconnectBoxes = [];  // modal "return to menu" button hit region
// Two-button mode: when the host loses its last remote ally during a run we
// pop a popup that says "they left — continue solo or return to menu?". The
// 'menu' default keeps the existing pre-run + client behaviour where dismiss
// always returns to intro.
let _hsDisconnectMode = 'menu';        // 'menu' | 'continueSolo'
let _hsDisconnectContinueBoxes = [];   // mode='continueSolo': "continue solo" button hit region
// Auto-dismiss deadline (ms-since-origin). When the popup comes up during
// lobby/charSelect the user should always land back on the main menu — if
// they walked away or the tab lost focus, this timer flips it back to
// intro automatically. Dismissal by click/keypress cancels the timer.
let _hsDisconnectAutoCloseAt = 0;
// Brief 3-4P partial-leave notification: when one of N peers leaves but
// other allies remain, the run continues, but we still want to surface
// who left rather than silently shrinking the roster. Shown for ~5 s.
let _peerLeaveBadge = null; // { label: string, t0: number }
let _charSelectQuitConfirm = false; // MP: second click on Main Menu actually leaves
let _lobbyPeers = [];            // host: [{ peerId, name }] peers currently in lobby
// PHASE_DONE handshake — gate map advance until EVERY player has finished
// the post-combat decision phase (draft / itemReward / shop / rest / event).
// `_remotePhaseDone` is kept as the aggregate "all remotes done" for legacy
// readers; per-peer state lives in `_remotePhaseDoneByPeer` so 3–4 player
// sessions correctly wait for all clients.
let _localPhaseDone = true;      // we've signaled "done" to the peer
let _remotePhaseDone = true;     // aggregate: are ALL remote peers done?
let _remotePhaseDoneByPeer = new Map();
let _prevSyncState = null;       // tracks gameState transitions for the handshake
// PREP_READY handshake — every player must ready up before combat starts.
let _prepReadyLocal = false;
let _prepReadyRemote = false;    // aggregate: are ALL remote peers ready?
let _prepReadyByPeer = new Map();
function _peerIsReady() {
  if (net.role === 'solo' || net.peers.size === 0) return true;
  // Every connected peer must have signalled ready.
  for (const [pid] of net.peers) {
    if (!_prepReadyByPeer.get(pid)) return false;
  }
  return true;
}
// Recompute aggregates from the per-peer maps. Keeps the legacy singletons
// in sync for any callers / debug overlays still reading them.
function _recomputeRemoteAggregates() {
  // PHASE_DONE: true only if every connected peer has signalled done.
  let allDone = true;
  for (const [pid] of net.peers) {
    if (!_remotePhaseDoneByPeer.get(pid)) { allDone = false; break; }
  }
  _remotePhaseDone = (net.peers.size === 0) ? true : allDone;
  // PREP_READY: similar aggregation.
  let allReady = true;
  for (const [pid] of net.peers) {
    if (!_prepReadyByPeer.get(pid)) { allReady = false; break; }
  }
  _prepReadyRemote = (net.peers.size === 0) ? false : allReady;
}

// MAP_VOTE handshake — every player votes on a node; advances when they all
// agree. Per-peer votes live in `_remoteMapVoteByPeer`.
let _localMapVote = null;
let _remoteMapVote = null;
let _remoteMapVoteByPeer = new Map();
let _mapVoteFlash = 0; // brief celebration when the vote completes
// REST_VOTE / EVENT_VOTE — same idea, but on the choice made at a rest node
// (heal / upgrade / fortify) or event (0 / 1 / 2). The resolved choice is
// applied on both sides so players heal/buy/etc. in lock-step. This fixes
// the bug where the host's "heal" healed both players but the client's
// "heal" only healed themselves — everyone now votes, outcome is shared.
// REST is the ONLY screen that uses a team vote — the outcome (heal /
// upgrade / fortify) needs to apply to every player, so both have to
// agree. Draft, events, shop, upgrade, itemReward are per-player picks
// whose results are synced via DECK_* broadcasts below instead.
let _localRestVote = null;   // 'heal' | 'upgrade' | 'fortify'
let _remoteRestVote = null;  // aggregate: first non-null vote (legacy UI)
let _remoteRestVoteByPeer = new Map();
// Floor-name banner: animated chapter break on floor advance.
let _floorBanner = null; // { floor, name, t0 }
// Queues the banner so it fires when the map state is entered, not at the
// moment of boss clear (which overlaps the draft/victory screens).
let _pendingFloorBanner = 0; // 0 = none; else the floor number to announce
// Post-fight scoreboard ticker: brief "+N kills" pop after each room clear.
let _scoreTicker = null; // { kills, room, t0 }
let _scoreTickerLastKills = 0;
function _showScoreTicker() {
  const k = (runStats.kills || 0) - _scoreTickerLastKills;
  _scoreTickerLastKills = runStats.kills || 0;
  if (k <= 0) return;
  _scoreTicker = { kills: k, room: roomsCleared, t0: performance.now() / 1000 };
}
function _showFloorBanner(floor) {
  const names = ['VERDANT WILDS', 'THE CATACOMBS', 'THE CITADEL', 'THE ABYSS', 'THE APEX'];
  _floorBanner = { floor, name: names[Math.min(floor - 1, 4)] || 'UNKNOWN', t0: performance.now() / 1000 };
}

// Visual refresh 3.7 — boss intro banner. Triggered when entering a boss room.
let _bossIntro = null; // { name, t0 }
function _showBossIntro(name) {
  _bossIntro = { name: name || 'BOSS', t0: performance.now() / 1000 };
  events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.6 });
  events.emit('PLAY_SOUND', 'crash');
}

// "Partner is waiting" badge — top-of-screen pulse so it's impossible to
// miss while the holdup player makes their decision.
// Hero-select / lobby disconnect popup. Blocks all input in those screens
// so the remaining player sees the notice instead of being silently dropped
// back to the main menu when their partner leaves.
// Dismiss the disconnect popup. `choice` decides what to do next:
//   'menu'        — tear down any leftover net state and return to intro.
//   'continue'    — just hide the popup; caller stays in the current run as solo.
//                   Only valid when _hsDisconnectMode === 'continueSolo'.
function _dismissHsDisconnect(choice = 'menu') {
  const wantContinue = (choice === 'continue' && _hsDisconnectMode === 'continueSolo');
  _hsDisconnectPopup = false;
  _hsDisconnectReason = '';
  _hsDisconnectBoxes.length = 0;
  _hsDisconnectContinueBoxes.length = 0;
  _hsDisconnectAutoCloseAt = 0;
  _hsDisconnectMode = 'menu';
  if (wantContinue) {
    // Host chose "continue solo": already demoted to net.role='solo' by the
    // peer-leave handler, just unblock input. The "REMOTE PLAYER DISCONNECTED"
    // banner will fade on its own.
    return;
  }
  // Tear down any lingering connection and return to the main menu.
  try { net.disconnect(); } catch {}
  net.role = 'solo';
  _lobbyPeers = [];
  _remoteReady = false;
  _clientReady = false;
  _remoteCharId = null;
  selectedCharId = null;
  lobbyMode = 'menu';
  lobbyStatusMsg = '';
  gameState = 'intro';
  audio.silenceMusic();
  audio.playBGM('menu');
}

function _drawHsDisconnectPopup(ctx) {
  const t = performance.now() / 1000;
  const pulse = 0.85 + 0.15 * Math.sin(t * 3);
  const twoButton = (_hsDisconnectMode === 'continueSolo');
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pw = 560, ph = twoButton ? 280 : 260;
  const px = (canvas.width - pw) / 2, py = (canvas.height - ph) / 2;
  ctx.shadowColor = '#ff6644';
  ctx.shadowBlur = 28 * pulse;
  ctx.fillStyle = '#140a12';
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff6644'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#ffaa88';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  const title = twoButton ? '⚠  REMOTE PLAYER DISCONNECTED  ⚠' : '⚠  REMOTE LOBBY ENDED  ⚠';
  ctx.fillText(title, canvas.width / 2, py + 56);
  ctx.fillStyle = '#ffd0bb';
  ctx.font = '15px monospace';
  ctx.fillText(`The other player ${_hsDisconnectReason || 'disconnected'}.`, canvas.width / 2, py + 100);
  if (twoButton) {
    ctx.fillText('You can keep playing solo or quit to the main menu.', canvas.width / 2, py + 124);
    ctx.fillStyle = '#aa8877';
    ctx.font = '12px monospace';
    ctx.fillText('Press Enter to continue solo, or click "Return to Menu".', canvas.width / 2, py + 154);
  } else {
    ctx.fillText('The co-op session has ended.', canvas.width / 2, py + 124);
    ctx.fillStyle = '#aa8877';
    ctx.font = '12px monospace';
    ctx.fillText('Press OK (or Enter) to return to the main menu.', canvas.width / 2, py + 154);
  }
  _hsDisconnectBoxes.length = 0;
  _hsDisconnectContinueBoxes.length = 0;
  if (twoButton) {
    // Two-button layout: [CONTINUE SOLO] (left, primary green) | [RETURN TO MENU] (right, red).
    const btnW = 240, btnH = 48, gap = 16;
    const totalW = btnW * 2 + gap;
    const baseX = canvas.width / 2 - totalW / 2;
    const by = py + ph - 70;
    // Continue solo
    const cx = baseX;
    ctx.fillStyle = '#102818';
    ctx.beginPath(); ctx.roundRect(cx, by, btnW, btnH, 8); ctx.fill();
    ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ccffd6'; ctx.font = 'bold 16px monospace';
    ctx.fillText('CONTINUE SOLO', cx + btnW / 2, by + 30);
    _hsDisconnectContinueBoxes.push({ x: cx, y: by, w: btnW, h: btnH });
    // Return to menu
    const mx = baseX + btnW + gap;
    ctx.fillStyle = '#2a1a16';
    ctx.beginPath(); ctx.roundRect(mx, by, btnW, btnH, 8); ctx.fill();
    ctx.strokeStyle = '#ff8866'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffcc99'; ctx.font = 'bold 16px monospace';
    ctx.fillText('RETURN TO MENU', mx + btnW / 2, by + 30);
    _hsDisconnectBoxes.push({ x: mx, y: by, w: btnW, h: btnH });
  } else {
    const btnW = 240, btnH = 48;
    const bx = canvas.width / 2 - btnW / 2;
    const by = py + ph - 70;
    ctx.fillStyle = '#2a1a16';
    ctx.beginPath(); ctx.roundRect(bx, by, btnW, btnH, 8); ctx.fill();
    ctx.strokeStyle = '#ff8866'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffcc99'; ctx.font = 'bold 16px monospace';
    ctx.fillText('OK — RETURN TO MENU', canvas.width / 2, by + 30);
    _hsDisconnectBoxes.push({ x: bx, y: by, w: btnW, h: btnH });
  }
  ctx.restore();
}

// Wrapped onto every render() call so the modal popup, "remote player
// disconnected" banner, peer-leave notification, and out-of-sync warning
// always paint on top regardless of which inner state-block early-returned.
// Without this the disconnect popup was silently dropped on intro/map/draft/
// shop/etc — the bug behind "they go back to main menu without seeing why".
function _drawGlobalOverlays(ctx) {
  // 1) The blocking modal popup. Render highest priority so it sits above
  //    every other overlay.
  if (_hsDisconnectPopup) _drawHsDisconnectPopup(ctx);
  // 2) The 12-second "REMOTE PLAYER DISCONNECTED" banner. Drawn whether the
  //    popup is up or not — the banner serves as a continuous reminder during
  //    the post-popup grace window in case the user dismisses the popup but
  //    keeps playing.
  if (_remoteDisconnected && _remoteDisconnectTimer > 0) {
    const fadeIn  = Math.min(1, (12 - _remoteDisconnectTimer) / 0.3);
    const fadeOut = Math.min(1, _remoteDisconnectTimer / 2);
    const k = Math.min(fadeIn, fadeOut);
    const t = performance.now() / 1000;
    const pulse = 0.85 + 0.15 * Math.sin(t * 4);
    ctx.save();
    ctx.globalAlpha = k * 0.97;
    const bW = Math.min(720, canvas.width - 40), bH = 92, bX = canvas.width / 2 - bW / 2, bY = 90;
    ctx.shadowColor = '#ff6644';
    ctx.shadowBlur = 28 * pulse;
    ctx.fillStyle = 'rgba(50,12,12,0.96)';
    ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 14); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff6644'; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ffaa88';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠  REMOTE PLAYER DISCONNECTED  ⚠', canvas.width / 2, bY + 38);
    ctx.fillStyle = '#ffd0bb';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('Session is over. Continuing solo — return to lobby to play together again.', canvas.width / 2, bY + 66);
    ctx.restore();
  }
  // 3) Brief 3-4P partial-leave notification. When one peer leaves but other
  //    allies remain, the run keeps going — but we want a transient banner
  //    so the host/clients aren't surprised by the shrinking roster.
  if (_peerLeaveBadge) {
    const age = performance.now() / 1000 - _peerLeaveBadge.t0;
    const dur = 5.0;
    if (age >= dur) {
      _peerLeaveBadge = null;
    } else {
      const fadeIn  = Math.min(1, age / 0.25);
      const fadeOut = Math.min(1, (dur - age) / 0.5);
      const k = fadeIn * fadeOut;
      ctx.save();
      ctx.globalAlpha = k * 0.94;
      const bW = Math.min(540, canvas.width - 40), bH = 56;
      const bX = canvas.width / 2 - bW / 2, bY = 200;
      ctx.shadowColor = '#ff9966';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(40,18,12,0.96)';
      ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 10); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ff9966'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffd0bb';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${_peerLeaveBadge.label} disconnected — continuing with remaining allies`, canvas.width / 2, bY + 34);
      ctx.restore();
    }
  }
  // 4) Out-of-sync warning banner — host and client disagree on run state
  //    after multiple heartbeats. Previously this lived in the post-frame
  //    pass and silently never painted on most early-returning states.
  if (_syncWarningVisible && net.role === 'client' && net.peers.size > 0) {
    const t = performance.now() / 1000;
    const pulse = 0.8 + 0.2 * Math.sin(t * 3.5);
    ctx.save();
    const bW = Math.min(680, canvas.width - 40), bH = 72;
    const bX = canvas.width / 2 - bW / 2, bY = 190;
    ctx.globalAlpha = 0.94;
    ctx.shadowColor = '#ffcc33';
    ctx.shadowBlur = 22 * pulse;
    ctx.fillStyle = 'rgba(42,32,8,0.94)';
    ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 10); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffe999';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠  OUT OF SYNC WITH HOST  ⚠', canvas.width / 2, bY + 30);
    ctx.fillStyle = '#ffeecc';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(_syncMismatchReason || 'attempting to recover…', canvas.width / 2, bY + 54);
    ctx.restore();
  }
}

function _drawPartnerWaitingBadge(ctx, text) {
  const t = performance.now() / 1000;
  const pulse = 0.7 + 0.3 * Math.sin(t * 3);
  const w = Math.min(560, canvas.width - 40), h = 38;
  const x = canvas.width / 2 - w / 2;
  const y = 8;
  ctx.save();
  ctx.shadowColor = '#ffaa44';
  ctx.shadowBlur = 14 * pulse;
  ctx.fillStyle = 'rgba(40,28,12,0.94)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffaa44'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd699';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, y + 25);
  ctx.restore();
}

// Centralised disconnect-popup input handler. Consumes the click/key, picks
// a dismiss path, and returns true while the popup is up so callers can
// short-circuit further input handling. The popup blocks gameplay input —
// the player must explicitly acknowledge that the session ended (or chose
// to continue solo) before the run resumes. Auto-close timer is checked
// here too so a walked-away user always lands somewhere sensible.
function _handleHsDisconnectInput() {
  if (!_hsDisconnectPopup) return false;
  if (_hsDisconnectAutoCloseAt > 0 && performance.now() >= _hsDisconnectAutoCloseAt) {
    _dismissHsDisconnect('menu');
    return true;
  }
  const click = input.consumeClick();
  const enter = input.consumeKey('enter') || input.consumeKey(' ');
  const esc = input.consumeKey('escape');
  const twoButton = (_hsDisconnectMode === 'continueSolo');
  if (click) {
    const mx = input.mouse.x, my = input.mouse.y;
    for (const b of _hsDisconnectContinueBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        _dismissHsDisconnect('continue');
        return true;
      }
    }
    for (const b of _hsDisconnectBoxes) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        _dismissHsDisconnect('menu');
        return true;
      }
    }
    return true; // ate the click but didn't match a button — keep modal up
  }
  if (enter) {
    // Enter == primary action. In two-button mode that's "continue solo";
    // single-button mode it's the only action ("return to menu").
    _dismissHsDisconnect(twoButton ? 'continue' : 'menu');
    return true;
  }
  if (esc) {
    // Escape always means "back out → return to menu" regardless of mode.
    _dismissHsDisconnect('menu');
    return true;
  }
  return true; // popup is up — block other input even if no action consumed
}

// Recently-played card "ghost" — fades on the right edge for ~1.2 s after
// each card play. Reinforces what the player just did.
let _lastPlayedCard = null;       // { def, t0, slot }
let _cardPulseSlot = -1;          // slot index that just had a card played
let _cardPulseStart = 0;          // timestamp for the slot pulse animation
function _registerCardPlayed(def, slot) {
  _lastPlayedCard = { def, t0: performance.now() / 1000, slot };
  _cardPulseSlot = slot;
  _cardPulseStart = performance.now() / 1000;
  // Expose to ui.js for the slot-pulse animation (3.10)
  window._cardPulse = { slot, t0: _cardPulseStart };
  // Visual refresh 3.13: sparkle trail at player position
  if (player && particles) {
    particles.spawnBurst(player.x, player.y - 20, def.color || '#ffcc66');
  }
}

// Visual refresh 3.9 — tempo zone transition flash
let _tempoLastZone = null;
function _checkTempoZoneTransition() {
  let zone = 'flowing';
  const v = tempo.value;
  if (v < 30) zone = 'cold';
  else if (v < 70) zone = 'flowing';
  else if (v < 90) zone = 'hot';
  else zone = 'critical';
  if (_tempoLastZone && zone !== _tempoLastZone) {
    const colors = { cold: '#88ccff', flowing: '#88ffaa', hot: '#ff8844', critical: '#ff3322' };
    _tempoZoneFlashColor = colors[zone] || '#fff';
    _tempoZoneFlashTimer = 0.4;
  }
  _tempoLastZone = zone;
}
let _tempoZoneFlashTimer = 0;
let _tempoZoneFlashColor = '#fff';

// Visual refresh 3.15 — damage direction indicator
let _damageDirectionPulse = null; // { angle, t0 }
function _drawRecentlyPlayedGhost(ctx) {
  if (!_lastPlayedCard) return;
  const age = performance.now() / 1000 - _lastPlayedCard.t0;
  const dur = 1.2;
  if (age >= dur) { _lastPlayedCard = null; return; }
  const k = 1 - age / dur;
  const def = _lastPlayedCard.def;
  const x = canvas.width - 220 + (1 - k) * 80; // slides right as it fades
  const y = canvas.height / 2 - 60;
  ctx.save();
  ctx.globalAlpha = k * 0.85;
  ctx.fillStyle = 'rgba(20,24,38,0.92)';
  ctx.beginPath(); ctx.roundRect(x, y, 200, 56, 8); ctx.fill();
  ctx.strokeStyle = def.color || '#88ccff'; ctx.lineWidth = 2; ctx.stroke();
  // Slot indicator
  ctx.fillStyle = '#88ccff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('JUST PLAYED', x + 10, y + 14);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(def.name, x + 10, y + 34);
  ctx.fillStyle = '#88aacc';
  ctx.font = '10px monospace';
  ctx.fillText('AP ' + def.cost + (def.tempoShift ? '   tempo ' + (def.tempoShift > 0 ? '+' : '') + def.tempoShift : ''), x + 10, y + 50);
  ctx.restore();
}

// Revive arrow — short arrow offset from the reviver toward the downed
// teammate, pulsing so it catches the eye. Stays on-screen even when the
// downed player is nearby (acts as a "revive here!" beacon).
function _drawReviveArrow(ctx, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const nx = dx / dist, ny = dy / dist;
  const t = performance.now() / 1000;
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  const offset = 46 + pulse * 6; // distance from reviver
  const ax = from.x + nx * offset;
  const ay = from.y + ny * offset;
  const ang = Math.atan2(ny, nx);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.fillStyle = '#66ffaa';
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  // Arrow triangle
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-6, -7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Tempo aura ripple — cheap 2-ring effect drawn around player when tempo is
// in the HOT (≥70) or CRITICAL (≥90) bands. No allocations, just sin/cos.
function _drawTempoAura(ctx, p, tempoValue, t) {
  if (!p || !p.alive || p.downed) return;
  if (tempoValue < 70) return;
  const isCritical = tempoValue >= 90;
  const color = isCritical ? '#ff3333' : '#ff8800';
  const baseR = (p.r || 16) + 6;
  // Two staggered rings for continuous emission
  for (let k = 0; k < 2; k++) {
    const cycle = ((t * 1.4) + k * 0.5) % 1; // 0..1
    const r = baseR + cycle * 30;
    const a = (1 - cycle) * (isCritical ? 0.55 : 0.35);
    if (a < 0.02) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = color;
    ctx.lineWidth = isCritical ? 2.2 : 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Compact "READY" ribbon drawn at (x,y) anchored top-right. Used on the
// character cards in remote multiplayer.
function _drawReadyRibbon(ctx, x, y, color, label) {
  const w = 86, h = 22;
  const left = x - w;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(left, y, w, h, 4); ctx.fill();
  ctx.fillStyle = '#0a1410';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('✓ ' + label, left + w / 2, y + 15);
  ctx.restore();
}

// Draws a colored ring + label on the voted node so each player can see who
// picked what. `slot` 0 = local (inner ring), 1 = remote (outer ring) — keeps
// them visible when both players vote on the same node.
function _drawMapVoteRing(ctx, nodeId, color, label, slot, pulse) {
  if (!nodeId) return;
  const pos = runManager.getNodePosition(nodeId);
  if (!pos) return;
  const baseR = pos.r + 6 + slot * 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * pulse;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, baseR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Label above the node
  ctx.fillStyle = color;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, pos.x + (slot === 0 ? -22 : 22), pos.y - pos.r - 8 - slot * 14);
  ctx.restore();
}

// Helper: are we in a networked-MP session where we need to wait for the
// teammate's vote? Solo and solo-with-disconnected-peer both resolve
// immediately on the local click (single-player fallback).
function _isNetMp() {
  return net.role !== 'solo' && net.peers.size > 0;
}

// Clear all per-peer lobby caches. Run after `net.disconnect()` / session
// teardown so stale peerIds / chars / ready flags don't leak into the next
// lobby attempt.
function _resetPeerLobbyState() {
  _peerToIndex.clear();
  _remoteCharIds.clear();
  _remoteReadyByPeer.clear();
  _myPlayerIndex = 0;
}

// ── 3–4 player peer-index helpers ─────────────────────────────────────────
// Host owns the authoritative `peerId → playerIndex` assignment. It picks the
// lowest free index (1, 2, 3) for each connecting client and broadcasts the
// full map on every change via PEER_INDEX_ASSIGN. Both sides then use the
// same map to route CHAR_SELECTED / PLAYER_DOWNED / PLAYER_HP / … to the
// correct `players.list[i]` entry.
function _hostAssignPeerIndex(peerId) {
  if (net.role !== 'host') return;
  if (_peerToIndex.has(peerId)) return;
  const used = new Set([0, ..._peerToIndex.values()]);
  for (let i = 1; i <= 3; i++) {
    if (!used.has(i)) { _peerToIndex.set(peerId, i); break; }
  }
}
function _hostBroadcastPeerIndices() {
  if (net.role !== 'host' || net.peers.size === 0) return;
  const indices = {};
  for (const [pid, idx] of _peerToIndex) indices[pid] = idx;
  try { net.sendReliable('evt', { type: 'PEER_INDEX_ASSIGN', indices }); } catch {}
}
// Look up which players.list[] slot a peerId owns. Returns -1 if unknown
// (happens briefly while PEER_INDEX_ASSIGN is still in flight).
function _indexForPeer(peerId) {
  if (!peerId) return -1;
  const idx = _peerToIndex.get(peerId);
  return (typeof idx === 'number') ? idx : -1;
}
// Resolve the `players.list` entry owned by a given peerId. Array position
// and `playerIndex` can diverge in 3–4P setups (host-assigned slots are not
// always contiguous after rejoins), so search by `playerIndex` + the
// `_remotePeerId` tag, not raw array index.
function _remotePlayerFor(peerId) {
  if (peerId) {
    for (const p of players.list) if (p && p._remotePeerId === peerId) return p;
  }
  const idx = _indexForPeer(peerId);
  if (idx >= 0) {
    for (const p of players.list) if (p && p.playerIndex === idx && p._isRemote) return p;
  }
  // Fallback: first remote player in the list (preserves 2P behaviour when
  // PEER_INDEX_ASSIGN hasn't arrived yet).
  for (const p of players.list) if (p && p._isRemote) return p;
  return null;
}

// Rest-choice voting. Both sides cast a vote; when the votes match, the
// action is applied on both sides (each heals its own player / sets its
// own fortify flag / enters its own upgrade flow). Fixes the original
// bug where only the host's heal applied to everyone.
function _castRestVote(action) {
  _localRestVote = action;
  if (_isNetMp()) {
    net.sendReliable('evt', { type: 'REST_VOTE', action });
  }
  _checkRestVoteResolution();
}
function _checkRestVoteResolution() {
  if (!_isNetMp()) {
    // Solo / disconnected: resolve immediately from the local vote.
    if (_localRestVote) {
      const a = _localRestVote;
      _localRestVote = null;
      _applyRestAction(a);
    }
    return;
  }
  // 3–4P: every peer must have voted AND every vote (including ours) must
  // match. The rest choice applies to the whole party, so we don't want to
  // resolve on the first matching pair.
  if (!_localRestVote) return;
  for (const [pid] of net.peers) {
    const v = _remoteRestVoteByPeer.get(pid);
    if (!v) return;              // still waiting on this peer
    if (v !== _localRestVote) return;  // disagreement — wait for a change
  }
  const action = _localRestVote;
  _localRestVote = null;
  _remoteRestVote = null;
  _remoteRestVoteByPeer.clear();
  _applyRestAction(action);
}
function _applyRestAction(action) {
  if (action === 'heal') {
    healAllPlayers(3);
    console.log(`[Rest] Healed 3 HP: ${player.hp}/${player.maxHp}`);
    gameState = 'map';
  } else if (action === 'upgrade') {
    upgradeChoices = deckManager.getUpgradeChoices();
    if (upgradeChoices.length > 0) { gameState = 'upgrade'; }
    else { gameState = 'map'; }
  } else if (action === 'fortify') {
    player._fortifyBuff = true;
    particles.spawnDamageNumber(player.x, player.y - 30, '+10% DMG NEXT FIGHT!');
    console.log('[Rest] Fortify buff set');
    gameState = 'map';
  }
}

// Deck state is PER-PLAYER. Draft / shop / discard / upgrade picks only
// mutate the local player's deckManager — peers manage their own deck.
// These stubs remain as no-ops so older callers keep working even though
// no wire traffic is sent.
function _broadcastDeckAdd(_cardId) { /* per-player: no-op */ }
function _broadcastDeckRemove(_cardId) { /* per-player: no-op */ }

// Called whenever a vote arrives or is cast locally. If both votes match the
// SAME node id, the host computes the room contents (shop cards / event
// type) and broadcasts MAP_NODE_CHOSEN so both clients transition together.
function _checkMapVoteResolution() {
  if (!_localMapVote) return;
  if (gameState !== 'map') return;
  // 3–4P: every connected peer must have voted AND every vote must match
  // ours. One dissenter keeps the party on the map screen.
  if (net.peers.size > 0) {
    for (const [pid] of net.peers) {
      const v = _remoteMapVoteByPeer.get(pid);
      if (!v) return;                  // still waiting on this peer
      if (v !== _localMapVote) return; // disagreement
    }
  }
  // We agree! Only the host fires the actual transition + content roll.
  if (net.role === 'host' && net.peers.size > 0) {
    const node = runManager.nodeMap[_localMapVote];
    if (!node) return;
    _resolveMapNodeAsHost(node);
  } else if (net.role === 'solo') {
    const node = runManager.nodeMap[_localMapVote];
    if (node) _resolveMapNodeAsHost(node); // solo path uses the same code
  }
  // Clients just wait for the host's MAP_NODE_CHOSEN. Visual flash:
  _mapVoteFlash = 0.5;
}

// Host-side: pick the node, generate its content, broadcast MAP_NODE_CHOSEN.
// Pulled out of the click handler so the vote system and (legacy) click both
// converge on the same code path.
function _resolveMapNodeAsHost(node) {
  runManager.selectNodeById(node.id);
  const isMpHost = net.role === 'host' && net.peers.size > 0;
  if (node.type === 'rest') {
    restChoiceBoxes = [];
    gameState = 'rest';
    if (isMpHost) net.sendReliable('evt', {
      type: 'MAP_NODE_CHOSEN', nodeType: node.type, nodeId: node.id, floor: runManager.floor,
    });
  } else if (node.type === 'event') {
    const r = Math.random();
    currentEventType = r < 0.4 ? 'merchant' : (r < 0.7 ? 'blacksmith' : 'standard');
    gameState = 'event';
    if (isMpHost) net.sendReliable('evt', {
      type: 'MAP_NODE_CHOSEN', nodeType: node.type, nodeId: node.id, floor: runManager.floor,
      eventType: currentEventType,
    });
  } else if (node.type === 'shop') {
    const available = getAvailableCards();
    const sk = Math.min(4, available.length);
    for (let i = 0; i < sk; i++) {
      const j = i + Math.floor(Math.random() * (available.length - i));
      const tmp = available[i]; available[i] = available[j]; available[j] = tmp;
    }
    shopCards = available.slice(0, sk);
    gameState = 'shop';
    if (isMpHost) net.sendReliable('evt', {
      type: 'MAP_NODE_CHOSEN', nodeType: node.type, nodeId: node.id, floor: runManager.floor,
      shopCards,
    });
  } else {
    // Combat node: broadcast MAP_NODE_CHOSEN FIRST so the client sets up
    // its combat state, THEN let spawnEnemies broadcast ENEMY_SPAWN_LIST.
    // Without this ordering the client's MAP_NODE_CHOSEN handler calls
    // its own spawnEnemies AFTER the authoritative list arrives, which
    // wipes the synced enemies back to a locally-generated (mismatched)
    // roster. See also: client MAP_NODE_CHOSEN handler early-returns for
    // combat nodes and defers all setup to ENEMY_SPAWN_LIST.
    if (isMpHost) net.sendReliable('evt', {
      type: 'MAP_NODE_CHOSEN', nodeType: node.type, nodeId: node.id, floor: runManager.floor,
    });
    currentCombatNode = node;
    spawnEnemies(node);
    player.x = room.FLOOR_X1 + 100;
    player.y = (room.FLOOR_Y1 + room.FLOOR_Y2) / 2;
    gameState = 'prep';
  }
  // Reset votes for the next map screen
  _localMapVote = null;
  _remoteMapVote = null;
  _remoteMapVoteByPeer.clear();
}

// ── Profile overlay (Ctrl+P) ─────────────────────────────────────────
let _profileVisible = false;
let _profileFrameMs = 0;
let _profileUpdMs = 0;
let _profileRenderMs = 0;
let _profileLast = 0;
let _profileFrames = 0;
let _profileFrameAccum = 0;

// ── Network RTT measurement ──────────────────────────────────────────
// Host sends PING every 2 s during runs, every 1 s during lobby/charSelect.
// Receiver echoes immediately. Rolling avg of last 5 samples for the RTT
// indicator; the PONG watchdog uses the same stream for liveness.
const _rttSamples = [];
let _rttAvg = 0;
let _rttPingTimer = 0;
// PONG watchdog — host-side. Peers that stop responding (tab closed, crash,
// network cut) leave their RTCPeerConnection stuck in 'connected' or
// 'disconnected' for many seconds before WebRTC notices. Track the last
// time each peer replied; if the gap exceeds PONG_TIMEOUT_MS the peer is
// force-evicted so the charSelect/lobby UI doesn't stay stuck on
// "WAITING FOR P2…".
const _lastPongByPeer = new Map();
const PONG_TIMEOUT_MS = 5000; // 5 missed 1 s pre-run pings = evict
let _pongCheckAccum = 0;
// Client-side: track when the host last pinged us. If the host goes away
// the client can sit on the charSelect READY button forever waiting for
// GAME_STARTED. This timer detects that and tears the session down.
let _lastHostPingAt = 0;
const CLIENT_HOST_TIMEOUT_MS = 6000;
// Lobby-state watchdog: the peak peer count we've seen since entering
// lobby/charSelect. Used to detect "had a peer, now have zero" without
// needing the peer-leave event to have fired — if something ate the
// event, this still catches the transition and raises the popup.
let _lobbyPeakPeerCount = 0;
// ── Gamepad aim-assist state (P1 only) ────────────────────────────────
// `_gpAimTargetId` is the enemy id currently locked to; null = manual aim.
// `_gpAimBtns` is the previous frame's button snapshot, used to edge-trigger
// LT/RT target cycling without stealing from the global justPressed set.
let _gpAimTargetId = null;
let _gpAimBtns = [];
function _pushRtt(ms) {
  _rttSamples.push(ms);
  if (_rttSamples.length > 5) _rttSamples.shift();
  let s = 0;
  for (const x of _rttSamples) s += x;
  _rttAvg = s / _rttSamples.length;
}

// ── Network debug overlay (toggle with Ctrl+N) ────────────────────────
let _netDebugVisible = false;
const _netDebugLog = []; // [{ time, dir: 'in'|'out', name }]
let _netDebugSnapsIn0 = 0, _netDebugSnapsOut0 = 0, _netDebugEvtsIn0 = 0, _netDebugEvtsOut0 = 0;
let _netDebugRateAccum = 0;
let _netDebugRate = { snapIn: 0, snapOut: 0, evtIn: 0, evtOut: 0 };
let _netDebugSnapsInPrev = 0, _netDebugSnapsOutPrev = 0;
function _logNetEvent(dir, name) {
  _netDebugLog.push({ t: performance.now() / 1000, dir, name });
  if (_netDebugLog.length > 8) _netDebugLog.shift();
}

// Cosmetics state
let lootBoxOpen = null;         // { boxTier, result, elapsed, isSL, waitingDismiss }
let cosmeticPanelCharId = null;
let cosmeticPanelTab = 'bodyColor';

// Zone transition first-time tooltip
let seenZones = new Set();
let zoneTooltip = null; // { text, color, timer }

// ── Visual systems ────────────────────────────────────────────────
// RH2: cached background canvas for menu screens (intro/charSelect/lobby)
// share the same gradient + radial accents. Rebuilt only on resize.
let _menuBgCanvas = null;
let _menuBgKey = '';
function getMenuBackground() {
  const key = canvas.width + 'x' + canvas.height;
  if (_menuBgCanvas && _menuBgKey === key) return _menuBgCanvas;
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  const c = off.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#08111a');
  g.addColorStop(0.6, '#0a0f22');
  g.addColorStop(1, '#160a1a');
  c.fillStyle = g; c.fillRect(0, 0, canvas.width, canvas.height);
  const rg1 = c.createRadialGradient(canvas.width * 0.22, canvas.height * 0.30, 20, canvas.width * 0.22, canvas.height * 0.30, 420);
  rg1.addColorStop(0, 'rgba(64,200,200,0.18)'); rg1.addColorStop(1, 'rgba(64,200,200,0)');
  c.fillStyle = rg1; c.fillRect(0, 0, canvas.width, canvas.height);
  const rg2 = c.createRadialGradient(canvas.width * 0.78, canvas.height * 0.72, 20, canvas.width * 0.78, canvas.height * 0.72, 460);
  rg2.addColorStop(0, 'rgba(200,140,80,0.14)'); rg2.addColorStop(1, 'rgba(200,140,80,0)');
  c.fillStyle = rg2; c.fillRect(0, 0, canvas.width, canvas.height);
  _menuBgCanvas = off; _menuBgKey = key;
  return off;
}

// Menu/charSelect ambient floating particles (small pool, reused)
const MENU_PARTICLE_COUNT = 28;
const _menuParts = Array.from({ length: MENU_PARTICLE_COUNT }, (_, i) => ({
  x: 0, y: 0, vy: 0, vx: 0, r: 0, a: 0, col: '#fff'
}));
let _menuPartsInit = false;

// Fade-in from black on state enter
let _fadeAlpha = 1.0;  // start fully black, fade in
let _fadeDir   = -1;   // -1 = fading to transparent

// Draft card reveal animation
let _draftRevealTimer = 0;
let _draftRevealMax   = 0;

// Combat start flash (expanding ring)
let _combatStartFlash = 0;

// Ambient battle motes (slow floating particles)
const AMBIENT_COUNT = 14;
const _ambientParts = Array.from({ length: AMBIENT_COUNT }, () => ({
  x: 0, y: 0, vx: 0, vy: 0, r: 0, a: 0, life: 0, lifeRate: 0.15
}));
let _ambientInit = false;
let _ambientLastKind = null;

// Reseed an ambient particle with biome-themed motion + visual.
// Called on init and when a particle's life hits 1 (recycle).
function _seedAmbientParticle(p, kind, fresh) {
  const FX1 = (room && room.FLOOR_X1) || 0;
  const FX2 = (room && room.FLOOR_X2) || canvas.width;
  const FY1 = (room && room.FLOOR_Y1) || 0;
  const FY2 = (room && room.FLOOR_Y2) || canvas.height;
  p.x = FX1 + Math.random() * (FX2 - FX1);
  // Initial seeding fresh: spawn anywhere; recycled: spawn at the natural edge
  switch (kind) {
    case 'snow':
      // Falls down, tiny lateral drift.
      p.y = fresh ? (FY1 + Math.random() * (FY2 - FY1)) : (FY1 - 6);
      p.vx = (Math.random() - 0.5) * 12;
      p.vy = 14 + Math.random() * 18;
      p.r = 1.2 + Math.random() * 1.6;
      p.a = 0.18 + Math.random() * 0.18;
      p.lifeRate = 0.12 + Math.random() * 0.05;
      break;
    case 'ash':
      // Embers rising fast, spiraling drift.
      p.y = fresh ? (FY1 + Math.random() * (FY2 - FY1)) : (FY2 - 12);
      p.vx = (Math.random() - 0.5) * 24;
      p.vy = -22 - Math.random() * 22;
      p.r = 1.0 + Math.random() * 1.4;
      p.a = 0.20 + Math.random() * 0.20;
      p.lifeRate = 0.18;
      break;
    case 'bubbles':
      // Bubbles rising slowly, gentle drift.
      p.y = fresh ? (FY1 + Math.random() * (FY2 - FY1)) : (FY2 - 12);
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = -10 - Math.random() * 12;
      p.r = 1.5 + Math.random() * 2.0;
      p.a = 0.16 + Math.random() * 0.14;
      p.lifeRate = 0.10;
      break;
    case 'motes':
      // Voidline — random drifting motes that teleport slightly when looping.
      p.y = fresh ? (FY1 + Math.random() * (FY2 - FY1)) : (FY1 + Math.random() * (FY2 - FY1));
      p.vx = (Math.random() - 0.5) * 10;
      p.vy = (Math.random() - 0.5) * 10;
      p.r = 1.3 + Math.random() * 1.8;
      p.a = 0.16 + Math.random() * 0.18;
      p.lifeRate = 0.18;
      break;
    case 'steam':
      // Clockwork — slow rising steam, swelling.
      p.y = fresh ? (FY1 + Math.random() * (FY2 - FY1)) : (FY2 - 12);
      p.vx = (Math.random() - 0.5) * 6;
      p.vy = -6 - Math.random() * 8;
      p.r = 1.6 + Math.random() * 2.4;
      p.a = 0.10 + Math.random() * 0.12;
      p.lifeRate = 0.08;
      break;
    case 'pollen':
    default:
      // Verdant default — gentle upward drift with random sway.
      p.y = fresh ? (FY1 + Math.random() * (FY2 - FY1)) : (FY2 - 18);
      p.vx = (Math.random() - 0.5) * 16;
      p.vy = -6 - Math.random() * 16;
      p.r = 1 + Math.random() * 1.5;
      p.a = 0.08 + Math.random() * 0.18;
      p.lifeRate = 0.15;
      break;
  }
  p.life = fresh ? Math.random() : 0;
}

// IDEA-12: Brutal difficulty — per-floor curse
let currentFloorCurse = null; // 'apRegen' | 'speed' | 'tempoCost' | null
const BRUTAL_CURSES = ['apRegen', 'speed', 'tempoCost'];
const BRUTAL_CURSE_NAMES = { apRegen: 'CURSED: −30% AP Regen', speed: 'CURSED: −20% Speed', tempoCost: 'CURSED: +5 Tempo Loss/Card' };

// Rest node state
let restChoiceBoxes = [];

// World effect arrays
let traps = [];
let orbs = [];
let echoes = [];
let sigils = [];
let groundWaves = [];
let beamFlashes = [];
let channelState = null;
let _lastCardPlayed = null; // for aftershock echo

// Run stats
let runStats = {
  kills: 0, roomsCleared: 0, perfectDodges: 0, cardsPlayed: 0,
  manualCrashes: 0, itemsCollected: 0, elapsedTime: 0,
  floor: 1, difficulty: 0, won: false, character: '', highestCombo: 0,
  seed: 0
};

function resetRunStats() {
  runStats = {
    kills: 0, roomsCleared: 0, perfectDodges: 0, cardsPlayed: 0,
    manualCrashes: 0, itemsCollected: 0, elapsedTime: 0,
    floor: 1, difficulty: selectedDifficulty, won: false,
    character: selectedCharId || '', highestCombo: 0,
    seed: runManager.seed
  };
}

// ── Event Handlers ──────────────────────────────────────────────
events.on('PLAYER_SHOT_HIT', ({ enemy, damage, freeze, clusterAoE, executeLowShot, hitX, hitY }) => {
  if (!enemy.alive) return;
  let finalDmg = damage;
  if (executeLowShot && (enemy.hp / (enemy.maxHp || enemy.hp)) < executeLowShot) {
    finalDmg = enemy.hp;
    particles.spawnDamageNumber(enemy.x, enemy.y - 30, 'EXECUTE!');
  }
  combat.applyDamageToEnemy(enemy, finalDmg);
  if (freeze && enemy.alive) enemy.stagger(1.2);
  if (clusterAoE > 0) {
    const cx = hitX ?? enemy.x, cy = hitY ?? enemy.y;
    particles.spawnRing(cx, cy, clusterAoE, '#ffbb44');
    for (const e of enemies) {
      if (!e.alive || e === enemy) continue;
      const dx = e.x - cx, dy = e.y - cy;
      if (dx * dx + dy * dy < clusterAoE * clusterAoE) {
        combat.applyDamageToEnemy(e, Math.round(damage * 0.6));
      }
    }
  }
});

events.on('ENEMY_MELEE_HIT', ({ damage, source, target }) => {
  // RH2: route to the hit player (P1 or P2 in local co-op). Default to P1.
  const tgt = target || (source && source._currentTarget) || player;
  if (!tgt.alive) return; // Ignore hits on already-dead player

  // ── MP authority: host owns enemy behaviour ───────────────────────────
  const isMP = net.role !== 'solo' && net.peers.size > 0;
  if (isMP) {
    if (net.role === 'client') {
      // Client's local enemy AI still fires melee events for hitstop/parry
      // feel, but only the HOST is authoritative for player HP. Drop any
      // damage aimed at the local player — wait for the host's PLAYER_HIT
      // broadcast. Still allow parry to register locally (returns early).
      if (tgt === player) {
        if (tgt.parryWindow && tgt.parryWindow.timer > 0) {
          tgt.parryWindow.timer = 0;
          events.emit('COUNTER_STRIKE', { source, power: tgt.parryWindow.power, def: tgt.parryWindow.def });
          particles.spawnDamageNumber(tgt.x, tgt.y - 30, 'PARRY!');
          events.emit('HIT_STOP', 0.15);
          events.emit('PLAY_SOUND', 'perfect');
        }
        return;
      }
      // Remote placeholder damage on client side is meaningless — skip.
      if (tgt._isRemote) return;
    } else if (net.role === 'host') {
      // Host's enemy hit the remote placeholder — forward to the owning peer
      // so they can apply the damage on their authoritative player instead.
      if (tgt._isRemote) {
        net.sendReliable('evt', { type: 'PLAYER_HIT', damage, srcId: source?.id });
        // Still show a local hit flash for screen-shake feel.
        particles.spawnKillFlash('#ff2222');
        events.emit('HIT_STOP', 0.06);
        return;
      }
    }
  }
  // Visual refresh 3.15: damage direction indicator (only for local P1)
  if (tgt === player && source && source.x !== undefined) {
    const angle = Math.atan2(source.y - tgt.y, source.x - tgt.x);
    _damageDirectionPulse = { angle, t0: performance.now() / 1000 };
  }
  // Parry check
  if (tgt.parryWindow && tgt.parryWindow.timer > 0) {
    tgt.parryWindow.timer = 0;
    events.emit('COUNTER_STRIKE', { source, power: tgt.parryWindow.power, def: tgt.parryWindow.def });
    particles.spawnDamageNumber(tgt.x, tgt.y - 30, 'PARRY!');
    events.emit('HIT_STOP', 0.15);
    events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.3 });
    events.emit('PLAY_SOUND', 'perfect');
    return;
  }
  // Blood Rune sigil trigger (P1 only — sigils belong to the host run)
  if (tgt === player) {
    for (let si = sigils.length - 1; si >= 0; si--) {
      if (sigils[si].def.sigilTrigger === 'takeDamage' && !sigils[si].triggered) {
        sigils[si].triggered = true;
        tgt.heal(2);
        tempo._add(30);
        particles.spawnDamageNumber(tgt.x, tgt.y - 40, 'BLOOD RUNE!');
        particles.spawnBurst(tgt.x, tgt.y, '#ff2255');
      }
    }
  }
  damage = Math.round(damage * (DIFFICULTY_MODS[selectedDifficulty]?.dmgMult || 1));
  const charId = tgt._charId || selectedCharId;
  const passives = Characters[charId]?.passives;
  // Frost Cold damage reduction
  if (passives?.coldDamageReduction && tempo.value < 30) {
    damage = Math.round(damage * (1 - passives.coldDamageReduction));
  }
  // Vanguard Guard stack damage reduction
  if (passives?.ironGuard && tgt.guardStacks > 0) {
    const reduction = Math.min(damage, passives.guardDamageReduction || 2);
    damage = Math.max(0, damage - reduction);
    tgt.guardStacks--;
    tgt._guardDecayTimer = 0;
    particles.spawnDamageNumber(tgt.x, tgt.y - 20, 'GUARD');
  }
  tgt.takeDamage(damage);
  // Vanguard: build guard stack on hit
  if (passives?.ironGuard && damage > 0) {
    if (tgt.guardStacks === undefined) tgt.guardStacks = 0;
    tgt.guardStacks = Math.min(tgt.guardStacks + 1, passives.maxGuardStacks || 4);
    tgt._guardDecayTimer = 0;
  }
  // DAMAGE_TAKEN is emitted by player.takeDamage() for Frost passive
  particles.spawnKillFlash('#ff2222');
  events.emit('HIT_STOP', 0.08);
  events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.4 });
  renderer.triggerCA();
  // Game-over only when P1 dies (P2 just goes downed; players.update handles revive)
  if (tgt !== player) return;
  if (!player.alive) {
    // Wraith Undying: first death per room revives at 1 HP + crash
    if (passives?.undying && !player._undyingUsed) {
      player._undyingUsed = true;
      player.hp = 1;
      player.alive = true;
      tempo._triggerAccidentalCrash();
      particles.spawnCrashFlash();
      particles.spawnDamageNumber(player.x, player.y - 40, 'UNDYING!');
      return;
    }
    // Last Rites check
    if (itemManager.onDeath(tempo.value, player)) {
      console.log('[Items] Last Rites triggered — revived!');
      return;
    }
    console.log(`[Event] Player DIED Floor ${runManager.floor}, ${roomsCleared} rooms`);
    runStats.floor = runManager.floor;
    runStats.finalDeck = [...deckManager.collection];
    runStats.won = false;
    checkRunUnlocks(false);
    playerDeathTimer = 0.8; // brief death animation before stats screen
    input.clearFrame();
  }
});

events.on('REQUEST_PLAYER_POS_CRASH', ({ radius, dmg, accidental }) => {
  events.emit('CRASH_ATTACK', { x: player.x, y: player.y, radius, dmg });
  renderer.triggerCA();
  ui.triggerTempoCrash();
  if (!accidental) runStats.manualCrashes++;
  events.emit('CRASH_TEXT', { dmg });
  // Berserker Heart (BUG-04): each crash adds +1 combo stack
  if (itemManager.has('berserker_heart')) {
    player.comboCount++;
    player.comboTimer = Math.max(player.comboTimer, 2.0);
    events.emit('RELIC_ACTIVATED', { name: 'Berserker Heart', text: '+1 COMBO' });
  }
});

events.on('PLAYER_REVIVED', (payload) => {
  const p = payload?.player;
  if (!p) return;
  const restored = payload?.hpRestored || Math.max(1, Math.round(p.maxHp * 0.3));
  particles.spawnDamageNumber(p.x, p.y - 40, '+' + restored + ' HP');
  particles.spawnBurst(p.x, p.y, '#66ffaa');
  particles.spawnBurst(p.x, p.y, '#aaffcc');
  events.emit('SCREEN_SHAKE', { duration: 0.18, intensity: 0.25 });
});

events.on('PLAYER_DOWNED', (payload) => {
  const p = payload?.player;
  if (!p) return;
  particles.spawnDamageNumber(p.x, p.y - 40, 'DOWN!');
  particles.spawnBurst(p.x, p.y, '#ff4444');
  events.emit('SCREEN_SHAKE', { duration: 0.25, intensity: 0.5 });
});

events.on('KILL', () => {
  runStats.kills++;
  meta.addGold(1);
  // IDEA-01: Cold Mastery kill bonus — +5 Tempo per kill while Cold Mastery active
  if (player && player._coldMasteryActive && tempo.value < 30) {
    tempo._add(5);
    particles.spawnDamageNumber(player.x, player.y - 20, '+5 TEMPO');
  }
});

events.on('PERFECT_DODGE', () => {
  runStats.perfectDodges++;
  particles.spawnPerfectDodge(player.x, player.y);
  particles.spawnDamageNumber(player.x, player.y - 30, 'PERFECT!');
  // Shadow Cloak (BUG-02): arm the 3× damage buff after perfect dodge
  if (itemManager.has('shadow_cloak')) player._shadowCloakActive = true;
});

events.on('NEAR_MISS_PROJECTILE', ({ x, y }) => {
  if (player.checkPerfectDodge()) {
    // Perfect dodge was triggered
  }
});

const ZONE_TIPS = {
  COLD:     { text: 'COLD ZONE — 0.7× damage. Ice cards deal 3× here!', color: '#4a9eff' },
  FLOWING:  { text: 'FLOWING ZONE — balanced 1.0× damage.', color: '#44dd88' },
  HOT:      { text: 'HOT ZONE — 1.3× damage, 1.2× speed. Dash attacks deal damage!', color: '#ff8833' },
  CRITICAL: { text: 'CRITICAL ZONE — 1.8× damage, attacks pierce. Watch your tempo!', color: '#ff3333' },
};
// IDEA-04: Boss phase transition visual announcement
events.on('PHASE_TRANSITION', ({ phase }) => {
  particles.spawnDamageNumber(window.CANVAS_W / 2, window.CANVAS_H / 2 - 60, `PHASE ${phase}!`);
  slowMoTimer = Math.max(slowMoTimer, 0.4);
  slowMoScale = 0.1;
});

events.on('ZONE_TRANSITION', ({ oldZone, newZone }) => {
  particles.spawnZonePulse(tempo.stateColor());
  particles.spawnStateLabel(newZone, tempo.stateColor());
  if (!seenZones.has(newZone) && ZONE_TIPS[newZone]) {
    seenZones.add(newZone);
    zoneTooltip = { text: ZONE_TIPS[newZone].text, color: ZONE_TIPS[newZone].color, timer: 3.5 };
  }
  // IDEA-01: clear Cold Mastery when leaving Cold zone
  if (oldZone === 'COLD') {
    if (player) { player._coldMasteryTimer = 0; player._coldMasteryActive = false; }
  }
});

events.on('LAST_KILL', ({ x, y }) => {
  lastKillSlowTimer = 0.4;
  particles.spawnLastKill();
  particles.spawnRoomClear();
  events.emit('SCREEN_SHAKE', { duration: 0.35, intensity: 0.55 });
});

events.on('SLOW_MO', ({ dur, scale }) => {
  slowMoTimer = dur;
  slowMoScale = scale;
});

events.on('PLAYER_TRAIL', ({ x, y, color }) => {
  particles.spawnTrail(x, y, color);
});

events.on('DRAIN', () => {
  particles.spawnDamageNumber(player.x, player.y - 20, '-20 TEMPO');
});

events.on('RELIC_ACTIVATED', ({ name, text }) => {
  const label = text ? `${name}: ${text}` : name;
  particles.spawnDamageNumber(player.x, player.y - 55, label);
});

events.on('PLAYER_SILENCED', ({ duration }) => {
  player.silenced = true;
  player.silenceTimer = duration;
  particles.spawnDamageNumber(player.x, player.y - 40, 'SILENCED!');
  particles.spawnBurst(player.x, player.y, '#cc44ff');
  events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.3 });
  events.emit('HIT_STOP', 0.1);
});

events.on('OVERLOADED', ({ x, y }) => {
  particles.spawnOverloaded(x, y);
  events.emit('PLAY_SOUND', 'miss');
});

events.on('CRASH_TEXT', ({ dmg }) => {
  particles.spawnCrashText(dmg);
  particles.spawnCrashFlash();
  particles.spawnCrashSliver('#ff5500');  // #20: eye-level horizon sliver
  // Trigger crash runes
  for (const s of sigils) {
    if (s.def && s.def.sigilTrigger === 'crash' && !s.triggered) {
      s.triggered = true;
      _fireSigil(s);
    }
  }
});

events.on('SPAWN_TRAP', (data) => {
  traps.push({ ...data, triggered: false, _netRemote: data._netOrigin === 'remote' });
});
events.on('SPAWN_ORBS', (data) => {
  const { count, radius, damage, life, speed, color, freeze, spiral } = data;
  const _netRemote = data._netOrigin === 'remote';
  // Remote-origin orbs must orbit the remote player, not our local one.
  let _ownerRef = null;
  if (_netRemote && players && players.list) {
    _ownerRef = players.list.find(pl => pl && pl._isRemote) || null;
  }
  for (let i = 0; i < count; i++) {
    orbs.push({
      angle: (i / count) * Math.PI * 2,
      baseRadius: radius,
      radius,
      speed,
      damage,
      life,
      maxLife: life,
      color,
      freeze,
      spiral,
      hitCooldowns: new WeakMap(),
      _netRemote,
      _ownerRef,
    });
  }
});
events.on('SPAWN_ECHO', (data) => {
  echoes.push({ ...data, timer: data.delay, _netRemote: data._netOrigin === 'remote' });
});
events.on('SPAWN_SIGIL', (data) => {
  // Max 2 sigils; remove oldest if needed
  if (sigils.length >= 2) sigils.shift();
  sigils.push({ ...data, triggered: false, _netRemote: data._netOrigin === 'remote' });
});
events.on('START_CHANNEL', ({ def, dmgMult }) => {
  channelState = { def, dmgMult, tickTimer: 0, apTimer: 0 };
});
events.on('SPAWN_GROUND_WAVE', (data) => {
  groundWaves.push({
    ...data,
    traveled: 0,
    hitEnemies: new Set(),
    zoneLife: 0,
    zoneX: 0, zoneY: 0,
    _netRemote: data._netOrigin === 'remote',
  });
});
events.on('SPAWN_BEAM_FLASH', (data) => {
  beamFlashes.push({ ...data, life: 0.12, maxLife: 0.12 });
});
events.on('COUNTER_STRIKE', ({ source, power, def }) => {
  if (!source || !source.alive) return;
  if (def && def.counterPct) {
    const pctDmg = Math.round(source.maxHp * def.counterPct);
    combat.applyDamageToEnemy(source, pctDmg);
    particles.spawnDamageNumber(source.x, source.y - 20, `${pctDmg} DMG`);
  } else if (power > 0) {
    combat.applyDamageToEnemy(source, power);
    particles.spawnDamageNumber(source.x, source.y - 20, `${power} DMG`);
  }
  particles.spawnBurst(source.x, source.y, '#ffdd44');
  if (def && def.counterStagger && source.alive) source.stagger(def.counterStagger);
  if (def && def.counterReset) {
    tempo.setValue(50);
    player.dodging = true;
    player.dodgeTimer = 1.0;
    player.dodgeCooldown = 1.0;
  }
  particles.spawnDamageNumber(player.x, player.y - 30, 'COUNTER!');
});

events.on('SPLITTER_DIED', ({ x, y, difficultySpdMult }) => {
  // Client is never authoritative for enemy spawns — it waits for the
  // host's SPAWN_SPLIT broadcast below so child IDs match on both sides.
  if (net.role === 'client' && net.peers.size > 0) return;
  const offsets = [[30, 0], [-30, 0]];
  const spawned = [];
  for (const [ox, oy] of offsets) {
    const s = new Split(x + ox, y + oy);
    s.difficultySpdMult = difficultySpdMult;
    s.id = _allocEnemyId();
    enemies.push(s);
    spawned.push({ id: s.id, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp });
  }
  combat.setLists(enemies, player);
  projectiles.setEnemies(enemies);
  ui.setEnemies(enemies);
  if (net.role === 'host' && net.peers.size > 0) {
    net.sendReliable('evt', {
      type: 'SPAWN_SPLIT',
      spawns: spawned,
      difficultySpdMult: difficultySpdMult || 1,
    });
  }
});

events.on('COLD_CRASH', ({ radius, freezeDur }) => {
  // Freeze all enemies in radius around player
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - player.x, dy = e.y - player.y;
    if (dx * dx + dy * dy < (radius + e.r) * (radius + e.r)) {
      e.stagger(freezeDur);
    }
  }
  // Brief player invincibility
  player.dodging = true;
  player.dodgeTimer = 0.5;
  player.dodgeCooldown = Math.max(player.dodgeCooldown, 0.5);
  particles.spawnColdCrashFlash();
  particles.spawnCrashSliver('#44ccff');  // #20: cyan sliver for cold crash
  particles.spawnRing && particles.spawnRing(player.x, player.y, radius, '#66ccff');
  particles.spawnDamageNumber(player.x, player.y - 40, 'COLD CRASH!');
  renderer.triggerCA();
  ui.triggerTempoCrash();
});

events.on('COMBO_DISPLAY', ({ count, x, y }) => {
  particles.spawnComboDisplay(count, x, y);
  if (count > (runStats.highestCombo || 0)) runStats.highestCombo = count;
});

// Enemy class lookup by the string `.type` that super() sets. Used by the
// client to rebuild the authoritative enemy list broadcast by the host.
const ENEMY_TYPE_MAP = {
  'chaser': Chaser, 'sniper': Sniper, 'bruiser': Bruiser, 'turret': Turret,
  'teleporter': Teleporter, 'swarm': Swarm, 'healer': Healer, 'mirror': Mirror,
  'tempovampire': TempoVampire, 'shielddrone': ShieldDrone, 'phantom': Phantom,
  'blocker': Blocker, 'bomber': Bomber, 'marksman': Marksman,
  'juggernaut': Juggernaut, 'stalker': Stalker, 'split': Split, 'splitter': Splitter,
  'corruptor': Corruptor, 'berserker_enemy': BerserkerEnemy,
  'ricochet_drone': RicochetDrone, 'disruptor': Disruptor,
  'timekeeper': Timekeeper, 'sentinel': Sentinel,
  'boss_brawler': BossBrawler, 'boss_conductor': BossConductor,
  'boss_echo': BossEcho, 'boss_necromancer': BossNecromancer,
  'boss_apex': BossApex, 'boss_archivist': BossArchivist,
  'tether_witch': TetherWitch, 'mire_toad': MireToad, 'bloomspawn': Bloomspawn,
  'iron_choir': IronChoir, 'static_hound': StaticHound,
  'boss_hollow_king': BossHollowKing, 'boss_vault_engine': BossVaultEngine,
  'boss_aurora': BossAurora,
};

function _spawnEnemyFromSync(data) {
  const Cls = ENEMY_TYPE_MAP[data.type];
  if (!Cls) return null;
  const e = new Cls(data.x, data.y);
  // Apply elite modifier BEFORE overriding HP — applyEliteModifier
  // multiplies hp/maxHp (e.g. armored ×1.3), so if we set HP first the
  // modifier would re-multiply the host's already-scaled HP and the
  // client's enemy would have ~1.3× more HP than the host's. The host's
  // broadcast HP is authoritative; elite is just so attribute checks
  // (immunity to stagger etc.) run on the client too.
  if (data.elite) e.applyEliteModifier(data.elite);
  if (typeof data.hp === 'number')    e.hp = data.hp;
  if (typeof data.maxHp === 'number') e.maxHp = data.maxHp;
  if (data.id) e.id = data.id;
  return e;
}

// Monotonically-increasing enemy-id counter for dynamically-spawned enemies
// (e.g. Splitter's children). spawnEnemies resets this after the initial
// roster is assigned so dynamic spawns don't collide with `e1, e2, …` IDs.
let _nextDynamicEnemyId = 1;
function _allocEnemyId() {
  const id = 'e' + _nextDynamicEnemyId;
  _nextDynamicEnemyId++;
  return id;
}

// ── Helpers ─────────────────────────────────────────────────────
function startNewRun(explicitSeed) {
  const charDef = Characters[selectedCharId];
  player = new Player(400, 360);
  player.hp = charDef.hp;
  player.maxHp = charDef.maxHp;
  player.apRegen = charDef.apRegen;
  player.BASE_SPEED = charDef.baseSpeed;
  player.setClassPassives(charDef.passives);
  player.charId = selectedCharId;
  player.haloColor = PLAYER_HALO_COLORS[0];
  // Co-op mode (downed-instead-of-die): true for local 2P AND remote multiplayer
  player._coopMode = !!localCoop || (net.role !== 'solo' && net.peers.size > 0);
  // Stable ID for snapshot reconciliation: host is always p0, clients get
  // their host-assigned slot (1, 2, or 3) in 3–4 player sessions. Falls back
  // to 1 if PEER_INDEX_ASSIGN hasn't arrived yet — matches old 2P behaviour.
  if (net.role === 'host') player.playerIndex = 0;
  else if (net.role === 'client') player.playerIndex = (_myPlayerIndex > 0) ? _myPlayerIndex : 1;
  else player.playerIndex = 0;
  player.id = 'p' + player.playerIndex;
  // Coop input scheme: P1 → arrows + mouse + '/' dodge. Solo → both schemes + space dodge.
  player._inputScheme = localCoop ? 'arrows' : 'both';
  player._dodgeKey    = localCoop ? '/' : ' ';

  // RH2: rebuild Players list. P2 (and beyond) get the same character
  // for now; the lobby UI will let users pick separate chars later.
  players.reset();
  players.add(player);
  if (localCoop) {
    const p2 = makePlayer(charDef, 500, 360);
    p2._coopMode = true;
    p2._inputScheme = 'wasd';
    p2._dodgeKey    = ' '; // player2View maps consumeKey(' ') → 'e'
    players.add(p2);
  } else if (net.role !== 'solo' && net.peers.size > 0) {
    // Remote co-op: create one placeholder per connected peer so 3-4 player
    // sessions have a slot each. Positions are driven by incoming snapshots;
    // we never run updateLogic on them.
    //
    // Slot assignment:
    //   - On the host, peers have indices from _peerToIndex (1..3).
    //   - On a client, the host is always slot 0; other clients use their
    //     host-assigned slot. If PEER_INDEX_ASSIGN hasn't arrived yet we
    //     fall back to insertion order (still stable within 2P).
    const myIdx = player.playerIndex;
    const used  = new Set([myIdx]);
    let fallbackIdx = 0;
    const _nextFree = () => {
      while (used.has(fallbackIdx)) fallbackIdx++;
      const v = fallbackIdx;
      used.add(v);
      return v;
    };
    // Build an ordered list so placeholder creation is deterministic:
    // peerIds with known indices first, then anything else in peers-map order.
    const seen = new Set();
    const ordered = [];
    for (const [pid] of net.peers) {
      ordered.push({ peerId: pid, idx: _peerToIndex.has(pid) ? _peerToIndex.get(pid) : null });
      seen.add(pid);
    }
    for (const rp of ordered) {
      // Client viewing the host: the host owns slot 0 regardless of what its
      // peerId maps to in _peerToIndex (which tracks only clients).
      let assignedIdx;
      if (net.role === 'client' && !_peerToIndex.has(rp.peerId)) {
        // Assume the non-self peer that has no index is the host.
        assignedIdx = used.has(0) ? _nextFree() : 0;
        used.add(assignedIdx);
      } else if (rp.idx === null) {
        assignedIdx = _nextFree();
      } else {
        assignedIdx = rp.idx;
        used.add(assignedIdx);
      }
      const charId = _remoteCharIds.get(rp.peerId) || _remoteCharId || 'blade';
      const remoteCharDef = Characters[charId] || Characters['blade'];
      // Spread starting spawns so placeholders don't all overlap at 500,360.
      const spawnX = 500 + (assignedIdx % 2) * 40;
      const spawnY = 360 + Math.floor(assignedIdx / 2) * 40;
      const ph = makePlayer(remoteCharDef, spawnX, spawnY);
      ph.charId       = charId;
      ph.playerIndex  = assignedIdx;
      ph.id           = 'p' + assignedIdx;
      ph.haloColor    = PLAYER_HALO_COLORS[assignedIdx % PLAYER_HALO_COLORS.length];
      ph._isRemote    = true;
      ph._coopMode    = true;
      ph._remotePeerId = rp.peerId;
      players.add(ph);
    }
  }
  window._players = players;

  // NET: wipe snapshot caches carried over from any previous run so a
  // fresh p0/p1/e1… set doesn't interpolate from last run's final state.
  snapDecoder.reset();
  hostSim.reset();

  // Seed must be set before any RNG calls
  runManager.floor = 1;
  runManager.setSeed(explicitSeed ?? lobby.seed ?? Date.now());

  // Pick 3 random starting cards from the pool using the run seed
  const pool = [...(charDef.startingPool || charDef.startingDeck || [])];
  const startRng = runManager.getRng();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(startRng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  deckManager.initDeck(pool.slice(0, 3));
  tempo.value = 50;
  tempo.targetValue = 50;
  tempo.setClassPassives(charDef.passives);
  itemManager.reset();
  projectiles.clear();

  roomsCleared = 0;
  totalHealedThisRun = 0;
  noDashCardsUsedThisRun = true;
  // IDEA-01: Cold Mastery tracking
  player._coldMasteryTimer = 0;
  player._coldMasteryActive = false;
  // IDEA-12: reset floor curse
  currentFloorCurse = selectedDifficulty >= 2 ? BRUTAL_CURSES[0] : null;
  newUnlocks = [];
  slowMoTimer = 0;
  slowMoScale = 1.0;
  lastKillSlowTimer = 0;
  seenZones = new Set();
  zoneTooltip = null;
  ui.prepPendingCard = null;
  ui.showInventory = false;
  window._discardCallback = null; // LIKELY-02: prevent stale callback from prior run

  // Reset multiplayer handshake flags so a fresh run starts cleanly and
  // isn't blocked by stale state carried over from a prior run / lobby.
  _localPhaseDone = true;
  _remotePhaseDone = true;
  _remotePhaseDoneByPeer.clear();
  _prepReadyLocal = false;
  _prepReadyRemote = false;
  _prepReadyByPeer.clear();
  _localMapVote = null;
  _remoteMapVote = null;
  _remoteMapVoteByPeer.clear();
  _remoteRestVoteByPeer.clear();
  _prevSyncState = null;
  // Force HP broadcast on first frame of the new run.
  _lastHpBroadcast = { hp: -1, maxHp: -1, alive: null, downed: null };
  _lastApBroadcast = { pip: -1, maxBudget: -1 };
  // Clear any stale disconnect banner from a prior session — otherwise the
  // "REMOTE PLAYER DISCONNECTED" notice can flash on the first battle of a
  // new run if the previous run ended with a disconnect.
  _remoteDisconnected = false;
  _remoteDisconnectTimer = 0;
  _syncHeartbeatAccum = 0;
  _syncMismatchCount = 0;
  _syncMismatchReason = '';
  _syncWarningVisible = false;
  _syncRecoveryRequestedAt = 0;
  _hsDisconnectPopup = false;
  _hsDisconnectReason = '';
  _hsDisconnectBoxes.length = 0;
  _hsDisconnectContinueBoxes.length = 0;
  _hsDisconnectMode = 'menu';
  _hsDisconnectAutoCloseAt = 0;
  _peerLeaveBadge = null;
  _charSelectQuitConfirm = false;

  runManager.generateMap();
  // RH2: pick biome for floor 1
  currentBiome = pickBiomeForFloor(runManager.floor, runManager.getRng());
  window._biome = currentBiome;
  if (room) room.biome = currentBiome;
  resetRunStats();

  ui.player = player;
  ui.setEnemies(enemies);
  combat.setLists([], player);
  gameState = 'map';
  audio.playBGM('map');
  console.log(`[Run] New run as "${selectedCharId}" difficulty=${DIFFICULTY_NAMES[selectedDifficulty]} seed=${runManager.seed}`);
}

function spawnEnemies(node) {
  enemies = [];
  const f = runManager.floor;
  // IDs are assigned at the END of this function (after all enemies are pushed)
  // using the same scheme as HostSim so KILL event IDs match on both sides.
  const diff = DIFFICULTY_MODS[selectedDifficulty] || DIFFICULTY_MODS[0];
  const rng = runManager.getRng();
  function rndX() { return room.FLOOR_X1 + 100 + rng() * (room.FLOOR_X2 - room.FLOOR_X1 - 200); }
  function rndY() { return room.FLOOR_Y1 + 80 + rng() * (room.FLOOR_Y2 - room.FLOOR_Y1 - 160); }
  const cx = (room.FLOOR_X1 + room.FLOOR_X2) / 2;
  const cy = (room.FLOOR_Y1 + room.FLOOR_Y2) / 2;

  // Generate room variant
  room.generateVariant(f, rng);

  if (node.type === 'boss') {
    // Visual refresh 3.7 — boss intro banner
    _showBossIntro('FLOOR ' + f + ' BOSS');
    // RH2 #11: mix the three new RH2 bosses (HollowKing/VaultEngine/Aurora)
    // into the existing roster on a seeded roll, so each run can surface a
    // fresh fight instead of always RH1's lineup.
    const _bossRoll = rng();
    if (f === 1) {
      if (_bossRoll < 0.4) {
        enemies.push(new BossHollowKing(cx, cy - 50));
      } else {
        enemies.push(new BossBrawler(cx, cy - 50));
      }
      enemies.push(new Chaser(rndX(), rndY()));
    } else if (f === 2) {
      if (_bossRoll < 0.4) {
        enemies.push(new BossVaultEngine(cx, cy - 50));
      } else {
        enemies.push(new BossConductor(cx, cy - 50));
        enemies.push(new ShieldDrone(cx - 100, cy + 60));
        enemies.push(new ShieldDrone(cx + 100, cy + 60));
      }
    } else if (f === 3) {
      if (_bossRoll < 0.3) {
        enemies.push(new BossAurora(cx, cy));
      } else if (_bossRoll < 0.5) {
        enemies.push(new BossArchivist(cx, cy));
      } else {
        enemies.push(new BossEcho(cx, cy));
      }
    } else if (f === 4) {
      if (_bossRoll < 0.35) {
        enemies.push(new BossHollowKing(cx, cy - 50));
        enemies.push(new Phantom(cx - 120, cy + 60));
      } else {
        enemies.push(new BossNecromancer(cx, cy - 50));
        enemies.push(new Phantom(cx - 120, cy + 60));
        enemies.push(new Phantom(cx + 120, cy + 60));
        enemies.push(new Chaser(rndX(), rndY()));
      }
    } else {
      if (_bossRoll < 0.35) {
        enemies.push(new BossVaultEngine(cx, cy));
        enemies.push(new BossAurora(cx + 200, cy));
      } else {
        enemies.push(new BossApex(cx, cy));
        enemies.push(new Blocker(cx - 160, cy));
        enemies.push(new Marksman(cx + 160, cy));
      }
    }
  } else if (node.type === 'elite') {
    const eliteRoll = rng();
    const eliteEnemy = f >= 3 && eliteRoll < 0.35 ? new Juggernaut(cx + 60, cy) : new Bruiser(cx + 60, cy);
    // Apply a random elite modifier
    const modRoll = rng();
    const modType = modRoll < 0.35 ? 'armored' : (modRoll < 0.7 ? 'berserk' : 'regenerating');
    eliteEnemy.applyEliteModifier(modType);
    enemies.push(eliteEnemy);
    const extra = 2 + Math.floor(f * 0.7);
    for (let i = 0; i < extra; i++) {
      if (f >= 4) enemies.push(rng() < 0.5 ? new Phantom(rndX(), rndY()) : new Blocker(rndX(), rndY()));
      else if (f >= 2) enemies.push(rng() < 0.4 ? new BerserkerEnemy(rndX(), rndY()) : new Chaser(rndX(), rndY()));
      else enemies.push(new Chaser(rndX(), rndY()));
    }
    if (f >= 2) enemies.push(new Healer(rndX(), rndY()));
    if (f >= 3 && rng() < 0.4) enemies.push(new TempoVampire(rndX(), rndY()));
    if (f >= 3 && rng() < 0.4) enemies.push(new Timekeeper(rndX(), rndY()));
    if (f >= 4 && rng() < 0.5) enemies.push(new Bomber(rndX(), rndY()));
    if (f >= 4 && rng() < 0.4) enemies.push(new Corruptor(rndX(), rndY()));
  } else {
    const count = 4 + Math.floor(f * 0.8) + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const roll = rng();
      if (f >= 5 && roll < 0.06) enemies.push(new Phantom(rndX(), rndY()));
      else if (f >= 5 && roll < 0.10) enemies.push(new Blocker(rndX(), rndY()));
      else if (f >= 4 && roll < 0.14) enemies.push(new Corruptor(rndX(), rndY()));
      else if (f >= 4 && roll < 0.18) enemies.push(new Marksman(rndX(), rndY()));
      else if (f >= 4 && roll < 0.22) enemies.push(new Bomber(rndX(), rndY()));
      else if (f >= 3 && roll < 0.26) enemies.push(new Timekeeper(rndX(), rndY()));
      else if (f >= 3 && roll < 0.30) enemies.push(new BerserkerEnemy(rndX(), rndY()));
      else if (f >= 2 && roll < 0.33) enemies.push(new Sentinel(rndX(), rndY()));
      else if (f >= 3 && roll < 0.34) enemies.push(new Mirror(rndX(), rndY()));
      else if (f >= 2 && roll < 0.38) enemies.push(new Stalker(rndX(), rndY()));
      else if (f >= 2 && roll < 0.42) enemies.push(new RicochetDrone(rndX(), rndY()));
      else if (f >= 2 && roll < 0.46) enemies.push(new Disruptor(rndX(), rndY()));
      else if (f >= 2 && roll < 0.50) enemies.push(new Teleporter(rndX(), rndY()));
      else if (f >= 1 && roll < 0.58) enemies.push(new Splitter(rndX(), rndY()));
      else if (roll < 0.63) enemies.push(new TempoVampire(rndX(), rndY()));
      else if (roll < 0.67) enemies.push(new ShieldDrone(rndX(), rndY())); // BUG-06: was dead branch (0.63)
      else if (roll < 0.68) enemies.push(new Healer(rndX(), rndY()));
      else if (roll < 0.74) enemies.push(new Turret(rndX(), rndY()));
      else if (roll < 0.82) {
        const sx = rndX(), sy = rndY();
        enemies.push(new Swarm(sx, sy));
        enemies.push(new Swarm(sx + 20, sy + 15));
        enemies.push(new Swarm(sx - 15, sy + 20));
        enemies.push(new Swarm(sx + 10, sy - 18));
        i += 3;
      }
      else if (roll < 0.91) enemies.push(new Sniper(rndX(), rndY()));
      else enemies.push(new Chaser(rndX(), rndY()));
    }
  }

  // IDEA-12: Hard difficulty — 30% chance per enemy to gain an elite modifier
  if (selectedDifficulty >= 1) {
    for (const e of enemies) {
      if (!e.isBoss && rng() < 0.30) {
        const modRoll = rng();
        e.applyEliteModifier(modRoll < 0.4 ? 'armored' : modRoll < 0.7 ? 'berserk' : 'regenerating');
      }
    }
  }

  // Per-act ramp on top of difficulty mods
  const actHpRamp  = f >= 5 ? 1.5 : (f >= 4 ? 1.2 : 1.0);
  const actSpdRamp = f >= 5 ? 1.2 : (f >= 4 ? 1.1 : 1.0);
  const telegraphMult = f >= 5 ? 0.7 : (f >= 4 ? 0.82 : 1.0);
  let _eid = 1;
  for (const e of enemies) {
    e.hp = Math.round(e.hp * (1 + (f - 1) * 0.18) * diff.hpMult * actHpRamp);
    e.maxHp = e.hp;
    e.difficultySpdMult = (diff.spdMult || 1.0) * actSpdRamp;
    if (f >= 4) e.telegraphDuration = Math.max(0.25, e.telegraphDuration * telegraphMult);
    // Stable ID for KILL event sync — must match HostSim's scheme (e1, e2, …)
    if (!e.id) e.id = 'e' + _eid;
    _eid++;
  }
  // Dynamic-spawn ID allocator starts one past the last static ID so
  // Splitter children (and future mid-fight spawns) never collide with
  // existing `e1…eN` IDs used in snapshots / KILL events.
  _nextDynamicEnemyId = _eid;

  // Set starting tempo from items
  tempo.value = itemManager.startingTempo();
  tempo.targetValue = tempo.value;
  itemManager.resetRoom();
  projectiles.clear();
  particles.particles.length = 0;
  particles.visuals.length = 0;
  // Keep screen effects — room clear banner looks good
  player.comboCount = 0;
  player.comboTimer = 0;

  // RH2: authoritative enemy broadcast. The host's spawnEnemies runs with
  // the seeded RNG; clients call the same function to try to stay in
  // lockstep, but RNG drift (items, difficulty-conditional rolls) has in
  // practice produced *different* enemies on each side — leading to
  // "unkillable" phantom enemies and mismatched maps. To guarantee match,
  // the host broadcasts the canonical enemy list after spawning; the
  // client reconciler overwrites its local enemies with the host's list.
  if (net.role === 'host' && net.peers.size > 0) {
    const compact = [];
    for (const e of enemies) {
      compact.push({
        id: e.id, type: e.type,
        x: Math.round(e.x), y: Math.round(e.y),
        hp: e.hp, maxHp: e.maxHp,
        elite: e.eliteMod || null,
      });
    }
    net.sendReliable('evt', {
      type: 'ENEMY_SPAWN_LIST',
      nodeType: node.type,
      nodeId: node.id,
      floor: runManager.floor,
      variant: room.variant,
      pillars: room.pillars.map(pp => ({ x: pp.x, y: pp.y, w: pp.w, h: pp.h })),
      enemies: compact,
      // Host's RNG position after spawnEnemies ran. Client snaps to this
      // so the subsequent post-clear rolls (curse / generateMap / biome /
      // draft) line up on both sides; without this, the client's RNG is
      // behind by however many values spawnEnemies consumed.
      rngState: runManager.getRngState(),
    });
  }

  combat.setLists(enemies, player);
  ui.setEnemies(enemies);
  projectiles.setEnemies(enemies);
  // NET: enemy IDs (e1, e2, …) are reused across rooms, so we must wipe
  // the snapshot caches or remote entities would interpolate from their
  // last-room position to the new spawn for ~70 ms after room entry.
  if (net.role !== 'solo' && net.peers.size > 0) {
    snapDecoder.reset();
    hostSim.reset();
  }
  // Reset per-room passives
  player._undyingUsed = false;
  player.guardStacks = 0;
  player._guardDecayTimer = 0;
  player.silenced = false;
  player.silenceTimer = 0;
  traps.length = 0;
  orbs.length = 0;
  echoes.length = 0;
  sigils.length = 0;
  groundWaves.length = 0;
  beamFlashes.length = 0;
  channelState = null;
  killEffects.length = 0;
  
  if (node.type === 'boss') {
    audio.playBGM('boss');
  } else {
    audio.playBGM('normal');
  }
  
  if (window.DEBUG) console.log(`[Spawn] "${node.type}" F${f}: ${enemies.length} enemies [${enemies.map(e=>e.type).join(',')}]`);
}

// PERF-07: getAvailableCards() allocates on every draft. Could cache with a dirty flag,
// but since it's called once per room clear (not every frame), it's acceptable as-is.
function getAvailableCards() {
  const owned = deckManager.collection;
  const unlockedTier = meta.getUnlockedTier();
  // Pact cards scale their effect by ally count, so in solo they're inert or
  // outright useless. Hide them from draft/shop unless at least one ally is
  // present (local co-op P2 or a remote peer).
  const isMP = !!(players && players.count > 1);
  return Object.keys(CardDefinitions).filter(id => {
    if (owned.includes(id)) return false;
    const def = CardDefinitions[id];
    if (def.pact && !isMP) return false;
    // Bonus cards require bonus card unlock OR mastery unlock
    if (def.bonusCard) {
      if (meta.isBonusCardUnlocked(id)) return true;
      if (meta.isMasteryCardUnlocked(id)) return true;
      return false;
    }
    // Non-bonus cards: check unlock tier (default 0 = always available)
    const cardTier = CARD_UNLOCK_TIERS[id] || 0;
    return cardTier <= unlockedTier;
  });
}

function generateDraft() {
  const available = getAvailableCards();
  // Fisher-Yates partial shuffle — O(k) instead of O(N log N) sort (BUG-05: seeded RNG)
  const rng = runManager.getRng();
  const k = Math.min(3, available.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (available.length - i));
    const tmp = available[i]; available[i] = available[j]; available[j] = tmp;
  }
  draftChoices = available.slice(0, k);
  console.log(`[Draft] Offering: [${draftChoices.join(', ')}] (${available.length} avail)`);
  if (draftChoices.length === 0) return false;
  return true;
}

function tryAddCard(cardId, onSuccess) {
  const result = deckManager.addCard(cardId);
  if (result === 'full') {
    discardPendingCardId = cardId;
    discardReturnState = 'afterDiscard';
    gameState = 'discard';
    // Store callback as pending return action
    window._discardCallback = onSuccess;
    return false;
  }
  // Mirror the add to the peer so their deckManager stays consistent.
  _broadcastDeckAdd(cardId);
  if (onSuccess) onSuccess();
  return true;
}

function pickDraft(idx) {
  if (idx >= draftChoices.length) return;
  const cardId = draftChoices[idx];
  console.log(`[Draft] Picked "${cardId}"`);
  tryAddCard(cardId, () => {
    // After draft — offer item reward every other room, upgrade every 3 rooms
    if (roomsCleared % 2 === 0) {
      itemChoices = itemManager.generateChoices(3, selectedCharId, players.count > 1);
      if (itemChoices.length > 0) { gameState = 'itemReward'; ui.resetItemReward(); return; }
    }
    if (roomsCleared > 0 && roomsCleared % 3 === 0) {
      upgradeChoices = deckManager.getUpgradeChoices();
      if (upgradeChoices.length > 0) { gameState = 'upgrade'; return; }
    }
    gameState = 'map';
  });
}

function checkRunUnlocks(won) {
  meta.recordRun(won, runManager.floor);
  meta.recordCharRun(selectedCharId, won, runManager.floor);
  newUnlocks = [];

  // Character mastery unlock
  if (selectedCharId) {
    const newMasteryLevel = meta.incrementMastery(selectedCharId);
    if (newMasteryLevel > 0) {
      const charDef = Characters[selectedCharId];
      const cardId = charDef && charDef.masteryCards && charDef.masteryCards[newMasteryLevel - 1];
      if (cardId && meta.unlockMasteryCard(cardId)) {
        const cardName = CardDefinitions[cardId]?.name || cardId;
        newUnlocks.push(`${charDef.name} Mastery Lv${newMasteryLevel}: Unlocked "${cardName}"`);
      }
    }
  }
  if (runManager.floor >= 2 && meta.unlockCharacter('shadow')) {
    newUnlocks.push('Unlocked character: SHADOW');
  }
  if (totalHealedThisRun >= 10 && meta.unlockCharacter('frost')) {
    newUnlocks.push('Unlocked character: FROST');
  }
  if (runManager.floor >= 3 && meta.unlockCharacter('echo')) {
    newUnlocks.push('Unlocked character: ECHO');
  }
  if (won && meta.unlockCharacter('wraith')) {
    newUnlocks.push('Unlocked character: WRAITH');
  }
  if (won && selectedDifficulty >= 1 && meta.unlockCharacter('vanguard')) {
    newUnlocks.push('Unlocked character: VANGUARD');
  }
  if (won) {
    const currentMax = meta.getMaxDifficulty(selectedCharId);
    if (selectedDifficulty >= currentMax && currentMax < 2) {
      meta.unlockDifficulty(selectedCharId, currentMax + 1);
      newUnlocks.push(`Unlocked ${DIFFICULTY_NAMES[currentMax + 1]} difficulty for ${Characters[selectedCharId].name}`);
    }
    const bonusPool = ['chain_lightning', 'thunder_clap', 'phantom_step', 'blood_pact', 'iron_wall', 'execute', 'tempo_surge', 'shadow_mark', 'second_wind', 'adrenaline', 'smoke_screen', 'glass_cannon', 'reaper',
      'earthshaker', 'death_blow', 'berserkers_oath', 'last_stand', 'mirror_strike', 'deaths_bargain', 'resonant_pulse', 'snipers_mark', 'leech_field', 'soul_drain', 'marked_for_death',
      'sunbeam', 'tempo_blade_beam', 'volatile_rune_trap', 'death_spiral', 'lightning_arc_chan', 'crash_rune', 'resonance_rune', 'blood_rune', 'time_bomb', 'judgment_line', 'riposte_blade_counter', 'perfect_guard', 'death_sentence_counter', 'tempo_shift_stance'];
    for (const cid of bonusPool) {
      if (!meta.isBonusCardUnlocked(cid)) {
        meta.unlockBonusCard(cid);
        newUnlocks.push(`Unlocked card: ${CardDefinitions[cid].name}`);
        break;
      }
    }
  }

  // Cross-run achievement unlocks
  if (won && noDashCardsUsedThisRun && meta.setAchievement('win_no_dash')) {
    // Unlock cursed cards pool
    const cursedPool = ['soul_siphon', 'void_hex', 'cursed_spiral', 'forbidden_surge'];
    for (const cid of cursedPool) {
      if (!meta.isBonusCardUnlocked(cid)) {
        meta.unlockBonusCard(cid);
        newUnlocks.push(`Achievement: No-Dash Win! Unlocked cursed card: ${CardDefinitions[cid]?.name || cid}`);
      }
    }
  }
  if (runStats.perfectDodges >= 15 && meta.setAchievement('dodge_master')) {
    newUnlocks.push('Achievement: Dodge Master (15 perfect dodges in one run)!');
  }
  if (runStats.highestCombo >= 10 && meta.setAchievement('combo_king')) {
    newUnlocks.push('Achievement: Combo King (10+ hit combo)!');
  }

  if (newUnlocks.length > 0) console.log('[Meta] Unlocks:', newUnlocks);
}

function handleCombatClear() {
  if (!player.alive) return; // Player died in same frame — skip room clear
  _fadeAlpha = 0; // defensive reset — clears any residual dark overlay
  roomsCleared++;
  runStats.roomsCleared = roomsCleared;
  _showScoreTicker();
  // IDEA-08: clear fortify buff after room clear
  if (player) player._fortifyBuff = false;
  console.log(`[Combat] Cleared! Total: ${roomsCleared}`);
  audio.silenceMusic();
  audio.playBGM('map');

  // Gold reward for room clear
  if (currentCombatNode && currentCombatNode.type === 'boss') meta.addGold(25);
  else if (currentCombatNode && currentCombatNode.type === 'elite') meta.addGold(12);
  else meta.addGold(5);

  // IDEA-12: assign new curse for Brutal mode on floor advance.
  // NET: always consume the RNG value even below Brutal so host and client
  // stay in lock-step — the seed stream must match on both ends regardless
  // of host's chosen difficulty.
  {
    const curseRoll = Math.floor(runManager.getRng()() * BRUTAL_CURSES.length);
    if (selectedDifficulty >= 2) currentFloorCurse = BRUTAL_CURSES[curseRoll];
  }

  if (currentCombatNode && currentCombatNode.type === 'boss') {
    if (runManager.floor >= FLOORS_TO_WIN) {
      console.log('[Run] VICTORY! All floors cleared.');
      runStats.won = true;
      runStats.floor = runManager.floor;
      runStats.finalDeck = [...deckManager.collection];
      checkRunUnlocks(true);
      if (selectedDifficulty >= 2) meta.recordHardWin();
      gameState = 'victory';
      _victoryAnimStart = null;
      _victoryReady = false;
      events.emit('PLAY_SOUND', 'victoryFanfare');
      audio.silenceMusic();
      // Tell clients the run is won
      if (net.role === 'host' && net.peers.size > 0) {
        net.sendReliable('evt', { type: 'ROOM_CLEARED', isVictory: true, nextState: 'victory', floor: runManager.floor });
      }
      input.clearFrame();
      currentCombatNode = null;
      return;
    }
    runManager.floor++;
    _pendingFloorBanner = runManager.floor;
    console.log(`[Run] Floor cleared! Now Floor ${runManager.floor}`);
    runManager.generateMap();
    // RH2: re-pick biome for the new floor so palette updates per zone
    currentBiome = pickBiomeForFloor(runManager.floor, runManager.getRng());
    window._biome = currentBiome;
    if (room) room.biome = currentBiome;
  }
  currentCombatNode = null;

  if (gameState === 'playing') {
    if (generateDraft()) {
      gameState = 'draft';
      _draftRevealTimer = 0;
      _draftRevealMax = draftChoices.length;
      _fadeAlpha = 0.6; _fadeDir = -1;
    } else {
      gameState = 'map';
      _fadeAlpha = 0.6; _fadeDir = -1;
    }
    // Sync state transition to all clients
    if (net.role === 'host' && net.peers.size > 0) {
      net.sendReliable('evt', {
        type: 'ROOM_CLEARED', isVictory: false, nextState: gameState, floor: runManager.floor,
        // Belt-and-suspenders RNG snap after curse roll / generateMap /
        // pickBiomeForFloor / generateDraft have all run on host. Any
        // accidental divergence during those is corrected here so the
        // next round starts lockstep.
        rngState: runManager.getRngState(),
      });
    }
  }
}

function _fireSigil(s) {
  const { x, y, def, dmg } = s;
  particles.spawnRing(x, y, def.sigilAoE || 150, def.color || '#ff4400');
  particles.spawnBurst(x, y, def.color || '#ff4400');
  events.emit('PLAY_SOUND', 'crash');
  switch (def.sigilTrigger) {
    case 'enterHot':
    case 'crash': {
      // BUG-11/PERF-05: hoist squared range threshold out of loop
      const aoe2 = (def.sigilAoE || 150) ** 2;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx*dx+dy*dy < aoe2) combat.applyDamageToEnemy(e, dmg);
      }
      if (def.id === 'crash_rune') {
        events.emit('SPAWN_ORBS', { count: 4, radius: 80, damage: 12, life: 3.0, speed: 3.5, color: '#ff2200', freeze: 0, spiral: false });
      }
      break;
    }
    case 'enterCold': {
      // BUG-11/PERF-05: hoist squared range threshold out of loop
      const coldAoe2 = (def.sigilAoE || 200) ** 2;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx*dx+dy*dy < coldAoe2) e.stagger(def.sigilFreeze || 2.5);
      }
      break;
    }
    case 'resonance': {
      player._resonanceActive = 3.0;
      particles.spawnDamageNumber(x, y - 30, 'RESONANCE!');
      break;
    }
  }
  events.emit('SCREEN_SHAKE', { duration: 0.3, intensity: 0.5 });
}

function _fireChannelTick(ch, dmgMult) {
  const def = ch.def;
  const dmg = Math.round(def.tickDamage * dmgMult);
  const range = def.channelRange || 120;
  tempo._add(def.tempoShift || 2);
  switch (def.channelType) {
    case 'cone': {
      const adx = input.mouse.x - player.x, ady = input.mouse.y - player.y;
      const alen = Math.sqrt(adx*adx+ady*ady) || 1;
      const nx = adx/alen, ny = ady/alen;
      for (const e of enemies) {
        if (!e.alive) continue;
        const ex = e.x - player.x, ey = e.y - player.y;
        const proj = ex*nx + ey*ny;
        if (proj < 0 || proj > range) continue;
        const perp = Math.abs(ex*ny - ey*nx);
        if (perp < 40 + e.r) {
          combat.applyDamageToEnemy(e, dmg);
          particles.spawnBurst(e.x, e.y, '#ff5500');
        }
      }
      particles.spawnBurst(player.x + nx*range*0.6, player.y + ny*range*0.6, '#ff550088');
      break;
    }
    case 'arc': {
      let nearest = null, nearestDist2 = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const d2 = dx*dx+dy*dy;
        const threshold = range + e.r;
        if (d2 < threshold * threshold && d2 < nearestDist2) { nearest = e; nearestDist2 = d2; }
      }
      if (nearest) {
        combat.applyDamageToEnemy(nearest, dmg);
        particles.spawnSlash(player.x, player.y, nearest.x, nearest.y, '#ffff44');
        // Chain to secondary
        let secondary = null, sDist2 = Infinity;
        for (const e of enemies) {
          if (!e.alive || e === nearest) continue;
          const dx = e.x - nearest.x, dy = e.y - nearest.y;
          const d2 = dx*dx+dy*dy;
          if (d2 < 150*150 && d2 < sDist2) { secondary = e; sDist2 = d2; }
        }
        if (secondary) {
          combat.applyDamageToEnemy(secondary, Math.round(dmg * 1.5));
          particles.spawnSlash(nearest.x, nearest.y, secondary.x, secondary.y, '#ffff88');
        }
      }
      break;
    }
    case 'drain': {
      const adx = input.mouse.x - player.x, ady = input.mouse.y - player.y;
      const alen = Math.sqrt(adx*adx+ady*ady) || 1;
      const nx = adx/alen, ny = ady/alen;
      for (const e of enemies) {
        if (!e.alive) continue;
        const ex = e.x - player.x, ey = e.y - player.y;
        const proj = ex*nx + ey*ny;
        if (proj < 0 || proj > range) continue;
        const perp = Math.abs(ex*ny - ey*nx);
        if (perp < 12 + e.r) {
          combat.applyDamageToEnemy(e, dmg);
          tempo._add(3);
          particles.spawnBurst(e.x, e.y, '#cc44cc');
        }
      }
      particles.spawnBurst(player.x + nx*range*0.5, player.y + ny*range*0.5, '#cc44cc88');
      break;
    }
  }
}

function handleEvent(choiceIdx) {
  // Events are per-player picks. HP changes apply to the caller only and
  // propagate via PLAYER_HP broadcast. Shared-deck mutations are mirrored
  // via DECK_CARD_* events. Relics are per-player, no sync needed.
  if (currentEventType === 'merchant') {
    switch (choiceIdx) {
      case 0: // Sell oldest card for +3 HP
        if (deckManager.collection.length > 1) {
          const sold = deckManager.collection[0];
          deckManager.removeCard(sold);
          _broadcastDeckRemove(sold);
          player.heal(3);
          particles.spawnDamageNumber(player.x || 640, 300, `Sold "${CardDefinitions[sold]?.name || sold}" +3 HP`);
          events.emit('PLAY_SOUND', 'upgrade');
        }
        break;
      case 1: // Trade 1 HP → relic
        if (player.hp > 1) {
          player.hp--;
          const choices = itemManager.generateChoices(1, selectedCharId, players.count > 1);
          if (choices.length > 0) {
            itemManager.add(choices[0], player, tempo);
            runStats.itemsCollected++;
            events.emit('PLAY_SOUND', 'itemPickup');
            particles.spawnDamageNumber(player.x || 640, 300, `Got: ${ItemDefinitions[choices[0]].name}`);
          }
        }
        break;
      case 2: break; // pass
    }
  } else if (currentEventType === 'blacksmith') {
    switch (choiceIdx) {
      case 0: // Free upgrade
        upgradeChoices = deckManager.getUpgradeChoices();
        if (upgradeChoices.length > 0) { gameState = 'upgrade'; return; }
        break;
      case 1: // Forge warmth — heal 1 HP
        player.heal(1);
        break;
      case 2: break; // pass
    }
  } else {
    // Standard event
    switch (choiceIdx) {
      case 0: // Trade 1 HP → random relic
        if (player.hp > 1) {
          player.hp--;
          const choices = itemManager.generateChoices(1, selectedCharId, players.count > 1);
          if (choices.length > 0) {
            itemManager.add(choices[0], player, tempo);
            runStats.itemsCollected++;
            events.emit('PLAY_SOUND', 'itemPickup');
            particles.spawnDamageNumber(player.x || 640, 300, `Got: ${ItemDefinitions[choices[0]].name}`);
          }
        }
        break;
      case 1: // Heal 2 HP
        player.heal(2);
        break;
      case 2: // Gamble — picker-only outcome.
        // NOTE: uses Math.random here instead of the seeded RNG because
        // only the picker rolls; consuming seeded RNG would desync the
        // peer's stream (they never roll this value on their side).
        // Payout tuned so gamble isn't strictly dominated by rest (+2):
        // peak heal is 2× rest, the floor is a shallow -1.
        if (Math.random() < 0.5) { player.heal(4); }
        else { player.hp = Math.max(1, player.hp - 1); }
        break;
    }
  }
  gameState = 'map';
}

// RH2: out-of-combat healing (rest nodes, events) heals every alive LOCAL
// co-op player. Remote placeholders are skipped — the owning side will heal
// its own player (after the vote resolves on both sides) and sync HP back
// through PLAYER_HP broadcasts. If we healed placeholders here, we'd race
// the broadcast and briefly show the wrong HP to the teammate.
function healAllPlayers(amt) {
  for (const p of players.list) {
    if (p && p.alive && !p._isRemote) p.heal(amt);
  }
}

// Track healing for Frost unlock
const origHeal = Player.prototype.heal;
Player.prototype.heal = function(amt) {
  const before = this.hp;
  origHeal.call(this, amt);
  totalHealedThisRun += (this.hp - before);
};

// ── UPDATE ──────────────────────────────────────────────────────
function buildEquippedCosmetics(eq) {
  if (!eq) return null;
  return {
    bodyDef:    CosmeticById[eq.bodyColor]   || null,
    outlineDef: CosmeticById[eq.outlineColor]|| null,
    shapeDef:   CosmeticById[eq.shape]       || null,
    trailDef:   CosmeticById[eq.trail]       || null,
    flashDef:   CosmeticById[eq.flash]       || null,
    burstDef:      CosmeticById[eq.deathBurst]  || null,
    auraDef:       CosmeticById[eq.aura]        || null,
    killEffectDef: CosmeticById[eq.killEffect]  || null,
    titleDef:      CosmeticById[eq.title]       || null,
  };
}

// Runs on every update() tick. Detects `gameState` transitions and drives
// the multiplayer handshake flags (PHASE_DONE, prep-ready reset, map-vote
// reset, combat-entry reset). MUST run in every state, not just 'playing',
// or flags stall when the local player is on draft / itemReward / shop /
// upgrade screens.
// Broadcast the local player's HP to peers whenever it changes. Runs every
// frame but only sends on a delta, so we're not flooding the reliable
// channel — HP only changes on hit, heal, revive, rest, shop purchase, etc.
let _lastHpBroadcast = { hp: -1, maxHp: -1, alive: null, downed: null };
function _broadcastLocalHp() {
  if (net.role === 'solo' || net.peers.size === 0) return;
  if (!player) return;
  // Include `downed` so the wipe detector on the other side doesn't need
  // the separate PLAYER_DOWNED event to arrive first — crucial when both
  // players go down in the same frame (the discrete event race could
  // otherwise leave one side believing its teammate is still alive).
  if (_lastHpBroadcast.hp === player.hp &&
      _lastHpBroadcast.maxHp === player.maxHp &&
      _lastHpBroadcast.alive === player.alive &&
      _lastHpBroadcast.downed === !!player.downed) return;
  _lastHpBroadcast.hp    = player.hp;
  _lastHpBroadcast.maxHp = player.maxHp;
  _lastHpBroadcast.alive = player.alive;
  _lastHpBroadcast.downed = !!player.downed;
  net.sendReliable('evt', {
    type: 'PLAYER_HP',
    hp: player.hp, maxHp: player.maxHp, alive: player.alive,
    downed: !!player.downed,
  });
}

// Broadcast the local player's AP (budget) so the co-op summary panel's
// teammate AP bar actually updates. AP regenerates every frame, so send
// only when the integer pip count or maxBudget changes — that keeps the
// reliable channel quiet (a few sends per fight, not 60/sec).
let _lastApBroadcast = { pip: -1, maxBudget: -1 };
function _broadcastLocalAp() {
  if (net.role === 'solo' || net.peers.size === 0) return;
  if (!player) return;
  const pip = Math.floor(player.budget || 0);
  const mb = player.maxBudget || 0;
  if (_lastApBroadcast.pip === pip && _lastApBroadcast.maxBudget === mb) return;
  _lastApBroadcast.pip = pip;
  _lastApBroadcast.maxBudget = mb;
  net.sendReliable('evt', { type: 'PLAYER_AP', budget: pip, maxBudget: mb });
}

function _syncNetPhase() {
  if (_prevSyncState === gameState) {
    // Defensive: if we're sitting on the map and somehow _localPhaseDone
    // is still false, re-signal done. Landing on map IS the signal that
    // our post-combat decisions are complete — don't let a missed
    // transition strand the player with the "waiting for items" banner.
    if (gameState === 'map' && !_localPhaseDone) {
      if (net.role !== 'solo' && net.peers.size > 0) {
        net.sendReliable('evt', { type: 'PHASE_DONE' });
      }
      _localPhaseDone = true;
    }
    return;
  }
  const decisionPhases = ['draft', 'itemReward', 'shop', 'rest', 'event', 'discard', 'upgrade'];
  // Arrived at the map — our post-combat decisions are done. Always signal
  // PHASE_DONE on entering map (except from 'paused' which is a resume).
  // This is more forgiving than the old "only from combat chain" check
  // which could miss edge-case transitions and leave the click gate stuck.
  if (gameState === 'map' && _prevSyncState !== 'paused') {
    if (net.role !== 'solo' && net.peers.size > 0) {
      net.sendReliable('evt', { type: 'PHASE_DONE' });
    }
    _localPhaseDone = true;
  }
  // Entering combat resets both flags — there's a fresh decision phase coming after.
  if (gameState === 'prep' || gameState === 'playing') {
    _localPhaseDone = false;
    _remotePhaseDone = false;
    _remotePhaseDoneByPeer.clear();
  }
  // Entering prep clears OUR ready flag for this round. Per-peer ready
  // state is event-driven and only cleared in _startCombatNow — that
  // prevents losing a peer's PREP_READY that arrived before we transitioned.
  if (gameState === 'prep' && _prevSyncState !== 'prep') {
    _prepReadyLocal = false;
  }
  // Entering map clears any prior votes — fresh decision per map screen.
  if (gameState === 'map' && _prevSyncState !== 'map') {
    _localMapVote = null;
    _remoteMapVote = null;
    _remoteMapVoteByPeer.clear();
    if (_pendingFloorBanner) {
      _showFloorBanner(_pendingFloorBanner);
      _pendingFloorBanner = 0;
    }
  }
  // Entering rest clears the prior round's vote so a stale vote from a
  // previous rest node can't auto-resolve the new screen.
  if (gameState === 'rest' && _prevSyncState !== 'rest') {
    _localRestVote = null;
    _remoteRestVote = null;
    _remoteRestVoteByPeer.clear();
  }
  _prevSyncState = gameState;
}

function update(logicDt, realDt) {
  runStats.elapsedTime += realDt;
  // Detect screen transitions so menu handlers can snap the gamepad cursor
  // onto a sensible default on first frame. We snapshot the previous state
  // here before any handler runs, and refresh the tracker so next frame's
  // check sees this frame's resolved state.
  const _justEnteredMenu = _prevMenuGameState !== gameState;
  _prevMenuGameState = gameState;
  // MUST run before any early-return handlers so transitions like
  // itemReward → map correctly fire PHASE_DONE.
  _syncNetPhase();
  _broadcastLocalHp();
  _broadcastLocalAp();
  // Poll Xbox / standard gamepads each frame so they feed key & mouse state.
  // Per-slot enable comes from MetaProgress (toggled in char select).
  // `inMenu` switches P1's B button from dodge to 'escape' (back) in non-
  // gameplay states so menu navigation doesn't require finding the tiny
  // Back/Select button on an Xbox pad.
  const _menuStates = ['intro','charSelect','lobby','map','prep','draft','itemReward','shop','upgrade','event','rest','discard','stats','paused','tutorial','cosmeticShop','cosmeticPanel','victory'];
  input.pollGamepads({
    enabledP1: meta.isGamepadEnabled(0),
    enabledP2: meta.isGamepadEnabled(1),
    localCoop,
    inMenu: _menuStates.indexOf(gameState) !== -1,
  });

  // Per-player gamepad flag — lets player.js pick dodge direction from current
  // movement (feels right on stick) instead of toward the cursor (mouse-style).
  if (player) player._gamepadControlled = input.isGamepadActive(0);
  if (players && players.count > 1) {
    const _p2 = players.list[1];
    if (_p2 && !_p2._isRemote) _p2._gamepadControlled = input.isGamepadActive(1);
  }

  // Gamepad auto-aim for P1 while in combat. When the right stick is idle we
  // drift the cursor toward the locked target; moving the stick returns to
  // manual aim immediately. RT (btn 7) cycles to the next nearest enemy, LT
  // (btn 6) cycles to the previous one. This mirrors the P2 auto-aim idea
  // (see Input.updateP2Reticle) without replacing the cursor-driven aim.
  if (gameState === 'playing' && meta.isGamepadEnabled(0) && input.isGamepadConnected(0) && player && player.alive) {
    const gp = input.getGamepadState(0);
    const btns = gp.btns || [];
    const pBtns = _gpAimBtns;
    const rMag2 = gp.rx * gp.rx + gp.ry * gp.ry;
    const manual = rMag2 > 0.04;
    if (manual) {
      _gpAimTargetId = null;   // manual stick overrides any lock
    } else {
      // Cycle target on RT / LT edge — buttons come in on the current frame
      // via _gpAimBtns so we can edge-trigger without consuming justPressed.
      const cycleNext = btns[7] && !pBtns[7];
      const cyclePrev = btns[6] && !pBtns[6];
      const alive = [];
      for (const e of enemies) if (e.alive && !e._dying) alive.push(e);
      if (alive.length > 0) {
        // Sort by distance from the player so "next" means "next-further".
        alive.sort((a, b) => {
          const da = (a.x - player.x) * (a.x - player.x) + (a.y - player.y) * (a.y - player.y);
          const db = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y);
          return da - db;
        });
        let curIdx = alive.findIndex(e => e.id === _gpAimTargetId);
        if (cycleNext) curIdx = (curIdx < 0 ? 0 : (curIdx + 1) % alive.length);
        else if (cyclePrev) curIdx = (curIdx <= 0 ? alive.length - 1 : curIdx - 1);
        else if (curIdx < 0) curIdx = 0;   // default to nearest
        const target = alive[curIdx];
        _gpAimTargetId = target && target.id;
        if (target) {
          const lerp = Math.min(1, realDt * 10);
          input.mouse.x += (target.x - input.mouse.x) * lerp;
          input.mouse.y += (target.y - input.mouse.y) * lerp;
          if (realDt > 0) input._syncDomCursor();
        }
      } else {
        _gpAimTargetId = null;
      }
    }
    // Always snapshot buttons so an edge trigger that happened during manual
    // aim isn't replayed the frame the stick is released.
    _gpAimBtns = btns.slice();
  } else {
    _gpAimTargetId = null;
    _gpAimBtns = [];
  }

  // RTT heartbeat + liveness probe. Host pings every 1 s during pre-run
  // (lobby/charSelect) so a vanished peer is evicted within ~5 s; every
  // 2 s during runs to save bandwidth. Receiver always echoes with PONG.
  // Solo / no-peer skips entirely.
  const _prerun = gameState === 'lobby' || gameState === 'charSelect';
  if (net.role === 'host' && net.peers.size > 0) {
    _rttPingTimer -= realDt;
    if (_rttPingTimer <= 0) {
      _rttPingTimer = _prerun ? 1.0 : 2.0;
      // Seed the last-pong map for peers we haven't heard from yet so a
      // peer that joined mid-charSelect isn't immediately evicted on the
      // first watchdog tick before any PONG could possibly have arrived.
      const nowMs = performance.now();
      for (const [pid] of net.peers) {
        if (!_lastPongByPeer.has(pid)) _lastPongByPeer.set(pid, nowMs);
      }
      net.sendReliable('evt', { type: 'PING', t: nowMs });
    }
    // Sync heartbeat — host broadcasts authoritative run state so each client
    // can tell whether it has silently fallen behind (missed a ROOM_CLEARED,
    // MAP_NODE_CHOSEN, or similar transition event). Runs during in-run
    // states only, where gameState transitions matter.
    if (!_prerun) {
      _syncHeartbeatAccum += realDt;
      if (_syncHeartbeatAccum >= 3.0) {
        _syncHeartbeatAccum = 0;
        net.sendReliable('evt', {
          type: 'SYNC_HEARTBEAT',
          state: gameState,
          floor: runManager.floor | 0,
          roomsCleared: roomsCleared | 0,
          enemiesAlive: gameState === 'playing' ? enemies.reduce((a, e) => a + (e && e.alive ? 1 : 0), 0) : 0,
        });
      }
    } else {
      _syncHeartbeatAccum = 0;
    }
    // Watchdog: check every ~500ms for peers that have gone silent. This
    // is the backstop for all the ways a peer can disappear without the
    // WebRTC stack ever telling us: tab crash, sleeping laptop, process
    // killed, OS-level network drop. Without it the host can stay on
    // "WAITING FOR P2…" indefinitely.
    _pongCheckAccum += realDt;
    if (_pongCheckAccum >= 0.5) {
      _pongCheckAccum = 0;
      const nowMs = performance.now();
      const deadPeers = [];
      for (const [pid, peer] of net.peers) {
        // Fast path: if the evt DataChannel is already closed, the peer is
        // gone right now — don't wait on the PONG timer. This catches the
        // common cases (remote called pc.close(), remote tab disappeared)
        // in ~0 ms instead of 7 s.
        const dcState = peer?.evtDc?.readyState;
        if (dcState === 'closed' || dcState === 'closing') {
          deadPeers.push(pid);
          continue;
        }
        const last = _lastPongByPeer.get(pid);
        if (last != null && nowMs - last > PONG_TIMEOUT_MS) deadPeers.push(pid);
      }
      for (const pid of deadPeers) {
        console.log(`[Net] watchdog evicting peer ${pid}`);
        _lastPongByPeer.delete(pid);
        // Synthesize a peer-leave event through the Net instance so the
        // existing 'peer leave' handler runs and cleans up UI state.
        try { net._cfRemovePeer?.(pid); } catch {}
        // Trystero path (no _cfRemovePeer) or cases where the peer entry
        // is already gone but we still need the handler to fire.
        if (net.peers.has(pid)) {
          net.peers.delete(pid);
          net._dispatch?.('peer', { kind: 'leave', peerId: pid }, pid);
        }
      }
    }
  } else {
    // Reset watchdog state whenever we're not actively hosting so a future
    // host cycle starts fresh.
    if (_lastPongByPeer.size > 0) _lastPongByPeer.clear();
    _pongCheckAccum = 0;
  }
  // Client-side liveness: the host pings us on a steady cadence (1 s
  // pre-run, 2 s in-run). If no PING arrives for CLIENT_HOST_TIMEOUT_MS we
  // assume the host vanished and synthesize a peer-leave so the existing
  // handler tears the session down. Mirrors the host-side watchdog so
  // the "stuck at hero select" state can't persist on either side.
  if (net.role === 'client' && net.peers.size > 0) {
    // Seed on first frame we're a client with peers so a brand-new session
    // doesn't immediately time out before the first PING round-trip.
    if (_lastHostPingAt === 0) _lastHostPingAt = performance.now();
    if (performance.now() - _lastHostPingAt > CLIENT_HOST_TIMEOUT_MS) {
      console.log('[Net] client-side watchdog: host silent — tearing session down');
      _lastHostPingAt = 0;
      for (const [pid] of [...net.peers]) {
        try { net._cfRemovePeer?.(pid); } catch {}
        if (net.peers.has(pid)) {
          net.peers.delete(pid);
          net._dispatch?.('peer', { kind: 'leave', peerId: pid }, pid);
        }
      }
    }
  } else {
    _lastHostPingAt = 0;
  }
  // Pre-run lobby-state watchdog. Belt-and-suspenders fallback: if we're
  // at lobby or charSelect with a remote role but no peers remain, and
  // the popup hasn't been raised yet, raise it here. Covers any edge case
  // where the peer-leave event was lost, fired on a different gameState,
  // or didn't run for any reason. Also tracks peer-count drops for peers
  // that joined and left inside a single event tick (we remember the
  // peak peer count so a transient 1→0 is treated as someone leaving).
  if (gameState === 'lobby' || gameState === 'charSelect') {
    const curPeers = net.peers.size;
    if (curPeers > _lobbyPeakPeerCount) _lobbyPeakPeerCount = curPeers;
    const hadPeer = _lobbyPeakPeerCount > 0;
    const noPeersNow = curPeers === 0;
    const stillRemoteRole = net.role !== 'solo';
    if (hadPeer && noPeersNow && stillRemoteRole && !_hsDisconnectPopup) {
      console.log(`[Lobby] watchdog firing: peak=${_lobbyPeakPeerCount} cur=${curPeers} role=${net.role} gameState=${gameState} — raising popup`);
      _remoteReady = false;
      _clientReady = false;
      _hsDisconnectPopup = true;
      _hsDisconnectMode = 'menu';
      _hsDisconnectReason = net.role === 'client' ? 'host disconnected' : 'left the session';
      _hsDisconnectAutoCloseAt = performance.now() + 30000;
      lobbyStatusMsg = net.role === 'client'
        ? 'Host disconnected'
        : 'Remote lobby ended — a player left';
      try { net.disconnect(); } catch {}
      net.role = 'solo';
      _lobbyPeers = [];
      if (gameState === 'lobby') lobbyMode = 'menu';
      players.list = players.list.filter(p => !p._isRemote);
      if (player) player._coopMode = false;
    }
  } else {
    _lobbyPeakPeerCount = 0;
  }
  // Network debug HUD toggle (Ctrl+N) and 1Hz rate computation
  if ((input.keys.has('control') || input.keys.has('meta')) && input.consumeKey('n')) {
    _netDebugVisible = !_netDebugVisible;
  }
  // Profile overlay toggle (Ctrl+P)
  if ((input.keys.has('control') || input.keys.has('meta')) && input.consumeKey('p')) {
    _profileVisible = !_profileVisible;
  }
  _netDebugRateAccum += realDt;
  if (_netDebugRateAccum >= 1.0) {
    const s = net.stats();
    // Approximate snap vs evt split from total counts (snap is by far the higher-frequency one)
    _netDebugRate.allOut = s.msgsOut - _netDebugSnapsOutPrev;
    _netDebugRate.allIn  = s.msgsIn  - _netDebugSnapsInPrev;
    _netDebugSnapsOutPrev = s.msgsOut;
    _netDebugSnapsInPrev  = s.msgsIn;
    _netDebugRateAccum = 0;
  }

  // Set cosmetic context for this frame (used by player.js trail + draw)
  if (selectedCharId && meta.cosmeticsUnlocked()) {
    const eq = meta.getEquipped(selectedCharId);
    window._equippedCosmetics = buildEquippedCosmetics(eq);
  } else {
    window._equippedCosmetics = null;
  }

  // Apply slow-mo
  if (slowMoTimer > 0) {
    slowMoTimer -= realDt;
    logicDt *= slowMoScale;
  }
  if (lastKillSlowTimer > 0) {
    lastKillSlowTimer -= realDt;
    logicDt *= 0.3;
  }

  // Player death animation — checked BEFORE state handlers so it fires even if gameState
  // was changed mid-frame (e.g. handleCombatClear firing in the same frame the player died).
  if (playerDeathTimer > 0) {
    playerDeathTimer -= realDt;
    // Visual refresh 3.14: death-cam slow-mo
    slowMoScale = 0.3;
    slowMoTimer = 0.5;
    if (playerDeathTimer <= 0) {
      gameState = 'stats';
      statsInputDelay = 0;
    }
    input.clearFrame();
    return;
  }

  // Disconnect popup intercepts ALL gameplay input. Centralised here so the
  // popup behaves identically whether it was raised from intro / charSelect /
  // lobby (the original sites) or from an in-run state (map / draft / playing
  // / shop / etc) where the per-state input handlers used to never see it.
  // This is what fixes "the others go back to main menu without seeing why" —
  // the popup is now blocking on the intro screen we route them to instead
  // of being silently consumed by the next click on the menu.
  if (_hsDisconnectPopup) {
    _handleHsDisconnectInput();
    input.clearFrame();
    return;
  }

  // ── INTRO ──
  if (gameState === 'intro') {
    // D-pad focus nudge (gamepad menu nav). Must run before consumeClick so
    // the user can tap D-pad to move onto a button, then A to click.
    // (Disconnect popup is intercepted globally above the state dispatch.)
    if (_gpHandleMenuNav(introBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('enter')) {
      audio.init();
      audio.playBGM('menu');
      gameState = 'charSelect';
    }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of introBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'continue' || b.action === 'mode_solo') {
            // Reset any lingering remote state from a prior Remote Play visit
            if (net.role !== 'solo') net.disconnect();
            net.role = 'solo';
            _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
            localCoop = false; audio.init(); audio.playBGM('menu'); gameState = 'charSelect';
          }
          else if (b.action === 'mode_local') {
            if (net.role !== 'solo') net.disconnect();
            net.role = 'solo';
            _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
            localCoop = true; audio.init(); audio.playBGM('menu'); gameState = 'charSelect';
          }
          else if (b.action === 'mode_remote') { localCoop = false; audio.init(); audio.playBGM('menu'); lobbyMode = 'menu'; lobbyJoinCode = ''; lobbyStatusMsg = 'Checking network…'; gameState = 'lobby';
            // RH2: warm Trystero CDN + WebRTC permissions immediately so the
            // banner shows real status rather than waiting until host-click.
            net.preflight().then(ok => {
              lobbyStatusMsg = ok
                ? '✓ Ready to host or join'
                : '⚠ Network unavailable — check internet';
            }).catch(() => { lobbyStatusMsg = '⚠ Network unavailable — check internet'; }); }
          else if (b.action === 'vol_down') { const v = Math.max(0, audio.getMasterVolume() - 0.1); audio.setMasterVolume(v); meta.setMasterVolume(v); }
          else if (b.action === 'vol_up')   { const v = Math.min(1, audio.getMasterVolume() + 0.1); audio.setMasterVolume(v); meta.setMasterVolume(v); }
          else if (b.action === 'reset_confirm') { introResetConfirm = true; }
          else if (b.action === 'reset_do') { meta.resetAll(); introResetConfirm = false; }
          else if (b.action === 'reset_cancel') { introResetConfirm = false; }
          else if (b.action === 'exit') { window.close(); }
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── COSMETIC SHOP ──
  if (gameState === 'cosmeticShop') {
    if (lootBoxOpen) {
      // Tick animation
      if (!lootBoxOpen.waitingDismiss) {
        lootBoxOpen.elapsed += realDt;
        const holdStart = lootBoxOpen.isSL ? 3.4 : 2.5;
        if (lootBoxOpen.elapsed >= holdStart) lootBoxOpen.waitingDismiss = true;
      } else if (input.consumeClick() || input.consumeKey('enter') || input.consumeKey(' ')) {
        lootBoxOpen = null;
      }
      input.clearFrame();
      return;
    }
    if (_gpHandleMenuNav(ui.cosmeticShopBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) { gameState = 'charSelect'; }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of ui.cosmeticShopBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'back') { gameState = 'charSelect'; break; }
          if (b.action === 'buy_box') {
            const tier = b.tier;
            const cost = BOX_TIERS[tier].cost;
            if (meta.spendGold(cost)) {
              const result = meta.openBox(tier);
              lootBoxOpen = { boxTier: tier, result, elapsed: 0, isSL: result.rarity === 'superleg', waitingDismiss: false };
              events.emit('PLAY_SOUND', 'upgrade');
            }
            break;
          }
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── COSMETIC PANEL ──
  if (gameState === 'cosmeticPanel') {
    if (_gpHandleMenuNav(ui.cosmeticPanelBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) { gameState = 'charSelect'; }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of ui.cosmeticPanelBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'back') { gameState = 'charSelect'; break; }
          if (b.action === 'tab') { cosmeticPanelTab = b.tab; break; }
          if (b.action === 'equip') {
            meta.equipCosmetic(cosmeticPanelCharId, b.category, b.cosmeticId);
            // Refresh cosmetic context immediately
            if (cosmeticPanelCharId === selectedCharId) {
              window._equippedCosmetics = buildEquippedCosmetics(meta.getEquipped(selectedCharId));
            }
            break;
          }
          if (b.action === 'unequip') {
            meta.equipCosmetic(cosmeticPanelCharId, b.category, null);
            if (cosmeticPanelCharId === selectedCharId) {
              window._equippedCosmetics = buildEquippedCosmetics(meta.getEquipped(selectedCharId));
            }
            break;
          }
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── CHARACTER SELECT ──
  if (gameState === 'charSelect') {
    // Disconnect popup is handled by the global intercept above the state
    // dispatch — the per-state branch is no longer needed.
    if (_gpHandleMenuNav(charSelectBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) {
      // In remote MP, the first ESC opens the confirm modal so the other
      // player doesn't get silently stranded. Second ESC cancels the modal.
      if (net.role !== 'solo' && net.peers.size > 0) {
        if (!_charSelectQuitConfirm) {
          _charSelectQuitConfirm = true;
          input.clearFrame();
          return;
        }
        // Already confirming → ESC cancels the confirm, stays on charSelect.
        _charSelectQuitConfirm = false;
        input.clearFrame();
        return;
      }
      gameState = 'intro';
      selectedCharId = null;
      audio.playBGM('menu');
      input.clearFrame();
      return;
    }
    if (input.consumeClick()) {
      const _prevSelectedChar = selectedCharId;
      const result = handleCharSelectClick(input.mouse.x, input.mouse.y);
      // Client switched to a different hero card — clear the local READY
      // flag so the button reverts from "WAITING FOR HOST…" to an actionable
      // "READY UP" and the host receives a matching un-ready via the
      // CHAR_SELECTED → _remoteReady=false path on the other end.
      if (result === 'selected' && net.role === 'client' && _clientReady && selectedCharId !== _prevSelectedChar) {
        _clientReady = false;
      }
      if (result === 'start' && selectedCharId) {
        if (net.role === 'host' && net.peers.size > 0) {
          // Re-broadcast peer indices right before GAME_STARTED so clients
          // that joined late (or that missed the earlier broadcast) pick the
          // correct slot when startNewRun() runs on their side.
          _hostBroadcastPeerIndices();
          net.sendReliable('evt', { type: 'GAME_STARTED', seed: lobby.seed, charId: selectedCharId, difficulty: selectedDifficulty });
        }
        startNewRun();
      }
      if (result === 'ready' && selectedCharId && net.role === 'client' && !_clientReady) {
        _clientReady = true;
        net.sendReliable('evt', { type: 'PLAYER_READY', charId: selectedCharId });
      }
      // Broadcast character selection so the remote peer can render the right placeholder
      if ((result === 'start' || result === 'selected') && selectedCharId && net.role !== 'solo') {
        net.sendReliable('evt', { type: 'CHAR_SELECTED', charId: selectedCharId });
      }
      if (result === 'mainMenu') {
        // In remote MP, show the same confirm flow as the in-run quit so
        // the player can't accidentally end the session with a stray click.
        if (net.role !== 'solo' && net.peers.size > 0 && !_charSelectQuitConfirm) {
          _charSelectQuitConfirm = true;
        } else {
          // Confirmed or solo: tear down any remote connection cleanly.
          if (net.role !== 'solo') {
            if (net.peers.size > 0) {
              try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'charSelect_back' }); } catch {}
              net.gracefulDisconnect();
            } else {
              net.disconnect();
            }
          }
          net.role = 'solo';
          _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
          _charSelectQuitConfirm = false;
          gameState = 'intro'; selectedCharId = null; audio.playBGM('menu');
        }
      }
    }
    if (input.consumeKey('d') && selectedCharId) {
      const maxD = meta.getMaxDifficulty(selectedCharId);
      selectedDifficulty = (selectedDifficulty + 1) % (maxD + 1);
    }
    // RH2: F2 toggles local 2-player co-op for the next run. Inert in
    // remote MP — the remote peer already occupies the second slot.
    if (input.consumeKey('f2') && net.role === 'solo') {
      localCoop = !localCoop;
      console.log('[RH2] Local co-op:', localCoop ? 'ON' : 'OFF');
    }
    input.clearFrame();
    return;
  }

  // ── TUTORIAL (RH2 #15) ──
  if (gameState === 'tutorial') {
    if (input.consumeKey('escape')) { gameState = 'charSelect'; input.clearFrame(); return; }
    if (input.consumeKey('arrowleft') || input.consumeKey('a')) tutorialPage = Math.max(0, tutorialPage - 1);
    if (input.consumeKey('arrowright') || input.consumeKey('d') || input.consumeKey(' ') || input.consumeKey('enter')) {
      tutorialPage = Math.min(_tutorialPageCount() - 1, tutorialPage + 1);
    }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      const w = canvas.width;
      if (mx < 180 && my < 60) { gameState = 'charSelect'; input.clearFrame(); return; }
      const btnY = canvas.height - 70;
      if (mx >= w/2 - 200 && mx <= w/2 - 40 && my >= btnY && my <= btnY + 50) tutorialPage = Math.max(0, tutorialPage - 1);
      if (mx >= w/2 + 40 && mx <= w/2 + 200 && my >= btnY && my <= btnY + 50) tutorialPage = Math.min(_tutorialPageCount() - 1, tutorialPage + 1);
    }
    input.clearFrame();
    return;
  }

  // ── LOBBY (remote co-op) ──
  if (gameState === 'lobby') {
    // Disconnect popup is intercepted globally above the state dispatch.
    if (_gpHandleMenuNav(lobbyBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) {
      if (lobbyMode === 'menu') {
        // Fully tear down any in-flight connection so the next charSelect
        // screen shows the 2P CO-OP button (gated on net.role === 'solo').
        if (net.role !== 'solo') {
          if (net.peers.size > 0) {
            try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'lobby_escape' }); } catch {}
            net.gracefulDisconnect();
          } else {
            net.disconnect();
          }
        }
        net.role = 'solo';
        _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
        gameState = 'charSelect'; input.clearFrame(); return;
      }
      // Backing out of hosting/joining returns to the lobby menu AND tears
      // down the half-connected session so the user can re-enter cleanly.
      if (net.role !== 'solo') {
        if (net.peers.size > 0) {
          try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'lobby_escape_submode' }); } catch {}
          net.gracefulDisconnect();
        } else {
          net.disconnect();
        }
        net.role = 'solo';
        _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
      }
      lobbyMode = 'menu'; lobbyJoinCode = ''; lobbyStatusMsg = '';
      input.clearFrame(); return;
    }
    // Text input for join code (alphanumeric, max 6, uppercase)
    if (lobbyMode === 'joining') {
      if (input.consumeKey('backspace')) {
        lobbyJoinCode = lobbyJoinCode.slice(0, -1);
      } else if (input.consumeKey('enter') && lobbyJoinCode.length === 6) {
        net.role = 'client';
        lobbyStatusMsg = `Connecting…`;
        lobby.join(lobbyJoinCode).then(() => {
          lobbyStatusMsg = net.connected
            ? `Connected — waiting for host`
            : `⚠ Connection failed — check the code or internet`;
        }).catch(() => {
          lobbyStatusMsg = `⚠ Connection failed — check the code or internet`;
        });
      } else if (lobbyJoinCode.length < 6) {
        const allowed = 'abcdefghjklmnpqrstuvwxyz23456789';
        for (const k of Array.from(input.justPressed)) {
          if (k.length === 1 && allowed.includes(k)) {
            lobbyJoinCode += k.toUpperCase();
            input.justPressed.delete(k);
            if (lobbyJoinCode.length >= 6) break;
          }
        }
      }
    }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of lobbyBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'back') {
            // Fully tear down any host/client connection so returning to
            // char select truly means "back to solo". Without this, a user
            // who opened the lobby and then backed out would still have
            // `net.role !== 'solo'`, which hides the 2P CO-OP toggle on
            // the next char-select screen.
            if (net.role !== 'solo') {
              if (net.peers.size > 0) {
                try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'back' }); } catch {}
                net.gracefulDisconnect();
              } else {
                net.disconnect();
              }
            }
            net.role = 'solo';
            _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
            gameState = 'charSelect';
            break;
          }
          if (b.action === 'host') {
            const code = lobby.createHosted({ seed: Math.floor(Math.random() * 1e9), difficulty: selectedDifficulty });
            lobbyMode = 'hosting';
            net.role = 'host';
            lobbyStatusMsg = `Connecting…`;
            net.connect(code).then(() => {
              lobbyStatusMsg = net.connected
                ? `Share code ${code} with friends`
                : `⚠ Connection failed — check internet`;
            }).catch(() => {
              lobbyStatusMsg = `⚠ Connection failed — check internet`;
            });
            break;
          }
          if (b.action === 'join') { lobbyMode = 'joining'; lobbyJoinCode = ''; lobbyStatusMsg = 'Type the 6-character room code, press ENTER'; break; }
          if (b.action === 'lobby_start') {
            // Host sends all connected clients to char select with the shared seed.
            net.sendReliable('evt', { type: 'START_LOBBY', seed: lobby.seed });
            gameState = 'charSelect';
            audio.playBGM('menu');
            break;
          }
          if (b.action === 'lobby_back') {
            // Tell the peer we're leaving so they drop out of the lobby too
            // rather than waiting on a ghost host.
            if (net.peers.size > 0) {
              try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'lobby_back' }); } catch {}
              net.gracefulDisconnect();
            } else {
              net.disconnect();
            }
            lobbyMode = 'menu'; lobbyJoinCode = ''; lobbyStatusMsg = ''; _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState(); net.role = 'solo'; break;
          }
          if (b.action === 'join_confirm' && lobbyJoinCode.length === 6) {
            net.role = 'client';
            lobbyStatusMsg = `Connecting…`;
            lobby.join(lobbyJoinCode).then(() => {
              lobbyStatusMsg = net.connected
                ? `Connected — waiting for host`
                : `⚠ Connection failed — check the code or internet`;
            }).catch(() => {
              lobbyStatusMsg = `⚠ Connection failed — check the code or internet`;
            });
            break;
          }
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── MAP ──
  if (gameState === 'map') {
    // On first frame after entering map, snap the cursor to the closest
    // reachable node so the D-pad starts pointed at a real target. Without
    // this, a gamepad user arriving from combat has the cursor wherever the
    // last click landed, and the first press can wrap to an unexpected node.
    // `clickSpheres` isn't built until drawMap() runs post-update on frame
    // one, so we latch the intent and retry until getReachableBoxes() fills.
    if (_justEnteredMenu) _mapSnapPending = true;
    if (_mapSnapPending) {
      const _mapBoxes = runManager.getReachableBoxes();
      if (_mapBoxes.length > 0) {
        const mx = input.mouse.x, my = input.mouse.y;
        // Respect a mouse user already hovering a reachable node — only snap
        // when the cursor is idle elsewhere on screen.
        const overAny = _mapBoxes.some(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
        if (!overAny) {
          let best = _mapBoxes[0], bestD = Infinity;
          for (const b of _mapBoxes) {
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            const d = (cx - mx) * (cx - mx) + (cy - my) * (cy - my);
            if (d < bestD) { bestD = d; best = b; }
          }
          _gpSnapCursorToBox([best]);
        }
        _mapSnapPending = false;
      }
    }
    // D-pad / arrow nav across the currently-reachable map nodes. The A-button
    // always-on path sets mouse.justClicked, so after the nudge lands on a
    // sphere the existing consumeClick branch below handles the selection.
    if (_gpHandleMenuNav(runManager.getReachableBoxes())) { input.clearFrame(); return; }
    if (input.consumeKey('i') || input.consumeKey('I')) {
      ui.showInventory = !ui.showInventory;
    }
    if (input.consumeKey('escape')) {
      if (ui.showInventory) {
        ui.showInventory = false;
      } else {
        prevStateBeforePause = 'map';
        gameState = 'paused';
      }
      input.clearFrame();
      return;
    }
    if (input.consumeClick()) {
      if (ui.showInventory) { /* clicks fall through to overlay dismiss */ }
      // Wait for both players to finish their post-combat decision phase
      // before allowing any map interaction.
      if (net.role !== 'solo' && net.peers.size > 0 && (!_remotePhaseDone || !_localPhaseDone)) {
        input.clearFrame(); return;
      }
      // In MP we use a vote system: clicking a node casts a vote rather than
      // immediately advancing. Both players must vote for the same node.
      const isMP = net.role !== 'solo' && net.peers.size > 0;
      if (isMP) {
        const candidate = runManager.identifyNodeAtPoint(input.mouse.x, input.mouse.y);
        if (candidate) {
          _localMapVote = candidate.id;
          net.sendReliable('evt', { type: 'MAP_VOTE', nodeId: candidate.id });
          _checkMapVoteResolution();
        }
        input.clearFrame();
        return;
      }
      const node = runManager.handleMapClick(input.mouse.x, input.mouse.y, canvas.width, canvas.height);
      if (node) {
        console.log(`[Map] Node "${node.id}" type="${node.type}"`);
        if (node.type === 'rest') {
          restChoiceBoxes = [];
          gameState = 'rest';
        } else if (node.type === 'event') {
          const r = Math.random();
          currentEventType = r < 0.4 ? 'merchant' : (r < 0.7 ? 'blacksmith' : 'standard');
          gameState = 'event';
        } else if (node.type === 'shop') {
          const available = getAvailableCards();
          const sk = Math.min(4, available.length);
          for (let i = 0; i < sk; i++) {
            const j = i + Math.floor(Math.random() * (available.length - i));
            const tmp = available[i]; available[i] = available[j]; available[j] = tmp;
          }
          shopCards = available.slice(0, sk);
          gameState = 'shop';
        } else {
          currentCombatNode = node;
          spawnEnemies(node);
          player.x = room.FLOOR_X1 + 100;
          player.y = (room.FLOOR_Y1 + room.FLOOR_Y2) / 2;
          gameState = 'prep';
        }
        // Tell clients which node was chosen so they mirror the state transition
        if (net.role === 'host' && net.peers.size > 0) {
          net.sendReliable('evt', {
            type: 'MAP_NODE_CHOSEN',
            nodeType: node.type,
            nodeId: node.id,
            floor: runManager.floor,
            shopCards: node.type === 'shop' ? shopCards : undefined,
            eventType: node.type === 'event' ? currentEventType : undefined,
          });
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── VICTORY CELEBRATION ──
  if (gameState === 'victory') {
    const now = performance.now();
    if (!_victoryAnimStart) _victoryAnimStart = now;
    const elapsed = now - _victoryAnimStart;
    if (elapsed >= 2500) _victoryReady = true;
    // Spawn gold particles continuously during animation
    if (elapsed < 3000 && Math.random() < 0.35) {
      const px = Math.random() * canvas.width;
      const py = Math.random() * canvas.height * 0.7;
      particles.spawnBurst(px, py, 1, ['#ffd700', '#ffaa00', '#ffffff', '#fffaaa']);
    }
    if (_victoryReady) {
      if (input.consumeKey('enter') || input.consumeKey(' ') || input.consumeClick()) {
        gameState = 'stats';
        statsInputDelay = 0;
        _fadeAlpha = 0.6; _fadeDir = -1;
        input.clearFrame();
        return;
      }
    }
    input.clearFrame();
    return;
  }

  // ── STATS (replaces dead/victory) ──
  if (gameState === 'stats') {
    if (statsInputDelay > 0) {
      statsInputDelay -= realDt;
      input.clearFrame();
      return;
    }
    const clicked = input.consumeClick();
    const pressedEnter = input.consumeKey('enter') || input.consumeKey(' ');
    let returnToMenu = pressedEnter;
    if (clicked) {
      // Accept click anywhere on screen, or specifically on the button box
      if (ui.statsReturnBox) {
        const b = ui.statsReturnBox;
        const mx = input.mouse.x, my = input.mouse.y;
        returnToMenu = mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
      } else {
        returnToMenu = true; // fallback: any click returns
      }
    }
    if (returnToMenu) {
      gameState = 'charSelect';
      selectedCharId = null;
      statsInputDelay = 0;
      audio.playBGM('menu');
    }
    input.clearFrame();
    return;
  }

  // ── PAUSED ──
  if (gameState === 'paused') {
    if (_gpHandleMenuNav(pauseMenuBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) {
      if (pauseQuitConfirm) { pauseQuitConfirm = false; }
      else { gameState = prevStateBeforePause || 'playing'; }
    }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of pauseMenuBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'resume') { pauseQuitConfirm = false; pauseShowControls = false; gameState = prevStateBeforePause || 'playing'; }
          else if (b.action === 'controls') { pauseShowControls = !pauseShowControls; pauseQuitConfirm = false; }
          else if (b.action === 'restart') {
            pauseQuitConfirm = false; pauseShowControls = false;
            // Restarting also ends any active remote session — tell the peer
            // and tear down the connection so they aren't left thinking the
            // game is still going.
            if (net.role !== 'solo' && net.peers.size > 0) {
              try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'restart' }); } catch {}
              net.gracefulDisconnect(); net.role = 'solo';
              _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
            }
            gameState = 'charSelect'; selectedCharId = null; audio.silenceMusic(); audio.playBGM('menu');
          }
          else if (b.action === 'quit') {
            if (pauseQuitConfirm) {
              pauseQuitConfirm = false;
              // In remote MP, tell the peer we're leaving BEFORE tearing
              // down the connection so they get a clean session-ended
              // notification instead of a silent "link lost" banner.
              if (net.role !== 'solo' && net.peers.size > 0) {
                try { net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'quit' }); } catch {}
                net.gracefulDisconnect(); net.role = 'solo';
                _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState();
              }
              gameState = 'intro'; selectedCharId = null; audio.silenceMusic(); audio.playBGM('menu');
            }
            else { pauseQuitConfirm = true; }
          }
          else if (b.action === 'quit_cancel') { pauseQuitConfirm = false; }
          else if (b.action === 'vol_down') { const v = Math.max(0, audio.getMasterVolume() - 0.1); audio.setMasterVolume(v); meta.setMasterVolume(v); }
          else if (b.action === 'vol_up')   { const v = Math.min(1, audio.getMasterVolume() + 0.1); audio.setMasterVolume(v); meta.setMasterVolume(v); }
          else if (b.action === 'toggle_pad_p1') { meta.setGamepadEnabled(0, !meta.isGamepadEnabled(0)); }
          else if (b.action === 'toggle_pad_p2') { meta.setGamepadEnabled(1, !meta.isGamepadEnabled(1)); }
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── REST ──
  if (gameState === 'rest') {
    if (_gpHandleMenuNav(restChoiceBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) { gameState = 'map'; input.clearFrame(); return; }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of restChoiceBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          _castRestVote(b.action);
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── EVENT ──
  if (gameState === 'event') {
    if (_gpHandleMenuNav(ui.eventBoxes)) { input.clearFrame(); return; }
    if (input.consumeKey('escape')) { gameState = 'map'; input.clearFrame(); return; }
    for (let i = 0; i < 3; i++) {
      if (input.consumeKey((i + 1).toString())) { handleEvent(i); break; }
    }
    if (input.consumeClick()) {
      const idx = ui.handleEventClick(input.mouse.x, input.mouse.y);
      if (idx >= 0) handleEvent(idx);
    }
    input.clearFrame();
    return;
  }

  // ── SHOP ──
  if (gameState === 'shop') {
    // Include the Leave Shop button in the nav set so down from the card row
    // reaches it. handleShopClick still routes clicks by mouse position.
    const _shopNav = (ui.shopBoxes || []).slice();
    if (ui.leaveShopBox) _shopNav.push(ui.leaveShopBox);
    if (_gpHandleMenuNav(_shopNav)) { input.clearFrame(); return; }
    if (input.consumeKey('escape') || input.consumeKey('enter')) { gameState = 'map'; input.clearFrame(); return; }
    if (input.consumeClick()) {
      const cardId = ui.handleShopClick(input.mouse.x, input.mouse.y);
      if (cardId === '__leave') { gameState = 'map'; input.clearFrame(); return; }
      else if (cardId && player.hp <= 1) {
        window._shopWarnUntil = performance.now() + 2200;
        window._shopWarnMsg = 'BUYING THIS CARD WOULD KILL YOU — REST FIRST';
        events.emit('PLAY_SOUND', 'miss');
      }
      else if (cardId) {
        player.hp--;
        const addResult = deckManager.addCard(cardId);
        if (addResult === 'full') {
          discardPendingCardId = cardId;
          discardReturnState = 'shop_done';
          gameState = 'discard';
        } else {
          shopCards = shopCards.filter(c => c !== cardId);
          events.emit('PLAY_SOUND', 'itemPickup');
          _broadcastDeckAdd(cardId);
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── DISCARD ──
  if (gameState === 'discard') {
    if (_gpHandleMenuNav(ui.discardBoxes)) { input.clearFrame(); return; }
    if (input.consumeClick()) {
      const discardId = ui.handleDiscardClick(input.mouse.x, input.mouse.y);
      if (discardId && discardPendingCardId) {
        deckManager.removeCard(discardId);
        _broadcastDeckRemove(discardId);
        events.emit('PLAY_SOUND', 'itemPickup');
        if (discardPendingCardId === '__BURN__') {
          // Rest node burn: just remove, don't add a replacement
          console.log(`[Rest] Burned card "${discardId}"`);
          discardPendingCardId = null;
          gameState = 'map';
        } else {
          deckManager.addCard(discardPendingCardId);
          _broadcastDeckAdd(discardPendingCardId);
          shopCards = shopCards.filter(c => c !== discardPendingCardId); // BUG-08: remove from shop after discard
          console.log(`[Deck] Discarded "${discardId}", added "${discardPendingCardId}"`);
          if (window._discardCallback) {
            const cb = window._discardCallback;
            window._discardCallback = null;
            discardPendingCardId = null;
            cb();
          } else {
            discardPendingCardId = null;
            gameState = 'map';
          }
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── ITEM REWARD ──
  if (gameState === 'itemReward') {
    // Include the Skip button so down from the card row reaches it, matching
    // the shop/upgrade nav. handleItemClick still routes clicks by mouse pos.
    const _itemNav = (ui.itemBoxes || []).slice();
    if (ui.skipItemBox) _itemNav.push(ui.skipItemBox);
    if (_gpHandleMenuNav(_itemNav)) { input.clearFrame(); return; }
    if (input.consumeKey('enter') || input.consumeKey(' ') || input.consumeKey('escape')) { gameState = 'map'; }
    if (input.consumeClick()) {
      const itemId = ui.handleItemClick(input.mouse.x, input.mouse.y);
      if (itemId === '__skip') { gameState = 'map'; }
      else if (itemId) {
        itemManager.add(itemId, player, tempo);
        runStats.itemsCollected++;
        events.emit('PLAY_SOUND', 'itemPickup');
        // Check if upgrade is due
        if (roomsCleared > 0 && roomsCleared % 3 === 0) {
          upgradeChoices = deckManager.getUpgradeChoices();
          if (upgradeChoices.length > 0) { gameState = 'upgrade'; input.clearFrame(); return; }
        }
        gameState = 'map';
      }
    }
    input.clearFrame();
    return;
  }

  // ── UPGRADE ──
  if (gameState === 'upgrade') {
    // Include the Skip Upgrade button in the nav set so down from the card row
    // reaches it. handleUpgradeClick still routes clicks by mouse position.
    const _upgNav = (ui.upgradeBoxes || []).slice();
    if (ui.skipUpgradeBox) _upgNav.push(ui.skipUpgradeBox);
    if (_gpHandleMenuNav(_upgNav)) { input.clearFrame(); return; }
    if (input.consumeKey('enter') || input.consumeKey(' ') || input.consumeKey('escape')) { gameState = 'map'; }
    if (input.consumeClick()) {
      const cardId = ui.handleUpgradeClick(input.mouse.x, input.mouse.y);
      if (cardId === '__skip') { gameState = 'map'; }
      else if (cardId) {
        // Per-player upgrade — do NOT broadcast. See DECK_CARD_UPGRADED
        // comment in net.on('evt') for rationale.
        deckManager.upgradeCard(cardId);
        events.emit('PLAY_SOUND', 'upgrade');
        gameState = 'map';
      }
    }
    input.clearFrame();
    return;
  }

  // ── DRAFT ──
  if (gameState === 'draft') {
    if (_gpHandleMenuNav(draftBoxes)) { input.clearFrame(); return; }
    for (let i = 0; i < draftChoices.length; i++) {
      if (input.consumeKey((i + 1).toString())) { pickDraft(i); break; }
    }
    if (input.consumeClick()) {
      const idx = getDraftClickIndex(input.mouse.x, input.mouse.y);
      if (idx >= 0) pickDraft(idx);
    }
    _draftRevealTimer += realDt;
    input.clearFrame();
    return;
  }

  // ── PREP ──
  if (gameState === 'prep') {
    // D-pad nav — unify the hand slots (top), the deck grid (middle), and
    // the START COMBAT button (bottom-right) into a single nav array so the
    // gamepad can walk between all three zones. Tagging each box with a
    // `_kind` field keeps downstream code readable but isn't required by
    // _gpHandleMenuNav itself (it only reads x/y/w/h).
    const _prepNav = [];
    if (ui.handBoxes) for (const b of ui.handBoxes) _prepNav.push(b);
    if (ui.prepBoxes) for (const b of ui.prepBoxes) _prepNav.push(b);
    if (ui.prepFightBox) _prepNav.push(ui.prepFightBox);
    // On first frame after entering prep, snap the cursor to the first
    // collection card — it's the intuitive starting focus (hand is mostly
    // empty early, FIGHT button sits off in the corner). Collection boxes
    // aren't built until drawPrepScreen() runs after update, so we latch and
    // retry until they exist.
    if (_justEnteredMenu) _prepSnapPending = true;
    if (_prepSnapPending && ui.prepBoxes && ui.prepBoxes.length > 0) {
      // Only snap if the cursor isn't already on a nav box (mouse users may
      // already be pointing at something — don't steal their focus).
      const mx = input.mouse.x, my = input.mouse.y;
      const overAny = _prepNav.some(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
      if (!overAny) _gpSnapCursorToBox([ui.prepBoxes[0]]);
      _prepSnapPending = false;
    }
    if (_gpHandleMenuNav(_prepNav)) { input.clearFrame(); return; }

    // Multiplayer flow: each press of Enter / FIGHT toggles "ready" for the LOCAL
    // player. Only when BOTH have readied does combat actually start (host then
    // broadcasts BATTLE_START). Solo skips the handshake entirely.
    const isMP = net.role !== 'solo' && net.peers.size > 0;
    let pressedReady = input.consumeKey('enter');
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      if (ui.prepFightBox) {
        const fb = ui.prepFightBox;
        if (mx >= fb.x && mx <= fb.x + fb.w && my >= fb.y && my <= fb.y + fb.h) {
          pressedReady = true;
        }
      }
      if (!pressedReady) ui.handlePrepClick(mx, my);
    }
    if (pressedReady) {
      if (!isMP) {
        _startCombatNow();
      } else if (!_prepReadyLocal) {
        _prepReadyLocal = true;
        net.sendReliable('evt', { type: 'PREP_READY' });
        // If we're host AND peer already pinged ready, kick off the battle
        if (net.role === 'host' && _peerIsReady()) {
          net.sendReliable('evt', { type: 'BATTLE_START' });
          _startCombatNow();
        }
      }
      // If client locks in first, host will send BATTLE_START when they ready
    }
    input.clearFrame();
    return;
  }

  // ── PLAYING ──
  // ESC → pause menu
  if (input.consumeKey('escape')) {
    prevStateBeforePause = 'playing';
    pauseQuitConfirm = false;
    pauseShowControls = false;
    gameState = 'paused';
    input.clearFrame();
    return;
  }

  tempo.update(logicDt);
  combat.update(logicDt);
  itemManager.update(logicDt);
  ui.update(logicDt);
  audio.updateTempoHum(tempo.value, true);

  // Right-click: cycle selected card slot (P1 only)
  if (input.consumeRightClick()) {
    selectedCardSlot = (selectedCardSlot + 1) % 4;
  }
  // Gamepad shoulder / face-button cycling — X/LB = prev, Y/RB = next.
  // Input.js emits p1/p2 pseudo-keys so each player's selected slot advances.
  if (input.consumeKey('p1cardprev')) selectedCardSlot = (selectedCardSlot + 3) % 4;
  if (input.consumeKey('p1cardnext')) selectedCardSlot = (selectedCardSlot + 1) % 4;
  if (input.consumeKey('p2cardprev')) selectedCardSlotP2 = (selectedCardSlotP2 + 3) % 4;
  if (input.consumeKey('p2cardnext')) selectedCardSlotP2 = (selectedCardSlotP2 + 1) % 4;
  // P1 number keys: solo uses 1-4; co-op uses 7/8/9/0 (right-side cluster)
  if (localCoop) {
    const p1Keys = ['7', '8', '9', '0'];
    for (let i = 0; i < 4; i++) {
      if (input.consumeKey(p1Keys[i])) selectedCardSlot = i;
    }
    // P2 picks card with 1-4 (left-side cluster)
    for (let i = 0; i < 4; i++) {
      if (input.consumeKey((i + 1).toString())) selectedCardSlotP2 = i;
    }
  } else {
    for (let i = 0; i < 4; i++) {
      if (input.consumeKey((i + 1).toString())) selectedCardSlot = i;
    }
  }

  // Silence timer
  if (player.silenced) {
    player.silenceTimer = Math.max(0, (player.silenceTimer || 0) - logicDt);
    if (player.silenceTimer <= 0) player.silenced = false;
  }

  // Update hand resonance type for combat bonuses — only recompute when hand changes
  if (deckManager._resonanceDirty) {
    player._resonanceType = deckManager.getHandResonanceType();
    deckManager._resonanceDirty = false;
  }

  // Left-click: use the currently selected card
  if (input.consumeClick()) {
    if (player.silenced) {
      particles.spawnDamageNumber(player.x, player.y - 30, 'SILENCED!');
      events.emit('PLAY_SOUND', 'miss');
    } else {
      const cardId = deckManager.hand[selectedCardSlot];
      if (cardId) {
        const def = deckManager.getCardDef(cardId);
        if (player.budget >= def.cost) {
          combat.executeCard(player, def, input.mouse);
          runStats.cardsPlayed++;
          _registerCardPlayed(def, selectedCardSlot);
          if (def.type !== 'echo') _lastCardPlayed = def;
          if (def.type === 'dash') noDashCardsUsedThisRun = false;
        }
        else events.emit('PLAY_SOUND', 'miss');
      }
    }
  }

  player.updateLogic(logicDt, input, tempo, room);

  // RH2: P2 update + revives + Group Tempo Resonance
  if (players.count > 1) {
    const p2 = players.list[1];
    // Remote placeholder: position driven by snapshots only — skip all local input/physics
    if (!p2._isRemote) {
      input.updateP2Reticle(p2, logicDt, enemies);
      // Q-press: P2 fires its selected card with auto-aim target
      const p2v = input._p2View;
      if (p2v && p2v.mouse.justClicked && p2.alive && !p2.downed && !p2.silenced) {
        p2v.mouse.justClicked = false;
        const cardId2 = deckManager.hand[selectedCardSlotP2];
        if (cardId2) {
          const def2 = deckManager.getCardDef(cardId2);
          if (p2.budget >= def2.cost) {
            combat.executeCard(p2, def2, p2v.mouse);
            runStats.cardsPlayed++;
            if (def2.type !== 'echo') _lastCardPlayed = def2;
          } else {
            events.emit('PLAY_SOUND', 'miss');
          }
        }
      } else if (p2v) {
        p2v.mouse.justClicked = false;
      }
      if (p2.alive) p2.updateLogic(logicDt, input.player2View(), tempo, room);
    }
    players.updateRevives(logicDt);
    // Group resonance: shared tempo bar → all alive non-downed share the
    // same zone, so the count alone drives the multiplier. Avoid the
    // per-frame array+filter+map churn that the obvious version produces.
    let active = 0;
    const list = players.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.alive && !p.downed) active++;
    }
    let bonus = 0;
    if (active === 2) bonus = 0.10;
    else if (active === 3) bonus = 0.20;
    else if (active >= 4) bonus = 0.30;
    if (bonus > 0 && itemManager.has && itemManager.has('resonant_anchor')) bonus *= 1.5;
    const newMult = 1.0 + bonus;
    // One-shot flash on activation (mult crossed >1 from 1)
    if (newMult > 1.001 && (tempo._groupResonanceMult || 1) <= 1.001) {
      _resonanceFlashTimer = 0.6;
    }
    tempo._groupResonanceMult = newMult;
  }

  // Co-op wipe check: if every player is downed (no one to revive), end the run.
  // Applies to both local 2P coop and remote multiplayer, since downed players
  // never auto-die — they need an active ally in range to revive them.
  if (player._coopMode && playerDeathTimer === 0 && gameState === 'playing' && players.allDownedOrDead()) {
    console.log('[Run] Co-op wipe: all players downed');
    runStats.floor = runManager.floor;
    runStats.finalDeck = [...deckManager.collection];
    runStats.won = false;
    checkRunUnlocks(false);
    playerDeathTimer = 1.2;
    if (net.role !== 'solo' && net.peers.size > 0) {
      net.sendReliable('evt', { type: 'GAME_OVER', reason: 'wipe' });
    }
  }

  // IDEA-12: Brutal floor curse effects
  player._cursedSpeedMult = (currentFloorCurse === 'speed') ? 0.8 : 1.0;
  player._tempoCursed = (currentFloorCurse === 'tempoCost');
  if (currentFloorCurse === 'apRegen') {
    player.budget = Math.max(0, player.budget - player.apRegen * 0.3 * logicDt);
  }

  ui.setMouse(input.mouse.x, input.mouse.y);

  // Hot dash-attack check
  combat.checkDashAttack(player, tempo.value);

  // Track recent dodge for counter_slash / riposte
  if (player.recentDodgeTimer === undefined) player.recentDodgeTimer = 0;
  if (player.dodging) player.recentDodgeTimer = 0.5;
  else player.recentDodgeTimer = Math.max(0, player.recentDodgeTimer - logicDt);

  // Speed boost timer (War Cry)
  if (player.speedBoostTimer > 0) {
    player.speedBoostTimer = Math.max(0, player.speedBoostTimer - logicDt);
  }

  // Aura effects from Corruptor and Timekeeper
  let inCorruptorAura = false;
  let inTimekeeperAura = false;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.type === 'corruptor' && e.isPlayerInAura && e.isPlayerInAura(player)) inCorruptorAura = true;
    if (e.type === 'timekeeper' && e.isPlayerInAura && e.isPlayerInAura(player)) inTimekeeperAura = true;
  }
  player._corruptorAura = inCorruptorAura;
  player._timekeeperAura = inTimekeeperAura;

  // IDEA-01: Cold Mastery — reward staying in Cold zone for 2+ seconds
  if (tempo.value < 30) {
    player._coldMasteryTimer = (player._coldMasteryTimer || 0) + logicDt;
    if (!player._coldMasteryActive && player._coldMasteryTimer >= 2.0) {
      player._coldMasteryActive = true;
      particles.spawnDamageNumber(player.x, player.y - 40, 'COLD MASTERY!');
    }
  }

  // Vanguard Guard stack decay
  if (Characters[selectedCharId]?.passives?.ironGuard) {
    if (player.guardStacks === undefined) player.guardStacks = 0;
    player._guardDecayTimer = (player._guardDecayTimer || 0) + logicDt;
    if (player._guardDecayTimer >= 3.0 && player.guardStacks > 0) {
      player.guardStacks--;
      player._guardDecayTimer = 0;
    }
  }

  // BUG-08: compute once per frame, not per-enemy
  player._phantomInkActive = player.dodging && itemManager.has('phantom_ink');

  // Update enemies — pass projectile manager
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    // Dying: tick animation timer, remove when expired
    if (e._dying) {
      e._deathTimer -= logicDt;
      if (e._deathTimer <= 0) {
        enemies[i] = enemies[enemies.length - 1];
        enemies.pop();
      }
      continue;
    }
    // Bleed tick
    if (e.bleedTimer > 0) {
      e.bleedTimer -= logicDt;
      e._bleedTick = (e._bleedTick || 0) + logicDt;
      if (e._bleedTick >= 1.0) {
        e._bleedTick -= 1.0;
        e.takeDamage(e.bleedDmg || 3);
        particles.spawnDamageNumber(e.x, e.y - 10, e.bleedDmg || 3);
        if (!e.alive) {
          if (typeof e.cleanup === 'function') e.cleanup(); // BUG-07: prevent listener leaks
          itemManager.onKill(tempo.value, player);
          if (e.isBoss) itemManager.onBossKill(player);
          const _bossDeath2 = e.isBoss;
          const _dur2 = _bossDeath2 ? 2.5 : 0.6;
          e._dying = true; e._deathTimer = _dur2; e._deathDuration = _dur2;
          if (_bossDeath2) {
            e._bossDeathPos = { x: e.x, y: e.y };
            events.emit('SCREEN_SHAKE', { duration: 1.2, intensity: 1.0 });
            particles.spawnCrashBurst(e.x, e.y);
            particles.spawnDamageNumber(e.x, e.y - 60, 'BOSS DEFEATED!');
          }
          const _burstDef2 = window._equippedCosmetics?.burstDef;
          if (_burstDef2) {
            if (_burstDef2.burstColors) { for (const col of _burstDef2.burstColors) particles.spawnBurst(e.x, e.y, col); }
            else particles.spawnBurst(e.x, e.y, _burstDef2.value);
          }
          const _keDef2 = window._equippedCosmetics?.killEffectDef;
          if (_keDef2) killEffects.push({ x: e.x, y: e.y, elapsed: 0, def: _keDef2 });
          continue;
        }
      }
    }
    // RH2: pick nearest alive, NON-DOWNED player so enemies engage P2 too
    // and stop attacking a teammate who's waiting for revive.
    let _tgt = player;
    if (players.count > 1) {
      let bestD = Infinity;
      let foundStanding = false;
      for (const pp of players.list) {
        if (!pp.alive || pp.downed) continue;
        const ddx = pp.x - e.x, ddy = pp.y - e.y;
        const dd = ddx * ddx + ddy * ddy;
        if (dd < bestD) { bestD = dd; _tgt = pp; foundStanding = true; }
      }
      // Fallback only if every player is downed (game-over imminent anyway)
      if (!foundStanding) {
        for (const pp of players.list) {
          if (!pp.alive) continue;
          const ddx = pp.x - e.x, ddy = pp.y - e.y;
          const dd = ddx * ddx + ddy * ddy;
          if (dd < bestD) { bestD = dd; _tgt = pp; }
        }
      }
    } else if (player.downed) {
      // Solo edge case: target stays the same but flag it for AI guards
    }
    e._currentTarget = _tgt;
    e.updateLogic(logicDt, _tgt, tempo, room, enemies, projectiles);
    if (!e.alive) {
      // Item on-kill effects
      itemManager.onKill(tempo.value, player);
      if (e.isBoss) itemManager.onBossKill(player);
      if (typeof e.cleanup === 'function') e.cleanup();
      const _bossDeath = e.isBoss;
      const _dur = _bossDeath ? 2.5 : 0.6;
      e._dying = true; e._deathTimer = _dur; e._deathDuration = _dur;
      if (_bossDeath) {
        e._bossDeathPos = { x: e.x, y: e.y };
        events.emit('SCREEN_SHAKE', { duration: 1.2, intensity: 1.0 });
        particles.spawnCrashBurst(e.x, e.y);
        particles.spawnDamageNumber(e.x, e.y - 60, 'BOSS DEFEATED!');
      }
      // Death burst cosmetic
      const _burstDef = window._equippedCosmetics?.burstDef;
      if (_burstDef) {
        if (_burstDef.burstColors) { for (const col of _burstDef.burstColors) particles.spawnBurst(e.x, e.y, col); }
        else particles.spawnBurst(e.x, e.y, _burstDef.value);
      }
      const _keDef = window._equippedCosmetics?.killEffectDef;
      if (_keDef) killEffects.push({ x: e.x, y: e.y, elapsed: 0, def: _keDef });
    }
  }

  // Update kill effects
  for (let _ki = killEffects.length - 1; _ki >= 0; _ki--) {
    killEffects[_ki].elapsed += logicDt;
    if (killEffects[_ki].elapsed >= (killEffects[_ki].def.duration || 0.5)) killEffects.splice(_ki, 1);
  }

  // Update projectiles
  projectiles.update(logicDt, players.count > 1 ? players.list : player, room);

  // Check enemy melee near-miss for perfect dodge
  if (player.dodging && player.perfectDodgeWindow > 0) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.state === 'telegraph') {
        const dx = e.x - player.x, dy = e.y - player.y;
        if (dx * dx + dy * dy < (e.r + player.r + 30) * (e.r + player.r + 30)) {
          player.checkPerfectDodge();
          break;
        }
      }
    }
  }

  // Room clear check — skip if player died this frame.
  // Clients wait for host's authoritative ROOM_CLEARED event to avoid desync.
  if (enemies.length === 0 && gameState === 'playing' && player.alive && net.role !== 'client') {
    handleCombatClear();
  }

  // Update parry window
  if (player.parryWindow) {
    player.parryWindow.timer -= logicDt;
    if (player.parryWindow.timer <= 0) player.parryWindow = null;
  }

  // Update resonance timer
  if (player._resonanceActive > 0) player._resonanceActive -= logicDt;

  // Update traps
  for (let i = traps.length - 1; i >= 0; i--) {
    const t = traps[i];
    t.life -= logicDt;
    if (t.life <= 0) { traps.splice(i, 1); continue; }
    // Visual-only replica of the remote player's trap — decay life / render only.
    if (t._netRemote) continue;
    const trapThreshold = t.radius + 32; // 32 = max enemy radius
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (Math.abs(dx) > trapThreshold || Math.abs(dy) > trapThreshold) continue;
      if (dx * dx + dy * dy < (t.radius + e.r) * (t.radius + e.r)) {
        // Trigger
        if (t.damage > 0) combat.applyDamageToEnemy(e, t.damage);
        if (t.stagger > 0 && e.alive) e.stagger(t.stagger);
        if (t.freeze > 0 && e.alive) e.stagger(t.freeze);
        if (t.aoe > 0) {
          for (const oe of enemies) {
            if (!oe.alive || oe === e) continue;
            const odx = oe.x - t.x, ody = oe.y - t.y;
            if (odx * odx + ody * ody < t.aoe * t.aoe) {
              const aoeDmg = t.volatile && tempo.value >= 90 ? t.damage * 2 : t.damage;
              if (aoeDmg > 0) combat.applyDamageToEnemy(oe, aoeDmg);
              if (t.stagger > 0 && oe.alive) oe.stagger(t.stagger);
            }
          }
        }
        particles.spawnBurst(t.x, t.y, t.color || '#ffaa44');
        particles.spawnRing(t.x, t.y, Math.max(t.radius, t.aoe || 0) + 20, t.color || '#ffaa44');
        events.emit('PLAY_SOUND', 'heavyHit');
        traps.splice(i, 1);
        break;
      }
    }
  }

  // Update orbs
  const ORB_HIT_COOLDOWN = 0.4;
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.life -= logicDt;
    if (o.life <= 0) { orbs.splice(i, 1); continue; }
    o.angle += o.speed * logicDt;
    if (o.spiral) {
      const t = 1 - o.life / o.maxLife;
      o.radius = o.baseRadius + (o.baseRadius * 2) * t;
    }
    if (o._netRemote) continue; // visual-only replica of remote player's orb
    const ox = player.x + Math.cos(o.angle) * o.radius;
    const oy = player.y + Math.sin(o.angle) * o.radius;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - ox, dy = e.y - oy;
      if (Math.abs(dx) > 40 || Math.abs(dy) > 40) continue; // 8 + 32 (max enemy r)
      if (dx * dx + dy * dy < (8 + e.r) * (8 + e.r)) {
        const now2 = performance.now();
        const lastHit = o.hitCooldowns.get(e) || 0;
        if (now2 - lastHit > ORB_HIT_COOLDOWN * 1000) {
          o.hitCooldowns.set(e, now2);
          combat.applyDamageToEnemy(e, o.damage);
          if (o.freeze > 0 && e.alive) e.stagger(o.freeze);
          particles.spawnBurst(ox, oy, o.color);
        }
      }
    }
  }

  // Update echoes
  for (let i = echoes.length - 1; i >= 0; i--) {
    const echo = echoes[i];
    echo.timer -= logicDt;
    if (echo.timer > 0) continue;
    // Remote replica detonates visually but applies no damage — the
    // originating side resolves the damage.
    if (echo._netRemote) {
      particles.spawnBurst(echo.x, echo.y, (echo.def && echo.def.color) || '#cc88ff');
      echoes.splice(i, 1);
      continue;
    }
    // Execute echo
    const { x, y, def, dmg, inputX, inputY } = echo;
    switch (def.echoType) {
      case 'melee': {
        let nearest = null, nearestDist2 = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.x - x, dy = e.y - y;
          const d2 = dx*dx+dy*dy;
          const threshold = (def.range || 90) + e.r;
          if (d2 < threshold * threshold && d2 < nearestDist2) { nearest = e; nearestDist2 = d2; }
        }
        if (nearest) {
          combat.applyDamageToEnemy(nearest, dmg);
          particles.spawnSlash(x, y, nearest.x, nearest.y, def.color || '#cc88ff');
        }
        particles.spawnBurst(x, y, def.color || '#cc88ff');
        break;
      }
      case 'nova': {
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.x - x, dy = e.y - y;
          if (dx*dx+dy*dy < (def.range||160)**2) {
            combat.applyDamageToEnemy(e, dmg);
            if (e.alive) e.stagger(1.0);
          }
        }
        particles.spawnRing(x, y, def.range||160, def.color||'#aaeeff');
        break;
      }
      case 'bomb': {
        const bombDmg = Math.round(dmg * (1 + tempo.value / 100));
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.x - x, dy = e.y - y;
          if (dx*dx+dy*dy < (def.range||150)**2) {
            combat.applyDamageToEnemy(e, bombDmg);
          }
        }
        particles.spawnRing(x, y, def.range||150, '#ffcc00');
        particles.spawnBurst(x, y, '#ffcc00');
        events.emit('SCREEN_SHAKE', { duration: 0.3, intensity: 0.6 });
        events.emit('HIT_STOP', 0.15);
        break;
      }
      case 'dash': {
        let nearest = null, nearestDist2 = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.x - x, dy = e.y - y;
          const d2 = dx*dx+dy*dy;
          if (d2 < 300*300 && d2 < nearestDist2) { nearest = e; nearestDist2 = d2; }
        }
        if (nearest) {
          combat.applyDamageToEnemy(nearest, dmg);
          particles.spawnSlash(x, y, nearest.x, nearest.y, def.color||'#88aaff');
          particles.spawnBurst(nearest.x, nearest.y, def.color||'#88aaff');
        }
        break;
      }
      case 'repeat': {
        if (_lastCardPlayed) {
          // LIKELY-01: include all fields executeCard may read to avoid undefined errors
          const fakePlayer = { x, y, budget: 999, comboCount: player.comboCount, recentDodgeTimer: 0, guardStacks: 0, oathStacks: 0, stance: player.stance, silenced: false, parryWindow: null, _resonanceActive: player._resonanceActive };
          combat.setLists(enemies, fakePlayer);
          combat.executeCard(fakePlayer, _lastCardPlayed, { x: inputX, y: inputY });
          combat.setLists(enemies, player);
        }
        break;
      }
    }
    particles.spawnBurst(x, y, def.color || '#cc88ff');
    events.emit('PLAY_SOUND', 'heavyHit');
    echoes.splice(i, 1);
  }

  // IDEA-06: expose sigil list to UI for HUD indicator
  ui.activeSigils = sigils;

  // Update sigils (check Tempo triggers)
  for (let i = sigils.length - 1; i >= 0; i--) {
    const s = sigils[i];
    if (s.triggered) { sigils.splice(i, 1); continue; }
    // Remote replicas are visual-only — don't fire from our tempo state.
    if (s._netRemote) continue;
    let fire = false;
    switch (s.def.sigilTrigger) {
      case 'enterHot':    fire = tempo.value >= 70 && (tempo.prevValue ?? tempo.value) < 70; break; // LIKELY-03: use actual prev frame value
      case 'enterCold':   fire = tempo.value < 30 && (tempo.prevValue ?? tempo.value) >= 30; break;
      case 'resonance':   fire = Math.abs(tempo.value - 50) <= 5; break;
      case 'crash':       break; // handled via event
      case 'takeDamage':  break; // handled via event
    }
    if (fire) {
      s.triggered = true;
      _fireSigil(s);
    }
  }

  // Update ground waves
  for (let i = groundWaves.length - 1; i >= 0; i--) {
    const w = groundWaves[i];
    const prevTraveled = w.traveled;
    w.traveled += w.def.waveSpeed * logicDt;
    if (w.traveled >= w.def.range) { w.traveled = w.def.range; }

    // Remote replicas travel + render but do not damage enemies here.
    if (w._netRemote) {
      if (w.traveled >= w.def.range) groundWaves.splice(i, 1);
      continue;
    }

    // Check enemies along the wave front
    const wWidth = w.def.waveWidth || 30;
    for (const e of enemies) {
      if (!e.alive || w.hitEnemies.has(e)) continue;
      const ex = e.x - w.x, ey = e.y - w.y;
      // Project onto wave direction
      const proj = ex * w.dx + ey * w.dy;
      if (proj < prevTraveled - 10 || proj > w.traveled + e.r) continue;
      // Perpendicular distance
      const perp = Math.abs(ex * (-w.dy) + ey * w.dx);
      if (perp < wWidth + e.r) {
        w.hitEnemies.add(e);
        combat.applyDamageToEnemy(e, w.dmg);
        if (w.def.waveKnockback && e.alive) {
          e.x += w.dx * w.def.waveKnockback;
          e.y += w.dy * w.def.waveKnockback;
        }
        if (w.def.wavePushBack && e.alive) {
          e.x -= w.dx * w.def.wavePushBack;
          e.y -= w.dy * w.def.wavePushBack;
        }
        if (w.def.wavePull && e.alive) {
          e.x += w.dx * w.def.wavePull * 0.5;
          e.y += w.dy * w.def.wavePull * 0.5;
        }
        if (w.def.waveStagger && e.alive) e.stagger(w.def.waveStagger);
        particles.spawnBurst(e.x, e.y, w.def.color || '#cc8833');
      }
    }

    if (w.traveled >= w.def.range) {
      groundWaves.splice(i, 1);
    }
  }

  // Update beam flashes
  for (let i = beamFlashes.length - 1; i >= 0; i--) {
    beamFlashes[i].life -= logicDt;
    if (beamFlashes[i].life <= 0) beamFlashes.splice(i, 1);
  }

  // Channel: handle while mouse held
  if (channelState && input.mouse.leftDown) {
    const ch = channelState;
    ch.apTimer = (ch.apTimer || 0) + logicDt;
    ch.tickTimer = (ch.tickTimer || 0) + logicDt;
    // AP drain
    const drainInterval = 1.0 / (ch.def.apDrainRate || 0.5);
    if (ch.apTimer >= drainInterval) {
      ch.apTimer -= drainInterval;
      if (player.budget < 0.5) { channelState = null; }
      else { player.budget -= 0.5; }
    }
    // Tick
    const tickRate = ch.def.tickRate || 0.1;
    if (channelState && ch.tickTimer >= tickRate) {
      ch.tickTimer -= tickRate;
      _fireChannelTick(ch, ch.dmgMult);
    }
  } else if (!input.mouse.leftDown) {
    channelState = null;
  }

  particles.update(logicDt);
  // Expose current state to HostSim so it can throttle snap rate outside combat.
  window._gameState = gameState;
  // RH2: host broadcasts position snapshots after sim step (no-op in solo)
  hostSim.tick(logicDt, players.list, enemies);
  // Per-frame interpolation of remote entities. Snaps arrive at 15Hz; without
  // this, _isRemote players + (on client) enemies would visibly stutter to 15fps.
  if (net.role !== 'solo' && net.peers.size > 0) {
    const lerp = Math.min(1, logicDt * 14); // ~14 = catches up in ~70ms, well before next snap
    for (const p of players.list) {
      if (!p || !p.id || !p._isRemote) continue;
      const target = snapDecoder.positions.get(p.id);
      if (!target) continue;
      p.x += (target.x - p.x) * lerp;
      p.y += (target.y - p.y) * lerp;
    }
    if (net.role === 'client') {
      for (const e of enemies) {
        if (!e || !e.id || !e.alive) continue;
        const target = snapDecoder.positions.get(e.id);
        if (!target) continue;
        e.x += (target.x - e.x) * lerp;
        e.y += (target.y - e.y) * lerp;
      }
    }
  }
  // Playing-state-specific per-frame work — the global state-transition
  // sync block that used to live here is now lifted to `_syncNetPhase()`
  // so it fires on every update() call regardless of current state.
  // (Previously it was dead for every frame that wasn't `gameState==='playing'`,
  // which meant PHASE_DONE was never emitted when leaving itemReward/upgrade
  // and the "PARTNER IS ALREADY DONE" banner stuck forever.)
  if (_resonanceFlashTimer > 0) _resonanceFlashTimer = Math.max(0, _resonanceFlashTimer - realDt);
  if (_tempoZoneFlashTimer > 0) _tempoZoneFlashTimer = Math.max(0, _tempoZoneFlashTimer - realDt);
  if (gameState === 'playing') _checkTempoZoneTransition();
  if (_remoteDisconnectTimer > 0) { _remoteDisconnectTimer = Math.max(0, _remoteDisconnectTimer - realDt); if (_remoteDisconnectTimer <= 0) _remoteDisconnected = false; }
  renderer.updateShake(realDt);
  renderer.updateCA(realDt);
  // Tick zone tooltip
  if (zoneTooltip && zoneTooltip.timer > 0) {
    zoneTooltip.timer -= logicDt;
    if (zoneTooltip.timer <= 0) zoneTooltip = null;
  }
  // Tick draft reveal timer
  // Draft reveal timer now incremented inside the draft handler above (before its early return)
  // Tick combat start flash
  if (_combatStartFlash > 0) _combatStartFlash -= realDt;
  input.clearFrame();
}

// ── Click handlers ──────────────────────────────────────────────
// D-pad focus-nudge. Warps the virtual cursor to the nearest box in the
// given direction from the current cursor position, then syncs the DOM
// cursor. The next A-button click is handled by the normal consumeClick
// path, so every menu that drives its own `*Boxes` array gets keyboard-free
// navigation with no per-menu state. Returns true if a box was picked.
function _gpMenuNudge(boxes, dir) {
  if (!boxes || boxes.length === 0) return false;
  const mx = input.mouse.x, my = input.mouse.y;
  const horizontal = (dir === 'left' || dir === 'right');

  // Two candidates per pass: a "same-band" pick (same row for horizontal nav,
  // same column for vertical) and a general best pick. Same-band wins when
  // present — prevents left/right on char-select from jumping to the row of
  // toggle buttons above/below instead of the adjacent hero, and keeps up/down
  // inside a column of stacked options.
  let best = null, bestScore = Infinity;
  let bestBand = null, bandAx = Infinity;
  for (const b of boxes) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let ax, perp, inBand;
    if (horizontal) {
      inBand = my >= b.y - 4 && my <= b.y + b.h + 4;
      perp = Math.abs(cy - my);
      ax = (dir === 'right') ? (cx - mx) : (mx - cx);
    } else {
      inBand = mx >= b.x - 4 && mx <= b.x + b.w + 4;
      perp = Math.abs(cx - mx);
      ax = (dir === 'down') ? (cy - my) : (my - cy);
    }
    if (ax <= 6) continue;
    const score = ax + perp * 2;
    if (score < bestScore) { bestScore = score; best = b; }
    if (inBand && ax < bandAx) { bandAx = ax; bestBand = b; }
  }
  const chosen = bestBand || best;
  if (chosen) {
    input.mouse.x = chosen.x + chosen.w / 2;
    input.mouse.y = chosen.y + chosen.h / 2;
    if (input._syncDomCursor) input._syncDomCursor();
    return true;
  }
  // Wrap-around: if nothing is further in the given direction, pick the
  // opposite-edge box so looping with the D-pad always finds something.
  // Same same-band preference applies so wrapping stays on the current row.
  let fallback = null, fbScore = Infinity;
  let fallbackBand = null, fbBand = Infinity;
  for (const b of boxes) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const inBand = horizontal
      ? (my >= b.y - 4 && my <= b.y + b.h + 4)
      : (mx >= b.x - 4 && mx <= b.x + b.w + 4);
    let s;
    if      (dir === 'right') s =  cx + Math.abs(cy - my) * 2;
    else if (dir === 'left')  s = -cx + Math.abs(cy - my) * 2;
    else if (dir === 'down')  s =  cy + Math.abs(cx - mx) * 2;
    else                      s = -cy + Math.abs(cx - mx) * 2;
    if (s < fbScore) { fbScore = s; fallback = b; }
    if (inBand) {
      let sb;
      if      (dir === 'right') sb =  cx;
      else if (dir === 'left')  sb = -cx;
      else if (dir === 'down')  sb =  cy;
      else                      sb = -cy;
      if (sb < fbBand) { fbBand = sb; fallbackBand = b; }
    }
  }
  const fb = fallbackBand || fallback;
  if (fb) {
    input.mouse.x = fb.x + fb.w / 2;
    input.mouse.y = fb.y + fb.h / 2;
    if (input._syncDomCursor) input._syncDomCursor();
    return true;
  }
  return false;
}

// Snap the virtual cursor onto a target box (or nothing if no boxes). Used
// when entering a menu so the D-pad starts from a predictable location
// rather than wherever the cursor was on the previous screen. Prefers the
// box the caller flags as `preferred` (e.g. the current map node, or the
// currently-selected hero); otherwise picks the first box.
function _gpSnapCursorToBox(boxes, preferredMatch) {
  if (!boxes || boxes.length === 0) return false;
  let target = null;
  if (preferredMatch) {
    for (const b of boxes) {
      if (preferredMatch(b)) { target = b; break; }
    }
  }
  if (!target) target = boxes[0];
  input.mouse.x = target.x + target.w / 2;
  input.mouse.y = target.y + target.h / 2;
  if (input._syncDomCursor) input._syncDomCursor();
  return true;
}

// Consume a directional D-pad/arrow press and nudge the cursor. Returns
// true when any direction fired so callers can `return` without falling
// through to other key consumers in the same handler.
function _gpHandleMenuNav(boxes) {
  if (input.consumeKey('arrowright')) { _gpMenuNudge(boxes, 'right'); return true; }
  if (input.consumeKey('arrowleft'))  { _gpMenuNudge(boxes, 'left');  return true; }
  if (input.consumeKey('arrowdown'))  { _gpMenuNudge(boxes, 'down');  return true; }
  if (input.consumeKey('arrowup'))    { _gpMenuNudge(boxes, 'up');    return true; }
  return false;
}

let charSelectBoxes = [];

function handleCharSelectClick(mx, my) {
  for (const b of charSelectBoxes) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      if (b.action === 'select' && meta.isCharacterUnlocked(b.charId)) {
        selectedCharId = b.charId;
        selectedDifficulty = 0;
        return 'selected';
      }
      if (b.action === 'start') return 'start';
      if (b.action === 'ready') return 'ready';
      if (b.action === 'difficulty' && selectedCharId) {
        const maxD = meta.getMaxDifficulty(selectedCharId);
        selectedDifficulty = (selectedDifficulty + 1) % (maxD + 1);
        return 'difficulty';
      }
      if (b.action === 'mainMenu') return 'mainMenu';
      if (b.action === 'quit_cancel_cs') { _charSelectQuitConfirm = false; return 'quit_cancel_cs'; }
      if (b.action === 'toggleCoop') { localCoop = !localCoop; return 'toggleCoop'; }
      if (b.action === 'toggleGamepadP1') { meta.setGamepadEnabled(0, !meta.isGamepadEnabled(0)); return 'toggleGamepadP1'; }
      if (b.action === 'toggleGamepadP2') { meta.setGamepadEnabled(1, !meta.isGamepadEnabled(1)); return 'toggleGamepadP2'; }
      if (b.action === 'lobby') { lobbyMode = 'menu'; lobbyJoinCode = ''; lobbyStatusMsg = 'Checking network…'; _lobbyPeers = []; _remoteReady = false; _clientReady = false; _resetPeerLobbyState(); _remoteDisconnected = false; gameState = 'lobby';
            // RH2: warm Trystero CDN + WebRTC permissions immediately so the
            // banner shows real status rather than waiting until host-click.
            net.preflight().then(ok => {
              lobbyStatusMsg = ok
                ? '✓ Ready to host or join'
                : '⚠ Network unavailable — check internet';
            }).catch(() => { lobbyStatusMsg = '⚠ Network unavailable — check internet'; }); return 'lobby'; }
      if (b.action === 'cosmetics') {
        gameState = 'cosmeticShop';
        return 'cosmetics';
      }
      if (b.action === 'tutorial') {
        gameState = 'tutorial';
        tutorialPage = 0;
        return 'tutorial';
      }
      if (b.action === 'customize' && meta.isCharacterUnlocked(b.charId)) {
        cosmeticPanelCharId = b.charId;
        cosmeticPanelTab = 'bodyColor';
        gameState = 'cosmeticPanel';
        return 'customize';
      }
    }
  }
  return null;
}

// ── TUTORIAL pages (RH2 #15) ─────────────────────────────────────────────
const _TUTORIAL_PAGES = [
  { kind: 'intro', title: 'WELCOME TO ROGUE HERO 2',
    body: ['Move with WASD or Arrow Keys.','Aim and attack with the mouse.','Press SPACE to dodge toward your cursor (gamepad: B dodges in move direction).','Perfect dodges (just as an attack lands) crit.','Keys 1-4 select cards from your hand.','Build TEMPO with attacks; hot tempo hits harder.'] },
  { kind: 'attack', label: 'MELEE — ⚔', desc: 'Short-range swing. Cleaves enemies right in front of you.', anim: 'melee' },
  { kind: 'attack', label: 'PROJECTILE — ●', desc: 'Fires a single projectile toward the cursor. Mid range.', anim: 'projectile' },
  { kind: 'attack', label: 'BEAM — ═', desc: 'Instant straight line — pierces every enemy on the path.', anim: 'beam' },
  { kind: 'attack', label: 'DASH — ➜', desc: 'Lunge through a line of enemies, hitting all you cross.', anim: 'dash' },
  { kind: 'attack', label: 'TRAP — ✦', desc: 'Place at cursor. Detonates when enemies enter.', anim: 'trap' },
  { kind: 'attack', label: 'GROUND WAVE — ▲', desc: 'A traveling wave that damages everything it crosses.', anim: 'ground' },
  { kind: 'enemy', label: 'CHASER', color: '#cc3333',
    desc: 'Sprints straight at you. Telegraphs a short windup before slamming. Dodge or strafe.' },
  { kind: 'enemy', label: 'SNIPER', color: '#88aa33',
    desc: 'Stops at range and fires a long aimed shot. Move sideways during the red telegraph ring.' },
  { kind: 'enemy', label: 'BRUISER', color: '#9922aa',
    desc: 'Slow but high-damage. Charges a heavy slam — break line of sight or dodge through.' },
  { kind: 'enemy', label: 'TURRET', color: '#ddaa22',
    desc: 'Stationary. Fires a burst of three shots. Close the distance behind cover.' },
  { kind: 'enemy', label: 'BLINK', color: '#bb44ff',
    desc: 'Teleports next to you, then strikes. Watch for the purple flash, then dodge immediately.' },
  { kind: 'enemy', label: 'SPLITTER', color: '#ff6622',
    desc: 'On death, splits into two smaller, faster halves. Kill one at a time and reposition.' },
  { kind: 'enemy', label: 'BOMBER', color: '#ff8800',
    desc: 'Runs to detonate on you. Kill from range — exploding does AoE damage.' },
  { kind: 'tip', title: 'TEMPO BAR',
    body: ['0-29 COLD: 0.7× damage','30-69 FLOWING: normal','70-89 HOT: 1.3× damage','90-99 CRITICAL: 1.8× damage + pierce','100 → AUTO-CRASH: huge AoE then reset','0 → COLD CRASH: freeze AoE'] },
];
function _tutorialPageCount() { return _TUTORIAL_PAGES.length; }

function _drawTutorialScreen(ctx, t) {
  const w = canvas.width, h = canvas.height;
  // Background
  ctx.fillStyle = '#070712'; ctx.fillRect(0, 0, w, h);
  // Back button
  ctx.fillStyle = '#1a1520';
  ctx.beginPath(); ctx.roundRect(16, 14, 150, 36, 7); ctx.fill();
  ctx.strokeStyle = '#6655aa'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#bbaadd'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◀  BACK [ESC]', 91, 38);

  const page = _TUTORIAL_PAGES[Math.max(0, Math.min(_TUTORIAL_PAGES.length - 1, tutorialPage))];

  // Title
  ctx.fillStyle = '#88ddff'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`TUTORIAL — Page ${tutorialPage + 1} of ${_TUTORIAL_PAGES.length}`, w/2, 50);

  if (page.kind === 'intro' || page.kind === 'tip') {
    ctx.fillStyle = '#ffdd44'; ctx.font = 'bold 32px monospace';
    ctx.fillText(page.title, w/2, 130);
    ctx.fillStyle = '#ddddee'; ctx.font = '18px monospace';
    for (let i = 0; i < page.body.length; i++) {
      ctx.fillText(page.body[i], w/2, 200 + i * 34);
    }
  } else if (page.kind === 'attack') {
    ctx.fillStyle = '#ffaa44'; ctx.font = 'bold 30px monospace';
    ctx.fillText(page.label, w/2, 110);
    ctx.fillStyle = '#cccccc'; ctx.font = '16px monospace';
    ctx.fillText(page.desc, w/2, 144);

    // Mini animation: a player firing the attack at a dummy target
    const pCX = w/2 - 160, pCY = h/2 + 20;
    const eCX = w/2 + 160, eCY = h/2 + 20;
    // Phase 0..1 over 1.6s
    const phase = (t * 0.625) % 1;

    // Dummy target enemy
    ctx.fillStyle = '#cc3333'; ctx.beginPath(); ctx.arc(eCX, eCY, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.fillText('TARGET', eCX, eCY - 28);

    // Player
    ctx.fillStyle = '#44aaff'; ctx.beginPath(); ctx.arc(pCX, pCY, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('YOU', pCX, pCY - 28);

    if (page.anim === 'melee') {
      // Sweep arc near the player toward target
      ctx.save();
      ctx.translate(pCX, pCY);
      const rot = -Math.PI/4 + phase * Math.PI * 0.8;
      ctx.rotate(rot);
      ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 36, -0.6, 0.6); ctx.stroke();
      ctx.restore();
    } else if (page.anim === 'projectile') {
      const px = pCX + (eCX - pCX) * phase;
      ctx.fillStyle = '#ffdd44'; ctx.beginPath(); ctx.arc(px, pCY, 6, 0, Math.PI * 2); ctx.fill();
    } else if (page.anim === 'beam') {
      const a = phase < 0.4 ? phase / 0.4 : 1 - (phase - 0.4) / 0.6;
      ctx.strokeStyle = `rgba(255,220,80,${a})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(pCX, pCY); ctx.lineTo(eCX, eCY); ctx.stroke();
    } else if (page.anim === 'dash') {
      const dx = pCX + (eCX - pCX) * phase;
      ctx.fillStyle = `rgba(80,180,255,${0.5})`;
      ctx.beginPath(); ctx.arc(dx, pCY, 18, 0, Math.PI * 2); ctx.fill();
      // motion lines
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = `rgba(120,200,255,${0.4 - i*0.08})`;
        ctx.beginPath(); ctx.moveTo(dx - 20 - i*12, pCY); ctx.lineTo(dx - 6 - i*12, pCY); ctx.stroke();
      }
    } else if (page.anim === 'trap') {
      const tx = (pCX + eCX) / 2;
      const trig = phase > 0.6;
      ctx.strokeStyle = trig ? '#ff4444' : '#ffaa44';
      ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, pCY, 24 + (trig ? phase * 30 : 0), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (page.anim === 'ground') {
      const wx = pCX + (eCX - pCX) * phase;
      ctx.strokeStyle = '#cc8833'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(wx, pCY - 30); ctx.lineTo(wx, pCY + 30); ctx.stroke();
    }
  } else if (page.kind === 'enemy') {
    ctx.fillStyle = page.color; ctx.font = 'bold 32px monospace';
    ctx.fillText(page.label, w/2, 120);

    // Render enemy with attack-windup ring (matches in-game telegraph look)
    const eCX = w/2, eCY = h/2 - 10;
    const r = 26;
    ctx.fillStyle = page.color;
    ctx.beginPath(); ctx.arc(eCX, eCY, r, 0, Math.PI * 2); ctx.fill();
    // Telegraph ring (phase 0..1)
    const tp = (t * 0.7) % 1;
    ctx.beginPath();
    ctx.arc(eCX, eCY, r + 6 + tp * 14, 0, Math.PI * 2);
    ctx.strokeStyle = tp > 0.7 ? 'rgba(255,40,40,0.95)' : 'rgba(255,140,40,0.75)';
    ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ddddee'; ctx.font = '17px monospace'; ctx.textAlign = 'center';
    _tutorialWrap(ctx, page.desc, w/2, h/2 + 80, w * 0.7, 24);
  }

  // Prev / Next buttons
  const btnY = h - 70;
  ctx.fillStyle = tutorialPage > 0 ? '#1a2a3a' : '#0d0d18';
  ctx.beginPath(); ctx.roundRect(w/2 - 200, btnY, 160, 50, 8); ctx.fill();
  ctx.strokeStyle = '#44ddff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = tutorialPage > 0 ? '#aaddff' : '#445566'; ctx.font = 'bold 16px monospace';
  ctx.fillText('◀ PREV', w/2 - 120, btnY + 32);

  const isLast = tutorialPage >= _TUTORIAL_PAGES.length - 1;
  ctx.fillStyle = !isLast ? '#1a2a3a' : '#0d0d18';
  ctx.beginPath(); ctx.roundRect(w/2 + 40, btnY, 160, 50, 8); ctx.fill();
  ctx.strokeStyle = '#44ddff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = !isLast ? '#aaddff' : '#445566';
  ctx.fillText('NEXT ▶', w/2 + 120, btnY + 32);

  ctx.fillStyle = '#666688'; ctx.font = '12px monospace';
  ctx.fillText('← / → arrows or A/D to flip pages  ·  ESC to return', w/2, btnY - 12);
}

function _tutorialWrap(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w0 of words) {
    const test = line ? line + ' ' + w0 : w0;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w0; yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

let draftBoxes = [];
function getDraftClickIndex(mx, my) {
  for (const b of draftBoxes) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.idx;
  }
  return -1;
}

// RH2: prominent visual indicator for a downed player. Shows a pulsing "DOWN"
// label, the live revive progress ring, a background ring for context, and
// HOLD-TO-REVIVE prompt + percentage.
// ── Controls overlay (char-select footer) ─────────────────────────
// Two stacked panels filling the bottom space below the character cards:
//   Top:    control reference (keyboard ↔ gamepad layout per active toggle)
//   Bottom: live "PRESS BUTTONS TO TEST" panel — confirms the gamepad works
// In coop mode, both panels split P1 + P2 side-by-side with no overlap.
function _drawControlsOverlay(ctx) {
  const margin = 14;
  const panelW = Math.min(canvas.width - 2 * margin, 1180);
  const panelX = (canvas.width - panelW) / 2;

  const p1Pad = meta.isGamepadEnabled(0);
  const p2Pad = localCoop && meta.isGamepadEnabled(1);
  // Test panel only appears when a gamepad is actually enabled — on pure
  // keyboard setups the panel is visual noise and wastes space.
  const showTestPanel = p1Pad || p2Pad;

  // Available vertical band: from above the bottom-row buttons
  // (cosmetics is at canvas.height - 74) up to ~420 px when we need room
  // for both panels. When the test panel is hidden, we stay compact so the
  // hero cards have more breathing room above.
  const panelBottom = canvas.height - 86;
  const panelTop = showTestPanel
    ? Math.max(canvas.height * 0.46, canvas.height - 380)  // tall — fits controls + pad test
    : Math.max(canvas.height * 0.62, canvas.height - 230); // compact — keyboard only
  const totalH = Math.max(150, panelBottom - panelTop);
  const gap = 6;
  // Fixed-height controls panel (enough for 2 cols × 5 lines @ 13 px + padding).
  // Whatever is left goes to the test panel; min 150 so the button grid
  // doesn't get crushed. If no test panel, controls panel claims everything.
  const ctrlH = showTestPanel ? Math.min(totalH - 150 - gap, 150) : totalH;
  const testH = showTestPanel ? (totalH - gap - ctrlH) : 0;
  const ctrlY = panelTop;
  const testY = ctrlY + ctrlH + gap;

  // ── Controls reference panel ──
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,22,0.92)';
  ctx.beginPath(); ctx.roundRect(panelX, ctrlY, panelW, ctrlH, 10); ctx.fill();
  ctx.strokeStyle = '#33445a'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.fillStyle = '#88aabb';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('CONTROLS', panelX + 16, ctrlY + 20);

  if (localCoop) {
    const colW = (panelW - 48) / 2;
    _drawSchemeColumn(ctx, panelX + 16, ctrlY + 30, colW, ctrlH - 36, 'P1', p1Pad, false);
    _drawSchemeColumn(ctx, panelX + 16 + colW + 16, ctrlY + 30, colW, ctrlH - 36, 'P2', p2Pad, true);
  } else {
    _drawSchemeColumn(ctx, panelX + 16, ctrlY + 30, panelW - 32, ctrlH - 36, '', p1Pad, false);
  }
  ctx.restore();

  if (!showTestPanel) return;

  // ── Controller test panel — only drawn when a gamepad slot is enabled ──
  ctx.save();
  ctx.fillStyle = 'rgba(14,8,18,0.94)';
  ctx.beginPath(); ctx.roundRect(panelX, testY, panelW, testH, 10); ctx.fill();
  ctx.strokeStyle = '#664488'; ctx.lineWidth = 2; ctx.stroke();

  ctx.fillStyle = '#ffccff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('🔧  CONTROLLER TEST — PRESS BUTTONS / MOVE STICKS, BOXES BELOW LIGHT UP', panelX + 16, testY + 22);

  // Show a sanity box per ENABLED slot. Previously we showed P2 whenever
  // localCoop was on, even if P2's pad toggle was off — giving a confusing
  // "no controller detected" box right next to the active P1 box.
  const slots = [];
  if (p1Pad) slots.push(0);
  if (p2Pad) slots.push(1);
  const padBoxGap = 16;
  const padBoxW = Math.floor((panelW - 32 - padBoxGap * (slots.length - 1)) / slots.length);
  const padBoxH = testH - 38;
  for (let i = 0; i < slots.length; i++) {
    const px = panelX + 16 + i * (padBoxW + padBoxGap);
    const py = testY + 32;
    _drawGamepadSanity(ctx, px, py, padBoxW, padBoxH, slots[i], true);
  }
  ctx.restore();
}

// Control reference for one scheme. `usePad` switches keyboard ↔ gamepad text.
// h is the available vertical space; lines are sized so they fit.
function _drawSchemeColumn(ctx, x, y, w, h, label, usePad, isP2) {
  ctx.fillStyle = usePad ? '#aaffe0' : '#cce0d8';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  const head = (label ? label + ' — ' : '') + (usePad ? '🎮 GAMEPAD' : '⌨ KEYBOARD');
  ctx.fillText(head, x, y + 14);

  let lines;
  if (usePad) {
    // Kept to 8 lines so the panel geometry in _drawControlsOverlay doesn't
    // have to re-flow. Kept under ~32 chars so the coop-narrow inner column
    // (≈275 px at 13 px monospace) still fits them without clipping.
    lines = [
      'Move ………… left stick',
      'Aim ………… right stick',
      'Auto-aim when stick idle',
      'Target cycle  LT prev / RT next',
      'Attack … A     Dodge … B (in move dir)',
      'Cards  LB/X = prev   RB/Y = next',
      'D-pad: direct card slot / menu nav',
      'Start = Enter     Back = B / Esc',
    ];
  } else if (isP2) {
    // Must match Input.js player2View + main.js localCoop branch:
    // W A S D movement, I/J/K/L virtual reticle (auto-aim fallback),
    // Q attack, E dodge, number row 1–4 selects P2's card.
    lines = [
      'Move ………… W A S D',
      'Aim ………… I J K L (auto-aim)',
      'Attack …… Q      Dodge … E',
      'Cards ……… 1 2 3 4',
    ];
  } else if (localCoop) {
    // P1 in coop uses right-side cluster so P2 (left side) doesn't collide:
    // arrow movement, mouse aim+click, `/` dodge, 7/8/9/0 card select.
    lines = [
      'Move ………… arrow keys',
      'Aim / Attack  mouse',
      'Dodge ……… /  (forward slash)',
      'Cards ……… 7 8 9 0',
      'Cycle card  right-click',
    ];
  } else {
    lines = [
      'Move ………… WASD or arrow keys',
      'Aim / Attack  mouse',
      'Dodge ……… SPACE',
      'Cards ……… 1 2 3 4',
      'Cycle card  right-click',
      'Pause ……… ESC',
    ];
  }

  // Two-column layout, font scales modestly with available height.
  const fontSize = h >= 110 ? 13 : (h >= 90 ? 12 : 11);
  const lh = fontSize + 3;
  ctx.font = fontSize + 'px monospace';
  ctx.fillStyle = usePad ? '#bbddee' : '#aac9cc';
  const half = Math.ceil(lines.length / 2);
  const colGap = 16;
  const colW = (w - colGap) / 2;
  for (let i = 0; i < lines.length; i++) {
    const col = i < half ? 0 : 1;
    const row = col === 0 ? i : i - half;
    ctx.fillText(lines[i], x + col * (colW + colGap), y + 30 + row * lh);
  }
}

// Live state: connected dot, stick bars, button highlights. Shows what the
// game actually receives — invaluable for confirming the gamepad works.
function _drawGamepadSanity(ctx, x, y, w, h, slot, enabled) {
  const g = input.getGamepadState(slot);
  ctx.save();
  ctx.fillStyle = g.connected ? (enabled ? 'rgba(20,40,28,0.95)' : 'rgba(20,28,38,0.95)') : 'rgba(34,18,22,0.95)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = g.connected ? (enabled ? '#44ddaa' : '#5577aa') : '#774444';
  ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = g.connected ? (enabled ? '#aaffd0' : '#bbccdd') : '#ddaaaa';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  const dot = g.connected ? '🟢' : '⚪';
  const label = 'Pad ' + (slot + 1) + ': ' + (g.connected ? (enabled ? 'ACTIVE' : 'connected (toggle on to use in-game)') : 'no controller detected');
  ctx.fillText(dot + ' ' + label, x + 8, y + 14);

  // Stick magnitude bars (left + right)
  const stickRowY = y + 24;
  const stickBarW = Math.min(80, (w - 60) / 2);
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = '#88aacc';
  ctx.fillText('L', x + 8, stickRowY + 9);
  ctx.fillStyle = '#1a2832';
  ctx.fillRect(x + 22, stickRowY, stickBarW, 8);
  ctx.fillStyle = '#44ddcc';
  ctx.fillRect(x + 22, stickRowY, stickBarW * Math.min(1, Math.hypot(g.lx || 0, g.ly || 0)), 8);

  ctx.fillStyle = '#88aacc';
  ctx.fillText('R', x + 22 + stickBarW + 12, stickRowY + 9);
  ctx.fillStyle = '#1a2832';
  ctx.fillRect(x + 22 + stickBarW + 26, stickRowY, stickBarW, 8);
  ctx.fillStyle = '#ffaa66';
  ctx.fillRect(x + 22 + stickBarW + 26, stickRowY, stickBarW * Math.min(1, Math.hypot(g.rx || 0, g.ry || 0)), 8);

  // Button row — bigger so the labels are clearly readable
  const labels = ['A','B','X','Y','LB','RB','BK','ST','↑','→','↓','←'];
  const idx    = [ 0,  1,  2,  3,  4,  5,  8,  9, 12, 13, 14, 15];
  const btnY = y + h - 22;
  const btnGap = Math.max(2, Math.floor((w - 16) / labels.length) - 2);
  const btnW = Math.max(18, Math.floor((w - 16) / labels.length) - 2);
  for (let i = 0; i < labels.length; i++) {
    const bx = x + 8 + i * (btnW + 2);
    const pressed = g.btns && g.btns[idx[i]];
    ctx.fillStyle = pressed ? '#44ff88' : 'rgba(80,90,110,0.55)';
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, 16, 3); ctx.fill();
    ctx.fillStyle = pressed ? '#0a1a0e' : '#bbccdd';
    ctx.font = pressed ? 'bold 10px monospace' : '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], bx + btnW / 2, btnY + 12);
  }
  ctx.restore();
}

// ── Network debug HUD ────────────────────────────────────────────────
// Toggle with Ctrl+N. Top-right overlay. Used to verify battle networking:
// shows role, peer count, transport, message rate, ready-state flags, and a
// scrolling log of the last 8 reliable events (in & out).
function _drawNetDebug(ctx) {
  const s = net.stats();
  const pad = 10;
  const w = 320;
  const lineH = 14;
  const logH = _netDebugLog.length * lineH + 8;
  const h = 200 + logH;
  const x = canvas.width - w - 12;
  const y = 12;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,20,0.92)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = '#33aa88'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.fillStyle = '#aaffdd';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('🛰  NETWORK DEBUG  (Ctrl+N to hide)', x + pad, y + 18);

  ctx.font = '11px monospace';
  ctx.fillStyle = '#ccddff';
  let ly = y + 38;
  const line = (label, val) => {
    ctx.fillStyle = '#88aacc'; ctx.fillText(label, x + pad, ly);
    ctx.fillStyle = '#eeffee'; ctx.fillText(val, x + pad + 130, ly);
    ly += lineH;
  };
  line('Role:',          s.role || 'solo');
  line('Strategy:',      s.strategy || '—');
  line('Peers:',         '' + (s.peerCount || 0));
  line('Connected:',     net.connected ? 'YES' : 'no');
  line('Msgs in/out:',   s.msgsIn + ' / ' + s.msgsOut);
  line('Rate (msgs/s):', (_netDebugRate.allIn || 0) + ' in · ' + (_netDebugRate.allOut || 0) + ' out');
  line('Bytes in/out:',  Math.round(s.bytesIn / 1024) + 'K / ' + Math.round(s.bytesOut / 1024) + 'K');

  ly += 4;
  ctx.fillStyle = '#aabbcc'; ctx.font = 'bold 11px monospace';
  ctx.fillText('— Sync state —', x + pad, ly); ly += lineH;
  ctx.font = '11px monospace';
  line('Phase done (us/peer):',   _localPhaseDone + ' / ' + _remotePhaseDone);
  line('Prep ready (us/peer):',   _prepReadyLocal + ' / ' + _peerIsReady());
  line('Game state:',             gameState);

  ly += 4;
  ctx.fillStyle = '#aabbcc'; ctx.font = 'bold 11px monospace';
  ctx.fillText('— Last reliable events —', x + pad, ly); ly += lineH;
  ctx.font = '11px monospace';
  if (_netDebugLog.length === 0) {
    ctx.fillStyle = '#666'; ctx.fillText('(none yet)', x + pad, ly);
  } else {
    const now = performance.now() / 1000;
    for (const e of _netDebugLog) {
      const age = (now - e.t).toFixed(1) + 's';
      ctx.fillStyle = e.dir === 'in' ? '#88ddaa' : '#ffcc88';
      ctx.fillText((e.dir === 'in' ? '◀ ' : '▶ ') + e.name + '  (' + age + ')', x + pad, ly);
      ly += lineH;
    }
  }
  ctx.restore();
}

// Centralised "go to combat" so the prep handler and BATTLE_START handler agree.
function _startCombatNow() {
  console.log(`[Prep] Hand: [${deckManager.hand.join(', ')}]`);
  particles.spawnRoomEntryFlash();
  gameState = 'playing';
  _combatStartFlash = 0.5;
  _fadeAlpha = 0;
  _ambientInit = false;
  // Reset the next-round handshake — fresh decision phase coming after this fight
  _prepReadyLocal = false;
  _prepReadyRemote = false;
  _prepReadyByPeer.clear();
}

function _drawDownedIndicator(ctx, p) {
  const cx = p.x, cy = p.y + p.r * 0.7;
  const t = performance.now() / 1000;
  const pulse = 0.7 + 0.3 * Math.sin(t * 5);
  const progress = Math.max(0, Math.min(1, p.reviveProgress || 0));
  const reviving = progress > 0.01;
  const ringR = 26;
  ctx.save();
  // Background ring (full circle, faint red) — always visible while downed
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = reviving ? 'rgba(120,200,150,0.35)' : `rgba(255,80,80,${0.35 + 0.25 * pulse})`;
  ctx.lineWidth = 4;
  ctx.stroke();
  // Progress arc (green, advances with revive timer)
  if (reviving) {
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = '#66ffaa';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#66ffaa';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // Top label: "DOWN" pulsing red, swaps to "REVIVING…" when in progress
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  if (reviving) {
    ctx.fillStyle = '#88ffaa';
    ctx.fillText('REVIVING ' + Math.round(progress * 100) + '%', cx, cy - ringR - 8);
  } else {
    ctx.fillStyle = `rgba(255, ${80 + 100 * pulse}, ${80 + 100 * pulse}, 1)`;
    ctx.fillText('▼ DOWN ▼', cx, cy - ringR - 8);
  }
  ctx.restore();
}

function _drawWorldObjects(ctx, now) {
  ctx.save();
  // Traps — sin precomputed once for all traps; globalAlpha replaces hex-alpha string build
  if (traps.length > 0) {
    const trapPulse = (Math.sin(now / 300) + 1) * 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const t of traps) {
      const col = t.color || '#ffaa44';
      ctx.globalAlpha = 0.4 + trapPulse * 0.4;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.133; // ~0x22/255
      ctx.fillStyle = col;
      ctx.fill();
      ctx.setLineDash([4, 4]);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }
  // Sigils — sin precomputed once for all sigils
  if (sigils.length > 0) {
    const sigilPulse = (Math.sin(now / 500) + 1) * 0.5;
    for (const s of sigils) {
      const r = 22 + sigilPulse * 6;
      const col = s.def.color || '#ff4400';
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.133;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      // Inner hex
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + now * 0.001;
        const hx = s.x + Math.cos(a) * (r * 0.6);
        const hy = s.y + Math.sin(a) * (r * 0.6);
        k === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.667; // ~0xaa/255
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }
  // Ground waves
  for (const w of groundWaves) {
    const t2 = w.traveled / (w.def.range || 500);
    const wx = w.x + w.dx * w.traveled;
    const wy = w.y + w.dy * w.traveled;
    const pw = (w.def.waveWidth || 30) * 2;
    const px2 = -w.dy, py2 = w.dx; // perpendicular
    ctx.beginPath();
    ctx.moveTo(wx + px2 * pw, wy + py2 * pw);
    ctx.lineTo(wx - px2 * pw, wy - py2 * pw);
    ctx.strokeStyle = w.def.color || '#cc8833';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7 * (1 - t2 * 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Echo ghosts
  for (const e of echoes) {
    const pct = 1 - e.timer / e.delay;
    ctx.globalAlpha = 0.25 + pct * 0.35;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = e.def.color || '#cc88ff';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Timer ring
    ctx.beginPath();
    ctx.arc(e.x, e.y, 22, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.strokeStyle = e.def.color || '#cc88ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Beam flashes (draw wide+faded + narrow+bright to fake glow without shadowBlur)
  for (const b of beamFlashes) {
    const t3 = 1 - b.life / b.maxLife;
    const baseAlpha = (1 - t3) * 0.85;
    const w = (b.width || 8) * (1 - t3 * 0.5);
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.strokeStyle = b.color || '#aaddff';
    // Outer glow pass
    ctx.globalAlpha = baseAlpha * 0.25;
    ctx.lineWidth = w * 3;
    ctx.stroke();
    // Inner bright pass
    ctx.globalAlpha = baseAlpha;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function _drawOrbs(ctx) {
  if (orbs.length === 0) return;
  ctx.save();
  for (const o of orbs) {
    const center = o._ownerRef || player;
    const ox = center.x + Math.cos(o.angle) * o.radius;
    const oy = center.y + Math.sin(o.angle) * o.radius;
    const alpha = Math.min(1, o.life * 2);
    ctx.globalAlpha = alpha * 0.3;
    // Glow ring (replace shadowBlur)
    ctx.beginPath();
    ctx.arc(ox, oy, 14, 0, Math.PI * 2);
    ctx.fillStyle = o.color || '#ff8844';
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(ox, oy, 7, 0, Math.PI * 2);
    ctx.fillStyle = o.color || '#ff8844';
    ctx.fill();
    // Trail line to player
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(ox, oy);
    ctx.strokeStyle = (o.color || '#ff8844') + '33';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// ── RENDER ──────────────────────────────────────────────────────
// Public render() wraps the inner draw pipeline so disconnect/sync overlays
// always paint on top, even for state blocks that early-return (intro / map /
// draft / shop / etc). Without the wrapper the modal popup is silently dropped
// after a remote partner leaves mid-run, which is the user-visible bug behind
// the "they go back to main menu without seeing why" report.
function render() {
  _renderInner();
  _drawGlobalOverlays(renderer.ctx);
}
function _renderInner() {
  renderer.clear();
  // Reset critical canvas state each frame — guards against mid-render throw leaving stale state
  renderer.ctx.globalAlpha = 1.0;
  renderer.ctx.setLineDash([]);
  renderer.ctx.shadowBlur = 0;

  // ── COSMETIC SHOP ──
  if (gameState === 'cosmeticShop') {
    ui.drawCosmeticShop(renderer.ctx, meta, performance.now() / 1000);
    if (lootBoxOpen) renderLootBoxOpen(renderer.ctx, performance.now() / 1000);
    return;
  }

  // ── COSMETIC PANEL ──
  if (gameState === 'cosmeticPanel') {
    ui.drawCosmeticPanel(renderer.ctx, cosmeticPanelCharId, cosmeticPanelTab, meta, performance.now() / 1000);
    return;
  }

  // ── INTRO ──
  if (gameState === 'intro') {
    const ctx = renderer.ctx;

    // RH2: cached background + animated schematic grid overlay
    ctx.drawImage(getMenuBackground(), 0, 0);
    {
      const _tBg = performance.now() / 1000;
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = '#66ddcc';
      ctx.lineWidth = 1;
      const step = 80;
      for (let gx = (Math.floor(_tBg * 6) % step); gx < canvas.width; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
      }
      for (let gy = 0; gy < canvas.height; gy += step) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Ambient menu particles ── RH2 palette: teal / amber / violet
    {
      const _mdt = 1 / 60;
      const _mcols = ['#44ddcc', '#ffaa66', '#aa66ff', '#ffffff', '#66ffdd', '#ffcc88'];
      if (!_menuPartsInit) {
        _menuPartsInit = true;
        for (let _mi = 0; _mi < _menuParts.length; _mi++) {
          const p = _menuParts[_mi];
          p.x = Math.random() * canvas.width;
          p.y = Math.random() * canvas.height;
          p.vx = (Math.random() - 0.5) * 16;
          p.vy = -7 - Math.random() * 16;
          p.r = 0.8 + Math.random() * 1.8;
          p.a = 0.12 + Math.random() * 0.4;
          p.col = _mcols[Math.floor(Math.random() * _mcols.length)];
        }
      }
      ctx.save();
      for (const p of _menuParts) {
        p.x += p.vx * _mdt;
        p.y += p.vy * _mdt;
        if (p.y < -10) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
        if (p.x < -10) p.x = canvas.width + 5;
        if (p.x > canvas.width + 10) p.x = -5;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Prominent living silhouette — centered lower to avoid exit button
    {
      const _tSil = performance.now() / 1000;
      const silX = canvas.width / 2, silY = canvas.height * 0.82;
      // Outer glow rings — prismatic pulse
      for (let _ring = 3; _ring >= 0; _ring--) {
        const _rPhase = _tSil * 0.5 + _ring * 0.8;
        const _rAlpha = (0.04 + Math.abs(Math.sin(_rPhase)) * 0.035) * (1 + _ring * 0.3);
        const _rScale = 120 + _ring * 35 + Math.sin(_tSil * 0.9 + _ring) * 8;
        ctx.save();
        ctx.globalAlpha = _rAlpha;
        ctx.fillStyle = getPrismaticColor(_tSil + _ring * 0.7, 90, 55 + _ring * 5);
        ctx.beginPath();
        ctx.arc(silX, silY, _rScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Core silhouette — bigger, prismatic
      const silPulse = 0.07 + Math.abs(Math.sin(_tSil * 0.7)) * 0.04;
      ctx.save();
      ctx.globalAlpha = silPulse;
      ctx.fillStyle = getPrismaticColor(_tSil, 80, 65);
      drawPlayerShape(ctx, silX, silY, 120, 'circle');
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = silPulse * 1.6;
      drawPlayerAura(ctx, silX, silY, 120, 'reactive', _tSil, 75);
      ctx.restore();
    }

    // Game icon — loaded once, drawn above title
    if (!window._introIcon) {
      window._introIcon = new Image();
      window._introIcon.src = 'imgs/icon.ico';
      window._introIconReady = false;
      window._introIcon.onload = () => { window._introIconReady = true; };
    }
    if (window._introIconReady) {
      const iconSize = 64;
      ctx.save();
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = 22;
      ctx.drawImage(window._introIcon, canvas.width / 2 - iconSize / 2, 18, iconSize, iconSize);
      ctx.restore();
    }

    // RH2 Title — split words, teal glow + amber "2" badge
    {
      const _tTitle = performance.now() / 1000;
      const cx = canvas.width / 2;
      // ROGUE HERO base
      ctx.save();
      ctx.shadowColor = '#44ddcc';
      ctx.shadowBlur = 32;
      ctx.fillStyle = '#e8fffa';
      ctx.font = 'bold 60px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ROGUE HERO', cx - 38, 116);
      ctx.restore();
      // Big "2" amber pulse
      const pulse = 0.85 + Math.sin(_tTitle * 2.4) * 0.15;
      ctx.save();
      ctx.shadowColor = '#ffaa44';
      ctx.shadowBlur = 38 * pulse;
      ctx.fillStyle = '#ffcc66';
      ctx.font = 'bold 88px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('2', cx + 222, 124);
      ctx.restore();
    }

    // Subtitle bar — twin gradient line + RH2 tagline
    {
      const _bandGrad = ctx.createLinearGradient(canvas.width / 2 - 280, 0, canvas.width / 2 + 280, 0);
      _bandGrad.addColorStop(0, 'rgba(68,221,204,0)');
      _bandGrad.addColorStop(0.5, 'rgba(255,170,68,0.45)');
      _bandGrad.addColorStop(1, 'rgba(68,221,204,0)');
      ctx.fillStyle = _bandGrad;
      ctx.fillRect(canvas.width / 2 - 280, 134, 560, 2);
    }
    ctx.fillStyle = '#88ccdd';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Tempo-Driven Co-op Roguelike  ◆  Up to 4 Players', canvas.width / 2, 158);

    const bx = Math.max(40, Math.floor(canvas.width * 0.1));
    const bw = canvas.width - bx * 2;
    const by = 172;
    const lineH = 26;
    const lines = [
      '◆ WASD / Arrow Keys to move',
      '◆ SPACE to dodge toward mouse cursor (no AP cost)',
      '◆ LEFT CLICK to attack with selected card',
      '◆ RIGHT CLICK or 1–4 keys to switch card',
      '',
      '◆ THE TEMPO BAR controls your power:',
      '    COLD  (<30)    = 0.7× damage  —  fill to 0 → ICE CRASH: massive freeze AoE!',
      '    FLOWING (30–70) = 1.0× damage, balanced play',
      '    HOT   (70–90)  = 1.3× damage, 1.2× speed, dash-attacks deal damage!',
      '    CRITICAL (90+) = 1.8× damage, attacks PIERCE  —  fills to 100 → auto CRASH!',
      '',
      '◆ Perfect Dodge: dodge just as an attack lands → slow-mo + bonus tempo',
      '◆ After each room: pick a new card for your deck',
      `◆ Clear ${FLOORS_TO_WIN} acts (each ending in a unique boss) to WIN`,
      '◆ Press ESC during combat to open the pause menu',
    ];
    const bh = 50 + lines.length * lineH + 10;
    ctx.fillStyle = 'rgba(12,12,20,0.95)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 12);
    ctx.fill();
    ctx.strokeStyle = '#2a2a55';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOW TO PLAY', canvas.width / 2, by + 34);

    ctx.fillStyle = '#ddddee';
    ctx.font = '15px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '') continue;
      // Indent zone lines slightly more
      const indent = lines[i].startsWith('    ') ? bx + 45 : bx + 22;
      ctx.fillStyle = lines[i].startsWith('    ') ? '#aabbcc' : '#ddddee';
      ctx.fillText(lines[i].trim(), indent, by + 62 + i * lineH);
    }

    // PLAY MODE buttons — SOLO / 2P LOCAL / REMOTE CO-OP
    const modeBtnH = 64, modeBtnGap = 12;
    const modeRowY = by + bh + 14;
    const modeBtnW = Math.min(260, Math.floor((canvas.width - 80 - 2 * modeBtnGap) / 3));
    const modeRowW = 3 * modeBtnW + 2 * modeBtnGap;
    const modeRowX = (canvas.width - modeRowW) / 2;
    const _modes = [
      { label: '👤  SOLO', sub: '1 player', color: '#33dd66', fill: '#0d2a16', action: 'mode_solo' },
      { label: '👥  2P LOCAL CO-OP', sub: 'Same keyboard', color: '#88dd66', fill: '#1d2a18', action: 'mode_local' },
      { label: '🌐  REMOTE CO-OP', sub: 'Up to 4, room code', color: '#44ddcc', fill: '#0d2222', action: 'mode_remote' },
    ];
    const introModeBoxes = [];
    for (let mi = 0; mi < _modes.length; mi++) {
      const m = _modes[mi];
      const mbx = modeRowX + mi * (modeBtnW + modeBtnGap);
      ctx.fillStyle = m.fill;
      ctx.beginPath(); ctx.roundRect(mbx, modeRowY, modeBtnW, modeBtnH, 10); ctx.fill();
      ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = m.color;
      ctx.font = 'bold 17px monospace'; ctx.textAlign = 'center';
      ctx.fillText(m.label, mbx + modeBtnW / 2, modeRowY + 28);
      ctx.fillStyle = 'rgba(220,235,225,0.55)';
      ctx.font = '11px monospace';
      ctx.fillText(m.sub, mbx + modeBtnW / 2, modeRowY + 48);
      introModeBoxes.push({ x: mbx, y: modeRowY, w: modeBtnW, h: modeBtnH, action: m.action });
    }
    ctx.fillStyle = 'rgba(160,200,180,0.45)';
    ctx.font = '11px monospace';
    ctx.fillText('Click a mode  ◆  ENTER picks SOLO', canvas.width / 2, modeRowY + modeBtnH + 14);
    // Compatibility: keep btnY/btnW for layout below; alias to mode row
    const btnY = modeRowY, btnH = modeBtnH + 18, btnW = modeRowW, btnX = modeRowX;

    // Volume control row
    const volY = btnY + btnH + 16;
    const vol = audio.getMasterVolume();
    const pips = 10;
    ctx.fillStyle = '#556';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VOLUME', canvas.width / 2, volY);
    const pipW = 22, pipH = 14, pipGap = 4;
    const pipTotalW = pips * (pipW + pipGap) - pipGap;
    const pipStartX = canvas.width / 2 - pipTotalW / 2;
    for (let p = 0; p < pips; p++) {
      const filled = p < Math.round(vol * pips);
      ctx.fillStyle = filled ? '#44cc88' : '#223344';
      ctx.fillRect(pipStartX + p * (pipW + pipGap), volY + 6, pipW, pipH);
    }
    const vBtnW = 30, vBtnH = 26;
    const vDownX = pipStartX - vBtnW - 6, vUpX = pipStartX + pipTotalW + 6;
    ctx.fillStyle = '#334455';
    ctx.fillRect(vDownX, volY + 4, vBtnW, vBtnH);
    ctx.fillStyle = '#aabb88';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('−', vDownX + vBtnW / 2, volY + 21);
    ctx.fillStyle = '#334455';
    ctx.fillRect(vUpX, volY + 4, vBtnW, vBtnH);
    ctx.fillStyle = '#aabb88';
    ctx.fillText('+', vUpX + vBtnW / 2, volY + 21);

    // Reset progress row
    const rstY = volY + 42;
    if (!introResetConfirm) {
      const rstW = 240, rstH = 38;
      const rstX = canvas.width / 2 - rstW / 2;
      ctx.fillStyle = '#1e0a0a';
      ctx.beginPath();
      ctx.roundRect(rstX, rstY, rstW, rstH, 6);
      ctx.fill();
      ctx.strokeStyle = '#cc3333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ff6655';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠  Reset All Progress', canvas.width / 2, rstY + 24);

      // Exit button
      const exitW = 200, exitH = 38;
      const exitX = canvas.width / 2 - exitW / 2;
      const exitY = rstY + rstH + 12;
      ctx.fillStyle = '#0e0e1a';
      ctx.beginPath();
      ctx.roundRect(exitX, exitY, exitW, exitH, 6);
      ctx.fill();
      ctx.strokeStyle = '#555577';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#8888aa';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('EXIT GAME', canvas.width / 2, exitY + 24);

      introBoxes = [
        ...introModeBoxes,
        { x: vDownX, y: volY + 4, w: vBtnW, h: vBtnH, action: 'vol_down' },
        { x: vUpX, y: volY + 4, w: vBtnW, h: vBtnH, action: 'vol_up' },
        { x: rstX, y: rstY, w: rstW, h: rstH, action: 'reset_confirm' },
        { x: exitX, y: exitY, w: exitW, h: exitH, action: 'exit' },
      ];
    } else {
      ctx.fillStyle = '#ff5555';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠  Are you sure? This cannot be undone!', canvas.width / 2, rstY + 16);
      const yesW = 140, noW = 140, gap = 16;
      const yesX = canvas.width / 2 - yesW - gap / 2;
      const noX = canvas.width / 2 + gap / 2;
      ctx.fillStyle = '#551111';
      ctx.fillRect(yesX, rstY + 22, yesW, 32);
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5; ctx.strokeRect(yesX, rstY + 22, yesW, 32);
      ctx.fillStyle = '#ff6666'; ctx.font = 'bold 13px monospace';
      ctx.fillText('YES — RESET', yesX + yesW / 2, rstY + 43);
      ctx.fillStyle = '#113322';
      ctx.fillRect(noX, rstY + 22, noW, 32);
      ctx.strokeStyle = '#44aa66'; ctx.lineWidth = 1.5; ctx.strokeRect(noX, rstY + 22, noW, 32);
      ctx.fillStyle = '#44dd88'; ctx.font = 'bold 13px monospace';
      ctx.fillText('NO — CANCEL', noX + noW / 2, rstY + 43);
      introBoxes = [
        ...introModeBoxes,
        { x: vDownX, y: volY + 4, w: vBtnW, h: vBtnH, action: 'vol_down' },
        { x: vUpX, y: volY + 4, w: vBtnW, h: vBtnH, action: 'vol_up' },
        { x: yesX, y: rstY + 22, w: yesW, h: 32, action: 'reset_do' },
        { x: noX, y: rstY + 22, w: noW, h: 32, action: 'reset_cancel' },
      ];
    }
    return;
  }

  // ── CHARACTER SELECT ──
  if (gameState === 'charSelect') {
    const ctx = renderer.ctx;

    // RH2 char-select background — shared cached gradient
    ctx.drawImage(getMenuBackground(), 0, 0);

    ctx.save();
    ctx.shadowColor = '#44ddcc';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#e8fffa';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CHOOSE YOUR HERO', canvas.width / 2, 58);
    ctx.restore();

    {
      const _bandGrad = ctx.createLinearGradient(canvas.width / 2 - 220, 0, canvas.width / 2 + 220, 0);
      _bandGrad.addColorStop(0, 'rgba(68,221,204,0)');
      _bandGrad.addColorStop(0.5, 'rgba(255,170,68,0.45)');
      _bandGrad.addColorStop(1, 'rgba(68,221,204,0)');
      ctx.fillStyle = _bandGrad;
      ctx.fillRect(canvas.width / 2 - 220, 66, 440, 2);
    }

    ctx.fillStyle = '#88aabb';
    ctx.font = '14px monospace';
    ctx.fillText(`Runs: ${meta.state.totalRuns}  |  Wins: ${meta.state.totalWins}  |  Best Floor: ${meta.state.bestFloor}`, canvas.width / 2, 90);

    charSelectBoxes = [];

    // ── MAIN MENU button — top-left, always visible ──
    {
      const ctx2 = renderer.ctx;
      const mbW = 160, mbH = 38, mbX = 16, mbY = 14;
      ctx2.fillStyle = '#1a1520';
      ctx2.beginPath();
      ctx2.roundRect(mbX, mbY, mbW, mbH, 7);
      ctx2.fill();
      ctx2.strokeStyle = '#6655aa';
      ctx2.lineWidth = 1.5;
      ctx2.stroke();
      ctx2.fillStyle = '#bbaadd';
      ctx2.font = 'bold 14px monospace';
      ctx2.textAlign = 'center';
      ctx2.fillText('◀  MAIN MENU', mbX + mbW / 2, mbY + 24);
      charSelectBoxes.push({ x: mbX, y: mbY, w: mbW, h: mbH, action: 'mainMenu' });

      // ── REMOTE MULTIPLAYER button — to the right of MAIN MENU ──
      // Hidden when already inside a remote lobby: the button would just be a
      // no-op (we're already connected) and takes up slot the TUTORIAL button
      // should slide into.
      // Host/client/any-peer-connected all count as "already inside a remote
      // lobby" — both sides then see the REMOTE LOBBY button disappear. The
      // peer-count guard catches the edge case where a role cleanup lagged
      // behind a disconnect; without it a host who just torn down their
      // session would briefly see the button return.
      const _alreadyInRemote = net.role !== 'solo' || (net.peers && net.peers.size > 0);
      const lbW = 200, lbH = 38, lbX = mbX + mbW + 10, lbY = mbY;
      if (!_alreadyInRemote) {
        ctx2.fillStyle = '#10202a';
        ctx2.beginPath();
        ctx2.roundRect(lbX, lbY, lbW, lbH, 7);
        ctx2.fill();
        ctx2.strokeStyle = '#44ddcc';
        ctx2.lineWidth = 1.5;
        ctx2.stroke();
        ctx2.fillStyle = '#88eedd';
        ctx2.font = 'bold 13px monospace';
        ctx2.textAlign = 'center';
        ctx2.fillText('🌐  REMOTE LOBBY', lbX + lbW / 2, lbY + 24);
        charSelectBoxes.push({ x: lbX, y: lbY, w: lbW, h: lbH, action: 'lobby' });
      }

      // ── TUTORIAL button — slides left to fill the REMOTE LOBBY gap when hidden ──
      const _tbLeftAnchor = _alreadyInRemote ? (mbX + mbW + 10) : (lbX + lbW + 10);
      const tbW = 160, tbH = 38, tbX = _tbLeftAnchor, tbY = lbY;
      ctx2.fillStyle = '#1a2418';
      ctx2.beginPath();
      ctx2.roundRect(tbX, tbY, tbW, tbH, 7);
      ctx2.fill();
      ctx2.strokeStyle = '#88dd66';
      ctx2.lineWidth = 1.5;
      ctx2.stroke();
      ctx2.fillStyle = '#bbffaa';
      ctx2.font = 'bold 13px monospace';
      ctx2.textAlign = 'center';
      ctx2.fillText('📖  TUTORIAL', tbX + tbW / 2, tbY + 24);
      charSelectBoxes.push({ x: tbX, y: tbY, w: tbW, h: tbH, action: 'tutorial' });
    }

    // ── PLAYERS toggle button (1P / 2P local co-op) — top-right ──
    // Suppressed in remote multiplayer: the remote peer is already player 2,
    // so adding a local split-screen P2 would create a 3rd player with no
    // matching slot on the host. Showing an un-actionable button is worse
    // than hiding it outright. Also force `localCoop` off here in case it
    // was toggled on before the user joined a lobby.
    const inRemoteMP = net.role !== 'solo';
    if (inRemoteMP && localCoop) localCoop = false;
    {
      const ctx2 = renderer.ctx;
      const cbW = 224, cbH = 38, cbX = canvas.width - cbW - 16;
      // Coop button Y — push offscreen when hidden so the gamepad toggle
      // block below still anchors relative to it without any dead space.
      const coopBtnY = inRemoteMP ? -44 : 14;
      const cbY = coopBtnY;
      const on = localCoop;
      if (!inRemoteMP) {
        ctx2.fillStyle = on ? '#1d2a18' : '#1a1520';
        ctx2.beginPath();
        ctx2.roundRect(cbX, cbY, cbW, cbH, 7);
        ctx2.fill();
        ctx2.strokeStyle = on ? '#88dd66' : '#6655aa';
        ctx2.lineWidth = 1.5;
        ctx2.stroke();
        ctx2.fillStyle = on ? '#aaff88' : '#bbaadd';
        ctx2.font = 'bold 14px monospace';
        ctx2.textAlign = 'center';
        ctx2.font = 'bold 13px monospace';
        ctx2.fillText(on ? '👥  2P CO-OP — ON' : '👤  SOLO — CLICK FOR 2P', cbX + cbW / 2, cbY + 24);
        charSelectBoxes.push({ x: cbX, y: cbY, w: cbW, h: cbH, action: 'toggleCoop' });
      }

      // ── Gamepad toggles — sit just below the coop button, or at the
      // top-right when the coop button is hidden (remote MP).
      const gp1On = meta.isGamepadEnabled(0);
      const gp1Connected = input.isGamepadConnected(0);
      const gp1bX = cbX, gp1bY = inRemoteMP ? 14 : (cbY + cbH + 8), gp1bW = on ? Math.floor((cbW - 8) / 2) : cbW, gp1bH = 32;
      ctx2.fillStyle = gp1On ? '#142a30' : '#1a1520';
      ctx2.beginPath(); ctx2.roundRect(gp1bX, gp1bY, gp1bW, gp1bH, 6); ctx2.fill();
      ctx2.strokeStyle = gp1On ? '#44ddcc' : '#6655aa'; ctx2.lineWidth = 1.5; ctx2.stroke();
      ctx2.fillStyle = gp1On ? '#88ffee' : '#bbaadd';
      ctx2.font = 'bold 11px monospace';
      const gp1Dot = gp1Connected ? '🟢' : '⚪';
      ctx2.fillText(gp1Dot + (on ? ' P1 PAD' : ' GAMEPAD') + (gp1On ? ' ON' : ' OFF'), gp1bX + gp1bW / 2, gp1bY + 21);
      charSelectBoxes.push({ x: gp1bX, y: gp1bY, w: gp1bW, h: gp1bH, action: 'toggleGamepadP1' });

      if (on) {
        const gp2On = meta.isGamepadEnabled(1);
        const gp2Connected = input.isGamepadConnected(1);
        const gp2bX = gp1bX + gp1bW + 8, gp2bY = gp1bY, gp2bW = gp1bW, gp2bH = gp1bH;
        ctx2.fillStyle = gp2On ? '#2a1820' : '#1a1520';
        ctx2.beginPath(); ctx2.roundRect(gp2bX, gp2bY, gp2bW, gp2bH, 6); ctx2.fill();
        ctx2.strokeStyle = gp2On ? '#ff88aa' : '#6655aa'; ctx2.lineWidth = 1.5; ctx2.stroke();
        ctx2.fillStyle = gp2On ? '#ffbbcc' : '#bbaadd';
        ctx2.font = 'bold 11px monospace';
        const gp2Dot = gp2Connected ? '🟢' : '⚪';
        ctx2.fillText(gp2Dot + ' P2 PAD' + (gp2On ? ' ON' : ' OFF'), gp2bX + gp2bW / 2, gp2bY + 21);
        charSelectBoxes.push({ x: gp2bX, y: gp2bY, w: gp2bW, h: gp2bH, action: 'toggleGamepadP2' });
      }

      // Bottom P1/P2 help strip is gone — `_drawControlsOverlay` (below)
      // already renders the authoritative two-column controls reference;
      // the old strip showed a second copy with stale/mismatched bindings.
    }
    const chars = CharacterList;
    const GAP = 10;
    // Responsive sizing: fit all chars on screen — larger cards
    const CARD_W = Math.min(360, Math.floor((canvas.width - 30 - (chars.length - 1) * GAP) / chars.length));
    // Leave ~220px of vertical space at the bottom for the controls + sanity-test panels.
    const CARD_H = Math.min(440, Math.floor(canvas.height * 0.58));
    const totalW = chars.length * CARD_W + (chars.length - 1) * GAP;
    const startX = (canvas.width - totalW) / 2;
    const startY = 104;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const x = startX + i * (CARD_W + GAP);
      const unlocked = meta.isCharacterUnlocked(ch.id);
      const isSelected = selectedCharId === ch.id;

      ctx.save();
      ctx.shadowColor = isSelected ? ch.color : 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = isSelected ? 25 : 10;

      let grad = ctx.createLinearGradient(x, startY, x, startY + CARD_H);
      grad.addColorStop(0, unlocked ? '#1a1a28' : '#0d0d12');
      grad.addColorStop(1, unlocked ? '#111120' : '#080810');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, startY, CARD_W, CARD_H, 16);
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Hover glow ring (outside card border)
      const _csMx = input.mouse.x, _csMy = input.mouse.y;
      const _csHovered = _csMx >= x && _csMx <= x + CARD_W && _csMy >= startY && _csMy <= startY + CARD_H;
      if (_csHovered && unlocked) {
        const _csGT = performance.now() / 1000;
        ctx.save();
        ctx.shadowColor = ch.color;
        ctx.shadowBlur = 22 + Math.sin(_csGT * 3) * 7;
        ctx.strokeStyle = ch.color;
        ctx.globalAlpha = 0.28 + 0.12 * Math.abs(Math.sin(_csGT * 2.5));
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x - 4, startY - 4, CARD_W + 8, CARD_H + 8, 20);
        ctx.stroke();
        ctx.restore();
      }

      // Animated color stripe (pulsing brightness)
      {
        const _csT = performance.now() / 1000;
        const _csPulse = 0.55 + 0.45 * Math.abs(Math.sin(_csT * 1.6 + i * 1.1));
        ctx.globalAlpha = _csPulse;
        ctx.fillStyle = unlocked ? ch.color : '#333';
        ctx.fillRect(x, startY, 5, CARD_H);
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = isSelected ? ch.color : (unlocked ? '#444' : '#222');
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.stroke();

      // RH2 multiplayer: show every remote peer's pick ring + READY ribbon on
      // the appropriate character cards so the local player has clear feedback
      // about what the partners are choosing. In 3–4P setups multiple peers
      // can even share the same character, so gather all matches here.
      const isMP = net.role !== 'solo' && net.peers.size > 0;
      const _remoteMatchingPeers = [];
      if (isMP) {
        for (const [pid, cid] of _remoteCharIds) {
          if (cid === ch.id) _remoteMatchingPeers.push(pid);
        }
      }
      const isRemotePick = _remoteMatchingPeers.length > 0;
      if (isRemotePick) {
        const _t = performance.now() / 1000;
        const _pulse = 0.55 + 0.35 * Math.sin(_t * 3.4);
        ctx.save();
        ctx.shadowColor = '#ff9944';
        ctx.shadowBlur = 18 * _pulse;
        ctx.strokeStyle = '#ff9944';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x - 6, startY - 6, CARD_W + 12, CARD_H + 12, 18);
        ctx.stroke();
        ctx.restore();
        // "PICK" badge top-left — list every peer that chose this char
        ctx.fillStyle = '#ff9944';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        const labels = _remoteMatchingPeers
          .map(pid => 'P' + ((_peerToIndex.get(pid) || 1) + 1))
          .join(' / ');
        ctx.fillText(labels + ' PICK', x + 12, startY - 12);
      }
      // READY ribbon overlays. The local-ready flag is `_clientReady` on the
      // client side; the host has no in-charSelect "ready" — they go straight
      // to START RUN once the partner has readied.
      const localReady = (net.role === 'client') && _clientReady;
      if (isMP && isSelected && localReady) {
        _drawReadyRibbon(ctx, x + CARD_W - 10, startY + 18, '#44ff88', 'YOU READY');
      }
      if (isRemotePick) {
        let _ribbonY = startY + 42;
        for (const pid of _remoteMatchingPeers) {
          if (_remoteReadyByPeer.get(pid)) {
            const label = 'P' + ((_peerToIndex.get(pid) || 1) + 1) + ' READY';
            _drawReadyRibbon(ctx, x + CARD_W - 10, _ribbonY, '#ff9944', label);
            _ribbonY += 22;
          }
        }
      }

      if (!unlocked) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x, startY, CARD_W, CARD_H);
        ctx.fillStyle = '#555';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LOCKED', x + CARD_W / 2, startY + CARD_H / 2 - 16);
        ctx.fillStyle = '#ff6644';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(ch.name, x + CARD_W / 2, startY + CARD_H / 2 + 12);
        ctx.fillStyle = '#888';
        ctx.font = '13px monospace';
        const cond = ch.unlockConditionText || 'Complete a run to unlock';
        ui._wrapText(ctx, cond, x + 15, startY + CARD_H / 2 + 28, CARD_W - 30, 15);
        // Diagonal shimmer sweep over locked card
        {
          const _lsT = (performance.now() / 1000 * 0.45 + i * 0.4) % 1;
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(x, startY, CARD_W, CARD_H, 16);
          ctx.clip();
          const _lsX = x - 40 + (CARD_W + 80) * _lsT;
          const _lsGrad = ctx.createLinearGradient(_lsX - 30, startY, _lsX + 30, startY + CARD_H);
          _lsGrad.addColorStop(0, 'rgba(255,255,255,0)');
          _lsGrad.addColorStop(0.5, 'rgba(255,255,255,0.07)');
          _lsGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = _lsGrad;
          ctx.fillRect(x, startY, CARD_W, CARD_H);
          ctx.restore();
        }
      } else {
        const charStats = meta.getCharStats(ch.id);
        const masteryLevel = meta.getMasteryLevel(ch.id);
        const masteryRuns = meta.getMasteryRuns(ch.id);
        const THRESHOLDS = [1, 3, 5, 10];
        const nextThreshold = THRESHOLDS[masteryLevel] || null;

        ctx.fillStyle = ch.color;
        ctx.font = `bold ${Math.min(34, Math.max(22, Math.floor(CARD_W / 8)))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(ch.name, x + CARD_W / 2, startY + 38);
        ctx.fillStyle = '#aabbcc';
        ctx.font = `bold ${Math.min(17, Math.max(13, Math.floor(CARD_W / 14)))}px monospace`;
        ctx.fillText(ch.title, x + CARD_W / 2, startY + 60);

        // Description
        ctx.fillStyle = '#99aabb';
        ctx.font = '15px monospace';
        const descLines = ui._wrapTextLines(ch.description, CARD_W - 20, 15);
        for (let dl = 0; dl < Math.min(descLines.length, 4); dl++) {
          ctx.fillText(descLines[dl], x + CARD_W / 2, startY + 84 + dl * 19);
        }

        // Stats: two rows so they don't crowd each other
        const statsY = startY + 162;
        ctx.font = '15px monospace';
        ctx.fillStyle = '#ee5555';
        ctx.fillText(`♥ ${ch.hp} HP`, x + CARD_W / 3, statsY);
        ctx.fillStyle = '#44aaff';
        ctx.fillText(`${ch.apRegen} AP/s`, x + CARD_W * 2 / 3, statsY);
        ctx.fillStyle = '#44ff88';
        ctx.font = '15px monospace';
        ctx.fillText(`${ch.baseSpeed} SPD`, x + CARD_W / 2, statsY + 22);

        // Per-char stats
        ctx.fillStyle = '#6677aa';
        ctx.font = '14px monospace';
        ctx.fillText(`Runs: ${charStats.runs}  ·  Wins: ${charStats.wins}`, x + CARD_W / 2, statsY + 44);

        // Mastery progress bar
        const masY = statsY + 68;
        const masBarH = 20;
        ctx.fillStyle = '#222235';
        ctx.fillRect(x + 8, masY, CARD_W - 16, masBarH);
        const masThresh = nextThreshold || THRESHOLDS[THRESHOLDS.length - 1];
        const masPct = nextThreshold ? Math.min(1, masteryRuns / masThresh) : 1;
        const masColor = masteryLevel >= 4 ? '#ffd700' : (masteryLevel >= 2 ? '#cc88ff' : ch.color);
        ctx.fillStyle = masColor + '99';
        ctx.fillRect(x + 8, masY, (CARD_W - 16) * masPct, masBarH);
        ctx.strokeStyle = masColor + '66'; ctx.lineWidth = 1; ctx.strokeRect(x + 8, masY, CARD_W - 16, masBarH);
        ctx.fillStyle = '#ddd';
        ctx.font = 'bold 14px monospace';
        const masLabel = masteryLevel >= 4 ? 'MASTERY MAX' : `Lv${masteryLevel}→${masteryLevel + 1}: ${masteryRuns}/${masThresh}`;
        ctx.fillText(masLabel, x + CARD_W / 2, masY + masBarH - 3);

        // Mastery card unlocks
        ctx.fillStyle = '#44bb77';
        ctx.font = 'bold 15px monospace';
        ctx.fillText('MASTERY CARDS', x + CARD_W / 2, masY + masBarH + 20);
        const mCards = ch.masteryCards || [];
        for (let mc = 0; mc < Math.min(mCards.length, 4); mc++) {
          const unlocked = mc < masteryLevel;
          const cDef = CardDefinitions[mCards[mc]];
          const cName = cDef ? cDef.name : mCards[mc];
          ctx.fillStyle = unlocked ? '#88ffaa' : '#445566';
          ctx.font = `${unlocked ? 'bold ' : ''}14px monospace`;
          ctx.fillText(`Lv${mc + 1}: ${unlocked ? cName : '???'}`, x + CARD_W / 2, masY + masBarH + 40 + mc * 20);
        }

        // Difficulty unlock badges — taller with larger font
        const maxD = meta.getMaxDifficulty(ch.id);
        const badgeH = 28;
        const badgeY = startY + CARD_H - badgeH - 8;
        const badgeW = Math.floor((CARD_W - 16) / 3);
        for (let d = 0; d <= 2; d++) {
          const bx2 = x + 8 + d * badgeW;
          ctx.fillStyle = d <= maxD ? DIFFICULTY_COLORS[d] + '33' : '#111';
          ctx.fillRect(bx2, badgeY, badgeW - 2, badgeH);
          ctx.fillStyle = d <= maxD ? DIFFICULTY_COLORS[d] : '#444';
          ctx.font = d <= maxD ? 'bold 15px monospace' : '14px monospace';
          ctx.fillText(DIFFICULTY_NAMES[d], bx2 + (badgeW - 2) / 2, badgeY + badgeH * 0.65);
        }

        // Customize button (above difficulty badges)
        if (meta.cosmeticsUnlocked()) {
          const custH = 36, custY = badgeY - custH - 8;
          const custX = x + 8, custW = CARD_W - 16;
          const tNow = performance.now() / 1000;
          ctx.save();
          ctx.shadowColor = getPrismaticColor(tNow, 80, 65);
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#0e1a2e';
          ctx.beginPath(); ctx.roundRect(custX, custY, custW, custH, 8); ctx.fill();
          ctx.strokeStyle = getPrismaticColor(tNow, 80, 65);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = getPrismaticColor(tNow, 80, 80);
          ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
          ctx.fillText('\u2756 CUSTOMIZE', custX + custW / 2, custY + 23);
          ctx.restore();
          charSelectBoxes.push({ x: custX, y: custY, w: custW, h: custH, charId: ch.id, action: 'customize' });
        }
      }
      charSelectBoxes.push({ x, y: startY, w: CARD_W, h: CARD_H, charId: ch.id, action: 'select' });
      ctx.restore();
    }

    if (selectedCharId) {
      const btnY = startY + CARD_H + 30;
      const diffBtnX = canvas.width / 2 - 160, diffBtnW = 150, diffBtnH = 40;
      const ctx2 = renderer.ctx;
      ctx2.fillStyle = '#1a1a28';
      ctx2.fillRect(diffBtnX, btnY, diffBtnW, diffBtnH);
      ctx2.strokeStyle = DIFFICULTY_COLORS[selectedDifficulty];
      ctx2.lineWidth = 2;
      ctx2.strokeRect(diffBtnX, btnY, diffBtnW, diffBtnH);
      ctx2.fillStyle = DIFFICULTY_COLORS[selectedDifficulty];
      ctx2.font = 'bold 16px monospace';
      ctx2.textAlign = 'center';
      ctx2.fillText(DIFFICULTY_NAMES[selectedDifficulty], diffBtnX + diffBtnW / 2, btnY + 26);
      charSelectBoxes.push({ x: diffBtnX, y: btnY, w: diffBtnW, h: diffBtnH, action: 'difficulty' });

      const startBtnX = canvas.width / 2 + 10, startBtnW = 180, startBtnH = 44;
      if (net.role === 'client') {
        // 3-state button: no char → grey hint | char picked, not ready → green READY UP | ready → grey waiting
        const canReady = !!selectedCharId && !_clientReady;
        const btnFill   = _clientReady ? '#181820' : canReady ? '#1a3322' : '#181820';
        const btnStroke = _clientReady ? '#445566' : canReady ? '#44ff88' : '#334455';
        const btnLabel  = _clientReady ? 'WAITING FOR HOST…' : canReady ? 'READY UP ✓' : 'SELECT HERO FIRST';
        const btnColor  = _clientReady ? '#556677' : canReady ? '#44ff88' : '#445566';
        ctx2.fillStyle = btnFill;
        ctx2.beginPath(); ctx2.roundRect(startBtnX, btnY, startBtnW, startBtnH, 8); ctx2.fill();
        ctx2.strokeStyle = btnStroke; ctx2.lineWidth = 2; ctx2.stroke();
        ctx2.fillStyle = btnColor; ctx2.font = 'bold 16px monospace';
        ctx2.fillText(btnLabel, startBtnX + startBtnW / 2, btnY + 29);
        if (canReady) charSelectBoxes.push({ x: startBtnX, y: btnY, w: startBtnW, h: startBtnH, action: 'ready' });
        // Show P2 ready status below button for host view (skip for client)
      } else {
        // Host button — START RUN. In 3–4P setups ALL remote peers must be
        // ready before the host can start; otherwise a late-ready player
        // misses the GAME_STARTED broadcast window.
        let peersReady = 0, peersTotal = 0;
        if (net.role === 'host' && net.peers.size > 0) {
          for (const [pid] of net.peers) {
            peersTotal++;
            if (_remoteReadyByPeer.get(pid)) peersReady++;
          }
        }
        const allRemotesReady = peersTotal === 0 || peersReady === peersTotal;
        const waitingForP2 = net.role === 'host' && net.peers.size > 0 && !allRemotesReady;
        ctx2.fillStyle = waitingForP2 ? '#1a1a22' : '#225533';
        ctx2.beginPath(); ctx2.roundRect(startBtnX, btnY, startBtnW, startBtnH, 8); ctx2.fill();
        ctx2.strokeStyle = waitingForP2 ? '#554466' : '#44ff88'; ctx2.lineWidth = 2; ctx2.stroke();
        ctx2.fillStyle = waitingForP2 ? '#886699' : '#44ff88';
        ctx2.font = waitingForP2 ? 'bold 14px monospace' : 'bold 18px monospace';
        const waitLabel = peersTotal > 1
          ? `WAITING ${peersReady}/${peersTotal}…`
          : 'WAITING FOR P2…';
        ctx2.fillText(waitingForP2 ? waitLabel : 'START RUN', startBtnX + startBtnW / 2, btnY + 29);
        // Only register the click box when actually startable
        if (!waitingForP2) {
          charSelectBoxes.push({ x: startBtnX, y: btnY, w: startBtnW, h: startBtnH, action: 'start' });
        }
        // Peer ready tally below the button
        if (net.role === 'host' && net.peers.size > 0) {
          ctx2.fillStyle = allRemotesReady ? '#44ff88' : '#887799';
          ctx2.font = '12px monospace';
          const status = allRemotesReady
            ? `ALL ${peersTotal} READY ✓`
            : `${peersReady}/${peersTotal} READY — still picking…`;
          ctx2.fillText(status, startBtnX + startBtnW / 2, btnY + startBtnH + 16);
        }
      }
    } else {
      const ctx2 = renderer.ctx;
      ctx2.fillStyle = '#555';
      ctx2.font = '16px monospace';
      ctx2.textAlign = 'center';
      ctx2.fillText('Click a hero to select them', canvas.width / 2, startY + CARD_H + 50);
    }

    const bonusCards = meta.state.unlockedBonusCards;
    if (bonusCards.length > 0) {
      const ctx2 = renderer.ctx;
      ctx2.fillStyle = '#555';
      ctx2.font = '11px monospace';
      ctx2.textAlign = 'center';
      ctx2.fillText(`Bonus Cards Unlocked: ${bonusCards.map(c => CardDefinitions[c]?.name || c).join(', ')}`, canvas.width / 2, canvas.height - 20);
    }

    // Cosmetics Shop button — bottom-right, visible after first run
    if (meta.cosmeticsUnlocked()) {
      const ctx2 = renderer.ctx;
      const cosmBtnW = 270, cosmBtnH = 54;
      const cosmBtnX = canvas.width - cosmBtnW - 20;
      const cosmBtnY = canvas.height - cosmBtnH - 20;
      const gold = meta.getGold();
      const t2 = performance.now() / 1000;
      const pulse = 0.85 + 0.15 * Math.sin(t2 * 2.2);
      ctx2.save();
      ctx2.shadowColor = getPrismaticColor(t2, 90, 65);
      ctx2.shadowBlur = 18 * pulse;
      ctx2.fillStyle = '#0a1220';
      ctx2.beginPath();
      ctx2.roundRect(cosmBtnX, cosmBtnY, cosmBtnW, cosmBtnH, 10);
      ctx2.fill();
      ctx2.strokeStyle = getPrismaticColor(t2, 90, 70);
      ctx2.lineWidth = 2.5;
      ctx2.stroke();
      ctx2.shadowBlur = 0;
      ctx2.fillStyle = getPrismaticColor(t2, 90, 82);
      ctx2.font = 'bold 17px monospace';
      ctx2.textAlign = 'center';
      ctx2.fillText(`\u2728 COSMETICS SHOP`, cosmBtnX + cosmBtnW / 2, cosmBtnY + 24);
      ctx2.fillStyle = getPrismaticColor(t2 + 1, 70, 65);
      ctx2.font = '13px monospace';
      ctx2.fillText(`${gold} gold available`, cosmBtnX + cosmBtnW / 2, cosmBtnY + 42);
      ctx2.restore();
      charSelectBoxes.push({ x: cosmBtnX, y: cosmBtnY, w: cosmBtnW, h: cosmBtnH, action: 'cosmetics' });
    }

    // ── Always-visible controls overlay + gamepad sanity test ──
    _drawControlsOverlay(renderer.ctx);

    // MP quit-to-menu confirmation overlay — intercepts the Main Menu
    // button when a remote session is active so a stray click can't end
    // the whole run for both players.
    if (_charSelectQuitConfirm && net.role !== 'solo' && net.peers.size > 0) {
      const ctx3 = renderer.ctx;
      ctx3.fillStyle = 'rgba(0,0,0,0.7)';
      ctx3.fillRect(0, 0, canvas.width, canvas.height);
      const pw = 480, ph = 220;
      const px = (canvas.width - pw) / 2, py = (canvas.height - ph) / 2;
      ctx3.fillStyle = '#0e0e1a';
      ctx3.beginPath(); ctx3.roundRect(px, py, pw, ph, 14); ctx3.fill();
      ctx3.strokeStyle = '#ff6644'; ctx3.lineWidth = 2; ctx3.stroke();
      ctx3.fillStyle = '#ff6644';
      ctx3.font = 'bold 22px monospace';
      ctx3.textAlign = 'center';
      ctx3.fillText('LEAVE TO MAIN MENU?', canvas.width / 2, py + 50);
      ctx3.fillStyle = '#ffaa44';
      ctx3.font = '13px monospace';
      ctx3.fillText('⚠ This will END the remote session for all players.', canvas.width / 2, py + 82);
      const btnW = 180, btnH = 44, gap = 16;
      const byy = py + ph - 80;
      const leaveX = canvas.width / 2 - btnW - gap / 2;
      const cancelX = canvas.width / 2 + gap / 2;
      ctx3.fillStyle = '#2e1a1a';
      ctx3.beginPath(); ctx3.roundRect(leaveX, byy, btnW, btnH, 8); ctx3.fill();
      ctx3.strokeStyle = '#ff5555'; ctx3.stroke();
      ctx3.fillStyle = '#ff5555'; ctx3.font = 'bold 15px monospace';
      ctx3.fillText('YES, LEAVE', leaveX + btnW / 2, byy + 28);
      ctx3.fillStyle = '#1a2e22';
      ctx3.beginPath(); ctx3.roundRect(cancelX, byy, btnW, btnH, 8); ctx3.fill();
      ctx3.strokeStyle = '#44ff88'; ctx3.stroke();
      ctx3.fillStyle = '#44ff88'; ctx3.font = 'bold 15px monospace';
      ctx3.fillText('CANCEL', cancelX + btnW / 2, byy + 28);
      // Register as charSelect buttons so the handler picks them up.
      charSelectBoxes.push({ x: leaveX, y: byy, w: btnW, h: btnH, action: 'mainMenu' });
      charSelectBoxes.push({ x: cancelX, y: byy, w: btnW, h: btnH, action: 'quit_cancel_cs' });
    }
    // Disconnect popup is drawn in _drawGlobalOverlays() (wrapped around
    // the inner render) so we don't need an inline call here anymore.
    return;
  }

  // ── TUTORIAL (RH2 #15) ──
  if (gameState === 'tutorial') {
    _drawTutorialScreen(renderer.ctx, performance.now() / 1000);
    return;
  }

  // ── LOBBY (remote co-op) ──
  if (gameState === 'lobby') {
    const ctx = renderer.ctx;
    // Background — shared cached gradient
    ctx.drawImage(getMenuBackground(), 0, 0);

    // Title
    ctx.save();
    ctx.shadowColor = '#44ddcc';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#e8fffa';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MULTIPLAYER LOBBY', canvas.width / 2, 64);
    ctx.restore();

    lobbyBoxes = [];

    // Back button — top-left
    const bbW = 140, bbH = 36, bbX = 16, bbY = 16;
    ctx.fillStyle = '#1a1520';
    ctx.beginPath(); ctx.roundRect(bbX, bbY, bbW, bbH, 7); ctx.fill();
    ctx.strokeStyle = '#6655aa'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#bbaadd';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('◀  CHAR SELECT', bbX + bbW / 2, bbY + 23);
    lobbyBoxes.push({ x: bbX, y: bbY, w: bbW, h: bbH, action: 'back' });

    const cx = canvas.width / 2;

    if (lobbyMode === 'menu') {
      // Description
      ctx.fillStyle = '#88aabb';
      ctx.font = '14px monospace';
      ctx.fillText('Play with up to 4 players over the internet', cx, 110);

      // Connection banner — preflight (network OK) → ready, in-room → connected, else error
      {
        const wbW = 460, wbH = 38, wbX = cx - wbW / 2, wbY = 138;
        const inRoom  = net.connected;
        const ready   = net._preflightOk === true;
        const failed  = net._preflightOk === false;
        const checking = !inRoom && !ready && !failed;
        const ok = inRoom || ready;
        ctx.fillStyle = ok ? 'rgba(12,40,24,0.85)' : (failed ? 'rgba(40,16,12,0.85)' : 'rgba(20,28,40,0.85)');
        ctx.beginPath(); ctx.roundRect(wbX, wbY, wbW, wbH, 8); ctx.fill();
        ctx.strokeStyle = ok ? '#44dd99' : (failed ? '#ff7755' : '#5588cc'); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle  = ok ? '#88ffcc' : (failed ? '#ff9988' : '#aac9ff');
        ctx.font = 'bold 13px monospace';
        const peerN  = net.peers ? net.peers.size : 0;
        const strat  = (typeof net.strategy === 'function' ? net.strategy() : null) || '';
        const stratTag = strat ? `  ·  via ${strat}` : '';
        const label = inRoom   ? (peerN > 0
                                    ? `✓  IN ROOM — ${peerN} PEER${peerN === 1 ? '' : 'S'} CONNECTED${stratTag}`
                                    : `✓  IN ROOM — WAITING FOR PEERS${stratTag}`)
                    : ready    ? `✓  NETWORK READY — HOST OR JOIN${stratTag}`
                    : failed   ? '⚠  NETWORK UNAVAILABLE — CHECK INTERNET'
                    :            '⏳  CHECKING NETWORK…';
        ctx.fillText(label, cx, wbY + 24);
      }

      // HOST button
      const hbW = 280, hbH = 84, hbX = cx - hbW - 30, hbY = 200;
      ctx.fillStyle = '#0d2222';
      ctx.beginPath(); ctx.roundRect(hbX, hbY, hbW, hbH, 12); ctx.fill();
      ctx.strokeStyle = '#44ddcc'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#aaffee'; ctx.font = 'bold 22px monospace';
      ctx.fillText('🌐  HOST GAME', hbX + hbW / 2, hbY + 38);
      ctx.fillStyle = '#66bbaa'; ctx.font = '12px monospace';
      ctx.fillText('Generate a room code, share with friends', hbX + hbW / 2, hbY + 62);
      lobbyBoxes.push({ x: hbX, y: hbY, w: hbW, h: hbH, action: 'host' });

      // JOIN button
      const jbW = 280, jbH = 84, jbX = cx + 30, jbY = 200;
      ctx.fillStyle = '#221a0d';
      ctx.beginPath(); ctx.roundRect(jbX, jbY, jbW, jbH, 12); ctx.fill();
      ctx.strokeStyle = '#ffaa44'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffd699'; ctx.font = 'bold 22px monospace';
      ctx.fillText('✦  JOIN GAME', jbX + jbW / 2, jbY + 38);
      ctx.fillStyle = '#bb8855'; ctx.font = '12px monospace';
      ctx.fillText('Enter the host\u2019s 6-character code', jbX + jbW / 2, jbY + 62);
      lobbyBoxes.push({ x: jbX, y: jbY, w: jbW, h: jbH, action: 'join' });

      // Footer
      ctx.fillStyle = '#556677';
      ctx.font = '11px monospace';
      ctx.fillText('Local 2-player co-op (no internet) is on the char-select screen.', cx, canvas.height - 50);

    }

    if (lobbyMode === 'hosting') {
      const code = lobby.roomCode || '------';
      ctx.fillStyle = '#88aabb';
      ctx.font = '14px monospace';
      ctx.fillText('Share this code with up to 3 friends:', cx, 130);

      // Big room code
      ctx.save();
      ctx.shadowColor = '#44ddcc'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#e8fffa';
      ctx.font = 'bold 96px monospace';
      ctx.fillText(code, cx, 250);
      ctx.restore();

      // Slot list — host is always slot 0; _lobbyPeers fills subsequent slots
      const slotY = 290;
      ctx.fillStyle = '#aabbcc'; ctx.font = 'bold 13px monospace';
      ctx.fillText('CONNECTED PLAYERS', cx, slotY);
      const allSlots = [{ name: 'P1 (you — host)', peerId: 'host' }, ..._lobbyPeers];
      for (let i = 0; i < 4; i++) {
        const sX = cx - 200, sW = 400, sH = 28, sY = slotY + 14 + i * 34;
        const filled = i < allSlots.length;
        ctx.fillStyle = filled ? '#162028' : '#0a0e14';
        ctx.beginPath(); ctx.roundRect(sX, sY, sW, sH, 5); ctx.fill();
        ctx.strokeStyle = filled ? '#44ddcc' : '#33445566'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = filled ? '#cce0d8' : '#445566';
        ctx.font = '13px monospace'; ctx.textAlign = 'left';
        ctx.fillText(filled ? `▶  ${allSlots[i].name || 'Player'}` : '   (waiting…)', sX + 12, sY + 19);
        ctx.textAlign = 'center';
      }

      // Status + relay health line
      {
        const statusY = slotY + 14 + 4 * 34 + 24;
        const msg = lobbyStatusMsg || '';
        ctx.fillStyle = msg.startsWith('⚠') ? '#ff8866' : msg.startsWith('🟢') ? '#44ff88' : '#aaccdd';
        ctx.font = '12px monospace';
        ctx.fillText(msg, cx, statusY);
        // Show live tracker count so the user can confirm WebRTC is ready
        try {
          if (typeof net._trysteroMod === 'undefined') net._trysteroMod = null; // guard
          const tryst = window._trysteroModRef;
          if (tryst && typeof tryst.getRelaySockets === 'function') {
            const sockets = tryst.getRelaySockets();
            const open = Object.values(sockets).filter(ws => ws && ws.readyState === 1).length;
            const total = Object.keys(sockets).length;
            ctx.fillStyle = open > 0 ? '#55cc88' : '#ff7755';
            ctx.font = '11px monospace';
            ctx.fillText(`trackers: ${open}/${total} open`, cx, statusY + 18);
          }
        } catch (_e) { /* non-fatal */ }
      }

      // START GAME button — only shown once at least one peer is connected
      const hasPeers = net.peers.size > 0;
      const sbW = 260, sbH = 48, sbX = cx - sbW / 2, sbY = canvas.height - 120;
      ctx.fillStyle = hasPeers ? '#0d2a1a' : '#111118';
      ctx.beginPath(); ctx.roundRect(sbX, sbY, sbW, sbH, 10); ctx.fill();
      ctx.strokeStyle = hasPeers ? '#44ff88' : '#334455'; ctx.lineWidth = hasPeers ? 2 : 1; ctx.stroke();
      ctx.fillStyle = hasPeers ? '#aaffcc' : '#445566';
      ctx.font = `bold 18px monospace`;
      ctx.fillText(hasPeers ? '▶  START GAME' : '▶  START GAME (waiting…)', cx, sbY + 31);
      if (hasPeers) lobbyBoxes.push({ x: sbX, y: sbY, w: sbW, h: sbH, action: 'lobby_start' });

      // Back / Cancel
      const xbW = 160, xbH = 38, xbX = cx - xbW / 2, xbY = canvas.height - 60;
      ctx.fillStyle = '#1a1520';
      ctx.beginPath(); ctx.roundRect(xbX, xbY, xbW, xbH, 7); ctx.fill();
      ctx.strokeStyle = '#6655aa'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#bbaadd';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('CANCEL HOST', xbX + xbW / 2, xbY + 24);
      lobbyBoxes.push({ x: xbX, y: xbY, w: xbW, h: xbH, action: 'lobby_back' });
    }

    if (lobbyMode === 'joining') {
      ctx.fillStyle = '#88aabb';
      ctx.font = '14px monospace';
      ctx.fillText('Enter the host\u2019s 6-character room code:', cx, 130);

      // Big text-input box for the code
      const tW = 380, tH = 96, tX = cx - tW / 2, tY = 170;
      ctx.fillStyle = '#0a1118';
      ctx.beginPath(); ctx.roundRect(tX, tY, tW, tH, 12); ctx.fill();
      ctx.strokeStyle = '#44ddcc'; ctx.lineWidth = 2; ctx.stroke();

      // Slots for each character
      const slotW = 50, slotGap = 8;
      const totalW = 6 * slotW + 5 * slotGap;
      const sStart = cx - totalW / 2;
      const _t = performance.now() / 1000;
      const cursorOn = (Math.floor(_t * 2) % 2) === 0;
      for (let i = 0; i < 6; i++) {
        const sX = sStart + i * (slotW + slotGap), sY = tY + 16;
        const ch2 = lobbyJoinCode[i] || '';
        const isCursor = (i === lobbyJoinCode.length) && cursorOn;
        ctx.fillStyle = ch2 ? '#0e1c20' : '#070b0e';
        ctx.beginPath(); ctx.roundRect(sX, sY, slotW, 64, 8); ctx.fill();
        ctx.strokeStyle = isCursor ? '#ffcc66' : (ch2 ? '#44ddcc' : '#22404a');
        ctx.lineWidth = isCursor ? 2 : 1;
        ctx.stroke();
        if (ch2) {
          ctx.fillStyle = '#e8fffa';
          ctx.font = 'bold 36px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(ch2, sX + slotW / 2, sY + 46);
        } else if (isCursor) {
          ctx.fillStyle = '#ffcc66';
          ctx.font = 'bold 36px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('_', sX + slotW / 2, sY + 46);
        }
      }

      // Helper text
      ctx.fillStyle = '#667788';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Letters & numbers only. BACKSPACE to delete. ENTER to confirm.', cx, tY + tH + 22);

      // Status
      if (lobbyStatusMsg) {
        ctx.fillStyle = lobbyStatusMsg.startsWith('⚠') ? '#ff8866' : '#aaffcc';
        ctx.font = '13px monospace';
        ctx.fillText(lobbyStatusMsg, cx, tY + tH + 50);
      }

      // Buttons row
      const btY = tY + tH + 90;
      const cancelW = 140, cancelH = 38, cancelX = cx - cancelW - 10;
      ctx.fillStyle = '#1a1520';
      ctx.beginPath(); ctx.roundRect(cancelX, btY, cancelW, cancelH, 7); ctx.fill();
      ctx.strokeStyle = '#6655aa'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#bbaadd'; ctx.font = 'bold 13px monospace';
      ctx.fillText('CANCEL', cancelX + cancelW / 2, btY + 24);
      lobbyBoxes.push({ x: cancelX, y: btY, w: cancelW, h: cancelH, action: 'lobby_back' });

      const confirmW = 180, confirmH = 38, confirmX = cx + 10;
      const ready = lobbyJoinCode.length === 6;
      ctx.fillStyle = ready ? '#0d2222' : '#0a0a14';
      ctx.beginPath(); ctx.roundRect(confirmX, btY, confirmW, confirmH, 7); ctx.fill();
      ctx.strokeStyle = ready ? '#44ddcc' : '#33445566'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = ready ? '#aaffee' : '#445566';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(ready ? 'JOIN ROOM ▶' : 'enter 6 chars…', confirmX + confirmW / 2, btY + 24);
      if (ready) {
        // Same path as ENTER — synthesize a justPressed enter
        lobbyBoxes.push({ x: confirmX, y: btY, w: confirmW, h: confirmH, action: 'join_confirm' });
      }
    }

    if (lobbyMode === 'connected') {
      // Client's connected view mirrors the host's 4-slot lobby so both
      // players see the same "who's here" layout — prior design just
      // showed a giant "Waiting…" message which made it unclear who was
      // in the session.
      const code = lobbyJoinCode || '------';
      ctx.fillStyle = '#88aabb';
      ctx.font = '14px monospace';
      ctx.fillText('Connected to room:', cx, 130);

      ctx.save();
      ctx.shadowColor = '#44ddcc'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#e8fffa';
      ctx.font = 'bold 96px monospace';
      ctx.fillText(code, cx, 250);
      ctx.restore();

      // Slot list — host is slot 0, we're slot 1. Other joiners follow.
      const slotY = 290;
      ctx.fillStyle = '#aabbcc'; ctx.font = 'bold 13px monospace';
      ctx.fillText('CONNECTED PLAYERS', cx, slotY);
      const peerCount = net.peers ? net.peers.size : 0;
      // We can't see host's full peer list from the client side, but we
      // know: slot 0 = host (always present if connected), slot 1 = us,
      // and peerCount - 1 additional peers also in the room.
      const allSlots = [
        { name: 'P1 (host)' },
        { name: 'P2 (you)' },
      ];
      const extras = Math.max(0, peerCount - 1);
      for (let i = 0; i < extras; i++) allSlots.push({ name: 'P' + (3 + i) });
      for (let i = 0; i < 4; i++) {
        const sX = cx - 200, sW = 400, sH = 28, sY = slotY + 14 + i * 34;
        const filled = i < allSlots.length;
        const isYou = i === 1;
        ctx.fillStyle = isYou ? '#1a2830' : (filled ? '#162028' : '#0a0e14');
        ctx.beginPath(); ctx.roundRect(sX, sY, sW, sH, 5); ctx.fill();
        ctx.strokeStyle = isYou ? '#ffcc66' : (filled ? '#44ddcc' : '#33445566'); ctx.lineWidth = isYou ? 2 : 1; ctx.stroke();
        ctx.fillStyle = filled ? (isYou ? '#ffd699' : '#cce0d8') : '#445566';
        ctx.font = '13px monospace'; ctx.textAlign = 'left';
        ctx.fillText(filled ? `▶  ${allSlots[i].name}` : '   (empty)', sX + 12, sY + 19);
        ctx.textAlign = 'center';
      }

      // Waiting indicator
      const _t3 = performance.now() / 1000;
      const dots = '.'.repeat((Math.floor(_t3 * 2) % 4));
      ctx.fillStyle = '#88bbcc';
      ctx.font = '15px monospace';
      ctx.fillText('Waiting for host to start' + dots, cx, slotY + 14 + 4 * 34 + 28);

      if (lobbyStatusMsg) {
        ctx.fillStyle = lobbyStatusMsg.startsWith('⚠') ? '#ff8866' : '#aaffcc';
        ctx.font = '12px monospace';
        ctx.fillText(lobbyStatusMsg, cx, slotY + 14 + 4 * 34 + 50);
      }

      // Leave button
      const lvW = 200, lvH = 42, lvX = cx - lvW / 2, lvY = canvas.height - 90;
      ctx.fillStyle = '#1a1520';
      ctx.beginPath(); ctx.roundRect(lvX, lvY, lvW, lvH, 8); ctx.fill();
      ctx.strokeStyle = '#6655aa'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#bbaadd'; ctx.font = 'bold 14px monospace';
      ctx.fillText('LEAVE ROOM', lvX + lvW / 2, lvY + 28);
      lobbyBoxes.push({ x: lvX, y: lvY, w: lvW, h: lvH, action: 'lobby_back' });
    }

    // Disconnect popup is drawn in _drawGlobalOverlays() (wrapped around
    // the inner render).
    return;
  }

  // ── MAP ──
  if (gameState === 'map') {
    runManager.drawMap(renderer.ctx, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    // Multiplayer voting overlay: draw vote rings + status banner
    if (net.role !== 'solo' && net.peers.size > 0) {
      const ctx = renderer.ctx;
      const localCol  = '#44ff88'; // local = green
      const remoteCol = '#ff9944'; // partner = orange (P2 halo)
      const t = performance.now() / 1000;
      const pulse = 0.7 + 0.3 * Math.sin(t * 5);

      // Vote rings on the map nodes themselves — one per peer (up to 4 total)
      _drawMapVoteRing(ctx, _localMapVote, localCol, 'YOU', 0, pulse);
      let _ringSlot = 1;
      for (const [pid, vote] of _remoteMapVoteByPeer) {
        const idx = _peerToIndex.get(pid);
        const label = 'P' + (((idx ?? _ringSlot) + 1));
        _drawMapVoteRing(ctx, vote, remoteCol, label, _ringSlot, pulse);
        _ringSlot++;
      }

      // Brief celebration flash when every vote matches (resolves to MAP_NODE_CHOSEN)
      if (_mapVoteFlash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, _mapVoteFlash * 2);
        ctx.fillStyle = 'rgba(80,255,140,0.18)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        _mapVoteFlash = Math.max(0, _mapVoteFlash - 1 / 60);
      }

      // Status line — tallied across every connected peer for 3–4P support.
      let _votesIn = _localMapVote ? 1 : 0;
      let _totalVoters = 1;
      let _allAgree = !!_localMapVote;
      for (const [pid] of net.peers) {
        _totalVoters++;
        const v = _remoteMapVoteByPeer.get(pid);
        if (v) _votesIn++;
        if (!v || v !== _localMapVote) _allAgree = false;
      }
      let label = null, color = '#aa88ff';
      const phaseWait = !_remotePhaseDone || !_localPhaseDone;
      if (phaseWait) {
        label = (net.role === 'host' || _localPhaseDone)
          ? '⌛  WAITING FOR ALLIES TO FINISH PICKING THEIR ITEMS'
          : '⌛  PICK YOUR ITEMS — ALLIES ARE ALREADY DONE';
        color = '#ffaa44';
      } else if (_votesIn === 0) {
        label = '🗺   CLICK A NODE TO VOTE — EVERY PLAYER MUST AGREE';
      } else if (_allAgree) {
        label = '✓  AGREED — ADVANCING';
        color = '#44ff88';
      } else if (!_localMapVote) {
        label = '⚠  ALLIES VOTED — CLICK YOUR CHOICE';
        color = '#ff9944';
      } else if (_votesIn < _totalVoters) {
        label = `⌛  ${_votesIn}/${_totalVoters} VOTED — WAITING FOR ALLIES`;
      } else {
        label = '✗  DISAGREEMENT — CLICK AGAIN TO MATCH THE PARTY';
        color = '#ff6644';
      }
      if (label) {
        const bW = Math.min(720, canvas.width - 40), bH = 46, bX = canvas.width / 2 - bW / 2, bY = canvas.height - 72;
        ctx.save();
        ctx.fillStyle = 'rgba(20,18,40,0.94)';
        ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 10); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#eeeeff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, canvas.width / 2, bY + 29);
        ctx.restore();
      }
    }
    const ctx = renderer.ctx;
    const ch = Characters[selectedCharId];
    // Hero info bar — drawn inside the map header area.
    // 1–2 players: single horizontal row (leaves center clear for ACT title).
    // 3–4 players: compact vertical stack on the left — wider rows would
    // otherwise cross under the centered "ACT N" label (see RunManager.js).
    const compactStack = players.count >= 3;
    if (!compactStack) {
      ctx.fillStyle = ch ? ch.color : '#aaa';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${ch?.name || '?'}`, 18, 28);
      const hpW = 160, hpH = 14;
      ctx.fillStyle = '#331111';
      ctx.fillRect(18, 34, hpW, hpH);
      ctx.fillStyle = '#ee3333';
      ctx.fillRect(18, 34, (player.hp / player.maxHp) * hpW, hpH);
      ctx.strokeStyle = '#553333'; ctx.lineWidth = 1; ctx.strokeRect(18, 34, hpW, hpH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${player.hp}/${player.maxHp} HP`, 18 + hpW + 8, 46);
      for (let _pi = 1; _pi < players.count; _pi++) {
        const p2 = players.list[_pi];
        if (!p2) continue;
        const p2X = 18 + hpW + 90 + (_pi - 1) * (hpW + 90);
        const p2Ch = Characters[p2._charId || p2.charId || selectedCharId];
        ctx.fillStyle = p2Ch ? p2Ch.color : '#ff9944';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`P${(p2.playerIndex || _pi) + 1} ${p2Ch?.name || ''}`, p2X, 28);
        ctx.fillStyle = '#331111';
        ctx.fillRect(p2X, 34, hpW, hpH);
        const p2col = p2.hp > 0 ? '#ee3333' : '#553333';
        ctx.fillStyle = p2col;
        ctx.fillRect(p2X, 34, Math.max(0, p2.hp / Math.max(1, p2.maxHp)) * hpW, hpH);
        ctx.strokeStyle = '#553333'; ctx.lineWidth = 1; ctx.strokeRect(p2X, 34, hpW, hpH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`${Math.max(0, p2.hp)}/${p2.maxHp} HP${p2.downed ? '  ▼DOWN' : (!p2.alive ? '  ✖DEAD' : '')}`, p2X + hpW + 8, 46);
      }
    } else {
      // Compact stack: each row = name (60px) + HP bar (120) + text (70) ≈ 260px,
      // comfortably inside the canvas.width/2 - 100 clearance to the ACT label.
      const hpW = 120, hpH = 11, rowH = 18;
      const baseY = 22;
      for (let _pi = 0; _pi < players.count; _pi++) {
        const pp = _pi === 0 ? player : players.list[_pi];
        if (!pp) continue;
        const ppCh = Characters[pp._charId || pp.charId || (_pi === 0 ? selectedCharId : selectedCharId)];
        const rowY = baseY + _pi * rowH;
        const label = _pi === 0 ? (ppCh?.name || 'P1') : `P${(pp.playerIndex || _pi) + 1}`;
        ctx.fillStyle = ppCh?.color || (_pi === 0 ? '#ee3333' : '#ff9944');
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label, 18, rowY + 9);
        const barX = 72;
        ctx.fillStyle = '#331111';
        ctx.fillRect(barX, rowY, hpW, hpH);
        const frac = Math.max(0, Math.min(1, pp.hp / Math.max(1, pp.maxHp)));
        ctx.fillStyle = pp.hp > 0 ? '#ee3333' : '#553333';
        ctx.fillRect(barX, rowY, hpW * frac, hpH);
        ctx.strokeStyle = '#553333'; ctx.lineWidth = 1; ctx.strokeRect(barX, rowY, hpW, hpH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        const status = pp.downed ? ' ▼' : (!pp.alive ? ' ✖' : '');
        ctx.fillText(`${Math.max(0, pp.hp)}/${pp.maxHp}${status}`, barX + hpW + 6, rowY + 9);
      }
    }
    ctx.fillStyle = '#666';
    ctx.font = '11px monospace';
    const layersLeft = runManager.getLayersToEnd();
    const depthLabel = layersLeft <= 1 ? 'BOSS NEXT!' : `${layersLeft - 1} room(s) to boss`;
    // Compact stack already pushes the depth caption below the last row.
    const depthY = compactStack ? 22 + players.count * 18 + 10 : 62;
    ctx.textAlign = 'left';
    ctx.fillText(`Act ${runManager.floor}  ·  ${DIFFICULTY_NAMES[selectedDifficulty]}  ·  ${depthLabel}`, 18, depthY);

    // Right: cards & relics info
    ctx.textAlign = 'right';
    ctx.fillStyle = '#88aacc';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${deckManager.collection.length}/${deckManager.MAX_DECK_SIZE} Cards`, canvas.width - 18, 22);
    ctx.fillStyle = '#aa88cc';
    ctx.fillText(`${itemManager.equipped.length} Relics`, canvas.width - 18, 40);

    // Visible inventory button — right side, doesn't block map content
    const invOpen = ui.showInventory;
    const invBtnW = 240, invBtnH = 40;
    const invBtnX = canvas.width - invBtnW - 16;
    const invBtnY = canvas.height - invBtnH - 56; // above the 48px footer + gap
    ctx.fillStyle = invOpen ? 'rgba(68,255,136,0.25)' : 'rgba(30,30,50,0.85)';
    ctx.beginPath();
    ctx.roundRect(invBtnX, invBtnY, invBtnW, invBtnH, 8);
    ctx.fill();
    ctx.strokeStyle = invOpen ? '#44ff88' : '#336';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = invOpen ? '#44ff88' : '#baccdd';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[I]  View Cards & Relics', invBtnX + invBtnW / 2, invBtnY + 26);

    // Inventory overlay
    if (invOpen) {
      ui.width = canvas.width;
      ui.height = canvas.height;
      ui.drawInventoryOverlay(ctx);
    }
    return;
  }

  // ── REST ──
  if (gameState === 'rest') {
    const ctx = renderer.ctx;
    ctx.fillStyle = 'rgba(5,8,5,0.97)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = '#44dd88';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#44dd88';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REST NODE', canvas.width / 2, 80);
    ctx.restore();

    ctx.fillStyle = '#556655';
    ctx.font = '15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HP: ${player.hp} / ${player.maxHp}`, canvas.width / 2, 116);

    if (_isNetMp()) {
      const voteLabel = (v) => v === 'heal' ? 'Heal' : v === 'upgrade' ? 'Upgrade' : v === 'fortify' ? 'Fortify' : '';
      let msg = '';
      if (_localRestVote && !_remoteRestVote) msg = `Voted ${voteLabel(_localRestVote)} — waiting for teammate…`;
      else if (!_localRestVote && _remoteRestVote) msg = `Teammate voted ${voteLabel(_remoteRestVote)} — cast your vote`;
      else if (_localRestVote && _remoteRestVote && _localRestVote !== _remoteRestVote) {
        msg = `Votes differ (you: ${voteLabel(_localRestVote)}, teammate: ${voteLabel(_remoteRestVote)})`;
      } else if (!_localRestVote && !_remoteRestVote) msg = 'Team vote: choose together';
      if (msg) {
        ctx.fillStyle = '#ffcc66';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(msg, canvas.width / 2, 140);
      }
    }

    restChoiceBoxes = [];
    const btnW = Math.min(400, canvas.width - 80);
    const btnH = 80, btnGap = 18; // IDEA-08: slightly smaller to fit 3 buttons
    const btnStartY = (canvas.height - (3 * btnH + 2 * btnGap)) / 2;
    // In MP every player must be able to vote for every option, otherwise
    // a full-HP player can't vote "heal" and the team deadlocks. Each side
    // applies the outcome to its own local player (heal() clamps at maxHp,
    // so voting heal when already full is a harmless no-op for us).
    const inMp = _isNetMp();
    const healLine2 = player.hp < player.maxHp
      ? `(${player.hp} → ${Math.min(player.hp + 3, player.maxHp)} / ${player.maxHp})`
      : (inMp ? '(you are full HP — vote for your teammate)' : '(already full HP)');
    const choices = [
      {
        action: 'heal', label: 'Heal 3 HP', color: '#44ff88', bg: '#0e2018',
        canDo: player.hp < player.maxHp || inMp,
        lines: [`Restore up to 3 HP`, healLine2],
      },
      {
        action: 'upgrade', label: 'Upgrade a Card', color: '#44aaff', bg: '#001020',
        canDo: deckManager.getUpgradeChoices().length > 0,
        lines: ['Upgrade one card in your deck', `(${deckManager.getUpgradeChoices().length} upgradeable cards)`],
      },
      {
        action: 'fortify', label: 'Fortify', color: '#cc88ff', bg: '#14001e', // IDEA-08
        canDo: true,
        lines: ['+10% damage for your next fight', player._fortifyBuff ? '(already active)' : 'Bonus clears after room clear'],
      },
    ];
    for (let i = 0; i < choices.length; i++) {
      const ch = choices[i];
      const bx = (canvas.width - btnW) / 2;
      const by = btnStartY + i * (btnH + btnGap);
      ctx.fillStyle = ch.canDo ? ch.bg : '#111';
      ctx.beginPath();
      ctx.roundRect(bx, by, btnW, btnH, 12);
      ctx.fill();
      ctx.strokeStyle = ch.canDo ? ch.color : '#333';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = ch.canDo ? ch.color : '#444';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ch.label, canvas.width / 2, by + 30);
      ctx.fillStyle = ch.canDo ? '#bbccbb' : '#444';
      ctx.font = '14px monospace';
      ctx.fillText(ch.lines[0], canvas.width / 2, by + 54);
      ctx.fillStyle = ch.canDo ? '#889988' : '#333';
      ctx.font = '13px monospace';
      ctx.fillText(ch.lines[1], canvas.width / 2, by + 72);
      if (ch.canDo) restChoiceBoxes.push({ x: bx, y: by, w: btnW, h: btnH, action: ch.action });
    }
    ctx.fillStyle = '#889988';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC to leave without resting', canvas.width / 2, canvas.height - 28);
    return;
  }

  // ── EVENT ──
  if (gameState === 'event') {
    ui.drawEventScreen(renderer.ctx, currentEventType, player);
    return;
  }

  // ── SHOP ──
  if (gameState === 'shop') {
    ui.drawShopScreen(renderer.ctx, shopCards, CardDefinitions);
    if (window._shopWarnUntil && performance.now() < window._shopWarnUntil) {
      const ctx = renderer.ctx;
      const msg = window._shopWarnMsg || '';
      const bw = 560, bh = 44;
      const bx = (canvas.width - bw) / 2, by = 90;
      ctx.fillStyle = 'rgba(60,10,10,0.94)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = '#ff5566'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffbbbb';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(msg, canvas.width / 2, by + 28);
    }
    return;
  }

  // ── ITEM REWARD ──
  if (gameState === 'itemReward') {
    ui.drawItemReward(renderer.ctx, itemChoices, ItemDefinitions);
    return;
  }

  // ── UPGRADE ──
  if (gameState === 'upgrade') {
    ui.drawUpgradeScreen(renderer.ctx, upgradeChoices);
    return;
  }

  // ── DISCARD (standalone, not overlaid) ──
  if (gameState === 'discard' && discardPendingCardId) {
    renderer.clear();
    ui.width = canvas.width; ui.height = canvas.height;
    ui.setMouse(input.mouse.x, input.mouse.y);
    ui.drawDiscardScreen(renderer.ctx, discardPendingCardId);
    return;
  }

  // ── VICTORY CELEBRATION ──
  if (gameState === 'victory') {
    _drawVictoryScreen(renderer.ctx);
    return;
  }

  // ── STATS ──
  if (gameState === 'stats') {
    // Score is computed once; re-use cached value to avoid recalculating every frame
    if (!runStats._cachedScore) {
      runStats._cachedScore = calculateScore(runStats);
      meta.submitScore({
        score: runStats._cachedScore, character: runStats.character, floor: runStats.floor,
        difficulty: runStats.difficulty, seed: runStats.seed,
        date: new Date().toISOString()
      });
    }
    ui.width = canvas.width; ui.height = canvas.height;
    ui.newUnlocks = newUnlocks;
    const waitingForInput = statsInputDelay > 0;
    ui.drawStatsScreen(renderer.ctx, runStats, runStats._cachedScore, meta.getLeaderboard(), waitingForInput);
    return;
  }

  // ── PAUSED FROM MAP: show map, not the battle room ──
  if (gameState === 'paused' && prevStateBeforePause === 'map') {
    runManager.drawMap(renderer.ctx, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    const _ctx = renderer.ctx;
    const _ch = Characters[selectedCharId];
    _ctx.fillStyle = _ch ? _ch.color : '#aaa';
    _ctx.font = 'bold 16px monospace';
    _ctx.textAlign = 'left';
    _ctx.fillText(`${_ch?.name || '?'}`, 18, 28);
    const _hpW = 160, _hpH = 14;
    _ctx.fillStyle = '#331111'; _ctx.fillRect(18, 34, _hpW, _hpH);
    _ctx.fillStyle = '#ee3333'; _ctx.fillRect(18, 34, (player.hp / player.maxHp) * _hpW, _hpH);
    _ctx.strokeStyle = '#553333'; _ctx.lineWidth = 1; _ctx.strokeRect(18, 34, _hpW, _hpH);
    _ctx.fillStyle = '#fff'; _ctx.font = 'bold 11px monospace';
    _ctx.fillText(`${player.hp}/${player.maxHp} HP`, 18 + _hpW + 8, 46);
    drawPauseMenu();
    return;
  }

  // ── COMBAT / PREP / DRAFT / PAUSED render the room ──
  const now = performance.now();
  renderer.beginShakeScope();
  // Pass the shake offsets so the floor grid parallaxes at 0.4× — makes
  // heavy hits feel punchier without any extra draw calls. (Visual #7)
  room.draw(renderer.ctx, renderer.shakeOffsetX, renderer.shakeOffsetY);

  // (torch-light removed — per-frame createRadialGradient was expensive and unwanted)

  // Ambient floating motes (slow background life)
  // Biome-themed ambient particles. Different motion + color per biome:
  //   verdant=pollen drift, frostforge=snow falls down, cathedral=embers rise,
  //   tide=bubbles rise, voidline=motes drift random, clockwork=steam rises slow.
  const _biomeKind = currentBiome?.ambience?.kind || 'pollen';
  const _biomeColor = currentBiome?.ambience?.color || '#ffffff';
  if (!_ambientInit || _ambientLastKind !== _biomeKind) {
    _ambientInit = true;
    _ambientLastKind = _biomeKind;
    for (const p of _ambientParts) {
      _seedAmbientParticle(p, _biomeKind, true);
    }
  }
  {
    const _dt2 = Math.min(0.05, 1 / 60);
    const _ctx = renderer.ctx;
    _ctx.save();
    for (const p of _ambientParts) {
      p.life += _dt2 * (p.lifeRate || 0.15);
      if (p.life >= 1) _seedAmbientParticle(p, _biomeKind, false);
      p.x += p.vx * _dt2;
      p.y += p.vy * _dt2;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      _ctx.fillStyle = _biomeColor;
      _ctx.globalAlpha = p.a * Math.sin(p.life * Math.PI);
      _ctx.fill();
    }
    _ctx.globalAlpha = 1;
    _ctx.restore();
  }
  // Biome post-FX tint — flat colored overlay defined per biome (pre-existing
  // in Biomes.js but never read until now). Adds instant chapter identity.
  if (currentBiome?.postFx?.tint) {
    const _ctx = renderer.ctx;
    _ctx.save();
    _ctx.fillStyle = currentBiome.postFx.tint;
    _ctx.fillRect(0, 0, canvas.width, canvas.height);
    _ctx.restore();
  }

  // Draw floor-layer world objects (traps, sigils, ground zones, beams)
  _drawWorldObjects(renderer.ctx, now);
  for (const e of enemies) {
    e.drawTelegraph(renderer.ctx, now);
    e._drawIntentIcon(renderer.ctx, now);
  }
  if (gameState === 'playing') {
    combat.drawRangeIndicator(renderer.ctx, player, deckManager.hand, CardDefinitions, selectedCardSlot);
    if (players.count > 1) {
      // Only the LOCAL co-op P2 (at list[1]) has a range indicator drawn here;
      // remote players' card picks are private and their range wouldn't line
      // up with our reticle anyway.
      const p2 = players.list[1];
      if (p2 && p2.alive && !p2._isRemote) {
        combat.drawRangeIndicator(renderer.ctx, p2, deckManager.hand, CardDefinitions, selectedCardSlotP2);
        // Draw P2 reticle (auto-aim crosshair) so the player can see what's targeted
        const p2v = input._p2View;
        if (p2v) {
          const _c = renderer.ctx;
          _c.save();
          _c.strokeStyle = '#aaff88';
          _c.globalAlpha = 0.7;
          _c.lineWidth = 1.5;
          _c.beginPath();
          _c.arc(p2v.mouse.x, p2v.mouse.y, 10, 0, Math.PI * 2);
          _c.moveTo(p2v.mouse.x - 16, p2v.mouse.y);
          _c.lineTo(p2v.mouse.x - 6,  p2v.mouse.y);
          _c.moveTo(p2v.mouse.x + 6,  p2v.mouse.y);
          _c.lineTo(p2v.mouse.x + 16, p2v.mouse.y);
          _c.moveTo(p2v.mouse.x, p2v.mouse.y - 16);
          _c.lineTo(p2v.mouse.x, p2v.mouse.y - 6);
          _c.moveTo(p2v.mouse.x, p2v.mouse.y + 6);
          _c.lineTo(p2v.mouse.x, p2v.mouse.y + 16);
          _c.stroke();
          _c.restore();
        }
      }
    }
    combat.drawReticles(renderer.ctx, deckManager.hand, CardDefinitions, now);
  }
  projectiles.draw(renderer.ctx);
  // RH2: draw ally halos under players for ally-finding in chaos
  if (players.count > 1) {
    for (const p of players.list) {
      if (!p.alive) continue;
      const ctx = renderer.ctx;
      ctx.beginPath();
      ctx.arc(p.x, p.y + p.r * 0.7, p.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = p.haloColor || '#88ddff';
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // Revive arrows — when a teammate is downed, draw a pulsing arrow from
  // the local player toward them so they're never lost on screen.
  if (players.count > 1 && player.alive && !player.downed) {
    for (const teammate of players.list) {
      if (teammate === player) continue;
      if (!teammate.alive || !teammate.downed) continue;
      _drawReviveArrow(renderer.ctx, player, teammate);
    }
  }
  // RH2: tempo aura ripple — when HOT/CRITICAL, gentle expanding rings emit
  // from the player so partners (and the player) see the "danger zone" state.
  _drawTempoAura(renderer.ctx, player, tempo.value, performance.now() / 1000);
  if (players.count > 1) {
    for (let i = 1; i < players.list.length; i++) {
      const p = players.list[i];
      if (p && p.alive && !p.downed) _drawTempoAura(renderer.ctx, p, tempo.value, performance.now() / 1000);
    }
  }
  player.draw(renderer.ctx, tempo);
  // RH2: P1 down ring (so P2 can see they need to revive)
  if (players.count > 1 && player.downed) {
    _drawDownedIndicator(renderer.ctx, player);
  }
  // RH2: draw additional players + their downed/revive UI + follow HP bar
  if (players.count > 1) {
    // ── Revive instruction banner — only when at least one player is downed ──
    let _anyDowned = false;
    for (const _p of players.list) { if (_p.alive && _p.downed) { _anyDowned = true; break; } }
    if (_anyDowned) {
      const ctx = renderer.ctx;
      const bw = 460, bh = 36;
      const bx = (canvas.width - bw) / 2, by = 12;
      ctx.fillStyle = 'rgba(20,40,20,0.92)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#aaffbb';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STAND ON YOUR DOWNED ALLY FOR 2s TO REVIVE THEM', canvas.width / 2, by + 23);
    }
    for (let i = 1; i < players.list.length; i++) {
      const p = players.list[i];
      if (p.alive) p.draw(renderer.ctx, tempo);
      const ctx = renderer.ctx;
      // Follow HP bar above the player's head — small, color-keyed
      if ((p.alive || p.downed) && p.maxHp) {
        const bw = 36, bh = 4, bx = p.x - bw / 2, by = p.y + p.r * 0.7 - p.r - 12;
        const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = p.haloColor || '#ff7744';
        ctx.fillRect(bx, by, bw * frac, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
      if (p.downed) {
        _drawDownedIndicator(ctx, p);
      }
    }
    // P2 reticle
    const v = input._p2View;
    const _p2 = players.list[1];
    if (v && _p2) renderer.drawCursor(v._aimX, v._aimY, _p2.haloColor || '#ff7744');
  }
  _drawOrbs(renderer.ctx);
  // Kill effects
  for (const _ke of killEffects) drawKillEffect(renderer.ctx, _ke.x, _ke.y, _ke.def.value, _ke.elapsed);
  // Player title cosmetic
  const _titleDef = window._equippedCosmetics?.titleDef;
  if (_titleDef && gameState === 'playing') {
    const _tctx = renderer.ctx;
    const _tNow = performance.now() / 1000;
    _tctx.save();
    _tctx.font = 'bold 11px monospace';
    _tctx.textAlign = 'center';
    if (_titleDef.animated) {
      _tctx.fillStyle = getPrismaticColor(_tNow, 100, 68);
    } else {
      _tctx.fillStyle = _titleDef.color || '#ffdd88';
    }
    _tctx.fillText(_titleDef.value, player.x, player.y - player.r - 9);
    _tctx.restore();
  }
  particles.draw(renderer.ctx, canvas.width, canvas.height);
  renderer.endShakeScope();

  // Player death overlay — darken screen as timer counts down
  if (playerDeathTimer > 0) {
    const alpha = (0.8 - playerDeathTimer / 0.8) * 0.85;
    renderer.ctx.fillStyle = `rgba(80,0,0,${Math.max(0, Math.min(0.85, alpha))})`;
    renderer.ctx.fillRect(0, 0, canvas.width, canvas.height);
    renderer.ctx.fillStyle = `rgba(255,60,60,${Math.max(0, Math.min(0.9, alpha))})`;
    renderer.ctx.font = 'bold 52px monospace';
    renderer.ctx.textAlign = 'center';
    renderer.ctx.fillText('DEFEATED', canvas.width / 2, canvas.height / 2);
    return;
  }

  if (gameState === 'playing' || gameState === 'paused') {
    ui.selectedCardSlot = selectedCardSlot;
    ui.selectedCardSlotP2 = (players.count > 1 && localCoop) ? selectedCardSlotP2 : null;
    ui.battleMode = true;
    // Flag whether any enemy overlaps the card zone or tempo bar zone so they can fade
    const _cardZoneY = canvas.height - 192 - 22;
    const _tempoZoneY = canvas.height - 192 - 22 - 22 - 44 - 22; // top of tempo bar widget
    ui.cardZoneOccupied = (player.y + player.r > _cardZoneY) || enemies.some(e => e.alive && !e._dying && e.y + e.r > _cardZoneY);
    ui.tempoZoneOccupied = (player.y + player.r > _tempoZoneY) || enemies.some(e => e.alive && !e._dying && e.y + e.r > _tempoZoneY);
    ui.draw(renderer.ctx);
    const ctx = renderer.ctx;
    // RH2: co-op HUD strip — biome label + per-player HP bars + resonance
    // Positioned BELOW the existing HP/AP/Relics column (which lives at y=18..~92)
    if (players.count > 1 || currentBiome) {
      ctx.save();
      const panelW = 230;
      const hasP2 = players.count > 1;
      const hasReso = tempo._groupResonanceMult && tempo._groupResonanceMult > 1.001;
      // Height grows with content
      let panelH = 8;
      if (currentBiome) panelH += 18;
      // Each ally contributes one HP row + one AP row
      if (hasP2) panelH += Math.max(0, players.count - 1) * (22 + 18);
      if (hasReso) panelH += 18;
      panelH += 4;
      const panelX = 8;
      // Push below existing relics row (y≈68 + 22)
      const panelY = (itemManager && itemManager.equipped && itemManager.equipped.length) ? 100 : 96;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1; ctx.stroke();

      let yCursor = panelY + 14;
      ctx.textAlign = 'left';
      if (currentBiome) {
        ctx.fillStyle = currentBiome.palette ? currentBiome.palette.accent : '#88ccdd';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('BIOME: ' + currentBiome.name.toUpperCase(), 14, yCursor);
        yCursor += 18;
      }

      // Helper: draw label + mini HP bar
      const drawHpRow = (label, p, color) => {
        ctx.fillStyle = color;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(label, 14, yCursor + 10);
        const bx2 = 60, by2 = yCursor + 2, bw = 100, bh = 12;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx2, by2, bw, bh);
        const frac = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
        ctx.fillStyle = color;
        ctx.fillRect(bx2, by2, bw * frac, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1; ctx.strokeRect(bx2, by2, bw, bh);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        const txt = Math.max(0, Math.round(p.hp)) + '/' + p.maxHp + (p.downed ? '  ▼DOWN' : (!p.alive ? '  ✖DEAD' : ''));
        ctx.fillText(txt, bx2 + bw + 6, yCursor + 11);
        yCursor += 22;
      };

      // Every ally past P1 gets their own HP/AP row. 3–4P remote co-op
      // stacks P2/P3/P4 in order.
      for (let _ai = 1; _ai < players.count; _ai++) {
        const p2 = players.list[_ai];
        if (!p2) continue;
        const label = 'P' + ((p2.playerIndex || _ai) + 1);
        drawHpRow(label, p2, p2.haloColor || '#ff7744');
        // AP pip row for this ally
        ctx.fillStyle = '#4488ff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('AP', 14, yCursor + 11);
        const apX = 60, apY = yCursor + 3, segW = 12, segH = 12, segGap = 2;
        const mb = p2.maxBudget || 3;
        for (let i = 0; i < mb; i++) {
          const sx = apX + i * (segW + segGap);
          const filled = i < Math.floor(p2.budget);
          ctx.fillStyle = filled ? '#44aaff' : '#1a2a44';
          ctx.fillRect(sx, apY, segW, segH);
          ctx.strokeStyle = '#223355';
          ctx.lineWidth = 1;
          ctx.strokeRect(sx, apY, segW, segH);
        }
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText(p2.budget.toFixed(1) + '/' + mb, apX + mb * (segW + segGap) + 4, yCursor + 12);
        yCursor += 18;
      }

      if (hasReso) {
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 11px monospace';
        const pct = Math.round((tempo._groupResonanceMult - 1) * 100);
        ctx.fillText('★ RESONANCE +' + pct + '% DMG', 14, yCursor + 10);
      }
      ctx.restore();
    }
    // RH2: full-screen edge-glow when Group Resonance just activated
    if (_resonanceFlashTimer > 0) {
      const k = _resonanceFlashTimer / 0.6;
      ctx.save();
      ctx.globalAlpha = k * 0.55;
      const eg = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7
      );
      eg.addColorStop(0, 'rgba(255,221,68,0)');
      eg.addColorStop(1, 'rgba(255,221,68,0.9)');
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★ GROUP RESONANCE ★', canvas.width / 2, 78);
      ctx.restore();
    }
    // Floor / difficulty badge — top right (below minimap)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - 115, 105, 103, 38);
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Act ${runManager.floor}/${FLOORS_TO_WIN}`, canvas.width - 63, 120);
    ctx.fillStyle = DIFFICULTY_COLORS[selectedDifficulty] || '#888';
    ctx.fillText(DIFFICULTY_NAMES[selectedDifficulty], canvas.width - 63, 135);
    // IDEA-12: show active Brutal curse
    if (currentFloorCurse && selectedDifficulty >= 2) {
      ctx.fillStyle = '#ff4422';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(BRUTAL_CURSE_NAMES[currentFloorCurse] || currentFloorCurse, canvas.width / 2, 22);
    }
    // Touch controls
    input.drawTouchControls(ctx);

    // ── Enemies drawn above the card HUD so they are never occluded by it ──
    // A second shake scope ensures they still respond to screen shake.
    renderer.beginShakeScope();
    // Set shared font once before enemy draw loop — avoids per-enemy ctx.font assignment
    renderer.ctx.font = 'bold 13px monospace';
    for (const e of enemies) {
      if (e._dying) {
        const _dur = e._deathDuration || 0.6;
        // Bosses: fade only in the last 0.6s so they stay visible for most of the animation
        const _fadeStart = e.isBoss ? 0.6 : _dur;
        renderer.ctx.globalAlpha = Math.max(0, Math.min(1, e._deathTimer / _fadeStart));
        e.draw(renderer.ctx, now);
        renderer.ctx.globalAlpha = 1;
        // Boss death expanding rings
        if (e.isBoss && e._bossDeathPos) {
          const _bpos = e._bossDeathPos;
          const _elapsed = _dur - e._deathTimer;
          const _ctx = renderer.ctx;
          for (let _ri = 0; _ri < 3; _ri++) {
            const _ringT = (_elapsed - _ri * 0.35);
            if (_ringT < 0) continue;
            const _ringR = 40 + _ringT * 280;
            const _ringA = Math.max(0, 0.7 - _ringT * 0.9);
            _ctx.beginPath();
            _ctx.arc(_bpos.x, _bpos.y, _ringR, 0, Math.PI * 2);
            _ctx.strokeStyle = `rgba(255,200,50,${_ringA})`;
            _ctx.lineWidth = 3 - _ri * 0.8;
            _ctx.stroke();
          }
          // "BOSS DEFEATED" overlay text
          if (_elapsed < 2.0) {
            const _textA = _elapsed < 0.3 ? _elapsed / 0.3 : Math.max(0, 1 - (_elapsed - 1.2) / 0.8);
            _ctx.save();
            _ctx.globalAlpha = _textA;
            _ctx.font = 'bold 36px monospace';
            _ctx.textAlign = 'center';
            _ctx.fillStyle = '#ffe066';
            _ctx.shadowColor = '#ff8800';
            _ctx.shadowBlur = 18;
            _ctx.fillText('BOSS DEFEATED', canvas.width / 2, canvas.height / 2 - 30);
            _ctx.shadowBlur = 0;
            _ctx.restore();
          }
        }
      } else {
        e.draw(renderer.ctx, now);
      }
    }
    // Batched health bar pass — standard enemies cache _hbColor in drawBody;
    // bosses/special enemies draw their own bars inside their draw() above
    for (const e of enemies) {
      if (e.alive && !e._dying && e._hbColor) { e.drawHealthBar(renderer.ctx, e._hbColor); e._hbColor = null; }
    }
    renderer.endShakeScope();

    // Screen vignette (cached, draws over world, below HUD)
    renderer.drawVignette();
    // Recently-played card ghost — sits below the HUD in the right margin
    _drawRecentlyPlayedGhost(renderer.ctx);

    // Combat-start expanding ring flash
    if (_combatStartFlash > 0) {
      const _p = 1 - _combatStartFlash / 0.5;
      const _ctx = renderer.ctx;
      _ctx.save();
      _ctx.beginPath();
      _ctx.arc(canvas.width / 2, canvas.height / 2, 60 + _p * 340, 0, Math.PI * 2);
      _ctx.strokeStyle = `rgba(255,80,80,${(1 - _p) * 0.55})`;
      _ctx.lineWidth = 4 - _p * 3;
      _ctx.stroke();
      _ctx.restore();
    }

    // Zone transition tooltip (first-time only)
    if (zoneTooltip && zoneTooltip.timer > 0) {
      const alpha = Math.min(1, zoneTooltip.timer, 3.5 - zoneTooltip.timer + 0.5);
      const ttW = Math.min(480, canvas.width - 40);
      const ttX = (canvas.width - ttW) / 2;
      const ttY = canvas.height / 2 - 80;
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.beginPath();
      ctx.roundRect(ttX, ttY, ttW, 44, 8);
      ctx.fill();
      ctx.strokeStyle = zoneTooltip.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = zoneTooltip.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(zoneTooltip.text, canvas.width / 2, ttY + 27);
      ctx.restore();
    }
  }

  // ── OVERLAYS ──
  if (gameState === 'paused') {
    drawPauseMenu();
  } else if (gameState === 'draft') {
    drawDraftScreen();
  } else if (gameState === 'prep') {
    ui.drawPrepScreen(renderer.ctx);
    // Remote MP: READY-UP banner. One pill per player (2–4 peers), placed
    // ABOVE the hand so it doesn't cover the cards the player is equipping.
    if (net.role !== 'solo' && net.peers.size > 0) {
      const ctx = renderer.ctx;
      const t = performance.now() / 1000;
      const dots = '.'.repeat((Math.floor(t * 2) % 4));

      // Assemble pills: local first, then each connected peer in player-index
      // order so P1/P2/P3/P4 labels stay stable across runs.
      const pills = [{
        label: _myPlayerIndex != null ? `YOU (P${_myPlayerIndex + 1})` : 'YOU',
        ready: _prepReadyLocal,
      }];
      const remote = [];
      for (const [pid] of net.peers) {
        remote.push({
          idx: _peerToIndex.get(pid) ?? 99,
          ready: !!_prepReadyByPeer.get(pid),
        });
      }
      remote.sort((a, b) => a.idx - b.idx);
      for (const r of remote) pills.push({ label: `P${(r.idx | 0) + 1}`, ready: r.ready });

      const readyCount = pills.reduce((n, p) => n + (p.ready ? 1 : 0), 0);
      const allReady = readyCount === pills.length;

      // Adaptive pill sizing: 4P needs narrower pills so the row fits.
      const pillW = pills.length <= 2 ? 200 : (pills.length === 3 ? 160 : 140);
      const pillH = 30, pillGap = 12;
      const pillsTotal = pillW * pills.length + pillGap * (pills.length - 1);
      const bW = Math.max(580, pillsTotal + 40);
      const bH = 80;
      // Hand top lives at canvas.height - 214 (CARD_H 192 + 22 margin in
      // ui._drawHand). Park the banner 12 px above that so cards stay clickable.
      const HAND_TOP = canvas.height - 214;
      const bX = canvas.width / 2 - bW / 2;
      const bY = Math.max(120, HAND_TOP - bH - 12);

      ctx.save();
      ctx.fillStyle = allReady ? 'rgba(18,40,22,0.94)' : 'rgba(20,18,40,0.94)';
      ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 12); ctx.fill();
      ctx.strokeStyle = allReady ? '#66ff99' : '#aa88ff'; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = allReady ? '#aaffbb' : '#ddccff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      const title = allReady
        ? 'STARTING COMBAT…'
        : `ALL PLAYERS MUST READY UP  (${readyCount}/${pills.length})${dots}`;
      ctx.fillText(title, canvas.width / 2, bY + 26);

      const pillsX = canvas.width / 2 - pillsTotal / 2;
      const pillY = bY + 40;
      for (let i = 0; i < pills.length; i++) {
        const p = pills[i];
        const px = pillsX + i * (pillW + pillGap);
        ctx.fillStyle = p.ready ? 'rgba(40,90,50,0.95)' : 'rgba(60,40,40,0.6)';
        ctx.beginPath(); ctx.roundRect(px, pillY, pillW, pillH, 6); ctx.fill();
        ctx.strokeStyle = p.ready ? '#66ff99' : '#665577'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = p.ready ? '#ccffd6' : '#aa99bb';
        ctx.font = 'bold 13px monospace';
        ctx.fillText((p.ready ? '✓ ' : '◯ ') + p.label, px + pillW / 2, pillY + 20);
      }

      ctx.restore();
    }
  } else if (gameState === 'discard') {
    ui.width = canvas.width; ui.height = canvas.height;
    ui.setMouse(input.mouse.x, input.mouse.y);
    ui.drawDiscardScreen(renderer.ctx, discardPendingCardId);
  }

  // ── POST-FRAME PASSES ─────────────────────────────────────────
  // (bloom removed — ctx.filter blur was CPU-rasterized, costing 4-8ms/frame)
  // Chromatic aberration edge flash (combat only)
  if (gameState === 'playing' || gameState === 'paused') renderer.drawCAFlash();
  // Disconnect popup, "remote player disconnected" banner, and out-of-sync
  // warning banner all live in _drawGlobalOverlays() which the render()
  // wrapper calls AFTER _renderInner finishes — guaranteeing they paint on
  // top regardless of which state-block early-returned. Don't re-add inline
  // copies here; doing so would double-draw them on states like 'playing'
  // that fall through to the post-frame pass.
  // RH2 multiplayer: universal "partner is waiting on you" badge for any
  // post-combat decision screen. Draws on top of draft / itemReward / shop /
  // rest / event / discard / upgrade so the local player always knows the
  // partner has finished and the run is held up on them.
  if (net.role !== 'solo' && net.peers.size > 0) {
    const decisionStates = ['draft','itemReward','shop','rest','event','discard','upgrade'];
    if (decisionStates.includes(gameState) && _remotePhaseDone && !_localPhaseDone) {
      _drawPartnerWaitingBadge(renderer.ctx, '⌛  PARTNER IS WAITING — MAKE YOUR CHOICE');
    }
  }
  // Post-fight scoreboard ticker — short pop in upper-right after a clear.
  if (_scoreTicker) {
    const ctx = renderer.ctx;
    const age = performance.now() / 1000 - _scoreTicker.t0;
    const dur = 2.4;
    if (age >= dur) { _scoreTicker = null; }
    else {
      const slide = Math.min(1, age / 0.3);
      const fade  = Math.min(1, (dur - age) / 0.5);
      const k = slide * fade;
      const w = 240, h = 56;
      const x = canvas.width - w - 16 + (1 - slide) * 60;
      const y = 56;
      ctx.save();
      ctx.globalAlpha = k * 0.94;
      ctx.fillStyle = 'rgba(20,28,38,0.94)';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
      ctx.strokeStyle = '#88ff99'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#88ff99';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('ROOM ' + _scoreTicker.room + ' CLEARED', x + 12, y + 22);
      ctx.fillStyle = '#ffd699';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('+' + _scoreTicker.kills + ' KILLS', x + 12, y + 44);
      ctx.restore();
    }
  }
  // Floor-name banner — animated chapter break, slides in then fades.
  if (_floorBanner) {
    const ctx = renderer.ctx;
    const age = performance.now() / 1000 - _floorBanner.t0;
    const dur = 3.0;
    if (age >= dur) { _floorBanner = null; }
    else {
      const slideIn = Math.min(1, age / 0.4);
      const hold = age < dur - 0.6 ? 1 : Math.max(0, (dur - age) / 0.6);
      const k = slideIn * hold;
      const cy = canvas.height * 0.35;
      const w = Math.min(740, canvas.width - 60), h = 92;
      const x = (canvas.width - w) / 2;
      const slideOff = (1 - slideIn) * -120; // slides in from above
      ctx.save();
      ctx.globalAlpha = k * 0.95;
      ctx.fillStyle = 'rgba(8,12,22,0.92)';
      ctx.beginPath(); ctx.roundRect(x, cy + slideOff, w, h, 12); ctx.fill();
      ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#88aacc';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('— FLOOR ' + _floorBanner.floor + ' —', canvas.width / 2, cy + slideOff + 28);
      ctx.shadowColor = '#88ccff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#e8f6ff';
      ctx.font = 'bold 36px monospace';
      ctx.fillText(_floorBanner.name, canvas.width / 2, cy + slideOff + 70);
      ctx.restore();
    }
  }
  // Visual refresh 3.9 — tempo zone transition flash. Brief edge bloom in
  // the new zone's color so the player knows they crossed a threshold.
  if (_tempoZoneFlashTimer > 0 && gameState === 'playing') {
    const ctx = renderer.ctx;
    const k = _tempoZoneFlashTimer / 0.4;
    ctx.save();
    ctx.globalAlpha = k * 0.55;
    const rg = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.32,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7
    );
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, _tempoZoneFlashColor);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Visual refresh 3.15 — damage direction indicator. Red arc on screen edge
  // pointing toward the source of the most recent hit. Fades over 700ms.
  if (_damageDirectionPulse && gameState === 'playing') {
    const ctx = renderer.ctx;
    const age = performance.now() / 1000 - _damageDirectionPulse.t0;
    if (age >= 0.7) _damageDirectionPulse = null;
    else {
      const k = 1 - age / 0.7;
      ctx.save();
      ctx.globalAlpha = k * 0.7;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const arcR = Math.max(canvas.width, canvas.height) * 0.4;
      ctx.strokeStyle = '#ff3322';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, _damageDirectionPulse.angle - 0.5, _damageDirectionPulse.angle + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Compact network-health icon — shows whenever in MP. Color = RTT band.
  // Visible at top-right; clicking shows the full debug HUD (Ctrl+N also works).
  if (net.role !== 'solo' && net.peers.size > 0) {
    const ctx = renderer.ctx;
    const x = canvas.width - 24, y = 24;
    let dotCol = '#666';
    let label = '?';
    if (_rttSamples.length === 0) { dotCol = '#888'; label = '—'; }
    else if (_rttAvg <= 60)  { dotCol = '#44ff88'; label = Math.round(_rttAvg) + 'ms'; }
    else if (_rttAvg <= 120) { dotCol = '#ffcc44'; label = Math.round(_rttAvg) + 'ms'; }
    else                     { dotCol = '#ff5544'; label = Math.round(_rttAvg) + 'ms'; }
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,20,0.85)';
    ctx.beginPath(); ctx.roundRect(x - 70, y - 12, 80, 22, 4); ctx.fill();
    ctx.fillStyle = dotCol;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cce0ee';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(label, x - 12, y + 4);
    ctx.restore();
  }
  // Visual refresh 3.7 — boss intro banner
  if (_bossIntro) {
    const ctx = renderer.ctx;
    const age = performance.now() / 1000 - _bossIntro.t0;
    const dur = 1.8;
    if (age >= dur) _bossIntro = null;
    else {
      const slideIn = Math.min(1, age / 0.3);
      const fade = age < dur - 0.4 ? 1 : Math.max(0, (dur - age) / 0.4);
      const k = slideIn * fade;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(40,8,12,0.92)';
      ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 120);
      ctx.shadowColor = '#ff3322';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#ffeecc';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('— BOSS APPEARS —', canvas.width / 2, canvas.height / 2 - 18);
      ctx.font = 'bold 48px monospace';
      ctx.fillStyle = '#ffaa66';
      ctx.fillText(_bossIntro.name, canvas.width / 2, canvas.height / 2 + 32);
      ctx.restore();
    }
  }

  // Profile overlay (toggle Ctrl+P) — frame ms, particle/enemy counts
  if (_profileVisible) {
    const s = window._profileSample || { upd: 0, ren: 0, frame: 0 };
    const ctx = renderer.ctx;
    const x = 16, y = canvas.height - 110, w = 260, h = 96;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.94)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#88aacc'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#88aacc';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('🛠  PROFILE (Ctrl+P)', x + 10, y + 16);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#cce0ff';
    const fps = s.frame > 0 ? Math.round(1000 / s.frame) : 0;
    ctx.fillText('Frame: ' + s.frame.toFixed(2) + ' ms (' + fps + ' fps)', x + 10, y + 34);
    ctx.fillText('Update: ' + s.upd.toFixed(2) + ' ms', x + 10, y + 50);
    ctx.fillText('Render: ' + s.ren.toFixed(2) + ' ms', x + 10, y + 66);
    const partCount = (particles.particles?.length || particles.texts?.length || 0);
    ctx.fillText('Particles: ' + partCount + '  Enemies: ' + enemies.length, x + 10, y + 82);
    ctx.restore();
  }

  // Network debug HUD (toggle Ctrl+N) — verifies battle networking sync
  if (_netDebugVisible) _drawNetDebug(renderer.ctx);
  // Scanlines overlay (subtle retro texture on all screens)
  renderer.drawScanlines();
  // Fade-to/from-black overlay
  if (_fadeAlpha > 0) {
    renderer.ctx.fillStyle = `rgba(0,0,0,${_fadeAlpha})`;
    renderer.ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (_fadeDir < 0) _fadeAlpha = Math.max(0, _fadeAlpha - 0.04);
    else if (_fadeDir > 0) _fadeAlpha = Math.min(1, _fadeAlpha + 0.04);
  }
  // Update DOM cursor color each frame
  const tempoColor = (gameState === 'playing' || gameState === 'paused') ? tempo.stateColor() : '#aaaacc';
  setCursorColor(tempoColor);
}

function drawDraftScreen() {
  const ctx = renderer.ctx;

  // Gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, '#08080f');
  bgGrad.addColorStop(1, '#0d0d18');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#44ff88';
  ctx.font = 'bold 46px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ROOM CLEARED!', canvas.width / 2, 75);

  ctx.fillStyle = 'rgba(68,255,136,0.12)';
  ctx.fillRect(0, 82, canvas.width, 2);

  ctx.fillStyle = '#aaa';
  ctx.font = '15px monospace';
  const hint = draftChoices.length < 3 ? `Only ${draftChoices.length} card(s) left to discover!` : 'Choose a new card for your deck.';
  ctx.fillText(hint, canvas.width / 2, 116);

  const CARD_W = 250, CARD_H = 340, GAP = 44;
  const count = draftChoices.length;
  const totalW = count * CARD_W + (count - 1) * GAP;
  const startX = (canvas.width - totalW) / 2;
  const startY = 152;
  draftBoxes = [];

  for (let i = 0; i < count; i++) {
    const x = startX + i * (CARD_W + GAP);
    const cardId = draftChoices[i];
    const def = CardDefinitions[cardId];
    if (!def) continue;

    // Staggered slide-in animation
    const _slideDelay = i * 0.09;
    const _slideT = Math.max(0, _draftRevealTimer - _slideDelay);
    const _slideProg = Math.min(1, _slideT / 0.38);
    const _slideOffY = (1 - _easeOutBack(_slideProg)) * -80;

    const rarCol = def.rarity === 'rare' ? '#bb44ff' : (def.rarity === 'uncommon' ? '#44dd88' : '#888899');
    const rarLabel = def.rarity ? def.rarity.toUpperCase() : 'COMMON';

    ctx.save();
    ctx.translate(0, _slideOffY);
    ctx.globalAlpha = Math.min(1, _slideProg * 1.5);
    ctx.shadowColor = def.rarity === 'rare' ? 'rgba(187,68,255,0.4)' : (def.rarity === 'uncommon' ? 'rgba(68,221,136,0.3)' : 'rgba(0,0,0,0.6)');
    ctx.shadowBlur = def.rarity === 'rare' ? 30 : 18;
    ctx.shadowOffsetY = 8;

    let grad = ctx.createLinearGradient(x, startY, x, startY + CARD_H);
    grad.addColorStop(0, '#22263a');
    grad.addColorStop(1, '#14141f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, startY, CARD_W, CARD_H, 14);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    // Rarity top bar
    ctx.fillStyle = rarCol;
    ctx.fillRect(x, startY, CARD_W, 4);
    // Left color stripe
    ctx.fillStyle = def.color || '#5588cc';
    ctx.fillRect(x, startY + 4, 4, CARD_H - 4);
    ctx.strokeStyle = rarCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, startY, CARD_W, CARD_H, 14);
    ctx.stroke();

    // Rarity shimmer — diagonal highlight sweep for rare/uncommon
    if (def.rarity === 'rare' || def.rarity === 'uncommon') {
      const _rsT = (performance.now() / 1000 * 0.6 + i * 0.55) % 1;
      const _rsY = startY - 20 + (CARD_H + 40) * _rsT;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, startY, CARD_W, CARD_H, 14);
      ctx.clip();
      const _rsGrad = ctx.createLinearGradient(x, _rsY, x + CARD_W, _rsY + CARD_H * 0.25);
      _rsGrad.addColorStop(0, 'rgba(255,255,255,0)');
      _rsGrad.addColorStop(0.4, `rgba(255,255,255,${def.rarity === 'rare' ? 0.11 : 0.07})`);
      _rsGrad.addColorStop(0.6, `rgba(255,255,255,${def.rarity === 'rare' ? 0.13 : 0.09})`);
      _rsGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = _rsGrad;
      ctx.fillRect(x, startY, CARD_W, CARD_H);
      ctx.restore();
    }

    // Key hint + rarity badge
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`[${i + 1}]`, x + CARD_W - 12, startY + 24);

    ctx.fillStyle = rarCol;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(rarLabel, x + 16, startY + 24);

    // Card name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(def.name, x + CARD_W / 2, startY + 52);

    // Divider
    ctx.strokeStyle = (def.color || '#5588cc') + '88';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 16, startY + 62); ctx.lineTo(x + CARD_W - 16, startY + 62); ctx.stroke();

    // AP badge
    ctx.fillStyle = '#44aaff';
    ctx.beginPath();
    ctx.arc(x + 24, startY + 84, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(def.cost, x + 24, startY + 90);

    // Tempo shift
    ctx.fillStyle = def.tempoShift > 0 ? '#ffaa55' : '#55bbff';
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.fillText((def.tempoShift > 0 ? '+' : '') + def.tempoShift + ' TEMPO', x + CARD_W / 2 + 12, startY + 92);

    // Type + range
    ctx.fillStyle = def.color || '#888';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(def.type.toUpperCase(), x + CARD_W / 2, startY + 116);
    ctx.fillStyle = '#667';
    ctx.font = '13px monospace';
    ctx.fillText(`${rangeLabel(def.range)} range`, x + CARD_W / 2, startY + 134);

    // DMG
    let dmgLineY = startY + 164;
    if (def.damage > 0) {
      ctx.fillStyle = '#ff9988';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${def.damage} DMG`, x + CARD_W / 2, dmgLineY);
      dmgLineY += 22;
    }
    // HP cost / cursed / self-damage indicators
    if (def.hpCost || def.selfDamage || def.cursed || def.selfDamagePerHit) {
      ctx.fillStyle = '#ff4455';
      ctx.font = 'bold 14px monospace';
      const costParts = [];
      if (def.hpCost) costParts.push(`Costs ${def.hpCost} HP`);
      if (def.selfDamage) costParts.push(`Costs ${def.selfDamage} HP`);
      if (def.selfDamagePerHit) costParts.push(`${def.selfDamagePerHit} HP/hit`);
      if (def.cursed) costParts.push('CURSED');
      ctx.fillText(costParts.join(' · '), x + CARD_W / 2, dmgLineY);
      dmgLineY += 18;
    }
    // Slot width indicator
    if (def.slotWidth && def.slotWidth > 1) {
      ctx.fillStyle = '#ffaa44';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('[2 SLOTS]', x + CARD_W / 2, dmgLineY);
      dmgLineY += 18;
    }

    // Description
    ctx.fillStyle = '#bbbbc8';
    ctx.font = '13px monospace';
    ui._wrapText(ctx, def.desc, x + 14, Math.max(dmgLineY, startY + 196), CARD_W - 28, 18);

    // Pick CTA
    ctx.fillStyle = rarCol;
    ctx.font = 'bold 15px monospace';
    ctx.fillText('CLICK TO PICK', x + CARD_W / 2, startY + CARD_H - 16);

    ctx.restore();
    // Only register click target once card is sufficiently visible
    if (_slideProg > 0.5) {
      draftBoxes.push({ x, y: startY + _slideOffY, w: CARD_W, h: CARD_H, idx: i });
    }
  }
}
function _easeOutBounce(t) {
  const n1=7.5625, d1=2.75;
  if(t<1/d1) return n1*t*t;
  if(t<2/d1) { t-=1.5/d1; return n1*t*t+0.75; }
  if(t<2.5/d1) { t-=2.25/d1; return n1*t*t+0.9375; }
  t-=2.625/d1; return n1*t*t+0.984375;
}
function _easeOutBack(t) {
  const c1=1.70158,c3=c1+1;
  return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);
}


function renderLootBoxOpen(ctx, t) {
  const lb = lootBoxOpen;
  if (!lb) return;
  const el = lb.elapsed;
  const isSL = lb.isSL;
  const result = lb.result;
  const rarCol = RARITY_COLORS[result.rarity] || '#ffffff';
  const tierInfo = BOX_TIERS[lb.boxTier] || {};
  const tierCol = tierInfo.color || '#888888';
  const tierGlow = tierInfo.glowColor || '#ffffff';
  const cx = canvas.width/2, cy = canvas.height/2;

  // ── helpers ──
  const cl01 = v => Math.max(0, Math.min(1, v));
  const easeOutCubic = v => 1 - Math.pow(1 - v, 3);
  // hex color → [r,g,b]
  const hexRGB = hex => {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  };
  const rarRGB = hexRGB(rarCol);

  // Timing by rarity tier
  const isLeg = result.rarity === 'legendary';
  const burstTime  = isSL ? 0.95 : (isLeg ? 0.85 : 0.78);
  const revealStart= isSL ? 1.85 : (isLeg ? 1.0  : 0.88);
  const typeStart  = isSL ? 2.8  : 9999;

  // ── Background ──
  let bgAlpha = 0.90;
  if (isSL && el >= burstTime && el < burstTime + 0.35) {
    bgAlpha = Math.min(1, (el - burstTime) / 0.35); // SL blackout
  }
  ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ══════════════════════════════════
  // PHASE 1: BOX (enter + shake + crack)
  // ══════════════════════════════════
  const boxVisible = el < burstTime && !(isSL && el >= burstTime - 0.1);
  if (boxVisible) {
    const BW = 130, BH = 130;
    // Enter bounce (0 → 0.35s)
    const enterT = cl01(el / 0.35);
    const enterEase = _easeOutBack(enterT);
    const boxCY = cy - 20 + BH * (1 - enterEase);

    // Shake builds then goes frantic near burst
    const shakeIntensity = Math.pow(cl01(el / burstTime), 2.5);
    const shake = Math.sin(el * 45 + el * el * 8) * shakeIntensity * 22;
    const shakeY = Math.sin(el * 31) * shakeIntensity * 8;

    ctx.save();
    ctx.translate(cx + shake, boxCY + shakeY);

    // Outer glow (pulses faster near burst)
    const glowFreq = 4 + shakeIntensity * 12;
    const glowAmt = 18 + 22 * ((Math.sin(el * glowFreq) + 1) * 0.5);
    ctx.save();
    ctx.shadowColor = tierGlow;
    ctx.shadowBlur = glowAmt;

    // Box body with rounded corners
    ctx.fillStyle = tierCol;
    ctx.beginPath(); ctx.roundRect(-BW/2, -BH/2, BW, BH, 10); ctx.fill();

    // Shine stripe
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(-BW/2 + 4, -BH/2 + 4, BW - 8, 18, 4); ctx.fill();

    // Border
    ctx.strokeStyle = tierGlow;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-BW/2, -BH/2, BW, BH, 10); ctx.stroke();
    ctx.restore();

    // Lid separator
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-BW/2 + 6, -8); ctx.lineTo(BW/2 - 6, -8); ctx.stroke();

    // Label
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillText(tierInfo.label || 'Box', 0, 8);

    // Crack lines (appear in last 35% before burst)
    const crackStart = burstTime * 0.62;
    if (el >= crackStart) {
      const crackP = cl01((el - crackStart) / (burstTime - crackStart));
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.globalAlpha = cl01(crackP * 2);
      const fractures = [
        [[0,0],[8,-12],[16,-10],[BW*0.48,-BH*0.46]],
        [[0,0],[-7,-13],[-13,-6],[-BW*0.46,-BH*0.47]],
        [[0,0],[10,8],[6,20],[BW*0.47,BH*0.46]],
        [[0,0],[-9,10],[-BW*0.44,BH*0.40]],
        [[0,0],[3,14],[BW*0.20,BH*0.48]],
        [[0,0],[-4,-7],[-BW*0.28,-BH*0.49]],
      ];
      for (const frac of fractures) {
        const pts = Math.max(2, Math.ceil(frac.length * crackP));
        ctx.beginPath(); ctx.moveTo(frac[0][0], frac[0][1]);
        for (let fi = 1; fi < pts; fi++) {
          const fLerp = cl01(crackP * frac.length - fi + 1);
          ctx.lineTo(
            frac[fi-1][0] + (frac[fi][0]-frac[fi-1][0]) * fLerp,
            frac[fi-1][1] + (frac[fi][1]-frac[fi-1][1]) * fLerp
          );
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Ambient glow pool under the box
    const poolAlpha = 0.08 + shakeIntensity * 0.18;
    const pool = ctx.createRadialGradient(cx, cy + 40, 0, cx, cy + 40, 160);
    pool.addColorStop(0, `rgba(${hexRGB(tierGlow).join(',')},${poolAlpha})`);
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(cx, cy + 40, 160, 60, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ══════════════════════════════════
  // PHASE 2: BURST EFFECTS
  // ══════════════════════════════════
  if (el >= burstTime && !(isSL && el >= burstTime + 0.35)) {
    const bAge = el - burstTime;

    // White flash (very brief)
    const flashA = cl01(1 - bAge / 0.18);
    if (flashA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashA * 0.75})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Light rays
    const rayA = cl01(1 - bAge / 0.65) * (isSL ? 0.5 : 0.38);
    if (rayA > 0) {
      ctx.save();
      ctx.translate(cx, cy - 20);
      const rotation = bAge * 0.4;
      const numRays = isSL ? 18 : 14;
      for (let r = 0; r < numRays; r++) {
        const ang = (r / numRays) * Math.PI * 2 + rotation;
        const spread = 0.042;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang - spread) * 700, Math.sin(ang - spread) * 700);
        ctx.lineTo(Math.cos(ang + spread) * 700, Math.sin(ang + spread) * 700);
        ctx.closePath();
        // Alternate tier and rarity color for rays
        const useRar = r % 2 === 0;
        ctx.fillStyle = useRar
          ? `rgba(${rarRGB.join(',')},${rayA})`
          : `rgba(${hexRGB(tierGlow).join(',')},${rayA})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Expanding ring waves
    const ringCount = isSL ? 5 : 3;
    for (let ring = 0; ring < ringCount; ring++) {
      const rT = cl01((bAge - ring * 0.07) / 0.55);
      if (rT <= 0) continue;
      const ringR = easeOutCubic(rT) * (isSL ? 420 : 340);
      const ringA = (1 - rT) * (ring === 0 ? 0.9 : 0.6);
      ctx.save();
      ctx.strokeStyle = ring % 2 === 0
        ? `rgba(${rarRGB.join(',')},${ringA})`
        : `rgba(${hexRGB(tierGlow).join(',')},${ringA})`;
      ctx.lineWidth = ring === 0 ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(cx, cy - 20, Math.max(1, ringR), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Shards flying outward
    const shardDur = isSL ? 0.5 : 0.42;
    if (bAge < shardDur) {
      const numShards = isSL ? 24 : 16;
      for (let s = 0; s < numShards; s++) {
        const ang = (s / numShards) * Math.PI * 2 + s * 0.31;
        const speed = (80 + (s % 4) * 55) + (isSL ? 40 : 0);
        const grav = bAge * bAge * 80;
        const sx = cx + Math.cos(ang) * speed * bAge;
        const sy = (cy - 20) + Math.sin(ang) * speed * bAge + grav;
        const shardA = Math.max(0, 1 - bAge / shardDur);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang + bAge * 6);
        ctx.globalAlpha = shardA * 0.9;
        // Alternate shard color between tier and rarity
        ctx.fillStyle = s % 3 === 0 ? rarCol : tierCol;
        ctx.fillRect(-6, -2.5, 12, 5);
        ctx.restore();
      }
    }
  }

  // SL blackout — stop here during blackout window
  if (isSL && el >= burstTime + 0.0 && el < burstTime + 0.35) return;

  // SL beam of light
  if (isSL && el >= burstTime + 0.35 && el < revealStart) {
    const prog = cl01((el - (burstTime + 0.35)) / (revealStart - burstTime - 0.35));
    const beamH = canvas.height * easeOutCubic(prog);
    const beamW = 70 * (1 - prog * 0.55);
    // Core beam
    ctx.fillStyle = `rgba(255,255,255,${0.85 - prog * 0.35})`;
    ctx.fillRect(cx - beamW / 2, 0, beamW, beamH);
    // Wide color glow beside beam
    const beamGrad = ctx.createLinearGradient(cx - beamW * 4, 0, cx + beamW * 4, 0);
    beamGrad.addColorStop(0, 'rgba(0,0,0,0)');
    beamGrad.addColorStop(0.35, `rgba(${rarRGB.join(',')},0.22)`);
    beamGrad.addColorStop(0.5, `rgba(255,255,255,0.12)`);
    beamGrad.addColorStop(0.65, `rgba(${rarRGB.join(',')},0.22)`);
    beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(cx - beamW * 4, 0, beamW * 8, beamH);
    return;
  }

  // ══════════════════════════════════
  // PHASE 3: CARD REVEAL
  // ══════════════════════════════════
  if (el >= revealStart) {
    const CW = 300, CH = 390;
    const revealDur = isSL ? 1.1 : 0.75;
    const prog = cl01((el - revealStart) / revealDur);
    const posEase = _easeOutBack(prog);
    // Card flies up from below
    const cardOffY = canvas.height * (1 - posEase);
    const cardX = cx - CW / 2;
    const cardY = cy - CH / 2 + cardOffY;

    const rarR = result.rarity === 'superleg' ? getPrismaticColor(t) : rarCol;
    const rarRGB2 = result.rarity === 'superleg' ? [255, 200, 100] : rarRGB;

    // Glow pool beneath the card
    if (prog > 0.3) {
      const poolA = cl01((prog - 0.3) / 0.5) * (isLeg || isSL ? 0.5 : 0.28);
      const pool2 = ctx.createRadialGradient(cx, cardY + CH * 0.85, 0, cx, cardY + CH * 0.85, 220);
      pool2.addColorStop(0, `rgba(${rarRGB2.join(',')},${poolA})`);
      pool2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pool2;
      ctx.beginPath(); ctx.ellipse(cx, cardY + CH * 0.85, 220, 80, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Card body
    ctx.fillStyle = '#0a0a18';
    ctx.beginPath(); ctx.roundRect(cardX, cardY, CW, CH, 14); ctx.fill();

    // Rarity shimmer overlay for leg+
    if (isLeg || isSL) {
      const shimmer = (Math.sin(t * 3.5) + 1) * 0.5;
      ctx.fillStyle = `rgba(${rarRGB2.join(',')},${0.06 + shimmer * 0.10})`;
      ctx.beginPath(); ctx.roundRect(cardX, cardY, CW, CH, 14); ctx.fill();
    }

    // Border glow
    ctx.save();
    ctx.shadowColor = rarR;
    ctx.shadowBlur = (isLeg || isSL) ? 28 + Math.sin(t * 4) * 8 : 14;
    ctx.strokeStyle = rarR;
    ctx.lineWidth = (isLeg || isSL) ? 3.5 : 2.5;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, CW, CH, 14); ctx.stroke();
    ctx.restore();

    // Top color bar
    ctx.fillStyle = rarR;
    ctx.fillRect(cardX + 3, cardY + 3, CW - 6, 6);

    // Rarity label
    ctx.fillStyle = rarR; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    const rarLabel = result.rarity === 'superleg' ? 'SUPER LEGENDARY' : (result.rarity || '').toUpperCase();
    ctx.fillText(rarLabel, cx, cardY + 32);

    // Category label
    ctx.fillStyle = '#778899'; ctx.font = '13px monospace';
    ctx.fillText(CATEGORY_LABELS[result.category] || result.category, cx, cardY + 52);

    // Preview circle
    const prevR = 40;
    const prevX = cx, prevY = cardY + 120;
    ctx.save();
    if (result.category === 'bodyColor') {
      if (result.animated && result.animFn) {
        result.animFn(ctx, prevX, prevY, prevR, t);
      } else if (result.value) {
        // Outer glow ring (no shadowBlur)
        ctx.fillStyle = result.value + '44';
        ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = result.value;
        ctx.beginPath(); ctx.arc(prevX, prevY, prevR, 0, Math.PI * 2); ctx.fill();
      }
    } else if (result.category === 'outlineColor') {
      // Dark base + colored stroke ring to show it's an outline cosmetic
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR, 0, Math.PI * 2); ctx.fill();
      if (result.animated && result.animFn) {
        result.animFn(ctx, prevX, prevY, prevR, t);
      } else {
        ctx.strokeStyle = result.value || '#ffffff';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(prevX, prevY, prevR, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (result.category === 'shape') {
      ctx.fillStyle = '#44dd88';
      if (result.animated && result.animFn) {
        result.animFn(ctx, prevX, prevY, prevR, t, '#44dd88');
      } else if (result.value) {
        drawPlayerShape(ctx, prevX, prevY, prevR, result.value);
        ctx.fill();
      }
    } else if (result.category === 'aura') {
      ctx.fillStyle = '#44dd88';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR * 0.7, 0, Math.PI * 2); ctx.fill();
      drawPlayerAura(ctx, prevX, prevY, prevR * 0.7, result.value, t, 50);
    } else if (result.category === 'trail') {
      // Dark bg + animated comet-tail to represent a movement trail
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 4, 0, Math.PI * 2); ctx.fill();
      const trailCol = (result.animated && result.getColor) ? result.getColor(t) : result.value;
      const trailAngle = t * 0.8 + Math.PI;
      for (let ti = 7; ti >= 0; ti--) {
        const tailFrac = ti / 8;
        const tailDist = tailFrac * prevR * 0.9;
        ctx.save();
        ctx.globalAlpha = (1 - tailFrac) * 0.75;
        ctx.fillStyle = trailCol;
        ctx.beginPath();
        ctx.arc(
          prevX + Math.cos(trailAngle) * tailDist,
          prevY + Math.sin(trailAngle) * tailDist * 0.35,
          prevR * 0.48 * (1 - tailFrac * 0.55),
          0, Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    } else if (result.category === 'flash') {
      // Dark bg + starburst explosion in the flash color
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 4, 0, Math.PI * 2); ctx.fill();
      const flashCol = (result.animated && result.getFlashColor) ? result.getFlashColor() : result.value;
      const flashPulse = (Math.sin(t * 4) + 1) * 0.5;
      ctx.fillStyle = flashCol;
      ctx.beginPath(); ctx.arc(prevX, prevY, 8 + flashPulse * 4, 0, Math.PI * 2); ctx.fill();
      for (let ri = 0; ri < 8; ri++) {
        const ra = (ri / 8) * Math.PI * 2 + t * 0.5;
        const rLen = prevR * (0.52 + flashPulse * 0.28);
        ctx.save();
        ctx.globalAlpha = 0.85 - ri * 0.04;
        ctx.strokeStyle = flashCol;
        ctx.lineWidth = ri < 4 ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(prevX + Math.cos(ra) * 10, prevY + Math.sin(ra) * 10);
        ctx.lineTo(prevX + Math.cos(ra) * rLen, prevY + Math.sin(ra) * rLen);
        ctx.stroke();
        ctx.restore();
      }
    } else if (result.category === 'deathBurst') {
      // Dark bg + radiating particles using burstColors
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 4, 0, Math.PI * 2); ctx.fill();
      const burstColors = result.burstColors || [result.value];
      const pCount = Math.min(burstColors.length * 2, 16);
      for (let bi = 0; bi < pCount; bi++) {
        const ba = (bi / pCount) * Math.PI * 2 + t * 0.4;
        const bDist = prevR * (0.28 + 0.52 * ((bi * 0.618) % 1));
        const bCol = burstColors[bi % burstColors.length];
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + bi);
        ctx.fillStyle = bCol;
        ctx.beginPath();
        ctx.arc(
          prevX + Math.cos(ba) * bDist, prevY + Math.sin(ba) * bDist,
          3.5 + 1.5 * Math.sin(t * 3 + bi * 1.4), 0, Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    } else if (result.category === 'killEffect') {
      // Dark bg + pulsing ring + burst dots showing a kill pop
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 4, 0, Math.PI * 2); ctx.fill();
      const killColors = {
        simple_pop: '#ffcc44', spark_burst: '#ffff44', coin_shower: '#ffdd00',
        freeze_frame: '#88ddff', skull_pop: '#eeeeee', kill_supernova: '#ff8800', rift_tear: '#aa44ff'
      };
      const kCol = killColors[result.value] || '#ffffff';
      const killPulse = (Math.sin(t * 3) + 1) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.9 - killPulse * 0.3;
      ctx.strokeStyle = kCol;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(prevX, prevY, 10 + killPulse * prevR * 0.65, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      for (let ki = 0; ki < 6; ki++) {
        const ka = (ki / 6) * Math.PI * 2 + t * 1.2;
        const kd = 12 + killPulse * prevR * 0.55;
        ctx.save();
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 2 + ki);
        ctx.fillStyle = kCol;
        ctx.beginPath(); ctx.arc(prevX + Math.cos(ka) * kd, prevY + Math.sin(ka) * kd, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else if (result.category === 'title') {
      // Dark bg + title text in its color
      ctx.fillStyle = '#0d0d14';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 4, 0, Math.PI * 2); ctx.fill();
      const titleCol = result.animated ? getPrismaticColor(t, 100, 65) : (result.color || '#ffffff');
      ctx.fillStyle = titleCol;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(result.value || result.name, prevX, prevY);
    } else {
      // Generic fallback
      const previewCol = (result.value && typeof result.value === 'string' && result.value.startsWith('#')) ? result.value : '#44dd88';
      ctx.fillStyle = previewCol + '44';
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = previewCol;
      ctx.beginPath(); ctx.arc(prevX, prevY, prevR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Name
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
    ctx.fillText(result.name, cx, cardY + 196);

    // Subtitle
    if (result.isDuplicate) {
      ctx.fillStyle = '#999999'; ctx.font = '13px monospace';
      ctx.fillText('Already owned \u2014 +15 gold refunded', cx, cardY + 224);
    } else {
      ctx.fillStyle = rarR; ctx.font = '14px monospace';
      ctx.fillText('New cosmetic unlocked!', cx, cardY + 224);
    }

    // Orbiting sparkles for uncommon+ (and lots for legendary/SL)
    const sparkCount = isSL ? 12 : isLeg ? 8 : (result.rarity === 'uncommon' ? 5 : 0);
    if (sparkCount > 0 && prog > 0.5) {
      const sparkA = cl01((prog - 0.5) / 0.4);
      for (let s = 0; s < sparkCount; s++) {
        const sa = (t * (isSL ? 1.4 : 0.9) + s * Math.PI * 2 / sparkCount) % (Math.PI * 2);
        const orbitRx = CW * 0.52 + Math.sin(t * 0.8 + s) * 10;
        const orbitRy = CH * 0.52 + Math.sin(t * 0.7 + s * 1.3) * 8;
        const sx2 = cx + Math.cos(sa) * orbitRx;
        const sy2 = cardY + CH / 2 + Math.sin(sa) * orbitRy;
        const sAlpha = sparkA * (0.5 + 0.5 * Math.sin(t * 4.5 + s * 1.9));
        const sSize = isSL ? 3.5 : 2.5;
        ctx.save();
        ctx.shadowColor = rarR; ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(255,255,255,${sAlpha.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(sx2, sy2, sSize, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // SL typewriter
    if (isSL && el >= typeStart) {
      const full = 'SUPER LEGENDARY!';
      const chars = Math.min(full.length, Math.floor((el - typeStart) / (0.8 / full.length)));
      ctx.save();
      ctx.shadowColor = getPrismaticColor(t, 100, 70); ctx.shadowBlur = 20;
      ctx.fillStyle = getPrismaticColor(t, 100, 70);
      ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
      ctx.fillText(full.slice(0, chars), cx, cardY - 28);
      ctx.restore();
    }

    // Duplicate ribbon
    if (result.isDuplicate) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cardX, cardY, CW, CH, 14); ctx.clip();
      ctx.save();
      ctx.translate(cardX + CW - 2, cardY + 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(120,120,120,0.78)';
      ctx.fillRect(-60, -13, 120, 26);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('DUPLICATE', 0, 4);
      ctx.restore(); ctx.restore();
    }

    // Dismiss prompt
    if (lb.waitingDismiss) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.fillStyle = `rgba(180,210,255,${pulse})`;
      ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText('[ Press ENTER or click ]', cx, cardY + CH + 34);
    }
  }
}

function drawPauseMenu() {
  const ctx = renderer.ctx;

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Controls overlay mode
  if (pauseShowControls) {
    pauseMenuBoxes = [];

    const p1Pad = meta.isGamepadEnabled(0);
    const p2Pad = meta.isGamepadEnabled(1);

    // Sized for two control-scheme columns + tempo/mechanics text + toggles.
    const cW = Math.min(720, canvas.width - 60);
    const cH = Math.min(canvas.height - 40, localCoop ? 560 : 500);
    const cpx = (canvas.width - cW) / 2;
    const cpy = (canvas.height - cH) / 2;

    ctx.fillStyle = '#0a0a16';
    ctx.beginPath();
    ctx.roundRect(cpx, cpy, cW, cH, 14);
    ctx.fill();
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTROLS & MECHANICS', canvas.width / 2, cpy + 30);

    // ── Gamepad toggle row (P1 always; P2 only in local co-op) ──
    const toggleY = cpy + 48;
    const toggleH = 28;
    const toggleW = localCoop ? 180 : 240;
    const toggleGap = 14;
    const toggleTotalW = localCoop ? (toggleW * 2 + toggleGap) : toggleW;
    const toggleStartX = (canvas.width - toggleTotalW) / 2;

    function _drawPadToggle(label, on, x, action) {
      ctx.fillStyle = on ? '#123022' : '#1a1a28';
      ctx.beginPath();
      ctx.roundRect(x, toggleY, toggleW, toggleH, 6);
      ctx.fill();
      ctx.strokeStyle = on ? '#44ddaa' : '#5566aa';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = on ? '#aaffd0' : '#bbccdd';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText((on ? '🎮 ' : '⌨ ') + label + ' — ' + (on ? 'GAMEPAD' : 'KEYBOARD'),
                   x + toggleW / 2, toggleY + 18);
      pauseMenuBoxes.push({ x, y: toggleY, w: toggleW, h: toggleH, action });
    }
    _drawPadToggle(localCoop ? 'P1' : 'YOU', p1Pad, toggleStartX, 'toggle_pad_p1');
    if (localCoop) {
      _drawPadToggle('P2', p2Pad, toggleStartX + toggleW + toggleGap, 'toggle_pad_p2');
    }

    // ── Control scheme columns (P1 / P2 if coop) ──
    const colsY = toggleY + toggleH + 18;
    const colsH = 120;
    const innerPad = 24;
    const colGap = 16;
    const colCount = localCoop ? 2 : 1;
    const colW = (cW - innerPad * 2 - colGap * (colCount - 1)) / colCount;
    _drawSchemeColumn(ctx, cpx + innerPad, colsY, colW, colsH, localCoop ? 'P1' : '', p1Pad, false);
    if (localCoop) {
      _drawSchemeColumn(ctx, cpx + innerPad + colW + colGap, colsY, colW, colsH, 'P2', p2Pad, true);
    }

    // ── Tempo + mechanics reference (same copy as before) ──
    const refY = colsY + colsH + 14;
    const refLines = [
      { text: 'THE TEMPO BAR', col: '#ffaa44', font: 'bold 16px monospace' },
      { text: 'COLD  (<30 Tempo)  = 0.7× damage.  Ice cards deal 3× here!', col: '#4a9eff', font: '13px monospace' },
      { text: 'FLOWING  (30–70)  = 1.0× damage, balanced.', col: '#44dd88', font: '13px monospace' },
      { text: 'HOT  (70–90)  = 1.3× damage, 1.2× speed, dash deals damage!', col: '#ff8833', font: '13px monospace' },
      { text: 'CRITICAL  (90+)  = 1.8× damage, attacks PIERCE!', col: '#ff3333', font: '13px monospace' },
      { text: 'Fill to 100 → auto CRASH AoE.   Fill to 0 → ICE CRASH freeze.', col: '#aaa', font: '13px monospace' },
      { text: '', col: '', font: '' },
      { text: 'Perfect Dodge  —  dodge just as an attack lands → slow-mo + tempo', col: '#ddd', font: '13px monospace' },
      { text: 'Combo  —  hit same enemy repeatedly for 1.4× damage at 3+ hits', col: '#ddd', font: '13px monospace' },
    ];
    const refLineH = 20;
    for (let i = 0; i < refLines.length; i++) {
      const cl = refLines[i];
      if (!cl.text) continue;
      ctx.fillStyle = cl.col;
      ctx.font = cl.font;
      ctx.textAlign = 'center';
      ctx.fillText(cl.text, canvas.width / 2, refY + i * refLineH);
    }

    // ── Back button ──
    const closeBtnW = 180, closeBtnH = 42;
    const closeBtnX = (canvas.width - closeBtnW) / 2;
    const closeBtnY = cpy + cH - closeBtnH - 12;
    ctx.fillStyle = '#1a2030';
    ctx.beginPath();
    ctx.roundRect(closeBtnX, closeBtnY, closeBtnW, closeBtnH, 8);
    ctx.fill();
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◀  BACK', canvas.width / 2, closeBtnY + 27);
    pauseMenuBoxes.push({ x: closeBtnX, y: closeBtnY, w: closeBtnW, h: closeBtnH, action: 'controls' });
    return;
  }

  // Panel
  const panelW = 400, panelH = pauseQuitConfirm ? 310 : 400;
  const px = (canvas.width - panelW) / 2;
  const py = (canvas.height - panelH) / 2;

  ctx.fillStyle = '#0e0e1a';
  ctx.beginPath();
  ctx.roundRect(px, py, panelW, panelH, 16);
  ctx.fill();
  ctx.strokeStyle = '#44aaff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px, py, panelW, panelH, 16);
  ctx.stroke();

  pauseMenuBoxes = [];

  if (pauseQuitConfirm) {
    const inRemote = net.role !== 'solo' && net.peers.size > 0;
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QUIT TO MENU?', canvas.width / 2, py + 55);
    ctx.fillStyle = inRemote ? '#ffaa44' : '#888';
    ctx.font = '13px monospace';
    if (inRemote) {
      ctx.fillText('⚠ This will END the remote session', canvas.width / 2, py + 82);
      ctx.fillText('for all players. Your run will be lost.', canvas.width / 2, py + 100);
    } else {
      ctx.fillText('Your run progress will be lost.', canvas.width / 2, py + 82);
    }

    const btnW = 160, btnH = 48, btnGap = 20;
    const totalW = btnW * 2 + btnGap;
    const confirmBtns = [
      { label: 'YES, QUIT', action: 'quit', color: '#ff5555', bg: '#2e1a1a', x: (canvas.width - totalW) / 2 },
      { label: 'CANCEL', action: 'quit_cancel', color: '#44ff88', bg: '#1a2e22', x: (canvas.width - totalW) / 2 + btnW + btnGap },
    ];
    const by = py + 120;
    for (const btn of confirmBtns) {
      ctx.fillStyle = btn.bg;
      ctx.beginPath();
      ctx.roundRect(btn.x, by, btnW, btnH, 8);
      ctx.fill();
      ctx.strokeStyle = btn.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = btn.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, btn.x + btnW / 2, by + 31);
      pauseMenuBoxes.push({ x: btn.x, y: by, w: btnW, h: btnH, action: btn.action });
    }

    ctx.fillStyle = '#444';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC to cancel', canvas.width / 2, py + panelH - 18);
    return;
  }

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', canvas.width / 2, py + 52);

  const buttons = [
    { label: 'RESUME', action: 'resume', color: '#44ff88', bg: '#1a2e22' },
    { label: 'CONTROLS / HOW TO PLAY', action: 'controls', color: '#44aaff', bg: '#0e1a2e' },
    { label: 'RESTART RUN', action: 'restart', color: '#ffaa44', bg: '#2e2a1a' },
    { label: 'QUIT TO MENU', action: 'quit', color: '#ff5555', bg: '#2e1a1a' },
  ];

  const btnW = 270, btnH = 46, btnGap = 12;
  const btnStartY = py + 82;

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const bx = (canvas.width - btnW) / 2;
    const by = btnStartY + i * (btnH + btnGap);
    ctx.fillStyle = btn.bg;
    ctx.beginPath(); ctx.roundRect(bx, by, btnW, btnH, 8); ctx.fill();
    ctx.strokeStyle = btn.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = btn.color;
    ctx.font = 'bold 17px monospace'; ctx.textAlign = 'center';
    ctx.fillText(btn.label, canvas.width / 2, by + 29);
    pauseMenuBoxes.push({ x: bx, y: by, w: btnW, h: btnH, action: btn.action });
  }

  // Volume control in pause menu
  const vol = audio.getMasterVolume();
  const volY = btnStartY + buttons.length * (btnH + btnGap) + 4;
  ctx.fillStyle = '#556'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('VOLUME', canvas.width / 2, volY);
  const pips = 10, pipW = 18, pipH = 11, pipGap = 3;
  const pipTotalW2 = pips * (pipW + pipGap) - pipGap;
  const pipStartX2 = canvas.width / 2 - pipTotalW2 / 2;
  for (let p = 0; p < pips; p++) {
    ctx.fillStyle = p < Math.round(vol * pips) ? '#44cc88' : '#1a2a22';
    ctx.fillRect(pipStartX2 + p * (pipW + pipGap), volY + 5, pipW, pipH);
  }
  const vbW = 26, vbH = 22;
  const vDownX2 = pipStartX2 - vbW - 4, vUpX2 = pipStartX2 + pipTotalW2 + 4;
  ctx.fillStyle = '#334455'; ctx.fillRect(vDownX2, volY + 3, vbW, vbH);
  ctx.fillStyle = '#aabb88'; ctx.font = 'bold 13px monospace';
  ctx.fillText('−', vDownX2 + vbW / 2, volY + 18);
  ctx.fillStyle = '#334455'; ctx.fillRect(vUpX2, volY + 3, vbW, vbH);
  ctx.fillStyle = '#aabb88';
  ctx.fillText('+', vUpX2 + vbW / 2, volY + 18);
  pauseMenuBoxes.push({ x: vDownX2, y: volY + 3, w: vbW, h: vbH, action: 'vol_down' });
  pauseMenuBoxes.push({ x: vUpX2, y: volY + 3, w: vbW, h: vbH, action: 'vol_up' });

  ctx.fillStyle = '#444'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('ESC to resume', canvas.width / 2, py + panelH - 14);
}

// ── VICTORY SCREEN RENDER ────────────────────────────────────────────────
function _drawVictoryScreen(ctx) {
  const now = performance.now();
  if (!_victoryAnimStart) _victoryAnimStart = now;
  const elapsed = now - _victoryAnimStart;
  const cl01 = t => Math.max(0, Math.min(1, t));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const cx = canvas.width / 2, cy = canvas.height / 2;

  // Background — deep royal gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, '#050510');
  bgGrad.addColorStop(0.5, '#100820');
  bgGrad.addColorStop(1, '#080510');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gold overlay flash (0–500ms)
  if (elapsed < 500) {
    const flashA = cl01(1 - elapsed / 500) * 0.55;
    ctx.fillStyle = `rgba(255,215,0,${flashA})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Expanding concentric rings
  for (let ring = 0; ring < 5; ring++) {
    const ringDelay = ring * 180;
    const ringT = cl01((elapsed - ringDelay) / 700);
    if (ringT <= 0) continue;
    const ringR = easeOut(ringT) * canvas.width * 0.7;
    const ringA = (1 - ringT) * 0.5 * (1 - ring * 0.12);
    ctx.save();
    ctx.strokeStyle = ring % 2 === 0 ? `rgba(255,215,0,${ringA})` : `rgba(255,255,255,${ringA * 0.6})`;
    ctx.lineWidth = 4 - ring * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, ringR), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Star field — gold sparkles drifting upward
  {
    const starCount = 60;
    const starSeed = Math.floor(elapsed / 16);
    for (let s = 0; s < starCount; s++) {
      const phase = (s * 137.5 + starSeed * 0.4 + s * 0.7) % 1000;
      const sx = (s * 67.3 + Math.sin(s * 2.1 + elapsed * 0.0006) * 80 + canvas.width * 0.5 + (s - 30) * (canvas.width / 60)) % canvas.width;
      const sy = ((canvas.height * 1.1 - (phase * canvas.height / 400 + elapsed * 0.03 * (0.5 + (s % 5) * 0.15)) % (canvas.height * 1.2)));
      const sAlpha = cl01(Math.sin(elapsed * 0.003 + s * 1.7) * 0.5 + 0.5) * 0.9;
      const sR = 1 + (s % 4) * 0.8;
      ctx.globalAlpha = sAlpha;
      ctx.fillStyle = s % 3 === 0 ? '#ffd700' : (s % 3 === 1 ? '#ffffff' : '#ffaa44');
      ctx.beginPath();
      ctx.arc(sx, sy, sR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // VICTORY! text — scales in with easeOutBack
  const titleT = cl01((elapsed - 100) / 600);
  if (titleT > 0) {
    const scale = easeOutBack(titleT);
    const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.0028);
    ctx.save();
    ctx.translate(cx, cy - 80);
    ctx.scale(scale, scale);
    // Gold shimmer text — double draw for glow effect
    ctx.globalAlpha = cl01(elapsed / 300) * pulse;
    ctx.font = 'bold 82px monospace';
    ctx.textAlign = 'center';
    // Outer glow pass (offset double-draw instead of shadowBlur)
    for (let dx = -3; dx <= 3; dx += 3) {
      for (let dy = -3; dy <= 3; dy += 3) {
        if (dx === 0 && dy === 0) continue;
        ctx.fillStyle = 'rgba(255,140,0,0.25)';
        ctx.fillText('VICTORY!', dx, dy);
      }
    }
    // Prismatic gold main text
    const shimmerT = elapsed * 0.001;
    ctx.fillStyle = `hsl(${45 + Math.sin(shimmerT) * 15},100%,${65 + Math.sin(shimmerT * 1.3) * 10}%)`;
    ctx.fillText('VICTORY!', 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Score preview
  const scoreT = cl01((elapsed - 800) / 400);
  if (scoreT > 0 && runStats._cachedScore) {
    ctx.globalAlpha = easeOut(scoreT);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${runStats._cachedScore} pts`, cx, cy + 10);
    ctx.globalAlpha = 1;
  }

  // Character + floor info
  const infoT = cl01((elapsed - 1200) / 400);
  if (infoT > 0) {
    const ch = Characters[selectedCharId];
    ctx.globalAlpha = easeOut(infoT);
    ctx.fillStyle = ch ? ch.color : '#aaa';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${ch?.name || 'Hero'}  ·  Floor ${runStats.floor || 1}`, cx, cy + 52);
    ctx.globalAlpha = 1;
  }

  // "Press any key" prompt — fades in after 2.5s
  if (_victoryReady) {
    const promptAlpha = cl01((elapsed - 2500) / 400);
    const promptPulse = 0.65 + 0.35 * Math.sin(elapsed * 0.003);
    ctx.globalAlpha = promptAlpha * promptPulse;
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▶  Press ENTER or click to continue', cx, canvas.height - 48);
    ctx.globalAlpha = 1;
  }
}

// Initialize audio on first interaction (browser policy)
function _tryInitAudio() {
  if (gameState === 'intro' && !audio.currentBgmFile) {
    audio.init();
    audio.playBGM('intro');
  }
}
window.addEventListener('click', _tryInitAudio);
window.addEventListener('keydown', _tryInitAudio);

// Best-effort notify the peer if the tab is closing so they get the
// "remote player left" banner instantly instead of waiting for WebRTC to
// eventually fail. Can't reliably use async here — sendReliable is a
// synchronous DataChannel.send under the hood, so the browser usually
// does flush it before tearing down the tab.
window.addEventListener('beforeunload', () => {
  try {
    if (net.role !== 'solo' && net.peers.size > 0) {
      net.sendReliable('evt', { type: 'PEER_QUIT', reason: 'unload' });
    }
  } catch {}
});

// ── Dev/test harness (exposes window._dev) ─────────────────────
// Safe to ship: only adds a programmatic surface — no behaviour changes.
// See tests/smoke.spec.js for the Playwright smoke suite that drives it.
initDevConsole({
  getGameState: () => gameState,
  setGameState: (v) => { gameState = v; window._gameState = v; },
  getPlayer: () => player,
  getEnemies: () => enemies,
  getCurrentCombatNode: () => currentCombatNode,
  setCurrentCombatNode: (v) => { currentCombatNode = v; },
  getSelectedCharId: () => selectedCharId,
  setSelectedCharId: (v) => { selectedCharId = v; },
  setSelectedDifficulty: (v) => { selectedDifficulty = v; },
  setLocalCoop: (v) => { localCoop = v; },
  startNewRun,
  spawnEnemies,
  handleCombatClear,
  tempo, deckManager, itemManager, runManager, input,
});

console.log('[Init] Game ready, starting engine.');
const engine = new Engine(update, render, () => gameState);
engine.start();
