# NEVER FREEZE — the job

You are working on **two-player Retro Bowl**, repo `/Users/sohamsthitpragya/rb2p/two-player-rb`. `~/Projects/two-player-rb`, `~/rb2p/wt-difficulty` and `~/rb2p/wt-halftime` are old, stale clones: never edit them.

Don't edit in the main tree's working copy either. The `com.rb2p.embed-watch` LaunchAgent builds the Google Sites embed and realretrobowl2p.web.app from that working copy, uncommitted edits included, within 2 minutes of any new Vercel label.
- Work in a worktree instead: `git worktree add -b neverfreeze ~/rb2p/wt-neverfreeze origin/main`, then link `e2e/node_modules` from the main tree.
- Run the test server on its own port (`RB_E2E_PORT`, e.g. 8791). The harness reuses whatever already answers on 8790, which may be serving the main tree.
- Rebase on `origin/main`, never force, and push with `git push origin HEAD:main`. Leave the main tree to the watcher's `git pull --ff-only`.

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
3. `PLAN-XEDG-FOREVER.md`, laws 1–22. Every law is a past freeze or corruption. Regress none of them, and none of the older fixes that aren't laws:
   - V284/V285: every `window._di5` frame raced against an 83 ms timeout;
   - V287: the engine's `_hi5`/`_ji5` error handlers stay removed, and the `_pY2` sentinel stays;
   - V247/V280: the pick-six scorer plays its conversion uncovered while flagged waiting;
   - V279: no auto-reload;
   - V293: the parked engine's clock pin;
   - V299: onside kicks stay off.
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

**Must-act phone.** The phone whose human has to do something for the game to move, or on whose screen the game is moving:
- the offense from the moment it has the ball until its drive ends: before the snap, during the play, and between plays;
- the scorer choosing or playing a conversion;
- the kicker;
- the phone the shared turn record names after a hand-off.

**Can act.** On the must-act phone, a real finger would move the game forward right now. That means all of these:
- the page is visible and online;
- the frame loop is advancing (a measured frame-to-frame delta, not an fps counter);
- the canvas is the top element at the ball, QB or button point (`document.elementFromPoint`);
- the engine is in a state that takes that input: a formation that takes the snap drag, any engine dialog with live buttons (the `obj_button*` family: 4th-down Go / Punt / Field Goal, 1 PT / 2 PT, Continue; plus `obj_btn_fieldgoal`), or a kick meter. Enumerate them from `retrobowl.js` into the ledger. A state in neither this list nor the transition table counts as cannot-act, and must be added to one of them before any recovery may key on it;
- the engine's pointer state isn't wedged.

A known transition counts as can-act only up to its measured maximum. The transitions include at least:
- the play from snap to whistle;
- whistle to the next formation;
- the hand-off in transit (send → apply → formation on the receiver);
- the pick-six cascade up to the scorer's modal;
- TD replay;
- kickoff or punt in the air;
- quarter change;
- halftime;
- the OT coin flip;
- a timeout;
- the post-horn dwell.

Each maximum is the largest value seen in at least 20 measured occurrences (real games' `stage` entries, or harness runs), plus at most 1 s, with the source cited. A transition longer than 10 s is a freeze to fix, not a reason to raise the bar. Compute the ball, QB and button points through the mobile rotation and remap (`__rbRemapPointer`, `__rbVirt`), not the unrotated canvas box.

**Freeze (our fault).** Any of these:
- **(a)** the must-act phone is visible and online, and cannot act for more than 10 s;
- **(b)** for more than 10 s while both phones are visible and online, no phone is must-act, or both think they are. Judge this by must-act/can-act, not by the WAIT flag: the pick-six scorer plays its conversion while flagged waiting (V247/V280), and that exception must stay;
- **(c)** a phone comes back (visible and online again) and its game hasn't resumed within 10 s;
- **(d)** the game is decided (regulation or OT is over, no conversion is owed, and the score isn't tied) and a visible phone isn't showing the stats screen within 20 s. Never force the final over an owed conversion; check whether today's `final-forced` does;
- **(e)** taps reach the page, but the engine registers none for 10 s while it should accept input;
- **(f)** a visible phone goes silent (its heartbeat stops with no pagehide). Treat it as suspect until the evidence shows otherwise. Check for a page hang or crash: memory growth, long tasks, a burst of errors in the last diag before the silence.

Keep 10 s and 20 s as named constants. Tighten them if the measured transitions allow.

**Not a freeze (the player's doing).** All three must hold:
- the must-act phone is hidden, closed or offline (offline = neither REST nor the SDK can land a write, judged from the server side);
- for that same second, the other phone says so honestly: SCREEN IS OFF, LEFT THE GAME, or STOPPED RESPONDING (today it can fall back to WAITING FOR OPPONENT from about 12 s to 90 s after a phone freezes: compare `_rb2p_oppHidden()` with `_rb2p_oppSilentMs()`);
- when they come back, their game resumes within 10 s (no (c) freeze).

Every second the must-act phone cannot act counts as frozen unless all three held for that second; there is no third category. Never "fix" this by taking the ball from them or ending the game. When a wait on a hidden, departed or silent partner runs out, the only action is the honest status.

**Accuracy.** True in every game, including right after a recovery:
- **Points** come only from a scene a human played on their own phone. No AI offense, no `Math.random` outcome, no auto-credit, no invented or skipped play.
- **Possession** changes only by football (a score, turnover, punt, downs, the halftime law, OT rules) or by the owner's restore rule:
  > On a freeze, possession goes back to how it was the last time the game was not frozen — same yard line, down and distance — unless the ball legitimately changed hands after that.
- **The clock** only goes down within a quarter (the V382 clock law). A recovery never rewinds it.
- **Both phones agree** after every hand-off: score, quarter, clock (±1 s), possession, yard line and down.
- **Conversions.** The scorer plays their own conversion. The only unplayed result is the existing wall rule (MISSED). The wall counts only seconds when the scorer could act on the conversion: screen on, frames advancing, and the 1 PT / 2 PT modal, the 2-pt formation or the kick meter usable at its hit-test point. The existing limits stay: 35 s; up to 90 s from the offer while the choice is on screen; +20 s for a launched try.
- **No feature is removed or simplified** to dodge a freeze. Pick-sixes, conversions, OT, audibles, timeouts, rematches, quarter lengths and difficulty all stay. Onside kicks were removed at the source in V299 as a freeze fix; leave them off.

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
- **Never delete a real player's room or audit data.** The only rooms you may delete are ones your own harness made, through its own cleanup. A harness room is one whose every `bind` audit entry has `src:'local'` and whose `names` are "Bot A"/"Bot B"/"Harness". "Phone A/Phone B" is just the transcripts page's label for any room without team names, real ones included. Harness room codes must contain a digit, which real codes never do (`generateRoomCode` uses letters only). Never pre-delete a code that already exists: `startTwoPlayerGame` does that today (`e2e/two-player.js`, `deleteRoom(code)` before hosting).
- **No database-rule or data-shape change that breaks a phone on the previous build.**
- **No test traffic in the owner's numbers.**
  - Run bots only against the local server (it is excluded from the visit counter), never against the public doors.
  - Keep harness games out of the game, visit and freeze stats. Filter on the harness marker above in `tools/audit-watch.js`, `tools/alltime-stats.js`, the transcripts page and the freeze counter. Audit chaos rooms into the scratchpad: `tools/audit-game.js` writes `audits/` even with `--dry`.
  - Don't mint accounts per page. Each harness page load can sign up anonymously twice (REST and SDK), and Firebase's per-IP sign-up limit (TOO_MANY_ATTEMPTS_TRY_LATER) will fail a matrix this size. Give each phone slot a persistent profile so its accounts are reused. Record every uid a run creates as it's created, and delete exactly that list at the end. Never delete by creation-time window: real players sign up in the same school hours.
- **Don't ask the owner to playtest.** Real games are the device evidence, and every one is recorded.

## 5. The work, in order

Keep `FREEZE-LEDGER.md` (repo root) current as you go: the phase you're in, findings, what shipped, and matrix status. It is your memory across context compaction.

### Phase 0 — Baseline (read-only)

1. **Audit** every real game since V395: the `audits/` archive plus the rooms in RTDB, leaving out harness rooms.
2. **Read complaints.** Complaints live in RTDB `complaints/{ts}_{rand}`, not in the repo; read them with the token from `tools/fb-auth.js`. Read every one that ticks any of these, or whose free text mentions freezing, being stuck, waiting, or taps not working:
   - "Game froze or ended early"
   - "Stuck on 'waiting for opponent'"
   - "Taps / drags don't work"
   - "Wrong team has the ball"
   - "Opponent's play never showed up"
3. **Classify.** A game needs a class if it has any of: an impact-3 flag, a freeze complaint, or a recovery firing. A recovery fired when the stream has any of:
   - `guard` field-restore, field-park, field-owe, keep-fresh, try-over, final-forced, post-conv-handoff, ot-td-conversion, ot-td-handoff or empty-field;
   - `guard` rescue, unless it has `ok:false`;
   - `guard` fallback300 with why `fired`;
   - on V410–V413 games, `guard` field-check, silent-rescue or end-by-player;
   - a `conv` entry with `wall:true`;
   - the diag lines `TURN-RESCUE -> offense`, `P6-WATCH no drive 4s after PAT_RESULT — forcing it`, `P6-FALLBACK 300s`, `DEAD-OPP END`, `QTR-KEEP #3`, `QTR-KEEP LOOP`, `DELIVERY re-send`, `EMPTY-FIELD re-staged` or `FINAL forced`.

   `guard held` (a hidden phone holding a hand-off), `p6-watch-retired` and `force-drive` are stand-downs, not recoveries. Give it one class, with the raw timeline lines as evidence:
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
- **Checker rule R-FREEZE.** Frozen seconds per game by §3 (a–f), from the merged timeline. First make the timeline able to show a freeze:
  - audit batches retry until the server accepts them, and survive a reload, with a gap marker when entries were lost (today a failed flush is dropped);
  - each batch carries a server time (`{".sv":"timestamp"}`), so the checker can correct each phone's clock offset.

  A visible must-act phone with no entries counts as *unknown*, never as 0 frozen seconds.
- **A second, independent measure.** For every game, also compute the gap from a phone becoming must-act (its `wait` goes off, a hand-off applies, a conversion is offered) to its next real input (`snap`, a kick, a conversion choice) while `vis` says visible. This must not use the new monitor. If the two measures disagree by more than 2 s, the game isn't verified: show both.
- **Checker rule R-RESTORE.** After every recovery, possession, yard line, down and distance equal the restore-rule answer: the last not-frozen state, moved only by a later legitimate change of hands. Those are a sent or applied hand-off, a score (the conversion, then the kickoff), or the halftime or OT law. The score is unchanged, and the clock is no higher than before within the quarter.
- **Self-test.** Add injected cases for both rules to `e2e/audit-selftest.js`. Also prove the monitor itself in real pages on the mobile layout. Each of these must produce the right "why not" within 2 s, and each removal must bring back can-act:
  - a 40×40 px element placed over the computed ball point;
  - a stalled frame loop;
  - a wedged pointer;
  - a missing modal.

  A monitor never seen to say "cannot act" proves nothing.
- **Transcripts page.**
  - Show frozen seconds for each game.
  - Add a freeze counter (today / last 7 days / since the fix) to the Who-is-playing card.
  - `tools/audit-watch.js` keeps both current.

### Phase 2 — One guarantee instead of more patches

Write the design into the ledger first. Hand it to a subagent whose only job is to find a path to a freeze or to an accuracy loss. Fix the design; then build. It must have all five properties:

1. **Every wait has a deadline.**
   - List every latch, flag, pending/held/deferred record and timer in `index.html` that can block a snap, a hand-off, a modal or the stats screen.
   - Put each one in a single registry with: owner, set and clear sites, maximum lifetime, expiry action.
   - Add a static check in `tools/`, run by the suite. It fails on any name, existing or new, that is in neither the registry nor a non-blocking list with its own one-line reason (no blanket "legacy" entry). It covers:
     - `window._rb2p_*` (366 today);
     - closure-scoped guard variables (e.g. `fieldEmptyChecks`, `gameOverConfirmTicks`);
     - `sessionStorage` and `localStorage` keys (`rb2p_lastGood`, `rb2p_matchLive`, `rb2p_skipResumeOnce`, `rb2p_pendingInt`, …);
     - the RTDB records that gate play (`turn`, `p6`, patDuty, `held`/`heldTs`, `ot/p{n}`).
   - Every recovery resets through the registry, so no recovery can leave a stale guard again.
2. **One recovery authority.** Every recovery goes through one choke point: restore, park, re-stage, re-send, conversion re-offer, and the forced final. The authority:
   - decides from the *shared* record, using the restore rule, so both phones reach the same answer. Publish the last-good state to the room; today `_rb2p_lastGood` lives only in each phone's sessionStorage;
   - refuses while another recovery, on either phone, or a real hand-off is in flight. The lock must work over REST alone (a conditional write with `X-Firebase-ETag` and `if-match`), because the SDK socket is the path most often dead;
   - resets the registry;
   - logs a `guard` audit entry with the reason and the before/after state.

   These existing watchers become detectors that ask the authority to act, instead of acting themselves:
   - TURN-RESCUE, P6-WATCH, EMPTY-FIELD, the field check, the keep gate
   - the 35 s wall, the post-conversion and OT-TD watchers
   - the stuck-drive watchdog and the delivery re-send
   - the 300 s pick-six fallback, DEAD-OPP END (V337), the forced final and the native-end fallback, and `glLostRecover`
   - every other caller of `forceUserOffenseDrive` and writer of `_rb2p_userIsWaitingForOpponent`

   No recovery may reload the page: the owner ruled "auto reload doesn't count" (V279). No recovery may end the game before the horn.

   Move them one at a time, with the suites green after each.
3. **Can-act is the trigger, not engine state.** The authority acts after `T_ACT` seconds of cannot-act outside the transition table, whatever the cause, including causes nobody has seen yet. `T_ACT` is a named constant: long enough that a momentary blip never triggers it, and short enough that detection plus the measured recovery time stays under `T_FREEZE` (10 s). A recovery that restores can-act before `T_FREEZE` is a near miss: it is logged, and its root cause still gets fixed. Only cannot-act past `T_FREEZE` is a freeze. Known causes still get fixed at their root; the authority is the net under them.
4. **Resume is a first-class path.** Screen-on, reconnect, reload and rejoin rebuild state from the shared record. Each reaches can-act, or the honest wait, within 10 s.
5. **Accuracy is enforced at runtime.** The authority refuses, and logs, any action that would change the score, raise the clock within a quarter, or set possession, spot, down or distance to anything but the restore-rule answer. When no not-frozen state exists yet (the opening kickoff, the start of OT), the answer is the receiver in the shared kickoff or coin-flip record. Each random draw (the kickoff spot, the OT coin flip) is made once, stored in the shared record and reused; a recovery never draws again.

### Phase 3 — Prove it

Build `e2e/chaos.js`: real two-player games (two pages, live Firebase) with bots playing through real input (`e2e/qb-bot.js`: `playGame`, `playOne`, `kickOne`).
- `e2e/scenario.js` may set up preconditions before the moment starts, with `setClock`, `setScore` and `setBall` only. Never produce the moment with `forceDriveEnd`, `forceTurnover` or `addPoints`.
- `window._rb2p_testPick6Live` cannot create a two-phone pick-six: it stubs `_twoPlayer.send` and restores all state afterwards. Make real ones instead: `setBall` puts the thrower's offense near its own goal line, and the bot throws into the nearest defender until the engine returns an interception for a touchdown. Safeties and fumbles are made the same way, with a precondition plus real play and retries.
- The moment under test must run through the real engine and the real hand-off.
- A moment may be marked "can't be produced" only with the engine line that makes it impossible in this fork. Difficulty is not a reason.
- A replay test takes two real pages through the ledger row's recorded moment, with its recorded fault timings, and cites the recorded lines it reproduces. A synthetic timeline fed to the checker is a checker test, not a replay.

**Faults.** Check that each fault really took effect, with evidence read from outside the page: the server's `hb/{role}.ts`, `live/{role}.ts` and `outcomes/{role}` over REST from Node, plus the page's own `document.visibilityState` and rAF count. A fault that silently didn't apply makes its green cell meaningless. Don't reuse the old shims: the `Object.defineProperty(document,'hidden')` fake stops nothing, and the harness's `--disable-*background*` launch flags keep a hidden page's timers at full speed. Past Chrome's active-WebGL-context limit the oldest context is lost, and `glLostRecover` reloads that page, so give each game its own browser process and each parallel run its own `RB_E2E_PORT`.
- **Screen off, phone lock:** `Page.setWebLifecycleState` `frozen` (this fires the hidden transition itself), then `active`, then an explicit re-show. `active` alone may leave the page hidden, so assert `visibilityState === 'visible'` before the 10 s clock starts.
- **Screen off, Chromebook tab in the background:** truly hidden in a browser launched without the anti-throttling flags, so timers throttle and rAF stops. Hold it from 10 s to 6 min (intensive throttling starts at 5 min).
- **Network off on both paths:** CDP offline plus `_rb2p_FB.goOffline(_rb2p_db)` (the seam `e2e/v364-transport.js` uses).
- **One path dead:** the SDK socket dead while REST works, and the reverse. "Dead" means half-open: drop the RTDB WebSocket's frames in both directions while it stays open, so the SDK never notices. That is MSZT's shape. `goOffline` is the friendlier, clean case, and CDP offline may not touch WebSockets at all.
- **Reload** mid-moment.
- **Close and rejoin,** by code and by invite link.
- **Hand-off trouble:** the outcome record alone, on both transports, is delayed 5–40 s, duplicated, or reordered, while heartbeats and live pushes keep flowing. Blocking everything from the sender is the network-off row.
- **CPU throttled 6×** (a Chromebook).
- **Clock skew:** one phone's clock off by ±30 s.
- **Both phones hidden** at once.
- **The opponent never comes back.** The other phone must show the honest status, must not take the ball, and must not end the game.
- **The engine's own freezes:** rAF stops while timers run; a frame throws; a stray `_5B()` game_end mid-match; WebGL context lost (`WEBGL_lose_context`).
- **Input:** a touch that never ends (the slot-0 wedge); a touchcancel mid-drag; a tap shorter than one frame.
- **Layout:** portrait↔landscape rotation, and a transient 0×0 resize, mid-moment.
- **The same seat open in two tabs.**
- **Mixed builds:** one phone on the previous shipped build all game (serve the last V-commit on a second port), and one phone reloading onto the new build mid-game.

**Moments.**
- **Plays:** pre-snap; mid-play; play end.
- **Scores:** TD replay; conversion modal up; 1-pt kick in the air; 2-pt try; pick-six (the thrower's side, the scorer's conversion, and the result coming back); field goal; safety.
- **Possession changes:** punt; turnover on downs; fumble; interception (not returned); kickoff.
- **Clock:** the Q1→Q2 horn; halftime, including a try that crosses the horn; Q3→Q4.
- **Endings:** decided end of regulation → stats screen; tied → OT; OT touchdown (conversion, then hand-off); OT end → stats screen.
- **Lobby:** rematch on the same code; the host's seat blinking at join.

**The oracle for every run:**
- **No freeze by the new monitor.** No §3 freeze.
- **No freeze by the harness either, measured on its own.** Within 10 s of the fault clearing, the must-act page passes `elementFromPoint` at the ball, and a real bot input moves the game. That means the page logs its own snap, kick or conversion choice, and a screenshot 1 s later differs from one taken before it around the ball (FREEZE-ANATOMY §5, check 4).
- **Both phones agree** on score, quarter, clock, possession and spot, on what each phone *shows*:
  - the parked phone's cover (`#rb-wait-myscore`, `#rb-wait-oppscore`, `#rb-wait-clock`) against the live phone's engine, within 2 s;
  - the receiver's state against the hand-off payload, right after each apply.

  Never compare against the parked engine (V293 pins its clock).
- **The final score** equals the points the bots played. Match every delta to the harness's own input log (the snap or kick it made on the scorer's page, then the engine's TD/FG/PAT event), and list precondition points separately. The `score` audit entry comes from a sampler that logs any change, so it can't be the reference.
- **The checker is clean.** R-FREEZE and R-RESTORE are clean. No rule (R-SCORE, R-CLOCK, R-GIFT, R-CONT, R-YARD, R-DOWN, R-POSS, R-FINAL, R-P6, R-STALE, R-HALF, R-KEEP, R-FALLBACK) raises a flag of impact 1 or more, whatever caused it. A flag the fault itself explains (e.g. R-POSS "screen was off") must be impact 0 and listed next to its fault.

**The bar:**
- **Chromium:** every fault × moment cell runs at least 3 times with 0 failures, in Chromium with mobile emulation. Mobile emulation means all of these, asserted at the start of every cell:
  - `html.rb-mobile` is set (emulate touch, not just the viewport);
  - forced-landscape rotation is active;
  - the bots' input arrives as touch events through the rotation and remap.

  Port `qb-bot.js`'s input layer first, and prove it with completed passes, kicks and conversion choices under emulation. The matrix is big on purpose; run cells in parallel browsers.
- **WebKit, because iPhones are real players too:** the network and reload rows, in Playwright; install it in a scratch directory if it's missing. Playwright can't hide or freeze a WebKit page. For the screen-off rows on real iOS Safari, use the `iphone-mirror-repro` skill (the real iPhone through iPhone Mirroring on this Mac; it needs no owner playtest), or record in the ledger why it couldn't run.
- **Soak:** at least 10 full games (1-minute quarters) with a random fault every 20–60 s.
  - Every game reaches a complete, accurate stats screen on both phones.
  - The JS heap does not keep growing.
- **Replays:** a replay test for every ledger row, built from its real recorded sequence.
- **Existing suites:** every one green — `e2e/v*.js`, `node e2e/run.js` and `node e2e/audit-selftest.js`.
- **Flakes:** a flaky cell is a failing cell. Find out why.

Last, give a subagent that had no part in the build the chance to break it, using faults you didn't list. Then rerun the whole matrix on the final build and print it.

### Phase 4 — Ship

Ship in small steps, each with its suites green. A push reaches live games within 30 s, so push only commits whose suites are green; commit locally as often as you like. This overrides CLAUDE.md's "push every edit in the same turn" for this job. For every commit:
- **Version label.** Bump `V<N>` in both places in `index.html`: `GAME — V<N>` and `class="o">V<N><`. N = `git rev-list --count HEAD` + 1. The label text in CLAUDE.md is an old example; these two spots are current.
- **Stage** only your own paths. Never `git add -A e2e/`: `e2e/node_modules` is a symlink.
- **Commit** as `Soham Sthitpragya <sohamsthitpragya@Sohams-Mac-mini.local>` (every V-commit uses this identity, and Vercel deploys it fine). The global git config has a different email, so pass it explicitly: `git -c user.name='Soham Sthitpragya' -c user.email='sohamsthitpragya@Sohams-Mac-mini.local' commit …`. End with the Co-Authored-By line your session specifies. Then push.
- **Verify all four doors** serve the new label and the pushed code. For Vercel, Pages and web.app, the fetched `index.html` must hash the same as `git show HEAD:index.html`. For the embed, compare `embedcode/selfcontained.json` with a build made by `tools/build-selfcontained.py` from a clean export of HEAD. The label checks:
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
- The production watch is installed and proven, not waited out. A LaunchAgent (extend `com.rb2p.audit-watch`) scores every real game on R-FREEZE and R-RESTORE and keeps the freeze counter current. It writes an alert record and a `FREEZE-LEDGER.md` line whenever a real game has frozen seconds above 0, a recovery fires, or a freeze complaint arrives. Prove it with one injected harness freeze that stays out of the owner's stats.
- The first 100 real games on the final build (or three school days, if later) with 0 frozen seconds from our side is the job's acceptance test, not this session's stop condition. Write down when it falls due and how the watch will report it.
- Every "done" number is printed by the harness itself, for the commit live on all four doors. The output shows:
  - per-cell lines with room codes;
  - the tested commit hash, with `git status --porcelain` empty;
  - a cell count equal to faults × moments × runs.

  A subagent that didn't build it reruns a random 10% of cells and re-classifies a random 10% of "player's doing" and "checker mistake" games from the raw lines. Any disagreement means it isn't verified.

## 7. How to report

- Use plain words.
- Give every number with its source: command output or audit lines.
- Say what's done, what isn't, and what failed — never "should work".
- If two checks disagree, it isn't verified: show both.
- When you ship, add what you learned to the memory file `rb-possession-ledger-auditor.md`.
