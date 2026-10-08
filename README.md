# BallBrawl — ball battle

**Play:** https://ballbrawl-5gr.pages.dev (mirror: https://ballbrawl-silk.vercel.app)

A browser game where balls with superpowers fight in an arena. You build a squad of 3 balls, aim and launch. During a fight you tap the arena to dash (2 charges), and when the meter fills up you hit SUPER: every ball has its own super move.
12 balls: Basic, Leech, Cell, Spider, Ninja, Train, Magnet, Bomb, Turtle, Lightning, Hedgehog, Ice. Each has its own ability and super.
**Trophy Road** from the main menu: wins earn trophies, and the road unlocks balls, skins and coins (rewards are kept forever, even if your trophies drop). There are skins (cosmetic only), 3 daily quests, a 7-day login reward and achievements. No random chests: every reward is known in advance.
**Challenge a friend by link:** the squad, seed, nickname and level live right in the link, no server needed. Your friend plays with the same squad and can send back a reply challenge with their result.
Nicknames are built only from preset words ("Fast Hedgehog 482"), never free text. The game is made for kids, so ads run in child-safe mode (non-personalized). Works offline (service worker).
Revenue comes from Google AdSense ads (H5 Games Ads); haram categories are blocked in the AdSense dashboard.

Plain JavaScript and Canvas, no dependencies and no build step. The folder is the website.

The game UI is in Russian and English (picked from the browser language).

## Run locally

```bash
npm run dev
```

Open http://localhost:5173. Python is required (`tools/dev.py` is a plain static server that only tells the browser not to cache files). Double-clicking `index.html` won't work because of ES modules.
On localhost Google shows **test** ads ("Rewarded ad example"), so every ad button can be checked.
On localhost the game **does not connect** to the live server by default, so test profiles never reach the leaderboard. To test online mode, open http://localhost:5173/?online.

## Tests and balance

```bash
npm test
```

```bash
npm run balance
```

`balance` runs thousands of computer-vs-computer fights, with dashes and supers, and prints a win table: row vs column, in percent.
Rule: keep every ball's average win rate roughly within **35–65%**. Right now all balls are within 37–59%, and there are counter-picks (e.g. Leech beats Basic, Ninja beats Leech).

## Code map

| File | What it does |
|---|---|
| `src/sim.js` | Physics of one round: movement, bounces, homing, contact damage, dash, super meter, sudden death. Deterministic, no DOM. Player commands go through `act()` and are recorded in `world.log`: "seed + log" replays a fight exactly. |
| `src/balls.js` | Balls: HP, colour, price and abilities. All balance numbers are at the top of the file. |
| `src/match.js` | Squads, rounds, AI aiming, revive. |
| `src/progress.js` | Trophies, road, skins, quests, daily reward, achievements, old-save migration. Pure functions, covered by tests. |
| `src/meta.js` | Main menu (lobby: squad, section buttons, road bar, Play) and the pages it opens with a back button: Road, Balls (skins), Quests, Leaders, Profile. |
| `src/ai.js` | The computer opponent: leading dashes, dodging the train, supers. Gets stronger with level. |
| `src/render.js` | Drawing: the bevelled navy arena box, glossy balls with HP in the centre and a glowing team rim, webs, train, shurikens, pixel debris, damage numbers, screen shake. |
| `src/main.js` | Screens, aiming, game loop, saving, ads. |
| `src/net.js`, `src/config.js` | Online: Supabase client (anonymous profile, cloud save, ranked matches, leaderboards). |
| `src/ads.js` | Wrapper around the AdSense Ad Placement API. |
| `src/i18n.js` | Russian and English texts. |
| `src/nick.js` | Nicknames from vetted word lists, stored as word numbers. |
| `src/challenge.js` | Encoding and strict validation of challenge links. |
| `src/sfx.js` | Web Audio sound effects, no audio files. |
| `sw.js`, `manifest.webmanifest` | Offline mode and install-to-phone. |
| `c/index.html` | Challenge links point to `/c/`, so their opens show up as a separate page in analytics. |

**Adding a ball:**
1. Add an entry to `BALLS` in `src/balls.js`, including `onSuper`.
2. Add its name, description, super name and super description to `src/i18n.js`, in both languages.
3. Optionally, a decoration in `deco()` in `src/render.js`.
4. Run `npm test` and `npm run balance`.

## Server (Supabase)

Project `ballbrawl` (ref `zowdpibgfnpqcvwgtryv`, Frankfurt). The game signs in **anonymously**, no email or passwords.

- **Schema and all server functions:** `supabase/migrations/`. The client has no direct table access (RLS with no policies), it can only call vetted functions.
- **The server owns trophies.** Matches shorter than 15 seconds don't count, the daily gain is capped at +200, an abandoned match counts as a loss. A suspiciously high win rate hides the player from the leaderboard.
- **Offline**, the game runs as "Training": coins and quests progress, trophies don't.
- **The key in `src/config.js` is public by design.** The database password lives only in `.env.local`, which is not in git.
- **Changing the schema:** add a new file to `supabase/migrations/`, then run the command below (password from `.env.local`).
  ```bash
  npx supabase db push
  ```
- **Live server check:** creates temporary players and cleans them up afterwards.
  ```bash
  node tools/net-smoke.mjs
  ```
- **A free project pauses after a week without activity.** If there are no players, open the Supabase dashboard and press Restore. Meanwhile the game keeps working in "Training".

## Launch checklist

1. **Domain.** Buy your own (about $10 a year, e.g. Porkbun, Namecheap or Cloudflare itself). AdSense won't accept a free `*.pages.dev` address.
2. **Hosting — Cloudflare Pages, already live:** https://ballbrawl-5gr.pages.dev (project `ballbrawl`). To ship a new version, run the command below: `tools/dist.mjs` copies only the site files into `dist/` (no tests, `supabase/` or `.env.local`) and uploads them. Always deploy `dist`, never the whole folder. Connect the domain in Cloudflare → project `ballbrawl` → Custom domains.
   ```bash
   npm run deploy
   ```
   **Vercel mirror:** https://ballbrawl-silk.vercel.app (project `ballbrawl`), deployed the same way:
   ```bash
   npm run deploy:vercel
   ```
   Vercel's free Hobby plan forbids sites with ads. Fine while there are no real ads; once AdSense goes live, keep the ads on Cloudflare only (or move Vercel to the Pro plan).
3. **Analytics.** Turn on **Web Analytics** in the Pages project settings — cookie-free, no code needed. Challenge links open via `/c/`, so they show up as a separate page.
4. **Privacy policy email.** Replace `CONTACT_EMAIL` in `privacy.html` with your email.
5. **AdSense account.** Requires 18+, so register it under a parent. Add the site and verify it: the AdSense script is already in `index.html`.
6. **Apply for H5 Games Ads** (in-game ads): https://adsense.google.com/start/h5-games-ads/
7. **Insert your ID.** Replace `ca-pub-0000000000000000` with yours in two places: `index.html` and `ads.txt`. While the all-zeros ID is there, no ads show on a real domain at all.
8. **After approval**, remove `data-adbreak-test="on"` from `index.html`, otherwise only test ads will play.
9. **Halal settings**, no code, in the AdSense dashboard:
   - "Brand safety" → "Blocking controls";
   - **Sensitive categories:** block gambling and betting, dating, alcohol and anything questionable in the list;
   - **General categories:** block loans and credit, i.e. anything involving riba;
   - check the "Ad review center" weekly and block whatever slipped through. Google doesn't guarantee 100% filtering.
10. **Kids mode and GDPR:** the code already sets `data-tag-for-age-treatment="1"`, so every ad is non-personalized. The EU consent dialog must not offer personalization.

## Getting players

Nobody finds a website on their own. The cheapest way is **spectator mode**:
- pick two balls, record the screen and post it to TikTok, YouTube Shorts or Reels with a caption like "Who wins — Leech or Train?";
- put the game link in your profile;
- "which ball wins" videos tend to get good views.

## Ideas for later

More balls, Kazakh language, a version for Yandex Games or CrazyGames.

## License

MIT — see [LICENSE](LICENSE).
