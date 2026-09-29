# Phase 2 design: adversarial review

**Reviewed:**
- `NEVER-FREEZE-PROMPT.md` §3–§5
- `FREEZE-LEDGER.md`: classes F1–F22 and "Phase 2 design (draft for adversarial review)"
- `PLAN-XEDG-FOREVER.md`, laws 1–22
- `index.html` in `~/rb2p/wt-neverfreeze`

Nothing in the repo was edited.

**Line numbers.** The worktree's `index.html` changed while I was reviewing it: it went from 19,048 to 19,098 lines (mtime 23:59). The builder added `fetchT`, a 45 s expiry on the send guard, and a retry for the final-screen render. Every `index.html:N` below refers to that version, which I copied to `scratchpad/review-index.html`. `retrobowl.js:N` refers to the worktree copy.

## Evidence I gathered (read-only)

**Real audited rooms.** Source: `~/rb2p/two-player-rb/audits/*.json`. A room counts as real when its code has no digit and at least one `bind` is not `src:'local'`. There are 616.
- **FB-STALL** (an SDK write not confirmed in 1.5 s): 197 rooms.
- **FB-CONN OFFLINE:** 158 rooms.
- **A hand-off only the REST poll delivered:** 47 rooms (60 of 5,438 receipts).
- **A `held` guard:** 111 rooms.

**Hand-off delay** (receive time `t` minus outcome `ts`; PAT_RESULT excluded; n = 5,024):

| p50 | p90 | p95 | p99 |
|---|---|---|---|
| 4.1 s | 5.5 s | 12.1 s | 48.6 s |

- These figures include holds on hidden receivers and clock skew.
- The 4.1 s median is the universal 4 s hold that comes before every send.
- KICKOFF-typed hand-offs: 932 of the 5,024.

**CORS on the RTDB REST endpoint.** I sent OPTIONS and GET requests from four origins: `two-player-rb.vercel.app`, `null` (the srcdoc embed), `sites.google.com` and `*.googleusercontent.com`.
- The preflight allows `if-match` and `x-firebase-etag`, and the response exposes `ETag`. An ETag compare-and-swap therefore works from every door.
- No `Access-Control-Max-Age` is sent, so every conditional request pays for a preflight.

**Other checks:**
- `retrobowl.js` has 0 matches for `webglcontext` or `isContextLost`.
- 0 of 1,446 audit rooms log `WEBGL CONTEXT LOST`.
- The registry's source, `scratchpad/latch-inventory.md`, does not exist in any scratchpad. It also can't live in a session scratchpad: it has to be in the repo.

## Priority

| # | Problem | Kind | Likelihood | Impact |
|---|---|---|---|---|
| 1 | The 4–12 s hold before every send is invisible to "in flight", and a restore races the engine's own send | fight + accuracy + (b) | every drive end | a punt or turnover reverted, or two offenses |
| 2 | The registry resets and expires obligations as if they were guards | accuracy | every recovery | gift points; lost hand-offs |
| 3 | The trigger can't see (b), (c) or (d), or the SQHJ scorer | freeze | common | freeze with no net |
| 4 | Actions are chosen by symptom: TBPK regression, no "hand off" action, `uncover` fights the WAIT loop | accuracy + fight | common | the opponent never gets the ball; an unplayed MISSED |
| 5 | lastGood lags one play, so `restore` rewinds a finished play | accuracy | common (empty-field class) | yards and downs erased |
| 6 | Every cross-phone input arrives over the SDK only | split-brain | common (FB-STALL in 197/616 rooms) | the ball taken from a playing partner |
| 7 | The 10 s budget is spent before the authority starts | freeze | every empty-field recovery | every such recovery counts as a freeze |
| 8 | Timestamps from two phones are compared | accuracy + fight | ~2% of games | possession reversed; the lock wedges or is ignored |
| 9 | The lock can be unavailable, can hang, and can outlive its holder | freeze + fight | occasional | no recovery, or two at once |
| 10 | Stale SDK writes land late | fight | occasional | the shared record goes backwards |
| 11 | `restore` ≠ `apply`, and there is no spot right after a kickoff | accuracy + freeze | common (the GET READY window) | wrong spot or score, or a refused recovery |
| 12 | A reload loses the pending hand-off; resume can raise the clock | (c) + accuracy | occasional | both wait, then a guessed drive |
| 13 | The final is decided per phone | accuracy | occasional (close games at the horn) | the result changes |
| 14 | A previous-build phone keeps its own rescuers | fight | every deploy window | two offenses |
| 15 | OT counts possessions from waiting-flag edges | accuracy | rare × any park | OT ends early |
| 16 | The "away partner" guard reads a 12 s flag | accuracy | occasional | the ball taken from an away player |
| 17 | Rematches inherit the last game's state | accuracy | occasional | restore at the last game's spot |
| 18 | The wedge detector is blind to mouse holds | accuracy | occasional (Chromebooks) | a killed drag, or a throw the player didn't make |
| 19 | (e) and a lost WebGL context stay outside the net | freeze | rare to occasional | an unmeasured or unrecoverable freeze |

---

## 1. Every drive end: the hand-off is held 4–12 s before it counts as "in flight"

**Scenario.** Both phones are on screen.
1. **A, t0.** A's punt lands. The `_1c1` hook does three things:
   - sets A's `waiting=true` and names B in the turn record over the SDK (index.html:6400–6406);
   - parks the outcome in `_rb2p_pendingTurnoverOutcome` behind a 4 s timer (6441, 6471);
   - re-arms that timer 1 s at a time, up to 12 s, while an opponent TD-replay latch is set (6456–6457).
2. **B, t0 to t0+4.** B is parked. The server holds nothing addressed to B.
3. **t0+4.** The both-waiting check fires. The design gives it no threshold of its own, so presumably T_ACT = 4 s. A's authority reads the shared record:
   - last good = A, at its own 30, 4th & 6;
   - no newer outcome on the server;
   - "in flight (sent, not yet applied)" is false, because `_rb2p_lastSentOutcomeMs` is only set inside `_twoPlayer.send` (17328).

   The answer is A, so A is restored. Alternatively `_rb2p_latchReset` clears the hold as a transient latch.
4. **t0+4 to t0+12.** `fireHeldSend` fires anyway and B applies the punt: two offenses. If the reset cleared the hold instead, the punt never ships and A keeps a ball it punted away.

A second race sits next to this one. `forceUserOffenseDrive` clears `_rb2p_userOutcomeSendInProgress` (2394–2396). That is the one-shot guard (6153) that stops the engine's repeated possession-change calls from sending twice. A restore that lands between `_1c1` and the send re-arms a second send.

**Why the design fails.** "In flight" starts at the send, but the sender gave the ball away at `_1c1`, and the receiver can see neither moment. The §3 transition "send → apply → formation" also starts too late. A 12 s hold is a §3(b) freeze on its own.

**Smallest change.**
- Start "hand-off in progress" at the `_1c1` edge. `_rb2p_pendingTurnoverHeldMs` already exists: publish it next to the turn record over both transports, and treat the hand-off as in flight until the receiver's staged-ack.
- Register the held send as an obligation whose only expiry is "send it".
- Make the `_1c1` send path and the authority share the local lock. After every action, re-check the pending send and `_rb2p_lastSentOutcomeMs`, and park if a send happened.
- Cap the pick-six-upgrade hold so that hold + p95 wire time stays under 10 s.

## 2. The registry resets and expires obligations as if they were guards

**Scenario A (XEDG again).**
1. B owes a pick-six conversion: `p6ScorerOwes`, patDuty and `patPlayPending` are all set.
2. A different recovery fires on B, say `unwedge`. The design says "each recovery calls `_rb2p_latchReset`", which clears the conversion flags.
3. `forceUserOffenseDrive` stops refusing (2368–2385).
4. The next restore gives the scorer a fresh drive at the 2. That is law 1's 7-point gift.

**Scenario B.**
1. A is hidden, holding B's TD kickoff in `_rb2p_deferredOutcome`.
2. The 1 s ticker passes the hold's `maxMs`. That ticker is throttled while hidden and fires in bursts on wake (VJGW).
3. The hand-off is either dropped, or applied at 0 fps. Today's drain already applies past 25 s while still blocked (17525), which is the RDOG failure that V363 exists to stop.

**Scenario C.** `_rb2p_userIsWaitingForOpponent` blocks a snap, so it goes in the registry. What is its expiry action? A wait on an away partner may only end in the honest status.

**The current code already shows the trap.** The send-guard expiry added during this review (18189–18198) clears `_rb2p_userOutcomeSendInProgress` after 45 s, sized for "a send".
- The guard's documented life is "cleared only by applyOpponentOutcome" (5878). That is the opponent's whole drive.
- So it will expire, and log `guard latch-expired`, in most games, and each time it re-arms `_1c1` sends on a parked phone on a timer rather than a fact.
- The fact that ends it is "my own drive was staged": clear it on every waiting true→false edge.

**Why the design fails.**
- The schema `{owner, blocks, maxMs, isSet, since, expire}` has no field that separates a guard from a debt.
- `maxMs` is wall-clock, but §3's wall counts can-act seconds, and a hidden holder is the player's doing.

**Smallest change.**
- Give the registry two classes:
  - **Guards** may be reset.
  - **Obligations** are never reset. They expire only through their own resolution (send, apply, or ship MISSED at the wall). Their age counts visible and online seconds (can-act seconds for conversions), with an 8 s grace after a wake.
- `_rb2p_latchReset` touches guards only. A wait on the partner expires into the honest status and nothing else.
- Set each `maxMs` from the latch's measured legitimate lifetime.
- The authority never acts from a hidden page.
- Obligations to list: the held send and its timer, `_rb2p_deferredOutcome`, `_twoPlayer.pending`, `_rb2p_lastSentOutcome`, the send guard, `p6ScorerOwes`/patDuty/`patPlayPending`/cascade, `quarterResumePending` and the `preRollover*` captures, `qAnchor`, `rb2p_pendingInt`/`turnover`, `ot/p{n}`, and `gameOverReported`.

## 3. The trigger can't see three freeze classes, or the SQHJ scorer

**(b) Scenario.**
1. B is handed A's TD kickoff while B's frame loop is dead: visible, fps 0.
2. Either the outcome is held for 25 s as blocked (17344–17355, 17525), or the apply returns false and the loop shows "apply failed" with the record already consumed and acked (12306–12307).
3. A and B are both waiting. The monitor sets `out.must = !waiting || scorerConv` (18244), so neither phone is must-act.
4. Nothing is ever cannot-act, so nothing triggers. The engine kick the design assigns to "engine not stepping" never runs on a waiting phone.

**(c) Scenario.**
1. A reload's resume never re-enters the match room.
2. The monitor returns 'not in a match' (18238).
3. VIS-RECOVER only logs 'reload DISABLED' (15647–15653), so nothing acts.

**(d) Scenario (F19).**
1. After the horn, `_rb2p_gameOverReported` latches before the stats screen renders, or the engine leaves the match room.
2. The monitor returns 'game over' or 'not in a match' (18238–18239), so it goes blind to exactly the §3(d) freeze.

**SQHJ state.** A scorer owes a pick-six result, but the cascade flag is already cleared.
- `scorerConv` requires `_rb2p_pickSixPatCascadeActive` (18242), so this phone isn't must-act.
- Only the field check sees it, and it ships an unplayed MISSED (18111–18124).

**Smallest change.**
- Define must-act as any of:
  - `!waiting`;
  - `scorerConv`, meaning modal up, `patPlayPending` or `p6ScorerOwes`, without also requiring the cascade flag;
  - an outcome addressed to me, held, pending or on the server, is newer than my staged marker;
  - the turn record names me past the hand-off transition.
- Add two monitored duties, each with its own deadline:
  - **must-show-final:** decided by the shared record, no conversion owed, and `#rb-final` not displayed on a visible page. Action: `final`.
  - **must-resume:** `rb2p_matchLive=1`, the room is live, and the page has been out of the match room for N s. Action: re-run `resumeMatch`, never reload.

## 4. Actions chosen by symptom pick the wrong action for the two commonest recoveries

Since V395 there have been 81 empty-field and 77 post-conv-handoff firings.

**`empty field → restore or apply-held`.**
- Within 40 s of a conversion offer, an empty field is the engine clearing the field for the TD kickoff (law 9, TBPK; `_rb2p_emptyFieldAct` 2952–2969).
- A drive left at the 2 after a try that crossed the horn is a hand-off (law 18; 2909–2943).
- Restoring there re-stages the scorer's drive, and the opponent never gets the ball.
- The action list has no "hand off" action, meaning: drive `s_change_possession` so that `_1c1` ships the TD kickoff. `resend` re-ships a record that already exists; it doesn't create one. So the migrated EMPTY-FIELD and post-conversion detectors have nothing correct to ask for.

**`covered → uncover`.**
- The 200 ms loop redraws the WAIT cover from the waiting flag every tick (12294–12319).
  - Hiding the cover without changing state is undone within 200 ms, so the authority and the WAIT loop fight at 5 Hz.
  - Flipping the flag without staging a drive leaves the kid on the parked scene, with possession still on the other team.
- `uncover` is therefore either a no-op or a restore without the restore's guards.
- By the loop's own rule, the WAIT cover is never up on a must-act phone for more than one tick. So "covered" means some other element (the lobby, the OT banner, the final overlay, a new panel), and the authority must not hide those.

**Owed conversion with no modal.** The field check ships MISSED after about 9.5 s (18111–18124). That is an unplayed result that isn't the wall rule.

**Smallest change.**
- Choose the action from shared state, in this order:
  1. A conversion is owed → `reoffer`. The wall counts can-act seconds while the modal is usable.
  2. The conversion is resolved and no kickoff hand-off has gone out → `handoff`, a new action that ships the TD kickoff through `s_change_possession`.
  3. An outcome addressed to me isn't staged yet → `apply`.
  4. Otherwise, `restore` or `park` by the owner's rule.
- The symptom only picks local remedies: unwedge, scroll heal, engine kick.
- Delete `uncover`.

## 5. lastGood lags one play, so `restore` rewinds a finished play

**Scenario.** This is the FEED shape, the design's own example class.
1. A snaps at its own 30, 2nd & 6, and the sampler records it.
2. A hides mid-play. The play runs on throttled timers and ends while A is hidden: a 14-yard gain.
3. The engine now holds own 44, 1st & 10. The `settle` hook logs exactly these registers (4888–4895).
4. The field empties. A comes back, the monitor reports "empty field", and `restore` from lastGood puts the ball at own 30, 2nd & 6.

The completed play is erased. There is a precedent: the V363 report "I threw 15 and it went back to 3rd and 16" (2747).

**Why the design fails.**
- lastGood is sampled only while the page is visible (18045), and only with at least 6 OF and a ball on screen (18028–18033, 18052).
- A play that settles while hidden, or in the gap between the whistle and the next formation, is never recorded.
- The owner's rule is "the last time the game was not frozen", and that is after the whistle.

**Smallest change.**
- Write lastGood from the settle event (the post-play y/d/tg, sequenced by snap count), whether or not the page is visible. Let the sampler fill in only between settles.
- Restore to whichever of the settled and sampled records is newer by play sequence.

## 6. Every cross-phone input the decision needs arrives over the SDK only

**Today:**
- The turn record (18355), the opponent's heartbeat (18343) and the opponent's live push (18508) are read with SDK `onValue` only.
- REST reads exist only for `outcomes/{opp}` while waiting (17458–17482) and for the delivery check.
- The design adds `act/{role}` and `lastGood/{role}`, "published on change". A record that doesn't change never refreshes, so "nothing changed" and "my socket died" look the same.
- FB-STALL is in 197 of 616 real rooms.

**Scenario.**
1. A's socket is half-open.
2. B applied A's punt over REST and is now live.
3. A's copies of `act/b` ("waiting") and lastGood (owner A) date from before that.
4. A sees both-waiting, the rule answers A, and A restores itself: two offenses.
5. The both-live rule then runs on the same stale inputs and can park B, who legitimately has the ball.

**Halftime.** The halftime law has no outcome record (13253–13256: "no outcome flows"). A B whose socket is dead never learns it's Q3, and both phones wait while REST works fine.

**Smallest change.**
- The authority reads its inputs fresh over REST when it decides: one GET of a compact `rooms/{code}/ctl`. A failed read means no decision, plus the honest status.
- Act state rides the 5 s REST heartbeat with a server timestamp. After 2 missed beats it is "unknown", never "waiting".
- The REST poll also covers `ctl`, the turn record and the quarter law, not only outcomes.

## 7. The 10 s budget is spent before the authority starts

**Empty field.** The monitor only calls the field empty after 8 s (18268). T_ACT adds 4 s on top, so the authority starts at 12 s.

**Round trips.**
- A REST compare-and-swap is a GET with `X-Firebase-ETag` plus a PUT with `if-match`.
- Both headers force a CORS preflight, and the server sends no `Access-Control-Max-Age`.
- That is up to 4 round trips, plus a token refresh near expiry.
- The new `fetchT` aborts at 10 s, which is the entire freeze budget.

**Timers carried across a hide.**
- `emptySince` and `wedgeSince` aren't reset while the page is hidden: the hidden return at 18246 comes before the census.
- So the first tick after a wake says "empty field 60s".
- Ticks bunch up after a wake (VJGW), so the trigger fires before the post-wake drain (400 ms) and before the frames settle.

**No measured table.** The design says "T_ACT 4 s, tuned from the transition table", but no table exists yet. §3 requires at least 20 measured occurrences per transition.

**Smallest change.**
- The monitor reports each raw condition's onset time.
- T_ACT counts from that onset, in visible and frames-advancing seconds, and restarts at every hidden→visible transition.
- Each reason's allowance comes from the measured table, with allowance + T_ACT + p95 action time ≤ 10 s.
- Pre-read `ctl` and its ETag on every state change, so a decision costs a single PUT.
- Lock and decision calls abort at about 2–3 s, not 10.

## 8. Timestamps from two phones are compared as if they shared a clock

F17 found 6 of 522 phones off by more than 10 s.

**Ordering.** "Moved only by a sent or applied outcome with a later ts" compares `lastGood/b.ts` (B's clock) with `outcomes/a.ts` (A's clock; restamped at the send, 6462).

Scenario, with B's clock 30 s fast:
1. A punts at real time 1000, so the outcome's ts is 1000.
2. B wrote `lastGood/b {owner A}` at real time 980, which is B-clock 1010.
3. B's field freezes after the apply.
4. The rule sees 1010 > 1000, treats the punt as earlier, and answers owner A. A gets its punted ball back.

**The lock.**
- `exp = now + 15 s` written on a clock 40 s fast is honoured for 55 s by the other phone.
- Written on a clock 40 s slow, it is already expired when the other phone reads it, so both phones act.

**Precedents in today's resume and REST paths.**
- Resume picks the "fresher" clock with `myTs >= oppTs` across phones (16074) and writes it under the 'resume restore' licence (5412).
- The REST poll drops outcomes older than 120 s by the receiver's clock (17475).

**Smallest change.**
- Never compare timestamps from different phones.
- Order events by causality instead. Each lastGood carries `seen: {a: last outcome ts from a, b: last from b}`, each value in its sender's own clock. "A later hand-off" then means `outcomes/x.ts > lastGood.seen[x]`.
- Durations (the lease, staleness) use server time: `{".sv":"timestamp"}` writes plus a per-phone offset from one REST round trip, or rules that use `now`.

## 9. The cross-phone lock can be unavailable, can hang, and can outlive its holder

**Unavailable (REST-only).**
- REST uses its own anonymous account (index.html:44–93, F18).
- Under the per-IP sign-up limit, a device can have a working SDK session and no REST token. `fbAuthUrl` then sends the bare URL (95–99), and the rules refuse it, so that device can never take the lock.
- The design also routes "every other `forceUserOffenseDrive` caller" through the authority. There are 21 call sites, including:
  - the normal apply (11505);
  - the opening kickoff (5624);
  - resume (5431);
  - the Q3 law (13311);
  - OT (13393).

  Normal play would stop along with the lock.

**Hangs.**
- `fbRestGet`, `fbRestPut` and `fbRestPatch` still use a bare `fetch` (111, 116, 121). Only the two token calls use the new `fetchT`.
- A local lock held across a promise that never settles wedges the authority. That is exactly how `outcomePollBusy` failed.

**Null means two things.** `fbRestGet` returns null on any HTTP error (122), which is the same value as an absent node. The lock logic would read that as "no lock held", "no lastGood, so the kickoff record decides (owner A)", or "hand-off missing, so resend".

**Liveness.**
- The lock's TTL is 15 s against a 10 s budget.
- A holder that hides or closes keeps the lock for the whole TTL.
- An action longer than the lease keeps acting after the other phone has taken the lease, with no fencing. The post-PAT drive retry runs up to 45 s (8504).

**Smallest change.**
- Compare-and-swap on either transport: a REST `if-match` PUT, or an SDK `runTransaction`. Both are server-side compare-and-swap on the same node.
- Every lock or decision call aborts at 2–3 s.
- Use a read helper that tells "absent" from "failed".
- Keep the lease at 3 s or less. Release it on hidden or pagehide (a keepalive DELETE with `if-match`), and stamp every write in the action with the lease epoch.
- Local remedies take no cross-phone lock: unwedge, scroll heal, engine kick, and re-offering my own owed conversion. Normal applies take only the local lock.
- **Simplest:** make the decision itself the compare-and-swap. Read `ctl` with its ETag, compute, and PUT `ctl'` with `if-match`. The loser re-reads. Nothing needs to expire.

## 10. Stale SDK writes land late and overwrite newer shared state

**Mechanism.**
- The SDK queues writes on a half-open socket and flushes them on reconnect (law 22, MHQP).
- `_rb2p_declareTurnOwner` writes over the SDK only (18300), and the design's `lastGood`, `act` and `recovery` records would too.
- The rules are `rooms/$room/.write: auth != null`, with no validation (`firebase/database.rules.json`).

**Scenario.**
1. **t0.** A's socket is half-open. A publishes `lastGood/a {owner A, 3rd & 2 at +20}`.
2. A punts. The REST fallback delivers the punt, but `turn=B` is still queued in the SDK.
3. B plays three downs.
4. **t0+60 s.** A's socket reconnects and flushes `lastGood/a` and the turn record over B's newer state.
5. **t0+70 s.** B's field freezes. The rule answers A: B is parked and A is restored at +20.

**Smallest change.**
- Write gate records only with conditional writes (a REST `if-match` PUT or an SDK transaction) that carry a monotonic `seq`. Or add `.validate` rules on the new paths: `newData.child('seq').val() > data.child('seq').val()`.
- This is additive: old builds never write these paths, so it can't break V418.
- Never `FB.set` a gate record.

## 11. `restore` is not `apply`, and the restore rule has no spot right after a kickoff

**The spot is a random draw that nothing stores.**
- The TD/FG/HALF_END receiver draws its own random return spot at apply time (11452–11461).
- Five other paths each draw again:
  - the opening kickoff (5623);
  - the Q3 law (13301);
  - P6-WATCH (469);
  - the 300 s fallback (6554);
  - the corpse tap (14734).
- lastGood only exists after the first sample with a formation on screen (18052).
- Between the apply and that sample, which is exactly the GET READY window, the rule has no spot. The authority then either refuses (a freeze) or draws again, which property 5 forbids.
- `fieldRestoreMine` today falls back to the sender's live `yardLine` (18085). That is the kicker's spot, not the receiver's return.

**A bare force skips the rest of the apply.**
- `restore` = `forceUserOffenseDrive(y, true, {down,toGo})` skips the score, quarter and clock from the outcome, and the PICK6/PAT_RESULT branches.
- When the answer is "their hand-off to me", a bare force leaves the receiver short of the sender's points.
- If the real record then arrives, it queues behind a live drive (12294) and is purged at the next send (law 3). That is the F9 pattern.

**The OT coin flip has one seeder.**
- Only host A seeds the flip, with an SDK get-then-set (13845–13860).
- With A's socket dead or A hidden, there is no flip, and "the receiver in the coin-flip record" has no answer.

**Smallest change.**
- Draw the spot once, at apply time, and write it into `ctl`/lastGood together with the apply, before staging.
- When the answer is "their hand-off to me", the action is an idempotent re-apply of that outcome, fetched over REST and keyed by its ts and a staged marker. Never a bare force.
- Let either phone seed the OT flip with a compare-and-swap.

## 12. A reload loses the pending hand-off, and resume can raise the clock

**The pending hand-off is lost.**
- After a reload, the SDK's first snapshot of `outcomes/{opp}` is swallowed and sets `lastTs` (17443–17447). From then on, neither the SDK path nor the REST poll (17469) will apply that record.
- The only way back is the lost-outcome insurance (16339–16352). It requires all of:
  - under 120 s old, comparing the receiver's clock with the sender's ts;
  - not acked;
  - type TD, FG, PUNT, OTHER or PAT_RESULT.
- Each of those conditions fails in practice:
  - **Type:** KICKOFF is 932 of 5,024 real hand-offs, and it is excluded.
  - **Age:** a 2-minute lid-close exceeds the window (80 s with a 40 s skew).
  - **Ack:** the ack is written when the record is only queued (17426–17437, comment at 12268), so "acked" doesn't mean "staged".
- Both phones then wait. Today TURN-RESCUE eventually guesses a spot (F9).

**The resumed INT is re-sent as a new record.** Resume re-sends an unresolved INT with `ts: Date.now()` (16103–16110, 16142). If the first one did land, the receiver's dedupe doesn't catch the copy, and its drive snaps back to the pick spot.

**The clock can go up.** The resume clock comes from whichever record looks fresher across the two phones (16074), and it is written under the 'resume restore' licence (5412). The parked phone's clock is pinned (V293), so it can raise the live phone's clock within the quarter.

**Smallest change.**
- Keep a durable, per-role `staged` marker: the outcome's ts, written after the drive is actually staged. Move the ack there.
- Resume re-applies any outcome addressed to me that is newer than `staged`, whatever its age or type.
- Re-sends reuse the original record and ts.
- The resume clock is the lower of the two same-quarter clocks. The accuracy guard also needs a shared per-quarter clock floor to compare against after a reload.

## 13. The final is decided per phone

**The parked phone ends the game during the try.**
- The parked phone mirrors the scorer's quarter upward (18643).
- When the scorer's engine rolls to Q5 during a try (F7), the parked phone's end detector holds only for its own conversion state: `v346PatHold` (12927–12938) and `convLiveF` (12844–12852).
- It declares FINAL about 6 s later.

**The scorer gives up after 30 s.** The scorer defers that FINAL for 30 s of wall time (14006), hidden or not, and then accepts it.

**V325 skips a try that could change the result.** A pick-six at 0:00 with any non-tied score declares FINAL and skips the conversion (11064–11094). That includes a scorer who still trails by 1–2 after the +6, whose try could tie or win.

**OT-TD gives up on wall time.** It abandons an untried conversion after 30 s, or 60 s with the modal up (13520).

The design's `final` guard ("no conversion live") inherits this per-phone view.

**Smallest change.**
- "Conversion owed" becomes a shared record: the scorer's patDuty, or `ctl.conv`. `final` refuses on either phone while it is owed.
- One conversion clock (the wall, counted in the scorer's can-act seconds) owns every conversion deadline:
  - the opponent-FINAL defer;
  - the forced final's 120 s bound;
  - OT-TD;
  - V325, which may skip the try only when the scorer leads after the +6.

## 14. A previous-build phone keeps its own rescuers

A V418 phone never reads `ctl`, `lastGood`, `act` or `recovery`, so the lock excludes nothing on it. It still runs:
- TURN-RESCUE, which guesses a spot;
- the V413 field check, with its own `rightfulOwner` and its 30 s "the turn record decides" rule;
- P6-WATCH;
- the forced final.

**Scenario.**
1. On new-build B, the authority restores B from the shared rule.
2. On old-build A, the field check reaches 30 s of both-parked, sees the SDK turn record naming A, and restores A. That makes two offenses.
3. A's TURN-RESCUE can also re-take a ball that B's authority just parked.

**Smallest change.**
- Gate on `rooms/{code}/ver/{opp}` (16814–16821). With an older partner, the new authority runs local remedies only, and never acts against the turn record that the old build honours:
  - no restore while the turn record names the partner;
  - no park while the partner's push claims the ball.
- A phone that reloads onto the new build mid-game builds `ctl` from the old records (turn, live, outcomes), rather than reading their absence as "no last good".

## 15. OT counts possessions from waiting-flag edges, so a park ends a possession

**Mechanism.**
- `_rb2p_otMyPoss` goes up on any false→true edge of the waiting flag (13039–13045), and then the round end is checked.
- The other phone counts only outcomes it receives.
- So a recovery park counts as a finished possession on one phone only. Recovery parks include field-park (18158), TURN-HEAL (18484), and the design's own `park`.

**Scenario.**
1. OT. A scored first (7–0) and handed off, so B is on its drive.
2. A both-live misfire parks B.
3. B's count is now 1–1 with B trailing, so `_rb2p_otCheckRoundEnd` declares FINAL.
4. A's count is 1–0, so A keeps waiting for B's drive.

**Smallest change.**
- Count OT possessions from hand-off records (sent or applied outcomes), never from flag edges.
- The authority's park carries a marker that the counter ignores.

## 16. "Never take the ball from an away partner" reads a 12-second flag

**Mechanism.** `_rb2p_oppHidden()` is true only within 12 s of an H heartbeat (18335–18340). Three things stop that heartbeat from refreshing during a long hide:
- A hidden Chrome tab's 5 s heartbeat runs only once a minute after 5 minutes (intensive throttling).
- iOS suspends it entirely.
- A reader with a dead socket never receives the heartbeat at all, because it is read over the SDK only (18343).

**Why the design fails.**
- For most of a long hide, the partner looks visible but quiet.
- F3 changed only the cover's text (11736–11741), not this function.
- A guard keyed on `_rb2p_oppHidden()` fails open.

**Smallest change.**
- Define `partnerPresent` = a V heartbeat received within the last 12 s, by local receipt time. Poll `hb` over REST when the SDK is stale.
- Anything that moves possession away from the partner requires `partnerPresent`. Otherwise the only action is the honest status.

## 17. Rematches in the same room or page inherit the last game's state

**What carries over.**
- `installFirebaseMatchSync` runs once per page (17201–17203).
  - `window._rb2p_lastGood` is only nulled on that first install (18027), so a same-page rematch keeps the previous game's value.
  - `_rb2p_lastSentOutcomeMs`, `_rb2p_turnRec` and the field-check counters carry over the same way.
- The `rb2p_lastGood` sessionStorage key is never removed, and it is matched by room code only (18061, 18068).
- The design's new room records would survive between games unless purged.
- `startMatch`'s purges are fire-and-forget SDK removes that race the other phone's first writes (18733–18762), and `turn` isn't purged at all.

**Scenario.**
1. A rematch starts in the same room.
2. B's field freezes before the first lastGood sample.
3. The rule reads the last game's record (owner B, 3rd & 4 at +30) and restores B there.

**Smallest change.**
- Use one shared game id: A's `games/{ms}` key (18777), adopted by B at the start.
- Stamp it on every gate record and on the sessionStorage copy, and have readers ignore any other id.
- Reset the in-memory state in `startMatch`.

## 18. The wedge detector counts only touches, so `unwedge` would break real mouse drags

**Mechanism.**
- The engine takes slot 0 on pointerdown for every pointer type, mouse included (retrobowl.js:76409–76418), and frees it on pointerup.
- The monitor counts only touch events (18215–18217, 18271–18272).
- So a trackpad or mouse drag held for 3.5 s reads as "pointer wedged". With T_ACT on top, the authority releases slot 0 about 7 s into a held QB drag on a Chromebook.

**Effect.** Clearing the slot kills the drag. Synthesizing a release instead throws the ball for the player: an input the human didn't make.

**Smallest change.**
- Count all pointer types at the document level: pointerdown, pointerup and pointercancel, plus `buttons`.
- Wedged means the engine's slot is held and no pointer of any type has been down for at least 2 s.
- `unwedge` clears the slot without synthesizing a release.

## 19. Two freeze classes stay outside the net: (e) and a lost WebGL context

**(e) taps not registered.**
- 'taps unanswered' is soft and never triggers anything (18277–18278).
- It is inferred from "nothing moved", not from the engine registering no press.
- The design promises a net "whatever the cause". F1 alone had 6 stuck stretches of up to 26 s.

**Lost WebGL context.**
- The design replaces `glLostRecover`'s reload (15474–15482) with "kick the engine".
- The engine has no context-restore path (0 matches in `retrobowl.js`), so a lost context stays black whatever the engine does.
- The monitor has no GL check, so it would report can-act on a black canvas.
- This is rare: 0 of 1,446 audit rooms.

**Smallest change.**
- **(e):** compare canvas pointerdowns in the ball, QB or button hit area against the engine's own slot-0 press state. 10 s of taps reaching the handler with no press is a hard reason. The remedies are scroll heal, re-measuring `_No2`, and clearing stale slots.
- **GL:**
  - Add 'gl lost' as a hard reason, so that R-FREEZE counts it.
  - Fix the cause: the context count and the canvas/DPR size.
  - Record in the ledger that no in-page recovery exists, instead of claiming the engine kick handles it.

---

## One change that closes several items

Several items (6, 8, 9, 10, 11 and 17) close with the same change: one compact shared record, `rooms/{code}/ctl`.

**What it holds:** `gameId`, `seq`, the owner, the spot `{y, d, tg}` from settle or apply, the `seen` vector, the conversion owed, the hand-off pending, and a server timestamp.

**How it works:**
- It is written only by compare-and-swap, over either transport.
- The authority reads it fresh over REST.
- The authority decides by writing `ctl'` with `if-match`.
- The owner phone stages when it sees `ctl.owner === me` and a `seq` newer than its staged marker.

**What it removes:** there is no separate lock to expire, no cross-phone clock comparison, no stale replay, and both phones read one truth.
