// Squad / round rules on top of the one-round simulation.
import { createWorld } from './sim.js';
import { BALLS } from './balls.js';

export const LEVELS = 30; // AI skill scale (1 = sloppy, 30 = sharp)

export function aiAngle(fx, fy, tx, ty, level, rand) {
  const err = 0.1 + 0.8 * (1 - (level - 1) / (LEVELS - 1));
  return Math.atan2(ty - fy, tx - fx) + (rand() * 2 - 1) * err;
}

// skinsA / skinsB: { ballId: skinStyle } — cosmetic, carried along so the renderer can draw them
// Modes: classic = squads take turns, one ball each (trophies); duo = two balls a side at once; boss = your whole
// squad against one giant ball. duo and boss are a single round.
export const MODES = ['classic', 'duo', 'boss'];
export const BOSS = { r: 46, hpMul: 5, dmgMul: 1.4, speedMul: 0.8 };
export function createMatch({ squadA, squadB, hpMulB = 1, seed = 1, skinsA = {}, skinsB = {}, mode = 'classic', map = 'night' }) {
  const spec = skins => id => (skins[id] ? { id, skin: skins[id] } : { id });
  return { a: squadA.map(spec(skinsA)), b: squadB.map(spec(skinsB)), hpMulB, seed, round: 0, result: null, revived: false, lost: null, mode, map };
}

export function roundWorld(m) {
  m.round++;
  const seed = m.seed * 7919 + m.round, map = m.map ?? 'night';
  if (m.mode === 'duo') return createWorld({ seed, a: m.a.slice(0, 2), b: m.b.slice(0, 2), hpMulB: m.hpMulB, map });
  if (m.mode === 'boss') return createWorld({ seed, a: m.a.slice(0, 3), b: [{ ...m.b[0], boss: true, ...BOSS }], hpMulB: m.hpMulB, map });
  return createWorld({ seed, a: m.a[0], b: m.b[0], hpMulB: m.hpMulB, map });
}

export function endRound(m, w) {
  if (m.mode === 'duo' || m.mode === 'boss') return (m.result = w.result); // one round decides it
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
