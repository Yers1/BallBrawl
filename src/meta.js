// Home: the lobby (main menu) and the pages it opens — Glory Road, chests, balls with skins, quests, leaders, profile.
// All game rules live in progress.js; this file only draws them and wires taps.
import { BALLS, ORDER } from './balls.js';
import { t, lang, ballName, ballAbout, superName, superAbout, questName, achievementName, skinName } from './i18n.js';
import { nickText, randomNick, validNick } from './nick.js';
import {
  pathNodes, claimable, claim, UNLOCK, SKINS, SKIN_PRICE, hasSkin, buySkin, equipSkin, buyBall,
  dayKey, refreshQuests, questDef, claimQuest, dailyState, claimDaily, DAILY,
  ACHIEVEMENTS, achievementValue, claimAchievement, CHESTS, CHEST_WINS, openChest, ARENAS, arenaFor, arenaIndex,
} from './progress.js';
import { THEMES } from './themes.js';
import { setArena } from './render.js';
import { sfx, confetti } from './sfx.js';

const $ = s => document.querySelector(s);
const STEP = 128, PAD = 64; // Glory Road: px between reward cards, and where 0 trophies sits
const KINDS = ['box', 'big', 'mega'];
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32; // chests: not predictable from the page

// A chest drawn as inline SVG, flat with dark outlines like the rest of the game: planks, metal bands with rivets and
// shine, corner caps, a lock, and a lit top on the lid. Each kind has its own look: box = wood and steel with a
// keyhole; big = blue and gold with a star medallion; mega = purple and gold with a crown and a gem.
// The lid, the body, the open mouth (.inside) and the light leaking out of the seam (.seam) are separate groups,
// so the opening scene can shake it, let light through the seam on every tap, and blow the lid off.
const CHEST_COLORS = {
  box: { base: '#C98A4B', dark: '#8E5524', deep: '#3E220C', trim: '#D9DEE8', trimDark: '#8E95A8', glow: '#FFE38A' },
  big: { base: '#3D86FF', dark: '#1E4FB0', deep: '#0C2050', trim: '#FFCC33', trimDark: '#C78C00', glow: '#A8F0FF' },
  mega: { base: '#A85CFF', dark: '#5E22A8', deep: '#240A4A', trim: '#FFCC33', trimDark: '#C78C00', glow: '#FFB8FF' },
};
const star = (cx, cy, r) => `M${[...Array(10)].map((_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.45 : r;
  return `${(cx + Math.cos(a) * k).toFixed(1)} ${(cy + Math.sin(a) * k).toFixed(1)}`;
}).join(' L')}Z`;
export function chestSvg(kind) {
  const c = CHEST_COLORS[kind] ?? CHEST_COLORS.box, ink = 'stroke="#0F1F38" stroke-linejoin="round"', o = `${ink} stroke-width="4"`;
  const rivets = (xs, ys) => xs.flatMap(x => ys.map(y => `<circle cx="${x}" cy="${y}" r="2.2" fill="${c.trimDark}"/>`)).join('');
  const lock = {
    box: '<circle cx="60" cy="74" r="3.6" fill="#0F1F38"/><path d="M58.3 75 h3.4 l1 8 h-5.4z" fill="#0F1F38"/>',
    big: `<path d="${star(60, 76, 8.5)}" fill="${c.base}" ${ink} stroke-width="2.2"/>`,
    mega: `<path d="M60 66 l8.5 8 -8.5 11 -8.5 -11z" fill="#FF4D5E" ${ink} stroke-width="2.4"/><path d="M55.5 73 l4.5 -3.6 4.5 3.6" fill="none" stroke="#FFC2C8" stroke-width="1.8" stroke-linecap="round"/>`,
  }[kind] ?? '';
  const crest = {
    big: `<circle cx="60" cy="37" r="9.5" fill="${c.trim}" ${o} stroke-width="3"/><path d="${star(60, 37, 6)}" fill="${c.dark}"/>`,
    mega: `<path d="M42 19 L44 3 L52 10 L60 -2 L68 10 L76 3 L78 19 Z" fill="${c.trim}" ${o} stroke-width="3"/><circle cx="60" cy="-2" r="3" fill="#FF4D5E" ${ink} stroke-width="1.6"/><circle cx="44" cy="3" r="2.2" fill="#7FE7FF"/><circle cx="76" cy="3" r="2.2" fill="#7FE7FF"/>`
      + `<circle cx="60" cy="37" r="9.5" fill="${c.trim}" ${o} stroke-width="3"/><path d="M60 30 l5 7 -5 7 -5 -7z" fill="#7FE7FF" ${ink} stroke-width="1.6"/>`,
  }[kind] ?? '';
  const grain = kind === 'box' ? '<path d="M16 79 q8 -3 14 0 M44 95 q8 -3 14 0 M66 80 q6 -3 12 0 M100 95 q4 -2 7 0 M44 33 q8 -3 14 0 M66 46 q6 -3 12 0" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="2" stroke-linecap="round"/>' : '';
  return `<svg viewBox="0 -10 120 122" aria-hidden="true" class="chest-svg">
<ellipse cx="60" cy="106" rx="52" ry="6" fill="rgba(8,16,32,0.35)"/>
<g class="inside"><path d="M12 60 Q60 48 108 60 L106 68 H14 Z" fill="${c.deep}" ${ink} stroke-width="3"/><ellipse cx="60" cy="61" rx="38" ry="5" fill="${c.glow}"/></g>
<g class="body">
<rect x="10" y="58" width="100" height="46" rx="8" fill="${c.dark}" ${o}/>
<path d="M14 72 H106 M14 88 H106" stroke="rgba(0,0,0,0.22)" stroke-width="3"/>
<rect x="12" y="60" width="96" height="6" rx="3" fill="${c.base}"/>
<path d="M16 99 H104" stroke="rgba(0,0,0,0.25)" stroke-width="4" stroke-linecap="round"/>
<rect x="24" y="58" width="13" height="46" fill="${c.trim}" ${o}/><rect x="83" y="58" width="13" height="46" fill="${c.trim}" ${o}/>
<path d="M27.5 62 V100 M86.5 62 V100" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
${rivets([30.5, 89.5], [67, 81, 95])}${grain}
<path d="M10 92 V98 a8 8 0 0 0 8 8 H26 Z M110 92 V98 a8 8 0 0 1 -8 8 H94 Z" fill="${c.trim}" ${o}/>
<rect x="48" y="62" width="24" height="28" rx="6" fill="${c.trim}" ${o}/>
<rect x="51.5" y="65.5" width="17" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>
${lock}
</g>
<g class="lid">
<path d="M8 62 V42 Q8 16 34 16 H86 Q112 16 112 42 V62 Z" fill="${c.base}" ${o}/>
<path d="M14 42 Q15 22 34 22 H86 Q105 22 106 42 Z" fill="rgba(255,255,255,0.15)"/>
<path d="M18 30 Q26 22 44 22 H64" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="4" stroke-linecap="round"/>
<path d="M24 62 V16 H37 V62 Z M83 62 V16 H96 V62 Z" fill="${c.trim}" ${o}/>
<path d="M27.5 20 V56 M86.5 20 V56" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
${rivets([30.5, 89.5], [27, 41])}
<rect x="8" y="54" width="104" height="9" rx="3" fill="${c.dark}" ${o}/>
${crest}
</g>
<g class="seam"><rect x="10" y="51" width="100" height="16" rx="8" fill="${c.glow}" opacity="0.4"/><rect x="14" y="56.5" width="92" height="5" rx="2.5" fill="#FFFFFF"/></g>
</svg>`;
}

// The lobby stage: the current arena seen in perspective, with neon rings where the squad stands.
// k keeps the gradient/filter ids unique when two copies are on the page (the lobby and the new-arena popup).
export function arenaSvg(id, k) {
  const th = THEMES[id] || THEMES.night, [top, left, right, bottom] = th.faces, [ally, lead] = th.rings;
  const e = (cx, cy, rx, ry) => `cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`;
  const ring = (cx, cy, rx, ry, c, w) => `<ellipse ${e(cx, cy, rx, ry)} fill="${c}" fill-opacity="0.15"/>`
    + `<ellipse ${e(cx, cy, rx, ry)} fill="none" stroke="${c}" stroke-opacity="0.6" stroke-width="${w * 2.7}" filter="url(#ne${k})"/>`
    + `<ellipse ${e(cx, cy, rx, ry)} fill="none" stroke="${c}" stroke-width="${w}"/>`
    + `<ellipse ${e(cx, cy - 6, rx * 0.76, ry * 0.66)} fill="${c}" opacity="0.45" filter="url(#gl${k})"/>`;
  return `<svg viewBox="0 0 358 440" aria-hidden="true"><defs>
<radialGradient id="vg${k}" cx="0.5" cy="0.62" r="0.72"><stop offset="0.5" stop-color="#050A18" stop-opacity="0"/><stop offset="1" stop-color="#050A18" stop-opacity="0.65"/></radialGradient>
<filter id="ne${k}" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="gl${k}" x="-50%" y="-150%" width="200%" height="400%"><feGaussianBlur stdDeviation="9"/></filter>
<clipPath id="fl${k}"><path d="M62 104H296L344 426H14Z"/></clipPath></defs>
<path d="M62 14H296V104H62Z" fill="${th.back}"/>
<path d="M103 14V96M144 14V96M185 14V96M226 14V96M267 14V96" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>
<path d="M62 96H296V104H62Z" fill="${top}"/>
<path d="M14 14H62V104L14 426Z" fill="${left}"/><path d="M344 14H296V104L344 426Z" fill="${right}"/>
<path d="M14 14H62V104L14 426ZM344 14H296V104L344 426Z" fill="#000" opacity="0.18"/>
<path d="M62 104H296L344 426H14Z" fill="${th.floor}"/>
<g clip-path="url(#fl${k})" stroke="#FFFFFF" stroke-opacity="0.11" stroke-width="1.5" fill="none"><path d="M91.3 104L55.3 426M120.5 104L96.5 426M149.8 104L137.8 426M179 104V426M208.3 104L220.3 426M237.5 104L261.5 426M266.8 104L302.8 426"/><path d="M0 120H358M0 143H358M0 172H358M0 210H358M0 259H358M0 317H358M0 384H358"/></g>
<path d="M62 14V104L14 426M296 14V104L344 426" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2.5"/>
<g clip-path="url(#fl${k})">${ring(76, 326, 58, 15, ally, 2.5)}${ring(282, 326, 58, 15, ally, 2.5)}${ring(179, 394, 100, 24, lead, 3)}</g>
<rect x="14" y="14" width="330" height="412" fill="url(#vg${k})"/>
<ellipse ${e(76, 325, 32, 8)} fill="#000" opacity="0.45"/><ellipse ${e(282, 325, 32, 8)} fill="#000" opacity="0.45"/><ellipse ${e(179, 393, 56, 12)} fill="#000" opacity="0.45"/>
<path d="M0 0H358L344 14H14Z" fill="${top}"/><path d="M0 440H358L344 426H14Z" fill="${bottom}"/>
<path d="M0 0L14 14V426L0 440Z" fill="${left}"/><path d="M358 0L344 14V426L358 440Z" fill="${right}"/>
<rect x="1" y="1" width="356" height="438" fill="none" stroke="#0A0E1F" stroke-width="2"/></svg>`;
}

export function createHome({ save, persist, el, icon, coinsUI, toast, onPlay, onWatch, onChallenge, online }) {
  const { net, leaderboard, deleteProfile } = online;
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
    if (res.arena) { // a new arena unlocked: show its stage
      hero.innerHTML = `<span class="arena-pop">${arenaSvg(res.arena, 'rw')}</span>`;
      text = t('arenaNew', { name: t('arena_' + res.arena) });
      sub = t('arenaNewSub');
    } else if (res.chest) { // a chest from the road: it waits in the chest button, or can be opened right here
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
    if (res.ball || res.skin || res.chest || res.gift || res.arena) confetti();
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
    const nx = ARENAS[arenaIndex(arenaFor(save.maxTrophies).id) + 1], ar = el('div', 'ph-arena');
    ar.textContent = nx ? t('arenaNext', { name: t('arena_' + nx.id), n: nx.at - save.maxTrophies }) : t('arenaLast');
    hero.append(ar);
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
    const s = save.stats, rate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
    $('#p-stats').replaceChildren(...[
      [s.matches, 'statMatches'], [s.wins, 'statWins'], [rate, 'statWinrate'],
      [save.maxTrophies, 'statBest'], [s.supers, 'statSupers'], [s.challenges, 'statChallenges'],
    ].map(([v, k]) => el('div', 'stat', `<b>${v}</b><small>${t(k)}</small>`)));
  }
  $('#p-renick').onclick = () => { save.nick = randomNick(); persist(); sfx.click(); render(); };
  $('#p-delete').onclick = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteProfile();
      try { localStorage.removeItem('ballbrawl.v1'); } catch { /* blocked storage */ }
      location.reload();
    } catch { toast(t('needNet')); }
  };
  // ---------- chests ----------
  const odds = k => { // the real odds for this player: 0% once everything of that kind is collected
    const c = CHESTS[k], ballsLeft = ORDER.some(id => !save.owned.includes(id));
    const skinsLeft = save.owned.some(b => Object.keys(SKINS).some(st => !SKINS[st].gift && !hasSkin(save, b, st)));
    return t('chestOdds', { a: c.coins[0], b: c.coins[1], s: skinsLeft ? Math.round(c.skin * 100) : 0, c: ballsLeft ? Math.round(c.ball * 100) : 0 });
  };
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
  function spray(n, coins = false) { // sparks or coins fly out of the chest's mouth and fall away
    const box = $('#op-chest').getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height * 0.55;
    for (let i = 0; i < n; i++) {
      const p = el('i', coins ? 'coin op-p' : 'op-p'), a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 110 + Math.random() * 230;
      p.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * v).toFixed(0)}px;--dy:${(Math.sin(a) * v).toFixed(0)}px;`
        + `--r:${((Math.random() - 0.5) * 720).toFixed(0)}deg;animation-delay:${(Math.random() * 0.15).toFixed(2)}s`;
      $('#scr-open').append(p);
      setTimeout(() => p.remove(), 1500);
    }
  }
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
    $('#op-chest').innerHTML = chestSvg(kind) + '<i class="op-beam"></i>';
    $('#op-chest').className = 'op-chest drop';
    $('#op-chest').style.setProperty('--k', 0);
    $('#op-chest').hidden = false;
    $('#op-glow').hidden = true;
    $('#op-item').hidden = true;
    $('#op-sum').hidden = true;
    $('#op-btns').hidden = true;
    $('#op-hint').textContent = t('opTap');
    $('#op-hint').hidden = false;
    sfx.click();
    setTimeout(() => { if (op?.phase === 'drop') { op.phase = 'tap'; $('#op-chest').className = 'op-chest idle'; } }, 650);
  }
  function opNext() {
    op.idx++;
    const it = op.items[op.idx], card = $('#op-item');
    if (!it) { // all shown: the summary
      op.phase = 'sum';
      card.hidden = true;
      $('#op-glow').hidden = true;
      $('#op-chest').hidden = true;
      $('#op-hint').hidden = true;
      $('#op-sum').replaceChildren(...op.items.map((x, i) => {
        const c = opCard(x, true);
        c.style.animationDelay = i * 0.12 + 's';
        return c;
      }));
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
    $('#op-chest').classList.add('low');
    $('#op-glow').className = 'op-glow r-' + it.kind;
    $('#op-glow').hidden = false;
    restart($('#op-glow'), 'show');
    if (it.kind === 'coins') { // count up
      const b = card.querySelector('b'), n = it.res.coins, t0 = performance.now(), mine = op;
      const step = now => {
        const k = Math.min(1, (now - t0) / 650);
        b.textContent = '+' + Math.round(n * k * (2 - k));
        if (k < 1 && op === mine) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      spray(12, true);
    } else spray(16);
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
      clearTimeout(op.hitT);
      op.hitT = setTimeout(() => chest.classList.remove('hit'), 340);
      chest.style.setProperty('--k', op.taps);
      sfx.wall();
      spray(3 + op.taps * 3);
      if (op.taps < 3) { $('#op-hint').textContent = t('opTapN', { n: 3 - op.taps }); return; }
      op.phase = 'opening';
      clearTimeout(op.hitT);
      chest.className = 'op-chest open';
      spray(22);
      spray(14, true);
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
    const btn = $('#acct-out');
    btn.disabled = true;
    try {
      if (save.pendingFinish) { // report a ranked result first, or the server would count it as abandoned
        await online.finishMatch(save.pendingFinish).catch(() => {});
        save.pendingFinish = null;
      }
      await online.flushSync(save); // the local save is wiped below only once the account provably has it
      await online.signOutAccount();
    } catch {
      btn.disabled = false;
      toast(t('acctOutFail'));
      return;
    }
    try { localStorage.removeItem('ballbrawl.v1'); } catch { /* blocked storage */ }
    location.reload();
  };
  $('#l-gift').onclick = () => { sfx.click(); open('profile'); };

  // ---------- lobby ----------
  function lobby() {
    const [lead, l, r] = save.squad, sk = id => save.skinOf[id];
    $('#l-trio').replaceChildren(icon(l, 136, sk(l)), icon(lead, 232, sk(lead)), icon(r, 136, sk(r)));
    const a = arenaFor(save.maxTrophies).id;
    $('#l-arena-n').textContent = t('arenaN', { n: arenaIndex(a) + 1 });
    $('#l-arena').textContent = t('arena_' + a);
    if (arenaIndex(a) > arenaIndex(save.arenaSeen)) { // reached a new arena: celebrate it once
      save.arenaSeen = a;
      setTimeout(() => reward({ arena: a }), 300);
    }
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

  // The current arena paints the fight and the menus: page sky, battle floor and walls, the lobby stage.
  let shownArena = '';
  function applyArena() {
    const a = arenaFor(save.maxTrophies).id;
    if (a === shownArena) return;
    shownArena = a;
    document.documentElement.style.setProperty('--sky', THEMES[a].sky);
    setArena(a);
    $('#l-arena-art').innerHTML = arenaSvg(a, 'l');
  }

  function render() {
    applyArena();
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

  return { open, render, hide: () => { $('#scr-home').hidden = true; } };
}
