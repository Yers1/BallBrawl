import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, launch, hurt, SPAWN } from '../src/sim.js';
import { ORDER } from '../src/balls.js';
import {
  LEVELS, LOSE_COINS, createMatch, roundWorld, endRound, revive,
  enemySquad, enemyHpMul, winCoins, poolSize, aiAngle,
} from '../src/match.js';

const finish = (w, winner, hp) => {
  const [a, b] = w.ents;
  const loser = winner === 0 ? b : a;
  hurt(w, loser, 999);
  if (hp != null) (winner === 0 ? a : b).hp = hp;
  w.result = winner;
};

test('round winner keeps its HP, loser front ball is removed', () => {
  const m = createMatch({ squadA: ['basic', 'leech', 'cell'], squadB: ['basic', 'basic', 'basic'] });
  const w = roundWorld(m);
  finish(w, 0, 40);
  assert.equal(endRound(m, w), null);
  assert.equal(m.a[0].hp, 40);
  assert.equal(m.b.length, 2);
  const w2 = roundWorld(m);
  assert.equal(w2.ents[0].hp, 40, 'carried into the next round');
});

test('emptying a squad ends the match', () => {
  const m = createMatch({ squadA: ['basic'], squadB: ['basic'] });
  const w = roundWorld(m);
  finish(w, 1);
  assert.equal(endRound(m, w), 1);
  assert.equal(m.result, 1);
});

test('a draw removes both front balls', () => {
  const m = createMatch({ squadA: ['basic', 'basic'], squadB: ['basic', 'basic'] });
  const w = roundWorld(m);
  w.result = 'draw';
  endRound(m, w);
  assert.equal(m.a.length, 1);
  assert.equal(m.b.length, 1);
});

test('surviving cell minis carry their summed HP and cannot split again', () => {
  const m = createMatch({ squadA: ['cell', 'basic'], squadB: ['basic', 'basic'] });
  const w = roundWorld(m);
  hurt(w, w.ents[0], 999);
  const minis = w.ents.filter(e => e.mini);
  minis[0].hp = 10; minis[1].hp = 15;
  hurt(w, w.ents[1], 999);
  w.result = 0;
  endRound(m, w);
  assert.deepEqual(m.a[0], { id: 'cell', hp: 25, split: true });
});

test('revive brings the last lost ball back at 50% HP, once', () => {
  const m = createMatch({ squadA: ['leech'], squadB: ['basic', 'basic'] });
  const w = roundWorld(m);
  finish(w, 1);
  assert.equal(endRound(m, w), 1);
  revive(m);
  assert.equal(m.result, null);
  assert.deepEqual(m.a, [{ id: 'leech', hp: 45 }]);
  assert.equal(m.revived, true);
});

test('ladder formulas', () => {
  assert.equal(LEVELS, 30);
  assert.equal(LOSE_COINS, 5);
  assert.equal(enemyHpMul(1), 1);
  assert.ok(Math.abs(enemyHpMul(30) - 2.45) < 1e-9);
  assert.equal(winCoins(7), 34);
  assert.equal(poolSize(1), 1);
  assert.equal(poolSize(LEVELS), ORDER.length);
  for (let l = 2; l <= LEVELS; l++) assert.ok(poolSize(l) >= poolSize(l - 1));
});

test('enemy squads are 3 balls from the level pool', () => {
  let s = 0;
  const rand = () => (s = (s + 0.37) % 1);
  assert.deepEqual(enemySquad(1, rand), ['basic', 'basic', 'basic']);
  for (let l = 1; l <= LEVELS; l++) {
    const sq = enemySquad(l, rand);
    assert.equal(sq.length, 3);
    assert.ok(sq.every(id => ORDER.indexOf(id) < poolSize(l)));
  }
});

test('AI aim gets sharper with level', () => {
  const worst = l => Math.abs(aiAngle(0, 0, 1, 0, l, () => 1));
  assert.ok(Math.abs(worst(1) - 0.9) < 1e-9);
  assert.ok(worst(LEVELS) <= 0.1 + 1e-9);
});

test('a full AI-vs-AI match always finishes', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = createMatch({ squadA: ['train', 'cell', 'leech'], squadB: ['spider', 'ninja', 'basic'], hpMulB: 1.2, seed });
    let guard = 0;
    while (m.result == null && guard++ < 20) {
      const w = roundWorld(m);
      const r = () => w.rand();
      launch(w, aiAngle(...SPAWN[0], ...SPAWN[1], 15, r), aiAngle(...SPAWN[1], ...SPAWN[0], 15, r));
      for (let i = 0; i < 60 * 90 && w.result == null; i++) step(w, 1 / 60);
      assert.notEqual(w.result, null, 'round ends (sudden death)');
      endRound(m, w);
    }
    assert.ok([0, 1, 'draw'].includes(m.result));
  }
});
