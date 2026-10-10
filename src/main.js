// Browser layer: screens, aiming, the battle loop, saving, ads wiring.
import { createWorld, launch, step, act, canSuper, rng, W, H, SUDDEN, DASH, METER } from './sim.js';
import { BALLS, ORDER } from './balls.js';
import { createMatch, roundWorld, endRound, revive, aiAngle } from './match.js';
import { draw, drawIcon, fitCanvas, resetFx, M, emote, drawEmote, setAutoEmote, pickMood, setAuras, setFoeEmotes } from './render.js';
import { lang, t, ballName, ballAbout, superName, superAbout, skinName } from './i18n.js';
const RECORD = new URLSearchParams(location.search).get('record'); // ?record[=a,b]: chrome-free 9:16 spectator page for screen recordings
import { createAI } from './ai.js';
import { initAds, offerReward, cancelReward, interstitial } from './ads.js';
import { randomNick, nickText } from './nick.js';
import { encodeChallenge, decodeChallenge, newSeed } from './challenge.js';
import { initAudio, setMuted, sfx, confetti } from './sfx.js';
import {
  migrate, aiLevel, enemyHpMulFor, enemySquadFor, winCoinsFor, LOSE_COINS, UNLOCK, buyBall, trophyLoss, winChest,
  claimable, pathNodes, track, dayKey, refreshQuests, gainMastery, EMOTE_LIST, owns,
} from './progress.js';
import { createHome } from './meta.js';
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
  aiLevel: 1, freezeUntil: 0, // freeze = hit-stop: pauses stepping only, the sim itself is untouched
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
  const reserved = 56 + 44 + 110; // header, hud, controls + footer
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
  S.world = createWorld({ seed: Math.floor(r() * 1e9), a: { id: pick() }, b: { id: pick() } });
  launch(S.world, r() * Math.PI * 2, r() * Math.PI * 2);
  S.ais = [createAI(0, 12, Math.floor(r() * 1e9)), createAI(1, 12, Math.floor(r() * 1e9))];
  S.demo = true;
  S.demoEnd = 0;
  setAuras({});
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
  S.match = createMatch({ squadA: [...c.squad], squadB: [...c.squad], hpMulB: 1, seed: c.seed, skinsA: save.skinOf }); // mirror squads: only skill decides
  S.aiLevel = c.level;
  beginMatch();
}

// ---------- home ----------
const home = createHome({
  save, persist, el, icon, coinsUI, toast, online,
  onPlay: () => goSquad(),
  onWatch: () => goWatch(),
  onChallenge: () => shareChallenge(),
});
function goHome(tab) {
  cancelReward();
  S.mode = 'home';
  S.challenge = null;
  if (!S.demo) demo();
  show(null);
  home.open(tab);
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
  $('#s-info').innerHTML = `<b></b> · ${BALLS[info].hp} ${t('hp')}<br><span></span><br><em></em>`;
  $('#s-info b').textContent = ballName(info);
  $('#s-info span').textContent = ballAbout(info);
  $('#s-info em').textContent = `${t('super')} · ${superName(info)}: ${superAbout(info)}`;

  $('#s-cards').replaceChildren(...ORDER.map(id => {
    const d = BALLS[id], ok = has(id), slots = save.squad.map((s, i) => (s === id ? i + 1 : 0)).filter(Boolean);
    const tile = el('div', 'tile' + (ok ? '' : ' locked') + (id === info ? ' info' : ''));
    tile.style.setProperty('--c', d.color);
    if (ok && slots.length) tile.append(el('i', 'pos', slots.join('·')));
    tile.append(icon(id, 60, save.skinOf[id]), el('b', ''), el('small', ''));
    tile.children[slots.length && ok ? 2 : 1].textContent = ballName(id);
    const small = tile.lastChild;
    if (ok) small.textContent = save.owned.includes(id) ? superName(id) : '★ ' + t('trial');
    else {
      small.innerHTML = `<i class="trophy"></i>${UNLOCK[id]}`;
      const buy = el('button', 'btn sm primary', `<span class="price"><i class="coin"></i>${d.price}</span>`);
      buy.disabled = save.coins < d.price;
      buy.title = buy.disabled ? t('notEnough') : t('buy');
      buy.onclick = e => { e.stopPropagation(); if (buyBall(save, id)) { sfx.coin(); coinsUI(); place(id); } };
      tile.append(buy);
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
  if (net.online) {
    try { S.matchId = await online.startMatch(S.opponent?.id); } catch { /* server unreachable: this one is training */ }
  }
  $('#s-fight').disabled = $('#s-back').disabled = false;
  S.ranked = !!S.matchId;
  S.matchStart = Date.now();
  S.match = createMatch({
    squadA: [...save.squad],
    squadB: enemySquad(), // a real player's squad is still piloted by the AI, at your trophies' difficulty
    hpMulB: enemyHpMulFor(save.trophies),
    seed: S.nextSeed,
    skinsA: save.skinOf,
    skinsB: S.opponent?.skins ?? {},
  });
  S.aiLevel = aiLevel(save.trophies);
  beginMatch();
}

function beginMatch() {
  S.demo = false;
  S.dashed = false;
  S.ms = { dashes: 0, supers: 0, kills: 0 };
  nextRound();
}

function nextRound() {
  S.world = roundWorld(S.match);
  S.ai = createAI(1, S.aiLevel, S.match.seed + S.match.round);
  resetFx();
  const [me, foe] = S.world.ents;
  S.aim = Math.atan2(foe.y - me.y, foe.x - me.x);
  S.foeAim = aiAngle(foe.x, foe.y, me.x, me.y, S.aiLevel, S.world.rand); // decided now so it can be shown; nothing else draws from rand before launch
  S.aimLeft = AIM_TIME; // counted down in frame time, so a backgrounded tab doesn't fire the round on return
  S.mode = 'aim';
  show(null);
  hud();
  cards(me, foe);
  banner(t('round', { n: S.match.round }));
}

function fire() {
  if (S.mode !== 'aim') return;
  launch(S.world, S.aim, S.foeAim);
  S.mode = 'fight';
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
const useSuper = () => { if (S.mode === 'fight') act(S.world, 0, { type: 'super' }); };
canvas.addEventListener('pointerdown', e => {
  if (S.mode === 'fight') { // tap = dash there
    const [x, y] = toArena(e);
    if (act(S.world, 0, { type: 'dash', x, y })) S.dashed = true;
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
  if (S.mode === 'fight' && e.key === ' ') { useSuper(); e.preventDefault(); return; }
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
  const { a, b } = S.match, dead = n => Array.from({ length: Math.max(0, 3 - n) }, () => dot(null, 'dead'));
  you.replaceChildren(...dead(a.length), ...a.slice(1).reverse().map(x => dot(x.id, '', x.skin)), dot(a[0].id, 'cur', a[0].skin));
  foe.replaceChildren(dot(b[0].id, 'cur', b[0].skin), ...b.slice(1).map(x => dot(x.id, '', x.skin)), ...dead(b.length));
}

const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6z"/></svg>';
const pips = Array.from({ length: DASH.charges }, () => el('span', 'pip', BOLT));
$('#dash-pips').append(...pips);
function controls() {
  if ($('#controls').hidden) return;
  const s = S.world.sides[0], k = s.meter / METER.full, btn = $('#super-btn');
  pips.forEach((p, i) => {
    p.classList.toggle('on', i < s.dashes);
    p.style.setProperty('--p', i === s.dashes ? s.regen / DASH.regen : 0);
  });
  const can = canSuper(S.world, 0);
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
    txt = t('round', { n: S.match.round }) + (w.launched ? ` · ${left > 0 ? left : t('sudden')}` : '');
  }
  if (txt === midText) return;
  midText = txt;
  const m = $('#hud-mid');
  m.textContent = txt;
  m.classList.toggle('sudden', w.launched && w.t > SUDDEN);
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
    r == null ? nextRound() : finishMatch(r);
  } else if (S.mode === 'watch' && !S.watchDone) { // hold the final numbers for a second: that frame is the thumbnail
    S.watchEndAt ||= now + 1;
    if (now < S.watchEndAt) return;
    S.watchDone = true;
    const r = S.world.result;
    banner(r === 'draw' ? t('draw') : t('wins', { name: ballName(S.watch[r]) }), true);
  }
}

// ---------- results ----------
const CHALLENGE_BONUS = 10;
function finishMatch(r) {
  const won = r === 0, c = S.challenge, before = save.trophies;
  const flawless = won && S.match.a.length === 3 && !S.match.revived; // not a single ball lost
  S.outcome = r;
  S.delta = 0;
  S.settleLater = false;
  if (c) { // challenges: no trophies; a one-time bonus, never for your own links
    const fresh = !save.created.includes(c.seed) && !save.answered.includes(c.seed);
    S.earned = fresh ? CHALLENGE_BONUS : 0;
    if (fresh) save.answered = [...save.answered, c.seed].slice(-100);
  } else {
    S.earned = won ? winCoinsFor(before) : LOSE_COINS;
    if (S.ranked) { // the server decides; show the expected change until it answers
      S.delta = won ? 8 + (flawless ? 1 : 0) : r === 1 ? -Math.min(save.trophies, trophyLoss(save.trophies)) : 0;
      save.pendingFinish = { match: S.matchId, result: won ? 'won' : r === 1 ? 'lost' : 'draw', flawless };
      S.settleLater = r === 1 && !S.match.revived; // a revive may still turn this loss around
      if (!S.settleLater) settle();
    }
  }
  save.coins += S.earned;
  S.chestDrop = won ? winChest(save) ?? false : null; // a win puts the next chest into a free slot (false = slots full)
  S.ups = gainMastery(save, c ? c.squad : save.squad, won); // each ball's own path
  save.matches++;
  track(save, { matches: 1, wins: won ? 1 : 0, flawless: flawless ? 1 : 0, challenges: c ? 1 : 0, ...S.ms });
  S.ms = { dashes: 0, supers: 0, kills: 0 };
  persist();
  coinsUI();
  S.mode = 'result';
  won ? sfx.win() : sfx.lose();
  if (won) confetti(48);
  showResult();
}

// Trophies on the result screen: the server's number once it answers, the expected one before that.
function trophyLine() {
  if (S.mode !== 'result' || S.challenge) return;
  if (!S.ranked) {
    $('#r-trophies').hidden = true;
    $('#r-sub').textContent = t('training');
    return;
  }
  const d = S.delta, shown = save.pendingFinish ? save.trophies + d : save.trophies;
  $('#r-trophies').hidden = false;
  $('#r-trophies').innerHTML = `<i class="trophy" style="width:26px;height:26px"></i><span class="cnt">${shown - d}</span> <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>`;
  countUp($('#r-trophies .cnt'), shown - d, shown);
  const next = pathNodes(save.maxTrophies).find(n => n.at > shown);
  $('#r-sub').textContent = next ? t('toNext', { n: next.at - shown }) : '';
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
    persist();
    trophyLine();
    if (S.mode === 'home') home.render();
  } catch { /* stays pending */ }
}

function showResult() {
  const r = S.outcome, won = r === 0, title = $('#r-title');
  title.textContent = won ? t('win') : r === 'draw' ? t('draw') : t('lose');
  title.className = won ? 'win' : 'lose';
  const squad = S.challenge ? S.challenge.squad : save.squad;
  $('#r-squad').replaceChildren(...squad.map((id, i) => icon(id, i ? 60 : 84, save.skinOf[id])));
  $('#r-squad').classList.toggle('sad', !won);
  const c = S.challenge, box = $('#r-ads');
  box.replaceChildren();
  $('#r-coins').textContent = '+' + S.earned;
  $('#r-trophies').hidden = !!c;
  $('#r-chest').hidden = S.chestDrop == null;
  if (S.chestDrop != null) $('#r-chest').textContent = S.chestDrop ? t('resultSlot', { name: t('chest_' + S.chestDrop) }) : t('resultSlotsFull');
  $('#r-reward').hidden = true;
  const ups = S.ups ?? [];
  $('#r-rank').hidden = !ups.length;
  $('#r-rank').textContent = ups.map(u => t('rankUp', { name: ballName(u.id), n: u.rank })
    + (u.skin ? ` · ${skinName(u.skin)}` : u.chest ? ` · ${t('chest_' + u.chest)}` : u.coins ? ` · +${u.coins}` : '')).join('  ');
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
  else if (r === 1 && !S.match.revived) offer('revive', t('revive'), () => {
    // the match isn't over after all: take back what the loss changed (trophies weren't reported yet)
    save.pendingFinish = null;
    S.settleLater = false;
    save.coins -= LOSE_COINS;
    save.matches--;
    save.stats.matches--;
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
    $(sel).replaceChildren(...ORDER.map(id => {
      const b = el('button', 'pick' + (S.watch[i] === id ? ' sel' : ''));
      b.append(icon(id, 44), document.createTextNode(ballName(id)));
      b.onclick = () => { S.watch[i] = id; renderWatch(); };
      return b;
    }));
  });
}

function startWatch() {
  S.world = createWorld({ seed: Math.floor(Math.random() * 1e9), a: { id: S.watch[0] }, b: { id: S.watch[1] } });
  S.ais = [createAI(0, 20, Math.floor(Math.random() * 1e9)), createAI(1, 20, Math.floor(Math.random() * 1e9))];
  resetFx();
  S.demo = false;
  S.watchDone = false;
  S.watchEndAt = 0;
  S.mode = 'watch';
  setAutoEmote([0, 1]);
  setAuras({});
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
    if (ev.type === 'hit' && hits++ < 2) sfx.hit(ev.amount);
    if (ev.type === 'hit' && ev.amount >= 18) S.freezeUntil = Math.max(S.freezeUntil, now + 0.05);
    if (ev.type === 'wall' && now - lastWallSfx > 0.12) { lastWallSfx = now; sfx.wall(); }
    if (ev.type === 'boom') { sfx.death(); S.freezeUntil = Math.max(S.freezeUntil, now + 0.06); }
    if (ev.type === 'dash') { sfx.dash(); if (mine && ev.side === 0) S.ms.dashes++; }
    if (ev.type === 'train') sfx.train();
    if (ev.type === 'death') {
      sfx.death();
      S.freezeUntil = Math.max(S.freezeUntil, now + 0.12);
      if (mine && ev.side === 1 && !ev.mini) S.ms.kills++;
    }
    if (ev.type === 'super') {
      sfx.super();
      S.freezeUntil = Math.max(S.freezeUntil, now + 0.08);
      banner(superName(ev.kind) + '!', false, ev.side ? 'foe' : 'you');
      if (mine && ev.side === 0) S.ms.supers++;
    }
  }
}

// ---------- loop ----------
let last = performance.now() / 1000, acc = 0;
function frame(ms) {
  const now = ms / 1000, dt = Math.min(0.05, Math.max(0, now - last));
  last = now;
  const w = S.world;
  if (w) {
    if (S.mode === 'watch' && !w.launched && now >= S.launchAt) watchLaunch();
    if (now < S.freezeUntil) acc = 0; // hit-stop: hold the frame, the sim just waits
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
    if (w.result != null) onRoundOver(now);
    const preWatch = S.mode === 'watch' && !w.launched;
    draw(ctx, S.world, scale, { aim: S.mode === 'aim' ? S.aim : preWatch ? S.watchAims[0] : null, foeAim: S.mode === 'aim' ? S.foeAim : preWatch ? S.watchAims[1] : null, now, dt });
    mid();
    controls();
    hints();
  }
  requestAnimationFrame(frame);
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
      if (!emote(0, e.id)) return;
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
// Settings: sound, the opponent's emotes, language, account and privacy. The gear works on every screen.
const muteUI = () => {
  $('#set-sound').classList.toggle('on', !save.muted);
  $('#set-sound').setAttribute('aria-checked', String(!save.muted));
  $('#set-emotes').classList.toggle('on', save.foeEmotes);
  $('#set-emotes').setAttribute('aria-checked', String(save.foeEmotes));
};
$('#set-sound').onclick = () => { save.muted = !save.muted; setMuted(save.muted); persist(); muteUI(); };
$('#set-emotes').onclick = () => { save.foeEmotes = !save.foeEmotes; setFoeEmotes(save.foeEmotes); persist(); muteUI(); sfx.click(); };
$('#gear').onclick = () => { sfx.click(); home.settings(); muteUI(); $('#scr-settings').hidden = false; };
$('#set-close').onclick = () => { $('#scr-settings').hidden = true; };
$('#set-account').onclick = () => { $('#scr-settings').hidden = true; if (S.mode === 'home') home.open('profile'); };
$('#set-version').textContent = 'BallBrawl · v1.6';
setFoeEmotes(save.foeEmotes);
addEventListener('resize', layout);
initAds();
initAudio(save.muted);
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
// Go online in the background; the game is already playable offline.
setTimeout(async () => {
  const { save: merged } = await online.connect(save);
  if (merged === save) return; // offline: connect hands back our own save untouched — nothing to swap in
  for (const k of Object.keys(save)) delete save[k]; // swap contents in place: home & the match hold this object
  Object.assign(save, merged);
  persist();
  coinsUI();
  if (S.mode === 'home') home.render();
  if (S.mode === 'squad') renderSquad();
}, 300);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ });
