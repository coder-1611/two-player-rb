---
name: roster-injection
description: Convert a curated NFL roster .md into in-game Retro Bowl players (names, faces, position, ratings) installed at match start. Use when adding or editing any of the 32 team rosters in two-player-rb, or when touching player structs / TEAM_ROSTERS / applyCustomRoster.
---

# roster-injection — custom per-team rosters for two-player-rb

## Goal & status

End goal: every one of the 32 NFL teams has a **unique curated roster** — when a
player picks a team in the 2P lobby, the in-game players are that team's real
players (names, look-alike pixel faces, real ratings) instead of the engine's
random generations.

Source data: `/Users/sohamsthitpragya/Projects/rosters/<team>.md` (all 32 exist;
format documented below). Installed data: `TEAM_ROSTERS` table in
`two-player-rb/index.html`, applied by `applyCustomRoster()` at match start.

**Teams installed so far:** 22 San Francisco, 11 Pittsburgh. Remaining 30 are
added by following the Workflow section.

## Engine facts (verified against retrobowl.js, 2026-06-12)

### Player struct & write API
- A roster player is a GameMaker map/struct accessed BY ID. The engine's own
  accessors (all top-level globals, callable from the bridge):
  - `_Ai(p, 'field')` read · `_Yi(p, 'field', v)` write (retrobowl.js:76937)
  - Roster list: object 64's `_Ln` → `_wi(list)` length, `_zi(list, i)` element,
    `_8j(list, item)` append, `_aj(list, i)` delete, `_4j()` new list.
  - Get object 64: `var c=_si(64), o=null; for (var k in c){o=c[k];break;}`
- **Ratings are 4 fields, floats 0–10**: `skill`, `strength`, `speed`,
  `stamina` (UI shows ×10). Also `max_skill/max_speed/max_strength/max_stamina`
  (cap for training; set 10 for customs).
- **Position codes** (fn `_0v`): 1=QB 2=RB 3=TE 4=WR 5=OL 6=DL 7=LB 8=CB
  9=Safety 10=K 11=KP. Use 8 for both DBs.
- Other fields worth setting on customs: `age`, `condition` (0-100),
  `attitude` (0-100), `resting:0`, `injury_week:0`, `hof:0`.
- The engine's own full-creation generator is `_zH(_, t, pos, age, minR, maxR)`
  @58041 (sets ~70 fields incl. zeroed `stat_*`/`season_*`/`career_*`) — see
  Appendix.

### Roster list only ships ~5 players — APPEND the rest (V85)
The engine's roster list (object 64's `_Ln`) in this fork ships with only the
**offense skill players** (~5: QB/RB/WR/WR/TE) — the defense and kicker never
existed, so there was nothing to overwrite and they silently went missing.
`applyCustomRoster` therefore does two things:
- **i < current length** → overwrite the existing slot in place (`_zi(_Ln,i)`).
- **i ≥ current length** → **clone** a known-good player struct and append it.
  We do NOT build a struct from scratch (the card/profile renderers read ~70
  fields). Instead `appendClonedPlayer(st, 0)`:
  `var src=_fg2._Ue2(_zi(st._Ln,0))` → `var id=_du()` → `var dst=_fg2._Ue2(id)`
  → shallow-copy every own key (`for k in src: dst[k]=src[k]`) → `_8j(st._Ln,id)`.
  Every engine-expected field exists (copied from a live player); then
  `writeRosterPlayer` overwrites name/pos/ratings/face/age/etc. `teamid` is left
  as cloned (correct internal id). `randnum` (jersey #) is reset per slot so the
  clones don't all inherit the template's number. Idempotent across re-previews
  (only appends when `i ≥ length`, so the list caps at 12). The engine's roster
  screen auto-lays the 12 cards 6-per-row (offense row + defense/K row) and
  lights the DEFENSE star meter — no layout work needed.
  `_du`/`_fg2`/`_8j` are all reachable from the bridge (the MAX button already
  uses `_fg2._Ue2`).

### Rating-label mapping (VERIFIED @ retrobowl.js:69433-69470)
The UI relabels the same 4 fields per position. Roster .md columns map:

| Position | .md columns → engine fields |
|---|---|
| QB | Accuracy→`skill`, Arm Str→`strength`, Speed→`speed`, Stamina→`stamina` |
| RB | Speed→`speed`, Strength→`strength`, Catching→`skill`, Stamina→`stamina` |
| WR | Speed→`speed`, Catching→`skill`, Strength→`strength`, Stamina→`stamina` |
| TE | Catching→`skill`, Blocking→`strength`, Speed→`speed`, Stamina→`stamina` |
| K | Accuracy→`skill`, Kick Range→`strength`, Speed→`speed`, Stamina→`stamina` |
| DEF (DL/LB/DB) | Tackling→`skill`, Strength→`strength`, Speed→`speed`, Stamina→`stamina` |

### Faces (VERIFIED @ retrobowl.js:62950-63030)
A face = `(skin, face_y)` selecting a sprite sheet + `face_x` (0-7) selecting
the frame. **skin 2 = light, skin 1 = mixed/medium, skin 0 = dark** (sprite
names are authoritative; an early guess that 0=light was wrong):

| skin | face_y | sheet (8 faces each, face_x 0-7) |
|---|---|---|
| 2 | 0 | spr_light_001 |
| 2 | 1 | spr_light_002 |
| 2 | 2 | spr_light_003 |
| 1 | 0 | spr_mix_001 |
| 0 | 0–4 | spr_dark_001 … spr_dark_005 |
| 0 | 5 | spr_dark_006 (face_y 6 draws the same sheet — don't use 6) |
| 0 | 7 | spr_dark_007 |
| 0 | 8 | spr_dark_008 |

Contact sheets (4× scale, frames left→right = face_x 0..7) live in this skill's
`faces/` folder — **Read them when assigning faces** and pick the frame whose
hair/beard/look best matches the real player's headshot.

**FORBIDDEN (female-looking) faces — never assign to players:**
`mix_001[0]` (long blond hair), `dark_006[6]` (side ponytail),
`dark_007[2]`, `dark_007[6]`, `dark_007[7]` (long framed hair/braids),
`dark_008[7]` (hair accessory — avoid).

Quick reference of useful archetypes:
- light_001: 0 full dark beard · 2 chinstrap+slick · 3 bushy hair+big beard
  (Kittle-ish) · 4 thin goatee · 5 older gray · 7 neat clean-cut
- light_002 (blond/red): 3 blond+blond beard · 4 long flowing hair ·
  0/5 redheads · 6 older balding
- light_003 (brown): 4 short hair+full beard intense (Bosa/Watt-ish) ·
  3 man-bun · 6 shaggy mop
- mix_001 (medium): 1 red-brown beard smiling · 2 mohawk+goatee · 7 slick+beard
- dark_001: 0–3 red caps/headbands · 6 flat-top · 4/5 clean short
- dark_002: 0/3 long dreads+beard · 1 cropped+full beard · 4 dreads+goatee ·
  6 mustache+goatee smiling
- dark_003: 5 blond-tipped dreads grin (OBJ-ish) · 6 high-top fade+goatee ·
  2 big smile clean
- dark_004: all bald/shaved — 6 bald+BIG beard (Heyward-ish) · 2 bald smile
- dark_005: 3 dreads+full beard · 7 long dreads+goatee · 0 short+chin goatee
- dark_006: 1 short+full beard · 5 graying veteran · 7 blond-dyed+dark beard
- dark_007: 0 cap+beard · 4 slim cornrows · 5 curly top fade
- dark_008: 2 big afro+beard · 3 bald+big beard smiling · 4 spiky braid crown

Within one team avoid duplicate (skin,fy,fx); across teams duplicates are fine.

### Team UIDs (Teams.txt order — also the dropdown order)
0 Buffalo(bills) · 1 Miami(dolphins) · 2 New England(patriots) · 3 NY Jets ·
4 Denver(broncos) · 5 Kansas City(chiefs) · 6 LA Chargers · 7 Las Vegas(raiders) ·
8 Baltimore(ravens) · 9 Cincinnati(bengals) · 10 Cleveland(browns) ·
11 Pittsburgh(steelers) · 12 Houston(texans) · 13 Indianapolis(colts) ·
14 Jacksonville(jaguars) · 15 Tennessee(titans) · 16 Dallas(cowboys) ·
17 NY Giants · 18 Philadelphia(eagles) · 19 Washington(commanders) ·
20 Arizona(cardinals) · 21 LA Rams · 22 San Francisco(49ers) ·
23 Seattle(seahawks) · 24 Chicago(bears) · 25 Detroit(lions) ·
26 Green Bay(packers) · 27 Minnesota(vikings) · 28 Atlanta(falcons) ·
29 Carolina(panthers) · 30 New Orleans(saints) · 31 Tampa Bay(buccaneers)

## Where the code lives (index.html)

- `TEAM_ROSTERS` — table `{ uid: [12 specs] }` next to `TEAM_COLORS`.
  Spec: `{fn, ln, pos, sk, st, sp, sa, skin, fy, fx, age?}` (sk=skill,
  st=strength, sp=speed, sa=stamina; skin/fy/fx per face tables above).
  Canonical order: **QB, RB, WR, WR, TE, K, DL, DL, LB, LB, DB, DB**.
- `applyCustomRoster(st, uid)` — overwrites the existing roster players
  in place via `_Yi`; logs `[2P ROSTER] installed N custom players for uid U`.
- Call site: inside `startTwoPlayerMatch`, immediately after
  `applyHardcodedJerseys(st, userUid, oppUid)` and before `_Hj(STATE_MATCH)`.
  Each device installs only ITS OWN picked team (`userUid`); the opponent's
  roster lives on the opponent's device (matches the 2P stats architecture).
- Console check: `_rb2p_dumpRoster()` prints a table of the live roster.

## Workflow: add team X

1. Read `/Users/sohamsthitpragya/Projects/rosters/<team>.md` (12 players).
2. Map team → uid (table above). Note name quirks (commanders→Washington uid 19,
   49ers→San Francisco uid 22).
3. Convert each player's columns to `sk/st/sp/sa` with the per-position mapping
   (NEVER copy columns positionally without mapping!).
4. Assign faces: Read the `faces/*.png` sheets in this skill folder; per player
   pick (skin, fy, fx) matching their real look (skin tone first, then
   beard/hairstyle). Respect the forbidden list; no within-team duplicates.
5. Append the 12-spec entry to `TEAM_ROSTERS` in index.html, in canonical
   position order. Keep `fn` as initials/short first name and `ln` reasonably
   short (HUD shows "F.Lastname"; engine name pools cap at <8 chars/word —
   long lastnames may overflow UI, prefer ≤10 chars; "Odighizuwa" is the
   accepted worst case).
6. Ship per CLAUDE.md rules: bump V-label (`git rev-list --count HEAD` + 1),
   syntax-check all inline script blocks with node, commit, push, wait for
   both deploys (`until curl ... | grep V<N>` loop).
7. Update the **Teams installed so far** line in this SKILL.md.

## Verification

- Console after starting a match as the team:
  `[2P ROSTER] installed 12 custom players for uid <uid>` then
  `_rb2p_dumpRoster()` — names/positions/ratings must match the .md (via the
  mapping). Ratings in the profile UI show ×10.
- Visual: bottom name strip shows the curated player (e.g. "B.Purdy [QB]");
  profile/team screen shows the chosen faces; FINAL stats screen (V61) shows
  curated names.
- Regression: a team WITHOUT a TEAM_ROSTERS entry must fall back to the
  engine's default roster with only the `no custom roster for uid` log.
- MAX button still works (it writes the same `skill/strength/...` fields).

## Appendix: full from-scratch player creation (if ever needed)

The engine's generator `_zH` @58041 creates a struct (`_du()`) and sets, via
`_Yi`: `randnum, fname, lname, position, hof, age, skill, speed, strength,
stamina, attitude, contract, salary, creditcost, xp, xp_level, xp_gain,
skill_points, max_skill, max_speed, max_strength, max_stamina, condition,
injury_week, resting, signed_year, teamid, outtrade_pick, intrade_pick,
flash_time, meetingdone, scouted, skin, face_x, face_y` plus all of
`stat_*, season_*, career_*` counters (attempts, complete, yards, longest,
touchdowns, fumbles, int, sacks, tackles, rush_attempts, rush_yards,
rush_longest, rush_touchdowns, games) initialized to 0. Faces are normally
allocated by `_An1(_, t, player, grid)` @59384 from object-64 grids
`_kK/_mK/_nK`; we bypass that by setting `skin/face_x/face_y` directly.
Append with `_8j(object64._Ln, player)` after `_Yi(player,'teamid',uid)`.
