// Friend challenges that live entirely in the link (no server):
//   v1.<balls>.<seed>.<adj>-<noun>-<num>.<level>[.<replyToSeed>-<result>]
// balls = 3 chars, each the ball's index in ORDER (base 36); seed base 36.
// result (reply links only) = how the replier did against the original: w / l / d.
// Everything is validated; anything off → null, and the game just opens normally.
import { ORDER } from './balls.js';
import { validNick } from './nick.js';
import { LEVELS } from './match.js';

const RE = /^v1\.([0-9a-z]{3})\.([0-9a-z]{1,7})\.(\d{1,2})-(\d{1,2})-(\d{2,3})\.(\d{1,2})(?:\.([0-9a-z]{1,7})-([wld]))?$/;
const MAX_SEED = 0xffffffff;

export function encodeChallenge({ squad, seed, nick, level, reply }) {
  const balls = squad.map(id => ORDER.indexOf(id).toString(36)).join('');
  let s = `v1.${balls}.${seed.toString(36)}.${nick.a}-${nick.n}-${nick.d}.${level}`;
  if (reply) s += `.${reply.seed.toString(36)}-${reply.result}`;
  return s;
}

export function decodeChallenge(text) {
  const m = RE.exec(String(text || '').trim());
  if (!m) return null;
  const squad = [...m[1]].map(c => ORDER[parseInt(c, 36)]);
  const seed = parseInt(m[2], 36);
  const nick = { a: +m[3], n: +m[4], d: +m[5] };
  const level = +m[6];
  if (squad.some(id => !id) || !(seed >= 1 && seed <= MAX_SEED) || !validNick(nick) || level < 1 || level > LEVELS) return null;
  let reply = null;
  if (m[7]) {
    const rs = parseInt(m[7], 36);
    if (!(rs >= 1 && rs <= MAX_SEED)) return null;
    reply = { seed: rs, result: m[8] };
  }
  return { squad, seed, nick, level, reply };
}

export const newSeed = (rand = Math.random) => 1 + Math.floor(rand() * (MAX_SEED - 1));
