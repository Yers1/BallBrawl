import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER } from '../src/balls.js';
import { SKINS } from '../src/progress.js';

test('every ball and skin has its texts in both base languages, and the file loads', async () => {
  const src = await import('../src/i18n.js');
  for (const lang of ['ru', 'en']) {
    const d = src.dict?.[lang];
    assert.ok(d, `dictionary ${lang}`);
    for (const id of ORDER) {
      for (const k of ['names', 'supers', 'superAbout', 'about']) assert.ok(d[k]?.[id], `${lang}.${k}.${id}`);
    }
    for (const s of Object.keys(SKINS)) assert.ok(d.skins?.[s], `${lang}.skins.${s}`);
    for (const k of ['chest_box', 'chest_big', 'chest_mega', 'tabPath', 'acctTitle', 'opTap']) assert.ok(d[k], `${lang}.${k}`);
  }
});

test('every language has every English text, with the same {placeholders}', async () => {
  const { dict, LANGS } = await import('../src/i18n.js');
  const ph = v => (String(v).match(/\{\w+\}/g) || []).sort().join();
  for (const code of Object.keys(LANGS)) {
    const miss = [];
    const walk = (en, d, path) => {
      for (const [k, v] of Object.entries(en)) {
        if (!(k in (d ?? {}))) miss.push(path + k);
        else if (typeof v === 'object') walk(v, d[k], path + k + '.');
        else if (ph(v) !== ph(d[k])) miss.push('placeholders ' + path + k);
      }
    };
    walk(dict.en, dict[code], '');
    assert.deepEqual(miss, [], code);
  }
});
