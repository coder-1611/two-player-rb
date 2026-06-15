---
name: overtime-research
description: Canonical reference for how overtime works in the 2P Retro Bowl fork — the engine's NATIVE timed-OT + native game-over (retrobowl.js) vs. the bridge's equal-possession OT (index.html V62/V109–V113). Use before ANY work on overtime, the OT coin flip, OT possession routing, the "tied → OT" trigger, the engine's `_1d1` (s_end_match) native game-over / season flow leaking through, or making OT obey the user's equal-possession rules. Embeds the engine line map, the bridge touchpoint map, what must be removed/overridden, and the fix plan.
---

# overtime-research

The canonical OT reference for the 2P fork. Load this before touching overtime in either file. The hard truth this skill exists to capture:

> **Retro Bowl's engine has its OWN overtime AND its own native game-over (`_1d1` = `s_end_match` → the "X win the Retro Bowl" season flow). The bridge's equal-possession OT is layered ON TOP and is constantly fighting the engine. Until the engine's native OT-end + native game-over are fully neutralized in 2P, OT will keep leaking the season screen, hanging one device, or ending before both teams get an equal possession.**

The user's desired OT rules (the target behavior):

1. **NOT sudden death. PATs matter.**
2. **Each team gets an equal number of possessions.** Coin-flip winner goes first; the other team always gets a matching possession to answer.
3. After both teams have finished the SAME number of possessions, **whoever leads wins**; a tie starts another round (repeat until someone leads after equal possessions).
4. **Walk-off:** a defensive TD (pick-6 / fumble-6) ends it immediately — the defending team takes the lead and the offense can't answer in that possession.
5. The **2P FINAL stats page must show on BOTH devices** at game end — never the engine's native season flow.

---

## When to use this skill

- The user reports OT freezing, deadlocking on WAITING, ending too early, ending in the wrong place, or the season screen ("X win the Retro Bowl" / PLAY 2P menu) showing instead of the 2P FINAL.
- You are about to edit anything matching `_rb2p_ot*` / `_rb2p_inOvertime` in `index.html`, or the OT coin-flip / `applyOtKickoff` / OT subscription.
- You are about to touch `retrobowl.js` near the `_Ib1` FSM cases 19/20/24/25 (≈55456–55590), `_1d1` (56054), or the `_Vy` end-game setters (55276, 55627–55628, 56030).
- The user says "make OT work with my rules" / "stats page should show for both."

## When NOT to use this skill

- Regulation possession/score sync that isn't OT-specific (that's the normal 2P flow).
- Pick-6 PAT mechanics in regulation — use `pick-six-research`. (OT only *reuses* the PICK6 path for the walk-off; the PAT cascade itself is documented there.)

---

## PART 1 — How the ENGINE's overtime works (retrobowl.js)

The engine drives all match flow through `_Ib1` (`s_update_commentary`, the FSM at ≈55137+). Each tick it switches on a case index `e` derived from `_._Vy` (the drive/commentary stage). The OT-relevant cases:

### The engine's OT model is a TIMED PERIOD, not sudden death
Overtime is just **quarter 5** (`_._Wy == 5`). The engine plays a full OT quarter on the clock and decides the winner at the **end of the period**, not on the first score. (A blowout mercy rule and a clock-<60s trigger can end it during play — see below.)

### Key state
- `_._Wy` — quarter number. 1–4 regulation; **5 = OT period 1; 6 = "OT period over, evaluate"**.
- `_._Vy` — drive/commentary stage (maps to `_Ib1` case `e`). 13 = between-quarters park; **18/24 = overtime-over → game-over eval**; 12 = end-of-quarter trigger.
- `_._Sb1[idx]` — scoreboard array, indexed by team slot. `_._0z` = this device's team slot; `_._0z?0:1` = opponent slot.
- `_jj(_,t,64)._cn` vs `._Lo` — the engine's **OT-replay budget**. `_cn > _Lo` ⇒ another OT is allowed; otherwise a tie is declared.
- `_jj(_,t,64)._Ws` — quarter length field; OT clock = `2 + _Ws` min (clamped 2..3 via `_Ko(2+_Ws,2,3)`).

### `_Ib1` case 19 — END OF QUARTER (retrobowl.js ≈55456)
- Sets the "end of quarter N" banner; **if `_Wy==4` (or `_Wy>=4` with the OT-budget condition) AND the scoreboard is tied → banner = `comm_stage_overtime`** (line 55459). This is the engine's "we're going to OT" detection.
- Sets `_._Vy = 13` (between-quarters park), records the quarter's score into `_Et`/`_Ht`, then **increments `_._Wy`** (line 55499).
- Recomputes the period clock length `K = _Ko(2 + _Ws, 2, 3)`; for `_Wy==3` and `_Wy==5` resets timeout/`_5F` bookkeeping (55500–55505).

### `_Ib1` case 20 — QUARTER RESUME / OT START + OT-END EVAL (retrobowl.js ≈55509)
Reached when the `_Vy=13` park is resumed (the `e=20` step). Resets the clock to `2+_Ws` for object-71 instances, then switches on the quarter being entered:
- **Wy 2 or 4** → `_Vy=_0d1`, resume play (keep possession).
- **Wy 3 (HALFTIME)** → `_Vy=1`, flip possession `_._UD = _.__y ? 0 : 1`.
- **Wy 5 (OT START)** → if leader exists `_1d1` win/loss; else (tied) `_Vy=1`, **flip possession `_._UD = _._0z ? 0 : 1`** (+ a `_2t`/`_dq(2)` nuance), `_Nb1=0`. **This possession flip is computed RELATIVE TO EACH DEVICE'S OWN TEAM, so the two devices DISAGREE about who received → the original V62 deadlock.**
- **Wy 6 (OT PERIOD OVER, line 55544)** → `_1d1(_, t, 1)` if this device leads, `_1d1(_, t, -1)` if it trails, `_1d1(_, t, 0)` (TIE) if `!(_cn>_Lo)`, else `_._Wy=5` and resume (another OT).

> NOTE: the bridge's V101 comment says the `_Vy=13 → e=20` resume "never fires in this build" (the poki-commercial commentary callback that would re-enter `_Ib1` is gutted). That is why the bridge hand-resumes quarters 2–4 itself. But the engine still reaches game-over through cases 24/25 below.

### `_Ib1` case 24 — OVERTIME OVER banner (retrobowl.js ≈55573)
`comm_stage_overtime_over`, sets `_._Vy = 18`. `_Vy=18` maps to the game-over eval (case 25).

### `_Ib1` case 25 — GAME-OVER EVALUATION (retrobowl.js ≈55579) — **the path that actually fires in this build**
Identical to case 20's Wy-6 branch: leader → `_1d1(win/loss)`; tie + no budget → `_1d1(0)`; else `_._Wy=5` + resume (another OT).

### `_1d1` = `s_end_match` (retrobowl.js 56054) — THE NATIVE GAME-OVER
Records the final score onto object 64 (`_oN`), fires achievements, then transitions out of `rm_match` into the **season/news flow** ("X win the Retro Bowl", PLAY 2P menu). **This is what leaks onto the screen when the bridge fails to intercept.** Argument: `1`=win, `-1`=loss, `0`=tie. Called ONLY from cases 20/25 (OT eval), plus practice mode (66331) and the force-quit button (56578) which are irrelevant to 2P play.

### What SETS `_Vy` into the end-game stages (so you can intercept upstream)
- **56030: `_._Vy = 12`** — clock-expiry handler → routes to case 19 (end of quarter).
- **55627–55628:** during play resolution, when `_Wy==4` with `i>7` conditions, or `_k61(_,t,60)` (≈ clock under 60s) with `0<i<9` → **`_._Vy = 24`** (overtime-over → game over). *This is the realistic OT-end trigger.*
- **55276:** blowout/mercy — `_Wy>2 && _6F>-35 && userScore > oppScore+14` → `_._Vy = 24` (early end).
- **55459 (case 19):** the tied-at-Q4-end detection that flips the banner to `comm_stage_overtime`.

---

## PART 2 — How the BRIDGE's overtime works right now (index.html)

The bridge layers an equal-possession system on top, coordinated over Firebase. Current touchpoints (line numbers drift — re-grep `_rb2p_ot`, `_rb2p_inOvertime`, `applyOtKickoff`):

### State (window-scoped)
- `_rb2p_inOvertime` — true once regulation ends tied. Gates ALL bridge OT logic.
- `_rb2p_otMyPoss` / `_rb2p_otOppPoss` — possessions each side has FINISHED in OT.
- `_rb2p_otWasWaiting` — previous waiting state, for the possession-edge tracker.
- `_rb2p_lastOtBoxScore` — box score cached each OT tick for the native-game-over safety net (V113).
- `_rb2p_myFirebaseRole` — authoritative Firebase role, stashed at launch (V112).

### The OT coordinator (≈5345, the `setInterval` after the game-over detector)
- On `_Wy<=1` resets all OT state.
- **Possession-edge accounting (V109/V111):** while `inOvertime`, on the offense→waiting edge (`otWasWaiting===false && nowWaiting===true`) increments `_rb2p_otMyPoss` and calls `_rb2p_otCheckRoundEnd()`.
- **Untimed-OT clock top-up (V109):** while on offense in OT, if `engineMinutesLeft < 5` reset to `9:00` — keeps the engine from hitting its clock-<60s `_Vy=24` end / clock-0 rollover.
- On `_Wy>=5` && tied && new period → set `inOvertime=true`, zero the counters, and `requestOtKickoff(q)`.

### Coin flip + kickoff
- `_rb2p_requestOtKickoff` (≈5825) — host (role a) writes `rooms/{code}/ot/p{period} = {receiver: 'a'|'b'}` (a `Math.random()` 50/50). Only A seeds it so both read the same value.
- OT subscription (≈6347) — both devices read `ot`, call `showOtBanner` + `_rb2p_applyOtKickoff(entry.receiver, role)`.
- `_rb2p_applyOtKickoff(receiverRole, myFirebaseRole)` (≈5492) — **V112: decides receiver by FIREBASE ROLE** (NOT `engineUserTeamIdx`, which is unreliable and caused the both-wait deadlock). Receiver: clear parked commentary, `forceUserOffenseDrive`, set clock 9:00, **`_rb2p_otHoldKp2()`** hold-loop (V110). Non-receiver: park in WAIT. Both re-baseline `_rb2p_otWasWaiting` (V111).
- `_rb2p_otHoldKp2` (≈5601) — holds `kp=2`/`Vy<=2` for ~1.5s and nukes the re-spawning kickoff "Receive" button each tick, overpowering the engine's per-frame re-park at the OT-start `Vy=13` stage.

### Round evaluation + walk-off (the equal-possession engine)
- `_rb2p_otCheckRoundEnd` (≈5567) — game over when `myPoss===oppPoss>0` and the score differs (leader wins). A tie continues.
- `_rb2p_otOppPoss++` + round-end check inside `applyOpponentOutcome` (≈4805) — opponent finishing a possession (hand-off to us); if the round is complete and the score differs, `return true` to NOT take the ball (game over).
- `_rb2p_otWalkoffDefensiveTd` (≈5591) — instant game over on a defensive TD. Hooked at the **PICK6 send** (thrower loses, ≈2549) and **PICK6 receive** (defender wins, ≈4624). Fumble-return TDs route through the same PICK6 detection.
- `_rb2p_otDeclareGameOver` → `collectBoxScore` → `_rb2p_reportGameOver` (publishes `final/{role}`).

### Game-over detector (≈5313) — V109 made it HANDS-OFF in OT
- `if (q >= 5 && window._rb2p_inOvertime) return;` — a mere lead no longer ends the game in OT; the round-eval/walk-off own it.
- **V113 native-game-over SAFETY NET:** caches the box score each OT tick; if the engine LEAVES the match room mid-OT without a reported game-over, forces the 2P FINAL from the cache and publishes it. The V107 backstop (`endGameFromOpponentDeclaration`, in the module script) then ends the other device.

### Cross-device end backstop (V107, module script ≈ final subscription)
When `final/{oppRole}` arrives and we haven't ended, `endGameFromOpponentDeclaration` ends our side from the opponent's reported score. This is what saves the WAITING device when only the scoring device detected the end.

---

## PART 3 — The conflict: what the ENGINE does that BREAKS the user's rules

| Engine behavior | Where | Why it breaks the rules |
|---|---|---|
| Native game-over `_1d1` (season flow) | 56054, called from cases 20/25 | Ends the game itself; leaks the "X win the Retro Bowl" season screen instead of the 2P FINAL; ends before the bridge's equal-possession logic decides. |
| OT-end eval is **timed/period-based** (winner = leader at period end) | cases 20 (Wy6) / 25, triggers at 55627–55628, 56030 | Does NOT enforce "each team gets a possession." When the receiving team scores first, the clock-<60/`_Vy=24` path can end OT before the other team answers. |
| OT possession flip `_UD = _0z?0:1` | case 20 Wy-5 (55529/55539) | Computed per-device → the two devices disagree on who received (the original deadlock). Bridge overrides via the shared coin flip — keep that override. |
| Blowout mercy rule | 55276 (`lead>14 → _Vy=24`) | Could end OT early on a big lead, bypassing equal possessions. |
| Tie declaration | cases 20/25 `_1d1(...,0)` | The user wants OT to CONTINUE until someone leads after equal possessions, not declare a tie when the engine's OT budget runs out. |

**Net:** the engine wants to (a) end the game on its own via `_1d1`, and (b) decide OT as a timed period. Both must be suppressed in 2P so the bridge is the sole authority.

---

## PART 4 — The fix (what to remove / override)

**Principle: in 2P OT the engine must NEVER reach `_1d1`, and must NEVER auto-decide OT. The bridge owns 100% of OT flow and game-over.** Keep the engine only for playing out the snaps.

### Fix A — Neutralize the engine's native game-over during OT (highest priority)
`_1d1` is called *directly* inside `_Ib1` cases 20/25 (not via the `_Y._PU1` script registry), so wrapping the registry entry will NOT intercept the internal call. Instead, **prevent `_Vy` from ever reaching the end-game stages while `_rb2p_inOvertime`**, mirroring the existing `Vy=13` quarter-resume watchdog:
- Add an FSM watchdog (or extend the existing one near the `Vy=13` handler ≈2751) that, while `_rb2p_inOvertime` and the bridge has NOT declared game over, intercepts `_._Vy ∈ {18, 24}` (overtime-over / game-over eval) and the `_Vy=12` end-of-OT-period trigger, and forces the engine back to a playable/parked stage so cases 24/25 never run `_1d1`.
- Belt-and-suspenders: keep V113's "engine left the match → force 2P FINAL" safety net so a missed interception still shows the FINAL instead of the season flow.

### Fix B — Make OT genuinely untimed under bridge control
- Keep/raise the V109 clock top-up so the `_k61(_,t,60)` (<60s) `_Vy=24` trigger at 55627 can't fire. Top up on BOTH devices' offense possessions.
- Suppress the blowout mercy `_Vy=24` (55276) while `inOvertime`.
- A possession ends ONLY via score / punt / turnover (clean Firebase outcome hand-off), never a clock or quarter rollover.

### Fix C — Bridge orchestrates equal-possession rounds (already mostly built; verify against the engine no longer interfering)
- Coin-flip first possessor (V112 role-based). Receiver gets the ball + hold-loop (V110).
- Count finished possessions per side; after `myPoss===oppPoss`, leader wins, tie → next round (coin-flip winner starts each round unless we choose to alternate).
- **The hard remaining case:** when the FIRST possessor SCORES, the engine currently ends OT. With Fix A in place (engine can't end), after the first team's TD+PAT the bridge must drive the normal score→kickoff→opponent-receives hand-off (same path as regulation `applyOpponentOutcome` → `forceUserOffenseDrive`) so the second team gets its answering possession. Verify the `_1c1` outcome SEND still fires on an OT TD once the engine game-over is suppressed.
- Walk-off (Fix already present): a PICK6/fumble-6 ends immediately via `_rb2p_otWalkoffDefensiveTd`.

### Fix D — Always show the 2P FINAL on both devices
- Bridge declares game over → `reportGameOver` → publish `final/{role}` → V107 backstop ends the other device.
- V113 safety net covers any engine-native end that slips through.

### Engine lines to treat as "remove / override in 2P OT"
- `_1d1` calls in cases 20 (55535/55537/55545/55547/55550) and 25 (55582/55584/55586) — must not run in 2P OT.
- `_Vy=24` setters: 55276 (mercy), 55627–55628 (period-end/clock-<60).
- `_Vy=12` setter: 56030 (clock expiry) — fine for quarters 1–4 (bridge resumes), but in OT must not lead to a game-over eval.
- OT possession flip `_UD = _0z?0:1` (55529/55539) — already overridden by the coin flip; keep overriding.

---

## Verification checklist (2-device; headless can only prove the kickoff hold + round-logic sim)
1. Regulation ends tied → both devices show OT banner; coin-flip winner gets the ball and plays (console: `received kickoff — on offense (holding kp=2)`), other waits.
2. Receiver scores a TD → game does NOT end; the OTHER team gets an answering possession.
3. Both score equally → another OT round starts.
4. After equal possessions with a leader → both devices show the 2P FINAL (never the season screen).
5. Pick-6 / fumble-6 in OT → instant walk-off, defender wins, both show the FINAL.
6. No "X win the Retro Bowl" / PLAY 2P menu ever appears.
7. Console `[2P OT]` logs show `my=`/`opp=` converging identically on both devices.

## Version history (OT-relevant)
- **V62** — shared coin flip (fixed the `_UD` per-device disagreement); original sudden-death.
- **V108** — first-TD-wins sudden death (REVERTED by V109).
- **V109** — equal-possession engine; detector hands-off in OT; untimed clock top-up.
- **V110** — OT-start `kp=2` hold-loop (fixed both-devices-WAITING re-park).
- **V111** — re-baseline `otWasWaiting` in `applyOtKickoff` (fixed bogus possession count on the non-receiver).
- **V112** — decide receiver by Firebase role, not `engineUserTeamIdx` (fixed the receiver running the WAIT branch → deadlock).
- **V113** — native-game-over safety net: force the 2P FINAL when the engine tears down the match mid-OT.
- **V115** — Fix A (partial): the `_Ib1` clamp wrapper suppresses `_Vy` 12/18/24 during OT. INSUFFICIENT ALONE — the engine's game-over cascade (cases 20/25 → `_1d1`) runs via INTERNAL `_Ib1` recursion within one registry call, so the wrapper's top-of-frame Vy check never sees the intermediate stages. Confirmed in the field: the V113 safety net still fired ("engine ended the game natively").
- **V116** — Fix A (real): hook `_1d1` (s_end_match) directly. `_1d1` is a reassignable global (`window._1d1===_1d1`, verified that bare internal callers resolve the reassigned value), so wrapping `window._1d1` intercepts the engine's INTERNAL game-over calls. During OT it swallows `_1d1` and parks the engine at dead-stage 4 → the drive-end watchdog ships the possession hand-off → the other team gets its answering possession. Headless-verified: with `inOvertime`, calling `_1d1` exactly as the engine does leaves the match alive (still STATE_MATCH=17) and parked at Vy=4. The V115 `_Ib1` Vy-suppression stays as a harmless second layer.
- **Still open / verify on 2 devices:** that the answering possession + multi-round (tie → another round) hold in live play; whether the clock top-up needs to run on the waiting device too.
