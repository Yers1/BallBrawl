// Online layer (Supabase): anonymous account, cloud save, ranked matches, leaderboards, transfer codes.
// Everything here is optional — if the network or the backend is down, the game keeps working offline
// ("training": coins and quests still count, trophies don't, because the server owns them).
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';
import { mergeSave } from './progress.js';

let sb = null;
export const net = { online: false, email: null }; // email = signed in with an account, not anonymous
let uid = null; // the user this page connected as: after a sign-in (here or in another tab) its save must not sync

const timeout = (p, ms = 6000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
async function rpc(name, args = {}) {
  if (!sb) throw new Error('offline');
  const { data, error } = await timeout(sb.rpc(name, args));
  if (error) throw error;
  return data;
}

// Sign in (anonymously), make sure we have a profile, merge the cloud save into ours.
// Returns { save }. Moving to another device is done with an email account (see linkAccount below).
export async function connect(save) {
  // local dev stays off the real backend (no test profiles on the leaderboard) unless you ask: ?online
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), q = new URLSearchParams(location.search);
  if (q.has('offline') || (local && !q.has('online'))) return { save };
  try {
    const { createClient } = await timeout(import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'), 10000);
    sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ballbrawl.auth' } });
    let { data: { session } } = await timeout(sb.auth.getSession());
    if (!session) {
      const { data, error } = await timeout(sb.auth.signInAnonymously());
      if (error) throw error;
      session = data.session;
    }
    net.email = session?.user && !session.user.is_anonymous ? session.user.email ?? null : null;
    uid = session?.user?.id ?? null;
    const p = await rpc('ensure_profile', {
      p_nick: save.nick, p_squad: save.squad, p_skins: save.skinOf, p_avatar: save.avatar,
      p_local_trophies: save.profileId ? 0 : save.trophies, // offline trophies are imported only once
    });
    const merged = mergeSave(save, p.save || {}, p);
    merged.profileId = p.id;
    merged.nick = save.nick;
    merged.accountGift ||= !!net.email;
    net.online = true;
    if (merged.pendingFinish) { // a ranked result that never reached the server (closed tab, lost signal)
      const r = await finishMatch(merged.pendingFinish).catch(() => null);
      if (r) { merged.trophies = r.trophies; merged.maxTrophies = Math.max(merged.maxTrophies, r.max_trophies); }
      merged.pendingFinish = null;
    }
    return { save: merged };
  } catch (e) {
    console.warn('[net] offline:', e?.message || e);
    net.online = false;
    return { save };
  }
}
let syncTimer = 0;
const upload = (save, at) => {
  const { profileId, pendingFinish, ...blob } = save; // bookkeeping stays local
  return rpc('sync_save', {
    p_save: blob, p_save_at: new Date(at).toISOString(),
    p_squad: save.squad, p_skins: save.skinOf, p_avatar: save.avatar, p_nick: save.nick,
  });
};
const sameUser = async () => (await sb.auth.getSession()).data.session?.user?.id === uid;
export function queueSync(save) {
  if (!net.online) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (!(await sameUser().catch(() => false))) return; // signed into another account: the reload merges instead
    upload(save, save.savedAt || Date.now()).catch(() => {});
  }, 2500);
}

// Before signing out: merge in the cloud copy (another device may be ahead), upload that and check it landed.
// Throws on any failure, so the caller keeps the local save.
export async function flushSync(save) {
  if (!net.online) throw new Error('offline');
  clearTimeout(syncTimer);
  const cur = await upload(save, 0); // an old timestamp never overwrites: this only reads the cloud copy
  const merged = mergeSave(save, cur.save || {}, cur);
  merged.flushId = Math.random().toString(36).slice(2);
  const r = await upload(merged, Math.max(Date.now(), (Date.parse(cur.save_at) || 0) + 1));
  if (r.save?.flushId !== merged.flushId) throw new Error('not stored');
}

// Email accounts. Turning this device's anonymous player into an account keeps the same profile (same user id);
// no email is sent, so there is no confirmation step. Signing in elsewhere loads that account's profile on reload.
export async function linkAccount(email, password) {
  if (!sb) throw new Error('offline');
  const { data, error } = await timeout(sb.auth.updateUser({ email, password }), 10000);
  if (error) throw error;
  net.email = data.user?.email ?? email;
}
export async function signInAccount(email, password) {
  if (!sb) throw new Error('offline');
  const { error } = await timeout(sb.auth.signInWithPassword({ email, password }), 10000);
  if (error) throw error;
}
export async function signOutAccount() { // this device only; other devices stay signed in
  if (!sb) throw new Error('offline');
  const { error } = await timeout(sb.auth.signOut({ scope: 'local' }));
  if (error) throw error;
}

export const findOpponent = () => rpc('find_opponent');
export const startMatch = opponentId => rpc('start_match', { p_opponent: opponentId ?? null });
export const finishMatch = ({ match, result, flawless }) => rpc('finish_match', { p_match: match, p_result: result, p_flawless: flawless });
export const leaderboard = week => rpc('leaderboard', { p_week: week });
export const logEvent = type => (net.online ? rpc('log_event', { p_type: type }).catch(() => {}) : null);
export async function deleteProfile() {
  await rpc('delete_profile');
  await sb.auth.signOut().catch(() => {});
}
