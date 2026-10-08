// Offline support: network-first for our own files (players always get the newest build when online),
// cache as the fallback (the game still opens with no connection after the first visit).
const CACHE = 'ballbrawl';
const CORE = [
  './', 'index.html', 'style.css', 'privacy.html', 'manifest.webmanifest', 'icon.svg',
  'src/main.js', 'src/sim.js', 'src/balls.js', 'src/match.js', 'src/ai.js', 'src/render.js',
  'src/i18n.js', 'src/ads.js', 'src/nick.js', 'src/challenge.js', 'src/sfx.js', 'src/progress.js', 'src/meta.js',
  'src/net.js', 'src/config.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // ads, fonts: straight to network
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // always revalidate, so a deploy reaches players on their next launch
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))),
  );
});
