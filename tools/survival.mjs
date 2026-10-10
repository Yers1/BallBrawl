// Headless survival runs, both sides played by the AI, upgrades picked at random: node tools/survival.mjs [runs] [AI level]
import { createMatch, roundWorld, endRound, upgradeChoices, applyUpgrade } from '../src/match.js';
import { launch, step } from '../src/sim.js';
import { ORDER } from '../src/balls.js';
import { createAI } from '../src/ai.js';

const N = +process.argv[2] || 200, LEVEL = +process.argv[3] || 12, hist = {};
let total = 0;
for (let s = 1; s <= N; s++) {
  const pick = k => ORDER[(s * 7 + k * 5) % ORDER.length];
  const m = createMatch({ squadA: [pick(0), pick(1), pick(2)], squadB: [pick(3), pick(4), pick(5)], mode: 'survival', seed: s, pool: ORDER });
  while (m.result == null && m.wave < 40) {
    const w = roundWorld(m), ais = [createAI(0, LEVEL, s + m.wave), createAI(1, Math.min(30, LEVEL + Math.floor(m.wave / 2)), s * 3 + m.wave)];
    launch(w, w.rand() * Math.PI * 2, w.rand() * Math.PI * 2);
    while (w.result == null && w.t < 120) { ais[0].think(w); ais[1].think(w); step(w, 1 / 60); }
    if (endRound(m, w) == null) { const c = upgradeChoices(m); applyUpgrade(m, c[s % c.length]); }
  }
  const cleared = m.wave - 1;
  total += cleared;
  hist[cleared] = (hist[cleared] ?? 0) + 1;
}
console.log('average waves cleared:', (total / N).toFixed(1));
console.log(Object.entries(hist).map(([k, v]) => `${k}:${v}`).join(' '));
