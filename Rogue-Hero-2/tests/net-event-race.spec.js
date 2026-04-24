// net-event-race.spec.js — bugs in the `net.on('evt')` demux paths.
//
// These exercise race-condition and idempotency gaps that a real MP session
// can trigger:
//   - Out-of-order / duplicate PLAYER_REVIVED shouldn't heal a living remote.
//   - Duplicate PLAYER_DOWNED shouldn't clobber the placeholder's state.
//   - SPAWN_ORBS must attach to the correct ally in 3–4P, not "first remote".
//
// We drive the live demux via `net._dispatch('evt', msg, senderPeerId)` so
// the real handler path runs without needing full WebRTC infrastructure.
// A synthesised remote placeholder is injected into `players.list` so the
// handler has something to target.

import { test, expect } from '@playwright/test';

async function boot(page) {
  page.on('pageerror', () => {});
  page.on('console', () => {});
  await page.goto('/index.html');
  await page.waitForFunction(() => !!(window._dev && window._dev.ready), null, { timeout: 15_000 });
}

// Inject N fake remote placeholders into players.list so the dispatch
// handlers find a target. Each placeholder gets a distinct _remotePeerId
// so _remotePlayerFor(senderPeerId) can resolve by id.
async function injectRemotes(page, peerIds) {
  await page.evaluate((pids) => {
    for (let i = 0; i < pids.length; i++) {
      const ph = { ...window._players.list[0] };
      // Clone shape-only; mutate the new object without affecting the primary.
      Object.setPrototypeOf(ph, Object.getPrototypeOf(window._players.list[0]));
      ph._isRemote = true;
      ph._remotePeerId = pids[i];
      ph.playerIndex = i + 1;
      ph.id = 'p' + (i + 1);
      ph.hp = 100;
      ph.maxHp = 100;
      ph.downed = false;
      ph.alive = true;
      ph.reviveProgress = 0;
      ph.x = 200 + i * 100;
      ph.y = 200 + i * 50;
      window._players.list.push(ph);
    }
  }, peerIds);
}

// ─────────────────────────────────────────────────────────────────────
// BUG-4: PLAYER_REVIVED on a living remote should NOT clobber HP.
// ─────────────────────────────────────────────────────────────────────
test.describe('PLAYER_REVIVED idempotency', () => {
  test('living remote: a stray PLAYER_REVIVED must not reset HP to 30%', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(false);
    });
    await injectRemotes(page, ['peer-A']);
    // Put the living remote at full HP.
    await page.evaluate(() => {
      const rp = window._players.list[1];
      rp.hp = rp.maxHp;
      rp.downed = false;
      rp.alive = true;
    });
    const before = await page.evaluate(() => window._players.list[1].hp);
    // Simulate a stray PLAYER_REVIVED (duplicate / out-of-order / after a
    // previous revive). This mirrors a real-MP race where the host sends a
    // revive and a subsequent full-HP sync races it.
    await page.evaluate(() => {
      window._net._dispatch('evt', { type: 'PLAYER_REVIVED' }, 'peer-A');
    });
    const after = await page.evaluate(() => window._players.list[1].hp);
    // Bug-free behaviour: HP unchanged because the player wasn't downed.
    // Bug behaviour: HP reduced to ~30% of max.
    expect(after, `living remote HP was clobbered from ${before} to ${after} by stray PLAYER_REVIVED`).toBe(before);
  });

  test('downed remote: PLAYER_REVIVED DOES restore HP (positive path)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(false);
    });
    await injectRemotes(page, ['peer-A']);
    // Force the remote into a downed state.
    await page.evaluate(() => {
      const rp = window._players.list[1];
      rp.hp = 0;
      rp.downed = true;
      rp.alive = true;
    });
    await page.evaluate(() => {
      window._net._dispatch('evt', { type: 'PLAYER_REVIVED' }, 'peer-A');
    });
    const after = await page.evaluate(() => {
      const rp = window._players.list[1];
      return { hp: rp.hp, downed: rp.downed };
    });
    expect(after.downed).toBe(false);
    expect(after.hp).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BUG-3: duplicate PLAYER_DOWNED on an already-downed remote shouldn't
// mutate already-correct state (e.g. reset a reviveProgress that's in
// flight). The guard `rp.downed || !rp.alive` in Players.goDown() short-
// circuits; the net handler bypassed it.
// ─────────────────────────────────────────────────────────────────────
test.describe('PLAYER_DOWNED idempotency', () => {
  test('already-downed remote: second PLAYER_DOWNED preserves reviveProgress', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(false);
    });
    await injectRemotes(page, ['peer-A']);
    // First down.
    await page.evaluate(() => window._net._dispatch('evt', { type: 'PLAYER_DOWNED' }, 'peer-A'));
    // A reviver gets partway through.
    await page.evaluate(() => {
      window._players.list[1].reviveProgress = 0.7;
    });
    // Duplicate PLAYER_DOWNED arrives — e.g. a retry from the peer that
    // crossed a reconnect boundary. Should NOT reset progress.
    await page.evaluate(() => window._net._dispatch('evt', { type: 'PLAYER_DOWNED' }, 'peer-A'));
    const after = await page.evaluate(() => window._players.list[1].reviveProgress);
    expect(after,
      'duplicate PLAYER_DOWNED reset reviveProgress — guard is missing')
      .toBeCloseTo(0.7, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BUG-2: SPAWN_ORBS from a specific peer should bind orbs to THAT peer's
// placeholder, not to the first remote in the list. In 3–4P this makes
// the visual accurate.
// ─────────────────────────────────────────────────────────────────────
test.describe('SPAWN_ORBS owner resolution in 3-player', () => {
  test('peer-C casts orbs → _ownerRef points at peer-C placeholder, not peer-A', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window._dev.startRun('blade', 0, 1);
      window._dev.godmode(false);
    });
    // Three remote placeholders simulating a 4-peer session.
    await injectRemotes(page, ['peer-A', 'peer-B', 'peer-C']);
    await page.evaluate(() => {
      // Distinct positions so we can tell which placeholder the orb owner is.
      window._players.list[1].x = 100; window._players.list[1].y = 100; // peer-A
      window._players.list[2].x = 300; window._players.list[2].y = 300; // peer-B
      window._players.list[3].x = 500; window._players.list[3].y = 500; // peer-C
    });
    // Dispatch a SPAWN_ORBS from peer-C via the net event demux. Use the
    // HostSim-style wrapper shape: `{ name: 'SPAWN_ORBS', p: {...}, _visual: true }`.
    await page.evaluate(() => {
      window._net._dispatch('evt', {
        name: 'SPAWN_ORBS',
        _visual: true,
        p: { count: 3, radius: 40, damage: 1, life: 5, speed: 2, color: '#f00' },
      }, 'peer-C');
    });
    const owner = await page.evaluate(() => {
      const orbs = window._world.orbs;
      if (!orbs.length) return null;
      const ref = orbs[0]._ownerRef;
      return ref ? { peerId: ref._remotePeerId, x: ref.x, y: ref.y } : null;
    });
    expect(owner, 'orb should have an _ownerRef').not.toBeNull();
    // Bug-free behaviour: owner is peer-C. Bug behaviour: owner is peer-A
    // (the first remote in players.list).
    expect(owner.peerId, `orb attached to wrong peer: expected peer-C, got ${owner.peerId}`).toBe('peer-C');
  });
});
