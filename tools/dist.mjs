// Copy only the public site into dist/ for upload (never tests, tools, supabase/, or .env.local).
// Run: node tools/dist.mjs
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/src`, { recursive: true });
for (const f of ['index.html', 'style.css', 'privacy.html', 'ads.txt', 'manifest.webmanifest', 'icon.svg', 'sw.js']) cpSync(f, `${OUT}/${f}`);
cpSync('c', `${OUT}/c`, { recursive: true });
for (const f of readdirSync('src')) if (f.endsWith('.js')) cpSync(`src/${f}`, `${OUT}/src/${f}`);
cpSync('src/lang', `${OUT}/src/lang`, { recursive: true }); // the other languages
cpSync('sfx', `${OUT}/sfx`, { recursive: true }); // recorded sounds (the train horn)
// Cloudflare Pages headers: always revalidate code so a deploy reaches players right away
writeFileSync(`${OUT}/_headers`, `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/sw.js
  Cache-Control: no-cache
/src/*
  Cache-Control: no-cache
`);
// Vercel: the same headers (vercel.json at the root also tells a Git build to run this script and serve dist/)
writeFileSync(`${OUT}/vercel.json`, JSON.stringify({ headers: JSON.parse(readFileSync('vercel.json', 'utf8')).headers }, null, 2));
console.log('dist ready:', readdirSync(OUT).join(' '));
