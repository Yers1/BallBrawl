// AdSense H5 Games Ads (Ad Placement API) wrapper.
// The publisher id lives in ONE place: the adsbygoogle <script data-ad-client> tag in index.html.
// With the all-zero placeholder id, ads run only on localhost (Google serves its test ads there);
// on a real domain nothing is offered until a real id is set.
const client = document.querySelector('script[data-ad-client]')?.dataset.adClient || '';
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const enabled = /^ca-pub-\d{16}$/.test(client) && (local || !/^ca-pub-0+$/.test(client));

window.adsbygoogle = window.adsbygoogle || [];
const adBreak = (window.adBreak = window.adConfig = o => window.adsbygoogle.push(o));

export function initAds() {
  if (enabled) adBreak({ preloadAdBreaks: 'on', sound: 'off' });
}

// Rewarded video. onAvailable(play) fires only if an ad is ready — render the button then, call play() on click.
let token = 0;
export function offerReward(name, { onAvailable, onReward, onDone = () => {} }) {
  const my = ++token, live = () => my === token; // a newer offer cancels stale callbacks
  if (!enabled) return onDone();
  adBreak({
    type: 'reward',
    name,
    beforeReward: play => live() && onAvailable(play),
    adDismissed: () => {},
    adViewed: () => live() && onReward(),
    adBreakDone: () => live() && onDone(),
  });
}
export const cancelReward = () => { token++; };

// Interstitial at a natural break (between matches). Resolves when the game may continue.
export function interstitial(name) {
  if (!enabled) return Promise.resolve();
  return new Promise(done => adBreak({ type: 'next', name, adBreakDone: done }));
}
