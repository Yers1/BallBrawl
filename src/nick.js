// Nicknames from reviewed word lists only — no free text anywhere (kids' game).
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

export const NICK_RANGE = { a: ADJ.length, n: NOUN.length, dMin: 10, dMax: 999 };

export const randomNick = (rand = Math.random) => ({
  a: Math.floor(rand() * ADJ.length),
  n: Math.floor(rand() * NOUN.length),
  d: NICK_RANGE.dMin + Math.floor(rand() * (NICK_RANGE.dMax - NICK_RANGE.dMin + 1)),
});

export const validNick = k =>
  !!k && Number.isInteger(k.a) && Number.isInteger(k.n) && Number.isInteger(k.d) &&
  k.a >= 0 && k.a < ADJ.length && k.n >= 0 && k.n < NOUN.length && k.d >= NICK_RANGE.dMin && k.d <= NICK_RANGE.dMax;

// Clan names: the same reviewed words, without the number.
export const validClan = k => !!k && Number.isInteger(k.a) && Number.isInteger(k.n) && k.a >= 0 && k.a < ADJ.length && k.n >= 0 && k.n < NOUN.length;
export const clanText = (k, lang) => { const i = lang === 'ru' ? 0 : 1; return `${ADJ[k.a][i]} ${NOUN[k.n][i]}`; };

export const nickText = (k, lang) => {
  const i = lang === 'ru' ? 0 : 1;
  return `${ADJ[k.a][i]} ${NOUN[k.n][i]} ${k.d}`;
};
