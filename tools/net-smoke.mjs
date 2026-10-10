// Live smoke test of the Supabase backend (creates throwaway anonymous players, then deletes them).
// Run: node tools/net-smoke.mjs   — needs network; never run against real players' data.
import assert from 'node:assert/strict';
import { SUPABASE_URL as URL, SUPABASE_ANON as KEY } from '../src/config.js';

const H = token => ({ apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${token || KEY}` });
async function signUp() {
  const r = await fetch(`${URL}/auth/v1/signup`, { method: 'POST', headers: H(), body: '{}' });
  const j = await r.json();
  assert.ok(j.access_token, `anonymous sign-in failed: ${JSON.stringify(j)}`);
  return j.access_token;
}
async function rpc(token, name, args = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) });
  const text = await r.text();
  return { ok: r.ok, status: r.status, data: text ? JSON.parse(text) : null };
}
const call = async (token, name, args) => {
  const r = await rpc(token, name, args);
  assert.ok(r.ok, `${name}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = (trophies, nick = { a: 1, n: 2, d: 33 }) => ({ p_nick: nick, p_squad: ['train', 'leech', 'basic'], p_skins: { train: 'candy' }, p_avatar: 'train', p_local_trophies: trophies });

const step = (name, fn) => fn().then(() => console.log('  ok ', name));

const A = await signUp(), B = await signUp(), C = await signUp();
let a, b;
// throwaway players must never stay on the real leaderboard, even if a step fails
const cleanup = () => Promise.all([A, B, C].map(t => rpc(t, 'delete_profile')));
try {

await step('signed-out clients cannot call anything', async () => {
  const r = await rpc(null, 'ensure_profile', prof(0));
  assert.ok(!r.ok);
});
await step('tables are not readable directly', async () => {
  const r = await fetch(`${URL}/rest/v1/profiles?select=*`, { headers: H(A) });
  assert.ok(!r.ok || (await r.json()).length === 0);
});
await step('profiles: offline trophies imported once, capped at 400; bad nicknames refused', async () => {
  a = await call(A, 'ensure_profile', prof(9999));
  assert.equal(a.created, true);
  assert.equal(a.trophies, 400);
  assert.match(a.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  b = await call(B, 'ensure_profile', prof(380, { a: 3, n: 4, d: 55 }));
  assert.equal(b.trophies, 380);
  const again = await call(A, 'ensure_profile', prof(0));
  assert.equal(again.created, false);
  assert.equal(again.trophies, 400, 'no second import');
  assert.ok(!(await rpc(C, 'ensure_profile', prof(0, { a: 99, n: 0, d: 10 }))).ok);
  assert.ok(!(await rpc(C, 'ensure_profile', prof(0, { a: 1, n: 1, d: '<b>' }))).ok);
});
await step('find_opponent returns a real nearby squad, never yourself', async () => {
  const o = await call(A, 'find_opponent');
  assert.equal(o.id, b.id);
  assert.deepEqual(o.squad, ['train', 'leech', 'basic']);
  assert.equal(o.nick.d, 55);
});
let m;
await step('finishing faster than a real match is refused', async () => {
  m = await call(A, 'start_match', { p_opponent: b.id });
  assert.ok(!(await rpc(A, 'finish_match', { p_match: m, p_result: 'won', p_flawless: false })).ok);
});
await step('a win after a real match length gives +8, only once', async () => {
  await sleep(16000);
  const r = await call(A, 'finish_match', { p_match: m, p_result: 'won', p_flawless: false });
  assert.equal(r.delta, 8);
  assert.equal(r.trophies, 408);
  assert.ok(!(await rpc(A, 'finish_match', { p_match: m, p_result: 'won', p_flawless: false })).ok, 'cannot finish twice');
});
await step('walking away from a match counts as a loss', async () => {
  await call(A, 'start_match', { p_opponent: null });
  await call(A, 'start_match', { p_opponent: null }); // the first one is now abandoned
  const s = await call(A, 'ensure_profile', prof(0));
  assert.equal(s.trophies, 408 - 4);
});
await step('leaderboards: all-time and this week, with your own rank', async () => {
  const all = await call(A, 'leaderboard', { p_week: false });
  assert.ok(all.top.some(r => r.me && r.score === 404));
  assert.ok(all.me.rank >= 1);
  const week = await call(A, 'leaderboard', { p_week: true });
  assert.equal(week.me.score, 8);
  assert.ok(week.top.every(r => r.score > 0));
});
await step('save sync keeps the newer blob', async () => {
  const r1 = await call(A, 'sync_save', { p_save: { coins: 50 }, p_save_at: new Date().toISOString(), p_squad: ['ice', 'ice', 'ice'], p_skins: {}, p_avatar: 'ice', p_nick: { a: 1, n: 2, d: 33 } });
  assert.equal(r1.save.coins, 50);
  const r2 = await call(A, 'sync_save', { p_save: { coins: 1 }, p_save_at: '2001-01-01T00:00:00Z', p_squad: ['nope', 'x', 'y'], p_skins: {}, p_avatar: 'ice', p_nick: { a: 1, n: 2, d: 33 } });
  assert.equal(r2.save.coins, 50, 'older save ignored');
});
await step('transfer codes are switched off (moving is by email account)', async () => {
  await call(C, 'ensure_profile', prof(0, { a: 5, n: 5, d: 77 }));
  assert.ok(!(await rpc(C, 'redeem_code', { p_code: a.code })).ok);
});
await step('delete_profile removes everything', async () => {
  for (const t of [A, B, C]) await call(t, 'delete_profile');
  const o = await call(C, 'ensure_profile', prof(0));
  assert.equal(o.created, true);
  await call(C, 'delete_profile');
});
console.log('backend smoke test passed');
} finally {
  await cleanup();
}
