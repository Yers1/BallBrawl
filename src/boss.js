// The boss fight's four bosses: a giant ball (a base ball's look and super) with an attack of its own, always shown
// first so a kid can see it coming and dash away. Under half HP the boss gets angry: faster, attacking more often.
import { hurt, spawnBall } from './sim.js';
import { CELL, ICE } from './balls.js';

export const BOSSES = {
  slime: { ball: 'cell', hp: 255, miniHp: 22 }, // King Slime: spits out two slimes at 2/3 and at 1/3 HP (and splits when it pops)
  frost: { ball: 'ice', hp: 320, first: 3, every: 6, warn: 1.2, r: 125, dmg: 7, chill: 1.6 }, // Frost Giant: a chilling quake around it
  dragon: { ball: 'basic', skin: 'lava', hp: 320, first: 2.5, every: 5, warn: 1, len: 440, width: 36, dmg: 11 }, // Fire Dragon: fire breath in a line
  golem: { ball: 'turtle', skin: 'silver', hp: 280, first: 2, every: 5, speed: 330, dmg: 5 }, // Iron Golem: a rocket at every ball, and its shell
};
export const BOSS_IDS = Object.keys(BOSSES);
export const RAGE = { at: 0.5, speed: 1.15, cd: 0.7 };

const segDist = (f, z) => { // from a ball to the breath's line
  const dx = Math.cos(z.a), dy = Math.sin(z.a), k = Math.max(0, Math.min(z.len, (f.x - z.x) * dx + (f.y - z.y) * dy));
  return Math.hypot(f.x - z.x - dx * k, f.y - z.y - dy * k);
};

export function bossTick(w, e) {
  const B = BOSSES[e.boss];
  if (!B) return;
  if (!e.rage && e.hp < e.maxHp * RAGE.at) {
    e.rage = true;
    e.speed *= RAGE.speed;
    w.events.push({ type: 'rage', x: e.x, y: e.y, side: e.side });
  }
  const foes = w.ents.filter(f => !f.dead && f.side !== e.side);
  if (e.boss === 'slime') {
    const n = e.cd.spat ?? 0;
    if (n < 2 && e.hp < (e.maxHp * (2 - n)) / 3) {
      e.cd.spat = n + 1;
      for (const s of [-1, 1]) {
        const a = Math.atan2(e.vy, e.vx) + (s * Math.PI) / 2;
        spawnBall(w, e.side, 'cell', { x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, vx: Math.cos(a) * CELL.speed, vy: Math.sin(a) * CELL.speed, r: CELL.r, hp: B.miniHp, dmg: CELL.dmg, speed: CELL.speed, mini: true });
      }
      w.events.push({ type: 'spit', x: e.x, y: e.y, side: e.side });
    }
    return;
  }
  e.cd.atk ??= B.first;
  if (w.t >= e.cd.atk && foes.length) {
    e.cd.atk = w.t + B.every * (e.rage ? RAGE.cd : 1);
    const f = foes.reduce((b, o) => (Math.hypot(o.x - e.x, o.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? o : b));
    if (e.boss === 'frost') w.zones.push({ kind: 'quake', owner: e, side: e.side, x: e.x, y: e.y, r: B.r, born: w.t, go: w.t + B.warn, until: w.t + B.warn + 0.4, done: false });
    else if (e.boss === 'dragon') w.zones.push({ kind: 'breath', owner: e, side: e.side, x: e.x, y: e.y, a: Math.atan2(f.y - e.y, f.x - e.x), len: B.len, width: B.width, born: w.t, go: w.t + B.warn, until: w.t + B.warn + 0.5, hit: {} });
    else if (e.boss === 'golem') {
      for (const o of foes) {
        const a = Math.atan2(o.y - e.y, o.x - e.x);
        w.shots.push({ side: e.side, kind: 'rocket', x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed, r: 7, dmg: B.dmg, born: w.t });
      }
      w.events.push({ type: 'rockets', x: e.x, y: e.y, side: e.side });
    }
  }
  for (const z of w.zones) {
    if (z.owner !== e || w.t < z.go) { if (z.owner === e && z.kind === 'quake') { z.x = e.x; z.y = e.y; } continue; } // the quake ring follows the giant until it lands
    if (z.kind === 'quake' && !z.done) {
      z.done = true;
      w.events.push({ type: 'quake', x: z.x, y: z.y, r: z.r });
      for (const f of foes) if (Math.hypot(f.x - z.x, f.y - z.y) < z.r + f.r) {
        const cold = f.chillUntil > w.t ? f.chillSlow : 1;
        f.chillUntil = Math.max(f.chillUntil, w.t + B.chill);
        f.chillSlow = Math.min(cold, ICE.slow);
        hurt(w, f, B.dmg);
      }
    } else if (z.kind === 'breath') for (const f of foes) if (!z.hit[f.id] && segDist(f, z) < z.width / 2 + f.r) { z.hit[f.id] = 1; hurt(w, f, B.dmg); }
  }
}
