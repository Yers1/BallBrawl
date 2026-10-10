// Online layer (Supabase): anonymous account, cloud save, ranked matches, leaderboards, transfer codes.
// Everything here is optional — if the network or the backend is down, the game keeps working offline
// ("training": coins and quests still count, trophies don't, because the server owns them).
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';
import { mergeSave } from './progress.js';

let sb = null;
export const net = { online: false, code: null, email: null }; // email = signed in with an account, not anonymous

const timeout = (p, ms = 6000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
async function rpc(name, args = {}) {
  if (!sb) throw new Error('offline');
  const { data, error } = await timeout(sb.rpc(name, args));
  if (error) throw error;
  return data;
}

// Sign in (anonymously), make sure we have a profile, merge the cloud save into ours.
// Returns { save, moved } — moved = this device's profile was taken to another phone with its code.
export async function connect(save) {
  // local dev stays off the real backend (no test profiles on the leaderboard) unless you ask: ?online
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), q = new URLSearchParams(location.search);
  if (q.has('offline') || (local && !q.has('online'))) return { save, moved: false };
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
    const p = await rpc('ensure_profile', {
      p_nick: save.nick, p_squad: save.squad, p_skins: save.skinOf, p_avatar: save.avatar,
      p_local_trophies: save.profileId ? 0 : save.trophies, // offline trophies are imported only once
    });
    const moved = p.created && !!save.profileId && save.profileId !== p.id;
    const merged = mergeSave(moved ? { ...save, ...freshCounters() } : save, p.save || {}, p);
    merged.profileId = p.id;
    merged.nick = save.nick;
    merged.accountGift ||= !!net.email;
    net.code = p.code;
    net.online = true;
    if (merged.pendingFinish) { // a ranked result that never reached the server (closed tab, lost signal)
      const r = await finishMatch(merged.pendingFinish).catch(() => null);
      if (r) { merged.trophies = r.trophies; merged.maxTrophies = Math.max(merged.maxTrophies, r.max_trophies); }
      merged.pendingFinish = null;
    }
    return { save: merged, moved };
  } catch (e) {
    console.warn('[net] offline:', e?.message || e);
    net.online = false;
    return { save, moved: false };
  }
}
// When a profile moved away, start this device over (coins/balls stay on the phone that owns the profile now).
const freshCounters = () => ({ coins: 0, owned: ['basic'], claimed: [], skins: [], skinOf: {}, achieved: [], trophies: 0, maxTrophies: 0 });

let syncTimer = 0;
export function queueSync(save) {
  if (!net.online) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { profileId, pendingFinish, ...blob } = save; // bookkeeping stays local
    rpc('sync_save', {
      p_save: blob, p_save_at: new Date(save.savedAt || Date.now()).toISOString(),
      p_squad: save.squad, p_skins: save.skinOf, p_avatar: save.avatar, p_nick: save.nick,
    }).then(r => { net.code = r.code; }).catch(() => {});
  }, 2500);
}

// Send the save right now (before signing in or out), instead of waiting for the debounce.
export async function flushSync(save) {
  if (!net.online) return;
  clearTimeout(syncTimer);
  const { profileId, pendingFinish, ...blob } = save;
  await rpc('sync_save', {
    p_save: blob, p_save_at: new Date(save.savedAt || Date.now()).toISOString(),
    p_squad: save.squad, p_skins: save.skinOf, p_avatar: save.avatar, p_nick: save.nick,
  });
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
export async function signOutAccount() {
  await sb?.auth.signOut().catch(() => {});
}

export const findOpponent = () => rpc('find_opponent');
export const startMatch = opponentId => rpc('start_match', { p_opponent: opponentId ?? null });
export const finishMatch = ({ match, result, flawless }) => rpc('finish_match', { p_match: match, p_result: result, p_flawless: flawless });
export const leaderboard = week => rpc('leaderboard', { p_week: week });
export const redeemCode = code => rpc('redeem_code', { p_code: code });
export const logEvent = type => (net.online ? rpc('log_event', { p_type: type }).catch(() => {}) : null);
export async function deleteProfile() {
  await rpc('delete_profile');
  await sb.auth.signOut().catch(() => {});
}
