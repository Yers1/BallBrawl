// RU for Russian-reading browsers (ru/kk/uk/be/uz/ky), EN for everyone else.
export const lang = /^(ru|kk|uk|be|uz|ky)/i.test(navigator.language || '') ? 'ru' : 'en';

const dict = {
  ru: {
    tagline: 'Шары с суперсилами. Целься — и смотри, кто выживет.',
    play: 'Играть', watch: 'Смотреть бой', back: 'Назад', menu: 'Меню',
    level: 'Уровень {n} / {max}', levelShort: 'Ур. {n}',
    squadTitle: 'Твой отряд', squadHint: 'Выбери 3 шара — они выйдут по очереди. Можно повторять.',
    enemy: 'Соперник', fight: 'В бой!', owned: 'Есть', buy: 'Купить', try: 'Попробовать', trial: 'На 1 бой',
    hp: 'HP', notEnough: 'Не хватает монет',
    aimHint: 'Потяни от своего шара — и отпусти',
    round: 'Раунд {n}', sudden: 'Внезапная смерть!',
    win: 'Победа!', lose: 'Поражение', draw: 'Ничья',
    coinsEarned: '+{n} монет', next: 'Дальше', retry: 'Ещё раз',
    double: '×2 монеты', revive: 'Вернуть шар', adTag: 'реклама',
    allDone: 'Все 30 уровней пройдены! Дальше — самый сильный соперник.',
    watchTitle: 'Кто победит?', watchHint: 'Выбери два шара — бой пойдёт сам. Удобно записывать видео.',
    left: 'Слева', right: 'Справа', start: 'Начать', again: 'Ещё раз', wins: '{name} побеждает!',
    you: 'Ты', privacy: 'Конфиденциальность',
    names: { basic: 'Обычный', leech: 'Пиявка', cell: 'Клетка', spider: 'Паук', ninja: 'Ниндзя', train: 'Поезд' },
    about: {
      basic: 'Без способности, зато крепкий.',
      leech: 'Прилипает к врагу и высасывает HP, леча себя.',
      cell: 'Когда умирает — делится на два шарика.',
      spider: 'Ударившись о стену, плетёт паутину: враг вязнет и теряет HP.',
      ninja: 'Метает сюрикены. Чем меньше HP — тем чаще.',
      train: 'Прокладывает рельсы — и по ним проносится поезд.',
    },
  },
  en: {
    tagline: 'Balls with superpowers. Aim — and watch who survives.',
    play: 'Play', watch: 'Watch a fight', back: 'Back', menu: 'Menu',
    level: 'Level {n} / {max}', levelShort: 'Lv {n}',
    squadTitle: 'Your squad', squadHint: 'Pick 3 balls — they fight one after another. Repeats allowed.',
    enemy: 'Opponent', fight: 'Fight!', owned: 'Owned', buy: 'Buy', try: 'Try', trial: '1 match',
    hp: 'HP', notEnough: 'Not enough coins',
    aimHint: 'Drag from your ball — then let go',
    round: 'Round {n}', sudden: 'Sudden death!',
    win: 'Victory!', lose: 'Defeat', draw: 'Draw',
    coinsEarned: '+{n} coins', next: 'Next', retry: 'Retry',
    double: '×2 coins', revive: 'Revive ball', adTag: 'ad',
    allDone: 'All 30 levels cleared! From here on — the toughest opponent.',
    watchTitle: 'Who wins?', watchHint: 'Pick two balls and the fight plays itself. Great for recording clips.',
    left: 'Left', right: 'Right', start: 'Start', again: 'Again', wins: '{name} wins!',
    you: 'You', privacy: 'Privacy',
    names: { basic: 'Basic', leech: 'Leech', cell: 'Cell', spider: 'Spider', ninja: 'Ninja', train: 'Train' },
    about: {
      basic: 'No power, but tough.',
      leech: 'Latches on and drains HP to heal itself.',
      cell: 'Splits into two little balls when it dies.',
      spider: 'Spins webs where it hits a wall: foes get stuck and lose HP.',
      ninja: 'Throws shurikens. The lower its HP, the faster.',
      train: 'Lays rails — then a train comes thundering through.',
    },
  },
};

export const t = (key, vars = {}) =>
  String(dict[lang][key] ?? dict.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
export const ballName = id => dict[lang].names[id];
export const ballAbout = id => dict[lang].about[id];
