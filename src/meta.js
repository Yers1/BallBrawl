// Home: the lobby (main menu) and the pages it opens — Glory Road, chests, balls with skins, quests, leaders, profile.
// All game rules live in progress.js; this file only draws them and wires taps.
import { BALLS, ORDER } from './balls.js';
import { t, lang, LANGS, setLang, ballName, ballAbout, superName, superAbout, questName, achievementName, skinName } from './i18n.js';
import { nickText, randomNick, validNick, clanText, validClan, NICK_RANGE } from './nick.js';
import {
  pathNodes, claimable, claim, UNLOCK, SKINS, skinPrice, hasSkin, buySkin, equipSkin,
  RANKS, BALL_PATH, ballRank, rankTier, leagueFor, TITLES, titleOk, levelOf,
  dayKey, refreshQuests, questDef, claimQuest, dailyState, claimDaily, DAILY,
  ACHIEVEMENTS, achievementValue, claimAchievement, CHESTS, openChest, ARENAS, arenaFor, arenaIndex, lockLabel, BY_UNLOCK, RARITY, FRAG_NEED, pay, skinPool, chestBalls, FAMILIARS, FAM_COST, famNeed, famCap, famBuff, famUpgrade, famBuy,
  SLOTS, CHEST_TIME, CHEST_CYCLE, AD_SPEEDUP, gemsToOpen, slotLeft, unlocking, startUnlock, speedUp, openSlot,
  SHOP, EMOTE_LIST, owns, priceOf, buy, wear, dailyDeals, buyDeal, adGems, AD_GEMS, AD_GEMS_DAY, freeGems,
} from './progress.js';
import { THEMES } from './themes.js';
import { DECO_ART } from './decos.js';
import { heroSvg, heroLive } from './heroes.js';
import { setArena, drawEmote, drawFamiliar } from './render.js';
import { MAPS } from './sim.js';
import { PAY } from './config.js';
import { offerReward } from './ads.js';
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

// What makes each arena's stage its own: scenery on the back wall and the map's obstacles on the floor.
const BACKDROP = {
  night: `<circle cx="250" cy="44" r="16" fill="#FFF3C4"/><circle cx="257" cy="38" r="15" fill="#0E1D3A"/>
    ${[[90, 30], [120, 60], [160, 28], [200, 52], [140, 82], [230, 80], [80, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#FFFFFF"/>`).join('')}`,
  canyon: `<circle cx="240" cy="40" r="15" fill="#FFE38A"/><path d="M62 104 V70 H92 V56 H128 V74 H160 V104Z" fill="#B8743A" stroke="#6E3F18" stroke-width="2"/>
    <path d="M180 104 V62 H214 V48 H240 V66 H296 V104Z" fill="#C98A4B" stroke="#6E3F18" stroke-width="2"/><path d="M92 62 H128 M214 54 H240" stroke="#E8B56E" stroke-width="3"/>`,
  frost: `<path d="M62 104 L110 40 L140 70 L180 26 L230 78 L262 50 L296 90 V104Z" fill="#E6F6FF" stroke="#6FA9D0" stroke-width="2"/>
    <path d="M110 40 L122 56 L104 56Z M180 26 L194 44 L168 44Z M262 50 L272 62 L254 62Z" fill="#FFFFFF"/>
    ${[80, 120, 160, 200, 240, 280].map(x => `<path d="M${x - 5} 14 L${x + 5} 14 L${x} 30Z" fill="#DCF5FF"/>`).join('')}`,
  jungle: `<path d="M62 104 Q100 60 140 104 M160 104 Q210 50 260 104" fill="#245A2E"/>
    ${[78, 112, 150, 196, 236, 276].map((x, i) => `<path d="M${x} 14 q${i % 2 ? 6 : -6} 20 0 ${34 + (i * 7) % 20}" fill="none" stroke="#3E8E4A" stroke-width="4" stroke-linecap="round"/><ellipse cx="${x}" cy="${50 + (i * 7) % 20}" rx="6" ry="4" fill="#6BB85A"/>`).join('')}
    <circle cx="96" cy="88" r="4" fill="#FF5C8A"/><circle cx="250" cy="92" r="4" fill="#FFD23F"/>`,
  lava: `<path d="M120 104 L170 34 H200 L250 104Z" fill="#3A1614" stroke="#160A0A" stroke-width="2"/>
    <path d="M178 34 Q184 60 176 80 Q172 96 180 104 H192 Q188 90 194 72 Q198 52 192 34Z" fill="#FF7A2F"/><path d="M185 36 Q188 60 183 90" stroke="#FFD23F" stroke-width="2.5" fill="none"/>
    <circle cx="176" cy="24" r="7" fill="#5A4A48" opacity=".8"/><circle cx="190" cy="16" r="9" fill="#5A4A48" opacity=".6"/>`,
  space: `${[[78, 24], [102, 70], [140, 40], [212, 30], [276, 66], [244, 92], [124, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#FFFFFF"/>`).join('')}
    <circle cx="230" cy="54" r="20" fill="#FF8FB1"/><ellipse cx="230" cy="54" rx="36" ry="8" fill="none" stroke="#FFE38A" stroke-width="3" transform="rotate(-15 230 54)"/>
    <circle cx="110" cy="46" r="9" fill="#4CC9F0"/>`,
  candy: `${[[90, 60, '#FF4D8D'], [150, 46, '#7FE7FF'], [210, 64, '#FFD23F'], [266, 48, '#A6FF4D']].map(([x, y, c]) => `<path d="M${x} ${y + 14} V104" stroke="#FFFFFF" stroke-width="3"/><circle cx="${x}" cy="${y}" r="14" fill="${c}" stroke="#C94C88" stroke-width="2"/><path d="M${x - 9} ${y} a9 9 0 0 1 18 0" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>`).join('')}`,
  neon: `<path d="M80 40 H140 M80 40 V70 M160 30 L190 70 L220 30 M240 40 H280 V70 H240Z" fill="none" stroke="#00F0FF" stroke-width="3" stroke-linecap="round"/>
    <path d="M70 88 H290" stroke="#FF2BD6" stroke-width="3"/>`,
  pirate: `<circle cx="250" cy="36" r="13" fill="#FFE38A"/><path d="M62 82 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V104 H62Z" fill="#0E6FB8"/>
    <path d="M62 82 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#BFE9FF" stroke-width="2.5"/>
    <path d="M140 76 H200 L192 86 H148Z" fill="#6E3A16" stroke="#2E1A0E" stroke-width="2"/><path d="M170 76 V36 M170 38 L194 56 L170 66Z" fill="#FFFFFF" stroke="#2E1A0E" stroke-width="2"/>
    <path d="M100 40 q5 -5 10 0 q5 -5 10 0" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>`,
  stadium: `${Array.from({ length: 40 }, (_, i) => `<circle cx="${68 + (i % 20) * 12}" cy="${66 + Math.floor(i / 20) * 14}" r="4.5" fill="${['#FF5C5C', '#4CC9F0', '#FFCC33', '#FFFFFF'][i % 4]}"/>`).join('')}
    <path d="M62 90 H296 V104 H62Z" fill="#FFCC33"/><path d="M80 14 V44 M278 14 V44" stroke="#C9D2E0" stroke-width="3"/>
    <rect x="70" y="28" width="20" height="10" rx="2" fill="#FFF7C4"/><rect x="268" y="28" width="20" height="10" rx="2" fill="#FFF7C4"/>`,
  temple: `<path d="M110 104 V84 H130 V66 H150 V50 H208 V66 H228 V84 H248 V104Z" fill="#C9A066" stroke="#6E4A1E" stroke-width="2"/>
    <rect x="170" y="70" width="18" height="34" fill="#3A2A14"/><path d="M179 56 l6 6 -6 6 -6 -6z" fill="#3FE0D0" stroke="#0A0E1F" stroke-width="1.5"/>
    <path d="M62 30 q30 10 40 40 M296 30 q-30 10 -40 40" stroke="#2E8B3A" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  chess: `<path d="M98 104 V96 H122 V104Z M102 96 L106 70 H114 L118 96Z M104 70 H116 V62 H112 V58 H108 V62 H104Z" fill="#E8DCC4" stroke="#0A0E1F" stroke-width="2"/>
    <path d="M232 104 V96 H262 V104Z M236 96 Q232 70 248 58 Q262 60 262 74 L254 72 Q256 84 258 96Z" fill="#3B2A1E" stroke="#0A0E1F" stroke-width="2"/>
    <circle cx="179" cy="44" r="20" fill="#FFD27A" opacity=".25"/>`,
  ocean: `<path d="M62 70 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#7FD3FF" stroke-width="3"/>
    <path d="M120 86 q10 -8 22 0 q-10 8 -22 0z M142 86 l7 -5 v10z" fill="#FFCC33"/><path d="M220 60 q10 -8 22 0 q-10 8 -22 0z M242 60 l7 -5 v10z" fill="#FF7A5C"/>
    <path d="M80 104 q-4 -18 4 -26 M88 104 q4 -14 -2 -22" stroke="#FF7A5C" stroke-width="4" fill="none" stroke-linecap="round"/>`,
};
// What lines each arena's stretch of the Glory Road (one 90×260 tile, repeated down both edges).
const star4 = (x, y, r, c = '#FFE38A') => `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" fill="${c}" stroke="none"/>`;
const leaf = (x, y, rot, c = '#49B24F', s = 1) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0Q10-14 24 0Q10 14 0 0Z" fill="${c}"/><path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M2 0H20" stroke-width="1.2"/>`;
const flake = (x, y, r) => `<g stroke="#FFFFFF" stroke-width="2.2">${[0, 60, 120].map(a => `<path transform="rotate(${a} ${x} ${y})" d="M${x} ${y - r}V${y + r}M${x - 3} ${y - r + 4}L${x} ${y - r + 7}L${x + 3} ${y - r + 4}M${x - 3} ${y + r - 4}L${x} ${y + r - 7}L${x + 3} ${y + r - 4}"/>`).join('')}</g>`;
const lolly = (x, y, c) => `<path d="M${x} ${y + 12}V${y + 40}" stroke="#FFFFFF" stroke-width="4"/><circle cx="${x}" cy="${y}" r="13" fill="${c}"/><path d="M${x - 8} ${y}a8 8 0 0 1 16 0a5 5 0 0 1-10 0" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>`;
const ZONE_ART = {
  night: `<path d="M34 18a20 20 0 1 0 16 34 16 16 0 1 1-16-34z" fill="#FFE38A"/>${star4(66, 90, 6)}${star4(20, 120, 4)}${star4(56, 170, 5)}${star4(14, 220, 6)}
    <path d="M8 150q4-12 18-8q8-10 20-2q12-2 12 10z" fill="#2A3A66"/>`,
  candy: `${lolly(26, 30, '#FF4D8D')}${lolly(60, 140, '#7FE7FF')}
    <g transform="translate(30 210) rotate(-20)"><path d="M-14 0L-24-8V8Z M14 0L24-8V8Z" fill="#FFD23F"/><ellipse rx="15" ry="10" fill="#FF7A5C"/><path d="M-6-8V8M4-9V9" stroke="#FFFFFF" stroke-width="2.5"/></g>
    ${[[60, 40, '#FFD23F'], [18, 100, '#A6FF4D'], [70, 200, '#FF4D8D'], [40, 250, '#7FE7FF']].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="10" height="4" rx="2" fill="${c}" stroke="none" transform="rotate(${x} ${x} ${y})"/>`).join('')}`,
  canyon: `<g transform="translate(28 60)"><path d="M-12-6h7v12h-7zM6-14h7v12h-7z" fill="#3FA34D"/><rect x="-5" y="-26" width="11" height="40" rx="5" fill="#3FA34D"/><circle cx="0" cy="-28" r="4" fill="#FF6FA8"/></g>
    <path d="M40 160L52 136L70 140L80 160Z" fill="#C98A4B"/><path d="M8 230L18 210L34 214L40 230Z" fill="#B0703A"/>${star4(70, 30, 5, '#FFF2B0')}
    <path d="M10 112q20-8 40 0" fill="none" stroke="#E2B07A" stroke-width="3"/>`,
  pirate: `<path d="M0 60q10-8 20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#BFE9FF" stroke-width="3"/>
    <g transform="translate(40 130)"><circle cy="-22" r="5" fill="none" stroke="#C9D2E0" stroke-width="3.5"/><path d="M0-17V18M-16 6q4 14 16 12q12 2 16-12M-8-8H8" fill="none" stroke="#C9D2E0" stroke-width="4"/></g>
    <g transform="translate(26 210)"><path d="M0 0q12-10 24 0q-12 10-24 0z" fill="#FFCC33"/><path d="M24 0l8-6v12z" fill="#FFCC33"/><circle cx="6" cy="-1" r="1.6" fill="#0A0E1F"/></g>
    <path d="M0 250q10-8 20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#BFE9FF" stroke-width="3"/>`,
  frost: `${flake(26, 34, 12)}${flake(66, 150, 9)}${flake(20, 236, 10)}
    <g transform="translate(46 96)"><path d="M0-30L18 0H-18Z M0-14L22 18H-22Z" fill="#2E6E5A"/><path d="M0-30L8-18H-8Z M-12-2L0-8L12-2" fill="#FFFFFF"/><rect x="-4" y="18" width="8" height="8" fill="#6E4A2A"/></g>
    <path d="M40 186l-4 18-4-18zM58 186l-3 12-3-12z" fill="#DCF5FF"/>`,
  stadium: `<path d="M0 22Q45 40 90 22" fill="none" stroke="#C9D2E0" stroke-width="2"/>${[12, 34, 56, 78].map((x, k) => `<path d="M${x - 7} ${26 + Math.sin(k) * 3}h14l-7 14z" fill="${['#FF5C5C', '#4CC9F0', '#FFCC33', '#FFFFFF'][k]}"/>`).join('')}
    <g transform="translate(34 120)"><circle r="16" fill="#FFFFFF"/><path d="M0-6l6 4-2 7h-8l-2-7z" fill="#0A0E1F"/></g>
    ${[[66, 70, '#FFCC33'], [16, 180, '#FF5C5C'], [62, 220, '#4CC9F0'], [30, 250, '#FFFFFF']].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="8" height="5" fill="${c}" stroke="none" transform="rotate(${x} ${x} ${y})"/>`).join('')}`,
  jungle: `<path d="M18 0q14 30 0 60t0 60t0 60t0 80" fill="none" stroke="#2E6E3A" stroke-width="4"/>
    ${leaf(18, 24, -30)}${leaf(18, 66, 200, '#2E8B3A')}${leaf(18, 112, -20, '#5FD03A')}${leaf(18, 160, 190)}${leaf(18, 206, -35, '#2E8B3A')}${leaf(18, 246, 200, '#5FD03A')}
    <g transform="translate(60 140)"><path d="M0 26Q-26 0 0-30Q26 0 0 26Z" fill="#3E8E4A"/><path d="M0 24V-24M0-6L-12-14M0 4L12-6M0 14L-10 8" stroke-width="1.6"/></g>
    <g transform="translate(64 60)">${[0, 72, 144, 216, 288].map(r => `<ellipse transform="rotate(${r})" cy="-7" rx="4.5" ry="7" fill="#FF5C8A"/>`).join('')}<circle r="3.5" fill="#FFD23F"/></g>`,
  temple: `<g transform="translate(40 70)"><rect x="-14" y="-40" width="28" height="80" fill="#C9A066"/><path d="M-18-40h36v-8h-36zM-18 40h36v8h-36z" fill="#B08850"/><path d="M-6-34V34M6-34V34" stroke="#6E4A1E" stroke-width="1.5"/></g>
    <path d="M14 0q14 50-6 120" fill="none" stroke="#2E8B3A" stroke-width="3.5"/>${leaf(10, 70, 20, '#3E8E4A', 0.7)}${leaf(4, 104, -30, '#5FD03A', 0.7)}
    <g transform="translate(56 190)"><path d="M0-14l10 14-10 14-10-14z" fill="#3FE0D0"/><path d="M-10 0h20" stroke-width="1.4"/></g>`,
  lava: `<path d="M8 70L22 44L46 48L56 70Z" fill="#3A2420"/><path d="M20 66l8-10 6 6 8-8" fill="none" stroke="#FF7A2F" stroke-width="2.5"/>
    <path d="M44 200L56 176L76 180L84 200Z" fill="#3A2420"/><path d="M54 196l6-8 6 4 6-6" fill="none" stroke="#FFD23F" stroke-width="2.5"/>
    ${[[64, 30, 4], [30, 120, 5], [70, 130, 3], [20, 170, 4], [40, 250, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FF7A2F" stroke="none"/><circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="#FF7A2F" stroke="none" opacity=".25"/>`).join('')}
    <path d="M10 0v14a5 5 0 0 0 10 0v-14z" fill="#FF7A2F"/>`,
  chess: `<g transform="translate(30 60)"><path d="M-12 22h24v-6h-24zM-8 16l3-18h10l3 18z" fill="#E8DCC4"/><circle cy="-8" r="7" fill="#E8DCC4"/></g>
    <g transform="translate(58 170)"><path d="M-12 22h26v-6h-26zM-8 16q-4-24 12-32q12 2 12 14l-8-2q2 10 4 20z" fill="#3B2A1E"/><circle cx="2" cy="-8" r="1.6" fill="#FFFFFF" stroke="none"/></g>
    ${[[60, 20], [72, 32], [10, 120], [22, 132], [10, 230], [22, 242]].map(([x, y]) => `<rect x="${x}" y="${y}" width="12" height="12" fill="${(x + y) % 24 ? '#E8DCC4' : '#3B2A1E'}" stroke-width="1.2"/>`).join('')}`,
  space: `<g transform="translate(36 56)"><circle r="18" fill="#FF8FB1"/><ellipse rx="32" ry="7" fill="none" stroke="#FFE38A" stroke-width="3" transform="rotate(-18)"/></g>
    ${star4(70, 110, 5, '#FFFFFF')}${star4(16, 150, 4, '#FFFFFF')}${star4(66, 240, 6, '#FFFFFF')}
    <g transform="translate(40 200) rotate(30)"><path d="M0-18q8 8 8 22h-16q0-14 8-22z" fill="#E8ECF4"/><path d="M-8 4l-6 8h6zM8 4l6 8h-6z" fill="#FF4D5E"/><path d="M-4 6q4 12 8 0" fill="#FFB547"/><circle cy="-4" r="3" fill="#4CC9F0"/></g>`,
  neon: `<path d="M20 20l20 34H0z" fill="none" stroke="#00F0FF" stroke-width="3"/><circle cx="62" cy="110" r="14" fill="none" stroke="#FF2BD6" stroke-width="3"/>
    <path d="M10 170l12-10 12 10 12-10 12 10 12-10" fill="none" stroke="#A6FF4D" stroke-width="3"/><rect x="40" y="210" width="24" height="24" rx="4" fill="none" stroke="#00F0FF" stroke-width="3" transform="rotate(20 52 222)"/>`,
};
// map coordinates (0–400) onto the stage floor's trapezoid
const persp = (x, y) => { const v = y / 400, l = 62 - 48 * v, r = 296 + 48 * v; return [l + (x / 400) * (r - l), 104 + v * 322, (r - l) / 400]; };
// the arena's floor pattern, laid onto the stage in perspective
function stageFloor(id) {
  const pt = (x, y) => persp(x, y).slice(0, 2).map(v => v.toFixed(1)).join(' ');
  const quad = (x0, y0, x1, y1) => `M${pt(x0, y0)}L${pt(x1, y0)}L${pt(x1, y1)}L${pt(x0, y1)}Z`;
  const line = (x0, y0, x1, y1) => `M${pt(x0, y0)}L${pt(x1, y1)}`;
  if (id === 'candy' || id === 'chess') {
    const n = id === 'chess' ? 8 : 10, q = 400 / n;
    let d = '';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) & 1) d += quad(i * q, j * q, (i + 1) * q, (j + 1) * q);
    return `<path d="${d}" fill="${id === 'chess' ? '#3B2A1E' : '#5EE6C3'}"/>`;
  }
  if (id === 'stadium') {
    const circle = Array.from({ length: 33 }, (_, k) => pt(200 + Math.cos(k / 16 * Math.PI) * 54, 200 + Math.sin(k / 16 * Math.PI) * 54)).join('L');
    return `<path d="${line(200, 0, 200, 400)}M${circle}${quad(0, 110, 64, 290)}${quad(336, 110, 400, 290)}" fill="none" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="2.5"/>`;
  }
  if (id === 'pirate') return `<path d="${Array.from({ length: 12 }, (_, k) => line(0, k * 33, 400, k * 33)).join('')}" stroke="#46200A" stroke-opacity=".4" stroke-width="2"/>`;
  if (id === 'temple') return `<path d="${[80, 160, 240, 320].map(k => line(k, 0, k, 400) + line(0, k, 400, k)).join('')}" stroke="#6E4614" stroke-opacity=".3" stroke-width="2"/>`;
  if (id === 'neon') return `<path d="${[50, 100, 150, 200, 250, 300, 350].map(k => line(k, 0, k, 400) + line(0, k, 400, k)).join('')}" stroke="#00F0FF" stroke-opacity=".45" stroke-width="1.5"/>`;
  return '';
}
function stageMap(id) {
  return (MAPS[id] ?? []).map(o => {
    const [x, y, k] = persp(o.x, o.y), rx = o.r * k, ry = rx * 0.5, sh = `<ellipse cx="${x + 3}" cy="${y + ry * 0.4}" rx="${rx}" ry="${ry}" fill="#000" opacity=".35"/>`;
    if (o.k === 'rock') return `${sh}<path d="M${x - rx} ${y} Q${x - rx} ${y - ry * 2.6} ${x} ${y - ry * 3} Q${x + rx} ${y - ry * 2.6} ${x + rx} ${y} Q${x} ${y + ry} ${x - rx} ${y}Z" fill="${{ canyon: '#C98A4B', candy: '#FF8FC1', pirate: '#A8642A', temple: '#8E7A5A' }[id] ?? '#7A7F92'}" stroke="#0A0E1F" stroke-width="2"/><path d="M${x - rx * 0.5} ${y - ry * 2} q${rx * 0.3} -${ry * 0.6} ${rx * 0.6} -${ry * 0.4}" stroke="#FFFFFF" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
    if (o.k === 'ice') return `${sh}<path d="M${x - rx * 0.7} ${y} L${x - rx * 0.5} ${y - ry * 3} L${x} ${y - ry * 4.2} L${x + rx * 0.5} ${y - ry * 3} L${x + rx * 0.7} ${y}Z" fill="#BFF3FF" stroke="#2E6E9E" stroke-width="2"/><path d="M${x} ${y - ry * 4} V${y}" stroke="#FFFFFF" stroke-width="1.5"/>`;
    if (o.k === 'bumper' && id === 'stadium') return `${sh}<circle cx="${x}" cy="${y - ry * 1.4}" r="${rx}" fill="#FFFFFF" stroke="#0A0E1F" stroke-width="2"/><circle cx="${x}" cy="${y - ry * 1.4}" r="${rx * 0.35}" fill="#1A1F2E"/>`;
    if (o.k === 'bumper' && id === 'neon') return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#0A0820" stroke="${o.x < 200 ? '#00F0FF' : '#FF2BD6'}" stroke-width="3"/>`;
    if (o.k === 'bumper') return `${sh}<rect x="${x - rx * 0.3}" y="${y - ry * 2}" width="${rx * 0.6}" height="${ry * 2}" fill="#F5E6C8" stroke="#0A0E1F" stroke-width="1.5"/><ellipse cx="${x}" cy="${y - ry * 2.2}" rx="${rx}" ry="${ry * 1.5}" fill="#E0304A" stroke="#0A0E1F" stroke-width="2"/><circle cx="${x - rx * 0.4}" cy="${y - ry * 2.6}" r="${rx * 0.18}" fill="#FFFFFF"/><circle cx="${x + rx * 0.35}" cy="${y - ry * 2.3}" r="${rx * 0.14}" fill="#FFFFFF"/>`;
    if (o.k === 'pool') return `<ellipse cx="${x}" cy="${y}" rx="${rx * 1.15}" ry="${ry * 1.15}" fill="#FF7A2F" opacity=".45"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#FF7A2F" stroke="#5A1A0A" stroke-width="2"/><ellipse cx="${x}" cy="${y}" rx="${rx * 0.55}" ry="${ry * 0.55}" fill="#FFD23F"/>`;
    if (o.k === 'spike' || o.k === 'saw') return `${sh}<path d="${Array.from({ length: 14 }, (_, k) => { const a = (k / 14) * Math.PI * 2, rr = k % 2 ? 0.55 : 1; return (k ? 'L' : 'M') + (x + Math.cos(a) * rx * rr).toFixed(1) + ' ' + (y - ry * 1.2 + Math.sin(a) * ry * rr * 1.4).toFixed(1); }).join('')}Z" fill="${id === 'frost' ? '#DCF5FF' : id === 'temple' ? '#C9C2B0' : '#C9D2E0'}" stroke="#0A0E1F" stroke-width="1.5"/>`;
    if (o.k === 'portal') return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="#C890FF" stroke-width="3"/><ellipse cx="${x}" cy="${y}" rx="${rx * 0.65}" ry="${ry * 0.65}" fill="#FFFFFF" fill-opacity=".5" stroke="#4CC9F0" stroke-width="2.5"/>`;
    return '';
  }).join('');
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
<clipPath id="bw${k}"><path d="M62 14H296V104H62Z"/></clipPath><g clip-path="url(#bw${k})">${BACKDROP[id] ?? BACKDROP.night}</g>
<path d="M62 14H296" stroke="rgba(0,0,0,0.25)" stroke-width="4"/>
<path d="M62 96H296V104H62Z" fill="${top}"/>
<path d="M14 14H62V104L14 426Z" fill="${left}"/><path d="M344 14H296V104L344 426Z" fill="${right}"/>
<path d="M14 14H62V104L14 426ZM344 14H296V104L344 426Z" fill="#000" opacity="0.18"/>
<path d="M62 104H296L344 426H14Z" fill="${th.floor}"/>
<g clip-path="url(#fl${k})">${stageFloor(id)}</g>
<g clip-path="url(#fl${k})" stroke="#FFFFFF" stroke-opacity="0.11" stroke-width="1.5" fill="none"><path d="M91.3 104L55.3 426M120.5 104L96.5 426M149.8 104L137.8 426M179 104V426M208.3 104L220.3 426M237.5 104L261.5 426M266.8 104L302.8 426"/><path d="M0 120H358M0 143H358M0 172H358M0 210H358M0 259H358M0 317H358M0 384H358"/></g>
<path d="M62 14V104L14 426M296 14V104L344 426" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2.5"/>
<g clip-path="url(#fl${k})">${ring(76, 326, 58, 15, ally, 2.5)}${ring(282, 326, 58, 15, ally, 2.5)}${ring(179, 394, 100, 24, lead, 3)}</g>
<rect x="14" y="14" width="330" height="412" fill="url(#vg${k})"/>
${stageMap(id)}
<ellipse ${e(76, 325, 32, 8)} fill="#000" opacity="0.45"/><ellipse ${e(282, 325, 32, 8)} fill="#000" opacity="0.45"/><ellipse ${e(179, 393, 56, 12)} fill="#000" opacity="0.45"/>
<path d="M0 0H358L344 14H14Z" fill="${top}"/><path d="M0 440H358L344 426H14Z" fill="${bottom}"/>
<path d="M0 0L14 14V426L0 440Z" fill="${left}"/><path d="M358 0L344 14V426L358 440Z" fill="${right}"/>
<rect x="1" y="1" width="356" height="438" fill="none" stroke="#0A0E1F" stroke-width="2"/></svg>`;
}

// League emblem: a gem-cut shield in the league colour with the tier (I–III) or a star for Masters.
const LEAGUE_COLORS = {
  bronze: ['#E39A5B', '#8A4E1E'], silver: ['#E3E9F2', '#8E9AB0'], gold: ['#FFD23F', '#B07A00'], diamond: ['#8EEBFF', '#2B7FC0'],
  mythic: ['#DDB0FF', '#7A3FC8'], legend: ['#FF7A88', '#A81F36'], master: ['#FFE38A', '#6E1424'],
};
export function leagueSvg({ id, tier }) {
  const [c, d] = LEAGUE_COLORS[id] ?? LEAGUE_COLORS.bronze;
  const mark = tier ? `<text x="18" y="28.5" text-anchor="middle" font-family="Russo One, sans-serif" font-size="11" fill="#0A0E1F">${['', 'I', 'II', 'III'][tier]}</text>`
    : '<path d="M18 13l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill="#0A0E1F"/>';
  return `<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 2 L33 10 V28 L18 38 L3 28 V10 Z" fill="${d}" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/>`
    + `<path d="M18 6.5 L29 12.5 V26 L18 33.5 L7 26 V12.5 Z" fill="${c}"/><path d="M18 6.5 L29 12.5 V17.5 L18 12.5 L7 17.5 V12.5 Z" fill="rgba(255,255,255,0.45)"/>${mark}</svg>`;
}
export const leagueName = lg => t('league_' + lg.id) + (lg.tier ? ' ' + ['', 'I', 'II', 'III'][lg.tier] : '');
export const titleName = id => (id.startsWith('master_') ? t('ttlMaster', { name: ballName(id.slice(7)) }) : t('ttl_' + id));
const DECO_SVG = {
  target: '<circle cx="20" cy="21" r="15" fill="#FF4D5E" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="20" cy="21" r="10" fill="#FFFFFF"/><circle cx="20" cy="21" r="5.5" fill="#FF4D5E"/><path d="M20 21L33 8" stroke="#0A0E1F" stroke-width="3" stroke-linecap="round"/><path d="M31 5l4 1-1 4-3-1z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/>',
  sword: '<path d="M30 4l6 0 0 6-17 17-6-6z" fill="#E6EDF7" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M9 21l10 10" stroke="#0A0E1F" stroke-width="7" stroke-linecap="round"/><path d="M9 21l10 10" stroke="#FFCC33" stroke-width="3.5" stroke-linecap="round"/><path d="M12 28l-6 6" stroke="#8A5A1A" stroke-width="5" stroke-linecap="round"/><circle cx="5" cy="35" r="3" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/>',
  shield: '<path d="M20 3l14 5v10c0 9-6 16-14 19C12 34 6 27 6 18V8z" fill="#3D86FF" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 8l9 3.5v7c0 6-4 11-9 13-5-2-9-7-9-13v-7z" fill="#FFCC33"/><path d="M20 13l2 4.3 4.6.6-3.4 3.2.9 4.6L20 23.4l-4.1 2.3.9-4.6-3.4-3.2 4.6-.6z" fill="#3D86FF"/>',
  star: '<path d="M20 3l5 10.5 11.5 1.6-8.3 8 2 11.4L20 29l-10.2 5.5 2-11.4-8.3-8L15 13.5z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 15l4-1" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>',
  potion: '<path d="M16 4h8v8l8 12c3 5 0 12-7 12H15C8 36 5 29 8 24l8-12z" fill="#7FE7FF" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M9.5 26h21c1 4-1 8-6 8H15c-5 0-7-4-5.5-8z" fill="#36D27A"/><rect x="14.5" y="2" width="11" height="5" rx="2" fill="#C98A4B" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="16" cy="29" r="2" fill="#FFFFFF" opacity=".8"/>',
  bolt: '<path d="M23 2L8 22h9l-3 16 18-22h-10z" fill="#FFD23F" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 8l-6 10" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity=".8"/>',
  flame: '<path d="M20 2c3 7 12 11 12 22 0 8-6 13-12 13S8 32 8 24c0-6 4-9 5-14 2 3 3 5 3 8 3-4 4-9 4-16z" fill="#FF8A2B" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 20c2 3 6 5 6 10 0 3-3 5-6 5s-6-2-6-5c0-4 4-5 6-10z" fill="#FFD23F"/>',
  trophy: '<path d="M11 5h18v9c0 6-4 10-9 10s-9-4-9-10z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M11 8H5v3c0 4 3 6 6 6M29 8h6v3c0 4-3 6-6 6" fill="none" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><rect x="17" y="24" width="6" height="6" fill="#E59F00" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><rect x="11" y="30" width="18" height="6" rx="2" fill="#8A5A1A" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><path d="M15 8v6" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>',
  crown: '<path d="M5 30L3 10l9 8 8-13 8 13 9-8-2 20z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><rect x="5" y="29" width="30" height="6" rx="2" fill="#E59F00" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="20" cy="22" r="3" fill="#FF4D5E" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="11" cy="24" r="2" fill="#7FE7FF"/><circle cx="29" cy="24" r="2" fill="#7FE7FF"/>',
};
// Name-card banners: a pennant (notch on the right) with a small illustrated scene, Clash Royale style.
// `k` keeps gradient/clip ids unique when several banners are on the page at once.
const STARS = (pts, c = '#FFFFFF') => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
const SPARK = (x, y, s, c = '#FFFFFF') => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${c}"/>`;
const BANNER = {
  night: ['#22407A', '#0B1230', k => `${STARS([[24, 10, 1.2], [58, 20, 0.9], [92, 8, 1.3], [128, 16, 1], [150, 6, 0.8], [112, 28, 0.8], [44, 32, 0.9], [170, 26, 0.7]])}
    <circle cx="206" cy="20" r="19" fill="#FFF3C4" opacity=".14"/><circle cx="206" cy="20" r="12" fill="#FFF3C4"/><circle cx="212" cy="16" r="11" fill="#1A2F62"/>
    <path d="M0 58 V40 L22 26 L40 36 L64 18 L92 38 L118 24 L150 40 L178 28 L210 42 L236 30 L250 36 V58Z" fill="#162A55"/>
    <path d="M64 18 L72 24 L60 26Z M118 24 L125 29 L113 30Z M178 28 L184 32 L173 33Z" fill="#DCE8FF" opacity=".55"/>
    <path d="M0 58 V48 Q34 38 70 46 T140 44 T210 48 T250 44 V58Z" fill="#0A1630"/>`],
  red: ['#E5303F', '#9E1426', k => `<g opacity=".14" fill="#FFFFFF">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<path d="M${i * 34 - 20} 58 L${i * 34} 0 H${i * 34 + 14} L${i * 34 - 6} 58Z"/>`).join('')}</g>
    <path d="M0 49 H250" stroke="#FFCC33" stroke-width="3"/><path d="M0 53 H250" stroke="#7A0E1C" stroke-width="2"/>
    <path d="M196 14 l4 8 9 1.3-6.5 6.3 1.6 9-8.1-4.3-8.1 4.3 1.6-9-6.5-6.3 9-1.3z" fill="#FFCC33" stroke="#7A0E1C" stroke-width="1.5"/>`],
  green: ['#4FD07A', '#156B35', k => `${STARS([[30, 14, 1.6], [70, 30, 1.3], [110, 10, 1.5], [96, 42, 1.1]], '#FFF6A8')}
    ${[[150, 16, 0.5], [178, 30, -0.4], [204, 12, 0.9], [228, 34, -0.8], [130, 38, 0.2]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a * 57})"><path d="M-12 0 Q0 -10 12 0 Q0 10 -12 0Z" fill="#2E9A52" stroke="#0E4A24" stroke-width="1.5"/><path d="M-10 0 H10" stroke="#8EE6A8" stroke-width="1.5"/></g>`).join('')}
    <path d="M0 58 Q60 46 120 54 T250 50 V58Z" fill="#0E4A24"/>`],
  purple: ['#A866F5', '#45188A', k => `<circle cx="70" cy="30" r="40" fill="#FFFFFF" opacity=".07"/><circle cx="190" cy="22" r="30" fill="#FFB8FF" opacity=".12"/>
    <g fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="3"><path d="M10 50 Q40 10 80 30 T150 20"/><path d="M60 58 Q100 30 140 46 T230 26"/></g>
    ${SPARK(185, 18, 8)}${SPARK(212, 38, 5.5, '#FFE38A')}${SPARK(120, 14, 4.5)}${SPARK(40, 34, 4, '#FFE38A')}${SPARK(160, 44, 3)}${SPARK(232, 14, 3.5)}`],
  orange: ['#FFC04D', '#E0561A', k => `<circle cx="206" cy="24" r="22" fill="#FFE38A" opacity=".3"/><circle cx="206" cy="24" r="14" fill="#FFE38A"/>
    ${[[130, 0.9], [158, 1.2], [184, 0.8]].map(([x, h]) => `<path d="M${x} 58 Q${x - 12} ${58 - 22 * h} ${x - 2} ${58 - 34 * h} Q${x + 2} ${58 - 22 * h} ${x + 9} ${58 - 28 * h} Q${x + 14} ${58 - 12 * h} ${x + 8} 58Z" fill="#FF7A1C" opacity=".85"/><path d="M${x + 2} 58 Q${x - 4} ${58 - 14 * h} ${x + 2} ${58 - 22 * h} Q${x + 7} ${58 - 12 * h} ${x + 6} 58Z" fill="#FFE07A"/>`).join('')}
    <path d="M0 58 L0 48 Q50 38 110 46 T250 44 V58Z" fill="#B8450E" opacity=".75"/>`],
  sunset: ['#FF5E8A', '#FFB347', k => `<circle cx="188" cy="44" r="30" fill="#FFE38A" opacity=".25"/><circle cx="188" cy="44" r="19" fill="#FFE38A"/>
    <path d="M0 58 V44 Q40 30 90 40 T180 42 T250 36 V58Z" fill="#B8407A"/><path d="M0 58 V50 Q50 40 110 48 T250 46 V58Z" fill="#6E3FB0"/>
    <path d="M150 52 h70 M164 55 h44" stroke="#FFE38A" stroke-width="2" opacity=".6"/>
    <path d="M56 16 q4 -4 8 0 q4 -4 8 0 M92 24 q3 -3 6 0 q3 -3 6 0 M120 12 q3 -3 6 0 q3 -3 6 0" fill="none" stroke="#5A1F40" stroke-width="1.8" stroke-linecap="round"/>`],
  ocean: ['#2BA0E8', '#0A4A86', k => `${[[120, 14, 3], [132, 24, 2], [226, 12, 2.5], [60, 36, 1.8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1.4"/>`).join('')}<g fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="2.5" stroke-linecap="round">
    ${[14, 30, 46].map((y, i) => `<path d="M${-10 + i * 12} ${y} q12 -7 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0"/>`).join('')}</g>
    ${STARS([[190, 20, 3], [200, 30, 2], [182, 36, 1.6]], 'rgba(255,255,255,0.6)')}
    <path d="M150 36 q10 -8 22 0 q-10 8 -22 0z M172 36 l7 -5 v10z" fill="#FFCC33" stroke="#0A3460" stroke-width="1.5"/>`],
  galaxy: ['#3B1A6E', '#120A2E', k => `<ellipse cx="80" cy="30" rx="60" ry="18" fill="#C890FF" opacity=".18"/><ellipse cx="150" cy="22" rx="50" ry="12" fill="#4CC9F0" opacity=".14"/>
    ${STARS([[20, 10, 1], [55, 44, 1.2], [100, 12, 0.8], [130, 46, 1], [160, 8, 1.2], [235, 50, 0.9], [90, 30, 0.7]])}
    <circle cx="200" cy="29" r="12" fill="#FF8FB1"/><ellipse cx="200" cy="29" rx="22" ry="5" fill="none" stroke="#FFE38A" stroke-width="2.5" transform="rotate(-18 200 29)"/>
    <path d="M190 22 a12 12 0 0 1 8 -4" stroke="#FFFFFF" stroke-width="2" opacity=".6" fill="none"/>`],
  lava: ['#4A1A10', '#1E0806', k => `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 40 L40 34 L70 44 L110 30 L150 38 L190 26 L250 34" stroke="#FF7A2F" stroke-width="8" opacity=".35"/>
    <path d="M0 40 L40 34 L70 44 L110 30 L150 38 L190 26 L250 34" stroke="#FFB347" stroke-width="2.5"/>
    <path d="M110 30 L120 14 M190 26 L200 50" stroke="#FF7A2F" stroke-width="2"/></g>
    ${STARS([[60, 18, 1.6], [140, 12, 1.3], [215, 14, 1.8], [30, 22, 1.1]], '#FFD23F')}`],
  gold: ['#FFE07A', '#D99500', k => `<path d="M-10 58 L40 0 H62 L12 58Z M70 58 L120 0 H130 L80 58Z" fill="#FFFFFF" opacity=".28"/>
    <g fill="none" stroke="#B07A00" stroke-width="2.5" stroke-linecap="round"><path d="M176 44 q-10 -14 0 -30"/><path d="M224 44 q10 -14 0 -30"/>
    ${[18, 26, 34].map(y => `<path d="M${176 - (y - 14) * 0.15} ${y} l-6 -3 M${224 + (y - 14) * 0.15} ${y} l6 -3"/>`).join('')}</g>
    <path d="M188 36 l-3 -14 7 6 8 -10 8 10 7 -6 -3 14z" fill="#FFFFFF" stroke="#B07A00" stroke-width="2" stroke-linejoin="round"/><circle cx="200" cy="30" r="2.4" fill="#FF4D5E"/>`],
};
export function bannerSvg(id, k) {
  const [top, bottom, scene] = BANNER[id] ?? BANNER.night;
  const shape = 'M8 2 H246 L232 29 L246 56 H8 Q2 56 2 50 V8 Q2 2 8 2 Z';
  return `<svg viewBox="0 0 250 58" preserveAspectRatio="none" aria-hidden="true"><defs>
<linearGradient id="bg${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<linearGradient id="sh${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0A0E1F" stop-opacity=".5"/><stop offset=".55" stop-color="#0A0E1F" stop-opacity="0"/></linearGradient>
<clipPath id="cl${k}"><path d="${shape}"/></clipPath></defs>
<g clip-path="url(#cl${k})"><rect width="250" height="58" fill="url(#bg${k})"/>${scene(k)}<rect width="250" height="58" fill="url(#sh${k})"/>
<path d="M2 6 H246" stroke="#FFFFFF" stroke-opacity=".3" stroke-width="3"/></g>
<path d="${shape}" fill="none" stroke="#0A0E1F" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
const MODE_ICON = {
  classic: '<svg viewBox="0 0 32 32"><path d="M6 6l14 14M26 6L12 20" stroke="#0A0E1F" stroke-width="5" stroke-linecap="round"/><path d="M6 6l14 14M26 6L12 20" stroke="#E6EDF7" stroke-width="2.6" stroke-linecap="round"/><path d="M8.5 19.5l4 4M23.5 19.5l-4 4" stroke="#FFCC33" stroke-width="3.5" stroke-linecap="round"/><path d="M6 26l3-3M26 26l-3-3" stroke="#8A5A1A" stroke-width="3.5" stroke-linecap="round"/></svg>',
  duo: '<svg viewBox="0 0 32 32"><circle cx="12" cy="18" r="8" fill="#4CC9F0" stroke="#0A0E1F" stroke-width="2.2"/><circle cx="21" cy="13" r="7.5" fill="#36D27A" stroke="#0A0E1F" stroke-width="2.2"/><circle cx="18.5" cy="10.5" r="2.2" fill="#FFFFFF" opacity=".7"/><circle cx="9.5" cy="15.5" r="2.2" fill="#FFFFFF" opacity=".7"/></svg>',
  survival: '<svg viewBox="0 0 32 32"><path d="M3 21q4-6 8 0t8 0 8 0" fill="none" stroke="#4CC9F0" stroke-width="3" stroke-linecap="round"/><path d="M3 27q4-6 8 0t8 0 8 0" fill="none" stroke="#1E9BE0" stroke-width="3" stroke-linecap="round"/><path d="M16 3 25 6.5V12c0 5-4 8.5-9 10-5-1.5-9-5-9-10V6.5z" fill="#A6FF4D" stroke="#0A0E1F" stroke-width="2" stroke-linejoin="round"/><path d="M12 12l3 3 5-6" fill="none" stroke="#0A0E1F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  boss: '<svg viewBox="0 0 32 32"><circle cx="16" cy="19" r="11" fill="#FF4D5E" stroke="#0A0E1F" stroke-width="2.2"/><path d="M8 9l2-6 4 4 2-5 2 5 4-4 2 6z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="2" stroke-linejoin="round"/><path d="M11 18l3 1.5M21 18l-3 1.5" stroke="#0A0E1F" stroke-width="2.2" stroke-linecap="round"/><circle cx="12.5" cy="15.5" r="2.5" fill="#FFFFFF" opacity=".6"/></svg>',
};
// Clan emblems: a shield in one of 8 colours with an icon from the decorations.
const CLAN_COLORS = ['#3D86FF', '#FF4D5E', '#36D27A', '#A85CFF', '#FF9F1C', '#4CC9F0', '#FFCC33', '#5A6478'];
const CLAN_ICONS = ['star', 'sword', 'crown', 'bolt', 'flame', 'shield', 'trophy', 'target'];
export const clanBadge = i => `<svg viewBox="0 0 40 44" aria-hidden="true"><path d="M20 2l16 6v12c0 10-7 18-16 22C11 38 4 30 4 20V8z" fill="${CLAN_COLORS[i] ?? CLAN_COLORS[0]}" stroke="#0A0E1F" stroke-width="2.5" stroke-linejoin="round"/>`
  + `<path d="M20 6l12 4.5v9c0 7-5 13-12 16" fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="2.5"/><g transform="translate(9 9) scale(0.55)">${DECO_SVG[CLAN_ICONS[i]] ?? ''}</g></svg>`;
// Banner decorations: the glossy badges drawn in Stitch (decos.js); the old flat icons stay for clan emblems.
export const decoSvg = id => (DECO_ART[id] ? `<svg viewBox="0 0 120 120" aria-hidden="true">${DECO_ART[id]}</svg>` : '');
const money = ([cur, n]) => `<i class="${cur === 'gems' ? 'gem' : 'coin'}"></i>${n}`;
const unit = (n, u) => new Intl.NumberFormat(lang, { style: 'unit', unit: u, unitDisplay: 'narrow' }).format(n); // "3 ч", "3h", "3 sa"...
const mmss = ms => { const m = Math.ceil(ms / 60e3); return m >= 60 ? `${unit(Math.floor(m / 60), 'hour')} ${unit(m % 60, 'minute')}` : unit(m, 'minute'); };
export const rankBadge = r => `<span class="rk-badge t-${rankTier(r)}">${r}</span>`;

export function createHome({ save, persist, el, icon, coinsUI, toast, onPlay, onWatch, onChallenge, online }) {
  const { net, leaderboard, deleteProfile, news } = online;
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
    } else if (res.gems) {
      hero.innerHTML = '<i class="gem" style="width:96px;height:96px"></i>';
      text = t('gotGems', { n: res.gems });
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
    const lv = levelOf(save.xp);
    $('#h-avatar').replaceChildren(icon(save.avatar, 44, save.skinOf[save.avatar]), el('b', 'lvl-badge', String(lv.lv)));
    $('#h-xp').style.width = Math.round((lv.xp / lv.need) * 100) + '%';
    $('#h-xpn').textContent = `${lv.xp}/${lv.need}`;
    $('#h-nick').textContent = nickText(save.nick, lang);
    $('#h-title').textContent = titleName(titleOk(save, save.title) ? save.title : 'rookie');
    $('#h-tr').textContent = save.trophies;
    $('#h-league').innerHTML = leagueSvg(leagueFor(save.trophies));
    $('#h-banner').innerHTML = bannerSvg(save.wear.banner, 'me');
    $('#h-deco').innerHTML = decoSvg(save.wear.deco);
  }

  // ---------- trophy road (horizontal, left → right, like Brawl Stars) ----------
  const rewardName = n => (n.ball ? ballName(n.ball) : n.skin ? skinName(n.skin[1]) : n.chest ? t('chest_' + n.chest) : `+${n.coins}`);
  const rewardIcon = (n, size) => {
    if (n.ball) return icon(n.ball, size);
    if (n.skin) return icon(n.skin[0], size, n.skin[1]);
    if (n.chest) return el('span', 'chest-ico', chestSvg(n.chest));
    return el('i', 'coin big-coin');
  };

  // One road from the bottom up, after the Stitch design: a rail up the middle that glows where you've been, trophy marks
  // on it, reward cards to the left and right, every arena a striped gate across the road, "you are here" with the way
  // to the next reward, and a bar to claim everything at once.
  const LOCK_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
  const rewardSub = n => (n.ball ? t('rarity_' + RARITY[n.ball]) : n.skin ? ballName(n.skin[0]) : '');
  const zoneArt = (id, flip) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 260" width="90" height="260"><g ${flip ? 'transform="translate(90 0) scale(-1 1)"' : ''} stroke="#0A0E1F" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${ZONE_ART[id] ?? ZONE_ART.night}</g></svg>`;
  function road() {
    const box = $('#road'), until = Math.max(save.maxTrophies + 500, ARENAS.at(-1).at + 200);
    const ready = claimable(save), readySet = new Set(ready.map(n => n.at));
    const items = [
      ...pathNodes(until).filter(n => n.at <= until).map(n => ({ at: n.at, n })),
      ...ARENAS.map((a, i) => ({ at: a.at, arena: a, i, header: true })),
    ].sort((x, y) => y.at - x.at || (x.header ? 1 : 0) - (y.header ? 1 : 0)); // highest first; an arena sits under its rewards
    const cur = arenaIndex(arenaFor(save.maxTrophies).id);
    const rows = [];
    let marked = false, side = 0;
    const marker = () => {
      const { next } = nextReward(), m = el('div', 'r2-me');
      const ring = el('span', 'r2-av');
      ring.append(icon(save.avatar, 64, save.skinOf[save.avatar]));
      m.append(el('b', 'r2-here', `${t('arenaHere')} · <i class="trophy"></i>${save.trophies}`), ring);
      if (next) {
        const prev = [...pathNodes(save.trophies)].filter(x => x.at <= save.trophies).at(-1)?.at ?? 0, span = Math.max(1, next.at - prev);
        m.append(el('div', 'r2-next', `<span>${t('roadToNext', { n: next.at - save.trophies })} <i class="trophy"></i></span><b>${save.trophies - prev} / ${span}</b>`
          + `<span class="r2-bar-in"><i style="width:${Math.round(((save.trophies - prev) / span) * 100)}%"></i></span>`));
      }
      return m;
    };
    const rewardRow = n => {
      const state = save.claimed.includes(n.at) ? 'done' : readySet.has(n.at) ? 'ready' : 'locked';
      const row = el('div', `r2-row ${side ? 'right' : 'left'} ${state}`);
      side = 1 - side;
      const card = el('div', `r2-card ${n.ball ? 'is-ball r-' + RARITY[n.ball] : n.skin ? 'is-skin' : n.chest ? 'is-chest' : n.gems ? 'is-gems' : 'is-coins'}`);
      const tag = state === 'done' ? `✓ ${t('roadGot')}` : state === 'ready' ? (n.ball ? t('roadNewBall') : t('roadAvail')) : '';
      card.innerHTML = (tag ? `<i class="r2-tag">${tag}</i>` : `<i class="r2-need">${LOCK_IC}${n.at} <i class="trophy"></i></i>`)
        + '<span class="r2-ic"></span><b></b><small></small>';
      card.querySelector('.r2-ic').append(n.gems ? el('i', 'gem big-gem') : rewardIcon(n, 46));
      card.querySelector('b').textContent = n.gems ? t('gotGems', { n: n.gems }) : n.coins && !n.ball && !n.skin && !n.chest ? t('gotCoins', { n: n.coins }) : rewardName(n);
      card.querySelector('small').textContent = rewardSub(n);
      if (state === 'ready') {
        const btn = el('button', 'btn primary r2-claim', `${t('claim')} ✦`);
        btn.onclick = () => reward(claim(save, n));
        card.append(btn);
      }
      row.append(card, el('span', 'r2-node', state === 'done' ? '✓' : String(n.at)));
      return row;
    };
    // the arena's gate: a picture of the arena itself, its name and the balls it brings
    const gate = (a, i) => {
      const open = i <= cur, h = el('div', 'r2-arena' + (open ? '' : ' locked') + (i === cur ? ' cur' : ''));
      h.innerHTML = `<div class="r2-pic">${arenaSvg(a.id, 'rd' + i).replace('<svg ', '<svg preserveAspectRatio="xMidYMin slice" ')}</div>`
        + `<div class="r2-gate"><div><b></b><small></small></div><span class="r2-lock">${open ? '' : LOCK_IC}</span></div>`
        + `<div class="r2-balls"><small></small><span></span></div>`;
      h.querySelector('b').textContent = `${t('arenaN', { n: i + 1 })} · ${t('arena_' + a.id)}`;
      h.querySelector('.r2-gate small').innerHTML = (open ? t('roadOpen', { n: a.at }) : t('roadNeed', { n: a.at })) + ' <i class="trophy"></i>';
      h.querySelector('.r2-balls small').textContent = t('arenaUnlocks');
      const balls = BY_UNLOCK.filter(id => arenaFor(UNLOCK[id]).id === a.id);
      h.querySelector('.r2-balls span').append(...balls.map(id => {
        const c = el('span', 'r2-chip r-' + RARITY[id]);
        c.append(icon(id, 18, save.skinOf[id]), document.createTextNode(ballName(id)));
        return c;
      }));
      if (!balls.length) h.querySelector('.r2-balls').hidden = true;
      return h;
    };
    // every arena is its own stretch of road, painted like the arena: its sky, and its things along both edges
    for (let i = ARENAS.length - 1; i >= 0; i--) {
      const a = ARENAS[i], hi = ARENAS[i + 1]?.at ?? Infinity, th = THEMES[a.id] ?? THEMES.night;
      const zone = el('section', `r2-zone z-${a.id}` + (i > cur ? ' locked' : ''));
      zone.style.setProperty('--zsky', th.sky);
      zone.style.setProperty('--zl', `url("data:image/svg+xml,${encodeURIComponent(zoneArt(a.id, false))}")`);
      zone.style.setProperty('--zr', `url("data:image/svg+xml,${encodeURIComponent(zoneArt(a.id, true))}")`);
      for (const it of items) {
        if (it.header || it.at < a.at || it.at >= hi) continue;
        if (!marked && it.at <= save.trophies) { zone.append(marker()); marked = true; }
        zone.append(rewardRow(it.n));
      }
      if (!marked && a.at <= save.trophies) { zone.append(marker()); marked = true; }
      zone.append(gate(a, i));
      if (!i) zone.append(el('div', 'r2-start', `⚑ ${t('roadStart')}`));
      rows.push(zone);
    }
    const fill = el('i', 'r2-fill');
    box.className = 'vroad2';
    box.replaceChildren(el('i', 'r2-rail'), fill, ...rows);
    // a bar that claims every waiting reward at once
    const bar = $('#path-claim');
    bar.hidden = ready.length < 1;
    if (ready.length) {
      bar.innerHTML = `<span><b>${t('roadWaiting', { n: ready.length })}</b></span>`;
      const all = el('button', 'btn primary', `${t('claimAll')} ⚡`);
      all.onclick = () => {
        const got = ready.map(n => claim(save, n));
        const coins = got.reduce((s2, r) => s2 + (r?.coins || 0), 0), gems = got.reduce((s2, r) => s2 + (r?.gems || 0), 0);
        reward(got.find(r => r?.ball && !r.coins) || got.find(r => r?.skin && !r.coins) || got.find(r => r?.chest) || (coins ? { coins } : { gems }));
        if (got.length > 1) $('#rw-sub').textContent = t('andMore', { n: got.length - 1 });
      };
      bar.append(all);
    }
    setTimeout(() => { // the rail glows from the bottom up to you, and the page opens on you
      const me = box.querySelector('.r2-me'), body = $('#tab-body');
      if (!me) return;
      fill.style.height = `${box.scrollHeight - (me.getBoundingClientRect().top - box.getBoundingClientRect().top) - 40}px`; // me sits inside its arena's stretch
      if (tab === 'path') body.scrollTop += me.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 2;
    }, 0);
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
    const hero = $('#path-hero'), nx = ARENAS[arenaIndex(arenaFor(save.maxTrophies).id) + 1], ar = el('div', 'ph-arena');
    ar.textContent = nx ? t('arenaNext', { name: t('arena_' + nx.id), n: nx.at - save.maxTrophies }) : t('arenaLast');
    hero.replaceChildren(el('div', 'ph-trophies', `<i class="trophy"></i><b>${save.trophies}</b>`), ar);
    $('#path-tips').innerHTML = `<span><i class="trophy"></i>+8 ${t('tipWin')}</span><span><i class="trophy"></i>+9 ${t('tipFlawless')}</span><span>${t('tipKeep')}</span>`;
  }

  // ---------- balls & skins ----------
  function balls() { // character tiles; details and skins open on tap
    $('#b-grid').replaceChildren(...BY_UNLOCK.map(id => {
      const own = save.owned.includes(id);
      const tile = el('button', `tile r-${RARITY[id]}` + (own ? '' : ' locked'));
      tile.style.setProperty('--c', BALLS[id].color);
      const L = !own && lockLabel(id, save.maxTrophies), small = el('small', '', own ? `${BALLS[id].hp} ${t('hp')}` : L.trophies ? '' : t('arenaN', { n: L.arena }));
      if (L.trophies) small.innerHTML = `<i class="trophy"></i>${L.trophies}`;
      tile.append(icon(id, 72, save.skinOf[id]), el('b', ''), small);
      tile.children[1].textContent = ballName(id);
      tile.append(el('i', 'rar', t('rarity_' + RARITY[id])));
      if (own) tile.insertAdjacentHTML('beforeend', rankBadge(ballRank(save.mastery[id] ?? 0)));
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
    if (!own) { // balls come from the arenas: claim it on the road, or reach its arena first
      const a = arenaFor(UNLOCK[id]), n = arenaIndex(a.id) + 1;
      if (save.maxTrophies >= UNLOCK[id]) {
        const b = el('button', 'btn primary wide-btn', t('ballOnRoad'));
        b.onclick = () => { $('#scr-ball').hidden = true; open('path'); };
        buy.append(b);
      } else buy.append(el('p', 'arena-lock', ''));
      if (buy.querySelector('.arena-lock')) buy.querySelector('.arena-lock').innerHTML = `${t('ballAtArena', { n, name: t('arena_' + a.id) })} · <i class="trophy"></i>${UNLOCK[id]}`;
    }
    $('#ball-skins-title').hidden = !own;
    $('#ball-skins').hidden = !own;
    $('#ball-path').hidden = !own;
    if (own) {
      $('#ball-skins').replaceChildren(skinOpt(id, null, () => openBall(id)), ...Object.keys(SKINS).map(st => skinOpt(id, st, () => openBall(id))));
      ballPath(id);
    }
    $('#scr-ball').hidden = false;
  }
  $('#ball-close').onclick = () => { $('#scr-ball').hidden = true; };

  // One skin button: owned → wear it; Silver and the rest → buy with coins; Gold → the ball's rank 7; Rainbow → an account.
  function skinOpt(id, style, again) {
    const ownSkin = style == null || hasSkin(save, id, style), on = (save.skinOf[id] ?? null) === style, sk = SKINS[style];
    const b = el('button', `skin ${on ? 'on' : ''} ${ownSkin ? '' : 'locked'} r-${sk?.rar ?? 'common'}`);
    b.append(icon(id, 44, style), document.createTextNode(style == null ? t('skinDefault') : skinName(style)));
    if (sk) b.append(el('i', 'rar', t('rarity_' + sk.rar)));
    if (!ownSkin) b.append(el('span', 'price', sk.gift ? t('skinGift') : sk.path ? t('skinRankLock') : `<i class="coin"></i>${skinPrice(style)}`));
    const fr = save.frags[`${id}:${style}`];
    if (!ownSkin && fr) b.append(el('span', 'frag-bar', `<i style="width:${(fr / FRAG_NEED) * 100}%"></i>`), el('small', 'frag-n', `${fr}/${FRAG_NEED}`));
    b.onclick = () => {
      if (!ownSkin && sk.gift) { $('#scr-ball').hidden = true; open('profile'); return; } // the rainbow comes with an account
      if (!ownSkin && sk.path) { openBall(id); return; } // show the ball's path
      if (ownSkin) equipSkin(save, id, style);
      else if (!buySkin(save, id, style)) return;
      else sfx.coin();
      sfx.click();
      persist();
      coinsUI();
      render();
      again();
    };
    return b;
  }

  // The ball's own path: its rank, points to the next one, and what every rank gives.
  function ballPath(id) {
    const pts = save.mastery[id] ?? 0, r = ballRank(pts), next = RANKS[r], prev = RANKS[r - 1];
    const box = $('#ball-path');
    box.innerHTML = `<div class="bp-head">${rankBadge(r)}<div><b></b><small></small></div></div>`
      + `<div class="bp-bar"><i style="width:${next == null ? 100 : Math.round(((pts - prev) / (next - prev)) * 100)}%"></i></div><div class="bp-steps"></div><p class="muted small"></p>`;
    box.querySelector('b').textContent = t('pathTitle');
    box.querySelector('small').textContent = next == null ? t('rankMax') : t('rankPts', { n: pts, max: next });
    box.querySelector('p').textContent = t('pathHint');
    box.querySelector('.bp-steps').replaceChildren(...Object.entries(BALL_PATH).map(([k, rw]) => {
      const n = Number(k), step = el('div', 'bp-step' + (n <= r ? ' done' : n === r + 1 ? ' next' : ''));
      step.insertAdjacentHTML('beforeend', rankBadge(n));
      if (rw.skin) step.append(icon(id, 30, rw.skin));
      else if (rw.chest) step.append(el('span', 'chest-ico', chestSvg(rw.chest)));
      else if (rw.title) step.append(el('span', 'bp-title', titleName('master_' + id)));
      else if (rw.gems) step.append(el('span', 'bp-coins', `<i class="gem"></i>${rw.gems}`));
      else step.append(el('span', 'bp-coins', `<i class="coin"></i>${rw.coins}`));
      return step;
    }));
  }

  // ---------- skins: every ball you own with all of its skins ----------
  function skins() {
    const order = [...new Set([save.squad[0], ...save.owned])].filter(id => save.owned.includes(id));
    $('#sk-list').replaceChildren(...order.map(id => {
      const row = el('div', 'sk-row'), head = el('div', 'sk-head');
      head.append(icon(id, 34, save.skinOf[id]), el('b', ''));
      head.lastChild.textContent = ballName(id);
      head.insertAdjacentHTML('beforeend', rankBadge(ballRank(save.mastery[id] ?? 0)));
      const opts = el('div', 'skin-row sk-opts');
      opts.append(skinOpt(id, null, skins), ...Object.keys(SKINS).map(st => skinOpt(id, st, skins)));
      row.append(head, opts);
      return row;
    }));
  }

  $('#l-arena-btn').onclick = () => { sfx.click(); open('path'); };

  // ---------- quests ----------
  // Quests as an adventurers' guild (Stitch design): a guild master, a notice board of parchment quests with ranks and
  // stamps, a shelf of daily gifts and a hall of fame for achievements.
  const RANK_OF = coins => (coins >= 60 ? 'A' : coins >= 40 ? 'B' : 'C');
  function quests() {
    const today = dayKey();
    refreshQuests(save, today);
    const st = dailyState(save, today), list = save.quests.list;
    const canTake = list.some(q => !q.claimed && q.progress >= questDef(q.id).goal), allDone = list.length && list.every(q => q.claimed);
    $('#q-say').textContent = t(canTake ? 'guildClaim' : allDone ? 'guildDone' : 'guildHi');
    drawFamiliar($('#q-master'), 'owl', 78);
    $('#q-timer').innerHTML = untilMidnight();
    $('#q-list').replaceChildren(...list.map((q, i) => {
      const d = questDef(q.id), done = q.progress >= d.goal, rank = RANK_OF(d.coins);
      const n = el('div', `notice${done ? ' done' : ''}${q.claimed ? ' claimed' : ''}`);
      n.style.setProperty('--tilt', `${[-1.2, 0.9, -0.6][i % 3]}deg`);
      n.innerHTML = `<i class="pin"></i><div class="n-top"><span class="rank r${rank}">${t('qRank', { r: rank })}</span>`
        + (done ? `<span class="stamp">${t('qDoneStamp')}</span>` : `<span class="n-state">${t('qActive')}</span>`) + '</div>'
        + `<b class="n-title"></b><div class="n-prog"><small>${t('qProgress')}</small><b>${Math.min(q.progress, d.goal)} / ${d.goal}</b></div>`
        + `<span class="n-bar"><i style="width:${Math.min(100, (q.progress / d.goal) * 100)}%"></i></span>`
        + `<div class="n-rw"><small>${t('qReward')}:</small><b><i class="coin"></i>${d.coins}</b></div>`;
      n.querySelector('.n-title').textContent = questName(q.id);
      if (done && !q.claimed) {
        const btn = el('button', 'btn primary wide-btn', `✓ ${t('qClaimBig')}`);
        btn.onclick = () => reward({ coins: claimQuest(save, q.id) });
        n.append(btn);
      }
      return n;
    }));
    $('#q-daily').replaceChildren(...Array.from({ length: 7 }, (_, i) => { // a shelf of gifts: taken, today's, still to come
      const done = st.canClaim ? i < st.day : i <= st.day, now = st.canClaim && i === st.day;
      const c = el('div', `dcell ${done ? 'done' : now ? 'today' : 'later'}`);
      c.append(el('span', '', t('day', { n: i + 1 })));
      const gift = i < 6 ? `<i class="coin"></i>${DAILY[i]}` : '<i class="coin"></i>200';
      if (done) c.append(el('span', 'd-gift', chestSvg('box')), el('small', 'd-taken', `✓ ${t('qTaken')}`));
      else if (now) { c.append(el('span', 'd-gift', chestSvg('mega')), el('button', 'btn sm go d-claim', t('claim'))); c.onclick = () => reward(claimDaily(save, today)); }
      else if (i === 6 && st.skin) c.append(icon(st.skin[0], 30, st.skin[1]));
      else c.append(el('i', 'd-lock', LOCK_IC), el('b', '', gift));
      return c;
    }));
    $('#q-daily-note').textContent = st.canClaim ? '' : t('comeTomorrow');
    const got = ACHIEVEMENTS.filter(x => save.achieved.includes(x.id)).length;
    $('#q-hall-n').textContent = `${got} / ${ACHIEVEMENTS.length}`;
    $('#q-ach').replaceChildren(...ACHIEVEMENTS.map(x => { // the hall of fame: plaques that light up
      const v = achievementValue(save, x), ok = save.achieved.includes(x.id), can = !ok && v >= x.goal;
      const r = el('div', `plaque${ok ? ' got' : can ? ' ready' : v > 0 ? '' : ' locked'}`);
      r.innerHTML = `<span class="p-ic">${ok || can ? '<i class="trophy"></i>' : v > 0 ? SHIELD_IC : LOCK_IC}</span><div class="p-txt"><b></b>`
        + (ok ? `<small class="p-ok">✓ ${t('qDoneStamp')}</small>` : `<span class="n-bar"><i style="width:${Math.min(100, (v / x.goal) * 100)}%"></i></span>`) + '</div>'
        + (ok ? '' : `<small class="p-n">${Math.min(v, x.goal)} / ${x.goal}</small>`);
      r.querySelector('b').textContent = achievementName(x.id);
      if (can) {
        const btn = el('button', 'btn sm primary', `${t('claim')} <i class="coin"></i>${x.coins}`);
        btn.onclick = () => reward({ coins: claimAchievement(save, x.id) });
        r.append(btn);
      }
      return r;
    }));
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
          el('div', 'sc', `<span class="league-ic sm">${leagueSvg(leagueFor(Number(r.score) || 0))}</span><i class="trophy"></i>${Number(r.score) || 0}`));
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
    // the stand: your banner and name on a ribbon, your favourite ball on a lit pedestal, the familiar beside it
    const fav = save.fav && save.owned.includes(save.fav) ? save.fav : save.avatar, myLv = levelOf(save.xp).lv;
    $('#p-ribbon-bg').innerHTML = bannerSvg(save.wear.banner, 'pr');
    $('#p-deco').innerHTML = decoSvg(save.wear.deco);
    $('#p-av').replaceChildren(icon(save.avatar, 48, save.skinOf[save.avatar]), el('b', 'lvl-badge', String(myLv)));
    $('#p-title').textContent = titleName(titleOk(save, save.title) ? save.title : 'rookie');
    loadMyClan();
    $('#p-clan').innerHTML = myClan ? `<span class="clan-badge">${clanBadge(myClan.badge)}</span><small></small>` : '';
    if (myClan) $('#p-clan small').textContent = clanText(myClan.name, lang);
    $('#p-fav-art').replaceWith(Object.assign(icon(fav, 150, save.skinOf[fav], save.wear.aura), { id: 'p-fav-art' }));
    $('#p-fam').innerHTML = heroSvg(save.fam.skin);
    $('#p-fav-name').textContent = ballName(fav);
    const r = ballRank(save.mastery[fav] ?? 0);
    $('#p-fav-rank').innerHTML = `${rankBadge(r)}<small></small>`;
    $('#p-fav-rank small').textContent = t('favRank', { n: r });
    $('#p-favs').replaceChildren(...save.owned.map(id => {
      const b = el('button', 'pick' + (fav === id ? ' sel-avatar' : ''));
      b.append(icon(id, 40, save.skinOf[id]), document.createTextNode(ballName(id)));
      b.onclick = () => { save.fav = id; persist(); sfx.click(); render(); };
      return b;
    }));
    $('#p-avatars').replaceChildren(...save.owned.map(id => {
      const b = el('button', 'pick' + (save.avatar === id ? ' sel-avatar' : ''));
      b.append(icon(id, 40, save.skinOf[id]), document.createTextNode(ballName(id)));
      b.onclick = () => { save.avatar = id; persist(); render(); };
      return b;
    }));
    const lg = leagueFor(save.trophies);
    $('#p-league').innerHTML = `${leagueSvg(lg)}<div><small></small><b></b><span></span></div>`;
    $('#p-league small').textContent = t('leagueTitle');
    $('#p-league b').textContent = leagueName(lg);
    $('#p-league span').textContent = lg.next ? t('leagueNext', { n: lg.next - save.trophies }) : t('leagueTop');
    const lv = levelOf(save.xp);
    $('#p-league').insertAdjacentHTML('beforeend', `<div class="p-level"><b class="lvl-badge big">${lv.lv}</b><small></small><span class="xp-bar"><i style="width:${Math.round((lv.xp / lv.need) * 100)}%"></i></span></div>`);
    $('#p-league .p-level small').textContent = t('xpOf', { n: lv.xp, max: lv.need });
    const how = x => (x.ball ? t('ttlHowMaster', { name: ballName(x.ball) }) : x.arena ? t('ttlHowArena', { name: t('arena_' + x.arena) })
      : x.stat === 'balls' ? t('ttlHowAll') : t({ wins: 'ttlHowWins', flawless: 'ttlHowFlawless', supers: 'ttlHowSupers', challenges: 'ttlHowChallenges', skins: 'ttlHowSkins' }[x.stat], { n: x.goal }));
    $('#p-titles').replaceChildren(...TITLES.filter(x => !x.ball || titleOk(save, x.id)).map(x => {
      const ok = titleOk(save, x.id), b = el('button', 'chip' + (save.title === x.id ? ' on' : '') + (ok ? '' : ' locked'));
      b.append(el('b', ''));
      b.firstChild.textContent = titleName(x.id);
      if (!ok) { b.append(el('small', '')); b.lastChild.textContent = how(x); }
      b.disabled = !ok;
      b.onclick = () => { save.title = x.id; persist(); sfx.click(); render(); };
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
    const c = CHESTS[k], ballsLeft = chestBalls(save).length > 0, skinsLeft = skinPool(save).length > 0;
    return t('chestInfo', { a: c.coins[0], b: c.coins[1], f: skinsLeft ? `${c.stacks}×${c.frags[0]}–${c.frags[1]}` : 0, g: c.gems, c: ballsLeft ? Math.round(c.ball * 100) : 0, e: Math.round(c.emote * 100) });
  };
  function chestList() {
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
    ...(res.gems ? [{ kind: 'gems', res }] : []),
    ...res.frags.map(f => ({ kind: 'frag', res, f })),
    ...(res.emote ? [{ kind: 'emote', res }] : []),
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
  function crack(kind, ready = null) { // a stash chest, or a slot chest already opened (`ready`)
    const res = ready ?? openChest(save, kind, random);
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
    if (it.kind === 'coins' || it.kind === 'gems') {
      d.append(el('i', it.kind === 'gems' ? 'gem' : 'coin'), el('b', '', `+${it.res[it.kind]}`), el('small', '', t(it.kind === 'gems' ? 'opGems' : 'opCoins')));
      d.firstChild.style.width = d.firstChild.style.height = size + 'px';
    } else if (it.kind === 'frag') { // skin fragments: +n and how far along the skin is
      const f = it.f;
      d.append(icon(f.ball, size, f.style), el('b', '', `+${f.n}`), el('small', ''), el('span', 'frag-bar', `<i style="width:${(f.have / FRAG_NEED) * 100}%"></i>`));
      d.children[2].textContent = f.done ? t('fragDone', { skin: skinName(f.style) }) : t('fragOf', { skin: skinName(f.style), n: f.have, max: FRAG_NEED });
    } else if (it.kind === 'emote') {
      const c = document.createElement('canvas');
      drawEmote(c, it.res.emote, size);
      d.append(el('span', 'ribbon', t('opEmote')), c, el('small', ''));
      d.children[2].textContent = ballName(EMOTE_LIST.find(e => e.id === it.res.emote).ball);
    } else if (it.kind === 'skin') {
      const [ball, style] = it.res.skin;
      d.append(icon(ball, size, style), el('b', ''), el('small', ''));
      d.children[1].textContent = t('opSkin', { skin: skinName(style) });
      d.children[2].textContent = `${ballName(ball)} · ${t('rarity_' + SKINS[style].rar)}`;
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

  // ---------- clans (no chat: names from word lists, emblems, members, clan trophies) ----------
  const CLAN_COST = 15000, CLAN_MAX = 30;
  let clanDraft = null;
  async function clan() {
    const box = $('#clan-body');
    if (!net.online) { box.replaceChildren(el('p', 'muted center', t('needNet'))); return; }
    box.replaceChildren(el('p', 'muted center', t('loading')));
    try {
      const mine = await online.clanInfo(null);
      myClan = mine?.name ? { name: mine.name, badge: Number(mine.badge) || 0 } : null; // the VS screen shows it
      if (tab !== 'clan') return;
      if (mine?.id) return clanView(mine);
      const list = await online.clanList();
      if (tab === 'clan') clanPick(Array.isArray(list) ? list : []);
    } catch { if (tab === 'clan') box.replaceChildren(el('p', 'muted center', t('needNet'))); }
  }
  const clanTitle = (c, cls = 'clan-head') => {
    const h = el('div', cls);
    h.innerHTML = `<span class="clan-badge">${clanBadge(Number(c.badge) || 0)}</span><div><b></b><small></small></div>`;
    h.querySelector('b').textContent = validClan(c.name) ? clanText(c.name, lang) : '???';
    return h;
  };
  function clanView(c) {
    const members = Array.isArray(c.members) ? c.members : [], total = members.reduce((s, m) => s + (Number(m.trophies) || 0), 0);
    const head = clanTitle(c);
    head.querySelector('small').innerHTML = `${t('clanMembers', { n: members.length, max: CLAN_MAX })} · <i class="trophy"></i>${total}`;
    const list = el('div', 'llist');
    list.append(...members.map((m, i) => {
      const row = el('div', `lrow ${m.me ? 'me' : ''}`), name = el('div', 'nm');
      name.textContent = (validNick(m.nick) ? nickText(m.nick, lang) : '???') + (m.leader ? ` · ${t('clanLeader')}` : '');
      const ball = BALLS[m.avatar] ? m.avatar : 'basic', skin = SKINS[m.skin] ? m.skin : null;
      row.append(el('div', 'rk', String(i + 1)), icon(ball, 32, skin), name, el('div', 'sc', `<i class="trophy"></i>${Number(m.trophies) || 0}`));
      return row;
    }));
    const leave = el('button', 'btn ghost danger wide-btn', t('clanLeave'));
    leave.onclick = async () => {
      if (!confirm(t('clanLeaveConfirm'))) return;
      try { await online.clanLeave(); clan(); } catch { toast(t('needNet')); }
    };
    $('#clan-body').replaceChildren(head, list, el('p', 'muted small', t('clanSafe')), leave);
  }
  function clanPick(list) {
    clanDraft ??= { a: Math.floor(Math.random() * NICK_RANGE.a), n: Math.floor(Math.random() * NICK_RANGE.n), badge: Math.floor(Math.random() * 8) };
    const make = el('div', 'clan-make');
    make.append(el('h3', '', ''), clanTitle({ name: clanDraft, badge: clanDraft.badge }, 'clan-head'));
    make.firstChild.textContent = t('clanCreate');
    const reroll = el('button', 'btn sm', t('clanReroll'));
    reroll.onclick = () => { clanDraft.a = Math.floor(Math.random() * NICK_RANGE.a); clanDraft.n = Math.floor(Math.random() * NICK_RANGE.n); sfx.click(); clanPick(list); };
    const badges = el('div', 'clan-badges');
    badges.append(...CLAN_COLORS.map((_, i) => {
      const b = el('button', 'clan-badge' + (clanDraft.badge === i ? ' on' : ''), clanBadge(i));
      b.onclick = () => { clanDraft.badge = i; sfx.click(); clanPick(list); };
      return b;
    }));
    const go = el('button', 'btn primary wide-btn', `${t('clanCreate')} · <i class="coin"></i>${CLAN_COST}`);
    go.disabled = save.coins < CLAN_COST;
    go.onclick = async () => {
      if (save.coins < CLAN_COST) return toast(t('needCoins'));
      go.disabled = true;
      try {
        await online.clanCreate({ a: clanDraft.a, n: clanDraft.n }, clanDraft.badge);
        pay(save, 'coins', CLAN_COST); persist(); coinsUI(); sfx.coin(); confetti(40); toast(t('clanCreated')); clanDraft = null; clan();
      } catch { go.disabled = false; toast(t('needNet')); }
    };
    make.append(reroll, el('h4', '', ''), badges, go);
    make.querySelector('h4').textContent = t('clanBadge');
    make.querySelector('.clan-head small').textContent = '';
    const top = el('div', 'clan-top');
    top.append(el('h3', ''));
    top.firstChild.textContent = t('clanTop');
    top.append(...(list.length ? list.map(c => {
      const row = clanTitle(c, 'clan-row');
      row.querySelector('small').innerHTML = `${t('clanMembers', { n: c.members, max: CLAN_MAX })} · <i class="trophy"></i>${Number(c.total) || 0}`;
      const join = el('button', 'btn sm primary', t('clanJoin'));
      join.disabled = c.members >= CLAN_MAX;
      join.onclick = async () => {
        join.disabled = true;
        try { if (await online.clanJoin(c.id)) { sfx.coin(); toast(t('clanJoined')); clan(); } else { toast(t('clanFull')); join.disabled = false; } }
        catch { join.disabled = false; toast(t('needNet')); }
      };
      row.append(join);
      return row;
    }) : [el('p', 'muted center', t('clanEmpty'))]));
    $('#clan-body').replaceChildren(el('p', 'muted small', t('clanSafe')), make, top);
  }

  // ---------- modes: classic (trophies), 2 vs 2, boss ----------
  function modes() {
    $('#md-list').replaceChildren(...['classic', 'survival', 'duo', 'boss'].map(m => {
      const b = el('button', 'md-card' + (save.mode === m ? ' on' : ''));
      b.innerHTML = `<span class="mode-ic">${MODE_ICON[m]}</span><span class="md-txt"><b></b><small></small><em></em></span>`;
      b.querySelector('b').textContent = t('mode_' + m);
      b.querySelector('small').textContent = t('modeDesc_' + m);
      b.querySelector('em').textContent = m === 'classic' ? t('modeTrophies') : m === 'survival' && save.best.survival ? t('survBest', { n: save.best.survival }) : t('modeNoTrophies');
      b.onclick = () => { save.mode = m; persist(); sfx.click(); $('#scr-modes').hidden = true; render(); };
      return b;
    }));
    $('#scr-modes').hidden = false;
  }
  $('#l-modebtn').onclick = () => { sfx.click(); modes(); };
  $('#md-close').onclick = () => { $('#scr-modes').hidden = true; };

  // ---------- chest slots: wins fill them; one unlocks at a time; gems open now, an ad takes 30 minutes off ----------
  let slotOpen = -1;
  // a live countdown: "14:59" in the last hour, "2 h 30 m" before that
  const clock = ms => { const sec = Math.ceil(ms / 1000); return sec >= 3600 ? mmss(ms) : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const CLOCK_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8.5" fill="#FFFFFF" stroke="#0A0E1F" stroke-width="2"/><path d="M12 8.5V13l3 2" stroke="#0A0E1F" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M9 2.5h6" stroke="#0A0E1F" stroke-width="2.4" stroke-linecap="round"/></svg>';
  function slots() {
    const now = Date.now(), busy = unlocking(save, now);
    $('#l-slots').replaceChildren(...save.slots.map((sl, i) => {
      const b = el('button', 'cslot' + (sl ? ' k-' + sl.kind : ' empty'));
      if (!sl) { b.innerHTML = `<b class="sl-plus">+</b><small>${t('slotFree')}</small>`; b.onclick = () => toast(t('slotEmpty')); return b; }
      const left = slotLeft(sl, now), ready = sl.at != null && left <= 0, going = sl.at != null && !ready;
      b.classList.add(ready ? 'ready' : going ? 'busy' : 'locked');
      if (!ready && !going && !busy) b.classList.add('start'); // the one you can set unlocking now
      b.innerHTML = ready ? `<b class="cs-top">${t('slotReadyTop')}</b>${chestSvg(sl.kind)}<b class="cs-big"></b>`
        : going ? `<b class="cs-top cs-clock">${CLOCK_IC}<span></span></b>${chestSvg(sl.kind)}<small class="cs-now"></small><b class="cs-gems"><i class="gem"></i>${gemsToOpen(left)}</b>`
        : `<b class="cs-top"></b>${chestSvg(sl.kind)}<b class="cs-time"></b>`;
      if (ready) b.querySelector('.cs-big').textContent = t('slotOpen');
      else if (going) { b.querySelector('.cs-clock span').textContent = clock(left); b.querySelector('.cs-now').textContent = t('slotNow'); }
      else { b.querySelector('.cs-top').textContent = busy ? t('slotLocked') : t('slotTapStart'); b.querySelector('.cs-time').textContent = mmss(CHEST_TIME[sl.kind]); }
      b.onclick = () => {
        sfx.click();
        if (ready) return openFromSlot(i, false);
        if (sl.at == null && !unlocking(save, Date.now())) { startUnlock(save, i, Date.now()); persist(); slots(); return; }
        slotCard(i);
      };
      return b;
    }));
  }
  function slotCard(i) {
    slotOpen = i;
    const sl = save.slots[i];
    if (!sl) { $('#scr-slot').hidden = true; slotOpen = -1; return; }
    const left = slotLeft(sl, Date.now()), cost = gemsToOpen(left);
    $('#sl-art').innerHTML = chestSvg(sl.kind);
    $('#sl-title').textContent = t('chest_' + sl.kind);
    $('#sl-time').textContent = sl.at == null ? t('slotWait', { t: mmss(left) }) : t('slotLeft', { t: clock(left) });
    $('#sl-info').textContent = (sl.at == null ? t('slotBusy') + ' ' : '') + odds(sl.kind); // what's inside, before any gems are spent
    $('#sl-gems').innerHTML = `${t('slotNow')} · <i class="gem"></i>${cost}`;
    $('#sl-gems').disabled = freeGems(save) < cost;
    $('#sl-paid').hidden = !(save.gems >= cost && freeGems(save) < cost); // has the gems, but they were bought: not for chests
    $('#sl-gems').onclick = () => openFromSlot(i, true);
    const box = $('#sl-ad');
    box.replaceChildren();
    if (sl.at != null) offerReward('chest-speedup', {
      onAvailable: play => {
        const b = el('button', 'btn ad wide-btn', `${t('slotAd')} <small>· ${t('adTag')}</small>`);
        b.onclick = () => { b.disabled = true; play(); };
        box.replaceChildren(b);
      },
      onReward: () => { speedUp(save, i, AD_SPEEDUP); persist(); slots(); slotCard(i); },
      onDone: () => {},
    });
    $('#scr-slot').hidden = false;
  }
  $('#sl-close').onclick = () => { $('#scr-slot').hidden = true; slotOpen = -1; };
  function openFromSlot(i, pay) {
    const sl = save.slots[i];
    if (!sl) return;
    const res = openSlot(save, i, Date.now(), random, pay);
    if (!res) return toast(t('needGems'));
    $('#scr-slot').hidden = true;
    slotOpen = -1;
    crack(sl.kind, res);
  }
  setInterval(() => { // timers tick while the lobby is open
    if ($('#scr-home').hidden || tab !== 'lobby') return;
    slots();
    if (slotOpen >= 0 && !$('#scr-slot').hidden) slotCard(slotOpen);
  }, 1000);

  // ---------- the shop: deals, emotes, auras, banners, decorations, arena looks, skins, gems ----------
  let confirmKey = '';
  function shopTile(kind, id, preview, name) {
    const own = owns(save, kind, id), worn = save.wear[kind] === id, price = priceOf(kind, id), key = kind + ':' + id;
    const b = el('button', 'sh-tile' + (own ? ' own' : '') + (worn ? ' on' : '') + (confirmKey === key ? ' confirm' : ''));
    b.append(preview, el('b', ''), el('span', 'sh-price'));
    b.children[1].textContent = name;
    b.lastChild.innerHTML = kind === 'emote' && own ? t('shOwned') : own ? (worn ? t('shWorn') : t('shWear')) : confirmKey === key ? `${t('shBuy')} ${money(price)}` : money(price);
    b.onclick = () => {
      sfx.click();
      if (own) { if (kind !== 'emote') wear(save, kind, worn && (kind === 'aura' || kind === 'look') ? null : id); persist(); render(); return; }
      if (confirmKey !== key) { confirmKey = key; shop(); return; } // a second tap buys: no accidental purchases
      confirmKey = '';
      if (!buy(save, kind, id)) { toast(t(price[0] === 'gems' ? 'needGems' : 'needCoins')); shop(); return; }
      sfx.coin(); confetti(30); persist(); coinsUI(); render();
    };
    return b;
  }
  const section = (title, kids, cls = '', note = '') => {
    const sec = el('section', 'sh-sec ' + cls);
    sec.append(el('h3', ''), el('div', 'sh-grid'));
    sec.firstChild.textContent = title;
    if (note) sec.firstChild.append(el('span', 'sh-note', note));
    sec.lastChild.append(...kids);
    return sec;
  };
  const untilMidnight = () => { const ms = new Date().setHours(24, 0, 0, 0) - Date.now(), m = Math.floor(ms / 60000); return `${CLOCK_IC}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  let shopAnim = 0;
  function shop() {
    const today = dayKey(), body = $('#sh-body'), lead = save.squad[0];
    const top = el('div', 'sh-top');
    top.innerHTML = `<span class="sh-bal"><i class="gem"></i>${save.gems}</span><span class="sh-bal"><i class="coin"></i>${save.coins}</span><span class="sh-ad"></span>`;
    if ((save.adGems.day !== today || save.adGems.n < AD_GEMS_DAY)) offerReward('free-gems', {
      onAvailable: play => {
        const b = el('button', 'btn ad sm', `+${AD_GEMS} <i class="gem"></i> <small>· ${t('adTag')}</small>`);
        b.onclick = () => { b.disabled = true; play(); };
        top.querySelector('.sh-ad').replaceChildren(b);
      },
      onReward: () => { adGems(save, today); persist(); coinsUI(); render(); },
      onDone: () => {},
    });
    const deals = dailyDeals(save, today).map(d => {
      const b = el('button', 'sh-tile deal' + (d.sold ? ' own' : ''));
      const prev = d.kind === 'skin' ? icon(d.ball, 64, d.style) : d.kind === 'aura' ? icon(lead, 64, save.skinOf[lead], d.id) : d.kind === 'deco' ? el('span', 'deco-prev', decoSvg(d.id)) : el('span', 'banner-prev', bannerSvg(d.id, 'dl'));
      b.append(el('span', 'sh-off', '-40%'), prev, el('b', ''), el('span', 'sh-price'));
      b.children[2].textContent = d.kind === 'skin' ? `${skinName(d.style)} · ${ballName(d.ball)}` : t(`${d.kind}_${d.id}`);
      b.lastChild.innerHTML = d.sold ? t('shOwned') : money(d.price);
      b.disabled = d.sold;
      b.onclick = () => {
        if (!buyDeal(save, d)) return toast(t(d.price[0] === 'gems' ? 'needGems' : 'needCoins'));
        sfx.coin(); confetti(30); persist(); coinsUI(); render();
      };
      return b;
    });
    const emoteCanvases = [];
    const emotes = EMOTE_LIST.map(e => {
      const c = document.createElement('canvas');
      drawEmote(c, e.id, 64, 0.4);
      if (e.anim) emoteCanvases.push([c, e.id]);
      const tile = shopTile('emote', e.id, c, ''); // the picture says it all
      tile.classList.add('t-' + e.tier);
      if (e.anim) tile.prepend(el('span', 'sh-anim', t('shAnimated')));
      return tile;
    });
    body.replaceChildren(
      top,
      section(t('shDeals'), deals, 'deals', untilMidnight()), // new deals at midnight
      section(t('shEmotes'), emotes),
      section(t('shAuras'), Object.keys(SHOP.aura).map(id => shopTile('aura', id, icon(lead, 64, save.skinOf[lead], id), t('aura_' + id)))),
      section(t('shBanners'), Object.keys(SHOP.banner).map(id => shopTile('banner', id, el('span', 'banner-prev', bannerSvg(id, 'b' + id)), t('banner_' + id))), 'wide'),
      section(t('shDecos'), Object.keys(SHOP.deco).map(id => shopTile('deco', id, el('span', 'deco-prev', decoSvg(id)), t('deco_' + id)))),
      section(t('shLooks'), Object.keys(SHOP.look).map(id => shopTile('look', id, el('span', 'look-prev', arenaSvg(id, 'sh' + id)), t('look_' + id))), 'wide'),
    );
    const skinsBtn = el('button', 'btn wide-btn', t('shAllSkins'));
    skinsBtn.onclick = () => { sfx.click(); open('skins'); };
    const gems = el('div', 'sh-gems');
    gems.innerHTML = '<h3></h3><p class="muted"></p>';
    gems.querySelector('h3').textContent = t(PAY.on ? 'payTitle' : 'shGems');
    gems.querySelector('p').textContent = t(PAY.on ? 'payNote' : 'shGemsSoon');
    if (PAY.on) { // support the game: fixed gem packs, paid through Dodo's own checkout page
      const row = el('div', 'pay-row');
      row.append(...PAY.packs.map(p => {
        const b = el('button', 'sh-tile pay-pack' + (p.best ? ' best' : ''));
        b.innerHTML = `${p.best ? `<span class="sh-off">${t('payBest')}</span>` : ''}<span class="pay-gems">${'<i class="gem"></i>'.repeat(p.id === 'l' ? 3 : p.id === 'm' ? 2 : 1)}</span><b>${p.gems}</b><span class="sh-price">${p.price}</span>`;
        b.onclick = async () => {
          if (!net.online) return toast(t('repOffline'));
          if (!confirm(t('payAsk', { n: p.gems, price: p.price }))) return;
          b.disabled = true;
          try { location.href = await online.checkout(p.id); } catch { toast(t('payFail')); b.disabled = false; }
        };
        return b;
      }));
      gems.append(row);
    }
    body.append(skinsBtn, gems);
    clearInterval(shopAnim); // animated emotes move in the shop too
    shopAnim = setInterval(() => {
      if (tab !== 'shop' || $('#scr-home').hidden) return clearInterval(shopAnim);
      const tt = performance.now() / 1000;
      for (const [c, id] of emoteCanvases) drawEmote(c, id, 64, tt);
    }, 66);
  }

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
  // Big screens have room on both sides of the lobby: today's quests and the next road reward on the left; today's deal,
  // your commander and (once ads run) a banner on the right. Every card opens its screen.
  function wings() {
    const L = $('#wing-l'), R = $('#wing-r'), on = tab === 'lobby' && innerWidth >= 1180;
    L.hidden = R.hidden = !on;
    if (!on) return;
    const card = (title, go, ...body) => {
      const c = el('button', 'wcard');
      c.append(el('h4', '', title), ...body);
      c.onclick = () => { sfx.click(); go(); };
      return c;
    };
    const today = dayKey();
    refreshQuests(save, today);
    const qs = save.quests.list.map(q => {
      const d = questDef(q.id), row = el('div', 'wq' + (q.claimed ? ' done' : q.progress >= d.goal ? ' ready' : ''));
      row.innerHTML = `<b></b><span class="wq-bar"><i style="width:${Math.min(100, (q.progress / d.goal) * 100)}%"></i></span><small>${q.claimed ? '✓' : `${Math.min(q.progress, d.goal)}/${d.goal}`}</small><em><i class="coin"></i>${d.coins}</em>`;
      row.querySelector('b').textContent = questName(q.id);
      return row;
    });
    const { next, p } = nextReward(), road = el('div', 'wroad');
    if (next) {
      road.append(el('span', 'wr-ic'), el('div', 'wr-txt'));
      road.firstChild.append(next.gems ? el('i', 'gem big-gem') : rewardIcon(next, 44));
      road.lastChild.innerHTML = `<b></b><small>${t('roadToNext', { n: next.at - save.trophies })} <i class="trophy"></i></small><span class="wq-bar"><i style="width:${p}%"></i></span>`;
      road.querySelector('b').textContent = next.gems ? t('gotGems', { n: next.gems }) : next.coins && !next.ball && !next.skin && !next.chest ? t('gotCoins', { n: next.coins }) : rewardName(next);
    }
    L.replaceChildren(card(t('tabQuests'), () => open('quests'), ...qs), ...(next ? [card(t('tabPath'), () => open('path'), road)] : []));
    const d = dailyDeals(save, today).find(x => !x.sold), deal = el('div', 'wdeal');
    if (d) {
      const lead = save.squad[0];
      deal.append(d.kind === 'skin' ? icon(d.ball, 64, d.style) : d.kind === 'aura' ? icon(lead, 64, save.skinOf[lead], d.id) : d.kind === 'deco' ? el('span', 'deco-prev', decoSvg(d.id)) : el('span', 'banner-prev', bannerSvg(d.id, 'wd')), el('b', ''), el('span', 'sh-price', money(d.price)));
      deal.children[1].textContent = d.kind === 'skin' ? `${skinName(d.style)} · ${ballName(d.ball)}` : t(`${d.kind}_${d.id}`);
      deal.prepend(el('span', 'sh-off', '-40%'));
    }
    const f = save.fam, cmd = el('div', 'wcmd');
    cmd.innerHTML = `<span class="wc-art">${heroLive(f.skin)}</span><div><b></b><small>${t('famLv', { n: f.lv })}</small></div>`;
    cmd.querySelector('b').textContent = t('fam_' + f.skin);
    R.replaceChildren(...(d ? [card(t('shDeals'), () => open('shop'), deal)] : []), card(t('tabFam'), () => open('fam'), cmd), el('div', 'ad-wing'));
  }
  addEventListener('resize', () => { if (!$('#scr-home').hidden) wings(); });

  function lobby() {
    $('#l-fam').innerHTML = heroSvg(save.fam.skin);
    const [lead, l, r] = save.squad, sk = id => save.skinOf[id];
    $('#l-trio').replaceChildren(icon(l, 136, sk(l)), icon(lead, 232, sk(lead), save.wear.aura), icon(r, 136, sk(r)));
    const a = arenaFor(save.maxTrophies).id;
    $('#l-arena-n').textContent = t('arenaN', { n: arenaIndex(a) + 1 });
    $('#l-arena').textContent = t('arena_' + a);
    if (arenaIndex(a) > arenaIndex(save.arenaSeen)) { // reached a new arena: celebrate it once
      save.arenaSeen = a;
      setTimeout(() => reward({ arena: a }), 300);
    }
    $('#l-lead').textContent = ballName(lead);
    const ranked = save.mode === 'classic' && net.online;
    $('#l-mode').textContent = save.mode === 'classic' ? (net.online ? t('modeRanked') : t('modeTraining')) : t('mode_' + save.mode);
    $('#l-mode').classList.toggle('live', ranked);
    $('#l-modeic').innerHTML = MODE_ICON[save.mode];
    $('#l-modename').textContent = t('mode_' + save.mode);
    const total = KINDS.reduce((n, k) => n + save.chests[k], 0), best = [...KINDS].reverse().find(k => save.chests[k] > 0);
    $('#l-chest-art').innerHTML = chestSvg(best || 'box');
    $('#l-chest-n').hidden = !total;
    $('#l-chest-n').textContent = total;
    $('#l-chest-wins').textContent = '';
    $('#l-chest').hidden = !total;
    $('#l-chest').classList.toggle('has', total > 0);
    slots();
    $('#l-gift').hidden = !net.online || !!net.email;
  }
  $('#l-chest').onclick = () => { sfx.click(); chests(); };
  $('#l-squad').onclick = onPlay;
  $('#l-challenge').onclick = onChallenge;
  $('#b-watch').onclick = onWatch;
  $('#h-play').onclick = onPlay;
  $('#sub-back').onclick = () => { sfx.click(); open('lobby'); };

  // ---------- pages + red dots ----------
  function badges() {
    refreshQuests(save, dayKey());
    const questReady = dailyState(save, dayKey()).canClaim
      || save.quests.list.some(q => !q.claimed && q.progress >= questDef(q.id).goal)
      || ACHIEVEMENTS.some(a => !save.achieved.includes(a.id) && achievementValue(save, a) >= a.goal);
    const f = save.fam, famReady = f.lv < famCap(save.maxTrophies) && f.xp >= famNeed(f.lv) && save.coins >= FAM_COST[f.lv + 1];
    const dots = { path: claimable(save).length > 0, quests: questReady, profile: net.online && !net.email, fam: famReady };
    for (const b of document.querySelectorAll('[data-tab]')) b.querySelector('.badge').hidden = !dots[b.dataset.tab];
  }
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { sfx.click(); open(b.dataset.tab); };

  // The current arena paints the fight and the menus: page sky, battle floor and walls, the lobby stage.
  let shownArena = '';
  function applyArena() {
    const a = save.wear.look && owns(save, 'look', save.wear.look) ? save.wear.look : arenaFor(save.maxTrophies).id;
    if (a === shownArena) return;
    shownArena = a;
    document.documentElement.style.setProperty('--sky', THEMES[a].sky);
    setArena(a);
    $('#l-arena-art').innerHTML = arenaSvg(a, 'l');
    $('#bg-art').innerHTML = arenaSvg(a, 'bg'); // wide screens: the arena, big and blurred, fills the sides
  }

  function render() {
    applyArena();
    top();
    wings();
    if (tab === 'lobby') lobby();
    if (tab === 'path') { pathHero(); road(); }
    if (tab === 'balls') balls();
    if (tab === 'quests') quests();
    if (tab === 'profile') { profile(); account(); }
    if (tab === 'leaders') leaders();
    if (tab === 'skins') skins();
    if (tab === 'shop') shop();
    if (tab === 'mail') mail();
    if (tab === 'clan') clan();
    if (tab === 'fam') famScreen();
    badges();
  }

  function open(next = tab) {
    tab = next;
    for (const name of ['path', 'balls', 'quests', 'leaders', 'profile', 'skins', 'shop', 'mail', 'clan', 'fam']) $('#tab-' + name).hidden = name !== tab;
    $('#lobby').hidden = tab !== 'lobby';
    $('#sub').hidden = tab === 'lobby';
    if (tab !== 'lobby') $('#sub-title').textContent = t('tab' + tab[0].toUpperCase() + tab.slice(1));
    $('#scr-home').hidden = false;
    $('#tab-body').scrollTop = 0;
    render();
  }

  // ---------- settings (the overlay itself is wired in main.js) ----------
  function settings() {
    $('#p-langs').replaceChildren(...Object.entries(LANGS).map(([code, name]) => {
      const b = el('button', 'chip' + (code === lang ? ' on' : ''));
      b.textContent = name;
      b.onclick = () => { if (code !== lang) { setLang(code); location.reload(); } };
      return b;
    }));
  }

  // ---------- inbox: news and gifts from the team (server), plus a welcome letter ----------
  let letters = null, lettersAt = 0;
  const pickText = o => (o && typeof o === 'object' ? String(o[lang] ?? o.en ?? o.ru ?? Object.values(o)[0] ?? '') : '');
  const giftOf = g => ({ coins: Math.min(1000, Math.max(0, Math.floor(Number(g?.coins) || 0))), gems: Math.min(100, Math.max(0, Math.floor(Number(g?.gems) || 0))) });
  async function loadMail() {
    const welcome = { id: 0, at: null, title: t('mailWelcomeTitle'), body: t('mailWelcomeBody'), gift: { coins: 0, gems: 10 } };
    let list = [];
    if (net.online && Date.now() - lettersAt > 60e3) {
      try {
        const rows = await news();
        list = (Array.isArray(rows) ? rows : []).filter(r => Number.isInteger(r?.id) && r.id > 0).map(r => ({ id: r.id, at: r.at, title: pickText(r.title), body: pickText(r.body), gift: r.gift ? giftOf(r.gift) : null }));
        lettersAt = Date.now();
        letters = [...list, welcome];
      } catch { /* offline: keep what we had */ }
    }
    if (!letters) letters = [welcome];
    mailBadge();
    if (tab === 'mail') mail();
  }
  function mailBadge() {
    const unread = (letters ?? []).filter(m => !save.mailRead.includes(m.id) || (m.gift && !save.mailClaimed.includes(m.id))).length;
    $('#l-mail .badge').hidden = !unread;
  }
  function mail() {
    const list = letters ?? [];
    $('#mail-list').replaceChildren(...(list.length ? list.map(m => {
      const card = el('div', 'letter' + (save.mailRead.includes(m.id) ? '' : ' new'));
      card.innerHTML = '<b></b><small></small><p></p>';
      card.querySelector('b').textContent = m.title;
      card.querySelector('small').textContent = m.at ? new Date(m.at).toLocaleDateString(lang) : '';
      card.querySelector('p').textContent = m.body;
      const g = m.gift;
      if (g && (g.coins || g.gems)) {
        const took = save.mailClaimed.includes(m.id);
        const b = el('button', 'btn sm ' + (took ? 'ghost' : 'primary'), took ? t('mailClaimed')
          : `${t('mailClaim')} ${g.coins ? `<i class="coin"></i>${g.coins}` : ''} ${g.gems ? `<i class="gem"></i>${g.gems}` : ''}`);
        b.disabled = took;
        b.onclick = () => {
          if (save.mailClaimed.includes(m.id)) return;
          save.mailClaimed.push(m.id);
          save.coins += g.coins;
          save.gems += g.gems;
          sfx.coin(); confetti(30); persist(); coinsUI(); mail(); mailBadge();
        };
        card.append(b);
      }
      return card;
    }) : [el('p', 'muted center', t('mailEmpty'))]));
    for (const m of list) if (!save.mailRead.includes(m.id)) save.mailRead.push(m.id);
    persist();
    mailBadge();
  }
  $('#l-mail').onclick = () => { sfx.click(); open('mail'); loadMail(); };
  setTimeout(loadMail, 1500); // after connecting

  // ---------- the familiar: its level and bonus, the upgrade (XP from fights + coins, capped by the arena), its looks ----------
  const HEART_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.2 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3.7 4.5 7.3C19.5 16.4 12 21 12 21z" fill="#FF4D5E" stroke="#0A0E1F" stroke-width="2"/></svg>';
  const SWORD_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l10-10 2-5 3-1-1 3-5 2L4 18z" fill="#E6EDF7" stroke="#0A0E1F" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 15l5 5M3 21l3-3" stroke="#FFCC33" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const DASH_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6z" fill="#FFCC33" stroke="#0A0E1F" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const STAR_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z" fill="#C890FF" stroke="#0A0E1F" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const SHIELD_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#4CC9F0" stroke="#0A0E1F" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  // the chips under a familiar: what it boosts and by how much at this level
  const famStats = (id, lv) => {
    const b = famBuff(lv, id), p = n => Math.round(Math.abs(n - 1) * 100);
    const chip = (ic, label, v) => `<span><i>${ic}</i><span><small>${label}</small><b>${v}</b></span></span>`;
    return [b.hp > 1 && chip(HEART_IC, t('famHp'), `+${p(b.hp)}% HP`), b.dmg > 1 && chip(SWORD_IC, t('famDmg'), `+${p(b.dmg)}%`),
      b.dash > 1 && chip(DASH_IC, t('famDash'), `+${p(b.dash)}%`), b.meter > 1 && chip(STAR_IC, t('famMeter'), `+${p(b.meter)}%`),
      b.dashPow > 1 && chip(SWORD_IC, t('famDmg'), `+${p(b.dashPow)}%`), b.armor < 1 && chip(SHIELD_IC, t('famArmor'), `−${p(b.armor)}%`),
      b.regen > 0 && chip(HEART_IC, t('famSpeed'), `+${b.regen.toFixed(1)} HP/s`)].filter(Boolean).join(''); // famSpeed names the Ghost's healing
  };
  let famConfirm = '';
  function famScreen() {
    const f = save.fam, cap = famCap(save.maxTrophies), need = famNeed(f.lv), cost = FAM_COST[f.lv + 1];
    const hero = el('div', 'fam-hero');
    hero.innerHTML = `<b class="fam-lv">${t('famLv', { n: f.lv })}</b><span class="fam-art">${heroSvg(f.skin)}</span><h3 class="fam-name"></h3>`
      + `<div class="fam-stats">${famStats(f.skin, f.lv)}</div><p class="fam-perk"></p>`
      + `<div class="fam-xp"><small>${t('famXp')}</small><b>${f.xp} / ${need}</b></div>`
      + `<span class="xp-bar fam-bar"><i style="width:${Math.min(100, Math.round((f.xp / need) * 100))}%"></i></span>`
      + `<button class="btn primary big wide-btn fam-up"></button><p class="muted center fam-note"></p>`;
    hero.querySelector('.fam-name').textContent = t('fam_' + f.skin);
    hero.querySelector('.fam-name').append(Object.assign(el('i', `rar-chip r-${FAMILIARS[f.skin].rar}`), { textContent: t('rarity_' + FAMILIARS[f.skin].rar) }));
    hero.querySelector('.fam-perk').textContent = t('famPerk_' + f.skin);
    const up = hero.querySelector('.fam-up');
    if (f.lv >= cap) { up.textContent = t('famTop'); up.disabled = true; }
    else {
      up.innerHTML = `${t('famUp')} · ${money(['coins', cost])}`;
      up.disabled = f.xp < need;
      up.onclick = () => {
        if (!famUpgrade(save)) return toast(t('needCoins'));
        sfx.coin(); confetti(40); persist(); coinsUI(); render();
      };
    }
    hero.querySelector('.fam-note').textContent = (f.lv < cap && f.xp < need ? t('famNeedXp') + ' · ' : '') + t('famCap', { n: cap });
    const grid = el('div', 'sh-grid');
    for (const id of Object.keys(FAMILIARS)) {
      const own = f.own.includes(id), on = f.skin === id, it = FAMILIARS[id], price = it.gems ? ['gems', it.gems] : ['coins', it.coins ?? 0];
      const card = el('button', `sh-tile fam-card r-${it.rar}` + (own ? ' own' : '') + (on ? ' on' : '') + (famConfirm === id ? ' confirm' : ''));
      card.append(el('i', 'rar', t('rarity_' + it.rar)), el('span', 'fam-mini', heroSvg(id)), el('b', ''), el('small', 'fam-what'), el('span', 'sh-price'));
      card.children[2].textContent = t('fam_' + id);
      card.children[3].textContent = t('famPerk_' + id); // what it gives, before you buy it
      card.lastChild.innerHTML = on ? t('famPicked') : own ? t('shWear') : famConfirm === id ? `${t('shBuy')} ${money(price)}` : money(price);
      card.onclick = () => {
        sfx.click();
        if (own) { f.skin = id; persist(); render(); return; }
        if (famConfirm !== id) { famConfirm = id; famScreen(); return; } // a second tap buys
        famConfirm = '';
        if (!famBuy(save, id)) { toast(t(price[0] === 'gems' ? 'needGems' : 'needCoins')); famScreen(); return; }
        sfx.coin(); confetti(30); persist(); coinsUI(); render();
      };
      grid.append(card);
    }
    const sec = el('section', 'sh-sec');
    sec.append(el('h3', ''), grid);
    sec.firstChild.textContent = t('famCollection');
    sec.firstChild.append(el('span', 'sh-note', `${f.own.length} / ${Object.keys(FAMILIARS).length}`));
    $('#fam-body').replaceChildren(hero, el('p', 'muted center fam-hint', t('famHint')), sec);
  }

  // ---------- the VS screen before a fight (Clash Royale style): both players' banners, names, clans, levels ----------
  let myClan; // undefined: not asked yet; null: no clan
  const loadMyClan = () => {
    if (myClan !== undefined || !net.online) return;
    online.clanInfo(null).then(c => { myClan = c?.name ? { name: c.name, badge: Number(c.badge) || 0 } : null; }).catch(() => {});
  };
  function vsCard(p, side) {
    const card = el('div', 'vs-card ' + side);
    card.innerHTML = `<span class="vs-bg">${bannerSvg(p.banner, 'vs' + side)}</span><span class="vs-av"></span>`
      + `<div class="vs-txt"><b class="vs-nick"></b><span class="vs-clan"></span><span class="vs-meta">${leagueSvg(leagueFor(p.trophies))}<i class="trophy"></i>${p.trophies}</span></div>`
      + `<span class="vs-deco">${decoSvg(p.deco)}</span>`;
    card.querySelector('.vs-av').append(icon(p.avatar, 58, p.skin), ...(p.level ? [el('b', 'lvl-badge', String(p.level))] : []));
    card.querySelector('.vs-nick').textContent = p.nick;
    if (p.fam) { // the familiar and its level: they're always close, the arena sees to it
      const fc = el('span', 'vs-fam', heroSvg(p.fam.id));
      fc.append(el('b', '', t('famLv', { n: p.fam.lv })));
      card.querySelector('.vs-meta').append(fc);
    }
    if (p.clan) {
      const c = card.querySelector('.vs-clan');
      c.innerHTML = `<span class="clan-badge">${clanBadge(p.clan.badge)}</span><small></small>`;
      c.lastChild.textContent = clanText(p.clan.name, lang);
    }
    return card;
  }
  function vs(foe, fam) { // shows both players, then gets out of the way (about 2.4 s, or a tap)
    loadMyClan();
    const me = { nick: nickText(save.nick, lang), banner: save.wear.banner, deco: save.wear.deco, avatar: save.avatar, skin: save.skinOf[save.avatar], level: levelOf(save.xp).lv, trophies: save.trophies, clan: myClan ?? null, fam };
    const scr = $('#scr-vs');
    scr.replaceChildren(vsCard(foe, 'foe'), el('div', 'vs-shield', '<b>VS</b>'), vsCard(me, 'me'));
    scr.hidden = false;
    sfx.vs();
    return new Promise(done => {
      const end = () => {
        clearTimeout(timer);
        scr.onclick = null;
        scr.classList.add('out');
        setTimeout(() => { scr.hidden = true; scr.classList.remove('out'); done(); }, 280);
      };
      const timer = setTimeout(end, 2400);
      scr.onclick = end;
    });
  }

  return { open, render, settings, vs, reward, hide: () => { $('#scr-home').hidden = true; } };
}
