// Computer opponent: dashes at you, dodges trains, fires its super. Gets sharper with level.
// Uses its own RNG — never world.rand — so a fight replays from seed + command log alone.
import { act, rng, METER } from './sim.js';
import { TRAIN } from './balls.js';
import { LEVELS } from './match.js';

export function createAI(side, level, seed = 1) {
  const rand = rng(seed), skill = (level - 1) / (LEVELS - 1);
  let nextDash = 0.8 + rand() * 1.5, superAt = null;

  return {
    think(w) {
      if (!w.launched || w.result != null) return;
      const me = w.ents.find(e => e.side === side && !e.dead);
      const foe = w.ents.find(e => e.side !== side && !e.dead);
      if (!me || !foe) return;
      const s = w.sides[side];

      // dodge enemy rails during their warning
      if (skill > 0.3 && s.dashes >= 1) {
        for (const z of w.zones) {
          if (z.kind !== 'train' || z.side === side || w.t >= z.go) continue;
          const across = z.axis === 'h' ? me.y : me.x;
          if (Math.abs(across - z.pos) > TRAIN.halfWidth + me.r + 10 || rand() > 0.03 * skill) continue;
          const away = across < z.pos ? -140 : 140;
          act(w, side, z.axis === 'h' ? { type: 'dash', x: me.x, y: me.y + away } : { type: 'dash', x: me.x + away, y: me.y });
          return;
        }
      }

      // ram: dash where the foe is about to be
      if (w.t >= nextDash) {
        nextDash = w.t + (3 - 2.1 * skill) * (0.6 + rand() * 0.8);
        if (s.dashes >= 1 && !me.latch) { // a latched leech stays latched
          const err = (1 - skill) * 60, lead = 0.2;
          act(w, side, {
            type: 'dash',
            x: foe.x + foe.vx * lead + (rand() * 2 - 1) * err,
            y: foe.y + foe.vy * lead + (rand() * 2 - 1) * err,
          });
        }
      }

      // super: hesitate a bit, less at higher levels
      if (s.meter >= METER.full) {
        superAt ??= w.t + (2 - 1.7 * skill) * (0.5 + rand());
        if (w.t >= superAt) { act(w, side, { type: 'super' }); superAt = null; }
      } else superAt = null;
    },
  };
}
