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
