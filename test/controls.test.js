import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, act, hurt, launch, DASH, METER, DMG } from '../src/sim.js';
import { BALLS, SUPER, CELL, TRAIN } from '../src/balls.js';
import { createAI } from '../src/ai.js';

const DT = 1 / 60;
const run = (w, secs) => { for (let i = 0; i < Math.round(secs / DT) && w.result == null; i++) step(w, DT); };
const place = (e, x, y, vx = 0, vy = 0) => Object.assign(e, { x, y, vx, vy });
const duel = (a, b) => {
  const w = createWorld({ seed: 7, a, b });
  w.launched = true;
  return [w, ...w.ents];
};

// ---------- dash ----------

test('dash spends a charge and flies straight at the tap, boosted', () => {
  const [w, a, b] = duel({ id: 'basic' }, { id: 'basic' });
  place(a, 100, 300, 300, 0);
  place(b, 350, 50);
  assert.equal(act(w, 0, { type: 'dash', x: 100, y: 100 }), true);
  assert.equal(w.sides[0].dashes, DASH.charges - 1);
  const y0 = a.y;
  step(w, DT);
  assert.ok(Math.abs(a.vx) < 1e-9 && a.vy < 0, 'no homing while boosted');
  assert.ok(Math.abs(y0 - a.y - a.speed * DASH.mul * DT) < 1e-9);
});

test('no charge, no dash — and charges come back', () => {
  const [w, a, b] = duel({ id: 'basic' }, { id: 'basic' });
  place(a, 60, 340);
  place(b, 340, 60);
  for (let i = 0; i < DASH.charges; i++) assert.ok(act(w, 0, { type: 'dash', x: 60, y: 200 }));
  assert.equal(act(w, 0, { type: 'dash', x: 60, y: 200 }), false);
  run(w, DASH.regen + 0.05);
  assert.equal(w.sides[0].dashes, 1);
});

test('ramming during a dash hits harder', () => {
  const [w, a, b] = duel({ id: 'basic' }, { id: 'basic' });
  place(a, 140, 200, 300, 0);
  place(b, 260, 200);
  act(w, 0, { type: 'dash', x: 260, y: 200 });
  run(w, 0.15);
  assert.equal(b.hp, b.maxHp - Math.round(DMG * 1.5 * DASH.dmg));
});

test('a latched leech lets go when it dashes', () => {
  const [w, leech, foe] = duel({ id: 'leech' }, { id: 'basic' });
  place(leech, 140, 200, 300, 0);
  place(foe, 260, 200, -300, 0);
  run(w, 0.3);
  assert.ok(leech.latch);
  act(w, 0, { type: 'dash', x: 40, y: 40 });
  assert.equal(leech.latch, null);
});

// ---------- super meter ----------

test('meter fills from damage dealt and taken, not from sudden death', () => {
  const [w, a, b] = duel({ id: 'basic' }, { id: 'basic' });
  hurt(w, b, 10);
  assert.equal(w.sides[0].meter, 10 * METER.dealt);
  assert.equal(w.sides[1].meter, 10 * METER.taken);
  place(a, 60, 340);
  place(b, 340, 60);
  w.t = 40;
  const before = w.sides.map(s => s.meter);
  step(w, DT);
  assert.ok(a.hp < a.maxHp, 'sudden death hurts');
  assert.deepEqual(w.sides.map(s => s.meter), before);
});

test('super fires only at a full meter, then empties it', () => {
  const [w] = duel({ id: 'basic' }, { id: 'basic' });
  assert.equal(act(w, 0, { type: 'super' }), false);
  w.sides[0].meter = METER.full;
  assert.equal(act(w, 0, { type: 'super' }), true);
  assert.equal(w.sides[0].meter, 0);
});

// ---------- each super ----------

const superDuel = id => {
  const [w, me, foe] = duel({ id }, { id: 'basic' });
  place(me, 80, 320); // both parked, so only the super moves things
  place(foe, 300, 120);
  w.sides[0].meter = METER.full;
  act(w, 0, { type: 'super' });
  return [w, me, foe];
};

test('basic super: rams the foe, boosted', () => {
  const [w, me, foe] = superDuel('basic');
  assert.ok(me.boost.mul === SUPER.ramMul && me.boost.dmg === SUPER.ramDmg);
  const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x);
  assert.ok(Math.abs(Math.atan2(me.vy, me.vx) - toFoe) < 1e-9);
});

test('leech super: jumps onto the foe and drains double', () => {
  const [w, me, foe] = superDuel('leech');
  assert.equal(me.latch.foe, foe);
  assert.equal(me.latch.until, w.t + SUPER.leechStick);
  step(w, DT);
  assert.ok(Math.hypot(me.x - foe.x, me.y - foe.y) < me.r + foe.r, 'stuck to it');
});

test('cell super: two minis appear, the cell lives on', () => {
  const [w, me] = superDuel('cell');
  assert.equal(w.ents.filter(e => e.mini && e.side === 0).length, 2);
  assert.ok(!me.dead && w.ents.every(e => !e.mini || e.r === CELL.r));
});

test('spider super: a big slowing web right under the foe', () => {
  const [w, , foe] = superDuel('spider');
  const z = w.zones.find(z => z.kind === 'web');
  assert.ok(z.r === SUPER.webR && z.slow === SUPER.webSlow && z.x === foe.x && z.y === foe.y);
  step(w, DT);
  assert.equal(foe.slow, SUPER.webSlow);
});

test('ninja super: a fan of shurikens', () => {
  const [w] = superDuel('ninja');
  assert.equal(w.shots.length, SUPER.fan);
});

test('train super: an express runs the rails and on through the foe ahead', () => {
  const [w, me, foe] = duel({ id: 'train' }, { id: 'basic' });
  place(me, 60, 200, 300, 0);
  place(foe, 350, 350);
  run(w, 0.5); // lays some rails
  const m = Math.hypot(me.vx, me.vy);
  place(foe, me.x + (me.vx / m) * 150, me.y + (me.vy / m) * 150); // straight ahead on its heading
  w.sides[0].meter = METER.full;
  act(w, 0, { type: 'super' });
  const z = w.zones.find(z => z.kind === 'track');
  assert.ok(z.express, 'express launched');
  run(w, 0.5);
  assert.ok(foe.hp <= foe.maxHp - TRAIN.superDmg, `hp ${foe.hp}`);
  assert.equal(z.express, null, 'the express has passed');
});

// ---------- replay + AI ----------

test('same seed + same command log replays the exact same fight', () => {
  const play = log => {
    const w = createWorld({ seed: 99, a: { id: 'turtle' }, b: { id: 'train' } });
    launch(w, 0.5, 2.5);
    const ai = log ? null : createAI(1, 25, 5);
    const cmds = log ? [...log] : [];
    for (let i = 0; i < 60 * 25 && w.result == null; i++) {
      if (!log) {
        if (i % 41 === 0) act(w, 0, { type: 'dash', x: (i * 7) % 400, y: (i * 13) % 400 });
        if (w.sides[0].meter >= METER.full) act(w, 0, { type: 'super' });
        ai.think(w);
      } else while (cmds.length && cmds[0].tick === w.tick) { const c = cmds.shift(); act(w, c.side, c); }
      step(w, DT);
    }
    return w;
  };
  const a = play(null), b = play(a.log);
  assert.ok(a.log.length > 5, `only ${a.log.length} commands`);
  assert.deepEqual(b.log, a.log);
  assert.deepEqual(b.ents.map(e => [e.x, e.y, e.hp]), a.ents.map(e => [e.x, e.y, e.hp]));
  assert.equal(b.result, a.result);
});

test('the AI dashes and uses its super', () => {
  let dashes = 0, supers = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const w = createWorld({ seed, a: { id: 'basic' }, b: { id: 'ninja' } });
    launch(w, 0.3, 3.5);
    const ai = createAI(1, 30, seed);
    for (let i = 0; i < 60 * 30 && w.result == null; i++) { ai.think(w); step(w, DT); }
    dashes += w.log.filter(c => c.side === 1 && c.type === 'dash').length;
    supers += w.log.filter(c => c.side === 1 && c.type === 'super').length;
  }
  assert.ok(dashes >= 10, `dashes ${dashes}`);
  assert.ok(supers >= 3, `supers ${supers}`);
});
