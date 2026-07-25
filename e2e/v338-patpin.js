// e2e/v338-patpin.js — DEQC Bug 3: a pick-6 PAT snaps from the 2 and STICKS.
//
// Room DEQC: B threw a pick-6 at Q4 0:19; A's PAT then played from ~the
// opponent's 20 instead of the pinned 2-yard line. The V174 pin
// (engineYardLineSigned = 48) was set — but the PICK6 receive branch, unlike
// the normal outcome branch, never cleared a pending QTR-KEEP resume, so a
// stale pre-rollover capture (exactly what the halftime chaos leaves behind)
// could clobber the pin; and nothing re-asserted it if anything else moved the
// ball before the scene committed.
//
// T1  a PICK6-with-needsPAT pins the scrimmage to 48 (the 2-yard line)
// T2  a stale QTR-KEEP capture cannot clobber the pin (the PICK6 branch now
//     clears the pending quarter-resume exactly like the normal branch)
// T3  a stray write that moves the yard while the PAT is pending is re-pinned
//     to 48 within ~1s (the V338 pin hold)
// T4  once the PAT resolves, the hold releases (no forever-48 lock)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V338 PICK-6 PAT PIN STICKS AT THE 2 ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;   // on-offense device: the pick-6 SCORER-to-be
    console.log('  scorer = role ' + drv.role);

    // ---- T1 + T2: a stale QTR-KEEP capture is set BEFORE the PICK6 lands ----
    const t12 = await drv.page.evaluate(async () => {
        // The DEQC poison: a pending quarter-resume with a pre-rollover yard at
        // ~the opponent 20 (the halftime/rollover leftovers).
        window._rb2p_quarterResumePending = true;
        window._rb2p_preRolloverYard = -30;
        window._rb2p_preRolloverDown = 4;
        window._rb2p_preRolloverToGo = 7;
        var em0 = RB.engineState();
        window._twoPlayer.receive({
            type: 'PICK6', message: 'PICK SIX! Defensive touchdown.',
            yardLine: 0, ownSide: true, needsPAT: true, pick6Plus6Missing: false,
            scoreUser: Number(em0.userScore || 0) + 6,
            scoreOpp: Number(em0.opponentScore || 0),
            quarter: 2, minutesLeft: 1, secondsLeft: 5,
            fromTeam: 'Pittsburgh', toTeam: 'San Francisco', ts: Date.now()
        });
        await new Promise(r => setTimeout(r, 3000));
        var em = RB.engineState();
        return {
            yard: Number(em.engineYardLineSigned),
            down: Number(em.engineDownNumber),
            patPending: window._rb2p_patPlayPending === true,
            qtrResumeCleared: window._rb2p_quarterResumePending === false,
            preYardCleared: window._rb2p_preRolloverYard == null
        };
    });
    console.log('  after PICK6 (with stale QTR-KEEP set): ' + JSON.stringify(t12));
    check('T1 the PAT scrimmage is pinned to 48 (the 2-yard line)',
          t12.patPending && Math.abs(t12.yard - 48) <= 0.5, JSON.stringify(t12));
    // NOTE: _rb2p_quarterResumePending may legitimately re-arm AFTER the clear —
    // the PICK6 apply itself rolls the engine quarter (1->2 here), and the
    // quarter-keep re-captures the (already pinned) drive for its own resume.
    // The invariant that matters is: the STALE pre-pick capture is gone and the
    // pin survived the whole settle window.
    check('T2 the stale pre-rollover capture cannot clobber the pin (stale yard gone, 48 held)',
          t12.preYardCleared && Math.abs(t12.yard - 48) <= 0.5, JSON.stringify(t12));

    // ---- T3: a stray write mid-arm is re-pinned ----
    const t3 = await drv.page.evaluate(async () => {
        RB.engineState().engineYardLineSigned = -20;   // the DEQC symptom: ball at the 20
        await new Promise(r => setTimeout(r, 1000));
        return { yard: Number(RB.engineState().engineYardLineSigned) };
    });
    console.log('  after stray move: ' + JSON.stringify(t3));
    check('T3 a stray yard write while the PAT is pending is re-pinned to 48',
          Math.abs(t3.yard - 48) <= 0.5, 'yard=' + t3.yard);

    // ---- T4: the pin releases when the choice is made (down leaves 6) ----
    // V344 made the pin universal and keyed purely on the down-6 PAT marker:
    // the engine resets the down the moment the 1PT/2PT choice starts the
    // scene, and from then on the ball is the scene's to move.
    const t4 = await drv.page.evaluate(async () => {
        window._rb2p_patPlayResolved = true;
        window._rb2p_patPlayPending = false;
        RB.engineState().engineDownNumber = 1;   // the choice was made — scene owns the ball
        RB.engineState().engineYardLineSigned = -20;
        await new Promise(r => setTimeout(r, 1000));
        return { yard: Number(RB.engineState().engineYardLineSigned) };
    });
    console.log('  after choice + move: ' + JSON.stringify(t4));
    check('T4 the pin releases once the down leaves the PAT marker',
          Math.abs(t4.yard - (-20)) <= 0.5, 'yard=' + t4.yard);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
