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

// Hide native cursor globally — DOM cursor overlay replaces it
(function _initDomCursor() {
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { cursor: none !important; }';
  document.head.appendChild(style);

  const _cursorDiv = document.createElement('div');
  _cursorDiv.id = 'game-cursor';
  Object.assign(_cursorDiv.style, {
    position: 'fixed', left: '0', top: '0',
    pointerEvents: 'none', zIndex: '9999',
    width: '28px', height: '28px',
    willChange: 'transform',
  });
  // Build crosshair from thin rectangles forming a "+" with gap
  const _makeBar = (w, h, tx, ty) => {
    const b = document.createElement('div');
    Object.assign(b.style, {
      position: 'absolute', left: '50%', top: '50%',
      width: w + 'px', height: h + 'px',
      background: '#ffffff', opacity: '0.88', borderRadius: '1px',
      transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px)`,
    });
    return b;
  };
  _cursorDiv.appendChild(_makeBar(9, 1.5, -8.5, 0));
  _cursorDiv.appendChild(_makeBar(9, 1.5, 8.5, 0));
  _cursorDiv.appendChild(_makeBar(1.5, 9, 0, -8.5));
  _cursorDiv.appendChild(_makeBar(1.5, 9, 0, 8.5));
  const _dot = document.createElement('div');
  Object.assign(_dot.style, {
    position: 'absolute', left: '50%', top: '50%',
    width: '3px', height: '3px', borderRadius: '50%',
    background: '#ffffff', opacity: '0.88',
    transform: 'translate(-50%, -50%)',
  });
  _cursorDiv.appendChild(_dot);
  document.body.appendChild(_cursorDiv);

  window.addEventListener('mousemove', e => {
    _cursorDiv.style.transform = `translate(${e.clientX - 14}px, ${e.clientY - 14}px)`;
  });

  // Expose color setter on the module scope
  window._gameCursorDiv = _cursorDiv;
})();

function setCursorColor(hex) {
  const el = window._gameCursorDiv;
  if (!el) return;
  for (let i = 0; i < el.children.length; i++) el.children[i].style.background = hex;
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
player.id = 'p1';            // RH2: stable id for net snapshots / Reconcile
player.playerIndex = 0;
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
const lobby = new Lobby(net);
const hostSim = new HostSim(net);
const snapDecoder = new SnapshotDecoder();
const reconcile = new Reconcile();
// Apply incoming position snapshots to the player & remote-entity placeholders.
// Solo: never fires (Net.connect is no-op).
net.on('snap', (snap) => {
  // Hosts are authoritative — they should never reconcile against
  // an incoming snapshot of themselves.
  if (net.role === 'host') return;
  if (!snap || !snap.e) return;
  snapDecoder.apply(snap);
  // Reconcile own player against the host's authoritative position
  if (player && player.id) {
    const own = snapDecoder.positions.get(player.id);
    if (own) reconcile.applyOwn(player, own.x, own.y, snap.n || 0);
  }
  // Smoothly interpolate any remote allies present in the snapshot
  if (players.count > 1) {
    for (let i = 1; i < players.list.length; i++) {
      const p = players.list[i];
      if (!p || !p.id) continue;
      const remote = snapDecoder.positions.get(p.id);
      if (remote) reconcile.interpolateRemote(p, remote);
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
  x: 0, y: 0, vx: 0, vy: 0, r: 0, a: 0, life: 0
}));
let _ambientInit = false;

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
  // Trigger crash runes
  for (const s of sigils) {
    if (s.def && s.def.sigilTrigger === 'crash' && !s.triggered) {
      s.triggered = true;
      _fireSigil(s);
    }
  }
});

events.on('SPAWN_TRAP', (data) => { traps.push({ ...data, triggered: false }); });
events.on('SPAWN_ORBS', ({ count, radius, damage, life, speed, color, freeze, spiral }) => {
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
    });
  }
});
events.on('SPAWN_ECHO', (data) => { echoes.push({ ...data, timer: data.delay }); });
events.on('SPAWN_SIGIL', (data) => {
  // Max 2 sigils; remove oldest if needed
  if (sigils.length >= 2) sigils.shift();
  sigils.push({ ...data, triggered: false });
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
  const offsets = [[30, 0], [-30, 0]];
  for (const [ox, oy] of offsets) {
    const s = new Split(x + ox, y + oy);
    s.difficultySpdMult = difficultySpdMult;
    enemies.push(s);
  }
  combat.setLists(enemies, player);
  projectiles.setEnemies(enemies);
  ui.setEnemies(enemies);
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
  particles.spawnRing && particles.spawnRing(player.x, player.y, radius, '#66ccff');
  particles.spawnDamageNumber(player.x, player.y - 40, 'COLD CRASH!');
  renderer.triggerCA();
  ui.triggerTempoCrash();
});

events.on('COMBO_DISPLAY', ({ count, x, y }) => {
  particles.spawnComboDisplay(count, x, y);
  if (count > (runStats.highestCombo || 0)) runStats.highestCombo = count;
});

// ── Helpers ─────────────────────────────────────────────────────
function startNewRun() {
  const charDef = Characters[selectedCharId];
  player = new Player(400, 360);
  player.hp = charDef.hp;
  player.maxHp = charDef.maxHp;
  player.apRegen = charDef.apRegen;
  player.BASE_SPEED = charDef.baseSpeed;
  player.setClassPassives(charDef.passives);
  player.charId = selectedCharId;
  player.haloColor = PLAYER_HALO_COLORS[0];
  player._coopMode = !!localCoop;
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
  }
  window._players = players;

  // Seed must be set before any RNG calls
  runManager.floor = 1;
  runManager.setSeed(Date.now());

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
  const diff = DIFFICULTY_MODS[selectedDifficulty] || DIFFICULTY_MODS[0];
  const rng = runManager.getRng();
  function rndX() { return room.FLOOR_X1 + 100 + rng() * (room.FLOOR_X2 - room.FLOOR_X1 - 200); }
  function rndY() { return room.FLOOR_Y1 + 80 + rng() * (room.FLOOR_Y2 - room.FLOOR_Y1 - 160); }
  const cx = (room.FLOOR_X1 + room.FLOOR_X2) / 2;
  const cy = (room.FLOOR_Y1 + room.FLOOR_Y2) / 2;

  // Generate room variant
  room.generateVariant(f, rng);

  if (node.type === 'boss') {
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
  for (const e of enemies) {
    e.hp = Math.round(e.hp * (1 + (f - 1) * 0.18) * diff.hpMult * actHpRamp);
    e.maxHp = e.hp;
    e.difficultySpdMult = (diff.spdMult || 1.0) * actSpdRamp;
    if (f >= 4) e.telegraphDuration = Math.max(0.25, e.telegraphDuration * telegraphMult);
  }

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

  combat.setLists(enemies, player);
  ui.setEnemies(enemies);
  projectiles.setEnemies(enemies);
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
  return Object.keys(CardDefinitions).filter(id => {
    if (owned.includes(id)) return false;
    const def = CardDefinitions[id];
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
      itemChoices = itemManager.generateChoices(3, selectedCharId);
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
  // IDEA-08: clear fortify buff after room clear
  if (player) player._fortifyBuff = false;
  console.log(`[Combat] Cleared! Total: ${roomsCleared}`);
  audio.silenceMusic();
  audio.playBGM('map');

  // Gold reward for room clear
  if (currentCombatNode && currentCombatNode.type === 'boss') meta.addGold(25);
  else if (currentCombatNode && currentCombatNode.type === 'elite') meta.addGold(12);
  else meta.addGold(5);

  // IDEA-12: assign new curse for Brutal mode on floor advance
  if (selectedDifficulty >= 2) {
    currentFloorCurse = BRUTAL_CURSES[Math.floor(runManager.getRng()() * BRUTAL_CURSES.length)];
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
      input.clearFrame();
      currentCombatNode = null;
      return;
    }
    runManager.floor++;
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
  if (currentEventType === 'merchant') {
    switch (choiceIdx) {
      case 0: // Sell oldest card for +3 HP
        if (deckManager.collection.length > 1) {
          const sold = deckManager.collection[0];
          deckManager.removeCard(sold);
          healAllPlayers(3);
          particles.spawnDamageNumber(player.x || 640, 300, `Sold "${CardDefinitions[sold]?.name || sold}" +3 HP`);
          events.emit('PLAY_SOUND', 'upgrade');
        }
        break;
      case 1: // Trade 1 HP → relic
        if (player.hp > 1) {
          player.hp--;
          const choices = itemManager.generateChoices(1, selectedCharId);
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
        healAllPlayers(1);
        break;
      case 2: break; // pass
    }
  } else {
    // Standard event
    switch (choiceIdx) {
      case 0: // Trade 1 HP → random relic
        if (player.hp > 1) {
          player.hp--;
          const choices = itemManager.generateChoices(1, selectedCharId);
          if (choices.length > 0) {
            itemManager.add(choices[0], player, tempo);
            runStats.itemsCollected++;
            events.emit('PLAY_SOUND', 'itemPickup');
            particles.spawnDamageNumber(player.x || 640, 300, `Got: ${ItemDefinitions[choices[0]].name}`);
          }
        }
        break;
      case 1: // Heal 2 HP
        healAllPlayers(2);
        break;
      case 2: // Gamble (BUG-06: seeded RNG)
        if (runManager.getRng()() < 0.5) { healAllPlayers(2); }
        else { player.hp = Math.max(1, player.hp - 1); }
        break;
    }
  }
  gameState = 'map';
}

// RH2: out-of-combat healing (rest nodes, events) heals every alive co-op player.
function healAllPlayers(amt) {
  player.heal(amt);
  if (players.count > 1) {
    for (let i = 1; i < players.list.length; i++) {
      const p = players.list[i];
      if (p && p.alive) p.heal(amt);
    }
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

function update(logicDt, realDt) {
  runStats.elapsedTime += realDt;
  // Poll Xbox / standard gamepads each frame so they feed key & mouse state
  input.pollGamepads();

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
    if (playerDeathTimer <= 0) {
      gameState = 'stats';
      statsInputDelay = 0;
    }
    input.clearFrame();
    return;
  }

  // ── INTRO ──
  if (gameState === 'intro') {
    if (input.consumeKey('enter')) {
      audio.init();
      audio.playBGM('menu');
      gameState = 'charSelect';
    }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of introBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'continue' || b.action === 'mode_solo') { localCoop = false; audio.init(); audio.playBGM('menu'); gameState = 'charSelect'; }
          else if (b.action === 'mode_local') { localCoop = true; audio.init(); audio.playBGM('menu'); gameState = 'charSelect'; }
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
    if (input.consumeKey('escape')) {
      gameState = 'intro';
      selectedCharId = null;
      audio.playBGM('menu');
      input.clearFrame();
      return;
    }
    if (input.consumeClick()) {
      const result = handleCharSelectClick(input.mouse.x, input.mouse.y);
      if (result === 'start' && selectedCharId) startNewRun();
      if (result === 'mainMenu') { gameState = 'intro'; selectedCharId = null; audio.playBGM('menu'); }
    }
    if (input.consumeKey('d') && selectedCharId) {
      const maxD = meta.getMaxDifficulty(selectedCharId);
      selectedDifficulty = (selectedDifficulty + 1) % (maxD + 1);
    }
    // RH2: F2 toggles local 2-player co-op for the next run
    if (input.consumeKey('f2')) {
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
    if (input.consumeKey('escape')) {
      if (lobbyMode === 'menu') { gameState = 'charSelect'; input.clearFrame(); return; }
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
          if (b.action === 'back') { gameState = 'charSelect'; break; }
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
          if (b.action === 'lobby_back') { lobbyMode = 'menu'; lobbyJoinCode = ''; lobbyStatusMsg = ''; net.disconnect(); net.role = 'solo'; break; }
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
          else if (b.action === 'restart') { pauseQuitConfirm = false; pauseShowControls = false; gameState = 'charSelect'; selectedCharId = null; audio.silenceMusic(); audio.playBGM('menu'); }
          else if (b.action === 'quit') {
            if (pauseQuitConfirm) { pauseQuitConfirm = false; gameState = 'intro'; selectedCharId = null; audio.silenceMusic(); audio.playBGM('menu'); }
            else { pauseQuitConfirm = true; }
          }
          else if (b.action === 'quit_cancel') { pauseQuitConfirm = false; }
          else if (b.action === 'vol_down') { const v = Math.max(0, audio.getMasterVolume() - 0.1); audio.setMasterVolume(v); meta.setMasterVolume(v); }
          else if (b.action === 'vol_up')   { const v = Math.min(1, audio.getMasterVolume() + 0.1); audio.setMasterVolume(v); meta.setMasterVolume(v); }
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── REST ──
  if (gameState === 'rest') {
    if (input.consumeKey('escape')) { gameState = 'map'; input.clearFrame(); return; }
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      for (const b of restChoiceBoxes) {
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (b.action === 'heal') {
            healAllPlayers(3);
            console.log(`[Rest] Healed 3 HP: ${player.hp}/${player.maxHp}`);
            gameState = 'map';
          } else if (b.action === 'upgrade') {
            upgradeChoices = deckManager.getUpgradeChoices();
            if (upgradeChoices.length > 0) { gameState = 'upgrade'; input.clearFrame(); return; }
          } else if (b.action === 'fortify') { // IDEA-08
            player._fortifyBuff = true;
            particles.spawnDamageNumber(player.x, player.y - 30, '+10% DMG NEXT FIGHT!');
            console.log('[Rest] Fortify buff set');
            gameState = 'map';
          }
          break;
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── EVENT ──
  if (gameState === 'event') {
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
        }
      }
    }
    input.clearFrame();
    return;
  }

  // ── DISCARD ──
  if (gameState === 'discard') {
    if (input.consumeClick()) {
      const discardId = ui.handleDiscardClick(input.mouse.x, input.mouse.y);
      if (discardId && discardPendingCardId) {
        deckManager.removeCard(discardId);
        events.emit('PLAY_SOUND', 'itemPickup');
        if (discardPendingCardId === '__BURN__') {
          // Rest node burn: just remove, don't add a replacement
          console.log(`[Rest] Burned card "${discardId}"`);
          discardPendingCardId = null;
          gameState = 'map';
        } else {
          deckManager.addCard(discardPendingCardId);
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
    if (input.consumeKey('enter') || input.consumeKey(' ') || input.consumeKey('escape')) { gameState = 'map'; }
    if (input.consumeClick()) {
      const cardId = ui.handleUpgradeClick(input.mouse.x, input.mouse.y);
      if (cardId === '__skip') { gameState = 'map'; }
      else if (cardId) {
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
    let startCombat = input.consumeKey('enter');
    if (input.consumeClick()) {
      const mx = input.mouse.x, my = input.mouse.y;
      // Check fight button first
      if (ui.prepFightBox) {
        const fb = ui.prepFightBox;
        if (mx >= fb.x && mx <= fb.x + fb.w && my >= fb.y && my <= fb.y + fb.h) {
          startCombat = true;
        }
      }
      if (!startCombat) ui.handlePrepClick(mx, my);
    }
    if (startCombat) {
      console.log(`[Prep] Hand: [${deckManager.hand.join(', ')}]`);
      particles.spawnRoomEntryFlash();
      gameState = 'playing';
      _combatStartFlash = 0.5;
      _fadeAlpha = 0; // no dark overlay when entering combat
      _ambientInit = false; // reset ambient particles for new room
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
    // RH2: pick nearest alive player so enemies engage P2 too
    let _tgt = player;
    if (players.count > 1) {
      let bestD = Infinity;
      for (const pp of players.list) {
        if (!pp.alive) continue;
        const ddx = pp.x - e.x, ddy = pp.y - e.y;
        const dd = ddx * ddx + ddy * ddy;
        if (dd < bestD) { bestD = dd; _tgt = pp; }
      }
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

  // Room clear check — skip if player died this frame
  if (enemies.length === 0 && gameState === 'playing' && player.alive) {
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
  // RH2: host broadcasts position snapshots after sim step (no-op in solo)
  hostSim.tick(logicDt, players.list, enemies);
  if (_resonanceFlashTimer > 0) _resonanceFlashTimer = Math.max(0, _resonanceFlashTimer - realDt);
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
      if (b.action === 'difficulty' && selectedCharId) {
        const maxD = meta.getMaxDifficulty(selectedCharId);
        selectedDifficulty = (selectedDifficulty + 1) % (maxD + 1);
        return 'difficulty';
      }
      if (b.action === 'mainMenu') return 'mainMenu';
      if (b.action === 'toggleCoop') { localCoop = !localCoop; return 'toggleCoop'; }
      if (b.action === 'lobby') { lobbyMode = 'menu'; lobbyJoinCode = ''; lobbyStatusMsg = 'Checking network…'; gameState = 'lobby';
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
    body: ['Move with WASD or Arrow Keys.','Aim and attack with the mouse.','Press SPACE to dodge — perfect dodges crit.','Keys 1-4 select cards from your hand.','Build TEMPO with attacks; hot tempo hits harder.'] },
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
    const ox = player.x + Math.cos(o.angle) * o.radius;
    const oy = player.y + Math.sin(o.angle) * o.radius;
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
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(ox, oy);
    ctx.strokeStyle = (o.color || '#ff8844') + '33';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// ── RENDER ──────────────────────────────────────────────────────
function render() {
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
      const lbW = 200, lbH = 38, lbX = mbX + mbW + 10, lbY = mbY;
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

      // ── TUTORIAL button — to the right of REMOTE LOBBY ──
      const tbW = 160, tbH = 38, tbX = lbX + lbW + 10, tbY = lbY;
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
    {
      const ctx2 = renderer.ctx;
      const cbW = 224, cbH = 38, cbX = canvas.width - cbW - 16, cbY = 14;
      const on = localCoop;
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

      // P2 controls help panel — visible when 2P is on
      if (on) {
        // Horizontal strip across the bottom — two rows so P1 and P2 don't overlap
        const helpW = Math.min(640, canvas.width - 32);
        const helpH = 64;
        const hX = (canvas.width - helpW) / 2;
        // Lift above the "Bonus Cards Unlocked" line at canvas.height - 20
        const hY = canvas.height - helpH - 36;
        ctx2.fillStyle = 'rgba(18,26,14,0.94)';
        ctx2.beginPath();
        ctx2.roundRect(hX, hY, helpW, helpH, 8);
        ctx2.fill();
        ctx2.strokeStyle = 'rgba(136,221,102,0.6)';
        ctx2.lineWidth = 1.2;
        ctx2.stroke();
        ctx2.font = 'bold 11px monospace';
        ctx2.textAlign = 'left';
        ctx2.fillStyle = '#88ddff';
        ctx2.fillText('P1', hX + 14, hY + 22);
        ctx2.fillStyle = '#cce0c0';
        ctx2.font = '11px monospace';
        ctx2.fillText('Arrows move  |  Mouse aim/attack  |  /  Dodge  |  7 8 9 0  Cards', hX + 36, hY + 22);
        ctx2.fillStyle = '#ff9944';
        ctx2.font = 'bold 11px monospace';
        ctx2.fillText('P2', hX + 14, hY + 46);
        ctx2.fillStyle = '#cce0c0';
        ctx2.font = '11px monospace';
        ctx2.fillText('WASD move  |  Q Attack (auto-aim)  |  E  Dodge  |  1 2 3 4  Cards', hX + 36, hY + 46);
      }
    }
    const chars = CharacterList;
    const GAP = 10;
    // Responsive sizing: fit all chars on screen — larger cards
    const CARD_W = Math.min(360, Math.floor((canvas.width - 30 - (chars.length - 1) * GAP) / chars.length));
    const CARD_H = Math.min(560, Math.floor(canvas.height * 0.82));
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
      ctx2.fillStyle = '#225533';
      ctx2.beginPath();
      ctx2.roundRect(startBtnX, btnY, startBtnW, startBtnH, 8);
      ctx2.fill();
      ctx2.strokeStyle = '#44ff88';
      ctx2.lineWidth = 2;
      ctx2.stroke();
      ctx2.fillStyle = '#44ff88';
      ctx2.font = 'bold 18px monospace';
      ctx2.fillText('START RUN', startBtnX + startBtnW / 2, btnY + 29);
      charSelectBoxes.push({ x: startBtnX, y: btnY, w: startBtnW, h: startBtnH, action: 'start' });
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

      // Slot list
      const slotY = 290;
      ctx.fillStyle = '#aabbcc'; ctx.font = 'bold 13px monospace';
      ctx.fillText('CONNECTED PLAYERS', cx, slotY);
      const slots = lobby.slots.length ? lobby.slots : [{ name: 'P1 (you)', peerId: 'host', ready: false }];
      for (let i = 0; i < 4; i++) {
        const sX = cx - 200, sW = 400, sH = 28, sY = slotY + 14 + i * 34;
        const filled = i < slots.length;
        ctx.fillStyle = filled ? '#162028' : '#0a0e14';
        ctx.beginPath(); ctx.roundRect(sX, sY, sW, sH, 5); ctx.fill();
        ctx.strokeStyle = filled ? '#44ddcc' : '#33445566'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = filled ? '#cce0d8' : '#445566';
        ctx.font = '13px monospace'; ctx.textAlign = 'left';
        ctx.fillText(filled ? `▶  ${slots[i].name || 'Player'}` : '   (waiting…)', sX + 12, sY + 19);
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

      // Back
      const xbW = 160, xbH = 38, xbX = cx - xbW / 2, xbY = canvas.height - 70;
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
    return;
  }

  // ── MAP ──
  if (gameState === 'map') {
    runManager.drawMap(renderer.ctx, canvas.width, canvas.height, input.mouse.x, input.mouse.y);
    const ctx = renderer.ctx;
    const ch = Characters[selectedCharId];
    // Hero info bar — drawn inside the map header area
    ctx.fillStyle = ch ? ch.color : '#aaa';
    // Left: character name + HP
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
    // RH2: in 2P co-op, show P2's HP bar to the right of P1's
    if (players.count > 1) {
      const p2 = players.list[1];
      const p2X = 18 + hpW + 90;
      const p2Ch = Characters[p2._charId || selectedCharId];
      ctx.fillStyle = p2Ch ? p2Ch.color : '#ff9944';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`P2 ${p2Ch?.name || ''}`, p2X, 28);
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
    ctx.fillStyle = '#666';
    ctx.font = '11px monospace';
    const layersLeft = runManager.getLayersToEnd();
    const depthLabel = layersLeft <= 1 ? 'BOSS NEXT!' : `${layersLeft - 1} room(s) to boss`;
    ctx.fillText(`Act ${runManager.floor}  ·  ${DIFFICULTY_NAMES[selectedDifficulty]}  ·  ${depthLabel}`, 18, 62);

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

    restChoiceBoxes = [];
    const btnW = Math.min(400, canvas.width - 80);
    const btnH = 80, btnGap = 18; // IDEA-08: slightly smaller to fit 3 buttons
    const btnStartY = (canvas.height - (3 * btnH + 2 * btnGap)) / 2;
    const choices = [
      {
        action: 'heal', label: 'Heal 3 HP', color: '#44ff88', bg: '#0e2018',
        canDo: player.hp < player.maxHp,
        lines: [`Restore up to 3 HP`, `(${player.hp} → ${Math.min(player.hp + 3, player.maxHp)} / ${player.maxHp})`],
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
    ui.drawEventScreen(renderer.ctx, currentEventType);
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
  room.draw(renderer.ctx);

  // (torch-light removed — per-frame createRadialGradient was expensive and unwanted)

  // Ambient floating motes (slow background life)
  if (!_ambientInit) {
    _ambientInit = true;
    for (const p of _ambientParts) {
      p.x = room.FLOOR_X1 + Math.random() * (room.FLOOR_X2 - room.FLOOR_X1);
      p.y = room.FLOOR_Y1 + Math.random() * (room.FLOOR_Y2 - room.FLOOR_Y1);
      p.vx = (Math.random() - 0.5) * 18;
      p.vy = -6 - Math.random() * 18;
      p.r  = 1 + Math.random() * 1.5;
      p.a  = 0.08 + Math.random() * 0.18;
      p.life = Math.random();
    }
  }
  {
    const _dt2 = Math.min(0.05, 1 / 60);
    const _ctx = renderer.ctx;
    _ctx.save();
    for (const p of _ambientParts) {
      p.life += _dt2 * 0.15;
      if (p.life >= 1) {
        p.x = room.FLOOR_X1 + Math.random() * (room.FLOOR_X2 - room.FLOOR_X1);
        p.y = room.FLOOR_Y2 - 20;
        p.vx = (Math.random() - 0.5) * 16;
        p.vy = -8 - Math.random() * 16;
        p.r  = 1 + Math.random() * 1.5;
        p.a  = 0.08 + Math.random() * 0.16;
        p.life = 0;
      }
      p.x += p.vx * _dt2;
      p.y += p.vy * _dt2;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      _ctx.fillStyle = '#ffffff';
      _ctx.globalAlpha = p.a * Math.sin(p.life * Math.PI);
      _ctx.fill();
    }
    _ctx.globalAlpha = 1;
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
      const p2 = players.list[1];
      if (p2 && p2.alive) {
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
  player.draw(renderer.ctx, tempo);
  // RH2: P1 down ring (so P2 can see they need to revive)
  if (players.count > 1 && player.downed) {
    const ctx = renderer.ctx;
    ctx.beginPath();
    ctx.arc(player.x, player.y + player.r * 0.7, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (player.reviveProgress || 0));
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DOWN', player.x, player.y + player.r * 0.7 - 28);
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
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.r * 0.7, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.reviveProgress || 0));
        ctx.strokeStyle = '#44ff88';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DOWN', p.x, p.y + p.r * 0.7 - 28);
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
    ui.selectedCardSlotP2 = (players.count > 1) ? selectedCardSlotP2 : null;
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
      if (hasP2) panelH += 22 + 18 + 16; // P2 HP row + P2 AP row + P2 selected card row
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

      if (hasP2) {
        const p2 = players.list[1];
        drawHpRow('P2', p2, p2.haloColor || '#ff7744');
        // P2 AP pip row
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
        // Show P2's currently-selected card so they know what Q will fire
        const p2CardId = deckManager.hand[selectedCardSlotP2];
        const p2Def = p2CardId ? deckManager.getCardDef(p2CardId) : null;
        ctx.fillStyle = '#aaff88';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('P2 ▸ ' + (selectedCardSlotP2 + 1) + ' ' + (p2Def ? p2Def.name : '—'), 14, yCursor + 10);
        yCursor += 16;
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
  } else if (gameState === 'discard') {
    ui.width = canvas.width; ui.height = canvas.height;
    ui.setMouse(input.mouse.x, input.mouse.y);
    ui.drawDiscardScreen(renderer.ctx, discardPendingCardId);
  }

  // ── POST-FRAME PASSES ─────────────────────────────────────────
  // (bloom removed — ctx.filter blur was CPU-rasterized, costing 4-8ms/frame)
  // Chromatic aberration edge flash (combat only)
  if (gameState === 'playing' || gameState === 'paused') renderer.drawCAFlash();
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
    const cW = Math.min(620, canvas.width - 60);
    const controlLines = [
      { text: 'CONTROLS & MECHANICS', col: '#ffdd44', font: 'bold 20px monospace' },
      { text: '', col: '', font: '' },
      { text: 'WASD / Arrow Keys  —  Move', col: '#ddd', font: '15px monospace' },
      { text: 'SPACE  —  Dodge toward cursor  (no AP cost)', col: '#ddd', font: '15px monospace' },
      { text: 'LEFT CLICK  —  Use selected card', col: '#ddd', font: '15px monospace' },
      { text: 'RIGHT CLICK / 1–4  —  Cycle / select card slot', col: '#ddd', font: '15px monospace' },
      { text: 'ESC  —  Pause menu', col: '#ddd', font: '15px monospace' },
      { text: '', col: '', font: '' },
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
    const lineH = 22;
    const cH = Math.min(canvas.height - 40, 80 + controlLines.length * lineH + 70);
    const cpx = (canvas.width - cW) / 2;
    const cpy = (canvas.height - cH) / 2;
    ctx.fillStyle = '#0a0a16';
    ctx.beginPath();
    ctx.roundRect(cpx, cpy, cW, cH, 14);
    ctx.fill();
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < controlLines.length; i++) {
      const cl = controlLines[i];
      if (!cl.text) continue;
      ctx.fillStyle = cl.col;
      ctx.font = cl.font;
      ctx.textAlign = 'center';
      ctx.fillText(cl.text, canvas.width / 2, cpy + 36 + i * lineH);
    }

    pauseMenuBoxes = [];
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
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QUIT TO MENU?', canvas.width / 2, py + 55);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText('Your run progress will be lost.', canvas.width / 2, py + 82);

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

console.log('[Init] Game ready, starting engine.');
const engine = new Engine(update, render, () => gameState);
engine.start();
