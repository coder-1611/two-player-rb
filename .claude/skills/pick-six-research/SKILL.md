---
name: pick-six-research
description: Re-derive or verify the 2P Retro Bowl pick-6 PAT analysis. Use when working on pick-6 scoring, the PAT modal lifecycle, the scoreboard sync flow, or the `_UD` / `_0z` / `global._Bk1` state machine. The skill embeds the canonical timeline (mirroring PAT.md) plus a `verify` subcommand that re-runs exploration against the current code and reports any drift from the embedded reference.
---

# pick-six-research

This skill is the canonical pick-6 reference for the 2P fork of Retro Bowl. Before doing ANY work that touches pick-6, PAT modals, scoreboard, possession (`_UD`), user-team-idx (`_0z`), or the `global._Bk1` source-suppressor — load this skill and read the embedded analysis.

The full long-form reference lives at `/Users/sohamsthitpragya/Retro Bowl/two-player rb/PAT.md`. This skill mirrors the pick-6 section so you can quickly see drift between the doc and current code without leaving the skill context.

## When to use this skill

Trigger this skill (or read it as reference) when:

- The user reports a scoreboard bug during or after a pick-6.
- The user mentions "PAT modal pops twice" / "score on wrong team" / "score disappears."
- You are about to edit `retrobowl.js` near the scoring lines (55300-56010) or near `_hB`, `_Ik1`, `_Ak1`, `_1c1`.
- You are about to edit `index.html` near `hookEngineChangePossessionScript`, `applyOpponentOutcome` (PICK6 branch), the possession clamps, the popup-killer, or the V39 `_Bk1` getter.
- The user says "look at the whole problem" / "you're whack-a-moling" / "do extensive research before fixing."

## When NOT to use this skill

- For non-pick-6 PAT scoring (normal user-scored TD → PAT). The flow is documented in PAT.md but is much simpler.
- For unrelated 2P bridge work (Firebase room setup, lobby UI, match-init).

---

## Subcommands

### `/pick-six-research` (default)
Loads the canonical analysis below. Use as reference before editing.

### `/pick-six-research verify`
Re-runs three parallel Explore agents against the current `retrobowl.js` and `index.html`, then diffs their output against the embedded reference. Reports drift in:

- **Engine line numbers** for the critical scoring functions (`_hB` case 0/1/4, `_Ak1`, `_Ik1`, `_1c1`).
- **Engine line numbers** for the credit lines (55301, 55369, 55441, 55560, 55941, 55947, 55952, 55961, 55964, 55968, 55989, 55990, 56004, 56007, 56571).
- **Bridge function locations** (`hookEngineChangePossessionScript`, `applyOpponentOutcome` PICK6 branch, the possession clamps, cascade-completion watcher, popup-killer, PAT-modal dedup, `_Bk1` getter).
- **V-series engine edits** — confirms the V42/V43/V48 patches are still in place. Flags any reversion.
- **Detection heuristic** at `index.html:1556`. If it changes, flag it (we want to know if someone "fixed" the gap behind this skill's back).

How to run verify (in a Claude Code session):

1. The skill spawns three Explore subagents, one each for: User PAT flow, scoreboard internals, pick-6 logic.
2. Each agent re-derives its section by reading the current code.
3. The skill compares their findings to the canonical analysis below.
4. Reports a drift summary: which line numbers moved, which patches are gone, which new code paths appeared.
5. If drift is found, UPDATE this skill body AND `PAT.md` to reflect the new reality. Do not let the docs go stale.

---

## Canonical analysis (mirror of PAT.md § 2 + § 3 as of V48 / commit `eeb5bcd`)

### A. The pick-6 invariants

1. **In 2P RB the engine never simulates an opponent's offensive drive.** Per CLAUDE.md, the AI-offense path (case 10 of the FSM, `_Ib1` AI play-call branch) is gutted.
2. **Pick-6 is the one exception** — a defensive INT return for TD is still simulated by the engine's defensive AI on the throwing user's device. Both devices need to converge on the resulting score.
3. **The user who scored the pick-6 (the defender) must play the PAT.** No engine-AI PAT, no dice-roll fallback (V42/V43 killed those).
4. **Score crediting uses `n._0z`, not `n._UD`** (V48 patch at `retrobowl.js:55964, 55989, 55990`). `_0z` is invariant on a per-device basis; `_UD` flips with possession and can be in the wrong state at credit time.

### B. Device A timeline (the thrower)

```
T+0      Pass play, INT thrown
T+0+     Defender returns INT for TD on A's engine
T+0+     Engine credits defender (= B's team) +6 via _hB case 0 at retrobowl.js:55369
T+0+     _Ak1(_, t, 1) fires → global._Bk1 = 1, _._kp = 3, replay starts
T+1-3s   Replay plays out
T+3-5s   _i7 calls _Ik1 (_._kp == 3 detected)
T+3-5s   _Ik1 about to call _hB(_, t, global._Bk1) — would pop PAT modal on A (WRONG)
T+3-5s   Bridge _1c1 wrapper at index.html:1518 fired during the cascade
T+3-5s   Pick-6 detected via index.html:1556 (oppDelta >= 6 && outcome.type === 'INT')
T+3-5s   _rb2p_pickSixPatCascadeActive = true (index.html:1589)
T+3-5s   V39 global._Bk1 Object.defineProperty getter now returns 0
T+3-5s   _Ik1 reads global._Bk1 → 0 → routes to _eb1(_, t, 0) instead of _hB(_, t, 1)
T+3-5s   NO ENGINE PAT MODAL on A ✓
T+3-5s   Bridge ships PICK6 outcome to B with { needsPAT: true, scoreUser, scoreOpp }
T+3-30s  A's watchdogs SUSPENDED (cascade flag bypasses index.html:1801 and 1687)
T+30s    Cascade-completion watcher at index.html:1823 checks: 30s elapsed AND possessing == user AND kp == 2
T+30s    If yes, clears cascade flag. Watchdogs resume.
T+30-40s A waits for B's drive-end outcome over Firebase
T+40-50s A receives outcome, mirrors scores, starts next drive
```

### C. Device B timeline (the scorer)

```
T+0-6s   B is in WAIT mode
T+0-6s   Firebase delivers PICK6 outcome from A
T+0-6s   _twoPlayer poll loop drains, calls applyOpponentOutcome(outcome)
T+0-6s   PICK6 branch fires at index.html:2399:
            - Mirror scores via setOpponentScore / setUserScore
            - Set _rb2p_userIsWaitingForOpponent = true ← SEMANTICALLY WRONG (B is about to play)
            - Set _rb2p_pickSixPatCascadeActive = true
            - Set enginePossessingTeamIdx = engineUserTeamIdx (B's team)
            - Set engineDownNumber = 6 (PAT-pending), engineYardsToGo = 2, engineControllerState = 2
            - Call _wm(rawMatch, _Sc2, "", msg, "1 PT", "2 PT", 100367, 100369, ...) to pop PAT modal
            - Diff popups before/after _wm to capture authorized refs into _rb2p_userPatPopupRefs
T+0-6s   PAT modal visible on B's screen

T+6s+    User taps 1pt OR 2pt button on B
T+6s+    1-PT path: _oB → _lB(_, t, 1) → sets _Z21 = 1 → spawn kick scene
T+6s+    2-PT path: _rB → _Lr (dismiss) → _eb1 case 2 (since _t11 == 6) → sets _l61 = 2, _6F = 48 → goal-line snap

T+10s+   User completes the play (kick made / snap into endzone)
T+10s+   1-PT credit at _hB case 4 (retrobowl.js:55989): _Sb1[n._0z] += 1 (V48 patch)
T+10s+   2-PT credit at _hB case 1 branch 2 (retrobowl.js:55964): _Sb1[n._0z] += 2 (V48 patch)

T+10s+   Engine cascade fires _1c1 for post-PAT kickoff
T+10s+   _1c1 flips _UD, sets _t11 = 1, _l61 = 10, _Vy = 2
T+10s+   B's _1c1 hook detects possession-loss → builds drive-end outcome → ships to A
            (outcome.type is whatever inferUserDriveEndType(prevVy) returns — typically 'KICKOFF')
T+10s+   B enters its own wait state for A's next drive
```

### D. Critical code paths to read before changing anything

Engine (`retrobowl.js`):
- `_hB` case 0 at line 55944 — pops PAT modal, sets `_._t11 = 6`
- `_hB` case 1 branch 2 at line 55964 — 2-PT credit (V48: uses `n._0z`)
- `_hB` case 4 at line 55982 — 1-PT/FG credit (V48: uses `n._0z` at lines 55989-55990)
- `_Ak1` at line 57499 — TD-replay start, sets `global._Bk1`
- `_Ik1` at line 57534 — end-of-replay router, reads `global._Bk1`
- `_1c1` at line 56446 — possession flip
- `_eb1` case 2 at line 54940 — 2-PT goal-line state setup
- `_lB` at line 55715 — 1-PT kick scene setup

Bridge (`index.html`):
- Wrapper at line 830-862 — exposes engine fields under friendly names
- `hookEngineChangePossessionScript` at line 1508 — pick-6 detection + outcome ship
- `hookEngineCommentaryScript` at line ~1666 — clamp; bypassed during cascade
- Drive-end stuck watchdog at line 1732
- Possession setInterval clamp at line 1795 — bypassed during cascade
- Cascade-completion watcher at line 1823 (30 s hold per V48)
- Popup-killer at line ~1965
- PAT-modal dedup at line ~2026
- `applyOpponentOutcome` at line 2244, PICK6 branch at line 2399
- `global._Bk1` Object.defineProperty getter at line ~2160
- Live-sync push (500 ms) at line 3014
- Live-sync receive at line 3055

### E. V-series patch checklist (verify these are present)

| Patch | File | Line | Expected content |
| --- | --- | --- | --- |
| V42 (kill 87.5% PAT) | `retrobowl.js` | 55441 | `yyGetBool(0)` (was `yyGetBool(_dq(8))`) |
| V43 (kill 61% 2-PT) | `retrobowl.js` | 55560 | `yyfgreater(99, 60)` (was `yyfgreater(_dq(99), 60)`) |
| V48 (2-PT credit team) | `retrobowl.js` | 55964 | `n._Sb1[_Gt(n._0z)] = yyfplus(n._Sb1[_Gt(n._0z)], 2)` |
| V48 (1-PT credit team) | `retrobowl.js` | 55989 | `n._Sb1[_Gt(n._0z)] = yyfplus(n._Sb1[_Gt(n._0z)], 1)` |
| V48 (FG bonus credit team) | `retrobowl.js` | 55990 | `yyGetBool(n._Z21) || (n._Sb1[_Gt(n._0z)] = yyfplus(n._Sb1[_Gt(n._0z)], 2))` |
| V48 (cascade hold 30s) | `index.html` | ~1841 | `if (elapsedSinceFlagRaised < 30000) return;` |
| V41 (blank PAT commentary) | `LanguageUS.txt` | 116-118 | `comm_stage_PAT1\t\n`, `_PAT2_Missed\t\n`, `_PAT2_Scored\t\n` (empty values after the tab) |
| V43 (blank 2-PT commentary) | `LanguageUS.txt` | 128-130 | `comm_stage_2pt_attempt\t\n`, `_2pt_missed\t\n`, `_2pt_scored\t\n` |

### F. Known fragilities (DOCUMENTED — DO NOT FIX without consulting PAT.md § 3.4-3.5)

1. **`_rb2p_userIsWaitingForOpponent = true` set on B while B is actively playing.** Misleads the possession clamps. V48's `_0z` credit fix sidesteps this for scoring, but the live-sync gate still uses `_UD` so an opponent's stale view can overwrite.
2. **Cascade hold is time-based (30 s).** Backgrounded tabs throttle timers. Slow plays exceed the window.
3. **Live-sync gate not V48-patched.** Uses `_UD !== _0z`. Can flip to "user on defense" while user is actively playing the PAT.
4. **`'PAT_RESULT'` outcome type consumed but never produced.** B's post-PAT drive-end ships under `'KICKOFF'` (or whatever `inferUserDriveEndType` returns).
5. **Popup-killer whitelist depends on synchronous `_wm` spawn.** If deferred, whitelist is empty → V38 safe-mode → no kills → duplicate modal survives.
6. **Pick-6 detection at `index.html:1556` is heuristic (`outcome.type === 'INT' && oppDelta >= 6`).** False negatives if `_._2c1` routes through a non-`_Vy=8` state for INT-return-TD. False positives if `opponentScoreAtDriveStart` is stale. Never verifies against engine's own scoring event.

### G. Anti-patterns (DO NOT REPEAT)

- **V45's continuous `_UD` clamp during PAT.** Setting `enginePossessingTeamIdx = engineUserTeamIdx` every 100 ms while `engineDownNumber === 6` caused the engine to re-enter PAT setup repeatedly, spawning extra modals. Reverted in V46.
- **V47's `_UD` direct credit for 2-PT.** Replaced `opposite of _UD` with `_UD` at line 55964 without analyzing what `_UD` actually was at credit time. Just flipped which timing regime broke (fast 2-PTs got it right, slow 2-PTs got it wrong instead of vice versa). Superseded by V48.
- **`patSimulate` and the HTML PAT modal (`rb-pick6-pat-modal`).** Pre-V31 approach using 87.5/61.6% dice rolls to auto-credit. Removed in V32. Don't reintroduce.
- **Bridge auto-credit fallback for missing `scoreUser`.** Pre-V40 code at `index.html:2386` added `+7` to opponent for any TD outcome without `scoreUser`. Removed in V40. Don't reintroduce.

---

## How to run `/pick-six-research verify`

1. Spawn three parallel Explore subagents with prompts:
   - **Agent 1 (User PAT flow):** "Trace the User-controlled PAT (1-PT and 2-PT) flow in retrobowl.js + index.html. List every function and line number for the TD-replay cascade, PAT modal pop, button click, played-out scene, and credit. Compare to the embedded analysis in `.claude/skills/pick-six-research/SKILL.md` section C and report any divergence."
   - **Agent 2 (Scoreboard internals):** "Map every read and write to `_._Sb1` in retrobowl.js. List all credit lines with their team index reference (`_UD` vs `_0z` vs opposite). Compare to the V-series patch checklist in `.claude/skills/pick-six-research/SKILL.md` section E and flag any patch that's missing or reverted."
   - **Agent 3 (Pick-6 logic):** "Trace the pick-6 detection and handling code in index.html. Verify `hookEngineChangePossessionScript`, `applyOpponentOutcome` PICK6 branch, the V39 `global._Bk1` getter, the cascade-completion watcher, the possession clamps. Compare to the embedded analysis in `.claude/skills/pick-six-research/SKILL.md` section B and D. Report line-number drift."

2. Aggregate the three reports. For each drift item, output: `OLD: <file>:<line> — <old code>` / `NEW: <file>:<line> — <new code>` / `IMPACT: <which scenarios this affects>`.

3. If drift is found, present a diff between the embedded analysis and reality. Ask the user whether to update the skill body + `PAT.md`.

4. If no drift, report `"✓ V48 analysis is current — no drift detected."`

---

## Maintenance

- Bump the version reference in this skill body (currently `V48 / commit eeb5bcd`) whenever PAT.md is updated.
- If a future V-bump changes any line number or patch listed in section E, update this skill BEFORE merging the change.
- If a new pick-6 sub-scenario appears (defensive fumble return, kickoff return, etc.), add it to PAT.md first, then add a section here referencing it.
- This skill is project-local (`.claude/skills/pick-six-research/`). It does not load outside this repo. That's intentional — the analysis depends on file paths and line numbers specific to this project.

---

## Failure analysis (added at user request after V50 didn't fix the bug)

See [`/Users/sohamsthitpragya/Retro Bowl/two-player rb/my stupid mistake.md`](../../../my%20stupid%20mistake.md) for the full post-mortem. Summary of what every prior session missed:

### Why ~20 versions of patches have failed

The most likely root cause is **pick-6 detection at [index.html:1556](../../../index.html#L1556) silently never fires in real gameplay**. The check is:

```js
var isPick6 = (outcome.type === 'INT' && oppDelta >= 6);
```

- `outcome.type` comes from `inferUserDriveEndType(prevVy)` at [index.html:1464-1472](../../../index.html#L1464).
- `prevVy` comes from `pre.enginePriorFsmStage || pre.engineDriveFsmStage` at [index.html:1520](../../../index.html#L1520).
- `enginePriorFsmStage` is `m._2c1`. The engine's `_1c1` at [retrobowl.js:56457](../../../retrobowl.js#L56457) sets `a._2c1 = a._Vy` — but by the time `_1c1` fires for the post-defensive-TD kickoff, `_._Vy` has already advanced from `8` (INT) or `9` (TD) through `10`/`11` to `1` (kickoff).
- So `prevVy` at hook time is likely `1`, not `8`. `inferUserDriveEndType(1)` returns `'KICKOFF'`. `outcome.type !== 'INT'`. `isPick6 === false`.

Consequence: the entire pick-6 cascade machinery (V39 `_Bk1` suppressor, popup-killer, dedup, V48 score patches, V50 live-sync gate) **never activates in actual play**. Every fix from V39 onward has been patching code paths the user is not hitting.

What the user actually sees:
1. The engine's natural PAT modal pops on **A's screen** (the thrower, the wrong device) because no suppression armed.
2. A interacts with it. The PAT scene plays on A's device. Engine credits the +1 or +2 — but A is the thrower, so the credit lands on A's team. **Wrong team gets the points.**
3. Live-sync streams this state to B.
4. Multiple modals may appear due to engine cascade re-entry, `_Ak1(_, t, 1)` being called more than once, popup-killer being dormant.

### What every prior V-bump assumed but never verified

| Assumption | Real status |
| --- | --- |
| Pick-6 detection at line 1556 fires reliably | UNVERIFIED. Very likely fails because `_._2c1` reads as `1` (kickoff), not `8` (INT). |
| `_rb2p_pickSixPatCascadeActive` actually goes `true` during real play | UNVERIFIED. There is no console-log, no test, no telemetry confirming this. |
| The V48 patches at `retrobowl.js:55964/55989/55990` get executed during the real PAT flow | UNVERIFIED. If the bridge never pops the modal on B, B never plays the PAT through those code paths. The credits happen via the engine's natural flow on A — different code paths. |
| The V50 live-sync gate's cascade check protects the score | UNVERIFIED. If the cascade flag is never `true`, the protection is a no-op. The monotonic check (`pushWouldRegressScore`) is the only V50 piece that runs unconditionally. |
| CLAUDE.md's "frame-tight engine-PAT suppressor inside `engineCommentaryScriptHook`" exists | FALSE. Stale doc. No such suppressor in the code. Actual suppression is V39 `_Bk1` getter, which depends on the cascade flag being set. |

### Anti-patterns the next session should NOT repeat

- Patching a downstream consequence (credit, modal, gate) without first proving the upstream gate (detection) fires.
- Trusting the prior commit's mental model. The model has been wrong for 20 commits — re-derive from code.
- Asking the user to playtest before adding instrumentation. Instrument first, then ask.
- Treating CLAUDE.md and old commit messages as authoritative. Verify from source.
- Running `verify` against the embedded analysis when the embedded analysis itself has unverified preconditions.

---

## **PROMPT TO FIX THIS** (copy-paste to next session)

This prompt is designed to drive a full fix end-to-end without asking the user to playtest before the fix lands. Detection failure is verified via Node simulation against the engine source, the fix is implemented and Node-verified, then pushed. The user only playtests at the END to confirm the deployed build behaves correctly.

```
You are fixing the 2P Retro Bowl pick-6 PAT bug that has been broken across
V39–V50. Before touching anything, read these in order:

  1. /Users/sohamsthitpragya/Retro Bowl/two-player rb/PAT.md
  2. /Users/sohamsthitpragya/Retro Bowl/two-player rb/my stupid mistake.md
  3. /Users/sohamsthitpragya/Retro Bowl/two-player rb/.claude/skills/pick-six-research/SKILL.md

Hypothesis to test first: pick-6 detection at index.html:1556 never fires
because pre._2c1 reads as 1 (kickoff) or 2 (setup), not 8 (INT), by the time
_1c1's wrapper runs. If true, the cascade flag never goes true and every
downstream V-patch is dormant.

================================================================================
STEP 1 — VERIFY HYPOTHESIS WITH NODE SIMULATION (no playtest needed)
================================================================================

Write /Users/sohamsthitpragya/Retro Bowl/two-player rb/test_detection.js as a
standalone Node script that:

  a. Reads retrobowl.js line-by-line and finds every assignment to _._Vy in
     the defensive-TD path (search around lines 55363–55400 for "case 16",
     and around 56446–56463 for _1c1).
  b. Reconstructs the FSM transition sequence the engine walks through for a
     defensive INT-return-TD: list each _Vy value in order, with the line that
     sets it.
  c. Identifies which _Vy value is current at the moment _1c1 fires for the
     post-defensive-TD kickoff.
  d. Reads index.html's inferUserDriveEndType (around line 1464) and maps
     that _Vy value to the resulting outcome.type string.
  e. Reads index.html's pick-6 check (around line 1556) and evaluates
     `outcome.type === 'INT' && oppDelta >= 6` for the predicted state.
  f. Prints a verdict: "DETECTION_PROBABLY_FIRES" or "DETECTION_PROBABLY_FAILS"
     with a one-line reason.

Run the script with `node test_detection.js`. Paste the verdict line in your
response.

If verdict is DETECTION_PROBABLY_FIRES, jump to STEP 5 (downstream investigation).
If verdict is DETECTION_PROBABLY_FAILS, continue to STEP 2.

================================================================================
STEP 2 — IMPLEMENT THE FIX (_Ak1 hook instead of _1c1 inference)
================================================================================

The reliable detection signal is the engine event _Ak1(_, t, 1) firing AND the
scoring team being the opponent. _Ak1 sets global._Bk1 = 1 ONLY when a TD has
just been scored; combined with the team-identity check, it is a verified
engine event, not a state-inference heuristic.

Implementation:

  a. Hook _Ak1 via the script registry. The bridge already has the pattern in
     hookEngineChangePossessionScript at index.html:1508. Mirror it for _Ak1:
     find the script index for _Ak1 (gml_Script__Ak1 or similar — use
     RB.findEngineScriptIndex with multiple name guesses), wrap the function,
     and on every call where arguments[2] === 1, record:

         window._rb2p_lastTdReplayMs = Date.now();
         window._rb2p_lastTdScoringTeamIdx = engineMatch.enginePossessingTeamIdx;

     (capture the team idx BEFORE the wrapped call mutates state — _Ak1's
     own body sets global._Bk1 = arguments[2] but does not flip _UD).

  b. In the existing _1c1 hook at index.html ~1556, REPLACE the isPick6
     heuristic with:

         var isPick6 = (
             window._rb2p_lastTdReplayMs &&
             (Date.now() - window._rb2p_lastTdReplayMs) < 8000 &&
             window._rb2p_lastTdScoringTeamIdx !== undefined &&
             window._rb2p_lastTdScoringTeamIdx !== pre.engineUserTeamIdx
         );

     This means: within the last 8s, _Ak1(_, t, 1) fired AND the team in
     possession at that moment was the OPPONENT (i.e. defensive TD by our
     opponent's team — pick-6). The heuristic-INT check and oppDelta>=6 check
     are removed.

  c. Keep the V39 _Bk1 suppressor, popup-killer, dedup, V48 score patches,
     and V50 live-sync gate. They become reachable now that detection works.

  d. After applying isPick6, clear window._rb2p_lastTdReplayMs to prevent the
     same _Ak1 firing from re-triggering detection on a subsequent _1c1 call
     in the same cascade.

================================================================================
STEP 3 — VERIFY THE FIX WITH NODE SIMULATION
================================================================================

Append to test_detection.js a second test:

  a. Stub a minimal mock for window, RB.engineState, snapshotEngineMatch.
  b. Simulate the sequence:
       - call the _Ak1 wrapper with arguments[2] = 1, and a mock engineState
         where enginePossessingTeamIdx = 0 (opponent), engineUserTeamIdx = 1.
       - immediately call the _1c1 wrapper with pre.enginePossessingTeamIdx = 1
         (user just lost possession), post.enginePossessingTeamIdx = 0.
       - assert isPick6 === true.
  c. Run a negative case: same simulation, but enginePossessingTeamIdx = 1
     (user's own team scored the TD — normal user TD, not pick-6).
       - assert isPick6 === false.
  d. Run a stale case: _Ak1 fired 20s ago, then _1c1 now. assert isPick6 === false.

Run `node test_detection.js`. Paste BOTH the original verdict AND the new
positive/negative/stale test results. All three must pass before proceeding.

================================================================================
STEP 4 — PUSH AS V52
================================================================================

  a. Apply the index.html changes from STEP 2.
  b. Bump the V-label in the lobby prompt per CLAUDE.md (V51 → V52).
  c. Syntax-check via the same Node script you've used in prior commits.
  d. git add index.html test_detection.js .claude/skills/pick-six-research/SKILL.md
  e. git commit with a message describing: "V52: hook _Ak1 for verified pick-6
     detection; remove _2c1-inference heuristic; Node simulation 3/3 pass."
  f. git push origin main.
  g. State the commit hash and that Vercel will deploy in ~30s.

================================================================================
STEP 5 — DOWNSTREAM INVESTIGATION (only if STEP 1 said DETECTION_PROBABLY_FIRES)
================================================================================

If the Node simulation in STEP 1 said detection should work, the bug is
elsewhere. In that case:

  a. Add temporary console.log instrumentation as described in the V51
     instructions in my stupid mistake.md (the [2P DETECT] block).
  b. Push as V52 with ONLY the instrumentation.
  c. Ask the user to throw a real pick-6 and paste the [2P DETECT] line.
  d. Diagnose based on which guard is returning early (_userOutcomeSendInProgress,
     lastOpponentOutcomeApplyMs cooldown, etc.).
  e. Fix the specific guard, push as V53.

================================================================================
STEP 6 — USER PLAYTEST CONFIRMATION (after fix is pushed)
================================================================================

Once V52 is pushed and Vercel deployed:

  a. Tell the user: "V52 deployed. Throw a pick-6 and try the 2-PT. Paste
     `_rb2p_dumpState()` from the console after the PAT scene completes."
  b. Verify:
       - flags.pickSixPatCascadeActive cycle: should go true during PAT, then
         clear when engineDownNumber transitions out of 6.
       - engineMatch.scoreboard: the scoring team (user on the device that
         played the PAT) should have +1 or +2.
       - patDedupKills counter: should be 0 or 1 (not 2+).
       - No console errors.
  c. If anything is wrong, do not patch blindly — re-run /pick-six-research
     verify, find drift, and only THEN patch. No more whack-a-mole.

================================================================================
RULES — DO NOT VIOLATE
================================================================================

- Do not edit retrobowl.js in STEP 2 or STEP 4 — the fix is bridge-only.
- Do not skip the Node simulation in STEP 3. The whole point of this prompt is
  to verify the fix before the user has to playtest.
- Do not assume anything from the V42–V50 patches works in real play until the
  cascade flag has been observed going `true` (the Node simulation in STEP 3
  proves the flag transition; the playtest in STEP 6 confirms it in real
  gameplay).
- If the Node simulation fails, debug the simulation and the fix together.
  Do not push code whose simulation didn't pass.
- After V52 is pushed, update PAT.md § 3.5 and this skill's § E patch checklist
  to reflect the new _Ak1-based detection. Stale docs caused half the prior
  failures.

End of prompt. Execute steps in order. Show your work at each step.
```

End of skill. The post-mortem in `my stupid mistake.md` is the full story; this prompt is the operational fix path.
