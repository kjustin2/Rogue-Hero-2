# Rogue-Hero 2

Roguelike RPG prototype built on HTML5 Canvas + vanilla JavaScript. No dependencies, no build step. Now with **local 2-player co-op** and a stub multiplayer transport for up to **4-player live co-op runs**.

## Mechanics

- **Tempo** — a 0–100 resource raised by attacking and killing, lowered by dodging, decaying toward 50 at rest. High Tempo = more damage, faster enemies, higher risk. Crashes at 100.

## How to Play (For Developers)

To run the game locally for development, you can use any local web server:

```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in a browser.

Or, if you have Node.js installed, you can use the Electron wrapper to play it like a native desktop app:

```bash
npm install
npm start
```

## How to Package the Game for Distribution

The game can be packaged into standalone executables/installers for Windows, macOS, and Linux using Electron.

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Install the necessary build dependencies:
   ```bash
   npm install
   ```
3. Build the executables:
   ```bash
   npm run dist
   ```
The built installers and executables will be placed in the `dist/` directory.

## How Others Can Play

### 1. Playing a Desktop Build
You can share the installers built in the `dist/` folder (such as the `.exe` file for Windows). Players simply download and run the installer to play the game natively on their computer, without needing a browser or any prerequisites.

### 2. Playing in a Web Browser (itch.io)
Since the game is purely HTML5 and Canvas-based, you can also host it on the web effortlessly. Zip up the project folder (excluding the `node_modules` or `dist` directories) and upload it to a game-hosting platform like **itch.io**. Select the HTML5/Browser option, and players will be able to play your game instantly without downloading anything.

## Controls

| Input | Action |
|---|---|
| Click / Any Key | Start from Menu |
| WASD | Move |
| Mouse | Aim |
| Left click | Combo Attack (Auto-aims if close) |
| Right click | Heavy Strike (Charge-up arc) |
| Space | Dodge (Free at Cold, -5 at Hot, Locked at Critical) |
| F | Manual Tempo Crash (85+ Tempo only) |
| R | Restart (Dead / Win only) |
| **2P CO-OP button** (top-right of char select) | **Toggle local 2-player co-op** |

### Player 2 (local co-op)

| Input | Action |
|---|---|
| Arrow keys | Move |
| I / J / K / L | Aim reticle (up / left / down / right) |
| U | Fire / attack |
| O | Dodge |
| 7 / 8 / 9 / 0 | Play card from shared hand (slots 1–4) |

When a co-op ally is reduced to 0 HP they go **downed** instead of dying — stand near them to revive. The run ends only when *all* players are downed or dead.

## What's New in RH2

- 4 new heroes (Pyre, Tide, Cog, Lumen) and 30+ new cards
- 8 new enemies including 3 new bosses (Hollow King, Vault Engine, Aurora)
- 6 biomes (Verdant, Frostforge, Cathedral, Tide, Voidline, Clockwork) with palette + hazard hooks
- **Group Tempo Resonance** — when allies share a tempo zone, the whole party gets +10% / +20% / +30% damage (2/3/4 players). Resonant Anchor relic boosts this further
- **Pact** card type and 6 Pact relics that scale with nearby allies
- Net infrastructure: snapshot encoding, host-authoritative simulation, client prediction, lobby with 6-char room codes (transport stub — wire WebRTC into `src/net/Net.js`)
- Spatial-hash grid for O(n+k) hitbox queries

See `CLAUDE.md` for the full architecture map and integration hooks.
