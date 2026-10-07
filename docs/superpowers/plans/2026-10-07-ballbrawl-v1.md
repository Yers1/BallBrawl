# BallBrawl v1 Implementation Plan

> **For agentic workers:** executed inline in the authoring session (user asked to "do everything"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playable web ball-battle game (squad of 3, aim & launch, 6 ability balls, 30-level ladder, coins/shop, spectator mode) with AdSense H5 Games Ads hooks, deployable as static files.

**Architecture:** Pure, deterministic simulation (`sim.js` physics + `balls.js` abilities as event hooks + `match.js` squad/ladder rules) with zero DOM so it runs under `node --test`. A thin browser layer (`render.js` canvas drawing, `main.js` screens/input/loop/save, `ads.js` Ad Placement API wrapper, `i18n.js`) sits on top.

**Tech Stack:** Vanilla ES modules, Canvas 2D, `node --test` (Node 24). No dependencies, no build step. Static hosting (Vercel).

## Global Constraints

- No npm dependencies; `package.json` exists only for `"type": "module"` and `npm test`.
- Logical arena 400×400; fixed step 1/60 s; ball radius 28, speed 220, contact damage 10, pair hit cooldown 0.3 s.
- Sudden death after 30 s: `2 + floor(t − 30)` HP/s to every live object.
- Randomness only via seeded mulberry32 passed in the world.
- No random paid rewards: balls are bought for a fixed known price.
- Ads: only `adBreak` types `reward` and `next`; no banners. Reward buttons appear only after `beforeReward` fires.
- UI strings RU + EN only, chosen from `navigator.language`.
- Commits without a Co-Authored-By trailer.

## File map

| File | Responsibility |
|---|---|
| `package.json` | `type: module`, `test` script |
| `src/sim.js` | `createWorld`, `launch`, `step`, `hurt`, `rng`, constants. Physics, collisions, zones, shots, sudden death, outcome. |
| `src/balls.js` | `BALLS` defs (hp, color, price, hooks), `ORDER` |
| `src/match.js` | `createMatch`, `roundWorld`, `endRound`, `revive`, `enemySquad`, `enemyHpMul`, `winCoins`, `LOSE_COINS`, `LEVELS`, `aiAngle` |
| `src/render.js` | `draw(ctx, world, view)` + particles/shake from `world.events` |
| `src/i18n.js` | `t(key, vars)`, `lang` |
| `src/ads.js` | `initAds`, `offerReward`, `interstitial` |
| `src/main.js` | screens, squad/shop, battle loop, aiming input, results, save, spectator |
| `index.html`, `style.css`, `privacy.html`, `ads.txt` | page, styles, policy, AdSense seller file |
| `tools/balance.mjs` | headless AI-vs-AI win-rate matrix |
| `README.md` | run, test, launch checklist (AdSense, halal blocking, domain) |
| `test/*.test.js` | sim, balls, match |

## Interfaces (shared by all tasks)

```js
// sim.js
export const W = 400, H = 400, R = 28, SPEED = 220, DMG = 10, HIT_CD = 0.3, SUDDEN = 30;
export function rng(seed): () => number                       // mulberry32
export function createWorld({ seed, a, b, hpMulB = 1 }): World // a/b: { id, hp?, split? }
export function launch(world, angA, angB): void
export function step(world, dt): void                          // sets world.result: 0 | 1 | 'draw'
export function hurt(world, ent, amount): void
export function spawnBall(world, side, id, opts): Ent
export function foes(world, ent): Ent[]                        // live enemies
// World = { t, launched, rand, ents, shots, zones, events, hitCd, result, nextId }
// Ent   = { id, side, kind, x, y, vx, vy, r, hp, maxHp, speed, dmg, dead, mini, split, slow, cd, latch }

// balls.js
export const BALLS: Record<id, { hp, color, price, onWallHit?, onEnemyHit?, onTick?, onDeath? }>
export const ORDER = ['basic','leech','cell','spider','ninja','train']

// match.js
export const LEVELS = 30, LOSE_COINS = 5
export function enemySquad(level, rand): string[3]
export function enemyHpMul(level): number
export function winCoins(level): number
export function aiAngle(fx, fy, tx, ty, level, rand): number
export function createMatch({ squadA, squadB, hpMulB = 1, seed }): Match
export function roundWorld(match): World
export function endRound(match, world): null | 0 | 1 | 'draw'
export function revive(match): void
```

---

### Task 1: Simulation core

**Files:** Create `package.json`, `src/sim.js`, `src/balls.js` (stub `basic` only), `test/sim.test.js`

- [ ] Write tests: wall reflection keeps ball in bounds; head-on collision deals 10 to each exactly once (cooldown); sudden death drains HP on non-meeting lanes; lethal hit sets `result` to the surviving side; simultaneous kill → `'draw'`; same seed → identical state.
- [ ] Run `npm test` → fail (module missing).
- [ ] Implement `sim.js`.
- [ ] `npm test` → pass. Commit `feat(sim): deterministic physics core`.

### Task 2: Ability balls

**Files:** Modify `src/balls.js`; create `test/balls.test.js`

- [ ] Tests: leech latches on hit, drains foe and heals self, releases after 2 s; cell splits into 2 minis (r 18, hp 25) once, round continues; spider leaves web on wall hit (max 3), web slows ×0.5 and deals 3 HP/s; ninja throws a shuriken that deals 4; train telegraphs rails then deals 30 once to a foe in the band, never to its owner.
- [ ] `npm test` → fail. Implement hooks. `npm test` → pass. Commit `feat(balls): leech, cell, spider, ninja, train`.

### Task 3: Match rules

**Files:** Create `src/match.js`, `test/match.test.js`

- [ ] Tests: winner keeps its HP into next round; loser's front ball removed; empty queue ends match; draw removes both; cell survivors carry summed HP and `split: true`; `revive` restores lost ball at 50% and clears a lost result; `enemySquad` returns 3 ids from a pool that grows with level; `enemyHpMul(1) === 1`; `winCoins(n) === 20 + 2n`; `aiAngle` error at level 30 ≤ 0.1 rad.
- [ ] `npm test` → fail. Implement. → pass. Commit `feat(match): squads, rounds, ladder, economy`.

### Task 4: Battle in the browser

**Files:** Create `index.html`, `style.css`, `src/render.js`, `src/i18n.js`, `src/main.js`

- [ ] Canvas scaled to fit with devicePixelRatio; dark navy arena; balls with HP number + side ring + per-ball decoration; webs, rails, train, shurikens; hit particles, floating damage, shake on death; aim arrow.
- [ ] Pointer aiming: press → drag → release launches; enemy aims via `aiAngle`.
- [ ] Fixed-step loop with accumulator; round end → banner → next round or result.
- [ ] Verify in browser preview. Commit `feat(web): playable battle`.

### Task 5: Meta game

**Files:** Modify `src/main.js`, `index.html`, `style.css`, `src/i18n.js`

- [ ] Menu (coins, level, Play / Balls / Watch), squad picker + shop (buy fixed price, duplicates allowed), result screen (coins, next/retry), spectator mode (any 2 balls, AI vs AI, replay), `localStorage` save `{coins, owned, squad, level, matches}`.
- [ ] Verify full loop in browser. Commit `feat(web): menu, shop, ladder, spectator`.

### Task 6: Ads + launch files

**Files:** Create `src/ads.js`, `ads.txt`, `privacy.html`, `README.md`, `tools/balance.mjs`; modify `index.html`, `src/main.js`

- [ ] Ad Placement API snippet in `index.html` (`data-ad-client` placeholder, `data-adbreak-test="on"`).
- [ ] `offerReward(name, {onAvailable, onReward, onDone})`, `interstitial()`; localhost fake-ad fallback when client id is a placeholder; no offers elsewhere until a real id is set.
- [ ] Wire: revive on match loss (once), ×2 coins on win, try locked ball for one match; interstitial after every 2nd match from the 3rd.
- [ ] Balance script; tune numbers so no ball's average win rate is outside ~35–65%.
- [ ] README launch checklist. Verify, commit `feat: ads, privacy, launch checklist`.
