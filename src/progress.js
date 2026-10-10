// Meta progression, pure functions over the save object (no DOM, so it runs under node --test):
// trophies, the Glory Road, chests, skins, daily quests, the 7-day reward, achievements, save migration.
// Halal rule: nothing is ever staked. Road rewards are fixed and shown in advance; chests are only earned by
// playing (never sold for coins or money) and their odds are shown, so opening one risks nothing.
import { ORDER, BALLS } from './balls.js';
import { LEVELS } from './match.js';
import { validNick } from './nick.js';
import { rng } from './sim.js';

// ---------- trophies ----------
// Every arena opens its own balls (Clash Royale style): Night 4, Canyon 3, Frost 3, Jungle 2, Lava 2, Space 1.
// The Glory Road gives each ball at its mark. leech/cell keep their old marks (players already claimed them).
export const UNLOCK = { basic: 0, leech: 10, cell: 30, spider: 85, ninja: 120, train: 180, magnet: 265, bomb: 350, turtle: 450, lightning: 550, hedgehog: 710, ice: 960, poison: 1210, chain: 1560, forge: 1910, chess: 220 };
// How rare each ball is — grows with the arena that opens it. Shown as a coloured frame and tag on its card.
export const RARITY = {
  basic: 'common', leech: 'common', cell: 'common', spider: 'common',
  ninja: 'rare', train: 'rare', chess: 'rare', magnet: 'rare', bomb: 'rare',
  turtle: 'mythic', lightning: 'mythic', hedgehog: 'mythic', ice: 'mythic',
  poison: 'legend', chain: 'legend', forge: 'legend',
};
// Balls in the order they unlock (ORDER itself never changes: challenge links store balls by their place in it)
export const BY_UNLOCK = [...ORDER].sort((a, b) => UNLOCK[a] - UNLOCK[b]);

// ---------- the familiar: a companion that gives all your balls a small bonus ----------
// It gains XP in fights; a level-up also costs coins, more each time. Your arena caps its level, and the opponents
// you meet there bring a familiar of the arena's usual level — so a maxed familiar never meets a level-1 one.
export const FAM = { maxLv: 10, hpPer: 0.02, dmgPer: 0.01 };
export const FAM_COST = [0, 0, 300, 700, 1500, 3000, 5000, 8000, 12000, 18000, 25000]; // coins to reach level i
export const FAMILIARS = { king: { rar: 'common', perk: 'all' }, dragon: { rar: 'rare', coins: 1200, perk: 'dmg' }, cat: { rar: 'rare', coins: 1200, perk: 'dash' }, owl: { rar: 'mythic', gems: 45, perk: 'meter' }, robot: { rar: 'mythic', coins: 2500, perk: 'armor' }, ghost: { rar: 'legend', gems: 80, perk: 'regen' } };
export const famNeed = lv => 60 * lv; // XP to fill before the next level can be bought
export const famCap = maxTrophies => Math.min(FAM.maxLv, 2 + Math.floor(arenaIndex(arenaFor(maxTrophies).id) * 0.75));
export const famPar = maxTrophies => Math.max(1, famCap(maxTrophies) - 1); // what the computer's familiar has here
// What a familiar gives at level lv. Every kind is worth about the same; they just play differently.
export function famBuff(lv, id = 'king') {
  const b = { hp: 1, dmg: 1, speed: 1, armor: 1, dash: 1, dashPow: 1, meter: 1, regen: 0 }, perk = FAMILIARS[id]?.perk ?? 'all';
  if (perk === 'all') { b.hp = 1 + FAM.hpPer * lv; b.dmg = 1 + FAM.dmgPer * lv; } // the King: a bit of both
  else if (perk === 'dmg') b.dmg = 1 + 0.035 * lv; // Dragon: harder hits
  else if (perk === 'dash') { b.dash = 1 + 0.08 * lv; b.dashPow = 1 + 0.045 * lv; } // Kitty: dashes come back sooner and hit harder
  else if (perk === 'meter') b.meter = 1 + 0.1 * lv; // Owlet: the super fills sooner
  else if (perk === 'armor') b.armor = 1 - 0.022 * lv; // Robot: takes less damage
  else if (perk === 'regen') b.regen = 0.35 * lv; // Ghost: heals a little every second (HP/s)
  return b;
}
export const famXp = (s, n) => { s.fam.xp = Math.min(famNeed(s.fam.lv), s.fam.xp + n); };
export function famUpgrade(s) {
  const lv = s.fam.lv, cost = FAM_COST[lv + 1];
  if (lv >= famCap(s.maxTrophies) || s.fam.xp < famNeed(lv) || s.coins < cost) return false;
  pay(s, 'coins', cost);
  s.fam.lv++;
  s.fam.xp = 0;
  return true;
}
export function famBuy(s, id) {
  const it = FAMILIARS[id];
  if (!it || s.fam.own.includes(id)) return false;
  const [cur, n] = it.gems ? ['gems', it.gems] : ['coins', it.coins ?? 0];
  if (s[cur] < n) return false;
  pay(s, cur, n);
  s.fam.own.push(id);
  s.fam.skin = id;
  return true;
}
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
  { id: 'night', at: 0 }, { id: 'candy', at: 60 }, { id: 'canyon', at: 120 }, { id: 'pirate', at: 230 },
  { id: 'frost', at: 350 }, { id: 'stadium', at: 500 }, { id: 'jungle', at: 700 }, { id: 'temple', at: 950 },
  { id: 'lava', at: 1200 }, { id: 'chess', at: 1550 }, { id: 'space', at: 1900 }, { id: 'neon', at: 2300 },
];
export const arenaFor = maxTrophies => ARENAS.reduce((a, x) => (maxTrophies >= x.at ? x : a), ARENAS[0]);
export const arenaIndex = id => Math.max(0, ARENAS.findIndex(a => a.id === id));
// a locked ball's tile: its trophy mark once you're in its arena ("Arena 1" there would confuse), else the arena that opens it
export const lockLabel = (id, maxTrophies) => arenaFor(UNLOCK[id]).at <= maxTrophies ? { trophies: UNLOCK[id] } : { arena: arenaIndex(arenaFor(UNLOCK[id]).id) + 1 };

// ---------- Brawl-Stars-style progression: ball ranks, leagues, titles ----------
// Every ball has its own path (Brawl Stars mastery): each ball in your squad earns points from each fight
// (a win +10, otherwise +3), and every rank pays out. Rank 7 gives that ball the Gold skin (it can't be
// bought or dropped), rank 10 gives the "Master" title. No stat boosts: ranks are pride and rewards only.
export const RANKS = [0, 20, 50, 90, 140, 200, 280, 380, 500, 650]; // points needed for rank 1..10
export const BALL_PATH = {
  2: { coins: 25 }, 3: { chest: 'box' }, 4: { coins: 50 }, 5: { chest: 'big' }, 6: { gems: 10 },
  7: { skin: 'gold' }, 8: { coins: 120 }, 9: { chest: 'mega' }, 10: { title: true, coins: 200 },
};
export const ballRank = pts => RANKS.reduce((r, at, i) => (pts >= at ? i + 1 : r), 1);
export const rankTier = r => (r >= 10 ? 'master' : r >= 9 ? 'diamond' : r >= 7 ? 'gold' : r >= 5 ? 'silver' : r >= 3 ? 'bronze' : 'wood');
export function gainMastery(s, squad, won) {
  const ups = [];
  for (const id of new Set(squad)) {
    if (!s.owned.includes(id)) continue; // a trial ball doesn't level
    const before = ballRank(s.mastery[id] ?? 0);
    s.mastery[id] = (s.mastery[id] ?? 0) + (won ? 10 : 3);
    for (let rank = before + 1; rank <= ballRank(s.mastery[id]); rank++) {
      const r = BALL_PATH[rank] ?? {};
      s.coins += r.coins ?? 0;
      s.gems += r.gems ?? 0;
      if (r.chest) { s.chests[r.chest]++; s.chestsGot[r.chest]++; }
      ups.push({ id, rank, ...r });
    }
  }
  return ups;
}

// Player level from experience: every fight gives XP (more for a win); each new level pays coins and gems.
export const XP_WIN = 20, XP_PLAY = 8;
export const xpNeed = lv => 60 + lv * 40; // XP from level lv to lv + 1
export function levelOf(xp) {
  let lv = 1, left = xp;
  while (left >= xpNeed(lv)) { left -= xpNeed(lv); lv++; }
  return { lv, xp: left, need: xpNeed(lv) };
}
export function gainXp(s, n) {
  const before = levelOf(s.xp).lv;
  s.xp += n;
  const ups = [];
  for (let lv = before + 1; lv <= levelOf(s.xp).lv; lv++) {
    const coins = 30 + lv * 10, gems = lv % 5 ? 2 : 10;
    s.coins += coins;
    s.gems += gems;
    ups.push({ lv, coins, gems });
  }
  return ups;
}

// Leagues by current trophies, each split into I–II–III like Brawl Stars ranked; Master has no tiers.
export const LEAGUES = [
  { id: 'bronze', at: 0 }, { id: 'silver', at: 100 }, { id: 'gold', at: 250 }, { id: 'diamond', at: 450 },
  { id: 'mythic', at: 700 }, { id: 'legend', at: 1000 }, { id: 'master', at: 1400 },
];
export function leagueFor(tr) {
  const i = LEAGUES.reduce((a, l, k) => (tr >= l.at ? k : a), 0), l = LEAGUES[i], next = LEAGUES[i + 1];
  if (!next) return { id: l.id, tier: 0, next: null };
  const step = (next.at - l.at) / 3, tier = Math.min(3, 1 + Math.floor((tr - l.at) / step));
  return { id: l.id, tier, next: tier < 3 ? Math.ceil(l.at + step * tier) : next.at };
}

// Titles shown under your nickname. Unlocked by playing; you pick one in the profile.
export const TITLES = [
  { id: 'rookie' }, { id: 'supporter', stat: 'supporter', goal: 1 }, // supporter: bought a gem pack
  { id: 'fighter', stat: 'wins', goal: 10 }, { id: 'veteran', stat: 'wins', goal: 50 }, { id: 'hero', stat: 'wins', goal: 200 },
  { id: 'flawless', stat: 'flawless', goal: 10 }, { id: 'superstar', stat: 'supers', goal: 100 },
  { id: 'social', stat: 'challenges', goal: 10 }, { id: 'stylish', stat: 'skins', goal: 10 }, { id: 'collector', stat: 'balls', goal: ORDER.length },
  ...ARENAS.slice(1).map(a => ({ id: 'arena_' + a.id, arena: a.id, stat: 'maxTrophies', goal: a.at })),
  ...ORDER.map(b => ({ id: 'master_' + b, ball: b, goal: RANKS.length })),
];
const titleValue = (s, x) => (x.ball ? ballRank(s.mastery[x.ball] ?? 0) : x.stat === 'skins' ? s.skins.length
  : x.stat === 'balls' ? s.owned.length : x.stat === 'supporter' ? s.bought.length : x.stat === 'maxTrophies' ? s.maxTrophies : s.stats[x.stat] ?? 0);
export const titleOk = (s, id) => { const x = TITLES.find(t => t.id === id); return !!x && (!x.goal || titleValue(s, x) >= x.goal); };

// ---------- save ----------
export function freshSave() {
  return {
    bought: [], // gem packs paid with money, by payment id
    nickChanges: 0, // the first nickname change is free
    v: 2, coins: 0, spent: { coins: 0, gems: 0, chest: 0 }, owned: ['basic'], squad: ['basic', 'basic', 'basic'], trophies: 0, maxTrophies: 0, matches: 0,
    nick: null, muted: false, music: true, avatar: 'basic', fav: null, // fav: the ball on the profile stand (null: the avatar)
    created: [], answered: [], // challenge link seeds I made / already got the bonus for
    claimed: [], skins: [], skinOf: {},
    chests: { box: 0, big: 0, mega: 0 }, // stash: chests from the road and ball paths, opened right away
    chestsGot: { box: 0, big: 0, mega: 0 }, chestsOpened: { box: 0, big: 0, mega: 0 }, // ever earned / ever opened: only grow, so merges can't revive opened chests
    accountGift: false, // made an email account: the rainbow skin is theirs on every ball
    arenaSeen: 'night', // the newest arena the player has been welcomed to (the unlock celebration shows once)
    mastery: {}, title: 'rookie', // ball rank points per ball; the title picked in the profile
    gems: 0, frags: {}, // gems; skin fragments by 'ball:style'
    slots: [null, null, null, null], cycle: 0, slotsOpened: [], // the 4 chest slots, the chest order, opened slot chest ids
    own: { aura: [], banner: [], deco: [], look: [], emote: [] }, wear: { aura: null, banner: 'night', deco: 'none', look: null },
    deals: [], adGems: { day: null, n: 0 },
    mailRead: [], mailClaimed: [], foeEmotes: true, shake: true, vibrate: true, // inbox ids read / gifts taken; show the opponent's emotes
    mode: 'classic', // classic | duo | boss | survival
    best: { survival: 0 }, // best results in the other modes (survival: waves cleared)
    xp: 0, // experience: the player level
    fam: { lv: 1, xp: 0, skin: 'king', own: ['king'] }, // the familiar: its level, XP toward the next one, look, looks owned
    quests: { day: null, list: [] }, daily: { last: null, streak: 0 }, achieved: [],
    stats: { wins: 0, matches: 0, dashes: 0, supers: 0, kills: 0, flawless: 0, challenges: 0, chests: 0, duoWins: 0, bossWins: 0, emotes: 0 },
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
  s.spent = { coins: int(r.spent?.coins) ?? 0, gems: int(r.spent?.gems) ?? 0, chest: int(r.spent?.chest) ?? 0 };
  s.bought = Array.isArray(r.bought) ? r.bought.filter(b => typeof b?.id === 'string' && b.id.length < 80 && Number.isInteger(b.gems) && b.gems > 0 && b.gems <= 1e5).slice(-200) : [];
  s.owned = ['basic', ...list(r.owned, id => BALLS[id] && id !== 'basic')];
  if (Array.isArray(r.squad) && r.squad.length === 3) s.squad = r.squad.map(id => (s.owned.includes(id) ? id : 'basic'));
  s.trophies = int(r.trophies) ?? (int(r.level, 1, LEVELS) ? (int(r.level, 1, LEVELS) - 1) * 15 : 0); // v1 ladder level → trophies
  s.maxTrophies = Math.max(s.trophies, int(r.maxTrophies) ?? 0);
  s.matches = int(r.matches) ?? 0;
  if (validNick(r.nick)) s.nick = r.nick;
  s.muted = r.muted === true;
  s.music = r.music !== false;
  if (BALLS[r.avatar]) s.avatar = r.avatar;
  if (BALLS[r.fav] && s.owned.includes(r.fav)) s.fav = r.fav;
  s.created = list(r.created, Number.isInteger).slice(-100);
  s.answered = list(r.answered, Number.isInteger).slice(-100);
  s.claimed = list(r.claimed, Number.isInteger);
  s.accountGift = r.accountGift === true;
  for (const id of ORDER) { const v = int(r.mastery?.[id]); if (v) s.mastery[id] = v; }
  s.skins = list(r.skins, k => typeof k === 'string' && /^[a-z]+:[a-z]+$/.test(k) && BALLS[k.split(':')[0]] && SKINS[k.split(':')[1]] && !SKINS[k.split(':')[1]].gift);
  for (const [b, st] of Object.entries(r.skinOf || {})) if (hasSkin(s, b, st)) s.skinOf[b] = st;
  for (const k of Object.keys(CHESTS)) {
    s.chests[k] = int(r.chests?.[k], 0, 999) ?? 0;
    s.chestsOpened[k] = int(r.chestsOpened?.[k]) ?? 0;
    s.chestsGot[k] = Math.max(int(r.chestsGot?.[k]) ?? 0, s.chests[k] + s.chestsOpened[k]);
  }
  if (ARENAS.some(a => a.id === r.arenaSeen)) s.arenaSeen = r.arenaSeen;
  if (TITLES.some(x => x.id === r.title)) s.title = r.title;
  s.gems = int(r.gems, 0, 1e6) ?? 0;
  for (const [k, v] of Object.entries(r.frags || {})) {
    const [b, st] = String(k).split(':'), n = int(v, 1, FRAG_NEED - 1);
    if (BALLS[b] && SKINS[st] && !SKINS[st].gift && !SKINS[st].path && n && !s.skins.includes(k)) s.frags[k] = n;
  }
  s.cycle = int(r.cycle) ?? 0;
  if (Array.isArray(r.slots)) s.slots = [0, 1, 2, 3].map(i => {
    const x = r.slots[i];
    return x && CHESTS[x.kind] && Number.isInteger(x.id) ? { id: x.id, kind: x.kind, at: Number.isFinite(x.at) ? x.at : null } : null;
  });
  s.slotsOpened = list(r.slotsOpened, Number.isInteger).slice(-40);
  for (const k of Object.keys(SHOP)) {
    s.own[k] = list(r.own?.[k], id => !!SHOP[k][id]);
    const w = r.wear?.[k];
    if (w === null && (k === 'aura' || k === 'look')) s.wear[k] = null;
    else if (owns(s, k, w)) s.wear[k] = w;
  }
  s.deals = list(r.deals, d => typeof d === 'string').slice(-12);
  const dealOk = d => d && Array.isArray(d.price) && ['coins', 'gems'].includes(d.price[0]) && Number.isInteger(d.price[1]) && d.price[1] > 0
    && (d.kind === 'skin' ? BALLS[d.ball] && SKINS[d.style] : !!SHOP[d.kind]?.[d.id]);
  if (typeof r.dealDay === 'string' && Array.isArray(r.dealList) && r.dealList.length <= 3 && r.dealList.every(dealOk)) { s.dealDay = r.dealDay; s.dealList = r.dealList; }
  s.mailRead = list(r.mailRead, Number.isInteger).slice(-60);
  s.mailClaimed = list(r.mailClaimed, Number.isInteger).slice(-60);
  s.foeEmotes = r.foeEmotes !== false;
  s.shake = r.shake !== false;
  s.vibrate = r.vibrate !== false;
  if (['classic', 'duo', 'boss', 'survival', 'football'].includes(r.mode)) s.mode = r.mode;
  s.best = { survival: int(r.best?.survival, 0, 9999) ?? 0 };
  s.nickChanges = int(r.nickChanges, 0, 9999) ?? 0;
  s.xp = int(r.xp) ?? 0;
  if (r.fam && typeof r.fam === 'object') {
    const own = ['king', ...list(r.fam.own, id => FAMILIARS[id] && id !== 'king')];
    s.fam = { lv: int(r.fam.lv, 1, FAM.maxLv) ?? 1, xp: int(r.fam.xp) ?? 0, own, skin: own.includes(r.fam.skin) ? r.fam.skin : 'king' };
  }
  if (r.adGems && typeof r.adGems.day === 'string') s.adGems = { day: r.adGems.day, n: int(r.adGems.n, 0, 99) ?? 0 };
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
  { at: 45, skin: ['basic', 'silver'] }, { at: 60, coins: 40 }, { at: 70, chest: 'box' }, { at: 80, coins: 50 }, { at: 90, gems: 10 },
  { at: 100, coins: 60 }, { at: 115, chest: 'big' }, { at: 125, skin: ['leech', 'neon'] }, { at: 150, coins: 70 },
  { at: 175, coins: 70 }, { at: 190, chest: 'box' }, { at: 200, coins: 80 }, { at: 230, gems: 15 }, { at: 240, skin: ['cell', 'candy'] },
  { at: 260, chest: 'big' }, { at: 280, coins: 90 }, { at: 320, coins: 90 }, { at: 340, chest: 'box' },
  { at: 360, coins: 100 }, { at: 400, skin: ['ninja', 'galaxy'] }, { at: 420, chest: 'big' }, { at: 440, coins: 110 }, { at: 470, gems: 20 },
  { at: 480, coins: 110 }, { at: 500, chest: 'mega' }, { at: 520, coins: 120 }, { at: 560, skin: ['train', 'lava'] },
  { at: 580, chest: 'big' }, { at: 600, coins: 130 }, { at: 630, gems: 20 }, { at: 650, coins: 130 }, { at: 660, coins: 130 },
  { at: 690, chest: 'box' }, { at: 700, skin: ['spider', 'mint'] }, { at: 720, coins: 140 }, { at: 740, chest: 'big' },
  { at: 750, coins: 150 }, { at: 780, coins: 150 }, { at: 800, skin: ['magnet', 'neon'] }, { at: 825, chest: 'big' },
  { at: 850, coins: 170 }, { at: 860, gems: 25 }, { at: 875, chest: 'box' }, { at: 900, skin: ['hedgehog', 'galaxy'] }, { at: 925, chest: 'big' },
  { at: 950, coins: 200 }, { at: 975, chest: 'box' }, { at: 1000, skin: ['lightning', 'candy'] }, { at: 1025, chest: 'mega' },
  { at: 1050, skin: ['bomb', 'lava'] }, { at: 1075, chest: 'box' }, { at: 1100, skin: ['turtle', 'neon'] }, { at: 1125, chest: 'big' },
  { at: 1150, skin: ['ice', 'mint'] }, { at: 1200, coins: 150 }, { at: 1250, chest: 'big' }, { at: 1300, skin: ['basic', 'galaxy'] },
  { at: 1350, coins: 160 }, { at: 1400, chest: 'big' }, { at: 1450, skin: ['leech', 'lava'] }, { at: 1500, chest: 'mega' },
  { at: 1550, coins: 170 }, { at: 1600, skin: ['cell', 'neon'] }, { at: 1650, chest: 'big' }, { at: 1700, coins: 180 },
  { at: 1750, skin: ['spider', 'candy'] }, { at: 1800, chest: 'big' }, { at: 1850, coins: 190 }, { at: 1900, skin: ['ninja', 'lava'] },
  { at: 2000, chest: 'mega' }, { at: 2050, coins: 200 }, { at: 2100, skin: ['train', 'mint'] }, { at: 2150, chest: 'big' },
  { at: 2200, coins: 210 }, { at: 2250, skin: ['magnet', 'lava'] }, { at: 2300, chest: 'big' }, { at: 2350, coins: 220 },
  { at: 2400, skin: ['bomb', 'galaxy'] }, { at: 2500, chest: 'mega' }, { at: 2550, coins: 230 }, { at: 2600, skin: ['turtle', 'mint'] },
  { at: 2650, chest: 'big' }, { at: 2700, coins: 240 }, { at: 2750, skin: ['hedgehog', 'neon'] }, { at: 2800, chest: 'big' },
  { at: 2850, coins: 250 }, { at: 2900, skin: ['ice', 'candy'] }, { at: 3000, chest: 'mega' },
].concat(ORDER.filter(id => id !== 'basic' && id !== 'leech' && id !== 'cell').map(id => ({ at: UNLOCK[id], ball: id }))).sort((a, b) => a.at - b.at);
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
  if (node.gems) { s.gems += node.gems; return { gems: node.gems }; }
  s.coins += node.coins;
  return { coins: node.coins };
}

// ---------- skins (looks only) ----------
export const SKINS = {
  silver: { color: '#c9d4e6', pattern: 'shine', price: 60, rar: 'common' }, // cheap, for coins
  gold: { color: '#f5c542', pattern: 'shine', path: 7, rar: 'legend' }, // only from the ball's own path (rank 7)
  neon: { color: '#151b30', pattern: 'neon', rar: 'rare' },
  candy: { color: '#ff7eb6', pattern: 'stripes', rar: 'rare' },
  galaxy: { color: '#3b2a7a', pattern: 'stars', rar: 'mythic' },
  lava: { color: '#e5482d', pattern: 'cracks', rar: 'mythic' },
  mint: { color: '#7be0c3', pattern: 'dots', rar: 'common' },
  rainbow: { color: '#ff4d6d', pattern: 'rainbow', gift: true, rar: 'legend' }, // the email-account gift: every ball, never sold
  // animated: they move all the time, in the fight too
  flame: { color: '#ff6a1f', pattern: 'flame', price: 600, rar: 'legend' },
  aurora: { color: '#1d3b6e', pattern: 'aurora', price: 400, rar: 'mythic' },
  storm: { color: '#2b2f5e', pattern: 'storm', price: 400, rar: 'mythic' },
};
export const SKIN_PRICE = 150;
export const skinPrice = style => SKINS[style]?.price ?? SKIN_PRICE;
export const hasSkin = (s, ball, style) =>
  SKINS[style]?.gift ? s.accountGift && s.owned.includes(ball)
    : s.skins.includes(`${ball}:${style}`) || (!!SKINS[style]?.path && s.owned.includes(ball) && ballRank(s.mastery?.[ball] ?? 0) >= SKINS[style].path);
// Every coin or gem spent goes through here: the running total lets a cloud merge work out the real balance.
// Gems bought with money never open a chest (its contents are random — that would be buying a lottery ticket).
// Cosmetics spend the bought gems first; what's left of the earned ones is all a chest can take.
export const paidGems = s => s.bought.reduce((n, b) => n + b.gems, 0);
export function freeGems(s) {
  const paid = paidGems(s), nonChest = s.spent.gems - s.spent.chest;
  return Math.max(0, Math.min(s.gems, s.gems + s.spent.gems - paid - s.spent.chest - Math.max(0, nonChest - paid)));
}
// Paid packs the server confirmed (claim_purchases): each payment once, ever. Returns the gems added.
export function creditPurchases(s, rows) {
  let got = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (typeof r?.id !== 'string' || !Number.isInteger(r.gems) || r.gems <= 0 || s.bought.some(b => b.id === r.id)) continue;
    s.bought.push({ id: r.id, gems: r.gems });
    s.gems += r.gems;
    got += r.gems;
  }
  return got;
}
export function pay(s, cur, n) {
  s[cur] -= n;
  s.spent[cur] += n;
}
export function buySkin(s, ball, style) {
  if (!s.owned.includes(ball) || !SKINS[style] || SKINS[style].gift || SKINS[style].path || hasSkin(s, ball, style) || s.coins < skinPrice(style)) return false;
  pay(s, 'coins', skinPrice(style));
  s.skins.push(`${ball}:${style}`);
  s.skinOf[ball] = style;
  return true;
}
export function equipSkin(s, ball, style) {
  if (style == null) delete s.skinOf[ball];
  else if (hasSkin(s, ball, style)) s.skinOf[ball] = style;
}

// ---------- chests ----------
// Earned only, never sold, odds shown on the chest screen. A chest gives coins, skin fragments (10 make a skin),
// sometimes gems and a new ball. Wins put chests into 4 slots in a fixed, published order (no random drops);
// a slot chest takes time to unlock (one at a time) and can be opened at once for gems or sped up with an ad.
// Chests from the Glory Road and ball paths are opened right away (save.chests).
export const FRAG_NEED = 10;
export const CHESTS = {
  box: { coins: [25, 45], stacks: 1, frags: [2, 4], gems: 0, ball: 0.04, emote: 0.08, tiers: ['common', 'rare'] },
  big: { coins: [70, 110], stacks: 2, frags: [3, 5], gems: 2, ball: 0.12, emote: 0.2, tiers: ['common', 'rare', 'epic'] },
  mega: { coins: [180, 260], stacks: 3, frags: [4, 6], gems: 5, ball: 0.35, skin: true, emote: 0.45, tiers: ['common', 'rare', 'epic', 'legend'] },
};
export const skinPool = s => s.owned.flatMap(b => Object.keys(SKINS).filter(st => !SKINS[st].gift && !SKINS[st].path && !hasSkin(s, b, st)).map(st => `${b}:${st}`));
export const chestBalls = s => ORDER.filter(id => !s.owned.includes(id) && UNLOCK[id] <= s.maxTrophies + 150); // a chest can bring a ball a little ahead of you
// What one chest of `kind` gives; `rand` is injected so tests are repeatable.
export function rollChest(s, kind, rand) {
  const c = CHESTS[kind], pickR = a => a[Math.floor(rand() * a.length)];
  const out = { kind, coins: c.coins[0] + Math.floor(rand() * (c.coins[1] - c.coins[0] + 1)), gems: c.gems, frags: [], ball: null, skin: null, emote: null };
  const emotes = EMOTE_LIST.filter(e => c.tiers.includes(e.tier) && !s.own.emote.includes(e.id));
  if (emotes.length && rand() < c.emote) { out.emote = pickR(emotes).id; s.own.emote.push(out.emote); }
  const balls = chestBalls(s);
  if (balls.length && rand() < c.ball) { out.ball = pickR(balls); s.owned.push(out.ball); }
  if (c.skin) { const pool = skinPool(s); if (pool.length) { out.skin = pickR(pool).split(':'); s.skins.push(out.skin.join(':')); delete s.frags[out.skin.join(':')]; } }
  for (let i = 0; i < c.stacks; i++) { // half the time the stack goes to the skin you're closest to finishing
    const pool = skinPool(s).filter(k => !out.frags.some(f => f.key === k));
    if (!pool.length) { out.coins += 10 * c.frags[1]; continue; } // nothing left to collect: coins instead
    const best = [...pool].sort((a, b) => (s.frags[b] ?? 0) - (s.frags[a] ?? 0))[0];
    const key = (s.frags[best] ?? 0) > 0 && rand() < 0.5 ? best : pickR(pool);
    const n = c.frags[0] + Math.floor(rand() * (c.frags[1] - c.frags[0] + 1)), have = Math.min(FRAG_NEED, (s.frags[key] ?? 0) + n);
    const done = have >= FRAG_NEED;
    if (done) { s.skins.push(key); delete s.frags[key]; } else s.frags[key] = have;
    out.frags.push({ key, ball: key.split(':')[0], style: key.split(':')[1], n, have, done });
  }
  s.coins += out.coins;
  s.gems += out.gems;
  s.stats.chests++;
  return out;
}
// Opens one chest from the stash (Glory Road, ball paths).
export function openChest(s, kind, rand) {
  if (!CHESTS[kind] || !(s.chests[kind] > 0)) return null;
  s.chests[kind]--;
  s.chestsOpened[kind]++;
  return rollChest(s, kind, rand);
}

export const SLOTS = 4;
export const CHEST_TIME = { box: 15 * 60e3, big: 60 * 60e3, mega: 3 * 3600e3 }; // ms to unlock
export const CHEST_CYCLE = ['box', 'box', 'big', 'box', 'box', 'big', 'box', 'box', 'box', 'big', 'box', 'mega']; // repeats
export const AD_SPEEDUP = 30 * 60e3; // one rewarded ad takes 30 minutes off
export const gemsToOpen = ms => Math.max(1, Math.ceil(ms / (6 * 60e3))); // 1 gem per 6 minutes left
// A win puts the next chest of the cycle into a free slot. Full slots: no chest (open one first).
export function winChest(s) {
  const i = s.slots.findIndex(x => !x);
  if (i < 0) return null;
  const kind = CHEST_CYCLE[s.cycle % CHEST_CYCLE.length];
  s.slots[i] = { id: ++s.cycle, kind, at: null }; // at = when it finishes unlocking (ms), null = not started
  return kind;
}
export const slotLeft = (slot, now) => (!slot ? null : slot.at == null ? CHEST_TIME[slot.kind] : Math.max(0, slot.at - now));
export const unlocking = (s, now) => s.slots.some(x => x && x.at != null && x.at > now);
export function startUnlock(s, i, now) {
  const slot = s.slots[i];
  if (!slot || slot.at != null || unlocking(s, now)) return false;
  slot.at = now + CHEST_TIME[slot.kind];
  return true;
}
export function speedUp(s, i, ms) {
  const slot = s.slots[i];
  if (!slot || slot.at == null) return false;
  slot.at -= ms;
  return true;
}
// Opens a slot chest: free when ready, or for gems before that.
export function openSlot(s, i, now, rand, withGems = false) {
  const slot = s.slots[i];
  if (!slot) return null;
  const left = slotLeft(slot, now);
  if (left > 0) {
    if (!withGems || freeGems(s) < gemsToOpen(left)) return null;
    pay(s, 'gems', gemsToOpen(left));
    s.spent.chest += gemsToOpen(left);
  }
  s.slots[i] = null;
  s.slotsOpened = [...s.slotsOpened, slot.id].slice(-40);
  return rollChest(s, slot.kind, rand);
}

// ---------- emotes: one of our balls pulling a face. Free ones to start; the rest from the shop or chests ----------
const E = (ball, mood, tier) => ({ id: `${ball}_${mood}`, ball, mood, tier, anim: tier === 'epic' || tier === 'legend' });
export const EMOTE_LIST = [
  E('basic', 'laugh', 'free'), E('basic', 'angry', 'free'), E('basic', 'cry', 'free'), E('basic', 'gg', 'free'),
  E('leech', 'laugh', 'common'), E('cell', 'wow', 'common'), E('turtle', 'sleepy', 'common'),
  E('ninja', 'cool', 'rare'), E('magnet', 'love', 'rare'), E('ice', 'cry', 'rare'), E('spider', 'angry', 'rare'),
  E('train', 'laugh', 'epic'), E('bomb', 'angry', 'epic'), E('lightning', 'love', 'legend'), E('forge', 'cool', 'legend'),
  E('hedgehog', 'sleepy', 'common'), E('chain', 'wow', 'rare'), E('chess', 'cool', 'rare'), E('poison', 'laugh', 'epic'),
  E('turtle', 'gg', 'epic'), E('chess', 'wow', 'epic'), E('train', 'love', 'legend'), E('poison', 'cool', 'legend'),
];
const EMOTE_PRICE = { free: {}, common: { coins: 150 }, rare: { gems: 20 }, epic: { gems: 50 }, legend: { gems: 100 } };

// ---------- the shop: auras, banners, decorations, arena looks, emotes (cosmetics only) ----------
// Prices in coins or gems. Gems come from playing (chests, the road, ball paths, day 7, ads).
export const SHOP = {
  aura: { fire: { gems: 40 }, frost: { gems: 40 }, storm: { gems: 60 }, hearts: { gems: 60 }, void: { gems: 80 }, stars: { gems: 100 } },
  banner: {
    night: {}, red: { coins: 2500 }, green: { coins: 2500 }, purple: { coins: 2500 }, orange: { coins: 2500 },
    sunset: { coins: 5000 }, ocean: { coins: 5000 }, galaxy: { coins: 5000 }, lava: { coins: 5000 }, gold: { coins: 5000 },
  },
  deco: {
    none: {}, target: { coins: 400 }, sword: { coins: 400 }, shield: { coins: 500 }, star: { gems: 25 },
    potion: { gems: 25 }, bolt: { gems: 30 }, flame: { gems: 40 }, trophy: { gems: 40 }, crown: { gems: 60 },
    rainbow: { coins: 800 }, rocket: { gems: 50 }, diamond: { gems: 70 },
  },
  look: { candy: { gems: 80 }, neon: { gems: 80 }, ocean: { gems: 80 } },
  emote: Object.fromEntries(EMOTE_LIST.map(e => [e.id, EMOTE_PRICE[e.tier]])),
};
const free = (kind, id) => !SHOP[kind]?.[id]?.coins && !SHOP[kind]?.[id]?.gems;
export const owns = (s, kind, id) => !!SHOP[kind]?.[id] && (free(kind, id) || s.own[kind].includes(id));
export const priceOf = (kind, id) => { const it = SHOP[kind]?.[id] ?? {}; return it.gems ? ['gems', it.gems] : ['coins', it.coins ?? 0]; };
export function buy(s, kind, id, price = priceOf(kind, id)) {
  const [cur, n] = price;
  if (!SHOP[kind]?.[id] || owns(s, kind, id) || s[cur] < n) return false;
  pay(s, cur, n);
  s.own[kind].push(id);
  s.wear[kind] = id;
  return true;
}
export function wear(s, kind, id) {
  if (id == null && (kind === 'aura' || kind === 'look')) s.wear[kind] = null;
  else if (owns(s, kind, id)) s.wear[kind] = id;
}
// Three deals a day, the same for everyone: a skin for coins and two cosmetics, all 40% off.
export function dailyDeals(s, today) {
  if (s.dealDay !== today || !s.dealList) { s.dealDay = today; s.dealList = pickDeals(s, today); }
  return s.dealList.map((d, i) => ({ ...d, key: `${today}:${i}`, sold: s.deals.includes(`${today}:${i}`) }));
}
function pickDeals(s, today) {
  let h = hash(today);
  const next = n => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h % n; };
  const deals = [];
  const pool = skinPool(s);
  if (pool.length) { const k = pool[next(pool.length)], [ball, style] = k.split(':'); deals.push({ kind: 'skin', ball, style, price: ['coins', Math.round(skinPrice(style) * 0.6)] }); }
  for (const kind of ['aura', 'deco', 'banner']) {
    const ids = Object.keys(SHOP[kind]).filter(id => !free(kind, id) && !owns(s, kind, id));
    if (ids.length && deals.length < 3) { const id = ids[next(ids.length)], [cur, n] = priceOf(kind, id); deals.push({ kind, id, price: [cur, Math.max(1, Math.round(n * 0.6))] }); }
  }
  return deals;
}
export function buyDeal(s, deal) {
  if (deal.sold || s.deals.includes(deal.key)) return false;
  const [cur, n] = deal.price;
  if (s[cur] < n) return false;
  if (deal.kind === 'skin') {
    if (!s.owned.includes(deal.ball) || hasSkin(s, deal.ball, deal.style)) return false;
    pay(s, cur, n);
    s.skins.push(`${deal.ball}:${deal.style}`);
    s.skinOf[deal.ball] = deal.style;
  } else if (!buy(s, deal.kind, deal.id, deal.price)) return false;
  s.deals = [...s.deals, deal.key].slice(-12);
  return true;
}
export const AD_GEMS = 2, AD_GEMS_DAY = 5; // free gems for a rewarded ad, a few times a day
export function adGems(s, today) {
  if (s.adGems.day !== today) s.adGems = { day: today, n: 0 };
  if (s.adGems.n >= AD_GEMS_DAY) return 0;
  s.adGems.n++;
  s.gems += AD_GEMS;
  return AD_GEMS;
}

// ---------- days ----------
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export function prevDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}
function hash(str) { return [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7); }

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
const STYLE_ORDER = ['silver', 'neon', 'candy', 'galaxy', 'lava', 'mint'];
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
  if (!st.skin) { s.coins += 200; s.gems += 10; return { coins: 200, gems: 10 }; }
  s.skins.push(st.skin.join(':'));
  s.gems += 10;
  return { skin: st.skin, gems: 10 };
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
  { id: 'chests10', stat: 'chests', goal: 10, coins: 60 }, { id: 'chests50', stat: 'chests', goal: 50, coins: 200 },
  { id: 'skins5', stat: 'skinsOwned', goal: 5, coins: 80 }, { id: 'skins20', stat: 'skinsOwned', goal: 20, coins: 250 },
  { id: 'level5', stat: 'level', goal: 5, coins: 100 }, { id: 'level10', stat: 'level', goal: 10, coins: 250 },
  { id: 'rank5', stat: 'bestRank', goal: 5, coins: 100 }, { id: 'rank10', stat: 'bestRank', goal: 10, coins: 300 },
  { id: 'duo10', stat: 'duoWins', goal: 10, coins: 100 }, { id: 'boss5', stat: 'bossWins', goal: 5, coins: 120 },
  { id: 'emotes20', stat: 'emotes', goal: 20, coins: 40 },
];
export const achievementValue = (s, a) => ({
  maxTrophies: () => s.maxTrophies, ballsOwned: () => s.owned.length, skinsOwned: () => s.skins.length, level: () => levelOf(s.xp).lv,
  bestRank: () => Math.max(1, ...s.owned.map(id => ballRank(s.mastery[id] ?? 0))),
}[a.stat]?.() ?? s.stats[a.stat] ?? 0);
export function claimAchievement(s, id) {
  const a = ACHIEVEMENTS.find(a => a.id === id);
  if (!a || s.achieved.includes(id) || achievementValue(s, a) < a.goal) return 0;
  s.achieved.push(id);
  s.coins += a.coins;
  return a.coins;
}

// ---------- shop ----------
// ---------- cloud merge ----------
// Combine this device's save with the cloud copy without losing anything: collections are unioned,
// counters take the larger value, today's quests keep the best progress. Trophies always come from the server.
const dayNum = key => (key ? new Date(...key.split('-').map((v, i) => (i === 1 ? v - 1 : +v))).getTime() : 0);
export function mergeSave(local, cloudRaw, server) {
  const cloud = migrate(cloudRaw), s = migrate(local);
  const union = (a, b) => [...new Set([...a, ...b])];
  for (const cur of ['coins', 'gems']) { // balance = the most ever earned − the most ever spent, so a purchase is never refunded
    const earned = Math.max(s[cur] + s.spent[cur], cloud[cur] + cloud.spent[cur]);
    s.spent[cur] = Math.max(s.spent[cur], cloud.spent[cur]);
    s[cur] = Math.max(0, earned - s.spent[cur]);
  }
  s.spent.chest = Math.max(s.spent.chest, cloud.spent.chest);
  s.bought = [...s.bought, ...cloud.bought.filter(b => !s.bought.some(x => x.id === b.id))];
  s.owned = union(s.owned, cloud.owned);
  s.fav ??= cloud.fav;
  s.skins = union(s.skins, cloud.skins);
  s.claimed = union(s.claimed, cloud.claimed);
  s.achieved = union(s.achieved, cloud.achieved);
  s.created = union(s.created, cloud.created).slice(-100);
  s.answered = union(s.answered, cloud.answered).slice(-100);
  s.nickChanges = Math.max(s.nickChanges, cloud.nickChanges);
  s.best.survival = Math.max(s.best.survival, cloud.best.survival);
  s.matches = Math.max(s.matches, cloud.matches);
  for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(s.stats[k], cloud.stats[k]);
  for (const [b, st] of Object.entries(cloud.skinOf)) s.skinOf[b] ??= st;
  for (const [k, v] of Object.entries(cloud.frags)) if (!s.skins.includes(k)) s.frags[k] = Math.max(s.frags[k] ?? 0, v);
  for (const k of Object.keys(s.frags)) if (s.skins.includes(k)) delete s.frags[k];
  // slot chests: union by id, minus any opened on either copy
  s.cycle = Math.max(s.cycle, cloud.cycle);
  s.slotsOpened = [...new Set([...s.slotsOpened, ...cloud.slotsOpened])].slice(-40);
  const live = new Map();
  for (const x of [...s.slots, ...cloud.slots]) if (x && !s.slotsOpened.includes(x.id)) {
    const had = live.get(x.id);
    live.set(x.id, had && had.at != null && (x.at == null || had.at < x.at) ? had : x);
  }
  const kept = [...live.values()].sort((a, b) => a.id - b.id).slice(0, SLOTS);
  s.slots = [0, 1, 2, 3].map(i => kept[i] ?? null);
  for (const k of Object.keys(SHOP)) s.own[k] = union(s.own[k], cloud.own[k]);
  s.deals = union(s.deals, cloud.deals).slice(-12);
  s.mailRead = union(s.mailRead, cloud.mailRead).slice(-60);
  s.xp = Math.max(s.xp, cloud.xp);
  if (cloud.fam.lv > s.fam.lv || (cloud.fam.lv === s.fam.lv && cloud.fam.xp > s.fam.xp)) Object.assign(s.fam, { lv: cloud.fam.lv, xp: cloud.fam.xp });
  s.fam.own = [...new Set([...s.fam.own, ...cloud.fam.own])];
  s.mailClaimed = union(s.mailClaimed, cloud.mailClaimed).slice(-60);
  for (const k of Object.keys(CHESTS)) {
    s.chestsGot[k] = Math.max(s.chestsGot[k], cloud.chestsGot[k]);
    s.chestsOpened[k] = Math.max(s.chestsOpened[k], cloud.chestsOpened[k]);
    s.chests[k] = Math.max(0, s.chestsGot[k] - s.chestsOpened[k]);
  }
  s.accountGift ||= cloud.accountGift;
  if (arenaIndex(cloud.arenaSeen) > arenaIndex(s.arenaSeen)) s.arenaSeen = cloud.arenaSeen;
  for (const [id, v] of Object.entries(cloud.mastery)) s.mastery[id] = Math.max(s.mastery[id] ?? 0, v);
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
