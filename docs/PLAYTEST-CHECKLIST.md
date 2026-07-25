# Play-test checklist (V342+)

Run through this in a REAL two-phone game after any meaningful change. It replaces
the old V321 checklist (lost to the iCloud wipe) and covers everything the
V333–V341 DEQC pass fixed. Anything that fails: note the ROOM CODE + quarter/clock
and report it — the room telemetry (`rooms/{code}/dbg`, `EVT->`/`EVT<-`,
`TURN->`/`TURN-HEAL`/`TURN-RESCUE`, `cSNAP`/`cFEED`/`cSKIP`, `box`, `outcomes`,
`snap`) records exactly what each phone did. Try not to refresh immediately after
a bug — the rolling diag log is only ~11 lines.

## 1. Lobby / start
- [ ] Both phones show the SAME `V<N>` label in the lobby before READY.
- [ ] Room joins cleanly; both READY → host (A) opens on offense, B parks in WAIT.

## 2. Every drive, both phones
- [ ] Exactly ONE phone is on offense at any moment; the other shows the WAIT cover.
- [ ] No wait-screen blinking/flickering at any possession change.
- [ ] WAIT commentary appears for every normal play and comes ONLY from box-score
      deltas: pass = `QB → RECEIVER · N YDS`, handoff = `RB · N YDS RUN`,
      scramble = QB run, sack, incomplete.
- [ ] A possession change/turnover produces NO commentary line (no invented
      "QB -14 YDS" junk) — the popup covers it.

## 3. Popups (watch the WAITING phone)
- [ ] TOUCHDOWN pops the MOMENT the TD is scored — before the PAT even starts.
- [ ] A missed PAT does NOT remove or prevent the TOUCHDOWN popup.
- [ ] FIELD GOAL pops on a made FG.
- [ ] INTERCEPTED pops on the phone that TOOK the ball — never on the thrower.
- [ ] A fumble recovery pops FUMBLE (not INTERCEPTED).
- [ ] PICK 6 pops on the defense's phone at the takeaway.
- [ ] Every popup fires exactly ONCE (no doubles, no repeats on refresh).

## 4. Turnovers & the pick-6 cascade
- [ ] After an INT, possession moves to the interceptor and STAYS — no bounce
      back to the thrower, no skipped drive, for at least the next snap.
- [ ] Pick-6: the defense gets +6, then plays the PAT **from the 2-yard line**
      (never midfield, never the 20). 1PT and 2PT both respond to taps.
- [ ] After the PAT resolves, the THROWING team receives the kickoff drive.
- [ ] A pick-6 as regulation expires (Q4 0:00, non-tied): NO PAT — straight to FINAL.

## 5. Quarters & clock
- [ ] Q1→Q2 and Q3→Q4: the SAME team keeps the ball and resumes at the same
      down/spot (no 10-yard bumps, no down reset).
- [ ] Halftime: B ALWAYS receives the Q3 kickoff; A parks in WAIT. Deliberately
      try a FG as the half expires — the transition must stay clean (one flip,
      both phones in Q3, no lingering weirdness afterward).
- [ ] The quarter number only ever moves forward one step at a time; never past
      Q4 in regulation (5 = OT only); never backwards.
- [ ] Both phones agree on quarter + clock within ~a second at every boundary.
- [ ] Tied at the end of Q4 → OT coin flip, equal possessions. Non-tied → FINAL.

## 6. Resilience (the DEQC scenarios)
- [ ] Refresh either phone mid-game: it resumes the right role, score, down, and
      spot. NEVER both phones stuck on WAIT — if a double-park ever happens, the
      ball owner recovers the drive automatically within ~8s (TURN-RESCUE).
- [ ] Lock/background one phone 60s+ mid-game, then return: the game recovers
      (diag shows VIS-KICK), and the OTHER phone never corrupts meanwhile.
- [ ] If the game is decided in the final minute of Q4 and the opponent's phone
      goes silent 45s+: the live phone declares FINAL on its own.
- [ ] Stats survive: after any refresh, the box score continues from where it
      was (never resets to zero — the per-play Firebase ratchet).

## 7. Final screen
- [ ] The FINAL appears on BOTH phones at the true end (never mid-Q3, never hangs).
- [ ] QB completions look right: receivers' combined catches ≈ QB completions;
      NO receiver shows passing numbers (the 2/1-on-a-WR bug).
- [ ] Both phones show the same final score.

## Reporting a failure
Say: room code, what you did, quarter + clock, which phone (A=host). Telemetry
usually answers the rest without screenshots.
