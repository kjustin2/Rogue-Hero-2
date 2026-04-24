// DevConsole — scriptable debug + test harness.
//
// Exposes `window._dev` with a programmatic API for:
//   - starting runs deterministically (seed + char + difficulty)
//   - spawning any boss / enemy
//   - mutating player HP / AP / tempo
//   - granting cards / relics
//   - jumping straight to the victory screen
//   - snapshotting live state for assertions
//
// Intended consumers: the Playwright smoke suite in tests/, and anyone
// poking around in the browser devtools. Init is a no-op if ctx is missing
// fields — fails soft so shipping with this module present is safe.

import { CardDefinitions } from './DeckManager.js';
import { ItemDefinitions } from './Items.js';
import { Characters } from './Characters.js';
import {
  Chaser, Sniper, Bruiser, Turret, Teleporter, Swarm, Healer, Mirror,
  TempoVampire, ShieldDrone, Phantom, Blocker, Bomber, Marksman,
  BossBrawler, BossConductor, BossEcho, BossNecromancer, BossApex,
  Juggernaut, Stalker, Splitter, Split, Corruptor, BerserkerEnemy,
  RicochetDrone, Disruptor, Timekeeper, Sentinel, BossArchivist,
} from './Enemy.js';
import {
  TetherWitch, MireToad, Bloomspawn, IronChoir, StaticHound,
  BossHollowKing, BossVaultEngine, BossAurora,
} from './EnemiesRH2.js';

const BOSS_CLASSES = {
  boss_brawler: BossBrawler,
  boss_conductor: BossConductor,
  boss_echo: BossEcho,
  boss_necromancer: BossNecromancer,
  boss_apex: BossApex,
  boss_archivist: BossArchivist,
  boss_hollow_king: BossHollowKing,
  boss_vault_engine: BossVaultEngine,
  boss_aurora: BossAurora,
};

const ENEMY_CLASSES = {
  chaser: Chaser, sniper: Sniper, bruiser: Bruiser, turret: Turret,
  teleporter: Teleporter, swarm: Swarm, healer: Healer, mirror: Mirror,
  tempo_vampire: TempoVampire, shielddrone: ShieldDrone, phantom: Phantom,
  blocker: Blocker, bomber: Bomber, marksman: Marksman,
  juggernaut: Juggernaut, stalker: Stalker, splitter: Splitter, split: Split,
  corruptor: Corruptor, berserker: BerserkerEnemy, ricochet_drone: RicochetDrone,
  disruptor: Disruptor, timekeeper: Timekeeper, sentinel: Sentinel,
  tether_witch: TetherWitch, mire_toad: MireToad, bloomspawn: Bloomspawn,
  iron_choir: IronChoir, static_hound: StaticHound,
  ...BOSS_CLASSES,
};

// ── Helpers for state-hash / net-record ────────────────────────────────────

// Canonicalize an object: sort keys recursively so JSON.stringify output is
// invariant to insertion order. Arrays stay ordered; the caller chooses
// which arrays to pre-sort in stateSnapshot().
function _canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_canonical).join(',') + ']';
  const keys = Object.keys(v).sort();
  const parts = [];
  for (const k of keys) parts.push(JSON.stringify(k) + ':' + _canonical(v[k]));
  return '{' + parts.join(',') + '}';
}

// FNV-1a 32-bit over a string; returns 8-char hex. Enough range for
// "do two states match" assertions in test context (collisions are not a
// concern — a test fails the instant the hash differs, not on a collision).
function _fnv1aHex(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Recursively find the first differing leaf between two canonical objects.
// Returns { path, a, b } or null if equal. Used by stateDiff() to pinpoint
// WHICH field diverged between peers.
function _diffCanonical(a, b, path = '') {
  if (_canonical(a) === _canonical(b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { path: path || '<root>', a, b };
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = Array.isArray(a) ? a.length : -1;
    const lb = Array.isArray(b) ? b.length : -1;
    if (la !== lb) return { path: path + '.length', a: la, b: lb };
    for (let i = 0; i < la; i++) {
      const r = _diffCanonical(a[i], b[i], path + '[' + i + ']');
      if (r) return r;
    }
    return null;
  }
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...ks].sort()) {
    const r = _diffCanonical(a[k], b[k], path ? path + '.' + k : k);
    if (r) return r;
  }
  return null;
}

// Defensive shallow copy for netRecord payloads. For binary snap payloads
// we copy just the byte length + first 16 bytes (debug-sized trace) to
// avoid ballooning the log with full position buffers. Pass `isSnap=true`
// for the snap channel to take the short form.
function _safeCopy(v, isSnap) {
  if (v == null) return v;
  if (v instanceof ArrayBuffer) {
    const u8 = new Uint8Array(v);
    return { __bin: true, byteLength: v.byteLength, head: Array.from(u8.subarray(0, Math.min(16, u8.length))) };
  }
  if (ArrayBuffer.isView(v)) {
    return { __bin: true, byteLength: v.byteLength, head: Array.from(v.subarray(0, Math.min(16, v.length))) };
  }
  if (typeof v !== 'object') return v;
  if (isSnap) {
    // Snapshot envelope — record just the frame + entity count for traceability
    return { t: v.t, n: v.n, count: Array.isArray(v.e) ? v.e.length : undefined };
  }
  try { return JSON.parse(JSON.stringify(v)); } catch { return { __unserializable: true }; }
}

export function initDevConsole(ctx) {
  let godmode = false;
  let errorLog = [];

  window.addEventListener('error', (e) => {
    errorLog.push({
      kind: 'error',
      msg: e.message || String(e),
      stack: e.error && e.error.stack ? e.error.stack : null,
      t: Date.now(),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    errorLog.push({
      kind: 'rejection',
      msg: (e.reason && e.reason.message) || String(e.reason),
      stack: e.reason && e.reason.stack ? e.reason.stack : null,
      t: Date.now(),
    });
  });

  // Godmode: re-pin player HP per rAF. Runs outside the game loop so it
  // stays accurate even across room transitions where `player` is reassigned.
  const tick = () => {
    try {
      if (godmode) {
        const p = ctx.getPlayer && ctx.getPlayer();
        if (p && p.maxHp) { p.hp = p.maxHp; p.alive = true; }
      }
    } catch (_) { /* never let dev tick break the page */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function getCenter() {
    return {
      x: (window.CANVAS_W || 960) / 2,
      y: (window.CANVAS_H || 720) / 2,
    };
  }

  const api = {
    ready: true,
    version: 1,

    // ========== Inspection ==========
    get gameState() { return ctx.getGameState(); },
    get floor() { return ctx.runManager && ctx.runManager.floor; },
    get seed() { return ctx.runManager && ctx.runManager.seed; },
    get player() { return ctx.getPlayer(); },
    get enemies() { return ctx.getEnemies(); },
    get tempoValue() { return ctx.tempo && ctx.tempo.value; },
    get tempoTarget() { return ctx.tempo && ctx.tempo.targetValue; },
    get selectedCharId() { return ctx.getSelectedCharId(); },
    get errors() { return errorLog.slice(); },
    clearErrors() { errorLog = []; },

    // ========== Registries ==========
    listBosses() { return Object.keys(BOSS_CLASSES); },
    listEnemies() { return Object.keys(ENEMY_CLASSES); },
    listChars() { return Object.keys(Characters); },
    listCards() { return Object.keys(CardDefinitions); },
    listItems() { return Object.keys(ItemDefinitions); },
    cardTypes() {
      const set = new Set();
      for (const id of Object.keys(CardDefinitions)) {
        const t = CardDefinitions[id].type;
        if (t) set.add(t);
      }
      return [...set];
    },
    firstCardOfType(type) {
      for (const id of Object.keys(CardDefinitions)) {
        if (CardDefinitions[id].type === type) return id;
      }
      return null;
    },

    // ========== Run control ==========
    // Deterministic start. Skips intro / charSelect / any menu transitions.
    startRun(charId, difficulty, seed) {
      charId = charId || 'blade';
      difficulty = difficulty == null ? 0 : difficulty;
      seed = seed == null ? 12345 : seed;
      if (!Characters[charId]) {
        throw new Error('Unknown charId: ' + charId + '. Valid: ' + Object.keys(Characters).join(', '));
      }
      ctx.setSelectedCharId(charId);
      ctx.setSelectedDifficulty(difficulty);
      ctx.setLocalCoop(false);
      ctx.startNewRun(seed);
      return this.snapshot();
    },

    // Same as startRun but keeps local 2P co-op enabled. Used by tests that
    // need to exercise the Players manager, shared-hand, revive flow, etc.
    startCoopRun(charId, difficulty, seed) {
      charId = charId || 'blade';
      difficulty = difficulty == null ? 0 : difficulty;
      seed = seed == null ? 12345 : seed;
      if (!Characters[charId]) throw new Error('Unknown charId: ' + charId);
      ctx.setSelectedCharId(charId);
      ctx.setSelectedDifficulty(difficulty);
      ctx.setLocalCoop(true);
      ctx.startNewRun(seed);
      return this.snapshot();
    },

    // Programmatically down a specific player by index (0 = P1, 1 = P2).
    // Mirrors the damage-to-zero path without needing an enemy. Used by
    // tests that exercise the revive flow.
    downPlayer(index) {
      const list = (typeof window !== 'undefined' && window._players) ? window._players.list : [];
      const p = list[index];
      if (!p) throw new Error('No player at index ' + index);
      if (p.downed) return p;
      window._players.goDown(p);
      return p;
    },
    // Return the players list's public shape for assertions.
    playersSnapshot() {
      const list = (typeof window !== 'undefined' && window._players) ? window._players.list : [];
      return list.map((p, i) => ({
        index: i,
        id: p.id,
        charId: p.charId,
        x: Math.round(p.x), y: Math.round(p.y),
        hp: p.hp, maxHp: p.maxHp,
        alive: p.alive !== false,
        downed: !!p.downed,
        haloColor: p.haloColor,
        inputScheme: p._inputScheme || null,
        coopMode: !!p._coopMode,
      }));
    },

    setGameState(v) { ctx.setGameState(v); },
    setFloor(f) { if (ctx.runManager) ctx.runManager.floor = f; },

    // ========== Combat ==========
    // Force the player into a 'playing' state against a single specified
    // boss. Requires a run to already be started (call startRun first).
    // Uses the game's spawnEnemies to set up the room variant, then
    // replaces the enemy roster with just the requested boss so tests
    // aren't at the mercy of the f=1 / f=2 / f=3 boss-roll tables.
    bossArena(bossId, floor) {
      if (!ctx.getPlayer()) throw new Error('No run — call startRun first');
      const Cls = BOSS_CLASSES[bossId];
      if (!Cls) throw new Error('Unknown boss: ' + bossId + '. Valid: ' + this.listBosses().join(', '));
      const f = floor == null ? 1 : floor;
      ctx.runManager.floor = f;
      const node = { type: 'boss', id: 'dev_boss_' + bossId };
      ctx.setCurrentCombatNode(node);
      ctx.spawnEnemies(node);
      const enemies = ctx.getEnemies();
      enemies.length = 0;
      const c = getCenter();
      const boss = new Cls(c.x, c.y - 50);
      boss.id = 'dev_e1';
      enemies.push(boss);
      ctx.setGameState('playing');
      return boss;
    },

    spawnBoss(bossId) {
      const Cls = BOSS_CLASSES[bossId];
      if (!Cls) throw new Error('Unknown boss: ' + bossId);
      const c = getCenter();
      const boss = new Cls(c.x, c.y - 50);
      boss.id = 'dev_e' + (ctx.getEnemies().length + 1);
      ctx.getEnemies().push(boss);
      return boss;
    },

    spawnEnemy(typeId, x, y) {
      const Cls = ENEMY_CLASSES[typeId];
      if (!Cls) throw new Error('Unknown enemy type: ' + typeId);
      const c = getCenter();
      const e = new Cls(x == null ? c.x : x, y == null ? c.y : y);
      e.id = 'dev_e' + (ctx.getEnemies().length + 1);
      ctx.getEnemies().push(e);
      return e;
    },

    killAll() {
      const es = ctx.getEnemies();
      for (const e of es) { e.hp = 0; e.alive = false; }
    },

    clearEnemies() { ctx.getEnemies().length = 0; },

    // ========== World-array introspection ==========
    // Returns counts of the transient per-room objects that main.js holds
    // in its module scope. Used by room-transition hygiene tests.
    worldCounts() {
      const w = (typeof window !== 'undefined') ? window._world : null;
      if (!w) return null;
      return {
        traps: w.traps.length,
        orbs: w.orbs.length,
        echoes: w.echoes.length,
        sigils: w.sigils.length,
        groundWaves: w.groundWaves.length,
        beamFlashes: w.beamFlashes.length,
        killEffects: w.killEffects.length,
      };
    },
    // Count of live projectiles (bullets from both enemies and player cards).
    projectileCount() {
      const pm = (typeof window !== 'undefined') ? window._projectiles : null;
      if (!pm || !Array.isArray(pm.projectiles)) return -1;
      return pm.projectiles.length;
    },

    // Return a { eventName: listenerCount } snapshot of the global EventBus.
    // Used by leak-detection tests — if spawning + disposing enemies grows
    // listener counts on events they subscribe to, something's leaking.
    eventListenerCounts() {
      const bus = (typeof window !== 'undefined') ? window._eventBus : null;
      if (!bus || !bus.listeners) return {};
      const out = {};
      for (const [name, arr] of Object.entries(bus.listeners)) {
        out[name] = Array.isArray(arr) ? arr.length : 0;
      }
      return out;
    },

    // ========== Player mutation ==========
    setHp(v) { const p = ctx.getPlayer(); if (p) p.hp = v; },
    setMaxHp(v) {
      const p = ctx.getPlayer();
      if (p) { p.maxHp = v; if (p.hp > v) p.hp = v; }
    },
    setAp(v) { const p = ctx.getPlayer(); if (p) p.ap = v; },
    setTempo(v) {
      if (!ctx.tempo) return;
      ctx.tempo.value = v;
      ctx.tempo.targetValue = v;
    },
    godmode(on) {
      godmode = !!on;
      if (godmode) {
        const p = ctx.getPlayer();
        if (p) { p.hp = p.maxHp; p.alive = true; }
      }
      return godmode;
    },
    isGodmode() { return godmode; },

    // ========== Grants ==========
    grantRelic(id) {
      if (!ItemDefinitions[id]) throw new Error('Unknown item: ' + id);
      const p = ctx.getPlayer();
      if (!p) throw new Error('No player — start a run first');
      ctx.itemManager.add(id, p, ctx.tempo);
      return true;
    },
    grantCard(id) {
      if (!CardDefinitions[id]) throw new Error('Unknown card: ' + id);
      return ctx.deckManager.addCard(id);
    },
    // Programmatically execute a card at a cursor position. Auto-grants the
    // card if not already in the collection, tops up AP, points cursor at the
    // center of the room (or at the provided coords), and calls
    // combat.executeCard(). Returns true if execution reported success.
    playCard(id, opts = {}) {
      if (!CardDefinitions[id]) throw new Error('Unknown card: ' + id);
      const p = ctx.getPlayer();
      if (!p) throw new Error('No player — start a run first');
      if (!ctx.combat) throw new Error('Combat not wired into ctx');
      // Ensure the card is in the collection so downstream code that looks
      // it up by id (channel state, counter windows) finds it.
      if (ctx.deckManager && !(ctx.deckManager.collection || []).includes(id)) {
        try { ctx.deckManager.addCard(id); } catch {}
      }
      // Give the player enough AP.
      const def = CardDefinitions[id];
      const needed = def.cost || 0;
      if ((p.budget || 0) < needed) p.budget = needed;
      const mouseX = opts.x == null ? (window.CANVAS_W || 960) / 2 : opts.x;
      const mouseY = opts.y == null ? (window.CANVAS_H || 720) / 2 : opts.y;
      return ctx.combat.executeCard(p, def, { x: mouseX, y: mouseY });
    },
    grantAllRelics() {
      const p = ctx.getPlayer();
      if (!p) throw new Error('No player — start a run first');
      const failed = [];
      for (const id of Object.keys(ItemDefinitions)) {
        try { ctx.itemManager.add(id, p, ctx.tempo); }
        catch (e) { failed.push({ id, err: e.message }); }
      }
      return failed;
    },

    // ========== Victory / room clear ==========
    forceVictory() {
      if (!ctx.getPlayer()) throw new Error('No run — call startRun first');
      ctx.runManager.floor = 5; // FLOORS_TO_WIN
      ctx.setCurrentCombatNode({ type: 'boss', id: 'dev_victory' });
      const es = ctx.getEnemies();
      for (const e of es) { e.hp = 0; e.alive = false; }
      ctx.handleCombatClear();
    },

    // Direct bypass of the "all enemies dead" detector. Unlike killAll(),
    // this jumps straight to the post-combat transition without waiting
    // for the update loop to notice. Useful for smoke tests that want to
    // verify the post-clear flow (floor advance / draft) in isolation.
    clearRoom() {
      if (!ctx.getPlayer()) throw new Error('No run — call startRun first');
      const es = ctx.getEnemies();
      for (const e of es) { e.hp = 0; e.alive = false; }
      ctx.handleCombatClear();
    },

    // ========== Snapshot for assertions ==========
    snapshot() {
      const p = ctx.getPlayer();
      const enemies = ctx.getEnemies() || [];
      return {
        gameState: ctx.getGameState(),
        floor: ctx.runManager ? ctx.runManager.floor : null,
        seed: ctx.runManager ? ctx.runManager.seed : null,
        selectedCharId: ctx.getSelectedCharId(),
        player: p ? {
          hp: p.hp, maxHp: p.maxHp, ap: p.ap,
          x: p.x, y: p.y,
          alive: p.alive !== false,
          charId: p.charId,
        } : null,
        tempo: ctx.tempo ? { value: ctx.tempo.value, target: ctx.tempo.targetValue } : null,
        enemyCount: enemies.length,
        aliveEnemies: enemies.filter((e) => e.alive !== false && e.hp > 0).length,
        enemyTypes: enemies.map((e) => e.type || e.constructor.name),
        deckCount: (ctx.deckManager && ctx.deckManager.collection) ? ctx.deckManager.collection.length : 0,
        relicCount: (ctx.itemManager && ctx.itemManager.equipped) ? ctx.itemManager.equipped.length : 0,
        errorCount: errorLog.length,
      };
    },

    // ========== Deterministic state hash ==========
    // stateSnapshot() returns the full canonical dict used to compute the hash.
    // stateHash() returns the FNV-1a digest as a hex string. Two peers running
    // the same seed through the same inputs MUST produce identical hashes at
    // every observable transition — any delta is a desync bug repro candidate.
    //
    // Quantization: positions rounded to 1 px, HP to int, tempo to int. This
    // is coarse on purpose — per-frame float drift from floating-point ops
    // and 20 Hz snap quantization shouldn't flag as desync. The test harness
    // should compare AT transitions, not mid-frame.
    stateSnapshot(opts = {}) {
      const roundPos = opts.roundPos == null ? 1 : opts.roundPos;
      const posQ = (v) => Math.round((v || 0) / roundPos) * roundPos;
      const gs = ctx.getGameState();
      const rm = ctx.runManager;
      const t  = ctx.tempo;
      const dm = ctx.deckManager;
      const im = ctx.itemManager;
      // Multi-player aware: window._players (Players manager) when present,
      // else fall back to the solo player.
      const playersList = (typeof window !== 'undefined' && window._players && window._players.list && window._players.list.length)
        ? window._players.list
        : [ctx.getPlayer()].filter(Boolean);
      const players = playersList
        .map((p) => ({
          id: p.id || ('p' + (p.playerIndex ?? 0)),
          charId: p.charId || null,
          x: posQ(p.x), y: posQ(p.y),
          hp: Math.round(p.hp || 0),
          maxHp: Math.round(p.maxHp || 0),
          ap: p.ap | 0,
          alive: p.alive !== false ? 1 : 0,
          downed: p.downed ? 1 : 0,
          isRemote: p._isRemote ? 1 : 0,
        }))
        .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      const enemies = (ctx.getEnemies() || [])
        .filter((e) => e && e.id != null)
        .map((e) => ({
          id: e.id,
          type: e.type || (e.constructor && e.constructor.name) || '?',
          x: posQ(e.x), y: posQ(e.y),
          hp: Math.round(Math.max(0, e.hp || 0)),
          alive: e.alive !== false ? 1 : 0,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return {
        gs,
        floor: rm ? rm.floor | 0 : -1,
        seed: rm ? (rm.seed | 0) : 0,
        rng: rm && typeof rm.getRngState === 'function' ? (rm.getRngState() | 0) : 0,
        tempo: t ? { v: Math.round(t.value || 0), tgt: Math.round(t.targetValue || 0), z: t.currentZone || null } : null,
        players,
        enemies,
        // hand is order-preserving (top slot matters for UI + gameplay keys)
        hand: dm && dm.hand ? dm.hand.slice() : [],
        // collection is the owned-card set; sort for canonical form
        collection: dm && dm.collection ? dm.collection.slice().sort() : [],
        relics: (im && im.equipped) ? im.equipped.map((r) => r.id || r).sort() : [],
        // Whether MP is wired, for cross-peer sanity check
        netRole: (typeof window !== 'undefined' && window._net) ? window._net.role : 'solo',
      };
    },
    stateHash(opts) { return _fnv1aHex(_canonical(this.stateSnapshot(opts))); },
    // Return the first field that differs between two snapshots. Handy when a
    // 4-peer hash comparison fails — pipe snapshots in and it'll tell you
    // WHICH field diverged instead of leaving you to eyeball two blobs.
    stateDiff(otherSnapshot) {
      const a = this.stateSnapshot();
      return _diffCanonical(a, otherSnapshot);
    },

    // ========== RNG consumption trace ==========
    // Records every mulberry32 consumption. Attribution via stack parse.
    // Zero overhead when `_rngTraceOn` is false (RunManager._createRng
    // checks the flag on every call and skips the trace push).
    rngTraceStart() {
      const rm = ctx.runManager;
      if (!rm) return false;
      rm._rngTrace = [];
      rm._rngTraceOn = true;
      return true;
    },
    rngTraceStop() {
      const rm = ctx.runManager;
      if (!rm) return;
      rm._rngTraceOn = false;
    },
    rngTraceClear() {
      const rm = ctx.runManager;
      if (!rm) return;
      rm._rngTrace = [];
    },
    rngTrace() {
      const rm = ctx.runManager;
      return (rm && rm._rngTrace) ? rm._rngTrace.slice() : [];
    },
    // Returns the index of the first consumption that diverges between two
    // traces, or -1 if they agree up to min length. Each trace entry is
    // { v, s, c } (value, post-state, caller).
    rngTraceDiff(a, b) {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (a[i].s !== b[i].s) return { index: i, a: a[i], b: b[i] };
      }
      if (a.length !== b.length) {
        return { index: n, a: a[n] || null, b: b[n] || null, note: 'length-mismatch' };
      }
      return null;
    },

    // ========== MP bypass helpers (for live-network Playwright tests) ==========
    // Drive the real Net + Lobby end-to-end, bypassing the lobby UI. Uses
    // window._net + window._lobby which main.js exposes at boot.
    //
    // mpHost(opts?): assigns role 'host', creates a lobby + room code, calls
    // net.connect(code). Returns the room code. Resolves when the transport
    // reports `connected`.
    //
    // mpJoin(code): assigns role 'client', calls lobby.join(code). Resolves
    // when the transport reports `connected`.
    //
    // Both are idempotent — safe to await multiple times.
    get peerCount() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      return net && net.peers ? net.peers.size : 0;
    },
    // Count of peers whose evt DataChannel is in 'open' state. peers.size
    // goes up when the PC transitions to 'connected', but the evt channel
    // can take a few hundred ms more to open — callers that need to send
    // reliable messages should wait on this, not on peerCount.
    get openEvtPeers() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net || !net.peers) return 0;
      let n = 0;
      for (const peer of net.peers.values()) {
        if (peer.evtDc && peer.evtDc.readyState === 'open') n++;
      }
      return n;
    },
    get netRole() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      return net ? net.role : 'solo';
    },
    get netStrategy() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      return net ? net._strategy : null;
    },
    get roomCode() {
      const lobby = (typeof window !== 'undefined') ? window._lobby : null;
      return lobby ? lobby.roomCode : null;
    },
    async mpPreflight() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net) return false;
      if (typeof net.preflight !== 'function') return true;
      try { return !!(await net.preflight()); } catch { return false; }
    },
    async mpHost(opts = {}) {
      const net   = (typeof window !== 'undefined') ? window._net : null;
      const lobby = (typeof window !== 'undefined') ? window._lobby : null;
      if (!net || !lobby) throw new Error('Net/Lobby not available — check window._net / window._lobby');
      const seed = opts.seed == null ? Math.floor(Math.random() * 1e9) : opts.seed;
      const difficulty = opts.difficulty == null ? 0 : opts.difficulty;
      const code = lobby.createHosted({ seed, difficulty });
      net.role = 'host';
      await net.connect(code);
      return code;
    },
    async mpJoin(code) {
      const net   = (typeof window !== 'undefined') ? window._net : null;
      const lobby = (typeof window !== 'undefined') ? window._lobby : null;
      if (!net || !lobby) throw new Error('Net/Lobby not available');
      if (!code || code.length !== 6) throw new Error('Invalid room code: ' + code);
      net.role = 'client';
      await lobby.join(code);
      return net.connected;
    },
    async mpDisconnect() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net) return;
      if (typeof net.gracefulDisconnect === 'function') await net.gracefulDisconnect(200);
      else net.disconnect();
      net.role = 'solo';
    },
    mpSendReliable(payload) {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net) return false;
      net.sendReliable('evt', payload);
      return true;
    },

    // ========== Net record/replay ==========
    // Wraps net.sendReliable / net.sendUnreliable and the 'evt'/'snap'/'peer'
    // dispatch paths to record every message in/out with a monotonic index.
    // Replay rewires dispatches only (never outbound sends) so a captured
    // trace can be replayed into a solo instance for post-mortem debugging.
    netRecordStart(opts = {}) {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net) return false;
      if (net._devRecording) return true;
      const cap = opts.cap || 4096;
      const log = [];
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const push = (rec) => {
        rec.i = log.length;
        rec.t = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) * 1000) / 1000;
        if (log.length >= cap) log.shift();
        log.push(rec);
      };
      const origSR = net.sendReliable.bind(net);
      const origSU = net.sendUnreliable.bind(net);
      net.sendReliable = (ch, payload) => {
        push({ dir: 'out', ch, rel: 1, payload: _safeCopy(payload) });
        return origSR(ch, payload);
      };
      net.sendUnreliable = (ch, payload) => {
        push({ dir: 'out', ch, rel: 0, payload: _safeCopy(payload, true) });
        return origSU(ch, payload);
      };
      const origDispatch = net._dispatch.bind(net);
      net._dispatch = (ch, msg, peerId) => {
        push({ dir: 'in', ch, peerId, payload: _safeCopy(msg, ch === 'snap') });
        return origDispatch(ch, msg, peerId);
      };
      net._devRecording = {
        log, cap, origSR, origSU, origDispatch, t0,
      };
      return true;
    },
    netRecordStop() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net || !net._devRecording) return null;
      const r = net._devRecording;
      net.sendReliable  = r.origSR;
      net.sendUnreliable = r.origSU;
      net._dispatch     = r.origDispatch;
      delete net._devRecording;
      return r.log.slice();
    },
    netRecord() {
      const net = (typeof window !== 'undefined') ? window._net : null;
      return net && net._devRecording ? net._devRecording.log.slice() : [];
    },
    // Re-dispatch 'in' records into this peer's handlers, preserving relative
    // timing (scaled by opts.speed). Out-records are ignored. Useful to
    // replay a captured desync into a fresh instance.
    netPlayback(trace, opts = {}) {
      const net = (typeof window !== 'undefined') ? window._net : null;
      if (!net || !Array.isArray(trace)) return Promise.resolve(false);
      const speed = opts.speed || 1;
      const inRecs = trace.filter((r) => r && r.dir === 'in');
      if (inRecs.length === 0) return Promise.resolve(true);
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const baseT = inRecs[0].t;
      return new Promise((resolve) => {
        let idx = 0;
        const pump = () => {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const elapsed = (now - t0) * speed;
          while (idx < inRecs.length && (inRecs[idx].t - baseT) <= elapsed) {
            const r = inRecs[idx++];
            try { net._dispatch(r.ch, r.payload, r.peerId || 'replay'); } catch {}
          }
          if (idx < inRecs.length) requestAnimationFrame(pump);
          else resolve(true);
        };
        requestAnimationFrame(pump);
      });
    },
  };

  window._dev = api;
  console.log('[DevConsole] Ready — window._dev exposed. Try _dev.startRun("blade", 0, 1) or _dev.bossArena("boss_brawler").');
  return api;
}
