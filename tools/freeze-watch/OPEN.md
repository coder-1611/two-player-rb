# Freeze-watch — open items

Known problems that are not fixed yet, from the detector audit of 2026-09-30 (V426). Every run reads this list. When
a run fixes an item (same gates as any fix), it moves the item to **Done** with the version and the evidence. When a
run finds a new root it cannot fix today, it adds it here with the rooms that show it.

Order = what to take first when the brief has no new freeze to work on.

## 1. FGXJ: overtime starts while a pick-six try is still owed (V424, still in the code)
- A pick-six at Q4 0:00 tied the game 12-12 before its try; the engine rolled into Q5 during that temporary tie, so the
  OT code armed and seeded the coin flip (`coin flip only from a tie`). The try made it 13-12 — the game was decided at
  the horn — but OT counted as legitimate because the flip was seen; `_rb2p_p6ScorerOwes` was never cleared (the
  PAT guardian stood down, POST-CONV returns for Q≥5), so B's OT kickoff was refused 40 times ("the scorer owes a
  PAT_RESULT"), then FIELD-CHECK shipped a synthetic result and A went live against the coin flip.
- Fix (both): don't arm OT / seed the flip while a try is owed on either phone (reuse the halftime law's
  `q3PartnerTryPending()` + my own `patOwed()`, capped), so 13-12 ends at the horn; and in `_rb2p_applyOtKickoff`
  clear `_rb2p_p6ScorerOwes` (the flip decides possession). Test through a REAL pick-six at Q4 0:01 (the receiver
  six behind), both a made and a missed try. (Investigator's full chain: the V430 session notes.)

## 2. DAXK: a reload during an overtime try ends the game early (still in the code)
- The try's duty record survives the reload; the resume replays it as a synthetic `type:'PICK6'` outcome, and in OT a
  pick-six is a walk-off win (`_rb2p_otWalkoffDefensiveTd`) — the game ended 30-24 with A's answering possession
  unplayed. Fix: mark the replayed outcome (`resumeRepop: true`) and skip the OT walk-off for it. Test: B scores an OT
  touchdown by real play, reloads before choosing; no FINAL, the choice re-shown, a real 2 PT tap, A then plays.

## 3. NERM: the hand-off lives only in the sender's memory for the 4 s pick-six hold
- A laptop that sleeps inside the hold strands the partner (the hand-off reached the server 15 minutes later). Fix:
  skip the hold when no pick-six can follow (`_rb2p_driveTurnoverDeltas()` known with intDelta + fumDelta === 0, no
  turnover stamp this drive, no opponent TD replay < 15 s). Risk: a turnover whose stat lands late would ship as OTHER
  first (the OKAG double record; V352's duplicate drop is the backstop). Test with CDP `Debugger.pause` on the sender.

## 4. IEID / WVLK: the engine throws on every frame from the lobby (2 rooms of ~2,500; one pair of new players)
- "undefined is not a valid map reference" every frame, from before the match start on both phones: the match never
  started, the players left (twice). V430 logs the engine's full error (`engerr` audit entries) — read them on the next
  occurrence to find the trigger. Optional guard: disable READY while the engine throws every frame (never start a
  game on a broken phone; the partner is not dragged in) — a lobby change, needs its own test.

## 5. Unanswered taps are not a freeze yet
- Since V426 taps are logged on every device (`tap … p=mouse` on Chromebooks), and since V430 a visible page writes a
  clock sample every 15 s (a heartbeat). The `act` monitor's "taps unanswered" is still soft (never counted).
- Next: measure on V430+ games — ≥4 taps in 10 s on a must-act, on-screen phone with no progress — against stuck-scan;
  only then count it (a new interval kind, with a whole-archive diff). Also count a reload while must-act and unable.

## 6. The detector under-measures a refusal stall
- ZQMT's real freeze was ~13 s on B (refused LIVE → behind the waiting cover) but the act monitor only reported "both
  parked" on A (9-11 s). A `wait refused` audit entry followed by both phones parked is the stuck state; count it from
  the refusal. (V430 fixed ZQMT's cause — the OT kickoff waits for the partner.)

## 7. Low frame rate
- A separate "degraded" measure: a phone that owes the move at <10 fps for >10 s (XAMX, ZZZX, LMUM). Not a freeze.

## 8. The page reloads itself on a lost graphics context
- `glLostRecover` reloads the page when the WebGL context is lost (once per 45 s) — against the owner's "no
  auto-reload". It never fired in the cases read; a lost GL context cannot draw again otherwise. Decide with the owner.

## Owner decisions (do not act on these without the owner)
- **Database storage:** the free plan allows 1 GB, and the database is at about 293 MB and grows 30–50 MB a day,
  because rooms are never deleted. It fills in about 2–3 weeks.
  - **Options:** the Blaze plan, or archive old rooms' audit streams to disk and remove them from the database.
  - The owner's rule is "never delete rooms", so the owner must choose.
  - Until then, add nothing that grows the database much (see item 5).

## Done
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
