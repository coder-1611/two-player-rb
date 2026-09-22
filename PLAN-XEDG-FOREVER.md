# Room XEDG — the plan that ends these bugs (V380)

Kansas City 43, San Francisco 0, played 2026-09-05 on V378. Eight
interceptions, six pick-sixes, and four things went wrong. Every one of them
is a **stray actor taking a decision that was not its to take**. The fix is
the same method that has held for the ball gate (V358), the conversion gate
(V360) and the possession ledger (V366): name the one thing that is
conserved, give it a single owner, make every other actor ask that owner and
log its stand-down.

## What the record says

| when | what the players saw | what actually happened |
| --- | --- | --- |
| Q2 0:56 | KC gets a fresh 1st & 10 **on the 2** after its own pick-six, scores, kicks the PAT: 13-0 | KC's phone went dark mid-conversion; the 35 s wall *released* the conversion instead of *resolving* it; the rescue then staged a drive for KC at the pinned conversion spot. 7 points KC never earned. |
| Q1→Q2 | KC's play "keeps changing on its own", the audible button multiplies | A stray kickoff button at the rollover kept the drive dead; the keep-drive re-fired 13 times in 15 s (once every 1.3 s), respawning the formation each time. |
| Q3 1:05 | SF's clock jumps from 1:05 back to 1:58; score dips 25→19→25 | KC's end-of-Q2 handoff arrived 3.7 s *after* the halftime law had already put SF live; it sat in the queue and was applied 50 s later, when SF next parked. |
| Q4 1:12 | SF's clock jumps 1:22 → 1:52; score dips 43→37→43 | The **300 s deadlock timer armed by pick-six #2** (Q2 0:26) fired at Q4 start — exactly 300 s later — into pick-six #5's cascade and force-started SF's drive while KC was still playing the conversion; the real result arrived 10 s later and sat until SF's next park. |
| Q4 0:31 | both phones "waiting" | KC's screen was off. Not a bug; the checker mislabeled it a deadlock. |

Plus two reports from the player: **route arrows missing** on a possession
(the thrower's post-pick-six drive is the engine's *kickoff-return* formation
adopted as a drive: no play was set up, so no routes) and the **infinite
audible** at the Q1→Q2 rollover (the keep loop above).

## The laws (each one a choke point, each one logged)

1. **The scorer of a pick-six has exactly one exit: a PAT_RESULT.**
   `window._rb2p_p6ScorerOwes` is set when the PICK6 is applied and cleared
   only by shipping the result. While it is set, `forceUserOffenseDrive`
   refuses (logged `P6 refused force-drive`), the TURN-RESCUE ships the owed
   result instead of a drive, and the 35 s wall *resolves the conversion as
   missed and ships it* rather than releasing flags. A conversion can be
   abandoned; it can never turn into a drive.
2. **A deadlock timer belongs to the cascade that armed it.** The 300 s
   fallback carries its cascade id and stands down (`P6-FALLBACK stood down`)
   if a different pick-six is in flight.
3. **My own handoff makes every earlier inbound outcome moot.** At the SEND,
   the pending queue is purged (`OUTCOME purged`), keeping only PICK6 records
   (they carry points and a conversion) and merging any higher score. An
   outcome that arrived while I was live can never rewrite my clock later.
   Every apply now records its lag (`apply` telemetry).
4. **One quarter, at most two keeps.** The keep-drive heals the staging
   scene (stray kickoff buttons, duplicate audible buttons, latched
   proceed) *before* it spawns, counts itself per quarter, and refuses the
   third (`QTR-KEEP LOOP`). The loop cannot exist.
5. **A drive staged after a conversion result is spawned fresh.** The
   thrower's post-PAT_RESULT drive and the watchdog force go through
   `forceUserOffenseDrive(y, true)`: a new play is set up, routes and arrows
   included.
6. **A rescue never takes back a handoff that is still in flight.** While
   my last sent outcome is unconfirmed (under 90 s), the both-parked rescue
   stands down (`TURN-RESCUE stood down — my handoff is still in flight`)
   and the delivery watchdog re-sends instead. (Found by the full suite:
   V378's rescue flip had raced the re-send at +8 s.)

7. **Within a quarter, the clock only goes down (V382).** The clock gets what
   the ball has: an owner. The engine's two clock fields are *witnessed* (every
   write, engine or bridge, is recorded with its caller) and a 50 ms *judge*
   compares the resting clock with the last accepted one. Up by more than one
   second (rounding) in the same quarter, unlicensed, is refused: the accepted
   clock is put back and the writer is named (`CLOCKGATE refused 1:58 — kept
   1:05 (Q3, writer L10259)`). A quarter change is an epoch. The legitimate
   upward writers — OT's 10:00, the agreed quarter length at a rollover, the
   between-quarters keep, the halftime law, a resume restore, the test
   director — call `_rb2p_clockLicence(why)` first. This alone would have
   refused MHUY's mirror write and both XEDG rollbacks.

8. **The other phone knows when your screen is off (V395).** Three quarters of
   the audited freezes were one moment: a conversion or pick-six while one tab
   was backgrounded. The hidden phone HOLDS the handoff (it cannot stage a
   drive at 0 fps) — and the visible phone's watchdogs read the silence as a
   dead partner: the turn rescue took the ball back, the pick-6 watchdog
   forced a second offense, the 35 s wall resolved a try nobody was watching.
   Now the opponent's heartbeat (`vis`) is subscribed on every phone
   (`_rb2p_oppHidden()`), and: the turn rescue stands down while the opponent
   is hidden; the wait cover says *OPPONENT'S SCREEN IS OFF*; the 35 s wall
   counts screen-on time only; a held handoff is stamped `held/heldTs` on the
   record and audited (`guard held`); the pick-6 watchdog never forces a drive
   while the turn is the opponent's and they are live (QQQP: 18 forces in
   25 s).

9. **An empty field after a conversion is a hand-off, never a new drive
   (V395, TBPK).** The engine clears the field for the kickoff after a try.
   The V386 empty-field law read that as "live with nothing on the field" and
   re-staged the SCORER's drive at its own 18 — twice in one game, and the
   opponent never got the ball. Within 40 s of a conversion offer the law now
   hands off exactly as the stuck-drive watchdog does (Vy=9 →
   `s_change_possession` → the `_1c1` hook ships the TD kickoff);
   `_rb2p_emptyFieldAct` is the seam.

10. **The third keep is a fresh spawn, never a "healed" scene (V403).** Since
    V380 the keep gate refused the third between-quarters keep and healed the
    parked scene; the healed scene painted a formation that never went live.
    31 of 32 refused keeps left the field dead for 30-55 s (BEDT and DNYZ
    ended there). The third firing now spawns the drive fresh (routes reset,
    the pick-6 path's restart); the fourth and later are still refused.
    Audit `guard keep-fresh`.

11. **FINAL is said the instant the horn decides it (V403).** The real final
    screen needs ~6.5 s (a 5 s past-regulation dwell plus confirm ticks) and
    5 of 13 games at the horn were closed inside that window, so neither
    phone ever recorded a final. A gold FINAL strip (`#rb-final-soon`) shows
    the score the moment Q5 is reached with a decided score; the final
    overlay and every match start hide it.

12. **The engine's native end past the horn is the final (V403, IAPL).** A
    reload into the fifth quarter with a decided score leaves OT disarmed
    (correct), the engine then ends the game natively and leaves the match
    room; the fallback that reports that as the 2P final used to require OT.
    It now fires whenever the match was last seen in Q5, or Q4 at 0:00.

13. **"Opponent left" is a state the other phone can see (V403).** A pagehide
    writes `hb/{role}` with `vis:'X'` through a keepalive PUT; the other phone
    (`_rb2p_oppLeft()`) shows OPPONENT LEFT THE GAME — WAITING FOR THEM TO
    COME BACK, and the next heartbeat clears it. Test seam
    `_rb2p_hbSuspend`.

14. **A kick is a played try (V405, SSFQ/DJPM).** The conversion snap detector
    only knew the snap states; a 1-point kick never passed through them, so a
    missed kick was never "played" and the miss detector starved. In kick mode
    (`enginePatModeFlag`) the ball leaving rest is the try
    (`_rb2p_patTryStarted`).

15. **A try whose possession has flipped away is over, not restored (V405).**
    The PAT invariant used to re-claim possession, restore down 6 and pin the
    ball back to the 2 whenever the ball was off the spot — undoing the
    engine's own move to the kickoff after a missed try, on a field the engine
    had already cleared, and hiding the "possession flipped away" signal the
    miss detector reads. Now, 8 s after the offer with possession flipped and
    no ball on the field, it marks the try played and stands down; the guard
    resolves MISSED and the result ships. Audit `guard try-over`.

16. **One conversion offer at a time (V405, ITXQ).** The modal builder refuses
    a second conversion modal while one is up within 20 s
    (`_rb2p_convDuplicate`).

17. **A game is complete only when the stats screen appears after Q4 or
    overtime (V405).** Client: 20 s past a decided horn on a visible page the
    FINAL is forced through any hold (`guard final-forced`). Checker: R-FINAL
    flags a phone that stayed on the page without a final (game-over level)
    or closed before it (incomplete, the player's doing); `res.complete`
    carries the verdict, the audited record stores `complete/horn`, the
    transcripts page shows COMPLETE / INCOMPLETE / UNFINISHED.

18. **A conversion that crosses the horn ends the drive (V406, IPHM and 7
    more in one day).** The try ran into the next quarter, the engine rolled
    the quarter with the ball at the 2 and the down reset to 1, the points
    landed, and the scorer kept the ball at the 2 for a fresh drive. A 300 ms
    watcher now hands such a drive off as the touchdown's kickoff
    (`guard post-conv-handoff`).

19. **The 35 s wall respects a try in flight and a try already scored (V406,
    ZNJM, FVCL).** It defers while a launched try is under 20 s old, stands
    down when the drive has already handed off, and resolves MADE (+1/+2)
    when the score moved since the offer, instead of shipping MISSED over
    real points. The post-try hand-off is typed TD for 60 s, not 30.

20. **The conversion licence cannot be raced (V406, HJSK, CBUS).** The +6 is
    also measured against the score at the last snap (`L1c`), so the offer is
    never refused because the per-tick baseline absorbed the touchdown first.

21. **INTERCEPTED needs a takeaway (V406, the YGJM complaint).** The banner
    lights only on real INT/fumble deltas or an INT-typed outcome; the
    cosmetic `turnover` hint never rides on a kickoff, TD or PAT_RESULT.

22. **Live pushes from before the last hand-off are dead (V406, MHQP).** A
    reconnecting phone's queued `iHaveBall:true` pushes older than the last
    applied outcome are ignored; a silent phone is reported as SILENT, not
    DEADLOCK.

## The checker learns each one

- **R-GIFT** — the scorer snapped a normal down while still owing the
  conversion result.
- **R-STALE** — a handoff was applied more than 5 s after it arrived, or was
  purged as moot.
- **R-KEEP** — the keep-drive fired three or more times in one quarter.
- **R-FALLBACK** — the 300 s fallback fired (always worth a look).
- R-POSS says *"X's screen was off"* instead of *deadlock* when one phone was
  hidden; R-DOWN uses the unrounded gain.
- A post-try hand-off typed **TD** (V394) resolves the conversion — no false
  "never resolved", no false gift (V395; 12 V394 games were mis-rated).

## Proof

`e2e/v380-xedg.js` replays each mechanism in the harness and asserts the
law; `e2e/v395-hidden.js` covers laws 8 and 9; `e2e/v403-endings.js` laws 10-13; `e2e/v405-complete.js` laws 14-17; `e2e/v406-today.js` laws 18-22; `e2e/audit-selftest.js` injects each new bug shape and asserts the flag.
XEDG itself, re-audited, must name the gift drive, both stale applies, the
keep loop and the fallback.
