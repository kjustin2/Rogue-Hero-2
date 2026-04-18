# Rogue Hero 2 — Multiplayer Backend Setup

This document is for **you, the project owner** — it lists the manual steps and dollar costs for turning the in-game lobby (which already collects room codes and shows the host/join UI) into a working remote co-op experience.

The game itself is **already wired** to do the right thing once a backend exists:

- `src/net/Net.js` is the single integration point. Everything else in the game (`HostSim`, `Reconcile`, `SnapshotEncoder/Decoder`, `Lobby`) is transport-agnostic.
- The lobby UI (char select → 🌐 REMOTE LOBBY) generates room codes via `Lobby.makeRoomCode()` and currently just shows them; once the backend is configured, the same buttons start a real session.

## Why a backend is needed at all

Rogue Hero 2 multiplayer uses **WebRTC DataChannels** for actual gameplay traffic — that's peer-to-peer, no server in the loop, very low latency. But two browsers cannot find each other on the open internet without help. They need:

1. **Signaling** — a tiny relay that lets P1 and P2 swap WebRTC SDP offers + ICE candidates. After this exchange (1–3 KB total per pair), the relay is no longer in the data path.
2. **STUN** — public Google STUN servers (`stun:stun.l.google.com:19302`) work for ~85% of NAT setups, free.
3. **TURN** *(optional)* — relay for the ~15% of users behind symmetric NAT or strict firewalls. Required for full reliability. Costs bandwidth.

The signaling backend is **the only thing you must host**. STUN is free; TURN is recommended but optional.

---

## Backend Options Compared

| Option | Setup time | Monthly cost (≤100 active rooms) | Monthly cost (~1000 rooms) | Reliability | Notes |
|---|---|---|---|---|---|
| **A. Cloudflare Workers + Durable Objects** | 1–2 hrs | **$0** (free tier) | **$5–10** | ★★★★★ | Best fit. Free tier handles thousands of signaling sessions. WebSocket Hibernation = pay only while active. |
| **B. Self-host on a small VPS (Hetzner / Fly.io)** | 2–3 hrs | **€4 / $5** | **€4 / $5** (flat) | ★★★★☆ | Predictable cost, full control. Tiny Node.js + `ws` server handles thousands of concurrent sockets. |
| **C. Trystero (free public BitTorrent trackers)** | 30 min | **$0** | **$0** | ★★★☆☆ | Drop-in WebRTC mesh, no infra. Public trackers occasionally rate-limit or go offline. |
| **D. PeerJS Cloud** | 30 min | **$0** | **$0** | ★★★☆☆ | Public broker, fine for hobby projects. No SLA, occasional downtime. |
| **E. Hosted realtime (Ably / Pusher / Pubnub)** | 1 hr | **$25** | **$50–200** | ★★★★★ | Easy SDKs, generous free tier *for messages* but RTC signaling burns through it fast. |
| **F. Daily.co / LiveKit / Agora** | 2 hrs | **$0** (small free tier) | **$50–500** | ★★★★★ | Way overkill — these are full SFU video stacks. Skip unless you also want voice chat. |

**My recommendation:** Start with **C (Trystero)** to ship multiplayer in 30 minutes with $0 infra. If you outgrow it, migrate to **A (Cloudflare)** for production. Skip B unless you specifically want a VPS.

---

## Cost Detail (per option)

### A. Cloudflare Workers + Durable Objects

Cloudflare's pricing as of 2026:

- **Workers Free**: 100k requests/day, 10ms CPU time per request. A signaling exchange is ~4 messages × 2 peers = 8 requests per join, so the free tier handles ~12,500 joins/day = ~400 active 30-minute rooms. Plenty for early-stage.
- **Workers Paid ($5/mo)**: 10M requests/mo + 1M Durable Object requests included. Past that, **$0.20 per million Workers requests** and **$0.20 per million DO requests**.
- **Durable Objects WebSocket Hibernation**: you pay for active WebSocket *time* only when messages flow. A typical lobby session bills ~30 seconds of duration. At $12.50/M GB-sec memory and 128MB DO instance, an idle hibernated room is effectively free.
- **TURN via Cloudflare Calls** (optional): 1000 free minutes/mo, then $0.05/GB egress. A 4-player run with full TURN relay uses ~3 MB/min — so $0.05/GB ≈ free for hundreds of runs/month.

**Realistic budget:** $0/mo for hundreds of nightly sessions; $5/mo gives you ~10× headroom; $25/mo would cover a successful indie launch.

### B. Self-host (Hetzner CX11 / CAX11 — ARM is cheaper)

- **Hetzner CAX11** (ARM): **€3.79/mo** — 2 vCPU, 4 GB RAM, 40 GB SSD, 20 TB egress. Lots of headroom for signaling.
- **Fly.io shared-CPU-1x**: **~$1.94/mo** at 256 MB, but you pay for bandwidth and they removed the always-free tier in 2024.
- **AWS Lightsail $3.50/mo**: 512 MB RAM — just barely enough for a Node + `ws` signaling server.

A single 256-MB instance running `ws` (Node.js WebSocket library) holds **5,000+ concurrent connections**. You will not outgrow this.

### C. Trystero (free, P2P discovery via BitTorrent trackers)

- **$0/mo, forever.** Uses public WebTorrent/Nostr trackers as the rendezvous point.
- Trade-off: trackers occasionally throttle, and there's no central authority you control. Fine for a free indie game; not great if uptime is contractual.
- Library: [`trystero`](https://github.com/dmotz/trystero) — actively maintained, ~15 KB gzipped.

### D. PeerJS Cloud broker

- **$0/mo.** Public broker hosted by the PeerJS project.
- Same caveats as C: no SLA, occasional downtime. Slightly easier API than raw WebRTC.

### E. Hosted realtime (Ably, Pusher, Pubnub)

- **Ably free tier:** 6M monthly messages, 200 peak concurrent. Each WebRTC handshake is ~6 signaling messages, so 6M = ~1M handshakes/mo. The 200-concurrent limit is the real cap — that's ~50 rooms at any moment.
- **Ably paid:** starts at $29/mo for 25M messages and unlimited peak concurrency.
- Easy SDKs, but you're paying for features (presence, history, push) you don't need for signaling.

### F. Daily.co / LiveKit / Agora

- These hand you a full SFU/MCU media server and bill per participant-minute.
- **LiveKit Cloud free tier:** 1500 participant-minutes/mo. After: $0.005/min = $0.30/hr per peer.
- **Agora:** $0.99 per 1000 minutes after the free 10k.
- Only worth it if you also want **voice chat** in-game. Otherwise massive overkill.

---

## Recommended Path (Step-by-Step)

### Path 1 — Ship in 30 minutes with Trystero (option C)

Cost: **$0**. No infrastructure to set up.

1. From the `Rogue-Hero-2/` folder:
   ```bash
   npm install trystero
   ```
   Note: this game has no bundler, so you'll need to either (a) drop in a pre-bundled IIFE build of trystero into `src/net/`, or (b) introduce a tiny build step. For an Electron-only build you can also use Node `require` directly.

2. Replace the body of `src/net/Net.js` with a thin wrapper around Trystero. Keep the same public API (`connect`, `sendUnreliable`, `sendReliable`, `on`, `disconnect`):
   ```js
   import { joinRoom } from 'trystero';
   const config = { appId: 'rogue-hero-2' };

   export class Net {
     constructor(opts = {}) {
       this.role = opts.role || 'solo';
       this.handlers = new Map();
       this.peers = new Map();
       this.localPeerId = Math.random().toString(36).slice(2, 10);
     }
     async connect(roomCode) {
       if (this.role === 'solo') return;
       this.room = joinRoom(config, roomCode);
       const [sendSnap, getSnap] = this.room.makeAction('snap');
       const [sendEvt,  getEvt]  = this.room.makeAction('evt');
       this._sendSnap = sendSnap; this._sendEvt = sendEvt;
       getSnap((p, peerId) => this._dispatch('snap', p, peerId));
       getEvt((p,  peerId) => this._dispatch('evt',  p, peerId));
       this.room.onPeerJoin(id => this.peers.set(id, {}));
       this.room.onPeerLeave(id => this.peers.delete(id));
       this.connected = true;
     }
     sendUnreliable(ch, p) { if (ch === 'snap') this._sendSnap?.(p); }
     sendReliable(ch, p)   { if (ch === 'evt')  this._sendEvt?.(p); }
     on(channel, fn) { /* unchanged */ }
     _dispatch(channel, msg, peerId) { /* unchanged */ }
     disconnect() { this.room?.leave(); this.connected = false; }
   }
   ```

3. That's it. The lobby UI, `HostSim.tick`, `Reconcile`, etc. all work unchanged.

### Path 2 — Production-grade with Cloudflare Workers (option A)

Cost: **$0 to start, $5/mo at scale**. Setup time: 1–2 hours.

1. Sign up for Cloudflare (free), install Wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Create a new Worker:
   ```bash
   wrangler init rogue-hero-signal --type=javascript
   cd rogue-hero-signal
   ```

3. Edit `wrangler.toml`:
   ```toml
   name = "rogue-hero-signal"
   main = "src/index.js"
   compatibility_date = "2026-01-01"

   [[durable_objects.bindings]]
   name = "ROOMS"
   class_name = "Room"

   [[migrations]]
   tag = "v1"
   new_sqlite_classes = ["Room"]
   ```

4. Implement `src/index.js` — a Durable Object per room that relays SDP/ICE between peers. ~150 lines. Reference: [Cloudflare WebSocket Hibernation docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

5. Deploy:
   ```bash
   wrangler deploy
   ```
   You get a URL like `https://rogue-hero-signal.YOUR-NAME.workers.dev`.

6. In `Rogue-Hero-2/src/main.js`, change:
   ```js
   const net = new Net({ role: 'solo' });
   ```
   to:
   ```js
   const net = new Net({ role: 'solo', signalUrl: 'wss://rogue-hero-signal.YOUR-NAME.workers.dev/ws' });
   ```

7. In `Rogue-Hero-2/src/net/Net.js`, fill in `connect(roomCode)` to (a) open a WebSocket to `signalUrl?room=ROOMCODE`, (b) exchange WebRTC SDP/ICE through it, (c) populate `this.peers` once the DataChannels open. ~200 lines.

8. Optional: enable Cloudflare Calls for free TURN — toggle in dashboard, no code change.

### Path 3 — VPS self-host (option B)

Cost: **€4/mo flat**. Setup time: 2–3 hours.

1. Provision a Hetzner CAX11 (Frankfurt or Ashburn).
2. Install Node 22, clone a tiny WebSocket relay (~80 lines using `ws`).
3. `pm2 start signal.js` to keep it running.
4. Point a subdomain (`signal.yourdomain.com`) at the box and put Caddy in front for free TLS.
5. Wire `Net.connect()` against `wss://signal.yourdomain.com/ws?room=...`.

---

## TURN (optional but recommended)

Without TURN, ~10–15% of players (corporate networks, restrictive carriers, dorm Wi-Fi) cannot connect to a host. Options:

| TURN provider | Cost | Notes |
|---|---|---|
| **Cloudflare Calls** | 1000 free min/mo, then $0.05/GB egress | If you're already on Cloudflare, this is the obvious pick. |
| **Twilio Network Traversal Service** | $0.40/GB | Reliable, well-documented. |
| **Self-host coturn** | Bandwidth on your VPS only | Coturn is the canonical open-source TURN server. Hetzner gives 20 TB egress free with the €4 box. |
| **Metered.ca free tier** | 50 GB/mo free | Easy if you just want a credentials endpoint. |

A single 4-player run uses ~3 MB/min of TURN traffic *only when used*. At 50 GB free, that's ~17,000 player-minutes — easily covers thousands of casual sessions.

---

## Where the in-game UI lives now

For reference, here's what already works inside the game:

- **🌐 REMOTE LOBBY button** — char-select screen, top-left next to MAIN MENU.
- **Lobby state (`gameState === 'lobby'`)** — three sub-modes:
  - `menu` — HOST GAME / JOIN GAME choice.
  - `hosting` — shows the 6-character room code huge, lists up to 4 player slots.
  - `joining` — 6-slot text input field, accepts `A–Z` + `2–9` (Crockford-style alphabet, no confusing chars), BACKSPACE/ENTER.
- **Status line** — currently displays "⚠ Signaling backend not configured. See MULTIPLAYER_SETUP.md" until `Net.connect()` actually completes a handshake.

You only have to deliver a working `Net.connect()` and `Net.peers`. Everything else (snapshot encoding, host-authoritative sim, client prediction, reliable event forwarding) is already wired.

---

## TL;DR

| If you want to… | Do this |
|---|---|
| Ship multiplayer this afternoon for $0 | Trystero (Path 1) |
| Build something you can launch a paid game on | Cloudflare Workers (Path 2) |
| Keep everything on one bill / want a learning project | VPS (Path 3) |
| Add voice chat too | LiveKit Cloud |

Cost summary at "successful indie game" scale (≈500 nightly co-op rooms):

- Trystero: **$0/mo** (with caveat: relies on public trackers)
- Cloudflare Workers: **$5–10/mo**
- Hetzner VPS: **€4/mo**
- Ably: **$29–49/mo**

All of these are well below the price of one cup of coffee per week.
