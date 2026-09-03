# The Possession Ledger and the Game Auditor

Two deliverables. Both follow the one method that has actually held in this
project — the quarter yard-line (V358 ball gate): find the single choke point
the thing passes through, name the conserved quantity, and make the check run
every time and account for itself in the log, even when it stands down.

## Why the pick-6 keeps breaking

Every pick-6 defect in the history of this fork is a **possession** defect in a
costume. The reported game: PAT played, possession never changed, both phones
in WAIT, the scorer's phone showing a formation under a flickering overlay,
then a drive with no arrows. Each of those is a symptom of two devices holding
different beliefs about who is live.

Possession lives in `window._rb2p_userIsWaitingForOpponent`, a plain boolean
written directly from **24** sites. Nothing sees a transition. Nothing can
refuse one. There is a turn ledger (`rooms/{code}/turn`, V336) but it is
consulted only by two exception handlers (TURN-HEAL, TURN-RESCUE). The pick-6
itself is six sticky flags spread across the thrower and the scorer with no
record of which steps happened.

The reported flicker has a concrete mechanism: the V280 overlay lift hides the
WAIT overlay whenever this device has "any live offensive formation while
flagged waiting" (`plOF >= 6`). After the scorer ships PAT_RESULT it parks in
WAIT — but its engine's post-PAT kickoff formation is still staged underneath.
The lift sees eleven players and hides the overlay; the park re-shows it;
repeat. The "hidden formation" and the "flicker" are the same bug.

## Part A — the possession ledger (V366)

### A1. One choke point for possession

`_rb2p_userIsWaitingForOpponent` becomes an accessor (`Object.defineProperty`
on `window`). All 24 writers keep their code; every write now passes through
one gate that:

- logs every transition as `POSS -> WAIT (caller)` / `POSS -> LIVE (caller)`
  with a caller tag taken from the stack, into diag and the audit stream;
- refuses `LIVE` while a conversion is owed by the other side (`patOwed()`
  strong signal and this device is the thrower), while the game is over, and
  while the turn ledger names the opponent with a claim fresher than 4s —
  each refusal named (`POSS-REFUSED …`), never silent;
- always accounts for itself: a no-op write (same value) is counted, not
  logged.

### A2. The conserved quantity: exactly one live device

The turn ledger is the truth; the local flag is a cache of it. A 250ms
**possession invariant** replaces the two exception handlers with one named
decision per tick:

- P1 stand down — the cascade / a live PAT owns possession.
- P2 stand down — a conversion is owed.
- P3 stand down — game over.
- P4 stand down — a transition happened in the last 3s (grace).
- `POSS-HEAL -> WAIT` — I am live, the ledger names the opponent, and the
  opponent's live push claims the ball and is newer than my take of offense
  (the existing V339 rule, kept verbatim).
- `POSS-RESCUE -> LIVE` — I am waiting, the ledger names me, the opponent's
  push is fresh and not claiming, for 8s (the existing rescue, kept).
- `POSS-DEAD` — both waiting for 12s with no cascade: the ledger owner is
  force-started, on either device, with the reason in the log.

### A3. The pick-6 ledger and its watchdog

The flags stay (rewriting them is how this gets worse). Alongside them a
per-cascade record `rooms/{code}/p6/{cascadeId}` written on both transports,
one field per step: `detected`, `sent`, `applied`, `modal`, `resolved`
(points), `resultSent`, `resultApplied`, `driveStarted`, each `{role, ts}`.

A watchdog on both devices reads the record every 2s and repairs a missing
step past its budget, by name:

| missing step | budget | repair |
|---|---|---|
| `applied` after `sent` | 12s | scorer: REST re-read of `outcomes/{thrower}` and apply (V364 poll already does this; the ledger now names it) |
| `modal` after `applied` | 3s | scorer: re-pop through the PICK6 applier (the V253 loop, made ledger-driven) |
| `resultSent` after `resolved` | 6s | scorer: synthetic PAT_RESULT (the guardian's send, now keyed to the ledger) |
| `resultApplied` after `resultSent` | 8s | thrower: REST re-read of `outcomes/{scorer}` and apply |
| `driveStarted` after `resultApplied` | 4s | thrower: `forceUserOffenseDrive`, regardless of `alreadyDriving` |
| scorer still staged after `resultSent` | — | no clearing: destroying the scene throws in the engine loop (measured). The scene is harmless under a SOLID cover; A4.3 keeps the cover solid |

### A4. The specific defects found in the audit

1. The conversion gate licences the engine's modal **on the thrower** (L1b)
   and its pre-pin claims possession, sets down 6 and moves the ball to the 2
   on the wrong device. New refusal `R4 this device threw the pick-6`.
2. The send-poll park restores possession and down but not the yard. It now
   restores the yard too (own 25). With R4 in place the thrower's PAT scene
   is never built, so there is nothing to clear.
3. The V280 overlay lift keys on `plOF >= 6` alone. It now requires the turn
   ledger to name this device (or `scorerPlayingPat`). A formation the ledger
   says is not mine never lifts the overlay — the flicker cannot occur.
4. `alreadyDriving` in the PAT_RESULT applier is replaced by the ledger:
   if `resultApplied` is set and `driveStarted` is not, the drive is forced.
5. (withdrawn) Clearing the scorer's field after PAT_RESULT threw in the
   engine loop in the harness — the controller step reads the ball every
   frame. The scene is harmless under a solid cover; A4.3 is the fix.

Existing suites stay green; new suite `e2e/v366-possession.js` covers the
gate, the invariant decisions, the ledger repairs, and the flicker.

## Part B — the game auditor (V365 + tools)

### B1. Telemetry v2 — an append-only stream per device

The diag ring is 11 lines; a game cannot be reconstructed from it. Each device
now appends to `rooms/{code}/audit/{role}/{seq}` over REST (the transport that
survived MSZT), batched every 1.5s. Entries are `{t, k, …}`:

| k | fields | when |
|---|---|---|
| `diag` | `m` | every diag line (gates, turn, sends, stalls) |
| `wait` | `on`, `why` | every possession transition (from A1) |
| `snap` | `q clk y d tg poss` | ball goes live |
| `settle` | `y d tg gain type name su so q clk` | the play-by-play settle |
| `score` | `su so dsu dso src` | any scoreboard change |
| `send` / `recv` / `ack` | `type ts su so y via` | outcome traffic |
| `q` | `from to clk` | quarter change |
| `ovl` | `shown why` | WAIT overlay shown / hidden |
| `stage` | `of df ball kp` | field census, on change, ≤ every 2s |
| `vis` / `fps` | `h` / `n` | visibility and frame rate changes |
| `conv` | `ev y` | modal / 1pt / 2pt / made / missed |
| `p6` | `step` | ledger steps |
| `final` | `su so` | game over |

### B2. `tools/audit-game.js <CODE>`

Pulls `audit/a`, `audit/b`, `outcomes`, `turn`, `p6`, `final`, `box`; merges
both devices into one timeline; runs the rules; prints a report; writes
`audits/<CODE>.json` and `.md`; on any flag writes `rooms/{code}/flag`.

Rules — each hyper-specific, each cites the raw entries it judged:

- **R-YARD** the settle yard equals the snap yard plus the gain, direction
  aware (a 15-yard pass from the 50 lands on the 35; `_6F` 0 → +15).
- **R-DOWN** down/toGo progression: gain ≥ toGo → 1st & 10; else down+1,
  toGo−gain; a 4th-down failure is followed by a possession change.
- **R-SCORE** deltas only in {1,2,3,6}; monotonic; both boards agree within 5s.
- **R-CLOCK** clock decreases within a quarter; a new quarter starts at the
  full clock; quarter monotonic, ≤ 5.
- **R-POSS** exactly one live device; every LIVE transition is preceded by a
  `recv` addressed to it or a match-start / quarter-keep; both waiting > 12s
  is a DEADLOCK flag; both live > 3s is a DOUBLE-OFFENSE flag.
- **R-P6** INT → PICK6 event ≤ 1s → PICK6 record ≤ 9s → scorer modal ≤ 3s at
  +48 → PAT_RESULT ≤ 90s → thrower drive ≤ 6s; zero duplicate modals.
- **R-CONV** conversion events only at +48 or +35.
- **R-OVL** > 3 overlay toggles in 5s is FLICKER; `of ≥ 6` while waiting for
  > 5s is HIDDEN-FORMATION.
- **R-XPORT** a `send` with no `ack` for 20s while the opponent's fps is
  fresh; any `FB-STALL`.
- **R-GATE** any `BALLGATE HOLD` outside a boundary; any `CONVGATE REFUSED`.
- **R-FINAL** both final boards equal.

### B3. Sweep protection

`sweepStaleRooms` never removes a room carrying `flag`, or one with an
`audit` stream and no `audited` marker. Flagged rooms are deleted by hand only.

### B4. Automation

`tools/audit-watch.js` polls every 60s for rooms with a `final` (or an audit
stream idle > 3 min) and no `audited` marker, runs the auditor, writes
`audited` (and `flag` when irregular). Installed as a LaunchAgent
(`com.rb2p.audit-watch`), like the token dashboard. `e2e/audit-selftest.js`
plays a harness game with injected irregularities and asserts each rule fires,
then a clean game and asserts none do.

## Order

1. V365: telemetry v2 + sweep protection (small, safe, ships first so the
   next real game is fully recorded).
2. `tools/audit-game.js`, `audit-selftest`, `audit-watch`, LaunchAgent.
3. V366: possession gate, invariant, pick-6 ledger + watchdog, the five
   defects, `v366-possession` suite.
4. Full gate, push, verify live, then audit the next real game.
