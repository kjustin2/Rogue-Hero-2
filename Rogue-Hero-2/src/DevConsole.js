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
  };

  window._dev = api;
  console.log('[DevConsole] Ready — window._dev exposed. Try _dev.startRun("blade", 0, 1) or _dev.bossArena("boss_brawler").');
  return api;
}
