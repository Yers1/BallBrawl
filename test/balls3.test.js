import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, act, hurt, canSuper, METER, DMG, W } from '../src/sim.js';
import { POISON, CHAIN, FORGE } from '../src/balls.js';

const DT = 1 / 60;
const run = (w, secs) => { for (let i = 0; i < Math.round(secs / DT) && w.result == null; i++) step(w, DT); };
const place = (e, x, y, vx = 0, vy = 0) => Object.assign(e, { x, y, vx, vy });
const duel = (a, b = 'basic') => {
  const w = createWorld({ seed: 5, a: { id: a }, b: { id: b } });
  w.launched = true;
  return [w, ...w.ents];
};

test('poison spike: a wall hit plants a spike; a foe on it is hit and poisoned, the owner never', () => {
  const [w, me, foe] = duel('poison');
  place(me, 60, 200, -300, 0); // into the left wall
  place(foe, 350, 350);
  run(w, 0.2);
  const z = w.zones.find(z => z.kind === 'spike');
  assert.ok(z && z.nx === 1 && z.x === 0, 'spike on the left wall, pointing inward');
  place(me, 300, 300); // park the owner away from its own spike
  place(foe, 40, z.y); // onto the spike
  step(w, DT);
  assert.equal(foe.hp, foe.maxHp - POISON.hit - POISON.tick, 'spike hit plus the first poison tick');
  assert.ok(foe.poisonUntil > w.t);
  run(w, POISON.last + 0.1);
  assert.ok(foe.hp <= foe.maxHp - POISON.hit - 6 * POISON.tick, `poison ticked: ${foe.hp}`);
  assert.equal(me.hp, me.maxHp);
});

test('poison super plants two spikes on every wall', () => {
  const [w, me] = duel('poison');
  w.sides[0].meter = METER.full;
  act(w, 0, { type: 'super' });
  const spikes = w.zones.filter(z => z.kind === 'spike');
  assert.equal(spikes.length, 8);
  assert.ok(spikes.every(z => z.x === 0 || z.x === W || z.y === 0 || z.y === W));
});

test('chain ring holds a foe: slowed, pulled to the middle, ticked', () => {
  const [w, me, foe] = duel('chain');
  place(me, 200, 200);
  place(foe, 350, 350);
  run(w, CHAIN.first + 0.05);
  const z = w.zones.find(z => z.kind === 'ring');
  assert.ok(z, 'ring dropped');
  place(me, 50, 50); // the ring stays where it was dropped, far from its owner
  place(foe, z.x + 40, z.y, 300, 0); // inside the ring, trying to roll out
  const x0 = foe.x;
  step(w, DT);
  assert.ok(foe.slow <= CHAIN.slow);
  assert.ok(foe.x < x0 + 300 * DT, 'held back');
  assert.equal(foe.hp, foe.maxHp - CHAIN.dmg);
});

test('forge levels up over time and its super jumps levels; damage grows', () => {
  const [w, me, foe] = duel('forge');
  place(me, 100, 300);
  place(foe, 300, 100);
  step(w, DT);
  assert.equal(me.lv, 1);
  run(w, FORGE.every);
  assert.equal(me.lv, 2);
  assert.equal(me.dmg, DMG + FORGE.dmgPerLv);
  w.sides[0].meter = METER.full;
  act(w, 0, { type: 'super' });
  assert.equal(me.lv, 2 + FORGE.superLv);
  assert.ok(w.events.some(e => e.type === 'text'));
});

test('cell fragments have no super: the meter stays full and nothing happens', () => {
  const [w, cell] = duel('cell');
  hurt(w, cell, cell.hp); // the whole cell dies and splits
  const minis = w.ents.filter(e => e.side === 0 && !e.dead);
  assert.ok(minis.length === 2 && minis.every(e => e.mini));
  w.sides[0].meter = METER.full;
  assert.equal(canSuper(w, 0), false);
  assert.equal(act(w, 0, { type: 'super' }), false);
  assert.equal(w.sides[0].meter, METER.full);
  assert.equal(w.ents.filter(e => e.side === 0 && !e.dead).length, 2, 'no new fragments');
});

test('chess moves like a random piece, square to square, untouchable on the way', async () => {
  const { CHESS } = await import('../src/balls.js');
  const [w, me, foe] = duel('chess');
  let moves = 0, hurtWhileMoving = false;
  for (let i = 0; i < 60 * 12 && w.result == null; i++) {
    const hp = me.hp, moving = !!me.chess;
    step(w, 1 / 60);
    if (moving && me.hp < hp) hurtWhileMoving = true;
    if (w.events.some(e => e.type === 'chess')) moves++;
    w.events.length = 0;
  }
  assert.ok(moves >= 3, `made ${moves} moves`);
  assert.ok(!hurtWhileMoving, 'no damage during a move');
  assert.ok(CHESS.queenMoves === 3);
});
