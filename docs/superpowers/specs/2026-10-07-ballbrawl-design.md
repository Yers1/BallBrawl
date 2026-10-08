# BallBrawl — design (v1)

Working title. A web game: balls with superpowers fight in an arena. Inspired by Roblox "Ball VS Ball", but the balls, names and graphics are original.
The goal is to earn money from Google AdSense ads (H5 Games Ads) with haram categories blocked.

## Decisions

| Question | Decision |
|---|---|
| Platform | Web (browser, phone + computer). No Apple/Google stores. |
| Audience | All ages, casual. |
| Ads | Own site + AdSense H5 Games Ads (Ad Placement API). |
| Player's role | Aims and launches, then the fight runs by itself. Against the computer, no server. |
| Match | A squad of 3 balls, 1-on-1 duels in turn. |
| Tech | Plain JS (ES modules) + Canvas 2D. No frameworks, no build step, no dependencies. |

## Match

- Each side has a squad of 3 balls; the player chooses the order (the computer chooses by level).
- **Round:** both balls stand on their start points (player — bottom left, enemy — top right). The player drags a finger/mouse from their ball — an arrow appears; on release both balls launch (the enemy's angle is chosen by the AI).
- Balls fly at **constant speed**, bounce off walls, bounce off each other on collision and deal damage. Abilities trigger on their own.
- The round ends when one side has no live objects left on the field. If both sides die on the same tick — both lose a ball.
- **The winner stays** with their current HP; in the next round the enemy's next ball comes out against them, both start from their points again, and the player aims again.
- **Sudden death:** after 30 s of a round all objects lose HP, and the damage grows every second (2, 3, 4… HP/s).
- The match is lost when all 3 balls are lost.

## Physics

- Logical arena 400×400, scaled to the screen (portrait on a phone, centered on a computer).
- Fixed 60 Hz step (accumulator on top of `requestAnimationFrame`).
- Ball–ball collision: elastic, equal masses; afterwards the speed is normalized back to constant. Damage cooldown of 0.3 s per pair.
- **Impact damage:** each ball hits for `damage × (0.5 + impact)`, where impact 0…1 is how directly it hit (head-on ×1.5, glancing ×0.5). This makes aiming meaningful and adds randomness to the outcome.
- Wall reflection: inversion of the velocity component + a random turn of ±0.3 rad (without it the balls fall into "orbits" and never meet).
- **Homing:** the ball smoothly steers toward the nearest enemy (1.2 rad/s). Without it, the balls met only about once every ~4 s and rounds ran into sudden death; with it, a round takes ~10 s.
- Randomness only through a seeded PRNG (mulberry32) — the simulation is deterministic and testable.

## Balls (6 at the start)

Base values: radius 30, speed 300 units/s, touch damage 12. All numbers are constants at the top of `src/balls.js`, tuned with the `npm run balance` script (each ball's average win rate is 39–54%).

| Ball | HP | Ability |
|---|---|---|
| Basic | 120 | None. Starter ball, free. |
| Leech | 90 | When it hits an enemy (4 s cooldown) it sticks to it for 2 s: moves along with it, drains 5 HP/s and heals itself by the same amount. |
| Cell | 85 | When it dies (once) — it splits into 2 mini-cells: radius 20, HP 30, damage 6, speed 320. |
| Train | 100 | First after 2 s, then every 4.5 s: rails appear where the enemy will be (1 s warning), then the train rushes through in 0.6 s — an enemy in the lane takes 22 damage. Doesn't hit its owner. |
| Ninja | 90 | Throws a shuriken at the enemy every `0.4 + 1.2 × (HP / maxHP)` s (the first after 0.8 s). Speed 500, damage 6. |
| Spider | 105 | When it hits a wall it leaves a web (radius 65, 5 s, maximum 3). An enemy in a web: speed ×0.4 and 7 HP/s. |

Ball model: data (HP, radius, damage, color) + event handlers `onWallHit`, `onEnemyHit`, `onTick`, `onDeath`. New balls are added with a single entry.

## AI

- Aims at the player ball's current position + a random angle error; the error shrinks as the ladder level rises.
- The enemy squad is assembled from the balls available at that level.

## Progression

- **Ladder** of 30 levels, by formula: level `n` → enemy HP ×`(1 + 0.05·(n−1))`.
- **Coins:** win — `20 + 2n`, loss — 5.
- **Shop:** a specific ball for a known price (Leech 100, Cell 150, Spider 150, Ninja 200, Train 250). No random chests.
- **Saving:** `localStorage` — `{coins, owned[], level}`.
- **Spectator mode:** you pick 2 balls, and both are controlled by the AI — for recording battle videos for TikTok/Shorts (that is how we bring players to the site).

## Ads (AdSense H5 Games Ads)

A single module `ads.js` on top of the Ad Placement API (`adBreak` / `adConfig`). Until AdSense approves the site — test mode `data-adbreak-test="on"`.

- With a placeholder ID made of zeros, ads work only on localhost (Google serves test videos); on a real domain — nothing, until a real ID is inserted.
- **Rewarded ads** (`type: 'reward'`):
  - revive a ball with 50% HP — once per match;
  - ×2 coins after a win;
  - try a locked ball for one match.
  The button is shown only if the API reported that an ad is available (`beforeReward`).
- **Between matches** (`type: 'next'`): not in the first 3 matches; Google additionally limits the frequency itself.
- **No banners.**
- **Halal (no code, in the AdSense console):** "Blocking controls" → sensitive categories: gambling/betting, dating, alcohol, etc.; general categories: credit/loans. Google does not guarantee 100% filtering — check via the "Ad Review Center".
- **GDPR consent:** via "Privacy & messaging" in AdSense, no code.

## Hosting and launch

- Static files on Vercel, own domain (to be decided at launch).
- Privacy policy page (`privacy.html`) — required for AdSense.
- AdSense account — 18+ only, so it is set up in a parent's name.

## Structure

```
index.html      screens (menu, squad selection, shop, battle) + canvas
style.css
privacy.html
src/sim.js      simulation: physics, rounds, squads, AI — no DOM
src/balls.js    ball definitions (data + handlers)
src/render.js   arena drawing on canvas, hit particles, screen shake
src/main.js     screens, input (aiming), loop, saving, i18n RU/EN
src/ads.js      wrapper over adBreak
test/*.test.js  node --test for sim.js and balls.js
```

## Tests

`node --test`, no dependencies. Deterministic simulation with a fixed seed:
wall reflection, collision damage + cooldown, each ability, round end, the winning ball carrying over into the next round, match end, sudden death.

## Done when

- A whole match is playable on a phone and a computer, at 60 FPS.
- A match lasts ~1–3 minutes.
- All 6 balls work and are covered by tests.
- Ads work in test mode at all three points.
- The site is deployed and available at a link.

## Not in v1

Online play, real-money purchases, cloud saves, sound, more than 6 balls, the Kazakh language. We will add them if the game takes off.
