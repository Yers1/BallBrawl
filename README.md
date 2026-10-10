# BallBrawl — ball battle

**Play:** https://ballbrawl-5gr.pages.dev (mirror: https://ballbrawl-silk.vercel.app)

A browser game where balls with superpowers fight in an arena. You build a squad of 3 balls, aim and launch. During a fight you tap the arena to dash (2 charges), and when the meter fills up you hit SUPER: every ball has its own super move.
15 balls: Basic, Leech, Cell, Spider, Ninja, Train, Magnet, Bomb, Turtle, Lightning, Hedgehog, Ice, Spike, Shackles, Forge. Each has its own ability and super. Every round starts with an 8-second aim phase: ability cards for both balls, and the opponent's aim arrow is shown too, like in the original.
**Arenas, Clash Royale style:** Night Arena, Canyon, Frost Peak, Jungle, Lava Crater and Space unlock at 0, 120, 350, 700, 1200 and 1900 best trophies. Each arena repaints the battle floor and walls and the whole menu, and the first visit gets a celebration.
**Glory Road** from the main menu: wins earn trophies, and the road (to 3000 trophies) unlocks balls, skins, coins and chests. Rewards are kept forever, even if your trophies drop. **Chests** are earned only, every 3 wins and on the road. They are never sold, and the chest screen shows the real odds for the player. There are skins (cosmetic only), 3 daily quests, a 7-day login reward and achievements.
**Brawl Stars style progression:** every ball has its own path with ranks 1–10 (coins, chests, the Gold skin at rank 7, a Master title at rank 10). Leagues from Bronze I to Masters by trophies, titles under your nickname, the Silver skin for coins.
**Emotes** in battle (six preset stickers, the computer answers). **8 languages:** Russian, English, Kazakh, Uzbek, Turkish, Spanish, Portuguese, Indonesian, with a picker in the profile.
**Modes and maps:** Classic (squads take turns, trophies), 2 vs 2 and a co-op Boss fight. Every arena has its own map: canyon rocks, frost ice crystals, jungle bouncy mushrooms, lava pools, space portals, each with its own scenery. Player level from XP; levels pay coins and gems.
**Shop and gems:** auras, banners and decorations for your name card, 15 character emotes (some animated), arena maps, daily deals and skins. Gems come from chests, the Glory Road, ball paths, day 7 and rewarded ads; buying gems with money is not built yet.
**Chests:** wins put chests into 4 slots in a fixed order; each unlocks on a timer (gems or an ad skip it). Chests give coins, skin fragments (10 make a skin), gems, sometimes an emote or a new ball, with the odds shown.
**Clans:** create (500 coins), join, leave; names from the nickname word lists, 8 emblems, members and clan trophies. No chat, for kids' safety.
**Inbox and settings:** messages and gifts from the team (posted with SQL, see below), sound, opponent emotes and language in settings.
**Email account** (optional): turns the anonymous player into an account that can sign in on another device, and gives the Rainbow skin as a thank-you.
**Challenge a friend by link:** the squad, seed, nickname and level live right in the link, no server needed. Your friend plays with the same squad and can send back a reply challenge with their result.
Nicknames are built only from preset words ("Fast Hedgehog 482"), never free text. The game is made for kids, so ads run in child-safe mode (non-personalized). Works offline (service worker).
Revenue comes from Google AdSense ads (H5 Games Ads); haram categories are blocked in the AdSense dashboard.

Plain JavaScript and Canvas, no dependencies and no build step. The folder is the website.

The game UI is in 8 languages (`src/i18n.js` for Russian and English, `src/lang/` for the rest). The browser language picks one; the player can change it in the profile.

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
Rule: keep every ball's average win rate roughly within **35–65%**. Right now all 15 balls are within 43–57%, and there are counter-picks (e.g. Leech beats Basic, Ninja beats Leech).

## Code map

| File | What it does |
|---|---|
| `src/sim.js` | Physics of one round: movement, bounces, homing, contact damage, dash, super meter, sudden death. Deterministic, no DOM. Player commands go through `act()` and are recorded in `world.log`: "seed + log" replays a fight exactly. |
| `src/balls.js` | Balls: HP, colour, price and abilities. All balance numbers are at the top of the file. |
| `src/match.js` | Squads, rounds, AI aiming, revive. |
| `src/progress.js` | Trophies, arenas, Glory Road, chests, skins, quests, daily reward, achievements, old-save migration and cloud merge. Pure functions, covered by tests. |
| `src/themes.js` | How each arena looks: sky, floor, walls, floor pattern, neon ring colours. Pure data. |
| `src/meta.js` | Main menu (lobby: the squad standing in the current arena, road bar, chests, Play, a six-tile dock) and the pages it opens with a back button: Glory Road, Balls (skins), Quests, Leaders, Profile with the email account. |
| `src/ai.js` | The computer opponent: leading dashes, dodging the train, supers. Gets stronger with level. |
| `src/render.js` | Drawing: the bevelled arena box in the current arena's colours, glossy balls with HP in the centre and a glowing team rim, webs, train, shurikens, pixel debris, damage numbers, screen shake. |
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

Project `ballbrawl` (ref `zowdpibgfnpqcvwgtryv`, Frankfurt). The game signs in **anonymously**. An optional email account (no confirmation email is sent) is the only way to move to another device; transfer codes were removed.

- **Schema and all server functions:** `supabase/migrations/`. The client has no direct table access (RLS with no policies), it can only call vetted functions.
- **The server owns trophies.** Matches shorter than 15 seconds don't count, the daily gain is capped at +200, an abandoned match counts as a loss. A suspiciously high win rate hides the player from the leaderboard.
- **Offline**, the game runs as "Training": coins and quests progress, trophies don't.
- **The key in `src/config.js` is public by design.** The database password lives only in `.env.local`, which is not in git.
- **Changing the schema:** add a new file to `supabase/migrations/`, then run the command below (password from `.env.local`).
  ```bash
  npx supabase db push
  ```
- **Post a message to every player's inbox** (with an optional gift):
  ```bash
  npx supabase db query --linked "insert into bb_news (title, body, gift) values ('{\"ru\":\"Обновление!\",\"en\":\"Update!\"}', '{\"ru\":\"Новые эмоции.\",\"en\":\"New emotes.\"}', '{\"gems\":5}')"
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
- open `/?record=leech,train` (any two ball ids): a chrome-free 9:16 page that starts that fight at once, with the title in the balls' colours and "WHO WINS?" — screen-record it and post it to TikTok, YouTube Shorts or Reels;
- put the game link in your profile;
- "which ball wins" videos tend to get good views.

## Ideas for later

More balls, Kazakh language, a version for Yandex Games or CrazyGames.

## License

MIT — see [LICENSE](LICENSE).
