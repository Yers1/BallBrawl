// Canvas drawing for the arena + juice (sparks, damage numbers, hit flashes, shake).
// Visual-only randomness uses Math.random — the simulation itself stays deterministic.
import { W, H, SUDDEN, METER } from './sim.js';
import { BALLS, TRAIN } from './balls.js';
import { SKINS } from './progress.js';

export const SIDE = ['#4cc9f0', '#ff4d6d']; // you · opponent
const SIDE_RGB = ['76,201,240', '255,77,109'];
const FONT = 'Rubik, system-ui, sans-serif';
const INK = '#060b1d'; // the cartoon outline colour, same as --ink in style.css
export const M = 16; // wall thickness drawn around the 400×400 field (arena units)
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
  return canvas.width / (W + 2 * M);
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
      burst(ev.x, ev.y, 12, '#ff9f1c', 220);
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

// Brawl-Stars-like toy arena: chunky wall frame, sandy checker floor, centre circle.
function arena(ctx, w, now) {
  const sudden = w.launched && w.t > SUDDEN, k = sudden ? 0.5 + 0.5 * Math.sin(now * 9) : 0;
  ctx.fillStyle = sudden ? `rgb(${210 + 40 * k},${60 + 30 * k},${90 + 20 * k})` : '#4c5fd6';
  ctx.fillRect(-M - 20, -M - 20, W + 2 * M + 40, H + 2 * M + 40); // oversized: camera shake never shows an edge
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-M - 20, -M - 20, W + 2 * M + 40, 24);
  ctx.strokeStyle = 'rgba(6,11,29,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 50; i < W; i += 50) { // stone blocks
    ctx.moveTo(i, -M); ctx.lineTo(i, 0); ctx.moveTo(i, H); ctx.lineTo(i, H + M);
    ctx.moveTo(-M, i); ctx.lineTo(0, i); ctx.moveTo(W, i); ctx.lineTo(W + M, i);
  }
  ctx.stroke();
  ctx.fillStyle = '#f0d197';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e7c486';
  for (let y = 0; y < H; y += 50) for (let x = (y / 50) % 2 ? 0 : 50; x < W; x += 100) ctx.fillRect(x, y, 50, 50);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 62, 0, Math.PI * 2); ctx.stroke();
  for (const [x, y, gx, gy] of [[0, 0, 0, 1], [0, 0, 1, 0]]) { // the walls cast a soft shadow onto the floor
    const g = ctx.createLinearGradient(x, y, gx * 16, gy * 16);
    g.addColorStop(0, 'rgba(90,50,10,0.3)');
    g.addColorStop(1, 'rgba(90,50,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, gx ? 16 : W, gy ? 16 : H);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(-1.5, -1.5, W + 3, H + 3);
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
  ctx.beginPath(); ctx.arc(z.x, z.y, 10, 0, Math.PI * 2); ctx.fill();
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

function needle(ctx, s) {
  const m = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / m, uy = s.vy / m;
  ctx.strokeStyle = '#5a3a24';
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
  } else if (e.kind === 'magnet') { // red/blue poles like a real magnet
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + r);
    g.addColorStop(0, '#5b86ff');
    g.addColorStop(1, '#2443b8');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y, r * 2, r);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - r, y - r * 0.05, r * 2, r * 0.1);
    ctx.restore();
  } else if (e.kind === 'bomb') { // fuse + spark
    ctx.strokeStyle = '#c9a36b';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + r * 0.5, y - r * 0.75); ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.2, x + r * 1.15, y - r * 1.05); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ffd23f' : '#ff7a2f';
    ctx.beginPath(); ctx.arc(x + r * 1.15, y - r * 1.05, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'turtle') { // shell plates
    ctx.strokeStyle = 'rgba(40,70,20,0.55)';
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i ? ctx.lineTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45) : ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
    }
    ctx.closePath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
    }
    ctx.stroke();
  } else if (e.kind === 'lightning') { // a little bolt on the forehead
    const s = r * 0.36, bx = x, by = y - r * 0.66;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx + s * 0.2, by - s * 0.6);
    ctx.lineTo(bx - s * 0.45, by + s * 0.1);
    ctx.lineTo(bx - s * 0.02, by + s * 0.1);
    ctx.lineTo(bx - s * 0.2, by + s * 0.6);
    ctx.lineTo(bx + s * 0.45, by - s * 0.12);
    ctx.lineTo(bx + s * 0.04, by - s * 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (e.kind === 'ice') { // frosty snowflake
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
      ctx.lineTo(x - Math.cos(a) * r * 0.75, y - Math.sin(a) * r * 0.75);
    }
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

function spikes(ctx, e) {
  const { x, y, r } = e;
  ctx.fillStyle = '#5a3a24';
  const n = 14;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = a + Math.PI / n;
    ctx.moveTo(x + Math.cos(a - 0.18) * r * 0.9, y + Math.sin(a - 0.18) * r * 0.9);
    ctx.lineTo(x + Math.cos(b) * r * 1.32, y + Math.sin(b) * r * 1.32);
    ctx.lineTo(x + Math.cos(a + 0.38) * r * 0.9, y + Math.sin(a + 0.38) * r * 0.9);
  }
  ctx.fill();
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

// Cartoon face: eyes look where the ball is rolling, squeeze shut on a hit, blink now and then.
function face(ctx, e, now) {
  const { x, y, r } = e, m = Math.hypot(e.vx, e.vy) || 1, lx = e.vx / m, ly = e.vy / m;
  const cx = x + lx * r * 0.2, cy = y - r * 0.06 + ly * r * 0.16;
  const ouch = (fx.flash[e.id] ?? 0) > now, blink = !ouch && (((now * 0.31 + e.id * 0.37) % 1) + 1) % 1 < 0.035;
  ctx.strokeStyle = INK;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 0.3, ey = cy;
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    if (ouch) { ctx.moveTo(ex + s * r * 0.12, ey - r * 0.12); ctx.lineTo(ex - s * r * 0.06, ey); ctx.lineTo(ex + s * r * 0.12, ey + r * 0.12); }
    else if (blink) { ctx.moveTo(ex - r * 0.15, ey); ctx.lineTo(ex + r * 0.15, ey); }
    else {
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = r * 0.06;
      ctx.ellipse(ex, ey, r * 0.17, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(ex + lx * r * 0.06, ey + ly * r * 0.08, r * 0.095, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
    }
    ctx.moveTo(ex + s * r * 0.19, ey - r * 0.34); // determined brow
    ctx.lineTo(ex - s * r * 0.12, ey - r * 0.25);
    ctx.stroke();
  }
}

// HP bar over the ball in the team colour, number on it; flips below when the ball hugs the top wall.
function hpBar(ctx, e) {
  const { x, y, r } = e, bw = Math.max(40, r * 1.9), bh = 14, bx = x - bw / 2;
  const by = y - r - 20 < -M + 2 ? y + r + 6 : y - r - 20;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.roundRect(bx - 2.5, by - 2.5, bw + 5, bh + 5, 7); ctx.fill();
  ctx.fillStyle = SIDE[e.side];
  ctx.beginPath(); ctx.roundRect(bx, by, Math.max(0, bw * Math.min(1, e.hp / e.maxHp)), bh, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(bx + 3, by + 2, Math.max(0, bw * Math.min(1, e.hp / e.maxHp) - 6), 3);
  ctx.font = `900 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.strokeText(Math.ceil(e.hp), x, by + bh / 2 + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(Math.ceil(e.hp), x, by + bh / 2 + 1);
}

export function drawBall(ctx, e, now, t, { rim = true } = {}) {
  const sk = e.skin && SKINS[e.skin], { x, y, r } = e, color = sk ? sk.color : BALLS[e.kind].color;
  ctx.fillStyle = 'rgba(70,35,0,0.25)'; // shadow on the floor
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r * 0.95, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  if (rim) { // team ring on the floor, like Brawl Stars
    ctx.strokeStyle = SIDE[e.side];
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 1.1, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (e.kind === 'spider') legs(ctx, e, t);
  if (e.kind === 'hedgehog') spikes(ctx, e);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (sk) pattern(ctx, e, sk, t);
  deco(ctx, e, t);
  face(ctx, e, now);
  if (e.chillUntil > t) { // frost: light chill, or solid ice when frozen
    ctx.fillStyle = e.chillSlow < 0.2 ? 'rgba(200,240,255,0.6)' : 'rgba(150,220,255,0.3)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  if (e.shieldUntil > t) { // shell bubble
    ctx.strokeStyle = `rgba(120,230,100,${0.65 + 0.25 * Math.sin(now * 12)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * 1.22, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(190,255,170,0.18)';
    ctx.fill();
  }
  if ((fx.flash[e.id] ?? 0) > now) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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

// ---------- frame ----------

export function draw(ctx, w, s, { aim = null, now, dt }) {
  absorb(w, now);
  ctx.setTransform(s, 0, 0, s, M * s, M * s);
  if (fx.shake > 0.2) ctx.translate(rnd(-1, 1) * fx.shake, rnd(-1, 1) * fx.shake);
  fx.shake = Math.max(0, fx.shake - dt * 40);
  arena(ctx, w, now);
  for (const z of w.zones) {
    if (z.kind === 'web') web(ctx, z, w.t);
    else if (z.kind === 'train') train(ctx, z, w.t);
    else if (z.kind === 'bomb') bombZone(ctx, z, w.t, now);
    else if (z.kind === 'zap') zapZone(ctx, z, w.t);
  }
  for (const e of w.ents) if (!e.dead) trail(ctx, e, w.t);
  for (const e of w.ents) if (!e.dead) drawBall(ctx, e, now, w.t);
  for (const e of w.ents) if (!e.dead) hpBar(ctx, e); // bars last, so a ball never covers another's bar
  for (const s of [0, 1]) { // golden halo: this side's super is ready
    const lead = w.sides[s].meter >= METER.full && w.ents.find(e => e.side === s && !e.dead);
    if (!lead) continue;
    ctx.strokeStyle = `rgba(255,170,0,${0.65 + 0.35 * Math.sin(now * 10)})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(lead.x, lead.y, lead.r + 6 + 2 * Math.sin(now * 10), 0, Math.PI * 2); ctx.stroke();
  }
  for (const sh of w.shots) sh.kind === 'needle' ? needle(ctx, sh) : shuriken(ctx, sh, w.t);
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
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  fx.parts = fx.parts.filter(p => p.age < p.life);

  ctx.font = `900 19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  for (const f of fx.floats) {
    f.age += dt;
    const k = f.age / 0.8;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.strokeStyle = INK;
    ctx.strokeText(f.text, f.x, f.y - k * 30);
    ctx.fillStyle = f.side === 0 ? '#ff6b81' : '#ffd23f';
    ctx.fillText(f.text, f.x, f.y - k * 30);
  }
  ctx.globalAlpha = 1;
  fx.floats = fx.floats.filter(f => f.age < 0.8);
}

// Static card icon: the same ball art without HP or team rim.
export function drawIcon(canvas, kind, css = 56, skin = null) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(css * dpr);
  canvas.style.width = canvas.style.height = css + 'px';
  const c = canvas.getContext('2d');
  const k = canvas.width / 64;
  c.setTransform(k, 0, 0, k, 0, 0);
  const r = kind === 'hedgehog' ? 18 : 21; // leave room for spikes
  drawBall(c, { id: -1, side: 0, kind, skin, x: 32, y: 34, r, vx: 1, vy: -1, hp: 0, chillUntil: 0, shieldUntil: 0 }, 0, 0, { rim: false });
}
