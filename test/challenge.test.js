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
