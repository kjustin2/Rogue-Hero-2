// Headless smoke test — fast CLI sanity check for the MP-critical
// subsystems. Run with:  node mp-smoke.mjs
// For the full in-browser test (includes DOM-less UI logic), open
// tests.html after serving the project (npm run serve at repo root,
// then /tests.html).

import { RunManager } from './src/RunManager.js';
import { TempoSystem } from './src/tempo.js';
import { Players } from './src/Players.js';
import { Player } from './src/player.js';
import { Enemy } from './src/Enemy.js';
import { BossHollowKing, BossVaultEngine, BossAurora } from './src/EnemiesRH2.js';
import { DeckManager } from './src/DeckManager.js';

let total = 0, failed = 0;
function check(label, cond, detail) {
  total++;
  if (!cond) failed++;
  const tag = cond ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}${detail ? ' — ' + detail : ''}`);
}
function group(name) { console.log('\n▸ ' + name); }

// ─── RunManager: seeded RNG lockstep ────────────────────────────────
group('RunManager — seeded RNG lockstep');
{
  const host = new RunManager(), client = new RunManager();
  host.setSeed(77); client.setSeed(77);
  check('same seed → same first value',
    host.getRng()() === client.getRng()());

  const hrng = host.getRng();
  for (let i = 0; i < 37; i++) hrng();
  client.setRngState(host.getRngState());
  check('setRngState re-locks streams',
    host.getRng()() === client.getRng()());

  host.setSeed(77); client.setSeed(77);
  const hr = host.getRng();
  for (let i = 0; i < 20; i++) hr();
  client.setRngState(host.getRngState());
  host.floor = 2; client.floor = 2;
  host.generateMap(); client.generateMap();
  const hTypes = Object.values(host.nodeMap).map(n => n.type).sort().join(',');
  const cTypes = Object.values(client.nodeMap).map(n => n.type).sort().join(',');
  check('floor-2 maps identical after combat-round sync', hTypes === cTypes);
}

// ─── Tempo: setValue triggers crashes at extremes ────────────────────
group('Tempo — setValue extremes trigger crash');
{
  const t = new TempoSystem(); t.crashResetValue = 50;
  t.setValue(70);   check('setValue(70) → value=70', t.value === 70);
  t.setValue(100);  check('setValue(100) → isCrashed', t.isCrashed);
  check('setValue(100) → value/target reset', t.value === 50 && t.targetValue === 50);

  const t2 = new TempoSystem(); t2.crashResetValue = 50;
  t2.setValue(5); t2.setValue(0);
  check('setValue(0) → cold crash', t2.isCrashed);

  const t3 = new TempoSystem(); t3.value = 100; t3.targetValue = 100;
  t3.setValue(100, true);
  check('setValue(100, isLerpStep=true) → no crash', !t3.isCrashed);
}

// ─── Enemy: RH2 bosses render via default draw() fallback ────────────
group('Enemy — RH2 bosses render via inherited draw()');
{
  const e = new Enemy(0, 0, 16, 50, 'test');
  check('Enemy.draw is a function', typeof e.draw === 'function');
  check('Enemy.draw routes through drawBody',
    e.draw.toString().includes('drawBody'));

  for (const [name, Cls] of [['HollowKing', BossHollowKing],
                             ['VaultEngine', BossVaultEngine],
                             ['Aurora', BossAurora]]) {
    let hit = false;
    const b = new Cls(0, 0);
    b.drawBody = () => { hit = true; };
    b.draw({ save(){}, restore(){} }, 0);
    check(`Boss${name}.draw → drawBody`, hit);
  }

  const dead = new Enemy(0, 0, 16, 1, 'corpse'); dead.alive = false;
  let drawn = false; dead.drawBody = () => { drawn = true; };
  dead.draw({}, 0);
  check('dead enemy → draw() is a no-op', !drawn);
}

// ─── Enemy: elite HP apply-then-override keeps host authoritative ────
group('Enemy — elite modifier apply order in sync path');
{
  const ok = new Enemy(0, 0, 16, 50, 'bruiser');
  ok.applyEliteModifier('armored'); ok.hp = 120; ok.maxHp = 120;
  check('apply-then-override: hp=host (no double multiply)',
    ok.hp === 120 && ok.maxHp === 120);

  const bad = new Enemy(0, 0, 16, 50, 'bruiser');
  bad.hp = 120; bad.maxHp = 120; bad.applyEliteModifier('armored');
  check('reverse order inflates HP (regression guard)', bad.hp > 120,
    `bad.hp=${bad.hp}`);
}

// ─── Players: allDownedOrDead & MP-safe heal filter ──────────────────
group('Players — wipe detection + MP-safe heal');
{
  const ps = new Players();
  const a = new Player(0, 0), b = new Player(0, 0);
  ps.add(a); ps.add(b);
  check('both standing → not wipe', !ps.allDownedOrDead());
  a.downed = true; check('one downed → not wipe', !ps.allDownedOrDead());
  b.downed = true; check('both downed → wipe', ps.allDownedOrDead());
  b.alive = false; b.downed = false;
  check('one downed + one dead → wipe', ps.allDownedOrDead());

  const ps2 = new Players();
  const local = new Player(0, 0); local.hp = 5; local.maxHp = 10;
  const remote = new Player(0, 0); remote.hp = 3; remote.maxHp = 10; remote._isRemote = true;
  ps2.add(local); ps2.add(remote);
  for (const p of ps2.list) if (p && p.alive && !p._isRemote) p.heal(3);
  check('heal local: 5→8', local.hp === 8);
  check('heal leaves remote placeholder untouched', remote.hp === 3);
  local.hp = 10;
  for (const p of ps2.list) if (p && p.alive && !p._isRemote) p.heal(3);
  check('heal clamps at maxHp', local.hp === 10);
}

// ─── Rest-node team vote (the ONLY screen that still uses voting) ───
// Draft / event / shop / upgrade are per-player picks with DECK_CARD_*
// broadcasts instead; rest stays a vote because the outcome (heal /
// upgrade / fortify) has to apply uniformly to everyone.
group('Rest-node team vote resolution');
{
  function makeVote() {
    let local = null, remote = null, applied = null;
    const resolve = () => {
      if (local == null || remote == null) return;
      if (local !== remote) return;
      applied = local; local = null; remote = null;
    };
    return {
      cast: (v, mp) => {
        local = v;
        if (!mp) { applied = local; local = null; return; }
        resolve();
      },
      receive: (v, mp) => {
        remote = v;
        if (!mp) { if (local != null) { applied = local; local = null; } return; }
        resolve();
      },
      get applied() { return applied; },
      get local()   { return local; },
      get remote()  { return remote; },
    };
  }

  const v1 = makeVote(); v1.cast('heal', false);
  check('solo cast → immediate apply', v1.applied === 'heal');

  const v2 = makeVote(); v2.cast('heal', true);
  check('MP cast only → pending', v2.applied === null && v2.local === 'heal');
  v2.receive('heal', true);
  check('MP matching remote → resolved', v2.applied === 'heal' && v2.local === null && v2.remote === null);

  const v3 = makeVote(); v3.cast('heal', true); v3.receive('fortify', true);
  check('MP mismatched → not resolved', v3.applied === null);
  v3.cast('fortify', true);
  check('MP change-vote → resolves', v3.applied === 'fortify');
}

// ─── Deck sync: per-player picks mirrored across peers ───────────────
// With the shared DeckManager, each peer broadcasts add / remove /
// upgrade so the other side's collection stays consistent without
// requiring both players to agree on the pick.
group('DeckManager — peer-mirrored add / remove / upgrade');
{
  const host = new DeckManager();
  const client = new DeckManager();
  host.initDeck(['strike']);
  client.initDeck(['strike']);

  // Host "picks" a card (e.g. from draft): local add + broadcast.
  host.addCard('lunge');
  // Simulated DECK_CARD_ADDED arrives at client.
  client.addCard('lunge');
  check('after DECK_CARD_ADDED, collections match',
    JSON.stringify(host.collection) === JSON.stringify(client.collection));

  // Duplicate broadcast (both sides picked the same card in a race):
  // addCard returns false if already present, so no double-add.
  const hostRet = host.addCard('lunge');
  check('duplicate addCard is a no-op (race-safe)', hostRet === false);

  // Host "sells" a card via merchant event.
  host.removeCard('strike');
  client.removeCard('strike');
  check('after DECK_CARD_REMOVED, collections match',
    JSON.stringify(host.collection) === JSON.stringify(client.collection));

  // Upgrades are per-player — the host upgrading MUST NOT mirror onto
  // the client, otherwise both players benefit from one upgrade pick.
  host.upgradeCard('lunge');
  check('after upgrade on host only, client upgrades stay empty',
    JSON.stringify(client.upgrades) === '{}',
    `client.upgrades=${JSON.stringify(client.upgrades)}`);
  check('host upgrades reflect the pick',
    host.upgrades.lunge === 1);
}

console.log(`\n${failed === 0 ? '✓' : '✗'}  ${total - failed}/${total} checks passed`
  + (failed ? `  (${failed} failed)` : ''));
process.exit(failed === 0 ? 0 : 1);
