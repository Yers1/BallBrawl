// Deterministic battle simulation for one round. No DOM — runs under node --test.
import { BALLS } from './balls.js';

export const W = 400, H = 400, R = 30, SPEED = 300, DMG = 10, HIT_CD = 0.3, SUDDEN = 30;
export const SPAWN = [[90, 310], [310, 90]];
const JITTER = 0.3; // rad of random spin on each wall bounce
const TURN = 0.55; // rad/s a ball curves toward its nearest enemy (gentle — strong homing glues balls together)
export const DASH = { charges: 2, regen: 2.5, time: 0.35, mul: 2.2, dmg: 1.3 };
export const METER = { full: 100, dealt: 0.9, taken: 0.6 };

export function rng(seed) { // mulberry32
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld({ seed = 1, a, b, hpMulB = 1 }) {
  const w = {
    t: 0, tick: 0, launched: false, rand: rng(seed), ents: [], shots: [], zones: [], events: [], hitCd: {}, result: null, nextId: 1,
    sides: [0, 1].map(() => ({ dashes: DASH.charges, regen: 0, meter: 0 })),
    log: [], // every accepted command: { tick, side, type, x?, y? } — seed + log replays the fight
  };
  [a, b].forEach((spec, side) => {
    const [x, y] = SPAWN[side];
    const e = spawnBall(w, side, spec.id, { x, y, hpMul: side ? hpMulB : 1 });
    if (spec.hp != null) e.hp = Math.min(spec.hp, e.maxHp);
    e.split = !!spec.split;
  });
  return w;
}

export function spawnBall(w, side, kind, { x, y, vx = 0, vy = 0, r = R, hp, hpMul = 1, dmg = DMG, speed = SPEED, mini = false }) {
  const maxHp = hp ?? Math.round(BALLS[kind].hp * hpMul);
  const e = { id: w.nextId++, side, kind, x, y, vx, vy, r, hp: maxHp, maxHp, speed, dmg, dead: false, mini, split: false, slow: 1, cd: {}, latch: null, boost: null };
  w.ents.push(e);
  return e;
}

export function launch(w, angA, angB) {
  w.ents.slice(0, 2).forEach((e, i) => {
    const a = i ? angB : angA;
    e.vx = Math.cos(a) * e.speed;
    e.vy = Math.sin(a) * e.speed;
  });
  w.launched = true;
}

export const foes = (w, e) => w.ents.filter(f => !f.dead && f.side !== e.side);

// meter=false for damage nobody dealt (sudden death)
export function hurt(w, e, amount, quiet = false, meter = true) {
  if (e.dead || amount <= 0) return;
  e.hp -= amount;
  if (meter) {
    const me = w.sides[e.side], them = w.sides[1 - e.side];
    me.meter = Math.min(METER.full, me.meter + amount * METER.taken);
    them.meter = Math.min(METER.full, them.meter + amount * METER.dealt);
  }
  if (!quiet) w.events.push({ type: 'hit', id: e.id, x: e.x, y: e.y, amount, side: e.side });
  if (e.hp > 0) return;
  e.hp = 0;
  e.dead = true;
  e.latch = null;
  w.events.push({ type: 'death', x: e.x, y: e.y, r: e.r, side: e.side, kind: e.kind });
  BALLS[e.kind].onDeath?.(w, e);
}

// Player / AI commands, applied between steps. Returns whether it was accepted.
export function act(w, side, cmd) {
  const team = w.ents.filter(e => e.side === side && !e.dead), s = w.sides[side];
  if (!w.launched || w.result != null || !team.length) return false;
  if (cmd.type === 'dash') {
    if (s.dashes < 1) return false;
    s.dashes--;
    for (const e of team) {
      const dx = cmd.x - e.x, dy = cmd.y - e.y, d = Math.hypot(dx, dy);
      e.latch = null;
      if (d > 1) { e.vx = (dx / d) * e.speed; e.vy = (dy / d) * e.speed; }
      e.boost = { until: w.t + DASH.time, mul: DASH.mul, dmg: DASH.dmg };
    }
    w.events.push({ type: 'dash', side, x: cmd.x, y: cmd.y });
  } else if (cmd.type === 'super') {
    if (s.meter < METER.full) return false;
    s.meter = 0;
    const me = team[0];
    BALLS[me.kind].onSuper?.(w, me);
    w.events.push({ type: 'super', side, kind: me.kind, x: me.x, y: me.y });
  } else return false;
  w.log.push(cmd.type === 'dash' ? { tick: w.tick, side, type: 'dash', x: cmd.x, y: cmd.y } : { tick: w.tick, side, type: cmd.type });
  return true;
}

export function step(w, dt) {
  if (!w.launched || w.result != null) return;
  w.t += dt;
  w.tick++;
  for (const s of w.sides) {
    if (s.dashes >= DASH.charges) { s.regen = 0; continue; }
    s.regen += dt;
    if (s.regen >= DASH.regen) { s.dashes++; s.regen -= DASH.regen; }
  }
  w.zones = w.zones.filter(z => !z.owner.dead && z.until > w.t);
  for (const e of w.ents) e.slow = 1;
  for (const e of w.ents) if (!e.dead) BALLS[e.kind].onTick?.(w, e, dt);
  for (const e of w.ents) if (!e.dead && !e.latch) move(w, e, dt);
  for (const e of w.ents) if (e.latch) {
    e.x = Math.min(W - e.r, Math.max(e.r, e.latch.foe.x + e.latch.ox));
    e.y = Math.min(H - e.r, Math.max(e.r, e.latch.foe.y + e.latch.oy));
  }
  collide(w);
  moveShots(w, dt);
  if (w.t > SUDDEN) {
    const rate = 2 + Math.floor(w.t - SUDDEN);
    for (const e of w.ents) hurt(w, e, rate * dt, true, false);
  }
  const alive = s => w.ents.some(e => e.side === s && !e.dead);
  const A = alive(0), B = alive(1);
  if (!A || !B) w.result = A ? 0 : B ? 1 : 'draw';
}

const boosted = (w, e) => (e.boost && e.boost.until > w.t ? e.boost : null);

function move(w, e, dt) {
  const b = boosted(w, e);
  // gentle homing: curve toward the nearest enemy so fights don't stall (not while dashing)
  const f = b ? null : w.ents.reduce((best, o) => (o.dead || o.side === e.side || (best && Math.hypot(o.x - e.x, o.y - e.y) >= Math.hypot(best.x - e.x, best.y - e.y)) ? best : o), null);
  if (f && (e.vx || e.vy)) {
    const cur = Math.atan2(e.vy, e.vx);
    let diff = Math.atan2(f.y - e.y, f.x - e.x) - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const a = cur + Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    e.vx = Math.cos(a) * e.speed;
    e.vy = Math.sin(a) * e.speed;
  }
  const k = e.slow * (b ? b.mul : 1);
  e.x += e.vx * k * dt;
  e.y += e.vy * k * dt;
  let wall = null, sx = 0, sy = 0;
  if (e.x < e.r) { e.x = e.r; sx = 1; wall = [0, e.y]; }
  else if (e.x > W - e.r) { e.x = W - e.r; sx = -1; wall = [W, e.y]; }
  if (e.y < e.r) { e.y = e.r; sy = 1; wall = [e.x, 0]; }
  else if (e.y > H - e.r) { e.y = H - e.r; sy = -1; wall = [e.x, H]; }
  if (!wall) return;
  // reflect with a little random spin, so balls never lock into orbits that miss each other
  const a = Math.atan2(sy ? sy * Math.abs(e.vy) : e.vy, sx ? sx * Math.abs(e.vx) : e.vx) + (w.rand() * 2 - 1) * JITTER;
  e.vx = Math.cos(a) * e.speed;
  e.vy = Math.sin(a) * e.speed;
  if (sx) e.vx = sx * Math.max(Math.abs(e.vx), e.speed * 0.2);
  if (sy) e.vy = sy * Math.max(Math.abs(e.vy), e.speed * 0.2);
  w.events.push({ type: 'wall', x: wall[0], y: wall[1] });
  BALLS[e.kind].onWallHit?.(w, e, wall[0], wall[1]);
}

const norm = e => {
  const m = Math.hypot(e.vx, e.vy) || 1;
  e.vx = (e.vx / m) * e.speed;
  e.vy = (e.vy / m) * e.speed;
};

function collide(w) {
  const es = w.ents;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j];
    if (a.dead || b.dead || a.latch?.foe === b || b.latch?.foe === a) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r;
    if (d >= min) continue;
    const nx = dx / d, ny = dy / d, push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
    // how hard each ball drives into the other (0 = glancing/fleeing, 1 = full ram), before the bounce
    const ramA = Math.max(0, (a.vx * nx + a.vy * ny) / a.speed), ramB = Math.max(0, -(b.vx * nx + b.vy * ny) / b.speed);
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) { // equal-mass elastic: swap normal components, keep constant speed
      a.vx += rel * nx; a.vy += rel * ny;
      b.vx -= rel * nx; b.vy -= rel * ny;
      norm(a); norm(b);
    }
    if (a.side === b.side) continue;
    const key = a.id + ':' + b.id;
    if ((w.hitCd[key] ?? -1) > w.t) continue;
    w.hitCd[key] = w.t + HIT_CD;
    w.events.push({ type: 'clash', x: a.x + nx * a.r, y: a.y + ny * a.r });
    hurt(w, b, Math.round(a.dmg * (0.5 + ramA) * (boosted(w, a)?.dmg ?? 1)));
    hurt(w, a, Math.round(b.dmg * (0.5 + ramB) * (boosted(w, b)?.dmg ?? 1)));
    if (!a.dead) BALLS[a.kind].onEnemyHit?.(w, a, b);
    if (!b.dead) BALLS[b.kind].onEnemyHit?.(w, b, a);
  }
}

function moveShots(w, dt) {
  w.shots = w.shots.filter(s => {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x < -10 || s.x > W + 10 || s.y < -10 || s.y > H + 10) return false;
    const hit = w.ents.find(e => !e.dead && e.side !== s.side && Math.hypot(e.x - s.x, e.y - s.y) < e.r + s.r);
    if (hit) hurt(w, hit, s.dmg);
    return !hit;
  });
}
