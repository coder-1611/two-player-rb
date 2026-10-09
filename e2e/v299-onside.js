// e2e/v299-onside.js — verify the onside-kick offer can no longer break a match.
//
//   node e2e/v299-onside.js
//
// THE BUG (device-reported; corroborated by room KSKC telemetry "vy:25 ball:0
// OF:0 DF:0"): in Q4, while losing, the engine offered "ONSIDE KICK?". Success is
// hard-forced to 0, so "Yes" always took the FAIL branch — which calls _1c1,
// flipping possession and negating the yard line while spawning NO field. Stages
// 25/27/28/29 are absent from deadEngineFsmStages so no watchdog force-ended
// them, and the bridge's possession clamp then handed the ball back to the local
// user: an empty field for the kicker, and BOTH devices on offense after a
// refresh.
//
// THE FIX: both onside ENTRY conditions in retrobowl.js are now `false &&`, so
// the FSM falls through to the normal kickoff (_Zb1/_l41). This test drives a
// real two-page match into the exact offer preconditions and asserts the onside
// path is never entered.
//
// T1  static: both entry conditions are neutralised, forced-0 patch still intact
// T2  the offer preconditions (Q4 + losing + possessing + low clock) never
//     produce an onside stage and never spawn the modal
// T3  possession stays sane — never both devices on offense
// T4  the stale-engine safety net recovers a forced onside park

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  PASS  ' + name); }
    else    { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

async function engineView(page) {
    return page.evaluate(() => {
        let s = {};
        try { s = RB.engineState() || {}; } catch (e) {}
        let popups = 0;
        try {
            popups = (window._rb2p_enumeratePopupInstances &&
                      window._rb2p_enumeratePopupInstances().length) || 0;
        } catch (e) {}
        return {
            vy: Number(s.engineDriveFsmStage),
            q: Number(s.engineQuarter),
            waiting: window._rb2p_userIsWaitingForOpponent === true,
            hasBall: s.enginePossessingTeamIdx === s.engineUserTeamIdx,
            popups: popups
        };
    });
}

(async () => {
    console.log('=== V299 ONSIDE-KICK VERIFICATION ===');

    // ---------------- T1: static check on the engine patch ----------------
    const eng = fs.readFileSync(path.resolve(__dirname, '..', 'retrobowl.js'), 'utf8');
    function guardedBefore(marker) {
        const i = eng.indexOf(marker);
        return i > 0 && eng.slice(Math.max(0, i - 1500), i).includes('false &&');
    }
    check('T1 human onside offer (_Vy = 25) is behind a false guard',
          guardedBefore('_._Vy = 25'));
    check('T1 opponent onside branch (_Vy = 27) is behind a false guard',
          guardedBefore('_._Vy = 27'));
    check('T1 onside success chance is still forced to 0',
          eng.includes('onside success chance forced to 0') &&
          eng.includes('yyfless(_dq(99), 0)'));
    check('T1 the normal-kickoff fallthrough is still present',
          eng.includes('(_Zb1(_, t),') || eng.includes('_Zb1(_, t),'));

    // ---------------- live match ----------------
    const g = await TP.startTwoPlayerGame({});
    await sleep(4000);
    const aWaiting = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWaiting ? g.b : g.a;
    const wtr = aWaiting ? g.a : g.b;
    console.log('driver = ' + drv.label + ', waiter = ' + wtr.label);

    // ---------------- T2: force the offer preconditions ----------------
    // The offer fires when: local user possesses, Q4, user losing/tied, low clock.
    // Put the driver in exactly that state and let the FSM tick.
    await drv.page.evaluate(() => {
        const s = RB.engineState();
        s.engineQuarter = 4;
        s.setUserScore(7); s.setOpponentScore(21);   // losing
        s.engineMinutesLeft = 0; s.engineSecondsLeft = 30;
        s.engineTickAllowance = 0;
        window.__onsideSeen = [];
        window.__onsidePopupMax = 0;
        setInterval(function () {
            try {
                const e = RB.engineState();
                const v = Number(e.engineDriveFsmStage);
                if (v === 25 || v === 27 || v === 28 || v === 29) window.__onsideSeen.push(v);
                const n = (window._rb2p_enumeratePopupInstances &&
                           window._rb2p_enumeratePopupInstances().length) || 0;
                if (n > window.__onsidePopupMax) window.__onsidePopupMax = n;
            } catch (e2) {}
        }, 100);
    });

    // Drive the kickoff cascade repeatedly — this is the window the offer used to
    // appear in. Re-assert the preconditions each round so it has every chance.
    for (let i = 0; i < 8; i++) {
        await drv.page.evaluate(() => {
            const s = RB.engineState();
            s.engineQuarter = 4;
            s.setUserScore(7); s.setOpponentScore(21);
            s.engineMinutesLeft = 0; s.engineSecondsLeft = 30;
            s.engineDriveFsmStage = 1;              // COMM_STAGE kickoff
            try {
                const f = RB.getEngineScript('gml_Script_s_update_commentary');
                if (typeof f === 'function') f(s.rawEngineMatch, _Sc2);
            } catch (e) {}
        });
        await sleep(700);
    }
    await sleep(1500);

    const seen = await drv.page.evaluate(() => ({
        stages: window.__onsideSeen || [], popMax: window.__onsidePopupMax || 0
    }));
    check('T2 no onside FSM stage (25/27/28/29) was ever entered',
          seen.stages.length === 0,
          'saw ' + JSON.stringify(seen.stages));
    check('T2 no onside modal spawned',
          seen.popMax === 0,
          'max popup instances = ' + seen.popMax);

    // ---------------- T3: possession stayed sane ----------------
    const d = await engineView(drv.page);
    const w = await engineView(wtr.page);
    check('T3 not both devices on offense',
          !(d.hasBall && !d.waiting && w.hasBall && !w.waiting),
          'driver hasBall=' + d.hasBall + '/wait=' + d.waiting +
          '  waiter hasBall=' + w.hasBall + '/wait=' + w.waiting);
    check('T3 driver is not parked on an onside stage',
          !(d.vy === 25 || d.vy === 27 || d.vy === 28 || d.vy === 29),
          'vy=' + d.vy);

    // ---------------- T4: stale-engine safety net ----------------
    // Force the park a cached engine could still reach, and confirm the watchdog
    // recovers it to the kickoff stage instead of hanging forever.
    await drv.page.evaluate(() => { RB.engineState().engineDriveFsmStage = 25; });
    await sleep(4500);   // watchdog: 3s dwell + a 500ms tick
    const after = await engineView(drv.page);
    check('T4 forced Vy=25 park is recovered (no longer an onside stage)',
          after.vy !== 25,
          'vy is still ' + after.vy);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
