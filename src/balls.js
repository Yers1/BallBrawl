// Ball definitions: stats + optional event hooks called by sim.js.
// Hooks: onWallHit(w, me, x, y) · onEnemyHit(w, me, foe) · onTick(w, me, dt) · onDeath(w, me) · onSuper(w, me)
// Tune with `npm run balance` — keep every ball's average win rate inside ~35–65%.
import { hurt, spawnBall, foes, W } from './sim.js';

export const LEECH = { stick: 2, cooldown: 4, drain: 5 };
export const CELL = { r: 20, hp: 24, dmg: 6, speed: 320 };
export const WEB = { r: 70, life: 5, max: 3, slow: 0.4, dps: 8 };
export const NINJA = { first: 0.8, base: 0.4, scale: 1.2, speed: 500, dmg: 6 };
export const TRAIN = { first: 2, every: 4, warn: 1, sweep: 0.6, dmg: 26, halfWidth: 22 };
export const SUPER = {
  ramTime: 0.6, ramMul: 3, ramDmg: 2,
  leechStick: 3, leechMul: 2,
  cellMiniHp: 18,
  webR: 80, webLife: 3, webSlow: 0.25,
  fan: 7, fanSpread: 0.6,
  trainWarn: 0.4, trainDmg: 30,
};

const aim = (me, f) => Math.atan2(f.y - me.y, f.x - me.x);
const nearest = (list, me) =>
  list.reduce((best, f) => (!best || Math.hypot(f.x - me.x, f.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y) ? f : best), null);

// Fold a straight-line prediction back into the arena (balls bounce off walls).
const bounceFold = (p, r) => {
  const L = W - 2 * r;
  const q = (((p - r) % (2 * L)) + 2 * L) % (2 * L);
  return r + (q > L ? 2 * L - q : q);
};

// Lay rails where the foe will be when the train arrives (h = rails along x at y = pos).
function rails(w, me, f, warn, dmg) {
  const axis = w.rand() < 0.5 ? 'h' : 'v';
  const lead = warn + TRAIN.sweep / 2;
  const pos = axis === 'h' ? bounceFold(f.y + f.vy * lead, f.r) : bounceFold(f.x + f.vx * lead, f.r);
  const dir = w.rand() < 0.5 ? 1 : -1;
  w.zones.push({ kind: 'train', owner: me, side: me.side, axis, pos, dir, dmg, born: w.t, go: w.t + warn, until: w.t + warn + TRAIN.sweep, hit: [] });
}

function throwStar(w, me, a) {
  w.shots.push({
    side: me.side, x: me.x + Math.cos(a) * me.r, y: me.y + Math.sin(a) * me.r,
    vx: Math.cos(a) * NINJA.speed, vy: Math.sin(a) * NINJA.speed, r: 6, dmg: NINJA.dmg, born: w.t,
  });
}

function splitOff(w, me, hp = CELL.hp) { // two mini cells fly out sideways
  const base = Math.atan2(me.vy, me.vx);
  for (const s of [-1, 1]) {
    const a = base + (s * Math.PI) / 2;
    spawnBall(w, me.side, 'cell', {
      x: me.x + Math.cos(a) * 12, y: me.y + Math.sin(a) * 12,
      vx: Math.cos(a) * CELL.speed, vy: Math.sin(a) * CELL.speed,
      r: CELL.r, hp, dmg: CELL.dmg, speed: CELL.speed, mini: true,
    });
  }
  w.events.push({ type: 'split', x: me.x, y: me.y });
}

export const BALLS = {
  basic: {
    hp: 120, color: '#8fa3bf', price: 0,
    onSuper(w, me) { // ram straight at the nearest foe
      const foe = nearest(foes(w, me), me);
      if (!foe) return;
      const a = aim(me, foe);
      me.vx = Math.cos(a) * me.speed;
      me.vy = Math.sin(a) * me.speed;
      me.boost = { until: w.t + SUPER.ramTime, mul: SUPER.ramMul, dmg: SUPER.ramDmg };
    },
  },

  leech: {
    hp: 90, color: '#d4374a', price: 100,
    onEnemyHit(w, me, foe) {
      if (me.latch || (me.cd.latch ?? 0) > w.t) return;
      const d = Math.hypot(me.x - foe.x, me.y - foe.y) || 1;
      const k = ((me.r + foe.r) * 0.85) / d;
      me.latch = { foe, ox: (me.x - foe.x) * k, oy: (me.y - foe.y) * k, until: w.t + LEECH.stick, mul: 1 };
      me.cd.latch = w.t + LEECH.stick + LEECH.cooldown;
      w.events.push({ type: 'latch', x: me.x, y: me.y });
    },
    onSuper(w, me) { // jump onto the nearest foe and drain double
      const foe = nearest(foes(w, me), me);
      if (!foe) return;
      const d = Math.hypot(me.x - foe.x, me.y - foe.y) || 1, k = ((me.r + foe.r) * 0.85) / d;
      me.boost = null;
      me.latch = { foe, ox: (me.x - foe.x) * k, oy: (me.y - foe.y) * k, until: w.t + SUPER.leechStick, mul: SUPER.leechMul };
      me.cd.latch = w.t + SUPER.leechStick + LEECH.cooldown;
      w.events.push({ type: 'latch', x: foe.x, y: foe.y });
    },
    onTick(w, me, dt) {
      const l = me.latch;
      if (!l) return;
      if (l.foe.dead || w.t >= l.until) {
        me.latch = null;
        const m = Math.hypot(l.ox, l.oy) || 1;
        me.vx = (l.ox / m) * me.speed;
        me.vy = (l.oy / m) * me.speed;
        return;
      }
      const drain = Math.min(LEECH.drain * l.mul * dt, l.foe.hp);
      hurt(w, l.foe, drain, true);
      me.hp = Math.min(me.maxHp, me.hp + drain);
    },
  },

  cell: {
    hp: 80, color: '#35b86b', price: 150,
    onDeath(w, me) {
      if (!me.mini && !me.split) splitOff(w, me);
    },
    onSuper(w, me) { // split early — but never more than 2 minis alive at once
      const alive = w.ents.filter(e => e.side === me.side && e.mini && !e.dead).length;
      if (alive === 0) splitOff(w, me, SUPER.cellMiniHp);
      else for (const e of w.ents) if (e.side === me.side && !e.dead) e.hp = Math.min(e.maxHp, e.hp + SUPER.cellMiniHp);
    },
  },

  spider: {
    hp: 110, color: '#7a5bd8', price: 150,
    onWallHit(w, me, x, y) {
      const webs = w.zones.filter(z => z.kind === 'web' && z.owner === me && !z.big);
      if (webs.length >= WEB.max) w.zones.splice(w.zones.indexOf(webs[0]), 1);
      // nudge the web 10 units off the wall so it sits on the playfield
      const nx = x === 0 ? 10 : x === W ? W - 10 : x, ny = y === 0 ? 10 : y === W ? W - 10 : y;
      w.zones.push({ kind: 'web', owner: me, side: me.side, x: nx, y: ny, r: WEB.r, born: w.t, until: w.t + WEB.life });
    },
    onTick(w, me, dt) {
      for (const z of w.zones) {
        if (z.kind !== 'web' || z.owner !== me) continue;
        for (const f of foes(w, me)) {
          if (Math.hypot(f.x - z.x, f.y - z.y) >= z.r + f.r * 0.5) continue;
          f.slow = Math.min(f.slow, z.slow ?? WEB.slow);
          hurt(w, f, WEB.dps * dt, true);
        }
      }
    },
    onSuper(w, me) { // a big trap web right under the foe
      const foe = nearest(foes(w, me), me);
      if (foe) w.zones.push({ kind: 'web', owner: me, side: me.side, x: foe.x, y: foe.y, r: SUPER.webR, slow: SUPER.webSlow, big: true, born: w.t, until: w.t + SUPER.webLife });
    },
  },

  ninja: {
    hp: 90, color: '#3a4256', price: 200,
    onTick(w, me) {
      me.cd.throw ??= w.t + NINJA.first;
      if (w.t < me.cd.throw) return;
      me.cd.throw = w.t + NINJA.base + NINJA.scale * (me.hp / me.maxHp);
      const f = nearest(foes(w, me), me);
      if (f) throwStar(w, me, aim(me, f));
    },
    onSuper(w, me) { // a fan of shurikens
      const f = nearest(foes(w, me), me);
      if (!f) return;
      for (let i = 0; i < SUPER.fan; i++) throwStar(w, me, aim(me, f) + SUPER.fanSpread * ((2 * i) / (SUPER.fan - 1) - 1));
    },
  },

  train: {
    hp: 100, color: '#e09a2b', price: 250,
    onTick(w, me) {
      me.cd.train ??= TRAIN.first;
      if (w.t >= me.cd.train) {
        me.cd.train = w.t + TRAIN.every;
        const f = nearest(foes(w, me), me);
        if (f) rails(w, me, f, TRAIN.warn, TRAIN.dmg);
      }
      for (const z of w.zones) {
        if (z.kind !== 'train' || z.owner !== me || w.t < z.go) continue;
        const p = (w.t - z.go) / TRAIN.sweep, front = z.dir > 0 ? p * (W + 120) - 60 : W + 60 - p * (W + 120);
        for (const f of foes(w, me)) {
          const along = z.axis === 'h' ? f.x : f.y, across = z.axis === 'h' ? f.y : f.x;
          const passed = z.dir > 0 ? along <= front : along >= front;
          if (passed && Math.abs(across - z.pos) < TRAIN.halfWidth + f.r && !z.hit.includes(f)) {
            z.hit.push(f);
            hurt(w, f, z.dmg);
          }
        }
      }
    },
    onSuper(w, me) { // an express with almost no warning
      const f = nearest(foes(w, me), me);
      if (f) rails(w, me, f, SUPER.trainWarn, SUPER.trainDmg);
    },
  },
};

export const ORDER = Object.keys(BALLS);
