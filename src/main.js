// Browser layer: screens, aiming, the battle loop, saving, ads wiring.
import { createWorld, launch, step, act, rng, W, H, SUDDEN, DASH, METER } from './sim.js';
import { BALLS, ORDER } from './balls.js';
import { LEVELS, LOSE_COINS, createMatch, roundWorld, endRound, revive, enemySquad, enemyHpMul, winCoins, aiAngle } from './match.js';
import { draw, drawIcon, fitCanvas, resetFx } from './render.js';
import { lang, t, ballName, ballAbout, superName, superAbout } from './i18n.js';
import { createAI } from './ai.js';
import { initAds, offerReward, cancelReward, interstitial } from './ads.js';
import { randomNick, validNick, nickText } from './nick.js';
import { encodeChallenge, decodeChallenge, newSeed } from './challenge.js';
import { initAudio, setMuted, sfx } from './sfx.js';

const $ = s => document.querySelector(s);
const el = (tag, cls = '', html) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const icon = (kind, size) => { const c = document.createElement('canvas'); drawIcon(c, kind, size); return c; };
const STEP = 1 / 60;

// ---------- save (localStorage is user-editable: validate everything) ----------
const KEY = 'ballbrawl.v1';
const save = {
  coins: 0, owned: ['basic'], squad: ['basic', 'basic', 'basic'], level: 1, matches: 0,
  nick: randomNick(), muted: false,
  created: [], answered: [], // seeds of challenge links I made / already got the bonus for
};
try {
  const s = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (Number.isFinite(s.coins)) save.coins = Math.max(0, Math.floor(s.coins));
  if (Array.isArray(s.owned)) save.owned = ['basic', ...new Set(s.owned.filter(id => BALLS[id] && id !== 'basic'))];
  if (Array.isArray(s.squad) && s.squad.length === 3) save.squad = s.squad.map(id => (save.owned.includes(id) ? id : 'basic'));
  if (Number.isInteger(s.level)) save.level = Math.min(LEVELS, Math.max(1, s.level));
  if (Number.isInteger(s.matches)) save.matches = Math.max(0, s.matches);
  if (validNick(s.nick)) save.nick = s.nick;
  save.muted = s.muted === true;
  const seeds = a => (Array.isArray(a) ? a.filter(Number.isInteger).slice(-100) : []);
  save.created = seeds(s.created);
  save.answered = seeds(s.answered);
} catch { /* corrupt or blocked storage: start fresh */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };

// ---------- state ----------
const S = {
  mode: 'menu', // menu | squad | aim | fight | ending | result | watch-pick | watch
  world: null, match: null, demo: false, demoEnd: 0,
  aim: 0, aiming: false, slot: 0,
  trial: null, pendingTrial: null, tryPlay: null,
  watch: ['leech', 'train'], launchAt: 0, watchDone: false,
  endAt: 0, outcome: null, earned: 0, wonLevel: 1, adAfter: 0,
  ai: null, ais: [], dashed: false, // ai = opponent in a match; ais = both sides in demo / watch
  aiLevel: 1, freezeUntil: 0, // freeze = hit-stop: pauses stepping only, the sim itself is untouched
  challenge: null, // decoded friend challenge while playing one
};

const canvas = $('#arena'), ctx = canvas.getContext('2d');
let scale = 1;
function layout() {
  const reserved = 56 + 44 + 110; // header, hud, watch bar + footer
  const size = Math.max(260, Math.floor(Math.min(innerWidth - 24, innerHeight - reserved, 560)));
  document.documentElement.style.setProperty('--size', size + 'px');
  scale = fitCanvas(canvas, size);
}

const SCREENS = ['menu', 'squad', 'result', 'watch', 'challenge'];
function show(screen) {
  for (const s of SCREENS) $('#scr-' + s).hidden = s !== screen;
  $('#hud').hidden = !['aim', 'fight', 'ending', 'watch'].includes(S.mode);
  $('#controls').hidden = !['aim', 'fight', 'ending'].includes(S.mode);
  $('#watch-bar').hidden = S.mode !== 'watch';
  if (screen) $('#banner').className = 'banner';
}

function banner(text, stay = false, tone = '') {
  const b = $('#banner');
  b.textContent = text;
  b.className = 'banner';
  void b.offsetWidth; // restart the CSS animation
  b.className = `banner ${stay ? 'stay' : 'show'} ${tone}`;
}

const coinsUI = () => { $('#coins').textContent = save.coins; };
const myNick = () => nickText(save.nick, lang);

let toastTimer = 0;
function toast(text) {
  const n = $('#toast');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, 2600);
}

// ---------- friend challenges (all data lives in the link) ----------
async function shareChallenge(reply = null) {
  const seed = newSeed();
  save.created = [...save.created, seed].slice(-100);
  persist();
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}c/#${encodeChallenge({ squad: save.squad, seed, nick: save.nick, level: save.level, reply })}`;
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
  S.match = createMatch({ squadA: [...c.squad], squadB: [...c.squad], hpMulB: 1, seed: c.seed }); // mirror squads: only skill decides
  S.aiLevel = c.level;
  S.demo = false;
  S.dashed = false;
  nextRound();
}

// A random AI-vs-AI fight that plays behind the menus.
function demo() {
  const r = Math.random, pick = () => ORDER[Math.floor(r() * ORDER.length)];
  S.world = createWorld({ seed: Math.floor(r() * 1e9), a: { id: pick() }, b: { id: pick() } });
  launch(S.world, r() * Math.PI * 2, r() * Math.PI * 2);
  S.ais = [createAI(0, 12, Math.floor(r() * 1e9)), createAI(1, 12, Math.floor(r() * 1e9))];
  S.demo = true;
  S.demoEnd = 0;
  resetFx();
}

// ---------- menu ----------
function goMenu() {
  cancelReward();
  S.mode = 'menu';
  if (!S.demo) demo();
  S.challenge = null;
  $('#m-level').textContent = t('level', { n: save.level, max: LEVELS });
  $('#m-nick').textContent = myNick();
  show('menu');
}

// ---------- squad & shop ----------
const enemyFor = level => enemySquad(level, rng(level * 101 + 7)); // fixed per level, so the preview is the real fight
const has = id => save.owned.includes(id) || S.trial === id;

function goSquad() {
  S.mode = 'squad';
  if (!S.demo) demo();
  S.slot = 0;
  S.tryPlay = null;
  show('squad');
  renderSquad();
  if (!S.trial) offerReward('try-ball', {
    onAvailable: play => { S.tryPlay = play; renderSquad(); },
    onReward: () => { S.trial = S.pendingTrial; place(S.trial); },
    onDone: () => { S.tryPlay = null; renderSquad(); },
  });
}

function place(id) {
  save.squad[S.slot] = id;
  S.slot = (S.slot + 1) % 3;
  persist();
  renderSquad();
}

function purchase(id) {
  const price = BALLS[id].price;
  if (save.coins < price || save.owned.includes(id)) return;
  save.coins -= price;
  save.owned.push(id);
  coinsUI();
  place(id);
}

function renderSquad() {
  $('#s-level').textContent = t('level', { n: save.level, max: LEVELS });

  $('#s-slots').replaceChildren(...save.squad.map((id, i) => {
    const b = el('button', 'slot' + (i === S.slot ? ' active' : ''));
    b.append(el('b', '', String(i + 1)), icon(id, 46));
    b.title = ballName(id);
    b.onclick = () => { S.slot = i; renderSquad(); };
    return b;
  }));

  const mul = enemyHpMul(save.level);
  $('#s-enemy').replaceChildren(...enemyFor(save.level).map(id => icon(id, 34)));
  $('#scr-squad .enemy small').textContent = t('enemy') + (mul > 1 ? ` · HP ×${mul.toFixed(2).replace(/0$/, '')}` : '');

  $('#s-cards').replaceChildren(...ORDER.map(id => {
    const d = BALLS[id], ok = has(id);
    const card = el('div', 'ball-card' + (ok ? '' : ' locked'));
    const top = el('div', 'top');
    const head = el('div');
    head.append(el('div', 'name', ballName(id)), el('div', 'hp', `${d.hp} ${t('hp')}`));
    top.append(icon(id, 42), head);
    const foot = el('div', 'foot-row');
    if (ok) foot.append(el('span', 'tag', save.owned.includes(id) ? '✓ ' + t('owned') : '★ ' + t('trial')));
    else {
      const buy = el('button', 'btn sm primary', `<span class="price"><i class="coin"></i>${d.price}</span>`);
      buy.disabled = save.coins < d.price;
      buy.title = buy.disabled ? t('notEnough') : t('buy');
      buy.onclick = e => { e.stopPropagation(); purchase(id); };
      foot.append(buy);
      if (S.tryPlay && !S.trial) {
        const tr = el('button', 'btn sm ad', t('try'));
        tr.onclick = e => { e.stopPropagation(); S.pendingTrial = id; S.tryPlay(); };
        foot.append(tr);
      }
    }
    card.append(top, el('p', '', ballAbout(id)), el('p', 'sup', `<b>${t('super')} · ${superName(id)}:</b> ${superAbout(id)}`), foot);
    if (ok) card.onclick = () => place(id);
    return card;
  }));
}

// ---------- battle ----------
function startMatch() {
  cancelReward();
  S.match = createMatch({
    squadA: [...save.squad],
    squadB: enemyFor(save.level),
    hpMulB: enemyHpMul(save.level),
    seed: Math.floor(Math.random() * 1e9),
  });
  S.aiLevel = save.level;
  S.demo = false;
  S.dashed = false;
  nextRound();
}

function nextRound() {
  S.world = roundWorld(S.match);
  S.ai = createAI(1, S.aiLevel, S.match.seed + S.match.round);
  resetFx();
  const [me, foe] = S.world.ents;
  S.aim = Math.atan2(foe.y - me.y, foe.x - me.x);
  S.mode = 'aim';
  show(null);
  hud();
  banner(t('round', { n: S.match.round }));
}

function fire() {
  if (S.mode !== 'aim') return;
  const w = S.world, [me, foe] = w.ents;
  launch(w, S.aim, aiAngle(foe.x, foe.y, me.x, me.y, S.aiLevel, w.rand));
  S.mode = 'fight';
  show(null);
}

const toArena = e => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
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
  const dot = (id, cls = '') => {
    const d = el('span', 'dot ' + cls);
    if (id) d.style.background = BALLS[id].color;
    return d;
  };
  const you = $('#hud-you'), foe = $('#hud-foe');
  if (S.mode === 'watch') {
    you.replaceChildren(dot(S.watch[0], 'cur'));
    foe.replaceChildren(dot(S.watch[1], 'cur'));
    return;
  }
  const { a, b } = S.match, dead = n => Array.from({ length: Math.max(0, 3 - n) }, () => dot(null, 'dead'));
  you.replaceChildren(...dead(a.length), ...a.slice(1).reverse().map(x => dot(x.id)), dot(a[0].id, 'cur'));
  foe.replaceChildren(dot(b[0].id, 'cur'), ...b.slice(1).map(x => dot(x.id)), ...dead(b.length));
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
  btn.style.setProperty('--p', k);
  btn.disabled = S.mode !== 'fight' || k < 1;
  btn.classList.toggle('ready', k >= 1);
}

let hintText = null;
function hints() {
  const tutorial = save.matches < 2;
  let txt = '';
  if (S.mode === 'aim') txt = t('aimHint');
  else if (S.mode === 'fight' && tutorial) txt = S.world.sides[0].meter >= METER.full ? t('superHint') : S.dashed ? '' : t('dashHint');
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
  } else if (S.mode === 'watch' && !S.watchDone) {
    S.watchDone = true;
    const r = S.world.result;
    banner(r === 'draw' ? t('draw') : t('wins', { name: ballName(S.watch[r]) }), true);
  }
}

// ---------- results ----------
const CHALLENGE_BONUS = 10;
function finishMatch(r) {
  const won = r === 0, c = S.challenge;
  S.wonLevel = save.level;
  S.outcome = r;
  if (c) { // challenges: no level change; a one-time bonus, never for your own links
    const fresh = !save.created.includes(c.seed) && !save.answered.includes(c.seed);
    S.earned = fresh ? CHALLENGE_BONUS : 0;
    if (fresh) save.answered = [...save.answered, c.seed].slice(-100);
  } else {
    S.earned = won ? winCoins(save.level) : LOSE_COINS;
    if (won && save.level < LEVELS) save.level++;
  }
  save.coins += S.earned;
  save.matches++;
  persist();
  coinsUI();
  S.mode = 'result';
  won ? sfx.win() : sfx.lose();
  showResult();
}

function showResult() {
  const r = S.outcome, won = r === 0, title = $('#r-title');
  title.textContent = won ? t('win') : r === 'draw' ? t('draw') : t('lose');
  title.className = won ? 'win' : 'lose';
  const c = S.challenge, box = $('#r-ads');
  box.replaceChildren();
  $('#r-coins').textContent = '+' + S.earned;
  if (c) { // challenge result: no ads, the main action is "challenge them back"
    const name = nickText(c.nick, lang);
    $('#r-sub').textContent = won ? t('challengeWin', { nick: name }) : r === 'draw' ? t('draw') : t('challengeLose', { nick: name });
    $('#r-next').textContent = t('replyChallenge');
    $('#r-next').onclick = () => shareChallenge({ seed: c.seed, result: won ? 'w' : r === 'draw' ? 'd' : 'l' });
    $('#r-share').hidden = true;
    show('result');
    return;
  }
  $('#r-sub').textContent = won && S.wonLevel === LEVELS ? t('allDone') : t('level', { n: S.wonLevel, max: LEVELS });
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
    save.coins -= LOSE_COINS; // the match isn't over after all
    save.matches--;
    persist();
    coinsUI();
    revive(S.match);
    nextRound();
  });
}

async function leaveResult(next) {
  cancelReward();
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
  S.mode = 'watch';
  S.launchAt = performance.now() / 1000 + 1.4;
  show(null);
  hud();
  banner(`${ballName(S.watch[0])} VS ${ballName(S.watch[1])}`);
}

function watchLaunch() {
  const w = S.world, [a, b] = w.ents;
  launch(w, aiAngle(a.x, a.y, b.x, b.y, 18, w.rand), aiAngle(b.x, b.y, a.x, a.y, 18, w.rand));
}

// Sound, hit-stop and super banners from this frame's sim events (draw() consumes them right after).
let lastWallSfx = 0;
function feel(w, now) {
  let hits = 0;
  for (const ev of w.events) {
    if (ev.type === 'hit' && hits++ < 2) sfx.hit(ev.amount);
    if (ev.type === 'hit' && ev.amount >= 18) S.freezeUntil = Math.max(S.freezeUntil, now + 0.05);
    if (ev.type === 'wall' && now - lastWallSfx > 0.12) { lastWallSfx = now; sfx.wall(); }
    if (ev.type === 'dash') sfx.dash();
    if (ev.type === 'death') { sfx.death(); S.freezeUntil = Math.max(S.freezeUntil, now + 0.12); }
    if (ev.type === 'super') {
      sfx.super();
      S.freezeUntil = Math.max(S.freezeUntil, now + 0.08);
      banner(superName(ev.kind) + '!', false, ev.side ? 'foe' : 'you');
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
    if (!S.demo) feel(w, now);
    if (w.result != null) onRoundOver(now);
    draw(ctx, S.world, scale, { aim: S.mode === 'aim' ? S.aim : null, now, dt });
    mid();
    controls();
    hints();
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
document.documentElement.lang = lang;
if (lang === 'en') document.title = 'BallBrawl — ball battle';
for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
$('#m-play').onclick = goSquad;
$('#m-watch').onclick = goWatch;
$('#s-back').onclick = goMenu;
$('#s-fight').onclick = startMatch;
$('#r-menu').onclick = () => leaveResult(goMenu);
$('#r-share').onclick = () => shareChallenge();
$('#m-challenge').onclick = () => shareChallenge();
$('#m-renick').onclick = () => { save.nick = randomNick(); persist(); $('#m-nick').textContent = myNick(); sfx.click(); };
$('#c-accept').onclick = startChallenge;
$('#c-skip').onclick = goMenu;
const muteUI = () => { $('#mute').textContent = save.muted ? '\u{1F507}' : '\u{1F50A}'; };
$('#mute').onclick = () => { save.muted = !save.muted; setMuted(save.muted); persist(); muteUI(); };
$('#w-start').onclick = startWatch;
$('#w-again').onclick = startWatch;
$('#w-back').onclick = goWatch;
$('#w-cancel').onclick = goMenu;
$('#super-btn').onclick = useSuper;
addEventListener('resize', layout);
initAds();
initAudio(save.muted);
muteUI();
persist(); // keeps the generated nickname stable from the first visit
layout();
coinsUI();
S.challenge = decodeChallenge(location.hash.slice(1));
if (location.hash) history.replaceState(null, '', location.pathname + location.search); // tidy URL; a reload won't replay it
S.challenge ? goChallenge() : goMenu();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ });
