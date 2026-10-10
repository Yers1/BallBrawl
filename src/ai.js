// Computer opponent: dashes at you, jumps off enemy rails, fires its super. Gets sharper with level.
// Uses its own RNG — never world.rand — so a fight replays from seed + command log alone.
import { act, rng, METER } from './sim.js';
import { onTrack } from './balls.js';
import { LEVELS } from './match.js';

export function createAI(side, level, seed = 1, { ent = null, act: doAct = act } = {}) { // ent: play just this ball
  const rand = rng(seed), skill = (level - 1) / (LEVELS - 1);
  let nextDash = 0.8 + rand() * 1.5, superAt = null;

  return {
    think(w) {
      if (!w.launched || w.result != null) return;
      const me = ent != null ? w.ents.find(e => e.id === ent && !e.dead) : w.ents.find(e => e.side === side && !e.dead);
      if (!me) return; // this ball is out
      const ball = w.ball, gy = side ? 400 : 0; // football: the goal it attacks
      const foe = ball ? { x: ball.x - (200 - ball.x) * 0.05, y: ball.y - (gy - ball.y) * 0.06, vx: ball.vx, vy: ball.vy }
        : w.ents.filter(e => e.side !== side && !e.dead).reduce((b, e) => (!b || Math.hypot(e.x - me.x, e.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? e : b), null);
      if (!foe) return;
      const s = w.sides[side];

      // standing on enemy rails hurts: a sharp AI dashes off them at the foe right away
      const onRails = skill > 0.3 && w.zones.some(z => z.kind === 'track' && z.side !== side && onTrack(z, me, 0, w.t)) && rand() < 0.08 * skill;

      // ram: dash where the foe is about to be
      if (w.t >= nextDash || onRails) {
        nextDash = w.t + (3 - 2.1 * skill) * (0.6 + rand() * 0.8);
        if (s.dashes >= 1 && !me.latch) { // a latched leech stays latched
          const err = (1 - skill) * 60, lead = 0.2;
          doAct(w, side, {
            type: 'dash',
            x: foe.x + foe.vx * lead + (rand() * 2 - 1) * err,
            y: foe.y + foe.vy * lead + (rand() * 2 - 1) * err,
          });
        }
      }

      // super: hesitate a bit, less at higher levels
      if (s.meter >= METER.full) {
        superAt ??= w.t + (2 - 1.7 * skill) * (0.5 + rand());
        if (w.t >= superAt) { doAct(w, side, { type: 'super' }); superAt = null; }
      } else superAt = null;
    },
  };
}
