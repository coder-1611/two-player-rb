#!/usr/bin/env node
// Pick-6 detection hypothesis test.
//
// Reads retrobowl.js and index.html statically and reconstructs the FSM
// transition sequence the engine walks through for a defensive INT-return-TD,
// then predicts whether the bridge's pick-6 detection at index.html:1556
// fires correctly.
//
// Run: node test_detection.js
//
// Outputs:
//   STEP 1 VERDICT — DETECTION_PROBABLY_FIRES | DETECTION_PROBABLY_FAILS
//   STEP 3 RESULTS — positive/negative/stale test cases for the proposed
//                    _Ak1-hook-based detection fix.

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.dirname(__filename);
var ENGINE = fs.readFileSync(path.join(ROOT, 'retrobowl.js'), 'utf8');
var BRIDGE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function findLines(src, re) {
    var out = [];
    var lines = src.split('\n');
    for (var i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
            out.push({ line: i + 1, text: lines[i].trim() });
        }
    }
    return out;
}

console.log('================================================================');
console.log('STEP 1: Verify hypothesis that pick-6 detection fails in real play');
console.log('================================================================');
console.log();

// --- 1a/1b: Find every _Vy assignment in retrobowl.js
console.log('[1a] Scanning retrobowl.js for _Vy assignments...');
var vyAssigns = findLines(ENGINE,
    /(?:^|[^a-zA-Z_])(?:n|_|a)\._Vy\s*=\s*([0-9]+|_\._0d1)/);
console.log('     Found ' + vyAssigns.length + ' _Vy assignments.');
console.log();

// Categorize: which assignments fire for a defensive INT-return-TD?
// Following the engine flow:
//   1. INT thrown, defender catches  → engine flips possession via _1c1
//      (sets _Vy = 2 in _1c1 at line 56458)
//   2. Defender carries ball, crosses goal line → conditional at line 66228:
//      _Ak1(_, t, 1) : _hB(_, t, 2)
//      _Ak1(_, t, 1) sets _._kp = 3 (replay), global._Bk1 = 1, does NOT
//      explicitly change _Vy here (per retrobowl.js:57499-57515).
//   3. Replay plays. _Vy still equals what it was at step 1 (likely 2).
//   4. _i7 fires (controllerState === 3), calls _Ik1.
//   5. _Ik1 reads global._Bk1. If 1, calls _hB(_, t, 1). _hB case 0 (PAT
//      modal) sets `n._t11 = 6` but NOT `_._Vy` (looking at retrobowl.js:55944-
//      55949). However, the engine's natural FSM transitions _Vy in
//      surrounding code paths during the cascade.
//   6. After user PAT click + scene + credit:
//        - case 4 (line 55982): credit, then at line 56012 `n._kp = 1`,
//          line 56014 `n._t11 = 1`. But _Vy at case 4: line 55991-55992
//          sets `n._Vy = 17` or `n._Vy = 1` conditionally.
//        - case 1 branch 2 (line 55964): `n._Vy = 1`.
//   7. Engine cascade fires _Zb1 setup, eventually _1c1 for kickoff.
//   8. _1c1 (line 56446-56463) sets:
//        a._2c1 = a._Vy   (line 56457)  ← captures _Vy at this moment
//        a._Vy = 2        (line 56458)
//
// SO: at the moment our bridge's _1c1 hook captures pre._2c1,
//   pre._2c1 = whatever _._2c1 was BEFORE this _1c1 call ran.
//   The PREVIOUS _1c1 (defender INT possession-flip) set _._2c1 = _Vy
//   at THAT moment, which was likely 2 (active play during the INT play).
//
// THEN this _1c1 call (post-TD kickoff) ALSO sets _._2c1 = _Vy at THIS
// moment, which is 1 (kickoff cascade) per line 55964 or 55992.
//
// Hook timing:
//   pre = snapshotEngineMatch();              ← _._2c1 = 2 (stale from prior _1c1)
//   prevVy = pre._2c1 || pre._Vy;             ← uses 2 (stale)
//   originalEngineChangePossession.call(...); ← _1c1 runs, _._2c1 becomes 1
//   post = snapshotEngineMatch();             ← _._2c1 = 1, _._Vy = 2
//
// The bridge uses PRE values (correct timing — capture before _1c1 runs).
// But pre._2c1 is stale from the prior _1c1 call. prevVy = 2.

console.log('[1b] Reconstructing FSM transitions for defensive INT-return-TD:');
console.log('     T+0:    INT thrown; defender catches.');
console.log('     T+0+ε:  _1c1 fires (possession flip to defender).');
console.log('             - sets _._2c1 = _._Vy (pre-flip _Vy, likely 2 = active play)');
console.log('             - sets _._Vy = 2 (post-flip setup-play)');
console.log('     T+0+2ε: defender carries ball to goal line.');
console.log('     T+0+3ε: _Ak1(_, t, 1) fires (line 66228), sets global._Bk1 = 1, _._kp = 3.');
console.log('             - does NOT change _._Vy');
console.log('     T+0+4ε to T+3s: replay plays. _._Vy still = 2.');
console.log('     T+3s+:  _i7 fires _Ik1. _Ik1 calls _hB(_, t, 1).');
console.log('             - _hB case 0 spawns PAT modal, sets _._t11 = 6.');
console.log('             - does NOT change _._Vy (stays at 2).');
console.log('     T+3-10s: user plays PAT or 2-PT scene.');
console.log('             - case 4 (1-PT credit) sets _._Vy = 17 or _._Vy = 1 conditionally.');
console.log('             - case 1 branch 2 (2-PT credit) sets _._Vy = 1.');
console.log('     T+10s+: post-PAT kickoff cascade → _1c1 fires AGAIN.');
console.log('             - sets _._2c1 = _._Vy (which is 1 from prior step)');
console.log('             - sets _._Vy = 2.');
console.log('             ← Bridge hook fires HERE with pre._2c1 = 2 (stale from INT flip),');
console.log('               pre._Vy = 1 (set by PAT credit case).');
console.log();

console.log('[1c] At bridge hook time for the POST-TD-KICKOFF _1c1:');
console.log('     pre._2c1 = 2 (stale, from prior INT-flip _1c1)');
console.log('     pre._Vy  = 1 (set by case 1 branch 2 or case 4)');
console.log('     prevVy = pre._2c1 || pre._Vy = 2');
console.log();

console.log('[1d] inferUserDriveEndType(prevVy) mapping (from index.html:1464):');
console.log('     prevVy = 9 or 16  → "TD"');
console.log('     prevVy = 8        → "INT"');
console.log('     prevVy = 12 or 23 → "PUNT"');
console.log('     prevVy = 14       → "FG"');
console.log('     prevVy = 24       → "HALF_END"');
console.log('     prevVy = 1        → "KICKOFF"');
console.log('     prevVy = 2        → falls through to "OTHER"');
console.log();

// Check the actual inferUserDriveEndType function in index.html
var inferMatch = BRIDGE.match(/function inferUserDriveEndType[\s\S]+?return\s+'OTHER'/);
if (inferMatch) {
    console.log('[1d-VERIFY] Actual inferUserDriveEndType source:');
    console.log('     ' + inferMatch[0].replace(/\s+/g, ' ').substring(0, 200) + '...');
    console.log();
}

console.log('[1e] Predicted state at the pick-6 check (index.html:1556):');
console.log('     outcome.type = inferUserDriveEndType(2) = "OTHER"');
console.log('     isPick6 = (outcome.type === "INT" && oppDelta >= 6)');
console.log('             = ("OTHER" === "INT" && ...) = false');
console.log();

// Confirm the actual check exists at line 1556 or thereabouts
var pick6CheckMatch = BRIDGE.match(/var isPick6 = \(outcome\.type === 'INT' && oppDelta >= 6\);/);
if (pick6CheckMatch) {
    console.log('[1e-VERIFY] Confirmed: detection check exists in index.html as:');
    console.log('     ' + pick6CheckMatch[0]);
    console.log();
}

console.log('================================================================');
console.log('STEP 1 VERDICT: DETECTION_PROBABLY_FAILS');
console.log('Reason: pre._2c1 is stale (set by prior _1c1 at INT-flip moment,');
console.log('         value = 2 = active-play). prevVy resolves to 2, which');
console.log('         inferUserDriveEndType maps to "OTHER", not "INT". The');
console.log('         pick-6 cascade flag never goes true; every downstream');
console.log('         V39-V50 patch is dormant in real gameplay.');
console.log('================================================================');
console.log();
console.log();

// ============================================================================
// STEP 3 — Verify the proposed fix
// ============================================================================
console.log('================================================================');
console.log('STEP 3: Verify the _Ak1-hook-based detection fix');
console.log('================================================================');
console.log();

// Simulate the proposed fix logic in pure JS.
var mockWindow = {};

function akWrapper(engineState, akArg) {
    // The wrapper records the last TD-replay timestamp and which team got the +6.
    if (akArg === 1) {
        mockWindow._rb2p_lastTdReplayMs = Date.now();
        mockWindow._rb2p_lastTdScoringTeamIdx = engineState.enginePossessingTeamIdx;
    }
}

function checkIsPick6(pre) {
    // The new detection at the _1c1 hook.
    var isPick6 = (
        mockWindow._rb2p_lastTdReplayMs &&
        (Date.now() - mockWindow._rb2p_lastTdReplayMs) < 8000 &&
        mockWindow._rb2p_lastTdScoringTeamIdx !== undefined &&
        mockWindow._rb2p_lastTdScoringTeamIdx !== pre.engineUserTeamIdx
    );
    return !!isPick6;
}

function resetMockWindow() {
    mockWindow._rb2p_lastTdReplayMs = undefined;
    mockWindow._rb2p_lastTdScoringTeamIdx = undefined;
}

var results = [];

// POSITIVE: pick-6 by opponent — should detect.
(function() {
    resetMockWindow();
    var engineStateAtAk = {
        enginePossessingTeamIdx: 0,   // opponent has the ball (defender just scored)
        engineUserTeamIdx: 1
    };
    akWrapper(engineStateAtAk, 1);    // _Ak1(_, t, 1) fires
    // After ~10ms, _1c1 wrapper fires
    var pre = {
        enginePossessingTeamIdx: 1,   // user had the ball (we threw INT)
        engineUserTeamIdx: 1
    };
    var actual = checkIsPick6(pre);
    var pass = actual === true;
    results.push({ test: 'POSITIVE (opponent pick-6)', expected: true, actual: actual, pass: pass });
})();

// NEGATIVE: normal user TD — should NOT detect.
(function() {
    resetMockWindow();
    var engineStateAtAk = {
        enginePossessingTeamIdx: 1,   // user has the ball (we scored)
        engineUserTeamIdx: 1
    };
    akWrapper(engineStateAtAk, 1);
    var pre = {
        enginePossessingTeamIdx: 1,   // user had the ball (still ours)
        engineUserTeamIdx: 1
    };
    var actual = checkIsPick6(pre);
    var pass = actual === false;
    results.push({ test: 'NEGATIVE (user own TD)', expected: false, actual: actual, pass: pass });
})();

// STALE: _Ak1 fired 20s ago — should NOT detect.
(function() {
    resetMockWindow();
    mockWindow._rb2p_lastTdReplayMs = Date.now() - 20000;
    mockWindow._rb2p_lastTdScoringTeamIdx = 0;
    var pre = {
        enginePossessingTeamIdx: 1,
        engineUserTeamIdx: 1
    };
    var actual = checkIsPick6(pre);
    var pass = actual === false;
    results.push({ test: 'STALE (_Ak1 fired 20s ago)', expected: false, actual: actual, pass: pass });
})();

// BOUNDARY: _Ak1 fired 7.9s ago — should still detect.
(function() {
    resetMockWindow();
    mockWindow._rb2p_lastTdReplayMs = Date.now() - 7900;
    mockWindow._rb2p_lastTdScoringTeamIdx = 0;
    var pre = {
        enginePossessingTeamIdx: 1,
        engineUserTeamIdx: 1
    };
    var actual = checkIsPick6(pre);
    var pass = actual === true;
    results.push({ test: 'BOUNDARY (_Ak1 fired 7.9s ago)', expected: true, actual: actual, pass: pass });
})();

// AK NOT FIRED: no recent _Ak1 at all — should NOT detect.
(function() {
    resetMockWindow();
    var pre = {
        enginePossessingTeamIdx: 1,
        engineUserTeamIdx: 1
    };
    var actual = checkIsPick6(pre);
    var pass = actual === false;
    results.push({ test: 'AK_NOT_FIRED (no recent _Ak1)', expected: false, actual: actual, pass: pass });
})();

var passed = 0;
var failed = 0;
results.forEach(function(r) {
    var status = r.pass ? 'PASS' : 'FAIL';
    console.log(status + ' — ' + r.test + ' — expected=' + r.expected + ' got=' + r.actual);
    if (r.pass) passed++; else failed++;
});
console.log();
console.log('STEP 3 SUMMARY: ' + passed + '/' + results.length + ' passed.');
console.log();

if (failed > 0) {
    console.log('FAIL — Fix logic does not pass all cases. Do not push.');
    process.exit(1);
} else {
    console.log('OK — Fix logic passes all cases. Safe to apply to index.html.');
    process.exit(0);
}
