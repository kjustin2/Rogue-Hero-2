# Rogue Hero 2 — Multiplayer Setup (Cloudflare Workers)

## Current Status

Trystero (BitTorrent tracker strategy) works for peer discovery but the WebRTC
ICE/NAT handshake fails between two real home networks — the trackers connect,
but the actual game data channel never opens.

**Solution:** Replace the tracker-based signaling with a Cloudflare Workers
Durable Object that relays WebRTC SDP/ICE messages directly, and keep the same
native WebRTC DataChannels for game traffic. The Worker is ~100 lines, always
free for our traffic volume, and eliminates the third-party dependency entirely.

---

## Architecture

```
Player A                   Cloudflare Worker                Player B
  |                        (rh2-signal)                       |
  |--- WebSocket join -------->  Room DO  <------- join -------|
  |<-- welcome: [peers] ------  (per room)                    |
  |                               |  <--- peer_joined --------|
  |--- offer SDP ------------->   |                           |
  |                               |------ offer SDP --------->|
  |                        <--- answer SDP -------------------|
  |<-- answer SDP ----------      |                           |
  |--- ICE candidates -------> relay  <--- ICE candidates ----|
  |                                                           |
  |<===================== WebRTC DataChannel ================>|
  |              (direct P2P — Worker no longer involved)     |
```

**Signaling** (tiny, through Worker): ~2 KB of SDP + a few ICE candidates per pair.  
**Game traffic** (DataChannels, fully P2P): snapshots at 15 Hz, events on demand.

---

## Part 1 — Manual Setup (you do this)

### Prerequisites

- Node.js 18+ installed (you have this — it runs Electron)
- A free Cloudflare account

### Step 1 — Create a Cloudflare account

Go to https://dash.cloudflare.com/sign-up and create a free account.
You do not need to add a domain or a credit card for this step.

### Step 2 — Install Wrangler (the CF deploy CLI)

In any terminal (not necessarily the game directory):

```bash
npm install -g wrangler
```

Verify:
```bash
wrangler --version
```

### Step 3 — Authenticate Wrangler with your account

```bash
wrangler login
```

This opens a browser window. Click **Allow**. You'll see
`Successfully logged in` in the terminal.

### Step 4 — Deploy the signaling Worker

The Worker code is already written at `workers/signaling.js` and the config
is at `wrangler.toml` in the project root. From the project directory:

```bash
cd E:/Storage/SAAS/Rogue-Hero-2/Rogue-Hero-2
wrangler deploy
```

Expected output:
```
Total Upload: X.XX KiB / gzip: X.XX KiB
Uploaded rh2-signal (X sec)
Published rh2-signal (X sec)
  https://rh2-signal.YOUR_SUBDOMAIN.workers.dev
```

**Copy that URL.** You'll need it in Step 6.

> First deploy may show a migration prompt for the Durable Object:
> `Are you sure you want to apply these migrations? (y/n)` → type **y**.

### Step 5 — Set the Worker URL in Net.js

Open `src/net/Net.js` and find line 10:

```js
const CF_SIGNAL_URL = ''; // SET THIS after deploying workers/signaling.js
```

Replace the empty string with your Worker URL using `wss://` (not `https://`):

```js
const CF_SIGNAL_URL = 'wss://rh2-signal.YOUR_SUBDOMAIN.workers.dev';
```

Save the file.

### Step 6 — Test the Worker directly

Before running the game, verify the Worker is live:

```bash
curl https://rh2-signal.YOUR_SUBDOMAIN.workers.dev/
```

You should see: `RH2 Signal OK`

Also open `multiplayer-test.html` in two Electron windows and verify the
existing torrent path still works as a fallback (in case CF is ever unreachable).

---

## Part 2 — Code Changes (already done)

The following files have been updated. No further code changes needed once
you set `CF_SIGNAL_URL` in Step 6.

### `workers/signaling.js`

A Cloudflare Worker with a `Room` Durable Object that:
- Accepts WebSocket connections, one per player
- Routes `join` → `welcome` (list of existing peers) + `peer_joined` broadcasts
- Relays `signal` messages (SDP offers/answers, ICE candidates) between named peers
- Sends `peer_left` when a connection drops
- Uses Hibernatable WebSockets (zero cost when no messages flowing)

### `wrangler.toml`

Worker config binding `ROOMS` to the `Room` Durable Object class.

### `src/net/Net.js`

Updated transport layer:

1. **CF path (primary):** when `CF_SIGNAL_URL` is set, `connect()` opens a
   WebSocket to `CF_SIGNAL_URL/ROOMCODE`, exchanges SDP/ICE via the Worker,
   and builds native `RTCPeerConnection` + two DataChannels per peer:
   - `snap` — unordered, no retransmits (position snapshots)
   - `evt` — ordered, reliable (game events: kills, room transitions, etc.)

2. **Trystero torrent (fallback):** if `CF_SIGNAL_URL` is empty or the Worker
   is unreachable, falls back to the previous Trystero BitTorrent tracker path.
   This keeps the game playable while the CF Worker is being set up.

Public API is unchanged — `main.js`, `HostSim`, `Reconcile`, and `Lobby` need
no changes.

---

## Part 3 — Testing After Setup

### Quick verify (same machine, two windows)

1. `npm start` on your machine (two Electron windows, or one Electron + one browser).
2. Window A: Remote Co-op → **HOST GAME**. You should see:
   - The 6-char code displayed large
   - Status: `Connected (Cloudflare) — Share code XXXXXX`
   - `trackers: —` (no Trystero, CF path is active)
3. Window B: Remote Co-op → **JOIN GAME** → type the code → ENTER.
4. Both windows should show `🟢 Peer connected (1 total)` within ~5 seconds.

### Cross-machine verify

Same steps on two separate machines. Expect ~3–8 seconds for the WebRTC
ICE handshake (STUN) or ~8–15 seconds if TURN is required (symmetric NAT).

If one machine is behind very strict NAT and STUN doesn't work, see the
**TURN** section below.

### Check the Worker logs

```bash
wrangler tail
```

This streams live log output from the deployed Worker. You should see
messages like:

```
[Room ABC123] peer mLEzX4lj joined, 0 existing
[Room ABC123] relaying signal offer → Vm9UXIaFSY
[Room ABC123] peer Vm9UXIaFSY joined, 1 existing
[Room ABC123] relaying signal answer → mLEzX4lj
```

---

## Part 4 — TURN (if some players still can't connect)

Without a TURN server, ~10–15% of connections fail (corporate networks,
some ISPs, strict routers). The current config already includes the
**openrelay.metered.ca** free TURN as a fallback, which covers most cases.

If you want guaranteed reliability, add Cloudflare Calls TURN credentials:

1. In the Cloudflare dashboard → **Calls** → **Create application**.
2. Copy the `App ID` and generate a `Token`.
3. In `src/net/Net.js`, find `RTC_CONFIG.iceServers` and add:
   ```js
   {
     urls: 'turn:turn.cloudflare.com:3478',
     username: 'YOUR_APP_ID',
     credential: 'YOUR_TOKEN',
   },
   ```
4. Cloudflare Calls TURN: **1,000 free minutes/month**, then $0.05/GB.
   A 4-player hour through full TURN relay uses ~18 MB = essentially free.

---

## Part 5 — Maintenance

### Re-deploying after changes

```bash
wrangler deploy
```

### Viewing usage

Cloudflare dashboard → Workers & Pages → `rh2-signal` → **Analytics**.

### Teardown (stop billing)

```bash
wrangler delete rh2-signal
```

Then downgrade the Workers plan in the dashboard if you no longer need it.

### Wrangler version issues

If `wrangler deploy` fails with a schema error, update Wrangler:
```bash
npm install -g wrangler@latest
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl` to Worker returns 404 | Worker not deployed yet | Run `wrangler deploy` |
| Status shows "⚠ CF Worker unreachable" | Wrong URL or http:// instead of wss:// | Check CF_SIGNAL_URL is `wss://...`, not `https://...` |
| Peer joins but game data never arrives | DataChannel open race | Wait 2s after `peer joined` before sending — already handled in HostSim |
| Works same-machine, fails cross-machine | Symmetric NAT, no TURN | Add Cloudflare Calls TURN credentials (see Part 4) |
| `wrangler deploy` asks for account ID | Not logged in | Run `wrangler login` |
| DO migration prompt | First deploy only | Type `y` to apply |
| Game falls back to torrent after CF set | CF_SIGNAL_URL typo or Worker crashed | Check URL, run `wrangler tail` for errors |
