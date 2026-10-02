# Freeze-watch — open items

Known problems that are not fixed yet, from the detector audit of 2026-09-30 (V426). Every run reads this list. When
a run fixes an item (same gates as any fix), it moves the item to **Done** with the version and the evidence. When a
run finds a new root it cannot fix today, it adds it here with the rooms that show it.

Order = what to take first when the brief has no new freeze to work on.

## 1. FXTE: V430's reload-ball resume takes a hand-off again after the phone PLAYED ON (harmful, 1 of 1 real firings)
- **What happened (FXTE, 2026-10-02 8:07 am, V431):** B took a TD kickoff and played three downs into Q2 (3rd & 4 at its
  46, 2:54 left), then reloaded. Its live record was older than its ACK, because its tab drew almost no frames and the
  500 ms push lagged. So the resume said "the TD I took before the reload is newer than my live record — taking it
  again", and B was put back at its 40, 1st & 10, with 0:01 left in Q2. That lost ~2:53 of the half and the downs
  (R-YARD, R-POSS).
- **Fix:** before `ackedUnseen`, read this tab's flow record (`sessionStorage rb2p_flow_<room>_<role>`, or the server's
  `flow/<role>`). If it staged this hand-off (`staged === lo.ts`) and settled a down in it (`spot.via === 'settle'` and
  `spot.stg === lo.ts`, or `plays` grew), the phone played on, so do not take it again.
- **Seen again (ATUZ, 2 Oct 9:15 am, neutral):** the resume "took again" a TD hand-off that arrived 4 s AFTER the final
  (an OT walk-off; the sender's post-final kickoff was still applied — `POSS -> LIVE` on a phone at the stats screen),
  because B reloaded at the stats screen. No match resumed, nothing changed for the players. When fixing #1, also never
  take a hand-off again — or apply one — once this game's `final` is on record.
- **Test:** the v430-reload-ball setup, but the receiver plays 2 real downs (`e2e/qb-bot.js`) before the reload while its
  live push is held. It must come back at the spot of its last down, not the kickoff's. Keep v430-reload-ball green.

## 3. The V266 READY guard reads a partner's "left" beacon as "mid-match" — a READY reloads into a resume (OKYW)
- **What happened:** the guard (`maybeStartMatch`) takes a fresh `hb/<partner>` with no fresh final as "the partner is
  mid-match" and reloads. Since V403, a page that LEAVES writes `hb {vis:'X'}` with a fresh ts.
  - When both press READY seconds after one of them reloaded, the starter's own match start has already removed
    `final`, and the beacon is under 15 s old. So the second phone reloads into a resume of a game it should have
    started.
  - This happened in 16 of 17 archived starts where the second phone joined through the resume (V432 ledger).
- **What V432 did:** V432 made such a join harmless: the old flow record is reset (`flow-stale`).
- **Fix still needed:** the needless reload. The guard should ignore `vis:'X'`, and better, should not take a partner
  whose match started from this READY pair as "mid-match".
- **Second variant (JCTW 3:07 pm):** a page reloaded 1.6 s before the partner's start and resumed into the FINISHED game
  (Q5, stats screen) while the partner played game 2. B only joined after another reload.
- **Test:** both phones press READY within a second of one having reloaded. Both must run startMatch (a `game` audit
  entry on both), with no reload.

## 4. Audit V434's horn law in real games (the first 24 hours after the release)
- V434 ends every quarter through the engine's own time-up (FREEZE-LEDGER.md V434, `~/rb2p/research/HORN-RESEARCH.md`
  §5.2). Read every firing: the diag `HORN Qn — a drive staged by L<line> at 0:00 ends the quarter here` and the audit
  `guard {what:'horn', q, why}`.
  - **Stop the line** if a horn's next period went to the wrong team (Q1/Q3: the team with the ball after the last down;
    halftime: Team B; Q4: the final, or the flip on a tie). Revert C1–C3 the way V432 reverted V430.
  - `why` other than "a hand-off" (a rescuer staged at 0:00) should be rare: read each one.
  - `SEND horn at Qn 0:00 — the partner is on V4xx: it gets the old 0:01` = a mixed-build game (expected for a day).
  - `guard ot-try-wait` followed by an OT flip more than 30 s later: read it (C6's hold, capped at 120 s).
- **Checker rules to add** (whole-archive diff first, only intended verdicts may move): R-HORN-EXTRA (a snap in quarter
  *n* by the receiver of a hand-off sent `Qn 0:00`: the extra play; ≈141 in the buffer era, 0 expected after),
  R-HORN-RESTAMP (a drive end at `Qn 0:00` sent with another quarter or clk > 0), R-HORN-SPOT (Q1/Q3: the receiver's
  first snap of Q*n*+1 is not at the hand-off spot on 1st & 10). Spec: HORN-RESEARCH.md §5.2.
- **Prove C10 (the halftime try) with a real touchdown.** `horn-last-down.js td` at Q2 never scores: the harness writes
  the quarter, which skips the engine's direction switch (`_Sc1`), so the goal-line run goes backwards. Reach Q2 through
  a real Q1 horn (a real down at Q1 0:01 with no possession change: the engine's own case 19 runs `_Sc1`), then stage
  the touchdown at Q2 0:02. Must hold: the scorer's try, then Q3 with b receiving and the scorer never snapping in Q3
  first (R-HALF / METB).

## 5. The horn law's two specified follow-ups (HORN-RESEARCH.md C11, C12)
- **C11:** a horn record that arrives after the receiver's quarter already ended must not lower its quarter (the apply
  writes the quarter absolutely, 16 ms until V323 pulls it forward; YGJM#2, BHOU#1, EMNP#1). Decide it by the period
  rule for Q*n*+1 instead.
- **C12:** a safety on the last down of Q1/Q3 gives the next quarter's ball to the CONCEDING team at its goal line
  (`_rb2p_scoredSinceCapture` only compares the holder's own score). Void the keep on the opponent's score too, and hand
  the free kick off the way POST-CONV does. Read the engine path first; test through a real safety.

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

## 10. The detector under-measures a refusal stall
- ZQMT's real freeze was ~13 s on B (refused LIVE → behind the waiting cover) but the act monitor only reported "both
  parked" on A (9-11 s). A `wait refused` audit entry followed by both phones parked is the stuck state; count it from
  the refusal. (V430 fixed ZQMT's cause — the OT kickoff waits for the partner.)

## 11. Low frame rate
- A separate "degraded" measure: a phone that owes the move at <10 fps for >10 s (XAMX, ZZZX, LMUM). Not a freeze.

## 12. The page reloads itself on a lost graphics context
- `glLostRecover` reloads the page when the WebGL context is lost (once per 45 s) — against the owner's "no
  auto-reload". It never fired in the cases read; a lost GL context cannot draw again otherwise. Decide with the owner.

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
