# The Pick-6 Problem: why it keeps coming back, and how to stop it

A living postmortem for the single most recurring bug class in `two-player-rb`:
the **defensive-touchdown (pick-6) + PAT cascade**. It has been "fixed" dozens of
times (V39, V50, V53–V57, V121, V147–V151, …) and keeps resurfacing in a new
disguise. This doc explains *why* it's structurally fragile and gives a
checklist so the next change doesn't reopen it.

---

## 1. Why a pick-6 is uniquely hard here

Retro Bowl's engine is a **single-player** state machine. Everything else in 2P
we bend to fit, but the pick-6 breaks the engine's core assumption in three ways
at once:

1. **The scorer is on the *other device*.** On a normal TD the human who scored
   plays the PAT on their own screen — the engine's natural flow is correct. On a
   pick-6 the team that scored is the **defender**, who is a human on the *other*
   phone. The engine doesn't know it's 2P, so it tries to pop the PAT on the
   **thrower's** screen (wrong) and the bridge has to (a) suppress it there and
   (b) re-pop it on the *scorer's* device, play it out, and ship the result back
   over Firebase. One logical event, two devices, asynchronous.

2. **The engine takes a *different code path* for a defensive score.** A normal TD
   fires `_Ak1(_, t, 1)` — the signal the bridge's pick-6 detector hooks. A
   pick-6 is scored by a player whose `_lT` (on-offense) flag is false, so the
   engine logs **`Touchdown by: No holder!`** and takes `_hB(_, t, 2)` instead
   (retrobowl.js ~66234). `_Ak1(1)` **never fires**, so the primary detection
   signal is dead and the bridge must fall back to the score-jump watcher.

3. **The PAT result races *inside* an engine call we can't hook.** `_hB`
   (s_action_result) credits a 2-pt conversion as **+2 only if `_t11 >= 6`**;
   otherwise it treats it as a *fresh touchdown* (+6, re-pops the PAT, loops).
   The epilogue of *every* `_hB` call resets `_t11 = 1`. The bridge's 100 ms
   guardian re-asserts `_t11 = 6` *between* calls, but the dangerous read happens
   *within* a single call — and `_hB` is invoked bare/internally, so it
   **cannot be intercepted from outside the engine IIFE**. This is the
   "model thinks a PAT is a touchdown" loop.

Add a third dimension — **the no-AI-offense / no-random-scoring rules** (see
`CLAUDE.md`) — and every fix has to thread: detect across two devices, suppress
the wrong-side modal, play the real scene, ship the real result, and never
invent points. That's a lot of moving parts that all have to agree.

---

## 2. The recurring failure modes (a field guide)

Every "it's looping again" has turned out to be one of these. When it recurs,
identify *which* one from the console before touching code.

| # | Symptom | Root cause | Fix shipped |
|---|---------|-----------|-------------|
| A | PAT modal pops but never resolves; 90s hang | `enumeratePopupInstances()` only matched the message box (`_Ca===layer`); the **buttons are drawn at `_Ca − 1`** so the bridge never saw them → monitor lied ("0 modals"), killer left them orphaned | **V148** — enumerate `ca` *and* `ca−1` *and* `_0G∈{100367,100369}` |
| B | Scorer's 2-pt conversion scores +6 and re-pops | `_t11 < 6` at the `_hB` gate → conversion processed as a **fresh TD** | **V149** — guardian detects scorer +6, corrects to +2, kills modal, forces kickoff |
| C | Scorer keeps *receiving* fresh PICK6s | Thrower's engine, parked on the gutted no-holder TD stage, re-credits +6 → score-watcher re-fires → **re-sends PICK6** | **V150** — cap to **one PICK6 per offensive possession** (`_rb2p_pick6SentThisPossession`, cleared in `forceUserOffenseDrive`) |
| D | "Pittsburgh has it… at the half" possession ping-pong, forever | `applyOpponentOutcome` threw **`ReferenceError: kickoffReturnYard is not defined`** (a refactor put the helper in a different closure) → kickoff never applied → stuck-drive watchdog forced a turnover every ~1s | **V151** — call `window._rb2p_kickoffReturnYard()` (scope-independent) |
| E | (older) Modal three times, points to wrong team | `_t11<6` fresh-TD misroute crediting the **opponent** +6 mid-PAT | V57 guardian repair |
| F | (older) Possession not transferred on a plain INT | engine calls `_1c1` **bare**; only the registry copy was wrapped | V121 wrapped the global `_1c1` (which later caused its own re-entry issues — see §4) |

The tell-tale console lines, in order of usefulness:
`[2P 1c1]`, `[2P DETECT V56]`, `[2P PICK6 WATCH]`, `[2P PICK6] … sent / ignored`,
`[2P PAT GUARD]`, `[2P MON] … REPORT`, and the raw engine
`Touchdown by: No holder!` / `ACTION_RESULT_TOUCHDOWN(_OPP)` / `drive stuck at
vyStage=…`.

---

## 3. Why it *repeatedly* recurs (the meta-causes)

1. **Tightly coupled subsystems with no single owner.** Detection
   (`_Ak1` hook + `_1c1` hook + score-watcher), suppression (`_Bk1`
   defineProperty + thrower-mode popup-killer), the PAT guardian, the
   cross-device send/receive, and the kickoff/yard application all touch the same
   handful of flags (`pickSixPatCascadeActive`, `patPlayPending/Resolved`,
   `userIsWaitingForOpponent`, `_t11`, `_UD`, `_Vy`). A change to one silently
   shifts a race in another. Failure D wasn't even *in* the pick-6 code — it was a
   **kickoff-yard refactor** three commits earlier that only blew up on the
   pick-6 path.

2. **Sim ≠ live, and we keep forgetting.** The in-engine `_rb2p_testPick6Live`
   passes 37/37 while the live game loops, because it **cannot click the real PAT
   buttons** and **cannot reproduce the two-device Firebase round-trip**. Twice
   this session a test "pass" (or a dismissed "0 PAT buttons" as a "headless
   artifact") hid the actual bug. See the memory
   *"verify-engine-model-before-simulating"* — this is the #1 lesson.

3. **Guessing instead of reading the live log.** Every durable fix this session
   came from a **pasted console log**, not from static analysis. The "No holder!"
   line (failure A/B), the monitor's "ALL PASSED but still receiving" (failure C),
   and the literal `ReferenceError … at 5732` (failure D) each cracked the case in
   one read. Three rounds of clever theorizing did not.

4. **The engine fights back every frame.** `_Ib1` re-asserts state, the epilogue
   resets `_t11`, the FSM re-enters dead stages. Anything that isn't frame-tight
   or isn't a structural invariant gets overwritten.

---

## 4. How to prevent the next regression

### Before you touch the cascade
- **Read the live console first.** Ask for `copy(window._rb2p_pick6MonitorReport().text)`
  from *both* devices and the surrounding `[2P …]` lines. Identify the failure
  mode from §2 before forming a hypothesis. Do not guess from the code alone.
- **Trust the engine source, cite lines.** The load-bearing facts
  (`_hB` `_t11>=6` gate, the `No holder` → `_hB(_,t,2)` branch, `_wm` drawing
  buttons at `ca−1`, the epilogue `_t11=1`) are all verifiable in `retrobowl.js`.
  Re-grep them; they drift between checkouts.

### While changing it
- **Mind the closures.** `index.html` is **not one IIFE.** `forceUserOffenseDrive`
  / helpers near the top live in a different scope than `applyOpponentOutcome`,
  the PAT guardian, and the OT code. If a helper is used across the cascade,
  expose it on `window._rb2p_*` and **call it via that name** — never assume a
  bare reference resolves. (Failure D was exactly this.)
- **Prefer structural invariants over races.** "One PICK6 per possession"
  (V150) beats "hope the 100ms guardian wins." When you can't win a race from
  outside the engine (the `_hB` `_t11` race), **repair after** (V149) rather than
  pretend you can prevent it.
- **Don't fix the cascade by re-routing global engine calls casually.** V121's
  blanket `window._1c1 = wrapped` fixed INT possession but made *18 bare engine
  calls* re-enter the bridge wrapper, which destabilized the PAT path. If you
  must wrap a global, **gate it** (e.g. pass through to the original while a
  cascade is active).
- **Never add points without a played scene.** Any new fallback must derive from
  a real result or a deterministic engine computation — no `Math.random()`
  deciding a PAT. (CLAUDE.md "no-AI-offense / no-random-scoring".)

### Before you ship
- [ ] Run `_rb2p_testPick6Live()` → expect **37/37** (regression guard for the
      *engine-side* cascade only).
- [ ] Confirm the **monitor reports truthfully** — if you changed popup/enumeration
      logic, re-verify `modalPops`/`authorized` counts against an all-instance
      scan (failure A was a *lying monitor*).
- [ ] **Parse-check** every inline `<script>` (the project's `new Function(code)`
      sweep) — a scope/typo bug like failure D is a `ReferenceError` that only
      fires on one branch and passes a casual eyeball.
- [ ] Grep for the helper you touched across **all** call sites and confirm each
      is in-scope (or uses the `window._rb2p_*` form).
- [ ] **Two real devices.** The sim is necessary but NOT sufficient. A pick-6 is
      not "fixed" until a human has thrown one live, the scorer has played both a
      **1-PT** and a **2-PT** PAT, and the game continued — once, end to end, with
      no repeats. State that caveat explicitly; don't declare victory on the sim.
- [ ] Bump the `V<N>` label, commit, push, and smoke-test **both** deploy URLs
      (Vercel + GitHub Pages) per CLAUDE.md.

### Invariants to keep true (if any is violated, you have a bug)
1. Exactly **one** PAT modal per pick-6, on the **scorer's** device only.
2. The thrower **never** sees an interactable PAT; the thrower sends **one**
   PICK6 per possession.
3. The scorer's PAT credits **+1 or +2** to the **scorer** — never +6, never to
   the opponent.
4. After the PAT, possession goes to kickoff and **both** scoreboards converge
   from the `PAT_RESULT` wire value.
5. No points are ever added without a human having played the scene that earned
   them.

---

## 5. The one-paragraph version

The pick-6 is the only event where the scorer is on the other device, the engine
takes a detection-blind code path (`No holder` → `_hB(_,t,2)`), and the PAT
result races inside an un-hookable engine call. Those three facts mean the fix is
spread across detection, suppression, a guardian, cross-device messaging, and
kickoff application — and any change to a shared flag, a shared helper's scope, or
a global engine call can reopen it. It keeps recurring because we trust passing
**sims** over **live two-device logs**. The cure is discipline: read the live log
first, verify against engine source, prefer invariants over races, mind the
closures, and never call a pick-6 fixed until it's been played end-to-end on two
phones.
