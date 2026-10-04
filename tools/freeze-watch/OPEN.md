# Freeze-watch — open items

Known problems that are not fixed yet, from the detector audit of 2026-09-30 (V426). Every run reads this list. When
a run fixes an item (same gates as any fix), it moves the item to **Done** with the version and the evidence. When a
run finds a new root it cannot fix today, it adds it here with the rooms that show it.

Order = what to take first when the brief has no new freeze to work on.

## 0. Horn-adjacent roots found by the 2 Oct 6 pm sweep — for the owner's horn session (do not change the horn code from a run)
The owner's 6:10 pm note froze the quarter-end code while V434's C10 is proven. These three need that code:
- **a, b: DONE in V441** (see Done) — a run's start writes the snap record; POST-CONV's live-play guard runs; V394's
  retype only for the try's own drive end.
- **c. The halftime free down at the 2 (DBBS, TYHC real; CGQB, URBW harmless)** — V434 C10 addresses it; confirm in real
  games (#4). The Q3-law flip at ~13688 still has no live-ball check (URBW snapped 0.4 s after the horn).
- **d. The wall's MISSED on a normal touchdown's try AT the Q1/Q3 horn can leave both phones waiting (harness, live
  V434-code build, `proof/m6q3-live.log` of run 1804).** `HORN_Q=3 HORN_KIND=td`: a's TD at Q3 0:01, its 1 PT kick never
  launched under load, the wall shipped its synthetic PAT_RESULT (the branch keyed on `patDutyMine`, which C11 sets for
  every try) and parked a; b's P6-WATCH did not force a drive at Q3 0:01; 35 s later both waited at Q3 0:01. Mid-quarter
  the same branch is rescued 4 s later by b's P6-WATCH (RVLS 08:40.7). Read the branch for a normal touchdown at the horn
  (the post-conversion kickoff — C13 — is what should follow, not a PAT_RESULT). V438 makes it rarer (the wall waits 20 s
  from the player's last press) but does not change it.

## 1. Leftovers of the reload-ball resume (V430) after V438 fixed its input (V438: committed, not shipped yet)
V438 fixed FXTE's root (Done, below): the resume read a WAITING snapshot from before the hand-off. What is left:
- **A hand-off taken again in the NEXT game (QFJK, 2 Oct 2:35 pm, V433, harmless; VZLC, 2 Oct 8:17 pm, V435, the same,
  harmless) or after the final (ATUZ, 9:15 am, neutral).** V452 removes the route both took (the READY guard's
  reload); the take-again can still be reached by #3's second route. Harmful variant to test for: the joiner is B and
  game 1's last hand-off went A → B within 120 s — B would take the ball while A kicks off as the opening receiver. QFJK's A reloaded into game 2 through the resume and took game 1's TD again (A was game 2's opening
  receiver anyway, so nothing changed). Never take a hand-off again — or apply one — once this game's `final` is on
  record, or when the hand-off's game is not the one being resumed (the flow record's `gid`).
- **Both records stale** (a throttled tab whose 500 ms live push also lagged — V430's original theory; not shown in any
  room read so far: FXTE's live record was fresh, A's mirror followed it): then the take-again still fires. If it ever misfires again, guard it with the
  tab's flow record (`staged === lo.ts` and a settled spot `spot.via === 'settle'`, `spot.stg === lo.ts` = played on).

## 2. IJYB: a rematch that BOTH phones started carried game 1's score, and its first hand-off never arrived (missed by the checker)
- **What happened (IJYB, 2 Oct 11:24 am, V431):** game 1 ended 42-40 (final 15:04). Both pages reloaded at 15:23.9 and
  resumed into the FINISHED game (`FLOW restored … ep H`, "final soon", a second `final` at 15:32). Then B reloaded again
  and both logged `game` within 0.3 s (A ms …352 at 15:41.8, B ms …571 at 15:42.1) — two starts, not a start and a
  join. A's new game was floored to the old score (`SCORE-FLOOR 0-0 -> 42-40`, 15:41.9), A drove and scored (48-40,
  then 50-40), and shipped a KICKOFF at 16:47.2 that B never logged receiving; B's record said `game ids differ` the
  whole time (`FLOW restored from this tab pending ep K0`). B sat on "waiting" on screen 77 s and left (16:59.5).
- **Detector:** R-POSS saw 13 s of it; R-FREEZE counted nothing — a `send` deletes the open both-waiting interval and
  only an act/vis event reopens it, so a send that never lands excuses the rest. R-REOPEN needs ONE starter.
- **The score part, read on the timeline (run 20261003-1500):** A's page booted at 15:23.9, resumed into the FINISHED
  game (`FLOW restored … ep H`, `score 42-40 q=5`, `final` 15:32.2), and at `15:41.8 a game` started game 2 from that
  same page — no boot, no bind in between. The V346 floor (index.html ~7238) re-arms only when its 100 ms sampler sees
  the engine OUTSIDE the match room ("a genuine rematch passes through the lobby"); a page resumed into a finished game
  stays in the match room, so the floor still held 42-40 and `15:41.9 SCORE-FLOOR 0-0 -> 42-40` put game 1's score on
  game 2. **Fix plan:** re-arm the floor at the game boundary, not on a sampled room change — key it to the game
  (`_rb2p_matchStartMs`, or the engine's match instance) so a new game starts at 0-0. Mind the race: a plain reset in
  `startMatch` can be re-raised by a 100 ms tick that still reads the OLD match's 42-40 before the engine builds the
  new one. Test: game 1 to the final, reload one phone into the finished game (stats screen), start game 2 from it:
  game 2 must start 0-0 on both (live build: 42-40).
- **Questions (read before fixing):** why did both phones start (both READY, or the V266 guard, #3)? Why does the score
  floor (index.html ~7238) carry a finished game's score into a new one (it has no game boundary — see above)? Why did B drop A's
  KICKOFF (B's `matchStartMs` vs A's ts, or the "pending" flow record)? V432's `flow-stale` reset does not cover two
  starters. Tied to #3.

## 3. DONE in V452 (see Done) — the V266 READY guard no longer reads the partner's "left" beacon as "mid-match"
- **Still open from #3: the second join route (JCTW 3:07 pm, TYHC 9:41 am):** a page that reloads 1.6–3 s before the
  partner's start resumes into the FINISHED game (Q5, stats screen) while the partner plays game 2 (the starter's
  beacon was 80 s old — not the guard). B only joined after another reload. Read why tryRestore's `inProgress` holds
  for a finished game there (`flowLive`? `oppFresh`?) before changing it.
  - **Lead (run 20261003-1500, JCTW timeline, not yet tested):** B's page reloaded at `20:07.4` (its third page since
    the final; the second had resumed into the finished game at 19:18.0). A had pressed READY and was waiting. B's new
    page bound at `20:10.5` — `FLOW restored … ep H`, the "final soon" cover — and **A's `game` is at the same
    `20:10.5`**. The resume re-claims a seat that onDisconnect removed with `ready: inProgress ? true : false`
    (index.html ~17228, the slot transaction), and `inProgress` was true for the finished game; V428's
    `clearMySeatReady('kept from an earlier page')` runs only after, in `enterRoom`. In between A saw two READY seats,
    and A's start was its own READY (V428's rule holds on A's side), so A played game 2 alone (snaps 20:13.5, 20:27.3)
    while B sat on game 1's stats cover. Test first: game 1 to the final, A in the lobby READY, B reloads into the
    resume → A must not start. Candidate fix: the reclaim writes `ready: false` (a page's READY is only ever its own
    press, V428) — read what else reads the reclaimed `ready` before changing it.

## 4. Audit V434's horn law in real games (the first 24 hours after the release)
- V434 ends every quarter through the engine's own time-up (FREEZE-LEDGER.md V434, `~/Projects/two-player-rb/.rb2p/research/HORN-RESEARCH.md`
  §5.2). Read every firing: the diag `HORN Qn — a drive staged by L<line> at 0:00 ends the quarter here` and the audit
  `guard {what:'horn', q, why}`.
  - **Stop the line** if a horn's next period went to the wrong team (Q1/Q3: the team with the ball after the last down;
    halftime: Team B; Q4: the final, or the flip on a tie). Revert C1–C3 the way V432 reverted V430.
  - `why` other than "a hand-off" (a rescuer staged at 0:00) should be rare: read each one.
  - `SEND horn at Qn 0:00 — the partner is on V4xx: it gets the old 0:01` = a mixed-build game (expected for a day).
  - `guard ot-try-wait` followed by an OT flip more than 30 s later: read it (C6's hold, capped at 120 s).
  - **V436:** every `guard post-conv-handoff` must come from the scorer whose try was its last play before the horn
    (no `send`/`apply` between its d=6 snap and the quarter change). QAQL 19:40/19:47 (V435) were receivers — the field
    mirrored (−32 / +46 yards). Check whether R-YARD flagged QAQL; if not, the checker misses a mirrored first snap
    after a quarter change (the first snap's y = −(the last hand-off's y)) — add it.
- **Checker rules to add** (whole-archive diff first, only intended verdicts may move): R-HORN-EXTRA (a snap in quarter
  *n* by the receiver of a hand-off sent `Qn 0:00`: the extra play; ≈141 in the buffer era, 0 expected after),
  R-HORN-RESTAMP (a drive end at `Qn 0:00` sent with another quarter or clk > 0), R-HORN-SPOT (Q1/Q3: the receiver's
  first snap of Q*n*+1 is not at the hand-off spot on 1st & 10). Spec: HORN-RESEARCH.md §5.2.
- **Prove C10 (the halftime try) with a real touchdown.** `horn-last-down.js td` at Q2 never scores: the harness writes
  the quarter, which skips the engine's direction switch (`_Sc1`), so the goal-line run goes backwards. Reach Q2 through
  a real Q1 horn (a real down at Q1 0:01 with no possession change: the engine's own case 19 runs `_Sc1`), then stage
  the touchdown at Q2 0:02. Must hold: the scorer's try, then Q3 with b receiving and the scorer never snapping in Q3
  first (R-HALF / METB).
  - V435 does that (`HORN_Q=2 HORN_KIND=td`: the real Q1 horn works), but the dive from the half-yard line at Q2 0:02
    was stopped in 12 of 12 attempts (Q1: 1 of 1 with the same EASY setup). Find why the Q2 goal-line run never scores
    (a pass into the end zone? the engine's end-of-half defense?) — or read C10's firings in real games instead
    (`HORN Q3 law: the try was played before the horn`).
- **Run 20261002-1804 (read at 21:15):** 3 real games on V434/V435 since 18:03 — QAQL (7:36 pm), VZLC (8:03 pm), ZCEX
  (8:42 pm, V436/V435). 9 horn firings (Q1, Q2, Q3, Q4 ×2, the Q3 law's "try played before the horn"), every one followed
  by the next period by rule; the two Q4 horns went to the stats screen. No frozen interval in any of the three, all
  three reached their final. QAQL's two `post-conv-handoff` firings on the RECEIVER are what the owner's V436 fixed.
- **MROY (2 Oct 2:40 pm, V433) is FGXJ's shape — watch it on V434+:** a pick-six at Q4 0:00 tied it 20-20 before its try;
  A (the scorer) missed the try; OT armed and the flip named A, but the stale pick-six duty refused A's OT kickoff ten
  times (`P6 refused force-drive — the scorer owes a PAT_RESULT`, `OT kickoff staging failed — retrying (1..10)`); A then
  pressed the engine's own post-try kickoff button, which handed B the first OT possession against the flip, and A sat
  on an empty field 11 s (counted, temporary) until TURN-HEAL parked it; FIELD-CHECK shipped a synthetic PAT_RESULT at
  14:24.9. V434's C6 clears that duty at the OT kickoff (`_rb2p_applyOtKickoff`) and holds OT while the try is owed. Any
  `P6 refused force-drive` in Q5 on V434+ means C6 did not cover it.
- **The halftime free down at the 2 (#0c):** DBBS and TYHC (2 Oct, V431) lost points to it; C10 should end it. R-GIFT
  on a V434+ game at the Q2 horn = C10 did not hold.

## 5. The horn law's two specified follow-ups (HORN-RESEARCH.md C11, C12)
- **C11:** a horn record that arrives after the receiver's quarter already ended must not lower its quarter (the apply
  writes the quarter absolutely, 16 ms until V323 pulls it forward; YGJM#2, BHOU#1, EMNP#1). Decide it by the period
  rule for Q*n*+1 instead.
- **C12:** a safety on the last down of Q1/Q3 gives the next quarter's ball to the CONCEDING team at its goal line
  (`_rb2p_scoredSinceCapture` only compares the holder's own score). Void the keep on the opponent's score too, and hand
  the free kick off the way POST-CONV does. Read the engine path first; test through a real safety.

## 5b. The freeze measure misses stalls other rules see (V437: 51 rooms read FROZE · NOT TIMED)
- R-POSS DEADLOCK with **no measured interval at all**: DWJE (V422, both waiting 24 s), ELKO (V431, 15 s), ELTR, JDZQ
  (x7), DCCV (16 s), KVOP (20 s x3); R-P6 conversions never resolved (CRTI, DQJI, GXFI, HEIG, MFTC); hand-offs never
  received while the receiver drew frames (FABY, JMUK, QCLM, TDWD, WMCM, AWCI, FVTL, IJYB, VWEI).
- Read each on its timeline: either the can-act monitor missed a real freeze (fix the `act` entries or the interval
  rules, then the card shows its seconds) or the stall rule is wrong (lower its grade). Whole-archive diff either way.
- **Read by run 20261002-1804:** ELKO (and XRDX, MCKV, NQFD, RCMA) — the waiting phone was hidden; R-POSS checks
  "hidden" only when it fires and `OUTCOME drained` clears it while still hidden → the stall rule is wrong (#10).
  IJYB — a real 77 s stall (#2): a send that never lands ends the both-waiting interval.

## 6. DAXK: a reload during an overtime try ends the game early (still in the code)
- The try's duty record survives the reload; the resume replays it as a synthetic `type:'PICK6'` outcome, and in OT a
  pick-six is a walk-off win (`_rb2p_otWalkoffDefensiveTd`) — the game ended 30-24 with A's answering possession
  unplayed. Fix: mark the replayed outcome (`resumeRepop: true`) and skip the OT walk-off for it. Test: B scores an OT
  touchdown by real play, reloads before choosing; no FINAL, the choice re-shown, a real 2 PT tap, A then plays.

## 7. NERM: the hand-off lives only in the sender's memory for the 4 s pick-six hold
- A laptop that sleeps inside the hold strands the partner (the hand-off reached the server 15 minutes later). Fix:
  skip the hold when no pick-six can follow (`_rb2p_driveTurnoverDeltas()` known with intDelta + fumDelta === 0, no
  turnover stamp this drive, no opponent TD replay < 15 s). Risk: a turnover whose stat lands late would ship as OTHER
  first (the OKAG double record; V352's duplicate drop is the backstop). Test with CDP `Debugger.pause` on the sender.

## 8. IEID / WVLK: the engine throws on every frame from the lobby (2 rooms of ~2,500; one pair of new players)
- "undefined is not a valid map reference" every frame, from before the match start on both phones: the match never
  started, the players left (twice). V430 logs the engine's full error (`engerr` audit entries) — read them on the next
  occurrence to find the trigger. Optional guard: disable READY while the engine throws every frame (never start a
  game on a broken phone; the partner is not dragged in) — a lobby change, needs its own test.

## 9. Unanswered taps are not a freeze yet
- Since V426 taps are logged on every device (`tap … p=mouse` on Chromebooks), and since V430 a visible page writes a
  clock sample every 15 s (a heartbeat). The `act` monitor's "taps unanswered" is still soft (never counted).
- Next: measure on V430+ games — ≥4 taps in 10 s on a must-act, on-screen phone with no progress — against stuck-scan;
  only then count it (a new interval kind, with a whole-archive diff). Also count a reload while must-act and unable.
- **New evidence (V431):**
  - NQFD 28:49–29:07: a Chromebook on 4th down tapped 7 times in 17 s while its page drew almost no frames
    (`hold 9082ms 11f <-- rAF SUSPENDED`). The player left. The checker counted nothing.
  - ACWF 18:51–19:02: 3 taps on a scrolled page (offset 194,220 came back every 10 s after `scroll healed`), and the
    4th tap snapped.
  - OLOI (1 Oct 10:04 pm) B: 9 taps in 16 s on a page scrolled by 59 px. Every press registered only as a `hold`, and
    the 10th snapped. `scroll healed` ran every ~10 s, but the offset came back each time.
  - **2 Oct (V431):** FTJY B (1st & 10 after a kickoff, 3 touch taps) and KEIF B (4th & 7.6, 2 mouse clicks) tapped near
    GUI (150–210, 100–130), upper left, where nothing answered. Then a tap in the middle snapped (6–12 s lost). FTJY's
    player later sent "Taps / drags don't work" (after two interceptions; every snap tap had worked). Find what is drawn
    there that looks tappable. Also EXAZ B: a tap on a page scrolled by (221,87).
  - The scrolled-page taps (ACWF, OLOI) are worth a root of their own: find what re-scrolls the page and where a press
    on a scrolled page lands in game coordinates.
  - **LDVA A (2 Oct 12:45 pm, V431) — a real stall the checker missed, the clearest case yet:** a visible Chromebook page
    drawing 2–8 fps with a full field (`hold 535ms 2f <-- rAF SUSPENDED DURING HOLD`) for ~88 s, 17 clicks in that time
    that got nothing; the snaps came only on later clicks, two snaps were never logged at all. It began when A came back
    from a 26 s hide (VIS-KICK burst, `ENGINE LOOP DEAD — kicking _fi5 (kicks=43)`, TURN-RESCUE applying a held PICK6 at
    09:05.6); fps was 34–61 before and 2–26 after, cause not shown. The game was abandoned at Q2 1:12. The act monitor
    reports "no frames drawn" only at fps 0 and "taps unanswered" is soft, so R-FREEZE saw two 3.5 s near misses. Other
    visible full-field stretches under 12 fps for >20 s on 2 Oct (leads, not read): NQFD A +1721 s, XRDX B +1073 s, YNKU B
    +1187 s, Z5GB A +52 s (448 s), Z6BZ A, Z9NX A. This is #11 and #9 together: count "must act, on screen, < 10 fps,
    taps unanswered" as stuck.

## 10. The detector under-measures a refusal stall
- ZQMT's real freeze was ~13 s on B (refused LIVE → behind the waiting cover) but the act monitor only reported "both
  parked" on A (9-11 s). A `wait refused` audit entry followed by both phones parked is the stuck state; count it from
  the refusal. (V430 fixed ZQMT's cause — the OT kickoff waits for the partner.)

- **More detector findings (run 20261002-1804):**
  - **FQNK (2 Oct 3:20 pm) was a network outage, counted as a freeze.** A's socket was down 1:37–2:14 and its REST
    uploads landed only twice in that stretch (114.1 s and 133.6 s, backlog 15); B was offline 2:15–2:19.6. The V430
    "no network" rule needs no upload in the window AND a backlog of 20+ — A's quiet page queued only 15. Better test:
    an upload whose oldest entry waited > 8 s (the batch's `srv` against the entries' `t`) means no network.
  - **The sender's delivery watchdog fails silently** (index.html ~18240): its REST look at the server is `.catch(function
    () {})`, and `fbRestPut`'s failures in the FB-STALL path log neither "ok" nor "FAILED" when fetch throws. FQNK's A
    shows no line for ~25 s of failed re-sends. Log them like V430's `OUTCOME-POLL failed`.
  - **IJYB** (#2): a send that never lands ends a both-waiting interval for good.
  - **R-POSS "DEADLOCK" flags today (ELKO, XRDX, MCKV, NQFD, RCMA) are artifacts:** "hidden" is checked only at the moment
    the flag fires (often just after the phone came back), and `OUTCOME drained` clears hidden while the page is still
    hidden. R-FREEZE excused all five correctly (the waiting phone's own monitor said hidden).
  - **R-GIFT / R-P6 checker artifacts (8 flags in 7 games):** R-GIFT does not close its window at Q3 (Team B's ball by
    rule) or Q5 (the OT flip); R-P6's "resolved" test ignores a change to Q5, a `final`, a `SEND TD/KICKOFF` diag, and a
    page close (RDDK, TYHC, VCUH "played but never resolved" were all played and missed).
  - **stuck-scan:** end COVERED at `final` (GOPA, IEYC, NQSG, PKXS, QFJK, URBW were the "final soon" cover); a phone whose
    stream ended is gone (DCHO, RPLL "BOTH-LIVE 21 s" — A's stream had ended 14.5 min earlier); start STUCK-LIVE at the
    first unanswered tap, not the last progress; count `CONV try started` as progress.

## 11. Low frame rate
- A separate "degraded" measure: a phone that owes the move at <10 fps for >10 s (XAMX, ZZZX, LMUM). Not a freeze.

## 12. The page reloads itself on a lost graphics context
- `glLostRecover` reloads the page when the WebGL context is lost (once per 45 s) — against the owner's "no
  auto-reload". It never fired in the cases read; a lost GL context cannot draw again otherwise. Decide with the owner.

## 13. The conversion wall's screen-on rule leaks after a long hide (UKMX, NQEV)
- V395 counts the wall on SCREEN-ON time: `patOwedSinceMs` resets only when the check runs while the tab is hidden, and
  a hidden tab's timers run rarely. UKMX B (hidden 115 s from before the offer) and NQEV B (97 minutes asleep) had the
  wall fire 1 s after the tab came back — the player never saw the choice. Fix: when the tab becomes visible, or after a
  gap of more than 2 s between two looks, set `patOwedSinceMs = now - min(elapsed on screen, 25 s)`. Low risk (only the
  wall waits). Test: v395-hidden's setup with the hide starting before the offer.

## Owner decisions (do not act on these without the owner)
- **The defense difficulty defaults to MAX** (`_rb2p_difficultyPref`, the lobby's "DEFENSE DIFFICULTY FOR BOTH
  PLAYERS"). A player wrote "get df off max" (RWDK, 2 Oct 11:18 am) after a sack and two incompletions ended
  their drive. Players can change it in the lobby, but most never do. Lowering the default is the owner's call.
- **Database storage:** the free plan allows 1 GB, and the database is at about 293 MB and grows 30–50 MB a day,
  because rooms are never deleted. It fills in about 2–3 weeks.
  - **Options:** the Blaze plan, or archive old rooms' audit streams to disk and remove them from the database.
  - The owner's rule is "never delete rooms", so the owner must choose.
  - Until then, add nothing that grows the database much (see item 5).

## Done
- **V452 (run 20261003-1500; shipped by the owner's session with RUN IT BACK) — OPEN #3: a rematch READY reloaded into a resume because the partner's page
  said it LEFT** (QFJK, VZLC, OKYW; 26 rematch joins in the archive with the starter's beacon under 18 s old). The
  guard took the V403 pagehide beacon (`vis:'X'`) as "mid-match", and its "fresh final" exemption never holds for the
  phone that went back first (its own lobby page deletes the partner's final as a leftover, ~17835). Now `X` is not
  mid-match when this tab's own flow record says its last game here is final (`guard ready-left`); otherwise the guard
  is unchanged, and a guard reload carries its read to the resumed page (`guard ready-reload`). `e2e/v449-ready-left.js`:
  live L1–L3 FAIL (A reloaded), V452 4/4, control (a fresh tab) still reloads. FREEZE-LEDGER.md V452.
  **Next runs: audit it** — every `guard ready-left` must be followed by a `game` entry on BOTH phones within ~15 s and
  no `taking it again`; every `guard ready-reload` is the guard's read on a real reload (read `vis`, `age`, `tabFinal`).
- **V441 — the blue circle** (the owner: "sometimes just clicking on the blue circle didn't work";
  ~/Projects/two-player-rb/.rb2p/research/BLUE-CIRCLE.md): a left mouse press arms the tap latch (a Chromebook tap-to-click shorter than a frame
  was lost: e2e/blue-circle.js T1 V440 0/3 → 3/3); _m01/_o01 divide by the display scale; the landscape-phone dead zone
  and the rotated-phone offset were already gone with V440. Still the owner's call: a bigger hit circle (26 px, 10 px
  up the body — tested, not shipped).
- **V441 — OPEN #0a** (a 2-pt RUN try invisible to "try snapped"; POST-CONV's live-play guard never ran) and **#0b**
  (V394 retyped a new drive's turnover as the try's kickoff: e2e/v441-retype.js V440 0/2 → 2/2).
- **V440 — phones/iPads never rotated; the whole game on screen; "turn your device sideways"** (e2e/v440-orientation.js).
- **V439 — FXTE and the conversion wall** (your run 1804's V438, shipped by the owner's session).
- **V438 (run 20261002-1804; committed on branch `auto`, NOT shipped — the next run gates and ships it) — FXTE's root (was #1): a resume after taking the ball read a WAITING snapshot from before the hand-off.** The
  resume prefers the stable snapshot (V197, `snap/<role>`) over the live record whenever it is under 25 s old, but the
  snapshot is written only while waiting or at the controller's kp 1 beat, which the 500 ms sampler almost never sees on
  offense. Measured in the harness: 22 s after taking a punt and playing a down, the server's snapshot still said
  "waiting" (22.6 s old) while the live record said 2nd & 1 with the ball. FXTE's B pushed its live record all along
  (A's mirror followed B's quarter change after B's ACK), so only the snapshot can have said "no ball, older than my ACK"
  — the same input explains V430's own rooms (VWWK, BXDZ, NICE: reloads 2.6–8.2 s after taking the ball). Now a
  snapshot that says waiting, under a live record that has said "I have the ball" for over 1.5 s on a scrimmage down,
  is from the other side of the possession change: my own newer facts decide — the last settled down from this tab's
  flow record (the restore rule's spot) when it is this possession's and not older, else the live record (diag `RESUME
  my snapshot says waiting…`, audit `guard resume-live` with `via`). Test `e2e/v438-reload-played-on.js`: live V434 failed P1/P2 (parked, then TURN-RESCUE at
  its own 25 instead of its 14 on 2nd down; another run: "taking it again", back to the punt's 1st & 10) — V438 5/5.
- **V438 (committed, NOT shipped) — the 35 s conversion wall threw away a try the player had just chosen (daily sweep, 5 games on 2 Oct: PKXS,
  RVLS, EKRA, ZNSO, CGQB).** Its holds covered the choice ON screen (V415) and a launched try (V406), not the seconds
  between the 1 PT / 2 PT tap and the kick or snap; it fired 0.3–2.7 s after the tap. Now a player who pressed since
  the offer, with its try lined up (down 6 or the kick set), gets 20 s from its last press, within 90 s of the offer
  (diag `PAT-INV wall waits — the player chose and is lining up the try`, audit `guard wall-wait-try`). Test
  `e2e/v438-wall-try.js` (a real goal-line TD, 1 PT past the 35 s mark, a real kick 5 s later): live V434 W1–W3 FAIL
  ("35s wall — resolving the conversion as MISSED" ~5 s after the tap), V438 4/4 (the kick good, +1, the kickoff carried 7).
- **V434 — the 0:01 glitch is gone, with the buffer** (was #4): the horn law. A hand-off decided at 0:00 ships 0:00 (to
  a V434+ partner) and the receiver's engine ends the quarter itself — no extra down, no bounce. Halftime: Team B by
  role. Also the scorer's free down after a try across the horn (C10, C13). Tests: `e2e/v434-horn.js`,
  `e2e/v434-horn-outcomes.js`; v430-expired X1–X3 and v432-half-horn H1/H3 now assert the horn rule.
- **V434 — FGXJ** (was #5): overtime is not armed while a try is owed; the OT kickoff clears a stale pick-six duty (C6).
- **V432 (run 20261002-1200; committed, live when V432 ships) — the detector counts a hand-off ping-pong** (was #2): `tools/audit-rules.js` (R-FREEZE,
  "hand-off ping-pong") and `tools/stuck-scan.js` (`PING-PONG`). Two bounces in a row, from the first unplayed
  hand-off to the next snap, the stats screen, a pagehide, or 10 s after the last bounce. Whole archive: exactly the 9
  keep-0:00 rooms changed (4 permanent, 5 temporary). Test: `e2e/v432-checker.js` P1–P7.
- **V432 (run 20261002-1200; committed, live when V432 ships) — R-DOWN "inches"**: a gain within 0.05 of the line is the engine's call (NPXZ "2nd &
  0.01"; 44 artifact flags in 41 rooms gone). P8.
- **V432 (run 20261002-1200; committed, live when V432 ships) — the brief had read a worktree's 10-room audits/** instead of the archive (12:00 brief:
  "1 game, 0 frozen" of 90). precheck.js, firings.js and stuck-scan.js read the watcher's archive first.
- **V432 — V430's "keep 0:00" reverted:** it looped at the halftime horn in 3 of 3 real games (FOVL, ONFE: both
  players quit; HIHR). The 0:01 glitch is open again (#4).
- **V432 — OKYW:** a phone that joins its partner's new game through the resume no longer keeps the finished game's
  flow record (epoch H), which had dropped the new game's first-half hand-offs as moot. The record is reset
  (`flow-stale`), and a finished game's id is never adopted. Test: `e2e/v432-rematch-join.js`.
- **V430 — the 2026-10-01 freezes:** a phone that reloads seconds after taking the ball comes back with it, at the
  same spot (VWWK, BXDZ, NICE, AOGO — and TURN-RESCUE had put it at its own 25); the OT receiver waits for the partner
  still playing its try (ZQMT; and never two offenses when the flip lands just after the horn); a play that runs out
  the clock ends the quarter — no extra play at 0:01 (53 archived hand-offs). Detector: partner away / partner's own
  progress / clock stretches / frames without taps / no network / any sleep signature; a clock sample every 15 s; the
  outcome poll's failures logged; the engine's full error logged. (Old items CZFL, NERM-detector: explained.)
- **V428 — R-REOPEN, the root:** a phone that reloaded after the final was put into a match alone.
  - **Why:** the READY flags on the server were never reset. The reloaded page saw both seats still READY from the
    finished game and called startMatch.
  - **What it cost:** that start wiped the finished game's final, outcomes and audit marker.
    - UZGV, Shivom vs soham, 49ers 30-0 at the stats screen, vanished from the transcripts and was marked UNFINISHED.
    - The transcripts hid 37 real rooms; 24 complete games were marked unfinished.
  - **Fix:**
    - a match starts only on THIS page's READY;
    - the final screen spends the READY;
    - entering a room clears a READY left by an earlier page;
    - the checker takes a room's "complete" from its last real game;
    - the transcripts page tells test rooms by their code or harness names.
  - **Tests:** `e2e/v428-ready.js`, `e2e/v428-records.js`.
  - **Still true:** the lobby drops the PARTNER's `final` report as a leftover (V296), and the transcripts never show
    the stats-screen box score. If the box scores should be kept and shown, store each game's final report under
    `games/{ms}` and render it.
- **V426 — the detector:**
  - re-audit rooms with entries after their audit;
  - no "offline" rule;
  - silence judged by how it ends;
  - freezes timed from when the stuck state began;
  - clock offsets per hour, not per room;
  - lone reopens after the final are R-REOPEN, not frozen games;
  - the watchdog tells sleep from a hang;
  - taps are logged on every device.

  The evidence is in FREEZE-LEDGER.md V426.
