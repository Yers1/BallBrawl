import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../src/sim.js';
import { ORDER } from '../src/balls.js';
import { freshSave, migrate, mergeSave, openChest, CHESTS, hasSkin, buySkin, equipSkin, winChest, startUnlock, openSlot, speedUp, slotLeft, gemsToOpen, CHEST_TIME, CHEST_CYCLE, FRAG_NEED, buy, owns, wear, dailyDeals, buyDeal, adGems } from '../src/progress.js';

test('wins fill 4 slots in the published order; unlocking takes time, gems or ads skip it', () => {
  const s = freshSave();
  const got = [0, 1, 2, 3].map(() => winChest(s));
  assert.deepEqual(got, CHEST_CYCLE.slice(0, 4));
  assert.equal(winChest(s), null, 'full slots: no chest');
  assert.ok(startUnlock(s, 0, 1000));
  assert.ok(!startUnlock(s, 1, 1000), 'one at a time');
  assert.equal(openSlot(s, 0, 1000, rng(1)), null, 'not ready yet');
  assert.equal(slotLeft(s.slots[0], 1000), CHEST_TIME.box);
  assert.ok(speedUp(s, 0, 60e3));
  s.gems = 1;
  assert.equal(openSlot(s, 0, 1000, rng(1), true), null, 'not enough gems');
  s.gems = gemsToOpen(CHEST_TIME.box);
  const r = openSlot(s, 0, 1000, rng(1), true);
  assert.ok(r && r.coins > 0, 'opened for gems');
  assert.equal(s.slots[0], null);
  assert.ok(startUnlock(s, 1, 2000));
  assert.ok(openSlot(s, 1, 2000 + CHEST_TIME[s.slots[1].kind], rng(2)), 'free once the timer is done');
});

test('a chest opens once, pays coins in range, and only drops things you do not have', () => {
  const s = freshSave();
  assert.equal(openChest(s, 'box', Math.random), null, 'no chest, nothing');
  s.chests.mega = 40;
  const rand = rng(11);
  for (let i = 0; i < 40; i++) {
    const before = s.coins, owned = s.owned.length, skins = s.skins.length;
    const r = openChest(s, 'mega', rand);
    const c = CHESTS.mega, extra = 10 * c.frags[1] * c.stacks; // coins replace fragments once every skin is collected
    assert.ok(r.coins >= c.coins[0] && r.coins <= c.coins[1] + extra);
    assert.equal(s.coins, before + r.coins);
    assert.equal(r.gems, c.gems);
    if (r.ball) assert.equal(s.owned.length, owned + 1);
    assert.equal(s.skins.length, skins + (r.skin ? 1 : 0) + r.frags.filter(f => f.done).length, 'a whole skin plus any finished by fragments');
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
  const a = { ...freshSave(), chests: { box: 2, big: 0, mega: 1 } };
  const b = { ...freshSave(), chests: { box: 1, big: 3, mega: 0 }, accountGift: true };
  const m = mergeSave(a, b, { trophies: 0, max_trophies: 0 });
  assert.deepEqual(m.chests, { box: 2, big: 3, mega: 1 });
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

test('ball ranks, leagues and titles', async () => {
  const { gainMastery, ballRank, leagueFor, titleOk, RANKS } = await import('../src/progress.js');
  const s = freshSave();
  s.owned.push('leech');
  assert.equal(ballRank(0), 1);
  assert.equal(ballRank(RANKS.at(-1)), RANKS.length);
  const ups = gainMastery(s, ['leech', 'leech', 'ninja'], true);
  assert.equal(s.mastery.leech, 10, 'a ball counts once per fight');
  assert.equal(s.mastery.ninja, undefined, 'not owned, no points');
  assert.deepEqual(ups, []);
  s.mastery.leech = 15;
  const c = s.coins;
  assert.deepEqual(gainMastery(s, ['leech'], true), [{ id: 'leech', rank: 2, coins: 25 }]);
  assert.equal(s.coins, c + 25);
  s.mastery.leech = 275;
  assert.ok(!hasSkin(s, 'leech', 'gold'), 'gold comes at rank 7');
  assert.ok(!buySkin(s, 'leech', 'gold'), 'and is never sold');
  assert.deepEqual(gainMastery(s, ['leech'], true), [{ id: 'leech', rank: 7, skin: 'gold' }]);
  assert.ok(hasSkin(s, 'leech', 'gold'));
  s.coins = 60;
  assert.ok(buySkin(s, 'leech', 'silver'), 'silver costs 60');
  assert.equal(s.coins, 0);
  assert.deepEqual(leagueFor(0), { id: 'bronze', tier: 1, next: 34 });
  assert.equal(leagueFor(99).tier, 3);
  assert.equal(leagueFor(100).id, 'silver');
  assert.deepEqual(leagueFor(5000), { id: 'master', tier: 0, next: null });
  assert.ok(titleOk(s, 'rookie'));
  assert.ok(!titleOk(s, 'master_leech'));
  s.mastery.leech = 9999;
  assert.ok(titleOk(s, 'master_leech'));
  assert.equal(migrate({ title: 'nope', mastery: { leech: -3, zzz: 5 } }).title, 'rookie');
  assert.deepEqual(migrate({ mastery: { leech: -3, zzz: 5, ninja: 7 } }).mastery, { ninja: 7 });
  const m = mergeSave({ ...freshSave(), mastery: { ninja: 3 } }, { ...freshSave(), mastery: { ninja: 9, ice: 1 } }, { trophies: 0, max_trophies: 0 });
  assert.deepEqual(m.mastery, { ninja: 9, ice: 1 });
});

test('chests give fragments; 10 fragments make the skin', () => {
  const s = freshSave();
  s.frags['basic:neon'] = FRAG_NEED - 1;
  let done = false;
  for (let i = 0; i < 20 && !done; i++) {
    s.chests.box = 1;
    const r = openChest(s, 'box', rng(i + 3));
    assert.ok(r.frags.length >= 1 && r.frags.length <= CHESTS.box.stacks);
    done = r.frags.some(f => f.key === 'basic:neon' && f.done);
  }
  assert.ok(done && hasSkin(s, 'basic', 'neon') && !('basic:neon' in s.frags), 'the skin was assembled');
  assert.equal(migrate({ frags: { 'basic:neon': 3, 'basic:gold': 2, 'nope:x': 1, 'basic:rainbow': 4 } }).frags['basic:neon'], 3);
  assert.deepEqual(Object.keys(migrate({ frags: { 'basic:gold': 2, 'nope:x': 1, 'basic:rainbow': 4 } }).frags), [], 'gold, gift and junk rejected');
});

test('slot chests merge by id and never come back once opened', () => {
  const a = freshSave();
  winChest(a); winChest(a);
  const cloud = migrate(a);
  startUnlock(a, 0, 0);
  openSlot(a, 0, CHEST_TIME.box, rng(1));
  const m = mergeSave(a, cloud, { trophies: 0, max_trophies: 0 });
  assert.equal(m.slots.filter(Boolean).length, 1, 'the opened one stays opened');
});

test('shop: buy with coins or gems, wear, daily deals, ad gems', () => {
  const s = freshSave();
  assert.ok(owns(s, 'banner', 'night') && owns(s, 'deco', 'none'), 'defaults are free');
  assert.ok(!buy(s, 'aura', 'fire'), 'no gems');
  s.gems = 100;
  assert.ok(buy(s, 'aura', 'fire'));
  assert.equal(s.gems, 60);
  assert.equal(s.wear.aura, 'fire');
  wear(s, 'aura', null);
  assert.equal(s.wear.aura, null);
  wear(s, 'aura', 'stars');
  assert.equal(s.wear.aura, null, 'cannot wear what you do not own');
  s.coins = 1000;
  const deals = dailyDeals(s, '2026-10-10');
  assert.ok(deals.length >= 2);
  assert.deepEqual(dailyDeals(s, '2026-10-10').map(d => d.key), deals.map(d => d.key), 'same deals all day');
  assert.ok(buyDeal(s, deals[0]));
  assert.ok(!buyDeal(s, dailyDeals(s, '2026-10-10')[0]), 'once');
  const g = s.gems;
  for (let i = 0; i < 9; i++) adGems(s, '2026-10-10');
  assert.equal(s.gems, g + 10, '5 ads a day, 2 gems each');
  const m = migrate({ own: { aura: ['fire', 'nope'] }, wear: { aura: 'stars', banner: 'red' } });
  assert.deepEqual(m.own.aura, ['fire']);
  assert.equal(m.wear.aura, null);
  assert.equal(m.wear.banner, 'night');
});

test('15 emotes: 4 free, the rest bought or dropped', async () => {
  const { EMOTE_LIST, SHOP } = await import('../src/progress.js');
  assert.equal(EMOTE_LIST.length, 15);
  const s = freshSave();
  assert.equal(EMOTE_LIST.filter(e => owns(s, 'emote', e.id)).length, 4);
  s.coins = 150;
  assert.ok(buy(s, 'emote', 'leech_laugh'));
  assert.ok(owns(s, 'emote', 'leech_laugh'));
  assert.ok(Object.keys(SHOP.emote).length === 15);
});

test('inbox gifts are claimed once, also across devices', () => {
  const a = { ...freshSave(), mailClaimed: [0, 7] }, b = { ...freshSave(), mailClaimed: [7, 9] };
  assert.deepEqual(mergeSave(a, b, { trophies: 0, max_trophies: 0 }).mailClaimed.sort(), [0, 7, 9]);
  assert.deepEqual(migrate({ mailClaimed: [1, 'x', 2.5] }).mailClaimed, [1]);
});
