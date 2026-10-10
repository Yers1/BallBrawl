import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, launch, step, MAPS, rng } from '../src/sim.js';
import { createMatch, roundWorld, endRound } from '../src/match.js';
import { BOSS_IDS } from '../src/boss.js';

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
  assert.ok(boss[0].boss === 'slime' && boss[0].r > 40 && boss[0].hp > 250);
  assert.equal(w.ents.filter(e => e.side === 0).length, 3);
  assert.equal(w.map, 'canyon');
});

test('four bosses, each with its own attack, warned first, and they get angry under half HP', () => {
  const seen = { slime: 'spit', frost: 'quake', dragon: 'breath', golem: 'rockets' };
  for (const id of BOSS_IDS) {
    const fight = () => {
      const w = roundWorld(createMatch({ squadA: ['basic', 'ninja', 'ice'], squadB: ['basic'], mode: 'boss', seed: 7, boss: id }));
      launch(w, 0.7, 3.9);
      const got = new Set();
      for (let i = 0; i < 40 * 60 && w.result == null; i++) {
        step(w, 1 / 60);
        for (const ev of w.events) got.add(ev.type);
        for (const z of w.zones) got.add(z.kind);
        w.events.length = 0;
      }
      return { w, got };
    };
    const a = fight(), b = fight();
    assert.ok(a.got.has(seen[id]), id + ' uses its attack');
    assert.equal(a.w.t, b.w.t, id + ' is deterministic');
    const boss = a.w.ents.find(e => e.boss);
    if (boss.hp < boss.maxHp * 0.5) assert.ok(boss.rage && a.got.has('rage'), id + ' gets angry');
  }
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

test('survival: waves grow, the fallen stay down, every 5th is a boss, upgrades stick, the run ends', async () => {
  const { upgradeChoices, applyUpgrade } = await import('../src/match.js');
  const m = createMatch({ squadA: ['basic', 'ninja', 'ice'], squadB: ['leech', 'cell', 'bomb'], mode: 'survival', seed: 11 });
  assert.equal(m.wave, 1);
  let w = roundWorld(m);
  assert.equal(w.ents.filter(e => e.side === 1).length, 1, 'wave 1: one enemy');
  for (const e of w.ents) if (e.side === 1) e.hp = 0, e.dead = true;
  w.ents[0].hp = 10; w.ents[1].dead = true; w.result = 0;
  assert.equal(endRound(m, w), null);
  assert.equal(m.wave, 2);
  assert.ok(m.a[1].dead && !m.a[0].dead && m.a[0].hp > 10, 'the fallen stay down, the rest heal a little');
  const picks = upgradeChoices(m);
  assert.equal(picks.length, 3);
  assert.deepEqual(upgradeChoices(m), picks, 'the same choices for the same fight');
  applyUpgrade(m, 'revive');
  assert.ok(!m.a[1].dead && m.a[1].hp > 0, 'revive brings one back');
  applyUpgrade(m, 'dmg');
  w = roundWorld(m);
  assert.equal(w.ents.filter(e => e.side === 0).length, 3);
  assert.ok(w.ents[0].dmg > 10, 'the upgrade is in the fight');
  m.wave = 5;
  w = roundWorld(m);
  assert.ok(w.ents.find(e => e.side === 1).boss, 'wave 5: a boss');
  w.result = 1;
  assert.equal(endRound(m, w), 1, 'the wave won: the run is over');
});

test('football: nobody gets hurt, goals count, the same seed replays the same match', () => {
  const play = () => {
    const w = roundWorld(createMatch({ squadA: ['basic', 'ninja', 'ice'], squadB: ['leech', 'cell', 'bomb'], mode: 'football', seed: 21 }));
    assert.ok(w.ball && w.obstacles.length === 0);
    launch(w, -Math.PI / 2, Math.PI / 2);
    const hp = w.ents.map(e => e.hp);
    run(w, 200);
    assert.ok(w.ents.every((e, i) => e.hp >= hp[i] && !e.dead), 'no damage in football');
    return w;
  };
  const a = play(), b = play();
  assert.notEqual(a.result, null);
  assert.ok(a.goals[a.result] > a.goals[1 - a.result] || a.goals[a.result] === 3, 'the winner scored more');
  assert.equal(a.t, b.t);
});
