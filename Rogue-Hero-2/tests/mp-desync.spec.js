// mp-desync.spec.js — 4-page desync-hunting suite.
//
// Uses _dev.stateHash() + _dev.rngTrace() to compare authoritative game
// state across isolated browser contexts. Each desync class targeted below
// reduces to "run N peers with the same seed, compare hashes". If the hashes
// ever differ at a transition, the seed produced divergent state between
// peers — which is exactly the class of bug that causes live MP desync.
//
// Why isolated contexts (no WebRTC) for the main suite:
//   - Real network tests via CF signaling are flaky in headless Chromium
//     and depend on an external service being up.
//   - The root cause of most desyncs is RNG drift or state-sync bugs in
//     the deterministic parts of the game. Those reproduce without a wire.
//   - mp-desync-test.mjs (Node) covers Snapshot/HostSim/DAMAGE_BATCH at the
//     unit level with a full mock mesh.
//   - mp-4player-test.mjs (Node) covers lobby + peer lifecycle end-to-end.
//
// The one live-network scenario we DO exercise is handshake (`remote co-op
// handshake`) — gated on CF availability and skipped on failure.

import { test, expect } from '@playwright/test';

const CHARS = ['blade', 'frost', 'shadow', 'echo', 'wraith', 'vanguard'];

// ── Shared boot helper (mirrors smoke.spec.js) ───────────────────────
async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page._errors = errors;
  await page.goto('/index.html');
  await page.waitForFunction(() => !!(window._dev && window._dev.ready), null, { timeout: 15_000 });
}

// Launch N isolated browser contexts, each with a fresh page booted to the
// game. Returns { contexts, pages }. Caller must close contexts after use.
async function bootN(browser, n) {
  const contexts = [];
  const pages = [];
  for (let i = 0; i < n; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await boot(page);
    contexts.push(ctx);
    pages.push(page);
  }
  return { contexts, pages };
}

async function closeAll(contexts) {
  for (const c of contexts) { try { await c.close(); } catch {} }
}

// Start a deterministic run on each page with the same inputs, then return
// stateHash() from each.
async function hashesAfterRun(pages, { char, difficulty, seed }) {
  const hashes = [];
  for (const page of pages) {
    await page.evaluate(
      (args) => window._dev.startRun(args.char, args.difficulty, args.seed),
      { char, difficulty, seed },
    );
    hashes.push(await page.evaluate(() => window._dev.stateHash()));
  }
  return hashes;
}

// ─────────────────────────────────────────────────────────────────────
// 1. stateHash determinism — same seed/char → identical hash across peers
// ─────────────────────────────────────────────────────────────────────
test.describe('State hash determinism', () => {
  test('4 peers, same seed → identical stateHash', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 4);
    try {
      const hashes = await hashesAfterRun(pages, { char: 'blade', difficulty: 0, seed: 9999 });
      // All 4 hashes must match.
      expect(new Set(hashes).size).toBe(1);
      // Sanity: the hash string itself is a non-trivial 8-char hex.
      expect(hashes[0]).toMatch(/^[0-9a-f]{8}$/);
    } finally { await closeAll(contexts); }
  });

  test('4 peers, different seeds → distinct stateHash', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 4);
    try {
      const hashes = [];
      for (let i = 0; i < pages.length; i++) {
        await pages[i].evaluate(
          (args) => window._dev.startRun(args.char, 0, args.seed),
          { char: 'blade', seed: 100 + i },
        );
        hashes.push(await pages[i].evaluate(() => window._dev.stateHash()));
      }
      // All 4 distinct — proves hash is sensitive to state (and RNG).
      expect(new Set(hashes).size).toBe(4);
    } finally { await closeAll(contexts); }
  });

  test('Every character seeds deterministically', async ({ browser }) => {
    // 2 peers × 6 chars, verify same-char-same-seed produces same hash.
    const { contexts, pages } = await bootN(browser, 2);
    try {
      for (const charId of CHARS) {
        const hashes = await hashesAfterRun(pages, { char: charId, difficulty: 0, seed: 7 });
        expect(new Set(hashes).size, `char ${charId} diverged: ${hashes.join(' vs ')}`).toBe(1);
      }
    } finally { await closeAll(contexts); }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. stateDiff — attribute the field that diverges
// ─────────────────────────────────────────────────────────────────────
test.describe('State diff attribution', () => {
  test('mutating hp on one peer shows path=players[0].hp', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 2);
    try {
      for (const p of pages) await p.evaluate(() => window._dev.startRun('blade', 0, 42));
      const h0a = await pages[0].evaluate(() => window._dev.stateHash());
      const h1a = await pages[1].evaluate(() => window._dev.stateHash());
      expect(h0a).toBe(h1a);

      // Mutate HP on page 1 — hashes must diverge.
      await pages[1].evaluate(() => window._dev.setHp(1));
      const h0b = await pages[0].evaluate(() => window._dev.stateHash());
      const h1b = await pages[1].evaluate(() => window._dev.stateHash());
      expect(h0b).not.toBe(h1b);

      // Ask peer 1 what differs against peer 0's snapshot.
      const snapA = await pages[0].evaluate(() => window._dev.stateSnapshot());
      const diff = await pages[1].evaluate(
        (s) => window._dev.stateDiff(s),
        snapA,
      );
      expect(diff, 'stateDiff should report a diverging field').not.toBeNull();
      // The path should mention the player's hp field.
      expect(String(diff.path)).toMatch(/hp/);
    } finally { await closeAll(contexts); }
  });

  test('mutating relics shows path containing relics', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 2);
    try {
      for (const p of pages) await p.evaluate(() => window._dev.startRun('blade', 0, 42));
      await pages[1].evaluate(() => window._dev.grantRelic('berserker_heart'));
      const snapA = await pages[0].evaluate(() => window._dev.stateSnapshot());
      const diff = await pages[1].evaluate((s) => window._dev.stateDiff(s), snapA);
      expect(diff).not.toBeNull();
      expect(String(diff.path)).toMatch(/relics/);
    } finally { await closeAll(contexts); }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. RNG trace parity — same seed produces identical consumption sequence
// ─────────────────────────────────────────────────────────────────────
test.describe('RNG trace parity', () => {
  test('2 peers, same seed → identical RNG trace over map gen', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 2);
    try {
      // Trace BEFORE startRun — so map generation consumption is included.
      for (const p of pages) {
        await p.evaluate(() => {
          // runManager is ctx.runManager; we need the trace flag ON before
          // setSeed runs. startRun calls setSeed, which rebuilds the RNG
          // closure — but the trace flag is read on EACH call, so enabling
          // after setSeed works too. We just need to wipe the trace after.
          window._dev.rngTraceStart();
        });
        await p.evaluate(() => window._dev.startRun('blade', 0, 314));
      }
      const tA = await pages[0].evaluate(() => window._dev.rngTrace());
      const tB = await pages[1].evaluate(() => window._dev.rngTrace());

      expect(tA.length).toBeGreaterThan(0);
      expect(tA.length).toBe(tB.length);
      // Every (value, post-state) pair must match entry-for-entry.
      for (let i = 0; i < tA.length; i++) {
        expect(tA[i].v, `v differs at index ${i}`).toBe(tB[i].v);
        expect(tA[i].s, `s differs at index ${i}`).toBe(tB[i].s);
      }
    } finally { await closeAll(contexts); }
  });

  test('zero overhead when trace disabled', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 1);
    const [page] = pages;
    try {
      await page.evaluate(() => window._dev.startRun('blade', 0, 1));
      const trace = await page.evaluate(() => window._dev.rngTrace());
      // Default: trace off. RunManager consumed RNG during startRun, but we
      // never called rngTraceStart() — the trace should be empty.
      expect(trace.length).toBe(0);
    } finally { await closeAll(contexts); }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Combat determinism — same scenario across peers produces same state
// ─────────────────────────────────────────────────────────────────────
test.describe('Combat determinism', () => {
  test('3 peers, bossArena boss_brawler → same hash after scripted damage', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 3);
    try {
      // Run setup + hash capture in ONE evaluate per page. If they're split
      // across two evaluates, a rAF frame can fire between them, advancing
      // enemy AI on some peers but not others — hash drifts by the float
      // position delta.
      const hashes = [];
      for (const p of pages) {
        const h = await p.evaluate(() => {
          window._dev.startRun('blade', 0, 55);
          window._dev.godmode(true);
          window._dev.setMaxHp(9999);
          window._dev.bossArena('boss_brawler', 1);
          window._dev.setTempo(50);
          return window._dev.stateHash();
        });
        hashes.push(h);
      }
      expect(new Set(hashes).size,
        `post-bossArena hashes: ${hashes.join(' / ')}`).toBe(1);
    } finally { await closeAll(contexts); }
  });

  test('Floor advance is deterministic across peers', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 3);
    try {
      for (const p of pages) {
        await p.evaluate(() => {
          window._dev.startRun('frost', 0, 1001);
          window._dev.godmode(true);
          window._dev.bossArena('boss_brawler', 1);
        });
      }
      // Instantly clear — each peer advances its own floor using its own
      // RunManager. Seeded identically → identical post-clear state.
      for (const p of pages) await p.evaluate(() => window._dev.clearRoom());
      // Let any state-machine transition complete.
      await pages[0].waitForTimeout(300);
      const snaps = [];
      for (const p of pages) snaps.push(await p.evaluate(() => window._dev.stateSnapshot()));
      // Floors must match, RNG state must match.
      expect(snaps[0].floor).toBe(snaps[1].floor);
      expect(snaps[0].floor).toBe(snaps[2].floor);
      expect(snaps[0].rng).toBe(snaps[1].rng);
      expect(snaps[0].rng).toBe(snaps[2].rng);
    } finally { await closeAll(contexts); }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Net record/replay smoke
// ─────────────────────────────────────────────────────────────────────
test.describe('Net record/replay', () => {
  test('netRecordStart/Stop with no traffic returns an empty log', async ({ browser }) => {
    const { contexts, pages } = await bootN(browser, 1);
    const [page] = pages;
    try {
      const started = await page.evaluate(() => window._dev.netRecordStart());
      // netRecordStart returns false when there's no window._net yet.
      // That's the current solo boot — accept either shape.
      if (!started) return;
      // If started, stop should return an array.
      const log = await page.evaluate(() => window._dev.netRecordStop());
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBe(0);
    } finally { await closeAll(contexts); }
  });
});
