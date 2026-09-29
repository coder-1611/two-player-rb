# NEVER FREEZE — the job

You are working on **two-player Retro Bowl** in `/Users/sohamsthitpragya/rb2p/two-player-rb`, and only there. `~/Projects/two-player-rb` is an old, stale clone: never edit it.

**The job:** make it impossible for a two-player game to freeze. Prove it, and keep proving it in production, **without making the game one bit less accurate.**
- The owner has watched 416 versions of partial fixes. "Better" is not done; done is §6, shown with printed output.
- Work on your own. Don't ask the owner to playtest, and don't ask them to decide anything this file already decides.

**Why this can work when 416 versions didn't.** Every past fix targeted one shape of "stuck". The next shape looked exactly the same to players, so it read as "still broken" (FREEZE-ANATOMY.md §4). This time:
- Detect a freeze the way a finger experiences it, whatever caused it.
- Recover through one authority that follows the owner's restore rule.
- Give every wait a deadline.
- Prove it against a matrix of real faults at every game moment.
- Measure frozen seconds in every real game from then on.

## 1. The system in 60 seconds

- **The bridge.** `index.html` is an ~18,000-line bridge. It turns `retrobowl.js`, a minified single-player GameMaker engine, into a two-phone game over Firebase RTDB `realretrobowl2p-default-rtdb`. Each human plays their own offense on their own phone; the other phone waits under a cover.
- **Four doors serve the same build:**
  - two-player-rb.vercel.app (canonical)
  - coder-1611.github.io/two-player-rb/
  - realretrobowl2p.web.app
  - the Google Sites embed. It is RTDB `embedcode/selfcontained`, published automatically by the LaunchAgent `com.rb2p.embed-watch`. `tools/embed-publish.sh` also deploys the web.app door.
- **The players** are school kids on Chromebooks and phones, 9 AM–2 PM Central on school days. They hide the tab constantly: bells, closed lids, classroom locks.
- **Telemetry.** Every game streams to `rooms/{code}/audit/{a,b}`.
  - The LaunchAgent `com.rb2p.audit-watch` audits each finished game with `tools/audit-game.js`. The rules live in `tools/audit-rules.js`; the archive is `audits/*.json`.
  - `game-transcripts/` shows every game in plain words.
- **Deploys and live games.**
  - A deploy never touches a game in progress: a phone keeps the build it loaded.
  - But two phones in one room can run different builds, so every wire change must work with the previous build.
  - Database rule changes and data deletions hit live games immediately.

## 2. Read before you touch anything

1. `CLAUDE.md` in the repo: the version-label rule, the commit+push rule, no engine-AI offense, and the verification ladder.
2. `FREEZE-ANATOMY.md`, above all §5: engine state says "healthy" while the screen is dead.
3. `PLAN-XEDG-FOREVER.md`, laws 1–22. Every law is a past freeze or corruption. Regress none of them.
4. Memory, in `~/.claude/projects/-Users-sohamsthitpragya-Projects/memory/`:
   - `rb-possession-ledger-auditor.md` (V365–V416; read V395–V415 closely)
   - `rb-freeze-root-cause.md`
   - `rb-firebase-dual-transport.md`
   - `rb-real-players.md`
   - `verify-engine-model-before-simulating.md`
   - `rb-qb-bot.md`
5. Tools and tests:
   - `tools/audit-rules.js`, `tools/audit-game.js`, `tools/audit-watch.js`
   - `e2e/README.md`, `e2e/two-player.js`, `e2e/scenario.js`, `e2e/qb-bot.js`
   - the newest suites, `e2e/v414-field-restore.js` and `e2e/v415-freezes.js`

`PAT.md`, `get-ready.md` and the pick-six-research skill describe V48–V238 code, and their line numbers are stale. Where they disagree with the current source, the source wins.

## 3. Definitions — use exactly these

**Must-act phone.** The phone whose human has to do something for the game to move:
- the offense before the snap;
- the scorer choosing or playing a conversion;
- the kicker;
- the phone the shared turn record names after a hand-off.

**Can act.** On the must-act phone, a real finger would move the game forward right now. That means all of these:
- the page is visible and online;
- the frame loop is advancing (a measured frame-to-frame delta, not an fps counter);
- the canvas is the top element at the ball, QB or button point (`document.elementFromPoint`);
- the engine is in a state that takes that input: a formation that takes the snap drag, a conversion modal with its buttons, or a kick meter;
- the engine's pointer state isn't wedged.

A known transition counts as can-act only up to its measured maximum. The transitions are: TD replay, kickoff or punt in the air, quarter change, halftime, and the post-horn dwell. Measure each one in the engine and write the table down.

**Freeze (our fault).** Any of these:
- **(a)** the must-act phone is visible and online, and cannot act for more than 10 s;
- **(b)** both phones are waiting, or both are on offense, for more than 10 s while both are visible and online;
- **(c)** a phone comes back (visible and online again) and its game hasn't resumed within 10 s;
- **(d)** the game is decided (Q4 or OT over) and a visible phone isn't showing the stats screen within 20 s;
- **(e)** taps reach the page, but the engine registers none for 10 s while it should accept input;
- **(f)** a visible phone goes silent (its heartbeat stops with no pagehide). Treat it as suspect until the evidence shows otherwise. Check for a page hang or crash: memory growth, long tasks, a burst of errors in the last diag before the silence.

Keep 10 s and 20 s as named constants. Tighten them if the measured transitions allow.

**Not a freeze (the player's doing).** All three must hold:
- the must-act phone is hidden, closed or offline;
- the other phone says so honestly: SCREEN IS OFF, LEFT THE GAME, or STOPPED RESPONDING;
- (c) holds when they come back.

Never "fix" this by taking the ball from them.

**Accuracy.** True in every game, including right after a recovery:
- **Points** come only from a scene a human played on their own phone. No AI offense, no `Math.random` outcome, no auto-credit, no invented or skipped play.
- **Possession** changes only by football (a score, turnover, punt, downs, the halftime law, OT rules) or by the owner's restore rule:
  > On a freeze, possession goes back to how it was the last time the game was not frozen — same yard line, down and distance — unless the ball legitimately changed hands after that.
- **The clock** only goes down within a quarter (the V382 clock law). A recovery never rewinds it.
- **Both phones agree** after every hand-off: score, quarter, clock (±1 s), possession, yard line and down.
- **Conversions.** The scorer plays their own conversion. The only unplayed result is the existing wall rule (MISSED). The wall counts only time when the scorer's screen was on with a usable modal.
- **No feature is removed or simplified** to dodge a freeze. Pick-sixes, conversions, OT, onside kicks, audibles, rematches, quarter lengths and difficulty all stay.

**Complete.** The stats screen appears after Q4 or OT ends, on each phone still present.

## 4. Never — each of these was tried and failed, or was rejected

- **No escape hatch.** No END GAME, skip, "restart drive" or "continue" button. The owner rejected one in V410: fix the stuck state itself.
- **No trading accuracy for liveness** (see §3).
- **No new watchdog that acts on its own.** Most bugs from V380 to V415 were a stray actor making a decision that wasn't its to make:
  - two rescuers acting on the same moment;
  - a 300 s timer from an old pick-six firing into a new one;
  - a guard left set after a recovery. In VJGW, a stale send guard swallowed every hand-off for 5½ minutes while the engine's AI ran the offense.
- **No latch, flag, queue or timer without an owner, a deadline and an expiry action.**
- **No proxy verification.**
  - Engine counters (kp, OF/DF, Vy) read healthy on a dead screen.
  - Harness green is not phone green: 60 versions of the GET READY freeze.
  - A mock of the engine that is wrong in one detail proves nothing: 25 versions of pick-six.
  - Test against the real engine and real Firebase.
- **No one-sided diagnosis.** Merge both phones' timelines with `node tools/audit-game.js CODE` before concluding anything.
- **Never delete a real player's room or audit data.** The only rooms you may delete are ones your own harness made ("Phone A" / "Phone B"), through its own cleanup.
- **No database-rule or data-shape change that breaks a phone on the previous build.**
- **No test traffic in the owner's numbers.**
  - Run bots only against the local server (it is excluded from the visit counter), never against the public doors.
  - Keep harness games out of the game, visit and freeze stats.
  - When the matrix is done, delete the anonymous auth accounts your runs created (see rb-real-players.md), and none of the players' accounts.
- **Don't ask the owner to playtest.** Real games are the device evidence, and every one is recorded.

## 5. The work, in order

Keep `FREEZE-LEDGER.md` (repo root) current as you go: the phase you're in, findings, what shipped, and matrix status. It is your memory across context compaction.

### Phase 0 — Baseline (read-only)

1. **Audit** every real game since V395: the `audits/` archive plus the rooms in RTDB, leaving out harness rooms.
2. **Read complaints.** Read every complaint in `complaints/` that ticks any of these:
   - "Game froze or ended early"
   - "Stuck on 'waiting for opponent'"
   - "Taps / drags don't work"
   - "Wrong team has the ball"
   - "Opponent's play never showed up"
3. **Classify.** A game needs a class if it has any of: an impact-3 flag, a freeze complaint, or a recovery firing. The recovery guards are: field-restore, field-park, field-owe, keep-fresh, try-over, final-forced, post-conv-handoff, ot-td-conversion, ot-td-handoff, empty-field, held, p6-watch-retired. Give it one class, with the raw timeline lines as evidence:
   - **real freeze**;
   - **near miss** (a recovery fired, so the main path failed);
   - **player's doing**;
   - **checker mistake**.
4. **Ledger rows.** In the ledger, write one row per root cause: the games, the evidence, the mechanism and the status. Every freeze maps to a row. Nothing stays "unexplained".
5. **Report.** Tell the owner the baseline in plain words, with numbers per version.

### Phase 1 — Make freezes measurable on real phones

- **Can-act monitor.** Put one on every phone (per §3), checking at most once a second.
  - It logs an audit entry only when the answer changes: must-act, can-act, and why not.
  - The "why not" values: hidden, covered by #element, no frames, engine not taking input (with Vy and kp), modal missing, pointer wedged, or the transition's name.
  - Also count taps that reached the page against presses the engine registered.
- **Checker rule R-FREEZE.** Frozen seconds per game by §3 (a–f), from the merged timeline.
- **Checker rule R-RESTORE.** Every recovery obeyed the restore rule and changed no score, no clock upward, and no down or distance.
- **Self-test.** Add injected cases for both rules to `e2e/audit-selftest.js`.
- **Transcripts page.**
  - Show frozen seconds for each game.
  - Add a freeze counter (today / last 7 days / since the fix) to the Who-is-playing card.
  - `tools/audit-watch.js` keeps both current.

### Phase 2 — One guarantee instead of more patches

Write the design into the ledger first. Hand it to a subagent whose only job is to find a path to a freeze or to an accuracy loss. Fix the design; then build. It must have all five properties:

1. **Every wait has a deadline.**
   - List every latch, flag, pending/held/deferred record and timer in `index.html` that can block a snap, a hand-off, a modal or the stats screen.
   - Put each one in a single registry with: owner, set and clear sites, maximum lifetime, expiry action.
   - Add a static check in `tools/`, run by the suite. It fails when a new `window._rb2p_*` flag is in neither the registry nor a non-blocking list with a one-line reason.
   - Every recovery resets through the registry, so no recovery can leave a stale guard again.
2. **One recovery authority.** Every recovery goes through one choke point: restore, park, re-stage, re-send, conversion re-offer, and the forced final. The authority:
   - decides from the *shared* record, using the restore rule, so both phones reach the same answer;
   - refuses while another recovery or a real hand-off is in flight;
   - resets the registry;
   - logs a `guard` audit entry with the reason and the before/after state.

   These existing watchers become detectors that ask the authority to act, instead of acting themselves:
   - TURN-RESCUE, P6-WATCH, EMPTY-FIELD, the field check, the keep gate
   - the 35 s wall, the post-conversion and OT-TD watchers
   - the stuck-drive watchdog and the delivery re-send

   Move them one at a time, with the suites green after each.
3. **Can-act is the trigger, not engine state.** The authority acts when §3 says frozen, whatever the cause, including causes nobody has seen yet. Known causes still get fixed at their root; the authority is the net under them.
4. **Resume is a first-class path.** Screen-on, reconnect, reload and rejoin rebuild state from the shared record. Each reaches can-act, or the honest wait, within 10 s.
5. **Accuracy is enforced at runtime.** The authority refuses, and logs, any action that would change the score, raise the clock within a quarter, or move possession against the restore rule.

### Phase 3 — Prove it

Build `e2e/chaos.js`: real two-player games (two pages, live Firebase) with bots playing through real input (`e2e/qb-bot.js`: `playGame`, `playOne`, `kickOne`).
- `e2e/scenario.js` may set up preconditions: clock, score, ball spot.
- `window._rb2p_testPick6Live` may create a pick-six.
- But the moment under test must run through the real engine and the real hand-off.
- If a moment can't be produced in the real engine, say so in the ledger with the reason. Don't fake it with a mock.

**Faults.** Check that each fault really took effect; for example, that writes actually stop landing on the server. A fault that silently didn't apply makes its green cell meaningless.
- **Screen off:** visibilitychange hidden plus CDP `Page.setWebLifecycleState` frozen, then back.
- **Network off on both paths:** CDP offline plus `_rb2p_FB.goOffline(_rb2p_db)` (the seam `e2e/v364-transport.js` uses).
- **One path dead:** the SDK socket dead while REST works, and the reverse.
- **Reload** mid-moment.
- **Close and rejoin,** by code and by invite link.
- **Hand-off trouble:** delayed 5–40 s, duplicated, or reordered.
- **CPU throttled 6×** (a Chromebook).
- **Clock skew:** one phone's clock off by ±30 s.
- **Both phones hidden** at once.
- **The opponent never comes back.** The other phone must show the honest status and must not take the ball.

**Moments.**
- **Plays:** pre-snap; mid-play; play end.
- **Scores:** TD replay; conversion modal up; 1-pt kick in the air; 2-pt try; pick-six (the thrower's side, the scorer's conversion, and the result coming back); field goal; safety.
- **Possession changes:** punt; turnover on downs; fumble; onside kick; kickoff.
- **Clock:** the Q1→Q2 horn; halftime, including a try that crosses the horn; Q3→Q4.
- **Endings:** decided end of regulation → stats screen; tied → OT; OT touchdown (conversion, then hand-off); OT end → stats screen.
- **Lobby:** rematch on the same code; the host's seat blinking at join.

**The oracle for every run:**
- **No freeze by the new monitor.** No §3 freeze.
- **No freeze by the harness either, measured on its own.** Within 10 s of the fault clearing, the must-act page passes `elementFromPoint` at the ball, and a real bot input moves the game.
- **Both phones agree** on score, quarter, clock, possession and spot.
- **The final score** equals the scoring plays in the audit stream.
- **The checker is clean.** R-FREEZE and R-RESTORE are clean, and no R-SCORE, R-CLOCK, R-GIFT, R-CONT, R-YARD or R-DOWN flag was caused by a recovery.

**The bar:**
- **Chromium:** every fault × moment cell runs at least 3 times with 0 failures, in Chromium with mobile emulation. The matrix is big on purpose; run cells in parallel browsers.
- **WebKit, because iPhones are real players too:** the network and reload rows, and screen-off as far as WebKit allows. Use Playwright; install it in a scratch directory if it's missing.
- **Soak:** at least 10 full games (1-minute quarters) with a random fault every 20–60 s.
  - Every game reaches a complete, accurate stats screen on both phones.
  - The JS heap does not keep growing.
- **Replays:** a replay test for every ledger row, built from its real recorded sequence.
- **Existing suites:** every one green — `e2e/v*.js`, `node e2e/run.js` and `node e2e/audit-selftest.js`.
- **Flakes:** a flaky cell is a failing cell. Find out why.

Last, give a subagent that had no part in the build the chance to break it, using faults you didn't list. Then rerun the whole matrix on the final build and print it.

### Phase 4 — Ship

Ship in small steps, each with its suites green. For every commit:
- **Version label.** Bump `V<N>` in both places in `index.html`: `GAME — V<N>` and `class="o">V<N><`. N = `git rev-list --count HEAD` + 1. The label text in CLAUDE.md is an old example; these two spots are current.
- **Stage** only your own paths. Never `git add -A e2e/`: `e2e/node_modules` is a symlink.
- **Commit** as `Soham Sthitpragya <sohamsthitpragya@Sohams-Mac-mini.local>` (every V-commit uses this identity, and Vercel deploys it fine). End with the Co-Authored-By line your session specifies. Then push.
- **Verify all four doors** serve the new label:
  - curl Vercel;
  - curl GitHub Pages and check `gh run list`;
  - curl realretrobowl2p.web.app;
  - read `embedcode/meta.json` for `ver`.

### Phase 5 — Watch production

Every school day, check the freeze counter. Any of these reopens the loop:
- a real game with frozen seconds above 0;
- a recovery firing;
- a freeze complaint.

The loop:
1. Run `node tools/audit-game.js CODE`.
2. Classify it.
3. Find the root cause.
4. Add its replay test.
5. Fix it.
6. Rerun the matrix.
7. Ship.

A recovery that fired is a root cause still alive. Push those toward zero too.

## 6. Done means all of these

- The final build's matrix, soak and replays printed with 0 failures, and every suite green.
- The final build live on all four doors.
- R-FREEZE, R-RESTORE and the freeze counter live.
- `FREEZE-LEDGER.md` complete: every class fixed at its root and covered by a test, and nothing unexplained.
- The first 100 real games on the final build, or three school days if that is later, with 0 frozen seconds from our side. If those games haven't happened yet, finish everything else, say so plainly, and leave the watch running.

## 7. How to report

- Use plain words.
- Give every number with its source: command output or audit lines.
- Say what's done, what isn't, and what failed — never "should work".
- If two checks disagree, it isn't verified: show both.
- When you ship, add what you learned to the memory file `rb-possession-ledger-auditor.md`.
