import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, BALLS } from '../src/balls.js';
import {
  UNLOCK, aiLevel, enemyHpMulFor, applyResult, winCoinsFor, enemySquadFor, freshSave, migrate,
  pathNodes, claimable, claim, SKINS, buySkin, dayKey, prevDay, refreshQuests, track, claimQuest, QUESTS,
  dailyState, claimDaily, DAILY, ACHIEVEMENTS, claimAchievement, achievementValue,
} from '../src/progress.js';

test('every ball has a path unlock, in roster order', () => {
  assert.deepEqual(Object.keys(UNLOCK), ORDER);
  for (let i = 1; i < ORDER.length; i++) assert.ok(UNLOCK[ORDER[i]] > UNLOCK[ORDER[i - 1]]);
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
  assert.deepEqual(ready.map(n => n.at), [10, 20, 30]);
  const r = ready.map(n => claim(s, n));
  assert.ok(s.owned.includes('leech'));
  assert.equal(r[2].coins, BALLS.cell.price / 2, 'already owned cell pays coins');
  assert.equal(claimable(s).length, 0);
  s.trophies = 0;
  assert.ok(s.owned.includes('leech'), 'dropping trophies never takes rewards back');
  const nodes = pathNodes(5000);
  assert.ok(nodes.at(-1).at >= 5000 && nodes.at(-1).coins > 0, 'endless coin nodes after the last reward');
  for (const id of ORDER.slice(1)) assert.ok(nodes.some(n => n.ball === id), `${id} on the path`);
});

test('skins: buy with coins, equip per ball', () => {
  const s = freshSave();
  s.coins = 1000;
  assert.ok(Object.keys(SKINS).length >= 6);
  assert.equal(buySkin(s, 'basic', 'gold'), true);
  assert.equal(s.skinOf.basic, 'gold');
  assert.equal(buySkin(s, 'basic', 'gold'), false, 'not twice');
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
