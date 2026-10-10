// Ball definitions: stats + optional event hooks called by sim.js.
// Hooks: onWallHit(w, me, x, y) · onEnemyHit(w, me, foe) · onTick(w, me, dt) · onDeath(w, me) · onSuper(w, me)
// Tune with `npm run balance` — keep every ball's average win rate inside ~35–65%.
import { hurt, spawnBall, foes, W, DMG } from './sim.js';

export const LEECH = { stick: 2, cooldown: 4, drain: 4, overheal: 1.3 };
export const CELL = { r: 20, hp: 24, dmg: 6, speed: 320 };
export const WEB = { r: 70, life: 5, max: 3, slow: 0.4, dps: 8 };
export const NINJA = { first: 0.8, base: 0.4, scale: 1.2, speed: 500, dmg: 6 };
// The train lays a track behind it; every few seconds a real train (locomotive + cars) rides that track
// from its far end up to the ball, hitting and knocking aside every foe it touches (once per train).
export const TRAIN = {
  life: 3, gap: 10, warm: 0.3, halfWidth: 13, boostMul: 1.25, boostDmg: 1.15,
  first: 2.5, every: 5, minLen: 150, speed: 560, cars: 5, spacing: 32, dmg: 19,
  express: 820, expressCars: 9, superDmg: 26,
};
export const MAGNET = { first: 1.5, every: 4.5, speed: 650, dmg: 3, pull: 800, grip: 0.5, slam: 8, superSlam: 14 };
export const BOMB = { cooldown: 2.2, blastR: 75, blast: 7, r: 70, dmg: 18, superCount: 4, superStep: 0.2 };
export const TURTLE = { first: 1.5, every: 6, shield: 1.5, mul: 0.7, reflect: 0.3, superShield: 2, superHeal: 10 };
export const BOLT = { first: 1, every: 2.8, dmg: 8, storm: 5, stormGap: 0.3 };
export const SPIKES = { thorns: 4, needles: 16, needleDmg: 5, curl: 2.5, curlMul: 2 };
export const ICE = { chill: 2, slow: 0.5, freeze: 2.5, freezeSlow: 0.05, brittle: 1.5 };
export const POISON = { len: 28, hit: 7, tick: 1, every: 0.2, last: 2.5, max: 40, touchCd: 0.5, reach: 16 };
export const CHAIN = { first: 1.4, every: 3, r: 70, life: 4, max: 3, dmg: 3, tick: 0.6, pull: 90, slow: 0.6, lead: 0.4 };
// Chess: every few seconds it picks a random piece and moves like it across an 8×8 board, untouchable on the way.
export const CHESS = { first: 2, every: 6.5, board: 5, aim: 0.55, speed: 1600, dmg: 3, queenDmg: 4 };
export const FORGE = { every: 2.5, dmgPerLv: 3.5, maxLv: 8, superLv: 3 };
export const SUPER = {
  ramTime: 0.6, ramMul: 3, ramDmg: 2,
  leechStick: 3, leechMul: 2,
  cellMiniHp: 18,
  webR: 80, webLife: 3, webSlow: 0.25,
  fan: 7, fanSpread: 0.6,
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

// The train lays rails behind itself (one 'track' zone per train, a polyline of recent positions).
const segDist = (px, py, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return Math.hypot(px - a.x - dx * k, py - a.y - dy * k);
};
// Is the ball on the rails? Segments laid in the last `warm` seconds don't count: the rails set a little behind the train.
export const onTrack = (z, e, warm, t) =>
  z.pts.some((p, i) => i > 0 && z.pts[i].t <= t - warm && segDist(e.x, e.y, z.pts[i - 1], p) < TRAIN.halfWidth + e.r * 0.6);
const trackOf = (w, me) => {
  let z = w.zones.find(z => z.kind === 'track' && z.owner === me);
  if (!z) w.zones.push(z = { kind: 'track', owner: me, side: me.side, pts: [], old: [], born: w.t, until: Infinity, trains: [] });
  return z;
};
// A polyline with cumulative lengths, and the point (plus heading) `d` units along it.
export function pathOf(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1] };
}
export function pathAt(p, d) {
  const n = p.pts.length;
  if (n < 2) return { x: p.pts[0]?.x ?? 0, y: p.pts[0]?.y ?? 0, a: 0 };
  d = Math.max(0, Math.min(p.len, d));
  let i = 1;
  while (i < n - 1 && p.cum[i] < d) i++;
  const a = p.pts[i - 1], b = p.pts[i], seg = p.cum[i] - p.cum[i - 1] || 1, u = (d - p.cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, a: Math.atan2(b.y - a.y, b.x - a.x) };
}
// Where each car of a train is at time t (cars not yet on the track, or already past its end, are left out).
export function trainCars(tr, t) {
  const head = (t - tr.go) * tr.speed, out = [];
  for (let i = 0; i < tr.cars; i++) {
    const d = head - i * TRAIN.spacing;
    if (d >= 0 && d <= tr.path.len) out.push({ ...pathAt(tr.path, d), i });
  }
  return out;
}
function sendTrain(w, me, z, express) {
  const pts = [...z.pts.map(p => ({ x: p.x, y: p.y })), { x: me.x, y: me.y }];
  if (express) { // the express carries on past the ball, straight to the wall
    const m = Math.hypot(me.vx, me.vy) || 1, ux = me.vx / m, uy = me.vy / m;
    const reach = Math.min(ux > 0 ? (W - me.r - me.x) / ux : ux < 0 ? (me.r - me.x) / ux : 1e9, uy > 0 ? (W - me.r - me.y) / uy : uy < 0 ? (me.r - me.y) / uy : 1e9);
    pts.push({ x: me.x + ux * reach, y: me.y + uy * reach });
  }
  z.trains.push({
    path: pathOf(pts), go: w.t, express, hit: {},
    speed: express ? TRAIN.express : TRAIN.speed, cars: express ? TRAIN.expressCars : TRAIN.cars, dmg: express ? TRAIN.superDmg : TRAIN.dmg,
  });
  w.events.push({ type: 'train', x: pts[0].x, y: pts[0].y, express });
}

function throwStar(w, me, a, kind = 'star', dmg = NINJA.dmg) {
  w.shots.push({
    side: me.side, kind, x: me.x + Math.cos(a) * me.r, y: me.y + Math.sin(a) * me.r,
    vx: Math.cos(a) * NINJA.speed, vy: Math.sin(a) * NINJA.speed, r: 6, dmg, born: w.t,
  });
}

// A hooked foe is reeled in by the magnet (its own movement pauses) and slammed on arrival.
const grab = (w, me, f, slam) => { if (!f.dead && !f.latch) f.yank = { by: me, until: w.t + MAGNET.grip, slam }; };
function hook(w, me, f) {
  const a = aim(me, f);
  w.shots.push({
    side: me.side, kind: 'hook', owner: me, x: me.x + Math.cos(a) * me.r, y: me.y + Math.sin(a) * me.r,
    vx: Math.cos(a) * MAGNET.speed, vy: Math.sin(a) * MAGNET.speed, r: 8, dmg: MAGNET.dmg, born: w.t,
    onHit: (w, hit) => grab(w, me, hit, MAGNET.slam),
  });
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

// Like the original Chess Ball: it slides to the middle, the arena turns into a chessboard, a random piece stands on
// the ball and red lines show where it can go — then it strikes along the line that reaches the foe. Untouchable throughout.
const PIECES = ['rook', 'bishop', 'knight'];
const DIRS = { rook: [[1, 0], [-1, 0], [0, 1], [0, -1]], bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
DIRS.queen = [...DIRS.rook, ...DIRS.bishop];
const KNIGHT = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
const rayEnd = (x, y, dx, dy, r) => { // along (dx, dy) until a ball's radius short of the wall
  const m = Math.hypot(dx, dy), ux = dx / m, uy = dy / m;
  const k = Math.max(0, Math.min(ux > 0 ? (W - r - x) / ux : ux < 0 ? (r - x) / ux : Infinity, uy > 0 ? (W - r - y) / uy : uy < 0 ? (r - y) / uy : Infinity));
  return { x: x + ux * k, y: y + uy * k };
};
function chessMove(w, me, piece, dmg, fromHere = false) {
  const to = fromHere ? { x: me.x, y: me.y } : { x: W / 2, y: W / 2 }; // a move starts in the middle of the board
  me.chess = { piece, dmg, stage: 'go', at: w.t, path: pathOf([{ x: me.x, y: me.y }, to]), d: 0, hit: {} };
  me.vx = me.vy = 0;
  w.events.push({ type: 'chess', x: me.x, y: me.y, piece });
}
// From the middle it runs out along EVERY line of its piece and back (a knight hops to each of its squares and back):
// small hits, but each line can catch a foe once.
function chessAim(w, me) {
  const m = me.chess, sq = W / CHESS.board, from = { x: me.x, y: me.y };
  const ends = m.piece === 'knight'
    ? KNIGHT.map(([dx, dy]) => ({ x: Math.min(W - me.r, Math.max(me.r, me.x + dx * sq)), y: Math.min(W - me.r, Math.max(me.r, me.y + dy * sq)) }))
    : DIRS[m.piece].map(([dx, dy]) => rayEnd(me.x, me.y, dx, dy, me.r));
  if (m.piece === 'knight') m.targets = ends; else m.lines = ends;
  Object.assign(m, { stage: 'aim', at: w.t, from, strike: pathOf([from, ...ends.flatMap(e => [e, from])]), d: 0 });
}
function chessTick(w, me, dt) {
  const m = me.chess;
  me.vx = me.vy = 0;
  if (m.stage === 'aim') { if (w.t - m.at >= CHESS.aim) Object.assign(m, { stage: 'hit', at: w.t }); return; } // standing on its square, it can be hit
  me.invulnUntil = w.t + 0.05; // while it moves, nothing touches it
  const path = m.stage === 'go' ? m.path : m.strike;
  m.d += CHESS.speed * dt;
  const p = pathAt(path, m.d);
  me.x = p.x;
  me.y = p.y;
  if (m.stage === 'hit') {
    let line = 0; // which line it is on: out and back along one line is one line
    while (2 * line + 2 < path.cum.length && path.cum[2 * line + 2] <= m.d) line++;
    for (const f of foes(w, me)) if (m.hit[f.id] !== line && Math.hypot(f.x - me.x, f.y - me.y) < f.r + me.r) { m.hit[f.id] = line; hurt(w, f, m.dmg); }
  }
  if (m.d < path.len) return;
  if (m.stage === 'go') return chessAim(w, me);
  me.chess = null; // all lines done: back in the middle, it rolls off at the foe
  const f = nearest(foes(w, me), me), a = f ? aim(me, f) : 0;
  me.vx = Math.cos(a) * me.speed;
  me.vy = Math.sin(a) * me.speed;
}

export const BALLS = {
  basic: {
    hp: 130, color: '#8fa3bf', price: 0,
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
      me.hp = Math.min(me.maxHp * LEECH.overheal, me.hp + drain); // it can overfill a little: the snowball is the point
    },
  },

  cell: {
    hp: 90, color: '#35b86b', price: 150,
    onDeath(w, me) {
      if (!me.mini && !me.split) splitOff(w, me);
    },
    canSuper: (w, me) => !me.mini, // only the whole cell can split; its fragments have no super
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
          f.cd.web = (f.cd.web ?? 0) + WEB.dps * dt; // shown as damage numbers, a few points at a time
          if (f.cd.web >= 2) { w.events.push({ type: 'tick', id: f.id, amount: f.cd.web, side: f.side }); f.cd.web = 0; }
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
      const z = trackOf(w, me), last = z.pts[z.pts.length - 1];
      if (!last || Math.hypot(me.x - last.x, me.y - last.y) >= TRAIN.gap) z.pts.push({ x: me.x, y: me.y, t: w.t });
      while (z.pts.length > 1 && z.pts[0].t < w.t - TRAIN.life) z.pts.shift();
      if ((!me.boost || me.boost.until <= w.t || me.boost.rails) && onTrack(z, me, TRAIN.warm, w.t)) { // speeds up on its own rails
        me.boost = { until: w.t + 0.1, mul: TRAIN.boostMul, dmg: TRAIN.boostDmg, rails: true };
      }
      me.cd.train ??= TRAIN.first;
      if (w.t >= me.cd.train) {
        if (pathOf(z.pts).len >= TRAIN.minLen) { sendTrain(w, me, z, false); me.cd.train = w.t + TRAIN.every; }
        else me.cd.train = w.t + 0.5; // not enough track yet
      }
      for (const tr of z.trains) {
        for (const car of trainCars(tr, w.t)) {
          for (const f of foes(w, me)) {
            if (tr.hit[f.id] || Math.hypot(f.x - car.x, f.y - car.y) >= TRAIN.halfWidth + f.r) continue;
            tr.hit[f.id] = true;
            const nx = -Math.sin(car.a), ny = Math.cos(car.a), side = (f.x - car.x) * nx + (f.y - car.y) * ny >= 0 ? 1 : -1;
            if (!f.latch && !f.yank) { f.vx = nx * side * f.speed; f.vy = ny * side * f.speed; } // run over: knocked off the track
            w.events.push({ type: 'clash', x: f.x, y: f.y });
            hurt(w, f, tr.dmg);
          }
        }
      }
      z.trains = z.trains.filter(tr => (w.t - tr.go) * tr.speed - (tr.cars - 1) * TRAIN.spacing <= tr.path.len);
    },
    onSuper(w, me) { sendTrain(w, me, trackOf(w, me), true); },
  },

  magnet: {
    hp: 110, color: '#ff5a36', price: 300,
    onTick(w, me, dt) { // fires a magnetic hook now and then; a hooked foe is reeled in and slammed
      me.cd.hook ??= MAGNET.first;
      if (w.t >= me.cd.hook) {
        me.cd.hook = w.t + MAGNET.every;
        const f = nearest(foes(w, me), me);
        if (f) hook(w, me, f);
      }
      for (const f of foes(w, me)) {
        const y = f.yank;
        if (!y || y.by !== me) continue;
        const dx = me.x - f.x, dy = me.y - f.y, d = Math.hypot(dx, dy) || 1, gap = d - (me.r + f.r + 1), st = MAGNET.pull * dt;
        if (gap <= st) { // reeled all the way in: the slam, then it bounces off
          f.yank = null;
          f.x += (dx / d) * Math.max(0, gap);
          f.y += (dy / d) * Math.max(0, gap);
          f.vx = (-dx / d) * f.speed;
          f.vy = (-dy / d) * f.speed;
          w.events.push({ type: 'clash', x: f.x + (dx / d) * f.r, y: f.y + (dy / d) * f.r });
          hurt(w, f, y.slam);
        } else if (w.t >= y.until) f.yank = null; // the chain gave out
        else {
          f.slow = 0; // the chain moves it this tick, not its own speed
          f.x += (dx / d) * st;
          f.y += (dy / d) * st;
        }
      }
    },
    onSuper(w, me) { // every foe at once, harder
      for (const f of foes(w, me)) grab(w, me, f, MAGNET.superSlam);
      me.cd.pullUntil = w.t + MAGNET.grip;
    },
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
    onEnemyHit(w, me, foe) { hurt(w, foe, SPIKES.thorns * ((me.cd.curl ?? 0) > w.t ? SPIKES.curlMul : 1)); },
    onSuper(w, me) { // needles fly out in a ring, and it curls up: double thorns for a while
      me.cd.curl = w.t + SPIKES.curl;
      for (let i = 0; i < SPIKES.needles; i++) throwStar(w, me, (i / SPIKES.needles) * Math.PI * 2, 'needle', SPIKES.needleDmg);
    },
  },

  ice: {
    hp: 120, color: '#8fe3ff', price: 550,
    onEnemyHit(w, me, foe) {
      foe.chillUntil = w.t + ICE.chill;
      foe.chillSlow = Math.min(ICE.slow, foe.chillUntil > w.t && foe.chillSlow < 1 ? foe.chillSlow : 1);
      w.events.push({ type: 'chill', id: foe.id, x: foe.x, y: foe.y, r: foe.r }); // for the picture only
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

// A spike stuck to the wall, pointing inward; tilt is derived from the position, so no RNG is spent on a cosmetic.
function spike(w, me, x, y) {
  const nx = x <= 0 ? 1 : x >= W ? -1 : 0, ny = y <= 0 ? 1 : y >= W ? -1 : 0;
  w.zones.push({ kind: 'spike', owner: me, side: me.side, x, y, nx, ny, tilt: (((Math.round(x) * 7 + Math.round(y) * 13) % 9) - 4) * 0.08, born: w.t, until: Infinity, cd: {} });
  const mine = w.zones.filter(z => z.kind === 'spike' && z.owner === me);
  if (mine.length > POISON.max) w.zones.splice(w.zones.indexOf(mine[0]), 1);
}

function ring(w, me, x, y) {
  w.zones.push({ kind: 'ring', owner: me, side: me.side, x, y, r: CHAIN.r, born: w.t, until: w.t + CHAIN.life, cd: {} });
  const mine = w.zones.filter(z => z.kind === 'ring' && z.owner === me);
  if (mine.length > CHAIN.max) w.zones.splice(w.zones.indexOf(mine[0]), 1);
}

function levelUp(w, me, n) {
  me.lv = Math.min(FORGE.maxLv, (me.lv ?? 1) + n);
  me.dmg = DMG + FORGE.dmgPerLv * (me.lv - 1); // Lv1 hits like a basic ball; every level adds dmgPerLv
  w.events.push({ type: 'text', x: me.x, y: me.y - me.r - 10, text: 'UPGRADE!', side: me.side });
}

Object.assign(BALLS, {
  poison: { // modelled on the original's Poison Spike Ball: the arena gets deadlier with every bounce
    hp: 105, color: '#5fd03a', price: 600,
    onWallHit(w, me, x, y) { spike(w, me, x, y); },
    onTick(w, me) {
      for (const z of w.zones) {
        if (z.kind !== 'spike' || z.owner !== me) continue;
        const tx = z.x + z.nx * POISON.len * 0.6, ty = z.y + z.ny * POISON.len * 0.6;
        for (const f of foes(w, me)) {
          if ((z.cd[f.id] ?? 0) > w.t || Math.hypot(f.x - tx, f.y - ty) >= f.r + POISON.reach) continue;
          z.cd[f.id] = w.t + POISON.touchCd;
          f.poisonUntil = w.t + POISON.last;
          hurt(w, f, POISON.hit);
        }
      }
    },
    onSuper(w, me) { // two spikes on every wall, at a third and two thirds of its length
      for (const k of [1 / 3, 2 / 3]) { spike(w, me, W * k, 0); spike(w, me, W * k, W); spike(w, me, 0, W * k); spike(w, me, W, W * k); }
    },
  },
  chain: { // modelled on Shackles Ball: neon chain rings that hold a foe and tick
    hp: 100, color: '#c5313a', price: 650,
    onTick(w, me, dt) {
      me.cd.ring ??= CHAIN.first;
      if (w.t >= me.cd.ring) { // a trap where the nearest foe is about to be
        me.cd.ring = w.t + CHAIN.every;
        const f = nearest(foes(w, me), me);
        if (f) ring(w, me, bounceFold(f.x + f.vx * CHAIN.lead, f.r), bounceFold(f.y + f.vy * CHAIN.lead, f.r));
      }
      for (const z of w.zones) {
        if (z.kind !== 'ring' || z.owner !== me) continue;
        for (const f of foes(w, me)) {
          const dx = z.x - f.x, dy = z.y - f.y, d = Math.hypot(dx, dy) || 1;
          if (d >= z.r + f.r * 0.3) continue;
          f.slow = Math.min(f.slow, CHAIN.slow); // shackled: slowed and dragged toward the middle
          if (d > 4) { f.x += (dx / d) * CHAIN.pull * dt; f.y += (dy / d) * CHAIN.pull * dt; }
          if ((z.cd[f.id] ?? 0) <= w.t) { z.cd[f.id] = w.t + CHAIN.tick; hurt(w, f, CHAIN.dmg); }
        }
      }
    },
    onSuper(w, me) { // three rings around the nearest foe
      const f = nearest(foes(w, me), me);
      if (!f) return;
      ring(w, me, f.x, f.y);
      for (const a of [0.6, 0.6 + (Math.PI * 2) / 3, 0.6 + (Math.PI * 4) / 3]) ring(w, me, f.x + Math.cos(a) * CHAIN.r * 0.9, f.y + Math.sin(a) * CHAIN.r * 0.9);
    },
  },
  forge: { // modelled on Forge Ball: weak at first, it levels up as the round goes on and hits harder each level
    hp: 105, color: '#e0b23a', price: 700,
    onTick(w, me) {
      me.lv ??= 1;
      me.cd.forge ??= FORGE.every;
      if (w.t >= me.cd.forge) { me.cd.forge = w.t + FORGE.every; if (me.lv < FORGE.maxLv) levelUp(w, me, 1); }
    },
    onSuper(w, me) { levelUp(w, me, FORGE.superLv); },
  },

  chess: { // modelled on Chess Ball: the arena becomes a board, a random piece strikes along its lines
    hp: 100, color: '#EDE6D6', price: 300,
    onTick(w, me, dt) {
      if (me.chess) return chessTick(w, me, dt);
      me.cd.chess ??= CHESS.first;
      if (w.t < me.cd.chess) return;
      me.cd.chess = w.t + CHESS.every;
      chessMove(w, me, PIECES[Math.floor(w.rand() * PIECES.length)], CHESS.dmg);
    },
    canSuper: (w, me) => !me.chess,
    onSuper(w, me) { // the queen: all eight lines
      me.cd.chess = w.t + CHESS.every;
      chessMove(w, me, 'queen', CHESS.queenDmg);
    },
  },
});

export const ORDER = Object.keys(BALLS);
