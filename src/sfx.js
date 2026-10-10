// Confetti burst for big moments (DOM pieces, removed after the animation).
export function confetti(n = 36) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ffcc33', '#4cc9f0', '#ff4d6d', '#6ff0b4', '#b892ff', '#ff9a3c'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    p.style.cssText = `left:${50 + (Math.random() - 0.5) * 30}%;background:${colors[i % colors.length]};` +
      `--dx:${(Math.random() - 0.5) * 520}px;--dy:${-220 - Math.random() * 260}px;--r:${Math.random() * 720 - 360}deg;` +
      `animation-delay:${Math.random() * 0.12}s;width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px`;
    document.body.append(p);
    setTimeout(() => p.remove(), 1700);
  }
}

// Tiny WebAudio synth — no audio files. The context starts on the first user gesture (browser rule).
let ac = null, master = null, muted = false, horn = null; // horn: a recorded diesel horn for the train
let musicBus = null, musicOn = true; // music has its own volume and switch

export function initAudio(isMuted) {
  muted = isMuted;
  const start = () => {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = musicOn ? 0.32 : 0;
    musicBus.connect(master);
    fetch('sfx/train-horn.mp3').then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { horn = buf; }).catch(() => {});
  };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, start, { once: true, capture: true });
}

// The announcer: says a word out loud in the game's language, deep and slow (the browser's own voices; none = silent).
const VOICE = { ru: 'ru', en: 'en', es: 'es', pt: 'pt', tr: 'tr', id: 'id', uz: 'uz' };
export function say(text, lang) {
  if (muted || typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices(), code = VOICE[lang] ?? 'en';
  const mine = voices.filter(v => v.lang.toLowerCase().startsWith(code));
  const voice = mine.find(v => /pavel|dmitri|yuri|david|mark|daniel|guy|male|google/i.test(v.name)) ?? mine[0];
  if (!voice) return; // no voice for this language on this device: the hit and the words on screen still play
  const u = new SpeechSynthesisUtterance(text);
  Object.assign(u, { voice, lang: voice.lang, rate: 0.9, pitch: 0.5, volume: 1 });
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices(); // some browsers load the voices lazily
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 1, delay = 0, out = null } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out ?? master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.25, freq = 1200, q = 1, delay = 0, sweep = 1, out = null, type = 'bandpass' } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, n = Math.ceil(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out ?? master);
  src.start(t);
}

// ---------- sound effects: every hit, wall and super sounds a little different ----------
const J = (k = 0.12) => 1 + (Math.random() * 2 - 1) * k; // a little random pitch, so repeats never sound copy-pasted
const KIND_TONE = { magnet: 'metal', chain: 'metal', train: 'metal', forge: 'metal', turtle: 'metal', cell: 'soft', leech: 'soft', spider: 'soft', poison: 'soft',
  hedgehog: 'sharp', ninja: 'sharp', chess: 'wood', ice: 'glass', lightning: 'zap' };
const WALL = { // each arena's walls answer in their own material
  frost: () => tone(1700 * J(), 0.12, { type: 'sine', vol: 0.05 }),
  candy: () => tone(300 * J(), 0.12, { type: 'sine', vol: 0.07, slide: 2.4 }),
  pirate: () => { tone(260 * J(), 0.06, { type: 'triangle', vol: 0.08 }); noise(0.03, { vol: 0.06, freq: 800 }); },
  stadium: () => noise(0.05, { vol: 0.1, freq: 300 * J(), q: 0.6 }),
  neon: () => tone(880 * J(), 0.06, { type: 'square', vol: 0.035, slide: 1.6 }),
  space: () => tone(660 * J(), 0.08, { type: 'sine', vol: 0.05, slide: 0.6 }),
  chess: () => noise(0.04, { vol: 0.1, freq: 1400 * J(), q: 5 }),
  temple: () => noise(0.06, { vol: 0.09, freq: 700 * J(), q: 2 }),
  lava: () => noise(0.07, { vol: 0.08, freq: 400 * J(), q: 1 }),
};
const SUPER_FX = { // on top of the shared fanfare: what this ball's super sounds like
  basic: () => noise(0.4, { vol: 0.25, freq: 300, sweep: 8, q: 2 }),
  leech: () => { tone(500, 0.25, { type: 'sine', vol: 0.12, slide: 0.3 }); tone(200, 0.2, { type: 'sine', vol: 0.1, slide: 2.5, delay: 0.2 }); },
  cell: () => [0, 0.09, 0.18].forEach(d => tone(600 + d * 900, 0.07, { type: 'sine', vol: 0.12, slide: 1.8, delay: d })),
  spider: () => noise(0.35, { vol: 0.18, freq: 1200, sweep: 4, q: 3 }),
  ninja: () => [0, 0.06, 0.12].forEach(d => noise(0.08, { vol: 0.18, freq: 6000, q: 8, delay: d })),
  magnet: () => { for (let i = 0; i < 6; i++) tone(220 + (i % 2) * 60, 0.08, { type: 'square', vol: 0.06, delay: i * 0.06 }); },
  bomb: () => noise(0.5, { vol: 0.12, freq: 5000, q: 2 }),
  turtle: () => { tone(110, 0.6, { type: 'sine', vol: 0.18 }); tone(880, 0.4, { type: 'triangle', vol: 0.05, delay: 0.05 }); },
  lightning: () => { for (let i = 0; i < 5; i++) tone(400 + Math.random() * 1600, 0.05, { type: 'sawtooth', vol: 0.06, delay: i * 0.05 }); noise(0.3, { vol: 0.2, freq: 3000, q: 0.5 }); },
  hedgehog: () => { for (let i = 0; i < 8; i++) noise(0.03, { vol: 0.15, freq: 4000 + i * 300, q: 6, delay: i * 0.025 }); },
  ice: () => [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.06, delay: i * 0.05 })),
  poison: () => { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 400, 0.08, { type: 'sine', vol: 0.08, slide: 1.6, delay: i * 0.07 }); },
  chain: () => { for (let i = 0; i < 7; i++) noise(0.04, { vol: 0.14, freq: 2500 + (i % 3) * 700, q: 5, delay: i * 0.05 }); },
  forge: () => { tone(900, 0.5, { type: 'square', vol: 0.08, slide: 0.98 }); tone(1350, 0.4, { type: 'triangle', vol: 0.06 }); noise(0.08, { vol: 0.2, freq: 3000, q: 2 }); },
  chess: () => [0, 0.1, 0.2].forEach(d => { noise(0.04, { vol: 0.16, freq: 1600, q: 5, delay: d }); tone(196, 0.07, { type: 'square', vol: 0.06, delay: d }); }),
};

export const sfx = {
  hit: (amount, kind) => {
    const v = Math.min(0.3, amount / 60), j = J();
    const k = KIND_TONE[kind];
    if (k === 'metal') { tone(320 * j, 0.12, { type: 'square', vol: 0.08 + v * 0.4, slide: 0.7 }); tone(1250 * j, 0.06, { type: 'triangle', vol: 0.05 }); noise(0.05, { vol: 0.15 + v, freq: 3200 * j, q: 4 }); }
    else if (k === 'soft') { tone(180 * j, 0.12, { type: 'sine', vol: 0.18 + v, slide: 0.5 }); noise(0.08, { vol: 0.12, freq: 500 * j, q: 0.7 }); }
    else if (k === 'sharp') { noise(0.04, { vol: 0.2 + v, freq: 5000 * j, q: 6 }); tone(900 * j, 0.05, { type: 'triangle', vol: 0.06 }); }
    else if (k === 'wood') { noise(0.05, { vol: 0.2, freq: 1600 * j, q: 5 }); tone(220 * j, 0.07, { type: 'square', vol: 0.08 }); }
    else if (k === 'glass') { tone(1800 * j, 0.18, { type: 'sine', vol: 0.08 }); tone(2400 * j, 0.12, { type: 'sine', vol: 0.05 }); noise(0.05, { vol: 0.12, freq: 4000, q: 3 }); }
    else if (k === 'zap') { tone(600 * j, 0.08, { type: 'sawtooth', vol: 0.07, slide: 2.2 }); noise(0.06, { vol: 0.15, freq: 2500, q: 1 }); }
    else { noise(0.08, { vol: 0.2 + v, freq: 900 * j, q: 0.8 }); tone((160 + amount * 4) * j, 0.09, { vol: 0.12, slide: 0.5 }); }
  },
  wall: arena => (WALL[arena] ?? (() => noise(0.04, { vol: 0.05, freq: 2400 * J() })))(),
  dash: () => noise(0.22, { vol: 0.22, freq: 500 * J(), sweep: 5, q: 2 }),
  shot: () => noise(0.05, { vol: 0.06, freq: 4000 * J(), q: 3 }),
  train: (express = false) => { // a diesel horn, then "choo-choo" puffs that speed up while it rolls past, over a low rumble
    if (horn && ac && !muted) {
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = horn;
      src.playbackRate.value = express ? 1.15 : 1; // the express sounds a little higher
      g.gain.value = 0.55;
      src.connect(g).connect(master);
      src.start();
    } else { tone(740, 0.4, { type: 'triangle', vol: 0.09 }); tone(880, 0.4, { type: 'triangle', vol: 0.07, delay: 0.03 }); }
    const n = express ? 14 : 10;
    let at = 0.3;
    for (let i = 0; i < n; i++) {
      noise(0.08, { vol: 0.17 - i * 0.008, freq: i % 2 ? 900 : 550, q: 1.5, delay: at });
      at += Math.max(0.09, 0.2 - i * 0.012);
    }
    tone(65, at + 0.2, { type: 'sawtooth', vol: 0.05, slide: 0.85, delay: 0.25 });
  },
  super: kind => { // power up: a charge sweeping up, a deep drop, the fanfare, then the ball's own sound
    tone(180, 0.35, { type: 'sawtooth', vol: 0.08, slide: 5 }); noise(0.35, { vol: 0.18, freq: 400, sweep: 8, q: 1.5 });
    tone(90, 0.5, { type: 'sine', vol: 0.4, slide: 0.5, delay: 0.3 }); noise(0.6, { vol: 0.12, freq: 6000, q: 0.5, delay: 0.3, type: 'highpass' });
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: 0.3 + i * 0.045 }));
    setTimeout(() => SUPER_FX[kind]?.(), 300);
  },
  skill: kind => SUPER_FX[kind]?.(),
  ko: () => { tone(110, 0.6, { type: 'sine', vol: 0.45, slide: 0.4 }); noise(0.8, { vol: 0.25, freq: 900, sweep: 0.2, q: 0.8 }); tone(880, 0.3, { type: 'square', vol: 0.05, slide: 0.5, delay: 0.05 }); }, // a deep boom for a knock-out // just the ball's own sound, for a boss attack
  death: () => { const j = J(0.2); noise(0.45, { vol: 0.4, freq: 200 * j, sweep: 0.3 }); tone(90 * j, 0.4, { type: 'sine', vol: 0.3, slide: 0.4 }); tone(700 * j, 0.06, { type: 'triangle', vol: 0.08 }); },
  win: () => { // a little brass fanfare: ta-ta-ta-TAAA over a drum roll, then a cymbal and a big major chord
    for (let i = 0; i < 8; i++) noise(0.06, { vol: 0.12 + i * 0.02, freq: 1800, q: 0.8, delay: i * 0.05 });
    [[523, 0.4, 0.12], [523, 0.52, 0.12], [523, 0.64, 0.12], [698, 0.78, 0.5]].forEach(([f, d, l]) => { tone(f, l, { type: 'sawtooth', vol: 0.09, delay: d }); tone(f * 2, l, { type: 'square', vol: 0.04, delay: d }); });
    [523, 659, 784, 1047].forEach(f => tone(f, 1.1, { type: 'triangle', vol: 0.1, delay: 1.3 }));
    tone(131, 0.5, { type: 'sine', vol: 0.4, slide: 0.5, delay: 1.3 });
    noise(1.2, { vol: 0.2, freq: 7000, q: 0.4, delay: 1.3, type: 'highpass' });
  },
  lose: () => { // the sad trombone: wah, wah, wah, waaah
    [[311, 0, 0.3], [294, 0.36, 0.3], [277, 0.72, 0.3]].forEach(([f, d, l]) => { tone(f, l, { type: 'sawtooth', vol: 0.1, slide: 0.97, delay: d }); tone(f / 2, l, { type: 'triangle', vol: 0.08, delay: d }); });
    for (let k = 0; k < 6; k++) tone(262 - k * 3, 0.2, { type: 'sawtooth', vol: 0.1 - k * 0.012, slide: k % 2 ? 1.04 : 0.96, delay: 1.08 + k * 0.17 }); // the long one wobbles down
    tone(131, 1, { type: 'triangle', vol: 0.08, slide: 0.9, delay: 1.08 });
  },
  click: () => tone(700 * J(0.06), 0.05, { type: 'sine', vol: 0.08 }),
  round: () => { tone(880, 0.12, { type: 'square', vol: 0.06 }); tone(1320, 0.18, { type: 'square', vol: 0.06, delay: 0.1 }); },
  count: (last = false) => tone(last ? 1320 : 880, last ? 0.3 : 0.12, { type: 'square', vol: 0.07 }),
  vs: () => { // face to face: a whoosh as the banners fly in, then a drum hit, a cymbal crash and a brass chord as the shield lands
    noise(0.45, { vol: 0.25, freq: 250, sweep: 8, q: 1.5 });
    tone(130, 0.35, { type: 'sine', vol: 0.35, slide: 0.35, delay: 0.32 });
    noise(0.9, { vol: 0.18, freq: 6000, q: 0.4, delay: 0.32, type: 'highpass' });
    [196, 247, 294, 392].forEach(f => tone(f, 0.6, { type: 'sawtooth', vol: 0.04, delay: 0.34 }));
    tone(98, 0.5, { type: 'square', vol: 0.08, delay: 0.34 });
  },
  chess: () => { // a heavy wooden piece set down on the board: click, knock, and a soft felt thump
    noise(0.025, { vol: 0.3, freq: 3200 * J(0.1), q: 6 });
    tone(520 * J(0.08), 0.07, { type: 'sine', vol: 0.18, slide: 0.8 });
    tone(150, 0.12, { type: 'sine', vol: 0.22, slide: 0.7, delay: 0.005 });
  },
  chessStep: () => { noise(0.02, { vol: 0.2, freq: 2800 * J(0.15), q: 7 }); tone(440 * J(0.12), 0.05, { type: 'sine', vol: 0.12, slide: 0.85 }); }, // sliding to the next square
  fight: () => { // FIGHT!: a rising whoosh, then a big hit, a cymbal and a brass stab
    noise(0.5, { vol: 0.3, freq: 300, sweep: 10, q: 1.2 });
    tone(70, 0.7, { type: 'sine', vol: 0.55, slide: 0.45, delay: 0.42 });
    noise(0.35, { vol: 0.35, freq: 600, sweep: 0.3, q: 0.6, delay: 0.42 });
    noise(1.2, { vol: 0.2, freq: 7000, q: 0.4, delay: 0.44, type: 'highpass' });
    [220, 277, 330, 440].forEach(f => tone(f, 0.5, { type: 'sawtooth', vol: 0.05, delay: 0.44 }));
  },
  coin: () => { tone(988, 0.07, { type: 'square', vol: 0.08 }); tone(1319, 0.12, { type: 'square', vol: 0.08, delay: 0.07 }); },
};

// ---------- music: little chiptune loops (menus; a tense one in sudden death), scheduled just ahead on the audio clock ----------
const NOTE = n => 440 * 2 ** ((n - 69) / 12);
const m = (f, d, o) => tone(f, d, { ...o, out: musicBus });
const kick = d => m(130, 0.16, { type: 'sine', vol: 0.5, slide: 0.35, delay: d });
const snare = (d, v = 0.12) => noise(0.12, { vol: v, freq: 1800, q: 0.7, delay: d, out: musicBus });
const hat = (d, v = 0.05) => noise(0.03, { vol: v, freq: 8000, q: 1, delay: d, out: musicBus, type: 'highpass' });
const LOBBY_LEAD = [
  [72, 0, 0, 76, 0, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0], [69, 0, 0, 72, 0, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0],
  [65, 0, 0, 69, 0, 0, 72, 0, 77, 0, 76, 0, 74, 0, 0, 0], [67, 0, 71, 0, 74, 0, 0, 79, 0, 77, 0, 74, 71, 0, 0, 0],
];
const SONGS = {
  lobby: { bpm: 104, step(i, d) { // C, Am, F, G: bouncy and friendly
    const bar = Math.floor(i / 16) % 4, s = i % 16, ch = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]][bar];
    if (s === 0 || s === 8) kick(d);
    if (s === 4 || s === 12) snare(d, 0.07);
    if (s % 2 === 0) hat(d, s % 4 === 2 ? 0.04 : 0.025);
    if ([0, 6, 8, 14].includes(s)) m(NOTE(ch[0] - 24), 0.2, { type: 'square', vol: 0.09, delay: d });
    if (s % 2 === 0) m(NOTE(ch[(s / 2) % 3] + 12), 0.12, { type: 'triangle', vol: 0.07, delay: d });
    const n = LOBBY_LEAD[bar][s];
    if (n) m(NOTE(n), 0.24, { type: 'square', vol: 0.05, delay: d });
  } },
  battle: { bpm: 132, step(i, d) { // D minor, Bb, C, A: a driving fight loop with a hook that climbs
    const bar = Math.floor(i / 16) % 4, s = i % 16, root = [38, 34, 36, 33][bar];
    if (s % 4 === 0 || s === 14) kick(d);
    if (s === 4 || s === 12) snare(d, 0.12);
    hat(d, s % 2 ? 0.02 : 0.035);
    if (s % 2 === 0) m(NOTE(root + (s % 8 === 6 ? 7 : 0)), 0.14, { type: 'sawtooth', vol: 0.08, delay: d });
    if (s === 0 || s === 8) [12, 15, 19].forEach(k => m(NOTE(root + 24 + k - (bar === 3 && k === 15 ? -1 : 0)), 0.5, { type: 'triangle', vol: 0.03, delay: d }));
    const lead = [[74, 0, 77, 0, 76, 74, 0, 72], [70, 0, 74, 0, 72, 70, 0, 69], [72, 0, 76, 0, 79, 76, 0, 74], [73, 0, 76, 0, 81, 0, 79, 76]][bar][s >> 1];
    if (s % 2 === 0 && lead) m(NOTE(lead), 0.13, { type: 'square', vol: 0.04, delay: d });
  } },
  boss: { bpm: 112, step(i, d) { // E minor, heavy: low drums, a stomping bass and an alarm-like brass stab
    const bar = Math.floor(i / 16) % 4, s = i % 16, root = [28, 28, 31, 30][bar];
    if (s === 0 || s === 3 || s === 8 || s === 11) kick(d);
    if (s === 4 || s === 12) snare(d, 0.16);
    if (s % 2 === 0) hat(d, 0.03);
    if (s % 2 === 0) m(NOTE(root + (s % 4 === 2 ? 12 : 0)), 0.18, { type: 'sawtooth', vol: 0.09, delay: d });
    if (s === 0) [12, 19, 24].forEach(k => m(NOTE(root + 24 + k), 0.45, { type: 'square', vol: 0.03, delay: d }));
    if (bar % 2 === 1 && (s === 10 || s === 13)) m(NOTE(root + 36 + (s === 13 ? 1 : 0)), 0.16, { type: 'square', vol: 0.05, delay: d });
  } },
  danger: { bpm: 150, step(i, d) { // A minor and F, a pounding pulse: hurry up!
    const bar = Math.floor(i / 16) % 2, s = i % 16, root = bar ? 41 : 45;
    if (s % 4 === 0) kick(d);
    if (s === 4 || s === 12) snare(d, 0.14);
    hat(d, s % 2 ? 0.02 : 0.04);
    if (s % 2 === 0) m(NOTE(root + (s % 4 === 2 ? 12 : 0)), 0.12, { type: 'sawtooth', vol: 0.07, delay: d });
    if (s === 0) [0, 3, 7].forEach(k => m(NOTE(root + 24 + k), 0.25, { type: 'square', vol: 0.035, delay: d }));
    if (bar === 1 && s >= 12) m(NOTE(69 + (s - 12) * 2), 0.08, { type: 'square', vol: 0.04, delay: d });
  } },
};
const music = { name: null, step: 0, next: 0 };
export function playMusic(name) {
  if (music.name === name) return;
  music.name = SONGS[name] ? name : null;
  music.step = 0;
  music.next = 0;
}
export function setMusicOn(on) {
  musicOn = on;
  if (musicBus) musicBus.gain.value = on ? 0.32 : 0;
}
if (typeof window !== 'undefined') setInterval(() => { // keeps a quarter second of notes queued
  if (!ac || !music.name || muted || !musicOn || document.hidden) return;
  const song = SONGS[music.name], step = 60 / song.bpm / 4;
  if (music.next < ac.currentTime) music.next = ac.currentTime + 0.05;
  while (music.next < ac.currentTime + 0.25) {
    song.step(music.step, music.next - ac.currentTime);
    music.next += step;
    music.step++;
  }
}, 60);
