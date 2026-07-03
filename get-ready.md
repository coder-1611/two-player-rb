# GET READY — full research: why the kickoff screen breaks on phones

Status: **FIX SHIPPED — V236 (f19246b), 2026-07-03, awaiting device confirmation.**
The §9 closure plan was executed the same day: the real-2P instrumented run
(§7's missing experiment) found the last mechanism, and V236 closes it. See
§11 for the result. Earlier sections are the investigation record.

---

## 1. TL;DR

- The GET READY / Kick Off / Receive screen is the engine's **kickoff staging**.
  In this 2P fork it is *designed to be bypassed* (~0.2 s desktop flash) by
  `forceUserOffenseDrive`, which skips kickoffs and spawns a scrimmage drive.
- On phones (iOS **and** Android) the bypass chain corrupts: the latest
  on-device diagnostics (V233/V234) prove the drive **is actually live**
  (`ball:1 kp:2 vy:2`) while dead staging UI stays painted on top, and
  something **re-creates the kickoff button in a loop** (`auto de-ghosted
  corpse btn x5` repeating).
- **The central finding of this document**: every automated verification ran
  the `s_play_one_game_vs_KC` harness flow. Real phones run
  `startTwoPlayerMatch` + Firebase (roles a/b, outcome listeners, resume,
  score-floor loops). The failing behavior lives in code paths the harness
  never executes. All five shipped fixes are real, but each was validated
  against the wrong flow — which is why every "verified" build still failed
  on a phone. Closing the bug requires reproducing under the REAL 2P flow
  (`e2e/two-player.js` exists for exactly this).

---

## 2. How GET READY works in the engine (verified, with line refs)

All refs are `retrobowl.js` in this repo (stable minification).

| Piece | Symbol | Where | What it does |
|---|---|---|---|
| Match controller create | `_Z6` | ~66024 | `_kp = 1` (staging), `_Vy = 0`, `__b1 = "GET READY!"` (`match_GetReady`) |
| Big banner text | `__b1` on controller | set 60+ places | The center banner. GET READY at create; later reused for play-by-play ("TOUCHDOWN!", quarter banners). **Never clear it blind.** |
| Kickoff button create | `_Iy` (s_set_up_button_kickoff) | 45059 | `controller._Ly = _dr(x, 180, "Text", 2)` — **object index 2**, layer "Text" (the `_f2: 73` in the object table at 23591 is its sprite, not the object id) |
| `_Iy` callers | — | 55457 (Vy case 19, quarter end), 55574 (another Vy stage), 66218 (match init) | The controller's `_Vy` FSM re-creates the button whenever it re-enters a staging stage |
| Button label | `_3z` | 62300 (create default "Kick Off"), 45091/45094 | Controller sets "Receive" / "Kick Off" / "Continue" per stage + possession |
| Button step | `_y2` | ~23596 evt table | (1) early-returns if ANY popup (object 46) exists; (2) reads GUI mouse `_m01(0)/_o01(0)` — but **only for the hover highlight `_7D1`**; (3) fires on **any** `_l11(1)` release, position-independent — GET READY is effectively "tap anywhere" |
| Button action | `_Ky` | 45099 | logs `btn_kick_off`, `_cr(self)` (destroy), sets `controller._7z = 1` on all object-71 instances — this flag is what advances staging |
| Button draw | `_z2` | — | The button paints its OWN panel + label. If the instance renders, the panel shows; the "GET READY!" panel is the controller drawing `__b1` |
| Play spawn | `_eb1` (s_set_up_play) | ~54900 | Spawns 22 players + ball; calls `_Y41` per player |
| Player finalize | `_Y41` | 53091 | 31 unguarded `_jj(_, t, 64/71)` singleton lookups; crashes with "undefined value in expression" / null-object errors in half-built or aged rooms |
| instance_destroy | `_cr` | 81520 | Fires destroy+cleanup events (`_2f2(_OL2/_PL2)`) THEN sets `_HL2 = !0`. Its event dispatch **can itself throw** in a damaged room |
| Destroyed-instance purge | engine step/draw dispatchers | 112236+ | All dispatchers skip `_HL2`. Removal from `_oq2` + de-paint normally happens within a frame — **but damaged rooms on phones keep painting corpses** (see §4, V233/V234 evidence). Healthy rooms purge instantly (verified, incl. under 12× CPU throttle) |
| Visibility flag | `_g2` | used by bridge `hideCont` (~3140) | `inst._g2 = 0` ⇒ engine skips draw AND step. The only corpse-proof off switch we have |

### The intended single-player flow
controller create (`kp=1`, banner) → `_Iy` creates button → player taps
anywhere → `_l11(1)` → `_Ky` → button destroyed, `_7z=1` → controller runs the
kickoff play → `kp=2`, banner cleared by the engine's own flow.

### The intended 2P flow (this fork)
`startTwoPlayerMatch` role 'a' → `pollA` (50 ms) → `forceUserOffenseDrive(yard)`
→ kills the kickoff button, writes field state (1st&10 at a kickoff-return
yard), calls `s_set_up_play` directly, `kp=2` → play live. The staging screen
exists for ~0.2 s (the desktop "flash"). **Nobody is ever supposed to tap it.**

---

## 3. On-device evidence timeline (every datum, in order)

All from the user's iPhone screenshots of the on-screen diagnostic
(sessionStorage-persisted, survives reloads). Also reported failing on Android.

| Build | Evidence | Meaning |
|---|---|---|
| V227 | `match:1 room:1 !wait:1 !pat:1 supp:1 kp:2 ball:0` at the stall | All bridge gates green; controller "active" but **no ball** — drive never spawned |
| V228 | LOG: 3× uncaught `TypeError: null is not an object (evaluating '_Sc2…')` at match start; `press → force(-14)->false`; `in-place spawn FAILED -> auto-reload`; game live after reload | (a) bridge boot-crash loop found (see §5.1); (b) `forceUserOffenseDrive` fails cleanly on-device; (c) only reload recovers |
| V228 | `fps:59-61` at every stall/freeze | Browser frame loop healthy — never a throttling problem |
| V233 | `kp:2 vy:2 ball:1 btn:0+g1 _7z:0` **with GET READY + Receive visible** | **The game was LIVE under the staging UI.** One kickoff-button corpse (`_HL2` ghost) still painting; zero live buttons |
| V233 | LOG showed `Y41 shielded {message: "undefined value in expression"…}` on-device | The `_Y41` crash class occurs on the real phone too (shield caught it) |
| V234 | LOG: `tap on corpse btn — de-ghosted` and `auto de-ghosted corpse btn x5`, repeating at ~1 s cadence for minutes; still `ball:1 kp:2 vy:2`, staging UI keeps returning | **Create/kill churn**: something re-creates the kickoff button continuously; each new instance ends up as a painting corpse; the self-healer keeps executing but the source keeps producing. Note: the diag header string still reads "V233" (cosmetic bug — the header wasn't bumped; the de-ghost log lines only exist in V234, proving V234 was live) |

---

## 4. Harness reproductions (what was proven in a controlled environment)

1. **Ghost-button repro** (`repro-phone-stall.js`): sabotage `_Y41` → the real
   bridge kills the button then fails the spawn → `ghost:1 live:0`, panel
   painted, trusted tap at exact rect does nothing (`_7z` stays 0). Matches
   V227/V228 device data exactly.
2. **Poisoned-room fact**: once the FIRST spawn of a match crashes, every later
   `s_set_up_play` throws a GML `_ZC2` exception forever, even after the
   original cause is removed. Only a reload rebuilds the room. (This is why
   refresh always worked and why in-place recovery kept failing.)
3. **Shield efficacy**: in an aged room the real `_Y41` throws per-player
   ("undefined value in expression" ×22); with the shield, `force -> true`,
   ball spawns in place, no reload.
4. **Tap-bridge efficacy**: with `_m01/_o01/_l11` ALL dead (total engine input
   failure), a DOM tap on the button fires `_Ky` directly and the kickoff
   proceeds.
5. **Corpse-paint rule**: in a HEALTHY room, raw `_HL2`-marked corpses purge
   within a frame (verified, incl. at 12× CPU throttle). In DAMAGED rooms
   (phone evidence) they linger and paint. `_g2 = 0` suppresses draw+step
   unconditionally in both.
6. **CPU throttle exoneration** (`probe-throttle.js`, 12×): boot + match under
   throttle is completely clean — no Y41 hits, no ghosts, purge normal. Slow
   CPU alone does not reproduce anything.

---

## 5. Root causes found and fixed (all real, all shipped)

1. **V229/V230 — bridge boot-crash loop.** Two hooks used
   `typeof _Sc2 !== 'undefined' && _Sc2._GL2` — `typeof null` passes, so
   `null._GL2` threw uncaught every 500 ms during slow boots, right through
   match-room construction (Safari phrased it exactly as the device errors:
   "null is not an object (evaluating '_Sc2…')"). Fixed with null checks
   (index.html ~1017, ~3245).
2. **V232 — ghost-button trap.** `forceUserOffenseDrive` killed the Receive
   button (raw `_HL2 = true`) BEFORE spawning; on spawn failure the player
   faced a painted, step-dead corpse. Fixed: spawn first → verify ball →
   destroy via `_cr` → rollback all mutated field state on failure so native
   staging stays playable.
3. **V232 — `_Y41` crash shield.** One bad player-finalize no longer aborts the
   22-player spawn (engine top-level fns are globals; reassignment rebinds all
   callers).
4. **V232 — poisoned-room auto-reload.** ~3 s of consecutive opening-spawn
   failures → one automatic reload into the resume flow (max once/min).
5. **V233/V234 — input independence + corpse suppression.** DOM tap-bridge
   fires `_Ky` directly (no engine input dependency); every kill site also sets
   `_g2 = 0`; heartbeat self-heals any painting corpse and clears a stale
   GET READY banner only in healing context (`__b1` is shared with play-by-play
   banners).

Each fix is individually harness-proven. The device is STILL wrong, because:

---

## 6. What is still happening on-device (V234 screenshot analysis)

State: `ball:1 kp:2 vy:2 _7z:0`, staging UI visible, and the log cycling:

```
45:49 tap on corpse btn — de-ghosted…
45:52 auto de-ghosted corpse btn x5
45:52 tap on corpse btn — de-ghosted…
45:53 auto de-ghosted corpse btn
...
```

Interpretation (each step evidenced):

- The drive is live. The bypass WORKED at the engine-state level.
- Something calls back into the controller's staging path (or `_Iy` directly)
  roughly every second, creating a fresh kickoff button.
- Each fresh button is destroyed by *something that is not one of our V234 kill
  sites* (ours set `_g2 = 0`; these corpses still paint ⇒ they were destroyed
  by the ENGINE's own `_cr` — e.g. `_Ky`? staging rebuild? — or by a bridge
  path not yet updated).
- On the phone's damaged room, engine-destroyed corpses don't purge ⇒ each
  cycle leaves a new painting corpse ⇒ heartbeat de-ghosts it ⇒ repeat.
- The "GET READY!" banner likely keeps being re-set by the same re-entered
  staging code (`_Uy` label updater / stage cases also write `__b1`).

**The question is no longer "why doesn't tapping work" — it's "what re-enters
kickoff staging every second on phones, and why do engine-destroyed corpses
paint there".**

Candidate re-creators (unverified, ranked):

1. **A bridge Firebase/interval loop writing `vy`/`kp` repeatedly** (outcome
   apply, score floors, resume hold, pick-6 guardian…). The controller FSM
   passing through `_Vy` case 19 / 55574 calls `_Iy` each pass. The harness
   never runs these loops with real latency — perfectly consistent with
   "phones only".
2. **Controller Alarm0 (`__6`, 66220)** — a periodic alarm dispatching on `kp`;
   if some case re-runs staging setup under our forced hybrid state
   (`kp=2` + `_7z=0` + never-ran kickoff), the ENGINE itself is the
   re-creator, on a timer — which would also fit the ~1 s cadence.
3. **Quarter/OT transitions** (case 19 calls `_Iy` legitimately) — but the
   screenshots are 1st Qtr 2:00, no transition.

Candidate purge-breakers (why corpses paint only there):

1. Room damaged by the (already-fixed) boot crash on THIS session's first
   spawn — i.e., the user's sessions still begin with a first-spawn crash from
   a cause other than §5.1 (the V233 log's `Y41 shielded` on-device supports
   a still-occurring early crash, now shielded).
2. A layer-level effect: the button lives on layer "Text"; if that layer's
   element list diverges from `_oq2` bookkeeping in a damaged room, draw
   continues while logic skips. (Matches the dispatchers-skip-`_HL2` /
   painter-doesn't architecture seen at 112236+.)

---

## 7. THE methodological finding: the harness has been testing the wrong flow

Every automated pass (V229 7/7, V232 7/7+B, V233 9/9, V234, PAT 37/37) drove
the match via `H.enterMatch` ⇒ `s_play_one_game_vs_KC` — a synthetic
single-device flow. Real phones run:

```
startMatch (Firebase room) → startTwoPlayerMatch(role a|b)
  → pollA/pollB (+pollR on resume)
  → turnover/outcome listeners (applyOpponentOutcome)
  → score-floor holds, pick-6 guardian, patDuty, WAIT overlay…
```

Differences that matter: two devices, Firebase latency injecting state writes
at arbitrary times, role-b WAIT parking, resume paths, and every interval loop
armed. The churn in §6 is almost certainly one of these loops interacting with
the controller FSM — code the vs-KC flow never touches. **This is why five
consecutive real fixes still didn't make phones work: the failing interaction
was never in the tested path.**

`e2e/two-player.js` and `run-bots-live.js` exist and drive the REAL flow with
two pages. They are the reproduction vehicle.

---

## 8. Exonerated suspects (stop re-investigating these)

| Suspect | Verdict | Evidence |
|---|---|---|
| Tap coordinate mapping under rotation | INNOCENT (for this bug) | Drags played downs 1–4 on-device; staging button fires on any release anyway (`_y2`); V233 bridge bypasses input entirely |
| Browser throttling / rAF | INNOCENT | fps:59-61 in every failing screenshot |
| Slow CPU alone | INNOCENT | 12× throttle probe fully clean |
| iOS/Safari specifics | INNOCENT | Fails on Android too (user report) |
| Vercel deploy pipeline | INNOCENT | Direct edge curls + V-label checks every build |
| Fractional yards-to-go | BENIGN | Engine room-unit math; display rounds |
| `REJ Decoding failed` (audio) | Noise | iOS audio decode; recurs harmlessly |

---

## 9. Path to closure (ranked, decisive)

1. **Reproduce with the REAL flow**: two throttled mobile-emulated pages via
   `e2e/two-player.js` (roles a+b through actual Firebase), watch for the
   §6 churn signature (`btn create → engine _cr → painting corpse` cycle) and
   log WHO calls `_Iy`/`_cr`. Instrument: wrap `_Iy` and `_cr` (globals,
   rebindable) to log `new Error().stack` top frames when the target is
   object 2 / obj_btn_kickoff. One run pinpoints the re-creator.
2. **On-device confirmation without devtools**: add the same `_Iy`/`_cr`
   caller-stack capture to the corner diag (one screenshot names the loop).
3. **Then the real fix** will be one of:
   - stop the offending bridge loop from re-driving the FSM through staging
     stages, or
   - make `_Iy` a no-op while `ball > 0 && kp === 2` (surgical: staging can
     never legitimately coexist with a live drive in 2P), which kills the
     churn AND the banner rewrites at the source regardless of the caller.
4. **Separately**: chase the still-occurring on-device early `_Y41` crash
   ("undefined value in expression" seen shielded in V233) — capture its
   stack in the diag; it marks whatever still damages the room at boot.

## 11. RESOLUTION (V236) — what the real-2P run found and what shipped

Executing §9.1 (`repro-real2p.js`: two mobile-emulated CPU-throttled pages,
real Firebase, `_Iy`/`_cr` caller stacks, controller counter) found:

- **The WAITING player sits on a fully LIVE GET READY staging screen** —
  `kp:1`, tappable Kick Off button, for the entire opposing drive. The bridge
  parked role B's engine but never suppressed its staging UI. Every "waiting"
  period on every device shows a fake, functional-looking kickoff screen.
- `_Iy`'s only caller at match start is the controller CREATE (`_Z6` @66218)
  — the button is built before the bridge even sets the waiting flag, so no
  wrapper alone can prevent it; active suppression is required.
- Zombie-controller hypothesis: **disproven** (ctl:1 on both pages throughout).
- In healthy rooms the engine purges destroyed buttons instantly; phones'
  damaged rooms don't (§4.5) — so each staging cycle there accumulates painted
  corpses (the V234 churn log).

V236 ships four layers:
1. `_Iy` wrapped: no-op while this device is WAITING or while a drive is live
   (ball + kp==2). Genuine failed-spawn fallback still builds the button.
2. Heartbeat purges corpses outright (splice from `_oq2` — the manual version
   of the purge phones fail to run; safe: all dispatchers skip `_HL2`).
3. WAIT side: any live staging button destroyed + purged on sight; the waiting
   player sees only the WAITING FOR OPPONENT overlay (screenshot-verified).
4. GET READY banner cleared by exact localized-string match when waiting or
   when a drive is live under it — directly covers the on-device
   `ball:1 kp:2 + banner` stall state.

Verified: real-2P run clean on both sides for a full drive; v233 suite 9/9;
v234 corpse suite; PAT 37/37.

## 10. Repro/verification commands

```bash
# throttled mobile boot (clean today — keep as control)
RATE=12 node <scratchpad>/probe-throttle.js
# ghost/stall repro (kill-then-fail flow, pre-V232 behavior)
node <scratchpad>/repro-phone-stall.js
# real-flow reproduction target (next step)
node e2e/two-player.js         # + CPU throttle + _Iy/_cr stack instrumentation
# mandatory regression for ANY spawn change
node e2e/repro-pat-loop.js     # expect 37/37
```
