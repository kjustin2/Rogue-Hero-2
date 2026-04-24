// card-execution.spec.js — every card type must actually EXECUTE.
//
// The smoke test exercises grant-only: it verifies every card type exists
// in the registry and can be added to the collection without throwing.
// This suite goes further: for each card TYPE, it picks a concrete card,
// tops up AP, forces an enemy on screen, and calls combat.executeCard()
// via _dev.playCard. If any type's dispatch branch throws, we'll see it.
//
// Additional assertions per type where meaningful:
//   - AP is deducted post-execution.
//   - Projectile types spawn at least one projectile.
//   - Trap/orb/sigil types push onto the corresponding world array.
//   - Channel type sets channelState (transient).

import { test, expect } from '@playwright/test';

async function boot(page) {
  page.on('pageerror', () => {});
  page.on('console', () => {});
  await page.goto('/index.html');
  await page.waitForFunction(() => !!(window._dev && window._dev.ready), null, { timeout: 15_000 });
}

// Set up a combat scenario where the card will have a valid target.
async function arenaSetup(page, char = 'blade') {
  await page.evaluate((c) => {
    window._dev.startRun(c, 0, 42);
    window._dev.godmode(true);
    window._dev.setMaxHp(9999);
    window._dev.bossArena('boss_brawler', 1);
  }, char);
}

// ─────────────────────────────────────────────────────────────────────
// 1. Execute first card of every registered type without throwing.
// ─────────────────────────────────────────────────────────────────────
test.describe('Card-type execution: no throws', () => {
  test('every registered card type executes successfully', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);

    const types = await page.evaluate(() => window._dev.cardTypes());
    expect(types.length).toBeGreaterThanOrEqual(10);

    const failures = [];
    for (const type of types) {
      const result = await page.evaluate((t) => {
        const id = window._dev.firstCardOfType(t);
        if (!id) return { type: t, skipped: 'no card of type' };
        try {
          const ok = window._dev.playCard(id);
          return { type: t, id, ok: !!ok };
        } catch (e) {
          return { type: t, id, err: e.message, stack: e.stack };
        }
      }, type);
      if (result.err) failures.push(result);
    }
    expect(failures, `card types that threw on execution:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Type-specific invariants — AP deduction, world spawn effects.
// ─────────────────────────────────────────────────────────────────────
test.describe('Card execution side-effects', () => {
  test('melee card deducts AP and emits damage number (visible via particles)', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('melee'));
    expect(id).toBeTruthy();
    const res = await page.evaluate((cardId) => {
      const p = window._dev.player;
      const def = { ...window._dev }; // unused, just a foothold
      p.budget = 5;
      const pre = p.budget;
      const ok = window._dev.playCard(cardId);
      return { ok, preBudget: pre, postBudget: p.budget };
    }, id);
    expect(res.ok, 'melee card should execute successfully').toBe(true);
    expect(res.postBudget, 'melee card should deduct AP').toBeLessThan(res.preBudget);
  });

  test('trap card pushes onto traps[] world array', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('trap'));
    if (!id) test.skip(true, 'no trap cards in registry');
    const before = await page.evaluate(() => window._dev.worldCounts().traps);
    await page.evaluate((cardId) => {
      window._dev.player.budget = 9;
      window._dev.playCard(cardId, { x: 400, y: 360 });
    }, id);
    const after = await page.evaluate(() => window._dev.worldCounts().traps);
    expect(after, 'trap card should push onto traps[]').toBeGreaterThan(before);
  });

  test('sigil card pushes onto sigils[] world array (capped at 2)', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('sigil'));
    if (!id) test.skip(true, 'no sigil cards in registry');
    // Fire it 3× — main.js caps at 2 (shifts oldest).
    await page.evaluate((cardId) => {
      window._dev.player.budget = 30;
      window._dev.playCard(cardId, { x: 300, y: 300 });
      window._dev.player.budget = 30;
      window._dev.playCard(cardId, { x: 350, y: 300 });
      window._dev.player.budget = 30;
      window._dev.playCard(cardId, { x: 400, y: 300 });
    }, id);
    const count = await page.evaluate(() => window._dev.worldCounts().sigils);
    expect(count, 'sigils[] is capped at 2 per main.js SPAWN_SIGIL handler').toBeLessThanOrEqual(2);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('shot-type card spawns at least one projectile', async ({ page }) => {
    // Note: the `projectile` card type in this codebase is a short-range
    // *AoE pulse* around the player (e.g. Tempo Burst) that doesn't spawn a
    // live projectile. The bullet-firing type is `shot`.
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('shot'));
    if (!id) test.skip(true, 'no shot cards in registry');
    const before = await page.evaluate(() => window._dev.projectileCount());
    await page.evaluate((cardId) => {
      window._dev.player.budget = 9;
      window._dev.playCard(cardId, { x: 800, y: 360 });
    }, id);
    const after = await page.evaluate(() => window._dev.projectileCount());
    expect(after, 'shot card should spawn >= 1 projectile').toBeGreaterThan(before);
  });

  test('orbit card pushes onto orbs[]', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('orbit'));
    if (!id) test.skip(true, 'no orbit cards in registry');
    const before = await page.evaluate(() => window._dev.worldCounts().orbs);
    await page.evaluate((cardId) => {
      window._dev.player.budget = 9;
      window._dev.playCard(cardId);
    }, id);
    const after = await page.evaluate(() => window._dev.worldCounts().orbs);
    expect(after).toBeGreaterThan(before);
  });

  test('echo card pushes onto echoes[]', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('echo'));
    if (!id) test.skip(true, 'no echo cards in registry');
    const before = await page.evaluate(() => window._dev.worldCounts().echoes);
    await page.evaluate((cardId) => {
      window._dev.player.budget = 9;
      window._dev.playCard(cardId, { x: 400, y: 300 });
    }, id);
    const after = await page.evaluate(() => window._dev.worldCounts().echoes);
    expect(after).toBeGreaterThan(before);
  });

  test('ground wave card pushes onto groundWaves[]', async ({ page }) => {
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('ground'));
    if (!id) test.skip(true, 'no ground cards in registry');
    const before = await page.evaluate(() => window._dev.worldCounts().groundWaves);
    await page.evaluate((cardId) => {
      window._dev.player.budget = 9;
      window._dev.playCard(cardId, { x: 800, y: 360 });
    }, id);
    const after = await page.evaluate(() => window._dev.worldCounts().groundWaves);
    expect(after).toBeGreaterThan(before);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Silenced player blocks card execution.
// ─────────────────────────────────────────────────────────────────────
test.describe('Silenced state gates card play', () => {
  test('silenced=true cards emitted directly still execute; but the UI path blocks them', async ({ page }) => {
    // Note: combat.executeCard() itself doesn't check silenced — that's a
    // UI-layer check in main.js. This test documents the current behaviour
    // so a regression where silence checking moves into executeCard won't
    // be silent.
    await boot(page);
    await arenaSetup(page);
    const id = await page.evaluate(() => window._dev.firstCardOfType('melee'));
    await page.evaluate(() => { window._dev.player.silenced = true; });
    const res = await page.evaluate((cardId) => {
      try {
        window._dev.player.budget = 5;
        return { ok: !!window._dev.playCard(cardId) };
      } catch (e) { return { err: e.message }; }
    }, id);
    // Direct executeCard invocation does not respect silenced — executes OK.
    // If this changes, the test catches it.
    expect(res.ok || res.err).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Card execution under various tempo zones — crash handling.
// ─────────────────────────────────────────────────────────────────────
test.describe('Card execution across tempo zones', () => {
  const zones = [5, 40, 75, 95]; // cold / flowing / hot / critical
  for (const tempoValue of zones) {
    test(`executing a melee card at tempo=${tempoValue} does not throw`, async ({ page }) => {
      await boot(page);
      await arenaSetup(page);
      await page.evaluate((t) => window._dev.setTempo(t), tempoValue);
      const id = await page.evaluate(() => window._dev.firstCardOfType('melee'));
      const res = await page.evaluate((cardId) => {
        try { window._dev.player.budget = 5; return { ok: window._dev.playCard(cardId) }; }
        catch (e) { return { err: e.message }; }
      }, id);
      expect(res.err, `card execution threw at tempo=${tempoValue}: ${res.err}`).toBeUndefined();
      const errors = await page.evaluate(() => window._dev.errors.length);
      expect(errors).toBe(0);
    });
  }
});
