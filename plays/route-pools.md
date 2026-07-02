# Route pools — the complete set of possible plays

Source: `_361` (per-player setup) in `retrobowl.js` ~53521–53664. Each snap,
every eligible player rolls **uniformly** from his situational pool below
(`_m61(...)` = random choice). Situations checked, in order:

- **Hurry-up**: ≤ 15 s left in a half AND ball on own half (`_6F < 40`)
- **Long yardage** (WRs only): more than 10 to go (`_l61 > 10`)
- **Red zone**: `_6F > 40` (inside the opponent 10) — deep routes dropped
- **Lined up very wide** (WRs, y < 200 or y > 400): sideline-breaking routes dropped

## WR (positions 9/11, green arrows)

| Situation | Pool |
|-----------|------|
| Hurry-up OR long yardage | `slant, post, streak` |
| Very wide split + red zone | `slant, slant2, curl, dig1, dig2, dig3` |
| Very wide split | `slant, slant2, curl, dig1, dig2, dig3, post, streak` |
| Normal split + red zone | `slant, slant2, out1, out2, out3, curl, comeback, dig1, dig2, dig3` |
| Normal split (default) | `slant, slant2, out1, out2, out3, curl, comeback, dig1, dig2, dig3, post, corner, streak` |

**No-duplicate rule** (~53644): if another receiver already rolled a
slant-family route (`slant/slant2`) and this WR did too, he re-rolls from
`curl, dig1, dig2, dig3, post, streak`; likewise two dig-family routes
(`dig1/2/3`) re-roll the second one to `curl, slant, slant2, post, streak`.

## TE (positions 8/10, green arrows)

| Situation | Pool |
|-----------|------|
| Bumped inline (RB on his side) | **blocks** — `route_te_block`, no pass route |
| Hurry-up | `slant, post, streak` |
| 50% coin flip | `fb_1, fb_2, fb_4, fb_flat` (backfield-style short routes) |
| Otherwise | `flat, slant, slant2, out1, out2, out3, curl, comeback, dig1, dig2, dig3, post, corner, streak` |

## RB (position 2, white arrow)

| Situation | Pool |
|-----------|------|
| QB has a movement path (blue `route_qb` active) | `fb_1, fb_2, fb_3, fb_4` |
| QB stationary | `fb_1, fb_2, fb_3, fb_4, fb_flat, fb_flat2` |
| Kick plays | positioning path only (reuses dig2/post geometry) |

## QB (position 1, blue arrow)

- 50% chance per snap: sets up 2 yd deeper and takes **`route_qb`** (the blue
  dropback/roll path). Otherwise stationary (no arrow).

## Route name → path index (`_j61`)

| # | route | # | route |
|---|-------|---|-------|
| 0 | flat | 12 | corner |
| 1 | slant | 13 | streak |
| 2 | slant2 | 14 | fb_1 |
| 3 | curl | 15 | fb_2 |
| 4 | comeback | 16 | fb_3 |
| 5 | out1 | 17 | fb_4 |
| 6 | out2 | 18 | fb_5_notused |
| 7 | out3 | 19 | fb_flat |
| 8 | dig1 | 20 | fb_flat2 |
| 9 | dig2 | 21 | te_block |
| 10 | dig3 | 22 | qb |

## Audibles

`s_do_audible` (~56584): spends one audible (`_l51--`), plays the whistle,
and calls `_eb1(…, 1)` — the entire offense re-rolls from the pools above.
Nothing is preserved; an audible is a fresh draw, not a cycle through a list.
