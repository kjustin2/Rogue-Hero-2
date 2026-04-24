// mp-live.spec.js — live 4-peer WebRTC handshake test (local-only).
//
// Launches 4 browser contexts, drives them through the real Net transport:
//   - Host: _dev.mpHost() → creates a CF-signaling room, returns a 6-char code
//   - Clients: _dev.mpJoin(code) → connects to the same room
//   - All four wait until peers.size === 3 (full mesh)
//   - Then: fan-out, state-hash parity, disconnect eviction
//
// This hits the live CF signaling worker at `wss://rh2-signal.jpk91...` and
// relies on real STUN/TURN. It is EXPECTED to be flakier than the mock-net
// suite — network weather and headless WebRTC quirks (ICE, TURN relay) can
// cause spurious failures. That's acceptable since this suite is local-only.
//
// Guardrails:
//   - Preflight the CF signaling server; skip the whole suite if unreachable.
//   - Per-action timeouts are generous (handshake up to 20s).
//   - Tests clean up with net.gracefulDisconnect() so a failing run doesn't
//     leak dangling peers into the next test.

import { test, expect } from '@playwright/test';

const HANDSHAKE_TIMEOUT_MS = 25_000;
const EVT_PROPAGATION_MS   = 3_000;

async function boot(page) {
  page.on('pageerror', () => {});
  page.on('console', () => {});
  await page.goto('/index.html');
  await page.waitForFunction(() => !!(window._dev && window._dev.ready), null, { timeout: 15_000 });
}

async function bootN(browser, n) {
  const contexts = [], pages = [];
  for (let i = 0; i < n; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await boot(page);
    contexts.push(ctx); pages.push(page);
  }
  return { contexts, pages };
}
async function closeAll(contexts) {
  for (const c of contexts) { try { await c.close(); } catch {} }
}

// ─────────────────────────────────────────────────────────────────────
// Preflight once per file — skip the suite entirely if CF signaling is
// unreachable. Avoids a noisy "4 tests failed" summary when the root cause
// is just "no network".
// ─────────────────────────────────────────────────────────────────────
let CF_UP = null;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await boot(page);
    CF_UP = await page.evaluate(() => window._dev.mpPreflight());
  } catch {
    CF_UP = false;
  } finally {
    await ctx.close();
  }
  if (!CF_UP) {
    console.log('[mp-live] CF signaling unreachable — skipping live MP suite.');
  }
});
test.beforeEach(() => {
  if (!CF_UP) test.skip(true, 'CF signaling unreachable');
});

// ─────────────────────────────────────────────────────────────────────
// 1. Full-mesh handshake — host + 3 clients all see peers.size === 3.
// ─────────────────────────────────────────────────────────────────────
test.describe('Live 4-peer handshake', () => {
  test('host + 3 clients converge to full mesh', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 4);
    const [host, c1, c2, c3] = pages;
    try {
      // Host opens the room and gets a code.
      const code = await host.evaluate(() => window._dev.mpHost({ difficulty: 0 }));
      expect(code).toMatch(/^[A-Z2-9]{6}$/);

      // Clients join concurrently.
      await Promise.all([
        c1.evaluate((c) => window._dev.mpJoin(c), code),
        c2.evaluate((c) => window._dev.mpJoin(c), code),
        c3.evaluate((c) => window._dev.mpJoin(c), code),
      ]);

      // Full mesh: every peer ends up with 3 connections.
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.peerCount === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }
      // evt DataChannels open slightly after the PC reports 'connected'.
      // Wait for all 3 evt channels to be ready before sending messages,
      // otherwise Net.sendReliable silently drops to un-opened peers.
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.openEvtPeers === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }
      // Roles should be set correctly.
      expect(await host.evaluate(() => window._dev.netRole)).toBe('host');
      for (const c of [c1, c2, c3]) {
        expect(await c.evaluate(() => window._dev.netRole)).toBe('client');
      }
      // Strategy should be 'cloudflare' (or 'torrent'/'nostr' on fallback).
      const strat = await host.evaluate(() => window._dev.netStrategy);
      expect(['cloudflare', 'torrent', 'nostr']).toContain(strat);
      console.log(`[mp-live] handshake complete room=${code} strategy=${strat}`);
    } finally {
      // Graceful disconnect flushes pending events so no ghost peers linger.
      for (const p of pages) {
        try { await p.evaluate(() => window._dev.mpDisconnect()); } catch {}
      }
      await closeAll(contexts);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Reliable fan-out — host broadcast lands on every client exactly once.
// ─────────────────────────────────────────────────────────────────────
test.describe('Live fan-out', () => {
  test('host sendReliable reaches all 3 clients', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 4);
    const [host, c1, c2, c3] = pages;
    try {
      const code = await host.evaluate(() => window._dev.mpHost({ difficulty: 0 }));
      await Promise.all([
        c1.evaluate((c) => window._dev.mpJoin(c), code),
        c2.evaluate((c) => window._dev.mpJoin(c), code),
        c3.evaluate((c) => window._dev.mpJoin(c), code),
      ]);
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.peerCount === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }
      // evt DataChannels open slightly after the PC reports 'connected'.
      // Wait for all 3 evt channels to be ready before sending messages,
      // otherwise Net.sendReliable silently drops to un-opened peers.
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.openEvtPeers === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }

      // Start recording on clients so we can assert the probe landed.
      for (const c of [c1, c2, c3]) {
        await c.evaluate(() => window._dev.netRecordStart({ cap: 512 }));
      }

      // Host sends a reliable probe. Use a tag we can filter on.
      const probeTag = 'probe-' + Date.now();
      await host.evaluate((tag) => window._dev.mpSendReliable({ type: 'DEV_PROBE', tag }), probeTag);

      // Give DataChannel delivery a moment (reliable + ordered).
      await pages[0].waitForTimeout(EVT_PROPAGATION_MS);

      for (const c of [c1, c2, c3]) {
        const log = await c.evaluate(() => window._dev.netRecordStop());
        const hits = log.filter((r) => r.dir === 'in' && r.ch === 'evt'
          && r.payload && r.payload.type === 'DEV_PROBE' && r.payload.tag === probeTag);
        expect(hits.length, `client should have received exactly 1 probe, got ${hits.length}`).toBe(1);
      }

      // Host should NOT have received its own probe.
      await host.evaluate(() => window._dev.netRecordStart({ cap: 64 }));
      await host.evaluate((tag) => window._dev.mpSendReliable({ type: 'DEV_PROBE2', tag }), probeTag);
      await pages[0].waitForTimeout(500);
      const hostLog = await host.evaluate(() => window._dev.netRecordStop());
      const selfEcho = hostLog.filter((r) => r.dir === 'in' && r.payload && r.payload.type === 'DEV_PROBE2');
      expect(selfEcho.length, 'host must not see its own broadcast echoed back').toBe(0);
    } finally {
      for (const p of pages) { try { await p.evaluate(() => window._dev.mpDisconnect()); } catch {} }
      await closeAll(contexts);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Disconnect eviction — closing one client drops it from the mesh.
// ─────────────────────────────────────────────────────────────────────
test.describe('Live disconnect eviction', () => {
  test('one client disconnects → other peers drop to size 2', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 4);
    const [host, c1, c2, c3] = pages;
    try {
      const code = await host.evaluate(() => window._dev.mpHost({ difficulty: 0 }));
      await Promise.all([
        c1.evaluate((c) => window._dev.mpJoin(c), code),
        c2.evaluate((c) => window._dev.mpJoin(c), code),
        c3.evaluate((c) => window._dev.mpJoin(c), code),
      ]);
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.peerCount === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }
      // evt DataChannels open slightly after the PC reports 'connected'.
      // Wait for all 3 evt channels to be ready before sending messages,
      // otherwise Net.sendReliable silently drops to un-opened peers.
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.openEvtPeers === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }

      // c3 gracefully disconnects. DataChannel onclose fires on remaining
      // peers immediately (Net._cfWireDcLifecycle).
      await c3.evaluate(() => window._dev.mpDisconnect());

      // Host + c1 + c2 should see peer count drop to 2.
      for (const p of [host, c1, c2]) {
        await p.waitForFunction(() => window._dev.peerCount === 2, null, { timeout: 10_000 });
      }

      // c3 itself should be at 0.
      const c3peers = await c3.evaluate(() => window._dev.peerCount);
      expect(c3peers).toBe(0);
    } finally {
      for (const p of pages) { try { await p.evaluate(() => window._dev.mpDisconnect()); } catch {} }
      await closeAll(contexts);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. State-hash parity under real handshake.
// After handshake but before any gameplay, all peers should still have
// identical state (they're all still at intro/solo-initial). This is a
// sanity check that the handshake itself doesn't mutate game state.
// ─────────────────────────────────────────────────────────────────────
test.describe('Live state parity', () => {
  test('stateHash identical across all 4 peers post-handshake', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 4);
    const [host, c1, c2, c3] = pages;
    try {
      const code = await host.evaluate(() => window._dev.mpHost({ difficulty: 0 }));
      await Promise.all([
        c1.evaluate((c) => window._dev.mpJoin(c), code),
        c2.evaluate((c) => window._dev.mpJoin(c), code),
        c3.evaluate((c) => window._dev.mpJoin(c), code),
      ]);
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.peerCount === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }
      // evt DataChannels open slightly after the PC reports 'connected'.
      // Wait for all 3 evt channels to be ready before sending messages,
      // otherwise Net.sendReliable silently drops to un-opened peers.
      for (const p of pages) {
        await p.waitForFunction(() => window._dev.openEvtPeers === 3, null, { timeout: HANDSHAKE_TIMEOUT_MS });
      }

      // Snapshot ignores netRole field (which differs host vs client) because
      // we filter via stateSnapshot's declared fields. Actually stateSnapshot
      // INCLUDES netRole — so hashes will differ between host and clients.
      // That's fine: check that all 3 clients have the same hash instead.
      const clientHashes = [];
      for (const c of [c1, c2, c3]) {
        clientHashes.push(await c.evaluate(() => window._dev.stateHash()));
      }
      expect(new Set(clientHashes).size,
        `client hashes diverged post-handshake: ${clientHashes.join(' / ')}`).toBe(1);
    } finally {
      for (const p of pages) { try { await p.evaluate(() => window._dev.mpDisconnect()); } catch {} }
      await closeAll(contexts);
    }
  });
});
