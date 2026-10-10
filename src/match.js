// Squad / round rules on top of the one-round simulation.
import { createWorld } from './sim.js';
import { BALLS } from './balls.js';
import { BOSSES, BOSS_IDS } from './boss.js';

export const LEVELS = 30; // AI skill scale (1 = sloppy, 30 = sharp)

export function aiAngle(fx, fy, tx, ty, level, rand) {
  const err = 0.1 + 0.8 * (1 - (level - 1) / (LEVELS - 1));
  return Math.atan2(ty - fy, tx - fx) + (rand() * 2 - 1) * err;
}

// skinsA / skinsB: { ballId: skinStyle } — cosmetic, carried along so the renderer can draw them
// Modes: classic = squads take turns, one ball each (trophies); duo = two balls a side at once; boss = your whole
// squad against one giant ball. duo and boss are a single round.
export const MODES = ['classic', 'duo', 'boss', 'survival', 'football'];
// Survival: your three balls against wave after wave, every 5th a boss. The fallen stay down, the rest keep their HP
// (and heal a little); after each wave you pick one of three upgrades. It ends when your last ball is out.
export const SURVIVAL = { boss: 5, heal: 0.3, hp0: 0.4, hpPer: 0.045, dmg0: 0.7, dmgPer: 0.03, boss0: 0.4, bossPer: 0.08 };
export const UPGRADES = { dmg: 0.15, hp: 0.2, armor: 0.1, speed: 0.08, dash: 0.3, meter: 0.3, heal: 0.4, revive: 0.5 };
const R2 = (seed, n) => ((seed * 9301 + n * 49297) % 233280 + 233280) % 233280; // a tiny repeatable shuffle (no world RNG)
function waveFoes(m) {
  const n = m.wave;
  if (n % SURVIVAL.boss === 0) return [bossSpec(BOSS_IDS[(n / SURVIVAL.boss - 1) % BOSS_IDS.length], SURVIVAL.boss0 + SURVIVAL.bossPer * n)];
  const count = n <= 2 ? 1 : n <= 8 ? 2 : 3;
  return Array.from({ length: count }, (_, k) => ({ id: m.pool[R2(m.seed + k * 7, n) % m.pool.length], hpMul: SURVIVAL.hp0 + SURVIVAL.hpPer * n, dmgMul: SURVIVAL.dmg0 + SURVIVAL.dmgPer * n }));
}
// Three upgrades to choose from after a wave, the same for the same fight; healing and reviving only when they help.
export function upgradeChoices(m) {
  const hurt = m.a.some(x => !x.dead && x.hp < x.max), down = m.a.some(x => x.dead);
  const pool = Object.keys(UPGRADES).filter(k => (k !== 'heal' || hurt) && (k !== 'revive' || down));
  const out = [];
  for (let i = 0; out.length < 3 && i < 40; i++) { const k = pool[R2(m.seed + i * 13, m.wave) % pool.length]; if (!out.includes(k)) out.push(k); }
  return out;
}
export function applyUpgrade(m, k) {
  if (k === 'heal') for (const x of m.a) { if (!x.dead) x.hp = Math.min(x.max, x.hp + x.max * UPGRADES.heal); }
  else if (k === 'revive') { const x = m.a.find(y => y.dead); if (x) { x.dead = false; x.hp = x.max * UPGRADES.revive; } }
  else m.ups[k] += UPGRADES[k];
}
export const BOSS = { r: 46, dmgMul: 1.2, speedMul: 0.8 };
export const bossSpec = (id, mul = 1) => ({ id: BOSSES[id].ball, ...(BOSSES[id].skin && { skin: BOSSES[id].skin }), ...BOSS, hpMul: (BOSSES[id].hp / BALLS[BOSSES[id].ball].hp) * mul, boss: id }); // mul: a bigger party, a tougher boss
export function createMatch({ squadA, squadB, hpMulB = 1, seed = 1, skinsA = {}, skinsB = {}, mode = 'classic', map = 'night', famA = null, famB = null, boss = 'slime', pool = null }) {
  const spec = (skins, fam) => id => ({ id, ...(skins[id] && { skin: skins[id] }), ...(fam && { hpMul: fam.hp, dmgMul: fam.dmg, speedMul: fam.speed, armor: fam.armor, regen: fam.regen }) }); // fam: the familiar's bonus
  return { boosts: [famA, famB], a: squadA.map(spec(skinsA, famA)), b: squadB.map(spec(skinsB, famB)), hpMulB, seed, round: 0, result: null, revived: false, lost: null, mode, map, boss: BOSSES[boss] ? boss : 'slime',
    ...(mode === 'survival' && { wave: 1, pool: pool?.length ? pool : squadB, ups: { dmg: 0, hp: 0, armor: 0, speed: 0, dash: 0, meter: 0 } }) };
}

export function roundWorld(m) {
  m.round++;
  const seed = m.seed * 7919 + m.round, map = m.map ?? 'night';
  const boosts = m.boosts;
  if (m.mode === 'duo') return createWorld({ seed, a: m.a.slice(0, 2), b: m.b.slice(0, 2), hpMulB: m.hpMulB, map, boosts });
  if (m.mode === 'football') return createWorld({ seed, a: m.a.slice(0, 2), b: m.b.slice(0, 2), map, boosts, football: true });
  if (m.mode === 'survival') {
    const u = m.ups, b0 = boosts?.[0] ?? {};
    const a = m.a.filter(x => !x.dead).map(x => ({ ...x, hpMul: (x.hpMul ?? 1) * (1 + u.hp), dmgMul: (x.dmgMul ?? 1) * (1 + u.dmg), speedMul: (x.speedMul ?? 1) * (1 + u.speed), armor: (x.armor ?? 1) * (1 - u.armor) }));
    return createWorld({ seed, a, b: waveFoes(m), map, boosts: [{ ...b0, dash: (b0.dash ?? 1) * (1 + u.dash), meter: (b0.meter ?? 1) * (1 + u.meter) }] });
  }
  if (m.mode === 'boss') return createWorld({ seed, a: m.a.slice(0, 3), b: [bossSpec(m.boss)], map, boosts: [boosts?.[0]] }); // its size and attack are the challenge; trophies only sharpen its AI
  return createWorld({ seed, a: m.a[0], b: m.b[0], hpMulB: m.hpMulB, map, boosts });
}

export function endRound(m, w) {
  if (m.mode === 'survival') {
    if (w.result !== 0) return (m.result = 1); // the wave won: the run is over
    const mine = w.ents.filter(e => e.side === 0 && !e.mini);
    let k = 0;
    for (const x of m.a) if (!x.dead) {
      const e = mine[k++];
      x.max = e?.maxHp ?? x.max;
      if (!e || e.dead) x.dead = true;
      else x.hp = Math.min(e.maxHp, e.hp + e.maxHp * SURVIVAL.heal);
    }
    if (!m.a.some(x => !x.dead)) return (m.result = 1); // only a cell's fragments were left
    m.wave++;
    return null;
  }
  if (m.mode === 'duo' || m.mode === 'boss' || m.mode === 'football') return (m.result = w.result); // one round decides it
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
