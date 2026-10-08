// Meta progression, pure functions over the save object (no DOM, so it runs under node --test):
// trophies, the trophy road, skins, daily quests, the 7-day reward, achievements, save migration.
// Halal rule: every reward is fixed and shown in advance — no random boxes anywhere.
import { ORDER, BALLS } from './balls.js';
import { LEVELS } from './match.js';
import { validNick } from './nick.js';
import { rng } from './sim.js';

// ---------- trophies ----------
export const UNLOCK = { basic: 0, leech: 10, cell: 30, spider: 60, ninja: 100, train: 150, magnet: 200, bomb: 280, turtle: 360, lightning: 440, hedgehog: 520, ice: 600 };
export const LOSE_COINS = 5;
export const aiLevel = tr => Math.min(LEVELS, Math.max(1, 1 + Math.floor(tr / 40)));
// past the AI cap (1160) enemies keep gaining HP, so the top of the table can't be farmed by volume
export const enemyHpMulFor = tr => 1 + 0.05 * (aiLevel(tr) - 1) + 0.0005 * Math.max(0, tr - 1160);
export const winCoinsFor = tr => Math.min(40, 15 + Math.floor(tr / 40));
export const trophyLoss = tr => Math.min(8, 2 + Math.floor(tr / 150));

export function applyResult(s, result, flawless = false) {
  const delta = result === 0 ? 8 + (flawless ? 1 : 0) : result === 1 ? -Math.min(trophyLoss(s.trophies), s.trophies) : 0;
  s.trophies += delta;
  s.maxTrophies = Math.max(s.maxTrophies, s.trophies);
  return delta;
}

export const enemyPool = tr => ORDER.filter(id => UNLOCK[id] <= tr + 60);
export function enemySquadFor(tr, rand) {
  const pool = enemyPool(tr);
  return [0, 1, 2].map(() => pool[Math.floor(rand() * pool.length)]);
}

// ---------- save ----------
export function freshSave() {
  return {
    v: 2, coins: 0, owned: ['basic'], squad: ['basic', 'basic', 'basic'], trophies: 0, maxTrophies: 0, matches: 0,
    nick: null, muted: false, avatar: 'basic',
    created: [], answered: [], // challenge link seeds I made / already got the bonus for
    claimed: [], skins: [], skinOf: {},
    quests: { day: null, list: [] }, daily: { last: null, streak: 0 }, achieved: [],
    stats: { wins: 0, matches: 0, dashes: 0, supers: 0, kills: 0, flawless: 0, challenges: 0 },
  };
}

// localStorage is user-editable: rebuild the save field by field, validating everything.
export function migrate(raw) {
  const s = freshSave(), r = raw && typeof raw === 'object' ? raw : {};
  const int = (v, min = 0, max = 1e9) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : null);
  const list = (a, ok) => (Array.isArray(a) ? [...new Set(a.filter(ok))] : []);
  s.coins = int(r.coins) ?? 0;
  s.owned = ['basic', ...list(r.owned, id => BALLS[id] && id !== 'basic')];
  if (Array.isArray(r.squad) && r.squad.length === 3) s.squad = r.squad.map(id => (s.owned.includes(id) ? id : 'basic'));
  s.trophies = int(r.trophies) ?? (int(r.level, 1, LEVELS) ? (int(r.level, 1, LEVELS) - 1) * 15 : 0); // v1 ladder level → trophies
  s.maxTrophies = Math.max(s.trophies, int(r.maxTrophies) ?? 0);
  s.matches = int(r.matches) ?? 0;
  if (validNick(r.nick)) s.nick = r.nick;
  s.muted = r.muted === true;
  if (BALLS[r.avatar]) s.avatar = r.avatar;
  s.created = list(r.created, Number.isInteger).slice(-100);
  s.answered = list(r.answered, Number.isInteger).slice(-100);
  s.claimed = list(r.claimed, Number.isInteger);
  s.skins = list(r.skins, k => typeof k === 'string' && /^[a-z]+:[a-z]+$/.test(k) && BALLS[k.split(':')[0]] && SKINS[k.split(':')[1]]);
  for (const [b, st] of Object.entries(r.skinOf || {})) if (s.skins.includes(`${b}:${st}`)) s.skinOf[b] = st;
  if (r.quests && typeof r.quests.day === 'string' && Array.isArray(r.quests.list)) {
    s.quests = { day: r.quests.day, list: r.quests.list.filter(q => QUESTS.some(d => d.id === q?.id)).map(q => ({ id: q.id, progress: int(q.progress) ?? 0, claimed: q.claimed === true })) };
  }
  if (r.daily && (r.daily.last === null || typeof r.daily.last === 'string')) s.daily = { last: r.daily.last, streak: int(r.daily.streak) ?? 0 };
  s.achieved = list(r.achieved, id => ACHIEVEMENTS.some(a => a.id === id));
  for (const k of Object.keys(s.stats)) s.stats[k] = int(r.stats?.[k]) ?? 0;
  return s;
}

// ---------- trophy road ----------
export const PATH = [
  { at: 10, ball: 'leech' }, { at: 20, coins: 30 }, { at: 30, ball: 'cell' }, { at: 45, skin: ['basic', 'gold'] },
  { at: 60, ball: 'spider' }, { at: 80, coins: 50 }, { at: 100, ball: 'ninja' }, { at: 125, skin: ['leech', 'neon'] },
  { at: 150, ball: 'train' }, { at: 175, coins: 70 }, { at: 200, ball: 'magnet' }, { at: 240, skin: ['cell', 'candy'] },
  { at: 280, ball: 'bomb' }, { at: 320, coins: 90 }, { at: 360, ball: 'turtle' }, { at: 400, skin: ['ninja', 'galaxy'] },
  { at: 440, ball: 'lightning' }, { at: 480, coins: 110 }, { at: 520, ball: 'hedgehog' }, { at: 560, skin: ['train', 'lava'] },
  { at: 600, ball: 'ice' }, { at: 650, coins: 130 }, { at: 700, skin: ['spider', 'gold'] }, { at: 750, coins: 150 },
  { at: 800, skin: ['magnet', 'neon'] }, { at: 850, coins: 170 }, { at: 900, skin: ['ice', 'galaxy'] }, { at: 950, coins: 200 },
  { at: 1000, skin: ['lightning', 'gold'] },
];
// after the last reward the road goes on forever: +100 coins every 50 trophies
export function pathNodes(upTo) {
  const out = [...PATH];
  for (let at = PATH.at(-1).at + 50; at <= Math.max(upTo, PATH.at(-1).at) + 100; at += 50) out.push({ at, coins: 100 });
  return out;
}
export const claimable = s => pathNodes(s.maxTrophies).filter(n => n.at <= s.maxTrophies && !s.claimed.includes(n.at));

export function claim(s, node) {
  if (s.claimed.includes(node.at) || node.at > s.maxTrophies) return null;
  s.claimed.push(node.at);
  if (node.ball) {
    if (!s.owned.includes(node.ball)) { s.owned.push(node.ball); return { ball: node.ball }; }
    const coins = BALLS[node.ball].price / 2; // already bought it in the shop
    s.coins += coins;
    return { ball: node.ball, coins };
  }
  if (node.skin) {
    const key = node.skin.join(':');
    if (!s.skins.includes(key)) { s.skins.push(key); return { skin: node.skin }; }
    s.coins += 60;
    return { skin: node.skin, coins: 60 };
  }
  s.coins += node.coins;
  return { coins: node.coins };
}

// ---------- skins (looks only) ----------
export const SKINS = {
  gold: { color: '#f5c542', pattern: 'shine' },
  neon: { color: '#151b30', pattern: 'neon' },
  candy: { color: '#ff7eb6', pattern: 'stripes' },
  galaxy: { color: '#3b2a7a', pattern: 'stars' },
  lava: { color: '#e5482d', pattern: 'cracks' },
  mint: { color: '#7be0c3', pattern: 'dots' },
};
export const SKIN_PRICE = 150;
export const hasSkin = (s, ball, style) => s.skins.includes(`${ball}:${style}`);
export function buySkin(s, ball, style) {
  if (!s.owned.includes(ball) || !SKINS[style] || hasSkin(s, ball, style) || s.coins < SKIN_PRICE) return false;
  s.coins -= SKIN_PRICE;
  s.skins.push(`${ball}:${style}`);
  s.skinOf[ball] = style;
  return true;
}
export function equipSkin(s, ball, style) {
  if (style == null) delete s.skinOf[ball];
  else if (hasSkin(s, ball, style)) s.skinOf[ball] = style;
}

// ---------- days ----------
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export function prevDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}
const hash = str => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// ---------- daily quests ----------
export const QUESTS = [
  { id: 'win3', stat: 'wins', goal: 3, coins: 40 },
  { id: 'dash15', stat: 'dashes', goal: 15, coins: 30 },
  { id: 'super3', stat: 'supers', goal: 3, coins: 30 },
  { id: 'kills10', stat: 'kills', goal: 10, coins: 40 },
  { id: 'flawless1', stat: 'flawless', goal: 1, coins: 50 },
  { id: 'challenge1', stat: 'challenges', goal: 1, coins: 30 },
  { id: 'matches5', stat: 'matches', goal: 5, coins: 30 },
];
export function refreshQuests(s, day) {
  if (s.quests.day === day) return;
  const rand = rng(hash(day)), pool = [...QUESTS], list = [];
  while (list.length < 3) list.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  s.quests = { day, list: list.map(q => ({ id: q.id, progress: 0, claimed: false })) };
}
export const questDef = id => QUESTS.find(q => q.id === id);
export function track(s, delta) {
  for (const [stat, v] of Object.entries(delta)) {
    if (!v) continue;
    s.stats[stat] = (s.stats[stat] ?? 0) + v;
    for (const q of s.quests.list) {
      const d = questDef(q.id);
      if (d.stat === stat) q.progress = Math.min(d.goal, q.progress + v);
    }
  }
}
export function claimQuest(s, id) {
  const q = s.quests.list.find(q => q.id === id), d = questDef(id);
  if (!q || q.claimed || q.progress < d.goal) return 0;
  q.claimed = true;
  s.coins += d.coins;
  return d.coins;
}

// ---------- 7-day reward ----------
export const DAILY = [20, 30, 40, 50, 60, 80]; // day 7 = a skin, shown in advance
const STYLE_ORDER = ['gold', 'neon', 'candy', 'galaxy', 'lava', 'mint'];
export function nextDailySkin(s) {
  for (const style of STYLE_ORDER) for (const ball of s.owned) if (!hasSkin(s, ball, style)) return [ball, style];
  return null; // owns them all → 200 coins instead
}
export function dailyState(s, today) {
  const skin = nextDailySkin(s);
  if (s.daily.last === today) return { day: (s.daily.streak - 1) % 7, canClaim: false, skin };
  const streak = s.daily.last === prevDay(today) ? s.daily.streak : 0;
  return { day: streak % 7, canClaim: true, skin };
}
export function claimDaily(s, today) {
  const st = dailyState(s, today);
  if (!st.canClaim) return null;
  s.daily = { last: today, streak: (s.daily.last === prevDay(today) ? s.daily.streak : 0) + 1 };
  if (st.day < 6) { s.coins += DAILY[st.day]; return { coins: DAILY[st.day] }; }
  if (!st.skin) { s.coins += 200; return { coins: 200 }; }
  s.skins.push(st.skin.join(':'));
  return { skin: st.skin };
}

// ---------- achievements ----------
export const ACHIEVEMENTS = [
  { id: 'firstWin', stat: 'wins', goal: 1, coins: 20 },
  { id: 'wins10', stat: 'wins', goal: 10, coins: 50 },
  { id: 'wins50', stat: 'wins', goal: 50, coins: 150 },
  { id: 'tr100', stat: 'maxTrophies', goal: 100, coins: 50 },
  { id: 'tr500', stat: 'maxTrophies', goal: 500, coins: 150 },
  { id: 'tr1000', stat: 'maxTrophies', goal: 1000, coins: 300 },
  { id: 'collector', stat: 'ballsOwned', goal: ORDER.length, coins: 300 },
  { id: 'supers25', stat: 'supers', goal: 25, coins: 60 },
  { id: 'challenger', stat: 'challenges', goal: 5, coins: 60 },
  { id: 'flawless5', stat: 'flawless', goal: 5, coins: 100 },
];
export const achievementValue = (s, a) => (a.stat === 'maxTrophies' ? s.maxTrophies : a.stat === 'ballsOwned' ? s.owned.length : s.stats[a.stat] ?? 0);
export function claimAchievement(s, id) {
  const a = ACHIEVEMENTS.find(a => a.id === id);
  if (!a || s.achieved.includes(id) || achievementValue(s, a) < a.goal) return 0;
  s.achieved.push(id);
  s.coins += a.coins;
  return a.coins;
}

// ---------- shop ----------
export function buyBall(s, id) {
  if (!BALLS[id] || s.owned.includes(id) || s.coins < BALLS[id].price) return false;
  s.coins -= BALLS[id].price;
  s.owned.push(id);
  return true;
}
