// Deterministic battle simulation for one round. No DOM — runs under node --test.
import { BALLS, ICE, POISON } from './balls.js';

export const W = 400, H = 400, R = 30, SPEED = 300, DMG = 10, HIT_CD = 0.3, SUDDEN = 30;
export const SPAWN = [[90, 310], [310, 90]];
// Where a team of 1, 2 or 3 starts (side 1 is mirrored through the centre).
const SPAWNS = { 1: [[90, 310]], 2: [[70, 270], [150, 340]], 3: [[60, 240], [110, 320], [190, 350]] };
const spawnAt = (side, n, i) => { const [x, y] = SPAWNS[n][i]; return side ? [W - x, H - y] : [x, y]; };
// Maps: every arena has its own obstacles. rock/ice: solid, balls bounce off; bumper: bounces and kicks the ball
// forward; pool: lava that burns while you're in it; portal: a pair, you come out of the other one.
export const MAPS = {
  night: [],
  canyon: [{ k: 'rock', x: 200, y: 200, r: 26 }, { k: 'rock', x: 105, y: 105, r: 20 }, { k: 'rock', x: 295, y: 295, r: 20 }],
  frost: [{ k: 'ice', x: 200, y: 128, r: 18 }, { k: 'ice', x: 200, y: 272, r: 18 }, { k: 'ice', x: 128, y: 200, r: 18 }, { k: 'ice', x: 272, y: 200, r: 18 }, { k: 'spike', x: 32, y: 32, r: 24 }, { k: 'spike', x: 368, y: 368, r: 24 }], // + ice spikes
  jungle: [{ k: 'bumper', x: 200, y: 200, r: 24 }, { k: 'bumper', x: 110, y: 110, r: 18 }, { k: 'bumper', x: 290, y: 290, r: 18 }],
  lava: [{ k: 'pool', x: 200, y: 200, r: 40 }, { k: 'pool', x: 105, y: 105, r: 26 }, { k: 'pool', x: 295, y: 295, r: 26 }],
  space: [{ k: 'portal', x: 105, y: 105, r: 20, to: 2 }, { k: 'rock', x: 200, y: 200, r: 22 }, { k: 'portal', x: 295, y: 295, r: 20, to: 0 }],
  candy: [{ k: 'rock', x: 110, y: 110, r: 18 }, { k: 'rock', x: 290, y: 290, r: 18 }], // lollipops
  pirate: [{ k: 'rock', x: 200, y: 120, r: 18 }, { k: 'rock', x: 200, y: 280, r: 18 }], // barrels
  stadium: [{ k: 'bumper', x: 200, y: 200, r: 14 }], // the match ball in the centre spot
  temple: [{ k: 'rock', x: 140, y: 140, r: 18 }, { k: 'rock', x: 260, y: 260, r: 18 }, { k: 'spike', x: 32, y: 32, r: 24 }, { k: 'spike', x: 368, y: 368, r: 24 }], // stone idols, spike traps
  chess: [], // just the board
  neon: [{ k: 'bumper', x: 130, y: 200, r: 16 }, { k: 'bumper', x: 270, y: 200, r: 16 }, { k: 'saw', x: 32, y: 32, r: 24 }, { k: 'saw', x: 368, y: 368, r: 24 }], // glowing pads, buzz saws
};
export const POOL = { every: 0.5, dmg: 4 };
export const CUT = { dmg: 7, every: 0.6 }; // spikes and saws in the corners: solid, and they hurt
const JITTER = 0.3; // rad of random spin on each wall bounce
const TURN = 0.275; // rad/s a ball curves toward its nearest enemy (halved again: players felt balls glued together)
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

export function createWorld({ seed = 1, a, b, hpMulB = 1, map = 'night', players = null, boosts = null }) { // boosts: per side { dash, meter } from familiars
  const w = {
    t: 0, tick: 0, launched: false, rand: rng(seed), ents: [], shots: [], zones: [], events: [], hitCd: {}, result: null, nextId: 1,
    map: MAPS[map] ? map : 'night', obstacles: (MAPS[map] ?? []).map(o => ({ ...o })),
    sides: [0, 1].map(i => ({ dashes: DASH.charges * (players?.[i] ?? 1), regen: 0, meter: 0, n: players?.[i] ?? 1, dashMul: boosts?.[i]?.dash ?? 1, dashPow: boosts?.[i]?.dashPow ?? 1, meterMul: boosts?.[i]?.meter ?? 1 })), // n = people steering this side
    log: [], // every accepted command: { tick, side, type, x?, y? } — seed + log replays the fight
  };
  [a, b].forEach((spec, side) => { // a spec, or a team of specs (2v2, the boss fight)
    const team = Array.isArray(spec) ? spec : [spec];
    team.forEach((sp, i) => {
      const [x, y] = spawnAt(side, team.length, i), base = BALLS[sp.id];
      const e = spawnBall(w, side, sp.id, {
        x, y, r: sp.r ?? R, hpMul: (side ? hpMulB : 1) * (sp.hpMul ?? 1),
        dmg: sp.dmgMul ? (base.dmg ?? DMG) * sp.dmgMul : undefined, speed: sp.speedMul ? (base.speed ?? SPEED) * sp.speedMul : undefined,
      });
      if (sp.hp != null) e.hp = Math.min(sp.hp, e.maxHp);
      if (sp.armor) e.armor = sp.armor; // a Robot familiar: takes a little less damage
      if (sp.regen) e.regen = sp.regen; // a Ghost familiar: heals HP/s
      e.split = !!sp.split;
      e.boss = !!sp.boss;
      e.skin = sp.skin || null; // cosmetic only — the sim never reads it
    });
  });
  return w;
}

export function spawnBall(w, side, kind, { x, y, vx = 0, vy = 0, r = R, hp, hpMul = 1, dmg, speed, mini = false }) {
  const maxHp = hp ?? Math.round(BALLS[kind].hp * hpMul);
  speed ??= BALLS[kind].speed ?? SPEED;
  dmg ??= BALLS[kind].dmg ?? DMG;
  const e = {
    id: w.nextId++, side, kind, x, y, vx, vy, r, hp: maxHp, maxHp, speed, dmg, dead: false, mini, split: false,
    slow: 1, cd: {}, latch: null, boost: null, yank: null, poisonUntil: 0,
    shieldUntil: 0, shieldMul: 1, chillUntil: 0, chillSlow: 1, invulnUntil: 0, // status effects any ball can apply
  };
  w.ents.push(e);
  return e;
}

export function launch(w, angA, angB) {
  for (const side of [0, 1]) w.ents.filter(e => e.side === side).forEach((e, i) => {
    let a = side ? angB : angA;
    if (i > 0) { // teammates go for the nearest foe, with a little spread
      const f = w.ents.filter(o => o.side !== side).reduce((b, o) => (!b || Math.hypot(o.x - e.x, o.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? o : b), null);
      a = Math.atan2(f.y - e.y, f.x - e.x) + (w.rand() * 2 - 1) * 0.5;
    }
    e.vx = Math.cos(a) * e.speed;
    e.vy = Math.sin(a) * e.speed;
  });
  w.launched = true;
}

export const foes = (w, e) => w.ents.filter(f => !f.dead && f.side !== e.side);
// Full meter, and the side's lead ball has a super it can use right now (a lone cell fragment can't split again).
export function canSuper(w, side) {
  const me = w.ents.find(e => e.side === side && !e.dead);
  return !!me && w.sides[side].meter >= METER.full && BALLS[me.kind].canSuper?.(w, me) !== false;
}

// meter=false for damage nobody dealt (sudden death)
export function hurt(w, e, amount, quiet = false, meter = true) {
  if (e.dead || amount <= 0 || e.invulnUntil > w.t) return;
  if (e.armor) amount *= e.armor;
  if (e.shieldUntil > w.t) amount *= e.shieldMul;
  if (e.chillUntil > w.t && e.chillSlow <= ICE.freezeSlow) amount *= ICE.brittle; // frozen solid = brittle
  e.hp -= amount;
  if (meter) {
    const me = w.sides[e.side], them = w.sides[1 - e.side];
    me.meter = Math.min(METER.full, me.meter + amount * METER.taken * me.meterMul);
    them.meter = Math.min(METER.full, them.meter + amount * METER.dealt * them.meterMul);
  }
  if (!quiet) w.events.push({ type: 'hit', id: e.id, x: e.x, y: e.y, amount, side: e.side });
  if (e.hp > 0) return;
  e.hp = 0;
  e.dead = true;
  e.latch = null;
  w.events.push({ type: 'death', x: e.x, y: e.y, r: e.r, side: e.side, kind: e.kind, mini: e.mini });
  BALLS[e.kind].onDeath?.(w, e);
}

// Player / AI commands, applied between steps. Returns whether it was accepted.
export function act(w, side, cmd) { // cmd.ent: in a party, the one ball this player steers
  const team = w.ents.filter(e => e.side === side && !e.dead), s = w.sides[side];
  if (!w.launched || w.result != null || !team.length) return false;
  const one = cmd.ent != null ? team.find(e => e.id === cmd.ent) : null;
  if (cmd.ent != null && !one) return false;
  if (cmd.type === 'dash') {
    if (s.dashes < 1) return false;
    s.dashes--;
    for (const e of one ? [one] : team) {
      const dx = cmd.x - e.x, dy = cmd.y - e.y, d = Math.hypot(dx, dy);
      e.latch = null;
      if (d > 1) { e.vx = (dx / d) * e.speed; e.vy = (dy / d) * e.speed; }
      e.boost = { until: w.t + DASH.time, mul: DASH.mul, dmg: DASH.dmg * s.dashPow };
    }
    w.events.push({ type: 'dash', side, x: cmd.x, y: cmd.y });
  } else if (cmd.type === 'super') {
    const me = one ?? team[0];
    if (s.meter < METER.full || BALLS[me.kind].canSuper?.(w, me) === false) return false;
    s.meter = 0;
    BALLS[me.kind].onSuper?.(w, me);
    w.events.push({ type: 'super', side, kind: me.kind, x: me.x, y: me.y });
  } else return false;
  w.log.push({ tick: w.tick, side, type: cmd.type, ...(cmd.type === 'dash' && { x: cmd.x, y: cmd.y }), ...(one && { ent: one.id }) });
  return true;
}

export function step(w, dt) {
  if (!w.launched || w.result != null) return;
  w.t += dt;
  w.tick++;
  for (const s of w.sides) {
    if (s.dashes >= DASH.charges * s.n) { s.regen = 0; continue; }
    s.regen += dt * s.n * s.dashMul;
    if (s.regen >= DASH.regen) { s.dashes++; s.regen -= DASH.regen; }
  }
  w.zones = w.zones.filter(z => !z.owner.dead && z.until > w.t);
  for (const e of w.ents) e.slow = e.chillUntil > w.t ? e.chillSlow : 1;
  for (const e of w.ents) if (e.regen && !e.dead) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
  for (const e of w.ents) if (!e.dead) BALLS[e.kind].onTick?.(w, e, dt);
  for (const e of w.ents) { // poison keeps ticking even after the spike's owner is gone
    if (e.dead || e.poisonUntil <= w.t || (e.cd.poisonTick ?? 0) > w.t) continue;
    e.cd.poisonTick = w.t + POISON.every;
    hurt(w, e, POISON.tick);
  }
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
  for (const o of w.obstacles) obstacle(w, e, o);
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

function obstacle(w, e, o) {
  const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy) || 0.01;
  if (o.k === 'pool') { // lava burns while you're in it
    if (d < o.r && (e.cd.pool ?? 0) <= w.t) { e.cd.pool = w.t + POOL.every; hurt(w, e, POOL.dmg); }
    return;
  }
  if (o.k === 'portal') { // in one, out of the other, same heading
    if (d < o.r && (e.cd.portal ?? 0) <= w.t) {
      const to = w.obstacles[o.to], m = Math.hypot(e.vx, e.vy) || 1, gap = to.r + e.r + 2;
      e.x = Math.min(W - e.r, Math.max(e.r, to.x + (e.vx / m) * gap));
      e.y = Math.min(H - e.r, Math.max(e.r, to.y + (e.vy / m) * gap));
      e.cd.portal = w.t + 1;
      w.events.push({ type: 'portal', x: o.x, y: o.y, x2: to.x, y2: to.y });
    }
    return;
  }
  const min = o.r + e.r; // rock, ice, bumper, spike, saw: solid
  if (d >= min) return;
  const nx = dx / d, ny = dy / d, vn = e.vx * nx + e.vy * ny;
  e.x = o.x + nx * min;
  e.y = o.y + ny * min;
  if (vn < 0) { e.vx -= 2 * vn * nx; e.vy -= 2 * vn * ny; }
  if (o.k === 'bumper') {
    e.boost = { until: w.t + 0.45, mul: 1.6, dmg: 1.2 };
    w.events.push({ type: 'bump', i: w.obstacles.indexOf(o), x: o.x, y: o.y });
  } else if ((o.k === 'spike' || o.k === 'saw') && (e.cd.cut ?? 0) <= w.t) {
    e.cd.cut = w.t + CUT.every;
    w.events.push({ type: 'cut', x: o.x + nx * o.r, y: o.y + ny * o.r });
    hurt(w, e, CUT.dmg);
  } else w.events.push({ type: 'wall', x: o.x + nx * o.r, y: o.y + ny * o.r });
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
    if (hit) { hurt(w, hit, s.dmg); s.onHit?.(w, hit); }
    return !hit;
  });
}
