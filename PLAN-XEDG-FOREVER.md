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

## The checker learns each one

- **R-GIFT** — the scorer snapped a normal down while still owing the
  conversion result.
- **R-STALE** — a handoff was applied more than 5 s after it arrived, or was
  purged as moot.
- **R-KEEP** — the keep-drive fired three or more times in one quarter.
- **R-FALLBACK** — the 300 s fallback fired (always worth a look).
- R-POSS says *"X's screen was off"* instead of *deadlock* when one phone was
  hidden; R-DOWN uses the unrounded gain.

## Proof

`e2e/v380-xedg.js` replays each mechanism in the harness and asserts the
law; `e2e/audit-selftest.js` injects each new bug shape and asserts the flag.
XEDG itself, re-audited, must name the gift drive, both stale applies, the
keep loop and the fallback.
