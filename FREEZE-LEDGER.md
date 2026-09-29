# FREEZE-LEDGER

The working record for `NEVER-FREEZE-PROMPT.md`. Kept current as the work moves; it is the memory across context compaction.

## Where things are

- **Phase:** 0 is done. Phase 1 (telemetry + R-FREEZE + counter) is built. V419 packs the first fixes plus Phase 1, and ships after the final regression.
  - Next: the Phase 2 rebuild on the reviewed design (the `ctl` keystone), the Phase 3 chaos harness (the touch bot, `e2e/faults.js`), and the owner question on WebGL loss (reload vs V279).
- **Worktree:** `~/rb2p/wt-neverfreeze`, branch `neverfreeze`. `e2e/node_modules` links to `~/.cache/two-player-rb-e2e/node_modules`. The main tree stays clean for the embed watcher.
- **Test server port:** 8791 (`RB_E2E_PORT=8791`). 8790 may be the main tree.
- **Audit archive** (read-only, gitignored): `/Users/sohamsthitpragya/rb2p/two-player-rb/audits/*.json`, 709 rooms on 2026-09-28.
- **Tools added (uncommitted until the first ship):**
  - `tools/freeze-baseline.js`: per-version table and signals per game.
  - `tools/tl.js`: timeline window printer.
  - `tools/stuck-scan.js`: a second, monitor-free stuck measure: STUCK-LIVE, COVERED, BOTH-WAIT and BOTH-LIVE episodes from existing telemetry.

## Baseline (2026-09-28, today's checker over the archive)

Source: `node tools/freeze-baseline.js --since V395`. Real games are rooms not made by the harness, split by rematch, with at least 3 snaps.

| version | games | reached the horn | complete | own impact-3 | games with a recovery firing | complaints |
|---|---|---|---|---|---|---|
| V395 | 10 | 2 | 2 | 0 | 1 | 0 |
| V397 | 2 | 1 | 1 | 0 | 1 | 0 |
| V398 | 34 | 9 | 2 | 3 | 6 | 0 |
| V403 | 5 | 1 | 1 | 0 | 1 | 0 |
| V404 | 31 | 5 | 3 | 7 | 11 | 0 |
| V405 | 42 | 6 | 6 | 3 | 12 | 2 |
| V406 | 8 | 0 | 0 | 0 | 1 | 0 |
| V407 | 11 | 5 | 5 | 4 | 6 | 0 |
| V409 | 53 | 9 | 10 | 3 | 19 | 1 |
| V410 | 1 | 0 | 0 | 0 | 0 | 0 |
| V411 | 28 | 9 | 8 | 7 | 15 | 0 |
| V412 | 26 | 6 | 8 | 6 | 12 | 0 |
| V414 | 95 | 23 | 24 | 10 | 44 | 1 |
| V415 | 71 | 20 | 20 | 9 | 27 | 0 |
| V416 | 4 | 0 | 0 | 1 | 2 | 0 |

In total, 421 games: 53 with an impact-3 flag of their own, 158 with at least one recovery firing, and 4 with a complaint. Most games never reach the horn; the kids stop playing. Recovery firings on V395+:
- empty-field 81 and post-conv-handoff 77;
- QTR-KEEP #3 / keep-fresh 47 (one event, logged twice);
- TURN-RESCUE 36;
- conv-wall 18;
- try-over 12;
- EMPTY-FIELD re-staged 13;
- P6-WATCH forcing 7;
- DEAD-OPP END 7;
- ot-td-conversion 7 and ot-td-handoff 3;
- field-restore 4 and field-check 4;
- DELIVERY re-send 3.

The second measure (`node tools/stuck-scan.js --since V414`) covers 170 games. 50 have an episode over 10 s: 28 COVERED, 43 STUCK-LIVE, 3 BOTH-LIVE and 2 BOTH-WAIT. This count is before classification, and most of those episodes are not freezes (see F13, F14).

## Classes (one row per root cause)

| id | class | our fault? | evidence | status |
|---|---|---|---|---|
| F1 | **Scrolled page → every tap lands off target** (iPhone and iPad Safari). The engine maps input from `pageX`/`pageY`, which include the page scroll. The page scrolls by 100–450 px (probably a drag gesture scrolling the page), and the V260 healer's `scrollTo(0,0)` doesn't stick: BUZT b was healed 16 times at the same 164,124. | **yes: real freeze** (can't act) | 6 stuck stretches since V395 made of scrolled taps. **BUZT** g1 (V415, iPhone iOS 18.7): b LIVE 03:14.4; 22 taps over 23 s mapped to gui 988,629, 917,514, … with `scr164,124`; no snap; pagehide 03:37. **EQSX** (V415, iPad 820×1180): 20.6 s, 71 heals. **UNNI** (V411): 26 s and 12 taps, and the game ended while stuck. **VXAU** (V411): 17.7 s. **WNIE** (V409): 16.4 s. **MQHE** (V405): 11.3 s. 49 rooms since V386 have taps mapped with a scroll offset. School iPads report as "Macintosh … Safari, touch, 820×1180". | **fixed in V419 (not shipped yet).** The engine's 4 pointer reads (touch, pointer, mouse move, mouse button) and the bridge's tap bridge use viewport coordinates when un-rotated; the rotated body keeps page coordinates, which are correct because it scrolls with the document. `_No2` measures the canvas by its own rect (summing the ancestor rects counted a scroll twice on desktop). `e2e/v419-scroll.js` 4/4; on V418, T2 (touch) and T3 (mouse) fail with the exact drift. The scroll itself still happens (the cause is unknown; the V260 healer stays), so taps are now right, but the field can still be shown shifted until the healer runs. |
| F2 | **A visible phone goes silent** (heartbeat stops with no pagehide `X`). The cause can't be told from today's telemetry: a device lock or sleep without a final heartbeat, or a page hang or crash. | unknown until telemetry can tell | **BOHG** a: last hb 9:41:19 `vis:V fps 30`, then nothing; b had handed it the ball (KICKOFF) at 04:23. **XNQN** a: last hb at the exact second of the Q4 horn, `vis:V fps 60`; stream ends 1.8 s after the horn, during a 1.7 s `QTR-CEIL 6 -> 5` burst; no final on a. | open (Phase 1): add a Web Worker heartbeat (keeps beating if the main thread hangs, stops if the device sleeps) and a `sendBeacon` last breath on hide |
| F3 | **The waiting phone isn't told honestly** that the partner went silent. `_rb2p_oppSilentMs()` stays 0 for 90 s, so the cover says WAITING FOR OPPONENT, not STOPPED RESPONDING, from about 12 s to 90 s. | yes (honest-status defect) | BOHG b: 25 s of WAITING while a was silent, then b gave up | **fixed in V419.** After a partner's `H` heartbeat the cover keeps saying SCREEN IS OFF until they say more; silence from a visible partner shows STOPPED RESPONDING at 12 s (was 20 s). `v419-accuracy` T6; V418 shows WAITING in both cases |
| F4 | **Checker mislabels.** DEADLOCK fires before the 30 s silent window (BOHG), and when both phones are hidden (KPDD 19:55: a hidden since 19:25, b holding a TD). "went LIVE with no handoff" fires on a drained held outcome. | checker mistake | BOHG +280 s, KPDD +1195 s | open (checker) |
| F5 | **Snaps on some plays are never logged** (a run: settle with no preceding `snap`) | telemetry gap | BHZJ g2 a: LIVE 03:57.5 → taps → settle 04:08.1 (run, +6), no snap entry | open (telemetry) |
| F6 | **The quarter-change keep fights a play in the air at the horn, then its "fresh spawn" resets the down.** A snap with 0–2 s left runs past the horn. The between-quarters keep restores the latched spot three times in about 2.5 s ("the parked scene keeps coming back"). Keep #3 then calls `forceUserOffenseDrive(y, true)` without V414's `{down, toGo}`, so the drive starts at 1st & 10. | **yes: accuracy loss** (free first downs), and a near miss | 23 of 47 keep-fresh firings (V405–V415) changed the down on the next snap. **YXKI** (V415): the snap at Q1 0:01 was 2nd & 0.93; keeps #1–#3 at 06:34.5, 06:35.8, 06:37.0 restored "d3 y13"; the next snap was 1st & 10. **QROS**: 3rd → 1st & 10. **SILR**: 2nd at −18 → 1st & 10 at +17.5. **UGBU**: 4th → 1st & 10. | **fixed (accuracy) in V419.** `_rb2p_keepGate(q, yard, down, toGo)`; keep #3's fresh spawn passes `{down, toGo}`. `v419-accuracy` T1: the spawn is at 3rd & 0.93; V418 gives 1st & 10. Still open: the near miss itself (the keeps fighting a play in the air at the horn) |
| F7 | post-conv-handoff (+ the empty-field guard it logs) after a conversion that crosses the horn | designed repair for an engine behavior (the engine rolls the quarter mid-try) | 69 of 76 V406+ firings were within 15 s of a quarter change and < 60 s after a conversion. 7 fired later (DDNT, GNKB, HAOK, IUWW, KGQD, NGOM: 22–61 s after the quarter). | keep; route through the authority (Phase 2); check the 7 late ones |
| F8 | **DEAD-OPP END (V337) ends the game early for a partner who is only away.** It's a one-sided FINAL after 45 s of partner silence, with ≤ 60 s left in Q4 and this phone waiting. The code doesn't check the score, despite its comment "with a winner". | **yes: accuracy loss** (the game ends before the horn; the owner's rule: never end it) | **KELX** (V415): b scored to lead 35–30 with 56 s left and a had been hidden 184 s. b declared the FINAL at 1091:20. a came back 19 s later and got the stats screen and the ball at once, so its last drive was never played. AVAS g4: a had left (pagehide); b ended 38–16. KPDD: fired 3× (logged only). | **fixed in V419.** The dead-opponent shortcut is removed from the end signal and logs `DEAD-OPP WAIT` once a minute. The V405 forced FINAL and the V346 hold now wait for a conversion still being played (bounded at 120 s from the offer; the hold was 30 s). `v419-accuracy` T2/T2b/T3; V418 declares the FINAL |
| F9 | **TURN-RESCUE stages a guessed drive on a receiver that is holding the real hand-off.** The receiver's page was hidden, so it correctly held the outcome ("a drive cannot be staged"). The rescue then fires on that phone while it's hidden, or the instant it's visible, and stages a drive at its own guess. The held outcome drains 0.3–35 s later but is never applied, because the phone is already live. | **yes: accuracy loss** (wrong field position), and a race between two actors | 21 firings V406+; 13 of them had a held outcome. **XNQN** (V415): b turned it over at its own 4 (`OTHER y=-46.03`). a's rescue at 14:00.1 staged a at its own 13; the drain at 14:00.4 was recv+ack with no apply; a snapped at −37 instead of at b's 4 (+46), down 22–38 in Q4. **CACG**: sent OTHER y=25.5 → staged at −39. **YSYB**, **KTYA**, **PYLB**, **TCDT**, **MJII**: spot ≠ the hand-off's. | **fixed in V419.** A hidden page never rescues and its count restarts; a visible page applies the held hand-off (`TURN-RESCUE -> applying the held …`, guard rescue `held hand-off applied`); the guessed drive needs 8 s of visible standoff. `v419-accuracy` T4 |
| F10 | DOUBLE OFFENSE for 4–5 s | checker artifact of clock skew (ELTR) | **ELTR** g2: b's clock is about 15–17 s ahead of a's. a logged `EVT<- TD` at 00:44.0, while b logged `EVT-> TD` at 01:01.5; the KICKOFF with the same ts was applied at 00:55.9 (a) and sent at 01:13.2 (b). The turns didn't overlap. KTYA and XXCK: still to check. | checker: correct each phone's offset (server time, Phase 1) |
| F11 | Conversion not resolving normally: try-over, conv-wall, played-never-resolved | to investigate | ZMFU, FQQI (try-over); ZUKY, SICK (wall, V416); DXCU g1 | investigating |
| F12 | Pick-six chain broke: sent, never applied | player's doing plus a checker wording gap | **FEBE**: a closed the page (pagehide, hb `X` 1:52:41 PM) 39 s *before* b's pick-six at 10:32.7. The checker's LEFT rule only looks 20 s after a step. | checker: "the receiver had already left" |
| F18 | **One device creates two anonymous Firebase accounts (REST + SDK), and new sign-ups are limited per IP address.** A school behind one IP could hit the limit, and then new players can't write anything (no room, no hand-offs). | latent risk (not seen in real games yet) | Test runs from this Mac hit `TOO_MANY_ATTEMPTS_TRY_LATER` on 2026-09-28 (~120–160 sign-ups in a few hours); every host then failed on both V418 and V419. | **partly fixed in V419:** REST sign-ins share one in-flight request, so concurrent boot calls no longer each mint an account; the harness keeps profiles. Still open: one account per device (the REST path using the SDK's token would change every device's anonymous id once and spike "new devices" in the owner's stats — decide with the owner). Recommend the owner raise the per-IP sign-up quota in the Firebase console (not changed without asking) |
| F19 | **At a decided horn the engine tries to go past quarter 5 (QTR-CEIL 6→5 bursts), a leftover kickoff button can fire (`KY fired`), and the engine starts leaving the match.** On some devices the page then hangs (NFGF: no entries for 22 s, then "FINAL from the engine's native end") or goes silent for good (XNQN a, SJWJ b, 2 s after their horns). | **yes: (d) freeze** (stats screen late or never) | Horn → stats for phones on screen (V405+): 112 under 8 s, 9 at 8–15 s, NFGF a 23.2 s (V415), UNNI a 26.0 s (V411), LNRI b 77.6 s (V414, fixed V415); never: XNQN a, SJWJ b (V415), WHBR a (V409). | open: never fire KY after a decided horn; find what the engine does at the horn (repro with the stall watchdog and PerformanceObserver long tasks) |
| F20 | UNNI, WNIE and MQHE stuck stretches with a 1-px scroll (not scroll-caused) | investigated: UNNI is F19 (a slow final after KY) | UNNI a 07:16.8 horn → KY 07:17.7 → final about 26 s later | see F19 |
| F21 | `claimNewRoom` only checks `rooms/{code}/players`, so a new host can take the code of an old PLAYED room whose players have left, and the new game's records mix into it. | data hygiene (not a freeze) | the claim transaction's `cur === null` test on `players` only | open (low): claim only when the whole room is absent or harness-free |
| F22 | **Every page load, and every 20 minutes during play, downloaded the WHOLE `rooms` tree** (`sweepStaleRooms` → `FB.get('rooms')`): 58.7 MB on 2026-09-28, growing daily since V396 keeps played rooms, over the SDK socket that carries hand-offs, plus a large JSON parse on a phone. | **yes: a likely cause of slow hand-offs, stalls and memory-killed tabs** on school Wi-Fi and iPads | `rooms.json` measured at 58.7 MB (2.0 s wired here). It was the only whole-tree read in the page; every subscription is on a small path. It did **not** line up with the F2/F19 events: NFGF, XNQN, SJWJ, BOHG and UNNI fell 1.9–7.3 min from a 20-minute mark, so it isn't their direct cause. | **fixed in V419:** the client sweep is removed (clients delete nothing; stale lobbies are tiny) |
| F23 | **Incoming hand-offs are acked when QUEUED, not when applied** (`_twoPlayer.pending`). Items never expire and drain only while parked, so a reload with an item queued loses that hand-off: the partner thinks it arrived, and the resume skips it because it's acked. The field check does nothing while the queue is non-empty. | yes: freeze + lost possession risk | LATCH-INVENTORY.md §A (17418–17428, 12280, 16337, 18118) | Phase 2 |
| F24 | **The OT coin flip is single-writer, SDK-only and never retried**; the applied mark is set before `applyOtKickoff`, which can return early. One failure = both phones parked at the start of OT. | yes: freeze risk | LATCH-INVENTORY.md §A (13133, 13832, 13843–13848, 17079, 13341) | Phase 2 |
| F25 | **The final is published and read over the SDK only**, and a waiting phone can't reach its own final (its clock is held at 0:01). A dead socket at the horn means no stats screen on that phone. | yes: (d) freeze risk; possibly SJWJ / XNQN-like | LATCH-INVENTORY.md §A (13904, 16953, 12980–12990) | Phase 2: add a REST leg and a poll |
| F26 | **`tryRestore`'s catch-all deletes `rb_room`** and the role on any one error, such as a failed read on flaky Wi-Fi, so a reload can never resume. It also leaves `rb2p_skipResumeOnce` behind. | yes: (c) freeze (no resume) | LATCH-INVENTORY.md §A (16380, 16510–16513) | Phase 2 |
| F27 | **Cross-phone clock comparisons**, some of which delete the partner's record from the server: the REST poll's `val.ts < matchStartMs` (the sender's clock against mine), and 16977 / 17061. | yes with skew (F17: up to 40 s) | LATCH-INVENTORY.md §E | Phase 2: server time |
| F28 | The Q3 law marks itself done before its forced drive succeeds; a refused force is never retried. `quarterResumePending`, `p6AwaitDriveMs` (re-arms every 4 s) and the resume `pollR` loop (50 ms, no maximum in the match room) have no bounds. | risk | LATCH-INVENTORY.md §A | Phase 2 registry |
| F29 | Latches fixed in V419: `outcomePollBusy` (a hung REST poll disabled receiving for good); `_fbTokInFlight` (V419's own sign-in guard: one hung refresh would stall every REST path; now 10 s timeouts, and a still-valid token is kept); `userOutcomeSendInProgress` (now expires at 45 s, on record); `gameOverReported` latched before the render (a stats render that throws is now retried). | fixed in V419 | `v419-accuracy` T8/T9; LATCH-INVENTORY.md | done |
| F13 | COVERED stretches that are really the FINAL-SOON banner or the stats screen after the horn | not a freeze (scan artifact) | XNQN a 14:51 (FINAL-SOON 22-38) | scan fix: exclude `final soon` / game over |
| F14 | STUCK-LIVE stretches that are long plays, or plays whose snap wasn't logged (F5) | not a freeze (scan artifact) | BHZJ | scan refined (in-play excluded) |
| F15 | OT touchdown: the engine skips the conversion, so the bridge offers it (V415) | designed path (engine limitation) | KTYA, BUZT, ZUKY | route through the authority in Phase 2 |
| F16 | **The resume path's pick-six re-pop loop re-shows the 1 PT / 2 PT modal over a try in progress.** After a reload mid-conversion, a 1.6 s loop re-pops the modal until it sees "answered". It samples `prevLive` *before* the re-pop creates the modal, so an answer given within one tick is never seen. It doesn't check `_rb2p_convTrySnappedMs` or "PAT play snapped". | **yes: real freeze** (the scorer can't finish the conversion) | **DXCU** g1 (V415): b reloaded at 02:48. Re-pop attempt 1 at 03:00.1; b answered (03:01.4), the try started and snapped (03:01.6). Re-pops 2–6 at 03:01.7, 03:03.3, 03:04.9, 03:06.5, 03:08.1 (each re-applies PICK6); b left at 03:09.0. Checker: "PLAYED (ball live) but never resolved" ×3. | **fixed in V419.** The loop stops once `_rb2p_convTrySnappedMs` or `_rb2p_patPlaySnappedMs` is newer than the loop start, and it counts the modal it just created, so an answer inside one tick reads as answered. `v419-accuracy` T5 checks the shipped code only; the Phase 3 matrix row "reload mid-conversion" is the real test |
| F17 | **Phone clocks disagree by up to 40 s.** Entries carry each phone's own `Date.now()`, and some bridge logic compares timestamps across phones. | checker artifacts today; a possible freeze wherever the bridge compares cross-phone times | 6 of 522 phones off by more than 10 s (OEYK 40 s, ELTR 21.7 s, MJII 21.7 s, NARE 16.8 s, ORRO 12.8 s, OKGT 12.1 s) | open: server-time stamps; audit every cross-phone time comparison in the bridge |

## Decisions and constraints learned

- The embed watcher builds from the main tree's working copy, so all work happens in the worktree.
- `startTwoPlayerGame` pre-deletes `Z`+3 codes, and 42% of those are letter-only, so they can collide with a real code. Harness codes must contain a digit before any matrix runs.
- Onside kicks have been off since V299. `_rb2p_testPick6Live` stubs the sender, so it can't create a two-phone pick-six.

## Test status (V419 build, worktree)

- **New suites:**
  - `e2e/v419-accuracy.js` 8/8. On V418: 1/8, and T1, T2 and T6 reproduce the bugs.
  - `e2e/v419-scroll.js` 4/4. On V418, T2 and T3 fail.
- **Recent suites green on V419:** audit-selftest 37/37, v395 10/10, v398 5/5, v403 6/6, v405 5/5, v406 5/5, v407 5/5, v410 4/4, v414 8/8, v415 8/8.
- **v415 F7 was flaky:** it read a diag ring that holds about 11 lines. It now captures its own lines and passed twice in a row.
- **`run.js`: the 6 old tests rewritten to today's intended behavior** (not yet run; browser tests are blocked by the sign-up quota):
  - **V132 sweep:** now asserts no page downloads the rooms tree or deletes a room.
  - **V126 ULTRAMAX:** now V137's −5 floor.
  - **V121 hook:** the V147 router now carries the `_p2p_hooked` marker.
  - **V121 turnover:** gets V350's takeaway licence.
  - **V131 final:** writes signed in; the old unsigned writes were refused by the V297 rules.
  - **V120 tackle:** an offensive carrier on the ball, the defender 20 px away; the old setup tripped the INT-return guard.
- (was:) **`node e2e/run.js`** fails 6 old tests on **both V418 and V419**: V120 defense stats, V121 hook ×2, V132 sweep, V131 stale final, V126 ULTRAMAX. These are pre-existing and not caused by this work, but they must be made green (fixed or rewritten to the current intended behavior) before the Phase 3 bar.
- **Harness:** codes are `Z` + a digit + 2 characters. `deleteRoom` refuses any room that isn't a harness room.

## Phase 2 design (draft for adversarial review)

**The guarantee.** If a must-act phone on screen and online cannot act (a hard reason, outside the transition table) for `T_ACT`, one authority restores playability by the owner's restore rule, and can-act returns before `T_FREEZE` (10 s). Every blocking latch expires by itself.

1. **Latch registry** (`window._rb2p_latches`). Every blocking latch from the inventory (`scratchpad/latch-inventory.md`) is registered with: `{owner, blocks: [snap|handoff|conversion|final], maxMs, isSet(), since, expire(why)}`.
   - A 1 s ticker expires any latch set past its `maxMs` and logs `guard latch-expired {name, ageMs}`.
   - `_rb2p_latchReset(why)` clears every transient latch; each recovery calls it, so no recovery can leave a stale guard (VJGW).
   - `tools/latch-check.js` (run by the suite) fails on any `window._rb2p_*` name, closure guard, storage key or RTDB gate that is in neither the registry nor the non-blocking list, which carries a one-line reason per entry.
2. **Recovery authority** (`window._rb2p_recover(kind, why, detail)`). The only code allowed to stage, park, re-send, apply a held hand-off, re-offer a conversion or force the final.
   - **Lock:** local, plus cross-phone (`rooms/{code}/recovery`, a REST conditional write with ETag/if-match, epoch-stamped, expiring in 15 s). It refuses while a real hand-off is in flight (sent, not yet applied, under 90 s) or while the other phone holds the lock.
   - **Decision** (the restore rule, from the SHARED record):
     - `rooms/{code}/lastGood/{role}` holds the last not-frozen state (owner, yard, down, toGo, quarter, clock, score, ts), published on change.
     - It is moved only by later legitimate changes of hands: a sent or applied outcome with a later ts, the halftime law, or the OT law.
     - When no lastGood exists yet, the shared kickoff or coin-flip record decides.
   - **Actions:**
     - `apply-held`: drain the held or pending hand-off; always preferred over a guess (the F9 lesson).
     - `restore`: `forceUserOffenseDrive(yard, true, {down, toGo})` with the answer's spot and down.
     - `park`: I wait; the turn record names the owner.
     - `resend`: my hand-off is missing on the server.
     - `reoffer`: the conversion is owed and no modal is up.
     - `final`: only past a decided horn with no conversion live.
     - `unwedge`: release the engine's pointer slot.
     - `uncover`: hide a cover over a phone that the shared record says owns the ball.
   - **Accuracy guards (refuse and log):** a score change; a clock rise within a quarter; a spot, down or distance other than the answer; a reload; an end before the horn; taking the ball from a hidden or away partner.
   - **Logs:** `guard recover {kind, why, action, before, after}`.
3. **Detectors, not actors.** These watchers only ask the authority to act, migrated one at a time with suites green after each:
   - TURN-RESCUE, P6-WATCH, EMPTY-FIELD, the field check, the keep gate, the 35 s wall;
   - the post-conversion and OT-TD watchers, the stuck-drive watchdog, the delivery re-send;
   - the 300 s fallback, the forced final, the native-end fallback, `glLostRecover` (reload: forbidden; the authority kicks the engine instead);
   - every other `forceUserOffenseDrive` caller and `_rb2p_userIsWaitingForOpponent` writer.
4. **The trigger.** The can-act monitor, when a hard reason holds for `T_ACT` (4 s, tuned from the transition table), calls `_rb2p_recover('cannot-act', why)`, and the authority picks the action by reason:
   - `covered` → `uncover` or `park`;
   - `empty field` → `restore` or `apply-held`;
   - `pointer wedged` → `unwedge`;
   - `engine not stepping` → the existing kick of `_fi5`; never a reload.

   Both-waiting and both-live come from the shared record: each phone publishes its act state to `rooms/{code}/act/{role}` on change.
5. **Resume.** On visibility, reconnect or reload: `apply-held` first, then rebuild from the shared record (turn, lastGood, outcomes). The phone reaches can-act, or the honest wait, within 10 s.

## Phase 2 design review (2026-09-29, `PHASE2-REVIEW.md`): the draft above does NOT hold; the revisions to make

The review lists 19 problems, each with a scenario, code lines and the smallest fix. These revisions must be in the design before building:

1. **A hand-off is in flight from the moment it is decided, not from the send.** The sender holds it 4–12 s (the pick-six window). A recovery during the hold means two offenses, or a punted ball kept. The hold also has to fit inside the 10 s budget.
2. **Obligations are not guards.** Never expire or reset:
   - a conversion owed;
   - a held hand-off;
   - the sender's re-send copy.

   Only true guards get deadlines. (Example: the send guard legitimately lasts the opponent's whole drive. V419's first expiry was wrong and now fires only while the phone has the ball.)
3. **Must-act covers:**
   - an inbound hand-off (held, queued or on the server);
   - the scorer without the cascade flag (SQHJ);
   - must-resume (`rb2p_matchLive` out of the match);
   - must-show-final.

   Most of this is in the V419 monitor; the rest is still to do.
4. **Actions by cause, not by symptom.**
   - An empty field right after a conversion is a hand-off (the TBPK law), not a restore.
   - Add a `handoff` action.
   - `uncover` fights the 200 ms cover loop, so fix the cover's owner instead.
5. **`lastGood` must also record plays that end while hidden.** Otherwise a restore rewinds a finished play.
6. **The shared inputs travel on both transports.** The turn, heartbeat and live records are SDK-only today, and SDK write stalls appear in 197 of 616 rooms. A publish-on-change record can't be told apart from a dead socket.
7. **The 10 s budget:** 8 s empty-field allowance + 4 s trigger + REST round trips is already over. Tighten, and measure.
8. **Server time only.** Never compare the two phones' clocks (F17/F27).
9. **The lock.** A REST-only lock can be unavailable, hang, or outlive its holder.
10. **Stale SDK writes land late and overwrite newer shared state.** Version every shared record (an epoch plus a sequence).
11. **`restore` ≠ `apply`.** A random kickoff spot must be stored once and reused.
12. **A reload loses a pending KICKOFF hand-off** (19% of hand-offs), and resume can raise the clock.
13. **The final is decided per phone.** It must come from the shared record.
14. **Previous-build phones keep their own rescuers.** The authority must tolerate a V418 partner.
15. **OT counts a recovery park as a possession.**
16. **"Away partner" reads a 12 s flag.** Use the last `vis` (the V419 cover already does).
17. **Rematches inherit state.** Reset all at the V398 barrier.
18. **Wedge detection on mouse drags.** Fixed in the V419 monitor: all pointer types are counted.
19. **Outside the net:** (e) taps unanswered, and a lost WebGL context. The engine has no restore path, so a reload is the only cure, and V279 bans auto-reload: take this to the owner.

**The keystone (closes 6 of the 19): one small shared record, `rooms/{code}/ctl`.** It is written only by a conditional write (ETag / if-match) on EITHER transport and read fresh at decision time. The recovery decision IS that write. That removes the separate lock, the cross-phone clock comparisons, stale replays and split views. The reviewer verified that the ETag write works from all four doors, including the Sites embed, at the cost of one preflight round trip.

## Regression fixes caught on the way to V419

- **F9's grace timer** started at the first parked tick instead of at a wake, so every rescue took 16 s instead of 8. `v378` T3 caught it; the timer is now wake-only.
- **The first send-guard expiry (45 s)** would have cleared a guard that legitimately lasts the opponent's whole drive. The design review caught it; it now expires only while the phone has the ball (20 s). `v419-accuracy` T8a/T8b.
- **The monitor's wedge check counted touches only.** A Chromebook mouse drag would have read as wedged; all pointer types count now. `v419-canact` C9.
