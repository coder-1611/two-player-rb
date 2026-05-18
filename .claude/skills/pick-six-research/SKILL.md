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
