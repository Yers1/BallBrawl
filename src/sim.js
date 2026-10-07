// Deterministic battle simulation for one round. No DOM — runs under node --test.
import { BALLS } from './balls.js';

export const W = 400, H = 400, R = 30, SPEED = 300, DMG = 12, HIT_CD = 0.3, SUDDEN = 30;
export const SPAWN = [[90, 310], [310, 90]];
const JITTER = 0.3; // rad of random spin on each wall bounce
const TURN = 1.2; // rad/s a ball curves toward its nearest enemy

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
  const w = { t: 0, launched: false, rand: rng(seed), ents: [], shots: [], zones: [], events: [], hitCd: {}, result: null, nextId: 1 };
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
  const e = { id: w.nextId++, side, kind, x, y, vx, vy, r, hp: maxHp, maxHp, speed, dmg, dead: false, mini, split: false, slow: 1, cd: {}, latch: null };
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

export function hurt(w, e, amount, quiet = false) {
  if (e.dead || amount <= 0) return;
  e.hp -= amount;
  if (!quiet) w.events.push({ type: 'hit', id: e.id, x: e.x, y: e.y, amount, side: e.side });
  if (e.hp > 0) return;
  e.hp = 0;
  e.dead = true;
  e.latch = null;
  w.events.push({ type: 'death', x: e.x, y: e.y, r: e.r, side: e.side, kind: e.kind });
  BALLS[e.kind].onDeath?.(w, e);
}

export function step(w, dt) {
  if (!w.launched || w.result != null) return;
  w.t += dt;
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
    for (const e of w.ents) hurt(w, e, rate * dt, true);
  }
  const alive = s => w.ents.some(e => e.side === s && !e.dead);
  const A = alive(0), B = alive(1);
  if (!A || !B) w.result = A ? 0 : B ? 1 : 'draw';
}

function move(w, e, dt) {
  // gentle homing: curve toward the nearest enemy so fights don't stall
  const f = w.ents.reduce((best, o) => (o.dead || o.side === e.side || (best && Math.hypot(o.x - e.x, o.y - e.y) >= Math.hypot(best.x - e.x, best.y - e.y)) ? best : o), null);
  if (f && (e.vx || e.vy)) {
    const cur = Math.atan2(e.vy, e.vx);
    let diff = Math.atan2(f.y - e.y, f.x - e.x) - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const a = cur + Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    e.vx = Math.cos(a) * e.speed;
    e.vy = Math.sin(a) * e.speed;
  }
  e.x += e.vx * e.slow * dt;
  e.y += e.vy * e.slow * dt;
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
    hurt(w, b, Math.round(a.dmg * (0.5 + ramA)));
    hurt(w, a, Math.round(b.dmg * (0.5 + ramB)));
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
