import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, launch, step, MAPS, rng } from '../src/sim.js';
import { createMatch, roundWorld, endRound } from '../src/match.js';

const run = (w, s = 60) => { for (let i = 0; i < s * 60 && w.result == null; i++) step(w, 1 / 60); return w; };

test('every map plays to a result, and the same seed replays the same fight', () => {
  for (const map of Object.keys(MAPS)) {
    const fight = () => { const w = createWorld({ seed: 5, a: { id: 'basic' }, b: { id: 'leech' }, map }); launch(w, 0.7, 3.9); return run(w); };
    const a = fight(), b = fight();
    assert.notEqual(a.result, null, map);
    assert.equal(a.t, b.t, map + ' is deterministic');
    for (const e of a.ents) for (const o of a.obstacles) if (o.k === 'rock' || o.k === 'ice' || o.k === 'bumper') {
      assert.ok(Math.hypot(e.x - o.x, e.y - o.y) >= o.r + e.r - 0.5 || e.dead, 'never inside a solid obstacle');
    }
  }
});

test('2v2: two balls a side, one round decides it', () => {
  const m = createMatch({ squadA: ['basic', 'ninja', 'ice'], squadB: ['leech', 'cell', 'bomb'], mode: 'duo', seed: 3 });
  const w = roundWorld(m);
  assert.equal(w.ents.filter(e => e.side === 0).length, 2);
  assert.equal(w.ents.filter(e => e.side === 1).length, 2);
  launch(w, 0.7, 3.9);
  run(w);
  assert.notEqual(endRound(m, w), null);
});

test('boss: your three balls against one giant', () => {
  const m = createMatch({ squadA: ['basic', 'ninja', 'ice'], squadB: ['turtle', 'cell', 'bomb'], mode: 'boss', seed: 4, map: 'canyon' });
  const w = roundWorld(m);
  const boss = w.ents.filter(e => e.side === 1);
  assert.equal(boss.length, 1);
  assert.ok(boss[0].boss && boss[0].r > 40 && boss[0].hp > 400);
  assert.equal(w.ents.filter(e => e.side === 0).length, 3);
  assert.equal(w.map, 'canyon');
});

test('classic fights replay exactly as before (no new randomness at launch)', () => {
  const w = createWorld({ seed: 9, a: { id: 'basic' }, b: { id: 'basic' } }), r = w.rand();
  const v = createWorld({ seed: 9, a: { id: 'basic' }, b: { id: 'basic' } });
  launch(v, 1, 2);
  assert.equal(v.rand(), r, 'launch draws nothing in 1v1');
});

test('party: each player steers only their own ball; dash charges grow with the team', async () => {
  const { act, DASH } = await import('../src/sim.js');
  const w = createWorld({ seed: 2, a: [{ id: 'basic' }, { id: 'ninja' }], b: [{ id: 'leech' }], players: [2, 1] });
  assert.equal(w.sides[0].dashes, DASH.charges * 2);
  launch(w, 0.5, 3.5);
  const [p1, p2] = w.ents.filter(e => e.side === 0), before = [p2.vx, p2.vy];
  assert.ok(act(w, 0, { type: 'dash', x: 10, y: 10, ent: p1.id }));
  assert.ok(p1.boost && !p2.boost, 'only the steered ball dashes');
  assert.deepEqual([p2.vx, p2.vy], before);
  assert.ok(!act(w, 0, { type: 'dash', x: 10, y: 10, ent: 999 }), 'no such ball');
  assert.equal(w.log.at(-1).ent, p1.id);
});

test('party bot whose ball is out just waits (no crash)', async () => {
  const { createAI } = await import('../src/ai.js');
  const w = createWorld({ seed: 3, a: [{ id: 'basic' }, { id: 'ninja' }], b: [{ id: 'leech' }, { id: 'cell' }] });
  launch(w, 0.5, 3.5);
  const bot = w.ents.find(e => e.side === 1);
  bot.dead = true;
  assert.doesNotThrow(() => createAI(1, 3, 1, { ent: bot.id }).think(w));
});
