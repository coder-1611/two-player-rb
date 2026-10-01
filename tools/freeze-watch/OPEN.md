# Freeze-watch — open items

Known problems that are not fixed yet, from the detector audit of 2026-09-30 (V426). Every run reads this list. When
a run fixes an item (same gates as any fix), it moves the item to **Done** with the version and the evidence. When a
run finds a new root it cannot fix today, it adds it here with the rooms that show it.

Order = what to take first when the brief has no new freeze to work on.

## 1. A phone that reloads after the final is put into a match alone (R-REOPEN)
- **Seen in:** 31 of 878 archived rooms (35 times), V387–V424.
  - EXYT (V424): A reloaded 54 s after the final and played a whole drive alone, a TD and a kickoff to B, while B
    sat on the stats screen.
  - BUZT (V415): A reloaded into a lone game 4 times in 40 s.
  - EQXQ (V423): A reloaded 11 s after the final (snapped alone), then reopened the tab 18 hours later and sat on
    "resume did not re-enter the match".
  - SJTR: the players' complaint "Can't exit the game".
- **Where:** the boot/resume path in `index.html`. The log reads `FLOW restored from this tab g… ep K0`, then
  `GAME-START` and `TURN-> a (match-start)`, with no check that the room's game is already final.
- **Fix direction:**
  - A room whose current game has a `final` lands on its stats screen, with the way out, never in a new match.
  - The monitor must not say "resume did not re-enter the match" for a finished game, or for a `rb2p_matchLive`
    older than about 30 minutes.
  - The rematch flow must keep working (`e2e/v425-rematch.js`, `v398-games`).
- **Test:** an e2e test that finishes a game and reloads one phone, then both: the stats screen comes back, with no
  `game` entry and no `act must:true`.

## 2. Unanswered taps are not a freeze yet
- Since V426 taps are logged on every device (`tap … p=mouse` on Chromebooks and desktops). Before that, 128 of 154
  V424 games had no taps at all.
- The `act` monitor's "taps unanswered" is soft: never counted and never acted on. It fired only 17 times in 291
  games.
- **Next:**
  1. Measure on V426+ games first: ≥4 taps in 10 s on a phone that must act, is on screen, and makes no progress.
  2. Compare with `stuck-scan.js`.
  3. Only then make it count in `tools/audit-rules.js`, as a new interval kind, with a whole-archive diff.
- Also count a **reload escape**: a reload while must-act and unable to act.
  - Grace backdating (V426) already counts DAXK's 15 s.
  - A reload at 5–9 s still counts as nothing.

## 3. CZFL: a hand-off the REST poll never delivered
- **What happened** (V424, g1, +1982 to 2050 s):
  1. B punted while A was hidden.
  2. A came back with its SDK socket OFFLINE, running on REST.
  3. A's flow record said "b has the ball (a sent after b)", but the REST poll never fetched B's hand-off.
  4. Both phones waited on screen for 31 s, permanent.
- **Also:** the monitor's `both parked` check needs `fvB.fresh && partnerTrusted`, so a stale partner record (a
  dead socket) blinds it in exactly this case.
- **Test:** use the `_rb2p_FB` seam (memory: rb-firebase-dual-transport). Kill the receiver's socket while the
  sender ships OTHER, and expect `OUTCOME OTHER via rest-poll` within 6 s.

## 4. NERM: a turnover-on-downs hand-off that stayed "in flight"
- **What happened** (V424, +283 s):
  1. A turned the ball over on downs (`SEND OTHER`).
  2. B's flow said "a hold in flight", live=false.
  3. Both phones waited 21 s, then B left. Permanent.
- **Next:** read it with CZFL; it may be the same root.

## 5. A real heartbeat
- `stage` and `act` are written on change only, so a quiet page and a dead page look alike in the stream.
- V426 judges a silence by how it ends. That is a workaround, not a measurement.
- **Options:**
  - a 2-field `hb` entry every 15 s while on screen. That is about 20 KB per phone per game, so mind the storage
    item below.
  - Or stamp the existing `rooms/CODE/hb` heartbeat into the stream only when the page is stuck.

## 6. The stall report is lost when the PATCH fails
- The watchdog's `stall` PATCH is fire-and-forget; a phone that is offline at that moment loses the evidence.
- **Fix:** retry it, and `postMessage` the record to the page so the audit outbox carries it after a resume.
- Then consider counting a `kind:'hang'` stall on a must-act visible phone as freeze seconds in R-FREEZE.

## 7. "offline" in the act monitor
- The monitor reports `why: 'offline'` when the socket is down, which hides the real state (CZMX played 9 snaps
  while flagged `can:false offline`).
- Since V364 a phone keeps playing over REST. Check offline last, or make it soft.

## 8. Low frame rate
- A separate "degraded" measure: a phone that owes the move at <10 fps for >10 s (XAMX, ZZZX, LMUM). It is not a
  freeze; report it in the daily sweep.

## Owner decisions (do not act on these without the owner)
- **Database storage:** the free plan allows 1 GB, and the database is at about 293 MB and grows 30–50 MB a day,
  because rooms are never deleted. It fills in about 2–3 weeks.
  - **Options:** the Blaze plan, or archive old rooms' audit streams to disk and remove them from the database.
  - The owner's rule is "never delete rooms", so the owner must choose.
  - Until then, add nothing that grows the database much (see item 5).

## Done
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
