// Home: the lobby (main menu) and the pages it opens — Glory Road, chests, balls with skins, quests, leaders, profile.
// All game rules live in progress.js; this file only draws them and wires taps.
import { BALLS, ORDER } from './balls.js';
import { t, lang, ballName, ballAbout, superName, superAbout, questName, achievementName, skinName } from './i18n.js';
import { nickText, randomNick, validNick } from './nick.js';
import {
  pathNodes, claimable, claim, UNLOCK, SKINS, SKIN_PRICE, hasSkin, buySkin, equipSkin, buyBall,
  dayKey, refreshQuests, questDef, claimQuest, dailyState, claimDaily, DAILY,
  ACHIEVEMENTS, achievementValue, claimAchievement, CHESTS, CHEST_WINS, openChest,
} from './progress.js';
import { sfx, confetti } from './sfx.js';

const $ = s => document.querySelector(s);
const STEP = 128, PAD = 64; // Glory Road: px between reward cards, and where 0 trophies sits
const KINDS = ['box', 'big', 'mega'];
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32; // chests: not predictable from the page

// A chest drawn as inline SVG: planks, metal bands with rivets, corner caps and a lock. The lid is its own
// <g class="lid"> so the opening scene can blow it off. Box: wood and steel; big: blue and gold; mega: purple, gold and a gem.
const CHEST_COLORS = {
  box: { base: '#C98A4B', dark: '#8E5524', trim: '#D9DEE8', trimDark: '#8E95A8' },
  big: { base: '#3D86FF', dark: '#1E4FB0', trim: '#FFCC33', trimDark: '#C78C00' },
  mega: { base: '#A85CFF', dark: '#5E22A8', trim: '#FFCC33', trimDark: '#C78C00' },
};
export function chestSvg(kind) {
  const c = CHEST_COLORS[kind] ?? CHEST_COLORS.box, o = 'stroke="#0F1F38" stroke-width="4" stroke-linejoin="round"';
  const rivets = (xs, ys) => xs.flatMap(x => ys.map(y => `<circle cx="${x}" cy="${y}" r="2.2" fill="${c.trimDark}"/>`)).join('');
  const gem = kind === 'mega'
    ? '<path d="M60 64 l6 6 -6 8 -6 -8z" fill="#FF4D5E" stroke="#0F1F38" stroke-width="2" stroke-linejoin="round"/><path d="M58 67 l2 -2 2 2" fill="none" stroke="#FFB3BA" stroke-width="1.5"/>'
    : '<circle cx="60" cy="68" r="3.4" fill="#0F1F38"/><path d="M58.6 69 h2.8 l1 7 h-4.8z" fill="#0F1F38"/>';
  return `<svg viewBox="0 0 120 108" aria-hidden="true" class="chest-svg">
<ellipse cx="60" cy="102" rx="50" ry="6" fill="rgba(8,16,32,0.35)"/>
<g class="body">
<rect x="10" y="50" width="100" height="48" rx="8" fill="${c.dark}" ${o}/>
<path d="M14 64 H106 M14 80 H106" stroke="rgba(0,0,0,0.22)" stroke-width="3"/>
<rect x="12" y="52" width="96" height="6" rx="3" fill="${c.base}"/>
<rect x="24" y="50" width="13" height="48" fill="${c.trim}" ${o}/>
<rect x="83" y="50" width="13" height="48" fill="${c.trim}" ${o}/>
${rivets([30.5, 89.5], [58, 72, 88])}
<path d="M10 84 V90 a8 8 0 0 0 8 8 H26 Z M110 84 V90 a8 8 0 0 1 -8 8 H94 Z" fill="${c.trim}" ${o}/>
<rect x="49" y="56" width="22" height="26" rx="5" fill="${c.trim}" ${o}/>
${gem}
</g>
<g class="lid">
<path d="M8 54 V36 Q8 12 34 12 H86 Q112 12 112 36 V54 Z" fill="${c.base}" ${o}/>
<path d="M18 22 Q30 17 46 17 H76" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="4" stroke-linecap="round"/>
<path d="M24 54 V14 H37 V54 Z M83 54 V14 H96 V54 Z" fill="${c.trim}" ${o}/>
${rivets([30.5, 89.5], [24, 38])}
<rect x="8" y="48" width="104" height="8" rx="3" fill="${c.dark}" ${o}/>
</g>
</svg>`;
}

export function createHome({ save, persist, el, icon, coinsUI, toast, onPlay, onWatch, onChallenge, online }) {
  const { net, leaderboard, redeemCode, deleteProfile } = online;
  let tab = 'lobby';
  const coin = n => `<span class="amt"><i class="coin"></i>${n}</span>`;

  // ---------- reward popup ----------
  function reward(res) {
    if (!res) return;
    const hero = $('#rw-icon');
    hero.className = 'ball-hero';
    void hero.offsetWidth;
    hero.className = 'ball-hero pop';
    let text = '', sub = '';
    $('#rw-open').hidden = !res.chest;
    if (res.chest) { // a chest from the road: it waits in the chest button, or can be opened right here
      hero.innerHTML = chestSvg(res.chest);
      text = t('chestNew', { name: t('chest_' + res.chest) });
      sub = t('chestNewSub');
      $('#rw-open').onclick = () => { $('#scr-reward').hidden = true; chests(res.chest); };
    } else if (res.gift) {
      hero.replaceChildren(icon(save.squad[0], 110, 'rainbow'));
      text = t('acctDoneTitle');
      sub = t('acctDoneSub');
    } else if (res.ball) {
      hero.replaceChildren(icon(res.ball, 96, save.skinOf[res.ball]));
      text = t('newBall', { name: ballName(res.ball) });
      if (res.coins) { sub = `${t('alreadyHad')} ${t('gotCoins', { n: res.coins })}`; }
    } else if (res.skin) {
      hero.replaceChildren(icon(res.skin[0], 96, res.skin[1]));
      text = t('newSkin', { skin: skinName(res.skin[1]), name: ballName(res.skin[0]) });
      if (res.coins) sub = t('gotCoins', { n: res.coins });
    } else {
      hero.innerHTML = '<i class="coin" style="width:96px;height:96px"></i>';
      text = t('gotCoins', { n: res.coins });
    }
    $('#rw-text').textContent = text;
    $('#rw-sub').textContent = sub;
    $('#scr-reward').hidden = false;
    sfx.coin();
    if (res.ball || res.skin || res.chest || res.gift) confetti();
    persist();
    coinsUI();
    render();
  }
  $('#rw-ok').onclick = () => { $('#scr-reward').hidden = true; };

  // ---------- top bar ----------
  function top() {
    $('#h-avatar').replaceChildren(icon(save.avatar, 44, save.skinOf[save.avatar]));
    $('#h-nick').textContent = nickText(save.nick, lang);
    $('#h-trophies').textContent = save.trophies;
  }

  // ---------- trophy road (horizontal, left → right, like Brawl Stars) ----------
  const rewardName = n => (n.ball ? ballName(n.ball) : n.skin ? skinName(n.skin[1]) : n.chest ? t('chest_' + n.chest) : `+${n.coins}`);
  const rewardIcon = (n, size) => {
    if (n.ball) return icon(n.ball, size);
    if (n.skin) return icon(n.skin[0], size, n.skin[1]);
    if (n.chest) return el('span', 'chest-ico', chestSvg(n.chest));
    return el('i', 'coin big-coin');
  };

  function road() {
    const box = $('#road'), until = Math.max(save.maxTrophies + 400, 400);
    const nodes = pathNodes(until).filter(n => n.at <= until);
    const ready = new Set(claimable(save).map(n => n.at));
    const x = i => PAD + (i + 1) * STEP;
    const inner = el('div', 'hroad-in');
    inner.style.width = `${x(nodes.length - 1) + PAD + 30}px`;

    // gold fill up to your trophies, interpolated between the cards around them
    const xs = [PAD, ...nodes.map((_, i) => x(i))], ats = [0, ...nodes.map(n => n.at)];
    let k = 0;
    while (k < ats.length - 1 && ats[k + 1] <= save.trophies) k++;
    const frac = k < ats.length - 1 ? (save.trophies - ats[k]) / (ats[k + 1] - ats[k]) : 0;
    const fill = xs[k] + frac * ((xs[k + 1] ?? xs[k]) - xs[k]);
    const track = el('div', 'track');
    const bar = el('div', 'track-fill');
    bar.style.width = `${Math.max(0, fill - 14)}px`;
    track.append(bar);
    inner.append(track);

    const tick = (left, at, state) => {
      const d = el('div', `tick ${state}`, `<i class="trophy"></i>${at}`);
      d.style.left = `${left}px`;
      const notch = el('div', `notch ${state}`);
      notch.style.left = `${left}px`;
      return [notch, d];
    };
    inner.append(...tick(PAD, 0, 'done'));
    nodes.forEach((n, i) => {
      const state = save.claimed.includes(n.at) ? 'done' : ready.has(n.at) ? 'ready' : 'locked';
      const card = el('button', `rcard ${state} ${n.ball ? 'is-ball' : n.skin ? 'is-skin' : n.chest ? 'is-chest' : 'is-coins'}`);
      card.style.left = `${x(i)}px`;
      card.append(rewardIcon(n, 54), el('span', 'rlabel'));
      card.lastChild.textContent = rewardName(n);
      if (state === 'ready') {
        card.append(el('span', 'rclaim', t('claim')));
        card.onclick = () => reward(claim(save, n));
      }
      if (state === 'done') card.append(el('span', 'rbadge ok', '\u2713'));
      if (state === 'locked') card.append(el('span', 'rbadge lock', '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>'));
      const stem = el('div', `stem ${state}`);
      stem.style.left = `${x(i)}px`;
      inner.append(stem, card, ...tick(x(i), n.at, state));
    });

    const me = el('div', 'hmarker');
    me.style.left = `${fill}px`;
    me.append(icon(save.avatar, 38, save.skinOf[save.avatar]));
    inner.append(me);
    box.replaceChildren(inner);
    if (tab === 'path') requestAnimationFrame(() => { box.scrollLeft = fill - box.clientWidth * 0.4; });
  }

  // drag the road with the mouse; turn the mouse wheel into sideways scrolling (touch scrolls natively)
  const roadBox = $('#road');
  roadBox.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    roadBox.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  let drag = null;
  roadBox.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = { x: e.clientX, left: roadBox.scrollLeft, moved: false }; });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true;
    roadBox.scrollLeft = drag.left - dx;
  });
  addEventListener('pointerup', () => { setTimeout(() => { drag = null; }); });
  roadBox.addEventListener('click', e => { if (drag?.moved) { e.stopPropagation(); e.preventDefault(); } }, true);

  // the next road reward and how far along the way to it you are (0–100)
  function nextReward() {
    const all = pathNodes(save.maxTrophies + 400);
    const next = all.find(n => n.at > save.trophies);
    const prev = [...all].reverse().find(n => n.at <= save.trophies)?.at ?? 0;
    return { next, p: next ? Math.round(((save.trophies - prev) / (next.at - prev)) * 100) : 100 };
  }

  // the card above the road: your trophies, the next reward and how far it is
  function pathHero() {
    const { next, p } = nextReward(), ready = claimable(save);
    const hero = $('#path-hero');
    const nextBox = el('div', 'ph-next');
    if (next) {
      nextBox.append(rewardIcon(next, 46));
      const txt = el('div', 'ph-next-txt');
      txt.append(el('small', '', t('nextReward')), el('b', ''), el('div', 'ph-bar', `<i style="--p:${p}%"></i>`), el('small', '', t('toNext', { n: next.at - save.trophies })));
      txt.children[1].textContent = rewardName(next);
      nextBox.append(txt);
    }
    hero.replaceChildren(el('div', 'ph-trophies', `<i class="trophy"></i><b>${save.trophies}</b>`), nextBox);
    if (ready.length > 1) {
      const all2 = el('button', 'btn primary sm claim-all', `${t('claimAll')} (${ready.length})`);
      all2.onclick = () => {
        const got = ready.map(n => claim(save, n));
        const coins = got.reduce((s, r) => s + (r?.coins || 0), 0);
        reward(got.find(r => r?.ball && !r.coins) || got.find(r => r?.skin && !r.coins) || got.find(r => r?.chest) || { coins });
        if (got.length > 1) $('#rw-sub').textContent = t('andMore', { n: got.length - 1 });
      };
      hero.append(all2);
    }
    $('#path-tips').innerHTML = `<span><i class="trophy"></i>+8 ${t('tipWin')}</span><span><i class="trophy"></i>+9 ${t('tipFlawless')}</span><span>${t('tipKeep')}</span>`;
  }

  // ---------- balls & skins ----------
  function balls() { // character tiles; details and skins open on tap
    $('#b-grid').replaceChildren(...ORDER.map(id => {
      const own = save.owned.includes(id);
      const tile = el('button', 'tile' + (own ? '' : ' locked'));
      tile.style.setProperty('--c', BALLS[id].color);
      tile.append(icon(id, 72, save.skinOf[id]), el('b', ''), el('small', '', own ? `${BALLS[id].hp} ${t('hp')}` : `<i class="trophy"></i>${UNLOCK[id]}`));
      tile.children[1].textContent = ballName(id);
      tile.onclick = () => { sfx.click(); openBall(id); };
      return tile;
    }));
  }

  function openBall(id) {
    const own = save.owned.includes(id), d = BALLS[id];
    $('#ball-icon').replaceChildren(icon(id, 96, save.skinOf[id]));
    $('#ball-name').textContent = ballName(id);
    $('#ball-hp').textContent = `${d.hp} ${t('hp')}`;
    $('#ball-about').textContent = ballAbout(id);
    $('#ball-super').innerHTML = `<b>${t('super')} · ${superName(id)}:</b> ${superAbout(id)}`;
    const buy = $('#ball-buy');
    buy.replaceChildren();
    if (!own) {
      buy.append(el('p', 'muted', t('unlockAt', { n: UNLOCK[id] })));
      const b = el('button', 'btn primary wide-btn', `${t('buy')} <span class="price"><i class="coin"></i>${d.price}</span>`);
      b.disabled = save.coins < d.price;
      b.onclick = () => { if (buyBall(save, id)) { sfx.coin(); persist(); coinsUI(); render(); openBall(id); } };
      buy.append(b);
    }
    $('#ball-skins-title').hidden = !own;
    $('#ball-skins').hidden = !own;
    if (own) {
      const opt = (style, label) => {
        const ownSkin = style == null || hasSkin(save, id, style), on = (save.skinOf[id] ?? null) === style, gift = SKINS[style]?.gift;
        const b = el('button', `skin ${on ? 'on' : ''} ${ownSkin ? '' : 'locked'}`);
        b.append(icon(id, 44, style), document.createTextNode(label));
        if (!ownSkin) b.append(el('span', 'price', gift ? t('skinGift') : `<i class="coin"></i>${SKIN_PRICE}`));
        b.onclick = () => {
          if (!ownSkin && gift) { $('#scr-ball').hidden = true; open('profile'); return; } // the rainbow comes with an account
          if (ownSkin) equipSkin(save, id, style);
          else if (!buySkin(save, id, style)) return;
          else sfx.coin();
          sfx.click();
          persist();
          coinsUI();
          render();
          openBall(id);
        };
        return b;
      };
      $('#ball-skins').replaceChildren(opt(null, t('skinDefault')), ...Object.keys(SKINS).map(s => opt(s, skinName(s))));
    }
    $('#scr-ball').hidden = false;
  }
  $('#ball-close').onclick = () => { $('#scr-ball').hidden = true; };

  // ---------- quests ----------
  function quests() {
    const today = dayKey();
    refreshQuests(save, today);
    const st = dailyState(save, today);
    $('#q-daily').replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const done = st.canClaim ? i < st.day : i <= st.day;
      const now = st.canClaim && i === st.day;
      const c = el('div', `dcell ${done ? 'done' : now ? 'today' : ''}`);
      c.append(el('span', '', t('day', { n: i + 1 })));
      if (i < 6) c.append(el('b', '', `<i class="coin" style="width:12px;height:12px"></i>${DAILY[i]}`));
      else if (st.skin) c.append(icon(st.skin[0], 30, st.skin[1]));
      else c.append(el('b', '', `<i class="coin" style="width:12px;height:12px"></i>200`));
      if (now) c.onclick = () => reward(claimDaily(save, today));
      return c;
    }));
    $('#q-daily-note').textContent = st.canClaim ? '' : t('comeTomorrow');

    const row = (name, value, goal, coins, isClaimed, onClaim) => {
      const r = el('div', 'qrow');
      const main = el('div', 'q-main');
      main.append(el('span', '', name), el('div', 'bar', `<i style="--p:${Math.min(100, (value / goal) * 100)}%"></i>`));
      r.append(main);
      if (isClaimed) r.append(el('span', 'ok', '✓'));
      else if (value >= goal) {
        const b = el('button', 'btn sm primary', `${t('claim')} <span class="price"><i class="coin"></i>${coins}</span>`);
        b.onclick = onClaim;
        r.append(b);
      } else r.append(el('small', '', `${Math.min(value, goal)}/${goal} · <i class="coin" style="width:12px;height:12px;vertical-align:-2px"></i>${coins}`));
      return r;
    };
    $('#q-list').replaceChildren(...save.quests.list.map(q => {
      const d = questDef(q.id);
      return row(questName(q.id), q.progress, d.goal, d.coins, q.claimed, () => reward({ coins: claimQuest(save, q.id) }));
    }));
    $('#q-ach').replaceChildren(...ACHIEVEMENTS.map(a =>
      row(achievementName(a.id), achievementValue(save, a), a.goal, a.coins, save.achieved.includes(a.id), () => reward({ coins: claimAchievement(save, a.id) }))));
  }

  // ---------- leaderboards ----------
  let week = false, lbReq = 0;
  async function leaders() {
    $('#l-all').classList.toggle('on', !week);
    $('#l-week').classList.toggle('on', week);
    const list = $('#l-list'), note = $('#l-note');
    if (!net.online) { list.replaceChildren(); note.textContent = t('needNet'); return; }
    note.textContent = t('loading');
    const my = ++lbReq;
    try {
      const data = await leaderboard(week);
      if (my !== lbReq) return; // a newer request (tab switch) won
      const rows = Array.isArray(data?.top) ? data.top : [];
      note.textContent = rows.length ? (data.me ? t('yourRank', { n: data.me.rank }) : '') : t('emptyBoard');
      list.replaceChildren(...rows.map(r => {
        const row = el('div', `lrow ${r.me ? 'me' : ''} ${r.rank <= 3 ? 'top' + r.rank : ''}`);
        const name = el('div', 'nm');
        name.textContent = validNick(r.nick) ? nickText(r.nick, lang) : '???'; // never trust text from the network
        const ball = BALLS[r.avatar] ? r.avatar : 'basic', skin = SKINS[r.skin] ? r.skin : null;
        row.append(el('div', 'rk', String(Number(r.rank) || '')), icon(ball, 32, skin), name,
          el('div', 'sc', `<i class="trophy"></i>${Number(r.score) || 0}`));
        return row;
      }));
    } catch {
      if (my === lbReq) note.textContent = t('needNet');
    }
  }
  $('#l-all').onclick = () => { week = false; leaders(); };
  $('#l-week').onclick = () => { week = true; leaders(); };

  // ---------- profile ----------
  function profile() {
    $('#p-nick').textContent = nickText(save.nick, lang);
    $('#p-avatars').replaceChildren(...save.owned.map(id => {
      const b = el('button', 'pick' + (save.avatar === id ? ' sel-avatar' : ''));
      b.append(icon(id, 40, save.skinOf[id]), document.createTextNode(ballName(id)));
      b.onclick = () => { save.avatar = id; persist(); render(); };
      return b;
    }));
    $('#p-online').hidden = !net.online;
    $('#p-offline').hidden = net.online;
    $('#p-code').textContent = net.code || '\u2014';
    const s = save.stats, rate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
    $('#p-stats').replaceChildren(...[
      [s.matches, 'statMatches'], [s.wins, 'statWins'], [rate, 'statWinrate'],
      [save.maxTrophies, 'statBest'], [s.supers, 'statSupers'], [s.challenges, 'statChallenges'],
    ].map(([v, k]) => el('div', 'stat', `<b>${v}</b><small>${t(k)}</small>`)));
  }
  $('#p-renick').onclick = () => { save.nick = randomNick(); persist(); sfx.click(); render(); };
  $('#p-copy').onclick = () => navigator.clipboard?.writeText(net.code || '').then(() => toast(t('copied')), () => {});
  $('#p-redeem').onclick = async () => {
    const code = $('#p-code-in').value.trim().toUpperCase();
    if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(code)) return toast(t('codeWrong'));
    try {
      const r = await redeemCode(code);
      if (!r?.id) return toast(t('codeWrong'));
      save.profileId = r.id; // pulls that profile's cloud save on the reload
      persist();
      toast(t('codeDone'));
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast(/too many/.test(e?.message) ? t('codeTooMany') : t('needNet'));
    }
  };
  $('#p-delete').onclick = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteProfile();
      try { localStorage.removeItem('ballbrawl.v1'); } catch { /* blocked storage */ }
      location.reload();
    } catch { toast(t('needNet')); }
  };
  // ---------- chests ----------
  const odds = k => t('chestOdds', { a: CHESTS[k].coins[0], b: CHESTS[k].coins[1], s: Math.round(CHESTS[k].skin * 100), c: Math.round(CHESTS[k].ball * 100) });
  function chestList() {
    $('#ch-wins').textContent = t('chestWins', { n: save.chestWins, max: CHEST_WINS });
    $('#ch-list').replaceChildren(...KINDS.map(k => {
      const n = save.chests[k], row = el('div', 'ch-row' + (n ? '' : ' empty'));
      const txt = el('div', '', `<b></b><b class="cnt">×${n}</b><small></small>`);
      txt.querySelector('b').textContent = t('chest_' + k);
      txt.querySelector('small').textContent = odds(k);
      const go = el('button', 'btn sm primary', t('chestOpen'));
      go.disabled = !n;
      go.onclick = () => crack(k);
      row.append(el('span', '', chestSvg(k)), txt, go);
      return row;
    }));
  }
  function chests(kind = null) { // the chest list (what you have, what can drop); with a kind, straight to opening one
    if (kind) return crack(kind);
    chestList();
    $('#scr-chest').hidden = false;
  }
  // The opening scene, Brawl-Stars style: the chest drops in, three taps shake it open, the lid blows off,
  // then the loot comes out one card at a time, and a summary at the end. The chest is opened (and saved) first.
  let op = null;
  const opItems = res => [
    { kind: 'coins', res },
    ...(res.skin ? [{ kind: 'skin', res }] : []),
    ...(res.ball ? [{ kind: 'ball', res }] : []),
  ];
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  function crack(kind) {
    const res = openChest(save, kind, random);
    if (!res) return;
    persist(); // saved before the show, so closing the tab mid-animation loses nothing
    coinsUI();
    op = { kind, res, taps: 0, items: opItems(res), idx: -1, phase: 'drop' };
    $('#scr-chest').hidden = true;
    $('#scr-open').hidden = false;
    $('#scr-open').className = 'opener k-' + kind;
    $('#op-title').textContent = t('chest_' + kind);
    $('#op-chest').innerHTML = chestSvg(kind);
    $('#op-chest').className = 'op-chest drop';
    $('#op-item').hidden = true;
    $('#op-sum').hidden = true;
    $('#op-btns').hidden = true;
    $('#op-hint').textContent = t('opTap');
    $('#op-hint').hidden = false;
    sfx.click();
    setTimeout(() => { if (op) op.phase = 'tap'; }, 650);
  }
  function opNext() {
    op.idx++;
    const it = op.items[op.idx], card = $('#op-item');
    if (!it) { // all shown: the summary
      op.phase = 'sum';
      card.hidden = true;
      $('#op-chest').hidden = true;
      $('#op-hint').hidden = true;
      $('#op-sum').replaceChildren(...op.items.map(x => opCard(x, true)));
      $('#op-sum').hidden = false;
      const left = KINDS.find(k => save.chests[k] > 0);
      $('#op-again').hidden = !left;
      $('#op-again').textContent = left ? `${t('chestMore')} · ${t('chest_' + (save.chests[op.kind] > 0 ? op.kind : left))}` : '';
      $('#op-again').onclick = () => crack(save.chests[op.kind] > 0 ? op.kind : left);
      $('#op-btns').hidden = false;
      render();
      return;
    }
    card.replaceChildren(...opCard(it, false).childNodes);
    card.className = 'op-item r-' + it.kind;
    card.hidden = false;
    restart(card, 'show');
    const rest = op.items.length - op.idx - 1;
    $('#op-hint').textContent = rest ? t('opMore', { n: rest }) : t('opTapEnd');
    sfx.coin();
    if (it.kind !== 'coins') confetti(50);
  }
  function opCard(it, small) {
    const d = el('div', 'op-card r-' + it.kind + (small ? ' small' : ''));
    const size = small ? 56 : 120;
    if (it.kind === 'coins') {
      d.append(el('i', 'coin'), el('b', '', `+${it.res.coins}`), el('small', '', t('opCoins')));
      d.firstChild.style.width = d.firstChild.style.height = size + 'px';
    } else if (it.kind === 'skin') {
      const [ball, style] = it.res.skin;
      d.append(icon(ball, size, style), el('b', ''), el('small', ''));
      d.children[1].textContent = t('opSkin', { skin: skinName(style) });
      d.children[2].textContent = ballName(ball);
    } else {
      d.append(el('span', 'ribbon', t('opNew')), icon(it.res.ball, size), el('b', ''), el('small', ''));
      d.children[2].textContent = ballName(it.res.ball);
      d.children[3].textContent = ballAbout(it.res.ball);
    }
    return d;
  }
  $('#scr-open').onclick = e => {
    if (!op || e.target.closest('#op-btns')) return;
    if (op.phase === 'tap') {
      op.taps++;
      const chest = $('#op-chest');
      restart(chest, 'hit');
      chest.style.setProperty('--k', op.taps);
      sfx.wall();
      if (op.taps < 3) { $('#op-hint').textContent = t('opTapN', { n: 3 - op.taps }); return; }
      op.phase = 'opening';
      chest.classList.add('open');
      restart($('#op-flash'), 'go');
      sfx.super();
      confetti(40);
      $('#op-hint').textContent = '';
      setTimeout(() => { if (op) { op.phase = 'items'; opNext(); } }, 700);
    } else if (op.phase === 'items') opNext();
  };
  $('#op-done').onclick = () => { $('#scr-open').hidden = true; op = null; render(); };

  $('#ch-close').onclick = () => { $('#scr-chest').hidden = true; render(); };

  // ---------- account (email): progress kept forever + the rainbow skin as a gift ----------
  let acctMode = 'new', acctBusy = false;
  const acctErr = e => {
    const c = e?.code || e?.message || '';
    if (/email_exists|user_already_exists|identity_already_exists|already registered/i.test(c)) return t('acctTaken');
    if (/invalid_credentials|invalid login/i.test(c)) return t('acctWrong');
    if (/weak_password|at least/i.test(c)) return t('acctWeak');
    if (/email_address_invalid|invalid.*email|validation_failed/i.test(c)) return t('acctBadEmail');
    if (/rate|too many/i.test(c)) return t('acctSlow');
    return t('needNet');
  };
  function account() {
    const box = $('#p-account');
    box.hidden = !net.online;
    if (!net.online) return;
    $('#acct-art').replaceChildren(icon(save.squad[0], 64, 'rainbow'));
    $('#acct-form').hidden = !!net.email;
    $('#acct-pitch').hidden = !!net.email;
    $('#acct-done').hidden = !net.email;
    $('#acct-who').textContent = net.email || '';
    $('#acct-tab-new').classList.toggle('on', acctMode === 'new');
    $('#acct-tab-in').classList.toggle('on', acctMode === 'in');
    $('#acct-ok-row').hidden = acctMode !== 'new';
    $('#acct-go').textContent = t(acctMode === 'new' ? 'acctCreate' : 'acctLogin');
    $('#acct-pass').autocomplete = acctMode === 'new' ? 'new-password' : 'current-password';
  }
  const acctSay = msg => { const m = $('#acct-msg'); m.textContent = msg; m.hidden = !msg; };
  $('#acct-tab-new').onclick = () => { acctMode = 'new'; acctSay(''); account(); };
  $('#acct-tab-in').onclick = () => { acctMode = 'in'; acctSay(''); account(); };
  $('#acct-form').onsubmit = async e => {
    e.preventDefault();
    if (acctBusy) return;
    const email = $('#acct-email').value.trim(), pass = $('#acct-pass').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return acctSay(t('acctBadEmail'));
    if (pass.length < 6) return acctSay(t('acctWeak'));
    if (acctMode === 'new' && !$('#acct-ok').checked) return acctSay(t('acctNeedOk'));
    acctBusy = true;
    $('#acct-go').disabled = true;
    acctSay('');
    try {
      if (acctMode === 'new') {
        await online.linkAccount(email, pass);
        save.accountGift = true;
        equipSkin(save, save.squad[0], 'rainbow'); // show the gift off straight away
        persist();
        $('#acct-pass').value = '';
        render();
        reward({ gift: true });
      } else {
        await online.signInAccount(email, pass);
        // no upload here: this device's save would overwrite the account's. The reload merges both instead.
        toast(t('acctWelcome'));
        setTimeout(() => location.reload(), 700); // the account's profile and cloud save load on the reload
      }
    } catch (err) {
      acctSay(acctErr(err));
    } finally {
      acctBusy = false;
      $('#acct-go').disabled = false;
    }
  };
  $('#acct-out').onclick = async () => {
    if (!confirm(t('acctOutConfirm'))) return;
    await online.flushSync(save).catch(() => {});
    await online.signOutAccount();
    try { localStorage.removeItem('ballbrawl.v1'); } catch { /* blocked storage */ }
    location.reload();
  };
  $('#l-gift').onclick = () => { sfx.click(); open('profile'); };

  // ---------- lobby ----------
  function lobby() {
    const [lead, l, r] = save.squad, sk = id => save.skinOf[id];
    $('#l-trio').replaceChildren(icon(l, 64, sk(l)), icon(lead, 112, sk(lead)), icon(r, 64, sk(r)));
    $('#l-lead').textContent = ballName(lead);
    const { next, p } = nextReward();
    $('#l-tr').textContent = save.trophies;
    $('#l-bar').style.width = p + '%';
    $('#l-next').replaceChildren(...(next ? [rewardIcon(next, 40)] : []));
    $('#l-mode').textContent = net.online ? t('modeRanked') : t('modeTraining');
    $('#l-mode').classList.toggle('live', net.online);
    const total = KINDS.reduce((n, k) => n + save.chests[k], 0), best = [...KINDS].reverse().find(k => save.chests[k] > 0);
    $('#l-chest-art').innerHTML = chestSvg(best || 'box');
    $('#l-chest-n').hidden = !total;
    $('#l-chest-n').textContent = total;
    $('#l-chest-wins').textContent = `${save.chestWins}/${CHEST_WINS}`;
    $('#l-chest').classList.toggle('has', total > 0);
    $('#l-gift').hidden = !net.online || !!net.email;
  }
  $('#l-chest').onclick = () => { sfx.click(); chests(); };
  $('#l-squad').onclick = onPlay;
  $('#l-challenge').onclick = onChallenge;
  $('#l-watch').onclick = onWatch;
  $('#h-play').onclick = onPlay;
  $('#sub-back').onclick = () => { sfx.click(); open('lobby'); };

  // ---------- pages + red dots ----------
  function badges() {
    refreshQuests(save, dayKey());
    const questReady = dailyState(save, dayKey()).canClaim
      || save.quests.list.some(q => !q.claimed && q.progress >= questDef(q.id).goal)
      || ACHIEVEMENTS.some(a => !save.achieved.includes(a.id) && achievementValue(save, a) >= a.goal);
    const dots = { path: claimable(save).length > 0, quests: questReady, profile: net.online && !net.email };
    for (const b of document.querySelectorAll('[data-tab]')) b.querySelector('.badge').hidden = !dots[b.dataset.tab];
  }
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { sfx.click(); open(b.dataset.tab); };

  function render() {
    top();
    if (tab === 'lobby') lobby();
    if (tab === 'path') { pathHero(); road(); }
    if (tab === 'balls') balls();
    if (tab === 'quests') quests();
    if (tab === 'profile') { profile(); account(); }
    if (tab === 'leaders') leaders();
    badges();
  }

  function open(next = tab) {
    tab = next;
    for (const name of ['path', 'balls', 'quests', 'leaders', 'profile']) $('#tab-' + name).hidden = name !== tab;
    $('#lobby').hidden = tab !== 'lobby';
    $('#sub').hidden = tab === 'lobby';
    if (tab !== 'lobby') $('#sub-title').textContent = t('tab' + tab[0].toUpperCase() + tab.slice(1));
    $('#scr-home').hidden = false;
    $('#tab-body').scrollTop = 0;
    render();
  }

  // Once, after the first online win: make sure the player keeps their transfer code.
  function showCode() {
    const hero = $('#rw-icon');
    hero.className = 'ball-hero pop';
    hero.replaceChildren(el('div', 'code-hero'));
    hero.firstChild.textContent = net.code;
    $('#rw-text').textContent = t('saveCodeTitle');
    $('#rw-sub').textContent = t('saveCodeSub');
    $('#scr-reward').hidden = false;
  }

  return { open, render, showCode, hide: () => { $('#scr-home').hidden = true; } };
}
