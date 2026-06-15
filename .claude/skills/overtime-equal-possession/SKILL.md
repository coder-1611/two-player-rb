---
name: overtime-equal-possession
description: Step-by-step conversion guide to turn the 2P Retro Bowl overtime from its current "ends on the first touchdown" behavior into TRUE equal-possession OT (each team gets an equal number of possessions; leader after equal possessions wins; tie → another round; defensive-TD walk-off). Use ONLY when the user explicitly asks to make OT equal-possession. Documents the current state (V109–V118), the EXACT remaining gap and why it still ends on one TD, the ordered fix plan, and how to verify. Pairs with the `overtime-research` skill (the deep engine/bridge code map).
---

# overtime-equal-possession

A conversion playbook. The 2P fork's OT currently behaves like **sudden death — the game ends on the first touchdown.** The user wants **equal-possession OT**. This skill is the plan to get there. It assumes the scaffolding already built across V109–V118 is in place (most of it is — the gap is narrow).

> **Load the `overtime-research` skill alongside this one.** That skill has the canonical engine line map (`_Ib1` cases 19/20/24/25, `_1d1`, the `_Vy`/`_Wy` setters) and the bridge touchpoint map. This skill is the *action plan*; that one is the *reference*.

## Target behavior (the user's rules, verbatim)
1. NOT sudden death. **PATs matter.**
2. Each team gets an **equal number of possessions**. Coin-flip winner goes first; the other team always gets a matching possession to answer.
3. After both teams finish the SAME number of possessions, **whoever leads wins**; a tie → another round (repeat).
4. **Walk-off:** a defensive TD (pick-6 / fumble-6) ends it immediately.
5. The 2P FINAL stats page shows on BOTH devices (never the engine's season flow).

---

## Current state — what's ALREADY built (do NOT rebuild these)

All in `index.html`, gated on `window._rb2p_inOvertime`:

- **Coin flip + role-based kickoff** (V62/V112): `_rb2p_requestOtKickoff` writes `ot/p{period}={receiver}`; `applyOtKickoff(receiver, role)` decides the receiver by **Firebase role** (not `engineUserTeamIdx`), runs `forceUserOffenseDrive` + the `_rb2p_otHoldKp2` hold-loop so the receiver actually gets a live drive.
- **Stale-OT guard** (V118): the OT subscription ignores/purges `ot/p{period}` entries with a missing or >60 s-old `ts` (a dead session's coin flip was hijacking fresh matches).
- **Possession accounting** (V109/V111): `_rb2p_otMyPoss` (offense→wait edge) and `_rb2p_otOppPoss` (in `applyOpponentOutcome`); `_rb2p_otWasWaiting` re-baselined in `applyOtKickoff`.
- **Round evaluation** (V109): `_rb2p_otCheckRoundEnd` — game over when `myPoss===oppPoss>0` and the score differs; tie continues.
- **Walk-off** (V109): `_rb2p_otWalkoffDefensiveTd` hooked at the PICK6 send + receive.
- **Engine game-over suppression** (V115/V116): the `_Ib1` clamp wrapper parks `_Vy` 12/18/24 → 4; **`window._1d1` (s_end_match) is wrapped and SWALLOWED during OT** (verified: `_1d1` is a reassignable global whose bare internal callers resolve the new value).
- **Single-OT-period pin** (V117): per-frame `_Ib1` wrapper + 300 ms coordinator clamp `_Wy` ≤ 5 and keep the clock ≥ 5:00 on BOTH devices (stops `@quarter_6`, the period loop, and the clock-0 freeze).
- **FINAL on both** (V107/V113): `reportGameOver` publishes `final/{role}`; `endGameFromOpponentDeclaration` ends the other device; the native-game-over safety net forces the FINAL if the engine still tears down the match.

**So the equal-possession machinery exists.** The remaining problem is narrow: the game still ends on the first OT TD.

---

## THE GAP — why it still ends on one touchdown (diagnose FIRST)

Intended flow when the FIRST possessor (say A) scores a TD:
`A TD+PAT → engine wants game-over → _1d1 swallowed (V116) → parked Vy=4 → drive-end watchdog ships the TD outcome via _1c1 → A waits → B receives → B gets its answering possession → after equal possessions, round-eval decides.`

If the game still ends on A's TD, ONE of these broke. **Diagnose with the console on BOTH devices** (the logs are tagged `[2P OT]`):

1. **Did `_1d1` actually get blocked?** Look for `blocked engine _1d1(…) native game-over`. If you instead see `engine ended the game natively — forcing 2P FINAL` (the V113 safety net), the engine left `rm_match` through a path that did NOT go through the wrapped `_1d1`. → The engine has another exit (e.g. a direct `_Hj(14)` room change, or a different `s_end_match`-like call). Find it in `retrobowl.js` near the OT scoring/`is_quarter_over` path and the `_Hj(` calls, and block/redirect it too (search `_Hj(` and `_1d1(`; confirm there isn't a second end-match entry point).
2. **Did the TD outcome ship?** After the TD look for `[2P] drive stuck at vyStage=4 … forcing end as Vy=9` (TD) and a `[2P send] {type:'TD'…}`. If absent, the drive-end watchdog didn't fire from the Vy=4 park — check its guards (the `_rb2p_quarterResumePending` keep-path must NOT swallow OT; the apply-cooldown/`userOutcomeSendInProgress` guards; that `userHasBall && !waiting` still holds right after the TD). The scoring device must SEND so the opponent gets the ball.
3. **Did B get the answering possession?** On B, look for `applyOpponentOutcome` + `[2P OT] opponent possession ended — my=… opp=…` then B taking the ball. If B never receives, it's a send/Firebase issue (step 2). If B receives but the round-eval fires immediately, the possession counts are wrong (see step 4).
4. **Did the round-eval end too early?** `_rb2p_otCheckRoundEnd` must require `myPoss===oppPoss`. After A's first TD the counts should be A:`my=1,opp=0` / B:`my=0,opp=1` — UNEQUAL → must NOT end. If it ended, the counters are miscounting (re-check the offense→wait edge baseline in `applyOtKickoff`, and that the PAT/`_1c1` send doesn't double-increment).

> Most likely culprit (test this first): **#1 — a second engine exit path that bypasses the wrapped `_1d1`.** V116 proved the wrapped `_1d1` is swallowed, yet the field reports still end, and the V113 safety-net log fired — which means the engine reached the season flow some other way. Confirm by reading the console: blocked-`_1d1` vs native-ended.

---

## Conversion plan (ordered; stop when OT obeys the rules)

**Step 0 — Reproduce + read the logs (both devices).** Use `timelapser.js` to reach the end of regulation tied, force OT, score a TD on the receiver, and capture which of the 4 gap-paths above failed. **Also dump `rooms/{code}` via REST** (`curl <db>/rooms/{code}.json`) to see `live`/`ot`/`outcomes` cross-device. Do NOT write code before this — every prior OT regression came from guessing the path.

**Step 1 — Close the engine's REAL exit (likely the only fix needed).** From Step 0, if the native end fires despite the `_1d1` hook, find the bypass in `retrobowl.js`:
- Search `_1d1(` and `_Hj(` and `is_quarter_over` / `s_end_match` near the OT scoring path.
- If there's a direct room change or a second end-match call reached after an OT score, wrap/suppress it during `_rb2p_inOvertime` the same way `_1d1` is wrapped (reassign the global if it's a global; else intercept the `_Vy` stage that leads to it in the `_Ib1` wrapper).
- Goal: after an OT TD+PAT the engine must NOT leave `rm_match`; it must come to rest so the drive-end watchdog ships the hand-off.

**Step 2 — Guarantee the hand-off after an OT score.** Ensure the scoring device SENDS the TD outcome (so the opponent gets the answering possession). If the drive-end watchdog's Vy=4 path is unreliable in OT, add an explicit OT hand-off: when `_rb2p_inOvertime` and this device just scored (score delta ≥ 1 since drive start) and the engine is parked, call the `_1c1` send path directly with the correct outcome type (TD/FG), set `userIsWaitingForOpponent=true`, and let `applyOpponentOutcome` on the other device give them the ball.

**Step 3 — Verify the round-eval timing.** Confirm `_rb2p_otCheckRoundEnd` only ends when `myPoss===oppPoss>0` and the score differs. Walk the counts through: A-first-TD (no end) → B answers (eval) → tie → R2. Add a one-line log of `my/opp/score` at every check.

**Step 4 — Walk-off + PATs.** Confirm a pick-6/fumble-6 still ends immediately (`_rb2p_otWalkoffDefensiveTd`) and that a normal OT TD plays its PAT (PATs matter) before the hand-off, so the synced score is final.

**Step 5 — Multi-round.** After a tied round, the coin-flip winner starts the next round (current behavior — the natural hand-off gives them the ball). If alternating-first is wanted, manufacture the hand-off to the other team after a tied round instead.

---

## Verification (2 devices — headless can only prove pieces)
1. Receiver scores a TD → game does NOT end; console shows `blocked engine _1d1` (NOT `engine ended … natively`); the other team gets the ball.
2. Both teams score → another OT round (label stays "OT", `_Wy` pinned 5).
3. Leader after equal possessions → 2P FINAL on BOTH screens, correct winner.
4. Pick-6/fumble-6 → instant walk-off, defender wins, FINAL on both.
5. No "X win the Retro Bowl" season screen ever; no `@quarter_6`; no loop; no WAIT-hang.
6. Reused/idle room → stale `ot` is ignored (`[2P OT] ignoring STALE pX`).

## Headless harness (already exists in /tmp/rbverify, recreate if gone)
- `ot_kickoff_test.js` — receiver gets a live drive from the OT-start park.
- `end_match_hook_test.js` — `_1d1` swallowed during OT (still STATE_MATCH).
- `ot_pin_test.js` — `_Wy` forced 6 / clock 0 clamps back to 5 / 9:00.
- A round-logic simulation (TD/FG/2pt/scoreless/FG-then-TD) — pure JS, in the V109 commit notes.

## To REVERT to plain sudden death (if the user changes their mind)
Make the game-over detector own OT again: drop the `if (q>=5 && _rb2p_inOvertime) return;` hands-off line, restore the score-differs end; and either remove the `_1d1` OT-swallow or leave it (the bridge's reportGameOver still shows the FINAL). The `_Wy`-pin/clock-keep can stay (harmless) or be removed.
