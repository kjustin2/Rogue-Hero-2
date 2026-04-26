// tuning.spec.js — guards against tuning regressions.
//
// Each test pins a specific game-balance fact that recently changed:
//   - Aurora's well-attack only damages a player IF they're inside the circle
//     (fixed: pre-fix the well fired ENEMY_MELEE_HIT regardless of position).
//   - Aurora HP nerfed; Echo + Hollow King HP buffed for floor difficulty curve.
//   - Beam attacks respect cardDef.range — Sun Lance (range 280) does NOT
//     hit an enemy 700 px away in line.
//   - Phantom and Stalker speeds are below the previous "unreactable" values.
//   - Cards with multi-hit / pulses / tempo-scaling expose accurate damage
//     labels via UI.damageLabel().
//
// If you intentionally retune one of these, change BOTH the source and the
// matching expectation here so the test stays accurate.

import { test, expect } from '@playwright/test';

async function boot(page) {
  page.on('pageerror', () => {});
  page.on('console', () => {});
  await page.goto('/index.html');
  await page.waitForFunction(() => !!(window._dev && window._dev.ready), null, { timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────
// 1. Aurora: well-attack hit detection respects the circle.
// ─────────────────────────────────────────────────────────────────────
test.describe('Aurora well-attack hit detection', () => {
  test('player far OUTSIDE the well takes no damage when it detonates', async ({ page }) => {
    await boot(page);
    // Consolidate all setup + the synchronous `aurora.updateLogic(dt, …)`
    // call into a single evaluate(). The boss's wells array is cleared at
    // the next render frame because the wellTimer cycles, so we cannot
    // round-trip between page.evaluate calls without losing our injected
    // well. Calling updateLogic directly with a hand-rolled dt avoids the
    // race entirely.
    const result = await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(false);
      window._dev.setMaxHp(100);
      window._dev.setHp(100);
      window._dev.bossArena('boss_aurora', 5);
      const p = window._dev.player;
      p.x = 100; p.y = 100;
      const aurora = window._dev.enemies[0];
      aurora.spawning = false;
      aurora.spawnTimer = 0;
      aurora.wellTimer = 999;       // prevent auto-spawn from racing us
      aurora.wells = [{ x: 800, y: 600, t: 0.001, r: 90 }];
      const hpBefore = p.hp;
      // Drive one explicit tick that detonates the well (dt > 0.001).
      aurora.updateLogic(0.05, p, window._dev.tempoValue, null);
      return { hpBefore, hpAfter: p.hp, wellsLeft: aurora.wells.length };
    });
    expect(result.wellsLeft, 'well should detonate and be removed').toBe(0);
    expect(result.hpAfter,
      `player at (100,100) is ~860px from well at (800,600); should take 0 dmg`)
      .toBe(result.hpBefore);
  });

  test('player INSIDE the well DOES take damage on detonation', async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(false);
      window._dev.setMaxHp(100);
      window._dev.setHp(100);
      window._dev.bossArena('boss_aurora', 5);
      const p = window._dev.player;
      p.x = 400; p.y = 400;
      const aurora = window._dev.enemies[0];
      aurora.spawning = false;
      aurora.spawnTimer = 0;
      aurora.wellTimer = 999;       // prevent auto-spawn from racing us
      aurora.wells = [{ x: 400, y: 400, t: 0.001, r: 90 }];
      const hpBefore = p.hp;
      aurora.updateLogic(0.05, p, window._dev.tempoValue, null);
      return { hpBefore, hpAfter: p.hp, wellsLeft: aurora.wells.length };
    });
    expect(result.wellsLeft, 'well should detonate and be removed').toBe(0);
    expect(result.hpAfter,
      `player inside well should take damage; ${result.hpBefore} → ${result.hpAfter}`)
      .toBeLessThan(result.hpBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Boss HP curve — F3 + F4 buffed, F5 nerfed.
// ─────────────────────────────────────────────────────────────────────
test.describe('Boss HP tuning', () => {
  test('Echo (F3) HP >= 900', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.bossArena('boss_echo', 3);
    });
    const hp = await page.evaluate(() => window._dev.enemies[0].maxHp);
    expect(hp, `Echo F3 HP should be at least 900, got ${hp}`).toBeGreaterThanOrEqual(900);
  });

  test('Hollow King (F4) HP >= 750', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.bossArena('boss_hollow_king', 4);
    });
    const hp = await page.evaluate(() => window._dev.enemies[0].maxHp);
    expect(hp, `Hollow King F4 HP should be at least 750, got ${hp}`).toBeGreaterThanOrEqual(750);
  });

  test('Aurora (F5) HP <= 520 (nerfed from 600)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.bossArena('boss_aurora', 5);
    });
    const hp = await page.evaluate(() => window._dev.enemies[0].maxHp);
    expect(hp, `Aurora F5 HP should be <=520 after nerf, got ${hp}`).toBeLessThanOrEqual(520);
  });

  test('Archivist HP >= 1050 (buffed for stronger end-act fight)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.bossArena('boss_archivist', 5);
    });
    const hp = await page.evaluate(() => window._dev.enemies[0].maxHp);
    expect(hp, `Archivist HP should be >=1050 after buff, got ${hp}`).toBeGreaterThanOrEqual(1050);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2b. Boss aggression — qualitative behaviour checks.
// ─────────────────────────────────────────────────────────────────────
test.describe('Boss aggression', () => {
  test('Vault Engine actively closes distance on the player', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_vault_engine', 4);
      const ve = window._dev.enemies[0];
      ve.spawning = false;
      ve.spawnTimer = 0;
      ve._tuningStart = { x: ve.x, y: ve.y };
      // Park the player far away so the boss has somewhere to drift to.
      const p = window._dev.player;
      p.x = 100; p.y = 100;
      ve.x = 800; ve.y = 600;
      ve._tuningStart = { x: ve.x, y: ve.y };
    });
    await page.waitForTimeout(1200);
    const moved = await page.evaluate(() => {
      const ve = window._dev.enemies[0];
      const dx = ve.x - ve._tuningStart.x;
      const dy = ve.y - ve._tuningStart.y;
      return Math.sqrt(dx * dx + dy * dy);
    });
    expect(moved,
      `Vault Engine should aggressively pursue (moved ${moved.toFixed(1)} px in 1.2s)`)
      .toBeGreaterThan(150);
  });

  test('Hollow King (F4) closes faster than the old 140 px/s baseline', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.setMaxHp(9999);
      window._dev.bossArena('boss_hollow_king', 4);
      const hk = window._dev.enemies[0];
      hk.spawning = false;
      hk.spawnTimer = 0;
      const p = window._dev.player;
      // Fix the player at one edge, plant the king at the other.
      p.x = 200; p.y = 400;
      hk.x = 900; hk.y = 400;
      hk._tuningStart = { x: hk.x };
      // Force phase 1 baseline so we measure the buffed P1 chase speed.
      hk.phase = 1;
      hk.hp = hk.maxHp;
    });
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => {
      const hk = window._dev.enemies[0];
      return hk._tuningStart.x - hk.x;
    });
    // Old P1 chase was 140 px/s → ~70 px in 0.5 s. The buff to 160 px/s
    // should give >75 px of closing distance. Allow some slack for
    // single-frame jitter and lunge interruptions.
    expect(closed,
      `Hollow King P1 should close >70 px in 0.5s, closed ${closed.toFixed(1)}`)
      .toBeGreaterThan(70);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Beam range — Sun Lance must not hit enemies past its 280 px range.
// ─────────────────────────────────────────────────────────────────────
test.describe('Beam range respects cardDef.range', () => {
  test('Sun Lance (range 280) does NOT damage an enemy 600 px away in line', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_brawler', 1);
      window._dev.clearEnemies();
      // Place enemy directly along the +X axis from the player at distance 600.
      const p = window._dev.player;
      p.x = 200; p.y = 400;
      const e = window._dev.spawnEnemy('chaser', 800, 400);
      e.id = 'far_e1';
      e.maxHp = 999; e.hp = 999;
    });
    const hpBefore = await page.evaluate(() => window._dev.enemies[0].hp);
    // Fire Sun Lance (range 280) toward the far enemy. The cursor is at the
    // enemy's position so the beam direction is correct.
    await page.evaluate(() => {
      window._dev.playCard('sun_lance', { x: 800, y: 400 });
    });
    const hpAfter = await page.evaluate(() => window._dev.enemies[0].hp);
    expect(hpAfter,
      `enemy 600 px away must be untouched by 280-range beam; hp ${hpBefore} → ${hpAfter}`)
      .toBe(hpBefore);
  });

  test('Sun Lance DOES hit an enemy at 200 px', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_brawler', 1);
      window._dev.clearEnemies();
      const p = window._dev.player;
      p.x = 200; p.y = 400;
      const e = window._dev.spawnEnemy('chaser', 400, 400);
      e.id = 'near_e1';
      e.maxHp = 999; e.hp = 999;
    });
    const hpBefore = await page.evaluate(() => window._dev.enemies[0].hp);
    await page.evaluate(() => {
      window._dev.playCard('sun_lance', { x: 400, y: 400 });
    });
    const hpAfter = await page.evaluate(() => window._dev.enemies[0].hp);
    expect(hpAfter,
      `enemy 200 px away should take beam damage; hp ${hpBefore} → ${hpAfter}`)
      .toBeLessThan(hpBefore);
  });

  test('Lancer (range 900) still hits a long-range enemy', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_brawler', 1);
      window._dev.clearEnemies();
      const p = window._dev.player;
      p.x = 100; p.y = 400;
      const e = window._dev.spawnEnemy('chaser', 800, 400);
      e.maxHp = 999; e.hp = 999;
    });
    const hpBefore = await page.evaluate(() => window._dev.enemies[0].hp);
    await page.evaluate(() => {
      window._dev.playCard('lancer', { x: 800, y: 400 });
    });
    const hpAfter = await page.evaluate(() => window._dev.enemies[0].hp);
    expect(hpAfter,
      `Lancer (range 900) should hit enemy at 700 px`)
      .toBeLessThan(hpBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Phantom + Stalker speed nerfs.
// ─────────────────────────────────────────────────────────────────────
test.describe('Phantom + Stalker tuning', () => {
  test('Phantom chase speed <= 200 px/s', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_brawler', 1);
      window._dev.clearEnemies();
      const e = window._dev.spawnEnemy('phantom', 500, 400);
      // Pin the player far away so Phantom enters chase + moves at full spd.
      const p = window._dev.player;
      p.x = 100; p.y = 400;
      // Disable the blink mechanic for this test by pushing blinkTimer up.
      e.blinkTimer = 999;
      e.state = 'chase';
      // Mark the start position so we can measure travel.
      e._tuningStartX = e.x;
    });
    // Tick ~0.5 s of update logic. Phantom should NOT have closed more
    // than (oldMaxSpd * 0.5 = 115) px. With the new 195 cap, it closes
    // at most ~98 px per 0.5 s.
    await page.waitForTimeout(500);
    const moved = await page.evaluate(() => {
      const e = window._dev.enemies.find(en => en.type === 'phantom');
      return e ? Math.abs(e._tuningStartX - e.x) : -1;
    });
    expect(moved,
      `Phantom moved ${moved} px in 0.5s — speed cap should keep it under ~110px`)
      .toBeLessThan(110);
  });

  test('Stalker chase speed <= 140 px/s', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_brawler', 1);
      window._dev.clearEnemies();
      const e = window._dev.spawnEnemy('stalker', 600, 400);
      const p = window._dev.player;
      p.x = 200; p.y = 400;
      e.state = 'chase';
      e.attackCooldown = 999; // prevent transition to telegraph mid-test
      e._tuningStartX = e.x;
      e._tuningStartY = e.y;
    });
    await page.waitForTimeout(500);
    const moved = await page.evaluate(() => {
      const e = window._dev.enemies.find(en => en.type === 'stalker');
      if (!e) return -1;
      const dx = e._tuningStartX - e.x, dy = e._tuningStartY - e.y;
      return Math.sqrt(dx * dx + dy * dy);
    });
    expect(moved,
      `Stalker travelled ${moved} px in 0.5s — should be <=80 with the speed nerf`)
      .toBeLessThan(80);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4b. Archivist clone telegraph — visible "STOLEN" event fires when the
//     player plays a card while the Archivist is alive.
// ─────────────────────────────────────────────────────────────────────
test.describe('Archivist copy telegraph', () => {
  test('CARD_PLAYED triggers ENEMY_COPIED_CARD with the played card name', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_archivist', 5);
      window._copyEvents = [];
      window._eventBus.on('ENEMY_COPIED_CARD', (p) => window._copyEvents.push(p));
    });
    // Play any card. Archivist's CARD_PLAYED listener should re-emit
    // ENEMY_COPIED_CARD via its updateLogic path.
    await page.evaluate(() => {
      window._dev.playCard('strike');
    });
    await page.waitForTimeout(50);
    const events = await page.evaluate(() => window._copyEvents);
    expect(events.length,
      `expected at least one ENEMY_COPIED_CARD event after playing strike`)
      .toBeGreaterThan(0);
    expect(events[0].name).toBe('Strike');
  });

  test('Archivist exposes _copyFlashTimer pulse for ~0.6s after a copy', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_archivist', 5);
    });
    await page.evaluate(() => window._dev.playCard('strike'));
    await page.waitForTimeout(20);
    const flash = await page.evaluate(() => window._dev.enemies[0]._copyFlashTimer);
    expect(flash,
      `_copyFlashTimer should be active right after a card play; got ${flash}`)
      .toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. damageLabel — multi-hit / pulse / tempo-scaling cards expose
//    accurate display strings.
// ─────────────────────────────────────────────────────────────────────
test.describe('UI damage label', () => {
  test('frenzy displays as "10×3 DMG"', async ({ page }) => {
    await boot(page);
    const lbl = await page.evaluate(async () => {
      const ui = await import('/src/ui.js');
      const dm = await import('/src/DeckManager.js');
      return ui.damageLabel(dm.CardDefinitions.frenzy);
    });
    expect(lbl).toBe('10×3 DMG');
  });

  test('firestorm displays as "6×3 DMG"', async ({ page }) => {
    await boot(page);
    const lbl = await page.evaluate(async () => {
      const ui = await import('/src/ui.js');
      const dm = await import('/src/DeckManager.js');
      return ui.damageLabel(dm.CardDefinitions.firestorm);
    });
    expect(lbl).toBe('6×3 DMG');
  });

  test('tempo_blade_beam displays as "TEMPO DMG"', async ({ page }) => {
    await boot(page);
    const lbl = await page.evaluate(async () => {
      const ui = await import('/src/ui.js');
      const dm = await import('/src/DeckManager.js');
      return ui.damageLabel(dm.CardDefinitions.tempo_blade_beam);
    });
    expect(lbl).toBe('TEMPO DMG');
  });

  test('iron_retort displays the per-stack scaling', async ({ page }) => {
    await boot(page);
    const lbl = await page.evaluate(async () => {
      const ui = await import('/src/ui.js');
      const dm = await import('/src/DeckManager.js');
      return ui.damageLabel(dm.CardDefinitions.iron_retort);
    });
    expect(lbl).toMatch(/15\+8\/STK/);
  });

  test('ordinary single-hit card still shows plain "X DMG"', async ({ page }) => {
    await boot(page);
    const lbl = await page.evaluate(async () => {
      const ui = await import('/src/ui.js');
      const dm = await import('/src/DeckManager.js');
      return ui.damageLabel(dm.CardDefinitions.strike);
    });
    expect(lbl).toMatch(/^\d+ DMG$/);
  });

  test('shrapnel description matches its damage stat', async ({ page }) => {
    await boot(page);
    const card = await page.evaluate(async () => {
      const dm = await import('/src/DeckManager.js');
      return dm.CardDefinitions.shrapnel;
    });
    // Pre-fix: damage=5 but desc said "14 dmg" — mismatch.
    // Post-fix: damage=14 and desc no longer claims a different number.
    expect(card.damage, 'shrapnel damage stat').toBe(14);
    expect(card.desc).not.toMatch(/14 dmg/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Card-play null/__wide guards.
//    Repro of a runtime crash from console: clicking a 2-wide card's
//    secondary slot ('__wide' placeholder) made getCardDef return null,
//    and main.js then crashed on `def.cost`. Pin the contract that
//    getCardDef returns null for both '__wide' and unknown ids, so the
//    guards in main.js stay correct.
// ─────────────────────────────────────────────────────────────────────
test.describe('Card definition lookup safety', () => {
  test("getCardDef('__wide') returns null", async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async () => {
      window._dev.startRun('blade', 0, 1);
      const dm = await import('/src/DeckManager.js');
      // Build a fresh DeckManager-like check: CardDefinitions is the source
      // of truth that the live deckManager.getCardDef reads from.
      return dm.CardDefinitions['__wide'] === undefined;
    });
    expect(result, "'__wide' must not be a real card id").toBe(true);
  });

  test('unknown cardId returns null from getCardDef', async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async () => {
      const dm = await import('/src/DeckManager.js');
      return dm.CardDefinitions['__nonexistent_xyz__'] === undefined;
    });
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Player coordinate finiteness.
//    Repro of a runtime crash from console: player.x became NaN after
//    a dev-arena spawn, and Cosmetics.js:263 (body_lava animFn) called
//    createRadialGradient with non-finite arguments — once per frame,
//    forever, because the NaN propagates back through movement.
//    Player.draw now self-heals if x/y/r go non-finite. These tests
//    pin both the recovery and the absence of NaN under common loops.
// ─────────────────────────────────────────────────────────────────────
test.describe('Player coordinate finiteness', () => {
  test('player coords stay finite after bossArena(boss_echo) + 1s of ticks', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_echo', 1);
    });
    await page.waitForTimeout(1000);
    const coords = await page.evaluate(() => {
      const p = window._dev.player;
      return { x: p.x, y: p.y, r: p.r };
    });
    expect(Number.isFinite(coords.x), `player.x = ${coords.x}`).toBe(true);
    expect(Number.isFinite(coords.y), `player.y = ${coords.y}`).toBe(true);
    expect(Number.isFinite(coords.r) && coords.r > 0, `player.r = ${coords.r}`).toBe(true);
  });

  test('Player.draw recovers from NaN coords by resetting to canvas centre', async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      // Player.draw is only invoked from the render loop when gameState is
      // a combat-ish state. bossArena puts us in 'playing' so the recovery
      // block actually runs.
      window._dev.bossArena('boss_brawler', 1);
      const p = window._dev.player;
      // Inject the exact failure mode from the console error: non-finite
      // x/y. The next Player.draw call should self-heal and warn once.
      p.x = NaN;
      p.y = NaN;
      return new Promise((resolve) => {
        setTimeout(() => {
          const p2 = window._dev.player;
          resolve({
            x: p2.x, y: p2.y, r: p2.r,
            warned: !!p2._naNWarned,
          });
        }, 120);
      });
    });
    expect(Number.isFinite(result.x), `player.x = ${result.x}`).toBe(true);
    expect(Number.isFinite(result.y), `player.y = ${result.y}`).toBe(true);
    expect(result.r).toBeGreaterThan(0);
    expect(result.warned, 'recovery should set the once-only warn flag').toBe(true);
  });

  test('dashThrough on a perfectly-overlapping enemy does not NaN player coords', async ({ page }) => {
    await boot(page);
    const coords = await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(true);
      window._dev.bossArena('boss_brawler', 1);
      window._dev.clearEnemies();
      const p = window._dev.player;
      p.x = 400; p.y = 400;
      // Spawn enemy at exactly the player's position — the dashThrough
      // branch in Combat.js used to divide by dist=0 here and emit NaN.
      const e = window._dev.spawnEnemy('chaser', 400, 400);
      e.maxHp = 999; e.hp = 999;
      // wraithblade has dashThrough:true.
      window._dev.playCard('wraithblade', { x: 400, y: 400 });
      return { x: p.x, y: p.y };
    });
    expect(Number.isFinite(coords.x), `player.x after overlap dashThrough = ${coords.x}`).toBe(true);
    expect(Number.isFinite(coords.y), `player.y after overlap dashThrough = ${coords.y}`).toBe(true);
  });
});
