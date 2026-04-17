# Rogue Hero 2 — Design Document

Two major notes on this:
1. Having the 4 player multiplayer live co-op is amazing, but definitely also need the support for local 2 player co-op.
2. Use the existing music tracks we have from the first game for now, I will add more in the near future and then assign them to the maps/biomes/etc.

A sequel to **Rogue Hero**, keeping the same general infrastructure (HTML5 Canvas + vanilla ES modules, no bundler, Electron wrapper for desktop) while adding **up to 4-player live co-op**, a fresh visual identity, and a wider roster of heroes, enemies, attacks, and cosmetics — all engineered to stay smooth at 60 FPS over the network.

---

## 0. Guiding Principles

1. **Same bones, new skin.** The architecture in the original (`EventBus` singleton, `Engine` rAF loop, `Tempo` resource, card dispatcher in `Combat.executeCard()`, particle batching, room cache) is good — keep it. Multiplayer is an *addition*, not a rewrite.
2. **Authoritative host, lockstep-ish input model.** One client (or a tiny relay) is canonical; others extrapolate. The seeded `RunManager` already makes maps deterministic — extend that determinism to enemy spawns and projectiles.
3. **Network only what changes the world.** Particles, sounds, screen shake, HUD, combo counters, and damage numbers stay 100% client-local. This is already documented in `MULTIPLAYER_IDEAS.md` §5 — formalize it.
4. **Visual upgrade, not visual rewrite.** Stay on Canvas2D, but pre-render more (sprite atlases, layered parallax floor, animated shaders via `globalCompositeOperation`). Skip WebGL until a measurable frame budget says otherwise.
5. **Optimization is a feature.** Every new system pays a network/perf budget tax up front. If it can't be event-based, it doesn't ship.

---

## 1. Multiplayer (the headline feature)

### 1.1 Mode: Live 1–4 Player Co-op

- Lobby: host creates a run, picks difficulty + seed, shares a 6-character room code.
- Up to 4 heroes drop into the **same battle, same room, same time** — no instancing, no per-player rooms.
- Late-join allowed up to start of next combat node (between rooms).
- Solo play is identical to MP with `playerCount = 1` — no separate code path.

### 1.2 Networking architecture

**Hybrid host-authoritative + client prediction.** Pick this over peer-to-peer-mesh because:

- Mesh scales O(n²) on bandwidth and gets worse as players go up.
- A single host in a 4-player game has the same workload as a server but costs $0.
- The original game already runs everything in one process — making one client "the host" is a 1-line change.

```
Host (Player 1):
  - Owns enemy AI, enemy HP, projectile spawns, room generation, drops, RNG
  - Broadcasts: enemy positions @ 15 Hz, world events (spawn/death/hit) on demand
  - Receives: each client's input intents (move vector, card-play events)

Client (Players 2–4):
  - Owns: their own player position (predicted), particles, audio, HUD
  - Sends: input intents to host
  - Receives: enemy snapshots, world events; reconciles divergence
```

### 1.3 Transport

- **WebRTC DataChannel via a free signaling relay** (e.g. a tiny Cloudflare Worker just for SDP exchange).
- DataChannel `ordered: false, maxRetransmits: 0` for position updates → UDP-style, low latency.
- DataChannel `ordered: true` for events (card plays, kills, room transitions).
- Fallback: WebSocket relay if WebRTC handshake fails (corporate NAT, etc.).

### 1.4 What syncs vs. what doesn't

| Data | Sync? | Frequency / Trigger |
|---|---|---|
| Player position + facing + dodging flag | ✅ | 15 Hz delta (omit if unchanged) |
| Card play | ✅ | Event (card id, cursor x/y, frame) |
| Enemy positions | ✅ host→client | 15 Hz, delta-compressed (only moving enemies) |
| Enemy HP | ✅ host→client | Event on damage |
| Projectile spawn | ✅ host→client | Event (id, origin, vel, owner) — local sim from there |
| Tempo zone changes | ✅ | Event when a player crosses zone boundary |
| Particles, hit-flash, screen shake | ❌ | Local — every client decides on its own from events |
| Sound | ❌ | Local |
| HUD / minimap | ❌ | Local |
| Combo counter | ❌ | Local (per player) |

Per-frame bandwidth estimate at 4 players: ~3–5 KB/s per client. Easily fits in any modern connection.

### 1.5 Anti-lag patterns

- **Client-side prediction for own player.** Move locally on input, reconcile from host snapshot only if drift > 8 px.
- **Entity interpolation** for other players and enemies (render 100 ms behind newest snapshot).
- **Lag compensation for melee/dash attacks.** When a card play arrives, host rewinds enemy positions by the sender's RTT/2 before resolving the hitbox. (This is the same trick CS:GO uses.)
- **Fixed-step simulation.** `Engine.js` already separates dt from logic — pin logic to a 60 Hz fixed step, render at whatever the client can do. This makes deterministic replays and lockstep validation trivial.
- **Bandwidth gates.** Cap outgoing snapshots: drop redundant ones when the player hasn't moved.
- **No per-particle sync, ever.** This is the single biggest temptation — resist it.

### 1.6 Shared vs. per-player resources

| Resource | Shared or Per-Player? | Reasoning |
|---|---|---|
| HP | **Per-player** | Death stakes feel personal; revive system below |
| AP (action points) | **Per-player** | Each player runs their own card economy |
| Tempo | **Per-player** with **shared "Resonance"** bonus | Keeps the original feel; see Group Tempo below |
| Deck / hand | **Per-player** | Drafts are individual |
| Relics | **Per-player + 2 shared "Pact" relics** | New shared relic slot — see §5 |
| Gold (cosmetic currency) | **Pooled** | Lobby pot; smooth for shop visits |
| Map progress | **Shared** | One map, one path, vote at branches |

### 1.7 Group Tempo (new mechanic)

When 2+ players are in the **same Tempo zone** (Cold / Flowing / Hot / Critical) at the same time, all of them get a "Resonance" multiplier:

- 2 players synced → +10% damage
- 3 players synced → +20% damage + slight tempo decay reduction
- 4 players synced → +30% damage + crash radius scaling

This rewards coordination without forcing it. A Blade who *wants* Critical and a Frost who *wants* Cold can still play independently — they just lose the Resonance bonus.

### 1.8 Down/Revive

- HP 0 = "Downed" state (crawling, can play 1-cost cards only, can't dodge).
- An ally walking onto you for 2 seconds revives at 30% HP.
- If all players are downed simultaneously → run ends (back to `stats`).
- A player who dies during a boss fight respawns at next room with 50% HP. (Boss fights stay tense; chip damage doesn't snowball into "1 player carries" boredom.)

### 1.9 Drafting & Shops in MP

- After each combat, **all players draft simultaneously** from their own card pools (no shared pool — avoids one player snipe-picking).
- Shops: pooled gold, anyone can buy, items go to whoever clicked first. UI shows `[claimed by Frost]` after purchase.
- Events: vote (majority wins, host tiebreak).

### 1.10 Reconnect & host migration

- Each client keeps a 30-second rolling snapshot of game state.
- If host drops, the client with the lowest player ID becomes new host and broadcasts its snapshot. Brief "reconnecting…" overlay (≤2 s in good conditions).
- Mid-combat host migration is allowed; mid-card-resolution is buffered until migration completes.

---

## 2. New Visual Identity

The original is dark monotone with neon accents (vignette, scanlines, bloom — see `Renderer.js`). RH2 keeps the moody base but introduces a **biome-driven palette system** and richer environmental rendering.

### 2.1 Biome-driven battle scenes

The original has 4 room *variants* (`standard`, `pillars`, `arena`, `corridor`) and 3 *themes* by floor. RH2 expands this to **6 biomes**, each with a distinct palette, floor texture, parallax background layer, particle ambience, and music pool.

| Biome | Palette | Ambience | Hazard |
|---|---|---|---|
| **Verdant Ruins** | mossy greens / amber stone | drifting pollen, rustling leaves | thorn pits |
| **Frostforge** | cyan / steel / soot | snowfall, forge embers | ice patches reduce friction |
| **Ember Cathedral** | crimson / gold / obsidian | falling ash, candle flicker | lava fissures |
| **Tide Halls** | teal / pearl / coral | water caustics on floor, bubbles | rising tide rooms |
| **Voidline** | violet / black / starlight | drifting motes, gravity ripples | reversed-control zones |
| **Clockwork Spire** | brass / cobalt / verdigris | gear-tick, steam puffs | pressure plates trigger turret bursts |

Each biome has its own unlock, music pool tag, and biome-specific enemy variants (a "frost chaser" reskin of Chaser, etc.). The `RoomManager._gridCache` pattern already in place handles this — just extend it with a biome param.

### 2.2 New rendering layers

Add to `Renderer.js`:

- **Parallax background layer** — pre-rendered offscreen, panned by ~10% of camera/shake offset. One per biome, baked at room load.
- **Animated floor decals** — subtle looping shaders (lava heat shimmer, water caustics) using `globalCompositeOperation = 'overlay'`. Cached as 4-frame loops, blitted as drawImage.
- **Lighting pass.** Simple radial gradient lights at the player + key effects. Composited via `multiply` blend on a dim canvas. No raytracing — just stamps.
- **Per-biome post FX.** Voidline gets stronger chromatic aberration; Frostforge gets a subtle blue tint via `globalCompositeOperation`; Cathedral pulses red on heavy hits.
- **Player aura halos in MP.** Each player has a colored ground halo (matches their character color) so allies can find each other in chaos. ~4 px outer-glow ring, drawn before the body.

### 2.3 Particle upgrades

- **Element types.** Particles tag themselves `fire | frost | void | shock | slash | smoke`. Each element has a tinted gradient and a slightly different fade curve. The `_pushParticle` cap of 400 stays — quality, not quantity.
- **Group-scaled cap.** With 4 players, cap rises to 600 (proportional headroom), but **never above** based on a measured-fps governor: if frame time > 18 ms over a 1-second window, cap drops to 350 until recovery.
- **Hit-stop lensing.** During hit-stop, push a brief 2-frame radial blur stamp at the impact site instead of new particles. Cheaper, more impactful.

### 2.4 Card art polish

- All cards get a layered illustration (3 stacked PNG layers per card: bg, art, frame). Pre-composited at load to a single offscreen canvas per card → 1 drawImage in HUD.
- Foil/holo treatment on rare/legendary cards — animated rainbow stripe via `linear-gradient` clip-path.

### 2.5 Enemy redesigns

Every original enemy keeps its silhouette but gets a fresh telegraph + death animation. New silhouettes for the 8 new enemy types in §4. Bosses become **2-phase animated set-pieces** with screen-filling intro card.

---

## 3. New Heroes (4 added → 10 total)

Keep the original 6 (Blade, Frost, Shadow, Echo, Wraith, Vanguard). Add:

| ID | Name | Title | Niche | Passive snapshot |
|---|---|---|---|---|
| `pyre` | Pyre | The Smouldering | Damage-over-time stacker | Attacks apply Burn (1 dmg/s × 3s, refresh on hit). At HOT, burn ticks twice. |
| `tide` | Tide | The Caller | Co-op support | Cards mark allies as "Anchored" — Anchored allies' next attack +25% dmg. Heals 1 HP on ally revive. |
| `cog` | Cog | The Tinkerer | Trap/turret control | Can place 2 mini-turrets per room. Tempo decays 2× faster but card costs −1 (min 1). |
| `lumen` | Lumen | The Beacon | Vision/buff aura | 250-px bright aura: allies in aura get +1 AP regen. Self can't dodge — instead blinks 60 px. |

(Total **10 playable heroes** in RH2.) All new heroes get the same `masteryCards[4]` structure (1/3/5/10 runs) used in the original.

### 3.1 Co-op-specific class tuning

- Wraith's `noHealingFromRelics` becomes `noHealingFromRelics OR allies` — allies *can* revive Wraith but it stays at 1 HP.
- Vanguard's Guard stacks now reduce damage for adjacent allies (within 80 px) by 1 also. Pure tank fantasy.
- Echo's Resonance pulse procs on ally Tempo zone matches too — strong synergy with Group Tempo.

---

## 4. New Enemies (8 added → 38 total)

| Name | Role | Behavior sketch |
|---|---|---|
| **Tether Witch** | Anti-spread | Beam-tethers two players; if they move > 300 px apart, both take damage. |
| **Mire Toad** | Zone control | Spits puddles that slow + apply Wet (Frost cards do +50% to Wet). |
| **Bloomspawn** | Reactive splitter | Every 5 seconds, asexually buds a smaller copy. Kill before it doubles. |
| **Iron Choir** | Buff bot | Sings a column of light; enemies inside heal. Silence-vulnerable. |
| **Hollow King (Boss)** | 3-phase boss | Phase 1: chases; Phase 2: shadow clones; Phase 3: arena flips upside down (controls invert). |
| **Vault Engine (Boss)** | 2-phase puzzle boss | Players must hit 4 weak points in tempo with each other (rewards Group Tempo). |
| **Static Hound** | Lightning bruiser | Charges in a line; chains lightning between players if they're aligned. |
| **Aurora (Boss, biome: Voidline)** | Multi-screen boss | Spans 1.5× the play area, telegraphs gravity wells. |

Each new enemy follows existing patterns: emits `ENEMY_MELEE_HIT` with `{ damage, source }`, calls `room.clamp()` post-movement, registers EventBus listeners only in constructor.

---

## 5. New Cards & Relics

### 5.1 New Card Categories

- **`pact` cards** — only playable when ≥2 players are alive; bigger AoE, costs partial AP from each ally.
- **`marker` cards** — place a 1-second windup beacon; allies who hit it within the window proc the bonus.
- **`relay` cards** — fired in a direction; if it hits an ally, it ricochets toward the nearest enemy with bonus damage.
- **`overload` cards** — costs 0 AP but raises Tempo +40 (high crash risk for big payoff).

Target ~30 new cards across these categories on top of the existing ~104, putting RH2 around **130+ cards**.

### 5.2 Shared "Pact" Relics

A new slot below the existing relic row: 2 **Pact Relics** that affect the whole party. Examples:

- **Bond of Embers** — when one player crashes, all allies gain +20 Tempo.
- **Linked Steel** — kills by one player give +1 AP to the player with the lowest current AP.
- **Mirror Vow** — when an ally takes damage, the nearest other ally gains 1 Guard stack (even non-Vanguards).
- **Fourfold Sigil** — at 4-player count only: every relic in the lobby is mildly amplified.

### 5.3 Tweaks to existing relics

- `quick_hands` (+40% AP regen) → tone to +30% in MP, since allies cover for downtime now.
- `last_rites` → in MP, the auto-crash also revives one downed ally if any.
- Character-exclusive relics gain "shared" forms when an ally has the matching char unlocked (cosmetic flavor only).

---

## 6. Tweaks to Battle Mechanics

- **Tempo crash radius** scales mildly with player count (×1.0/1.15/1.25/1.3) so crashes still matter in a 4-pack.
- **Combo system** in `player.js` extends to **cross-player combos**: hitting a marked enemy that an ally just hit grants a Combo Echo bonus (+5 Tempo, +1 hit count).
- **Parry windows** are individual but emit a `PARTY_PARRY` event when ≥2 players parry within 0.5 s — triggers a small shockwave.
- **Mouse scroll = card cycle**, on top of number-key selection (carry-forward from `improvements.md`).
- **Difficulty scaling for MP**: enemies spawn count scales 1.0× / 1.6× / 2.1× / 2.5× by player count (sub-linear so it doesn't punish full lobbies).
- **Map branching for groups**: at fork nodes, each player puts a token on a node; majority wins, host tiebreaks. Adds a "negotiation moment" between rooms.
- **Friendly fire**: OFF for direct damage; ON for *crash bursts* at 25% potency (encourages communication around big crashes).

---

## 7. Optimization & Performance

This is its own first-class feature, not a polish pass.

### 7.1 Network performance

- Snapshot delta compression (only send changed fields).
- Quantize positions to int16 (×0.1 px precision).
- Bitfield-pack flags (`dodging`, `silenced`, `downed`) into 1 byte.
- Bundle all events fired in one frame into a single message (one writev per tick, not per event).
- Use `BroadcastChannel` for same-machine playtests (skip network entirely).

### 7.2 Rendering performance

- **Sprite atlases.** Cards, enemies, and biome props each go in one atlas image. One drawImage per visible thing.
- **Off-screen prerender** all static layers (already done for room grid and scanlines/vignette — extend to parallax & light masks).
- **Dirty-rect HUD** — re-render the HUD strip only when stats change. Saves ~1.5 ms/frame.
- **Skip rendering offscreen entities** (currently everything draws every frame; add `if (e.x < -50 || e.x > w + 50) continue`).
- **Layer cache invalidation discipline.** If a system invents a new offscreen cache, it must clear it on resize and biome change — codify in a single `RenderCacheRegistry`.

### 7.3 Logic performance

- Keep **squared distance** convention (already documented in `CLAUDE.md`).
- Object pooling for projectiles, particles, damage numbers (some already pooled — extend to `DamageNumber`, `BeamFlash`, `GroundWave`).
- **Spatial hashing** for `circularHitbox` and projectile-vs-enemy. With 4 players × ~30 enemies × multiple AoEs, naïve O(n×m) starts to matter.
- **Frame budget governor.** If a frame exceeds 16.6 ms three times in a row, soften effect quality (lower particle cap, skip bloom pass).

### 7.4 Build & ship

- Keep zero-bundler ES modules — fast iteration, low complexity.
- Optional: an **opt-in build step** that concats + minifies for production releases (one shell script, no webpack/vite). Reduces 22 module roundtrips on cold load.
- Service worker for desktop web build → offline play, instant subsequent loads.
- Electron app bundled exactly as today; add an in-app multiplayer status pane (ping, packet loss, your role: host/client).

---

## 8. Cosmetics & Progression

### 8.1 Carry-forward + expansion

The original has a strong cosmetic pipeline (`Cosmetics.js` — boxes, weighted rarity, category filters). Keep it. Add:

- **Per-character cosmetic loadouts** (today everything is global — you'd want different colors per hero).
- **Lobby cosmetic showcase.** Hovering an ally in lobby reveals their loadout + title.
- **MP-only cosmetics:**
  - *Banner trails* between you and allies — visible when within 200 px.
  - *Synced auras* that pulse when Group Tempo Resonance triggers.
  - *Co-op victory dances* — short emote played in the post-boss screen.
- **New box tiers:** `Echoed Box` (mp-themed cosmetics), `Biome Boxes` (themed to each new biome).

### 8.2 Meta progression additions

- **Per-character mastery stays** (1/3/5/10 thresholds).
- **Lobby Mastery** — count of MP runs completed unlocks group-only relics and emotes.
- **Weekly Co-op Seed** — leaderboard for a fixed 4-player seed, separate from solo.
- **Achievements** — first revive, first 4-player perfect parry, beat each new boss with each character class.

---

## 9. Audio

- Carry forward the MP3 shuffle-bag pools and `_combatTrackLocked` pattern.
- **Per-biome music tags** — every track gets a `biome` field so the right music plays in the right place.
- Add **6 new tracks per biome** at minimum (Verdant, Frostforge, Cathedral, Tide, Voidline, Clockwork). Aligns with the `improvements.md` note "Do music by map levels, make more songs."
- **MP-aware ducking**: when an ally is downed, music ducks 30% and a low rumble plays. Tense, not annoying.
- **Spatial SFX (cheap version)**: stereo-pan SFX based on the event's x-position relative to the local player. Free immersion.

---

## 10. Architecture Adjustments (file-level plan)

Keep the existing module list. Add:

| New file | Role |
|---|---|
| `src/net/Net.js` | WebRTC/WS transport, send/recv, RTT measurement |
| `src/net/Snapshot.js` | Delta-encoded snapshot pack/unpack |
| `src/net/HostSim.js` | Authoritative simulation extensions for host (enemy AI, projectiles) |
| `src/net/Lobby.js` | Lobby state, player slots, ready checks, host migration |
| `src/net/Reconcile.js` | Client-side prediction + reconciliation for own player |
| `src/Biomes.js` | Palette, ambience, music pool per biome |
| `src/Lighting.js` | Cached radial light pass |
| `src/SpatialHash.js` | Uniform-grid hash for hitbox queries |

Modifications to existing files (kept *minimal*):

- `main.js` — accepts a `netRole` (`solo | host | client`); same loop in all modes, host runs more.
- `EventBus.js` — events tagged `local` vs `synced`; synced events go through the net layer.
- `Combat.js` — hit resolution stays here; in MP, only host runs it (clients receive damage events).
- `Enemy.js` — no behavioral change for clients; their `updateLogic` becomes a render-only interp loop in client mode.
- `RunManager.js` — already seeded; expose seed + map graph in the lobby state.
- `MetaProgress.js` — add `lobbyMastery`, MP-specific unlocks.
- `Renderer.js` — biome-aware passes, parallax, lighting hooks.

This is **additive**. The existing single-player loop continues to work unchanged in `netRole === 'solo'`.

---

## 11. Roadmap (suggested order)

1. **Phase 0 — Refactor for net-readiness.** Split solo loop into `Sim.tick()` + `Render.draw()` cleanly; introduce `EventBus` event categories. No gameplay change. (~1 week)
2. **Phase 1 — Local 2-player hot-seat.** Two players on one keyboard. Validates HP/AP/dodge separation, downed/revive, shared map. No networking yet. (~1 week)
3. **Phase 2 — WebRTC transport + 2-player remote co-op.** One biome, original heroes. Ship as a beta. (~2 weeks)
4. **Phase 3 — 4-player support + Group Tempo + Pact relics.** (~1 week)
5. **Phase 4 — Visual overhaul: biomes, parallax, lighting.** Ship as the "RH2" public release. (~2–3 weeks)
6. **Phase 5 — New heroes, enemies, cards.** Continuous content adds. (~ongoing)
7. **Phase 6 — Spectator mode, replays, weekly co-op seed leaderboards.** (~later)

---

## 12. What we're explicitly NOT doing

- ❌ Switching to WebGL / Three.js / a game engine. Stays Canvas2D.
- ❌ Adding a backend service. Lobbies use peer-to-peer + a stateless signaling endpoint.
- ❌ Per-particle network sync.
- ❌ Mid-card-resolution reconciliation (events flush at frame boundaries only).
- ❌ Voice chat (out of scope; users have Discord).
- ❌ PvP. The sequel doubles down on co-op identity. Optional duel mode could come later if there's demand.
- ❌ Microtransactions. Cosmetic boxes use earned in-game gold only.

---

## 13. TL;DR

> **Rogue Hero 2** is the same tempo-driven, deck-building roguelike, now with **up to 4 players in the same battle live**, **6 new visual biomes**, **4 new heroes**, **8 new enemies (incl. 3 bosses)**, **30+ new cards**, **shared Pact relics**, a **Group Tempo Resonance** mechanic that rewards coordination, and **host-authoritative WebRTC networking** built so it never feels laggy. Same vanilla-JS / Canvas / Electron stack, additive code architecture, no rewrite.
