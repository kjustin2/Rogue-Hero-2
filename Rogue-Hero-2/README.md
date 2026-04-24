# Rogue-Hero 2

Tempo-driven roguelike deck builder on HTML5 Canvas + vanilla JavaScript. No dependencies, no build step. Single-player, **local 2-player co-op**, or up to **4-player remote co-op** over WebRTC.

**Tempo** is the core 0–100 resource: attacking and killing raises it, dodging lowers it, decay pulls it toward 50 at rest. Hot tempo = more damage but tighter risk; hit 100 or 0 and you crash.

## How to Play (Dev Mode)

Serve the project root with any local web server, e.g.:

```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

Or run it as a desktop app via the Electron wrapper:

```bash
npm install
npm start
```

## Debug Mode

The game exposes a scriptable debug surface on `window._dev` as soon as the page boots (see `src/DevConsole.js`). Everything below runs inside the browser's **DevTools Console**.

**Opening the DevTools Console:**

| Environment | Shortcut |
|---|---|
| Chrome / Edge / Brave / Firefox (Windows, Linux) | `F12` or `Ctrl+Shift+I`, then click **Console** |
| Chrome / Edge / Safari (macOS) | `Cmd+Option+I` (Safari: enable "Show Develop menu" in Settings → Advanced first), then click **Console** |
| Electron desktop app (`npm start`) | `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS), or from the top-menu **View → Toggle Developer Tools** |
| Mobile Chrome | `chrome://inspect` on desktop Chrome with the device USB-connected |

Type `_dev` and press Enter to confirm the surface is loaded — you should see an object with `ready: true`.

**In-game debug overlays** (work without opening the console):
- `Ctrl+N` — network HUD (role, peer count, in/out bytes, rate, last 8 reliable events)
- `Ctrl+P` — per-frame profile overlay
- `F2` — toggle local 2-player co-op (also a button in the top-right of char select)

**Common `_dev` commands** — paste into the console:

```js
// ── Start / skip screens ──────────────────────────────────────────
_dev.startRun('blade', 0, 12345);        // char, difficulty (0-3), seed
_dev.startCoopRun('frost', 0, 777);      // same, but local 2P enabled

// Jump the game state machine anywhere
_dev.setGameState('map');                // 'intro','charSelect','map','playing',
                                         // 'prep','draft','itemReward','shop',
                                         // 'upgrade','event','rest','stats','victory'

// Jump to a specific floor on the run map
_dev.setFloor(4);                        // set current floor (1-5)

// ── Skip directly to any boss ─────────────────────────────────────
_dev.listBosses();                       // list all 9 boss IDs
_dev.bossArena('boss_brawler', 1);       // floor-1 boss
_dev.bossArena('boss_conductor', 2);     // floor-2 boss
_dev.bossArena('boss_necromancer', 3);   // floor-3 boss
_dev.bossArena('boss_archivist', 3);     // Act-3 secret boss
_dev.bossArena('boss_aurora', 5);        // RH2 final boss

// ── Skip directly to a specific enemy fight ───────────────────────
_dev.listEnemies();                      // all 30+ enemy class IDs
_dev.spawnEnemy('tether_witch', 600, 300);
_dev.spawnEnemy('iron_choir', 400, 400);
_dev.killAll();                          // kill everything in the current room
_dev.clearRoom();                        // advance past combat to the draft/map

// ── Combat / player helpers ───────────────────────────────────────
_dev.godmode(true);                      // pin HP at max each frame
_dev.setMaxHp(9999);
_dev.setHp(5);                           // force low HP (test Last Rites, etc.)
_dev.setAp(10);                          // fill AP pool
_dev.setTempo(95);                       // jump tempo zone (0=cold, 50=flow, 90=critical, 100=auto-crash)
_dev.forceVictory();                     // jump straight to the win screen

// ── Card / relic helpers ──────────────────────────────────────────
_dev.listCards();                        // every card ID in the registry (~191)
_dev.cardTypes();                        // distinct card types (melee, shot, trap, etc.)
_dev.firstCardOfType('sigil');           // one card ID per type
_dev.grantCard('frenzy');                // add to deck
_dev.playCard('frenzy', { x: 800, y: 400 });  // execute at a cursor position
_dev.listItems();                        // every relic ID (~33)
_dev.grantRelic('berserker_heart');
_dev.grantAllRelics();                   // grant every relic at once

// ── Introspection ─────────────────────────────────────────────────
_dev.snapshot();                         // { gameState, player, enemies, ... }
_dev.stateHash();                        // deterministic state digest (8-hex)
_dev.stateSnapshot();                    // canonical state dict (what the hash covers)
_dev.worldCounts();                      // { traps, orbs, echoes, sigils, ... }
_dev.playersSnapshot();                  // per-player summary (hp/coopMode/halo) in local 2P
_dev.eventListenerCounts();              // EventBus listener counts — leak detection
_dev.errors;                             // runtime errors the harness captured

// ── Multiplayer bypass (skips the lobby UI) ───────────────────────
const code = await _dev.mpHost({ difficulty: 0 });
// …open another browser or profile (npm run mp spawns 4 Chrome profiles) and run:
await _dev.mpJoin(code);
_dev.peerCount;                          // 3 means full mesh in a 4-peer game
_dev.netRole;                            // 'host', 'client', or 'solo'

// ── RNG trace — pinpoint where two peers diverge ──────────────────
_dev.rngTraceStart();
// … reproduce the behaviour on both peers …
_dev.rngTrace();                         // [{ v, s, c }, …] per consumption

// ── Net record/replay — capture a reproducer for a live desync ────
_dev.netRecordStart();
// … reproduce the bug …
const trace = _dev.netRecordStop();      // save via JSON.stringify(trace)
// On a fresh instance:
_dev.netPlayback(trace);
```

The full API surface (~60 methods) is documented inline in `src/DevConsole.js`.

## Automated Tests

The repo has two test layers. Run both with `npm test && npm run test:smoke`.

### Node test suites (transport + snapshot unit tests)

Fast — run without a browser. Cover WebRTC transport behaviour, snapshot encoding, host/client event routing, damage batching, and RNG determinism.

```bash
npm test
```

Runs these in order:
- `mp-smoke.mjs` — 33 checks: 1P solo + Net.js API contract
- `mp-disconnect-test.mjs` — 132 checks: 1:1 host↔client disconnect + reconnect
- `mp-4player-test.mjs` — 50 checks: 4-peer mesh, lobby bookkeeping, fan-out
- `mp-desync-test.mjs` — 35 checks: binary snapshot round-trip, DAMAGE_BATCH coalescing, RNG trace divergence

Run any file directly if you only want one suite: `node mp-4player-test.mjs`.

### Playwright suites (in-browser integration tests)

Drives the real game in headless Chromium via `window._dev`. Python HTTP server autostarts on port 8765.

```bash
npm run test:smoke           # all specs, headless, ~2 minutes
npm run test:smoke:headed    # watch the tests drive a visible browser
npm run test:smoke:ui        # interactive Playwright UI
```

Specs in `tests/`:
- `smoke.spec.js` — boot, per-character run, per-boss spawn+tick+kill, card/relic grant, victory path
- `boss-mechanics.spec.js` — phase transitions, EventBus listener-leak detection, boss-specific mechanics
- `coop-local.spec.js` — local 2P setup, downed/revive flow, shared deck
- `card-execution.spec.js` — every card type executes (not just grants) without throwing; AP deduction + world-array side effects
- `room-transition.spec.js` — traps/orbs/echoes/sigils/projectiles cleared on room change, per-room player state reset
- `mp-desync.spec.js` — 4-peer determinism, `stateHash()` + `rngTrace()` parity, diff attribution
- `mp-scenarios.spec.js` — targeted scenarios: difficulty threading, multi-floor walk, relic/card grant parity
- `mp-live.spec.js` — live WebRTC via Cloudflare signaling (handshake, fan-out, disconnect, state parity)
- `net-event-race.spec.js` — PLAYER_REVIVED / PLAYER_DOWNED idempotency, SPAWN_ORBS owner routing

Run one spec: `npx playwright test -c tests/playwright.config.js tests/boss-mechanics.spec.js`.

Run one test within a spec: add `-g "listener leak"`.

**Note on `mp-live.spec.js`:** this talks to the real Cloudflare signaling worker and depends on the public STUN/TURN servers, so it's expected to be flakier than the rest. The suite auto-skips if the signaling server is unreachable (`_dev.mpPreflight()`).

### Syntax check

```bash
npm run syntax
```

Parses every `src/**/*.js` file with Node's acorn. All 32 files must report OK. Useful as a fast gate before running the heavier test suites.

## Testing Remote Co-op Locally (1–4 Players)

Simulate multiple remote peers on a single machine. Each peer needs its own Chrome profile so WebRTC identity and localStorage stay distinct.

```bash
# Terminal 1 — dev server
npm run serve

# Terminal 2 — launch 4 tiled Chrome windows, each a separate peer
npm run mp
```

- Default: 4 windows at `http://localhost:8000`, tiled 2×2 at 960×540.
- Different count: `npm run mp -- 2` (two windows) or up to 8.
- Different port: `npm run mp -- 4 9000`.
- Chrome not auto-detected? Set `CHROME_PATH=/path/to/chrome` (or `msedge.exe`) and retry.

In the game, the first window hosts ("Remote Co-op" → "Host Game"), grabs a 6-char room code, and the other three join with it. Profiles live in `%TEMP%\rh2-mp-p1` … `rh2-mp-p4`; delete them anytime to reset.

## How to Package for Distribution

The game ships as standalone installers for Windows / macOS / Linux via Electron:

1. Install [Node.js](https://nodejs.org/).
2. `npm install`
3. `npm run dist` (or `npm run dist:mac` / `npm run dist:linux`)

Installers land in `dist/`.

## How Others Can Play

- **Desktop build** — share the installer from `dist/` (e.g. the Windows `.exe`). No browser or prerequisites needed.
- **Web (itch.io, etc.)** — zip the project folder (excluding `node_modules/` and `dist/`) and upload as an HTML5 game.

## Controls

| Input | Action |
|---|---|
| Click / Any Key | Start from Menu |
| WASD | Move |
| Mouse | Aim |
| Left click | Combo Attack (auto-aims if close) |
| Right click | Heavy Strike (charge-up arc) |
| Space | Dodge (free at Cold, −5 at Hot, locked at Critical) |
| 1 – 4 | Play card from hand |
| F | Manual Tempo Crash (85+ Tempo only) |
| R | Restart (Dead / Win only) |
| **2P CO-OP button** (top-right of char select, or **F2**) | Toggle local 2-player co-op |

### Player 2 (local co-op)

| Input | Action |
|---|---|
| Arrow keys | Move |
| I / J / K / L | Aim reticle (up / left / down / right) |
| U | Fire / attack |
| O | Dodge |
| 7 / 8 / 9 / 0 | Play card from shared hand (slots 1–4) |

Downed allies can be revived by standing next to them — the run ends only when *all* players are downed or dead.

See `CLAUDE.md` for architecture and integration hooks.
