---
# gstack: design-md-format=spec
name: BallBrawl
description: A chunky, toy-like Supercell-style browser game UI where every button looks like a physical piece you can press.
colors:
  primary: "#FFCC33"        # gold: the one main action (PLAY, Claim all) and coins
  on-primary: "#3A2500"
  surface: "#1E2742"        # panels
  surface-raised: "#2A3558" # buttons and tiles on a panel
  surface-edge: "#3A4870"   # the lit top edge of a panel (inset 2px)
  outline: "#0A0E1F"        # every outline and every solid bottom edge
  text: "#FFFFFF"
  text-muted: "#9DB0D6"
  success: "#36D27A"        # claim, owned, ready
  on-success: "#06301A"
  gems: "#B44CF0"           # gem prices and gem buttons only
  you: "#4CC9F0"            # the player's side
  foe: "#FF4D5E"            # the enemy, danger, red dots
  rarity-common: "#A9B8D0"
  rarity-rare: "#4C9EFF"
  rarity-epic: "#B05CFF"
  rarity-legend: "#FFB627"
typography:
  display:
    fontFamily: Russo One
    fontWeight: 400
    fontSize: 28px
    letterSpacing: 0.02em
  body:
    fontFamily: Nunito
    fontWeight: 700
    fontSize: 1rem
    lineHeight: 1.35
  label:
    fontFamily: Nunito
    fontWeight: 900
    fontSize: 0.6875rem
    letterSpacing: 0.03em
  numeric:
    fontFamily: Rubik
    fontWeight: 900
    fontSize: 15px
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  button-claim:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    rounded: "{rounded.md}"
  price-gems:
    backgroundColor: "{colors.gems}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.full}"
  red-dot:
    backgroundColor: "{colors.foe}"
    rounded: "{rounded.full}"
---

# BallBrawl

## Overview

**Creative North Star:** a Supercell game in a browser tab: chunky outlined pieces, one gold button that says "play", and the arena itself as the backdrop.
**Product context:** free browser auto-battler for kids 8-14 (balls with abilities fight in an arena), played mostly on phones, in 7 languages. Peers: Brawl Stars, Clash Royale, Clash of Clans, and the Roblox game Ball VS Ball.
**Mode per surface:** Experience (fights, chest opening, rewards) · Operate (lobby, shop, balls, quests, profile) · Persuade (none in game; the TikTok edits live outside).
**Reference sites:** supercell.com (Clash of Clans UI revamp, Oct 2026), Clash Royale UX breakdowns, Ball VS Ball (Roblox).
**Key characteristics:**
- Thick dark outline plus a solid bottom edge on every pressable thing; it sinks 3px when pressed.
- Gold means "press this". Green means "yours / take it". Red means "enemy / something waits".
- The current arena's sky is the page background; panels stay the same navy everywhere.
- Big numbers: HP, damage, trophies and prices are set in Rubik 900.

## Colors

**Strategy:** Full palette, and every colour has one job. Gold is reserved for the single main action on a screen and for coins; using it for a secondary button breaks the "gold = press" rule kids learn in Supercell games. Green is for claim/owned/ready, purple only for gems, cyan for the player and red for the enemy, danger and the red dot.
**Light or dark:** dark navy panels, because the game is played anywhere from a bright classroom to a dark bedroom and the arena art behind it is colourful; navy keeps the art and the gold button the brightest things on screen.
Rarity uses one set everywhere (ball tiles, skins, familiars, shop tiers, chest cards) through `--rar-*` tokens; a shop tier shows it as the 3px bottom stripe, a tile as its border.

## Typography

Russo One is the display voice: screen titles, section heads and big one-word calls ("ИГРАТЬ", "В БОЙ!"), uppercase. It has Cyrillic and Latin but no Kazakh letters, so any Kazakh text falls back to Nunito.
Nunito 700-900 carries all UI and body text, buttons and nicknames (it covers cyrillic-ext).
Rubik 900 is for numbers: counters, prices, HP, damage, timers.
All three load from Google Fonts in one request (`Nunito:wght@700;800;900`, `Rubik:wght@900`, `Russo One`, `display=swap`). Labels never go below 10px; prefer 11px+.

## Layout

Portrait phone first (a 9:19.5 column, max 430px wide); on wide screens the column stays centred and the side "wings" show deals and the commander, with the blurred arena behind.
Supercell rules: the main actions sit in the bottom thumb zone (PLAY row, chest slots, dock). One level deep: every page opens from the lobby or the dock and has one back button. Each screen shows only the currencies it can spend (the top bar holds coins and gems; no second wallet on a page).
The lobby keeps four side buttons, two per side (Quests, Commander | Leaders, Friends). Messages and settings live inside Profile. Skins open from a ball's card and the shop.
Spacing runs on a 4px step; touch targets are at least 44px, main buttons 48px+.

## Elevation & Depth

Depth is a hard offset, never a blur: `0 4px 0 outline` (5-6px on big buttons) plus an inset 2px `surface-edge` line on top. No zero-offset glows, no drop-shadow halos in menus. Popups sit on a dim navy veil (`rgba(15,31,56,.55)`).

## Shapes

Four radii: 8px chips and small badges, 12px buttons and tiles, 16px cards and panels, pill for counters, bars and chips; circles stay 50%. A nested inner radius is the outer radius minus the gap (a 3px border inside a 16px card gives 13px).

## Components

- **Buttons:** 3px outline, solid bottom edge, press = translateY(3px) with the edge shrinking to 1-2px. The PLAY button may use a hard two-tone lit band (no smooth blend); all other buttons are one solid colour. Disabled = 40% opacity, no edge.
- **Red dot:** only when something is waiting inside (a reward to claim, an unread letter or gift, a friend request, an affordable upgrade). One-time nudges (make an account) clear after the first visit.
- **Popups:** never full screen; a tap on the dim background closes them, the same as their Close button (the press must start on the background).
- **Empty states:** say how to fill it ("Win fights and chests land here"), one slim row, not four empty boxes.
- **Locked items:** say what unlocks them (trophies, arena, "from chests").

## Do's and Don'ts

- Do keep one gold button per screen.
- Do put an outline and a solid bottom edge on anything pressable.
- Do show numbers big, in Rubik.
- Do close popups on a background tap.
- Don't add a second currency row inside a page.
- Don't add a red dot that can't be cleared by visiting.
- Don't use gradients or glows on buttons and panels (arena art and the PLAY band are the exceptions).
- Don't add new radii; pick 8, 12, 16 or pill.

## Motion

- **Approach:** intentional
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** press(60ms) popup in(200ms) reward pop(400ms) chest open(700ms+)
- **The one authored moment:** opening a chest and the reward cards; everything else in menus stays quick.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-12 | Initial design system created | /design-consultation: Supercell-style toy UI (CoC revamp, Clash Royale), Ball VS Ball DNA, audit of the live lobby, shop and profile |
| 2026-10-12 | Lobby side buttons 6 → 4, Messages into Profile, Skins via balls and shop | Supercell: one level deep, less clutter around the arena |
| 2026-10-12 | One rarity colour set, four radii, no second wallet in the shop, background tap closes popups | Consistency and the Supercell layout rules |
