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

## Phase 2 design v2 (2026-09-29): per-phone FLOW records, causal ownership, act-on-self

**Why not one shared compare-and-swap record.** Two writers on one node need a compare-and-swap on each transport, retries, and care for late SDK transactions. The same six problems (#6, #8, #9, #10, #11, #17) close without any of that if each phone writes only ITS OWN record and every decision acts only on the deciding phone.

**The record: `rooms/{code}/flow/{role}`.** Only that phone writes it: REST PUT first (fetchT 3 s), on change (at most 1/s), and at least every 5 s as a heartbeat. Readers keep the highest `seq` they've seen and ignore older ones, so a stale SDK flush can't win.

```
{ gid,                 // this game's id: host A's games/{ms} key; B adopts it from rooms/{code}/games
  seq,                 // monotonic per writer
  ver, srv: {.sv},     // build label, server time of the write
  vis: 'V'|'H', live,  // screen on? am I on offense (wait flag false)?
  plays,               // plays I snapped this game (monotonic)
  spot: {y, d, tg, q, clk, plays},   // my last SETTLED or STAGED field state while I had the ball (my frame); written at settle, even when hidden
  sent:   {ts, type, y, after} | null,   // my last hand-off: ts = the record's ts (MY clock); after = my staged value when I sent it (the causal link)
  held:   {since, type} | null,          // a drive end decided but still held (the 4–12 s pick-six window): in flight from the _1c1 edge (review #1)
  staged: ts,          // the last PARTNER hand-off ts I actually STAGED (the partner's clock); the ack moves here (review #12)
  conv:   {owed, modal, tryStarted} | null,   // a conversion I owe (review #13: now shared)
  final: bool }        // my stats screen is up
```

**Who must act (the same function on both phones).** Inputs: both flow records, each read fresh (REST poll ≤ 6 s old, or an SDK update). A record older than 15 s by local receipt time is UNKNOWN, and an unknown input means no decision, only the honest status.

1. **A hold is in flight:** `X.held` is set → nobody acts (the sender's hold timer resolves it).
2. **A hand-off is unapplied:** `X.sent` is set and `Y.staged !== X.sent.ts` → Y must APPLY `outcomes/X`, fetched over REST, idempotent by ts.
3. **Both hand-offs are staged:** the later one is the one whose `after` names the other's send. `Y.sent.after === X.sent.ts` means Y's send came after X's, so X owns; else Y owns. No cross-clock comparison anywhere.
4. **Special hand-offs without an outcome record:** halftime (the Q3 law), the OT flip and the opening kickoff are written as pseudo-sends with deterministic ids (`gid+'/H'`, `gid+'/OT'+n`, `gid+'/K0'`), so rule 3 covers them.
5. **A conversion is owed:** `X.conv.owed` → X must act (re-offer, or play the try). Y's FINAL and every "end" wait for it; the wall counts X's can-act seconds.

**The authority on THIS phone** (`_rb2p_recover(reason)`), triggered by the can-act monitor when a hard reason has held for `T_ACT` visible, frames-advancing seconds since its onset (the clock restarts at every wake), or by a detector. It acts on this phone only:

1. **I must apply:** `apply` = re-apply `outcomes/partner` through the normal apply path (score, clock, PICK6 / PAT_RESULT branches included); never a bare force (review #11).
2. **I owe a conversion:** `reoffer` it.
3. **I own the ball but I'm not staged or live:**
   - if my try is resolved and my kickoff was never sent: `handoff` (`s_change_possession`, so `_1c1` ships the TD kickoff — review #4);
   - otherwise `restore` at `flow.spot`, the last settled/staged state (review #5), with its down and distance.
4. **The partner owns and I'm live:** `park`, only when `partnerPresent` (a V flow/heartbeat within 12 s by local receipt).
5. **Decided game, no conversion owed anywhere, no stats screen:** `final`.
6. **Local remedies,** no decision needed: unwedge (clear slot 0, no synthetic release), scroll heal, engine kick, stats re-render.
7. **Forbidden:**
   - any action from a hidden page;
   - any action against an old-build partner's turn record (a partner with no flow record → local remedies only; review #14);
   - a score change, a clock rise within a quarter, a spot other than `flow.spot` or the applied outcome, a reload, an end before the horn, taking the ball from an absent partner.

   Every action is logged as `guard recover {reason, action, before, after}`.

**The registry (review #2).** GUARDS (resettable, with a deadline and an expiry action) are kept apart from OBLIGATIONS (never reset; they resolve only by their own completion):
- **Obligations:** the held send, `deferredOutcome`, `pending`, `lastSentOutcome`, the send guard, a conversion owed, `quarterResumePending` plus its captures, `ot/p{n}`, `gameOverReported`.
- **Obligation ages** count visible, online seconds, with an 8 s grace after a wake.
- **Check:** `tools/latch-check.js` in the suite: every `window._rb2p_*`, closure guard, storage key and gate path is in the registry or on the allow-list with a reason.

**Resume (review #12).** On visible, reconnect or reload, read both flows and `outcomes/partner` over REST. Apply any partner hand-off newer than my `staged`, whatever its type or age. Re-sends reuse the original ts. The resume clock is the lower of the two same-quarter clocks.

**Rollout.**
1. V421 ships the flow records in SHADOW mode (written; the rule computed and logged as `own {who, why}`; no action) plus a checker rule comparing the rule's answer with what actually happened.
2. After real games agree, the authority switches on and the detectors move under it one by one.

## V421 (2026-09-29): the flow records ship in SHADOW mode

- Each phone publishes `rooms/{code}/flow/{role}` over REST (≤ 1/s on change, 5 s heartbeat); nothing acts on it. The rule's answer is logged as audit `own {who, why}` on every change, so real games can be scored against it (`node tools/flow-sim.js` prints a LIVE section once `own` entries exist).
- A reload carries on from the phone's own record (read back before anything is published); the partner's record is ordered by the server's write time, not a per-phone counter.
- Every REST helper now gives up after 8 s (`fetchT`), and `fbRestGetX` tells an absent record from a failed read.
- Tests: `e2e/v421-flow.js` 6/6; the full regression (26 suites) and `run.js` 15/15 green on this build.
- **The v2 design review** (`scratchpad/phase2-v2-review.md`, 18 items) found the rule does not hold at halftime/OT, across reloads, or when the partner's record goes stale. Headline: in 44 of 204 real games that reached Q3, a hand-off decided at the Q2 horn shipped ~4 s later stamped Q3; in 20 the sender was B, so the rule names A while the halftime law gives B the ball (6 of those already had two offenses). The authority does NOT switch on until those are fixed (V422: epoch-stamped hand-offs, facts apart from presence, trusted records only, the V208 rejection in the chain, no action across a horn or before the OT flip).

## V422 (2026-09-29): the recovery authority switches on — with the v2 review's fixes

**The v2 review's 18 items, and what V422 does with each** (`scratchpad/phase2-v2-review.md`):

| # | problem | V422 |
|---|---|---|
| 1 | a hand-off decided at the Q2 horn ships after the roll and outranks the halftime law (44/204 games that reached Q3; 6 had two offenses) | **fixed.** Every hand-off carries the epoch its drive ended in (`fe`, stamped at the hold) and its causal link (`fa`). The rule voids a send from an older epoch; a receiver already in the newer epoch treats it as moot (score merged, never staged; a PICK6 is never moot). Only the laws start an epoch (the Q3 law declares `H` before it stages; the OT kickoff its period); the sampled quarter increment (bursts) no longer does. |
| 2 | `staged` too early, `spot` too late, a re-apply draws again | **fixed.** `spot` = my last staged drive (every successful `forceUserOffenseDrive`) or settled play, tagged with its epoch and hand-off: a spot from an older possession is never restored. The kickoff-return draw is made once per possession start and kept in the flow record; every retry and recovery reuses it. After a touchdown (spot at down 6) the authority never restages: only the conversion and its kickoff may follow. |
| 3 | a stale partner record blocks the must-act phone | **fixed.** Facts (the chain) stay valid until superseded; only presence decays; presence never moves the ball to me. The chain also rides the hand-off record itself, so a partner whose REST writes fail is still read right. |
| 4 | a reload rebuilds the flow from nothing | **fixed in V421/V422.** The record is read back (the newer of this tab's copy and the server's) before anything is published; the partner's record is ordered by the server's write time; B adopts a game id only from a record written after its own game started. |
| 5 | two ownership truths (the SDK turn record vs the rule) fight | **fixed.** TURN-RESCUE, TURN-HEAL and the field check defer to the authority whenever the chain answers; they keep their own judgement only for an old-build partner (no trusted record) and in overtime. |
| 6 | resume still goes through the old dedupes | **partly.** The authority's APPLY fetches the partner's hand-off over REST and bypasses the per-session dedupe; `tryRestore` itself: V423 (F26). |
| 7 | `held` has no deadline and isn't persisted | open: a reload inside the 4 s hold loses the hand-off; the chain then restores the sender's possession (the restore rule's answer when the hand-off never happened). |
| 8 | ts is not an identity | partly: equality within one sender's clock only; a broken chain answers "no decision" (the old actors act). |
| 9 | the final is decided per phone; V325 skips a conversion that could win | **fixed:** the final travels over REST too (published and read when the partner's record says final); the end of the game waits for a conversion owed on the PARTNER's phone (120 s max); V325 walks off only when the scorer leads after the +6 or trails by 3+. |
| 10 | OT decides before the flip | **fixed for the authority:** no action unless my epoch matches my engine's quarter, never at a horn (≤ 0:01), never while the OT flip is pending, no restage/park in OT. The flip itself: V423 (F24). |
| 11 | T_ACT counted only frames-advancing seconds | the authority counts visible wall-clock seconds. |
| 12 | the 10 s budget | the authority acts at T_ACT = 4 s after the stuck state begins (restage + apply measured at ~4.5–6 s in `v422-authority`). |
| 13 | a new build with an old partner loses today's net | **fixed:** no trusted partner record → the authority stands down and the old rescuers run unchanged. |
| 14 | re-applying a rejected phantom score | **fixed:** the V208 rejection is recorded in the chain (the sender keeps the ball) and never re-applied. |
| 15 | park required partner presence | **fixed:** park whenever the chain says the partner has the ball. |
| 16 | the 35 s wall gave a normal touchdown's scorer 1st & 10 at the 2 (GVCG, MHUY, XEDG) | **fixed:** past the wall the try is MISSED and the scorer kicks off (across the halftime/OT horn the law decides). |
| 17 | guards filed as obligations | the registry (`tools/latch-registry.js`) keeps them apart. |
| 18 | two tabs, one seat | open (each record carries a `boot` id; the stand-down is not built yet). |

**The authority** (`_rb2p_recoverTick`, every 500 ms, acting only on this phone): APPLY the partner's unapplied hand-off (the held copy, the queued copy, or the server's copy over REST); RESTAGE my possession when both phones are parked and the chain says the ball is mine (my last spot with its down and distance; or the hand-off that gave me the ball, applied again; or the epoch's kickoff at its stored draw); PARK when I'm live and the chain says the ball is the partner's. Each action is audited as `guard recover {action, why, before, after}`, and checked: a recovery never moves the score or winds the clock back. **The force-drive guard:** no caller may stage my drive while the chain gives the ball to the partner (on screen or not). **The can-act monitor** now knows a parked phone must act when the chain says the ball is its own ("parked, the ball is mine").

**Also in V422:** the halftime law retries a failed staging (F28) and the OT kickoff too (F24's staging half), both at the same stored draw; the final report travels over REST (F25) and is judged stale on server time (F27).

**Tests:** `e2e/v422-authority.js` 13/13 (restage with down and distance, park, the guard, the stored draw, a lost hand-off applied from the server, a partner that stopped writing, an untrusted partner, a first-half hand-off after the halftime law, the Q3 law retry, every recovery audited with no score or clock change, the wall's touchdown exit). `e2e/v421-flow.js` 6/6 (with the new rule fixtures). `e2e/v325-endgame-pick6.js` +3 (trailing by 1/2 plays the try, by 3 walks off). `e2e/v339-intside.js` drives the interception through a real hand-off (its old setup had none).

**Known-open, observed:** a tied (or, now, 1–2-point) pick-six try at the Q4 0:00 boundary is auto-resolved as missed by the engine's quarter roll (v325 T5's standing observation).

### V422, second batch (found building and testing the authority)

- **F26 fixed:** `tryRestore` no longer forgets the room on an error. Every resume read gives up after 8 s (a half-open socket could hang it forever); a failure before the room is entered retries (2 s, 4 s, 8 s, 16 s …) with the room kept; a deliberate "back to lobby" still wins across retries. `v422-resume` R1 (a silent socket from the first byte: the reads fail, the room is kept, the game resumes).
- **F24 fixed:** the OT coin flip is drawn once per period (kept in the tab, so a reload reuses it), written over BOTH transports until the server has it, and read over REST while overtime is pending. `v422-resume` O1 (both sockets offline: the flip still lands and is read).
- **F27 (the remaining comparisons):** hand-off records, the final and the OT flip carry the server's write time; the REST hand-off poll, the final and the flip are judged on it. `v422-resume` S1.
- **F28 (the rest):** P6-WATCH un-parks only when its forced drive is accepted, retires when the chain gives the ball to the partner, and stops after 8 forces; the quarter-keep flag expires after 30 s on screen; a resume whose drive cannot be staged for 20 s resumes parked.
- **The chain refuses a resume's drive** (a stale snapshot claimed the ball): the resume comes back parked instead of retrying every 50 ms; the guard logs once per 5 s. `v422-resume` R2.
- **EMPTY-FIELD (81 firings V395+) re-staged a fresh 1st & 10** — the F6 shape. It now keeps the down and distance (the flow spot at that yard, else the engine's own). `v386` T3.
- **Found by the registry pass:** the TD-replay stamp that extends a held hand-off to 12 s was never aged (one unconsumed opponent replay stretched every later hold); a REST token the server rejects was kept up to ~55 min (every REST path, the hand-off fallback included, failing) — a 401 now forces a refresh, once a minute at most.
- **Every recovery resets through the registry:** `_rb2p_latchReset(action)` clears the guards the recovery made stale and names them in its audit; obligations are never touched.
- **The registry and its check:** `tools/latch-registry.js` (180 blocking entries: kind guard|obligation, owner, set, clear, max, expiry; `open` where no deadline is enforced yet — the evidence for 82 of them is `LATCH-BLOCKING.md`), `tools/latch-nonblocking.json` (144 names, each with its own reason), `tools/latch-check.js` (fails on any unclassified `window._rb2p_*`, closure guard, storage key or room record). `e2e/v422-latchcheck.js` runs it in the suite and proves a planted latch fails it.
- **Tests rewritten to V422's rules** (each change says why in the file): `v339` T2/T3 (the interception is a real hand-off now), `v366` T5 (the old turn-record rule, as for an old-build partner) and T7 (the guard opened only to build the scene under test), `v380` T6 (its own fresh game — T1–T5 leave unapplied synthetic hand-offs), `v414` R1–R5 and `v415` F5 (the field check's own rule, as for an old-build partner), `v415` F1 (the forced drive on the phone that has the ball).
- **Live V421 shadow data (11 real games, 831 snap×phone):** the logged answer named the snapper 84.6% of the time and was wrong 4 times (2 snaps, both phones). Both wrong snaps were the rule being right and the game being wrong, or the review's #1 case: BTVK (A came back from 52 s hidden still "live" in Q3 and snapped a phantom play while B had the second half by law; TURN-HEAL parked A 0.4 s later — V422's chain said B throughout) and HNID g3 (B's Q2 hand-off drained on A after A's halftime law — V422 voids it by its epoch). The no-answers were V421's presence gate (V422: facts decide), the 2 s logging cadence and the first seconds of a game (game id adoption).
- **BTVK changed one V422 rule:** TURN-HEAL now defers only when the chain says the ball is MINE (the fight the review warned about); when the chain agrees the partner has it, TURN-HEAL stays the fast path (≈1.5 s), and the authority's own PARK acts at 2 s (T_PARK; restage/apply keep T_ACT = 4 s).
- **`v410` T6 was flaky on V421 as well (1 in 3):** six seconds into a game the opening play can still be live and the post-conversion watcher rightly waits for a dead ball; the test now holds its scenario (ball at rest, the drive at the 2) — 3/3.

### V422: the independent code review (`scratchpad/v422-code-review.md`) and what changed

An adversarial agent read the V422 code (not the design) against the real archive (630 rooms) and traced every flow on both phones. It found paths where V422 was WORSE than V421; all are fixed before shipping:

| # | problem | fix | test |
|---|---|---|---|
| 1 | **A reload inside an interception's hold** (V187's re-send path, 8 of 630 real rooms): the resume re-sent the INT before the flow record was restored, so the send landed on a blank record, the blank record overwrote the tab copy, and the chain lost it — both phones parked with opposite answers, for good (1st half), or the interception erased (2nd half) | the record is restored **synchronously** from the tab copy at install; the tab copy is never written from a blank record; notes made before an async (server) restore are replayed on it; a hand-off sent before the restore goes unstamped (read as an old build's, never moot); and a phone whose record lost a send heals it from the partner's `staged` (the partner can only have staged a send of mine) | `v422-resume` R3 — FAILS on the pre-fix build (the two verdicts disagree), passes now |
| 2 | **Halftime with the parked phone's socket dead:** B never reached Q3 (it learns the horn only from the SDK mirror), the epochs split, the authority stood down — and the old rescuers deferred anyway | the rescuers defer only when the authority is ENGAGED (`_rb2p_flowEngaged`: facts, an answer, no epoch split, a settled epoch, no hold); B's halftime law catches up when the partner's trusted flow record says the second half began | `v422-resume` H1 — fails pre-fix, passes now |
| 3 | the resume's halftime-law skip never declared epoch H | the skip declares it; a backstop in the publisher does too | (H1's path) |
| 4 | the authority's REST APPLY could queue a second copy of a hand-off that arrived during its read | the callback re-checks: still parked, still unapplied, not queued or held | code review |
| 5 | the monitor was blind to #1–#3, and falsely counted "stats screen missing" while the final waits for the partner's conversion | the (d) check knows the partner's conversion; a new must-act reason "both parked, no decision" (5 s grace) | `v422-resume` M1 — fails pre-fix, passes now |
| 6 | a moot hand-off merged only the sender's score (a safety at the horn) | both scores merged | code review |
| 7 | the latch reset ran after failed recoveries | only when the phone is live after it, or it was a park | code review |
| 8 | the partner's `staged` was not advanced from its hand-off | advanced from `after` | code review |
| 9 | a partner hand-off never on the server was retried forever; the halftime/OT retries rewrote the turn record every tick; the OT flip was kept per room; the REST final read had no game check; F26's retry lost the INT backup | lost after 3 looks (no decision → the old rescuers act); declare once; per game; `_rb2p_flowPartnerFinal` checks the game; the backup is kept across retries | code review |

Checked and found sound by the review: every hand-off type within a half with healthy transports, a live pick-six, halftime with healthy sockets (which fixes the six two-offense rooms), a tie into OT, old-build partners, 40 s clock skew, hidden phones, reloads outside an INT hold, and the other V422 changes; no crash paths; ≤ 1 flow PUT/s.

## V423 (2026-09-29): the last Phase 2 gaps

- **The first real V422 recovery** (KOGJ, a real game): A reloaded mid-play right after its pick-six drive was handed back; the resume brought it back parked; 4.5 s later the authority restaged A at its last staged spot (1st & 10 at its own 28) — the chain said the ball was A's. V421 would have waited 8–16 s for TURN-RESCUE's guess. Five real V422 games so far; the authority acted once, correctly; the force-drive guard refused nothing; mixed V421/V422 pairs stood the authority down as designed.
- **A drive end held when the page reloads is no longer lost** (the v2 review #7, open in V422): the held hand-off is kept in the tab (keyed to the game) until it ships or is superseded, and the reloaded page ships it before the resume can stage a drive; interceptions stay V187's. `v423-resume` R4 — fails on V422 (the punt is lost; A replays its drive), passes now.
- **A wedged pointer is released** (a local remedy): after 4 s of "pointer wedged" the authority clears the engine's touch slots the way its touchend does (its own V250 heal waited for the next touch). `v419-canact` C5b.
- **"Is a game in progress?" also on the server's clock** at resume: the partner's flow record written within the last 60 s for a game not over (a server-time probe, `rooms/{code}/clock/{role}`). Defensive: `v423-resume` R5 (a 2-minute-skewed partner, 30 s frozen) resumes on V422 too — another resume signal covered it in the harness.
- **The registry** corrected where V422 fixed the latch (F24/F26/F28 notes), and the check now sees storage keys built by a helper (`'rb2p_…_' +`): 184 blocking, 149 non-blocking, 0 unclassified; 8 blocking entries still carry an `open` note — 2 real (a WebGL-loss reload, the owner's call; the held-send entry until V423 ships) and 6 by design (per-match values that are not waits).

## V424 (2026-09-29): the four "frozen" games of 2026-09-29, and TEMPORARY vs PERMANENT

The published counter said 4 frozen games today (FQHW, QJFB, UVXN, DPWZ). Each was read on the raw clocks (`rooms/{code}/audit`):

| room | build | what happened | kind |
|---|---|---|---|
| FQHW | V423 | **not a freeze.** One device played both seats; its background tab's upload sat 27 s, and the checker took the MEDIAN of `srv − t` (n = 2: 121 ms and 27 653 ms) as that phone's clock offset — its whole stream slid 24 s and "both have the ball for 20 s" was invented. | checker error |
| DPWZ | V421 | A came back after 115 s in the background; its reconnect delivered B's minutes-old turn record and "I have the ball" live push as new, and V366's gate refused the touchdown kickoff A was applying — the gate lets a hand-off applied in the last 3 s through, but the apply stamped its time AFTER going live, so the gate read the previous apply. Both phones waited 15 s until TURN-RESCUE. (V423's authority would have restaged A after ~4 s.) | temporary, 15 s |
| UVXN | V422→V423 | B threw a pick-six at Q2 0:05; the return ran B's clock out and B's engine rolled to Q3 while A was still playing the conversion. B's halftime law gave B the second-half kickoff at once — both phones had the ball for 4–9 s. The score merged correctly (A's answer was moot at B). | temporary, 11 s (overlap) |
| QJFB | V423 | **a live bug.** A scored in overtime (8 → 14, tied) and tapped 2 PT. The engine's own overtime is sudden death: its scoring left it at "overtime over" (drive stage 17/18, the controller in play, a Kick Off button the player tapped). 2 PT only closes the menu — the engine's controller sets the try up only between plays with no ball on the field — so nothing was set up. The field sat empty until the 30 s hand-off gave the ball to B **with no try**. And had the try been set up, the engine credited a made 2-point try in overtime as a sudden-death touchdown for the OTHER team (+6, possession flipped — `e2e/probe-ot2pt.js`: 14-14 → 14-20). | temporary, 16 s + a lost try |

**Definitions (the checker, the counter and the transcripts page):** a freeze is **TEMPORARY** when the game went on after it — a play was snapped, or the stats screen came up — and **PERMANENT** when it never did: the players left or the recording ended with the game still stuck. None of the four was permanent.

While the counter was being rebuilt, a fifth room appeared as "402 s, permanent": **RPLB** (V423, 15:02). It was not a freeze either — A's screen went dark mid-play at 182 s and never came back (its page ran on in the background, finished the play as a pick-six and sent it), and B's page stopped writing entirely at ~200 s (its last heartbeat was the "left" beacon). The checker counted "both waiting on screen" because a status line A's dark page wrote later overwrote its "hidden", and B's silence read as "still there".

### Fixed in the game

- **An overtime touchdown gets a real try** (QJFB). The 1 PT / 2 PT choice is offered from where a regulation touchdown leaves the engine — between plays (controller 2, drive stage 2), the field cleared (ball, meta-ball, players, the leftover Kick Off button; a Kick Off tapped during the celebration is void), the conversion marker set. The engine then lines the 2-point try up behind the choice exactly as in regulation; 1 PT replaces it with the kick. If a choice ever sets nothing up in 2 s, the chosen try is set up (the button's own script is recorded where the engine dispatches it). A try lined up on the field waits for its snap (90 s at most) instead of the 30 s hand-off. **Engine patch** (`retrobowl.js` `_hB` case 1): the conversion marker is checked before the sudden-death branch — a made 2-point try in overtime is +2 to the scorer. `e2e/v424-ottry.js` T1–T4: T2/T3 fail on V423 (the field stays empty; the made try is 14-20 for the wrong team).
- **The possession gate** (DPWZ): the apply is stamped before going live; and when the flow chain is settled and names this phone, a stale "they are live" (turn record + live push, both socket-delivered) does not refuse its possession — facts over presence. `e2e/v424-freezes.js` D1/D2 — fail on V423 ("POSS-REFUSED LIVE").
- **The half ends after the partner's try too** (UVXN): the halftime law declares the second half on time (a late first-half answer is merged, never staged — V422's moot) and holds the kickoff while the partner plays a first-half conversion — its flow record says one is owed (120 s at most), or this phone threw the pick-six and the partner's record has not shown the try yet (20 s). A merged conversion answer ends the thrower's pick-six wait and is logged `p6 resultApplied {moot}`. `e2e/v424-freezes.js` U1 — fails on V423 (B takes the kickoff at once).

### Fixed in the checker (`tools/audit-rules.js`), the counter and the page

- **Clock offset = the smallest `srv − t`** (the rest is upload delay); one account on both seats = one clock. Archived timelines are re-aligned from their entries' raw keys (`realign`).
- **On screen means on screen:** a dark screen stays dark until the phone reports it visible (or reloads); a connection drop (FB-CONN OFFLINE) is not reachable until it is back; a phone whose stream goes silent for 20 s is gone from 5 s after its last entry (a page on screen writes every 5 s; a hung one still writes the watchdog's stall).
- **R-P6:** a conversion answer merged by the thrower after its halftime law is a received answer (UVXN's "chain broke" was this).
- **R-FREEZE** marks every freeze `temporary` or `permanent`; `stats/alltime/freeze` counts `temporaryGames` / `permanentGames` (and per day / week); `rooms/{code}/audited.frozenKind`; the transcripts page shows `FROZE 15s · TEMPORARY` (orange) / `· PERMANENT` (red) and the two counts.
- Over the whole archive (99 measured games) only two verdicts change: FQHW 20 s → 0 and RPLB 402 s → 0. `e2e/v424-checker.js` C1–C6 (C1–C4 fail on V423's checker).
- **`v382` T4 read the raw clock between a mirror push and the gate's tick** (the mirror writes every 500 ms; the gate puts the kept clock back within 50 ms): about 1 read in 10 landed in that window — seen twice on V424, and the same 2:01 baseline on V423. It now reads after a gate tick (a stale clock the gate accepted would still fail it): 5/5.
- Tests: the full regression (38 suites: the 35 + `v424-ottry`, `v424-freezes`, `v424-checker`) and `run.js` 15/15 green.

## V425 (2026-09-30): why 7 more games froze, and whether the old fixes did anything

**The 7 frozen games since V424 (6 permanent — the players left while stuck) were all caused by V422–V424 code:**

| rooms | what happened | whose |
|---|---|---|
| NPJD, ZJCF, NGKD, WNPB, JKYT | a REMATCH in the same room and tabs: each phone's flow record "healed my last send" from the partner's record — still the PREVIOUS game's (same epoch K0; the heal never checked the game). The phantom hand-off made the chain give the ball to B; the recovery authority PARKED A, which was playing the opening drive; B could not apply a hand-off that never existed ("lost-send"); TURN-RESCUE deferred to the authority. Both parked until the players left (JKYT recovered, 11 s). | V422 |
| FGXJ | a punt the engine played 3 s AFTER the overtime final was held, kept in the tab (V423) and shipped into the rematch: B got the opening ball too — both had it; A was parked, B left | V423 |
| VVLQ | the overtime try (V424) scored a made 2-point try as a TOUCHDOWN (+6) and offered another try — 38-44-50-56-62; the player reloaded; the resume re-applied the current OT period's coin flip and wrote "TURN-> a (match-start)", the chain gave the ball to B, the force-drive guard refused A's rescue, B's rescue waited for the turn record — deadlock | V424 + V422 |

**V424's overtime try was wrong in 4 real games** (EXYT, FTYF, KHIX, VVLQ: 8 repeated +6, at least 40 extra points; FTYF 14-20-26-32-38 in one possession). V424 patched `_hB` case 1 — the DEFENCE-scores branch; a made 2-point try is an offensive touchdown and goes `_Ak1(1)` → `_Ik1` → `_hB(1)`, case 0, whose sudden-death branch came first. V424's test called `_hB(2)` directly and passed. Lesson (again — verify the engine's real path): the test now drives `_Ak1(1)`, and fails on V424 exactly like the real games (a second touchdown, another 1 PT / 2 PT).

**Did the old fixes do anything?** (`FIX-AUDIT-2026-09-30.md`, an independent read of 477 real games V414–V424, every recovery firing read by hand)
- **Clearly helped:** the V419 keep gate (28/28 kept the down and distance; 9/16 were reset before), TURN-RESCUE applies the held hand-off (48 of 53 — guessed drives with a hand-off waiting 12/200 → 1/277), KY refused after a decided horn (35/41; stray post-horn kickoffs 25/97 → 1/116), DEAD-OPP WAIT (7 games went on that V415 would have ended), FINAL waits for a conversion (11 games), V422's epoch moot (11/12), V424's halftime wait (11/12), OT kickoff retries.
- **Did harm:** the V422 recovery authority's PARK (8 of 8 firings wrong), its APPLY (3 of 4 re-applied stale hand-offs: a Q2 kickoff in Q3 — KHIX, the wrong team started the half; a Q1 kickoff in Q3 — YUHQ, a clock back to Q1 0:16; a 2-minute-old pick-six — AWCI), the heal (10 of 14 harmful, 0 helped), the force-drive guard (4 of 4 refusals that mattered were wrong), TURN-RESCUE's deferral to the authority (kept 4 deadlocks alive), V424's possession-gate chain override (1 firing, wrong). The common cause: **the flow chain is not reliable at the halftime and overtime boundaries and around reloads/rematches.**
- **Never fired:** the conversion re-pop stop line, the send-guard expiry, the stats render retry, the 35 s wall's missed-try kickoff, resume-parked-after-20 s, the OT flip over REST, the Q3 staging retry, the phantom rejection, the pointer unwedge, V424's try set-up net.
- Freeze rate (the monitor exists from V419): V421 1/60, V422 1/27, V423 1/44, V424 7/144 — 0/137 without the V422–V424 regressions above.

### V425: what changed

- **The recovery authority is a detector again (shadow), like V421:** restage and park only say what they would do (`RECOVER (shadow) would …`, audit `recover-shadow`); the force-drive guard only says what it would refuse (`FLOW (shadow) would refuse`); TURN-RESCUE, the field check and TURN-HEAL no longer defer to it; P6-WATCH is no longer retired by the chain; the possession gate's chain override (V424) is gone; the heal is gone; the monitor no longer reports "the ball is mine" from the chain (a wrong chain is a false freeze) — "both parked" is reported as the fact it is.
- **APPLY acts only for a hand-off that is provably new and of this half** (`unsafeApply`: never a pick-six, not older than the last hand-off taken here, the same half or OT period, not epoch-moot) — the three real stale applies are all refused by it; the one real success (DCPF) passes.
- **The rescuers look before they guess** (F9's rule, which helped 48 times, extended to the server): before TURN-RESCUE or the field check guesses a drive, the partner's newest hand-off on the server is read; if this phone never took it (its own staged record), it is of this game and passes `unsafeApply`, it is applied instead (`RESCUE applies the partner's X from the server`). TURN-RESCUE keeps my own last down and distance at the same yard line.
- **Rematches:** a drive end after the final is never handed off (`SEND refused — the game is over`); a held hand-off ships only into the game it was held in (`FLOW dropped the X held in the previous game`); a resume no longer writes "TURN-> a (match-start)"; a reload mid-overtime does not re-apply a coin flip the game already played (`OT flip pN already played before the reload`); the rule treats a stale HEALED send as the epoch's start.
- **Overtime:** `_hB` case 0 — a TRY (down 6) that reaches the end zone is the conversion (+2), overtime or not.
- **Tests:** `e2e/v425-rematch.js` R1–R3 and `e2e/v425-ot-resume.js` V1–V4 (each fails on V424, passes on V425); `v424-ottry` T3/T4 drive the engine's real scoring path (T3 fails on V424); `v422-authority` A1/A3/A5/A6/A8, `v422-resume` R2/R3/M1, `v424-freezes` D1/D2, `v366` T6 (a 200-character diag window), `v414` R2/R3 and `v415` F5 (the field check looks at the server before restoring — the tests mark the look done) rewritten to V425's rules (each says why). Full regression (40 suites) and `run.js` 15/15 green.

## V426 (2026-09-30): the freeze detector, re-checked — and a job that asks "why?" four times a day

**Why:** the owner asked "why did games freeze?" day after day, and the problem was often deeper — including in how
freezes are found. An independent read of every V421–V425 game against the raw streams (not the checker's verdicts)
found the checker counted about 2 of every 3 real freezes (V424: 7 counted, 10–11 real), and that the archive itself
was missing games.

**What was wrong, and the fix:**

| gap | what it did | fix |
|---|---|---|
| the watcher audited a room once | a rematch, an overtime or a reload after the first audit was never archived: 76 of 220 rooms, OUFQ lost 106 of 118 plays | re-audit when entries newer than `audited` have gone quiet 3 min (never during play; ≤ once per 30 min per room; the backlog drains 10 a minute) |
| "offline" hid freezes | FB-CONN OFFLINE made a phone "unreachable" — since V364 it plays on over REST. CZFL: 31 s both waiting, permanent, counted 0 | the rule is gone |
| silence = gone after 20 s | assumed a page writes every 5 s; it writes on change — 1,051 healthy silences over 20 s. NGKD 55 s counted as 24 s, WNPB 62 s as 20 + 22 | a silence is judged by how it ends: gone only if the stream never resumes, or resumes with a reload or the suspend signature |
| timed from the report | the monitor reports after its grace ("empty field 9s"); a player who reloaded at 10–15 s was never counted (DAXK 15 s) | the interval starts when the state began (once; never before the phone's previous report, its screen coming on or a reload) |
| one clock offset per room | a sample from the next day moved the whole game (UVXN 11 s → 0) | the smallest offset among the phone's samples within an hour of each entry |
| lone reopens counted as freezes | a phone that reloads after the final is put into a match alone (EQXQ: 151 s "frozen", 18 hours after its game) | not a frozen game: **R-REOPEN** (a real bug — 31 archived rooms; EXYT played a whole drive alone; OPEN.md item 1) |
| sleeps called hangs | the watchdog reported a device's wake-up as a hang: 18 of 20 HANG flags | the worker times its own ticks: `kind: 'sleep'` when it was away too, `'hang'` when it kept ticking |
| clicks invisible | taps were logged on touch phones only — 128 of 154 V424 games (Chromebooks) had none | every in-match tap is logged (`p=mouse` for a click); behaviour unchanged |

**The whole archive, before and after (878 rooms):** 845 identical. More freeze time in 7, each read on its timeline
and real: CZFL +34 s (the REST poll never delivered a punt, OPEN.md 3), NERM +21 s (a turnover-on-downs hand-off
"in flight" until B left, OPEN.md 4), NGKD +31 s, WNPB +20 s (one 62 s stall, not two), DAXK +15 s, QJFB +9 s, FGXJ
+11 s (an overtime kickoff behind "the scorer owes a PAT"). R-REOPEN in 31 rooms. Nothing else changed — no freeze
removed except EQXQ's reopen, no other rule's flags moved.

**Infra (not a game change):** the audit watcher downloaded the whole `rooms` tree (94 MB) every minute — 70–105 GB a
day against the free plan's 10 GB a month (Google's monitoring; the project has no billing). It now reads the room
list (shallow) and small reads for active rooms (~35 KB a minute), and writes `~/rb2p/live-rooms.json` ("is anyone
playing?"); `alltime-stats.js` caches settled days. Storage is 293 MB of 1 GB and grows 30–50 MB a day (rooms are
never deleted) — the owner's decision (OPEN.md).

**freeze-watch (tools/freeze-watch/):** a LaunchAgent at 9:00, 12:00, 15:00 and 18:00 runs a precheck (no model) and,
when there is work, Claude Opus 5.5 at xhigh effort on `PROMPT.md`: audit the last release against real games first,
check the detector, five whys per freeze, fix the root in its own worktree, prove it (fails on the live build, passes
on the fix, `gate.sh` green, latch check), push only when `quiet.js` says no real game is live, verify every door,
report. The 6 pm run adds the day's noticeable non-freeze problems and the open items (`OPEN.md`).

**Tests:** `e2e/v426-checker.js` K1–K7 (15 checks; 13 fail on V425's checker), `e2e/v426-telemetry.js` W1–W3 (all 3
fail on V425). v424-checker, audit-selftest, v424-freezes, v419-canact, v398-games, v406-today, v415-freezes,
v403-endings, v405-complete unchanged and green.

## V427 (2026-09-30): freeze-watch's tests must serve its own tree

After the V426 gate, the test server on port 8801 — freeze-watch's test port — was still serving another worktree
(the V426 gate run in `~/rb2p/wt-fw` left it). The e2e harness reuses any server already on its port, so a scheduled run would
have tested THAT tree's files and called its own fix green. `tools/freeze-watch/own-port.sh PORT DIR` stops a test
server (python http.server only) on PORT that serves another directory; `gate.sh` runs it before the suites and `run.sh`
before the model starts (8801 = the run's worktree, 8802 = the main tree). No game change.

## V428 (2026-10-01): a complete game vanished from the records — a READY that outlived its game

**What the owner saw:** UZGV, Shivom (phone A) vs soham (phone B, the 49ers), played to the stats screen this
morning — 49ers 30, Eagles 0; Purdy 19/22, 324 yards, 4 passing touchdowns and a 3-yard touchdown run (every number
confirmed from soham's play-by-play) — was not in the transcripts. "Our game marking system is wrong."

**Why — asked down to the root:**
- It was missing from the transcripts because the room had no `outcomes` (team names), and the page hid every room
  without team names as a "test-harness game".
- `outcomes` was gone because a new game's start removes the previous game's final, outcomes and audit marker.
- A new game started because Shivom's phone reloaded 16 s after the final, and the new page saw BOTH seats still READY
  on the server, so it started a match by itself (`startMatch`).
- The seats were still READY because a READY was never reset: not at the final, not when a page entered the room.
  The V266 guard let a "fresh final" through as "a rematch".
- The checker then marked the room UNFINISHED: a room's "complete" was its LAST game's, and the last "game" was the
  lone one.

**Not one room:** the transcripts hid 37 real rooms the same way, including NGKD, ZJCF, WNPB and NPJD, and 24 complete
games were marked unfinished. R-REOPEN (V426) appears in 53 archived rooms.

**Fix:**
- A match starts only when THIS page pressed READY (`maybeStartMatch` needs `myReady`; the READY click re-checks,
  because a seat the server already shows READY sends no event).
- The final screen spends the page's READY (`_rb2p_spendReady`).
- Entering a room clears a READY the seat kept from an earlier page.
- The checker: a room's `complete` is its last REAL game's (`realGames`). R-REOPEN is impact 0, because the game record
  is untouched; "the ball or the down moved" on a complete game's card was false. The 6 pm sweep lists every R-REOPEN
  by name.
- `audited.games` holds the real games.
- The transcripts page hides a room as a test only by its code (harness codes carry a digit) or harness players' names.

**Tests (all fail on V427, pass on V428):**
- `e2e/v428-ready.js` E1–E3. A real game is played to the stats screen on both phones, then A reloads with its seat
  READY. On V427 A is put into a game alone, the room goes from 1 game to 2, and final and outcomes are wiped. On V428
  A waits in the lobby, READY there does not start a game alone, and a real rematch still starts.
- `e2e/v428-records.js` M1–M3.

**Whole archive:** no freeze verdict moved. R-REOPEN flags go from impact 1 to 0 (72 flags in 53 rooms). 23 rooms go
from unfinished to complete. PBBW (V394) goes to unfinished: its last two-player game was.

**Still true (OPEN.md Done):**
- The lobby drops the partner's `final` report as a leftover (V296), which is harmless to the records.
- The transcripts never show the stats-screen box score.

## V429 (2026-10-01): the stats screen's passing line counted every catch as another pass

**What the owner saw:** UZGV's stats screen showed Purdy **30/45**. The play-by-play shows **19/23** (19 completions,
3 incompletions, 1 interception), for 324 yards, which the stats screen had right.

**Why — measured, not guessed:** `e2e/probe-stats.js` plays real passes through the QB bot with the bridge's own
correction switched off.
- The engine credits the QB exactly: a completion is +1/+1 and the yards; an incompletion is +1 attempt.
- When the engine records a catch, it ALSO gives the receiver an attempt, and on some catches a completion.
- A kicker's completions/attempts are his kicks.

V333 (DEQC, "a WR carried an impossible 2/1") read those as the QB's passes "leaked" to the wrong player and MOVED
them onto the QB. So every catch added another attempt, and some another completion, on top of the engine's
correct line. Yards were never moved, which is why 324 was right.

**Fix:** the QB's line is his own engine credit. A receiver's completions/attempts are cleared (they are not passes and
are never shown), nothing is added to the QB, and K/P keep their kicks. V352's catch reconcile now reconciles to the
real completions.

**Tests:**
- `e2e/v429-passline.js`, real passes, the bridge as shipped, against the phone's own play-by-play. On V427/V428 one
  completion showed as **2/4** with 2 catches; on V429 it shows **1/3** with 1.
- `v333-boxscore` and `v334-boxpersist` are rewritten to the measured rule (the QB keeps his own 3/5; nothing moves)
  and added to the gate.

## V430 (2026-10-01): every frozen game of the day read on its timeline — three game fixes, the 0:01 glitch, the detector

**21 frozen games** (17 today on V427 plus 4 older) were read on their timelines, five of them by investigators in
parallel. Most were not the game's fault (the detector's), and three roots were ours:

| what happened | rooms | verdict | V430 |
|---|---|---|---|
| a phone reloaded 2–10 s after TAKING the ball; its own live record (a throttled tab's) still said "no ball", so the resume parked it; both parked until TURN-RESCUE guessed ~9 s later — at the wrong spot (own 25 after a punt to the 36) | VWWK, BXDZ, NICE, AOGO | ours | the resume takes back a hand-off it ACKed when its live record is older than the ACK and it sent nothing since (the V266 drain; same spot, the draw reused) |
| overtime: the receiver's LIVE was refused once while the partner was still playing its try (the turn named it), and nothing came back to it (13 s); with the flip just after the horn, V368's 8 s exemption let it through instead — two offenses | ZQMT | ours | the OT receiver waits (500 ms, ≤ 20 s) while the partner's fresh live push says it is playing |
| the partner had left or slept; "both parked" was my stale view of a partner already playing; a phone clock corrected mid-game; no frames drawn while nobody touched the screen; a laptop with no network at all | OHGZ, JDZQ, ZMCM, DNSX, ZNSO, CZFL, NERM | the detector | partner away / partner's own progress / clock stretches / frames need a tap / no network / any sleep signature |
| overtime started while a pick-six try was owed; a reload during an OT try ended the game early; the 4 s hold strands a hand-off on a sleeping laptop; the engine threw every frame from the lobby | FGXJ, DAXK, NERM, IEID | real, open | OPEN.md #1–#4 (V430 logs the engine's full error for #4) |

**The owner's 0:01 glitch** ("one second left, interception, the clock goes down to zero, the ball is turned over and
the clock goes back up to one second"): 53 archived hand-offs. The drive-end record was stamped 0:00, then the 4 s hold
parked the sender, whose engine V293 floors at 0:01, and the send re-stamp (V354) read that floor as time left. Now
the same quarter plus 0:00 at the drive end keeps 0:00. The receiver's engine (live) ends the quarter itself — halftime,
the final, overtime, or the next quarter with its ball — exactly as after the extra play, without the play.

**Telemetry:**
- A visible page writes a clock sample every 15 s. Since V419 any successful upload had restarted the timer: DNSX had
  none in 13 minutes.
- The outcome poll's failures are logged, and coming back online polls at once.
- The engine's full error goes into the audit (`engerr`).
- The monitor says "the match never started (engine error)" when no resume ran.

**Whole archive (1,018 rooms):** 1,006 identical. These changed:
- 0 s: CZFL, JDZQ, NERM, ZMCM, ZNSO (artifacts); VVLQ (the partner left at its end).
- Counted once instead of twice: BXDZ, NICE, OHGZ (reload stalls).
- Now measured to the moment the partner went live, under 10 s: AOGO, ZQMT. Both causes are fixed above.
- KHIX lost a 12 s possession-deadlock flag to the finer clock alignment.

**Tests (each fails on V429 and passes on V430):**
- `v430-reload-ball`: back with the ball in 4 s at the punt's spot; V429 took about 9 s and put it at its own 25.
- `v430-ot-wait`: V429 had two offenses.
- `v430-expired`: V429 sent 0:01 and gave the receiver a play in Q1, Q2 and Q4.
- `v430-checker`: 8 checks.
- `v430-sync`: V429 wrote 0 samples in 50 s.

## V431 (2026-10-01): "is anyone playing?" means someone is playing

V430 waited 3 hours to ship, because `quiet.js` called a room live if any audit entry was under 3 minutes old. A tab left
open writes entries forever: its status line and its clock samples. ZIJY's tabs, whose last play was 28 hours earlier,
counted as live from 3 pm to 7 pm. CRTI's hidden tab kept running its engine clock, with quarter changes and
possession switches but nobody playing.

Now a room is live only if a player MADE something happen in the last 10 minutes: a snap, its result, the hand-off that
ends a drive, or a match start. It still caught CRTI's player coming back at 7:10 pm, and V430 shipped at 8:02 pm with
only ZIJY's abandoned tabs open. Tooling only; no game change.

## V432 (2026-10-02): V430's "keep 0:00" looped at the halftime horn (reverted), and a rematch joined through the resume kept the last game's epoch

Freeze-watch run 20261002-0900. The brief had one frozen game (OKYW); the audit of V430 found two of its fixes doing
harm in real games, one of them worse than anything in the brief.

**1. V430's "keep 0:00" — REVERTED.** All 3 real firings were at the halftime horn, and all 3 looped:

| room | what happened | how it ended |
|---|---|---|
| FOVL (3:35 am) | a completed pass ran out Q2; the hand-off shipped 0:00; the receiver's drive at Q2 0:00 never staged (`EMPTY-FIELD … FAILED`), its engine's halftime turnover went back as a `PUNT` stamped 0:00 — and again, 5 bounces | both players quit at halftime (40 s) |
| ONFE (8:40 am) | the same, 7 bounces | both players quit at halftime (64 s) |
| HIHR (3:26 am) | 1 bounce, then the Q3 law caught it | 11 s |

V430 said the receiver's engine "ends the quarter itself". It did not: a drive staged at 0:00 never gets a play, so
nothing ends it. Its test (`v430-expired` X1) passed because it only asked that both phones reach Q3 within 30 s.
Before V430, 123 archived hand-offs at the Q2 horn (V383–V429) carried 0:01. The receiver played its one down, and
117 of them reached Q3. None of the other 6 bounced. Neither detector saw FOVL or ONFE: the checker called FOVL
**CLEAN**, and stuck-scan saw no stretch of 10 s or more (each phone was "live" for under 7 s). That is OPEN.md #2.
- **Revert:** the send re-stamp is back to V429. The owner's 0:01 glitch (one extra down) is open again (OPEN.md #4).
- **Tests:** `v432-half-horn` drives V430's own drive end at the Q2 horn.
  - H1: the hand-off is not stamped 0:00. V431 sends `OTHER Q2 clk0`.
  - H2: no unplayed hand-off goes back.
  - H3: the receiver plays its 0:01 down for real (`e2e/qb-bot.js`), and the half ends with both phones in Q3 and one
    offense.
  - The harness cannot make the engine ship its halftime turnover after a REAL play. A real pass or run at Q2 0:04
    ended the half through the halftime law on both builds. So the bounce itself is shown on the three real timelines,
    and the test pins the 0:00 stamp that every bounce carried.
  - In one random live-build run, the pass at the horn was intercepted. The PICK6 shipped at 0:00 left the receiver at
    Q2 0:00 and the sender in Q3, both waiting: a second V431 freeze shape from the same stamp.
- **`v430-expired` X1–X3** asserted the V430 rule. They now assert the restored one: the hand-off carries 0:01, the
  receiver has its down, the sender waits, nothing bounces back. X4 is unchanged.

**2. OKYW (the brief's freeze): a rematch joined through the resume carried the finished game's flow record.**
- **What happened (7:54 pm):** game 1 ended at the stats screen on both phones. Both went back to the lobby and pressed
  READY together.
  - A started game 2.
  - B's READY took the V266 guard ("the partner is mid-match"): A's heartbeat was fresh — most likely its "left" beacon
    from 10 s earlier (the guard's read is not logged) — and A's final was already removed by A's own match start. So B
    reloaded into a RESUME of A's game.
  - The resume never runs the game note. V422's synchronous tab restore skips the "this room's latest game" check that
    the async restore makes, so it handed B game 1's record: epoch H, final.
  - Then B ADOPTED game 2's id while keeping epoch H.
  - A's first hand-off (epoch K0) was "moot" on B ("the law of this half owns the ball") and dropped. Both phones parked
    11–12 s, then TURN-RESCUE put B at its own 25 instead of the turnover's spot.
- **Live data:** OKYW b's record on the server is `gid` = game 2, `ep: H`, `final: true`, `gameSrv` 736 s older than A's.
  JCTW b's is the same.
- **How often:** in the archive, 17 rematch starts in 14 rooms since V421 have the second phone joining through the
  resume with the previous game's record (OKYW, JCTW, YISX ×2, FMBV ×2, BXDZ ×2, VAKL, YUHQ, OCCX, ISLU, DAZA, ZMCM,
  EQXQ, KHIX, SJTR). In 9 of those rooms, hand-offs were dropped as moot: JCTW 5, YISX 6, FMBV 4, KHIX 2, and one each
  in OKYW, VAKL, YUHQ, OCCX, ZMCM. In 16 of the 17 starts, the starter's pagehide beacon was under 18 s old, which fits
  the V266 guard reading the V403 "left" beacon as "mid-match".
- **Fix:** when the partner's record was born at a game that started more than 60 s (server time) after mine, mine is a
  finished game's record (`final`) and the ids differ, then my record is a previous game's. I become a page that joined
  mid-game (V422's own rule): untrusted, epoch K0, no chain. The older rescuers are in charge, and nothing is dropped as
  moot.
  - The audit guard is `flow-stale`.
  - B no longer adopts a finished game's id.
  - A legitimate mid-game record is never `final`, so it cannot be reset.
- **Not changed today:** the guard's misreading of the beacon. A phone should not reload into a resume at all when its
  READY started the game. That is OPEN.md #3.
- **Test:** `v432-rematch-join` plays a real game 1 through the halftime law to the stats screen, then both phones use the
  stats screen's own button. A starts game 2, and B's READY goes through the real guard → reload → resume.
  - R1 (setup): B comes back with game 1's epoch-H record (OKYW's state).
  - R2: B applies A's punt.
  - R3: no TURN-RESCUE.
  - R4: B's record is no longer game 1's (`flow-stale` fired).
  - V431 failed R2–R4 in 4 of 4 runs: the punt was dropped as moot, and TURN-RESCUE took 10–28 s and put B at its own 25.
    V432 passed 4/4: the punt was applied at its spot.

**3. Found, NOT fixed today — V430's reload-ball resume fired wrongly in its only real firing (FXTE, 8:07 am).**
- **What happened:** B took a TD kickoff, played three downs into Q2 (3rd & 4 at its 46, 2:54 left), then reloaded.
  - B's live record was older than its ACK (probably its tab drew almost no frames — `rAF silent` — so the 500 ms push lagged), so the resume "took the
    TD again".
  - B was put back at its 40, 1st & 10, with 0:01 left in the half. About 2:53 of Q2 and the downs were lost.
- **Guard for the next run (OPEN.md #1):** do not take a hand-off again when this tab's own flow record shows a down
  settled in that possession (`spot.via === 'settle'` and `spot.stg === lo.ts`).

**Release audit (since V430/V431 shipped at 8:02 pm, 47 real games):**

| fix | firings | verdict |
|---|---|---|
| keep 0:00 | 6 in 3 games | harmful — reverted |
| reload-ball | 1 | harmful — OPEN #1 |
| OT receiver waits | 0 | never fired |
| outcome-poll telemetry | 4 | telemetry only |
| `engerr` | 0 | never fired |
| V428 READY spent | 15 in 9 games | all at the stats screen, then the players left — neutral |
| V429 pass line | — | display only |

**Gate / latch:** see the run report (`~/rb2p/freeze-watch/reports/20261002-0900.md`).

**Run 20261002-1200 — what it added to V432 (detector and tooling only; no game change). V432 is still NOT shipped (gate RED, see the end):**
- **The brief had been blind.** `precheck.js` read `<worktree>/audits` whenever that folder existed. Run 0900's
  `audit-game.js --dry` calls had left 10 rooms there, so the 12:00 brief saw "1 game, 0 frozen" out of 90. `firings.js`
  and `stuck-scan.js` had the same fallback. All three now read the watcher's archive (`~/rb2p/two-player-rb/audits`)
  first.
- **"keep 0:00" was worse than run 0900 measured.** From the V430 ship (1 Oct 8:02 pm) to 12:30 pm on 2 Oct, it
  bounced the ball in **12 rooms**, and at the **Q1 and Q3 horns too**, not only halftime. The 12th, IFJR, bounced at
  the Q1 horn at 12:21 pm while this run was working: 18 s, and both players left 20 s later.
  - PHCY's Q1 bounces also moved the ball. A intercepted B at Q1 0:02 (A's 35). After 5 bounces, B started Q2 with the
    ball at A's 13 (y +37) and scored a touchdown 7 s later: a possession and a score that football never gave.
  - WGVH's Q3 bounces ended with both pages reloading, one of them into "Q1 3:00".
  - **4 games were abandoned at the horn:** ATAN (Q1), FOVL, ONFE and JCPA (13 bounces in 88 s at 30–22).
  - **The rest stalled 14–46 s:** HIHR, HNWX, PHCY, TWYB, WGVH, IFJR; GCPD and QNGB bounced once.
  - 9 of the 12 rooms were after 9 am on 2 Oct, while V432 waited for its gate.
  - **By 1:20 pm, 15 rooms.** IUQI (1:11 pm, 6 bounces) and KPTR (1:12 pm, 8 bounces) were abandoned at the Q1 horn,
    and DCHO bounced once. 12 froze by the new rule, 6 were abandoned at the horn, and 12 of the 15 were after 9 am.
  - The checker counted none of them.
  - The revert covers every quarter, since the whole block is gone.
- **V430's reload-ball resume ("taking it again"): 4 firings since V430.**
  - Harmful: FXTE (OPEN.md #1).
  - Helped: WGVH and IFJR. Each phone reloaded 2–10 s after taking a kickoff, before any snap, and came back with the
    ball at the same spot in ~5 s.
  - Neutral: ATUZ. It fired after the final whistle, from a reload on the stats screen.
  - So the guard in OPEN.md #1 must keep these: no settled down in the possession means take it again.
- **The detector now counts a ping-pong (OPEN.md #2), in `tools/audit-rules.js` (R-FREEZE) and `tools/stuck-scan.js`
  (`PING-PONG`).**
  - A *bounce* is a hand-off sent by a phone with no snap since it applied the previous one. A PAT_RESULT, the
    pick-six scorer's try, is not a bounce, and a re-send with the same ts is not a second one.
  - Two bounces in a row are a frozen game. The freeze runs from the first unplayed hand-off to the next snap
    (temporary), or else to the stats screen, a `pagehide`, or 10 s after the last bounce (permanent).
  - A glance away inside it (app switcher, no pagehide) does not split it.
  - The act monitor's stretches inside it are counted once.
  - **Whole archive, before vs after (1,096 real rooms at 12:20 pm; IFJR came later and reads 18 s temporary):**
    exactly 9 changed, one ping-pong interval each, and nothing else.
    - Permanent: ATAN 27 s, FOVL 36 s, ONFE 64 s, JCPA 88 s.
    - Temporary: HIHR 14 s, PHCY 40 s, HNWX 43 s, TWYB 46 s, WGVH 33 s.
  - **stuck-scan over the archive since V414** finds the same 9. A 10th, BVTQ (V414, 25 Sep), was a PICK6 → PAT_RESULT
    exchange, which is the reason PAT_RESULT is excluded.
  - **Test:** `e2e/v432-checker.js` (pure Node).
    - P1–P6 cover a permanent and a temporary ping-pong, one bounce not counted, the pick-six exchange, a glance away,
      and a re-send.
    - P7 covers the real rooms.
    - The old checker fails P1, P2, P5, P7 and P8 (P8 is below); the new one passes 8/8.
- **R-DOWN no longer flags "inches"** (NPXZ, a player's report at 10:16 am: "a pass for 10 on 1st & 10 left it 2nd").
  - The ball was 0.01 short: 9.99 yards facing 10, so the engine's "2nd & 0.01" is football.
  - The rule judged with a ±0.05 tolerance and called it a first down.
  - A gain within 0.05 of the line is now the engine's call.
  - **Whole archive:** 44 R-DOWN flags in 41 rooms are gone, each one "left it N&0.00–0.05". No other flag was
    removed and none was added. 17 rooms drop from "yardline" to invisible or clean.
  - P8 in `v432-checker` covers it: 9.99 facing 10 is not flagged, and a real wrong down (9.5 facing 10 left 1st & 10)
    still is.
- **stuck-scan:** a phone's stuck stretch now ends with that phone's own record, not the room's. GCPD's B "stuck
  2,197 s" was its stream ending mid-try while A's sleeping tab wrote for 36 more minutes; it now reads 10.6 s.
- **Gate (run 20261002-1200): RED, so V432 is still NOT shipped.** The gate ran 12:00–13:28 at load averages of 10–30.
  MacRemoteCapture had been streaming at ~235% CPU since 4 am; the software-GL test pages are CPU-bound.
  - **Every suite passed alone except four**, plus run.js 14/15. Each of the five fails the same way on live V431 alone,
    or passes on both builds alone:

    | check | V432, alone | V431, alone, same hour |
    |---|---|---|
    | v352-conversion | T5/T6 fail | T5/T6 fail, the same values |
    | v378-gvcg | T3 fails (`liveAt:null`) | T3 fails, the same values |
    | v430-reload-ball | 0/3, then 2/1: B2 (spot 0,0,0, engine still booting) | 2/1: B2, the same |
    | v382-clockgate | 5/2 twice, different checks each time (clock never ticked; refusal at 224 ms vs 150) | 7/0 (V432 7/0 alone in run 0900) |
    | run.js "takeaway" | fails in the full run, passes alone | passes alone |

  - A diagnostic copy of the takeaway test showed the 4 s `setTimeout` hold firing after **10.0 s (V431) and 10.4 s
    (V432)**: page timers run up to 6 s late on this machine today. The test checks once at 4.5 s.
  - V430's last green gate (1 Oct, before 15:11) predates both the capture process (started 2 Oct 4:00 am) and Chrome
    154.0.8037.93 (1 Oct 17:59).
  - No V432 change is on these paths: the `flow-stale` reset needs a `final` record, the revert only differs at a drive
    end stamped 0:00, and the rest is tooling.
  - The gate's rule is GREEN or nothing, so nothing was pushed (OPEN.md #0).
  - Latch check 0 unclassified. Logs: `~/rb2p/freeze-watch/runs/20261002-1200/gate/` and `…/proof/`.

## V433 (2026-10-02): the freeze counter shows the last 24 hours

The owner: "reset the freeze counter like the numbers to just last 24 hours".
- `tools/alltime-stats.js` now publishes `freeze.last24`, a rolling 24 hours: games played in it, games with a freeze
  that began in it (temporary / permanent), their seconds, and the list of them.
- The transcripts page shows only those numbers ("Freezes — last 24 hours").
- The older totals stay in the record for the tools that read them.

With V432's checker (which counts the halftime ping-pong) the first 24 hours read: 174 games, 13 frozen (7 temporary,
6 permanent), 528 s — all but one of them the V430 ping-pong that V432 reverts.

No game change. v428-records and v387-names green; latch check 0 unclassified.

## V434 (2026-10-02): the horn law — every quarter ends through the engine's own time-up; no 0:01 extra play, no bounce

The owner: "Kill these transition issues once and for all. This is REALLY easy, possession ALWAYS goes to Team B",
"I want this glitch gone along with the buffer". The design is from a deep-research run (Opus 5.5 max,
`~/rb2p/research/HORN-RESEARCH.md`, brief `HORN-BRIEF.md`), which reproduced every failure through real downs before
proposing anything.

**What was wrong (one root, three symptoms).** The engine has exactly one way to end a quarter: when a down is over and
the clock reads 0:00, its "set up the next play" step (`_eb1`) refuses to place a ball and calls time-up (`_hB(9)` →
`is_quarter_over` → case 19, quarter + 1). The bridge **rolled that back** ("force NO-BALL (rolled back)") wherever it
staged a drive. So a quarter only ended when the phone with the ball played the last down itself:
- **The 0:01 glitch (the buffer):** a last down that changed possession (an interception, a fumble, a turnover on
  downs, a punt) was shipped from a parked sender that V293 holds at 0:01, and the send re-stamp read that 0:01. The
  receiver got a whole extra down: 150 archived hand-offs, 141 played, 22 scored (132 points).
- **V430's bounce:** shipping 0:00 made the receiver stage a drive at 0:00 — the engine said time-up, the bridge undid
  it, EMPTY-FIELD failed, and the drive-end watchdog shipped a PUNT stamped 0:00 back. Both phones did this to each other
  every ~7 s (FOVL, ONFE, JCPA, KPTR, IUQI, ATAN, ERPY abandoned; PHCY/HNWX handed the ball to the wrong team at Q1/Q3).
  V432 reverted to the buffer.
- **Tries across the horn** handed the scorer a free possession: a down at the 2 in Q3 while the partner took the
  kickoff (METB and ~10 rooms), and after a kicked try at the Q1/Q3 horn a drive at its own 35 (17 of 23 rooms).

The brief's "HALF_END flip" was already gone (V204; zero HALF_END hand-offs in 3,128 rooms). Its last producer line is
deleted here.

**The fix (C1–C10, C13, C14 of the research):**
- **C1, the choke point.** Every bridge path that stages a drive goes through `forceUserOffenseDrive`. At a regulation
  0:00 it now lets the engine's own time-up stand (`_rb2p_hornEnd`: possession, spot and down set, then
  `s_action_result(9)`) and returns `'horn'`. The caller is named in the diag (`HORN Qn — a drive staged by L<line> at
  0:00 ends the quarter here`) and an audit `guard {what:'horn'}`. C1b: at Q5 0:00 outside OT nothing is staged.
- **C2/C3, the stamp.** A drive end decided at 0:00 (after the time the engine still owes: 5–10 s for a punt, 3–5 s for
  a kickoff) is stamped `hornAt` and the send re-stamp keeps Q*n* 0:00 — **only to a partner on V434+**
  (`_rb2p_oppVer`). An older partner still gets 0:01, because it would roll the horn back and bounce.
- **C4/C5, the rescuers.** The drive-end watchdog ends the quarter at 0:00 instead of shipping a PUNT; the kickoff
  sweeper never pokes the engine at 0:00 or at the end-of-quarter park.
- **The existing laws decide the next period:** the keep at Q1→Q2 and Q3→Q4 (the team with the ball after the last
  down, at its spot, 1st & 10, a full clock); the Q3 law at halftime (**Team B, by role**); the final or the OT flip at Q4.
- **C10:** the Q3 law no longer waits on a try that was snapped before the horn (the scorer's free down at the 2).
- **C13:** after a kicked try at the Q1/Q3 horn the keep stands down — the scorer kicks off.
- **C6 (OPEN #5, FGXJ):** overtime is not armed while a try is owed (capped at 120 s); the OT kickoff clears a stale
  pick-six duty. **C14:** the OT kickoff moves to the flip's period and sets 10:00 before it stages.
- **C7:** the `prevVy === 24 → HALF_END` producer is deleted (the receiver's consumer stays for old partners).
- **Latch registry:** `otHoldSince`/`otHoldSawConv` registered as blocking (deadline 120 s); `hornQ`/`hornMs`
  non-blocking.

**Not in V434 (specified by the research, OPEN.md):** C11 (a horn record that arrives after the receiver's quarter
already ended must not lower its quarter: 3 archived records), C12 (a safety on the last down), and the checker rules
R-HORN-EXTRA / R-HORN-RESTAMP / R-HORN-SPOT.

**Tests.** Every down real (the QB bot's trusted input, the engine's own 4th-down dialog, real kicks); the only writes
are a down's setup before its snap.

| test | unmodified V433 (live) | V434 |
|---|---|---|
| `e2e/v434-horn.js` — M1 (the FOVL state) at Q1, Q2, Q3, Q4 decided, Q4 tied; M4 a punt at the Q1 horn | **0 / 6**: every horn hand-off `OTHER Qn clk1`, the receiver snapped the extra down (`a clk0`); at Q1/Q3 the next quarter began on 2nd down; the punt's receiver ran two 0:01 downs | **6 / 6** |
| `e2e/v430-expired.js` X1–X3 (Q2, Q4 decided, Q1) + X4 (time left) | **1 / 4**: X1–X3 `OTHER Qn clk1`, the receiver live at 0:01 | **4 / 4** |
| `e2e/v432-half-horn.js` H1–H3 | **1 / 3**: H1 `OTHER Q2 clk1`, H3 the receiver offered and snapped a Q2 down | **3 / 3** |
| `e2e/v434-horn-outcomes.js` (run, INT, FG, TD+try at Q1/Q2/Q3, pick-six, FGXJ tie, reload, screen off) | (the research's runs: §4.1) | **8 / 8** alone (2 inconclusive: the Q1 and Q2 touchdowns did not score); M3 INT, M5 FG, M6 TD+try at Q3 (C13), M7, **M10 the FGXJ pick-six tie (C6)**, M8 reload, M9 screen off all pass |

Full gate: **GREEN — 57 suites + run.js 15/15** (`~/rb2p/gate-v434/full`, under MacRemoteCapture load, load average ~25).
Two suites failed only in the 4-at-a-time batch, both on the test's side, and pass alone after the fix:
- `v434-horn-outcomes` M3/M5: `horn-last-down.js` took "after the last down" as 3 s after the setup, so the field goal's
  own kick and a retried throw counted as extra plays; and it read the pick-six send 6 s after the snap (it ships ~15 s
  later). Now: after the last down's own snap; the PICK6 send waited for up to 35 s.
- `v430-ot-wait` O1 asserted V430's mechanism (the receiver holds the flip). Under C6 overtime is not armed at all while
  the partner's try is owed — the receiver still waits and the partner plays its try alone ("never two offenses"), and
  it goes live 1 s after the try. O1 now accepts either hold.

**Not yet proven with a real play: C10 at halftime.** The harness reaches Q2 by writing the quarter, which skips the
engine's direction switch (`_Sc1`), so a goal-line run at Q2 goes backwards (gain −99); Q1/Q3 share Q1's direction and
work. C10 is narrow (a try snapped after its offer and before the quarter change) and the halftime horn itself is proven
(M1, H1–H3, M2, M8). Follow-up: reach Q2 through a real Q1 horn, then the touchdown (OPEN.md #4).

**After the push (V435, tests only).** `horn-last-down.js td` uses the lobby's EASY defense (restored after the test;
already in V434's commit) and, since V435, reaches an even quarter through a real horn (a real run at Q n−1 0:01; the
engine's own case 19).
- **C13 proven on the shipped build** (Q1, room of `~/rb2p/gate-v434/td/td-Q1-1.log`): a's dive from the half-yard line
  scored at Q1 0:00 (6-0), its 1-PT kick was played, then `POST-CONV the try crossed the horn … handing off (TD
  kickoff)` → `SEND TD Q2 2:00`; b started Q2 with the ball, 1st & 10, full clock, and took Q2's first snap (V433 gave a
  the ball at its own 35 instead — the research's Z8XW).
- **C10 still unproven:** the real Q1 horn works (Q2 in 2.1 s, a keeps the ball), but the goal-line run at Q2 0:02 was
  stopped short in every attempt (12 of 12, against Q1 1 of 1 and Q3 ~1 of 2 with the same setup); the play runs to its
  end across 0:00 (no rescuer cuts it — the recorder shows Vy 2 / kp 2 until the half ends), it just never scores.


## V436 (2026-10-02): V434's "the try crossed the horn" fired on the RECEIVER — the field mirrored twice in a real game

The first real games on the horn law (QAQL, both phones V435, 19:37–20:03; game 1 complete 50-41, game 2 left at 34-38
with 1:30 to play) crossed seven horns. What the law was built for held every time:
- three horn hand-offs arrived at 0:00 and the receiver's engine ended the quarter itself — 19:40 (Q1, a turnover on
  downs), 19:51 (Q4: the final on both within 2 s), 19:57 (halftime) — no 0:01 extra play, no bounce;
- halftime: b received the second half both games;
- C13 twice (19:47, 20:01): a touchdown on the last play of Q3, the try at 0:00, the scorer kicked off.

**But C13's signal misfired twice in game 1.** POST-CONV (V406/V410, broadened by C13) read "my last snap was a try,
after its offer and before the quarter change" as "my try crossed the horn". That stays true while the OPPONENT plays a
whole drive after my kickoff:
- **19:40:33, b:** b's TD and try (19:39:49), b's kickoff, a's drive, a's 4th-down turnover at Q1 0:00 → b took over at
  a's 34 at the horn (correct) → b's POST-CONV fired 47 s after b's try; EMPTY-FIELD re-staged (more than 40 s since the
  offer) and POST-CONV's fallback forced `s_change_possession` → the field mirrored: **b snapped from its own 34
  (−32 yards)**.
- **19:47:18, a:** b's TD on the last play of Q3, its try at 0:00, b kicked off (C13, correct) → a at its own 27 → a's
  POST-CONV fired 56 s after a's own try → mirrored: **a snapped from b's 27 (+46 yards)** and scored 49 s later.
- No possession went to the wrong team (the forced change never shipped a hand-off), but the yard line moved by 32 and
  46 yards — not by football (R-YARD). V434/V435 caused it; before V434 the "ball at the 2" check stopped it.

**Fix:** `window._rb2p_tryCrossedHorn(offer, qc)` — the try was this phone's last play before the quarter change AND
nothing changed hands since: no hand-off sent (`_rb2p_lastSentOutcomeMs`) or applied (`_rb2p_lastOpponentOutcomeApplyMs`)
after the try's snap. Used by all three readers of that signal: POST-CONV, the keep's void (C13) and the Q3 law (C10).
A real crossing (the try snapped at 0:00, the quarter rolls with the scorer still holding the ball) is unchanged.

**Test:** `e2e/horn-fovl.js` HORN_EVENT=staletry = M11 in `e2e/v434-horn.js`: the FOVL state at Q1 with the receiver's
own last play a try (the bridge's try bookkeeping written: offer 3 s ago, snapped 1.5 s ago). **V435: FAIL M1e** —
POST-CONV fired on the receiver and its ball went from the hand-off spot (−14.4) to +14. **V436: 5/5.**
Also at the same horn in **VZLC (20:13, V435)**: a's last play of Q3 (snapped at 0:02) was intercepted/fumbled
(`BLAST@possession INT/FUM` on b) — the horn hand-off shipped Q3 0:00, b's engine ended Q3 with b holding the ball
(the keep armed at −22) — then b's POST-CONV fired 26 s after b's own try: under 40 s, so EMPTY-FIELD handed off for real
(`SEND PUNT Q4 3:00`) and **b's takeaway was erased** (a started Q4 with the ball). Three harmful firings in 2 games in
~45 minutes of play.

**Shipped before the full gate, on the owner's call** ("push now"): the live build was harming games and the machine was
at load 46 (the gate and the 6 pm freeze-watch run's tests together). The gate kept running after the push.

## V437 (2026-10-02): a game card can no longer say NO FREEZE next to GAME FROZE

The owner: "the no freeze and game frozen tags are showing up the same time again". Two detectors fed the card:
- the **freeze pill** (FROZE Ns / NO FREEZE) = the can-act monitor's measured freeze time;
- the **top grade** ("GAME FROZE OR ENDED WRONGLY") = the worst flag's impact level — reached by flags that are not
  freezes at all, and by stalls the monitor never timed.

The 87 clashing rooms in the archive (1,187 real rooms) had four causes:
- **a recording gap graded as a freeze** — R-XPORT "telemetry dropped N entries" (ABGV: "could not record 4045
  moments"). Now impact 0: a player never sees the recording.
- **an on-screen page hang** — the hung page cannot write its own act entries, so the monitor saw nothing while R-HANG
  graded it "the game froze" (QQZQ: 939 s). The watchdog's stall entries (one every ~10 s during a hang, each with the
  time since the page last answered) are now freeze intervals: timed, TEMPORARY/PERMANENT like any other; R-HANG
  itself is graded through them (impact 0 when the measure exists, 3 on older builds).
- **a chain** — three smaller problems within 25 s are graded one level up; the card said "froze". Now
  "SEVERAL PROBLEMS IN A ROW".
- **stalls the monitor did not time** — R-POSS DEADLOCK / DOUBLE OFFENSE / REFUSED, R-P6 never resolved / chain broke,
  R-XPORT a hand-off never received. Inside a window the monitor judged NOT the game (no network, nobody trying to play —
  V430's CZFL/ZNSO rules) they now defer to it (AOGO, CZFL). Otherwise the card says **FROZE · NOT TIMED** and the
  24-hour counter counts the game ("not timed" cell).

The top grade is named by what it was (`flag.worstKind`): GAME FROZE / GAME ENDED WRONGLY / SEVERAL PROBLEMS IN A ROW.
`audited.frozenUntimed` lists the untimed stall rules. A stored verdict without the new fields that would still clash
reads "A SERIOUS PROBLEM".

**Whole-archive diff** (old vs new rules, 1,187 real rooms; nothing threw): clashes **87 → 0**. 103 "GAME FROZE OR ENDED
WRONGLY" → "GAME FROZE" (timed freezes, label only); 51 NO FREEZE → FROZE · NOT TIMED; 22 → SEVERAL PROBLEMS IN A ROW;
10 NO FREEZE → FROZE (page hangs: QQZQ 1489 s, PGJF 1237 s, TJPM 328 s, LLMK 318 s, PTBE 21 s, RCMA 18 s …); 9 → GAME
ENDED WRONGLY; 12 dropped below the top grade (ABGV and 6 more telemetry gaps; AOGO, CZFL deferred; GLOY, IWCK, DQCK).
The 207 changed rooms' stored verdicts were refreshed after the push.


## V438 (2026-10-02): a reload after taking the ball read the waiting snapshot from before it (FXTE), and the conversion wall threw away a chosen try

Freeze-watch run 20261002-1804 (the 6 pm run, with the daily sweep). The owner's 6:10 pm note froze the quarter-end code
while V434's C10 is proven; nothing here touches it.

**The brief's two frozen games — neither is a code freeze left open:**
- **FQNK (3:20 pm, V433, 13 s "both parked", temporary): a network outage on both Chromebooks.** A's 4th-down
  turnover (OTHER) was sent at 1:47.5 while A's socket was down (1:37.7–2:14.4, 12 drops in a minute); its REST copy
  failed silently (no `REST send … ok/FAILED` line: `fbRestPut` threw), and A's REST uploads landed only twice in the
  stretch (114.1 s and 133.6 s). The record reached the server when A's socket came back; B, itself offline
  2:15.0–2:19.6, polled the moment its network returned (V430's `NET online — polling the hand-off now`) and snapped
  1.4 s after applying. The checker's V430 "no network" rule missed it (A's next upload carried 15 entries, the rule
  wants 20) — OPEN.md #10.
- **MROY (2:40 pm, V433, 11 s "empty field", temporary): FGXJ's shape, which V434's C6 fixed at 18:03.** A pick-six at
  Q4 0:00 tied it before its try; A missed the try; the flip named A, but the stale pick-six duty refused A's OT kickoff
  ten times; A pressed the engine's own post-try kickoff button and handed B the first OT possession; A's empty field
  lasted until TURN-HEAL. C6 clears that duty at the OT kickoff (OPEN.md #4 says what to watch).

**Release audit (V432 shipped 14:13, V433 14:13, V434 18:03; 64 real games since noon; the owner's V435–V437 landed during this run):**

| fix | firings since its ship | verdict |
|---|---|---|
| V432 revert of "keep 0:00" | no ping-pong in any V432+ game (the brief's 4 ping-pongs are V431: IFJR, IUQI, KPTR, UYZP) | helped |
| V432 `flow-stale` (OKYW) | 1: QFJK 2:35 pm — A reloaded into game 2 with game 1's record, reset, snapped 1.2 s later | helped |
| V430 reload-ball (live in V432+) | 1: QFJK — took game 1's TD again in game 2; A was the opening receiver anyway | neutral (OPEN.md #1) |
| V433 counter | — | display only |
| V434 horn law | at 18:10: 0 real games; by 21:15: 9 firings in 3 real games (QAQL, VZLC, ZCEX) | every horn → the next period by rule, no freeze, all three finished (QAQL's receiver-side post-conv hand-off = the owner's V436) |

**Detector check (two background readers + this run):** of the stuck-scan stretches since noon, most were players
taking their time (the TD → 1 PT / 2 PT choice sitting 11–29 s: ZNSO ×3; KLHQ; EEQG's Q3 kickoff) or stuck-scan
artifacts (COVERED that is the "final soon" cover; DCHO/RPLL phones whose stream had ended). Two real stalls the checker
missed: **LDVA** (a visible Chromebook at 2–8 fps, 17 unanswered clicks over ~88 s, game abandoned — OPEN.md #9) and
**IJYB** (a rematch both phones started: game 1's 42-40 floored onto the new game, A's kickoff never reached B, 77 s —
OPEN.md #2). Today's R-POSS "deadlock" flags were hidden phones (artifacts), R-GIFT/R-P6 had 8 artifact flags at Q3/Q5
(OPEN.md #10).

**1. FXTE (OPEN.md #1) — why, five times.**
1. Why was B put back at the kickoff with 0:01 left? The resume "took the TD again" (V430): its ACK was newer than its
   own record and the record said "no ball".
2. Why did B's record say "no ball" after three downs? Not the live record: B pushed it every 500 ms (A's mirror
   followed B's quarter change at 4:06.8, after B's ACK at 3:54.7). The resume does not read the live record when the
   stable snapshot (`snap/<role>`, V197) is under 25 s old — and B reloaded 21.9 s after taking the ball.
3. Why was the snapshot still the waiting one? It is written only while the phone waits or when the 500 ms sampler
   catches the controller at kp 1 — a beat an offense almost never shows it. Harness, live V434: 22 s after taking a
   punt and playing a down, the server's snapshot said `iHaveBall:false`, 22.6 s old; the live record said 2nd & 1 with
   the ball, 0.6 s old.
4. Is it our own earlier fix? Yes, twice: V197 chose the snapshot to avoid mid-play transients and V430 trusted it to
   decide "taking it again". V430's own rooms (VWWK, BXDZ, NICE: reloads 2.6–8.2 s after taking the ball, parked until
   TURN-RESCUE) are the same input — V430 called it a throttled tab.
5. Root: a "stable" record that is stale across a possession change was preferred over a fresher one.
- **Fix:** a snapshot that says I was waiting, under a live record that has said I hold the ball for over 1.5 s (a
  waiting phone refreshes its snapshot every 500 ms) on a scrimmage down (1–4, the snapshot's own rule) and not an
  earlier quarter, is from before the possession change: my own newer facts decide. The live record is a 500 ms sample
  and can be one push behind a down that just settled (seen on the final tree: an incompletion 0.6 s before the reload
  came back as the down before it — the very 1-s window FXTE reloaded in), so the down, distance and spot come from
  this tab's flow record (`sessionStorage rb2p_flow_<room>_<role>`, its `spot` written at the settle — the restore
  rule's own "last time the game was not frozen") when it is this possession's (`spot.stg === staged`, same epoch,
  `via: 'settle'`), in the live record's quarter and not older than it (its clock not above the sample's); else from
  the live record. Diag `RESUME my snapshot says waiting, N s older than my live record with the ball — resuming from
  this tab's last settled down | the live record (d & tg at y)`, audit `guard resume-live` (`via: settle|live`). The
  existing resume then restores that down and spot (V186). V430's take-again stays for a phone whose live record is
  stale too (v430-reload-ball holds the live push).
- **Not shadowed:** it moves nothing new — the resume already decides possession from this phone's own last record; it
  now reads the newest one. The take-again it replaces in these cases did harm in 1 of its real firings (FXTE).
- **Test `e2e/v438-reload-played-on.js`** (a punt, ONE real down — the QB bot's throw-away, FXTE's last down was an
  incompletion — then the reload; the snapshot's age at the resume's own read is timed from its console, and a read
  outside the 25 s window is retried with the roles swapped, then exit 3): live V434 **3/5** — P1/P2 FAIL (parked; 11 s
  later TURN-RESCUE put B at its own 25 instead of its 14 on 2nd down); an earlier live run: "taking it again", back to
  the punt's 1st & 10. V438 **5/5** (back LIVE at once, 2nd & 10 at its 17, same clock). On the rebased tree, before the settled-down
  refinement: 4/5 — P2 lost the incompletion's down (the live record said 1st & 10, 0.45 s old); with it: 5/5 twice,
  one of them the same race (the live record said 1st down, B came back 2nd & 10).

**2. The daily sweep's top root outside the horn code: the 35 s conversion wall threw away a chosen try (5 games).**
- PKXS (pick-six try), RVLS, EKRA, ZNSO, CGQB: the player tapped 1 PT / 2 PT and the wall shipped "resolving the
  conversion as MISSED" 0.3–2.7 s later (RVLS: tap 08:36.2, kick set at the 35 at 08:36.3, wall 08:36.5).
- **Why:** the wall's holds cover the choice ON screen (V415: it re-looks every 5 s while the choice is up, until 90 s
  after the offer) and a launched try (V406, `convTrySnappedMs`). Between the tap and the launch neither holds, so the
  first look after the tap fired.
- **Fix:** every in-match press is stamped (`_rb2p_lastPressMs`, canvas pointerdown). A player who pressed since the
  offer, with the try lined up on this phone (down 6, or the kick set — `enginePatModeFlag`), not the pick-six thrower,
  gets 20 s from the last press, within the same 90 s from the offer. Diag `PAT-INV wall waits — the player chose and
  is lining up the try`, audit `guard wall-wait-try`. Nothing is moved: only the wall waits; a player who chooses and
  walks away still gets the wall 20 s after the last press.
- **Test `e2e/v438-wall-try.js`** (a real goal-line TD; the choice left on screen past the 35 s mark; 1 PT tapped right
  after the wall's look; a real kick through the meter 5 s later): live V434 **1/4** — W1 FAIL "35s wall — resolving the
  conversion as MISSED" ~5 s after the tap, the kick never counted. V438 **4/4** — the wall waited, the kick launched,
  good, 6 → 7, the scorer's KICKOFF carried 7.

**Also found by the sweep, NOT fixed here (horn-adjacent, OPEN.md #0):** a 2-pt RUN try across a horn is invisible to
every try-snapped test and gave VCUH's A 8 unearned points; V394's retype ships a turnover as a TD kickoff when it ends
a new drive within 60 s of the try (17 drive ends in 14 rooms); the halftime free down at the 2 (V434 C10). Also the
wall's screen-on rule leaks after a long hide (UKMX, NQEV — OPEN.md #13).

Latch registry: `_rb2p_lastPressMs`, `_rb2p_convWallChoiceFor` non-blocking (a time; a log gate).

**Gate — NOT green, NOT shipped.** The full gate ran 19:00–21:03 on the V434-based commit at load averages 30–42 (the
owner's horn tests ran in parallel, plus MacRemoteCapture): ~22 suites failed in the 4-at-a-time batch, run.js 14/15
("takeaway", as on live at 12:00). Solo before the run ended: v434-horn-outcomes 8 of 10 (M6-Q3 fails alone on the live
build too, `proof/m6q3-live.log` — both phones waiting at Q3 0:01 after the wall's MISSED, OPEN.md #0d; the halftime M6
inconclusive as in the owner's runs); on the final rebased tree v438-wall-try 4/4, v438-reload-played-on 5/5 ×2,
v430-reload-ball 3/0; v352-conversion (T5, T6) and v378-gvcg (T2, T3) fail alone with the same values on the live V437
build. The owner's V435–V437 landed during the run; this commit was rebased onto V437 and relabelled. The next run
gates this exact tree and ships it.

## V440 (2026-10-02): phones and iPads — never rotated, the whole game on screen, "turn your device sideways"

The owner: "make sure the orientation on phone is optimal and NEVER switches. If that is impossible, have something that
says, play in landscape only, and in this you should be able to see the clock and the down and yards. Also the options
to change play and call time outs".
- **Measured on V438** (e2e/probe-orientation.js, a real two-player game on emulated touch devices): the layout
  COVER-scaled the engine's 16:9 picture to fill the screen — a phone in landscape (874×402) lost 45 px at the top and
  bottom (874×360 with the toolbar: 66 px), i.e. the WHOLE scoreboard: score, quarter, the clock you tap to call a
  timeout, down & distance; an iPad (1180×820) lost 138 px at each side (down & distance, Change Play, the QB's name).
  The menu, version and report chips sat over the scoreboard's corners. A device held upright got the game rotated
  -90° (rb-rot90, V214), so every turn of the device flipped the whole page — and a WebGL canvas inside a rotated body
  was the GET READY compositor freeze (V246).
- **V440:** never rotated. A touch device held upright (`html.rb-portrait`) gets the "TURN YOUR DEVICE SIDEWAYS — Retro
  Bowl 2P plays in landscape only" screen (with the Rotation Lock tip); the engine's `_tI2/_uI2` keep sizing for
  landscape meanwhile, so turning it shows the game unchanged. Android Chrome gets a real lock (fullscreen +
  `screen.orientation.lock('landscape')`) on the first lobby-button tap; iOS/iPadOS have no lock API. layout() CONTAINS
  the picture inside the safe area (notch, corners, home bar) — nothing is ever cut off — and moves the chips into the
  bars beside / above it. Orientation changes are logged (`ORIENT …`, audit `orient`).
- **Device mix this affects** (V438 profiles): 165 iPads, 20 iPhones, 1 Android tablet played two-player games.
- **Tests:** e2e/v440-orientation.js — O1 the whole game on screen at 874×402, 874×360, 667×375, 1180×820; O2 the chips
  beside the picture; O3 upright = the screen, nothing rotated, the same picture back. V438: 0/3 (cut 45/66/138 px,
  chips over the game, rotated); V440: 3/3. e2e/v419-scroll.js T4 now asserts the upright screen and, turned sideways,
  taps landing where the finger is on a scrolled page.

## V441 (2026-10-03): the blue circle answers a Chromebook click; a run is a snap; a turnover after a try stays a turnover

**The blue circle** (the owner: "sometimes running the ball freeze sometimes while rest of game works", "sometimes just
clicking on the blue circle didn't work"; research: `~/rb2p/research/BLUE-CIRCLE.md`). A run starts with a press within
20 room px of the running back's feet (the blue ring, ball kp 19); any other press is a pass press — so a lost click
looks like "the run froze". No mid-run freeze in 2,828 real hand-offs.
- **B (fixed): a Chromebook click shorter than a frame was lost.** The engine reads the button at its steps; touch had a
  latch for this (V259), the mouse did not. Tap-to-click delivers down+up back to back: 0/6 hand-offs at 0 ms in the
  harness; 53 Chromebook downs clicked twice for one hand-off (Windows/Mac: 1). A left mouse press now arms the latch.
  e2e/blue-circle.js T1: V440 0/3, V441 3/3.
- **C (fixed by V440's layout, plus a belt):** presses were scaled by the canvas BUFFER size, so on a cover-stretched
  landscape phone the lower screen read as the button strip (touch presses there: 29% answered vs 98% elsewhere). V440
  shows the canvas at its buffer size — T3/T4 pass on V440 already; `_m01/_o01` now divide by the display scale too.
- **D (gone with V440):** the rotated portrait phone's hit circle sat 30–80 px off the drawn ring — nothing is rotated now.
- **A (the owner's call, not changed):** the hit circle is 20 px at the feet; players click the body (7.6 per 100
  Chromebook hand-offs came after a registered miss). A 26 px circle 10 px up the body was tested, not shipped.

**OPEN #0a — a run is a snap.** `_rb2p_lastSnapMs/Down` (and the score at the snap) were written only by the pass snap
(cSNAP): a 2-pt RUN try crossing the horn was invisible to every "a try was snapped" test (V410, V434 C13/C10, V436),
and a rushing touchdown's L1c baseline was the last PASS (VCUH, V433: 8 points never earned). A run's start (ball 0 → 19)
now writes them. And POST-CONV's "never during a live play" guard never ran: `rb2pPlayInProgress` is declared in a later
<script>'s scope (`typeof` was always 'undefined' — checked in a live page); it calls the export now (VCUH: the hand-off
fired 0.3 s into a live run). Guard test: v434-horn-outcomes M6b (a 2-pt run try at the Q1 horn → the scorer kicks off),
green on V440 and V441.

**OPEN #0b — a turnover after a try stays a turnover** (17 drive ends in 14 rooms on 2 Oct: EEQG, KLHQ, CGQB …). V394
typed every drive end within 60 s of the scorer's conversion offer as the touchdown's kickoff — also a NEW drive's
turnover, so the receiver started at a kickoff return. Now only the try's own drive end: a normal down snapped since
the offer (runs included), a hand-off taken, or one sent (other than a pick-six scorer's PAT_RESULT) keeps OTHER.
e2e/v441-retype.js (in v434-horn-outcomes, R1): V440 0/2 (the turnover shipped TD; the partner started at its own 28),
V441 2/2 (OTHER; the partner at the turnover spot).

## V452 (2026-10-03): a rematch READY no longer reloads into a resume because the partner's page said it LEFT (OPEN #3)

Freeze-watch run 20261003-1500. The brief had **no new frozen game**: the 5 "real games played since noon" were all tabs
left open on V414–V429 (KDZI, OHGZ, QQZQ, VDEJ, XRZO — no snap, send or game entry since 12:00), stuck-scan found no
episode, no player wrote in. V446 (the repo move, game code = the label) had no real game yet; all three doors serve it
and `/.git/config` answers 404 on each. So the run took OPEN.md's top item that is not horn code: #3 (the V266 READY
guard), which is also the cause of #1's QFJK variant.

**What happened (VZLC, 2 Oct 8:17 pm, V435 — the same as QFJK, 2:35 pm, V433).** Game 1 ended at the stats screen.
A pressed BACK TO LOBBY at 14:01.8; B stayed on the stats screen and pressed it at 14:26.4. Both pressed READY about
12 s later. B started game 2 (`14:38.6 b game`); A did not: `14:39.5 a RESUME the TD I took before the reload is newer
than my live record — taking it again`, `14:39.8 a bind`, `FLOW my record was the previous game's … flow-stale`.
A's page had reloaded into a resume of the game its own READY had just started, and took game 1's last touchdown
(B's, sent 13:48.2, 51 s old) again. It cost nothing there only because A was game 2's opening receiver anyway; the
same take-again on B (a hand-off A sent last) would give B the ball while A kicks off as the opening receiver.

**Why, five times.**
1. *Why did A's game 2 begin with a reload and a resume?* The V266 READY guard in `maybeStartMatch` reloaded it
   ("READY blocked — opponent mid-match; resuming" — logged in the lobby, whose audit entries die with the reload, so
   it was never in the archive).
2. *Why did the guard think B was mid-match?* `hb/b` was under 15 s old and B had no `final` under 60 s old.
3. *Why was `hb/b` fresh?* It was B's V403 pagehide beacon, `{vis:'X'}`, written by the BACK TO LOBBY reload 12 s
   earlier — "this page LEFT", the opposite of mid-match. The guard (V266/V268) predates V403 and reads only `ts`.
4. *Why didn't B's `final` exempt it (the guard's "rematch" test)?* A's own lobby page had deleted it: a page that has
   started no match takes any partner final as a leftover and removes it (index.html ~17835, V296 / V422 F27). So for
   the phone that went back first, the exemption can never hold, and the reload is not a race — it happens every time
   the partner's beacon is under 15 s old.
5. **Root: two features gave one record opposite meanings.** V403 made the heartbeat also say "I left"; the V266 guard
   still takes any fresh heartbeat as "alive in a match", and its fallback evidence (the partner's final) is removed
   by V296's lobby sweep before it is read.

**How often (whole archive, 1,114 game starts).** 37 starts had one phone start and the other join by a reload within
90 s; in **26 rematch joins the starter's "left" beacon was under 18 s old** when the joiner's READY took the guard (22
under 15 s; the rest within the two phones' clock offset). What it cost: before V432 the joiner kept game 1's flow
record and dropped game 2's first hand-offs as moot (OKYW, YISX ×2, FMBV; three of them ended in a TURN-RESCUE guess at
the joiner's own 25 — V432 ledger); since V432, **both** beacon joins (QFJK, VZLC) took game 1's last hand-off again.
Every one of them also lost the joiner a page reload at the start of the game.

**The fix (index.html `maybeStartMatch`).** A fresh heartbeat with `vis:'X'` is not "mid-match" **when this tab's own
flow record says its last game in this room is over** (`sessionStorage rb2p_flow_<room>_<role>`, `final: true` — kept
across BACK TO LOBBY and a reload; both real joiners had it: their resumed pages logged `FLOW restored from this tab …
ep H`, then V432's `flow-stale`, which needs `final`). Coverage in the archive: every beacon join on a build that keeps
the tab record (V422+) restored the PREVIOUS game's record from the tab — 18 of 18 (17 epoch H, QXCA OT5); the other 8
are V405–V421 builds, before the tab record existed. Then the phone starts the game itself (diag `READY guard: the
partner's heartbeat is its "left" beacon (N s old) and my last game here is over — not mid-match; starting`, audit
`guard ready-left` with the age). Every other case keeps the guard as it was. Telemetry: when the guard does reload,
it carries its read (`age`, `vis`, the final's age, `tabFinal`) in sessionStorage to the resumed page, which audits it
at bind (`guard ready-reload`) — the archive had never seen the guard's read. Nothing moves the ball, the score or
possession, and nothing parks a phone: the rematch starts on both phones the normal way (`startMatch`, V402's barrier
on A).

**Why it cannot start a second match under a live one.** The guard's real case is a phone in the lobby while its
partner's game is live. If this tab's last game in this room ended, the partner's last game ended with it, and a new
game starts only from a READY pressed on the page that starts it (V428) — so the only live game the partner can be in
is the one this READY pair is starting. Why the tab condition is needed at all: `X` alone is not "gone" — of 1,114
archived pagehides with a next entry, 66 were followed by the SAME page coming back (back-forward cache, iOS), and a
partner page that reloads mid-game writes `X` while its resume re-claims its seat with `ready: inProgress` for a moment
(~17228) — a fresh tab in the lobby could meet both. That case keeps the old guard (`V450_CONTROL=1` below).
Residual: OPEN #3's second route (JCTW: the partner started a game alone off this tab's re-claimed READY) plus the
partner's page reloading within 15 s of this READY — not seen in the archive.

**Tests.**
- `e2e/v449-ready-left.js` (new, in suites.txt): a real game 1 through the engine's own final path, A back to the lobby
  first, B 66 s later with the stats screen's own button, both READY right after B's new page is up. **Live build
  (V446 main tree, temporary copy, port 8802): L1 L2 L3 FAIL** — `game entries a 0 b 1; A's page kept its marker
  false` (A reloaded into the resume). **V452: 4/4** — `game entries a 1 b 1; marker true; guard ready-left`.
  `V450_CONTROL=1` (A's tab record removed — a fresh tab's view): the guard still reloads A, and the resumed page audits
  `guard ready-reload vis X tabFinal false` (2/2). Logs: `.rb2p/freeze-watch/runs/20261003-1500/proof/`.
  - Drafts that did not count: the first pressed READY on B's old page before its BACK TO LOBBY reload (the test now
    waits for the new page); in one live run B's page took ~13 s to come back under load, so the beacon was past
    15 s before READY and the live build passed. A phone reloads in seconds (VZLC B: BACK TO LOBBY to game 2 in 12 s,
    both READY presses included), so the test re-stamps B's own beacon record with the current time once B's new
    page is up (printed: 9.2–9.3 s old in the runs above).
- The guard's real job: `e2e/v432-rematch-join.js` (A in game 2 for 7 s; B's READY must reload into the resume). With
  a debug print of what B's guard read: **V452 4/4** (`hb/a {vis:'V'}` 0.4 s old → reload → resume → flow-stale). Its
  R1/R4 failed once on V452 and once on the LIVE build in the same hour, both with `hb/a null`: under load A's first
  in-match heartbeat came later than the test's 7 s, so there was nothing for the guard to read (a harness timing,
  the same on both builds).
- On V452: v403-endings 6/6 (the left beacon / OPPONENT LEFT), v425-rematch 3/3, v428-ready 3/3 (the live build 3/3
  beside it; a first run with four browsers at load 24 missed E3 with both seats un-READY — the guard never ran).
- `node tools/latch-check.js`: 0 unclassified (`storage:rb2p_readyGuardNote` registered as non-blocking telemetry).

**Still open:** OPEN #1's take-again itself (a resume that takes a hand-off from the PREVIOUS game) can still be
reached by the other join route — a page that reloads just before its partner's start (JCTW, TYHC: the starter's
beacon 80 s old, so not the guard). Its fix plan stays in OPEN #1.

Shipped as V452 by the owner's session (3 Oct, night), ahead of the run's other held commits: RUN IT BACK (V454)
starts a rematch from both stats screens within seconds, which is exactly this guard's case.

## V453 (2026-10-03): the end-of-quarter pause never continues on its own — the phantom punt and the one-time "play change"

The owner, on LQOB's transcript: "q1 to q2 there was no punt" and "the infinite play glitch sometimes still happens but
only one time and only on quarter boundaries".

**What happened.** At a quarter's end the engine parks at Vy=13 (case 19: "End of …", the line score, its Continue
button — "Kick Off"/"Receive" at the half). In commentary mode (kp 1) the controller step `_17` re-enters
`s_update_commentary` on ANY tap (`mouse_check_button_pressed` sets `a`), not only on that button, and runs e20 — the
single-player continuation (clock reset, `_Vy = _0d1`, a kickoff at the half, the coin at Q5). The bridge owns that
moment (the keep, the Q3 law, the final, the OT flip; HORN-RESEARCH: "e20 never runs"). Before V434 the sweeper's kp=2
write kept the pause short; since V434 (C5) the park lasts ~2 s at kp 1 and every tap in it ran e20:
- **The triple keep.** Real V434+ games: 16 of 16 quarter changes the holder tapped through re-spawned the play three
  times (`QTR-KEEP resume` ×2, then "QTR-KEEP #3 — fresh spawn … routes reset", the snap at ~6 s); 7 of 7 untapped ones
  kept once. (V380–V433: 89 of 213 tapped, 78 of 761 untapped.)
- **The phantom punt.** After a touchdown hand-off at 0:00 (the receiver's horn), e20 handed the engine's possession to
  its gutted AI stage (Vy 23); the receiver's next tap kicked the ball to the scorer and the bridge shipped a PUNT at the
  new quarter's full clock: LQOB b Q1→Q2 (V447), NPRA a Q3→Q4 (V444), VZLC b Q3→Q4 (V435). Of the 7 real 0:00 hand-offs
  into Q2/Q4 since V434, the 4 untapped ones started the quarter right.
- The bridge's own `hookEngineCommentaryScript` wraps the SCRIPT-TABLE entry (`_Y._PU1[900]`); `_17` calls the global
  `_Ib1` by name. Measured: 7 calls of the global, 0 of the table entry. Anything that must see the per-frame commentary
  step has to wrap the global (the clamp's OT/game-over branches only run on the table path).

**The fix (index.html, next to the `_Ky` hook):** in a 2P match (`_rb2p_myFirebaseRole`, engine in the match room) the
global `_Ib1` returns at Vy=13 and clears `_7z` (diag `QTR-HOLD … ignored a tap`, audit `guard {what:'qtr-hold'}`,
once per quarter); `_Iy` parks the end-of-quarter button it just spawned (Vy 12/13: invisible, off-screen); the mobile
tap-bridge's dead-button path stands down in the pause. The bridge leaves Vy=13 by writing the stage, never through e20.
Single-player (vs KC) is unchanged.

**Test:** `e2e/qtr-tap.js` (suites.txt), real downs and real taps. Live V450: K0 (e20 ran), K1 (keeps 1,2,3 + a fresh
spawn), T0, T1 (`b PUNT clk120` — LQOB exactly), T2 FAIL, 2 passed; V453: 7/7 (one keep at 1.6 s, the snap at 1.7 s;
the receiver's first Q2 snap at the hand-off spot).

## V455 (2026-10-03): the waiting phone's own game canvas is not composited under the opponent's screen

V450's replay (the opponent's screen on the wait screen) put a second full-screen WebGL layer over the engine's canvas.
On a GPU-less browser (the gate's SwiftShader Chrome) that stalled the receiving page — and its partner — for over a
second at a quarter-end hand-off: `OUTCOME held (OTHER) — the engine is not drawing frames (fps 0)`, then TURN-RESCUE
applied it (the right drive every time). The V450 gate: v434-horn M4 and v434-horn-outcomes M3/M6/M6b H3 ("a rescuer
acted at the horn"), batch and alone; V449 had none (3/3); bisect: the link alone no, the rendering yes. Not seen on real
phones (GRRL, V450: 11 hand-offs each way, no hold).

**The fix (the replay's show/hide):** while the replay covers it, the engine canvas is `visibility: hidden` — the engine
keeps running and drawing, the compositor skips the layer; `hide()` restores it in the same step the replay goes away (the
hand-off, a stale link, the match's end). Taps during the replay already went to the engine canvas under a
`pointer-events: none` replay; on a waiting phone nothing there needs one.

**Measured:** the punt-at-the-Q1-horn probe 4/4 with no hold (about half the runs held before); v434-horn 7/7 (V453
without it: M4 H3 FAIL); opp-view 6/6 (fidelity ≥ 99.9 %, smoothness, W4 "the waiting phone's own game is untouched").

Also: `e2e/v432-rematch-join.js` R1 reads the resume's restored record from the audit's `flow-stale` guard when the
11-line diag ring has already dropped `FLOW restored …` (since V450 a waiting phone logs the replay's VIEW lines too —
R1 failed on V453 with R2–R4 green).

## V456 (2026-10-04): RUN IT BACK's pulse without repaints; four tests no longer read evidence a page has already dropped

From the V455 gate (RED: v430-reload-ball B2 and final-scroll alone; v434-horn-outcomes, v394-fixes, v398-games and
v410-lobby failed only in the batch). None was the game:
- **RUN IT BACK's pulse** animated `box-shadow` (a repaint every frame — the stats screen is where players linger, some
  on GPU-less Chromebooks). Now a gold ring on its own layer grows and fades (transform + opacity; nothing repaints).
  final-scroll's F4 "Input.dispatchTouchEvent timed out" also hit V450's batch, which has no button; alone on V455 and
  V450 it passed 4/4.
- **The on-page diag ring keeps 11 lines.** Since V450 a phone also logs the opponent's-screen lines (VIEW …, OPP-VIS),
  so a line a test looks for seconds later can be gone: v398-games T4 (GAME-START), v394-fixes T4 (the TD typing),
  v410-lobby T6. They now record every diag line themselves (a wrapper on `window._rb2p_diagLog`); v432-rematch-join
  R1 reads the audit (V455).
- **v410-lobby T6** staged its try "snapped 8 s ago" six seconds into a game — older than the opening drive's own apply
  stamp (pollA writes `_rb2p_lastOpponentOutcomeApplyMs`), so `_rb2p_tryCrossedHorn` rightly said "a hand-off came after
  the try" and the watcher waited for the duty. The offer, snap and quarter change are now staged in the last 3 s.
- **v430-reload-ball** took "not waiting" for "LIVE" — but `_rb2p_userIsWaitingForOpponent` is undefined on a page still
  booting, so the spot was read there: 0/0/0 (V449, V450 and V455 batch runs alike). LIVE now needs a real drive
  (down 1–4). Fixed test on V455's game: 3/3 twice (the punt spot, 1st & 10, LIVE ~4 s after rejoining).
- New: `e2e/run-it-back-both.js` (suites.txt) — both players tap RUN IT BACK within a second: B1 passes (game 2 on both
  ~11 s after the taps, no guard reload).

## V458 (2026-10-04): every play is recorded as the opponent's-screen numbers — stored 24 h, archived 30 days, videos on demand; the day's top 5 picked by Sonnet 5.5 at 6 pm

The owner (after asking for a video of AWSK's Kittle touchdown, Q2 0:50 — never recorded): "store the numerical
representation of every play for 24 hours then take it out of firebase and store just the numerical representation in
local file somewhere and then delete it every 30 days" — chosen: every play, with a guard on the free plan's downloads.

- **The phone with the ball** records each play from its `snap` audit (a pass, a run, a kick) until it settles or the
  ball changes hands (`settle` / `send`), + 1.5 s — or the ball is set for the next snap (+1.2 s), or at most 6 s after
  the ball is dead (the first down of a drive often has no settle: it ran to the 30 s cap before; the settle itself comes
  ~4 s after the whistle) — at 15 frames a second (10 if encoding runs long): the V450 capture,
  its own chain (a keyframe every 4 s, deltas between), packed (time step, length, frame), deflate-raw, base64 —
  uploaded AFTER the play by REST to `rooms/{code}/plays/{role}/p{ms}` with the snap's facts and the result. A real 6–13 s
  play: 88–167 frames, 35–43 KB. The capture serves the live link and the recorder from one frame (CAP.forLink /
  CAP.forRec); the recorder never touches the link's chain.
- **The guard:** the phones record only while `embedcode/playrec` (public read, admin write) says `on` and is fresh
  (< 26 h). `tools/plays-archive.js` (LaunchAgent com.rb2p.plays-archive, hourly) publishes it; it turns off at this
  month's budget of play downloads (3000 MB of the 10 GB plan) — and if the Mac stops running the job, the recording stops
  within 26 h, so Firebase never fills. A test run never records unless the test forces it (`_rb2p_recForce`).
- **The Mac:** each hour, plays older than 24 h move to `~/Projects/two-player-rb/.rb2p/plays-archive/{day}/{CODE}/` —
  written, read back, then that node deleted from Firebase; day folders older than 30 days are deleted; the month's
  downloads are counted in `ledger.json`.
- **Videos:** `node tools/play-video.js CODE --q 2 --clk 50 [--name KITTLE]` (or `--file`) renders a play with the game's
  own replay renderer (gliding at 60 fps, like the live opponent's screen) to H.264 in `~/Projects/two-player-rb/highlight
  plays/` (git-ignored, never deployed). 1080p: ~22 s to render an 8 s play.
- **Tests:** `e2e/play-rec.js` P1–P7 (a real down stored after the play with its facts and result; the whole play at
  15 fps, every frame decodes; the last frame is a real picture; under 250 KB; nothing recorded without the flag; the
  live opponent's screen unaffected; the video tool's MP4 at 60 fps and the play's length); `e2e/plays-archive.js` A1–A5.
- **The track** (`zt`, deflated JSON beside the picture numbers): what happened, each recorded frame — the ball (x, y,
  height, `_kp` state, holder) and every player (x, y, action `_g21`, engaged-with `_l31`), the holder's stiff arms and
  hurdles left (`_p51`, `_q51`: the engine spends one per stiff arm / hurdle) and tackle count (`__51`); the roster once
  (id, side, position `_O01`, surname). ~6–10 KB a play.
- **The daily highlights** (the owner: "everyday at 6 pm a sonnet 5.5 to look at all the plays that happened in the 24 hr
  period and choose the top 5 most impressive ... not just normal 50 yard touch downs ... juking a bunch of players,
  stiff arms breaking tackles, last moment hail marys ... Also make sure it actually runs"): `tools/highlights/daily.js`
  (LaunchAgent com.rb2p.highlights, 18:00 and 18:30; `tools/install-highlights.sh`). Every play of the 24 h (the archive,
  and Firebase — its copy kept in the archive, which the hourly mover then reuses: one download per play) is measured by
  `features.js` with the engine's own rules (20 px a yard, midfield x 1300; ball states 4 tackled, 6 TD, 7 incomplete,
  8 out, 9 intercepted, 11 sack, 13 fumble; actions 3 engaged, 4 down, 5 dive, 8 hurdle, 9 stiff arm): broken tackles,
  defenders who dove and missed or were left behind, stiff arms, hurdles, yards after contact, air yards and hang time,
  late clock, lead change — with each play's story in words. Up to 24 are short-listed and drawn as contact sheets (nine
  captioned frames, `render.js`); `claude -p --model claude-sonnet-5-5` reads `JUDGE.md`, every play's numbers and
  stories, looks at every sheet and writes `top5.json`; a judge that fails twice leaves the measured order, said so.
  The five become 1080p60 MP4s (the headline over the first seconds, trimmed to the play) in `highlight plays/YYYY-MM-DD/`
  with README.md, and a Mac notification. Run files: `.rb2p/highlights/runs/YYYY-MM-DD/`; log `.rb2p/highlights.log`.
  Proven under launchd on a harness game's real plays: exit 0 in 175 s, Sonnet 5.5's five with reasons citing the frames
  ("Stiff Arm!" labels), five 1920×1080 60 fps videos. The play detector was checked against the game's own on-screen
  labels in the frames, and the gain from positions alone against the engine's settle (e2e H2).
- **Tests:** `e2e/plays-archive.js` A6 (a play the highlights copied is not downloaded again) and A7 (their downloads
  count toward the budget); `e2e/highlights.js` H1–H7 (the track and the end at the dead ball; positions to yards and
  the carrier vs the settle; a day's run: measured, short-listed, drawn; the judge's picks → README and videos in rank
  order; a failing judge → the measured order, said so; a day without plays; a finished day not redone).
- **For the detector:** `PLAYREC stored|FAILED` diag lines; `rooms/{code}/plays` is the recorder's, never read by the game.

## V459 (2026-10-04): MAX — DBs returning a turnover run 1.2x HARD (they ran 1.75–2.5x); the defender boost no longer compounds

The owner: "after an interception ... the DBs are comically fast" — "in max mode, it is currently 2x of hard, make it
1.2x of hard in max mode after int. Only touch max mode" — "keep the speed unless they're returning turnover".

- **Measured on real interceptions** (two-player games, the engine's own catch): HARD's DBs run at 0.13–0.145 accel
  (`_j51`; average 0.138 — the bridge never touches HARD). MAX: the engine's own tier gives every DB 0.16, the V139 boost
  makes it 0.24 (1.5x) — and it stayed on through every return: the V140/V141 latch waits for drive stage 8, which a live
  return never reaches (the stage stays 2 throughout). The returner was worse: the engine tires a ball carrier every
  frame (`_j51 *= ~0.9997`, retrobowl.js:66786), which the bump took for a fresh engine value — it re-captured its own
  boosted output and boosted it again, every frame — so he hit the 0.35 cap at once. After a pick MAX ran 1.75x HARD
  (the other DBs) and 2.5x (the returner); top speeds 29.8 yd/s for the returner against 8–13 for the chasers.
- **Now (MAX only — HARD/MED/EASY never reach this code):** while the ball is a returned turnover — intercepted (`_kp`
  9) or a fumble a defender recovered (`_kp` 10), read off the ball itself the instant it happens — every DB runs at
  0.165 (1.2x HARD's average), tiring as the engine tires the returner. In coverage and on every other play the DBs keep
  MAX's 1.5x; linemen and linebackers keep their +0.03.
- **No compounding:** a small decay of the bridge's own output (0.99–1x) is fatigue — the captured base tires with it.
- Measured after: the DBs 0.24 → 0.165 at the pick; the returner 0.165 → 0.159 over a 5 s pick-six (top 19 yd/s).
- Tests: `e2e/max-return-speed.js` R1–R4 (a MAX interception; a MAX fumble recovered by a DB; the engine's fatigue step
  on a boosted linebacker and DB never climbs; HARD untouched), in suites.txt.

## V460 (2026-10-04): the daily highlights get a second and third chance at a day whose judge failed; the plays archive checks only the rooms that could hold plays; the recorder skips non-plays

- **The highlights' chances:** a day is done when its README is written AND judged. A day whose judge failed (a usage
  limit at 6 pm, say — the README then holds the measured order, said so) is judged again at 18:30 and at 20:00 (new in
  the LaunchAgent); a crash before the README also gets those chances. `e2e/highlights.js` H5b.
- **The plays archive** (`tools/plays-archive.js`, hourly) listed `rooms/{code}/plays` for every room the audit watcher
  saw in 10 days: 1,728 requests at its first run. Now: the rooms active since 26 h before its last successful run
  (a play is recorded at a snap, which the audit sees; a Mac that was off looks back over the gap; the first run after
  this change checks every room once), the live list, and the rooms it still holds plays for. ~470 on a busy day.
- **The H2 test** now plays until one down has the engine's settle with its yards (up to 6), instead of passing on none.
- **The recorder skips non-plays:** the first real day (room ACIP, two games, 171 recordings) had 17 that were not plays
  — a snap audit that never became a play, ended by the ball reset after 0.4–1.2 s, no result. A recording with no
  result that never saw the ball dead and is under 2.5 s is not stored (a real play always ends dead: tackled, scored,
  incomplete, out of bounds, sacked).

## V461 (2026-10-04): a fumble's popup says FUMBLE (it said INTERCEPTED); no takeaway popup on a drive that did not end in one

The owner: "also when a fumble happens, the interception pop up happens. Try to fix please".

- **Reproduced on the live V460** (`e2e/fumble-popup.js` against the main tree): a real lost fumble — the engine's own
  fumble (`_W31`), a defender's recovery (ball 3 → 13 → 10) — popped **INTERCEPTED** on the other phone; and a fumble
  the offense KEPT, followed by a turnover on downs, popped a takeaway too (`BLAST@possession INT/FUM`).
- **Why:** the kind was a guess — "a fumble was detected in the last 5 s" (on the sender for the event; on the receiver,
  off the fumble feed, for the hand-off's blast) — and a lost fumble's real timeline (loose ball, recovery, return, the
  whistle, the engine's turnover stage) runs past 5 s; the hand-off popup (V348) always passed 'INT' and leaned on that
  window. Its licence was "the drive's interception/fumble count moved", which a fumble the offense recovered moves too.
- **Now:** the carrier's phone decides the takeaway the moment a defender has the ball: FUMBLE when the offense fumbled on
  this play (its roster's fumble count moved since the snap — the engine calls a fumble a defender catches in the air
  "intercepted", ball state 9), else the ball's own word (9 intercepted, 10 a loose ball the defense recovered). It rides
  the hand-off (`takeaway`) and the event (its kind, marked `exact`: no relabel on the receiver). From a V461+ sender
  the receiver shows exactly that, and no takeaway popup on a hand-off without one (or without the turnover stamp).
  A fumble returned for a touchdown says SCOOP & SCORE, not PICK 6. A new drive (and each snap) clears it.
- Tests: `e2e/fumble-popup.js` U1–U3 (a lost fumble → FUMBLE; a kept fumble then 4th & 99 → no popup; an interception →
  INTERCEPTED, or PICK 6 when returned for a score). On V460: U1 INTERCEPTED, U3's popup fired.
- Seen once while testing, not changed: a fumble the OFFENSE caught in the air and ran in counted +6 for the defense and
  started the pick-six cascade (forced by the probe standing players on the ball; not seen in a real game).
- **The highlights' play detector** (`tools/highlights/features.js`) reads a play only up to the frame it ended: a
  recording runs on past the whistle, sometimes into the next snap, whose QB read as the last ball carrier — the first
  real 6 pm run's #1 (Kelce, 43 yd, room VOHK) was labelled "Mahomes 43 yd" (the judge's headline was right).

## V462 (2026-10-04): no offense lag from the opponent's screen and the play recorder

The owner: "there is slight lag in second half offense ever since we added the pixel by pixel recreation"; a player
(VOHK, a Chromebook): "Im steady lagging only on offense".

- Measured on a Chromebook-slow offense phone (CPU x4, a real 2P game, the bot's downs): frames later than 33 ms — 3%
  with no capture, 6% with the opponent's-screen link, **18%** with the link and the V458 recorder.
- Why: the recorder captured frames on its own timer, so with the link nearly every frame was captured; and the link's
  back-off for slow phones counted only the encoding, never the capture itself (`fr.capMs` was never filled in), so a
  slow or heating-up phone (the second half) never backed off.
- Now: every engine frame is timed; a captured frame's time over a plain one's is the capture's real cost. A phone over
  1.5 / 2 / 5 ms sends 20 / 15 / 10 frames a second instead of 30 (the replay glides between them). The recorder uses
  only frames the link captures anyway while the link is at least as fast. After: 6.8% late frames with everything on.
- opp-view W1–W7 and play-rec P1–P7 green.

## V463 (2026-10-04): no screenshots in play — the last offense lag

The owner: "fix, with the lag being the number 1 concern". A CPU profile of the offense phone at Chromebook speed found
two old diagnostic systems taking pictures of the game: the V277 tap record (every tap on a touch phone, at most once a
second: a screenshot at the tap and 700 ms later — a WebGL read-back and a JPEG encode on the main thread — then up to
eight of them, ~100+ KB, re-uploaded) and the V239 telemetry (a screenshot every 15 s). The tap record is now text only
and never during a live play (stuck screens are dead-ball screens); the 15 s screenshot is gone. Touch phone, CPU x4,
link + recorder on: late frames 7.0% (V462) -> 3.1% (the no-capture baseline), worst engine frame 41.8 -> 17.4 ms.
qtr-tap 7/7, run.js 15/15.

## V464 (2026-10-04): a closed conversion leaves no "go for 1 or 2" on screen

A player (room LRPA, two tabs on one Chromebook): "When I got a pick and he got tackle and said go for 1 or two points".
The scorer's tab was hidden through its conversion; the 35 s wall resolved it (missed) and `_rb2p_unwedgeConversion`
destroyed the modal's two BUTTONS only (`_0G` 100367/100369). A conversion modal is five instances — its background
(obj_msgbg), text and the buttons (V148) — so "go for 1 or 2" stayed on screen with nothing to press, and the player saw
it a drive later, after the interception. The PAT-INV off-the-2 kill did the same. Now `_rb2p_killConversionModal()`
destroys the whole modal, only when it is the conversion's (a 1 PT / 2 PT button is up), at both sites.
`e2e/v352-conversion.js` T5 (no instance left) and T5b (the unwedge leaves nothing: 5 -> 0); v395-hidden 10/10.

## V465 (2026-10-04): the PLAY OF THE DAY on the front page — the banner, the replay, comments, the archive, the maker's congrats

The owner: "remove the banner we had for the NEW user name thing and replace it with a PLAY OF THE DAY banner and then a
portion on the main page where the number one play is displayed along with offensive user name if offense play and
defensive if defensive play. Also tell the sonnet agent from now on weigh game situation, difficulty mode, impact (sheer
yardage), and unexpectedness (stiff arms jukes) equally and add a comments section. Also the device that did the play
should get an alert saying congrats, and a way to respond back to me the creator next time they open the game and they
should get a special flair if they comment in the play of the day section and the plays of the days should get archived
each day into a viewable section".

- **Published by the 6 pm job** (`tools/highlights/daily.js`, also `--publish-only` for a finished day): the judge's #1
  to `embedcode/potd` (~1 KB: headline, the front-page line, OFFENSE/DEFENSE, the player's name, his device's uid),
  `embedcode/potdIndex/{date}` (the archive) and `embedcode/potdPlays/{date}` (the play's numbers, ~50 KB, fetched only
  on WATCH — every lobby downloading it would cost the free plan's downloads). The credited player: the offense's for an
  offensive play, the defense's for a defender's (a pick, a fumble returned); the name from `rooms/{code}/names`, the
  device from that phone's latest `bind` audit record.
- **The front page** (`#rb-potd`, under the join row): the replay through the game's own renderer (the opponent's-screen
  codec), the headline, OFFENSE/DEFENSE · name, the judge's `fan` line (frame numbers stripped from an older `why`);
  comments at `rooms/~potd/c/{date}` (signed-in players; the newest 60; one per 20 s; a word filter); the maker's comments
  carry a ★ PLAY OF THE DAY flair; PAST PLAYS OF THE DAY lists every day.
- **The banner** (`#rb-news`, the V387 first-run news replaced): once per new play of the day; WATCH IT plays it. On the
  maker's device (its uid) the CONGRATS box instead, with a message to the creator (it arrives with the complaints,
  choice "PLAY OF THE DAY reply {date}"). Never in a test run unless forced (`_rb2p_potdForce`); the a2hs popup still
  waits for it.
- **The judge** (`JUDGE.md`): game situation, difficulty mode, impact (sheer yardage) and unexpectedness weighed
  equally; the recorder now stores the defense difficulty the offense faced (`dif`), in plays.tsv and the short list.
- Tests: `e2e/potd.js` D1–D7 (the real published play), a2hs A1 (the banner first, then the popup), highlights (never
  publishes: `HL_NO_PUBLISH`).

## V466 (2026-10-04): a sideways phone could not reach PLAY 2P or JOIN (a V465 regression)
- **The fault:** the phone lobby centered its column (`justify-content:center`). V465's play of the day made the column
  taller than a sideways phone's screen, so it overflowed at the TOP as well, where no scroll reaches: the live V465 at
  844x390 had PLAY 2P at y=-485 and JOIN at y=-313, both unreachable. The entry view's focus on the code box then
  scrolled the column further down.
- **The fix:** the column is centered by its first/last child's auto margins (centered when it fits, top-anchored when
  it does not), `max-height:100%`; the code box focuses with `preventScroll`; under 460 px of height the football goes
  and the title sizes to the height, so the title, PLAY 2P and JOIN are on the first screen.
- Tests: `e2e/lobby-phone.js` P1–P3 (five phone/tablet sizes: the buttons on the first screen, the column scrolls to its
  end, a short column still centered). The other suites press PLAY 2P from code, which works off screen.

## V467 (2026-10-04): the day's top 3 on the front page, with the difficulty — and nothing cut off by the screen's edge
- **The owner:** "make it top 3 but number 1 prominent and show difficulty. Plus I don't like the incomplete feel of the
  bottom being cut off, make it more natural." (V465 put the panel under the lobby: at 1920x855 it began 620 px down and
  the screen's edge and the ticker cut it in half.)
- **The 6 pm job** (`tools/highlights/daily.js` publishPotd) publishes the judge's top 3: `embedcode/potd.top` and
  `potdIndex/{date}.top` (rank, side, name, hero, headline, a short `why`, difficulty, toMs), the replays at
  `potdPlays/{date}`, `{date}~2`, `{date}~3` (fetched only on WATCH). #1 keeps its V465 fields (a page still on V465 works);
  only #1's device uid is published. A play from before V465 gets its difficulty from the room's SAME-mode setting
  (`rooms/{code}/config.sharedDifficulty`; a DIFFERENT-mode game's is unknown). The short `why`: the judge's `fan` line,
  else a sentence or two of its reason (the split ignores the "!" in "Stiff Arm!"). JUDGE.md: the top three go on the
  front page.
- **The page:** #1 on the big screen (a drawn field until WATCH, its rank badge), #2/#3 as cards (a card puts its play on
  the big screen and plays it), each with a difficulty chip in the lobby's own words (EASY/MED/HARD/MAX); comments and the
  archive are rows that open in place (the comments row counts them and shows the newest; the archive loads when opened,
  the last 30 days). A wide screen (>=900x560, landscape) is a grid: the lobby left, the plays right, the replay as big as
  the height left allows (`fit()`), all on the first screen. A narrow one (a phone held sideways, a tall window): the lobby
  fills the first screen, the plays start below it, a PLAYS OF THE DAY chip points the way (`cue()`). With no play of the
  day the lobby is the one centered column it always was.
- Tests: `e2e/potd-layout.js` L1–L3 (nine sizes), `e2e/potd.js` D1–D9 (D8 the cards, D9 a card on the big screen),
  `lobby-phone` P2 (a tablet held sideways scrolls nothing), `v387-names` T1 now points at potd D5.

## V468 (2026-10-04): comments without the 20 s wait, swear words banned; #2/#3's difficulty corrected; the rank by the headline
- **The owner:** "remove the 20 second rule for commenting, and also ban swear words. Also play number 2 HAS to be max
  mode, check again."
- **Comments:** no wait between comments. A comment with a swear word is refused ("Keep it clean"), never stored. One
  already stored (or posted around the page) is not shown. The match undoes the usual tricks (sh1t, $hit, f*ck, f u c k)
  on whole words only ("pass", "class", "Dickerson" are fine).
- **Difficulty:** the room keeps only its latest setting. WKAI's first game was MAX; its RUN IT BACK rematch was HARD,
  which overwrote the room's setting. Evidence: the DBs' top speed over the offense's was 1.45 in game 1 and 1.0 in the
  rematch. So `fillDifficulty` uses the room setting only for plays of the room's last game (`rooms/{code}/games`).
  `--publish-only --dif ID=max` corrects a play; today's #2/#3 were republished as MAX. Plays from V465 on carry their
  own `dif`.
- **The #1 badge** sits beside the headline, as on the cards. On the big screen it covered the game's own scoreboard.
- Tests: `e2e/potd.js` D10 (10/10).

## V470 (2026-10-04): every game's record carries its difficulty; the highlights read only that; a pause; a preview
- **The owner:** "#1 does not look like max. It is definitely hard mode. From now on clearly store the difficulty level
  in games so you can pick it out" — and "don't run sonnet tmrw morning at all, start it day after", "at 12:15 pm submit
  to me the top 5 so far".
- **The game's record** `rooms/{code}/games/{start}`: `mode` ('same'|'different'), `dif` (a SAME game's level), and
  `difs/{role}` (each device's own level, which is the defense its offense faces). Role a writes the record. Role b
  finds it (the newest record within 90 s of its own start, retried every 5 s, up to a minute) and adds `difs/b`. The
  'game' audit entry carries mode + dif too.
- **The highlights** (`fillDifficulty`): the play's own `dif` (V465+), else its game's record (`difs[role]`, or a SAME
  game's `dif`), else unknown. Never the room's config, which holds only the latest setting: it was wrong for VOHK and
  for WKAI's first game. Today's #1 was republished as HARD (#2/#3 MAX).
- **The pause:** `.rb2p/highlights/skip-until.json` (`until` ms). Runs before it do nothing (set: nothing on Mon 5 Oct;
  Tue 6 Oct 5 am is the first run).
- **`--preview`:** judged and rendered, never published, in its own folders (`highlight plays/DATE preview`,
  `runs/DATE-preview`). It is not a day's run, so the next real run still judges its plays.
- Tests: `e2e/game-dif.js` G1 (a SAME game on HARD: mode, dif, difs a+b). The two test pages share one browser's
  storage, so a DIFFERENT game cannot give them two levels there. Highlights 8/8.

## V471 (2026-10-04): a message to ONE device — the owner's "top 5 so far" on his Chromebook; the popups in the game's font
- **The owner:** "at 12:15 pm submit to me the top 5 so far plays so I can check out ... send it to the chromebook named
  soham". The game device profiles have it: id KrwziFQu (the first 8 characters of its anonymous uid), kind Chromebook,
  name soham.
- **The job:** `daily.js --preview --to ID` (and `--publish-only --to ID` for a finished day) writes
  `embedcode/inbox/{ID}` (from, title, note, the 5 plays' words) and `embedcode/inboxPlays/{ID}/{rank}` (each play's
  numbers, fetched on WATCH). `buildEntries()` is shared with the play-of-the-day publish.
- **The page:** `#rb-inbox` checks `embedcode/inbox/{its uid's first 8}` on opening and every 3 min in the lobby, never
  over a game or another popup. It shows FROM SOHAM, the title, a replay screen and the list (rank, headline, name,
  difficulty chip). CLOSE marks it seen (`rb2p_inbox_seen`). Every other device's check reads `null`.
- **The popups'** words (congrats, banner, inbox) now use the game's pixel font (they fell back to a serif).
- **Monday 5 Oct:** the one-off LaunchAgent com.rb2p.highlights-preview runs `--preview --to KrwziFQu` at 11:57, then
  removes itself.
- Tests: `e2e/inbox.js` B1–B3 (the real publish path, a test device id, cleaned up after). `game-dif` G2 (a DIFFERENT
  game on two devices with their own storage: difs.a easy, difs.b max). WebKit: iPhone sideways + iPad lobby pass.

## V472 (2026-10-05): the play-of-the-day comments were deleted by an old build's room sweep — kept and backed up now
- **What happened:** the first day's 8+ comments (`rooms/~potd/c/2026-10-04`) were gone on 5 Oct, along with the
  whole `rooms/~potd`. Game rooms were untouched (2151). Game builds before V419 run `sweepStaleRooms` on every load and
  every 20 min. It DELETEs every room without `audit`/`final`/`audited`/`flag` 2 h after its newest `ts` (48 h with
  `names`). V419 emptied it, but old builds stay open on some devices (an old tab, a cached home-screen copy, the
  version jumper). `~potd` had none of those keys. The Spark plan has no backups, so the comments could not be recovered.
- **The fix:** `rooms/~potd/audited` (written now; every post puts it back once per page session). The old sweep skips
  a room with it. audit-watch ignores rooms without an `audit` stream.
- **The backup:** the hourly plays-archive job copies `rooms/~potd/c` to `.rb2p/potd-comments-backup.json`, only ever
  adding. `node tools/potd-replies.js --restore DATE` puts back the missing ones.
- Tests: `e2e/potd.js` D3b (the marker after a post) 11/11, plays-archive 7/7.

## V473 (2026-10-05): each of the top 3's makers gets his own congrats; #2/#3 comments carry a TOP 3 flair
- **The owner:** "how does the screen look for the top 3 players with plays of the day". Until now only #1's device got
  the CONGRATS. The 5 am job publishes every top-3 maker's device uid (`top[i].uid`). The page: #1 gets "Your play is
  the PLAY OF THE DAY"; #2/#3 get "Your play made today's TOP 3 — #N" with their own play's headline and the same box to
  message the creator (the reply's choice adds " (#N)"). Comments: #1's maker "★ PLAY OF THE DAY", #2/#3's "★ TOP 3".
- Oct 4 was republished with the three uids (`--publish-only --until <Oct 4 run> --dif ...`).
- Tests: `e2e/potd.js` D6b (#2's device, its own storage: TOP 3 — #2 and its headline) 12/12.

## V474 (2026-10-05): a saved address (Home Screen, bookmark, shared link) does no harm
- **The owner:** "when a phone saves to Home Screen ... they also save the full https://two-player-rb.vercel.app/?v=muv9020d
  ... figure out a way so this doesn't affect anything negatively."
- **The risk:**
  - The once-per-session cache-bust redirect left any URL that already had `?v=` alone, and the engine loads as
    `retrobowl.js?v=<the same token>`. A saved icon therefore asked for the same engine address on every launch:
    GitHub Pages caches it 10 min and web.app 1 h, so after an update a launch could pair a new page with an old engine.
    Vercel revalidates every time.
  - A saved `?join=CODE` (an icon added at the name gate while holding an invite) auto-joined that old room on every
    launch.
- **The fix:**
  - At a session's start, a `v` token that is missing, older than 10 min (it is Date.now() in base 36) or from the
    future is replaced.
  - A Home Screen launch (`navigator.standalone` / display-mode standalone) drops `join`.
  - An invite code this device already joined (`rb2p_joins_used`, the last 30) fills the code box but does not join
    by itself.
- Tests: `e2e/home-screen.js` S1–S4 4/4; v410-lobby 4/4, a2hs 9/9, lobby-phone 12/12.

## V475 (2026-10-05): the opponent's screen at 30 frames a second again (no slide), the lag cut another way; ⛶ full screen
- **The owner:** "The graphics are pathetic, the ones before the lag fix were so much better. Bring it back ... remove lag
  without compromising quality"; "the new graphics had a really SLIDING feel with the ball going everywhere ... like the
  old one where it is almost a PIXEL by PIXEL match"; "add a full screen option for plays of the day".
- **Why it slid:** V462 cut the link to 20/15/10 frames a second whenever a captured frame cost 1.5/2/5 ms more than a
  plain one (most real phones). The waiting phone glides each sprite between frames (lerpPositions, unchanged since V450):
  over 33 ms that is invisible, over 66-100 ms players skate (their animation flips at 10 fps while their bodies glide)
  and the ball wanders. Pairing is by the drawing object (op.key), never draw order: not a pairing fault.
- **The fix:**
  - The link is 30 frames a second on the direct link again, always (6 on Firebase, as before). The recorder is 15
    (every other link frame), as at V458.
  - The lag is cut instead by encoding each frame after it is on screen: `afterPaint` (a MessageChannel task after the
    paint) runs the link's `linkSend` and the recorder's encode. The recorder still reads the engine (its track) at the
    frame itself.
  - Measured at CPU x4 on a real 2P game (link + recorder): V474 1.1% late frames, falling back to 15 fps with 8.4% late
    once capture got costly. V475: 0 late of 862, 30 fps throughout. A captured frame now costs ~0.6 ms over a plain one
    (was 1-2).
- **⛶ full screen** on the play-of-the-day and inbox replay screens: the Fullscreen API, else (an iPhone) the screen is
  covered (`.rb-fs-on`); ⛶ / Esc back; the canvas keeps its shape (`object-fit: contain`).
- **The congrats "seen" record:** `rooms/~potd/seen/{date}/{rank}` (`potd-replies.js` shows it). The owner asked who
  saw the popup.
- Tests: `e2e/potd.js` D11 (full screen, both ways); opp-view (pixel-for-pixel); play-rec (15 fps recordings).

## V476 (2026-10-05): the opponent's screen as V450 drew it
- **The owner:** "too freaking choppy, literally bring back the first ever graphics we came up with. Then deploy
  immediately".
- **Restored V450's live view:**
  - The sender's rate formula (30 a second on the direct link, as V450-V461).
  - Each frame encoded inside its own frame (V475's after-the-paint encode is gone: it could bunch frames on a busy
    laptop).
  - The waiting phone always at full resolution (V451's lite mode, CSS resolution on a slow or GPU-less page, is gone).
  - V450's playback delay (`median(gaps)*1.6 + p90(jitter) + 10`, floor 50 ms).
- **Kept** (not the picture): the recorder riding the link's frames (V462), no screenshots in play (V463), the own
  canvas hidden under the replay (V455, a freeze fix), the LIVE tag and watermark (V457), the glide's never-stretch rule
  (V451).
- Tests: opp-view 7/7 (W2 >= 99.9% pixel-identical, W3 smooth).

## V477 (2026-10-05): the replay's drawing is V450's — the end zone no longer jumps
- **The owner:** "it sucks, the WHOLE END ZONE was moving!!! It is horrible, bring back the good stuff".
- **The cause** (the blending between frames, used by the live screen and every replay):
  - V451 glided a piece that changes size between frames by its centre only, snapping it to its new size. A piece
    entering the screen grows as it scrolls in, so the end zone's edge jumped instead of rolling in with the field.
  - V451 also glided only the field camera.
- **Both are back to V450:** every vertex glides (`lerpPositions` is line-for-line V450's) and every camera glides
  together.
- **The live screen is now V450 throughout:** V476 restored the rate, the in-frame encode, full resolution and the
  delay.
- **Measured** on the preview's 93-yd TD: the end zone's edge keeps a constant 49 px from the next yard line in every
  60 Hz draw.
- Tests: opp-view 7/7.

## V478 (2026-10-05): no blending anywhere — the replay shows only frames the game drew
- **The owner:** "the shadows are floating around and other random sprites are also just spawning and spinning around
  ... THERE SHOULD BE NO SLIDING OR BLENDING, the key thing to notice is if the down marker moves instantaneously or
  slides".
- **The live opponent's screen**, the play-of-the-day replay, the inbox replay, the contact sheets and the MP4 videos
  draw the exact frame with t <= now (`R.draw(A, null)`). They never use `lerpFrame`/`lerpPositions` (the functions
  stay, unused). The down marker moves the instant the game moved it.
- The live link is 30 frames a second (V450's rate), so the waiting phone shows each exact frame about twice at 60 Hz.
  Recordings are 15 a second.
- Tests: opp-view 7/7 (W3 rewritten: 197 distinct camera positions in 406 draws for 200 frames received, i.e. only
  frames the other phone drew).

## V479 (2026-10-05): the direct link sends every frame (60 a second); a weighted judging option
- **The owner:** "it's way more laggy while viewing, the blending issue is gone though, try to make it less laggy";
  "find a better top 5, 30% difficulty 40% spectacularness 20% situation and 10% impact".
- **The live view:**
  - With no blending (V478) the viewer sees exactly the frames that arrive. The direct link now captures every frame
    the game draws (`capInterval` 16 ms on p2p; was 33, and V450's back-off dropped a slow phone to 15-20). Each frame
    is encoded after the paint (`afterPaint`), as is the recorder's.
  - Measured: the viewer gets 58.7 frames a second (drawn 60.2/s, starved 0%, max gap 35 ms), under 40 KB/s. The
    sender at CPU x4 had 3 late frames of 830 (0.4%; V474 1.1%, capture-off 1.2%).
  - Firebase (the fallback, 6 of the owner's 8 views today) stays ~5 a second: the free plan's downloads.
- **`daily.js --weights difficulty=30,spectacular=40,situation=20,impact=10`** heads the judge's brief with this run's
  weighting. **`--tag NAME`** gives a second preview its own folders. Today's weighted preview went to the owner's
  Chromebook (KrwziFQu) at 13:08.
- Tests: opp-view 7/7 (W3: exact frames at ~60/s).

## V480 (2026-10-05): the judge's rules — 40/30/20/10, difficulty points 12/8/3/1, interceptions only when extreme
- **The owner:** "30% difficulty 40% spectacularness 20% situation and 10% impact"; "make max 12 points and hard 8 points
  and medium 3 and easy 1"; "don't choose interceptions unless they are EXTREMELY impressive".
- **JUDGE.md:** total = 0.4 × spectacularness + 0.3 × difficulty points (fixed: MAX 12, HARD 8, MED 3, EASY 1; blank 3)
  + 0.2 × situation + 0.1 × impact. A pick or pick-six only when the return itself is spectacular or it decides the game
  in its last seconds. This replaces V465's equal weighting for the daily 5 am run too.
- **The short list** (`features.js scoreOf`): no flat bonus for a pick (+2) or a pick-six (+6); difficulty bonus
  12/8/3/1 scaled to 8/5.3/2/0.7 (unknown 2).
- Today's re-pick (`--preview --to KrwziFQu --tag "picks 3"`) went to the owner's Chromebook.
- Tests: highlights 8/8.

## V481 (2026-10-05): the owner's points formula; the inbox shows pools
- **The owner:**
  - "max is 20 hard 8 med 2 easy 0. touchdown 20, first down 5, 4th down conversion 10 + num of yards"
  - "4th down conversion also gets +5 and touchdown gets both, yardage is worth half a point and the clutch things are
    20 seconds"
  - "overtime plays get 1.2x boost and spectacularness is raw score out of 16 ... + 2 times (stiff arms and jukes)"
  - "keep old results, show the results as two different pools to ME only"
- **`features.js points()`:** difficulty (MAX 20/HARD 8/MED 2/EASY 0; unknown 2) + TD 20 + first down 5 + 4th-down
  conversion (10 + yards to go) + 0.5/yd + situation (go-ahead in the last 20 s of Q4 or any in OT +20, tying in the
  last 20 s +12, go-ahead/tying earlier in Q4 +6, a score at 0:00 +5, a 21+ blowout -5) + 2 × (stiff arms + jukes =
  dove-and-missed + left-behind, disjoint). Total = (base + the judge's raw 0-16) × 1.2 in OT (`pointsTotal`).
- **`daily.js --formula points`:** base points on every play (the short list by them), in plays.tsv/candidates.md and
  the brief. The judge gives a raw score per candidate; the code ranks the picks by the total.
- **`--keep-pools` / `--pool` / `--pool-a`:** the device inbox keeps its earlier pool(s) and adds this run's
  (keys b1..b5). The page's `#rb-inbox` shows each pool under its title, "B #1", and each play's points.
- Tests: inbox B1-B4 4/4.

## V482 (2026-10-05): MAX is worth 40 in the points formula
- The owner: "Make max 40 instead of 20" — `features.js DIF_PTS.max` 40 (HARD 8, MED 2, EASY 0 unchanged); the brief says so.
- Re-picked as pool C on the owner's Chromebook (pools A and B kept).

## V483 (2026-10-05): a defensive play gets a flat 10, not the difficulty points
- The owner: "in defensive plays no difficulty boost, maybe just +10" — `points()`: a pick or a fumble return (the hero on
  defense) scores difficulty 10 whatever the setting; the brief says so. Re-picked as pool D on the owner's Chromebook.

## V484 (2026-10-05): the difficulty in the replay's corner; the points formula is the daily standard (MAX 55, 1/3 a yard)
- The owner: "give the difficulty in bottom right corner. I like this formula, maybe reduce yardage weight to 1/3 but
  the top 5 is good for now, but from tomorrow make offense max +55"
- **The corner badge:** the front page's replay (`#rb-potd-difc`) and the device inbox's (`#rb-inbox-difc`) show the
  defense level (EASY/MED/HARD/MAX, the lobby's chip colors) bottom right on the screen itself, bigger in full screen;
  the replay notes keep 72 px clear of it. `render.js video({difficulty})` draws the same badge into every MP4 frame
  (`daily.js` passes the play's `dif`).
- **The formula:** `daily.js` runs `--formula points` by default (from the 5 am run of Tue 6 Oct; `--formula weights`
  gives the 40/30/20/10 brief). `points()`: offense MAX 55 (HARD 8, MED 2, EASY 0, unknown 2; defense flat 10),
  yardage 1/3 a yard (was 0.5). The brief says so. Today's pool D stays as it is on the owner's Chromebook.
- Tests: potd 9/9, inbox 4/4, highlights 8/8.

## V485 (2026-10-05): the slur filter — names and lines on the public page are censored
- The owner: "censor the slur". Game BNPD's player A named himself "wisdom" + the n-word, run into one word; the
  12:15 preview had his play at #5, and the 5 am job puts the top 3's names on the public front page. The comment
  filter (V468) matches whole words only, so it let that name through.
- **`index.html` SLUR-FILTER block:** the worst slurs match anywhere in a word, the short ones (raccoon, spice) only
  as a word, after the stand-ins 0 1 3 4 5 7 @ $ ! |, with dots/dashes ignored and spelled-out letters joined; each
  letter of a match becomes `*` ("wisdom******"). A name of nothing but a slur shows as "a player". No lookbehind
  (older iPads). Used on every name, headline and line of the front page (big screen, cards, archive, banner,
  congrats) and the device inbox; the comment filter refuses a slur inside a word, in a comment or a name.
- **`tools/highlights/censor.js`** runs the page's own block in Node; `daily.js buildEntries` publishes the censored
  name/headline/fan line (if the filter cannot load, no name is published).
- Over all 571 recorded usernames it censors 7, all real slurs (6 n-word forms, 1 r-word); nothing else moved.
- Tests: censor C1-C2, potd 10/10 (D12 new), inbox 4/4, highlights 8/8.

## V486 (2026-10-05): FIND A PLAYER — a waiting line that matches strangers, and a lobby chat
- The owner: "a lot of players who want to play two player but there just isn't someone to play with. Create a lobby
  where these lonely people can submit their want-to-play request and if there is someone else they connect. This
  should be the same process as getting a code of SAME difficulty. Plan out the best way to do this with limited
  traffic and also add a chat feature ... add a disclaimer saying the site is growing and you may not find someone."
- **Lobby:** NO CODE? [FIND A PLAYER] under JOIN; it shows "N WAITING" (pulsing) whenever someone is in line, so every
  visitor sees a waiting player, and "LOOKING m:ss" while you are.
- **The FIND screen (`data-view="find"`):** the disclaimer; a difficulty (EASY/MED/HARD/MAX, the same for both);
  FIND A GAME / STOP LOOKING; WAITING NOW (name, difficulty, how long, PLAY); the LOBBY CHAT (last 50 lines, 200
  characters each, no filter) with a one-line personal-info tip. BACK keeps your place in line.
- **One line, not four** (a few players a day split four ways = four empty lines): the same difficulty matches by
  itself; anyone else is one tap away at THEIR difficulty.
- **Data:** `rooms/~lfg` (the live rules already let any signed-in player read/write under rooms — no rules change):
  `q/{sid}` {name, dif, ts, hb every 20 s, v, u} with onDisconnect remove, ignored after 75 s without a heartbeat or on
  another build ("reload to see them" note for newer ones); `chat/{push}`; `audited` = the keep marker (pre-V419 sweep).
- **The match:** the NEWER player claims the older entry (transaction; your own entry leaves first unless you were just
  claimed, so two never claim one), then makes the room exactly as PLAY 2P in SAME mode at the agreed difficulty
  (`applyDiffModeLocal('same')` + `setUserDifficultyPref`, `claimNewRoom`, `enterRoom` — A seeds the config as always)
  and writes the code into the claimed entry; the waiting page joins it via `claimSlot` + `enterRoom` (the JOIN path).
  Beep + flashing tab title when it is in the background. A claim with no code for 25 s is dropped (still in line); a
  maker whose player has not arrived in 45 s leaves and is back in line. The room says "Found NAME — they are joining…".
- **Entry layout fix:** `.potd-on > .rb-entry-main` gets `flex-shrink: 0` — the taller column spilled over the top of a
  sideways phone (the title at -5 px on 844x390).
- Tests: find-player F1-F5 (test-only line `rooms/~lfgtest/<run>`, Z+digit room codes), potd-layout 11/11, lobby-phone 12/12.

## V487 (2026-10-05): no difficulty in the find-a-player line — the pair picks it in the room
- The owner: "no need to choose difficulty before game, that can be chosen after they match up".
- The FIND screen loses its EASY/MED/HARD/MAX row ("Once you are matched, you pick the difficulty together — the same
  for both."); entries are {name, ts, hb, v, u}; anyone in line matches anyone (the newer claims the oldest). The maker
  still opens the room in SAME mode (keeping its own last pick as the start), and a matched room's status says "You
  found a player! Pick the DEFENSE difficulty together (the same for both), then READY." — SAME mode shares either
  player's DEFENSE click (config/sharedDifficulty).
- Tests: find-player F1-F5 (F3 now: A's HARD click in the room reaches B and the room's config).

## V488 (2026-10-05): a found player's room chat, a side chat mid-game, and the PLAYER FOUND alert
- The owner: "add a chat feature inside the difficulty deciding screen if FROM lobby to decide these things, also send
  a healthy alert if someone is matched up with you" — then "also have a side chat mid game".
- **The mark:** the maker of a found-player room writes `rooms/{code}/lfg` {at, a, b}; only such a room gets a chat
  (a friend's code gets none), and it comes back after a reload. Lines: `rooms/{code}/chat/{push}` {name, text, ts,
  sid, role}, the last 50, 200 characters, no filter (names censored, as everywhere).
- **The room:** a CHAT box under the status (a 300 px panel at the right on a screen 1180+ wide); the status reads
  "Matched! Pick the difficulty together, then READY."
- **Mid-game:** `hideLobby()` → `lfgView('game')` keeps the room chat's subscription and shows a CHAT chip bottom
  right (`--rb-chip-r/b`, the bar beside the picture, like the other chips) that opens a side panel; while shut, a new
  line from the opponent shows as an unread count and a 4.5 s peek. Its mousedown/pointerdown/touchstart and keys stop
  at the panel (the engine reads keys on window.onkeydown); releases pass through, so a throw that ends over it lands.
- **The alert:** a PLAYER FOUND card over the room (who you play, what next, LET'S GO), a soft rising sine chime
  (replaces V486's square beeps), and in a background tab a system notification (permission asked once, on FIND A GAME
  or a PLAY tap) plus the flashing tab title.
- Tests: find-player 8/8 (F3b the card + room chat, F3c the side chat via the game view: unread 1 + peek, the panel, a
  typed key never reaches a window keydown listener; F4b a friend's room: no chat, no chip, no card).

## V489 (2026-10-05): the room chat and the side chat in every game, a friend's code too
- The owner: "sure add it to normal games".
- `lfgRoomChat(code)` no longer waits on `rooms/{code}/lfg` (still written by a matched room's maker — a record of
  which games the line made): every room subscribes to `rooms/{code}/chat`, and every game has the CHAT chip.
- The room's chat box shows once both seats are filled (`renderPlayers` → `lfgRcPaint`): before that there is nobody
  to talk to, and a friend's room keeps its long "tell them the code" line clear of the panel on a wide screen.
- `#rb-lobby .status` gets `flex-shrink: 0` — in a column taller than the screen its min-height let it be squashed
  under its own lines (the COPY INVITE LINK button ran into the team row).
- The PLAYER FOUND card stays for matched players only.
- Tests: find-player 8/8 (F4b: a code room — no chat while alone, the chat once the friend joins by the code, the chip
  in the game, no card on either page).

## V490 (2026-10-05): game transcripts mark the games FIND A PLAYER made
- The owner: "how many people have joined using lobby so far? In game transcripts highlight lobby games".
- `game-transcripts/index.html`: each room's reads include `rooms/{code}/lfg` (the mark a matched room's maker writes,
  V488+); such a game's card gets a green bar/border and a LOBBY MATCH pill, in the list and on its own page; a line
  above the games counts them, with `?lobby=1` (only those).
- Checked end to end in the harness: two pages matched by the line (room Z560), READY on both, the real game started
  in 3 s, the CHAT chip showed bottom right in the game, a line arrived as 1 unread + a peek; the transcripts list
  (`?tests=1&lobby=1`) showed Z560 as a LOBBY MATCH card, and its page too.
- The count at the time: 0 real games from the line since the mark (V488, 8:55 PM); the 11 marked rooms were all test
  rooms. Lobby chat: 6 lines — MikeishimYT, Wintergreen16, SohamDesktop. FMGF (V486) and RKRV (V487) were SAME-mode
  2P games during V486-V487, when matches were not marked yet — they may or may not have come from the line.

## V491 (2026-10-05): Firebase backups and outage/usage alerts — and the database is over the free plan
- The owner: "have a backup for firebase in case it is disabled due to overuse, e.g. store the data somewhere else as
  well and make sure I find out about any outages".
- **Found (Cloud Monitoring, 2026-10-06 03:00 UTC):** billing is OFF (the free Spark plan) and the database is over both
  limits — stored 1.107 GB of 1.074 GB (103%), downloaded 25.1 GB of 10.7 GB this cycle (234%); not disabled yet
  (network/storage `disabled_for_overages` = 0). Daily billed downloads: Sep 30 88 GB, Oct 1 75 GB, then 2.4-9.7 GB.
  Storage by part (the full backup): rooms/*/plays 551 MB (the 24 h of recordings, ~9,600 plays), taps 208 MB,
  rooms/*/audit 204 MB, diag 110 MB, embedcode 17 MB, the rest ~6 MB.
- **`tools/fb-backup.js`:** the database in pieces (≤ 256 MB a response) with this Mac's Firebase CLI admin login, gzip
  files + a manifest (sizes by node and by room part) in .rb2p/firebase-backup/<date>/. Play recordings left out
  (plays-archive.js keeps them) unless --with-plays. --small, --recent N, --auto (the day's rooms; full on the 1st),
  --copy-to DIR (iCloud Drive, newest 7), --prune (14 daily, 3 full). Taken 2026-10-06: a full one WITH plays
  (1,114 MB downloaded, 595 MB on disk), a small one.
- **`tools/fb-watch.js`** (LaunchAgent com.rb2p.fb-watch, every 10 min): a public read of embedcode/potd/date (two
  failures = DOWN), the usage meters (stored/limit, monthly sent/limit, the disabled flags, peak connections, last
  hour's bytes), an hourly history in .rb2p/fb-watch-state.json; alerts on a new problem (and daily while it lasts):
  a macOS notification + `gh workflow run firebase-watch.yml` with the message.
- **`.github/workflows/firebase-watch.yml`:** every 15 min on GitHub's machines (works with Firebase and the Mac down):
  the database + the three sites, three tries each; a problem opens an "outage" issue @-mentioning coder-1611 (GitHub
  emails/pushes it) and closes it when all answer; the Mac's messages open/comment "outage" or "usage" issues.
- **`tools/install-fb-watch.sh`:** installs com.rb2p.fb-watch and com.rb2p.fb-backup (3:30 am, --auto --copy-to
  "iCloud Drive/Retro Bowl 2P backups" --prune).

## V492 (2026-10-05): fb-watch — a --report run no longer marks the alerts as sent
- The first --report run saved its problems as alerted, so the LaunchAgent's first real run stayed quiet. Now --report
  keeps the previous record. The first alert then went out: issue #1 "Firebase usage warning" (storage 103%, downloads
  234%), opened by github-actions, @coder-1611. GitHub's own check (workflow_dispatch, no kind) passed: all four answer.

## V493 (2026-10-05): FIND A PLAYER phase 1 — a search card, the true crowd, the lobby banner, an open invite
- The owner: "the lobby appears unattractive to new players since as soon as there are two players they get matched up.
  Give me a plan for making sure players get matched up quick while not demotivating" (their idea: players online in
  the last hour, matching in a black box) — then "build" (phase 1 of the plan).
- **No list of who is in line** (it was nearly always empty — matching is instant): FIND A GAME turns the box into a
  search card — a bobbing football, the clock, an honest word on the wait (the usual wait at this hour once the record
  has 3+ matches for it; else "Busy right now — N players in the last hour" from 8 an hour, else "Quiet right now — the
  busiest time is weekdays 9-11 am. Keep this tab open: it beeps and notifies you"), STOP LOOKING; after 45 s PLAY THE
  COMPUTER (main-retro-bowl in a new tab — this tab keeps looking and calls them back), after 2 min an open invite
  (COPY LINK: ?play=<sid>; the first to open it plays them; the page drops ?play= from its address).
- **The true crowd** (never inflated, hidden when older than 30 min): "N players in the last hour · N games today" and a
  feed (games being played right now, the last match made here, the #1 play of the day's headline). From
  embedcode/lobbystats, published every 10 min by tools/alltime-stats.js (lobbyStats: the visits it already reads, the
  audit archives' games, quiet.js's live list, rooms/~lfg/log), read once when FIND opens (a few hundred bytes).
- **The banner**: while someone else is looking, every lobby's entry screen shows "A PLAYER WANTS A GAME RIGHT NOW —
  PLAY THEM" (a phone: "SOMEONE WANTS A GAME — PLAY"); one tap claims them. Where it lies over the title, the title is
  hidden while it shows (a sideways phone has no other free spot). The FIND button lost its "N WAITING" count.
- **The record**: rooms/~lfg/log/{UTC day}/{push} — start (via), match (maker with via find/banner/invite, joiner with
  the wait w), stop, solo, invite. Writes only.
- A line entry counts as present for 150 s without a heartbeat (was 75): a background tab may beat once a minute.
- Tests: find-player 12/12 (F1 the card/banner/crowd, F4 the banner match, F6 the card's timed offers + a quiet hour,
  F7 the open invite, F8 the record, F9 STOP LOOKING).

## V494 (2026-10-06): a less crowded lobby on short touch tablets; buttons off the bottom edge on touch screens; one press = one chat toggle
- The owner (a screenshot of the lobby on a ~1024x600 touch tablet): "A bit crowded. Also after opening a roster the html
  rendered back button takes like 4 clicks ... This is with all html buttons and if I open chat in the middle of a game it
  opens and then closes back in .5 seconds".
- **The wide lobby is a class now** (html.rb-wide, set by the potd script's wideMq): 900 px wide, 5:4, and 560 px tall —
  700 px on a touch screen, whose bigger buttons overflowed the left column at ~600 (the title cut off at the top, FIND A
  PLAYER over NO ONE TO PLAY WITH?). Below that it is the one column with the PLAYS OF THE DAY chip. In the wide layout the
  lobby's labels get line-height 1.6 (a wrapped DEFENSE DIFFICULTY FOR BOTH PLAYERS ran into itself).
- **Touch screens: off the bottom edge.** The bottom edge belongs to the system (iPhone Safari's toolbar, a Chromebook's
  shelf in tablet mode take the first taps there): the roster's BACK / ROSTER go top left, the in-game CHAT chip top right
  under the version chip with its panel below it (210 px tall on a phone). Desktop is unchanged.
- **CHAT: one press = one toggle** — it acts on the finger lifting off (pointerup) once per 700 ms, and a second activation
  within 700 ms of opening is ignored as a bounce. The can-act monitor counts the chat as the player's own panel.
- **Diag lines to read after the owner's next try:** "CHAT open/shut (tap|click|x|...)", "CHAT kept open (...)", "CHAT shut
  (not in a game: ...)", "PREVIEW rb-preview-back down/up/act/cancel/up off the button".
- In Chromium (mouse and touch emulation, a real game) the roster BACK took 1 press and the chat stayed open before and
  after this change — the owner's device behaviour is not reproduced here; the diag lines are there for it.
- Tests: potd-layout 12/12 (+1024x600 touch: one column), lobby-phone 12/12, find-player 12/12.

## V495 (2026-10-06): the opponent's screen — the delay covers the jitter only (no blending); 720p on a page that cannot keep up
- The owner: "the offense mirroring is really laggy, figure out a way to fix it without impeding quality. Worst case scenario
  give an option or reduce to 720p if too laggy, but fix without blending".
- **Found:** last 3 days, 1,774 of 3,326 screen shows ran on Firebase (127 of 256 games never had a direct link; links
  dropped 600 times for 783 opens). The sending phone is not the problem (its fps on offense: median 60 with the direct
  link and with Firebase; under 40 fps 16% vs 20%). V450's receiver delay — 1.6 frame gaps + p90 jitter + 10 ms, and +4
  ms on every redraw with no NEXT frame in hand (up to 900 ms) — was there to glide toward that next frame; with exact
  frames (V478) it only added lag, and on Firebase (~3-5 frames a second) it crept to ~0.6 s.
- **Now:** target = p90 jitter + 8 ms (15-400 ms), falling up to 3 ms a redraw; "late" counts only a redraw whose next
  frame is overdue (1.5 gaps). A/B on the Firebase fallback, the same harness, two real downs: delay median 603 ms
  (589-642) → 75 ms (39-400), late 0% both. Direct link (opp-view W3): delay 15 ms, drawn 55.9/s, late 0%.
- **720p:** a page whose frames run slower than ~45/s or whose replay draw costs over 8 ms, for 3 s, draws the opponent's
  screen at 1280x720 at most (image-rendering: pixelated) for the rest of the page — every frame still drawn as sent.
- **Diag:** "VIEW stats <mode> · in N/s · drawn N/s · late N% · delay N ms · draw N ms · page N fps [· 720p]" every 10 s
  while the screen shows; "VIEW 720p from now (...)" when it caps.
- Not changed: the frames (exact), the Firebase rate (~5/s — the free plan's downloads are over their cap). The fallback's
  choppiness needs a relay that school networks let through (TURN over TLS on 443) — the owner's call (an account).
- Tests: opp-view 7/7 (W2 99.9% pixel-identical, W3 exact frames, W6 Firebase).

## V496 (2026-10-06): Firebase relief with the least change — silent REST writes, plays off after 2 h, the screen fallback on the spare database
- The owner: "we reached the firebase, do the thing that does the least effect on the actual system, maybe use a different
  database we have set up ... come up with good ideas". The database is still up (not disabled), over both free limits:
  stored 1.13 GB / 1.07 (105%), downloaded 29.5 GB / 10.7 this cycle (275%).
- **Measured (Cloud Monitoring + a 60 s profile, 3 pm CT):** 200-245k REST requests an hour at school hours (~60 a second)
  with 300-527 MB billed an hour; ~47 MB an hour all night (open tabs and the Mac's jobs). Per minute: 1,802 `live`
  writes and 984 `snap` writes (SDK), ~790 screen-fallback ops (300 KB of frames), ~350 audit batches, 168 diag records
  (8.4 KB each, every 5 s a device). A REST write answers with everything it wrote unless asked not to.
- **1. print=silent** (`fbSilent()`) on every REST write whose answer nothing reads: fbRestPut/fbRestPatch (outcomes, live
  over REST, final, ot, clock...), the audit PATCH, the stall worker's PATCH, the heartbeats (and the pagehide beacon),
  the diag / dbg / cmt mirrors, taps. Not the POSTs that read their new id (comments).
- **2. plays-archive.js:** plays move to the Mac after 2 h (was 24 h) — a day of recordings (~550 MB) was half the
  storage; only this job reads them in Firebase (the highlights read the archive too).
- **3. The screen's Firebase fallback on the spare database** `retrobowl-2p` (this game's first project — empty, Spark,
  its own 10 GB / 1 GB): `view/{code}/{w}{role}` (onDisconnect removes each tab's records), rules = those records only
  (`.read` per room, `.write` a {t, d<90k} record or null; everything else denied — root write 401 checked). viewDb()
  falls back to the game's own database if the second app cannot start. A V495 and a V496 phone in one game have no
  Firebase fallback between them (their direct link is unaffected) — it lasts until they reload.
- Tests: opp-view 7/7 (W6: the frames on the spare database, nothing at rooms/{code}/view). Effect to read in
  .rb2p/fb-watch.log's hourly downloads tomorrow at school hours (was 300-527 MB/h).

## V497 (2026-10-06): the opponent's screen over a relay when no direct path opens; Firebase's fallback at its real 5 a second
- The owner: "The offense mirroring is REALLY slow, maybe 3 fps, fix".
- **Measured (the audit archive's VIEW diag lines):** the direct link opened in 57 of 68 games on Sunday 10-04 (84%), 83 of
  194 on Monday (43%), 70 of 233 today (30%) — school networks block the direct path. Every other game ran on the Firebase
  fallback at 2.9-3.0 frames a second (every V495 game's VIEW stats; the owner's AFUW and NMTG on V496 too).
- **Why 3 and not 5-6:** the fallback captured every 166 ms but its send gate wanted 190 ms since the last write, so every
  other capture was dropped (one frame per 332 ms). Now a capture every 200 ms and a 150 ms gate: 5 a second. About 2 KB a
  frame on the spare database (2.7 MB for ~650 frames since V496) — 5 a second fits its free 10 GB at today's use.
- **The relay:** `api/turn.js` (a Vercel function) mints Cloudflare TURN credentials with the mac-remote key
  (CF_TURN_KEY_ID / CF_TURN_API_TOKEN: sensitive production env on the Vercel project, never in the repo), 24 h each; the CDN
  keeps one answer an hour. The page fetches it once a session (sessionStorage), the signalling waits for it (4 s at most,
  then STUN only), and each RTCPeerConnection gets STUN + Cloudflare's TURN (udp 3478/443, tcp 3478/80, tls 5349/443; port 53
  filtered). A direct path still wins where one opens. The diag line says which path: `direct link open (<nid>, relay tcp to
  srflx)`. Cloudflare's free 1,000 GB a month covers it with room (est. 15-30 GB a month for the game).
- Also: B keeps ICE candidates that arrive before its answer begins (they were dropped), and "answer failed" is no longer
  logged when a newer offer replaced the answer (AAJM, AYIP, QXGS, RSSD, GHOP had it).
- Seams: `_rb2p_relayUrl`, `_rb2p_viewNoRelay`, `_rb2p_viewRelayOnly` (iceTransportPolicy relay), `_rb2p_viewPath`.
- Tests: opp-view 8/8 — W3 direct 50.5 frames a second, W6 Firebase 4+ a second (was 3), W8 relay-only (no direct path at
  all): the screen over Cloudflare's relay, 15+ a second. To read on devices tomorrow at school: the share of games whose
  diag says `direct link open (…relay…)`, and VIEW stats `p2p` vs `fb`.

## V498 (2026-10-06): a quarter-change frame no longer pins the waiting phone's clock at 0:01; a game's difficulty is per tab
- The owner (room CGEW, soham vs bettter_than_u, V496, SAME / HARD, 2-minute quarters): "soham's difficulty went up from
  hard to max in the middle of game while other guys remained the same ... Also game ended early. This was a disaster".
- **The clock (CGEW Q3 -> Q4, and OZWC Q1 -> Q2 this morning):** a touchdown at the horn (b: Q3 0:05 less 8 s owed -> 0:00)
  rolled b's engine into Q4 2:00 while it waited. a applied "Q3 0:00" (the horn path) and its engine bumped to Q4 a frame
  BEFORE resetting the clock; a's live push "Q4 0:00" reached b, the mirror wrote it, V293 floored it to 0:01, and the
  clock law then refused every true value (2:00, 1:58 … 1:09) for the whole quarter — 116 refusals. After a's Q4 TD at
  1:12, a waited 4 s for its hold, mirrored b's pinned 0:01, and the V354 re-stamp shipped 0:01 instead of 1:09: b took
  the kickoff at Q4 0:01 and the game ended 20-16 with 1:09 left. 14 audited games this month had a clock pinned at
  0:00-0:03 against 30 s+ on the other phone (long pins: BHOU, SEGF, ISZK, EMNP, OZWC 219 refusals, CGEW 116).
  - (1) the live mirror keeps its clock on a push of 0:00/0:01 against its own 30 s+ higher in the same quarter (the
    quarter-change frame) — diag `LIVE-CLOCK kept 2:00 — the driver pushed Q4 0:00 (a quarter-change frame)`
  - (2) a waiting clock 12 s+ below the DRIVER's (iHaveBall) in the same quarter for 4 s follows it under the clock law's
    licence — `CLOCKGATE licence (the waiting phone follows the driver: kept 0:01, the driver shows 1:58)`; a kick's
    run-off (3-10 s) and a stale push (v382 T4) never reach it
  - (3) the V354 re-stamp keeps the drive's clock when the engine shows 20 s+ less in the same quarter (a copied clock,
    not time that ran) — `SEND-RESTAMP kept Q4 1:09 — the engine shows 0:01`
- **The difficulty:** the setting (`rb2p_difficulty`) lived only in localStorage, shared by every tab, and the engine reads
  it on every play (defense aggression, the MAX tier, the recorder's `dif`). soham's Chromebook also had PFYS and CEIF open
  (SAME / MAX rooms); one of them wrote MAX at 4:11-4:12 pm and CGEW's next play read it (the plays: hard until 16:12:28,
  max after; CGEW's config and game record stayed hard; b had no such tab). Now `_rb2p_difficultyPref()` reads this tab's
  sessionStorage first; a pick writes both; the game start pins it (the gmDif record). Tests that switch to EASY mid-game
  (drive-dir, horn-last-down) set sessionStorage too.
- Tests: v498-clock-pin 5/5 (K1 re-stamp keeps 1:09 over a copied 0:01, takes a real 6 s run-off; K2 a pinned waiting
  clock follows the driver; K3 a "Q 0:00" frame does not pin; K4 another tab picking EASY leaves the game on MAX),
  v382-clockgate 7/7, v354-holdstamp 4/4, game-dif 2/2.

## V499 (2026-10-06): plays of the day — MAX 45, a juke or a stiff arm 4 points
- The owner: "make max worth 45 points, and increase value of total jukes and stiff arms". tools/highlights/features.js
  DIF_PTS max/ultramax 55 -> 45; moves = 4 x (stiff arms + jukes) (was 2); the judge's brief says the same. On today's
  preview: Jennings 130, Kittle 122.7, Rice 115.7, Hubbard 110.4 (the plain overtime catch leaves the top 3), Flowers 110.3.

## V500 (2026-10-06): RANKINGS (an Elo rating, a 3-a-day limit on code games, a censored board) and WATCH LIVE (spectate + chat)
- The owner: "create watch games going on thing, where people can spectate games and chat around. Then create an elo system
  where everybody is a 1000 and at first points fluctuate a lot but as account gets more games it flattens out, like chess
  elo ... a system that stops cheating from friendly matches by saying you can't have more than 3 ranked games in a non
  lobby set up per day ... a leaderboard with names censored if slurs" (then: "no need for leaving penalty rn").
- **The rating is decided on the Mac, never by a phone** (the rooms are writable by any signed-in player): tools/elo.js
  (LaunchAgent com.rb2p.elo, every 2 min, tools/install-elo.sh; truth .rb2p/elo/state.json). At each final both phones
  write rooms/{code}/games/{start}/fin/{role} = {su, so, t, uid} and the note rooms/~elo/q/{code}_{start}; the game record
  carries uids/{a,b} (the SDK's anonymous uid — _rb2p_eloUid) and mode. A game is RANKED when both finals agree, two
  different players, SAME difficulty, and — unless it is a FIND A PLAYER game (the room's first game after its lfg match;
  a rematch is a code game) — neither player already had 3 ranked code games that day (Central). Unranked games keep the
  reason. Elo: start 1000, E = 1/(1+10^((Rb-Ra)/400)), K = 16 + 48·e^(-n/10) (64 -> ~34 at 10 games -> ~16 at 40).
  Published (admin): embedcode/elo/top (5+ games, top 50, names censored), r/{uid} (r, n, W-L-T, today's code games),
  g/{code_start} (each game's change; pruned after 2 days).
- **The page:** RANKINGS and WATCH LIVE under FIND A PLAYER (the button shows the player's rating / the live games count);
  the RANKINGS screen (the board, "your rating", the rules); the room's tag (RANKED GAME · n OF 3 CODE GAMES LEFT TODAY, or
  NOT RANKED and why); the stats screen's line (an estimate at once, then the Mac's change: RANKED · RATING 1000 -> 1032
  (+32)). Seams: _rb2p_eloQueue, _rb2p_eloPath.
- **WATCH LIVE:** player a keeps rooms/~live/{code} (names, teams, score, quarter, clock, difficulty, watchers) fresh every
  15 s; the list reads it. A watcher links to BOTH players (rooms/{code}/watch/o|a|c/{sid}_{role}, the relay ICE); the
  WAITING player passes every frame packet it gets on to up to 4 watchers, unchanged (an ordered channel: the watcher holds
  the same frames, so it decodes exactly as the waiting phone does) — the phone with the ball does no extra work. A source
  change resets the watcher's decoder (_rb2p_view.resetRx); a watcher with nothing to build on asks for a keyframe through
  the waiting phone (askKey). The view module's spectate mode (API.spec: the chip names the screen's team, no OPPONENT
  mark). The watchers' chat rooms/{code}/watch/chat (the players don't see it; unfiltered like the other chats; names
  censored); presence watch/s/{sid} -> "N WATCHING" on the players' badges. Seams: _rb2p_specStart/Stop/State, _rb2p_watchAll.
- Tests: elo-math 6/6 (the K schedule, flattening, the 3-a-day limit and a lobby game, the unranked reasons, the queue, the
  publish with a censored name), v500-ranked-watch 7/7 (two devices + a watcher: the list, the relayed picture, the count,
  the chat, EXIT, the final rated 1000 -> 1032 / 968 on both stats screens), opp-view 8/8.

## V501 (2026-10-06): the ratings rebuilt from every past game, as if the system had always run; the rating's id = the device id
- The owner: "use past games to give everybody a rating, pretend the rating system has always been like this"; "games played
  on the same device against each other don't count".
- **The id:** V500 used the SDK's anonymous uid; every past game's bind carries the REST sign-in's uid (V392's device id, kept
  in localStorage) — a different account. eloUid() now reads the REST token itself (_fbTokPeek; the visit tracker's
  _rb2p_uid is not on every page), so a player's rebuilt rating is theirs. tools/elo.js leaves a V500 game unranked ("played
  on V500, before the ratings used the device id") unless the rebuild covered it.
- **tools/elo-backfill.js:** every finished game in audits/*.json (the alltime-stats split), oldest first, through elo.js's
  own rate(): the device ids from each role's latest bind (ids from 2026-09-17 on), both 'final' entries, the mode from the
  game record (V470+; older games recorded none and count as SAME), FIND A PLAYER from rooms/{code}/lfg, names from the
  binds else rooms/{code}/names. Dry run by default; --write saves the state (a copy of the old one kept), publishes
  embedcode/elo/r (every player) and top, and drops the queue notes it covered. Dry run on 6 Oct: 623 finished games ->
  414 ranked (31 no id, 72 one final, 49 over 3 code games a day, 7 one device, 9 disagreeing, 41 different difficulties);
  368 players, 40 on the board.
- Tests: v500-ranked-watch 7/7 (the REST ids on two devices), elo-math 6/6.

## V502 (2026-10-06): no anti-cheat rules for now — the 3-a-day limit on ranked code games is off (and the rebuild counts those games)
- The owner: "account for the 3 friend a day rule games, for rn as they weren't trying to hack the system ... Right now don't
  have any anti cheating rules yet".
- tools/elo.js: the daily limit is OFF by default (--friendly-limit N brings it back; the per-day counts are still kept and a
  FIND A PLAYER game still never counts toward it). The rules now: both phones' finals agree, two different devices (the
  owner's rule), SAME difficulty. tools/elo-backfill.js rebuilds with no limit (and no longer runs when required).
- The page: the room tag is "★ RANKED GAME — PLAY IT TO THE END AND IT CHANGES BOTH RATINGS" (or NOT RANKED — SAME
  difficulty needed); the stats screen's estimate has no daily check; the RANKINGS note says how the rating moves. The room
  no longer reads rooms/{code}/lfg and games for the tag.
- The rebuild re-run: 623 finished games -> 463 ranked (the 49 over-the-limit games now count), 373 players, 50 on the board.
- Tests: elo-math 6/6 (E3: no limit by default; --friendly-limit 3 still works), v500-ranked-watch 7/7.

## V503 (2026-10-07): the relay's credentials from the game's own database — every door gets the relay (and watchers connect)
- The owner: "i was able to watch 1 game but after that none of them are loading".
- **Measured (7:41 am, 5 live games, all V502):** every player on the web.app door (VPTG, FNYB, LCNU, EEHJ) logged "VIEW no
  relay (unreachable)" every ~20 s — vercel.app (api/turn) is blocked at their school, which is why they use web.app — so
  their link to the other phone ran on Firebase ("VIEW stats fb", 5 frames a second) and a watcher's link never opened: the
  owner's Mac offered to EEHJ six times and to VPTG five, answers came, no connection (no direct path, no relay). GTQR's
  players (vercel.app) got the relay: "direct link open (…, relay …)" — the relay itself works at that school.
- tools/turn-publish.js (LaunchAgent com.rb2p.turn, every 30 min, tools/install-turn.sh — the Cloudflare key copied from
  mac-remote's plist by plistlib, never printed): embedcode/turn = { iceServers, exp, at }, 48 h credentials minted again
  when under 24 h are left. window._rb2p_relayCreds(): the database first (embedcode/turn via REST), then api/turn —
  used by the players' link (relayIce) and the watcher's (specIce). Seams: _rb2p_relayDbOff, _rb2p_relayDbPath.
- Tests: opp-view 8/8 — W8 now blocks vercel.app (_rb2p_relayUrl unreachable): the credentials come from the database and
  the relay carries the link.

## V504 (2026-10-07): search — Retro Bowl Multiplayer and Retro Bowl Online
- The owner: "In SEO, retro bowl multiplayer or retro bowl online show very low results. Fix by also highlighting multiplayer
  and online".
- The home page: title "Retro Bowl Multiplayer — Play Retro Bowl Online With Friends (2 Player)"; the description, the
  Open Graph / Twitter cards (a real gameplay image, summary_large_image) and the JSON-LD (@graph: WebSite with alternate
  names Retro Bowl Multiplayer / Retro Bowl Online; VideoGame "Retro Bowl Multiplayer", alternateName Retro Bowl Online /
  2 Player / 2P, playMode Multi + Single) all lead with multiplayer and online; the headline reads RETRO BOWL 2P · ONLINE
  MULTIPLAYER (a small line under the wordmark); the footer links RETRO BOWL MULTIPLAYER and PLAY RETRO BOWL ONLINE (links
  relative now, so they work under github.io's /two-player-rb/ too).
- Two new landing pages, real content + FAQPage JSON-LD + a gameplay screenshot each (frames from the day's play-of-the-day
  videos, img/): /multiplayer/ ("Retro Bowl Multiplayer — Play Retro Bowl Online Against Real People": the three ways to
  play, the live opponent screen, rankings, settings, plays of the day, FAQ) and /online/ ("Play Retro Bowl Online — Free in
  Your Browser, 2 Player or Solo": online vs another player, solo, where it works, how to start, FAQ).
- The other landing pages' titles: "Retro Bowl Unblocked — 2 Player Multiplayer, Free Online", "Play Retro Bowl With Friends
  Online — Retro Bowl Multiplayer", "How to Play Retro Bowl Multiplayer — Controls, Rooms and Rules"; every page links the
  new two. sitemap.xml lists 6 pages with lastmod; the 6 URLs pinged through IndexNow with the existing key (da9af5e) — Bing,
  DuckDuckGo, Yandex.

## V505 (2026-10-07): the two-player wording back in every title (with multiplayer and online kept)
- The owner: "You didn't remove any of the two player ones right? If you did bring them back". V504 had: the home title lost
  "Retro Bowl 2P" and "Two-Player Retro Bowl" (only "(2 Player)" left), the og/twitter titles and the VideoGame name lost
  them, play-with-friends lost "Two-Player Retro Bowl", how-to-play lost "Retro Bowl 2P", unblocked's "Retro Bowl 2 Player
  Unblocked" was reordered.
- Now: home "Retro Bowl 2P — Two-Player Retro Bowl Multiplayer & Online" (the description opens "Play Retro Bowl two-player
  in your browser" again); VideoGame name "Retro Bowl 2P" again (alternate names Two-Player Retro Bowl, Retro Bowl 2 Player,
  Retro Bowl Multiplayer, Retro Bowl Online; the same on the WebSite); the headline's line "TWO-PLAYER · ONLINE MULTIPLAYER";
  "Retro Bowl 2 Player Unblocked — Multiplayer, Play Free Online in Your Browser"; "Play Retro Bowl With Friends Online —
  Two-Player Retro Bowl Multiplayer"; "How to Play Retro Bowl 2P Multiplayer — Two-Player Controls, Rooms and Rules";
  "Retro Bowl Multiplayer — Play Two-Player Retro Bowl Online Against Real People". Pinged IndexNow again.

## V506 (2026-10-07): the leaving penalty (soham names exempt); the owner's rating set to 1112
- The owner: "add a leaving penalty for pepole who leave first in a ranked game. Make soham rating 1112 and make any username
  with soham in it exempts" (the formula, 6 Oct: "elo - 0.25(minutes left in int)|point differential|").
- The page (the player who stays): when the other player has been gone 2 minutes in a game still running — their pagehide
  beacon (_rb2p_oppLeft) or silent over a minute — it notes it once, with the score and clock at the moment they went:
  rooms/~elo/q/{room}_{game}_left = { c, s, t, left: { role, by, at, q, clk, qmins, su, so } }. Seam: _rb2p_leaveWaitMs.
- tools/elo.js: 10 minutes after the note (--leave-wait-ms), unless the game was finished after all (both fins), the leaver
  of a ranked game (two devices, SAME) loses 0.25 x floor(minutes of game time left: the quarter's clock + the quarters to
  come; overtime its own clock) x |point difference| — no win or loss recorded; a leaver whose name (that game's, or their
  board name) contains "soham" (any case) pays nothing; a tie or under a whole minute takes nothing. --set-rating UID=R sets
  a rating (st.manual); tools/elo-backfill.js replays set ratings and the leave penalties at their own time.
- The RANKINGS note explains the penalty. The owner's rating: the Chromebook "soham" (KrwziFQu) 1100 -> 1112.
- Tests: elo-math 8/8 (E7 the formula, the soham exemption, tie / finished / unranked / overtime; E8 the 10-minute wait),
  v506-leave 2/2 (a real game: one closes the tab, the other notes it, the job takes 17.5; a "SohamTest" leaver pays nothing).

## V507 (2026-10-07): a popup that explains the rankings and highlights the leaving penalty
- The owner: "add a thingy that pops up on the screen now explaining the rankings, no need to get into mechanisms, and
  highlighting the leaving penalty".
- #rb-rankintro (the news popup's look): NEW: RANKINGS — every ranked game moves your rating, beat better players to climb
  faster; "your past games already count — your rating is N" (or "Everyone starts at 1000."); ranked = played to the end,
  two devices, SAME; a red box "DON'T LEAVE EARLY — leaving a ranked game before it ends costs you rating points; the more time
  left and the bigger the score gap, the more you lose". SEE RANKINGS (opens the board) / GOT IT. Once per device
  (localStorage rb2p_rankintro_v1), on the lobby's first screen only, never in a game, never over another popup (waits); not
  in test runs (seam _rb2p_rankIntroForce). Fits a sideways phone (a max-height 520 px compact style).
- Checked headless: shows in 5-7 s, GOT IT hides it and it stays gone after a reload; fits 1366x768, 874x402, 740x360.

## V508 (2026-10-07): a reception is credited to the player the engine credited the receiving yards to
- The owner: "how come in SCGU kittle has 2 rec 1 yards but longest of 16". SCGU game 2 (12:33-12:46 pm): Kittle caught 3
  (13, 13, 16 — the play-by-play and the engine agree), the engine's own receiving yards were right (41.5, longest 15.9 ->
  16, rooms/SCGU/box/a), but the catch COUNT was 2; Jennings caught 3 and was credited 5. (No "1 yard" in any stored
  number — the yards field read 41.)
- Cause: V193 credited stat_receive at the catch (ball state 5) to the offensive player NEAREST the ball — a crossing
  receiver or a blocker standing by the catch got it; V352's reconcile then only fixed the TOTAL (to the QB's completions).
- Now: the catch is credited when the play settles, with the play-by-play's own verdict — to the non-QB whose receiving
  yards (stat_yards) moved on that play (rcvP); a completion that moved no yards falls back to the line's receiver by name.
  The credit at the catch is gone. V352's reconcile stays (now a no-op when the plays are right).
- Tests: v429-passline 4/4 on EASY (P4 new: each receiver's catches = the completions credited to him: 3 completions, 9/14/8
  yards); the test now keeps the drive at 1st & 10 and plays EASY (MAX's tier left the bot with no completions to compare).

## V509 (2026-10-07): leaving a ranked game with under a minute left = 3x a loss, to the player who stayed
- The owner: "there is a trend of people leaving with one second left. Make it that if people leave with less than a minute
  left they lose 3x the original points lost and the guy who stays gets those points". The V506 formula (0.25 x WHOLE
  minutes x |diff|) is 0 under a minute: 5 leaves on 7 Oct (QBCT 0:21 down 22, SMEP 0:40 down 25, KHTD 0:12, IDJD 0:48,
  KYCC 0:56 tied) all cost nothing.
- Now (tools/elo.js): under 60 s of game time left it is a forfeit, as in chess — the leaver loses 3 x K x E (what a loss to
  that player costs), whatever the score, and the stayer gains exactly that. Not when the leaver's own phone recorded the
  final; soham names exempt; no win/loss recorded. The popup and the RANKINGS note say so; devices that saw the first popup
  see it once more as NEW: LEAVING RULE (rb2p_rankintro_v2). e2e/elo-math E9-E10.

## V510 (2026-10-07): RRJQ — a page that changed rooms mid-match ran the new game on the old wiring; leave points at once
- The owner: "game rrjq, kept taking possession from me and giving it to opponent". Justin's page started RGEM (FIND A
  PLAYER, as a) at 14:29:39; at 14:30:02 — 45 s after it made the room — lfgNoShow saw lastPlayers.b empty (Retro's
  presence had blinked) and, 25 s into the match, left the room WITHOUT a reload, put the page back in line; the owner's
  banner tap matched it 2 s later into RRJQ as b. installFirebaseMatchSync is once per page: otherRole stayed 'b', so every
  hand-off Justin sent wrote turn owner=b ("TURN-> b (send-OTHER)" from b), his REST poll read his own outcomes back
  ("recv ... via rest-poll" of his own ts) and re-took the ball, and the owner's TURN-HEAL parked him each time. Justin's
  audit stream kept writing to RGEM/audit/a (RRJQ had none from b); his flow gid stayed 'pending'.
- Fix: lfgInMatch() — the no-show timer, lfgStart, the match watch, lfgJoin and lfgClaim never act from a match (the watch
  takes the page out of line); enterRoom takes a page out of the line; and the backstop: installFirebaseMatchSync remembers
  its room|role and a different one reloads the page (it rejoins via rb_room / rb_role_ and resumes a running match).
- The owner: "give point to opponent immediately after one leaves": the staying page notes a leave 20 s after the leaver's
  page closed (was 2 min) or at once after 60 s of silence; the job applies it at its next run (no 10-min wait; the job now
  runs every 60 s), EVERY leave hands the leaver's points to the stayer, and a game finished after all undoes the leave
  before it is rated. The result is published at embedcode/elo/g/{code_start_left}; the staying page shows
  "OPPONENT LEFT THE GAME — +N RATING TO YOU". e2e/elo-math 11/11 (E8 at once + published, E11 undo); v506-leave 2/2.
