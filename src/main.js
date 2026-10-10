// Browser layer: screens, aiming, the battle loop, saving, ads wiring.
import { createWorld, launch, step, act, canSuper, rng, W, H, SUDDEN, DASH, METER, MAPS, FOOT } from './sim.js';
import { BALLS, ORDER } from './balls.js';
import { createMatch, roundWorld, endRound, revive, aiAngle, bossSpec, upgradeChoices, applyUpgrade, SURVIVAL } from './match.js';
import { BOSSES, BOSS_IDS } from './boss.js';
import { draw, drawIcon, fitCanvas, resetFx, M, emote, drawEmote, setAutoEmote, pickMood, setAuras, setFoeEmotes, setBossNames, setShakeOn, cinema, bigText } from './render.js';
import { lang, t, ballName, ballAbout, superName, superAbout, skinName, LANGS, setLang, langChosen } from './i18n.js';
const RECORD = new URLSearchParams(location.search).get('record'); // ?record[=a,b]: chrome-free 9:16 spectator page for screen recordings
import { createAI } from './ai.js';
import { initAds, offerReward, cancelReward, interstitial } from './ads.js';
import { randomNick, nickText, validNick, validClan } from './nick.js';
import { encodeChallenge, decodeChallenge, newSeed } from './challenge.js';
import { initAudio, setMuted, sfx, confetti, playMusic, setMusicOn } from './sfx.js';
import {
  migrate, aiLevel, enemyHpMulFor, enemySquadFor, winCoinsFor, LOSE_COINS, UNLOCK, trophyLoss, winChest,
  claimable, pathNodes, track, dayKey, refreshQuests, gainMastery, EMOTE_LIST, owns, arenaFor, ARENAS, lockLabel, BY_UNLOCK, RARITY, SHOP, levelOf, FAMILIARS, famCap, famPar, famBuff, famXp, gainXp, XP_WIN, XP_PLAY, SKINS, creditPurchases,
} from './progress.js';
const anyMap = () => { const k = Object.keys(MAPS); return k[Math.floor(Math.random() * k.length)]; };
import { createHome } from './meta.js';
import { heroLive } from './heroes.js';
import { LOGO } from './logo.js';
document.querySelector('.brand').innerHTML = LOGO; // the Stitch wordmark (the plain text stays for no-JS)
import * as online from './net.js';
const { net } = online;

const $ = s => document.querySelector(s);
const el = (tag, cls = '', html) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const icon = (kind, size, skin = null, aura = null) => { const c = document.createElement('canvas'); drawIcon(c, kind, size, skin, aura); return c; };
const STEP = 1 / 60, AIM_TIME = 8; // seconds to aim before the round fires itself

// ---------- save (localStorage is user-editable: migrate() validates everything) ----------
const KEY = 'ballbrawl.v1';
let raw = {};
try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* corrupt or blocked storage: start fresh */ }
const save = migrate(raw);
save.nick ??= randomNick();
refreshQuests(save, dayKey());
const persist = () => {
  save.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ }
  online.queueSync(save);
};

// ---------- state ----------
const S = {
  mode: 'home', // home | squad | aim | fight | ending | result | watch-pick | watch | challenge
  world: null, match: null, demo: false, demoEnd: 0,
  aim: 0, aiming: false, slot: 0,
  trial: null, pendingTrial: null, tryPlay: null, info: null, // info = the ball whose description the squad screen shows
  watch: ['leech', 'train'], launchAt: 0, watchDone: false,
  endAt: 0, outcome: null, earned: 0, delta: 0, adAfter: 0,
  ai: null, ais: [], dashed: false, // ai = opponent in a match; ais = both sides in demo / watch
  aiLevel: 1, freezeUntil: 0, slowUntil: 0, // freeze = hit-stop: pauses stepping only, the sim itself is untouched
  challenge: null, // decoded friend challenge while playing one
  nextSeed: 1, // the next match's seed, fixed when you open the squad screen so its preview is the real fight
  foeAim: 0, aimLeft: 0, watchAims: [0, 0], watchEndAt: 0, // the opponent's shot is drawn during the aim phase, like the original
  ms: { dashes: 0, supers: 0, kills: 0 }, // this match's stats, for quests
  opponent: null, // a real player's squad from the server (null = computer squad)
  ranked: false, matchId: null, matchStart: 0, // ranked = online match whose trophies the server decides
  settleLater: false, // a loss waits for the revive offer before it's reported
};

const canvas = $('#arena'), ctx = canvas.getContext('2d');
let scale = 1;
function layout() {
  const reserved = 56 + 44 + 110 + (innerWidth < 760 ? 96 : 0); // header, hud, controls + footer (+ the commanders' row on phones)
  const width = RECORD != null ? Math.min(innerWidth, (innerHeight * 9) / 16) : innerWidth; // record mode: a 9:16 page
  const size = Math.max(260, Math.floor(Math.min(width - 24, innerHeight - (RECORD != null ? 150 : reserved), 560)));
  document.documentElement.style.setProperty('--size', size + 'px');
  scale = fitCanvas(canvas, size);
}

const SCREENS = ['squad', 'result', 'watch', 'challenge'];
function show(screen) {
  for (const s of SCREENS) $('#scr-' + s).hidden = s !== screen;
  if (S.mode !== 'home') home.hide();
  $('#hud').hidden = !['aim', 'fight', 'ending', 'watch'].includes(S.mode);
  $('#controls').hidden = !['aim', 'fight', 'ending'].includes(S.mode);
  $('#watch-bar').hidden = S.mode !== 'watch';
  $('#cmds').hidden = !S.fams || !['aim', 'fight', 'ending'].includes(S.mode);
  if (screen || S.mode === 'home') { $('#banner').className = 'banner'; $('#cards').hidden = true; }
}

function banner(text, stay = false, tone = '', html = false) {
  const b = $('#banner');
  b[html ? 'innerHTML' : 'textContent'] = text;
  b.className = 'banner';
  void b.offsetWidth; // restart the CSS animation
  b.className = `banner ${stay ? 'stay' : 'show'} ${tone}`;
}

const coinsUI = () => { $('#coins').textContent = save.coins; $('#gems').textContent = save.gems; };

// Round-start cards in the arena's top corners: who fights whom and what each ball does (hidden once the balls fly).
let cardsHide = 0;
function cards(a, b) {
  clearTimeout(cardsHide);
  const box = $('#cards');
  box.replaceChildren(...[[a, ''], [b, ' foe']].map(([e, cls]) => {
    const c = el('div', 'cardab' + cls);
    c.append(icon(e.kind, 32, e.skin), el('div', '', '<b></b><small></small>'));
    c.querySelector('b').textContent = ballName(e.kind);
    c.querySelector('small').textContent = ballAbout(e.kind);
    return c;
  }));
  box.classList.remove('fade');
  box.hidden = false;
}
function hideCards() {
  $('#cards').classList.add('fade');
  cardsHide = setTimeout(() => { $('#cards').hidden = true; }, 400);
}
const myNick = () => nickText(save.nick, lang);

let toastTimer = 0;
function toast(text) {
  const n = $('#toast');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, 2600);
}

// A random AI-vs-AI fight that plays behind the menus.
function demo() {
  const r = Math.random, pick = () => ORDER[Math.floor(r() * ORDER.length)];
  S.world = createWorld({ seed: Math.floor(r() * 1e9), a: { id: pick() }, b: { id: pick() }, map: anyMap() });
  launch(S.world, r() * Math.PI * 2, r() * Math.PI * 2);
  S.ais = [createAI(0, 12, Math.floor(r() * 1e9)), createAI(1, 12, Math.floor(r() * 1e9))];
  S.demo = true;
  S.demoEnd = 0;
  setAuras({});
  S.fams = null;
  resetFx();
}

// ---------- friend challenges (all data lives in the link) ----------
async function shareChallenge(reply = null) {
  const seed = newSeed();
  save.created = [...save.created, seed].slice(-100);
  track(save, { challenges: 1 });
  persist();
  online.logEvent('challenge_created');
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}c/#${encodeChallenge({ squad: save.squad, seed, nick: save.nick, level: aiLevel(save.trophies), reply })}`;
  const text = t('shareText', { nick: myNick() });
  try {
    if (navigator.share) return await navigator.share({ title: 'BallBrawl', text, url });
  } catch (e) {
    if (e?.name === 'AbortError') return; // user closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast(t('copied'));
  } catch {
    prompt(t('copyManual'), url); // ponytail: last-resort copy when the clipboard is blocked
  }
}

function goChallenge() {
  const c = S.challenge;
  S.mode = 'challenge';
  if (!S.demo) demo();
  const name = nickText(c.nick, lang);
  const mine = c.reply && save.created.includes(c.reply.seed);
  $('#c-reply').hidden = !mine;
  if (mine) $('#c-reply').textContent = t({ w: 'replyWon', l: 'replyLost', d: 'replyDraw' }[c.reply.result], { nick: name });
  $('#c-title').textContent = t('challengeTitle', { nick: name });
  $('#c-squad').replaceChildren(...c.squad.map(id => icon(id, 44)));
  show('challenge');
}

function startChallenge() {
  const c = S.challenge;
  // challenges are mirror matches: no familiar bonus either
  S.fams = null;
  S.match = createMatch({ squadA: [...c.squad], squadB: [...c.squad], hpMulB: 1, seed: c.seed, skinsA: save.skinOf }); // mirror squads: only skill decides
  S.aiLevel = c.level;
  beginMatch();
}

// ---------- home ----------
const home = createHome({
  save, persist, el, icon, coinsUI, toast, online,
  onPlay: () => (save.mode === 'duo' || save.mode === 'boss' ? partyChoice() : goSquad()), // only these two can be played with friends
  onWatch: () => goWatch(),
  onChallenge: () => shareChallenge(),
  onInviteFriend: f => inviteFriend(f),
});
function goHome(tab) {
  if (S.party) partyLeave();
  cancelReward();
  S.mode = 'home';
  S.challenge = null;
  if (!S.demo) demo();
  show(null);
  home.open(tab);
  playMusic('lobby');
}

// ---------- squad & shop ----------
const has = id => save.owned.includes(id) || S.trial === id;

function goSquad() {
  S.mode = 'squad';
  if (!S.demo) demo();
  S.slot = 0;
  S.info = null;
  S.tryPlay = null;
  S.nextSeed = newSeed();
  S.opponent = null;
  show('squad');
  renderSquad();
  const seed = S.nextSeed;
  if (net.online) online.findOpponent().then(o => {
    if (S.mode !== 'squad' || seed !== S.nextSeed || !o || !Array.isArray(o.squad) || o.squad.length !== 3 || !o.squad.every(id => BALLS[id])) return;
    S.opponent = o;
    renderSquad();
  }).catch(() => {});
  if (!S.trial) offerReward('try-ball', {
    onAvailable: play => { S.tryPlay = play; renderSquad(); },
    onReward: () => { S.trial = S.pendingTrial; place(S.trial); },
    onDone: () => { S.tryPlay = null; renderSquad(); },
  });
}

function place(id) {
  S.info = id;
  save.squad[S.slot] = id;
  S.slot = (S.slot + 1) % 3;
  persist();
  renderSquad();
}

function renderSquad() {
  $('#s-level').innerHTML = `<i class="trophy" style="vertical-align:-3px"></i> ${save.trophies}`;
  $('#s-slots').replaceChildren(...save.squad.map((id, i) => {
    const b = el('button', 'slot' + (i === S.slot ? ' active' : ''));
    b.append(el('b', '', String(i + 1)), icon(id, 46, save.skinOf[id]));
    b.title = ballName(id);
    b.onclick = () => { S.slot = i; renderSquad(); };
    return b;
  }));

  const mul = enemyHpMulFor(save.trophies), o = S.opponent;
  $('#s-enemy').replaceChildren(...enemySquad().map(id => icon(id, 34, o?.skins?.[id] ?? null)));
  $('#scr-squad .enemy small').textContent = t('enemy') + (mul > 1 ? ` · HP ×${mul.toFixed(2).replace(/0$/, '')}` : '');
  const note = $('#s-note');
  note.textContent = !net.online ? t('training') : o ? t('vsPlayer', { nick: nickText(o.nick, lang), n: o.trophies }) : t('vsBots');
  note.className = 'squad-note' + (net.online ? ' live' : '');

  const info = S.info ?? save.squad[0]; // what the last tapped ball does
  $('#s-info').innerHTML = `<span class="si-head"><b></b><span class="hp-pill">${HEART}${BALLS[info].hp} ${t('hp')}</span></span><span class="si-about"></span>`
    + `<span class="si-super"><i>${BOLT}</i><span><b></b><span></span></span></span>`;
  $('#s-info .si-head b').textContent = ballName(info);
  $('#s-info .si-head b').after(Object.assign(el('i', `rar-chip r-${RARITY[info]}`), { textContent: t('rarity_' + RARITY[info]) }));
  $('#s-info .si-about').textContent = ballAbout(info);
  $('#s-info .si-super b').textContent = `${t('super')} · ${superName(info)}`;
  $('#s-info .si-super span span').textContent = superAbout(info);

  $('#s-cards').replaceChildren(...BY_UNLOCK.map(id => {
    const d = BALLS[id], ok = has(id), slots = save.squad.map((s, i) => (s === id ? i + 1 : 0)).filter(Boolean);
    const tile = el('div', `tile r-${RARITY[id]}` + (ok ? '' : ' locked') + (id === info ? ' info' : ''));
    tile.style.setProperty('--c', d.color);
    if (ok && slots.length) tile.append(el('i', 'pos', slots.join('·')));
    tile.append(icon(id, 60, save.skinOf[id]), el('b', ''), el('small', ''));
    tile.children[slots.length && ok ? 2 : 1].textContent = ballName(id);
    const small = tile.lastChild;
    if (ok) {
      small.textContent = save.owned.includes(id) ? `${d.hp} ${t('hp')}` : '★ ' + t('trial');
      tile.append(el('i', 'tag')); // its super, like a card's ability tag
      tile.lastChild.textContent = superName(id);
    }
    else {
      const L = lockLabel(id, save.maxTrophies);
      if (L.trophies) small.innerHTML = `<i class="trophy"></i>${L.trophies}`; else small.textContent = t('arenaN', { n: L.arena });
      if (S.tryPlay && !S.trial) {
        const tr = el('button', 'btn sm ad', t('trial'));
        tr.onclick = e => { e.stopPropagation(); S.pendingTrial = id; S.tryPlay(); };
        tile.append(tr);
      }
    }
    tile.onclick = () => { sfx.click(); if (ok) place(id); else { S.info = id; renderSquad(); } };
    return tile;
  }));
}

// ---------- battle ----------
const enemySquad = () => (S.opponent ? S.opponent.squad : enemySquadFor(save.trophies, rng(S.nextSeed)));

async function startMatch() {
  setAutoEmote([1]);
  setAuras({ 0: save.wear.aura });
  if (S.mode !== 'squad') return;
  cancelReward();
  S.mode = 'starting';
  $('#s-fight').disabled = $('#s-back').disabled = true; // leaving now would orphan a server match (= a loss)
  S.matchId = null;
  const mode = save.mode;
  if (net.online && mode === 'classic') { // only classic counts for trophies
    try { S.matchId = await online.startMatch(S.opponent?.id); } catch { /* server unreachable: this one is training */ }
  }
  $('#s-fight').disabled = $('#s-back').disabled = false;
  S.ranked = !!S.matchId;
  S.matchStart = Date.now();
  // familiars: yours (capped by your arena) and the opponent's — a real player's, or the arena's usual level
  const cap = famCap(save.maxTrophies), of = S.opponent?.fam;
  const lvB = Number.isInteger(of?.lv) ? Math.min(cap, Math.max(1, of.lv)) : famPar(save.maxTrophies);
  S.fams = { 0: { id: save.fam.skin, lv: Math.min(save.fam.lv, cap) }, 1: { id: FAMILIARS[of?.skin] ? of.skin : Object.keys(FAMILIARS)[S.nextSeed % 6], lv: lvB } };
  S.match = createMatch({
    famA: famBuff(S.fams[0].lv, S.fams[0].id), famB: famBuff(S.fams[1].lv, S.fams[1].id),
    squadA: [...save.squad],
    squadB: enemySquad(), // a real player's squad is still piloted by the AI, at your trophies' difficulty
    hpMulB: enemyHpMulFor(save.trophies),
    seed: S.nextSeed,
    skinsA: save.skinOf,
    skinsB: S.opponent?.skins ?? {},
    mode,
    map: arenaFor(save.maxTrophies).id, // your arena decides the map
    boss: nextBoss(),
    pool: mode === 'survival' ? [...enemySquadFor(save.trophies, Math.random), ...enemySquadFor(save.trophies, Math.random)] : null,
  });
  S.aiLevel = aiLevel(save.trophies);
  commanders(S.fams, foeCard().nick);
  show(null);
  playMusic(null); // quiet for the face-to-face and the fight
  await home.vs(foeCard(), S.fams[0]); // both banners first, like Clash Royale
  beginMatch();
}
// A different boss every fight, starting from the day's boss.
function nextBoss() {
  S.bossTurn = (S.bossTurn ?? Math.floor(Date.now() / 864e5)) + 1;
  setBossNames(Object.fromEntries(BOSS_IDS.map(id => [id, t('boss_' + id)])));
  return BOSS_IDS[S.bossTurn % BOSS_IDS.length];
}
const RAIN_CLOUD = '<svg class="r-rain" viewBox="0 0 60 44" aria-hidden="true"><path d="M14 26a9 9 0 0 1 2-17 12 12 0 0 1 23-2 9 9 0 0 1 7 19z" fill="#5B6478" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path class="r-drop" d="M20 32l-2 6M31 32l-2 6M42 32l-2 6" stroke="#7FD3FF" stroke-width="3" stroke-linecap="round"/></svg>';
// The commanders: yours on the left, theirs on the right, big, cheering and flinching with the fight.
function commanders(fams, foeNick) {
  for (const [side, cls] of [[0, 'you'], [1, 'them']]) {
    const box = $('#cmds .cmd.' + cls), f = fams[side];
    box.querySelector('.cmd-art').innerHTML = heroLive(f.id);
    box.querySelector('.cmd-name').textContent = `${side ? foeNick : nickText(save.nick, lang)} · ${t('famLv', { n: f.lv })}`;
    box.className = 'cmd ' + cls;
    box.hidden = side === 1 && ['boss', 'survival'].includes(S.match?.mode); // the boss (and the waves) lead themselves
  }
}
function cmdReact(side, kind, talk = false) {
  const box = $('#cmds .cmd.' + (side ? 'them' : 'you'));
  if (!box || $('#cmds').hidden || box.hidden) return;
  box.classList.remove('cheer', 'ouch', 'cast', 'point', 'win', 'sad');
  void box.offsetWidth; // restart the animation
  box.classList.add(kind);
  clearTimeout(box.calm);
  if (kind !== 'win' && kind !== 'sad') box.calm = setTimeout(() => box.classList.remove(kind), 800); // then back to breathing
  const now = performance.now(), say = box.querySelector('.cmd-say');
  if (!talk || now < (box.saidAt ?? 0) + 7000) return; // a word now and then, not on every bump
  box.saidAt = now;
  say.textContent = t('cmdSay_' + kind);
  say.classList.remove('on');
  void say.offsetWidth;
  say.classList.add('on');
}
// How the opponent looks on the VS screen: a real player's banner, clan and level; the computer shows its lead ball.
function foeCard() {
  const o = S.opponent, lead = S.match.b[0];
  if (S.match.mode === 'survival') return { nick: t('mode_survival'), banner: 'night', deco: 'none', avatar: S.match.pool[0], skin: null, level: null, trophies: save.trophies, clan: null, fam: S.fams[1] };
  if (S.match.mode === 'boss') return { nick: t('boss_' + S.match.boss), banner: 'lava', deco: 'none', avatar: BOSSES[S.match.boss].ball, skin: BOSSES[S.match.boss].skin ?? null, level: null, trophies: save.trophies, clan: null, fam: S.fams[1] };
  if (!o) return { nick: t('enemy'), banner: 'night', deco: 'none', avatar: lead.id, skin: lead.skin, level: null, trophies: save.trophies, clan: null, fam: S.fams[1] };
  const ok = (v, list) => (typeof v === 'string' && Object.hasOwn(list, v) ? v : null);
  const clan = o.clan && validClan(o.clan.name) ? { name: o.clan.name, badge: Math.min(7, Math.max(0, Number(o.clan.badge) || 0)) } : null;
  const avatar = ok(o.avatar, BALLS) ?? lead.id;
  return {
    nick: nickText(o.nick, lang), banner: ok(o.banner, SHOP.banner) ?? 'night', deco: ok(o.deco, SHOP.deco) ?? 'none',
    avatar, skin: o.skins?.[avatar] ?? null, level: Number.isFinite(o.xp) ? levelOf(o.xp).lv : null, trophies: Number(o.trophies) || 0, clan, fam: S.fams[1],
  };
}

function beginMatch() {
  S.demo = false;
  S.dashed = false;
  S.ms = { dashes: 0, supers: 0, kills: 0 };
  nextRound();
}

function nextRound() {
  S.world = roundWorld(S.match);
  const wave = S.match.mode === 'survival' ? S.match.wave : 0;
  S.ai = createAI(1, Math.min(30, S.aiLevel + Math.floor(wave / 2)), S.match.seed + S.match.round); // the waves get sharper too
  resetFx();
  const me = S.world.ents.find(e => e.side === 0), foe = S.world.ents.find(e => e.side === 1);
  S.aim = Math.atan2(foe.y - me.y, foe.x - me.x);
  S.foeAim = aiAngle(foe.x, foe.y, me.x, me.y, S.aiLevel, S.world.rand); // decided now so it can be shown; nothing else draws from rand before launch
  S.aimLeft = AIM_TIME; // counted down in frame time, so a backgrounded tab doesn't fire the round on return
  S.mode = 'aim';
  show(null);
  hud();
  cards(me, foe);
  banner(wave ? (wave % SURVIVAL.boss ? t('wave', { n: wave }) : t('bossWave')) : t('round', { n: S.match.round }));
  playMusic(null);
  sfx.round();
}

function fire() {
  if (S.mode !== 'aim') return;
  launch(S.world, S.aim, S.foeAim);
  S.mode = 'fight';
  bigText(t('fight'), '#FFD23F');
  sfx.fight();
  playMusic(S.match.mode === 'boss' || (S.match.wave ?? 1) % SURVIVAL.boss === 0 ? 'boss' : 'battle');
  show(null);
  hideCards();
}

const toArena = e => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * (W + 2 * M) - M, ((e.clientY - r.top) / r.height) * (H + 2 * M) - M];
};
function aimAt(e) {
  const [x, y] = toArena(e), me = S.world.ents[0];
  if (Math.hypot(x - me.x, y - me.y) > 6) S.aim = Math.atan2(y - me.y, x - me.x);
}
const useSuper = () => {
  if (S.mode !== 'fight') return;
  const F = S.party?.fight;
  if (F) F.out.push({ type: 'super', ent: F.me.ent, side: F.me.side });
  else act(S.world, 0, { type: 'super' });
};
canvas.addEventListener('pointerdown', e => {
  if (S.mode === 'fight') { // tap = dash there
    const [x, y] = toArena(e), F = S.party?.fight;
    if (F) { F.out.push({ type: 'dash', x, y, ent: F.me.ent, side: F.me.side }); S.dashed = true; }
    else if (act(S.world, 0, { type: 'dash', x, y })) S.dashed = true;
    return;
  }
  if (S.mode !== 'aim') return;
  S.aiming = true;
  canvas.setPointerCapture(e.pointerId);
  aimAt(e);
});
canvas.addEventListener('pointermove', e => { if (S.mode === 'aim' && (S.aiming || e.pointerType === 'mouse')) aimAt(e); });
canvas.addEventListener('pointerup', e => {
  if (!S.aiming) return;
  S.aiming = false;
  aimAt(e);
  fire();
});
canvas.addEventListener('pointercancel', () => { S.aiming = false; });
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return; // typing a nick or a code
  if (S.mode === 'fight' && (e.code === 'Space' || e.key === ' ')) { if (!e.repeat) useSuper(); e.preventDefault(); return; }
  if (S.mode !== 'aim') return;
  if (e.key === 'ArrowLeft') S.aim -= 0.08;
  else if (e.key === 'ArrowRight') S.aim += 0.08;
  else if (e.key === ' ' || e.key === 'Enter') fire();
  else return;
  e.preventDefault();
});

function hud() {
  const dot = (id, cls = '', skin = null) => { // portrait of a squad ball; an empty one marks a lost ball
    const d = el('span', 'por ' + cls);
    if (id) d.append(icon(id, cls === 'cur' ? 46 : 34, skin));
    return d;
  };
  const you = $('#hud-you'), foe = $('#hud-foe');
  if (S.mode === 'watch') {
    you.replaceChildren(dot(S.watch[0], 'cur'));
    foe.replaceChildren(dot(S.watch[1], 'cur'));
    return;
  }
  const { a, b, mode } = S.match, dead = n => Array.from({ length: Math.max(0, 3 - n) }, () => dot(null, 'dead'));
  if (mode === 'survival') { // your balls still standing against this wave
    you.replaceChildren(...a.filter(x => !x.dead).reverse().map(x => dot(x.id, 'cur', x.skin)), ...a.filter(x => x.dead).map(() => dot(null, 'dead')));
    foe.replaceChildren(...S.world.ents.filter(e => e.side === 1 && !e.mini).map(e => dot(e.kind, 'cur', e.skin)));
    return;
  }
  if (mode === 'duo' || mode === 'boss' || mode === 'football') { // everyone is on the field at once — show just them
    you.replaceChildren(...a.slice(0, mode === 'boss' ? 3 : 2).reverse().map(x => dot(x.id, 'cur', x.skin)));
    foe.replaceChildren(...b.slice(0, mode === 'boss' ? 1 : 2).map(x => dot(x.id, 'cur', x.skin)));
    return;
  }
  you.replaceChildren(...dead(a.length), ...a.slice(1).reverse().map(x => dot(x.id, '', x.skin)), dot(a[0].id, 'cur', a[0].skin));
  foe.replaceChildren(dot(b[0].id, 'cur', b[0].skin), ...b.slice(1).map(x => dot(x.id, '', x.skin)), ...dead(b.length));
}

const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6z"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.2 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3.7 4.5 7.3C19.5 16.4 12 21 12 21z" fill="#FF4D5E" stroke="#0A0E1F" stroke-width="2"/></svg>';
const pips = Array.from({ length: DASH.charges }, () => el('span', 'pip', BOLT));
$('#dash-pips').append(...pips);
function controls() {
  if ($('#controls').hidden) return;
  const side = S.party?.fight?.me.side ?? 0, s = S.world.sides[side], k = s.meter / METER.full, btn = $('#super-btn');
  pips.forEach((p, i) => {
    p.classList.toggle('on', i < s.dashes);
    p.style.setProperty('--p', i === s.dashes ? s.regen / DASH.regen : 0);
  });
  const can = canSuper(S.world, side);
  btn.style.setProperty('--p', k);
  btn.disabled = S.mode !== 'fight' || !can;
  btn.classList.toggle('ready', can);
}

let hintText = null;
function hints() {
  const tutorial = save.matches < 2;
  let txt = '';
  if (S.mode === 'aim') txt = t('aimHint');
  else if (S.mode === 'fight' && tutorial) txt = canSuper(S.world, 0) ? t('superHint') : S.dashed ? '' : t('dashHint');
  if (txt === hintText) return;
  hintText = txt;
  const h = $('#hint');
  h.textContent = txt;
  h.hidden = !txt;
}

let midText = null;
function mid() {
  const w = S.world;
  let txt = '';
  if (S.mode === 'watch') txt = `${ballName(S.watch[0])} vs ${ballName(S.watch[1])}`;
  else if (S.mode === 'aim') txt = t('aimTimer', { n: Math.max(0, Math.ceil(S.aimLeft)) });
  else if (S.match && ['aim', 'fight', 'ending'].includes(S.mode)) {
    const left = Math.ceil(SUDDEN - w.t);
    if (w.ball) { const l = Math.ceil(FOOT.time - w.t); txt = `${w.goals[0]} : ${w.goals[1]} · ${!w.launched ? '' : l > 0 ? l : t('goldenGoal')}`; } // football: the score and the clock
    else txt = (S.match.mode === 'survival' ? t('wave', { n: S.match.wave }) : t('round', { n: S.match.round })) + (w.launched ? ` · ${left > 0 ? left : t('sudden')}` : '');
  }
  if (txt === midText) return;
  midText = txt;
  const m = $('#hud-mid');
  m.textContent = txt;
  m.classList.toggle('sudden', w.launched && w.t > (w.ball ? FOOT.time : SUDDEN));
}

function onRoundOver(now) {
  if (S.demo) {
    if (!S.demoEnd) S.demoEnd = now + 1.5;
    else if (now >= S.demoEnd) demo();
    return;
  }
  if (S.mode === 'fight') { S.mode = 'ending'; S.endAt = now + 1.2; return; }
  if (S.mode === 'ending' && now >= S.endAt) {
    const r = endRound(S.match, S.world);
    r == null ? (S.match.mode === 'survival' ? pickUpgrade() : nextRound()) : finishMatch(r);
  } else if (S.mode === 'watch' && !S.watchDone) { // hold the final numbers for a second: that frame is the thumbnail
    S.watchEndAt ||= now + 1;
    if (now < S.watchEndAt) return;
    S.watchDone = true;
    const r = S.world.result;
    banner(r === 'draw' ? t('draw') : t('wins', { name: ballName(S.watch[r]) }), true);
  }
}

// Survival: between waves, one of three upgrades
const UP_IC = {
  dmg: '<path d="M6 26 20 12l2 2L8 28zM19 5h8v8l-4 4-8-8z" fill="#E8ECF4" stroke="#0A0E1F" stroke-width="2" stroke-linejoin="round"/><path d="M5 23l4 4" stroke="#FFCC33" stroke-width="4" stroke-linecap="round"/>',
  hp: '<path d="M16 28S4 21 4 12c0-4 3-7 6.5-7 2.5 0 4.3 1.5 5.5 3.5C17.2 6.5 19 5 21.5 5 25 5 28 8 28 12c0 9-12 16-12 16z" fill="#FF4D5E" stroke="#0A0E1F" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 11v9M11.5 15.5h9" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>',
  armor: '<path d="M16 3 27 7v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="#4CC9F0" stroke="#0A0E1F" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 7v18" stroke="#FFFFFF" stroke-width="2.5" opacity=".6"/>',
  speed: '<path d="M4 12h10M2 17h12M5 22h9" stroke="#A6FF4D" stroke-width="3" stroke-linecap="round"/><circle cx="21" cy="17" r="8" fill="#A6FF4D" stroke="#0A0E1F" stroke-width="2.2"/>',
  dash: '<path d="M18 2 6 18h8l-2 12 12-16h-8z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2.2" stroke-linejoin="round"/>',
  meter: '<path d="M16 3l3.6 7.6 8.4 1.1-6.1 5.8 1.5 8.3L16 21.8 8.6 25.8l1.5-8.3L4 11.7l8.4-1.1z" fill="#C890FF" stroke="#0A0E1F" stroke-width="2.2" stroke-linejoin="round"/>',
  heal: '<rect x="4" y="9" width="24" height="16" rx="4" fill="#FFFFFF" stroke="#0A0E1F" stroke-width="2.2"/><path d="M16 12v10M11 17h10" stroke="#1FA35C" stroke-width="3.5" stroke-linecap="round"/>',
  revive: '<circle cx="16" cy="18" r="9" fill="#FFE38A" stroke="#0A0E1F" stroke-width="2.2"/><ellipse cx="16" cy="6" rx="8" ry="3" fill="none" stroke="#FFCC33" stroke-width="2.5"/><path d="M4 16c-2-4 0-8 4-8M28 16c2-4 0-8-4-8" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
};
function pickUpgrade() {
  const m = S.match, done = m.wave - 1;
  S.mode = 'upgrade';
  playMusic(null);
  sfx.win();
  confetti(24);
  $('#up-title').textContent = t('waveDone', { n: done });
  $('#up-sub').textContent = t('upPick');
  $('#up-list').replaceChildren(...upgradeChoices(m).map(k => {
    const b = el('button', 'up-card', `<svg viewBox="0 0 32 32" aria-hidden="true">${UP_IC[k]}</svg><b></b><small></small>`);
    b.querySelector('b').textContent = t('up_' + k);
    b.querySelector('small').textContent = t('upd_' + k);
    b.onclick = () => { sfx.click(); applyUpgrade(m, k); $('#scr-upgrade').hidden = true; nextRound(); };
    return b;
  }));
  $('#scr-upgrade').hidden = false;
}

// ---------- results ----------
const CHALLENGE_BONUS = 10;
function finishMatch(r) {
  if (S.party) { // the result is from side 0's view; flip it for a player on side 1
    if (S.party.fight?.me.side === 1 && r !== 'draw') r = 1 - r;
    const ch = P?.chan; // stay in the room a few seconds so the last messages still reach everyone
    P = null; S.party = null;
    setTimeout(() => { try { ch?.leave(); } catch { /* gone */ } }, 4000);
  }
  S.undo = r === 1 && !S.match.revived && S.match.mode === 'classic' ? JSON.stringify(save) : null; // a revive restores this
  const won = r === 0, c = S.challenge, before = save.trophies;
  const flawless = won && S.match.mode === 'classic' && S.match.a.length === 3 && !S.match.revived; // not a single ball lost
  S.outcome = r;
  S.delta = 0;
  S.capped = false;
  S.settleLater = false;
  if (c) { // challenges: no trophies; a one-time bonus, never for your own links
    const fresh = !save.created.includes(c.seed) && !save.answered.includes(c.seed);
    S.earned = fresh ? CHALLENGE_BONUS : 0;
    if (fresh) save.answered = [...save.answered, c.seed].slice(-100);
  } else {
    const waves = S.match.mode === 'survival' ? S.match.wave - 1 : 0;
    S.earned = waves ? 5 + waves * 4 : won ? winCoinsFor(before) : LOSE_COINS;
    if (S.match.mode === 'survival') { S.newBest = waves > (save.best.survival ?? 0); save.best.survival = Math.max(save.best.survival ?? 0, waves); }
    if (S.ranked) { // the server decides; show the expected change until it answers
      S.delta = won ? 8 + (flawless ? 1 : 0) : r === 1 ? -Math.min(save.trophies, trophyLoss(save.trophies)) : 0;
      save.pendingFinish = { match: S.matchId, result: won ? 'won' : r === 1 ? 'lost' : 'draw', flawless };
      S.settleLater = r === 1 && !S.match.revived; // a revive may still turn this loss around
      if (!S.settleLater) settle();
    }
  }
  save.coins += S.earned;
  S.chestDrop = won || (S.match.mode === 'survival' && S.match.wave > 3) ? winChest(save) ?? false : null; // a win puts the next chest into a free slot (false = slots full)
  S.ups = gainMastery(save, c ? c.squad : save.squad, won); // each ball's own path
  S.xpGot = won ? XP_WIN : XP_PLAY;
  S.lvlUps = gainXp(save, S.xpGot); // the player level
  famXp(save, S.xpGot); // the familiar learns too
  save.matches++;
  track(save, { matches: 1, wins: won ? 1 : 0, flawless: flawless ? 1 : 0, challenges: c ? 1 : 0, duoWins: won && S.match.mode === 'duo' ? 1 : 0, bossWins: won && S.match.mode === 'boss' ? 1 : 0, ...S.ms });
  S.undoMs = S.ms;
  S.ms = { dashes: 0, supers: 0, kills: 0 };
  persist();
  coinsUI();
  S.mode = 'result';
  playMusic(null);
  cmdReact(0, won ? 'win' : 'sad', true);
  cmdReact(1, won ? 'sad' : r === 'draw' ? 'sad' : 'win', true);
  won ? sfx.win() : sfx.lose();
  if (won) confetti(48);
  showResult();
}

// Trophies on the result screen: the server's number once it answers, the expected one before that.
function trophyLine() {
  if (S.mode !== 'result' || S.challenge) return;
  if (!S.ranked) {
    $('#r-trophies').hidden = true;
    const mode = S.match?.mode;
    $('#r-sub').textContent = mode && mode !== 'classic' ? t('mode_' + mode) : t('training'); // 2 vs 2 and the boss never move trophies
    return;
  }
  const d = S.delta, shown = save.pendingFinish ? save.trophies + d : save.trophies;
  $('#r-trophies').hidden = false;
  $('#r-trophies').innerHTML = `<i class="trophy" style="width:26px;height:26px"></i><span class="cnt">${shown - d}</span> <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>`;
  countUp($('#r-trophies .cnt'), shown - d, shown);
  const next = pathNodes(save.maxTrophies).find(n => n.at > shown);
  $('#r-sub').textContent = S.capped ? t('dailyCap') : next ? t('toNext', { n: next.at - shown }) : '';
  const ready = claimable(save).length > 0;
  $('#r-reward').hidden = !ready;
  if (ready) $('#r-reward').textContent = t('rewardWaiting');
}

// Numbers roll from old to new value, so the trophy change is felt, not just read.
function countUp(node, from, to, ms = 700) {
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    node.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) setTimeout(tick, 16); // setTimeout, not rAF: keeps counting in background tabs too
  };
  tick();
}

// Report a ranked result. The server refuses anything under 15 s, so short matches wait a moment;
// if the network fails, pendingFinish stays in the save and is retried on the next connect.
async function settle() {
  const pending = save.pendingFinish;
  if (!pending) return;
  persist();
  const wait = 16000 - (Date.now() - S.matchStart);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  try {
    const r = await online.finishMatch(pending);
    if (save.pendingFinish !== pending) return;
    save.pendingFinish = null;
    save.trophies = r.trophies;
    save.maxTrophies = Math.max(save.maxTrophies, r.max_trophies);
    S.delta = r.delta;
    S.capped = !!r.capped; // the daily +200 is reached
    persist();
    trophyLine();
    if (S.mode === 'home') home.render();
  } catch { /* stays pending */ }
}

function showResult() {
  const r = S.outcome, won = r === 0, title = $('#r-title'), surv = S.match?.mode === 'survival' && !S.challenge;
  title.textContent = surv ? t('survResult', { n: S.match.wave - 1 }) : won ? t('win') : r === 'draw' ? t('draw') : t('lose');
  title.className = won || (surv && S.newBest) ? 'win' : 'lose';
  const squad = S.challenge ? S.challenge.squad : save.squad;
  $('#r-squad').replaceChildren(...squad.map((id, i) => icon(id, i ? 60 : 84, save.skinOf[id])));
  $('#r-squad').classList.toggle('sad', !won);
  const rc = $('#r-cmds'), fams = S.fams;
  rc.hidden = !fams; // challenges and parties have no commanders
  if (fams) rc.replaceChildren(...[0, 1].filter(side => !side || !['boss', 'survival'].includes(S.match?.mode)).map(side => {
    const happy = side ? r === 1 : won;
    return el('div', `r-cmd ${side ? 'them' : 'you'} ${happy ? 'win' : 'sad'}`, heroLive(fams[side].id) + (happy ? '' : RAIN_CLOUD));
  }));
  const c = S.challenge, box = $('#r-ads');
  box.replaceChildren();
  $('#r-coins').textContent = '+' + S.earned;
  $('#r-trophies').hidden = !!c;
  $('#r-chest').hidden = S.chestDrop == null;
  if (S.chestDrop != null) $('#r-chest').textContent = S.chestDrop ? t('resultSlot', { name: t('chest_' + S.chestDrop) }) : t('resultSlotsFull');
  $('#r-reward').hidden = true;
  const lv = (S.lvlUps ?? []).at(-1);
  $('#r-xp').innerHTML = lv ? `${t('levelUp', { n: lv.lv })} +${lv.coins}<i class="coin"></i> +${lv.gems}<i class="gem"></i>` : t('xpGain', { n: S.xpGot });
  $('#r-xp').classList.toggle('up', !!lv);
  const ups = S.ups ?? [];
  $('#r-rank').hidden = !ups.length;
  $('#r-rank').innerHTML = ups.map(u => t('rankUp', { name: ballName(u.id), n: u.rank })
    + (u.skin ? ` · ${skinName(u.skin)}` : u.chest ? ` · ${t('chest_' + u.chest)}` : u.gems ? ` · +${u.gems}<i class="gem"></i>` : u.coins ? ` · +${u.coins}<i class="coin"></i>` : '')).join('  ');
  if (c) { // challenge result: no ads, the main action is "challenge them back"
    const name = nickText(c.nick, lang);
    $('#r-sub').textContent = won ? t('challengeWin', { nick: name }) : r === 'draw' ? t('draw') : t('challengeLose', { nick: name });
    $('#r-next').textContent = t('replyChallenge');
    $('#r-next').onclick = () => shareChallenge({ seed: c.seed, result: won ? 'w' : r === 'draw' ? 'd' : 'l' });
    $('#r-share').hidden = true;
    show('result');
    return;
  }
  trophyLine();
  if (surv) $('#r-sub').textContent = S.newBest ? t('survNewBest') : t('survBest', { n: save.best.survival });
  $('#r-next').textContent = won ? t('next') : t('retry');
  $('#r-next').onclick = () => leaveResult(goSquad);
  $('#r-share').hidden = !won;
  show('result');

  const offer = (name, label, onReward) => offerReward(name, {
    onAvailable: play => {
      const b = el('button', 'btn ad', `${label} <small>· ${t('adTag')}</small>`);
      b.onclick = () => { b.disabled = true; play(); };
      box.replaceChildren(b);
    },
    onReward,
    onDone: () => box.replaceChildren(),
  });
  if (won) offer('double-coins', t('double'), () => {
    save.coins += S.earned;
    S.earned *= 2;
    persist();
    coinsUI();
    $('#r-coins').textContent = '+' + S.earned;
  });
  else if (r === 1 && !S.match.revived && S.match.mode === 'classic') offer('revive', t('revive'), () => {
    // the match isn't over after all: take back what the loss changed (trophies weren't reported yet)
    const before = JSON.parse(S.undo);
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, before);
    S.ms = S.undoMs;
    S.settleLater = false;
    persist();
    coinsUI();
    revive(S.match);
    nextRound();
  });
}

async function leaveResult(next) {
  cancelReward();
  if (S.settleLater) { S.settleLater = false; settle(); } // the revive wasn't taken: report the loss
  if (S.trial) { // trial balls go back after one match
    S.trial = null;
    save.squad = save.squad.map(id => (save.owned.includes(id) ? id : 'basic'));
    persist();
  }
  if (save.matches >= 4 && save.matches % 2 === 0 && S.adAfter !== save.matches) {
    S.adAfter = save.matches;
    await interstitial('after-match');
  }
  next();
}

// ---------- spectator ----------
function goWatch() {
  cancelReward();
  S.mode = 'watch-pick';
  if (!S.demo) demo();
  show('watch');
  renderWatch();
}

function renderWatch() {
  [['#w-left', 0], ['#w-right', 1]].forEach(([sel, i]) => {
    $(sel).replaceChildren(...BY_UNLOCK.map(id => {
      const b = el('button', 'pick' + (S.watch[i] === id ? ' sel' : ''));
      b.append(icon(id, 44), document.createTextNode(ballName(id)));
      b.onclick = () => { S.watch[i] = id; renderWatch(); };
      return b;
    }));
  });
}

function startWatch() {
  S.world = createWorld({ seed: Math.floor(Math.random() * 1e9), a: { id: S.watch[0] }, b: { id: S.watch[1] }, map: anyMap() });
  S.ais = [createAI(0, 20, Math.floor(Math.random() * 1e9)), createAI(1, 20, Math.floor(Math.random() * 1e9))];
  resetFx();
  S.demo = false;
  S.watchDone = false;
  S.watchEndAt = 0;
  S.mode = 'watch';
  setAutoEmote([0, 1]);
  setAuras({});
  S.fams = null;
  const w = S.world, [a, b] = w.ents;
  S.watchAims = [aiAngle(a.x, a.y, b.x, b.y, 18, w.rand), aiAngle(b.x, b.y, a.x, a.y, 18, w.rand)];
  S.launchAt = performance.now() / 1000 + (RECORD != null ? 2.5 : 1.4);
  show(null);
  hud();
  cards(a, b);
  const name = e => `<span style="color:${BALLS[e.kind].color}">${ballName(e.kind).toUpperCase()}</span>`; // the title in each ball's colour, like the clips
  banner(`${name(a)} <b>VS</b> ${name(b)}${RECORD != null ? `<small>${t('whoWins')}</small>` : ''}`, false, '', true);
}

function watchLaunch() {
  launch(S.world, S.watchAims[0], S.watchAims[1]);
  hideCards();
}

// Sound, hit-stop, super banners and quest stats from this frame's sim events (draw() consumes them right after).
let lastWallSfx = 0;
function feel(w, now) {
  let hits = 0;
  const mine = S.mode === 'fight' || S.mode === 'ending';
  for (const ev of w.events) {
    if (ev.type === 'hit' && hits++ < 2) sfx.hit(ev.amount, w.ents.find(e => e.id === ev.id)?.kind);
    if (ev.type === 'hit' && ev.amount >= 18) S.freezeUntil = Math.max(S.freezeUntil, now + 0.05);
    if (ev.type === 'hit' && ev.amount >= 15 && ev.side === 0 && save.vibrate) navigator.vibrate?.(30); // your ball took a big one
    if (ev.type === 'hit' && ev.amount >= 8) { cmdReact(ev.side, 'ouch', ev.amount >= 22); cmdReact(1 - ev.side, 'cheer'); }
    if (ev.type === 'wall' && now - lastWallSfx > 0.12) { lastWallSfx = now; sfx.wall(S.match?.map ?? w.map); }
    if (ev.type === 'boom') { sfx.death(); S.freezeUntil = Math.max(S.freezeUntil, now + 0.06); }
    if (ev.type === 'dash') { sfx.dash(); cmdReact(ev.side, 'point'); if (mine && ev.side === 0) S.ms.dashes++; }
    if (ev.type === 'train') sfx.train(ev.express);
    if (ev.type === 'chess') sfx.chess();
    if (ev.type === 'kick') sfx.kick(ev.hard);
    if (ev.type === 'goal') {
      sfx.goal(ev.side === 0);
      bigText(t('goal'), ev.side ? '#FF4D5E' : '#4CC9F0');
      cmdReact(ev.side, 'cheer', true); cmdReact(1 - ev.side, 'sad');
      setTimeout(() => { for (const s of [0, 1]) cmdReact(s, 'point'); }, 1200); // back to the game
      if (ev.side === 0) confetti(30);
    }
    if (ev.type === 'chessStep') sfx.chessStep();
    if (ev.type === 'death') {
      sfx.death();
      S.freezeUntil = Math.max(S.freezeUntil, now + 0.12);
      if (!ev.mini && !w.ents.some(e => e.side === ev.side && !e.dead)) { cinema(ev.x, ev.y, 1.3, 1.1, 0.25, null); if (!S.party) S.slowUntil = now + 0.9; sfx.ko(); } // the last one out: slow motion, close up
      if (mine && ev.side === 1 && !ev.mini) S.ms.kills++;
    }
    if (ev.type === 'super') {
      sfx.super(ev.kind);
      cmdReact(ev.side, 'cast', true);
      S.freezeUntil = Math.max(S.freezeUntil, now + 0.08);
      banner(superName(ev.kind) + '!', false, ev.side ? 'foe' : 'you');
      if (mine && ev.side === 0) S.ms.supers++;
      const e = w.ents.find(x => x.side === ev.side && !x.dead);
      cinema(ev.x, ev.y, 1.14, 0.75, 0.6, e?.id ?? null); // the caster in a spotlight, the arena dark around it
      if (!S.party) S.slowUntil = now + 0.4;
    } else if (ev.type === 'rage') {
      banner(t('bossRage'), false, 'foe');
      sfx.super('bomb');
      cinema(ev.x, ev.y, 1.12, 0.8, 0.5, null);
    } else if (ev.type === 'quake' || ev.type === 'rockets' || ev.type === 'spit') {
      sfx.skill(ev.type === 'quake' ? 'bomb' : ev.type === 'rockets' ? 'hedgehog' : 'cell');
    }
  }
}

// ---------- loop ----------
let last = performance.now() / 1000, acc = 0;
function tick(ms) {
  const now = ms / 1000, real = Math.max(0, now - last), dt = Math.min(0.05, real) * (now < S.slowUntil ? 0.33 : 1);
  last = now;
  const w = S.world;
  if (w) {
    if (S.mode === 'watch' && !w.launched && now >= S.launchAt) watchLaunch();
    if (now < S.freezeUntil) acc = 0; // hit-stop: hold the frame, the sim just waits
    else if (S.party && S.mode === 'fight') partyFrame(real); // real time: a slow phone catches up instead of lagging behind
    else if (S.demo || S.mode === 'fight' || S.mode === 'watch') {
      acc += dt;
      while (acc >= STEP) {
        if (S.mode === 'fight') S.ai.think(w);
        else if (w.launched) for (const ai of S.ais) ai.think(w);
        step(w, STEP);
        acc -= STEP;
      }
    } else acc = 0;
    if (S.mode === 'aim' && (S.aimLeft -= dt) <= 0) fire(); // time's up: the round fires itself
    if (!S.demo) feel(w, now);
    if (w.result != null && (!S.party?.fight || S.party.host || S.party.fight.final)) onRoundOver(now); // in a party only the host's word ends it
    if (S.mode === 'fight' && w.t > (w.ball ? FOOT.time : SUDDEN) && w.result == null) playMusic('danger'); // sudden death (or the golden goal): the music hurries you
    const preWatch = S.mode === 'watch' && !w.launched;
    draw(ctx, S.world, scale, { aim: S.mode === 'aim' ? S.aim : preWatch ? S.watchAims[0] : null, foeAim: S.mode === 'aim' ? S.foeAim : preWatch ? S.watchAims[1] : null, now, dt, me: S.party?.fight?.me.ent ?? null });
    mid();
    controls();
    hints();
  }
}
function frame(ms) {
  try { tick(ms); } catch (e) { console.error(e); } // one bad frame must never stop the game loop
  requestAnimationFrame(frame);
}
// a hidden tab gets no animation frames — keep a party fight going so friends aren't frozen waiting for you
setInterval(() => { if (S.party && performance.now() / 1000 - last > 0.25) try { tick(performance.now()); } catch (e) { console.error(e); } }, 250);

// ---------- parties: play online with friends — the Boss together (1–3 people) or 2 vs 2 (up to 4, bots fill in) ----------
// Lockstep: every phone runs the same deterministic fight. Your taps are sent for a turn a little ahead (DELAY), and no
// one plays a turn before having every player's packet for it. The host also plays the boss and the bots, and every
// few turns sends where the balls really are, so tiny float differences between phones never split the fight.
// No chat: only the game, nicknames from word lists, and emotes.
const PT = { TURN: 8, DELAY: 2, FIX: 8, DROP: 5000 };
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/, PMAX = { boss: 3, duo: 4 };
const newCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
let P = null; // the party you're in
const cleanMember = m => (m && typeof m.uid === 'string' && validNick(m.nick) && BALLS[m.ball] ? {
  uid: m.uid, nick: m.nick, ball: m.ball, skin: SKINS[m.skin] ? m.skin : null, at: Number(m.at) || 0, host: m.host === true,
  mode: m.mode === 'boss' || m.mode === 'duo' ? m.mode : null,
} : null);
function partyChoice() {
  if (!net.online) return goSquad(); // offline: no friends, but the bots still play
  $('#pc-mode').textContent = t('mode_' + save.mode);
  $('#pc-code').value = '';
  $('#scr-pchoice').hidden = false;
}
$('#pc-solo').onclick = () => { $('#scr-pchoice').hidden = true; goSquad(); };
$('#pc-create').onclick = () => { $('#scr-pchoice').hidden = true; partyOpen(newCode(), true); };
$('#pc-join').onclick = () => {
  const c = $('#pc-code').value.trim().toUpperCase();
  if (!CODE_RE.test(c)) return toast(t('partyNoCode'));
  $('#scr-pchoice').hidden = true;
  partyOpen(c, false);
};
$('#pc-close').onclick = () => { $('#scr-pchoice').hidden = true; };
function partyOpen(code, host, mode = save.mode) {
  partyLeave();
  const me = { uid: online.myUid(), nick: save.nick, ball: save.squad[0], skin: save.skinOf[save.squad[0]] ?? null, at: Date.now(), host, mode: host ? mode : null };
  P = { code, host, me, members: [], mode: host ? mode : null, state: 'lobby', sawHost: false };
  globalThis.bbParty = P; // handy in the console when a party misbehaves
  const room = P; // an old room's late events must never reach the next party
  try { P.chan = online.partyChannel(code, me, { onPresence: l => P === room && partyPresence(l), onMsg: m => P === room && partyMsg(m) }); } catch { P = null; return toast(t('needNet')); }
  partyRender();
  $('#scr-party').hidden = false;
  partyFriends();
}
// Online friends in the party lobby, each with a one-tap invite
async function partyFriends() {
  const box = $('#pt-friends');
  box.replaceChildren();
  if (!P) return;
  await home.loadFriends();
  const list = home.onlineFriends();
  box.replaceChildren(...(list.length ? list.map(f => {
    const row = el('div', 'fr-row on'), nm = el('div', 'fr-nm');
    nm.append(el('b', ''));
    nm.firstChild.textContent = validNick(f.nick) ? nickText(f.nick, lang) : '???';
    const b = el('button', 'btn sm primary', t('frInvite'));
    b.onclick = () => { b.disabled = true; inviteFriend(f).finally(() => setTimeout(() => { b.disabled = false; }, 15000)); };
    row.append(el('span', 'fr-dot'), icon(BALLS[f.avatar] ? f.avatar : 'basic', 32, SKINS[f.skin] ? f.skin : null), nm, b);
    return row;
  }) : [el('p', 'muted small center', t('ptNoFriends'))]));
}
// Call a friend: open a party first if you're not in one (2 vs 2 unless you picked the boss), then send the code
async function inviteFriend(f) {
  if (!P) partyOpen(newCode(), true, save.mode === 'boss' ? 'boss' : 'duo');
  const ok = await online.partyInvite(f.id, P.code, P.mode ?? 'duo').catch(() => false);
  toast(t(ok ? 'frInvited' : 'frInviteWait'));
}
// Invites to me: checked every few seconds while not in a fight; one popup at a time
let inviteShown = null;
setInterval(async () => {
  if (!net.online || document.hidden || inviteShown || ['aim', 'fight', 'ending', 'upgrade', 'starting'].includes(S.mode) || P?.state === 'fight') return;
  const list = await online.myInvites().catch(() => []);
  const inv = list.find(x => CODE_RE.test(x.code) && x.code !== P?.code);
  if (!inv) return;
  inviteShown = inv;
  $('#inv-av').replaceChildren(icon(BALLS[inv.from?.avatar] ? inv.from.avatar : 'basic', 72, SKINS[inv.from?.skin] ? inv.from.skin : null));
  $('#inv-text').textContent = t('invText', { nick: validNick(inv.from?.nick) ? nickText(inv.from.nick, lang) : '???', mode: t('mode_' + (inv.mode === 'boss' ? 'boss' : 'duo')) });
  $('#scr-invite').hidden = false;
  sfx.coin();
}, 6000);
$('#inv-join').onclick = () => { const inv = inviteShown; $('#scr-invite').hidden = true; inviteShown = null; sfx.click(); if (inv) partyOpen(inv.code, false); };
$('#inv-later').onclick = () => { $('#scr-invite').hidden = true; inviteShown = null; };
setInterval(() => { if (net.online && !document.hidden && S.mode === 'home') home.loadFriends(); }, 30000); // requests badge + "I'm online"
function partyLeave() {
  if (P) { try { P.chan.leave(); } catch { /* already gone */ } }
  P = null;
  S.party = null;
  $('#scr-party').hidden = true;
}
function partyPresence(list) {
  if (!P) return;
  P.members = list.map(cleanMember).filter(Boolean).sort((a, b) => b.host - a.host || a.at - b.at); // the host always gets the first seat
  const host = P.members.find(m => m.host);
  if (!P.host) {
    if (host) { P.mode = host.mode; P.sawHost = true; P.hostGone = false; }
    else if (P.sawHost) { // the host left: mid-fight their last turns may still be on the way, so the turn loop decides
      if (P.state === 'fight') { P.hostGone = true; return; }
      toast(t('partyGone'));
      partyLeave();
      return;
    }
  }
  if (P.state === 'lobby') partyRender();
}
function partyRender() {
  const mode = P.mode ?? 'boss', max = PMAX[mode];
  $('#pt-code').textContent = P.code;
  $('#pt-mode').textContent = P.mode ? t('mode_' + P.mode) : '…';
  const seats = P.members.slice(0, max);
  $('#pt-list').className = 'pt-list' + (mode === 'duo' ? ' duo' : '');
  $('#pt-list').replaceChildren(...Array.from({ length: max }, (_, i) => {
    const m = seats[i], d = el('div', 'pt-seat' + (mode === 'duo' ? (i % 2 ? ' red' : ' blue') : ''));
    if (m) { d.append(icon(m.ball, 44, m.skin), el('b', '')); d.lastChild.textContent = nickText(m.nick, lang) + (m.host ? ` · ${t('partyHost')}` : ''); }
    else d.append(el('span', 'pt-empty'), ...(mode === 'duo' ? [el('small', '', t('partyBot'))] : [])); // the boss fight has no bots on your side
    return d;
  }));
  $('#pt-start').hidden = !P.host;
  $('#pt-wait').hidden = P.host;
  $('#pt-start').disabled = !seats.length;
}
$('#pt-share').onclick = async () => {
  if (!P) return;
  const url = `${location.origin}${location.pathname}?party=${P.code}`, text = t('partyInvite', { code: P.code });
  try {
    if (navigator.share) await navigator.share({ title: 'BallBrawl', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast(t('partyCopied')); }
  } catch { /* closed the share sheet */ }
};
$('#pt-leave').onclick = () => { sfx.click(); partyLeave(); };
$('#pt-start').onclick = () => {
  if (!P?.host) return;
  const mode = P.mode, seats = P.members.slice(0, PMAX[mode]), foes = enemySquadFor(save.trophies, Math.random);
  const human = m => ({ uid: m.uid, ball: m.ball, skin: m.skin }), boss = nextBoss();
  const seatList = mode === 'boss'
    ? [...seats.map(m => ({ ...human(m), side: 0 })), { uid: null, ball: BOSSES[boss].ball, skin: BOSSES[boss].skin ?? null, side: 1, boss: true }]
    : Array.from({ length: 4 }, (_, i) => (seats[i] ? { ...human(seats[i]), side: i % 2 } : { uid: null, ball: foes[i % 3], skin: null, side: i % 2 }));
  const msg = { t: 'start', uid: P.me.uid, seed: Math.floor(Math.random() * 1e9), mode, map: arenaFor(save.maxTrophies).id, seats: seatList, boss, bossMul: 0.45 + 0.2 * seats.length, level: aiLevel(save.trophies) };
  P.chan.send(msg);
  partyBegin(msg);
};
const cleanStart = m => {
  if (!m || !Array.isArray(m.seats) || m.seats.length > 5 || !MAPS[m.map] || !(m.mode === 'boss' || m.mode === 'duo')) return null;
  const seats = m.seats.map(s => ({ uid: typeof s?.uid === 'string' ? s.uid : null, ball: BALLS[s?.ball] ? s.ball : 'basic', skin: SKINS[s?.skin] ? s.skin : null, side: s?.side === 1 ? 1 : 0, boss: s?.boss === true }));
  if (!seats.some(s => s.side === 0) || !seats.some(s => s.side === 1)) return null;
  return { t: 'start', seed: Math.floor(Number(m.seed)) || 1, mode: m.mode, map: m.map, seats, boss: BOSSES[m.boss] ? m.boss : 'slime', bossMul: Math.min(3, Math.max(0.3, Number(m.bossMul) || 1)), level: Math.min(30, Math.max(1, Math.floor(Number(m.level)) || 1)) };
};
// A command as every phone applies it: dash targets clamped to the arena, so a tap on the wall means the same everywhere.
const partyCmd = c => ({ type: c.type, ent: c.ent, side: c.side, ...(c.type === 'dash' && { x: Math.min(W, Math.max(0, Number(c.x) || 0)), y: Math.min(H, Math.max(0, Number(c.y) || 0)) }) });
function partyMsg(m) {
  if (!P || !m || typeof m !== 'object') return;
  try {
    const F = P.fight;
    if (m.t === 'start' && !P.host && P.state === 'lobby' && P.members.some(x => x.host && x.uid === m.uid)) { const s = cleanStart(m); if (s) partyBegin(s); return; }
    if (!F) return;
    const fromHost = m.uid === F.hostUid;
    if (m.t === 'turn' && F.humans.includes(m.uid) && Array.isArray(m.turns)) { // a message repeats the sender's last turns, so a lost one heals itself
      const seat = F.seats.find(s => s.uid === m.uid);
      for (const tn of m.turns.slice(-12)) {
        const [n, list] = Array.isArray(tn) ? tn : [];
        if (!Number.isInteger(n) || n < F.turn || n > F.turn + 40 || m.uid in (F.packets[n] ?? {})) continue; // the first copy wins
        (F.packets[n] ??= {})[m.uid] = (Array.isArray(list) ? list.slice(0, 16) : []).filter(c => c && (c.type === 'dash' || c.type === 'super') && Number.isInteger(c.ent)
          && (c.ent === seat.ent || (fromHost && F.seats.some(s => !s.uid && s.ent === c.ent)))).map(c => partyCmd({ ...c, side: F.seats.find(s => s.ent === c.ent).side }));
      }
      F.seen[m.uid] = performance.now();
      if (fromHost && !P.host) {
        const fix = m.fix;
        if (fix && Number.isInteger(fix.n) && fix.n >= F.turn - 1 && !F.fixes[fix.n]) F.fixes[fix.n] = fix;
        if (Array.isArray(m.drop)) for (const u of m.drop) if (F.humans.includes(u)) F.dropped.add(u);
      }
    } else if (m.t === 'end' && fromHost && !P.host && [0, 1, 'draw'].includes(m.r)) { S.world.result = m.r; F.final = true; } // the host's word decides the fight
    else if (m.t === 'emote' && Number.isInteger(m.ent)) emote(m.side === 1 ? 1 : 0, String(m.id), m.ent);
  } catch (e) { console.warn('[party] bad message', e); }
}
function partyFix(m) { // the host's truth about the balls (positions, speed, health, meters), taken right after turn m.n
  const w = S.world;
  for (const r of Array.isArray(m.ents) ? m.ents : []) {
    const e = Array.isArray(r) && w.ents.find(x => x.id === r[0]);
    if (!e || r.slice(1, 6).some(v => !Number.isFinite(v))) continue;
    [e.x, e.y, e.vx, e.vy, e.hp] = r.slice(1, 6);
    e.dead = !!r[6];
    if (e.dead) e.hp = 0;
  }
  (Array.isArray(m.sides) ? m.sides : []).forEach((v, i) => { if (Array.isArray(v) && w.sides[i] && v.every(Number.isFinite)) [w.sides[i].meter, w.sides[i].dashes, w.sides[i].regen] = v; });
  if (Number.isFinite(m.t)) w.t = m.t; // the clock too: sudden death and boosts run on it
  if (Number.isInteger(m.tick)) w.tick = m.tick;
  w.result = [0, 1, 'draw'].includes(m.res) ? m.res : null; // a phone that thought the fight was over plays on if the host says so
}
function partyGone() {
  toast(t('partyGone'));
  partyLeave();
  goHome('lobby');
}
function partyBegin(m) {
  const mySeat = m.seats.find(s => s.uid === P.me.uid);
  if (!mySeat) { toast(t('partyFull')); partyLeave(); return; }
  P.state = 'fight';
  $('#scr-party').hidden = true;
  $('#scr-pchoice').hidden = true;
  const s0 = m.seats.filter(s => s.side === 0), s1 = m.seats.filter(s => s.side === 1);
  const spec = s => (s.boss ? bossSpec(m.boss, m.bossMul) : { id: s.ball, skin: s.skin });
  const w = createWorld({ seed: m.seed, a: s0.map(spec), b: s1.map(spec), map: m.map, players: [s0.length, s1.length] });
  const e0 = w.ents.filter(e => e.side === 0), e1 = w.ents.filter(e => e.side === 1);
  s0.forEach((s, i) => { s.ent = e0[i].id; });
  s1.forEach((s, i) => { s.ent = e1[i].id; });
  const humans = m.seats.filter(s => s.uid).map(s => s.uid);
  const F = P.fight = { m, seats: m.seats, me: mySeat, humans, hostUid: P.host ? P.me.uid : P.members.find(x => x.host)?.uid, packets: {}, seen: {}, dropped: new Set(), fixes: {}, hist: [], turn: 0, acc: 0, out: [], started: performance.now(), launchAt: performance.now() + 3000, bots: [] };
  for (let k = 0; k < PT.DELAY; k++) F.packets[k] = Object.fromEntries(humans.map(u => [u, []]));
  if (P.host) F.bots = m.seats.filter(s => !s.uid).map((s, i) => createAI(s.side, m.level, m.seed + i + 1, { ent: s.ent, act: (_w, side, cmd) => { F.out.push({ ...cmd, side, ent: s.ent }); return true; } }));
  S.party = P;
  S.world = w;
  S.match = { a: s0.map(s => ({ id: s.ball, skin: s.skin })), b: s1.map(s => ({ id: s.ball, skin: s.skin })), mode: m.mode, boss: m.boss, revived: true, round: 1 };
  setBossNames(Object.fromEntries(BOSS_IDS.map(id => [id, t('boss_' + id)])));
  S.challenge = null; S.ranked = false; S.matchId = null; S.matchStart = Date.now(); S.demo = false; S.dashed = false; S.ms = { dashes: 0, supers: 0, kills: 0 };
  setAutoEmote([]);
  setAuras({});
  S.fams = null;
  resetFx();
  S.mode = 'fight';
  show(null);
  hud();
  playMusic(null);
  banner('3'); sfx.count();
  setTimeout(() => { if (S.party === P) { banner('2'); sfx.count(); } }, 1000);
  setTimeout(() => { if (S.party === P) { banner('1'); sfx.count(true); } }, 2000);
}
function partyFrame(dt) {
  const F = P.fight, w = S.world, TT = PT.TURN * STEP, now = performance.now();
  if (!w.launched) {
    if (now < F.launchAt) return;
    const a = w.ents.find(e => e.side === 0), b = w.ents.find(e => e.side === 1);
    launch(w, Math.atan2(b.y - a.y, b.x - a.x), Math.atan2(a.y - b.y, a.x - b.x));
    playMusic(F.m.mode === 'boss' ? 'boss' : 'battle');
    return;
  }
  if (F.final) return;
  F.acc = Math.min(F.acc + dt, TT * 6);
  let fresh = false, stalled = false;
  while (F.acc >= TT && !(P.host && w.result != null)) { // a guest plays on even if its fight looks over: only the host ends it
    if (F.needFix != null) { // a guest takes the host's snapshot right after the turn it was made on — never late, never early
      const f = F.fixes[F.needFix];
      if (!f) { stalled = true; break; }
      partyFix(f);
      F.needFix = null;
    }
    const n = F.turn, got = F.packets[n] ?? {}, need = F.humans.filter(u => !F.dropped.has(u));
    if (!need.every(u => u in got)) { // someone is slow: wait (the host drops a player who went silent)
      stalled = true;
      if (P.host) for (const u of need) if (!(u in got) && now - (F.seen[u] ?? F.started + 3000) > PT.DROP) F.dropped.add(u);
      break;
    }
    for (const u of need) for (const c of got[u]) act(w, c.side, c);
    delete F.packets[n];
    for (let i = 0; i < PT.TURN && w.result == null; i++) { if (P.host) for (const ai of F.bots) ai.think(w); step(w, STEP); }
    F.acc -= TT;
    F.turn++;
    const cmds = F.out.splice(0, 16).map(partyCmd);
    (F.packets[n + PT.DELAY] ??= {})[P.me.uid] = cmds;
    F.hist.push([n + PT.DELAY, cmds]);
    if (F.hist.length > 12) F.hist.shift();
    fresh = true;
    if (n % PT.FIX === 0) {
      if (P.host) F.fix = { n, t: w.t, tick: w.tick, res: w.result ?? null, ents: w.ents.map(e => [e.id, e.x, e.y, e.vx, e.vy, e.hp, e.dead ? 1 : 0]), sides: w.sides.map(s => [s.meter, s.dashes, s.regen]) };
      else F.needFix = n;
    }
    for (const k in F.fixes) if (+k < n) delete F.fixes[k];
  }
  F.stallSince = stalled ? (F.stallSince ?? now) : null;
  if (!P.host && F.stallSince && now - F.stallSince > (P.hostGone ? 3000 : 12000)) return partyGone(); // the host is gone for good
  if (fresh || (stalled && now - (F.sentAt ?? 0) > 500)) { // at most one message a frame; while stuck, repeat it twice a second
    F.sentAt = now;
    P.chan.send({ t: 'turn', uid: P.me.uid, turns: F.hist, ...(P.host && { fix: F.fix, drop: [...F.dropped] }) });
  }
  if (P.host && w.result != null && !F.endSent) { // tell everyone how it ended, a few times in case one gets lost
    F.endSent = true;
    const ch = P.chan, msg = { t: 'end', uid: P.me.uid, r: w.result };
    for (const d of [0, 400, 1200, 2500]) setTimeout(() => { try { ch.send(msg); } catch { /* left already */ } }, d);
  }
}

// ---------- boot ----------
document.documentElement.lang = lang;
if (lang !== 'ru') document.title = 'BallBrawl — ball battle';

// Emotes: the tray holds the emotes you own; the computer sometimes answers in kind.
const REPLY = { laugh: ['laugh', 'cool'], cool: ['wow', 'cool'], wow: ['laugh', 'wow'], angry: ['laugh', 'cool'], cry: ['laugh', 'gg'], gg: ['gg'], love: ['love', 'laugh'], sleepy: ['angry', 'laugh'] };
function emoteTray() {
  $('#emote-tray').replaceChildren(...EMOTE_LIST.filter(e => owns(save, 'emote', e.id)).map(e => {
    const b = el('button', '');
    b.setAttribute('aria-label', e.id);
    const c = document.createElement('canvas');
    drawEmote(c, e.id, 48);
    b.append(c);
    b.onclick = ev => {
      ev.stopPropagation();
      $('#emote-tray').hidden = true;
      const F = S.party?.fight;
      if (F) {
        if (!emote(F.me.side, e.id, F.me.ent)) return;
        S.party.chan.send({ t: 'emote', side: F.me.side, ent: F.me.ent, id: e.id });
        save.stats.emotes++;
        sfx.click();
        return;
      }
      if (!emote(0, e.id)) return;
      save.stats.emotes++;
      sfx.click();
      if (S.mode !== 'watch' && Math.random() < 0.55) setTimeout(() => emote(1, pickMood(REPLY[e.mood])), 700 + Math.random() * 800);
    };
    return b;
  }));
}
$('#emote-btn').onclick = e => { e.stopPropagation(); sfx.click(); if ($('#emote-tray').hidden) emoteTray(); $('#emote-tray').hidden = !$('#emote-tray').hidden; };
document.addEventListener('pointerdown', e => { if (!e.target.closest('#emote-tray, #emote-btn')) $('#emote-tray').hidden = true; });
for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
$('#s-back').onclick = () => goHome();
$('#s-fight').onclick = startMatch;
$('#r-menu').onclick = () => leaveResult(() => goHome('lobby'));
$('#r-share').onclick = () => shareChallenge();
$('#w-start').onclick = startWatch;
$('#w-again').onclick = startWatch;
$('#w-back').onclick = goWatch;
$('#w-cancel').onclick = () => goHome('lobby');
$('#c-accept').onclick = startChallenge;
$('#c-skip').onclick = () => goHome();
$('#super-btn').onclick = useSuper;
$('#super-btn').dataset.key = t('keySpace'); // shown under the button on computers
const VERSION = '1.7';
// Settings: sound, the opponent's emotes, language, account and privacy. The gear works on every screen.
const muteUI = () => {
  $('#set-sound').classList.toggle('on', !save.muted);
  $('#set-sound').setAttribute('aria-checked', String(!save.muted));
  $('#set-emotes').classList.toggle('on', save.foeEmotes);
  $('#set-music').classList.toggle('on', save.music);
  $('#set-music').setAttribute('aria-checked', String(save.music));
  $('#set-emotes').setAttribute('aria-checked', String(save.foeEmotes));
  for (const [id, on] of [['#set-shake', save.shake], ['#set-vibrate', save.vibrate]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-checked', String(on)); }
};
$('#set-vib-row').hidden = !navigator.vibrate; // phones only
$('#set-shake').onclick = () => { save.shake = !save.shake; setShakeOn(save.shake); persist(); muteUI(); sfx.click(); };
$('#set-vibrate').onclick = () => { save.vibrate = !save.vibrate; persist(); muteUI(); if (save.vibrate) navigator.vibrate?.(40); };
setShakeOn(save.shake);
// "Report a problem": what kind, who (for a complaint about a player), what happened. Stored for the team in bb_feedback.
const REP_KINDS = ['bug', 'player', 'idea', 'payment', 'other'];
let repKind = 'bug';
const repKinds = () => $('#rep-kinds').replaceChildren(...REP_KINDS.map(k => {
  const b = el('button', 'chip' + (k === repKind ? ' on' : ''), t('repKind_' + k));
  b.onclick = () => { repKind = k; $('#rep-about-row').hidden = k !== 'player'; repKinds(); };
  return b;
}));
$('#set-report').onclick = () => { sfx.click(); repKinds(); $('#rep-about-row').hidden = repKind !== 'player'; $('#scr-report').hidden = false; };
$('#rep-close').onclick = () => { $('#scr-report').hidden = true; };
$('#set-parents').onclick = () => { sfx.click(); $('#scr-parents').hidden = false; };
$('#par-close').onclick = () => { $('#scr-parents').hidden = true; };
$('#rep-send').onclick = async () => {
  const body = $('#rep-text').value.trim();
  if (body.length < 3) { toast(t('repEmpty')); return; }
  if (!net.online) { toast(t('repOffline')); return; }
  $('#rep-send').disabled = true;
  try {
    const ok = await online.sendFeedback(repKind, body, $('#rep-about').value, { v: VERSION, lang, trophies: save.trophies, id: save.profileId ?? null, screen: `${innerWidth}x${innerHeight}` });
    toast(t(ok ? 'repSent' : 'repLimit'));
    if (ok) { $('#rep-text').value = $('#rep-about').value = ''; $('#scr-report').hidden = true; }
  } catch { toast(t('repOffline')); }
  $('#rep-send').disabled = false;
};
$('#set-sound').onclick = () => { save.muted = !save.muted; setMuted(save.muted); persist(); muteUI(); };
$('#set-music').onclick = () => { save.music = !save.music; setMusicOn(save.music); persist(); muteUI(); };
$('#set-emotes').onclick = () => { save.foeEmotes = !save.foeEmotes; setFoeEmotes(save.foeEmotes); persist(); muteUI(); sfx.click(); };
$('#gear').onclick = () => { sfx.click(); home.settings(); muteUI(); $('#scr-settings').hidden = false; };
$('#set-close').onclick = () => { $('#scr-settings').hidden = true; };
$('#set-account').onclick = () => { $('#scr-settings').hidden = true; if (S.mode === 'home') home.open('profile'); };
$('#set-version').textContent = `BallBrawl · v${VERSION}` + (save.profileId ? ` · ID ${save.profileId.slice(0, 8).toUpperCase()}` : ''); // the ID helps find a player's report
setFoeEmotes(save.foeEmotes);
if (!langChosen() && RECORD == null) { // first launch: choose the language before anything else
  $('#lang-list').replaceChildren(...Object.entries(LANGS).map(([code, name]) => {
    const b = el('button', 'chip' + (code === lang ? ' on' : ''));
    b.textContent = name;
    b.onclick = () => { setLang(code); if (code !== lang) location.reload(); else $('#scr-lang').hidden = true; };
    return b;
  }));
  $('#scr-lang').hidden = false;
}
addEventListener('resize', layout);
initAds();
initAudio(save.muted);
setMusicOn(save.music);
playMusic('lobby'); // starts with the first tap (browsers keep audio off until then)
muteUI();
persist(); // stores the migrated save and the generated nickname right away
layout();
coinsUI();
S.challenge = decodeChallenge(location.hash.slice(1));
if (location.hash) history.replaceState(null, '', location.pathname + location.search); // tidy URL; a reload won't replay it
if (RECORD != null) { // ?record=leech,train starts that fight at once; plain ?record opens the picker
  document.body.classList.add('record');
  const pair = RECORD.split(',');
  if (pair.length === 2 && pair.every(id => BALLS[id])) { S.watch = pair; startWatch(); } else goWatch();
} else S.challenge ? goChallenge() : goHome('lobby');
requestAnimationFrame(frame);
// Gem packs paid on Dodo's page: the webhook may land a few seconds after we're back, so keep asking for half a minute.
async function claimPaid(back) {
  if (back) history.replaceState(null, '', location.pathname);
  for (let i = 0; i < (back ? 10 : 1); i++) {
    if (i) await new Promise(r => setTimeout(r, 3000));
    const got = creditPurchases(save, await online.claimPurchases().catch(() => []));
    if (got) { persist(); coinsUI(); home.reward({ gems: got }); confetti(50); sfx.coin(); return; }
  }
  if (back) toast(t('payWait'));
}
// Go online in the background; the game is already playable offline.
setTimeout(async () => {
  const { save: merged } = await online.connect(save);
  const invite = new URLSearchParams(location.search).get('party')?.toUpperCase();
  if (invite) history.replaceState(null, '', location.pathname); // a reload must not rejoin the old party
  if (invite && CODE_RE.test(invite) && net.online) setTimeout(() => partyOpen(invite, false), 600);
  if (net.online) claimPaid(new URLSearchParams(location.search).get('paid'));
  if (merged === save) return; // offline: connect hands back our own save untouched — nothing to swap in
  for (const k of Object.keys(save)) delete save[k]; // swap contents in place: home & the match hold this object
  Object.assign(save, merged);
  persist();
  coinsUI();
  if (S.mode === 'home') home.render();
  if (S.mode === 'squad') renderSquad();
}, 300);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ });
