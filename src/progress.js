// Meta progression, pure functions over the save object (no DOM, so it runs under node --test):
// trophies, the Glory Road, chests, skins, daily quests, the 7-day reward, achievements, save migration.
// Halal rule: nothing is ever staked. Road rewards are fixed and shown in advance; chests are only earned by
// playing (never sold for coins or money) and their odds are shown, so opening one risks nothing.
import { ORDER, BALLS } from './balls.js';
import { LEVELS } from './match.js';
import { validNick } from './nick.js';
import { rng } from './sim.js';

// ---------- trophies ----------
export const UNLOCK = { basic: 0, leech: 10, cell: 30, spider: 60, ninja: 100, train: 150, magnet: 200, bomb: 280, turtle: 360, lightning: 440, hedgehog: 520, ice: 600, poison: 660, chain: 720, forge: 780 };
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

// ---------- arenas (Clash-Royale style): unlocked by your best trophies, never taken back ----------
export const ARENAS = [
  { id: 'night', at: 0 }, { id: 'canyon', at: 120 }, { id: 'frost', at: 350 },
  { id: 'jungle', at: 700 }, { id: 'lava', at: 1200 }, { id: 'space', at: 1900 },
];
export const arenaFor = maxTrophies => ARENAS.reduce((a, x) => (maxTrophies >= x.at ? x : a), ARENAS[0]);
export const arenaIndex = id => Math.max(0, ARENAS.findIndex(a => a.id === id));

// ---------- save ----------
export function freshSave() {
  return {
    v: 2, coins: 0, owned: ['basic'], squad: ['basic', 'basic', 'basic'], trophies: 0, maxTrophies: 0, matches: 0,
    nick: null, muted: false, avatar: 'basic',
    created: [], answered: [], // challenge link seeds I made / already got the bonus for
    claimed: [], skins: [], skinOf: {},
    chests: { box: 0, big: 0, mega: 0 }, chestWins: 0, // chests waiting to be opened; wins toward the next one
    chestsGot: { box: 0, big: 0, mega: 0 }, chestsOpened: { box: 0, big: 0, mega: 0 }, // ever earned / ever opened: only grow, so merges can't revive opened chests
    accountGift: false, // made an email account: the rainbow skin is theirs on every ball
    arenaSeen: 'night', // the newest arena the player has been welcomed to (the unlock celebration shows once)
    quests: { day: null, list: [] }, daily: { last: null, streak: 0 }, achieved: [],
    stats: { wins: 0, matches: 0, dashes: 0, supers: 0, kills: 0, flawless: 0, challenges: 0 },
    // cloud bookkeeping
    profileId: null, savedAt: 0,
    pendingFinish: null, // a ranked result the server hasn't confirmed yet: { match, result, flawless }
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
  s.accountGift = r.accountGift === true;
  s.skins = list(r.skins, k => typeof k === 'string' && /^[a-z]+:[a-z]+$/.test(k) && BALLS[k.split(':')[0]] && SKINS[k.split(':')[1]] && !SKINS[k.split(':')[1]].gift);
  for (const [b, st] of Object.entries(r.skinOf || {})) if (hasSkin(s, b, st)) s.skinOf[b] = st;
  for (const k of Object.keys(CHESTS)) {
    s.chests[k] = int(r.chests?.[k], 0, 999) ?? 0;
    s.chestsOpened[k] = int(r.chestsOpened?.[k]) ?? 0;
    s.chestsGot[k] = Math.max(int(r.chestsGot?.[k]) ?? 0, s.chests[k] + s.chestsOpened[k]);
  }
  s.chestWins = int(r.chestWins, 0, CHEST_WINS - 1) ?? 0;
  if (ARENAS.some(a => a.id === r.arenaSeen)) s.arenaSeen = r.arenaSeen;
  if (r.quests && typeof r.quests.day === 'string' && Array.isArray(r.quests.list)) {
    s.quests = { day: r.quests.day, list: r.quests.list.filter(q => QUESTS.some(d => d.id === q?.id)).map(q => ({ id: q.id, progress: int(q.progress) ?? 0, claimed: q.claimed === true })) };
  }
  if (r.daily && (r.daily.last === null || typeof r.daily.last === 'string')) s.daily = { last: r.daily.last, streak: int(r.daily.streak) ?? 0 };
  s.achieved = list(r.achieved, id => ACHIEVEMENTS.some(a => a.id === id));
  for (const k of Object.keys(s.stats)) s.stats[k] = int(r.stats?.[k]) ?? 0;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (uuid.test(r.profileId)) s.profileId = r.profileId;
  s.savedAt = int(r.savedAt, 0, 1e13) ?? 0;
  const pf = r.pendingFinish;
  if (pf && uuid.test(pf.match) && ['won', 'lost', 'draw'].includes(pf.result)) s.pendingFinish = { match: pf.match, result: pf.result, flawless: pf.flawless === true };
  return s;
}

// ---------- Glory Road ----------
// Claims are keyed by `at`, so a node's position must never move once it has shipped (a moved node pays twice).
export const PATH = [
  { at: 5, chest: 'box' }, { at: 10, ball: 'leech' }, { at: 20, coins: 30 }, { at: 30, ball: 'cell' }, { at: 40, chest: 'box' },
  { at: 45, skin: ['basic', 'gold'] }, { at: 60, ball: 'spider' }, { at: 70, chest: 'box' }, { at: 80, coins: 50 },
  { at: 100, ball: 'ninja' }, { at: 115, chest: 'big' }, { at: 125, skin: ['leech', 'neon'] }, { at: 150, ball: 'train' },
  { at: 175, coins: 70 }, { at: 190, chest: 'box' }, { at: 200, ball: 'magnet' }, { at: 240, skin: ['cell', 'candy'] },
  { at: 260, chest: 'big' }, { at: 280, ball: 'bomb' }, { at: 320, coins: 90 }, { at: 340, chest: 'box' },
  { at: 360, ball: 'turtle' }, { at: 400, skin: ['ninja', 'galaxy'] }, { at: 420, chest: 'big' }, { at: 440, ball: 'lightning' },
  { at: 480, coins: 110 }, { at: 500, chest: 'mega' }, { at: 520, ball: 'hedgehog' }, { at: 560, skin: ['train', 'lava'] },
  { at: 580, chest: 'big' }, { at: 600, ball: 'ice' }, { at: 650, coins: 130 }, { at: 660, ball: 'poison' },
  { at: 690, chest: 'box' }, { at: 700, skin: ['spider', 'gold'] }, { at: 720, ball: 'chain' }, { at: 740, chest: 'big' },
  { at: 750, coins: 150 }, { at: 780, ball: 'forge' }, { at: 800, skin: ['magnet', 'neon'] }, { at: 825, chest: 'big' },
  { at: 850, coins: 170 }, { at: 875, chest: 'box' }, { at: 900, skin: ['ice', 'galaxy'] }, { at: 925, chest: 'big' },
  { at: 950, coins: 200 }, { at: 975, chest: 'box' }, { at: 1000, skin: ['lightning', 'gold'] }, { at: 1025, chest: 'mega' },
  { at: 1050, skin: ['poison', 'lava'] }, { at: 1075, chest: 'box' }, { at: 1100, skin: ['chain', 'neon'] }, { at: 1125, chest: 'big' },
  { at: 1150, skin: ['forge', 'gold'] }, { at: 1200, coins: 150 }, { at: 1250, chest: 'big' }, { at: 1300, skin: ['basic', 'galaxy'] },
  { at: 1350, coins: 160 }, { at: 1400, chest: 'big' }, { at: 1450, skin: ['leech', 'lava'] }, { at: 1500, chest: 'mega' },
  { at: 1550, coins: 170 }, { at: 1600, skin: ['cell', 'neon'] }, { at: 1650, chest: 'big' }, { at: 1700, coins: 180 },
  { at: 1750, skin: ['spider', 'candy'] }, { at: 1800, chest: 'big' }, { at: 1850, coins: 190 }, { at: 1900, skin: ['ninja', 'gold'] },
  { at: 2000, chest: 'mega' }, { at: 2050, coins: 200 }, { at: 2100, skin: ['train', 'mint'] }, { at: 2150, chest: 'big' },
  { at: 2200, coins: 210 }, { at: 2250, skin: ['magnet', 'lava'] }, { at: 2300, chest: 'big' }, { at: 2350, coins: 220 },
  { at: 2400, skin: ['bomb', 'galaxy'] }, { at: 2500, chest: 'mega' }, { at: 2550, coins: 230 }, { at: 2600, skin: ['turtle', 'gold'] },
  { at: 2650, chest: 'big' }, { at: 2700, coins: 240 }, { at: 2750, skin: ['hedgehog', 'neon'] }, { at: 2800, chest: 'big' },
  { at: 2850, coins: 250 }, { at: 2900, skin: ['ice', 'candy'] }, { at: 3000, chest: 'mega' },
];
// after the last reward the road goes on forever: a big chest every 100 trophies, 150 coins in between
export function pathNodes(upTo) {
  const out = [...PATH];
  for (let at = PATH.at(-1).at + 50; at <= Math.max(upTo, PATH.at(-1).at) + 100; at += 50) out.push(at % 100 ? { at, coins: 150 } : { at, chest: 'big' });
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
  if (node.chest) {
    s.chests[node.chest]++;
    s.chestsGot[node.chest]++;
    return { chest: node.chest };
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
  rainbow: { color: '#ff4d6d', pattern: 'rainbow', gift: true }, // the email-account gift: every ball, never sold
};
export const SKIN_PRICE = 150;
export const hasSkin = (s, ball, style) =>
  SKINS[style]?.gift ? s.accountGift && s.owned.includes(ball) : s.skins.includes(`${ball}:${style}`);
export function buySkin(s, ball, style) {
  if (!s.owned.includes(ball) || !SKINS[style] || SKINS[style].gift || hasSkin(s, ball, style) || s.coins < SKIN_PRICE) return false;
  s.coins -= SKIN_PRICE;
  s.skins.push(`${ball}:${style}`);
  s.skinOf[ball] = style;
  return true;
}
export function equipSkin(s, ball, style) {
  if (style == null) delete s.skinOf[ball];
  else if (hasSkin(s, ball, style)) s.skinOf[ball] = style;
}

// ---------- chests ----------
// Earned only: every CHEST_WINS wins, Glory Road nodes. Never sold. Odds are shown on the chest screen.
export const CHEST_WINS = 3;
export const CHESTS = {
  box: { coins: [25, 45], skin: 0.2, ball: 0.06 },
  big: { coins: [70, 110], skin: 0.45, ball: 0.18 },
  mega: { coins: [180, 260], skin: 1, ball: 0.4 },
};
// A win moves the chest meter; every CHEST_WINS wins drop a chest. Returns true when one dropped.
export function winTowardChest(s) {
  s.chestWins++;
  if (s.chestWins < CHEST_WINS) return false;
  s.chestWins = 0;
  s.chests.box++;
  s.chestsGot.box++;
  return true;
}
// Opens one chest of `kind`; `rand` is injected so tests are repeatable. Returns what fell out, or null.
export function openChest(s, kind, rand) {
  const c = CHESTS[kind];
  if (!c || !(s.chests[kind] > 0)) return null;
  s.chests[kind]--;
  s.chestsOpened[kind]++;
  const out = { kind, coins: c.coins[0] + Math.floor(rand() * (c.coins[1] - c.coins[0] + 1)), ball: null, skin: null };
  const balls = ORDER.filter(id => !s.owned.includes(id));
  if (balls.length && rand() < c.ball) { out.ball = balls[Math.floor(rand() * balls.length)]; s.owned.push(out.ball); }
  const skins = s.owned.flatMap(b => Object.keys(SKINS).filter(st => !SKINS[st].gift && !hasSkin(s, b, st)).map(st => [b, st]));
  if (skins.length && rand() < c.skin) { out.skin = skins[Math.floor(rand() * skins.length)]; s.skins.push(out.skin.join(':')); }
  s.coins += out.coins;
  return out;
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

// ---------- cloud merge ----------
// Combine this device's save with the cloud copy without losing anything: collections are unioned,
// counters take the larger value, today's quests keep the best progress. Trophies always come from the server.
const dayNum = key => (key ? new Date(...key.split('-').map((v, i) => (i === 1 ? v - 1 : +v))).getTime() : 0);
export function mergeSave(local, cloudRaw, server) {
  const cloud = migrate(cloudRaw), s = migrate(local);
  const union = (a, b) => [...new Set([...a, ...b])];
  s.coins = Math.max(s.coins, cloud.coins);
  s.owned = union(s.owned, cloud.owned);
  s.skins = union(s.skins, cloud.skins);
  s.claimed = union(s.claimed, cloud.claimed);
  s.achieved = union(s.achieved, cloud.achieved);
  s.created = union(s.created, cloud.created).slice(-100);
  s.answered = union(s.answered, cloud.answered).slice(-100);
  s.matches = Math.max(s.matches, cloud.matches);
  for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(s.stats[k], cloud.stats[k]);
  for (const [b, st] of Object.entries(cloud.skinOf)) s.skinOf[b] ??= st;
  // the win meter belongs to whichever copy has dropped more win chests (the other one is older)
  const dw = cloud.chestsGot.box - s.chestsGot.box;
  s.chestWins = dw > 0 ? cloud.chestWins : dw < 0 ? s.chestWins : Math.max(s.chestWins, cloud.chestWins);
  for (const k of Object.keys(CHESTS)) {
    s.chestsGot[k] = Math.max(s.chestsGot[k], cloud.chestsGot[k]);
    s.chestsOpened[k] = Math.max(s.chestsOpened[k], cloud.chestsOpened[k]);
    s.chests[k] = Math.max(0, s.chestsGot[k] - s.chestsOpened[k]);
  }
  s.accountGift ||= cloud.accountGift;
  if (arenaIndex(cloud.arenaSeen) > arenaIndex(s.arenaSeen)) s.arenaSeen = cloud.arenaSeen;
  if (dayNum(cloud.quests.day) > dayNum(s.quests.day)) s.quests = cloud.quests;
  else if (cloud.quests.day === s.quests.day) {
    for (const q of s.quests.list) {
      const c = cloud.quests.list.find(x => x.id === q.id);
      if (c) { q.progress = Math.max(q.progress, c.progress); q.claimed ||= c.claimed; }
    }
  }
  if (dayNum(cloud.daily.last) > dayNum(s.daily.last)) s.daily = cloud.daily;
  s.trophies = server.trophies;
  s.maxTrophies = Math.max(server.max_trophies, server.trophies);
  return s;
}
