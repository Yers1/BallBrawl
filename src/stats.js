// Product analytics (PostHog): which modes get played, how matches end, whether players come back.
// Anonymous by design for a kids' game: no autocapture (so no typed text such as nicknames), no session recordings,
// no cookies (an id in localStorage only); set "Discard client IP data" in the PostHog project too. Never from dev machines.
import { POSTHOG } from './config.js';

let queue = [];
export function initStats() {
  if (!POSTHOG.key || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('record')) { queue = null; return; }
  const s = document.createElement('script');
  s.async = true;
  s.src = POSTHOG.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.full.js';
  s.onload = () => {
    try {
      window.posthog.init(POSTHOG.key, { api_host: POSTHOG.host, autocapture: false, capture_pageview: true, capture_pageleave: true,
        disable_session_recording: true, persistence: 'localStorage', mask_all_text: true, mask_all_element_attributes: true });
      for (const [e, p] of queue) window.posthog.capture(e, p);
    } catch { /* analytics is never worth an error */ }
    queue = null;
  };
  s.onerror = () => { queue = null; };
  document.head.append(s);
}
export function stat(event, props = {}) {
  try {
    if (window.posthog?.__loaded) window.posthog.capture(event, props);
    else if (queue && queue.length < 50) queue.push([event, props]);
  } catch { /* never in the way of the game */ }
}
