# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to Run

No build step. Serve the project root with Python and open in a browser:

```bash
python -m http.server 8000
# Then open http://localhost:8000
```

Vanilla ES modules — native browser `import`, no bundler, no transpiler, no package manager.

## Syntax Check

```bash
node check-syntax.js
```

Always run this after any edits. All 31 `src/**/*.js` files must pass (0 errors). The checker recurses into `src/net/`.

---

## Architecture Overview

**Entry point:** `src/main.js` — instantiates all systems, wires them together, owns the game state machine, and drives the main update/render loop. It is ~2400 lines and intentionally monolithic for the game loop and render pipeline.

**Game state machine** (`gameState` string in `main.js`):
```
intro → charSelect → map → prep → playing → draft → itemReward → shop → upgrade → event → rest → discard → stats
                                  ↕ paused (overlay)
```
Note: `dead` and `victory` do not exist as states — both end in `stats`. `rest` state is the new rest node choice screen (heal vs burn a card). `discard` with `discardPendingCardId === '__BURN__'` removes a card without adding a replacement.

**Core systems and their roles:**

| File | Role |
|---|---|
| `src/Engine.js` | `requestAnimationFrame` loop, hit-stop (freezes logic dt), slow-mo (scales dt) |
| `src/EventBus.js` | Singleton `events` pub/sub — **all cross-system communication flows through this** |
| `src/tempo.js` | `TempoSystem` — 0–100 resource with auto-crash at both extremes |
| `src/Combat.js` | `CombatManager` — card type dispatch, hitbox resolution, damage, post-dodge crit |
| `src/Enemy.js` | Base `Enemy` class + 29 named subclasses (including 5 bosses) |
| `src/player.js` | `Player` — movement, combo system, dodge, class passives |
| `src/DeckManager.js` | `CardDefinitions` (~104 cards) + `DeckManager` (hand/deck/draw/upgrade state) |
| `src/Items.js` | `ItemDefinitions` (27 relics: 21 general + 6 character-exclusive) + `ItemManager` (per-update effects, kill/death callbacks) |
| `src/RunManager.js` | Procedural map graph (seeded RNG, layered fight/elite/event/shop/rest/boss nodes) |
| `src/room.js` | `RoomManager` — room layout variants (standard/pillars/arena/corridor), pillar collision |
| `src/MetaProgress.js` | localStorage persistence: unlocks, leaderboard, mastery, volume |
| `src/Characters.js` | 6 character definitions + `DIFFICULTY_MODS` |
| `src/Projectile.js` | `ProjectileManager` — projectile pool, movement, collision |
| `src/Particles.js` | `ParticleSystem` — visual-only effects, damage numbers, flashes |
| `src/Renderer.js` | Canvas clear, screen shake scope, touch controls |
| `src/ui.js` | `UI` — HUD (HP/AP/tempo bar/hand/minimap/relics), all menu screens |
| `src/audio.js` | `AudioSynthesizer` — MP3 BGM pools + Web Audio API SFX |
| `src/Input.js` | Keyboard + mouse + touch input, per-frame consume pattern |
| `src/Entity.js` | Base class with `x, y, r, alive` |
| `src/Players.js` | **RH2** — `Players` multi-player manager (add/reset/anyAlive/allDownedOrDead/goDown/updateRevives/resonanceMultiplier) + `makePlayer(charDef, x, y)` factory + `PLAYER_HALO_COLORS` |
| `src/Biomes.js` | **RH2** — 6 biome defs (verdant/frostforge/cathedral/tide/voidline/clockwork) with palette/ambience/music/hazard/postFx + `pickBiomeForFloor(floor, rng)` |
| `src/SpatialHash.js` | **RH2** — uniform-grid spatial hash for O(n+k) hitbox queries; `rebuild/query/forEachInCircle` |
| `src/EnemiesRH2.js` | **RH2** — 8 new enemy classes (TetherWitch, MireToad, Bloomspawn, IronChoir, StaticHound, BossHollowKing, BossVaultEngine, BossAurora) |
| `src/net/Net.js` | **RH2** — transport stub (`connect/sendUnreliable/sendReliable/on/disconnect`); solo mode no-ops |
| `src/net/Snapshot.js` | **RH2** — delta encoder/decoder with int16 quantized positions + bitfield flags; `SNAP_TYPES = { POS, EVT, FULL }` |
| `src/net/Lobby.js` | **RH2** — room codes, ready checks, host migration; `LOBBY_STATES` enum |
| `src/net/HostSim.js` | **RH2** — host-only 15 Hz position broadcast + reliable event forwarding |
| `src/net/Reconcile.js` | **RH2** — client prediction (8 px drift threshold, 0.3 lerp) + remote-entity interpolation (~100 ms render delay) |

---

## RH2 Multiplayer & Co-op

**Local 2-player co-op:** Press **F2** on the character select screen to toggle. Host plays P1 (WASD + mouse + Space dodge + 1–4 cards). P2 uses arrow keys to move, numpad 4/8/6/2 to aim a reticle (orange), numpad 0 to fire, numpad 5 / RShift to dodge, numpad 1–4 to play from the shared hand. P2 input is exposed via `input.player2View()`, and `input.updateP2Reticle(p2, dt)` must be called once per frame *before* P2's `updateLogic`.

**Remote co-op (up to 4):** wired through `src/net/`. `Net` is a stub — production transport (WebRTC DataChannel, ordered+unordered) plugs in there without changing call sites. `HostSim.tick(dt, players, enemies)` is called from the main loop *only when role==='host'* and broadcasts position snapshots at 15 Hz; reliable world events (KILL, PLAYER_DOWNED, BOSS_PHASE, ZONE_TRANSITION, CONTROLS_INVERT, etc.) are forwarded automatically via `events.on()` subscriptions. Clients apply own-player snapshots via `Reconcile.applyOwn` (gentle pull at >8 px drift) and remote entities via `Reconcile.interpolateRemote`.

**Downed/revive:** when `player._coopMode === true`, `player.takeDamage()` enters the **downed** state instead of dying. Downed players move at 0.35× speed, cannot dodge, and may only play cards approved by `player.canPlayCardWhileDowned()`. Allies revive by standing within range — `players.updateRevives(dt)` advances the revive timer.

**Group Tempo Resonance:** `tempo.computeGroupResonance(zones)` returns a 1.00–1.30× multiplier based on the largest group of players sharing a tempo zone (2/3/4 → 1.10/1.20/1.30×). Stored on `tempo._groupResonanceMult` and applied in `tempo.damageMultiplier()`. Resonant Anchor relic boosts the bonus by ×1.5.

**Pact cards & Pact relics:** new card flag `pact: true` with optional `pactCostPerAlly` (extra AP per nearby ally; effect scales). Six new Pact relics in `Items.js` (`pactRelic: true`): bond_of_embers, linked_steel, mirror_vow, fourfold_sigil, resonant_anchor, shared_burden.

**Globals added in main.js for cross-system access:** `window._players` (Players manager — used by RH2 enemies to target/affect all players), `window._biome` (current Biome def — RoomManager will read this when biome palette wiring lands).

**Music:** existing tracks in `music/` are reused; biome `music` field is informational until per-biome track assignment is done.

---

## Key Design Patterns

**EventBus over direct refs.** Systems communicate via `events.emit()`/`events.on()`. When adding cross-system behavior, emit a new event rather than passing object references. Key events: `COMBO_HIT`, `KILL`, `DODGE`, `PERFECT_DODGE`, `HEAVY_HIT`, `DAMAGE_TAKEN`, `ZONE_TRANSITION`, `ENEMY_MELEE_HIT` (with `{ damage, source }`), `COLD_CRASH`, `CRASH_ATTACK`, `PLAYER_SILENCED`, `SPLITTER_DIED`, `SPAWN_TRAP/ORBS/ECHO/SIGIL/GROUND_WAVE/BEAM_FLASH`.

**`window._itemDefs`** is set in `main.js` to break a circular import — always use `window._itemDefs` (not `ItemDefinitions`) inside `ui.js`.

**`window.CANVAS_W` / `window.CANVAS_H`** are globals updated on resize; used throughout for bounds.

**Run-state ownership.** The `player` object holds live HP/stats during a run. `meta` (MetaProgress) holds persistent cross-run data. There is no `RunState` singleton — that file is dead.

---

## Tempo System

`src/tempo.js` — the central 0–100 resource:

| Zone | Range | Effect |
|---|---|---|
| COLD | < 30 | 0.7× damage, 0.9× speed |
| FLOWING | 30–69 | 1.0× damage, 1.0× speed |
| HOT | 70–89 | 1.3× damage, 1.2× speed, dash-attacks deal contact damage |
| CRITICAL | 90–99 | 1.8× damage, pierce on attacks |
| CRASHED | — | Brief stagger, reset to `crashResetValue` |

- **Auto-crash at 100** (accidental): circular AoE burst around player, resets to `crashResetValue`
- **Auto-crash at 0** (cold crash): massive freeze AoE, resets to 20

`_doCrash()` resets **both** `value` and `targetValue` to `crashResetValue` — failing to reset `targetValue` causes an immediate reclimb to 100. Berserker Heart overrides the reset value to 80 for [BLADE] characters.

`tempo.prevValue` is snapshotted at the start of each `update()` call — use this for zone-entry detection (e.g. sigil triggers) rather than estimating the previous value from decay math.

`tempo.resonanceBand()` returns the ±band for Echo resonance zone checks: 5 normally, 15 with Resonance Crystal equipped.

Decay is blocked when: `itemManager.sustainedTimer > 0` (Sustained item), or `runaway` item + value ≥ 70.

---

## Card System

Cards in `DeckManager.CardDefinitions` have: `id, name, cost (AP), tempoShift, damage, range, type, rarity, desc`. Optional: `slotWidth: 2` (occupies two hand slots), `bonusCard: true` (requires unlock).

**Card types dispatched in `Combat.executeCard()`:**

`melee`, `cleave`, `dash`, `projectile`, `shot` — direct combat  
`beam` — line-distance check `|ex*ny - ey*nx|`  
`trap` — placed at cursor, triggers on enemy overlap  
`orbit` — orbiting projectiles spawned around player  
`channel` — held-mouse continuous damage (polled in main update loop)  
`sigil` — placed marker, triggers on tempo zone events  
`echo` — delayed action executed at a position after a timer  
`ground` — wave traveling in cursor direction  
`counter` — sets parry window; triggers via `ENEMY_MELEE_HIT` event  
`stance` — toggles `player.stance` string, modifies subsequent attacks  
`utility` — misc effects (mark, flip, phase, oath)

**World arrays** maintained in `main.js` scope: `traps[]`, `orbs[]`, `echoes[]`, `sigils[]`, `groundWaves[]`, `beamFlashes[]`, `channelState`. These are cleared on each room spawn.

---

## Characters & Mastery

6 characters in `src/Characters.js`: Blade, Frost, Shadow, Echo, Wraith, Vanguard. Each has `passives` object checked in combat/tempo/player. Each has `masteryCards[4]` — unlocked at 1/3/5/10 runs with that character via `MetaProgress.incrementMastery()`.

Mastery-unlocked cards are treated as `bonusCard: true` entries; `getAvailableCards()` in `main.js` checks both `isBonusCardUnlocked` and `isMasteryCardUnlocked`.

---

## Enemy System

30 enemy classes in `src/Enemy.js`. All subclasses call `room.clamp()` after movement — this applies pillar collision. If enemies get stuck against walls, they stop moving (no pathfinding). The corridor room variant uses short wall segments with 220px gaps to mitigate this.

Enemy communication to player: always emit `ENEMY_MELEE_HIT` with `{ damage, source: this }` so the parry system and Vanguard guard system work correctly.

Special enemies: Disruptor emits `PLAYER_SILENCED { duration }` — while `player.silenced = true`, all card clicks show "SILENCED!" and play miss sound.

**Phantom Ink:** `player._phantomInkActive` is set to `player.dodging && itemManager.has('phantom_ink')` immediately before each enemy's `updateLogic` call in the update loop. All enemy idle→chase transitions check `!player._phantomInkActive`.

**Shadow Cloak:** `player._shadowCloakActive` is set to `true` in the `PERFECT_DODGE` event handler (when Shadow Cloak is equipped). `CombatManager.applyDamageToEnemy()` reads and clears this flag, applying 3× damage on the first hit.

**Berserker's Oath (`oathStacks`):** When `player.oathStacks > 0`, `executeCard` refunds the AP cost and decrements the stack. `player.oathComboWindow = true` while stacks remain, which prevents `player.comboTimer` from decrementing in `player.updateLogic`.

**EventBus listener placement:** Never call `events.on()` inside an `updateLogic` method — it runs every frame and will register a new listener each time. Register listeners once in the constructor (or a one-time init method) and use a guard flag if the callback must only fire once.

---

## Audio

`src/audio.js` uses MP3 files in `music/`. Track pools:
- `boss`: Boss_Battle.mp3 × 6 (shuffle-bag)
- `normal`: Normal_Battle.mp3 × 7 (shuffle-bag)
- `map`/`menu`: Selection_Map.mp3 × 3 (shuffle-bag)
- `intro`: Main_Menu.mp3 (looping)

**Combat track locking**: `_combatTrackLocked = true` when entering boss/normal combat. The `ended` listener replays the same song. Only `silenceMusic()` unlocks it. This ensures the same song plays for the entire fight.

Master volume is persisted to `MetaProgress.state.masterVolume` and restored on startup.

---

## MetaProgress (localStorage)

Key state fields: `unlockedCharacters`, `difficultyTiers`, `unlockedBonusCards`, `masteryUnlockedCards`, `charMastery` (run counts per char), `perCharacterStats`, `leaderboard`, `masterVolume`.

`resetAll()` deep-clones `DEFAULT_STATE` so all fields including nested objects are reset cleanly.

---

## Performance Patterns

These conventions are established and must be maintained when adding new code:

**Squared distance for range checks.** Never call `Math.sqrt` purely to compare against a range threshold. Use `dx*dx + dy*dy < threshold*threshold` instead. Only compute `Math.sqrt` when you actually need the scalar distance value (e.g., direction normalization: `dx / dist`).

```js
// Wrong — sqrt wasted on a comparison
const d = Math.sqrt(dx * dx + dy * dy);
if (d < range + e.r) { ... }

// Correct
const threshold = range + e.r;
if (dx * dx + dy * dy < threshold * threshold) { ... }
```

**Particle cap.** New particles must go through `ParticleSystem._pushParticle()`, not `this.particles.push()` directly. The cap is 400 (constant `PARTICLE_CAP` at the top of `Particles.js`). `spawnBurst` and `spawnCrashBurst` already use `_pushParticle`.

**Particle batch map.** The module-level `_batchGroups` / `_batchKeys` structures in `Particles.js` are reset and reused each frame — do not replace them with per-frame `{}` object literals. This avoids GC pressure from hundreds of short-lived objects per second.

**Projectile trail slots.** Trail slots are pre-allocated `{ x, y }` objects at spawn time and updated in-place each frame. Never assign `p.trail[i] = { x: ..., y: ... }` — always mutate the existing slot: `ts.x = p.x; ts.y = p.y;`.

**Room background cache.** `RoomManager._buildGridCache()` renders the floor, grid, and pillars to an offscreen canvas once per room. `draw()` blits it with a single `drawImage`. Do not add per-frame drawing of static room geometry — invalidate `_gridCache = null` on `generateVariant()` instead (already done).

**Squared distance already applied in:** `Combat.js` (melee nearest, cleave, dash nearest, mark-for-death, mirror strike, melee pierce, dash-attack, reticles), `Projectile.js` (near-miss check, player-shot collision, ricochet nearest). Do not regress these back to `Math.sqrt`.
