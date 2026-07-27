// e2e/v354-puntkeep.js — a drive you have PUNTED AWAY is never yours to keep.
//
// Device report (room VIYG, V353): "a sack made it 4th and 23 in the 3rd, I
// punted, got sent to my own 10 — and I got possession BACK after the punt."
//
// Cause: the Q1->Q2 / Q3->Q4 quarter-keep asks "does the user have the ball?"
// by reading the ENGINE's possessing-team register. The bridge parks this
// device the instant a punt is sent, but the engine's register lags — and
// V352b's universal 4s send hold widens that window enormously (7% of a
// 1-minute quarter). A quarter roll inside that window made the keep restore
// the PUNTING team's drive.
//
// T1  a quarter roll while the punt is parked does NOT arm the keep
// T2  ...and it is logged, so a real occurrence is on record
// T3  a quarter roll while the send is still in flight does NOT arm it either
// T4  a genuine keep (we really do have the ball, not parked) still arms
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function rollToQ4(page, opts) {
    return page.evaluate(async (o) => {
        var em = RB.engineState();
        window._rb2p_quarterResumePending = false;
        window._rb2p_userIsWaitingForOpponent = o.parked;
        window._rb2p_userOutcomeSendInProgress = o.sending;
        // the engine still believes WE possess (the lag this bug lives in)
        em.enginePossessingTeamIdx = em.engineUserTeamIdx;
        window._rb2p_lastStableQuarter = 3; window._rb2p_wireQuarter = 3;
        em.engineQuarter = 3;
        await new Promise(r => setTimeout(r, 350));
        em.engineQuarter = 4;                       // the Q3 -> Q4 roll
        await new Promise(r => setTimeout(r, 600));
        return { armed: window._rb2p_quarterResumePending === true,
                 log: (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : [])
                        .filter(function (l) { return /QTR-KEEP refused/.test(l); }).length };
    }, opts);
}

(async () => {
    console.log('=== V354 A PUNTED-AWAY DRIVE IS NEVER KEPT ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        const t1 = await rollToQ4(page, { parked: true, sending: false });
        console.log('  parked (punt sent):    ' + JSON.stringify(t1));
        check('T1 a quarter roll while parked does NOT arm the keep', t1.armed === false, JSON.stringify(t1));

        // (No diag line is expected in T1: by the time that roll lands the engine's
        // own possessing-team register has usually flipped too, so the keep never
        // even considers us. The refusal — and its log line — is for the window
        // where the engine still says we possess but the bridge has handed off,
        // which is exactly T3.)
        const t3 = await rollToQ4(page, { parked: false, sending: true });
        console.log('  send in flight:        ' + JSON.stringify(t3));
        check('T3 a quarter roll while the send is in flight does NOT arm it', t3.armed === false, JSON.stringify(t3));
        check('T2 the refusal is recorded in the diag when it applies', t3.log > 0, JSON.stringify(t3));

        const t4 = await rollToQ4(page, { parked: false, sending: false });
        console.log('  genuinely on offense:  ' + JSON.stringify(t4));
        check('T4 a genuine keep (really on offense) still arms', t4.armed === true, JSON.stringify(t4));
    } catch (e) {
        console.error('ERROR mid-test:', e && e.message); fail++;
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
