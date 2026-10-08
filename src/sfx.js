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
let ac = null, master = null, muted = false;

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
  };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, start, { once: true, capture: true });
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 1, delay = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.25, freq = 1200, q = 1, delay = 0, sweep = 1 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, n = Math.ceil(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  hit: amount => { noise(0.08, { vol: 0.2 + Math.min(0.3, amount / 60), freq: 900, q: 0.8 }); tone(160 + amount * 4, 0.09, { vol: 0.12, slide: 0.5 }); },
  wall: () => noise(0.04, { vol: 0.05, freq: 2400 }),
  dash: () => noise(0.22, { vol: 0.22, freq: 500, sweep: 5, q: 2 }),
  shot: () => noise(0.05, { vol: 0.06, freq: 4000, q: 3 }),
  train: () => { tone(110, 0.5, { type: 'sawtooth', vol: 0.1, slide: 0.7 }); noise(0.5, { vol: 0.12, freq: 300 }); },
  super: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.16, delay: i * 0.05 })),
  death: () => { noise(0.45, { vol: 0.4, freq: 200, sweep: 0.3 }); tone(90, 0.4, { type: 'sine', vol: 0.3, slide: 0.4 }); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.14, delay: i * 0.09 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: i * 0.14 })),
  click: () => tone(700, 0.05, { type: 'sine', vol: 0.08 }),
  coin: () => { tone(988, 0.07, { type: 'square', vol: 0.08 }); tone(1319, 0.12, { type: 'square', vol: 0.08, delay: 0.07 }); },
};
