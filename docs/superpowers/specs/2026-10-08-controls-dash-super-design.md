# BallBrawl v2.1 — in-battle controls: dash + super

Sub-project 1 of 4 (next: balls/skins/gamification → graphics → online).
Problem: the player aims once and after that only watches. Goal: to influence the battle the whole time.

## Dash

- Tap/click on the arena during a battle → all live balls on your side dash toward that point.
- Boost: speed ×2.2 for 0.35 s, homing disabled, a hit during the boost deals damage ×1.5 (ram).
- A Leech stuck to an enemy detaches when it dashes.
- Charges: 3, one is restored every 2.5 s. No charge — the tap is ignored.

## Super

- Meter 0–100 per side. Took damage → +0.8×damage for yourself; dealt damage → +1.2×damage. Sudden death does not build the meter. New round — meter back to 0.
- Full → SUPER button (and the spacebar). It triggers on the side's first live ball, with the nearest enemy as the target.

| Ball | Super |
|---|---|
| Basic | Ram: boost ×3 for 0.6 s straight at the enemy, hit ×2 |
| Leech | Leap: instantly sticks to the enemy for 3 s, drain ×2 |
| Cell | Split: 2 mini-cells right away, the cell itself does not die |
| Spider | Trap: web r 80 under the enemy for 3 s, slowdown ×0.25 |
| Ninja | Fan: 7 shurikens in a fan of ±0.6 rad |
| Train | Express: a train through the enemy's position, 0.4 s warning, damage 30 |

## Commands and determinism

- `act(world, side, {type:'dash', x, y} | {type:'super'})` is applied between steps and written to `world.log` with the frame number `world.tick`.
- Same seed + same log on the same frames = same battle (test). This is the foundation of the future online mode: only commands go over the network.

## AI

`createAI(side, level)` → `think(world, dt)`, called every frame. `skill = (level−1)/29`.
- Dash: once every `3 − 2.1·skill` s (± randomness) toward the enemy's predicted position, with an error of `(1−skill)·60`.
- Dodging the enemy train's rails if `skill > 0.3`.
- Super: `2 − 1.7·skill` s after the meter fills.
- Spectator mode and the balance script: AI on both sides.

## Interface

- Under the arena there is a panel: on the left 3 lightning bolts (charges, the next one shows its progress), on the right a round SUPER button with a circular fill, which glows when ready.
- Effects: a trail during the boost, a ring at the tap point, a shockwave + the super's name when it triggers.
- Tutorial: in the first 2 matches the hints "Tap the arena — dash" and "Super ready — press it!".
- Ball cards show both the ability and the super.

## Tests

Dash (charge, direction, regeneration, ×1.5), meter (builds up, not from sudden death, super only at 100, reset), each super, replaying a battle from the log, the AI uses dashes and supers, balance 35–65% with the AI.

## Order of work

1. sim: boost, charges, meter, `act`, log + tests.
2. balls: `onSuper` ×6 + tests.
3. ai.js + tests, balance script with the AI, tuning.
4. UI: panel, input, effects, hints, i18n, cards. Check in the browser.
