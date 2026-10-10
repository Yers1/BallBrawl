import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../src/sim.js';
import { ORDER } from '../src/balls.js';
import { freshSave, migrate, mergeSave, openChest, CHESTS, hasSkin, buySkin, equipSkin, winChest, startUnlock, openSlot, speedUp, slotLeft, gemsToOpen, CHEST_TIME, CHEST_CYCLE, FRAG_NEED, buy, owns, wear, dailyDeals, buyDeal, adGems, SHOP } from '../src/progress.js';

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
  assert.equal(arenaFor(59).id, 'night');
  assert.equal(arenaFor(60).id, 'candy');
  assert.equal(arenaFor(120).id, 'canyon');
  const { MAPS } = await import('../src/sim.js');
  for (const a of ARENAS) assert.ok(MAPS[a.id], `map for ${a.id}`);
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

test('23 emotes: 4 free, the rest bought or dropped', async () => {
  const { EMOTE_LIST, SHOP } = await import('../src/progress.js');
  assert.equal(EMOTE_LIST.length, 23);
  const s = freshSave();
  assert.equal(EMOTE_LIST.filter(e => owns(s, 'emote', e.id)).length, 4);
  s.coins = 150;
  assert.ok(buy(s, 'emote', 'leech_laugh'));
  assert.ok(owns(s, 'emote', 'leech_laugh'));
  assert.ok(Object.keys(SHOP.emote).length === 23);
});

test('inbox gifts are claimed once, also across devices', () => {
  const a = { ...freshSave(), mailClaimed: [0, 7] }, b = { ...freshSave(), mailClaimed: [7, 9] };
  assert.deepEqual(mergeSave(a, b, { trophies: 0, max_trophies: 0 }).mailClaimed.sort(), [0, 7, 9]);
  assert.deepEqual(migrate({ mailClaimed: [1, 'x', 2.5] }).mailClaimed, [1]);
});

test('experience: levels pay coins and gems; every 5th level pays more', async () => {
  const { gainXp, levelOf, xpNeed } = await import('../src/progress.js');
  const s = freshSave();
  assert.equal(levelOf(0).lv, 1);
  const ups = gainXp(s, xpNeed(1) + xpNeed(2));
  assert.deepEqual(ups.map(u => u.lv), [2, 3]);
  assert.equal(levelOf(s.xp).lv, 3);
  s.xp = 0;
  let total = 0;
  for (let lv = 1; lv < 5; lv++) total += xpNeed(lv);
  assert.equal(gainXp(s, total).at(-1).gems, 10);
});

test('new achievements count chests, skins, level, ball rank', async () => {
  const { ACHIEVEMENTS, achievementValue } = await import('../src/progress.js');
  const s = freshSave();
  s.chests.box = 1;
  openChest(s, 'box', rng(2));
  const v = id => achievementValue(s, ACHIEVEMENTS.find(a => a.id === id));
  assert.equal(v('chests10'), 1);
  assert.equal(v('level5'), 1);
  s.mastery.basic = 9999;
  assert.equal(v('rank10'), 10);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
});

test('every arena opens its own balls, and the road gives each one at its mark', async () => {
  const { UNLOCK, ARENAS, arenaFor, PATH } = await import('../src/progress.js');
  const per = Object.fromEntries(ARENAS.map(a => [a.id, ORDER.filter(id => arenaFor(UNLOCK[id]).id === a.id).length]));
  assert.deepEqual(per, { night: 3, candy: 1, canyon: 3, pirate: 1, frost: 2, stadium: 1, jungle: 1, temple: 1, lava: 1, chess: 1, space: 1, neon: 0 });
  for (const id of ORDER) if (id !== 'basic') assert.ok(PATH.some(n => n.ball === id && n.at === UNLOCK[id]), id);
  const ats = PATH.map(n => n.at);
  assert.equal(new Set(ats).size, ats.length, 'one reward per mark');
  assert.deepEqual([...ats].sort((a, b) => a - b), ats, 'in order');
});

test('a purchase is never refunded by an older cloud copy', () => {
  const cloud = freshSave(); cloud.coins = 6000; cloud.gems = 100;
  const s = migrate(JSON.parse(JSON.stringify(cloud)));
  assert.ok(buy(s, 'banner', Object.keys(SHOP.banner).find(id => SHOP.banner[id].coins >= 2500)));
  const spent = 6000 - s.coins;
  const m = mergeSave(s, cloud, { trophies: 0, max_trophies: 0 });
  assert.equal(m.coins, 6000 - spent, 'the stale cloud copy does not give the coins back');
  const earnedElsewhere = migrate(JSON.parse(JSON.stringify(cloud))); earnedElsewhere.coins += 50;
  assert.equal(mergeSave(s, earnedElsewhere, { trophies: 0, max_trophies: 0 }).coins, 6050 - spent, 'coins earned on the other copy still count');
});

test('daily deals stay put all day after buying one', () => {
  const s = freshSave(); s.coins = 99999; s.gems = 9999; s.owned = ['basic', 'leech', 'cell'];
  const before = dailyDeals(s, '2026-10-11').map(d => d.kind + (d.id ?? d.ball + d.style));
  assert.ok(buyDeal(s, dailyDeals(s, '2026-10-11')[1]));
  const after = dailyDeals(migrate(JSON.parse(JSON.stringify(s))), '2026-10-11');
  assert.deepEqual(after.map(d => d.kind + (d.id ?? d.ball + d.style)), before);
  assert.deepEqual(after.map(d => d.sold), [false, true, false].slice(0, after.length));
});

test('the Glory Road never gives a skin for a ball still locked at that mark', async () => {
  const { PATH, UNLOCK } = await import('../src/progress.js');
  for (const n of PATH) if (n.skin) assert.ok(UNLOCK[n.skin[0]] <= n.at, `${n.at}: ${n.skin}`);
});

test('familiar: XP from fights, a coin price to level up, capped by the arena; looks are bought once', async () => {
  const { famCap, famPar, famNeed, famXp, famUpgrade, famBuy, famBuff, FAM_COST } = await import('../src/progress.js');
  const s = freshSave();
  assert.deepEqual([s.fam.lv, s.fam.skin], [1, 'king']);
  assert.equal(famCap(0), 2, 'first arena: up to level 2');
  assert.equal(famPar(0), 1, 'the computer brings level 1 there');
  assert.ok(famCap(5000) <= 10 && famCap(5000) > famCap(0));
  s.coins = 10000;
  assert.ok(!famUpgrade(s), 'needs XP first');
  famXp(s, 1000);
  assert.equal(s.fam.xp, famNeed(1), 'XP stops at the bar');
  assert.ok(famUpgrade(s));
  assert.equal(s.coins, 10000 - FAM_COST[2]);
  famXp(s, 1000);
  assert.ok(!famUpgrade(s), 'level 2 is the most in the first arena');
  assert.ok(famBuff(2).hp > famBuff(1).hp && famBuff(1).hp > 1 && famBuff(1).dmg > 1);
  s.gems = 100;
  assert.ok(famBuy(s, 'owl') && s.fam.skin === 'owl' && s.gems === 55);
  assert.ok(!famBuy(s, 'owl'), 'once');
  const m = mergeSave(freshSave(), s, { trophies: 0, max_trophies: 0 });
  assert.equal(m.fam.lv, 2);
  assert.ok(m.fam.own.includes('owl'));
  assert.equal(migrate({ fam: { lv: 99, skin: 'nope', own: ['nope'] } }).fam.lv, 10, 'validated');
});
