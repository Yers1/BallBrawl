// Squad / round / ladder rules on top of the one-round simulation.
import { createWorld } from './sim.js';
import { BALLS, ORDER } from './balls.js';

export const LEVELS = 30, LOSE_COINS = 5;
export const enemyHpMul = level => 1 + 0.05 * (level - 1);
export const winCoins = level => 20 + 2 * level;
export const poolSize = level => Math.min(ORDER.length, 1 + Math.floor((level + 1) / 3));

export function enemySquad(level, rand) {
  const pool = ORDER.slice(0, poolSize(level));
  return [0, 1, 2].map(() => pool[Math.floor(rand() * pool.length)]);
}

export function aiAngle(fx, fy, tx, ty, level, rand) {
  const err = 0.1 + 0.8 * (1 - (level - 1) / (LEVELS - 1));
  return Math.atan2(ty - fy, tx - fx) + (rand() * 2 - 1) * err;
}

export function createMatch({ squadA, squadB, hpMulB = 1, seed = 1 }) {
  return { a: squadA.map(id => ({ id })), b: squadB.map(id => ({ id })), hpMulB, seed, round: 0, result: null, revived: false, lost: null };
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
  m.a.unshift({ id: m.lost.id, hp: BALLS[m.lost.id].hp * 0.5 });
  m.revived = true;
  m.result = null;
}
