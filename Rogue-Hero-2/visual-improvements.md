# Visual Improvement Ideas — Low-Cost, High-Impact

Each item here is chosen to respect the engine's existing performance budget:
`PARTICLE_CAP = 400`, cached overlays, shared batch maps, squared-distance
comparisons, pooled projectile trail slots, and the single `drawImage` room
blit. Nothing below introduces unbounded allocation, per-frame layer blurs, or
sqrt-in-hot-loops.

---

## Tier 1 — Ship These First (best ratio of impact to risk)

### 1. Rim-light pass on the player sprite
A single additive `globalCompositeOperation = 'lighter'` stroke on the outline,
colored by current tempo zone (cold = cyan, flowing = white, hot = orange,
crit = magenta). Reuses colors already defined in `tempo.js`. Cost is one
stroked arc per player per frame — negligible. Sells the zone change without
requiring the player to read the bar.

### 2. Tempo-bar liquid wobble
Already a filled rect. Add a sin-wave vertical offset (2 px amp, 2 Hz) to
the top edge using `quadraticCurveTo` with 6–8 control points. Cost is one
path per frame. When in CRITICAL, ramp amplitude to 4 px and add a 0.06 alpha
pulsing glow behind it. Makes the bar feel alive at high tempo — which is
exactly when the player is risking a crash.

### 3. Hit-stop "impact freeze" VFX overlay
The engine already freezes logic dt during hit-stop. Piggyback on that window
to draw a single white radial flash (~2 frames) centered on the hit location,
~32 px radius, alpha ramping 0.8 → 0. It reads as "crunch" without any extra
audio. One cached radial gradient, rebuilt only on resize.

### 4. Enemy death dissolve
Currently enemies vanish. Replace with a 0.18 s shader-free "dissolve":
during `_dying`, draw the enemy with `globalAlpha = t` **plus** 6–10 small
pooled particles spawned outward (using `_pushParticle`, so they respect the
cap). Same lifetime as existing death delay, so no state-machine changes.

### 5. Card-slot "ready to cast" pulse
When the active card is affordable AND the player is in range of at least
one enemy, pulse the slot border alpha at 3 Hz. Uses `performance.now()`
directly — no state to track. One extra strokeRect call per hand slot. Cue
that reduces the "why isn't my card working" confusion without a tutorial.

### 6. Ambient dust motes per biome
Each biome in `Biomes.js` already has a palette. Allocate a fixed array of
40 dust particles at biome-enter, update positions analytically (slow
sinusoidal drift — no rebuild, no push/pop), and draw as 1-px circles with
the biome's accent color at 0.15 alpha. Fixed-size array, no GC, no cap
pressure. The room is currently static between combat — this sells motion.

### 7. Parallax floor grid offset on screen-shake
The cached grid background already exists as a single `drawImage`. When
`shakeOffsetX/Y` is nonzero, blit the grid at `(shakeOffsetX * 0.4,
shakeOffsetY * 0.4)` to parallax it behind the actors. Zero new draws, just
an offset change. Massively punches up the feel of heavy hits.

### 8. Damage-number clustering
`Particles.js` manages floating text. When two damage numbers spawn within
~14 px and ~80 ms, collapse them into one and add the values — render larger
with a subtle yellow tint. Reduces visual noise during rapid combos and
makes big hits pop. Pure bookkeeping, no new draws.

---

## Tier 2 — Worth Doing (moderate work, solid payoff)

### 9. Tempo-reactive vignette tint
`drawVignette()` currently caches a neutral dark gradient. Rebuild it once
per tempo-zone change instead of once per resize. Cold → faint blue edges,
Hot → faint orange, Crit → faint magenta. Still exactly one `drawImage` per
frame; the rebuild is infrequent (zone transitions only).

### 10. Screen-edge chromatic aberration sustain during CRIT
`drawCAFlash()` already exists, triggered on crashes/heavy hits. Add a
continuous low-intensity version while tempo >= 90 (0.06 alpha instead of
0.38, using the same cached gradients). Visually cues "you're in the danger
zone" without another HUD element. No extra objects allocated.

### 11. Card-play "card fly" animation
When a card resolves, tween its ghost from the hand slot toward the click
point over ~0.15 s, scaled down to 0.4 with fading alpha. One `drawImage`
of the already-rendered card face per active tween (max 4 concurrent —
bounded by hand size). Gives the cards weight. Tween state lives in a
fixed-size pool, reset on room change.

### 12. Dodge after-image ghosts
During `player.dodging`, snapshot the player's sprite to 3 offset ghosts
behind the motion vector, fading over 0.25 s. The player sprite is already
a simple procedural shape — just redraw it 3 times with decreasing alpha
at historical positions from a 4-slot ring buffer. Bounded, no allocation.
Sells the i-frames visually.

### 13. Enemy telegraph "inner glow" pre-windup
Several enemies wind up with a shout/flash before a big attack. Add a
radially-inward alpha pulse (outer ring, shrinking) during the windup
window using a pre-built radial gradient cached per-enemy-type. One extra
`fillRect` with gradient fill per telegraphing enemy. Teaches the player
the tell without slowing combat.

### 14. Projectile "comet" gradient
The trail system already pre-allocates slots. Swap each trail dot's flat
fill for a tiny linear gradient from fully-opaque (head) to transparent
(tail). One gradient object per projectile type, cached at spawn. Still
one `fillRect` per slot — same draw count, much more readable.

### 15. Biome-specific floor pattern overlay
Currently the grid cache is the same everywhere. Extend `_buildGridCache`
to sample the biome palette: verdant gets subtle leaf specks, frostforge
gets ice-crack lines, voidline gets flickering constellation dots (drawn
once into the cache, not animated — so still zero per-frame cost). Doesn't
lag because it's burned into the pre-rendered offscreen canvas that gets
blitted whole.

### 16. HP-bar segmentation at key thresholds
Mark 25/50/75% tick lines on the HP bar. When HP crosses a threshold
downward, flash the tick red for 0.2 s. Single `fillRect` per tick. Gives
the player a precise sense of "how bad is it" that a smooth bar obscures.

---

## Tier 3 — Polish Layer (cheap but nice)

### 17. Soft shadow beneath each entity
One elliptical gray fill at `(x, y + r)` with 0.25 alpha, radius ≈ entity
radius × 1.1. Grounds the sprites so they don't look like they're floating
on a pattern. ~1 extra draw per entity; well under budget.

### 18. Relic icon glow on proc
When a relic's effect fires (already signaled via EventBus), pulse a 0.35 s
additive glow behind its HUD icon. The event listener already exists — add
a `_procGlowTimer` field per relic. One extra draw per active glow.

### 19. Hand-reveal flourish on room enter
When combat starts, stagger the hand-slot fade-in by 40 ms per slot (left
to right). Pure alpha tween, no new draws. Teaches rhythm — and it makes
entering a room feel like something.

### 20. Tempo-crash screen sliver
On `CRASH` (either direction), flash a full-width horizontal 3-px bar
across the canvas at eye level for 0.12 s, in the crash color (cyan for
cold, red for auto). Uses the existing screenEffects array. Massive
"something happened" cue.

### 21. Pillar depth shading
`room.js` draws pillars as flat shapes. Add a single linear-gradient fill
(top-down, lighter top / darker bottom) cached once per room. Pillars get
a 3D feel at effectively zero cost — gradient lives in the grid cache.

### 22. Cursor context aura
`drawCursor()` draws a static crosshair. Tint it by the currently selected
card type: red for melee, cyan for projectile, yellow for utility, etc.
One color lookup per frame from a tiny map keyed by card type.

### 23. Minimap pulse for boss node
On the map screen, the boss node currently sits static. Pulse its radius
0.9× ↔ 1.1× with a sin wave, and pulse alpha of a red ring around it.
Single drawn node, no extra cost. Tells the player "that's the goal."

### 24. Particle trail-wake from fast movement
When `player.speed > threshold` (from Hot tempo or a dash card), emit 1
trail particle every 3 frames (not every frame — the cap can handle this
density easily). Visible motion streak during high-tempo play.

### 25. Down-state visual weight
The downed player overlay could add a slow red radial pulse at low alpha
behind the player. Pre-cache the radial gradient; draw one `fillRect` per
downed player per frame while downed. Makes the urgency obvious to allies
across the room.

---

## What I'd Deliberately Skip

- **Per-frame canvas filters** (`ctx.filter = 'blur(…)'` outside the existing
  bloom pass). These stall the GPU on integrated cards — the bloom pass
  already uses one, adding more compounds the cost.
- **Full-screen distortion shaders.** Not possible in 2D canvas without
  copying the entire framebuffer back and repainting — a recipe for stutter.
- **Lit volumetric fog layers.** Tempting but a real allocation hog unless
  pre-baked; the ambient dust motes idea above gets 80% of the feel for 5%
  of the cost.
- **Per-enemy normal-mapped shading.** Needs offscreen buffers per enemy
  type; not worth it for procedural circle-and-triangle enemies.
- **Uncapped particle showers on crashes.** The existing `spawnCrashBurst`
  already respects `_pushParticle` — keep it that way; any "make the crash
  juicier" idea should raise particle *intensity per particle* (radius,
  alpha, lifetime) rather than count.

---

## Implementation Order I'd Suggest

1, 2, 3, 7, 20 — free juice, mostly in `Renderer.js` and `tempo.js`.
Then 6, 12, 15 for biome/movement identity.
Then 11, 13, 16 for gameplay-legibility wins.
Remaining items as polish passes between larger features.
