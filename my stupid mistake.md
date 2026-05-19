# my stupid mistake.md

A post-mortem on why ~20 versions of bridge changes have failed to fix the 2P pick-6 PAT bug. Written by Claude after running an exhaustive multi-agent investigation through the `pick-six-research` skill.

The user is right. I've been treating symptoms, not root causes. This file documents what I missed and why.

---

## TL;DR: The fundamental mistake

I've been fixing the **downstream consequences** of a pick-6 (modal spawning, score crediting, live-sync gating) without ever verifying that **the pick-6 detection at [index.html:1556](index.html#L1556) actually fires in real gameplay.**

Multi-agent re-trace of the engine FSM strongly suggests pick-6 detection **silently fails** because the bridge reads `_._2c1` (priorFsmStage) AFTER the engine has already cascaded through TD-replay-PAT-kickoff states. By the time the bridge's `_1c1` hook sees `pre._2c1`, that field holds `1` (kickoff stage) or similar — NOT `8` (INT). `inferUserDriveEndType(1)` returns `'KICKOFF'`. The check `outcome.type === 'INT' && oppDelta >= 6` is FALSE. **Pick-6 cascade never activates.**

When the cascade doesn't activate:
- `_rb2p_pickSixPatCascadeActive` stays `false`.
- V39 `global._Bk1` getter is dormant.
- The engine's natural PAT modal pops on A's screen (the thrower's screen — wrong device).
- No `PICK6` outcome is shipped to B; a generic `'KICKOFF'` outcome ships instead.
- B's `applyOpponentOutcome` PICK6 branch never runs.
- B never gets the bridge-spawned PAT modal.

What the user actually sees (one likely interpretation of "score on wrong team + PAT appears thrice"):
1. **A's screen pops the engine's natural PAT modal** (no suppression). Modal #1.
2. **A interacts with it.** The engine credits `_Sb1[_._UD]` somewhere — and `_._UD` at that moment may already be flipped to B's team OR it may be A's team depending on cascade timing. Score lands wrong-ish.
3. **Live-sync of A's view streams to B.** B sees A's score state.
4. **More modals fire** because the engine's cascade re-enters PAT-pending state (engineDownNumber=6 stays set across the cascade until `_1c1` clears it). Modals #2 and #3.

I have spent 8 V-bumps patching the consequences (V42 kill dice rolls, V43 same, V47 wrong-direction _UD edit, V48 _0z patch, V50 live-sync gate + cascade hold) without ever instrumenting the detection itself.

---

## My specific stupid mistakes

### Mistake 1: Never instrumented `inferUserDriveEndType`
I assumed `inferUserDriveEndType(prevVy)` returns `'INT'` for a pick-6. I never put a `console.log(prevVy, outcome.type)` in the bridge's `_1c1` hook to check what value it actually returns in real gameplay. If I had, I'd have seen the answer wasn't `'INT'` and the cascade isn't activating. Eight commits ago.

### Mistake 2: Assumed `pre._2c1` captures the play-ending `_Vy`
The bridge does `prevVy = pre.enginePriorFsmStage || pre.engineDriveFsmStage` at [index.html:1520](index.html#L1520). `enginePriorFsmStage` is `m._2c1`, which is set by `_1c1` itself at `retrobowl.js:56457` (`a._2c1 = a._Vy`). I assumed the value captured pre-`_1c1` was the `_Vy` at the play-ending moment.

But `_1c1` fires AFTER the engine's defensive-TD cascade has already advanced `_Vy` through 9 (TD) → 10 (AI play call — gutted in 2P) → 11 (PAT pending) → 1 (kickoff). By the time `_1c1` fires for the post-TD kickoff, `_._Vy` is 1 or 2. AND `_._2c1` from a prior `_1c1` call (if any) is stale.

I never read the engine's _Vy state-machine carefully enough to realize the order.

### Mistake 3: Patched scoring (V48 `n._0z`) without verifying it gets reached
V48 changed `retrobowl.js:55964/55989/55990` to credit `n._0z`. The math is correct IF those lines fire on the device playing the PAT. But if pick-6 detection fails on A, then B never gets the bridge-spawned modal, B never plays the PAT through those code paths, and the V48 patch is irrelevant to what the user is seeing.

I patched a path the user is probably not even hitting.

### Mistake 4: Patched live-sync gate (V50) without verifying cascade flag is ever true
V50 added `_rb2p_pickSixPatCascadeActive === true` checks to the live-sync gate. If the cascade flag is never set in real play, V50 is a no-op. The monotonic `pushWouldRegressScore` check might still help, but the primary gate addition does nothing.

### Mistake 5: Did 3 verification passes against V50 without checking the precondition
The `/pick-six-research verify` I ran traced the timeline ASSUMING pick-6 detection fires. I never set up a scenario where it fails and traced THAT. So the verification confirmed the fix works under the assumption pick-6 is detected — but didn't confirm pick-6 IS detected.

### Mistake 6: Read CLAUDE.md's claim "frame-tight engine-PAT suppressor inside engineCommentaryScriptHook" but never verified it exists
CLAUDE.md says A's device has a "frame-tight suppressor" in `engineCommentaryScriptHook`. My agent investigation found this is **stale doc** — there is no such suppressor in the code. The actual suppression is V39's `_Bk1` getter, which only fires if the cascade flag is set. If detection fails, no suppression. CLAUDE.md is misleading me.

### Mistake 7: Treated each V-bump as a fresh problem instead of building a model
I never wrote down a complete model of the pick-6 flow before V49's PAT.md. I patched, reverted, patched again. Each commit was a guess based on the most recent symptom. There was no consistent mental model, so each fix solved a different imagined problem.

### Mistake 8: Asked the user "did it work?" instead of building a test that doesn't need a human
I have spent dozens of round-trips asking the user to playtest. I should have built a Node-based simulation (like V39's `_rb2p_testEnginePatSuppression()`) that exercises the bridge's `_1c1` hook with a synthetic pre/post pair representing a pick-6, and verifies `inferUserDriveEndType` returns `'INT'`. That would have caught the detection failure in pure logic in ~10 seconds.

---

## All the failure modes I should have considered from the start

### Detection failures
- [F1] `_._2c1` is stale (set by a prior `_1c1` call, not the current one)
- [F2] `_._Vy` has already advanced past `8` by the time `_1c1` fires
- [F3] `_rb2p_opponentScoreAtDriveStart` was never set (e.g. lobby re-join, missed `forceUserOffenseDrive`)
- [F4] The hook returns early at [index.html:1533](index.html#L1533) (`Date.now() - lastOpponentOutcomeApplyMs < 2000`) suppressing detection within 2s of any prior outcome apply
- [F5] The hook returns early at [index.html:1529](index.html#L1529) (`_rb2p_userOutcomeSendInProgress`) — if a prior send is in flight, no detection
- [F6] The engine fires `_1c1` MULTIPLE TIMES during the cascade (INT moment, kickoff moment, etc.). The hook fires multiple times. The gate at line 1526-1527 (`pre.possessing == user && post.possessing != user`) only matches one — but the wrong one might match first.

### Modal-spawn failures
- [M1] Engine's `_hB` case 0 fires on A's screen (suppression failed because cascade flag wasn't set)
- [M2] Engine's `_hB` case 0 fires on B's device (because setting engineDownNumber=6 + post-PICK6 state somehow triggers it via a path I haven't found)
- [M3] Bridge's `_wm` at [index.html:2447](index.html#L2447) fires (the intended modal)
- [M4] `applyOpponentOutcome` fires TWICE because Firebase delivers the outcome twice (different `ts` values from retry logic, clock skew, etc.)
- [M5] The popup-killer's authorized-refs whitelist is empty (V38 safe-mode) — killer bails, engine modal survives
- [M6] The PAT-modal dedup only catches simultaneous duplicates, not sequential. If modal A is dismissed and modal B spawns later, dedup misses it.
- [M7] The engine's commentary FSM re-enters PAT setup (case 17 → _Vy=11 → ???). I never fully mapped what case 11 does in this context.

### Score-credit failures
- [S1] V48 patches `retrobowl.js:55964/55989/55990` to use `n._0z`. Verified `_0z` IS the user's team idx on both devices.
- [S2] BUT if the user is playing the PAT through the ENGINE's natural path (not the bridge's), the credit goes through the OLD code paths — case 0 of `_hB` (TD +6), case 4 (PAT +1 originally to `_UD`, now `_0z`). Whether that ends up on the right team depends on `_UD` at credit time, which depends on whether `_1c1` ran in between.
- [S3] If pick-6 detection succeeds on A's device but B's `applyOpponentOutcome` somehow doesn't run (Firebase delivery failure, race with another outcome), B's screen never sets up for PAT.
- [S4] The live-sync receive gate (V50 patched) only protects if the cascade flag is set. If detection fails, no protection.
- [S5] `_._UD` may be flipped multiple times during the cascade. The credit could land on the right team initially, then get overwritten by a subsequent live-sync push, then get re-credited, etc.

### Wire-protocol failures
- [W1] `PAT_RESULT` outcome type is consumed at [index.html:2321](index.html#L2321) but **never produced anywhere**. B's drive-end outcome ships under `'KICKOFF'` (because `inferUserDriveEndType(1)` returns `'KICKOFF'`). A receives, processes via the generic branch. Works only because the generic branch and the PAT_RESULT branch happen to do the same score mirror.
- [W2] If A's screen pops a PAT modal naturally (M1), A interacts with it. A's score updates via the engine's natural credit. A's drive-end outcome ships (typed `'KICKOFF'` or `'TD'`). B receives, mirrors. Both devices stay in sync via accident.
- [W3] But B never plays a PAT on B's screen. So the "user-played PAT on the scorer's device" invariant is violated. The wrong human is playing the PAT — and they might miss it (giving wrong points).

---

## What the user almost certainly sees in real play

**Most likely scenario:** detection fails (F2 or F6). A's engine pops its own PAT modal on A's screen. A clicks the modal. A plays the PAT scene (the kick or the snap). The engine credits the score via `_hB` case 4 or case 1 branch 2. With V48's `n._0z` patch, the credit goes to A's team. But A is the THROWER, not the SCORER. So the +1 or +2 lands on A's team — the **wrong team**.

Then live-sync to B mirrors this wrong score. B sees the wrong team get the points.

The "PAT appears thrice" might be:
1. Engine's natural modal on A
2. A modal that briefly appears as the engine cascades through PAT states (e.g. case 17 → _Vy=11 → spawn modal again, then dismissed)
3. A duplicate from `_Ak1(_, t, 1)` being called more than once during a pick-6 (if the engine re-enters TD-replay state, which can happen)

OR alternative scenario: detection sometimes succeeds, sometimes fails. When it succeeds, the bridge runs its full flow. When it fails, the engine takes over. The bridge state and engine state diverge. The user sees fragments of both behaviors.

---

## The ACTUAL fix

The fix is NOT another patch downstream. The fix is **verify the detection works and fix it if it doesn't.** Specifically:

### Step 1: Instrument detection
Add a `console.log` at [index.html:1535](index.html#L1535):
```js
var outcome = buildUserDriveEndOutcome(pre, post, prevVy);
console.log('[2P DETECT]',
    'pre._Vy=' + pre.engineDriveFsmStage,
    'pre._2c1=' + pre.enginePriorFsmStage,
    'prevVy=' + prevVy,
    'outcome.type=' + outcome.type,
    'oppNow=' + (RB.engineState() ? RB.engineState().opponentScore : '?'),
    'oppStart=' + window._rb2p_opponentScoreAtDriveStart,
    'oppDelta=' + ((RB.engineState() ? RB.engineState().opponentScore : 0) -
                   (window._rb2p_opponentScoreAtDriveStart || 0)),
    'isPick6=' + (outcome.type === 'INT' &&
                  (RB.engineState() ? RB.engineState().opponentScore : 0) -
                  (window._rb2p_opponentScoreAtDriveStart || 0) >= 6));
```

Throw an INT in playtest. Read the log. Two outcomes:

**(a) `outcome.type === 'INT'` and `oppDelta >= 6`** → detection should fire but isn't. Bug is in `isPick6` evaluation or guards above (e.g. `_userOutcomeSendInProgress`, cooldown).

**(b) `outcome.type !== 'INT'` or `oppDelta < 6`** → detection logic itself is broken. Fix the detection.

### Step 2: Fix detection per step 1's result

**If `prevVy` is `1` (kickoff) instead of `8` (INT):**
Hook the engine EARLIER. Wrap `_Ib1` or the actual play-end handler instead of `_1c1`. Capture `_Vy` BEFORE the engine cascades to kickoff state. Set the pick-6 cascade flag at THAT point, not at `_1c1`.

Or better: hook `_Ak1`. When `_Ak1(_, t, 1)` fires, capture which team got the +6 (read `_._UD` at that moment) and whether it was the user or the opponent. If opponent → pick-6.

**If `oppDelta < 6`:**
Fix `_rb2p_opponentScoreAtDriveStart` to be set on EVERY drive entry, not just `forceUserOffenseDrive` calls.

### Step 3: Verify in Node simulation

Build a non-browser test (`_rb2p_testPickSixDetection`) that:
1. Builds a fake `pre` and `post` engine-snapshot pair for a pick-6.
2. Runs `buildUserDriveEndOutcome(pre, post, prevVy)`.
3. Asserts `outcome.type === 'INT'`.
4. Runs the detection check from line 1556.
5. Asserts `isPick6 === true`.

Run this in Node before ANY further bridge changes. If it fails, the detection is broken and no downstream patch will help.

### Step 4: After detection works, retest the downstream pipeline

Only then do the V39/V42/V43/V48/V50 patches actually become reachable in real play. At that point I can verify their behavior with confidence.

---

## What I will do differently in the future

1. **Verify the precondition before patching the consequence.** If a feature has a chain of gates, instrument each gate first. Confirm which gates are actually being hit in real usage.

2. **Build a programmatic test before guessing.** A 30-line Node simulation could have caught the detection failure in V42. Instead I spent 8 commits guessing.

3. **Read the engine FSM as a state machine, not a collection of switch cases.** `_._Vy` advances through a known sequence on each event. The order matters. I should draw the state diagram before patching.

4. **Don't trust CLAUDE.md or my own past commit messages as authoritative.** Re-read the code. Old comments rot.

5. **When the user reports "it's still broken after N tries," STOP and do a holistic re-trace.** Don't add patch N+1 until I have a NEW theory grounded in evidence, not a refinement of the previous guess.

6. **Track every assumption explicitly.** If I assume `_0z` is the user's team, write that down and verify it. Don't carry assumptions across commits.

---

## The prompt I'd give to fix this

> The 2P pick-6 PAT bug is still broken after V50. Run /pick-six-research and read my stupid mistake.md to understand my prior failure modes. Then:
>
> 1. Add the instrumentation at index.html:1535 described in my stupid mistake.md § "The ACTUAL fix" Step 1. Commit and push as V51.
> 2. Ask me to throw a pick-6 in playtest and paste the `[2P DETECT]` console output.
> 3. Based on the actual `prevVy` and `outcome.type` values, decide whether the detection fails (case b) or succeeds (case a).
> 4. If case (b), implement the detection fix described in § Step 2 ("hook `_Ak1` instead of `_1c1`" is the recommended path — capture which team got the +6 directly from the engine event, not inferred from `_Vy` state at `_1c1` time).
> 5. Before pushing the detection fix, write a Node simulation `_rb2p_testPickSixDetection()` that verifies the new detection returns `isPick6 === true` for a synthetic pick-6 input. Run it. Show me the output.
> 6. Only AFTER the simulation passes, push the V52 detection fix and retest in browser.
>
> Do not patch any other file until detection is verified working. Do not assume V42/V43/V48/V50 are doing anything until you've shown the cascade flag actually goes true in real gameplay.
