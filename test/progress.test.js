import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, BALLS } from '../src/balls.js';
import {
  UNLOCK, aiLevel, enemyHpMulFor, applyResult, winCoinsFor, enemySquadFor, freshSave, migrate,
  pathNodes, claimable, claim, SKINS, buySkin, dayKey, prevDay, refreshQuests, track, claimQuest, QUESTS, PATH,
  dailyState, claimDaily, DAILY, ACHIEVEMENTS, claimAchievement, achievementValue,
} from '../src/progress.js';

test('every ball has a path unlock; screens list them in unlock order', async () => {
  const { BY_UNLOCK } = await import('../src/progress.js');
  assert.deepEqual(Object.keys(UNLOCK).sort(), [...ORDER].sort());
  for (let i = 1; i < BY_UNLOCK.length; i++) assert.ok(UNLOCK[BY_UNLOCK[i]] > UNLOCK[BY_UNLOCK[i - 1]]);
});

test('trophies: +8 a win (+1 flawless), growing loss, never below 0, best is kept', () => {
  const s = freshSave();
  assert.equal(applyResult(s, 0, true), 9);
  assert.equal(applyResult(s, 0, false), 8);
  assert.equal(s.trophies, 17);
  assert.equal(applyResult(s, 1), -2);
  s.trophies = 1;
  assert.equal(applyResult(s, 1), -1, 'floored at 0');
  assert.equal(s.trophies, 0);
  assert.equal(s.maxTrophies, 17);
  s.trophies = 1500;
  assert.equal(applyResult(s, 1), -8, 'loss penalty caps at 8');
  assert.equal(applyResult(s, 'draw'), 0);
});

test('AI keeps getting harder past the level cap, so trophies cannot inflate forever', () => {
  assert.equal(aiLevel(0), 1);
  assert.equal(aiLevel(1160), 30);
  assert.equal(aiLevel(5000), 30);
  assert.ok(enemyHpMulFor(2000) > enemyHpMulFor(1160));
  assert.ok(winCoinsFor(0) >= 15 && winCoinsFor(1e6) <= 40);
});

test('enemy squads only use balls unlocked around your trophies', () => {
  let s = 0;
  const rand = () => (s = (s + 0.37) % 1);
  assert.deepEqual(enemySquadFor(0, rand).filter(id => UNLOCK[id] > 60), []);
  for (const tr of [0, 100, 300, 700]) for (const id of enemySquadFor(tr, rand)) assert.ok(UNLOCK[id] <= tr + 60);
});

test('old saves migrate: ladder level becomes trophies, owned balls and coins stay', () => {
  const s = migrate({ coins: 77, owned: ['basic', 'train'], squad: ['train', 'basic', 'basic'], level: 9, matches: 12 });
  assert.equal(s.trophies, 120);
  assert.equal(s.maxTrophies, 120);
  assert.equal(s.coins, 77);
  assert.deepEqual(s.owned, ['basic', 'train']);
  assert.equal(migrate(s).trophies, 120, 'idempotent');
});

test('path: nodes claim once by best trophies, never lost, owned ball → coins instead', () => {
  const s = freshSave();
  s.owned = ['basic', 'cell'];
  s.maxTrophies = 30;
  const ready = claimable(s);
  assert.deepEqual(ready.map(n => n.at), [5, 10, 20, 30]);
  const r = ready.map(n => claim(s, n));
  assert.equal(s.chests.box, 1, 'the first node is a chest');
  assert.ok(s.owned.includes('leech'));
  assert.equal(r[3].coins, BALLS.cell.price / 2, 'already owned cell pays coins');
  assert.equal(claimable(s).length, 0);
  s.trophies = 0;
  assert.ok(s.owned.includes('leech'), 'dropping trophies never takes rewards back');
  const nodes = pathNodes(5000);
  assert.ok(nodes.at(-1).at >= 5000 && (nodes.at(-1).coins > 0 || nodes.at(-1).chest), 'endless nodes after the last reward');
  assert.ok(PATH.at(-1).at >= 3000, 'a long road');
  const ats = PATH.map(n => n.at);
  assert.deepEqual(ats, [...new Set(ats)].sort((a, b) => a - b), 'positions are unique and in order');
  for (const id of ORDER.slice(1)) assert.ok(nodes.some(n => n.ball === id), `${id} on the path`);
});

test('skins: buy with coins, equip per ball', () => {
  const s = freshSave();
  s.coins = 1000;
  assert.ok(Object.keys(SKINS).length >= 6);
  assert.equal(buySkin(s, 'basic', 'candy'), true);
  assert.equal(s.skinOf.basic, 'candy');
  assert.equal(buySkin(s, 'basic', 'candy'), false, 'not twice');
  assert.equal(buySkin(s, 'train', 'neon'), false, 'not for balls you do not own');
});

test('daily quests: 3 per day, same for everyone that day, progress and claim once', () => {
  const s = freshSave();
  refreshQuests(s, '2026-10-8');
  assert.equal(s.quests.list.length, 3);
  assert.equal(new Set(s.quests.list.map(q => q.id)).size, 3);
  const again = freshSave();
  refreshQuests(again, '2026-10-8');
  assert.deepEqual(again.quests.list.map(q => q.id), s.quests.list.map(q => q.id));
  const q = s.quests.list[0], def = QUESTS.find(d => d.id === q.id);
  track(s, { [def.stat]: def.goal });
  const before = s.coins;
  assert.equal(claimQuest(s, q.id), def.coins);
  assert.equal(s.coins, before + def.coins);
  assert.equal(claimQuest(s, q.id), 0);
  refreshQuests(s, '2026-10-9');
  assert.ok(s.quests.list.every(q => q.progress === 0 && !q.claimed), 'new day, new quests');
});

test('daily reward: streak grows on consecutive days, resets after a gap, day 7 is a known skin', () => {
  const s = freshSave();
  let day = '2026-10-1';
  for (let i = 0; i < 6; i++) {
    assert.equal(dailyState(s, day).canClaim, true);
    assert.equal(claimDaily(s, day).coins, DAILY[i]);
    assert.equal(dailyState(s, day).canClaim, false);
    day = `2026-10-${2 + i}`;
  }
  const preview = dailyState(s, day).skin;
  assert.ok(preview, 'day-7 skin is shown in advance');
  assert.deepEqual(claimDaily(s, day).skin, preview);
  assert.equal(dailyState(s, '2026-10-20').day, 0, 'a missed day restarts the streak');
  assert.equal(prevDay('2026-3-1'), '2026-2-28');
  assert.match(dayKey(new Date(2026, 9, 8)), /^2026-10-8$/);
});

test('achievements unlock from stats and pay once', () => {
  const s = freshSave();
  const a = ACHIEVEMENTS.find(a => a.id === 'firstWin');
  assert.equal(claimAchievement(s, 'firstWin'), 0);
  track(s, { wins: 1 });
  assert.equal(achievementValue(s, a), 1);
  assert.equal(claimAchievement(s, 'firstWin'), a.coins);
  assert.equal(claimAchievement(s, 'firstWin'), 0);
});

test('cloud merge keeps everything from both sides, trophies from the server', async () => {
  const { mergeSave } = await import('../src/progress.js');
  const local = { ...freshSave(), coins: 50, owned: ['basic', 'train'], claimed: [10], trophies: 999, stats: { ...freshSave().stats, wins: 3 },
    quests: { day: '2026-10-8', list: [{ id: 'win3', progress: 1, claimed: false }] } };
  const cloud = { ...freshSave(), coins: 80, owned: ['basic', 'ice'], claimed: [20], skins: ['ice:gold'], stats: { ...freshSave().stats, wins: 5 },
    quests: { day: '2026-10-8', list: [{ id: 'win3', progress: 3, claimed: true }] } };
  const m = mergeSave(local, cloud, { trophies: 120, max_trophies: 150 });
  assert.equal(m.coins, 80);
  assert.deepEqual(m.owned.sort(), ['basic', 'ice', 'train']);
  assert.deepEqual(m.claimed.sort(), [10, 20]);
  assert.deepEqual(m.skins, ['ice:gold']);
  assert.equal(m.stats.wins, 5);
  assert.deepEqual(m.quests.list[0], { id: 'win3', progress: 3, claimed: true });
  assert.equal(m.trophies, 120, 'the server owns trophies');
  assert.equal(m.maxTrophies, 150);
  const newer = mergeSave(local, { ...cloud, quests: { day: '2026-10-10', list: [] } }, { trophies: 0, max_trophies: 0 });
  assert.equal(newer.quests.day, '2026-10-10', '10 > 8 even though "10" < "8" as text');
});
