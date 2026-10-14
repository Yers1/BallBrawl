// 3D balls: every ball is a three.js model from balls3d.js. A model is rendered once per pose (8 directions it can look,
// a few frames of its animation) into a small picture that is kept, so a fight only copies pictures, which is cheap.
// Shadows, rims, effects and HP stay 2D. On for everyone; Settings can switch it off (and ?3d=0 / ?3d do the same from
// a link). No WebGL: the game simply stays 2D.
const KEY = 'ballbrawl.3d', SIZE = 384, SPRITE = 192, SKIN = 128, MAX = 360, DIRS = 8;
export const FRAME = 1.75; // a picture shows ±1.75 ball radii: room for legs, spikes, crowns and horns
let on = (() => {
  try {
    const q = new URLSearchParams(location.search).get('3d');
    if (q != null) localStorage.setItem(KEY, q === '0' ? '0' : '1');
    return localStorage.getItem(KEY) !== '0';
  } catch { return true; }
})();
let gl = null, loading = false;
export const is3d = () => on && !!gl;
export const get3d = () => on;
export function set3d(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* the choice just lasts this visit */ }
  if (on && gl) dispatchEvent(new Event('ball3d'));
}

function load() {
  loading = true; // a failure (no WebGL) leaves it set: the game simply stays 2D
  Promise.all([import('./vendor/three.module.min.js'), import('./balls3d.js')]).then(([THREE, K]) => {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(SIZE, SIZE, false); r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap; // the arena walls cast shadows
    const kit = K.createKit(THREE), scene = new THREE.Scene();
    kit.stage(scene, r);
    const cam = new THREE.OrthographicCamera(-FRAME, FRAME, FRAME, -FRAME, 0.1, 20);
    cam.position.set(0, 0, 8); cam.lookAt(0, 0, 0);
    gl = { r, kit, scene, cam, canvas, models: {}, shown: null };
    dispatchEvent(new Event('ball3d')); // menus redraw their ball icons
  }).catch(() => {});
}
const ready = () => { if (!on) return false; if (!gl && !loading) load(); return !!gl; };
function show(m) { if (gl.shown !== m) { if (gl.shown) gl.shown.visible = false; m.visible = true; gl.shown = m; } }

// The kept pictures, least recently used dropped first. `pose()` sets the model up; the picture is a copy of the render.
const sprites = new Map();
function sprite(key, px, pose) {
  let c = sprites.get(key);
  if (c) { sprites.delete(key); sprites.set(key, c); return c; }
  pose();
  gl.r.render(gl.scene, gl.cam);
  c = document.createElement('canvas'); c.width = c.height = px;
  c.getContext('2d').drawImage(gl.canvas, 0, 0, px, px);
  sprites.set(key, c);
  if (sprites.size > MAX) sprites.delete(sprites.keys().next().value);
  return c;
}
function model(key, make) {
  let m = gl.models[key];
  if (!m) { m = gl.models[key] = make(); m.visible = false; gl.scene.add(m); }
  return m;
}

// Ball e turned toward `face` (radians, screen space; null = the 3/4 showroom pose, for menu icons) as a picture,
// or null while the models load or when 3D is off: then the caller draws the ball in 2D.
// A skin comes as `paint(ctx, size, t)`, which draws it flat on a disc; `live` skins move, so they get 8 frames a second.
export function ball3d(e, face, t, skin = null, paint = null, live = false) {
  if (!ready()) return null;
  const base = e.boss ? 'boss:' + e.boss : skin ? e.kind + ':' + skin : e.kind;
  const m = model(base, () => {
    const g = e.boss ? gl.kit.boss(e.boss) : gl.kit.ball(e.kind);
    g.scale.setScalar(1); // a boss is already big in the arena
    if (skin && !e.boss) { const c = document.createElement('canvas'); c.width = c.height = SKIN; paint(c.getContext('2d'), SKIN, 0); g.userData.skin = { c, tex: gl.kit.skin(g, c) }; }
    return g;
  });
  const icon = face == null, dir = icon ? 'i' : ((Math.round(face / (Math.PI * 2 / DIRS)) % DIRS) + DIRS) % DIRS;
  const A = m.userData.anim, now = t ?? 0, frame = A ? Math.floor((((now % A.period) + A.period) % A.period) / A.period * A.frames) : 0;
  const sk = live && m.userData.skin ? Math.floor(now * 8) % 8 : 0, state = m.userData.state?.(now, e) ?? '';
  return sprite(`${base}|${dir}|${frame}|${sk}|${state}`, icon ? SIZE : SPRITE, () => {
    show(m);
    if (icon) m.rotation.set(0.12, -0.32, 0);
    else { const f = dir * Math.PI * 2 / DIRS; m.rotation.set(0.1 + 0.35 * Math.sin(f), 0.55 * Math.cos(f), 0); } // it looks at its foe
    m.userData.tick?.(A ? frame / A.frames * A.period : now, e);
    if (live && m.userData.skin) { const s = m.userData.skin; paint(s.c.getContext('2d'), SKIN, sk / 8); s.tex.needsUpdate = true; }
  });
}

// Builds a ball's pictures ahead of time (all 8 directions, every frame of its animation), a few each frame,
// so a fight never stops to make one.
const todo = [];
function pump() {
  const end = performance.now() + 5;
  while (todo.length && performance.now() < end) todo.shift()();
  if (todo.length) requestAnimationFrame(pump);
}
export function warm3d(e, skin = null, paint = null, live = false) {
  if (!ready()) return;
  const idle = !todo.length, key = e.boss ? 'boss:' + e.boss : skin ? e.kind + ':' + skin : e.kind;
  for (let d = 0; d < DIRS; d++) todo.push(() => {
    const face = d * Math.PI * 2 / DIRS;
    ball3d(e, face, 0, skin, paint, live); // builds the model on the first go
    const A = gl.models[key]?.userData.anim;
    for (let f = 1; A && f < A.frames; f++) ball3d(e, face, (f + 0.5) / A.frames * A.period, skin, paint, live);
  });
  if (idle) requestAnimationFrame(pump);
}

// A chest in 3D (a steel safe, the style the user picked) as an image URL for HTML: the whole chest, or its body or lid alone for the
// opening, where the lid flies off. null until the models are in: then the 2D drawing is used.
const urls = {}, CHEST_STYLE = new URLSearchParams(location.search).get('chest') ?? 'safe'; // the user's pick; ?chest=classic|matte|toon|crate|crate-toon previews another style
export function chestUrl(kind, part = 'whole') {
  const key = kind + ':' + part;
  if (urls[key]) return urls[key];
  if (!ready()) return null;
  const m = model('chest:' + kind, () => gl.kit.chest(kind, CHEST_STYLE));
  const c = sprite('chest:' + key, SIZE, () => {
    show(m);
    m.rotation.set(0.42, -0.5, 0);
    for (const ch of m.children) ch.visible = part === 'whole' || (part === 'lid') === (ch === m.userData.lid);
  });
  for (const ch of m.children) ch.visible = true;
  return (urls[key] = c.toDataURL('image/png'));
}

// A commander in 3D as a picture with the drawings' 140:160 shape: the whole figure, or its body and its head apart (the
// head nods on its own on top of the body). null until the models are in: then the drawing is used.
export function heroUrl(id, part = 'whole') {
  const key = `hero:${id}:${part}`;
  if (urls[key]) return urls[key];
  if (!ready()) return null;
  const m = model('hero:' + id, () => { const g = gl.kit.hero(id); g.scale.setScalar(0.8); g.position.y = -0.5; g.rotation.y = -0.3; return g; });
  const head = m.userData.head;
  const c = sprite(key, SIZE, () => { show(m); for (const ch of m.children) ch.visible = part === 'whole' || (part === 'head') === (ch === head); });
  for (const ch of m.children) ch.visible = true;
  const out = document.createElement('canvas'); out.width = SIZE * 0.875; out.height = SIZE;
  out.getContext('2d').drawImage(c, -SIZE * 0.0625, 0);
  return (urls[key] = out.toDataURL('image/png'));
}

// An obstacle seen from above (rocks, crystals, mushrooms, spike traps, saws, lollipops, barrels, idols, the stadium's
// match ball) as a picture; the caller turns it for the ones that spin.
export function prop3d(kind, v) {
  if (!ready()) return null;
  const m = model('prop:' + kind + ':' + v, () => gl.kit.prop(kind, v));
  return sprite(`prop:${kind}:${v}`, SPRITE, () => { show(m); m.rotation.set(0, 0, 0); });
}

// The arena's walls in 3D (a bevelled frame and the shadow it throws on the floor), rendered once per arena into its
// own canvas covering -M..W+M. The floor's pattern and the wall decorations stay 2D on top, so they keep moving.
// Small ones (Glory Road pictures) are kept for every arena; full-size ones only for the last two arenas fought in.
const layers = new Map();
let fence = new URLSearchParams(location.search).get('walls') ?? 'arena'; // each arena's own fence (?walls=plain|cushion|stone|posts|bumper previews a shared one)
export function setFence(style) { fence = style; layers.clear(); }
export const fenceStyle = () => fence;
export function arena3d(id, color, W, H, M, px = 1296, accent = null) {
  if (!ready()) return null;
  const key = id + ':' + px + ':' + fence;
  if (layers.has(key)) return layers.get(key);
  const big = [...layers.keys()].filter(k => !k.endsWith(':256'));
  if (px > 256 && big.length >= 2) layers.delete(big[0]);
  const { scene, camera } = gl.kit.walls({ W, H, M, color, accent, style: fence, id });
  gl.r.setSize(px, px, false); gl.r.render(scene, camera);
  const c = document.createElement('canvas'); c.width = c.height = px; c.getContext('2d').drawImage(gl.canvas, 0, 0);
  gl.r.setSize(SIZE, SIZE, false);
  layers.set(key, c);
  return c;
}
