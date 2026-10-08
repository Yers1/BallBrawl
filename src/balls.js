// Ball definitions: stats + optional event hooks called by sim.js.
// Hooks: onWallHit(w, me, x, y) · onEnemyHit(w, me, foe) · onTick(w, me, dt) · onDeath(w, me) · onSuper(w, me)
// Tune with `npm run balance` — keep every ball's average win rate inside ~35–65%.
import { hurt, spawnBall, foes, W } from './sim.js';

export const LEECH = { stick: 2, cooldown: 4, drain: 4 };
export const CELL = { r: 20, hp: 24, dmg: 6, speed: 320 };
export const WEB = { r: 70, life: 5, max: 3, slow: 0.4, dps: 8 };
export const NINJA = { first: 0.8, base: 0.4, scale: 1.2, speed: 500, dmg: 6 };
export const TRAIN = { first: 2, every: 4, warn: 1, sweep: 0.6, dmg: 26, halfWidth: 22 };
export const MAGNET = { range: 230, pull: 1.0, superPull: 5, superTime: 2 };
export const BOMB = { cooldown: 2.2, blastR: 75, blast: 7, r: 70, dmg: 18, superCount: 4, superStep: 0.2 };
export const TURTLE = { first: 1.5, every: 6, shield: 1.5, mul: 0.7, reflect: 0.3, superShield: 2, superHeal: 10 };
export const BOLT = { first: 1, every: 2.8, dmg: 8, storm: 5, stormGap: 0.3 };
export const SPIKES = { thorns: 3, needles: 12, needleDmg: 5 };
export const ICE = { chill: 2, slow: 0.5, freeze: 2.5, freezeSlow: 0.05 };
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

function throwStar(w, me, a, kind = 'star', dmg = NINJA.dmg) {
  w.shots.push({
    side: me.side, kind, x: me.x + Math.cos(a) * me.r, y: me.y + Math.sin(a) * me.r,
    vx: Math.cos(a) * NINJA.speed, vy: Math.sin(a) * NINJA.speed, r: 6, dmg, born: w.t,
  });
}

// Turn a ball's heading toward (x, y) by at most `max` radians, keeping its speed.
function steer(e, x, y, max) {
  if (!e.vx && !e.vy) return;
  const cur = Math.atan2(e.vy, e.vx);
  let d = Math.atan2(y - e.y, x - e.x) - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const a = cur + Math.max(-max, Math.min(max, d)), m = Math.hypot(e.vx, e.vy);
  e.vx = Math.cos(a) * m;
  e.vy = Math.sin(a) * m;
}

function plant(w, me, x, y, fuse) {
  w.zones.push({ kind: 'bomb', owner: me, side: me.side, x, y, r: BOMB.r, born: w.t, go: w.t + fuse, until: w.t + fuse + 0.3, done: false });
}

function zap(w, me, f) {
  hurt(w, f, BOLT.dmg);
  w.zones.push({ kind: 'zap', owner: me, side: me.side, x: me.x, y: me.y, x2: f.x, y2: f.y, born: w.t, until: w.t + 0.18 });
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

  magnet: {
    hp: 110, dmg: 14, color: '#ff5a36', price: 300, // hits hard on contact; the pull makes sure it connects
    onTick(w, me, dt) { // drags nearby foes' paths toward itself; the super makes it irresistible
      const strong = (me.cd.pullUntil ?? 0) > w.t, pull = (strong ? MAGNET.superPull : MAGNET.pull) * dt;
      for (const f of foes(w, me)) if (strong || Math.hypot(f.x - me.x, f.y - me.y) < MAGNET.range) steer(f, me.x, me.y, pull);
    },
    onSuper(w, me) { me.cd.pullUntil = w.t + MAGNET.superTime; },
  },

  bomb: {
    hp: 95, color: '#2a2a38', price: 350,
    onEnemyHit(w, me, foe) { // blows up on impact (with a short fuse to recharge), hurting every foe nearby
      if ((me.cd.blast ?? 0) > w.t) return;
      me.cd.blast = w.t + BOMB.cooldown;
      const x = (me.x + foe.x) / 2, y = (me.y + foe.y) / 2;
      w.events.push({ type: 'boom', x, y, r: BOMB.blastR });
      for (const f of foes(w, me)) if (Math.hypot(f.x - x, f.y - y) < BOMB.blastR + f.r * 0.5) hurt(w, f, BOMB.blast);
    },
    onTick(w, me) {
      for (const z of w.zones) {
        if (z.kind !== 'bomb' || z.owner !== me || z.done || w.t < z.go) continue;
        z.done = true;
        w.events.push({ type: 'boom', x: z.x, y: z.y, r: z.r });
        for (const f of foes(w, me)) if (Math.hypot(f.x - z.x, f.y - z.y) < z.r + f.r * 0.5) hurt(w, f, BOMB.dmg);
      }
    },
    onSuper(w, me) { // carpet: bombs along the foe's path, each timed to go off as it arrives
      const f = nearest(foes(w, me), me);
      if (!f) return;
      for (let i = 1; i <= BOMB.superCount; i++) {
        const t = i * BOMB.superStep;
        plant(w, me, bounceFold(f.x + f.vx * t, f.r), bounceFold(f.y + f.vy * t, f.r), t);
      }
    },
  },

  turtle: {
    hp: 115, speed: 240, color: '#8bbf3f', price: 400,
    onTick(w, me) {
      me.cd.shell ??= TURTLE.first;
      if (w.t < me.cd.shell) return;
      me.cd.shell = w.t + TURTLE.every;
      me.shieldUntil = Math.max(me.shieldUntil, w.t + TURTLE.shield);
      me.shieldMul = TURTLE.mul;
    },
    onEnemyHit(w, me, foe) { if (me.shieldUntil > w.t) hurt(w, foe, foe.dmg * TURTLE.reflect); },
    onSuper(w, me) {
      me.shieldUntil = w.t + TURTLE.superShield;
      me.shieldMul = TURTLE.mul;
      me.hp = Math.min(me.maxHp, me.hp + TURTLE.superHeal);
    },
  },

  lightning: {
    hp: 90, color: '#ffd23f', price: 450,
    onTick(w, me) {
      const f = nearest(foes(w, me), me);
      if (!f) return;
      me.cd.zap ??= BOLT.first;
      if (w.t >= me.cd.zap) { me.cd.zap = w.t + BOLT.every; zap(w, me, f); }
      if (me.cd.storm > 0 && w.t >= me.cd.stormNext) { me.cd.storm--; me.cd.stormNext = w.t + BOLT.stormGap; zap(w, me, f); }
    },
    onSuper(w, me) { me.cd.storm = BOLT.storm; me.cd.stormNext = w.t; },
  },

  hedgehog: {
    hp: 100, color: '#9c6b4a', price: 500,
    onEnemyHit(w, me, foe) { hurt(w, foe, SPIKES.thorns); },
    onSuper(w, me) {
      for (let i = 0; i < SPIKES.needles; i++) throwStar(w, me, (i / SPIKES.needles) * Math.PI * 2, 'needle', SPIKES.needleDmg);
    },
  },

  ice: {
    hp: 120, color: '#8fe3ff', price: 550,
    onEnemyHit(w, me, foe) {
      foe.chillUntil = w.t + ICE.chill;
      foe.chillSlow = Math.min(ICE.slow, foe.chillUntil > w.t && foe.chillSlow < 1 ? foe.chillSlow : 1);
    },
    onSuper(w, me) {
      const f = nearest(foes(w, me), me);
      if (!f) return;
      f.chillUntil = w.t + ICE.freeze;
      f.chillSlow = ICE.freezeSlow;
      w.events.push({ type: 'freeze', x: f.x, y: f.y });
    },
  },
};

export const ORDER = Object.keys(BALLS);
