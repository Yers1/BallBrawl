// Home screen: the trophy road (main tab), the ball collection with skins, quests, and the profile.
// All game rules live in progress.js; this file only draws them and wires taps.
import { BALLS, ORDER } from './balls.js';
import { t, lang, ballName, ballAbout, superName, superAbout, questName, achievementName, skinName } from './i18n.js';
import { nickText, randomNick, validNick } from './nick.js';
import {
  pathNodes, claimable, claim, UNLOCK, SKINS, SKIN_PRICE, hasSkin, buySkin, equipSkin, buyBall,
  dayKey, refreshQuests, questDef, claimQuest, dailyState, claimDaily, DAILY,
  ACHIEVEMENTS, achievementValue, claimAchievement,
} from './progress.js';
import { sfx } from './sfx.js';

const $ = s => document.querySelector(s);
const ROW = 92; // px per road node (matches .node-row height)

export function createHome({ save, persist, el, icon, coinsUI, toast, onPlay, onWatch, onChallenge, online }) {
  const { net, leaderboard, redeemCode, deleteProfile } = online;
  let tab = 'path';
  const coin = n => `<span class="amt"><i class="coin"></i>${n}</span>`;

  // ---------- reward popup ----------
  function reward(res) {
    if (!res) return;
    const hero = $('#rw-icon');
    hero.className = 'ball-hero';
    void hero.offsetWidth;
    hero.className = 'ball-hero pop';
    let text = '', sub = '';
    if (res.ball) {
      hero.replaceChildren(icon(res.ball, 96, save.skinOf[res.ball]));
      text = t('newBall', { name: ballName(res.ball) });
      if (res.coins) { sub = `${t('alreadyHad')} ${t('gotCoins', { n: res.coins })}`; }
    } else if (res.skin) {
      hero.replaceChildren(icon(res.skin[0], 96, res.skin[1]));
      text = t('newSkin', { skin: skinName(res.skin[1]), name: ballName(res.skin[0]) });
      if (res.coins) sub = t('gotCoins', { n: res.coins });
    } else {
      hero.innerHTML = '<i class="coin" style="width:72px;height:72px"></i>';
      text = t('gotCoins', { n: res.coins });
    }
    $('#rw-text').textContent = text;
    $('#rw-sub').textContent = sub;
    $('#scr-reward').hidden = false;
    sfx.coin();
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

  // ---------- trophy road ----------
  function road() {
    const box = $('#road'), until = Math.max(save.maxTrophies + 300, 300);
    const nodes = pathNodes(until).filter(n => n.at <= until).reverse(); // top = farthest
    const ready = new Set(claimable(save).map(n => n.at));
    const rows = nodes.map((n, i) => {
      const state = save.claimed.includes(n.at) ? 'done' : ready.has(n.at) ? 'ready' : 'locked';
      const row = el('div', `node-row ${i % 2 ? 'alt' : ''}`);
      const b = el('button', `node ${state}`);
      if (n.ball) b.append(icon(n.ball, 46));
      else if (n.skin) b.append(icon(n.skin[0], 46, n.skin[1]));
      else b.innerHTML = coin(n.coins);
      if (state === 'ready') b.onclick = () => reward(claim(save, n));
      const what = n.ball ? ballName(n.ball) : n.skin ? `${skinName(n.skin[1])} · ${ballName(n.skin[0])}` : '';
      row.append(b, el('div', 'lbl', `<i class="trophy"></i>${n.at}`), el('div', 'what', what));
      return row;
    });
    const start = el('div', 'node-row start');
    start.append(el('div', 'node done', ''), el('div', 'lbl', `<i class="trophy"></i>0`));
    // the gold fill climbs to your current trophies, interpolated between nodes
    const asc = [0, ...nodes.map(n => n.at).reverse()];
    let i = 0;
    while (i < asc.length - 1 && asc[i + 1] <= save.trophies) i++;
    const frac = i < asc.length - 1 ? (save.trophies - asc[i]) / (asc[i + 1] - asc[i]) : 0;
    const fill = (i + frac) * ROW + ROW / 2 - 16;
    const marker = el('div', 'marker');
    marker.append(icon(save.avatar, 38, save.skinOf[save.avatar]));
    box.style.setProperty('--fill', `${Math.max(0, fill)}px`);
    box.replaceChildren(el('div', 'fill'), ...rows, start, marker);
    if (tab === 'path') requestAnimationFrame(() => {
      const body = $('#tab-body');
      body.scrollTop = box.offsetHeight - fill - body.clientHeight * 0.55;
    });
  }

  // ---------- balls & skins ----------
  function balls() {
    $('#b-grid').replaceChildren(...ORDER.map(id => {
      const own = save.owned.includes(id), d = BALLS[id];
      const card = el('div', 'ball-card' + (own ? '' : ' locked'));
      const head = el('div');
      head.append(el('div', 'name', ballName(id)), el('div', 'hp', `${d.hp} ${t('hp')}`));
      const topRow = el('div', 'top');
      topRow.append(icon(id, 42, save.skinOf[id]), head);
      card.append(topRow, el('p', '', ballAbout(id)));
      if (!own) card.append(el('div', 'lock', `<i class="trophy"></i>${UNLOCK[id]} · <i class="coin"></i>${d.price}`));
      card.onclick = () => openBall(id);
      return card;
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
        const ownSkin = style == null || hasSkin(save, id, style), on = (save.skinOf[id] ?? null) === style;
        const b = el('button', `skin ${on ? 'on' : ''} ${ownSkin ? '' : 'locked'}`);
        b.append(icon(id, 44, style), document.createTextNode(label));
        if (!ownSkin) b.append(el('span', 'price', `<i class="coin"></i>${SKIN_PRICE}`));
        b.onclick = () => {
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
  $('#p-challenge').onclick = onChallenge;
  $('#b-watch').onclick = onWatch;
  $('#h-play').onclick = onPlay;

  // ---------- tabs + red dots ----------
  function badges() {
    refreshQuests(save, dayKey());
    const questReady = dailyState(save, dayKey()).canClaim
      || save.quests.list.some(q => !q.claimed && q.progress >= questDef(q.id).goal)
      || ACHIEVEMENTS.some(a => !save.achieved.includes(a.id) && achievementValue(save, a) >= a.goal);
    const dots = { path: claimable(save).length > 0, quests: questReady };
    for (const b of document.querySelectorAll('.tabs button')) {
      b.classList.toggle('on', b.dataset.tab === tab);
      b.querySelector('.badge').hidden = !dots[b.dataset.tab];
    }
  }
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { sfx.click(); open(b.dataset.tab); };

  function render() {
    top();
    if (tab === 'path') road();
    if (tab === 'balls') balls();
    if (tab === 'quests') quests();
    if (tab === 'profile') profile();
    if (tab === 'leaders') leaders();
    badges();
  }

  function open(next = tab) {
    tab = next;
    for (const name of ['path', 'balls', 'quests', 'leaders', 'profile']) $('#tab-' + name).hidden = name !== tab;
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
