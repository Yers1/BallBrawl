// Nicknames: a random one from reviewed word lists to start with, or the player's own text through a filter (below).
// Stored as word IDs, rendered in the viewer's language. RU nouns are all masculine so adjectives always agree.
const ADJ = [
  ['Быстрый', 'Swift'], ['Смелый', 'Brave'], ['Хитрый', 'Clever'], ['Ловкий', 'Nimble'], ['Весёлый', 'Jolly'],
  ['Тихий', 'Silent'], ['Грозный', 'Fierce'], ['Золотой', 'Golden'], ['Огненный', 'Fiery'], ['Ледяной', 'Icy'],
  ['Звёздный', 'Starry'], ['Могучий', 'Mighty'], ['Шустрый', 'Zippy'], ['Мудрый', 'Wise'], ['Храбрый', 'Bold'],
  ['Добрый', 'Kind'], ['Яркий', 'Bright'], ['Лунный', 'Lunar'], ['Солнечный', 'Sunny'], ['Стальной', 'Steel'],
];
const NOUN = [
  ['Ёж', 'Hedgehog'], ['Тигр', 'Tiger'], ['Волк', 'Wolf'], ['Барс', 'Leopard'], ['Сокол', 'Falcon'],
  ['Кот', 'Cat'], ['Лев', 'Lion'], ['Медведь', 'Bear'], ['Орёл', 'Eagle'], ['Пингвин', 'Penguin'],
  ['Енот', 'Raccoon'], ['Хомяк', 'Hamster'], ['Бобр', 'Beaver'], ['Кит', 'Whale'], ['Слон', 'Elephant'],
  ['Жук', 'Beetle'], ['Краб', 'Crab'], ['Лис', 'Fox'], ['Барсук', 'Badger'], ['Дельфин', 'Dolphin'],
];

export const nickWords = lang => { const i = lang === 'ru' ? 0 : 1; return { adj: ADJ.map(w => w[i]), noun: NOUN.map(w => w[i]) }; };
export const NICK_RANGE = { a: ADJ.length, n: NOUN.length, dMin: 10, dMax: 999 };

export const randomNick = (rand = Math.random) => ({
  a: Math.floor(rand() * ADJ.length),
  n: Math.floor(rand() * NOUN.length),
  d: NICK_RANGE.dMin + Math.floor(rand() * (NICK_RANGE.dMax - NICK_RANGE.dMin + 1)),
});

export const validNick = k => !!k && (typeof k.t === 'string' ? !checkNick(k.t) && k.t === ownNick(k.t).t
  : Number.isInteger(k.a) && Number.isInteger(k.n) && Number.isInteger(k.d) &&
    k.a >= 0 && k.a < ADJ.length && k.n >= 0 && k.n < NOUN.length && k.d >= NICK_RANGE.dMin && k.d <= NICK_RANGE.dMax);

// Clan names: the same reviewed words, without the number.
export const validClan = k => !!k && Number.isInteger(k.a) && Number.isInteger(k.n) && k.a >= 0 && k.a < ADJ.length && k.n >= 0 && k.n < NOUN.length;
export const clanText = (k, lang) => { const i = lang === 'ru' ? 0 : 1; return `${ADJ[k.a][i]} ${NOUN[k.n][i]}`; };

export const nickText = (k, lang) => {
  if (typeof k.t === 'string') return k.t; // your own nickname, the same in every language
  const i = lang === 'ru' ? 0 : 1;
  return `${ADJ[k.a][i]} ${NOUN[k.n][i]} ${k.d}`;
};
// ---------- your own nickname, with a filter ----------
// A nickname can be the player's own text: 3–16 letters (Cyrillic, Kazakh, Latin), digits, spaces, _ . -
// The filter looks through tricks (х у й, xyй, бл@, fuuuck): two normal forms — Cyrillic look-alikes and Latin —
// without separators and with repeated letters squeezed, then searched for roots. No phone numbers, links or @handles
// (kids must not hand out contacts), no "admin"/"support". The server checks the same lists (bb_nick_ok).
export const NICK_LEN = [3, 16];
const CHARS = /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі0-9 _.\-]+$/;
const KZ = { 'ә': 'а', 'ғ': 'г', 'қ': 'к', 'ң': 'н', 'ө': 'о', 'ұ': 'у', 'ү': 'у', 'һ': 'х', 'і': 'и', 'ё': 'е', 'й': 'и' };
const TO_CYR = { a: 'а', b: 'б', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', n: 'п', o: 'о', p: 'р', r: 'г', t: 'т', u: 'и', x: 'х', y: 'у', 3: 'з', 0: 'о', 4: 'ч', 6: 'б', '@': 'а' };
const TO_LAT = { 'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
export const NICK_BAD_CYR = ['хуй', 'хуе', 'хуи', 'хую', 'хуя', 'пизд', 'ебат', 'ебан', 'ебал', 'ебло', 'ебну', 'ебуч', 'ебаш', 'ебет', 'еблан', 'заеб', 'уеб', 'выеб', 'наеб', 'долбоеб', 'бляд', 'блят', 'бля', 'сука', 'суки', 'сучк', 'мудак', 'мудил', 'пидор', 'пидар', 'педик', 'гандон', 'гондон', 'шлюх', 'дроч', 'залуп', 'манда', 'жопа', 'жопу', 'говн', 'срать', 'дерьм', 'ублюд', 'чмо', 'дебил', 'даун', 'урод', 'нацист', 'фашист', 'гитлер', 'наркот', 'котак', 'сигеиин', 'сигем', 'жалап', 'жалаб', 'шешенди', 'аузына'];
export const NICK_BAD_LAT = ['fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'nigg', 'niga', 'fag', 'slut', 'whore', 'porn', 'sex', 'nazi', 'hitler', 'rape', 'retard', 'bastard', 'asshole', 'penis', 'vagina', 'boob', 'tits', 'kys', 'suicide', 'hui', 'huy', 'xuy', 'xui', 'huj', 'pizd', 'blya', 'suka', 'cyka', 'ebat', 'eban', 'ebal', 'mudak', 'pidor', 'pidr', 'gandon', 'zalup', 'dolboeb', 'amk', 'amina', 'orospu', 'siktir', 'sikerim', 'yarrak', 'jalab', 'jalap', 'qotoq', 'kotoq', 'onangni', 'sikay'];
export const NICK_RESERVED = ['admin', 'админ', 'moder', 'модер', 'support', 'поддерж', 'ballbrawl', 'разработ', 'official', 'официал', 'http', 'www', 'insta', 'tiktok', 'whatsapp', 'вотсап', 'ватсап', 'telegram', 'телеграм', 'tme', 'vkcom'];
const squeeze = s => s.replace(/(.)\1+/g, '$1');
const form = (s, map) => squeeze([...s.toLowerCase()].map(ch => { const c = KZ[ch] ?? ch; return map[c] ?? c; }).join('').replace(/[^a-zа-я]/g, '')); // KZ letters first, then look-alikes (as the server does)
// null = fine, otherwise why not: short, long, chars, contact, reserved, bad
export function checkNick(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (s.length < NICK_LEN[0]) return 'short';
  if (s.length > NICK_LEN[1]) return 'long';
  if (!CHARS.test(s)) return 'chars';
  if (/\d{5,}/.test(s.replace(/[\s_.\-]/g, '')) || /\.(kz|com|ru|net|org|me|io)\b/i.test(s)) return 'contact';
  const cyr = form(s, TO_CYR), lat = form(s, TO_LAT), plain = s.toLowerCase().replace(/[\s_.\-]/g, '');
  if (NICK_RESERVED.some(w => plain.includes(w) || lat.includes(w))) return 'reserved';
  if (NICK_BAD_CYR.some(w => cyr.includes(w)) || NICK_BAD_LAT.some(w => lat.includes(w))) return 'bad';
  return null;
}
export const ownNick = text => ({ t: String(text).trim().replace(/\s+/g, ' ') });
// a nickname typed as text: the word nickname it spells (in either language), or your own text
export function parseNick(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' '), m = /^(\S+) (\S+) (\d{2,3})$/.exec(s);
  if (m) for (const i of [0, 1]) {
    const a = ADJ.findIndex(w => w[i].toLowerCase() === m[1].toLowerCase()), n = NOUN.findIndex(w => w[i].toLowerCase() === m[2].toLowerCase());
    if (a >= 0 && n >= 0 && validNick({ a, n, d: +m[3] })) return { a, n, d: +m[3] };
  }
  return ownNick(s);
}

