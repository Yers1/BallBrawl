// Canvas drawing for the arena + juice (sparks, damage numbers, hit flashes, shake).
// Visual-only randomness uses Math.random — the simulation itself stays deterministic.
import { W, H, SUDDEN, METER } from './sim.js';
import { BALLS, TRAIN, LEECH, POISON, trackPoint } from './balls.js';
import { SKINS } from './progress.js';

export const SIDE = ['#4CC9F0', '#FF4D5E']; // you · opponent
const SIDE_RGB = ['76,201,240', '255,77,94'];
const FONT = 'Nunito, system-ui, sans-serif';
const INK = '#0A0F1C'; // outline for numbers and small shapes
export const M = 16; // wall thickness drawn around the 400×400 field (arena units)
const fx = { parts: [], floats: [], rings: [], flash: {}, shake: 0, face: {}, drain: {}, frozen: {} };
const rnd = (a, b) => a + Math.random() * (b - a);

const shade = (hex, k) => { // k > 0 lightens toward white, k < 0 darkens
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c})`;
};

export function resetFx() {
  fx.parts.length = fx.floats.length = fx.rings.length = 0;
  fx.flash = {}; fx.face = {}; fx.drain = {}; fx.frozen = {};
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
  fx.floats.push({ x, y, text, color, size, life, rise, tilt, age: 0 });
  if (fx.floats.length > 40) fx.floats.shift();
}

const ring = (x, y, r, grow, life, rgb, width) => fx.rings.push({ x, y, r, grow, life, rgb, width, age: 0 });

function absorb(w, now) {
  for (const ev of w.events) {
    if (ev.type === 'hit') { // the number sits on the rim facing the attacker; ticks are smaller and don't flash
      if (ev.amount >= 3) fx.flash[ev.id] = now + 0.1;
      if (ev.amount >= 1) {
        const a = fx.face[ev.id] ?? -Math.PI / 2;
        float(ev.x + Math.cos(a) * 30 + rnd(-6, 6), ev.y + Math.sin(a) * 30 - 8, '-' + Math.round(ev.amount), '#FF3B3B', ev.amount >= 3 ? 26 : 20);
      }
      burst(ev.x, ev.y, 5, '#ffffff', 120, [2, 3]);
    } else if (ev.type === 'text') {
      float(ev.x, ev.y, ev.text, '#FFCC33', 18, 2, 10, 0);
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

// The arena is a sunken box seen from above, like the original: navy floor, four bevelled walls lit from the top.
const FACES = [ // colour, then the corners of each wall face
  ['#2E4C77', [-M, -M], [W + M, -M], [W, 0], [0, 0]],
  ['#1B3254', [-M, -M], [0, 0], [0, H], [-M, H + M]],
  ['#14284A', [W + M, -M], [W + M, H + M], [W, H], [W, 0]],
  ['#10213D', [-M, H + M], [0, H], [W, H], [W + M, H + M]],
];
function arena(ctx, w, now) {
  const sudden = w.launched && w.t > SUDDEN;
  ctx.fillStyle = '#0F1F38';
  ctx.fillRect(-M - 20, -M - 20, W + 2 * M + 40, H + 2 * M + 40); // oversized: camera shake never shows an edge
  for (const [color, ...pts] of FACES) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.fillStyle = color;
    ctx.fill();
    if (sudden) { // walls glow red in sudden death
      ctx.fillStyle = `rgba(255,60,80,${0.3 + 0.3 * Math.sin(now * 9)})`;
      ctx.fill();
    }
  }
  ctx.fillStyle = '#203A5E';
  ctx.fillRect(0, 0, W, H);
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

// Rails the train has laid: sleepers and two glowing steel rails, fading as they age; the freshest stretch is still setting.
function track(ctx, z, t) {
  if (z.old && z.old.length > 1) { // sleepers from expired rails stay on the floor for the round: flat, harmless, a record of the run
    ctx.strokeStyle = '#B5702F';
    ctx.lineWidth = 4;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let i = 1; i < z.old.length; i += 2) {
      const a = z.old[i - 1], b = z.old[i], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * 12, ny = (dx / l) * 12;
      ctx.moveTo(b.x + nx, b.y + ny); ctx.lineTo(b.x - nx, b.y - ny);
    }
    ctx.stroke();
  }
  const pts = z.pts;
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const alpha = Math.min(1, (TRAIN.life - (t - b.t)) / 0.8) * (b.t > t - TRAIN.warm ? 0.35 : 1);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * 7, ny = (dx / l) * 7;
    ctx.strokeStyle = '#5A3A1E';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(b.x + nx * 1.7, b.y + ny * 1.7); ctx.lineTo(b.x - nx * 1.7, b.y - ny * 1.7); ctx.stroke();
    ctx.strokeStyle = '#FFB347';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(b.x + nx, b.y + ny);
    ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(b.x - nx, b.y - ny);
    ctx.stroke();
  }
  ctx.restore();
}

// The express: a locomotive with two wagons racing along the super's route, sparks flying off its wheels.
function express(ctx, x, t) {
  const k = ((t - x.go) * TRAIN.express) / x.len, d = 40 / x.len;
  const car = (p, w, h, color, loco) => {
    const q = trackPoint(x.pts, p);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.a);
    ctx.fillStyle = 'rgba(8,16,32,0.45)';
    ctx.beginPath(); ctx.roundRect(-w / 2 + 3, -h / 2 + 6, w, h, 6); ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, loco ? [6, 13, 13, 6] : 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFE08A';
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 12 - 4, -h / 2 + 5, 8, 8);
    if (loco) {
      ctx.fillStyle = '#2A2A38';
      ctx.fillRect(w / 2 - 18, -h / 2 - 7, 9, 9);
      ctx.fillStyle = '#FFF6C2';
      ctx.shadowColor = '#FFE08A';
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(w / 2 + 1, 0, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return q;
  };
  car(k - 2 * d, 34, 22, '#B8702A', false);
  car(k - d, 34, 22, '#B8702A', false);
  const q = car(k, 46, 26, '#E09A2B', true);
  if (Math.random() < 0.8) fx.parts.push({ x: q.x, y: q.y + 8, vx: rnd(-90, 90), vy: rnd(10, 90), life: 0.3, age: 0, color: '#FFB347', size: rnd(2, 4) });
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

// A chain ring: translucent crimson disc, bright glowing links alternating with dark ones; grows out of the ball, fades to a ghost.
function ringZone(ctx, z, t) {
  const grow = Math.min(1, (t - z.born) / 0.25), fade = Math.min(1, (z.until - t) / 0.8), r = z.r * (0.3 + 0.7 * grow);
  const n = 12, seg = (Math.PI * 2) / n, spin = t * 0.6;
  const links = (from, to) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const a0 = spin + i * seg + from * seg; ctx.moveTo(z.x + Math.cos(a0) * r, z.y + Math.sin(a0) * r); ctx.arc(z.x, z.y, r, a0, spin + i * seg + to * seg); } ctx.stroke(); };
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.fillStyle = 'rgba(200,30,60,0.18)';
  ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = 'butt';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#7A0F22';
  links(0.5, 1);
  ctx.strokeStyle = '#FF9EB0';
  ctx.shadowColor = '#FF2D55';
  ctx.shadowBlur = 12;
  links(0, 0.5);
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
  } else if (e.kind === 'train') { // boiler bands, lit windows, a chimney, and a cowcatcher facing the way it rolls
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, P * 2); ctx.clip();
    ctx.fillStyle = 'rgba(80,50,20,0.4)';
    ctx.fillRect(x - r, y + r * 0.42, r * 2, r * 0.12);
    ctx.fillRect(x - r, y + r * 0.66, r * 2, r * 0.12);
    ctx.fillStyle = '#FFE08A';
    for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * r * 0.5 - r * 0.14, y - r * 0.2, r * 0.28, r * 0.28);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.fillStyle = '#4A3418';
    ctx.beginPath(); ctx.roundRect(x - r * 0.2, y - r * 1.25, r * 0.4, r * 0.45, r * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2A2A38';
    ctx.beginPath(); ctx.roundRect(x - r * 0.26, y - r * 1.3, r * 0.52, r * 0.14, r * 0.05); ctx.fill();
    const cx = x + C(head) * r * 0.95, cy = y + S(head) * r * 0.95;
    ctx.fillStyle = '#C9302C';
    ctx.beginPath();
    ctx.moveTo(cx + C(head + 2.2) * r * 0.5, cy + S(head + 2.2) * r * 0.5);
    ctx.lineTo(cx + C(head) * r * 0.35, cy + S(head) * r * 0.35);
    ctx.lineTo(cx + C(head - 2.2) * r * 0.5, cy + S(head - 2.2) * r * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFF6C2';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, P * 2); ctx.fill();
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
  } else if (e.kind === 'chain') { // a neon chain slashed across the ball
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 0.98, 0, P * 2); ctx.clip();
    ctx.lineCap = 'butt';
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = '#7A0F22';
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.9); ctx.lineTo(x + r, y + r * 0.9); ctx.moveTo(x - r, y + r * 0.9); ctx.lineTo(x + r, y - r * 0.9); ctx.stroke();
    ctx.setLineDash([r * 0.22, r * 0.18]);
    ctx.strokeStyle = '#FFB3C6';
    ctx.shadowColor = '#FF2D55';
    ctx.shadowBlur = r * 0.3;
    ctx.stroke();
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
  ctx.fillStyle = frozen ? 'rgba(200,240,255,0.5)' : 'rgba(150,220,255,0.3)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (!frozen) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + t * 2, d = r * (0.5 + 0.35 * Math.sin(t * 3 + i));
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.05, 0, Math.PI * 2); ctx.fill();
    }
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
export function drawBall(ctx, e, now, t, { rim = true } = {}) {
  const sk = e.skin && SKINS[e.skin], { x, y, r } = e, bubble = e.kind === 'cell' && e.mini && e.hp <= 2;
  const color = bubble ? '#7FD9D1' : sk ? sk.color : BALLS[e.kind].color;
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
function drain(ctx, e, t, dt) {
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
    float(f.x + rnd(-6, 6), f.y - f.r - 8, '-' + n, '#FF3B3B', 20);
    float(e.x + rnd(-6, 6), e.y - e.r - 8, '+' + n, '#36D27A', 20);
  }
}

// Chimney smoke while the train rolls.
function puff(e) {
  const m = Math.hypot(e.vx, e.vy) || 1, ux = e.vx / m;
  fx.parts.push({ x: e.x - ux * e.r * 0.2 + rnd(-3, 3), y: e.y - e.r * 1.2, vx: -ux * 40 + rnd(-15, 15), vy: -30 + rnd(-10, 0), life: rnd(0.6, 1), age: 0, color: 'rgba(235,240,250,0.75)', size: rnd(3, 5), round: true, grow: 2.2, drag: 1.5 });
}

// ---------- frame ----------

export function draw(ctx, w, s, { aim = null, foeAim = null, now, dt }) {
  absorb(w, now);
  ctx.setTransform(s, 0, 0, s, M * s, M * s);
  if (fx.shake > 0.2) ctx.translate(rnd(-1, 1) * fx.shake, rnd(-1, 1) * fx.shake);
  fx.shake = Math.max(0, fx.shake - dt * 40);
  arena(ctx, w, now);
  for (const z of w.zones) {
    if (z.kind === 'web') web(ctx, z, w.t);
    else if (z.kind === 'spike') spike(ctx, z);
    else if (z.kind === 'ring') ringZone(ctx, z, w.t);
    else if (z.kind === 'track') track(ctx, z, w.t);
    else if (z.kind === 'bomb') bombZone(ctx, z, w.t, now);
    else if (z.kind === 'zap') zapZone(ctx, z, w.t);
  }
  faces(w);
  for (const e of w.ents) if (!e.dead && e.latch) drain(ctx, e, w.t, dt);
  for (const e of w.ents) if (!e.dead) trail(ctx, e, w.t);
  for (const e of w.ents) if (!e.dead) drawBall(ctx, e, now, w.t);
  for (const e of w.ents) if (!e.dead) hpText(ctx, e); // numbers last, so a ball never covers another's HP
  for (const z of w.zones) if (z.kind === 'track' && z.express) express(ctx, z.express, w.t);
  for (const e of w.ents) {
    if (!e.dead && e.kind === 'train' && (e.vx || e.vy) && Math.random() < 0.3) puff(e);
    const frozen = !e.dead && e.chillUntil > w.t && e.chillSlow <= 0.1; // thawing out: the ice block shatters
    if (fx.frozen[e.id] && !frozen) { burst(e.x, e.y, 18, '#DDF6FF', 220); ring(e.x, e.y, e.r, 1.8, 0.35, '200,240,255', 4); }
    fx.frozen[e.id] = frozen;
  }
  for (const s of [0, 1]) { // golden halo: this side's super is ready
    const lead = w.sides[s].meter >= METER.full && w.ents.find(e => e.side === s && !e.dead);
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
  if (aim != null) aimArrow(ctx, w.ents[0], aim, now);
  if (foeAim != null && w.ents[1]) aimArrow(ctx, w.ents[1], foeAim, now); // the opponent's shot is no secret, like the original

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
    const k = f.age / f.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.translate(f.x, f.y - k * f.rise);
    ctx.rotate(f.tilt);
    ctx.font = `italic 900 ${f.size}px ${FONT}`;
    ctx.lineWidth = f.size * 0.26;
    ctx.strokeStyle = INK;
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  fx.floats = fx.floats.filter(f => f.age < f.life);
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
  drawBall(c, { id: -1, side: 0, kind, skin, x: 32, y: 34, r, vx: 1, vy: -1, hp: 0, cd: {}, latch: null, chillUntil: 0, shieldUntil: 0, poisonUntil: 0 }, 0, 0, { rim: false });
}
