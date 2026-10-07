import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, launch, step, W, R, DMG } from '../src/sim.js';

const DT = 1 / 60;
const run = (w, secs) => { for (let i = 0; i < Math.round(secs / DT) && w.result == null; i++) step(w, DT); };
const place = (e, x, y, vx, vy) => Object.assign(e, { x, y, vx, vy });

test('ball reflects off walls and stays inside the arena', () => {
  const w = createWorld({ seed: 1, a: { id: 'basic' }, b: { id: 'basic' } });
  const [a, b] = w.ents;
  place(a, 40, 100, -220, 0);
  place(b, 360, 300, 0, 0);
  w.launched = true;
  run(w, 0.5);
  assert.ok(a.vx > 0, 'bounced right');
  assert.ok(a.x >= R && a.x <= W - R);
});

test('head-on collision deals contact damage to both, once', () => {
  const w = createWorld({ seed: 1, a: { id: 'basic' }, b: { id: 'basic' } });
  const [a, b] = w.ents;
  place(a, 140, 200, 220, 0);
  place(b, 260, 200, -220, 0);
  w.launched = true;
  run(w, 0.3);
  assert.equal(a.hp, a.maxHp - DMG);
  assert.equal(b.hp, b.maxHp - DMG);
  assert.ok(a.vx < 0 && b.vx > 0, 'bounced apart');
});

test('sudden death drains balls that never meet', () => {
  const w = createWorld({ seed: 1, a: { id: 'basic' }, b: { id: 'basic' } });
  const [a, b] = w.ents;
  place(a, 100, 60, 220, 0);
  place(b, 300, 340, 220, 0);
  w.launched = true;
  run(w, 29.9);
  assert.equal(a.hp, a.maxHp);
  run(w, 2.1); // t≈32: 2 HP/s for 1s + 3 HP/s for 1s
  assert.ok(Math.abs(a.maxHp - a.hp - 5) < 0.5, `lost ${a.maxHp - a.hp}`);
});

test('lethal hit ends the round with the survivor as winner', () => {
  const w = createWorld({ seed: 1, a: { id: 'basic' }, b: { id: 'basic', hp: 5 } });
  const [a, b] = w.ents;
  place(a, 140, 200, 220, 0);
  place(b, 260, 200, -220, 0);
  w.launched = true;
  run(w, 1);
  assert.equal(w.result, 0);
  assert.ok(b.dead);
});

test('simultaneous kill is a draw', () => {
  const w = createWorld({ seed: 1, a: { id: 'basic', hp: 5 }, b: { id: 'basic', hp: 5 } });
  const [a, b] = w.ents;
  place(a, 140, 200, 220, 0);
  place(b, 260, 200, -220, 0);
  w.launched = true;
  run(w, 1);
  assert.equal(w.result, 'draw');
});

test('enemy HP multiplier scales side b only', () => {
  const w = createWorld({ seed: 1, a: { id: 'basic' }, b: { id: 'basic' }, hpMulB: 1.5 });
  assert.equal(w.ents[1].maxHp, w.ents[0].maxHp * 1.5);
});

test('same seed and angles produce identical worlds', () => {
  const make = () => {
    const w = createWorld({ seed: 42, a: { id: 'basic' }, b: { id: 'basic' } });
    launch(w, 0.7, 2.9);
    run(w, 10);
    return w.ents.map(e => [e.x, e.y, e.hp]);
  };
  assert.deepEqual(make(), make());
});
