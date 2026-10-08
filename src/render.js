// Canvas drawing for the arena + juice (sparks, damage numbers, hit flashes, shake).
// Visual-only randomness uses Math.random — the simulation itself stays deterministic.
import { W, H, SUDDEN, METER } from './sim.js';
import { BALLS, TRAIN } from './balls.js';

export const SIDE = ['#4cc9f0', '#ff4d6d']; // you · opponent
const SIDE_RGB = ['76,201,240', '255,77,109'];
const FONT = 'Rubik, system-ui, sans-serif';
const fx = { parts: [], floats: [], rings: [], flash: {}, shake: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);

const shade = (hex, k) => { // k > 0 lightens toward white, k < 0 darkens
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c})`;
};

export function resetFx() {
  fx.parts.length = fx.floats.length = fx.rings.length = 0;
  fx.flash = {};
  fx.shake = 0;
}

export function fitCanvas(canvas, cssSize) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = canvas.style.height = cssSize + 'px';
  canvas.width = canvas.height = Math.round(cssSize * dpr);
  return canvas.width / W;
}

function burst(x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(0.3, 1) * speed;
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.25, 0.55), age: 0, color, size: rnd(1.5, 3.5) });
  }
}

const ring = (x, y, r, grow, life, rgb, width) => fx.rings.push({ x, y, r, grow, life, rgb, width, age: 0 });

function absorb(w, now) {
  for (const ev of w.events) {
    if (ev.type === 'hit') {
      fx.flash[ev.id] = now + 0.12;
      if (ev.amount >= 1) fx.floats.push({ x: ev.x + rnd(-10, 10), y: ev.y - 24, text: '-' + Math.round(ev.amount), side: ev.side, age: 0 });
      burst(ev.x, ev.y, 5, '#ffffff', 110);
    } else if (ev.type === 'clash') {
      burst(ev.x, ev.y, 12, '#ffe08a', 220);
      fx.shake = Math.max(fx.shake, 3);
    } else if (ev.type === 'death') {
      burst(ev.x, ev.y, 30, BALLS[ev.kind].color, 280);
      burst(ev.x, ev.y, 10, '#ffffff', 160);
      ring(ev.x, ev.y, ev.r, 2.6, 0.45, '255,255,255', 5);
      fx.shake = 10;
    } else if (ev.type === 'split') {
      burst(ev.x, ev.y, 16, BALLS.cell.color, 200);
    } else if (ev.type === 'latch') {
      burst(ev.x, ev.y, 10, '#ff8fa3', 130);
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

function arena(ctx, w, now) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1e2f52');
  g.addColorStop(1, '#141f39');
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 40; i < W; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.moveTo(0, i); ctx.lineTo(W, i); }
  ctx.stroke();
  const sudden = w.launched && w.t > SUDDEN;
  ctx.strokeStyle = sudden ? `rgba(255,77,109,${0.45 + 0.35 * Math.sin(now * 9)})` : 'rgba(255,255,255,0.09)';
  ctx.lineWidth = sudden ? 8 : 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}

function web(ctx, z, t) {
  const life = Math.max(0, Math.min(1, (z.until - t) / 0.6, (t - z.born) / 0.15));
  ctx.save();
  ctx.globalAlpha = 0.1 * life;
  ctx.fillStyle = SIDE[z.side];
  ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.6 * life;
  ctx.strokeStyle = '#ece8ff';
  ctx.lineWidth = 1.2;
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
  ctx.stroke();
  ctx.restore();
}

function train(ctx, z, t) {
  ctx.save();
  // local frame: rails run along +x at y = 0, train always drives toward +x
  if (z.axis === 'h') ctx.translate(0, z.pos);
  else { ctx.translate(z.pos, 0); ctx.rotate(Math.PI / 2); }
  if (z.dir < 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  const warn = t < z.go;
  ctx.globalAlpha = warn ? (Math.sin(t * 22) > 0 ? 0.85 : 0.35) : 1;
  ctx.fillStyle = '#6b4f2e';
  for (let x = 6; x < W; x += 18) ctx.fillRect(x, -15, 6, 30);
  ctx.strokeStyle = warn ? '#ffd166' : '#c9b48f';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(W, -9); ctx.moveTo(0, 9); ctx.lineTo(W, 9); ctx.stroke();
  if (!warn) {
    const front = ((t - z.go) / TRAIN.sweep) * (W + 120) - 60, c = BALLS.train.color;
    for (let i = 0; i < 4; i++) {
      const x1 = front - i * 64, x0 = x1 - 58;
      ctx.fillStyle = i ? shade(c, -0.15) : c;
      ctx.beginPath(); ctx.roundRect(x0, -16, x1 - x0, 32, i ? 6 : [6, 16, 16, 6]); ctx.fill();
      ctx.fillStyle = 'rgba(20,30,55,0.75)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x0 + 8 + k * 16, -8, 10, 9);
    }
    ctx.fillStyle = '#fff6c2';
    ctx.beginPath(); ctx.arc(front - 4, 0, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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
  ctx.fill();
  ctx.fillStyle = '#3a4256';
  ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function deco(ctx, e, t) {
  const { x, y, r } = e;
  if (e.kind === 'leech') { // fangs face where it's going (or into its victim)
    const a = e.latch ? Math.atan2(-e.latch.oy, -e.latch.ox) : Math.atan2(e.vy, e.vx) || -Math.PI / 2;
    ctx.fillStyle = '#ffffff';
    for (const s of [-0.38, 0.38]) {
      const b = a + s, bx = x + Math.cos(b) * r * 0.9, by = y + Math.sin(b) * r * 0.9;
      const px = -Math.sin(b), py = Math.cos(b), w = r * 0.13, l = r * 0.5;
      ctx.beginPath();
      ctx.moveTo(bx + px * w, by + py * w);
      ctx.lineTo(bx - px * w, by - py * w);
      ctx.lineTo(bx + Math.cos(b) * l, by + Math.sin(b) * l);
      ctx.fill();
    }
  } else if (e.kind === 'cell') {
    ctx.fillStyle = 'rgba(210,255,225,0.35)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.2, r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.25, r * 0.24, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'ninja') {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#e63946';
    ctx.fillRect(x - r, y - r * 0.62, r * 2, r * 0.3);
    ctx.restore();
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    const wave = Math.sin(t * 14) * r * 0.12;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.85, y - r * 0.5);
    ctx.quadraticCurveTo(x + r * 1.2, y - r * 0.55 + wave, x + r * 1.45, y - r * 0.3 + wave);
    ctx.stroke();
  } else if (e.kind === 'train') {
    ctx.fillStyle = '#4a3418';
    ctx.fillRect(x - r * 0.17, y - r * 1.28, r * 0.34, r * 0.45);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(80,50,20,0.45)';
    ctx.fillRect(x - r, y + r * 0.42, r * 2, r * 0.14);
    ctx.fillRect(x - r, y + r * 0.66, r * 2, r * 0.14);
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

// afterimages while dashing / ramming
function trail(ctx, e, t) {
  if (!e.boost || e.boost.until <= t) return;
  const m = Math.hypot(e.vx, e.vy) || 1, ux = e.vx / m, uy = e.vy / m;
  ctx.fillStyle = BALLS[e.kind].color;
  for (let i = 4; i >= 1; i--) {
    ctx.globalAlpha = 0.08 * (5 - i);
    ctx.beginPath();
    ctx.arc(e.x - ux * i * e.r * 0.6, e.y - uy * i * e.r * 0.6, e.r * (1 - i * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawBall(ctx, e, now, t, { hp = true, rim = true } = {}) {
  const { x, y, r } = e, color = BALLS[e.kind].color;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(x + r * 0.12, y + r * 0.2, r, 0, Math.PI * 2); ctx.fill();
  if (e.kind === 'spider') legs(ctx, e, t);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  deco(ctx, e, t);
  if (rim) {
    ctx.strokeStyle = SIDE[e.side];
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  }
  if ((fx.flash[e.id] ?? 0) > now) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (!hp) return;
  ctx.font = `800 ${Math.round(r * 0.72)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(Math.ceil(e.hp), x, y + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(Math.ceil(e.hp), x, y + 1);
}

function aimArrow(ctx, e, ang, now) {
  const pulse = 0.75 + 0.25 * Math.sin(now * 6);
  const ux = Math.cos(ang), uy = Math.sin(ang), start = e.r + 8, len = 92;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ffffff';
  for (let d = start; d < start + len - 16; d += 20) {
    ctx.save();
    ctx.translate(e.x + ux * d, e.y + uy * d);
    ctx.rotate(ang);
    ctx.fillRect(0, -4, 12, 8);
    ctx.restore();
  }
  const tip = start + len;
  ctx.translate(e.x + ux * tip, e.y + uy * tip);
  ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-18, -14); ctx.lineTo(-18, 14); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- frame ----------

export function draw(ctx, w, s, { aim = null, now, dt }) {
  absorb(w, now);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  if (fx.shake > 0.2) ctx.translate(rnd(-1, 1) * fx.shake, rnd(-1, 1) * fx.shake);
  fx.shake = Math.max(0, fx.shake - dt * 40);
  arena(ctx, w, now);
  for (const z of w.zones) z.kind === 'web' ? web(ctx, z, w.t) : train(ctx, z, w.t);
  for (const e of w.ents) if (!e.dead) trail(ctx, e, w.t);
  for (const e of w.ents) if (!e.dead) drawBall(ctx, e, now, w.t);
  for (const s of [0, 1]) { // golden halo: this side's super is ready
    const lead = w.sides[s].meter >= METER.full && w.ents.find(e => e.side === s && !e.dead);
    if (!lead) continue;
    ctx.strokeStyle = `rgba(255,204,51,${0.55 + 0.35 * Math.sin(now * 10)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(lead.x, lead.y, lead.r + 6 + 2 * Math.sin(now * 10), 0, Math.PI * 2); ctx.stroke();
  }
  for (const sh of w.shots) shuriken(ctx, sh, w.t);
  if (aim != null) aimArrow(ctx, w.ents[0], aim, now);

  for (const r of fx.rings) {
    r.age += dt;
    const k = Math.min(1, r.age / r.life);
    ctx.strokeStyle = `rgba(${r.rgb},${1 - k})`;
    ctx.lineWidth = r.width * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 + k * (r.grow - 1)), 0, Math.PI * 2); ctx.stroke();
  }
  fx.rings = fx.rings.filter(r => r.age < r.life);

  for (const p of fx.parts) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 3 * dt;
    p.vy *= 1 - 3 * dt;
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  fx.parts = fx.parts.filter(p => p.age < p.life);

  ctx.font = `800 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  for (const f of fx.floats) {
    f.age += dt;
    const k = f.age / 0.8;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(f.text, f.x, f.y - k * 30);
    ctx.fillStyle = f.side === 0 ? '#ff8fa3' : '#ffe08a';
    ctx.fillText(f.text, f.x, f.y - k * 30);
  }
  ctx.globalAlpha = 1;
  fx.floats = fx.floats.filter(f => f.age < 0.8);
}

// Static card icon: the same ball art without HP or team rim.
export function drawIcon(canvas, kind, css = 56) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(css * dpr);
  canvas.style.width = canvas.style.height = css + 'px';
  const c = canvas.getContext('2d');
  const k = canvas.width / 64;
  c.setTransform(k, 0, 0, k, 0, 0);
  drawBall(c, { id: -1, side: 0, kind, x: 32, y: 34, r: 21, vx: 1, vy: -1, hp: 0 }, 0, 0, { hp: false, rim: false });
}
