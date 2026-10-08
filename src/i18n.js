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
    dashHint: 'Тапни по арене — рывок туда!', superHint: 'Супер готов — жми СУПЕР!', super: 'Супер',
    round: 'Раунд {n}', sudden: 'Внезапная смерть!',
    win: 'Победа!', lose: 'Поражение', draw: 'Ничья',
    coinsEarned: '+{n} монет', next: 'Дальше', retry: 'Ещё раз',
    double: '×2 монеты', revive: 'Вернуть шар', adTag: 'реклама',
    allDone: 'Все 30 уровней пройдены! Дальше — самый сильный соперник.',
    watchTitle: 'Кто победит?', watchHint: 'Выбери два шара — бой пойдёт сам. Удобно записывать видео.',
    left: 'Слева', right: 'Справа', start: 'Начать', again: 'Ещё раз', wins: '{name} побеждает!',
    you: 'Ты', privacy: 'Конфиденциальность',
    names: { basic: 'Обычный', leech: 'Пиявка', cell: 'Клетка', spider: 'Паук', ninja: 'Ниндзя', train: 'Поезд' },
    supers: { basic: 'Таран', leech: 'Прыжок', cell: 'Деление', spider: 'Ловушка', ninja: 'Веер', train: 'Экспресс' },
    superAbout: {
      basic: 'летит во врага втрое быстрее, удар ×2.',
      leech: 'мгновенно прыгает на врага и пьёт вдвое сильнее.',
      cell: 'сразу выпускает два шарика.',
      spider: 'огромная паутина прямо под врагом.',
      ninja: 'веер из 7 сюрикенов.',
      train: 'поезд почти без предупреждения, урон 30.',
    },
    about: {
      basic: 'Простой и самый крепкий.',
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
    dashHint: 'Tap the arena — dash there!', superHint: 'Super ready — hit SUPER!', super: 'Super',
    round: 'Round {n}', sudden: 'Sudden death!',
    win: 'Victory!', lose: 'Defeat', draw: 'Draw',
    coinsEarned: '+{n} coins', next: 'Next', retry: 'Retry',
    double: '×2 coins', revive: 'Revive ball', adTag: 'ad',
    allDone: 'All 30 levels cleared! From here on — the toughest opponent.',
    watchTitle: 'Who wins?', watchHint: 'Pick two balls and the fight plays itself. Great for recording clips.',
    left: 'Left', right: 'Right', start: 'Start', again: 'Again', wins: '{name} wins!',
    you: 'You', privacy: 'Privacy',
    names: { basic: 'Basic', leech: 'Leech', cell: 'Cell', spider: 'Spider', ninja: 'Ninja', train: 'Train' },
    supers: { basic: 'Ram', leech: 'Pounce', cell: 'Mitosis', spider: 'Trap', ninja: 'Fan', train: 'Express' },
    superAbout: {
      basic: 'charges the foe at triple speed, hits ×2.',
      leech: 'leaps onto the foe and drains twice as hard.',
      cell: 'splits off two little balls right away.',
      spider: 'a huge web right under the foe.',
      ninja: 'a fan of 7 shurikens.',
      train: 'a train with almost no warning, 30 damage.',
    },
    about: {
      basic: 'Simple, and the toughest.',
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
export const superName = id => dict[lang].supers[id];
export const superAbout = id => dict[lang].superAbout[id];
