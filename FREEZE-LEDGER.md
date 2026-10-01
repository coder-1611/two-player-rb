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
