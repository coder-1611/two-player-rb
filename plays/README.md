# Retro Bowl plays — extracted from the engine

Reverse-engineered from `retrobowl.js` (`s_set_up_play` → `_eb1` at ~54900, the
per-player route assignment `_361` at ~53521, and the path resource table
`_S1` at ~16314). Verified against a live match: instance dump + screenshot
matched the assignments below.

## There is no fixed playbook

Retro Bowl doesn't select from named plays. **Every snap, each eligible
player independently rolls a route** from a position-specific pool, filtered
by game situation. A "play" is the combination that comes up. The **audible
button** (`s_do_audible`) simply spends one audible and re-runs the whole
setup — a full re-roll of everyone's routes.

## Arrow color legend (verified in-game)

| Color | Meaning |
|-------|---------|
| **Green** | WR / TE pass routes — each receiver rolls his own route, which is why the green arrows all differ |
| **White** | The RB's route out of the backfield |
| **Blue** | The QB's own movement path (dropback/roll, path `route_qb`) — the blue ring marks the QB |

Offensive linemen have no route (they block).

## Formation (per snap)

Scrimmage = `x`; ball spot = `y` (engine units; **20 units = 1 yard**).

| Slot | Position | Alignment |
|------|----------|-----------|
| 1 | QB | 5 yd behind the line; **50% chance** he instead sets 2 yd deeper and takes the `route_qb` path (blue) |
| 2 | RB | 50%: stacked behind the QB (I-form, ±1.75 yd); else offset back ~6.75 yd at ±0.85 yd or wide |
| 3–7 | OL (C, 2G, 2T) | On the line at y ±0.75 / ±1.5 yd |
| 8, 10 | TE | On the line, ±3 yd outside the tackles. If the RB aligns to his side, the TE bumps inline (±2.25 yd) and **blocks** (`route_te_block`) |
| 9, 11 | WR | Split wide, ±5–6 yd (±6–8 yd if the split would cross the hash) |

## The routes

23 path resources exist (see [plays.json](plays.json) for raw waypoints, and
[routes/](routes/) for one doc per route with yardage + shape):

`route_flat, route_slant, route_slant2, route_curl, route_comeback,
route_out1..3, route_dig1..3, route_post, route_corner, route_streak,
route_fb_1..4, route_fb_5_notused (unused), route_fb_flat, route_fb_flat2,
route_te_block, route_qb`

Which pool each position rolls from — including the red-zone, hurry-up, and
no-duplicate rules — is in **[route-pools.md](route-pools.md)**. That file IS
the complete list of possible "plays".

## Notes

- Routes are stored un-mirrored; the engine flips them laterally depending on
  which side of the formation the player lines up.
- On kick plays the RB reuses the `route_dig2` / `route_post` path geometry
  for positioning (engine shortcut, not a real route).
- The audible button instance is only created when audibles remain
  (`controller._l51 > 0`, granted by the OC's skill).
