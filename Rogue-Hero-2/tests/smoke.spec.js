// Rogue Hero 2 — in-browser smoke suite.
// Drives the live game via window._dev (src/DevConsole.js).
//
// Coverage:
//   - Boot + DevConsole surface + registry sanity
//   - Each of the 6 characters starts a run cleanly
//   - Each of the 9 bosses spawns, ticks, and dies without throwing
//   - Victory flow reaches gameState='victory'
//   - Cards of every type exist in the registry
//   - Every relic is grantable without throwing
//   - Tempo zones + crash edge cases don't blow up
//   - Combat idle (3s) doesn't produce runtime errors

import { test, expect } from '@playwright/test';

// ── Shared helpers ──────────────────────────────────────────────

// Known benign warnings we don't want to fail on. Kept small and narrow.
const IGNORED_ERROR_PATTERNS = [
  /AudioContext/i,                      // headless autoplay policy
  /play\(\) failed/i,                   // audio
  /The AudioContext was not allowed/i,
  /Failed to load resource.*manifest\.json/i,
];

function shouldIgnore(msg) {
  for (const re of IGNORED_ERROR_PATTERNS) if (re.test(msg)) return true;
  return false;
}

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => {
    const msg = (e && e.message) || String(e);
    if (!shouldIgnore(msg)) errors.push({ kind: 'pageerror', msg });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!shouldIgnore(text)) errors.push({ kind: 'console.error', msg: text });
    }
  });
  page._errors = errors;
  await page.goto('/index.html');
  // DevConsole registers synchronously right before engine.start().
  await page.waitForFunction(
    () => !!(window._dev && window._dev.ready === true),
    null,
    { timeout: 15_000 },
  );
}

async function waitForState(page, state, timeoutMs = 8_000) {
  await page.waitForFunction(
    (s) => window._dev && window._dev.gameState === s,
    state,
    { timeout: timeoutMs },
  );
}

async function tickMs(page, ms) {
  // Let the rAF loop run for roughly `ms` milliseconds.
  await page.waitForTimeout(ms);
}

function expectNoErrors(page, label) {
  const errs = page._errors || [];
  expect(errs, `${label} — unexpected errors:\n${JSON.stringify(errs, null, 2)}`).toEqual([]);
}

// ── Boot & DevConsole ───────────────────────────────────────────

test.describe('Boot & DevConsole', () => {
  test('page loads, DevConsole registers, no errors', async ({ page }) => {
    await boot(page);
    const snap = await page.evaluate(() => window._dev.snapshot());
    expect(snap.gameState).toBe('intro');
    expectNoErrors(page, 'boot');
  });

  test('DevConsole exposes the full API surface', async ({ page }) => {
    await boot(page);
    const keys = await page.evaluate(() => Object.keys(window._dev).sort());
    const required = [
      'bossArena', 'cardTypes', 'clearEnemies', 'clearErrors', 'clearRoom',
      'firstCardOfType', 'forceVictory', 'godmode', 'grantAllRelics',
      'grantCard', 'grantRelic', 'isGodmode', 'killAll', 'listBosses',
      'listCards', 'listChars', 'listEnemies', 'listItems', 'setAp',
      'setFloor', 'setGameState', 'setHp', 'setMaxHp', 'setTempo',
      'snapshot', 'spawnBoss', 'spawnEnemy', 'startRun',
    ];
    for (const k of required) expect(keys, `missing _dev.${k}`).toContain(k);
  });

  test('registries have expected shape', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      bosses: window._dev.listBosses(),
      chars: window._dev.listChars(),
      items: window._dev.listItems().length,
      cards: window._dev.listCards().length,
      cardTypes: window._dev.cardTypes(),
    }));
    expect(r.bosses.sort()).toEqual([
      'boss_apex', 'boss_archivist', 'boss_aurora', 'boss_brawler',
      'boss_conductor', 'boss_echo', 'boss_hollow_king',
      'boss_necromancer', 'boss_vault_engine',
    ]);
    // Original RH1 cast (6) plus any RH2 additions — assert the core six
    // are all present without hard-coding the exact total.
    for (const c of ['blade', 'frost', 'shadow', 'echo', 'wraith', 'vanguard']) {
      expect(r.chars, `char '${c}' missing`).toContain(c);
    }
    expect(r.chars.length).toBeGreaterThanOrEqual(6);
    expect(r.items).toBeGreaterThanOrEqual(30);
    expect(r.cards).toBeGreaterThanOrEqual(100);
    // Confirm the core card types from CLAUDE.md all exist.
    for (const t of ['melee', 'projectile', 'dash', 'beam', 'trap', 'orbit', 'sigil']) {
      expect(r.cardTypes, `type '${t}' missing`).toContain(t);
    }
  });
});

// ── Characters ──────────────────────────────────────────────────

test.describe('Character start', () => {
  const CHARS = ['blade', 'frost', 'shadow', 'echo', 'wraith', 'vanguard'];
  for (const charId of CHARS) {
    test(`start run as ${charId}`, async ({ page }) => {
      await boot(page);
      const snap = await page.evaluate(
        (c) => window._dev.startRun(c, 0, 12345),
        charId,
      );
      expect(snap.gameState).toBe('map');
      expect(snap.selectedCharId).toBe(charId);
      expect(snap.player).not.toBeNull();
      expect(snap.player.hp).toBeGreaterThan(0);
      expect(snap.player.maxHp).toBeGreaterThanOrEqual(snap.player.hp);
      expect(snap.player.charId).toBe(charId);
      expect(snap.floor).toBe(1);
      expect(snap.deckCount).toBeGreaterThanOrEqual(3);

      // Run the engine for a moment, ensure no errors and state is stable.
      await tickMs(page, 500);
      const after = await page.evaluate(() => window._dev.snapshot());
      expect(after.gameState).toBe('map');
      expectNoErrors(page, charId);
    });
  }
});

// ── Bosses ──────────────────────────────────────────────────────

test.describe('Boss spawn+tick+kill', () => {
  const BOSSES = [
    'boss_brawler', 'boss_conductor', 'boss_echo',
    'boss_necromancer', 'boss_apex', 'boss_archivist',
    'boss_hollow_king', 'boss_vault_engine', 'boss_aurora',
  ];
  for (const bossId of BOSSES) {
    test(`${bossId}: spawn, tick 1s, survive with godmode, kill`, async ({ page }) => {
      await boot(page);
      await page.evaluate(() => window._dev.startRun('blade', 0, 42));
      await waitForState(page, 'map');

      await page.evaluate((id) => {
        window._dev.godmode(true);
        window._dev.setMaxHp(9999);
        window._dev.bossArena(id, 3);
      }, bossId);
      await waitForState(page, 'playing');

      // Boss should be alive at start.
      const start = await page.evaluate(() => window._dev.snapshot());
      expect(start.enemyCount).toBeGreaterThanOrEqual(1);
      expect(start.aliveEnemies).toBeGreaterThanOrEqual(1);
      expect(start.player.alive).toBe(true);

      // Let the boss AI run — this exercises spawn patterns, projectile
      // emission, phase transitions, minion summons, etc.
      await tickMs(page, 1000);

      const mid = await page.evaluate(() => window._dev.snapshot());
      expect(mid.player.alive).toBe(true);

      // Nuke remaining enemies (including summoned minions).
      await page.evaluate(() => window._dev.killAll());
      await tickMs(page, 300);

      expectNoErrors(page, bossId);
    });
  }
});

// ── Victory flow ────────────────────────────────────────────────

test.describe('Victory flow', () => {
  test('forceVictory reaches gameState=victory on floor 5', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('blade', 0, 1));
    await waitForState(page, 'map');
    await page.evaluate(() => window._dev.forceVictory());
    await waitForState(page, 'victory');
    const snap = await page.evaluate(() => window._dev.snapshot());
    expect(snap.gameState).toBe('victory');
    expect(snap.floor).toBe(5);
    expectNoErrors(page, 'victory');
  });

  test('victory flow survives a follow-up tick without throwing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('vanguard', 0, 99));
    await waitForState(page, 'map');
    await page.evaluate(() => window._dev.forceVictory());
    await waitForState(page, 'victory');
    // Let the victory screen render/animate; this catches any throw in
    // the victory-state branch of the render pipeline.
    await tickMs(page, 1500);
    expectNoErrors(page, 'victory tick');
  });
});

// ── Card grants ─────────────────────────────────────────────────

test.describe('Card system', () => {
  test('a card of every type can be granted without throwing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('blade', 0, 77));
    await waitForState(page, 'map');
    const result = await page.evaluate(() => {
      const types = window._dev.cardTypes();
      const failures = [];
      for (const t of types) {
        const id = window._dev.firstCardOfType(t);
        if (!id) { failures.push({ type: t, err: 'no card of this type' }); continue; }
        try { window._dev.grantCard(id); }
        catch (e) { failures.push({ type: t, id, err: e.message }); }
      }
      return { types, failures };
    });
    expect(result.failures).toEqual([]);
    expect(result.types.length).toBeGreaterThanOrEqual(10);
  });
});

// ── Relic grants ────────────────────────────────────────────────

test.describe('Relic system', () => {
  test('every relic grants without throwing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('blade', 0, 77));
    await waitForState(page, 'map');
    const failed = await page.evaluate(() => window._dev.grantAllRelics());
    expect(failed).toEqual([]);
    const snap = await page.evaluate(() => window._dev.snapshot());
    expect(snap.relicCount).toBeGreaterThanOrEqual(30);
    expectNoErrors(page, 'grantAllRelics');
  });
});

// ── Tempo edges ─────────────────────────────────────────────────

test.describe('Tempo system', () => {
  test('extreme tempo values do not throw (cold & critical crashes)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('blade', 0, 3));
    await waitForState(page, 'map');
    await page.evaluate(() => {
      window._dev.bossArena('boss_brawler', 1);
      window._dev.godmode(true);
    });
    await waitForState(page, 'playing');

    for (const v of [0, 1, 50, 99, 100]) {
      await page.evaluate((val) => window._dev.setTempo(val), v);
      await tickMs(page, 100);
    }
    expectNoErrors(page, 'tempo');
  });
});

// ── Run loop integrity ──────────────────────────────────────────

test.describe('Run loop integrity', () => {
  test('3s idle in combat produces no runtime errors', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('blade', 0, 7));
    await waitForState(page, 'map');
    await page.evaluate(() => {
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_brawler', 1);
    });
    await waitForState(page, 'playing');
    await tickMs(page, 3000);
    const snap = await page.evaluate(() => window._dev.snapshot());
    expect(snap.player.alive).toBe(true);
    expectNoErrors(page, 'idle-3s');
  });

  test('clearRoom on floor-2 boss advances floor and exits playing state', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window._dev.startRun('frost', 0, 21));
    await waitForState(page, 'map');
    await page.evaluate(() => {
      window._dev.godmode(true);
      window._dev.bossArena('boss_conductor', 2);
    });
    await waitForState(page, 'playing');
    // Direct clear: bypasses the update-loop dead-enemy detector so the
    // test isolates the post-clear transition logic.
    await page.evaluate(() => window._dev.clearRoom());
    await tickMs(page, 500);
    const snap = await page.evaluate(() => window._dev.snapshot());
    // After a floor-2 boss clear, floor advances to 3 and state should
    // leave 'playing' (→ draft/itemReward/map depending on the roll).
    expect(snap.gameState).not.toBe('playing');
    expect(snap.floor).toBeGreaterThanOrEqual(3);
    expectNoErrors(page, 'boss-clear-advance');
  });
});
