// Headless boss-fight win rates, both sides played by the AI: node tools/boss.mjs [fights per boss] [AI level]
import { createMatch, roundWorld } from '../src/match.js';
import { launch, step } from '../src/sim.js';
import { ORDER } from '../src/balls.js';
import { BOSS_IDS } from '../src/boss.js';
import { createAI } from '../src/ai.js';

const N = +process.argv[2] || 400, LEVEL = +process.argv[3] || 15;
for (const boss of BOSS_IDS) {
  let win = 0, secs = 0;
  for (let s = 1; s <= N; s++) {
    const pick = k => ORDER[(s * 7 + k * 5) % ORDER.length];
    const m = createMatch({ squadA: [pick(0), pick(1), pick(2)], squadB: ['basic'], seed: s, mode: 'boss', boss });
    const w = roundWorld(m), ais = [createAI(0, LEVEL, s + 1), createAI(1, LEVEL, s + 2)];
    launch(w, w.rand() * Math.PI * 2, w.rand() * Math.PI * 2);
    while (w.result == null && w.t < 120) { ais[0].think(w); ais[1].think(w); step(w, 1 / 60); }
    win += w.result === 0 ? 1 : w.result === 'draw' ? 0.5 : 0;
    secs += w.t;
  }
  console.log(boss.padEnd(8), 'players win', ((win / N) * 100).toFixed(0).padStart(3) + '%', ' fight', (secs / N).toFixed(1) + 's');
}
