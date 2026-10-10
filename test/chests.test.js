import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../src/sim.js';
import { ORDER } from '../src/balls.js';
import { freshSave, migrate, mergeSave, openChest, winTowardChest, CHESTS, CHEST_WINS, hasSkin, buySkin, equipSkin } from '../src/progress.js';

test('every CHEST_WINS wins drop a box', () => {
  const s = freshSave();
  for (let i = 1; i < CHEST_WINS; i++) assert.equal(winTowardChest(s), false);
  assert.equal(winTowardChest(s), true);
  assert.equal(s.chests.box, 1);
  assert.equal(s.chestWins, 0);
});

test('a chest opens once, pays coins in range, and only drops things you do not have', () => {
  const s = freshSave();
  assert.equal(openChest(s, 'box', Math.random), null, 'no chest, nothing');
  s.chests.mega = 40;
  const rand = rng(11);
  for (let i = 0; i < 40; i++) {
    const before = s.coins, owned = s.owned.length, skins = s.skins.length;
    const r = openChest(s, 'mega', rand);
    assert.ok(r.coins >= CHESTS.mega.coins[0] && r.coins <= CHESTS.mega.coins[1]);
    assert.equal(s.coins, before + r.coins);
    if (r.ball) assert.equal(s.owned.length, owned + 1);
    if (r.skin) assert.equal(s.skins.length, skins + 1, 'a mega always has a skin while any are left');
  }
  assert.equal(s.chests.mega, 0);
  assert.equal(new Set(s.owned).size, s.owned.length, 'never a duplicate ball');
  assert.equal(new Set(s.skins).size, s.skins.length, 'never a duplicate skin');
  assert.ok(s.owned.length <= ORDER.length);
});

test('the rainbow skin is an account gift: on every owned ball, never for sale, survives a reload', () => {
  const s = freshSave();
  s.coins = 1000;
  assert.equal(hasSkin(s, 'basic', 'rainbow'), false);
  assert.equal(buySkin(s, 'basic', 'rainbow'), false, 'not sold');
  s.accountGift = true;
  assert.equal(hasSkin(s, 'basic', 'rainbow'), true);
  assert.equal(hasSkin(s, 'leech', 'rainbow'), false, 'only balls you own');
  equipSkin(s, 'basic', 'rainbow');
  const again = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(again.skinOf.basic, 'rainbow');
  assert.equal(migrate({ skinOf: { basic: 'rainbow' } }).skinOf.basic, undefined, 'no account, no rainbow');
});

test('chests and the gift merge across devices', () => {
  const a = { ...freshSave(), chests: { box: 2, big: 0, mega: 1 }, chestWins: 1 };
  const b = { ...freshSave(), chests: { box: 1, big: 3, mega: 0 }, chestWins: 2, accountGift: true };
  const m = mergeSave(a, b, { trophies: 0, max_trophies: 0 });
  assert.deepEqual(m.chests, { box: 2, big: 3, mega: 1 });
  assert.equal(m.chestWins, 1, 'a dropped more win chests, so its meter is the newer one');
  assert.equal(m.accountGift, true);
  assert.deepEqual(migrate({ chests: { box: -5, big: 'x', mega: 1e12 } }).chests, { box: 0, big: 0, mega: 999 }, 'validated');
});

test('an opened chest does not come back from a stale cloud copy', () => {
  const cloud = { ...freshSave(), chests: { box: 0, big: 3, mega: 0 } };
  const local = migrate(cloud);
  for (let i = 0; i < 3; i++) openChest(local, 'big', rng(i + 1));
  const coins = local.coins;
  const m = mergeSave(local, cloud, { trophies: 0, max_trophies: 0 });
  assert.equal(m.chests.big, 0, 'no dupe');
  assert.equal(m.coins, coins, 'loot kept');
  const other = migrate(cloud); // a second device opens one of the same three
  openChest(other, 'big', rng(9));
  assert.equal(mergeSave(other, m, { trophies: 0, max_trophies: 0 }).chests.big, 0);
});

test('arenas unlock by best trophies and never go back', async () => {
  const { ARENAS, arenaFor } = await import('../src/progress.js');
  const { THEMES } = await import('../src/themes.js');
  assert.equal(arenaFor(0).id, 'night');
  assert.equal(arenaFor(119).id, 'night');
  assert.equal(arenaFor(120).id, 'canyon');
  assert.equal(arenaFor(99999).id, ARENAS.at(-1).id);
  for (const a of ARENAS) assert.ok(THEMES[a.id], `theme for ${a.id}`);
  assert.equal(migrate({ arenaSeen: 'nope' }).arenaSeen, 'night', 'validated');
});
