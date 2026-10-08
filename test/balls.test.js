import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, hurt, DMG } from '../src/sim.js';
import { BALLS, ORDER, CELL, WEB, NINJA, TRAIN, LEECH } from '../src/balls.js';

const DT = 1 / 60;
const HEAD_ON = Math.round(DMG * 1.5); // full-ram contact damage
const run = (w, secs) => { for (let i = 0; i < Math.round(secs / DT) && w.result == null; i++) step(w, DT); };
const place = (e, x, y, vx = 0, vy = 0) => Object.assign(e, { x, y, vx, vy });
const duel = (a, b) => {
  const w = createWorld({ seed: 7, a, b });
  w.launched = true;
  return [w, ...w.ents];
};

test('roster has 12 balls with known prices', () => {
  assert.deepEqual(ORDER, ['basic', 'leech', 'cell', 'spider', 'ninja', 'train', 'magnet', 'bomb', 'turtle', 'lightning', 'hedgehog', 'ice']);
  for (const id of ORDER) assert.ok(BALLS[id].hp > 0 && BALLS[id].price >= 0 && BALLS[id].color);
});

test('leech latches on hit, drains the foe, heals itself, then lets go', () => {
  const [w, leech, foe] = duel({ id: 'leech' }, { id: 'basic' });
  place(leech, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 1);
  assert.ok(leech.latch, 'latched');
  assert.ok(foe.hp < foe.maxHp - HEAD_ON, 'drained beyond contact damage');
  assert.ok(leech.hp > leech.maxHp - HEAD_ON, 'healed');
  run(w, LEECH.stick);
  assert.equal(leech.latch, null);
  assert.ok(Math.abs(Math.hypot(leech.vx, leech.vy) - leech.speed) < 1e-6, 'flies off at full speed');
});

test('cell splits into two minis once, and the round goes on', () => {
  const [w, cell, foe] = duel({ id: 'cell', hp: 5 }, { id: 'basic' });
  place(cell, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 0.3);
  const minis = w.ents.filter(e => e.side === 0 && e.mini);
  assert.equal(minis.length, 2);
  assert.ok(minis.every(m => m.r === CELL.r && m.maxHp === CELL.hp));
  assert.equal(w.result, null);
  hurt(w, minis[0], 99);
  assert.equal(w.ents.length, 4, 'a mini does not split again');
});

test('a cell that already split stays dead', () => {
  const [w, cell, foe] = duel({ id: 'cell', hp: 5, split: true }, { id: 'basic' });
  place(cell, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 0.3);
  assert.equal(w.result, 1);
});

test('spider leaves webs on wall hits, capped', () => {
  const [w, spider] = duel({ id: 'spider' }, { id: 'basic' });
  place(spider, 40, 200, -300, 0);
  run(w, 0.1);
  assert.equal(w.zones.filter(z => z.kind === 'web').length, 1);
  for (let i = 0; i < WEB.max + 1; i++) BALLS.spider.onWallHit(w, spider, 0, 50 + i * 80);
  assert.equal(w.zones.filter(z => z.kind === 'web').length, WEB.max);
});

test('web slows and hurts enemies inside it', () => {
  const [w, spider, foe] = duel({ id: 'spider' }, { id: 'basic' });
  place(spider, 300, 100);
  BALLS.spider.onWallHit(w, spider, 0, 300);
  place(foe, 40, 300, 0, -300);
  step(w, DT);
  assert.equal(foe.slow, WEB.slow);
  assert.ok(foe.hp < foe.maxHp);
  assert.ok(foe.y > 300 - 300 * DT, 'moved less than full speed');
});

test('ninja throws a shuriken', () => {
  const [w, ninja, foe] = duel({ id: 'ninja' }, { id: 'basic' });
  place(ninja, 60, 340);
  place(foe, 300, 100);
  run(w, 2.2); // first throw at 0.8 s, next at 2.4 s
  assert.equal(foe.hp, foe.maxHp - NINJA.dmg);
});

test('ninja throws faster when hurt', () => {
  const [w, ninja, foe] = duel({ id: 'ninja', hp: 9 }, { id: 'basic' });
  place(ninja, 60, 340);
  place(foe, 300, 100);
  run(w, 3.2); // at full HP only 2 shurikens land by now
  assert.ok(foe.hp <= foe.maxHp - 3 * NINJA.dmg, `hp ${foe.hp}`);
});

test('train lays rails behind it; a foe on the rails is hit, its owner never is', () => {
  const [w, train, foe] = duel({ id: 'train' }, { id: 'basic' });
  place(train, 60, 200, 300, 0); // drives right along y = 200
  place(foe, 350, 350);
  run(w, 0.6);
  const z = w.zones.find(z => z.kind === 'track');
  assert.ok(z && z.pts.length > 5, 'rails laid');
  assert.equal(foe.hp, foe.maxHp, 'nothing happens off the rails');
  place(foe, 100, 200); // steps onto the rails behind the train
  step(w, DT);
  assert.equal(foe.hp, foe.maxHp - TRAIN.dmg);
  run(w, TRAIN.every);
  assert.equal(foe.hp, foe.maxHp - 2 * TRAIN.dmg, 'hit again after the cooldown');
  assert.equal(train.hp, train.maxHp);
  run(w, 1);
  assert.ok(z.pts[0].t >= w.t - TRAIN.life - DT, 'old rails fade');
});
