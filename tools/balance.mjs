// Headless 1v1 win-rate matrix: node tools/balance.mjs [rounds per pair]
import { createWorld, launch, step } from '../src/sim.js';
import { ORDER } from '../src/balls.js';

const N = +process.argv[2] || 300;
const duel = (a, b, seed) => {
  const w = createWorld({ seed, a: { id: a }, b: { id: b } });
  launch(w, w.rand() * Math.PI * 2, w.rand() * Math.PI * 2);
  while (w.result == null && w.t < 90) step(w, 1 / 60);
  return [w.result, w.t];
};

let secs = 0, rounds = 0;
const avg = {};
console.log('row vs col win %'.padEnd(10), ...ORDER.map(id => id.padStart(7)));
for (const a of ORDER) {
  const row = ORDER.map(b => {
    let win = 0;
    for (let s = 1; s <= N; s++) {
      const [r, t] = duel(a, b, s * 31 + a.length * 7 + b.length);
      win += r === 0 ? 1 : r === 'draw' ? 0.5 : 0;
      secs += t; rounds++;
    }
    return (win / N) * 100;
  });
  avg[a] = row.reduce((x, y) => x + y) / row.length;
  console.log(a.padEnd(10), ...row.map(p => p.toFixed(0).padStart(7)));
}
console.log('\naverage win %:', Object.entries(avg).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · '));
console.log('average round:', (secs / rounds).toFixed(1), 's');
