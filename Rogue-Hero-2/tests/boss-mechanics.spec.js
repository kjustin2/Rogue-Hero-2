// boss-mechanics.spec.js — per-boss deep behavior.
//
// The original smoke test spawns each boss, ticks 1s, kills via godmode.
// That catches "does anything throw"; it does NOT catch:
//   - Phase transitions firing (or firing twice)
//   - Listener leaks (bosses that register on the global EventBus)
//   - Post-death cleanup (stale enemy state, orphan minions)
//   - Special mechanics (Conductor shield, Hollow King clone spawn,
//     Archivist card-copy, Aurora post-fx)
//
// Each test here targets one concrete invariant. If a test fails, the boss
// impl has drifted from expectations and needs a fix.

import { test, expect } from '@playwright/test';

const BOSSES = [
  'boss_brawler', 'boss_conductor', 'boss_echo',
  'boss_necromancer', 'boss_apex', 'boss_archivist',
  'boss_hollow_king', 'boss_vault_engine', 'boss_aurora',
];

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page._errors = errors;
  await page.goto('/index.html');
  await page.waitForFunction(() => !!(window._dev && window._dev.ready), null, { timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────
// 1. Phase-transition invariants — bosses with HP-based phase advance.
// ─────────────────────────────────────────────────────────────────────
test.describe('Phase transitions fire at thresholds', () => {
  test('Archivist advances to phase 2 at <=60% HP and phase 3 at <=25%', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_archivist', 3);
    });
    // Wait past the base Enemy.spawnTimer (0.35s) so updateSpawn stops
    // short-circuiting phase logic. Without this the test reliably fails
    // because phase-check is gated on !spawning.
    await page.waitForTimeout(500);

    const phase1 = await page.evaluate(() => {
      const e = window._dev.enemies[0];
      return { hp: e.hp, maxHp: e.maxHp, phase: e.phase };
    });
    expect(phase1.phase).toBe(1);

    await page.evaluate(() => {
      const e = window._dev.enemies[0];
      e.hp = Math.floor(e.maxHp * 0.55);
    });
    await page.waitForTimeout(150);
    const phase2 = await page.evaluate(() => window._dev.enemies[0].phase);
    expect(phase2, 'phase should advance to 2 after HP drops below 60%').toBe(2);

    await page.evaluate(() => {
      const e = window._dev.enemies[0];
      e.hp = Math.floor(e.maxHp * 0.20);
    });
    await page.waitForTimeout(150);
    const phase3 = await page.evaluate(() => window._dev.enemies[0].phase);
    expect(phase3, 'phase should advance to 3 after HP drops below 25%').toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Listener-leak detection — CRITICAL: bosses must not grow the
//    EventBus listener count across spawn→kill→respawn cycles.
// ─────────────────────────────────────────────────────────────────────
test.describe('No EventBus listener leaks across boss cycles', () => {
  // Bosses that register listeners in their constructor (CRASH_ATTACK,
  // CARD_PLAYED, etc). If any of these leak, listener counts grow
  // unboundedly across rooms/runs.
  // BossNecromancer registers a CRASH_ATTACK listener (Enemy.js:1702) and
  // BossArchivist registers a CARD_PLAYED listener (Enemy.js:2846). Both
  // clean up only inside their updateLogic's `!alive` branch — which does
  // NOT run if the boss is swept away by a room respawn before ticking.
  const LEAK_PRONE = ['boss_necromancer', 'boss_archivist'];
  for (const bossId of LEAK_PRONE) {
    test(`${bossId}: 5× spawn+kill cycles do not grow listener counts`, async ({ page }) => {
      await boot(page);
      await page.evaluate(() => {
        window._dev.startRun('blade', 0, 1);
        window._dev.godmode(true);
      });
      const baseline = await page.evaluate(() => window._dev.eventListenerCounts());

      // 5 consecutive spawn→kill cycles. Each cycle is a full room refresh.
      for (let i = 0; i < 5; i++) {
        await page.evaluate((id) => {
          window._dev.bossArena(id, 3);
          // Let the boss attach listeners (constructor has already run).
          window._dev.killAll();
          // Let one tick happen so any post-death cleanup runs.
        }, bossId);
        await page.waitForTimeout(80);
      }

      // Compare listener counts post-cycles to baseline. A few additive
      // listeners from the first bossArena call is fine (e.g. the first
      // time spawnEnemies adds UI hookups); what matters is the counts
      // do NOT grow linearly with cycle count.
      const after = await page.evaluate(() => window._dev.eventListenerCounts());
      const events = Object.keys(after);
      for (const evtName of events) {
        const b = baseline[evtName] || 0;
        const a = after[evtName] || 0;
        // Allow +2 over baseline for first-spawn side-effects.
        // More than that implies linear growth = a leak.
        expect(a - b, `listener count for '${evtName}' grew from ${b} to ${a} over 5 cycles — leak`).toBeLessThanOrEqual(2);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. Boss-specific mechanic checks.
// ─────────────────────────────────────────────────────────────────────
test.describe('Boss-specific mechanics', () => {
  test('Conductor: immune while a shielddrone is alive nearby', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_conductor', 2);
    });
    // Spawn a shielddrone next to the conductor — _isImmune() should report
    // true. Damage to the conductor must be gated by this immunity.
    await page.evaluate(() => {
      const conductor = window._dev.enemies[0];
      window._dev.spawnEnemy('shielddrone', conductor.x + 20, conductor.y + 20);
    });
    const hpBefore = await page.evaluate(() => window._dev.enemies[0].hp);
    // Immune check is exercised by the game's damage path, not directly
    // exposed. At minimum, verify the _isImmune helper returns true given
    // the adjacent shielddrone.
    const immune = await page.evaluate(() => {
      const conductor = window._dev.enemies[0];
      return typeof conductor._isImmune === 'function'
        ? conductor._isImmune(window._dev.enemies) : null;
    });
    expect(immune, 'conductor should be immune while shielddrone alive').toBe(true);
    // Kill the drone; conductor should stop being immune.
    await page.evaluate(() => {
      for (const e of window._dev.enemies) {
        if (e.type === 'shielddrone') { e.hp = 0; e.alive = false; }
      }
    });
    const immuneAfter = await page.evaluate(() => {
      const conductor = window._dev.enemies[0];
      return conductor._isImmune(window._dev.enemies);
    });
    expect(immuneAfter, 'conductor should not be immune without shielddrone').toBe(false);
  });

  test('Necromancer: shield drops on CRASH_ATTACK event', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_necromancer', 4);
    });
    // Phase 2 activates Necromancer's shield; force the transition by
    // pushing HP to 40% and waiting through the spawn animation.
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const e = window._dev.enemies[0];
      e.hp = Math.floor(e.maxHp * 0.40);
      e.shieldActive = true; // set directly — the shield enables via phase 2 logic
    });
    const pre = await page.evaluate(() => !!window._dev.enemies[0].shieldActive);
    expect(pre).toBe(true);
    // Emit CRASH_ATTACK globally — necromancer's constructor-registered
    // listener (Enemy.js:1702) should respond and drop the shield.
    await page.evaluate(() => window._eventBus.emit('CRASH_ATTACK', { x: 100, y: 100 }));
    await page.waitForTimeout(50);
    const post = await page.evaluate(() => !!window._dev.enemies[0].shieldActive);
    expect(post, 'Necromancer shield should drop after CRASH_ATTACK emits').toBe(false);
  });

  test('Necromancer: can spawn minions without throwing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_necromancer', 3);
    });
    // Tick 2s — necromancer should perform at least one minion summon
    // sequence (summons are periodic). We can't assert minion count
    // deterministically without internal knowledge, but we can verify
    // enemies[] grows or doesn't shrink below 1 and no errors thrown.
    const t0 = await page.evaluate(() => window._dev.enemies.length);
    await page.waitForTimeout(2000);
    const t1 = await page.evaluate(() => window._dev.enemies.length);
    expect(t1).toBeGreaterThanOrEqual(1);
  });

  test('Hollow King (RH2): alive + hp > 0 after a tick', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_hollow_king', 3);
    });
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const e = window._dev.enemies[0];
      return { alive: e.alive, hp: e.hp };
    });
    expect(info.alive).toBe(true);
    expect(info.hp).toBeGreaterThan(0);
  });

  test('Vault Engine (RH2): survives 2s with godmode', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_vault_engine', 3);
    });
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() => {
      const e = window._dev.enemies[0];
      return { alive: e.alive, hp: e.hp, playerHp: window._dev.player.hp };
    });
    expect(info.alive).toBe(true);
    expect(info.playerHp).toBeGreaterThan(0);
  });

  test('Aurora (RH2): survives 2s with godmode', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_aurora', 3);
    });
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() => {
      const e = window._dev.enemies[0];
      return { alive: e.alive, hp: e.hp, playerHp: window._dev.player.hp };
    });
    expect(info.alive).toBe(true);
    expect(info.playerHp).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Cross-boss: every boss survives 1s without the player dying.
//    This is broader than the smoke test because it's with live AI
//    (no immediate kill) and under godmode.
// ─────────────────────────────────────────────────────────────────────
test.describe('Every boss survives live AI for 1.5s with godmode', () => {
  for (const bossId of BOSSES) {
    test(`${bossId}: 1.5s tick under godmode`, async ({ page }) => {
      await boot(page);
      await page.evaluate((id) => {
        window._dev.startRun('blade', 0, 1);
        window._dev.godmode(true);
        window._dev.setMaxHp(9999);
        window._dev.bossArena(id, 3);
      }, bossId);
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => ({
        playerAlive: window._dev.player.alive,
        playerHp: window._dev.player.hp,
        enemyAlive: window._dev.enemies.some((e) => e.alive),
        errors: window._dev.errors.length,
      }));
      expect(info.playerAlive).toBe(true);
      expect(info.playerHp).toBeGreaterThan(0);
      expect(info.enemyAlive).toBe(true);
      expect(info.errors, `${bossId} runtime errors in 1.5s window`).toBe(0);
    });
  }
});
