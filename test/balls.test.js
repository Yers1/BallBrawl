import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, hurt, DMG } from '../src/sim.js';
import { BALLS, ORDER } from '../src/balls.js';

const DT = 1 / 60;
const run = (w, secs) => { for (let i = 0; i < Math.round(secs / DT) && w.result == null; i++) step(w, DT); };
const place = (e, x, y, vx = 0, vy = 0) => Object.assign(e, { x, y, vx, vy });
const duel = (a, b) => {
  const w = createWorld({ seed: 7, a, b });
  w.launched = true;
  return [w, ...w.ents];
};

test('roster has 6 balls with known prices', () => {
  assert.deepEqual(ORDER, ['basic', 'leech', 'cell', 'spider', 'ninja', 'train']);
  for (const id of ORDER) assert.ok(BALLS[id].hp > 0 && BALLS[id].price >= 0 && BALLS[id].color);
});

test('leech latches on hit, drains the foe, heals itself, then lets go', () => {
  const [w, leech, foe] = duel({ id: 'leech' }, { id: 'basic' });
  place(leech, 140, 200, 220, 0);
  place(foe, 260, 200, -220, 0);
  run(w, 1);
  assert.ok(leech.latch, 'latched');
  assert.ok(foe.hp < foe.maxHp - DMG, 'drained beyond contact damage');
  assert.ok(leech.hp > leech.maxHp - DMG, 'healed');
  run(w, 2);
  assert.equal(leech.latch, null);
  assert.ok(Math.abs(Math.hypot(leech.vx, leech.vy) - leech.speed) < 1e-6, 'flies off at full speed');
});

test('cell splits into two minis once, and the round goes on', () => {
  const [w, cell, foe] = duel({ id: 'cell', hp: 5 }, { id: 'basic' });
  place(cell, 140, 200, 220, 0);
  place(foe, 260, 200, -220, 0);
  run(w, 0.3);
  const minis = w.ents.filter(e => e.side === 0 && e.mini && !e.dead);
  assert.equal(minis.length, 2);
  assert.ok(minis.every(m => m.r === 18 && m.hp === 25));
  assert.equal(w.result, null);
  hurt(w, minis[0], 99);
  assert.equal(w.ents.length, 4, 'a mini does not split again');
});

test('a cell that already split stays dead', () => {
  const [w, cell, foe] = duel({ id: 'cell', hp: 5, split: true }, { id: 'basic' });
  place(cell, 140, 200, 220, 0);
  place(foe, 260, 200, -220, 0);
  run(w, 0.3);
  assert.equal(w.result, 1);
});

test('spider leaves webs on wall hits, at most 3', () => {
  const [w, spider] = duel({ id: 'spider' }, { id: 'basic' });
  place(spider, 40, 200, -220, 0);
  run(w, 0.1);
  assert.equal(w.zones.filter(z => z.kind === 'web').length, 1);
  for (let i = 0; i < 4; i++) BALLS.spider.onWallHit(w, spider, 0, 50 + i * 80);
  assert.equal(w.zones.filter(z => z.kind === 'web').length, 3);
});

test('web slows and hurts enemies inside it', () => {
  const [w, spider, foe] = duel({ id: 'spider' }, { id: 'basic' });
  place(spider, 300, 100);
  BALLS.spider.onWallHit(w, spider, 0, 300);
  place(foe, 40, 300, 0, -220);
  step(w, DT);
  assert.equal(foe.slow, 0.5);
  assert.ok(foe.hp < foe.maxHp);
  assert.ok(Math.abs(foe.y - (300 - 220 * 0.5 * DT)) < 1e-9);
});

test('ninja throws a shuriken that hits for 4', () => {
  const [w, ninja, foe] = duel({ id: 'ninja' }, { id: 'basic' });
  place(ninja, 60, 340);
  place(foe, 300, 100);
  run(w, 2.5);
  assert.equal(foe.hp, foe.maxHp - 4);
});

test('ninja throws faster when hurt', () => {
  const [w, ninja, foe] = duel({ id: 'ninja', hp: 9 }, { id: 'basic' });
  place(ninja, 60, 340);
  place(foe, 300, 100);
  run(w, 3.2); // full HP: 1 hit by now; at 10% HP: 3
  assert.ok(foe.hp <= foe.maxHp - 12, `hp ${foe.hp}`);
});

test('train telegraphs, then hits a foe in its lane for 30 — never its owner', () => {
  const [w, train, foe] = duel({ id: 'train' }, { id: 'basic' });
  place(train, 60, 340);
  place(foe, 200, 200);
  run(w, 3.05);
  const z = w.zones.find(z => z.kind === 'train');
  assert.ok(z, 'rails appear');
  assert.equal(foe.hp, foe.maxHp, 'no damage during the warning');
  run(w, 1.6);
  assert.equal(foe.hp, foe.maxHp - 30);
  assert.equal(train.hp, train.maxHp);
});
