import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER } from '../src/balls.js';
import { SKINS } from '../src/progress.js';

test('every ball and skin has its texts in both languages, and the file loads', async () => {
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
