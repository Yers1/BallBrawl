import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, act, hurt, METER, DMG } from '../src/sim.js';
import { BALLS, MAGNET, BOMB, TURTLE, BOLT, SPIKES, ICE } from '../src/balls.js';

const DT = 1 / 60;
const HEAD_ON = Math.round(DMG * 1.5);
const run = (w, secs) => { for (let i = 0; i < Math.round(secs / DT) && w.result == null; i++) step(w, DT); };
const place = (e, x, y, vx = 0, vy = 0) => Object.assign(e, { x, y, vx, vy });
const duel = (a, b = 'basic') => {
  const w = createWorld({ seed: 3, a: { id: a }, b: { id: b } });
  w.launched = true;
  return [w, ...w.ents];
};
const superOf = (id, setup) => {
  const [w, me, foe] = duel(id);
  place(me, 80, 320);
  place(foe, 300, 120);
  setup?.(w, me, foe);
  w.sides[0].meter = METER.full;
  act(w, 0, { type: 'super' });
  return [w, me, foe];
};
const heading = e => Math.atan2(e.vy, e.vx);

const closestOver = (w, a, b, steps) => {
  let d = Infinity;
  for (let i = 0; i < steps; i++) { step(w, DT); d = Math.min(d, Math.hypot(a.x - b.x, a.y - b.y)); }
  return d;
};

test('magnet hooks the nearest foe, reels it in and slams it', () => {
  const [w, me, foe] = duel('magnet');
  place(me, 100, 200);
  place(foe, 300, 200);
  run(w, MAGNET.first + 0.05);
  assert.ok(w.shots.some(s => s.kind === 'hook'), 'hook fired');
  assert.ok(closestOver(w, me, foe, 40) < me.r + foe.r + 8, 'reeled in'); // +8: it bounces off in the slam tick
  assert.ok(foe.hp <= foe.maxHp - MAGNET.dmg - MAGNET.slam, `hp ${foe.hp}`);
  assert.equal(foe.yank, null, 'let go after the slam');
});

test('magnet super reels in every foe at once', () => {
  const [w, me, foe] = superOf('magnet');
  assert.equal(foe.yank?.by, me);
  assert.ok(closestOver(w, me, foe, 40) < me.r + foe.r + 8, 'reeled in'); // +8: it bounces off in the slam tick
  assert.ok(foe.hp <= foe.maxHp - MAGNET.superSlam, `hp ${foe.hp}`);
});

test('bomb blows up on impact, then needs to recharge', () => {
  const [w, me, foe] = duel('bomb');
  place(me, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 0.15);
  assert.equal(foe.hp, foe.maxHp - HEAD_ON - BOMB.blast);
  assert.equal(me.hp, me.maxHp - HEAD_ON, 'its own blast never hurts it');
  assert.ok(me.cd.blast > w.t);
});

test('bomb super: bombs along the foe path, each timed to its arrival', () => {
  const [w, , foe] = superOf('bomb', (w, me, foe) => { foe.vx = 0; foe.vy = 0; });
  const bombs = w.zones.filter(z => z.kind === 'bomb');
  assert.equal(bombs.length, BOMB.superCount);
  run(w, BOMB.superCount * BOMB.superStep + 0.05);
  assert.equal(foe.hp, foe.maxHp - BOMB.superCount * BOMB.dmg, 'a parked foe eats every one');
});

test('turtle shell blocks most damage and bites back', () => {
  const [w, me, foe] = duel('turtle');
  place(me, 60, 340);
  place(foe, 340, 60);
  run(w, TURTLE.first + 0.02);
  assert.ok(me.shieldUntil > w.t, 'shield up');
  hurt(w, me, 20);
  assert.equal(me.hp, me.maxHp - 20 * TURTLE.mul);
  BALLS.turtle.onEnemyHit(w, me, foe);
  assert.equal(foe.hp, foe.maxHp - foe.dmg * TURTLE.reflect);
});

test('turtle super: long shell and a heal', () => {
  const [w, me] = superOf('turtle', (w, me) => { me.hp = 50; });
  assert.equal(me.shieldUntil, w.t + TURTLE.superShield);
  assert.equal(me.hp, 50 + TURTLE.superHeal);
});

test('lightning zaps the nearest foe from anywhere', () => {
  const [w, me, foe] = duel('lightning');
  place(me, 60, 340);
  place(foe, 340, 60);
  run(w, BOLT.first + 0.02);
  assert.equal(foe.hp, foe.maxHp - BOLT.dmg);
  assert.ok(w.zones.some(z => z.kind === 'zap'));
});

test('lightning super: a storm of strikes', () => {
  const [w, , foe] = superOf('lightning');
  run(w, BOLT.storm * BOLT.stormGap + 0.1);
  assert.ok(foe.hp <= foe.maxHp - BOLT.storm * BOLT.dmg);
});

test('hedgehog spikes hurt whoever touches it', () => {
  const [w, me, foe] = duel('hedgehog');
  place(me, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 0.15);
  assert.equal(foe.hp, foe.maxHp - HEAD_ON - SPIKES.thorns);
});

test('hedgehog super: needles in every direction', () => {
  const [w] = superOf('hedgehog');
  assert.equal(w.shots.length, SPIKES.needles);
});

test('ice chills on hit, and its super freezes', () => {
  const [w, me, foe] = duel('ice');
  place(me, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 0.15);
  assert.ok(foe.chillUntil > w.t);
  step(w, DT);
  assert.equal(foe.slow, ICE.slow);
  const [w2, , foe2] = superOf('ice');
  step(w2, DT);
  assert.equal(foe2.slow, ICE.freezeSlow);
});
