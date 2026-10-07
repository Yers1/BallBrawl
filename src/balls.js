// Ball definitions: stats + optional event hooks called by sim.js.
// Hooks: onWallHit(w, me, x, y) · onEnemyHit(w, me, foe) · onTick(w, me, dt) · onDeath(w, me)
import { hurt, spawnBall, foes, W } from './sim.js';

const nearest = (list, me) =>
  list.reduce((best, f) => (!best || Math.hypot(f.x - me.x, f.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y) ? f : best), null);

// Fold a straight-line prediction back into the arena (balls bounce off walls).
const bounceFold = (p, r) => {
  const L = W - 2 * r;
  const q = (((p - r) % (2 * L)) + 2 * L) % (2 * L);
  return r + (q > L ? 2 * L - q : q);
};

export const TRAIN = { first: 3, every: 5, warn: 1, sweep: 0.6, dmg: 30, halfWidth: 22 };

export const BALLS = {
  basic: { hp: 120, color: '#8fa3bf', price: 0 },

  leech: {
    hp: 90, color: '#d4374a', price: 100,
    onEnemyHit(w, me, foe) {
      if (me.latch || (me.cd.latch ?? 0) > w.t) return;
      const d = Math.hypot(me.x - foe.x, me.y - foe.y) || 1;
      const k = ((me.r + foe.r) * 0.85) / d;
      me.latch = { foe, ox: (me.x - foe.x) * k, oy: (me.y - foe.y) * k, until: w.t + 2 };
      me.cd.latch = w.t + 6; // 2 s stuck + 4 s cooldown
      w.events.push({ type: 'latch', x: me.x, y: me.y });
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
      const drain = Math.min(6 * dt, l.foe.hp);
      hurt(w, l.foe, drain, true);
      me.hp = Math.min(me.maxHp, me.hp + drain);
    },
  },

  cell: {
    hp: 80, color: '#35b86b', price: 150,
    onDeath(w, me) {
      if (me.mini || me.split) return;
      const base = Math.atan2(me.vy, me.vx);
      for (const s of [-1, 1]) {
        const a = base + (s * Math.PI) / 2;
        spawnBall(w, me.side, 'cell', {
          x: me.x + Math.cos(a) * 12, y: me.y + Math.sin(a) * 12,
          vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
          r: 18, hp: 25, dmg: 5, speed: 260, mini: true,
        });
      }
      w.events.push({ type: 'split', x: me.x, y: me.y });
    },
  },

  spider: {
    hp: 100, color: '#7a5bd8', price: 150,
    onWallHit(w, me, x, y) {
      const webs = w.zones.filter(z => z.kind === 'web' && z.owner === me);
      if (webs.length >= 3) w.zones.splice(w.zones.indexOf(webs[0]), 1);
      // nudge the web 10 units off the wall so it sits on the playfield
      const nx = x === 0 ? 10 : x === W ? W - 10 : x, ny = y === 0 ? 10 : y === W ? W - 10 : y;
      w.zones.push({ kind: 'web', owner: me, side: me.side, x: nx, y: ny, r: 40, born: w.t, until: w.t + 4 });
    },
    onTick(w, me, dt) {
      for (const z of w.zones) {
        if (z.kind !== 'web' || z.owner !== me) continue;
        for (const f of foes(w, me)) {
          if (Math.hypot(f.x - z.x, f.y - z.y) >= z.r + f.r * 0.5) continue;
          f.slow = 0.5;
          hurt(w, f, 3 * dt, true);
        }
      }
    },
  },

  ninja: {
    hp: 90, color: '#3a4256', price: 200,
    onTick(w, me) {
      me.cd.throw ??= w.t + 1;
      if (w.t < me.cd.throw) return;
      me.cd.throw = w.t + 0.5 + 1.5 * (me.hp / me.maxHp);
      const f = nearest(foes(w, me), me);
      if (!f) return;
      const a = Math.atan2(f.y - me.y, f.x - me.x);
      w.shots.push({
        side: me.side, x: me.x + Math.cos(a) * me.r, y: me.y + Math.sin(a) * me.r,
        vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, r: 6, dmg: 4, born: w.t,
      });
    },
  },

  train: {
    hp: 100, color: '#e09a2b', price: 250,
    onTick(w, me) {
      me.cd.train ??= TRAIN.first;
      if (w.t >= me.cd.train) {
        me.cd.train = w.t + TRAIN.every;
        const f = nearest(foes(w, me), me);
        if (f) {
          const axis = w.rand() < 0.5 ? 'h' : 'v'; // h = rails along x at y = pos
          const lead = TRAIN.warn + TRAIN.sweep / 2;
          const pos = axis === 'h' ? bounceFold(f.y + f.vy * lead, f.r) : bounceFold(f.x + f.vx * lead, f.r);
          const dir = w.rand() < 0.5 ? 1 : -1;
          w.zones.push({ kind: 'train', owner: me, side: me.side, axis, pos, dir, born: w.t, go: w.t + TRAIN.warn, until: w.t + TRAIN.warn + TRAIN.sweep, hit: [] });
        }
      }
      for (const z of w.zones) {
        if (z.kind !== 'train' || z.owner !== me || w.t < z.go) continue;
        const p = (w.t - z.go) / TRAIN.sweep, front = z.dir > 0 ? p * (W + 120) - 60 : W + 60 - p * (W + 120);
        for (const f of foes(w, me)) {
          const along = z.axis === 'h' ? f.x : f.y, across = z.axis === 'h' ? f.y : f.x;
          const passed = z.dir > 0 ? along <= front : along >= front;
          if (passed && Math.abs(across - z.pos) < TRAIN.halfWidth + f.r && !z.hit.includes(f)) {
            z.hit.push(f);
            hurt(w, f, TRAIN.dmg);
          }
        }
      }
    },
  },
};

export const ORDER = Object.keys(BALLS);
