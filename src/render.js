// Canvas drawing for the arena + juice (sparks, damage numbers, hit flashes, shake).
// Visual-only randomness uses Math.random — the simulation itself stays deterministic.
import { W, H, SUDDEN, canSuper } from './sim.js';
import { BALLS, TRAIN, LEECH, POISON, ICE, trainCars } from './balls.js';
import { SKINS, EMOTE_LIST } from './progress.js';
import { THEMES } from './themes.js';

export const SIDE = ['#4CC9F0', '#FF4D5E']; // you · opponent
const SIDE_RGB = ['76,201,240', '255,77,94'];
const FONT = 'Nunito, system-ui, sans-serif';
const INK = '#0A0F1C'; // outline for numbers and small shapes
export const M = 16; // wall thickness drawn around the 400×400 field (arena units)
const fx = { parts: [], floats: [], rings: [], flash: {}, shake: 0, face: {}, drain: {}, frozen: {}, emotes: {}, bump: {} };
const rnd = (a, b) => a + Math.random() * (b - a);

const shade = (hex, k) => { // k > 0 lightens toward white, k < 0 darkens
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c})`;
};

export function resetFx() {
  fx.parts.length = fx.floats.length = fx.rings.length = 0;
  fx.flash = {}; fx.face = {}; fx.drain = {}; fx.frozen = {}; fx.emotes = {}; fx.bump = {};
  fx.shake = 0;
}

export function fitCanvas(canvas, cssSize) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = canvas.style.height = cssSize + 'px';
  canvas.width = canvas.height = Math.round(cssSize * dpr);
  return canvas.width / (W + 2 * M);
}

function burst(x, y, n, color, speed, size = [2.5, 7]) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(0.3, 1) * speed;
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.3, 0.65), age: 0, color, size: rnd(size[0], size[1]) });
  }
}

// A floating number or word. Big, tilted, long-lived like the original; at most 40 on screen.
function float(x, y, text, color, size = 22, life = 1.5, rise = 30, tilt = rnd(-0.17, 0.17)) {
  const f = { x, y, text, color, size, life, rise, tilt, age: 0, popAt: 0, vx: 0, vy: 0 };
  fx.floats.push(f);
  if (fx.floats.length > 40) fx.floats.shift();
  return f;
}

// Damage and heal numbers. Each one pops out of the ball it happened to, on the side away from the hitter,
// so two balls hitting each other throw their numbers apart instead of stacking them at the contact point.
// The colour says who did it: cyan = your side's damage, red = the opponent's, green = healing.
// Quick repeat hits on the same ball add up into one growing number that pops again.
const dmgSize = v => Math.min(40, 21 + v * 0.55);
function dmgFloat(w, id, amount, color, sign = '-') {
  const e = w.ents.find(x => x.id === id);
  if (!e) return;
  const key = id + sign, old = fx.floats.find(f => f.key === key && f.age - f.popAt < 0.5);
  if (old) {
    old.value += amount;
    old.text = sign + Math.round(old.value);
    old.size = dmgSize(old.value);
    old.popAt = old.age;
    old.life = Math.max(old.life, old.age + 1.1);
    return;
  }
  const away = (fx.face[id] ?? Math.PI / 2) + Math.PI; // the face points at the hitter; go the other way
  let dx = Math.cos(away) * 0.55, dy = Math.sin(away) * 0.55 - 0.85; // ...and mostly up
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  let x = e.x + dx * (e.r + 4), y = e.y + dy * (e.r + 4);
  for (const f of fx.floats) if (f.age < 0.6 && Math.abs(f.x - x) < 34 && Math.abs(f.y - y) < 22) y = f.y - 24; // never on top of another
  const f = float(x, y, sign + Math.round(amount), color, dmgSize(amount), 1.25, 0, dx * 0.25);
  Object.assign(f, { key, value: amount, vx: dx * 95, vy: dy * 95 - 20 });
}

const ring = (x, y, r, grow, life, rgb, width) => fx.rings.push({ x, y, r, grow, life, rgb, width, age: 0 });

// ---------- auras (shop cosmetics), drawn behind your balls ----------
let auraOf = {};
export const setAuras = map => { auraOf = map || {}; };
const AURA_RGB = { fire: '255,138,43', frost: '127,231,255', storm: '255,214,10', hearts: '255,92,138', void: '150,70,230', stars: '255,204,51' };
function sparkle(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}
function drawAura(ctx, kind, x, y, r, t) {
  const rgb = AURA_RGB[kind];
  if (!rgb) return;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.6);
  g.addColorStop(0, `rgba(${rgb},0.6)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
  if (kind === 'fire') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 0.9, L = r * (0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.7)));
      const bx = x + Math.cos(a) * r * 0.85, by = y + Math.sin(a) * r * 0.85, px = Math.cos(a + 1.57) * r * 0.22, py = Math.sin(a + 1.57) * r * 0.22;
      ctx.fillStyle = i % 2 ? '#FF8A2B' : '#FFD23F';
      ctx.beginPath(); ctx.moveTo(bx + px, by + py); ctx.lineTo(x + Math.cos(a) * (r + L), y + Math.sin(a) * (r + L) - L * 0.35); ctx.lineTo(bx - px, by - py); ctx.fill();
    }
  } else if (kind === 'frost' || kind === 'stars') {
    for (let i = 0; i < 6; i++) {
      const a = t * 0.8 + (i * Math.PI) / 3, d = r * (1.3 + 0.08 * Math.sin(t * 3 + i));
      sparkle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.13 + 0.04 * Math.sin(t * 5 + i)), kind === 'frost' ? (i % 2 ? '#FFFFFF' : '#BFF3FF') : (i % 2 ? '#FFE38A' : '#FFCC33'));
    }
  } else if (kind === 'storm') {
    let seed = Math.floor(t * 14) + 1;
    const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = rr() * Math.PI * 2;
      ctx.beginPath();
      for (let k = 0; k <= 5; k++) { const a = a0 + k * 0.22, d = r * (1.12 + rr() * 0.3); k ? ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
      ctx.strokeStyle = '#FFD60A'; ctx.lineWidth = r * 0.12; ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = r * 0.04; ctx.stroke();
    }
  } else if (kind === 'hearts') {
    for (let i = 0; i < 5; i++) {
      const a = t * 0.7 + (i * Math.PI * 2) / 5, d = r * 1.38, hx = x + Math.cos(a) * d, hy = y + Math.sin(a) * d + Math.sin(t * 4 + i) * r * 0.06, s = r * 0.15;
      ctx.fillStyle = '#FF5C8A';
      ctx.beginPath(); ctx.moveTo(hx, hy + s);
      ctx.bezierCurveTo(hx - s * 1.5, hy - s * 0.1, hx - s * 0.7, hy - s * 1.2, hx, hy - s * 0.35);
      ctx.bezierCurveTo(hx + s * 0.7, hy - s * 1.2, hx + s * 1.5, hy - s * 0.1, hx, hy + s);
      ctx.fill();
    }
  } else if (kind === 'void') {
    ctx.lineCap = 'round';
    for (const [col, w, off] of [['#5E22A8', 0.2, 0], ['#C890FF', 0.08, 0.6]]) {
      ctx.strokeStyle = col; ctx.lineWidth = r * w;
      for (const k of [0, Math.PI]) { ctx.beginPath(); ctx.arc(x, y, r * 1.25, t * 2 + k + off, t * 2 + k + off + 1.9); ctx.stroke(); }
    }
  }
  ctx.restore();
}

// ---------- emotes: one of our balls pulling a face, in a bubble over that side's ball (presets only: kid-safe) ----------
const EMOTE_BY_ID = Object.fromEntries(EMOTE_LIST.map(e => [e.id, e]));
let autoSides = [1]; // which sides react to kills by themselves (the computer; both when you're only watching)
export const setAutoEmote = sides => { autoSides = sides; };
let foeEmotes = true;
export const setFoeEmotes = on => { foeEmotes = on; };
export function emote(side, id, ent = null) {
  const cur = fx.emotes[side];
  if (!EMOTE_BY_ID[id] || (cur && cur.age < 1.3) || (side === 1 && !foeEmotes)) return false; // no spam: one at a time
  fx.emotes[side] = { id, age: 0, ent };
  return true;
}
const pickMood = moods => { const l = EMOTE_LIST.filter(e => moods.includes(e.mood)); return l[Math.floor(Math.random() * l.length)].id; };
export const moodOf = id => EMOTE_BY_ID[id]?.mood;
export { pickMood };
// The face, drawn in a 20-unit-radius space; `a` is the animation clock (fixed for still emotes).
function face(ctx, mood, a, anim) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 2.2;
  const arc = (x, y, r, s0, s1) => { ctx.beginPath(); ctx.arc(x, y, r, s0, s1); ctx.stroke(); };
  const eye = (x, y, r = 4.4, look = 0) => {
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y + look, r * 0.5, 0, Math.PI * 2); ctx.fill();
  };
  const heart = (x, y, s, c = '#FF3B5C') => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    ctx.fill(); ctx.lineWidth = 1.4; ctx.stroke(); ctx.lineWidth = 2.2;
  };
  if (mood === 'gg') {
    ctx.font = `italic 900 17px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeText('GG', 0, 1); ctx.fillStyle = '#FFCC33'; ctx.fillText('GG', 0, 1);
    return;
  }
  if (mood === 'laugh') {
    arc(-7, -2, 3.6, Math.PI * 1.15, Math.PI * 1.85); arc(7, -2, 3.6, Math.PI * 1.15, Math.PI * 1.85);
    ctx.beginPath(); ctx.moveTo(-9, 3); ctx.quadraticCurveTo(0, 17, 9, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FF4D5E'; ctx.beginPath(); ctx.ellipse(0, 9.5, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    if (anim) { ctx.fillStyle = '#7FD3FF'; for (const x of [-12, 12]) { const k = (a * 1.6) % 1; ctx.beginPath(); ctx.ellipse(x + Math.sign(x) * k * 5, -1 + k * 8, 1.8, 2.6, 0, 0, Math.PI * 2); ctx.fill(); } }
  } else if (mood === 'angry') {
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-3, -6); ctx.moveTo(12, -10); ctx.lineTo(3, -6); ctx.stroke(); ctx.lineWidth = 2.2;
    eye(-6.5, -1.5, 3.4, 1); eye(6.5, -1.5, 3.4, 1);
    arc(0, 14, 7, Math.PI * 1.2, Math.PI * 1.8);
    if (anim) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (const x of [-15, 15]) { const k = (a * 1.4 + (x > 0 ? 0.5 : 0)) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(x, -16 - k * 10, 3 + k * 3, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
  } else if (mood === 'cry') {
    arc(-7, -4, 3.6, Math.PI * 0.15, Math.PI * 0.85); arc(7, -4, 3.6, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fillStyle = '#4FB6FF';
    for (const x of [-8, 8]) { ctx.beginPath(); ctx.moveTo(x - 2, 0); ctx.lineTo(x + 2, 0); ctx.lineTo(x + 2.4, 14); ctx.lineTo(x - 2.4, 14); ctx.closePath(); ctx.fill(); }
    if (anim) for (const x of [-8, 8]) { const k = (a * 1.8 + (x > 0 ? 0.4 : 0)) % 1; ctx.beginPath(); ctx.ellipse(x, 14 + k * 10, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = INK; arc(0, 13, 5, Math.PI * 1.2, Math.PI * 1.8);
  } else if (mood === 'wow') {
    const s0 = anim ? 1 + 0.12 * Math.sin(a * 10) : 1;
    eye(-7, -3, 5.4 * s0); eye(7, -3, 5.4 * s0);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 9, 3.6, 4.8, 0, 0, Math.PI * 2); ctx.fill();
  } else if (mood === 'love') {
    const b = anim ? 1 + 0.15 * Math.sin(a * 9) : 1;
    heart(-7, -3, 4.2 * b); heart(7, -3, 4.2 * b);
    arc(0, 3, 7, Math.PI * 0.2, Math.PI * 0.8);
    if (anim) for (let i = 0; i < 3; i++) { const k = (a * 0.7 + i / 3) % 1; ctx.globalAlpha = 1 - k; heart(-14 + i * 14, -14 - k * 14, 2.6); } ctx.globalAlpha = 1;
  } else if (mood === 'cool') {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-14, -8, 12, 8, 3); ctx.roundRect(2, -8, 12, 8, 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(3, -6); ctx.stroke();
    if (anim) { const k = (a * 0.8) % 1; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-14 + k * 28, -7.5); ctx.lineTo(-17 + k * 28, -0.5); ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; }
    else { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-11, -6.5); ctx.lineTo(-8, -6.5); ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; }
    arc(3, 5, 6, Math.PI * 0.2, Math.PI * 0.7);
  } else if (mood === 'sleepy') {
    ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(-3, -2); ctx.moveTo(3, -2); ctx.lineTo(11, -2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 8, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.font = `900 9px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = '#FFFFFF';
    const k = (a * 0.6) % 1;
    ctx.strokeText('Z', 13 + k * 4, -12 - k * 6); ctx.fillText('Z', 13 + k * 4, -12 - k * 6);
  }
}
const art = (id) => ({ id: -1, side: 0, kind: EMOTE_BY_ID[id].ball, skin: null, x: 0, y: 0, r: 20, vx: 1, vy: -1, hp: 0, cd: {}, latch: null, chillUntil: 0, shieldUntil: 0, poisonUntil: 0 });
// The emote picture: the ball (with its own decorations) and the face. `t` animates the animated ones.
function emoteArt(ctx, id, R, t) {
  const em = EMOTE_BY_ID[id];
  if (!em) return;
  const a = em.anim ? t : 0.35;
  ctx.save();
  ctx.scale(R / 20, R / 20);
  if (em.anim && em.mood === 'laugh') ctx.translate(0, -Math.abs(Math.sin(a * 7)) * 3);
  if (em.anim && em.mood === 'angry') ctx.translate(Math.sin(a * 45) * 1.2, 0);
  drawBall(ctx, art(id), 0, 0, { rim: false });
  face(ctx, em.mood, a, em.anim);
  ctx.restore();
}
export function drawEmote(canvas, id, css = 40, t = 0) { // the emote buttons and shop tiles
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(css * dpr)) { canvas.width = canvas.height = Math.round(css * dpr); canvas.style.width = canvas.style.height = css + 'px'; }
  const c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.setTransform(dpr, 0, 0, dpr, (css / 2) * dpr, (css / 2 + css * 0.04) * dpr);
  emoteArt(c, id, css * 0.36, t);
}
function drawEmotes(ctx, w, dt) {
  for (const side of [0, 1]) {
    const em = fx.emotes[side];
    if (!em) continue;
    em.age += dt;
    if (em.age > 2.4) { delete fx.emotes[side]; continue; }
    const e = (em.ent != null && w.ents.find(b => b.id === em.ent && !b.dead)) || w.ents.find(b => b.side === side && !b.dead);
    if (!e) continue;
    const p = em.age, pop = p < 0.12 ? 0.3 + p * 9 : p < 0.26 ? 1.38 - (p - 0.12) * 2.7 : 1;
    const below = e.y - e.r - 38 < 26, dir = below ? -1 : 1; // near the top wall the bubble hangs under the ball
    const x = Math.max(32, Math.min(W - 32, e.x)), y = below ? e.y + e.r + 38 : e.y - e.r - 38;
    ctx.save();
    ctx.globalAlpha = p > 2 ? Math.max(0, (2.4 - p) / 0.4) : 1;
    ctx.translate(x, y + Math.sin(p * 5) * 1.5);
    ctx.scale(pop, pop);
    const tail = () => { ctx.beginPath(); ctx.moveTo(-8, 18 * dir); ctx.lineTo(Math.max(-20, Math.min(20, e.x - x)) * 0.3, 32 * dir); ctx.lineTo(8, 18 * dir); ctx.closePath(); };
    const box = () => { ctx.beginPath(); ctx.roundRect(-26, -25, 52, 50, 14); };
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    box(); ctx.stroke(); tail(); ctx.stroke();
    ctx.fillStyle = side === 0 ? '#E8F8FF' : '#FFECEE';
    box(); ctx.fill(); tail(); ctx.fill();
    emoteArt(ctx, em.id, 16, p);
    ctx.restore();
  }
}

function absorb(w, now) {
  for (const ev of w.events) {
    if (ev.type === 'hit') { // small ticks don't flash; big hits get a white star burst
      if (ev.amount >= 3) fx.flash[ev.id] = now + 0.1;
      if (ev.amount >= 1) dmgFloat(w, ev.id, ev.amount, SIDE[1 - ev.side]);
      burst(ev.x, ev.y, 5, '#ffffff', 120, [2, 3]);
      if (ev.amount >= 15) ring(ev.x, ev.y, 10, 3.2, 0.3, '255,255,255', 4);
    } else if (ev.type === 'tick') { // damage over time (a web): just the number, no flash
      dmgFloat(w, ev.id, ev.amount, SIDE[1 - ev.side]);
    } else if (ev.type === 'chill') { // hit by Ice: "-50%" in ice blue, a puff of snow
      float(ev.x, ev.y - ev.r - 12, '-50%', '#8FE3FF', 22, 1.2, 26, 0);
      burst(ev.x, ev.y, 14, '#DFF7FF', 170, [2, 4]);
      ring(ev.x, ev.y, ev.r * 0.8, 1.8, 0.35, '143,227,255', 4);
    } else if (ev.type === 'bump') {
      fx.bump[ev.i] = now;
      burst(ev.x, ev.y, 6, '#FFFFFF', 140, [2, 3]);
    } else if (ev.type === 'portal') {
      ring(ev.x, ev.y, 12, 2.5, 0.35, '200,144,255', 4);
      ring(ev.x2, ev.y2, 12, 2.5, 0.35, '76,201,240', 4);
    } else if (ev.type === 'text') {
      float(ev.x, ev.y, ev.text, '#FFCC33', 18, 2, 10, 0);
    } else if (ev.type === 'clash') {
      burst(ev.x, ev.y, 12, '#ff9f1c', 220);
      fx.shake = Math.max(fx.shake, 3);
    } else if (ev.type === 'death') {
      const killer = 1 - ev.side;
      if (!ev.mini && autoSides.includes(killer) && Math.random() < 0.35) emote(killer, pickMood(['laugh', 'cool', 'love']));
      else if (!ev.mini && autoSides.includes(ev.side) && Math.random() < 0.25) setTimeout(() => emote(ev.side, pickMood(['cry', 'angry'])), 500);
      burst(ev.x, ev.y, 30, BALLS[ev.kind].color, 280);
      burst(ev.x, ev.y, 10, '#ffffff', 160);
      ring(ev.x, ev.y, ev.r, 2.6, 0.45, '255,255,255', 5);
      fx.shake = 10;
    } else if (ev.type === 'split') {
      burst(ev.x, ev.y, 16, BALLS.cell.color, 200);
    } else if (ev.type === 'latch') { // a few square drops of blood
      burst(ev.x, ev.y, 8, '#c81e2c', 130, [2.5, 4]);
    } else if (ev.type === 'boom') {
      burst(ev.x, ev.y, 26, '#ff9a3c', 300);
      burst(ev.x, ev.y, 12, '#ffe08a', 180);
      ring(ev.x, ev.y, ev.r * 0.4, 2.6, 0.4, '255,154,60', 6);
      fx.shake = Math.max(fx.shake, 6);
    } else if (ev.type === 'freeze') {
      burst(ev.x, ev.y, 22, '#bfefff', 220);
      ring(ev.x, ev.y, 30, 2.5, 0.5, '191,239,255', 5);
    } else if (ev.type === 'dash') {
      ring(ev.x, ev.y, 8, 4, 0.35, SIDE_RGB[ev.side], 3);
    } else if (ev.type === 'super') {
      ring(ev.x, ev.y, 40, 4.5, 0.6, '255,204,51', 8);
      ring(ev.x, ev.y, 30, 3, 0.45, SIDE_RGB[ev.side], 5);
      burst(ev.x, ev.y, 26, '#ffcc33', 300);
      fx.shake = Math.max(fx.shake, 7);
    }
  }
  w.events.length = 0;
}

// ---------- pieces ----------

// The arena is a sunken box seen from above, like the original: a floor, four bevelled walls lit from the top.
// Its colours and floor pattern come from the current arena (themes.js); decorations are laid out once per arena.
let THEME = THEMES.night, DECOR = [], ARENA = 'night';
const FACE_PTS = [ // the corners of each wall face: top, left, right, bottom
  [[-M, -M], [W + M, -M], [W, 0], [0, 0]],
  [[-M, -M], [0, 0], [0, H], [-M, H + M]],
  [[W + M, -M], [W + M, H + M], [W, H], [W, 0]],
  [[-M, H + M], [0, H], [W, H], [W + M, H + M]],
];
export function setArena(id) {
  THEME = THEMES[id] || THEMES.night;
  ARENA = THEMES[id] ? id : 'night';
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = { ice: 12, grass: 34, cracks: 9, stars: 70, temple: 10 }[THEME.pattern] ?? 0;
  DECOR = Array.from({ length: n }, () => ({ x: r() * W, y: r() * H, a: r() * Math.PI, s: r(), k: Array.from({ length: 4 }, () => r() * 2 - 1) }));
}
function floorPattern(ctx, now) {
  const p = THEME.pattern;
  ctx.save();
  if (p === 'grid') {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 50; i < W; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.moveTo(0, i); ctx.lineTo(W, i); }
    ctx.stroke();
  } else if (p === 'tiles') { // sandstone blocks
    ctx.strokeStyle = 'rgba(90,50,10,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 0, row = 0; y < H; y += 40, row++) {
      ctx.moveTo(0, y); ctx.lineTo(W, y);
      for (let x = row % 2 ? 30 : 0; x < W; x += 60) { ctx.moveTo(x, y); ctx.lineTo(x, y + 40); }
    }
    ctx.stroke();
  } else if (p === 'ice') { // glossy streaks across the ice
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineCap = 'round';
    for (const d of DECOR) { ctx.lineWidth = 2 + d.s * 4; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 30 + d.s * 40, d.y - 20 - d.s * 26); ctx.stroke(); }
  } else if (p === 'grass') { // darker tufts
    ctx.fillStyle = 'rgba(20,60,20,0.28)';
    for (const d of DECOR) { ctx.beginPath(); ctx.ellipse(d.x, d.y, 10 + d.s * 22, 6 + d.s * 10, d.a, 0, Math.PI * 2); ctx.fill(); }
  } else if (p === 'cracks') { // glowing lava cracks that breathe
    ctx.strokeStyle = `rgba(255,122,47,${0.55 + 0.25 * Math.sin(now * 2)})`;
    ctx.shadowColor = '#FF7A2F';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const d of DECOR) {
      ctx.beginPath(); ctx.moveTo(d.x, d.y);
      let x = d.x, y = d.y;
      for (const k of d.k) { x += Math.cos(d.a + k) * 26; y += Math.sin(d.a + k) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (p === 'dots') { // candy sprinkles
    const cols = ['#FF4D8D', '#7FE7FF', '#FFD23F', '#A6FF4D'];
    for (let y = 20, row = 0; y < H; y += 40, row++) for (let x = row % 2 ? 40 : 20, i = row; x < W; x += 40, i++) {
      ctx.fillStyle = cols[i % 4]; ctx.save(); ctx.translate(x, y); ctx.rotate(i * 0.9); ctx.beginPath(); ctx.roundRect(-6, -2, 12, 4, 2); ctx.fill(); ctx.restore();
    }
  } else if (p === 'neon') { // glowing grid
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    for (const [col, off] of [['#00F0FF', 0], ['#FF2BD6', 25]]) {
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 2 + off);
      ctx.beginPath();
      for (let i = off + 25; i < W; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.moveTo(0, i); ctx.lineTo(W, i); }
      ctx.stroke();
    }
  } else if (p === 'waves') {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let y = 30; y < H; y += 46) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) { const yy = y + Math.sin(x / 22 + now * 1.2 + y) * 5; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
  } else if (p === 'candy') { // mint-and-pink checker with sprinkles, like the Stitch design
    ctx.fillStyle = '#5EE6C3';
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if ((i + j) & 1) ctx.fillRect(i * 40, j * 40, 40, 40);
    const cols = ['#FF4D8D', '#FFFFFF', '#FFD23F', '#7FB8FF'];
    for (let k = 0; k < 40; k++) { const x = (k * 97) % W, y = (k * 151) % H; ctx.fillStyle = cols[k % 4]; ctx.save(); ctx.translate(x, y); ctx.rotate(k); ctx.beginPath(); ctx.roundRect(-5, -1.6, 10, 3.2, 1.6); ctx.fill(); ctx.restore(); }
  } else if (p === 'planks') { // ship deck: planks with staggered joints and nails, a compass rose painted in the middle
    ctx.strokeStyle = 'rgba(70,30,5,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 0, row = 0; y < H; y += 33, row++) { ctx.moveTo(0, y); ctx.lineTo(W, y); const x = (row * 137) % 260 + 60; ctx.moveTo(x, y); ctx.lineTo(x, y + 33); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(60,25,5,0.5)';
    for (let y = 6, row = 0; y < H; y += 33, row++) for (const x of [12, W - 12]) { ctx.beginPath(); ctx.arc(x, y + 10, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.translate(W / 2, H / 2);
    ctx.strokeStyle = 'rgba(70,30,5,0.3)'; ctx.fillStyle = 'rgba(255,230,180,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = k % 4 === 0 ? 62 : k % 2 ? 18 : 34; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (p === 'pitch') { // football pitch: mowing stripes and the lines
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 40, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 54, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(0, 110, 64, 180); ctx.strokeRect(W - 64, 110, 64, 180);
    ctx.strokeRect(0, 160, 24, 80); ctx.strokeRect(W - 24, 160, 24, 80);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();
  } else if (p === 'temple') { // sandstone slabs, carved runes, moss in the cracks
    ctx.strokeStyle = 'rgba(110,70,20,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 80; i < W; i += 80) { ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.moveTo(0, i); ctx.lineTo(W, i); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110,70,20,0.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const [x, y] of [[40, 200], [360, 200], [200, 40], [200, 360]]) { ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x, y + 8); ctx.lineTo(x + 8, y - 8); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(70,140,60,0.45)';
    for (const d of DECOR) { ctx.beginPath(); ctx.ellipse(d.x, d.y, 8 + d.s * 16, 5 + d.s * 7, d.a, 0, Math.PI * 2); ctx.fill(); }
  } else if (p === 'chess') { // a real 8×8 board, ivory and walnut
    ctx.fillStyle = '#3B2A1E';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) & 1) ctx.fillRect(i * 50, j * 50, 50, 50);
  } else if (p === 'stars') {
    ctx.fillStyle = '#FFFFFF';
    for (const d of DECOR) { ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(now * (0.5 + d.s) + d.a)); ctx.fillRect(d.x, d.y, 1.5 + d.s * 1.5, 1.5 + d.s * 1.5); }
  }
  ctx.restore();
}
// Each arena dresses its walls differently, so they don't look like one template in other colours.
function wallScenery(ctx, now) {
  const P = Math.PI;
  ctx.save();
  if (ARENA === 'night') { // lamps along the top wall
    for (let x = 40; x < W; x += 80) {
      ctx.fillStyle = `rgba(255,236,150,${0.5 + 0.3 * Math.sin(now * 2 + x)})`;
      ctx.beginPath(); ctx.arc(x, -M / 2, 3.5, 0, P * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,236,150,0.12)'; ctx.beginPath(); ctx.arc(x, -M / 2, 9, 0, P * 2); ctx.fill();
    }
  } else if (ARENA === 'canyon') { // sandstone rocks on the rim, a cactus in two corners
    ctx.fillStyle = '#9A5A26';
    for (let x = 20; x < W; x += 56) { ctx.beginPath(); ctx.ellipse(x, -M * 0.55, 10, 5, 0.2, 0, P * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(W - x, H + M * 0.55, 10, 5, -0.2, 0, P * 2); ctx.fill(); }
    for (const [cx, cy] of [[-M / 2, -M / 2], [W + M / 2, H + M / 2]]) {
      ctx.fillStyle = '#3E8E4A'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx - 3, cy - 10, 6, 20, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(cx - 9, cy - 4, 5, 8, 2.5); ctx.fill(); ctx.stroke();
    }
  } else if (ARENA === 'frost') { // snow on the rim, icicles hanging inside
    ctx.fillStyle = '#FFFFFF';
    for (let x = 0; x <= W; x += 22) { ctx.beginPath(); ctx.ellipse(x, -2, 14, 5, 0, 0, P * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(220,245,255,0.95)';
    for (let x = 14; x < W; x += 34) { const L = 8 + ((x * 7) % 9); ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, L); ctx.fill(); }
  } else if (ARENA === 'jungle') { // leaves hanging over the walls
    for (let x = 10; x < W; x += 30) {
      const sw = Math.sin(now * 1.5 + x) * 0.15;
      ctx.fillStyle = x % 60 ? '#2E8B3A' : '#49B24F';
      ctx.save(); ctx.translate(x, -2); ctx.rotate(0.4 + sw); ctx.beginPath(); ctx.ellipse(0, 7, 4.5, 9, 0, 0, P * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(-2, x); ctx.rotate(-0.9 + sw); ctx.beginPath(); ctx.ellipse(0, 7, 4, 8, 0, 0, P * 2); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#FF5C8A';
    for (const [x, y] of [[W + M / 2, 60], [W + M / 2, 260], [120, H + M / 2], [300, -M / 2]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, P * 2); ctx.fill(); }
  } else if (ARENA === 'lava') { // glowing seams in the walls, little flames in the corners
    ctx.strokeStyle = `rgba(255,122,47,${0.6 + 0.3 * Math.sin(now * 3)})`; ctx.lineWidth = 2;
    for (let x = 30; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, -M); ctx.lineTo(x + 8, -M / 2); ctx.lineTo(x + 2, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(W - x, H + M); ctx.lineTo(W - x - 8, H + M / 2); ctx.lineTo(W - x - 2, H); ctx.stroke(); }
    for (const [cx, cy] of [[-M / 2, -M / 2], [W + M / 2, -M / 2], [-M / 2, H + M / 2], [W + M / 2, H + M / 2]]) {
      const f = 1 + 0.2 * Math.sin(now * 10 + cx);
      ctx.fillStyle = '#FF7A2F'; ctx.beginPath(); ctx.moveTo(cx - 5, cy + 4); ctx.quadraticCurveTo(cx, cy - 12 * f, cx + 5, cy + 4); ctx.fill();
      ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.moveTo(cx - 2.5, cy + 4); ctx.quadraticCurveTo(cx, cy - 5 * f, cx + 2.5, cy + 4); ctx.fill();
    }
  } else if (ARENA === 'space') { // metal plates with blinking lights
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, -M); ctx.lineTo(x, 0); ctx.moveTo(x, H); ctx.lineTo(x, H + M); ctx.stroke(); }
    for (let x = 25; x < W; x += 100) {
      ctx.fillStyle = Math.sin(now * 4 + x) > 0 ? '#4CC9F0' : '#FF4D5E';
      ctx.beginPath(); ctx.arc(x, -M / 2, 2.5, 0, P * 2); ctx.arc(W - x, H + M / 2, 2.5, 0, P * 2); ctx.fill();
    }
  } else if (ARENA === 'candy') { // candy-cane walls: red stripes all round, a gumball in each corner
    ctx.save();
    ctx.beginPath(); ctx.rect(-M, -M, W + 2 * M, H + 2 * M); ctx.rect(0, 0, W, H); ctx.clip('evenodd');
    ctx.strokeStyle = '#FF4D6D'; ctx.lineWidth = 6;
    ctx.beginPath(); for (let k = -H - 2 * M; k < W + 2 * M; k += 16) { ctx.moveTo(k, -M); ctx.lineTo(k + H + 2 * M, H + M); } ctx.stroke();
    ctx.restore();
    for (const [x, y, c] of [[-M / 2, -M / 2, '#5FD35B'], [W + M / 2, -M / 2, '#FF9F2E'], [-M / 2, H + M / 2, '#9B6BFF'], [W + M / 2, H + M / 2, '#FF5C9A']]) {
      ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 9, 0, P * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 2.5, 0, P * 2); ctx.fill();
    }
  } else if (ARENA === 'pirate') { // rope along the rails, a cannon on each side, a treasure chest in the corner
    ctx.strokeStyle = '#E9C98A'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
    for (const y of [-M / 2, H + M / 2]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const [x, dir] of [[-M / 2, 1], [W + M / 2, -1]]) {
      ctx.fillStyle = '#2B2F3A'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x - 5, H / 2 - 9, 10, 18, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(dir > 0 ? x : x - 12, H / 2 - 4, 12, 8, 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#B5651D'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(W - 2, H - 14, 16, 14, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFD23F'; ctx.fillRect(W + 3, H - 9, 5, 4);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.quadraticCurveTo(-9, -15, -5, -10); ctx.quadraticCurveTo(-1, -15, 4, -10); ctx.stroke();
  } else if (ARENA === 'stadium') { // advertising boards along the stands, a goal in each side wall
    const cols = ['#FFCC33', '#4CC9F0', '#FF5C5C', '#A6FF4D'];
    for (let x = 0, i = 0; x < W; x += 50, i++) {
      ctx.fillStyle = cols[i % 4]; ctx.globalAlpha = 0.85; ctx.fillRect(x + 3, -M + 3, 44, M - 6); ctx.fillRect(W - x - 47, H + 3, 44, M - 6);
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(10,14,31,0.55)';
      ctx.beginPath(); ctx.arc(x + 25, -M / 2, 3, 0, P * 2); ctx.arc(W - x - 25, H + M / 2, 3, 0, P * 2); ctx.fill();
    }
    for (const [x, c] of [[-M, '#4C8DFF'], [W, '#FF4D5E']]) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, 165, M, 70);
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, 165, M - 3, 70);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let y = 172; y < 235; y += 8) { ctx.moveTo(x, y); ctx.lineTo(x + M, y); } ctx.stroke();
    }
  } else if (ARENA === 'temple') { // sandstone blocks, turquoise gems in the corners, torches on the side walls
    ctx.strokeStyle = 'rgba(80,50,15,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let x = 0; x <= W; x += 40) { ctx.moveTo(x, -M); ctx.lineTo(x, 0); ctx.moveTo(x, H); ctx.lineTo(x, H + M); ctx.moveTo(-M, x); ctx.lineTo(0, x); ctx.moveTo(W, x); ctx.lineTo(W + M, x); } ctx.stroke();
    for (const [x, y] of [[-M / 2, -M / 2], [W + M / 2, -M / 2], [-M / 2, H + M / 2], [W + M / 2, H + M / 2]]) {
      ctx.fillStyle = '#3FE0D0'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const x of [-M / 2, W + M / 2]) {
      const f = 1 + 0.25 * Math.sin(now * 11 + x);
      ctx.fillStyle = '#5A3A1A'; ctx.fillRect(x - 2, H / 2 - 2, 4, 10);
      ctx.fillStyle = '#FF7A2F'; ctx.beginPath(); ctx.moveTo(x - 5, H / 2); ctx.quadraticCurveTo(x, H / 2 - 14 * f, x + 5, H / 2); ctx.fill();
      ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.moveTo(x - 2.5, H / 2); ctx.quadraticCurveTo(x, H / 2 - 6 * f, x + 2.5, H / 2); ctx.fill();
    }
  } else if (ARENA === 'chess') { // brass corner caps and the board's coordinates on the frame
    ctx.fillStyle = '#E8C46A'; ctx.font = `800 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) { ctx.fillText('abcdefgh'[i], i * 50 + 25, H + M / 2); ctx.fillText(String(8 - i), -M / 2, i * 50 + 25); }
    for (const [x, y] of [[-M / 2, -M / 2], [W + M / 2, -M / 2], [-M / 2, H + M / 2], [W + M / 2, H + M / 2]]) {
      ctx.fillStyle = '#E8C46A'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, P * 2); ctx.fill(); ctx.stroke();
    }
  } else if (ARENA === 'neon') { // neon tubes along the walls, glowing pylons in two corners
    ctx.shadowBlur = 10;
    for (const [c, y] of [['#00F0FF', -M / 2], ['#FF2BD6', H + M / 2]]) { ctx.strokeStyle = c; ctx.shadowColor = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (const [c, x] of [['#00F0FF', -M / 2], ['#FF2BD6', W + M / 2]]) { ctx.strokeStyle = c; ctx.shadowColor = c; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (const [c, x, y, a] of [['#00F0FF', -M, -M, 0], ['#FF2BD6', W + M, H + M, Math.PI]]) {
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(26, 0); ctx.lineTo(0, 26); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  } else if (ARENA === 'ocean') {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 8; i++) { const y = H + M - ((now * 20 + i * 47) % (H + 2 * M)); ctx.beginPath(); ctx.arc(-M / 2 + Math.sin(y / 20) * 2, y, 2 + (i % 3), 0, P * 2); ctx.fill(); }
    ctx.fillStyle = '#FF7A5C';
    for (const x of [60, 200, 340]) { ctx.beginPath(); ctx.moveTo(x, H + M); ctx.quadraticCurveTo(x - 6, H + 4, x - 2, H); ctx.quadraticCurveTo(x + 2, H + 6, x + 6, H + M); ctx.fill(); }
  }
  ctx.restore();
}

// Map obstacles, seen from above: boulders, ice crystals, bouncy mushrooms, lava pools, portals.
const ROCK = { canyon: ['#C98A4B', '#8E5524'], space: ['#7A7F92', '#4A4E5E'] };
function obstacles(ctx, w, now) {
  const P = Math.PI;
  w.obstacles.forEach((o, i) => {
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.k === 'rock' && ARENA === 'candy') { // a swirl lollipop seen from above
      ctx.fillStyle = 'rgba(8,16,32,0.3)'; ctx.beginPath(); ctx.ellipse(4, 6, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, P * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = i ? '#FF4D8D' : '#33C7A6'; ctx.lineWidth = 4; ctx.beginPath();
      for (let k = 0; k < 40; k++) { const a = k * 0.45 + now * 0.6, rr = (k / 40) * o.r * 0.9; k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(0, 0); }
      ctx.stroke();
    } else if (o.k === 'rock' && ARENA === 'pirate') { // a barrel, lid up: staves and two iron hoops
      ctx.fillStyle = 'rgba(8,16,32,0.35)'; ctx.beginPath(); ctx.ellipse(4, 6, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      ctx.fillStyle = '#A8642A'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, P * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#3A3F4A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.78, 0, P * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,25,5,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const x of [-0.4, 0, 0.4]) { ctx.moveTo(x * o.r, -o.r * 0.7); ctx.lineTo(x * o.r, o.r * 0.7); } ctx.stroke();
    } else if (o.k === 'rock' && ARENA === 'temple') { // a stone idol's head
      ctx.fillStyle = 'rgba(8,16,32,0.35)'; ctx.beginPath(); ctx.ellipse(4, 6, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      ctx.fillStyle = '#8E7A5A'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(-o.r, -o.r, o.r * 2, o.r * 2, o.r * 0.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3A2E1E';
      ctx.fillRect(-o.r * 0.6, -o.r * 0.25, o.r * 0.45, o.r * 0.18); ctx.fillRect(o.r * 0.15, -o.r * 0.25, o.r * 0.45, o.r * 0.18); ctx.fillRect(-o.r * 0.35, o.r * 0.3, o.r * 0.7, o.r * 0.15);
    } else if (o.k === 'bumper' && ARENA === 'stadium') { // the match ball
      ctx.fillStyle = 'rgba(8,16,32,0.35)'; ctx.beginPath(); ctx.ellipse(3, 5, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, P * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1A1F2E';
      const pent = (cx, cy, rr) => { ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * P * 2 - P / 2 + now; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
      pent(0, 0, o.r * 0.32);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * P * 2 - P / 2 + now; pent(Math.cos(a) * o.r * 0.78, Math.sin(a) * o.r * 0.78, o.r * 0.2); }
    } else if (o.k === 'bumper' && ARENA === 'neon') { // a glowing jump pad
      const since = now - (fx.bump?.[i] ?? -9), glow = since < 0.3 ? 1 : 0.6 + 0.2 * Math.sin(now * 4 + i);
      ctx.fillStyle = '#0A0820'; ctx.strokeStyle = i ? '#FF2BD6' : '#00F0FF'; ctx.lineWidth = 3.5; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12 * glow;
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, P * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, o.r * 0.55, 0, P * 2); ctx.stroke();
    } else if (o.k === 'rock') {
      const [c, d] = ROCK[ARENA] ?? ROCK.space;
      ctx.fillStyle = 'rgba(8,16,32,0.35)'; ctx.beginPath(); ctx.ellipse(4, 6, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < 9; k++) { const a = (k / 9) * P * 2, rr = o.r * (0.86 + 0.14 * Math.sin(k * 2.7 + i)); k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath();
      const g = ctx.createRadialGradient(-o.r * 0.35, -o.r * 0.4, o.r * 0.1, 0, 0, o.r);
      g.addColorStop(0, shade(c, 0.35)); g.addColorStop(1, d);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-o.r * 0.2, -o.r * 0.1); ctx.lineTo(o.r * 0.15, o.r * 0.2); ctx.lineTo(o.r * 0.1, o.r * 0.5); ctx.stroke();
    } else if (o.k === 'ice') {
      ctx.fillStyle = 'rgba(8,16,32,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * P * 2 + P / 6; k ? ctx.lineTo(Math.cos(a) * o.r, Math.sin(a) * o.r) : ctx.moveTo(Math.cos(a) * o.r, Math.sin(a) * o.r); }
      ctx.closePath();
      ctx.fillStyle = '#BFF3FF'; ctx.fill(); ctx.strokeStyle = '#2E6E9E'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = (k / 3) * P * 2 + P / 6; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * o.r * 0.8, Math.sin(a) * o.r * 0.8); } ctx.stroke();
    } else if (o.k === 'bumper') { // a mushroom cap that squashes when hit
      const since = now - (fx.bump?.[i] ?? -9), sq = since < 0.25 ? 1 + 0.25 * Math.sin((since / 0.25) * P) : 1;
      ctx.scale(sq, sq);
      ctx.fillStyle = 'rgba(8,16,32,0.35)'; ctx.beginPath(); ctx.ellipse(3, 6, o.r, o.r * 0.9, 0, 0, P * 2); ctx.fill();
      const g = ctx.createRadialGradient(-o.r * 0.3, -o.r * 0.35, o.r * 0.1, 0, 0, o.r);
      g.addColorStop(0, '#FF8A8A'); g.addColorStop(1, '#C81E3A');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, P * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      for (const [x, y, r] of [[-0.4, -0.3, 0.2], [0.35, -0.35, 0.16], [0.1, 0.3, 0.22], [-0.45, 0.35, 0.12], [0.5, 0.25, 0.11]]) { ctx.beginPath(); ctx.arc(x * o.r, y * o.r, r * o.r, 0, P * 2); ctx.fill(); }
    } else if (o.k === 'pool') { // lava, bubbling
      const g = ctx.createRadialGradient(0, 0, o.r * 0.2, 0, 0, o.r * 1.15);
      g.addColorStop(0, '#FFD23F'); g.addColorStop(0.55, '#FF7A2F'); g.addColorStop(1, 'rgba(160,30,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, o.r * 1.15, 0, P * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,10,5,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, P * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,180,0.85)';
      for (let k = 0; k < 4; k++) { const ph = (now * 0.8 + k * 0.27) % 1, a = k * 1.9 + i; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(Math.cos(a) * o.r * 0.5, Math.sin(a) * o.r * 0.5, 2 + ph * 4, 0, P * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (o.k === 'portal') { // two spinning rings
      for (const [c, rr, dir] of [['#C890FF', 1, 1], ['#4CC9F0', 0.7, -1]]) {
        ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) { const a = dir * now * 3 + (k * P * 2) / 3; ctx.beginPath(); ctx.arc(0, 0, o.r * rr, a, a + 1.4); ctx.stroke(); }
      }
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.r * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(200,144,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.6, 0, P * 2); ctx.fill();
    }
    ctx.restore();
  });
}

function arena(ctx, w, now) {
  const sudden = w.launched && w.t > SUDDEN;
  ctx.fillStyle = THEME.faces[3];
  ctx.fillRect(-M - 20, -M - 20, W + 2 * M + 40, H + 2 * M + 40); // oversized: camera shake never shows an edge
  FACE_PTS.forEach((pts, i) => {
    ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.fillStyle = THEME.faces[i];
    ctx.fill();
    if (sudden) { // walls glow red in sudden death
      ctx.fillStyle = `rgba(255,60,80,${0.3 + 0.3 * Math.sin(now * 9)})`;
      ctx.fill();
    }
  });
  ctx.fillStyle = THEME.floor;
  ctx.fillRect(0, 0, W, H);
  floorPattern(ctx, now);
  obstacles(ctx, w, now);
  wallScenery(ctx, now);
  for (const [gx, gy] of [[0, 1], [1, 0]]) { // the top and left walls shade the floor
    const g = ctx.createLinearGradient(0, 0, gx * 18, gy * 18);
    g.addColorStop(0, 'rgba(8,16,32,0.4)');
    g.addColorStop(1, 'rgba(8,16,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, gx ? 18 : W, gy ? 18 : H);
  }
}

function web(ctx, z, t) {
  const life = Math.max(0, Math.min(1, (z.until - t) / 0.6, (t - z.born) / 0.15));
  ctx.save();
  ctx.globalAlpha = 0.1 * life;
  ctx.fillStyle = SIDE[z.side];
  ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.85 * life;
  ctx.beginPath();
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.moveTo(z.x, z.y);
    ctx.lineTo(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r);
  }
  for (let k = 1; k <= 3; k++) {
    const rr = (z.r * k) / 3.2;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, px = z.x + Math.cos(a) * rr, py = z.y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
  }
  ctx.strokeStyle = 'rgba(6,11,29,0.45)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

// Rails: wooden sleepers across the path and two steel rails; the expired part stays as faded sleepers.
function rails(ctx, pts, alpha, steel) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.moveTo(mx + nx * 13, my + ny * 13); ctx.lineTo(mx - nx * 13, my - ny * 13);
  }
  ctx.strokeStyle = '#3B2414'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = '#9A6436'; ctx.lineWidth = 4.5; ctx.stroke();
  if (steel) {
    for (const off of [-7, 7]) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q.x - o.x, dy = q.y - o.y, l = Math.hypot(dx, dy) || 1;
        const x = p.x - (dy / l) * off, y = p.y + (dx / l) * off;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2A3142'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#D9DEE8'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  ctx.restore();
}
function track(ctx, z, t) { // no rails trailing the ball: they appear only under a train while it runs
  for (const tr of z.trains) rails(ctx, tr.path.pts, Math.min(1, (t - tr.go) * 6), true);
}

// A train: a locomotive with a cab, chimney and headlight, then cars with lit windows, all following the track.
function trainDraw(ctx, tr, t) {
  const cars = trainCars(tr, t);
  for (const pass of [0, 1]) for (const c of [...cars].reverse()) { // shadows first, then bodies back to front
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    const L = 30, Wd = 21;
    if (!pass) { ctx.fillStyle = 'rgba(8,16,32,0.45)'; ctx.beginPath(); ctx.roundRect(-L / 2 + 3, -Wd / 2 + 5, L, Wd, 5); ctx.fill(); ctx.restore(); continue; }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    if (c.i === 0) { // locomotive
      ctx.fillStyle = tr.express ? '#F2B632' : '#D9452B';
      ctx.beginPath(); ctx.roundRect(-L / 2, -Wd / 2, L, Wd, [4, 9, 9, 4]); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2A2A38';
      ctx.beginPath(); ctx.roundRect(-L / 2 + 2, -Wd / 2 + 3, 11, Wd - 6, 3); ctx.fill();
      ctx.fillStyle = '#FFE08A';
      ctx.fillRect(-L / 2 + 5, -3, 5, 6);
      ctx.fillStyle = '#1A1A22';
      ctx.beginPath(); ctx.arc(L / 2 - 9, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8E95A8';
      ctx.beginPath(); ctx.moveTo(L / 2, -Wd / 2 + 2); ctx.lineTo(L / 2 + 6, 0); ctx.lineTo(L / 2, Wd / 2 - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      const g = ctx.createRadialGradient(L / 2 + 6, 0, 1, L / 2 + 6, 0, 26);
      g.addColorStop(0, 'rgba(255,240,180,0.55)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(L / 2 + 4, 0); ctx.lineTo(L / 2 + 34, -14); ctx.lineTo(L / 2 + 34, 14); ctx.closePath(); ctx.fill();
    } else { // a car
      ctx.fillStyle = tr.express ? (c.i % 2 ? '#7A4FE0' : '#5B3BB0') : c.i % 2 ? '#2E6BE0' : '#2E8A5A';
      ctx.beginPath(); ctx.roundRect(-L / 2 + 1, -Wd / 2, L - 2, Wd, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-L / 2 + 3, -Wd / 2 + 2, L - 6, 3);
      ctx.fillStyle = '#FFE08A';
      for (const wx of [-8, 0, 8]) ctx.fillRect(wx - 2.5, -4, 5, 8);
    }
    ctx.restore();
  }
  const head = cars.find(c => c.i === 0);
  if (head && Math.random() < 0.5) fx.parts.push({ x: head.x + Math.cos(head.a) * 6, y: head.y + Math.sin(head.a) * 6, vx: rnd(-20, 20), vy: -40 + rnd(-10, 10), life: rnd(0.5, 0.9), age: 0, color: 'rgba(235,240,250,0.8)', size: rnd(4, 6), round: true, grow: 2, drag: 1.5 });
}

// A poison spike on the wall: a two-tone pyramid pointing into the arena, each tilted a little differently.
function spike(ctx, z) {
  const { x, y, nx, ny } = z, L = POISON.len * (1 + 0.25 * Math.sin(z.tilt * 9)), tx = -ny, ty = nx, bw = 9;
  const a = Math.atan2(ny, nx) + z.tilt, ax = x + Math.cos(a) * L, ay = y + Math.sin(a) * L;
  ctx.fillStyle = '#2E8A22';
  ctx.beginPath(); ctx.moveTo(x + tx * bw, y + ty * bw); ctx.lineTo(ax, ay); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9FF06A';
  ctx.beginPath(); ctx.moveTo(x - tx * bw, y - ty * bw); ctx.lineTo(ax, ay); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(8,16,32,0.5)';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x + tx * bw, y + ty * bw); ctx.lineTo(ax, ay); ctx.lineTo(x - tx * bw, y - ty * bw); ctx.stroke();
}

// Chain links: flat oval links alternating with edge-on ones, like a real chain. Built as two paths
// (a dark underlay, then the bright steel with one shared glow) so a ring costs two strokes, not twenty.
function linkPath(ctx, pts, len, thick) {
  for (const [i, p] of pts.entries()) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    if (i % 2 === 0) { // flat link: a hollow oval along the chain
      ctx.moveTo(p.x + ca * len * 0.62, p.y + sa * len * 0.62);
      ctx.ellipse(p.x, p.y, len * 0.62, thick, p.a, 0, Math.PI * 2);
    } else { // edge-on link: a short bar
      ctx.moveTo(p.x - ca * len * 0.55, p.y - sa * len * 0.55);
      ctx.lineTo(p.x + ca * len * 0.55, p.y + sa * len * 0.55);
    }
  }
}
function chainStroke(ctx, pts, len, thick, width, glow) {
  ctx.lineCap = 'round';
  ctx.beginPath(); linkPath(ctx, pts, len, thick);
  ctx.strokeStyle = '#2A060E'; ctx.lineWidth = width + 3; ctx.stroke();
  ctx.save();
  if (glow) { ctx.shadowColor = '#FF3B5C'; ctx.shadowBlur = glow; }
  ctx.beginPath(); linkPath(ctx, pts, len, thick);
  ctx.strokeStyle = '#FFD6DE'; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); linkPath(ctx, pts, len, thick);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, width * 0.35); ctx.stroke();
}

// A Shackles trap: a ring of glowing chain links that grows out of the drop point and fades to a ghost.
function ringZone(ctx, z, t) {
  const grow = Math.min(1, (t - z.born) / 0.25), fade = Math.min(1, (z.until - t) / 0.8), r = z.r * (0.3 + 0.7 * grow);
  const n = 2 * Math.max(6, Math.round((Math.PI * r) / 11)), spin = t * 0.5, len = (2 * Math.PI * r) / n;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = spin + (i / n) * Math.PI * 2;
    return { x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, a: a + Math.PI / 2 };
  });
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  const g = ctx.createRadialGradient(z.x, z.y, r * 0.2, z.x, z.y, r);
  g.addColorStop(0, 'rgba(197,49,58,0.04)');
  g.addColorStop(1, 'rgba(197,49,58,0.28)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, Math.PI * 2); ctx.fill();
  chainStroke(ctx, pts, len, len * 0.3, 2.6, 10);
  ctx.restore();
}

function bombZone(ctx, z, t, now) {
  if (z.done) return; // the blast itself is drawn from the 'boom' event
  const left = Math.max(0, z.go - t), k = 1 - Math.min(1, left / 1.2);
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = `rgba(220,50,20,${0.35 + 0.55 * k})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#1b1b24';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(z.x, z.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = Math.sin(now * (10 + 30 * k)) > 0 ? '#ff4d4d' : '#5a1a1a';
  ctx.beginPath(); ctx.arc(z.x + 3, z.y - 3, 3.2, 0, Math.PI * 2); ctx.fill();
}

function zapZone(ctx, z, t) {
  const k = 1 - (t - z.born) / (z.until - z.born);
  const dx = z.x2 - z.x, dy = z.y2 - z.y, n = 7;
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(z.x, z.y);
  for (let i = 1; i < n; i++) {
    const j = (Math.random() - 0.5) * 22; // flicker
    ctx.lineTo(z.x + (dx * i) / n - (dy / Math.hypot(dx, dy)) * j, z.y + (dy * i) / n + (dx / Math.hypot(dx, dy)) * j);
  }
  ctx.lineTo(z.x2, z.y2);
  ctx.strokeStyle = '#ff9f1c';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#fffbe0';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

// A length of chain between two points (the magnet's hook line).
function chain(ctx, ax, ay, bx, by) {
  ctx.save();
  ctx.strokeStyle = '#D9DEE8';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.restore();
}

// The magnet's hook in flight: a little horseshoe on the end of its chain.
function hookShot(ctx, s) {
  chain(ctx, s.owner.x, s.owner.y, s.x, s.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(Math.atan2(s.vy, s.vx));
  ctx.lineWidth = 5;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#FF4D5E';
  ctx.beginPath(); ctx.arc(-2, 0, 6, Math.PI * 0.5, Math.PI * 1.5, true); ctx.stroke();
  ctx.strokeStyle = '#4C7DFF';
  ctx.beginPath(); ctx.arc(-2, 0, 6, Math.PI * 1.5, Math.PI * 0.5, true); ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(2, -8.5, 4, 5);
  ctx.fillRect(2, 3.5, 4, 5);
  ctx.restore();
}

function needle(ctx, s) {
  const m = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / m, uy = s.vy / m;
  ctx.strokeStyle = '#E6D2B5';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(s.x - ux * 9, s.y - uy * 9); ctx.lineTo(s.x + ux * 5, s.y + uy * 5); ctx.stroke();
}

function shuriken(ctx, s, t) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((t - s.born) * 18);
  ctx.fillStyle = '#dfe6f5';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = i % 2 ? 2.6 : 8;
    i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#3a4256';
  ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Each ball's own look. `face` = toward the nearest enemy (set by faces() each frame), `head` = where it rolls.
function deco(ctx, e, t) {
  const { x, y, r } = e, head = Math.atan2(e.vy, e.vx) || -Math.PI / 2, face = fx.face[e.id] ?? head;
  const P = Math.PI, C = Math.cos, S = Math.sin;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  if (e.kind === 'basic') { // a seam, like a real ball
    ctx.strokeStyle = 'rgba(8,16,32,0.18)';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath(); ctx.arc(x + r * 0.55, y, r * 0.75, P * 0.75, P * 1.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - r * 0.55, y, r * 0.75, -P * 0.25, P * 0.25); ctx.stroke();
  } else if (e.kind === 'leech') { // fangs track the nearest foe and chomp while latched
    const bite = e.latch ? 0.12 * (1 + S(t * 14)) : 0, spread = 0.42 - bite;
    ctx.fillStyle = 'rgba(70,0,10,0.55)';
    ctx.beginPath(); ctx.arc(x + C(face) * r * 0.55, y + S(face) * r * 0.55, r * 0.26, 0, P * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,0,15,0.5)';
    ctx.lineWidth = r * 0.06;
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(x - C(face) * r * 0.3, y - S(face) * r * 0.3, r * 0.5, face + sg * 1.2, face + sg * 2.2, sg < 0); ctx.stroke(); }
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    for (const sg of [-spread, spread]) {
      const b = face + sg, bx = x + C(b) * r * 0.78, by = y + S(b) * r * 0.78, px = -S(b), py = C(b), wd = r * 0.15, l = r * 0.62;
      ctx.beginPath();
      ctx.moveTo(bx + px * wd, by + py * wd);
      ctx.lineTo(bx - px * wd, by - py * wd);
      ctx.lineTo(bx + C(b) * l, by + S(b) * l);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (e.kind === 'cell') { // membrane, a drifting nucleus and organelles
    ctx.strokeStyle = 'rgba(220,255,230,0.5)';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, P * 2); ctx.stroke();
    const nx = x + C(t * 1.3) * r * 0.18, ny = y + S(t * 0.9) * r * 0.15;
    ctx.fillStyle = '#1E7A44';
    ctx.beginPath(); ctx.arc(nx, ny, r * 0.3, 0, P * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(nx - r * 0.1, ny - r * 0.1, r * 0.1, 0, P * 2); ctx.fill();
    ctx.fillStyle = 'rgba(210,255,225,0.55)';
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + t * 0.4, d = r * 0.55;
      ctx.beginPath(); ctx.ellipse(x + C(a) * d, y + S(a) * d, r * 0.12, r * 0.07, a, 0, P * 2); ctx.fill();
    }
  } else if (e.kind === 'spider') { // hourglass mark and two eyes on the foe (legs are drawn under the body)
    ctx.fillStyle = '#2B1A5E';
    ctx.beginPath(); ctx.moveTo(x - r * 0.22, y - r * 0.45); ctx.lineTo(x + r * 0.22, y - r * 0.45); ctx.lineTo(x - r * 0.22, y + r * 0.2); ctx.lineTo(x + r * 0.22, y + r * 0.2); ctx.closePath(); ctx.fill();
    for (const sg of [-0.35, 0.35]) {
      const a = face + sg;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(x + C(a) * r * 0.62, y + S(a) * r * 0.62, r * 0.11, 0, P * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x + C(a) * r * 0.66, y + S(a) * r * 0.66, r * 0.05, 0, P * 2); ctx.fill();
    }
  } else if (e.kind === 'ninja') { // headband, its knot and two tails streaming behind
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, P * 2); ctx.clip();
    ctx.fillStyle = '#E63946';
    ctx.fillRect(x - r, y - r * 0.62, r * 2, r * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - r, y - r * 0.62, r * 2, r * 0.07);
    ctx.restore();
    const kx = x - C(head) * r * 0.75, ky = y - S(head) * r * 0.75 - r * 0.2;
    ctx.strokeStyle = '#E63946';
    ctx.lineWidth = r * 0.14;
    for (const sg of [-1, 1]) {
      const wave = S(t * 12 + sg) * r * 0.18;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.quadraticCurveTo(kx - C(head) * r * 0.6 + sg * r * 0.2, ky - S(head) * r * 0.6 + wave, kx - C(head) * r * 1.2 + sg * r * 0.35, ky - S(head) * r * 1.2 + wave * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#B8202C';
    ctx.beginPath(); ctx.arc(kx, ky, r * 0.12, 0, P * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(x + C(face) * r * 0.45, y - r * 0.47, r * 0.06, 0, P * 2); ctx.fill();
  } else if (e.kind === 'train') { // a steam engine head-on: smokebox door with rivets, headlight, chimney, buffer beam, cowcatcher
    const lw = Math.max(1, r * 0.05);
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    // chimney (behind the top edge) with a flared cap and a brass band
    ctx.fillStyle = '#2B2F3A';
    ctx.beginPath(); ctx.roundRect(x - r * 0.17, y - r * 1.18, r * 0.34, r * 0.4, r * 0.05); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(x - r * 0.27, y - r * 1.3, r * 0.54, r * 0.15, r * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFCC33';
    ctx.fillRect(x - r * 0.17, y - r * 0.98, r * 0.34, r * 0.07);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, P * 2); ctx.clip();
    // cowcatcher stripes along the bottom
    ctx.fillStyle = '#C9302C';
    ctx.fillRect(x - r, y + r * 0.6, r * 2, r * 0.45);
    ctx.fillStyle = '#FFCC33';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * r * 0.28, y + r * 0.78); ctx.lineTo(x + i * r * 0.28 + r * 0.12, y + r * 0.78);
      ctx.lineTo(x + i * r * 0.36 + r * 0.14, y + r * 1.05); ctx.lineTo(x + i * r * 0.36, y + r * 1.05); ctx.fill();
    }
    // buffer beam with two buffers
    ctx.fillStyle = '#B0201C';
    ctx.fillRect(x - r, y + r * 0.5, r * 2, r * 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - r, y + r * 0.5, r * 2, r * 0.04);
    ctx.restore();
    for (const sx of [-0.62, 0.62]) {
      ctx.fillStyle = '#3A3F4C';
      ctx.beginPath(); ctx.arc(x + sx * r, y + r * 0.6, r * 0.13, 0, P * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9AA3B5';
      ctx.beginPath(); ctx.arc(x + sx * r - r * 0.03, y + r * 0.57, r * 0.05, 0, P * 2); ctx.fill();
    }
    // smokebox door: dark disc, brass ring, rivets, handle
    const dy = y - r * 0.02, dr = r * 0.5;
    ctx.fillStyle = '#2B2F3A';
    ctx.beginPath(); ctx.arc(x, dy, dr, 0, P * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#FFCC33'; ctx.lineWidth = r * 0.07;
    ctx.beginPath(); ctx.arc(x, dy, dr * 0.82, 0, P * 2); ctx.stroke();
    ctx.fillStyle = '#FFE38A';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * P * 2; ctx.beginPath(); ctx.arc(x + C(a) * dr * 0.82, dy + S(a) * dr * 0.82, r * 0.035, 0, P * 2); ctx.fill(); }
    ctx.strokeStyle = '#9AA3B5'; ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.moveTo(x - dr * 0.4, dy); ctx.lineTo(x + dr * 0.4, dy); ctx.stroke();
    ctx.fillStyle = '#9AA3B5';
    ctx.beginPath(); ctx.arc(x, dy, r * 0.07, 0, P * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(x - dr * 0.35, dy - dr * 0.4, dr * 0.3, dr * 0.14, -0.6, 0, P * 2); ctx.fill();
    // headlight on top, glowing
    const hy = y - r * 0.68, glow = 0.55 + 0.25 * S(t * 6);
    const g = ctx.createRadialGradient(x, hy, 0, x, hy, r * 0.45);
    g.addColorStop(0, `rgba(255,246,194,${glow})`); g.addColorStop(1, 'rgba(255,246,194,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, hy, r * 0.45, 0, P * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    ctx.fillStyle = '#FFCC33';
    ctx.beginPath(); ctx.arc(x, hy, r * 0.17, 0, P * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFF6C2';
    ctx.beginPath(); ctx.arc(x, hy, r * 0.1, 0, P * 2); ctx.fill();
  } else if (e.kind === 'magnet') { // red and blue poles with a steel band; its field shows while the super pulls
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, P * 2); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + r);
    g.addColorStop(0, '#5B86FF');
    g.addColorStop(1, '#2443B8');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y, r * 2, r);
    ctx.fillStyle = '#D9DEE8';
    ctx.fillRect(x - r, y - r * 0.09, r * 2, r * 0.18);
    ctx.fillStyle = 'rgba(8,16,32,0.25)';
    ctx.fillRect(x - r, y + r * 0.09, r * 2, r * 0.05);
    ctx.restore();
    ctx.font = `900 ${Math.round(r * 0.42)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('N', x, y - r * 0.5);
    ctx.fillText('S', x, y + r * 0.52);
    if ((e.cd.pullUntil ?? 0) > t) {
      ctx.strokeStyle = `rgba(255,120,80,${0.5 + 0.3 * S(t * 20)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(x, y, r * (1.3 + i * 0.5) - ((t * 60) % (r * 0.5)), 0, P * 2); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  } else if (e.kind === 'bomb') { // steel cap, braided fuse and a crackling spark
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.fillStyle = '#8E95A8';
    ctx.beginPath(); ctx.roundRect(x + r * 0.28, y - r * 0.98, r * 0.4, r * 0.3, r * 0.06); ctx.fill(); ctx.stroke();
    const fuse = () => { ctx.beginPath(); ctx.moveTo(x + r * 0.48, y - r * 0.95); ctx.quadraticCurveTo(x + r * 0.75, y - r * 1.35, x + r * 1.1, y - r * 1.15); ctx.stroke(); };
    ctx.strokeStyle = '#C9A36B';
    ctx.lineWidth = r * 0.11;
    fuse();
    ctx.strokeStyle = 'rgba(80,50,20,0.6)';
    ctx.lineWidth = r * 0.04;
    ctx.setLineDash([r * 0.08, r * 0.08]);
    fuse();
    ctx.setLineDash([]);
    const sp = r * (0.14 + 0.06 * S(t * 30));
    ctx.fillStyle = '#FFD23F';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * P) / 4 + t * 6, rr = i % 2 ? sp * 0.45 : sp; ctx.lineTo(x + r * 1.1 + C(a) * rr, y - r * 1.15 + S(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFF6C2';
    ctx.beginPath(); ctx.arc(x + r * 1.1, y - r * 1.15, sp * 0.4, 0, P * 2); ctx.fill();
  } else if (e.kind === 'turtle') { // shell scutes with light rims
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.fillStyle = 'rgba(40,80,20,0.35)';
    ctx.strokeStyle = 'rgba(220,255,180,0.45)';
    const hex = (cx, cy, rr) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * P * 2 + P / 6; ctx.lineTo(cx + C(a) * rr, cy + S(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); };
    hex(x, y, r * 0.42);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * P * 2; hex(x + C(a) * r * 0.68, y + S(a) * r * 0.68, r * 0.3); }
  } else if (e.kind === 'lightning') { // a bold bolt and crackling arcs
    const sz = r * 0.5;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + sz * 0.2, y - sz * 0.9); ctx.lineTo(x - sz * 0.5, y + sz * 0.15); ctx.lineTo(x - sz * 0.02, y + sz * 0.15);
    ctx.lineTo(x - sz * 0.2, y + sz * 0.9); ctx.lineTo(x + sz * 0.5, y - sz * 0.15); ctx.lineTo(x + sz * 0.04, y - sz * 0.15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,200,0.9)';
    ctx.lineWidth = Math.max(1, r * 0.04);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * P * 2;
      let px = x + C(a) * r, py = y + S(a) * r;
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let k = 0; k < 3; k++) { px += C(a) * r * 0.12 + (Math.random() - 0.5) * r * 0.25; py += S(a) * r * 0.12 + (Math.random() - 0.5) * r * 0.25; ctx.lineTo(px, py); }
      ctx.stroke();
    }
  } else if (e.kind === 'hedgehog') { // snout and eyes toward the foe (quills are drawn under the body)
    ctx.fillStyle = '#E8C9A8';
    ctx.beginPath(); ctx.arc(x + C(face) * r * 0.7, y + S(face) * r * 0.7, r * 0.28, 0, P * 2); ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x + C(face) * r * 0.92, y + S(face) * r * 0.92, r * 0.1, 0, P * 2); ctx.fill();
    for (const sg of [-0.5, 0.5]) { const a = face + sg; ctx.beginPath(); ctx.arc(x + C(a) * r * 0.5, y + S(a) * r * 0.5, r * 0.06, 0, P * 2); ctx.fill(); }
  } else if (e.kind === 'ice') { // a six-armed snowflake with branches and a frosty glow
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = '#BFEFFF';
    ctx.shadowBlur = r * 0.3;
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * P * 2 + t * 0.3, ux = C(a), uy = S(a);
      ctx.moveTo(x, y); ctx.lineTo(x + ux * r * 0.78, y + uy * r * 0.78);
      for (const d of [0.35, 0.58]) for (const sg of [-1, 1]) {
        const b = a + sg * 0.9;
        ctx.moveTo(x + ux * r * d, y + uy * r * d); ctx.lineTo(x + ux * r * d + C(b) * r * 0.16, y + uy * r * d + S(b) * r * 0.16);
      }
    }
    ctx.stroke();
  } else if (e.kind === 'poison') { // a plain green ball with a few venom spots and three stubby spikes
    ctx.fillStyle = 'rgba(20,90,10,0.45)';
    for (const [dx, dy, k] of [[-0.3, 0.1, 0.16], [0.25, -0.3, 0.12], [0.3, 0.35, 0.1]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * k, 0, P * 2); ctx.fill(); }
    ctx.fillStyle = '#2E8A22';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.04);
    for (const sg of [-0.7, 0, 0.7]) {
      const a = face + sg, bx = x + C(a) * r * 0.82, by = y + S(a) * r * 0.82, px = -S(a), py = C(a);
      ctx.beginPath(); ctx.moveTo(bx + px * r * 0.14, by + py * r * 0.14); ctx.lineTo(bx - px * r * 0.14, by - py * r * 0.14); ctx.lineTo(bx + C(a) * r * 0.42, by + S(a) * r * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (e.kind === 'chain') { // shackled: two steel chains cross over the ball, a padlock where they meet
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 0.99, 0, P * 2); ctx.clip();
    const len = r * 0.34;
    for (const d of [0.75, -0.75]) {
      const n = 8, pts = Array.from({ length: n }, (_, i) => {
        const k = (i / (n - 1)) * 2 - 1;
        return { x: x + C(d) * r * 1.1 * k, y: y + S(d) * r * 1.1 * k, a: d };
      });
      chainStroke(ctx, pts, len, len * 0.32, Math.max(1.4, r * 0.07), 0);
    }
    ctx.restore();
    const lw = Math.max(1.2, r * 0.05);
    ctx.lineWidth = r * 0.09;
    ctx.strokeStyle = '#C9D2E0';
    ctx.beginPath(); ctx.arc(x, y - r * 0.12, r * 0.17, P, 0); ctx.stroke(); // the shackle
    ctx.fillStyle = '#F2B632';
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.roundRect(x - r * 0.26, y - r * 0.14, r * 0.52, r * 0.42, r * 0.08); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x, y + r * 0.03, r * 0.06, 0, P * 2); ctx.fill();
    ctx.fillRect(x - r * 0.025, y + r * 0.04, r * 0.05, r * 0.13);
  } else if (e.kind === 'chess') { // a checkerboard, black on ivory
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 0.99, 0, P * 2); ctx.clip();
    ctx.fillStyle = 'rgba(20,24,34,0.88)';
    const q = r / 2;
    for (let i = -2; i < 2; i++) for (let j = -2; j < 2; j++) if ((i + j) & 1) ctx.fillRect(x + i * q, y + j * q, q, q);
    ctx.restore();
  } else if (e.kind === 'forge') { // a hammer decal that turns with the ball
    const hx = C(head), hy = S(head);
    ctx.strokeStyle = '#7A4A1E';
    ctx.lineWidth = r * 0.14;
    ctx.beginPath(); ctx.moveTo(x - hx * r * 0.55, y - hy * r * 0.55); ctx.lineTo(x + hx * r * 0.35, y + hy * r * 0.35); ctx.stroke();
    ctx.save();
    ctx.translate(x + hx * r * 0.42, y + hy * r * 0.42);
    ctx.rotate(head);
    ctx.fillStyle = '#C9D2E0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.roundRect(-r * 0.16, -r * 0.34, r * 0.32, r * 0.68, r * 0.06); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Poisoned: the body tints orange-brown and a jagged chartreuse halo crackles around it.
function poisoned(ctx, e, t) {
  const { x, y, r } = e;
  ctx.fillStyle = 'rgba(200,110,20,0.38)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.strokeStyle = `rgba(190,255,60,${0.55 + 0.25 * Math.sin(t * 9)})`;
  ctx.shadowColor = '#BFFF3C';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 1.5, rr = r * (i % 2 ? 1.25 : 1.5);
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Cell fragments swirl in a lime vortex; the last 1-2 HP ones turn into a calm teal bubble (drawn by drawBall).
function cellAura(ctx, e, t) {
  const { x, y, r } = e;
  ctx.save();
  ctx.strokeStyle = 'rgba(150,255,120,0.35)';
  ctx.lineWidth = r * 0.35;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.09; ctx.beginPath(); ctx.arc(x, y, r * 1.6, a, a + 1.1); ctx.stroke(); }
  ctx.restore();
}

// Two-tone quills; curled up (the super) they grow and spin.
function spikes(ctx, e, t) {
  const { x, y, r } = e, n = 16, curl = (e.cd.curl ?? 0) > t, k = curl ? 1.3 : 1, spin = curl ? t * 4 : 0;
  for (const [len, color] of [[1.34, '#4A2C18'], [1.18, curl ? '#A0724A' : '#7A5236']]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + spin, b = a + Math.PI / n;
      ctx.moveTo(x + Math.cos(a - 0.16) * r * 0.9, y + Math.sin(a - 0.16) * r * 0.9);
      ctx.lineTo(x + Math.cos(b) * r * len * k, y + Math.sin(b) * r * len * k);
      ctx.lineTo(x + Math.cos(a + 0.36) * r * 0.9, y + Math.sin(a + 0.36) * r * 0.9);
    }
    ctx.fill();
  }
}

// Chilled: a frosty tint with drifting crystals. Frozen: a block of ice around the ball that cracks as it thaws.
function frost(ctx, e, t) {
  const { x, y, r } = e, frozen = e.chillSlow <= 0.1;
  ctx.fillStyle = frozen ? 'rgba(200,240,255,0.5)' : 'rgba(140,215,255,0.45)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (!frozen) { // chilled: frosty rim, icicles, sparkles, and a ring that counts down the slow
    ctx.save();
    ctx.strokeStyle = 'rgba(225,248,255,0.95)';
    ctx.lineWidth = r * 0.13;
    ctx.beginPath(); ctx.arc(x, y, r * 0.93, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(220,246,255,0.95)';
    for (const dx of [-0.45, 0, 0.45]) { const L = r * (0.35 + 0.1 * Math.sin(dx * 9)); ctx.beginPath(); ctx.moveTo(x + dx * r - r * 0.1, y + r * 0.86); ctx.lineTo(x + dx * r + r * 0.1, y + r * 0.86); ctx.lineTo(x + dx * r, y + r * 0.86 + L); ctx.fill(); }
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + t * 1.2, d = r * 1.15, s = r * 0.12;
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
      ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.quadraticCurveTo(sx, sy, sx + s, sy); ctx.quadraticCurveTo(sx, sy, sx, sy + s); ctx.quadraticCurveTo(sx, sy, sx - s, sy); ctx.quadraticCurveTo(sx, sy, sx, sy - s); ctx.fill();
    }
    const k = Math.max(0, Math.min(1, (e.chillUntil - t) / ICE.chill));
    ctx.strokeStyle = '#4FB6FF'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 - 0.4, d = r * (1.2 + 0.12 * ((i * 7) % 3)); ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
  ctx.closePath();
  ctx.fillStyle = 'rgba(190,235,255,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.2); ctx.lineTo(x - r * 0.3, y - r * 0.75); ctx.stroke();
  const left = e.chillUntil - t;
  if (left < 0.9) { // cracks spread just before it shatters
    ctx.strokeStyle = 'rgba(8,16,32,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, y + r * 0.1); ctx.lineTo(x - r * 0.3, y - r * 0.1); ctx.lineTo(x + r * 0.1, y + r * 0.4); ctx.lineTo(x + r * 0.8, y + r * 0.2);
    if (left < 0.45) { ctx.moveTo(x - r * 0.3, y - r * 0.1); ctx.lineTo(x - r * 0.1, y - r * 0.9); ctx.moveTo(x + r * 0.1, y + r * 0.4); ctx.lineTo(x + r * 0.2, y + r * 1.1); }
    ctx.stroke();
  }
  ctx.restore();
}

// Skin patterns, clipped to the ball.
function pattern(ctx, e, sk, t) {
  const { x, y, r } = e;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (sk.pattern === 'shine') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.2); ctx.lineTo(x - r * 0.2, y - r); ctx.lineTo(x + r * 0.1, y - r); ctx.lineTo(x - r, y + r * 0.1);
    ctx.fill();
  } else if (sk.pattern === 'stripes') {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = r * 0.22;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x - r + k * r * 0.6, y + r); ctx.lineTo(x + r + k * r * 0.6, y - r); ctx.stroke(); }
  } else if (sk.pattern === 'stars') {
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 9; k++) {
      const a = k * 2.399, d = r * 0.85 * Math.sqrt((k + 0.5) / 9);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + k);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.05, 0, Math.PI * 2); ctx.fill();
    }
  } else if (sk.pattern === 'cracks') {
    ctx.strokeStyle = 'rgba(60,10,0,0.55)';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y - r * 0.2); ctx.lineTo(x - r * 0.2, y); ctx.lineTo(x, y - r * 0.5);
    ctx.moveTo(x - r * 0.2, y); ctx.lineTo(x + r * 0.3, y + r * 0.4); ctx.lineTo(x + r * 0.7, y + r * 0.2);
    ctx.stroke();
  } else if (sk.pattern === 'dots') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 7; k++) {
      const a = k * 2.399, d = r * 0.7 * Math.sqrt((k + 0.5) / 7);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  } else if (sk.pattern === 'rainbow') { // the account gift: a turning hue wheel with sparkles
    const g = ctx.createConicGradient ? ctx.createConicGradient(t * 1.2, x, y) : ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60}, 95%, 62%)`);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    const sh = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    sh.addColorStop(0, 'rgba(255,255,255,0.45)');
    sh.addColorStop(0.6, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(10,15,28,0.35)');
    ctx.fillStyle = sh;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 4; k++) {
      const a = k * 1.9 + t * 0.8, d = r * (0.35 + 0.15 * k), s2 = r * (0.06 + 0.04 * Math.max(0, Math.sin(t * 4 + k * 2)));
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      ctx.beginPath(); ctx.moveTo(px, py - s2 * 2); ctx.lineTo(px + s2 * 0.5, py); ctx.lineTo(px, py + s2 * 2); ctx.lineTo(px - s2 * 0.5, py); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - s2 * 2, py); ctx.lineTo(px, py + s2 * 0.5); ctx.lineTo(px + s2 * 2, py); ctx.lineTo(px, py - s2 * 0.5); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
  if (sk.pattern === 'neon') { // glowing outline in the ball's own colour
    ctx.save();
    ctx.strokeStyle = BALLS[e.kind].color;
    ctx.shadowColor = BALLS[e.kind].color;
    ctx.shadowBlur = r * 0.6;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function legs(ctx, e, t) {
  const { x, y, r } = e, wig = Math.sin(t * 16) * 0.12;
  ctx.strokeStyle = shade(BALLS.spider.color, 0.3);
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = (side > 0 ? 0 : Math.PI) + side * (-0.75 + i * 0.5) + wig * (i % 2 ? 1 : -1);
    const kx = x + Math.cos(a) * r * 1.25, ky = y + Math.sin(a) * r * 1.25 - r * 0.15;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(kx, ky);
    ctx.lineTo(kx + Math.cos(a) * r * 0.25, ky + r * 0.35);
    ctx.stroke();
  }
}

// Chess: while a piece is in play the arena becomes a chessboard (like the original), red lines show where it can strike.
const GLYPH = { rook: '♜', bishop: '♝', knight: '♞', queen: '♛' };
const boardFade = (m, t) => (m.stage === 'go' ? Math.min(1, (t - m.at) / 0.2) : m.stage === 'aim' ? 1 : Math.max(0, 1 - (t - m.at) / 0.4));
function chessBoard(ctx, w, t) {
  const m = w.ents.find(e => !e.dead && e.chess)?.chess;
  if (!m) return false;
  const k = boardFade(m, t), n = 5, sq = 400 / n;
  ctx.save();
  ctx.globalAlpha = 0.88 * k;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = (i + j) & 1 ? '#121A2C' : '#C9DCF2';
    ctx.fillRect(i * sq, j * sq, sq, sq);
  }
  ctx.restore();
  return true;
}
function chessLines(ctx, e, t) {
  const m = e.chess;
  if (!m.from) return;
  const k = boardFade(m, t), pulse = 0.75 + 0.25 * Math.sin(t * 20);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = '#FF2D46';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = `rgba(255,45,70,${0.85 * k * pulse})`;
  ctx.lineWidth = 2.5;
  for (const p of m.lines ?? []) { ctx.beginPath(); ctx.moveTo(m.from.x, m.from.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  for (const p of m.targets ?? []) { ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.stroke(); }
  ctx.lineWidth = 5; // the line it takes
  ctx.strokeStyle = `rgba(255,70,90,${k})`;
  ctx.beginPath(); ctx.moveTo(m.from.x, m.from.y); ctx.lineTo(m.end.x, m.end.y); ctx.stroke();
  ctx.restore();
}
function chessPiece(ctx, e, t) { // the piece stands on top of the ball
  const y = e.y - e.r * 0.55 - Math.abs(Math.sin(t * 8)) * 3;
  ctx.save();
  ctx.font = `900 ${Math.round(e.r * 1.25)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.strokeText(GLYPH[e.chess.piece], e.x, y);
  ctx.fillStyle = e.chess.piece === 'queen' ? '#FFCC33' : '#FFFFFF';
  ctx.fillText(GLYPH[e.chess.piece], e.x, y);
  ctx.restore();
}

// afterimages while dashing / ramming
function trail(ctx, e, t) {
  if (!e.boost || e.boost.until <= t) return;
  const m = Math.hypot(e.vx, e.vy) || 1, ux = e.vx / m, uy = e.vy / m;
  ctx.fillStyle = e.skin && SKINS[e.skin] ? SKINS[e.skin].color : BALLS[e.kind].color;
  for (let i = 4; i >= 1; i--) {
    ctx.globalAlpha = 0.08 * (5 - i);
    ctx.beginPath();
    ctx.arc(e.x - ux * i * e.r * 0.6, e.y - uy * i * e.r * 0.6, e.r * (1 - i * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// HP sits in the middle of the ball, white with a dark outline, like the original.
function hpText(ctx, e) {
  const { x, y, r } = e, n = Math.ceil(e.hp);
  ctx.font = `900 ${Math.round(r * 0.78)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, r * 0.17);
  ctx.strokeStyle = INK;
  ctx.strokeText(n, x, y + r * 0.05);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(n, x, y + r * 0.05);
  if (e.lv) { // the forge's level, in gold under the HP
    ctx.font = `900 ${Math.round(r * 0.4)}px ${FONT}`;
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.strokeText('Lv' + e.lv, x, y + r * 0.62);
    ctx.fillStyle = '#FFCC33';
    ctx.fillText('Lv' + e.lv, x, y + r * 0.62);
  }
}

// A glossy ball: soft floor shadow, shaded body, specular highlight, a thin glowing rim in the team colour.
export function drawBall(ctx, e, now, t, { rim = true, aura = null } = {}) {
  const sk = e.skin && SKINS[e.skin], { x, y, r } = e, bubble = e.kind === 'cell' && e.mini && e.hp <= 2;
  const color = bubble ? '#7FD9D1' : sk ? sk.color : BALLS[e.kind].color;
  const au = aura ?? (e.id >= 0 ? auraOf[e.side] : null);
  if (au) drawAura(ctx, au, x, y, r, now || 0.4);
  ctx.fillStyle = 'rgba(8,16,32,0.42)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.16, y + r * 0.3, r * 0.98, r * 0.86, 0, 0, Math.PI * 2); ctx.fill();
  if (e.kind === 'spider') legs(ctx, e, t);
  if (e.kind === 'hedgehog') spikes(ctx, e, t);
  if (e.kind === 'cell' && e.mini && !bubble) cellAura(ctx, e, t);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
  g.addColorStop(0, shade(color, 0.5));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.5));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (sk) pattern(ctx, e, sk, t);
  if (!bubble) deco(ctx, e, t);
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.33, y - r * 0.42, r * 0.34, r * 0.19, -0.55, 0, Math.PI * 2); ctx.fill();
  if (e.chillUntil > t) frost(ctx, e, t);
  if (e.poisonUntil > t) poisoned(ctx, e, t);
  if (rim) {
    ctx.save();
    ctx.strokeStyle = SIDE[e.side];
    ctx.shadowColor = SIDE[e.side];
    ctx.shadowBlur = r * 0.4;
    ctx.lineWidth = Math.max(2, r * 0.085);
    ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (e.shieldUntil > t) { // shell bubble
    ctx.save();
    ctx.strokeStyle = `rgba(140,255,150,${0.7 + 0.25 * Math.sin(now * 12)})`;
    ctx.shadowColor = '#7CFF8A';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * 1.22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(140,255,150,0.12)';
    ctx.fill();
  }
  if ((fx.flash[e.id] ?? 0) > now) { // hit: the ball goes solid white with a pink bloom
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = '#FF6B81';
    ctx.shadowBlur = r * 0.8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function aimArrow(ctx, e, ang, now) {
  const pulse = 0.75 + 0.25 * Math.sin(now * 6);
  const ux = Math.cos(ang), uy = Math.sin(ang), start = e.r + 8, len = 92;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  for (let d = start; d < start + len - 16; d += 20) {
    ctx.save();
    ctx.translate(e.x + ux * d, e.y + uy * d);
    ctx.rotate(ang);
    ctx.beginPath(); ctx.roundRect(0, -5, 12, 10, 3); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
  const tip = start + len;
  ctx.translate(e.x + ux * tip, e.y + uy * tip);
  ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-18, -14); ctx.lineTo(-18, 14); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

// Which way each ball looks: at its nearest enemy.
function faces(w) {
  for (const e of w.ents) {
    if (e.dead) continue;
    let best = null, bd = Infinity;
    for (const f of w.ents) {
      if (f.dead || f.side === e.side) continue;
      const d = Math.hypot(f.x - e.x, f.y - e.y);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) fx.face[e.id] = Math.atan2(best.y - e.y, best.x - e.x);
  }
}

// Life flows from the victim to the leech: a dark beam, red drops along it, and running totals above both.
function drain(ctx, w, e, t, dt) {
  const f = e.latch.foe;
  if (f.dead) return;
  ctx.save();
  ctx.strokeStyle = `rgba(160,20,40,${0.3 + 0.15 * Math.sin(t * 16)})`;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  ctx.restore();
  if (Math.random() < 0.7) {
    const a = Math.random() * Math.PI * 2, sx = f.x + Math.cos(a) * f.r * 0.6, sy = f.y + Math.sin(a) * f.r * 0.6;
    fx.parts.push({ x: sx, y: sy, vx: (e.x - sx) / 0.3, vy: (e.y - sy) / 0.3, life: 0.3, age: 0, color: '#FF3B3B', size: rnd(3, 5), round: true, drag: 0 });
  }
  fx.drain[e.id] = (fx.drain[e.id] ?? 0) + LEECH.drain * e.latch.mul * dt;
  if (fx.drain[e.id] >= 4) {
    const n = Math.round(fx.drain[e.id]);
    fx.drain[e.id] = 0;
    dmgFloat(w, f.id, n, SIDE[e.side]);
    dmgFloat(w, e.id, n, '#36D27A', '+');
  }
}

// Chimney smoke while the train rolls.
function puff(e) {
  const m = Math.hypot(e.vx, e.vy) || 1, ux = e.vx / m;
  fx.parts.push({ x: e.x - ux * e.r * 0.2 + rnd(-3, 3), y: e.y - e.r * 1.2, vx: -ux * 40 + rnd(-15, 15), vy: -30 + rnd(-10, 0), life: rnd(0.6, 1), age: 0, color: 'rgba(235,240,250,0.75)', size: rnd(3, 5), round: true, grow: 2.2, drag: 1.5 });
}

// ---------- frame ----------

export function draw(ctx, w, s, { aim = null, foeAim = null, now, dt, me = null }) {
  absorb(w, now);
  ctx.setTransform(s, 0, 0, s, M * s, M * s);
  if (fx.shake > 0.2) ctx.translate(rnd(-1, 1) * fx.shake, rnd(-1, 1) * fx.shake);
  fx.shake = Math.max(0, fx.shake - dt * 40);
  arena(ctx, w, now);
  if (chessBoard(ctx, w, w.t)) obstacles(ctx, w, now); // rocks and pools stay visible on the board
  for (const z of w.zones) {
    if (z.kind === 'web') web(ctx, z, w.t);
    else if (z.kind === 'spike') spike(ctx, z);
    else if (z.kind === 'ring') ringZone(ctx, z, w.t);
    else if (z.kind === 'track') track(ctx, z, w.t);
    else if (z.kind === 'bomb') bombZone(ctx, z, w.t, now);
    else if (z.kind === 'zap') zapZone(ctx, z, w.t);
  }
  faces(w);
  for (const e of w.ents) if (!e.dead && e.chess) chessLines(ctx, e, w.t);
  for (const e of w.ents) if (!e.dead && e.latch) drain(ctx, w, e, w.t, dt);
  for (const e of w.ents) if (!e.dead) trail(ctx, e, w.t);
  for (const e of w.ents) if (!e.dead) drawBall(ctx, e, now, w.t);
  for (const e of w.ents) if (!e.dead) hpText(ctx, e); // numbers last, so a ball never covers another's HP
  for (const e of w.ents) if (!e.dead && e.chess) chessPiece(ctx, e, w.t);
  for (const z of w.zones) if (z.kind === 'track') for (const tr of z.trains) trainDraw(ctx, tr, w.t);
  for (const e of w.ents) {
    if (!e.dead && e.kind === 'train' && (e.vx || e.vy) && Math.random() < 0.3) puff(e);
    if (!e.dead && e.chillUntil > w.t && Math.random() < 0.6) fx.parts.push({ x: e.x + rnd(-e.r, e.r) * 0.6, y: e.y + rnd(-e.r, e.r) * 0.6, vx: 0, vy: 12, life: 0.6, age: 0, color: '#CFF4FF', size: rnd(3, 5), round: true }); // an icy trail
    const frozen = !e.dead && e.chillUntil > w.t && e.chillSlow <= 0.1; // thawing out: the ice block shatters
    if (fx.frozen[e.id] && !frozen) { burst(e.x, e.y, 18, '#DDF6FF', 220); ring(e.x, e.y, e.r, 1.8, 0.35, '200,240,255', 4); }
    fx.frozen[e.id] = frozen;
  }
  for (const s of [0, 1]) { // golden halo: this side's super is ready
    const lead = canSuper(w, s) && w.ents.find(e => e.side === s && !e.dead);
    if (!lead) continue;
    ctx.save();
    ctx.strokeStyle = `rgba(255,204,51,${0.7 + 0.3 * Math.sin(now * 10)})`;
    ctx.shadowColor = '#FFCC33';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(lead.x, lead.y, lead.r + 6 + 2 * Math.sin(now * 10), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  for (const e of w.ents) if (!e.dead && e.yank && !e.yank.by.dead) chain(ctx, e.yank.by.x, e.yank.by.y, e.x, e.y);
  for (const sh of w.shots) sh.kind === 'needle' ? needle(ctx, sh) : sh.kind === 'hook' ? hookShot(ctx, sh) : shuriken(ctx, sh, w.t);
  const lead = side => w.ents.find(e => e.side === side);
  if (aim != null) aimArrow(ctx, lead(0), aim, now);
  if (foeAim != null && lead(1)) aimArrow(ctx, lead(1), foeAim, now); // the opponent's shot is no secret, like the original

  ctx.save();
  ctx.shadowBlur = 14;
  for (const r of fx.rings) {
    r.age += dt;
    ctx.shadowColor = `rgb(${r.rgb})`;
    const k = Math.min(1, r.age / r.life);
    ctx.strokeStyle = `rgba(${r.rgb},${1 - k})`;
    ctx.lineWidth = r.width * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 + k * (r.grow - 1)), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  fx.rings = fx.rings.filter(r => r.age < r.life);

  for (const p of fx.parts) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = 1 - (p.drag ?? 3) * dt;
    p.vx *= drag;
    p.vy *= drag;
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    if (p.round) { ctx.beginPath(); ctx.arc(p.x, p.y, (p.size / 2) * (1 + (p.grow ?? 0) * (p.age / p.life)), 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  fx.parts = fx.parts.filter(p => p.age < p.life);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const f of fx.floats) {
    f.age += dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    const drag = Math.exp(-5 * dt);
    f.vx *= drag; f.vy = f.vy * drag - 14 * dt; // pops out fast, then drifts up
    const k = f.age / f.life, p = f.age - f.popAt;
    const pop = p < 0.09 ? 0.35 + p * 11 : p < 0.2 ? 1.34 - (p - 0.09) * 3.1 : 1; // pop in, overshoot, settle
    ctx.save();
    ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    ctx.translate(f.x, f.y - k * f.rise);
    ctx.rotate(f.tilt);
    ctx.scale(pop, pop);
    ctx.font = `italic 900 ${f.size}px ${FONT}`;
    ctx.lineWidth = f.size * 0.26;
    ctx.strokeStyle = INK;
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  drawEmotes(ctx, w, dt);
  for (const e of w.ents) if (e.boss && !e.dead) { // the boss wears a crown, tilting a little as it rolls
    ctx.save();
    ctx.translate(e.x, e.y - e.r - 4);
    ctx.rotate(Math.sin(now * 2) * 0.12);
    ctx.beginPath();
    ctx.moveTo(-17, 0); ctx.lineTo(-20, -18); ctx.lineTo(-9, -9); ctx.lineTo(0, -22); ctx.lineTo(9, -9); ctx.lineTo(20, -18); ctx.lineTo(17, 0);
    ctx.closePath();
    ctx.fillStyle = '#FFCC33'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FF4D6D';
    for (const x of [-10, 0, 10]) { ctx.beginPath(); ctx.arc(x, -4, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  const mine = me != null && w.ents.find(e => e.id === me && !e.dead);
  if (mine) { // in a party: a bobbing marker over the ball you steer
    const y = mine.y - mine.r - 12 - Math.abs(Math.sin(now * 4)) * 4;
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(mine.x - 8, y - 8); ctx.lineTo(mine.x + 8, y - 8); ctx.lineTo(mine.x, y + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  fx.floats = fx.floats.filter(f => f.age < f.life);
}

// Static card icon: the same ball art without HP or team rim.
export function drawIcon(canvas, kind, css = 56, skin = null, aura = null) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(css * dpr);
  canvas.style.width = canvas.style.height = css + 'px';
  const c = canvas.getContext('2d');
  const k = canvas.width / 64;
  c.setTransform(k, 0, 0, k, 0, 0);
  const r = kind === 'hedgehog' ? 18 : 21; // leave room for spikes
  drawBall(c, { id: -1, side: 0, kind, skin, x: 32, y: 34, r: aura ? r * 0.85 : r, vx: 1, vy: -1, hp: 0, cd: {}, latch: null, chillUntil: 0, shieldUntil: 0, poisonUntil: 0 }, 0.4, 0, { rim: false, aura });
}
