import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeChallenge, decodeChallenge, newSeed } from '../src/challenge.js';
import { randomNick, validNick, nickText, NICK_RANGE } from '../src/nick.js';
import { ORDER } from '../src/balls.js';

const base = { squad: ['train', 'leech', 'basic'], seed: 123456789, nick: { a: 3, n: 11, d: 482 }, level: 7 };

test('a challenge survives the round trip through the link', () => {
  assert.deepEqual(decodeChallenge(encodeChallenge(base)), { ...base, reply: null });
  const reply = { ...base, reply: { seed: 987654, result: 'w' } };
  assert.deepEqual(decodeChallenge(encodeChallenge(reply)), reply);
});

test('every ball and the full seed range encode', () => {
  for (const id of ORDER) assert.deepEqual(decodeChallenge(encodeChallenge({ ...base, squad: [id, id, id] })).squad, [id, id, id]);
  for (const seed of [1, 0xffffffff, newSeed()]) assert.equal(decodeChallenge(encodeChallenge({ ...base, seed })).seed, seed);
});

test('tampered or junk links are rejected', () => {
  const ok = encodeChallenge(base);
  for (const bad of [
    '', 'hello', ok.replace('v1.', 'v2.'),
    ok.replace(/^v1\.\w{3}/, 'v1.zzz'),          // unknown balls
    ok.replace('.3-11-482.', '.99-11-482.'),     // unknown adjective
    ok.replace('.3-11-482.', '.3-11-5.'),        // number out of range
    ok.replace(/\.7$/, '.99'),                   // level out of range
    ok + '.abc-x',                               // bad reply result
    ok + '<script>', 'v1.012.0.1-1-10.1',        // seed 0
  ]) assert.equal(decodeChallenge(bad), null, bad);
});

test('nicknames come only from the word lists, in both languages', () => {
  let s = 0;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 200; i++) {
    const k = randomNick(rand);
    assert.ok(validNick(k));
    assert.match(nickText(k, 'ru'), /^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+ \d{2,3}$/);
    assert.match(nickText(k, 'en'), /^[A-Z][a-z]+ [A-Z][a-z]+ \d{2,3}$/);
  }
  assert.ok(!validNick({ a: NICK_RANGE.a, n: 0, d: 50 }));
});

test('own nicknames: normal ones pass, rude ones and contacts are caught even with tricks', async () => {
  const { checkNick, parseNick, ownNick } = await import('../src/nick.js');
  for (const ok of ['Ерасыл', 'Айгерім', 'Dark Knight', 'Командир 7', 'Хлеб', 'Небо', 'Classic', 'Snake_2010', 'Peace', 'Barber', 'Снайпер', 'Нурсултан', 'Жанибек', 'Mr. Fox', 'Ананас', 'Сусанна', 'Kitty', 'Gamer-KZ', 'Ball Master'])
    assert.equal(checkNick(ok), null, ok);
  for (const [bad, why] of [['хуй', 'bad'], ['х у й', 'bad'], ['xyй', 'bad'], ['Хууууй', 'bad'], ['бл@ть', 'chars'], ['блять', 'bad'], ['6ля', 'bad'], ['сука 123', 'bad'], ['fuuuck', 'bad'], ['f.u.c.k', 'bad'], ['5hit', 'bad'],
    ['ПиЗдЕц', 'bad'], ['pidor', 'bad'], ['Мудак', 'bad'], ['Hitler', 'bad'], ['жалап', 'bad'], ['admin', 'reserved'], ['Поддержка', 'reserved'], ['87011234567', 'contact'],
    ['my site.kz', 'contact'], ['@cool', 'chars'], ['ab', 'short'], ['Очень длинный ник тут', 'long'], ['😀😀😀', 'chars']])
    assert.equal(checkNick(bad), why, bad);
  assert.deepEqual(parseNick('Хитрый Кит 786'), { a: 2, n: 13, d: 786 }, 'a word nickname typed out is the word nickname');
  assert.deepEqual(parseNick('  Dark   Knight '), ownNick('Dark Knight'));
  const link = encodeChallenge({ ...base, nick: { t: 'Ерасыл 7' } });
  assert.deepEqual(decodeChallenge(link).nick, { t: 'Ерасыл 7' }, 'challenge links carry your own nickname');
  assert.equal(decodeChallenge(encodeChallenge({ ...base, nick: { t: 'сука' } })), null, 'a rude one is refused');
});
