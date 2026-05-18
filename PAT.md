# PAT.md — Reference for the 2P Retro Bowl scoreboard, user-PAT flow, and pick-6 logic

This document is the canonical reference for how scoring works in the 2P fork of Retro Bowl. It exists because the pick-6 PAT flow has been mis-fixed across ~20 V-bumps due to each iteration assuming a different model of "what's happening." Read this before changing anything that touches scoring, possession, or PAT-modal lifecycle.

All line numbers reference the current `main` (V48 / commit `eeb5bcd`). If you change line numbers, run `/pick-six-research verify` to detect drift.

---

## 1. The scoreboard

### 1.1 Storage

The scoreboard lives on the engine `match` instance as the field `_._Sb1`. It is a 2-element JavaScript array:

- `_._Sb1[0]` — team 0's score
- `_._Sb1[1]` — team 1's score

Initialized at `retrobowl.js:66077-66079`:

```js
_._Sb1 = _Ft(_._Sb1, 4137727317),
_._Sb1[_Gt(0)] = 0,
_._Sb1[_Gt(1)] = 0,
```

`_Gt(x)` (at `retrobowl.js:132379`) is just `int32(x)` with a bounds check — returns its input. `_Ft(array, tag)` (at `retrobowl.js:132367`) is a copy-on-write batching marker, **not** a tamper guard. It ensures multiple writes in the same engine call share one array copy.

### 1.2 Team-index semantics

There are two team-index fields that look related but mean different things.

**`_._0z`** — the user's team index on this device. Set once at match start (`retrobowl.js:66067`):

```js
_._0z = _jj(_, t, 64)._5Q,
```

It does **not** change after the match begins. On device A, `_0z` is A's team idx. On device B, `_0z` is B's team idx. The two devices have opposite values for `_0z` because they're playing each other.

**`_._UD`** — the currently possessing team's index. Initialized randomly via `_dq(1)` at `retrobowl.js:66088`, then flipped by `_1c1` (`s_change_possession`) at `retrobowl.js:56456`:

```js
a._UD = yyGetBool(a._UD) ? 0 : 1,
```

When the user is on offense, `_._UD === _._0z`. When the user is on defense, `_._UD !== _._0z`. The bridge maintains this invariant via two clamping watchdogs (more below).

In bridge-side code, these are exposed as friendly names through the wrapper at [index.html:830-862](index.html#L830):

| Bridge name | Underlying engine field | Returns |
| --- | --- | --- |
| `engineUserTeamIdx` | `m._0z` | user's team idx |
| `engineOpponentTeamIdx` | `m._0z ? 0 : 1` | opposite of user's team idx |
| `enginePossessingTeamIdx` | `m._UD` | currently possessing team idx |
| `userScore` | `m._Sb1[m._0z]` | user's score |
| `opponentScore` | `m._Sb1[m._0z ? 0 : 1]` | opponent's score |
| `setUserScore(v)` | `m._Sb1[m._0z] = v` | (mutator) |
| `setOpponentScore(v)` | `m._Sb1[m._0z ? 0 : 1] = v` | (mutator) |

### 1.3 Engine scoring writes — every site

All score writes in `retrobowl.js` follow the pattern `_Sb1 = _Ft(_Sb1, MAGIC); _Sb1[_Gt(TEAM)] = yyfplus(_Sb1[_Gt(TEAM)], N);`. The magic numbers (`4137727317`, `968186802`, `2657051033`) identify the call site for the copy-on-write batcher; they have no scoring meaning.

| Line | Points | Team index used | Event |
| --- | --- | --- | --- |
| `retrobowl.js:55301` | +3 | `_._UD` | Field goal made |
| `retrobowl.js:55369` | +6 | `_._UD` | Touchdown (TD-replay cascade scoring path) |
| `retrobowl.js:55445` | +1 | `_._UD` | Dice-roll PAT (case 18 — **gutted in V42**, the `_dq(8)` was replaced with `0` so this branch never fires) |
| `retrobowl.js:55564` | +2 | `_._UD` | Dice-roll 2-PT (case 23 — **gutted in V43**, `_dq(99)` replaced with `99`) |
| `retrobowl.js:55941` | +6 | `n._UD` | OT-condition TD (`_Wy == 5`) |
| `retrobowl.js:55947` | +6 | `n._UD` | Default TD branch of `_hB` case 0 |
| `retrobowl.js:55952` | +2 | `n._UD` | Engine 2-PT in case 0 alternate |
| `retrobowl.js:55961` | +6 | `n._UD` | TD via `_hB` case 1 branch 1 (OT) |
| `retrobowl.js:55964` | +2 | `n._0z` (**V48 patch**) | **2-PT user-played scene credit** |
| `retrobowl.js:55968` | +6 | `n._UD` | TD via `_hB` case 1 branch 3 (regular) |
| `retrobowl.js:55989` | +1 | `n._0z` (**V48 patch**) | **1-PT user-played kick credit** |
| `retrobowl.js:55990` | +2 | `n._0z` (**V48 patch**) | **Field-goal bonus** (+2 added when `_Z21` is falsy, turning a +1 PAT into a +3 FG) |
| `retrobowl.js:56004` | +2 | `opposite of n._UD` | Safety (defensive 2pt — case 6 OT branch) |
| `retrobowl.js:56007` | +2 | `opposite of n._UD` | Safety (defensive 2pt — case 6 default branch) |
| `retrobowl.js:56571` | +3 | `a._0z` | Force-quit-match administrative score |

**V48 invariant:** the three credit lines that fire during a user-played PAT scene (55964, 55989, 55990) credit `n._0z` (the device user's team idx), not `n._UD`. This is independent of what the possession clamps have done to `_UD`. See § 3.4 for why this matters in pick-6.

### 1.4 Engine score reads

`_qh1()` at `retrobowl.js:56854-56920` is the scoreboard render function. It reads `_Sb1[0]` and `_Sb1[1]` directly each frame and formats them as `"<TEAM_A> <score>  <TEAM_B> <score>"` in the upper-left overlay. The team displayed first is always team 0, regardless of which team is "user" — the renderer is index-driven, not perspective-driven.

Other reads:

- OT win conditions at lines 55039, 55155, 55271 — compare `_Sb1[_0z]` vs `_Sb1[opp]`.
- FG/PAT decision logic at line 55194 — uses score differential.
- `_._231` is set to `_._UD` (or opposite) at the moment of credit, used by some downstream rendering / commentary paths.

### 1.5 Bridge score writes

Outside the engine, the bridge writes to `_Sb1` in only two places:

1. `setUserScore` / `setOpponentScore` at [index.html:860-861](index.html#L860) — direct array index assignment. Bypasses `_Ft()` (does not call it).
2. The Firebase live-sync receiver at [index.html:3077-3078](index.html#L3077) — calls `setOpponentScore(payload.myScore)` and `setUserScore(payload.oppScore)`.
3. `applyOpponentOutcome` paths — call the same setters at several places ([index.html:1866-1867](index.html#L1866), [2345-2346](index.html#L2345), [2378-2382](index.html#L2378)).

The bridge **never increments** the scoreboard. It only mirrors the sender's absolute values. All score creation happens in the engine via § 1.3 lines.

### 1.6 Firebase live-sync

Push side at [index.html:3014-3110](index.html#L3014). Fires every 500 ms regardless of who is on offense.

```js
var userLivePayload = {
    myScore:  Number(engineMatch.userScore) || 0,    // sender's _Sb1[_0z]
    oppScore: Number(engineMatch.opponentScore) || 0, // sender's _Sb1[_0z ? 0 : 1]
    minutesLeft, secondsLeft, quarter, seq, ts
};
FB.set(FB.ref(db, 'rooms/' + myRoom + '/live/' + myRole), userLivePayload);
```

Receive side at [index.html:3055-3110](index.html#L3055). Gated by `userIsOnDefense`:

```js
var userIsOnDefense = engineMatch.enginePossessingTeamIdx !==
                      engineMatch.engineUserTeamIdx;
if (userIsOnDefense) {
    engineMatch.setOpponentScore(opponentLivePayload.myScore);
    engineMatch.setUserScore(opponentLivePayload.oppScore);
    // ... clock sync ...
}
```

The gate uses `_._UD !== _._0z` to mean "user is on defense, opponent is authoritative for scores, mirror." This is why mis-clamping `_._UD` (see § 3.4) breaks the gate.

### 1.7 Drive-end outcome (final source of truth)

`buildUserDriveEndOutcome` at [index.html:2270](index.html#L2270) packages absolute scores at drive end:

```js
return {
    type: type,
    yardLine: yard,
    scoreUser: post.engineScoreboard[post.engineUserTeamIdx],
    scoreOpp:  post.engineScoreboard[post.engineUserTeamIdx ? 0 : 1],
    quarter, minutesLeft, secondsLeft, ...
};
```

`type` is inferred from `_._2c1` (priorFsmStage) at the moment of `_1c1`:

| priorFsmStage | type |
| --- | --- |
| 9 or 16 | `'TD'` |
| 8 | `'INT'` |
| 12 or 23 | `'PUNT'` |
| 14 | `'FG'` |
| 1 | `'KICKOFF'` |
| 24 | `'HALF_END'` |

The receiver applies this via `applyOpponentOutcome` at [index.html:2244](index.html#L2244). Scores are **absolute**, not deltas — both devices converge at drive boundaries.

### 1.8 Transient desync windows

- **Live-sync lag (0-500 ms):** sender scores at frame T, pushes at T+50-500ms, receiver applies at T+100-600ms. In-game scoreboard trails during this window.
- **Mid-PAT (0-2 s):** the PAT-playing user's `_Sb1` is ahead of the observer's. Lives entirely on the playing device until kickoff cascade ships the outcome.
- **Pick-6 (0-30 s):** see § 3. Multiple race conditions documented there.

---

## 2. User-controlled PAT (1-PT and 2-PT)

### 2.1 Touchdown trigger

The ball-carrier crosses the goal line. The collision handler at `retrobowl.js:66228` evaluates:

```js
yyGetBool(yyGetBool(_jj(_, t, i)._X_) && yyGetBool(_jj(_, t, _jj(_, t, i)._X_)._lT))
  || yyGetBool(yyGetBool(_jj(_, t, i)._021) && yyGetBool(_jj(_, t, _jj(_, t, i)._021)._lT))
  ? _Ak1(_, t, 1)    // TD replay path
  : _hB(_, t, 2);     // direct 2-PT credit path
```

The first branch is taken for regular TDs (kicks off the replay cascade and eventual PAT modal). The second is taken for the post-2-PT-click goal-line cross (skips the replay and goes straight to credit).

### 2.2 TD-replay cascade

`_Ak1(_, t, 1)` at `retrobowl.js:57499`:

```js
function _Ak1(_, t, i) {
    _1j(_, t, "s_start_replay"),
    _jj(_, t, 71)._kp = 3,          // controllerState = 3 (replay)
    global._vk1 = 0,
    global._Bk1 = arguments[2];     // global._Bk1 = 1 — encodes "TD scored"
    ...
}
```

`_._kp = 3` flags "in replay." The frame handler `_i7` at `retrobowl.js:66593` polls every frame:

```js
function _i7(_, t) {
    yyfequal(_._kp, 3) && _Ik1(_, t)
}
```

When the replay finishes, `_i7` calls `_Ik1` at `retrobowl.js:57534`:

```js
function _Ik1(_, t) {
    _1j(_, t, "s_end_replay"),
    _jj(_, t, 71)._kp = 2;
    var i = -1;
    if (0 == yyCompareVal(global._Bk1, 0, g_GMLMathEpsilon, !1) && (i = 0),
        0 === i)
        _eb1(_, t, 0);
    else
        _hB(_, t, global._Bk1)
}
```

So when `global._Bk1 == 1`, `_Ik1` calls `_hB(_, t, 1)` — the PAT modal popper.

### 2.3 PAT modal

`_hB(_, t, 1)` lands in case 0 of the switch at `retrobowl.js:55935`. The PAT-modal-popping code is at `retrobowl.js:55944-55949`:

```js
if (!yyfgreaterequal(n._t11, 6))
    return _Dt(30378501),
        n._Sb1 = _Ft(n._Sb1, 968186802),
        n._Sb1[_Gt(n._UD)] = yyfplus(n._Sb1[_Gt(n._UD)], 6),     // TD +6
        _wm(n, _, "", _Xi(n, _, "matchmsg_PATor2"),
            _Xi(n, _, "match_1pt"), _Xi(n, _, "match_2pt"),
            _ne1, _oe1, 16777215, .7),                            // modal
        void (n._t11 = 6);                                        // PAT-pending marker
```

`_ne1 = 100367` (1pt button click handler script id), `_oe1 = 100369` (2pt). `_wm(...)` at `retrobowl.js:57547` spawns five popup instances on the `"PopUps"` layer (background, title, message, two buttons). Each button instance carries the script id in its `_0G` field — that's how the [PAT-modal dedup watchdog](index.html#L2026) identifies PAT modals.

### 2.4 1-PT path

User taps the 1pt button (`_0G === 100367`). Script handler `_oB` at `retrobowl.js:45462`:

```js
function _oB(_, t) {
    _lB(_, t, 1),    // set up FG kick scene with PAT marker
    _Lr(_, t)         // dismiss modal
}
```

`_lB(_, t, 1)` at `retrobowl.js:55715` sets up the kick scene:

- `n._Z21 = 1` — marks "this is a PAT kick, not a FG"
- `n._T11 = 1` — PAT-in-progress flag
- `n._6F = 35` — yard line for PAT kick
- Spawns 11 player instances on each side

User plays the kick. On make, `_hB` case 4 at `retrobowl.js:55982` fires:

```js
case 4:
    if (yyfequal(_jj(_, t, 64)._fx, 1))
        return ...
    _re1(n, _),
    _Dt(30378501),
    n._Sb1 = _Ft(n._Sb1, 968186802),
    n._Sb1[_Gt(n._0z)] = yyfplus(n._Sb1[_Gt(n._0z)], 1),     // V48: +1 to n._0z (was n._UD)
    yyGetBool(n._Z21) || (n._Sb1[_Gt(n._0z)] = yyfplus(n._Sb1[_Gt(n._0z)], 2)),  // V48: FG bonus +2
    ...
```

`_Z21 = 1` for PAT, so the +2 line is skipped (`||` short-circuits). User gets +1.

For a regular FG (not PAT), `_Z21 = 0`, both lines fire → +3 total.

### 2.5 2-PT path

User taps the 2pt button (`_0G === 100369`). Script handler `_rB` at `retrobowl.js:45469`:

```js
function _rB(_, t) {
    _Lr(_, t)    // just dismiss the modal, nothing else
}
```

The 2-PT scene starts because `_._t11 == 6` (set at line 55949 when the modal popped) and `_eb1` case 2 at `retrobowl.js:54940` is reached on the next setup-play cycle:

```js
case 2:
    _._l61 = 2,    // yards to go = 2
    _._6F = 48;    // line of scrimmage at the 2
    break;
```

User plays the goal-line snap. On goal-line cross, the conditional at `retrobowl.js:66228` falls into the `_hB(_, t, 2)` branch. `_hB` case 1 at `retrobowl.js:55957`:

```js
case 1:
    yyfequal(n._Wy, 5) ? ( ... OT branch ... ) :
    yyfgreaterequal(n._t11, 6) ? (
        _Dt(30378501),
        n._Sb1 = _Ft(n._Sb1, 968186802),
        n._Sb1[_Gt(n._0z)] = yyfplus(n._Sb1[_Gt(n._0z)], 2),    // V48: +2 to n._0z (was opposite of _UD)
        n._Vy = 1
    ) : ( ... regular branch ... );
    break;
```

`n._t11 == 6` → middle branch → +2 to the user's team. The pre-V48 code credited `_Sb1[opposite of n._UD]`, which worked in single-player by accident (engine had flipped `_UD` to the kickoff receiver earlier) but broke in 2P pick-6 (our bridge keeps `_UD = userTeamIdx`).

### 2.6 Post-PAT kickoff cascade

After the credit, `_._Vy = 1` (kickoff stage). The engine's natural cascade runs `_1c1` at `retrobowl.js:56446`:

```js
function _1c1(_, t) {
    _1j(_, t, "s_change_possession");
    var i = _si(71);
    for (var e in i) if (i.hasOwnProperty(e)) {
        var a = i[e];
        a._831 = "",
        a._t11 = 1,                              // down number reset to 1
        a._l61 = 10,                              // yards to go = 10
        a._6F = _Ri(-_Ri(a._6F)),                 // mirror yard line
        a._UD = yyGetBool(a._UD) ? 0 : 1,         // flip possession
        a._2c1 = a._Vy,                           // priorFsmStage = current Vy
        a._Vy = 2,                                // setup-play state
        a._8c1 = 0,
        a._Nb1 = yyfplus(a._Nb1, 1)               // increment drive counter
    }
}
```

The bridge's `_1c1` hook at [index.html:1518](index.html#L1518) wraps this. Pre-snapshot before original; original runs; post-snapshot after. If `pre.enginePossessingTeamIdx === userTeamIdx && post.enginePossessingTeamIdx !== userTeamIdx`, the user just lost possession → bridge ships a drive-end outcome to the opponent.

### 2.7 Commentary text — blanked

The engine's commentary FSM fires text strings during the PAT path. We blanked these in V41 (PAT-related) and V43 (2-PT related) by emptying the values in `html5game/LanguageUS.txt`:

```
comm_stage_PAT1               (empty — was "Point after touchdown...")
comm_stage_PAT2_Missed        (empty — was "Missed!")
comm_stage_PAT2_Scored        (empty — was "Scored!")
comm_stage_2pt_attempt        (empty — was "They go for 2 points...")
comm_stage_2pt_missed         (empty — was "But get stopped!")
comm_stage_2pt_scored         (empty — was "And score!")
```

These fire from commentary FSM cases 17, 18, 22, 23. With the strings blanked, the bubble text is empty (no visible bubble).

---

## 3. Pick-6 logic

A pick-6 is an INT thrown by the user, returned by the engine's defensive AI for a TD on the same play. In 2P this is the **only** scenario where the engine's AI does anything offensive-like (carrying the ball into the end zone). Per [CLAUDE.md](CLAUDE.md), there is NEVER engine-AI offense — but the pick-6 return is a defensive event that just happens to score, so it's allowed.

### 3.1 Device A (the thrower) — timeline

1. **Pass play, INT thrown.** Engine runs through normal INT logic.
2. **Defender returns INT for TD.** Engine credits the defender's team (`_._UD` is briefly the defender) +6 via `_hB` case 0 at `retrobowl.js:55369` (or the OT branch at 55941). A's `opponentScore` ticks up by 6.
3. **`_Ak1(_, t, 1)` fires.** `global._Bk1 = 1`, `_._kp = 3`, replay starts.
4. **Replay plays.** A's screen shows the return animation.
5. **`_i7` calls `_Ik1`.** `_Ik1` reads `global._Bk1`.
6. **Without bridge intervention:** `_Ik1` would call `_hB(_, t, 1)` → pops PAT modal on A's screen. **WRONG.** A didn't score; B did. A shouldn't pick the PAT.
7. **Bridge `_1c1` hook fires** (the wrap function at [index.html:1518](index.html#L1518)). Pre-snapshot before `_1c1`, post-snapshot after. Detects: A lost possession AND `opponentScore - opponentScoreAtDriveStart >= 6`.
8. **Pick-6 detection check at [index.html:1556](index.html#L1556):**
    ```js
    var isPick6 = (outcome.type === 'INT' && oppDelta >= 6);
    ```
9. **Bridge raises cascade flag** at [index.html:1589](index.html#L1589):
    ```js
    window._rb2p_pickSixPatCascadeActive = true;
    window._rb2p_pickSixPatCascadeRaisedMs = Date.now();
    ```
10. **V39 `global._Bk1` Object.defineProperty getter** (at [index.html:~2160](index.html#L2160)) now returns 0 instead of 1 while the cascade flag is on. When `_Ik1` reads `global._Bk1`, it sees 0 → routes to `_eb1(_, t, 0)` instead of `_hB(_, t, 1)`. **No PAT modal pops on A.**
11. **Bridge ships PICK6 outcome** via `window._twoPlayer.send(pickOutcome)` at [index.html:1609](index.html#L1609):
    ```js
    {
        type: 'PICK6',
        yardLine: 0, ownSide: true, needsPAT: true,
        scoreUser: engineMatchAfter.userScore,
        scoreOpp:  engineMatchAfter.opponentScore,
        quarter, minutesLeft, secondsLeft,
        fromTeam, toTeam, message: 'PICK SIX! Defensive touchdown.', ts
    }
    ```
12. **A's watchdogs suspend** for the cascade duration (30 s in V48). The setInterval possession clamp at [index.html:1795](index.html#L1795) and the commentary-script clamp at [index.html:1688-1697](index.html#L1688) both bypass when `_rb2p_pickSixPatCascadeActive === true`. A's engine state is left to the natural cascade — `_._UD` stays where the defensive return put it.
13. **30-second deadlock fallback** at [index.html:1611-1633](index.html#L1611): if the natural cascade stalls (e.g. AI-offense path was gutted somewhere downstream), A force-starts its next drive after 30 s. Emergency only.
14. **A waits for B's PAT result.** Eventually B ships a drive-end outcome (currently typed `'KICKOFF'`, not `'PAT_RESULT'` — see § 3.4) whose `scoreUser`/`scoreOpp` reflect B's post-PAT scores. A's `applyOpponentOutcome` mirrors them and starts A's next drive.

### 3.2 Device B (the scorer) — timeline

1. **B is in WAIT mode.** B's drive-end watchdog at [index.html:1735](index.html#L1735) is suppressed by `_rb2p_userIsWaitingForOpponent`. B's screen shows the wait overlay (or with V32, just the field; overlay is no-op for visuals).
2. **Firebase delivers A's PICK6 outcome** via the listener at [index.html:3007](index.html#L3007). Enqueued to `_twoPlayer.pending`.
3. **B's poll loop drains** at [index.html:2675-2701](index.html#L2675), calls `applyOpponentOutcome(outcome)`.
4. **PICK6 branch fires** at [index.html:2399-2486](index.html#L2399):
    ```js
    if (outcome.type === 'PICK6') {
        // Mirror scores
        if (typeof outcome.scoreUser === 'number') engineMatch.setOpponentScore(outcome.scoreUser);
        if (typeof outcome.scoreOpp  === 'number') engineMatch.setUserScore(outcome.scoreOpp);
        // Clock sync
        engineMatch.engineQuarter     = outcome.quarter;
        engineMatch.engineMinutesLeft = outcome.minutesLeft;
        engineMatch.engineSecondsLeft = outcome.secondsLeft;
        engineMatch.engineTickAllowance = 0;
        // Set flags
        window._rb2p_userIsWaitingForOpponent = true;          // ← see § 3.4, semantically wrong
        window._rb2p_userOutcomeSendInProgress = false;
        window._rb2p_pickSixPatCascadeActive = true;
        window._rb2p_pickSixPatCascadeRaisedMs = Date.now();
        // Engine state setup for the user-played PAT
        engineMatch.enginePossessingTeamIdx = engineMatch.engineUserTeamIdx;  // B owns the ball
        engineMatch.engineDownNumber       = 6;                                // PAT-pending
        engineMatch.engineYardsToGo        = 2;                                // 2-PT distance
        engineMatch.engineControllerState  = 2;                                // active play
        // Pop the PAT modal directly via _wm (the engine's own modal function)
        var popupsBeforeUserPatModal = enumeratePopupInstances();
        _wm(engineMatch.rawEngineMatch, _Sc2, "",
            _Xi(rawMatch, _Sc2, "matchmsg_PATor2"),
            _Xi(rawMatch, _Sc2, "match_1pt"),
            _Xi(rawMatch, _Sc2, "match_2pt"),
            100367, 100369, 16777215, 0.7);
        var popupsAfterUserPatModal = enumeratePopupInstances();
        // Capture the 5 newly-spawned popup instances into the killer whitelist
        window._rb2p_userPatPopupRefs = popupsAfterUserPatModal.filter(p => popupsBeforeUserPatModal.indexOf(p) === -1);
    }
    ```
5. **User plays the PAT.** Same flow as § 2.4 (1-PT) or § 2.5 (2-PT). The credit lines at `retrobowl.js:55964/55989/55990` use `n._0z` (B's team idx) per the V48 patch — so the +1 or +2 goes to B regardless of `_._UD`'s current value.
6. **Post-credit kickoff cascade runs.** `_1c1` fires, flips possession to A. B's `_1c1` hook detects possession-loss → builds drive-end outcome → ships to A. The outcome currently has `type: 'KICKOFF'` (or `'TD'`/`'FG'` if `inferUserDriveEndType` returns those for the priorFsmStage at the moment of `_1c1`).
7. **B enters its own wait state.** `_rb2p_userIsWaitingForOpponent = true` is re-set by the `_1c1` wrapper at [index.html:1637](index.html#L1637).

### 3.3 V-series edits relevant to pick-6

| Version | File | Line | Change | Why |
| --- | --- | --- | --- | --- |
| V32 | `index.html` | (removed) | Removed `rb-pick6-pat-modal` HTML + `patSimulate()` dice roll | Eliminated the 87.5/61.6% probability PAT path; B now plays the PAT through the engine-native modal |
| V39 | `index.html` | ~2160 | Installed `global._Bk1` Object.defineProperty getter | Returns 0 during cascade so `_Ik1` routes to `_eb1(_, t, 0)` instead of popping the PAT modal on A |
| V41 | `LanguageUS.txt` | 116-118 | Blanked `comm_stage_PAT1`, `_PAT2_Missed`, `_PAT2_Scored` | Suppress auto-fired engine PAT commentary text |
| V42 | `retrobowl.js` | 55441 | `yyGetBool(_dq(8))` → `yyGetBool(0)` | Kill the 87.5% dice-roll PAT auto-credit at case 18 |
| V43 | `retrobowl.js` | 55560 | `yyfgreater(_dq(99), 60)` → `yyfgreater(99, 60)` | Kill the 61% dice-roll 2-PT auto-credit at case 23 |
| V43 | `LanguageUS.txt` | 128-130 | Blanked 2-PT commentary | Suppress auto-fired engine 2-PT commentary |
| V47 (superseded by V48) | `retrobowl.js` | 55964 | `_Sb1[opposite of _UD]` → `_Sb1[_UD]` | Failed first attempt — flipped which timing regime broke |
| V48 | `retrobowl.js` | 55964, 55989, 55990 | `_UD` → `_0z` | Credit user's invariant team idx on this device, independent of `_UD` value |
| V48 | `index.html` | ~1841 | Cascade hold 6000 ms → 30000 ms | Keep V39 `_Bk1` suppressor armed long enough to block second engine PAT modal pop |

### 3.4 Remaining fragility (NOT FIXED THIS PASS)

These are known semantic problems still in the code as of V48. They have not surfaced as user-visible bugs in current playtesting, but they're walking gunpowder.

**A. `_rb2p_userIsWaitingForOpponent = true` is set on B at [index.html:2406](index.html#L2406) while B is about to actively play the PAT.** Semantically wrong: B is NOT waiting for the opponent — B is about to take a snap. The flag is used by the possession clamps to decide whether to force `_UD = opponent` or `_UD = user`. While the cascade flag is held (V48: 30 s), the clamps bypass and don't fire. Once the cascade clears, the clamps resume and immediately force `_UD = opponent` based on this misleading flag.

**B. Cascade hold is time-based, not event-based.** V48 set it to 30 s as a "should be enough" estimate. Failure modes:
- Browser-tab backgrounding throttles `setInterval` to 1 Hz on most browsers. 30 s wall-clock can become several minutes in real time.
- A slow user (or paused play) can exceed 30 s. The cascade clears mid-play, clamps resume, `_UD` flips to opponent. V48's `_0z`-based credit still credits the right team, but the live-sync gate (§ 1.6) flips to "user on defense" and the opponent's live-sync push can overwrite the just-credited score.

**C. The live-sync gate at [index.html:3074](index.html#L3074) is NOT V48-patched.** It still uses `_UD !== _0z` to decide "am I on defense?" If `_UD` is opponent (because of the clamp), the gate is open during B's PAT scene, and A's live-sync push from before B's credit can overwrite B's `_Sb1`. V48 fixed where the engine writes scores but not which live-sync writes are accepted.

**D. `'PAT_RESULT'` outcome type is consumed but never produced.** The handler at [index.html:2321](index.html#L2321) processes `outcome.type === 'PAT_RESULT'` and calls `_rb2p_applyOpponentPatResult`, but no code path actually creates such an outcome. B's post-PAT drive-end ships under whatever type `inferUserDriveEndType(prevVy)` returns — typically `'KICKOFF'` (priorFsmStage `1` post-PAT). A's PICK6 path expects `'PAT_RESULT'` semantically, so the reconciliation is happening via the wrong code branch on the receive side. Currently this works because the score-mirror logic in the generic branch is the same as the PAT_RESULT branch, but the comments and intended architecture say otherwise.

**E. Popup-killer whitelist depends on synchronous `_wm` spawn.** [index.html:2441-2453](index.html#L2441) does an enumerate-diff to identify the 5 popup instances `_wm` just created. If `_wm` defers any of them across a frame boundary, the diff returns fewer than 5 refs. With V38's safe-mode, an empty whitelist makes the killer bail entirely — so an unauthorized duplicate modal would survive instead of being destroyed.

**F. PICK6 detection on A is heuristic, not verified — see § 3.5.**

### 3.5 Pick-6 detection gap (DOCUMENTED-ONLY, NOT FIXED)

The detection logic at [index.html:1556](index.html#L1556):

```js
var oppDelta = oppNow - oppStart;
var isPick6 = (outcome.type === 'INT' && oppDelta >= 6);
```

**This is two heuristics AND-ed, not a verified engine event.**

**Failure modes:**

1. **`outcome.type === 'INT'` depends on `inferUserDriveEndType(prevVy)` returning `'INT'`.** That function reads `_._2c1` (priorFsmStage) at the moment of `_1c1`. Maps `_Vy = 8` → `'INT'`. If the engine routed through a different priorFsmStage for an interception-return-TD (depends on internal cascade timing), the type would be wrong → false negative, pick-6 not detected, engine PAT modal pops on A's screen.

2. **`oppDelta >= 6` depends on `_rb2p_opponentScoreAtDriveStart` being correctly captured.** This baseline is set in `forceUserOffenseDrive` (and a few other places). Failure modes:
    - After a re-join, the baseline may never be set → `oppStart = 0` → any opp score change triggers pick-6.
    - If opp scored some other way during the drive (extremely rare in normal play, but conceivable), `oppDelta` is contaminated.

3. **Nothing checks the actual engine event.** The bridge never reads `_Ak1`'s argument (which would be 1 for a TD replay), never reads `global._Bk1` (which would be 1 for "TD scored"), and never checks which team got the `+6` credit at line 55369. Pick-6 detection is purely inferential from drive-end state, not confirmed against the engine's own scoring event.

**Better signals for a future fix:**
- Hook `_Ak1` to record (timestamp, arg) of every call. At drive-end, check whether the most recent `_Ak1` arg was 1 AND the call was recent (within 5 s).
- Read `global._Bk1` directly at drive-end (before the V39 suppressor activates). If it's 1, the engine fired a TD-replay.
- Check that the `+6` credit landed on `_Sb1[opposite of _0z]` (the defender's team idx), confirming the score went to the defense.

Per the user's direction on 2026-05-18, this gap is **documented in this file but not fixed in this pass**.

---

## 4. Bridge intercepts — exhaustive list

These are the bridge-side hooks and watchdogs that interact with PAT / scoreboard flow. If you add a new fix, check whether it should bypass these or be gated by them.

| Location | Name | What it does | When bypassed |
| --- | --- | --- | --- |
| [index.html:1508](index.html#L1508) | `hookEngineChangePossessionScript` | Wraps `_1c1`. Builds drive-end outcome on user possession-loss. | (never bypasses — always wraps) |
| [index.html:1666](index.html#L1666) | `hookEngineCommentaryScript` | Wraps `_Ib1`. Clamps `enginePossessingTeamIdx` based on `_userIsWaitingForOpponent`. | When `_rb2p_pickSixPatCascadeActive === true` |
| [index.html:1732](index.html#L1732) | Drive-end stuck watchdog | Force-fires `_1c1` if FSM hangs at `_Vy` in `{4, 10, 11}` for >1.5s. | When `_rb2p_userIsWaitingForOpponent === true` |
| [index.html:1795](index.html#L1795) | Possession setInterval clamp (100 ms) | Forces `_UD` to match `_userIsWaitingForOpponent` semantic. | When `_rb2p_pickSixPatCascadeActive === true` |
| [index.html:1823](index.html#L1823) | Cascade-completion watcher (150 ms) | Clears `_rb2p_pickSixPatCascadeActive` after 30 s if conditions met. | (clearing logic only) |
| [index.html:~1965](index.html#L1965) | Popup-killer (rAF) | Destroys unauthorized PopUps-layer instances. | When `_rb2p_pickSixPatCascadeActive !== true` OR whitelist empty (V38 safe-mode) |
| [index.html:~2026](index.html#L2026) | PAT-modal dedup (rAF) | Kills duplicate PAT modals identified by `_0G ∈ {100367, 100369}`. | (always runs) |
| [index.html:~2160](index.html#L2160) | `global._Bk1` Object.defineProperty getter | Returns 0 instead of stored value during cascade. | (returns stored value when cascade is off) |
| [index.html:2244](index.html#L2244) | `applyOpponentOutcome` | Receive-side outcome dispatcher. PICK6 branch at line 2399. PAT_RESULT branch at line 2321 (currently dead — see § 3.4 D). | (always runs) |
| [index.html:3014](index.html#L3014) | Live-sync push (500 ms) | Pushes `{myScore, oppScore, clock, ts}` to Firebase. | (always runs) |
| [index.html:3055](index.html#L3055) | Live-sync receive (`onValue`) | Mirrors opponent's scores when `userIsOnDefense`. | When `_UD === _0z` (gate closed) |

---

## 5. Existing diagnostic helpers in the bridge

Don't write new diagnostics — these already exist. Paste into DevTools console:

- `_rb2p_dumpState()` ([index.html:2087](index.html#L2087)) — full state snapshot (engine match, flags, counters)
- `_rb2p_dumpAllPopups()` ([index.html:2113](index.html#L2113)) — every popup-layer instance + authorized status
- `_rb2p_dumpAllInstances()` ([index.html:2123](index.html#L2123)) — every live engine instance grouped by type
- `_rb2p_killAllPopups()` ([index.html:2133](index.html#L2133)) — manual nuke
- `_rb2p_enumeratePopupInstances()` — enumerator used by all the above
- `_rb2p_verifyV48()` ([index.html:2150](index.html#L2150)) — verify V48 patches are deployed + simulate credit math
- `_rb2p_engineBk1ReadCount` / `_rb2p_engineBk1SuppressCount` — counters for V39 suppressor

---

## 6. Conventions for future fixes

- **Don't write new diagnostic functions.** Add to the helpers in § 5 if needed.
- **Don't write new setInterval watchdogs that touch `_UD`.** V45 demonstrated this causes engine-cascade re-entry and modal re-spawn.
- **Don't fight the engine cascade timing.** Use source-level interception (like V39's `_Bk1` getter) or invariant-based scoring (like V48's `_0z` patch) instead.
- **Bridge boundary is `m._UD`, `m._Sb1`, etc. via the wrapper at [index.html:835](index.html#L835).** Don't write `m._UD = ...` in new code; use `engineMatch.enginePossessingTeamIdx = ...`.
- **Engine internal symbols (`_UD`, `_Sb1`, `_0z`, `_t11`, `_Vy`, `_kp`, etc.) are closure-scoped and cannot be renamed.** The bridge renames provide friendlier aliases.
- **Bump the `V<N>` label** per CLAUDE.md on every commit. Always commit + push so Vercel deploys.

---

*Last updated for V48 (`eeb5bcd`). If line numbers drift, run `/pick-six-research verify` to see what moved.*
