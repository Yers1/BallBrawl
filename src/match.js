// Squad / round rules on top of the one-round simulation.
import { createWorld } from './sim.js';
import { BALLS } from './balls.js';

export const LEVELS = 30; // AI skill scale (1 = sloppy, 30 = sharp)

export function aiAngle(fx, fy, tx, ty, level, rand) {
  const err = 0.1 + 0.8 * (1 - (level - 1) / (LEVELS - 1));
  return Math.atan2(ty - fy, tx - fx) + (rand() * 2 - 1) * err;
}

// skinsA / skinsB: { ballId: skinStyle } — cosmetic, carried along so the renderer can draw them
export function createMatch({ squadA, squadB, hpMulB = 1, seed = 1, skinsA = {}, skinsB = {} }) {
  const spec = skins => id => (skins[id] ? { id, skin: skins[id] } : { id });
  return { a: squadA.map(spec(skinsA)), b: squadB.map(spec(skinsB)), hpMulB, seed, round: 0, result: null, revived: false, lost: null };
}

export function roundWorld(m) {
  m.round++;
  return createWorld({ seed: m.seed * 7919 + m.round, a: m.a[0], b: m.b[0], hpMulB: m.hpMulB });
}

export function endRound(m, w) {
  if (w.result === 'draw') {
    m.lost = m.a.shift();
    m.b.shift();
  } else {
    const [win, lose] = w.result === 0 ? [m.a, m.b] : [m.b, m.a];
    const alive = w.ents.filter(e => e.side === w.result && !e.dead);
    win[0].hp = alive.reduce((s, e) => s + e.hp, 0);
    if (win[0].split || alive.some(e => e.mini)) win[0].split = true;
    const gone = lose.shift();
    if (lose === m.a) m.lost = gone;
  }
  if (!m.a.length || !m.b.length) m.result = m.a.length ? 0 : m.b.length ? 1 : 'draw';
  return m.result;
}

export function revive(m) {
  m.a.unshift({ id: m.lost.id, hp: BALLS[m.lost.id].hp * 0.5, ...(m.lost.skin && { skin: m.lost.skin }) });
  m.revived = true;
  m.result = null;
}
