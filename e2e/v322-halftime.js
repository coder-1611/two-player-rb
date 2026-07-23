// e2e/v322-halftime.js — a missed FG at halftime must not strand A on offense
// in Q2 while B plays Q3.
//
// Device report (room DBEK, matched V321): after a missed field goal at the
// Q2→Q3 boundary the two phones sat on DIFFERENT quarters (A in Q2, B in Q3),
// BOTH on offense. Root cause: the Q3 LAW (which sends A to WAIT so B receives
// the 2nd-half kickoff) only fired once A's OWN engine reached Q3 — but the
// missed FG left A stuck in Q2, so it never ran and A kept the ball.
//
// V322: the Q3 LAW also catches A up when the WIRE says the 2nd half has started
// (wireQuarter >= 3) while A is still on offense in a genuinely-finished Q2.
//
// T1  (static) the gate includes the role-A / q2 / wire>=3 catch-up
// T2  role A stuck in Q2 with the ball + wire says Q3 -> A relinquishes (WAIT) and jumps to Q3
// T3  role B in Q2 + wire says Q3 does NOT trigger the catch-up (B never relinquishes at half)
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function setupHalftime(page, role) {
    return page.evaluate((r) => {
        var em = RB.engineState();
        em.engineQuarter = 2;
        window._rb2p_wireQuarter        = 3;      // the opponent (wire) is in the 2nd half
        window._rb2p_lastStableQuarter  = 2;      // we genuinely finished Q2
        window._rb2p_myFirebaseRole     = r;
        window._rb2p_q3LawApplied       = false;
        window._rb2p_userIsWaitingForOpponent = false;   // we (wrongly) still hold the ball
        window._rb2p_patPlayPending     = false;
        window._rb2p_patPlayResolved    = false;
        window._rb2p_pickSixPatCascadeActive = false;
    }, role);
}
async function readState(page) {
    return page.evaluate(() => ({
        q: Number(RB.engineState().engineQuarter),
        waiting: window._rb2p_userIsWaitingForOpponent === true
    }));
}

(async () => {
    console.log('=== V322 MISSED-FG-AT-HALFTIME CATCH-UP ===');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

    // ---- T1 (static) ----
    const law = html.slice(html.indexOf('var q3Reached ='), html.indexOf('var q3Reached =') + 200);
    check('T1 the Q3 LAW gate has the role-A / q2 / wire>=3 catch-up',
          /role === 'a' && q === 2 && wireQ >= 3/.test(law), 'catch-up not found: ' + law.slice(0, 140));

    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        // ---- T2: role A catches up -> WAIT + Q3 ----
        await setupHalftime(page, 'a');
        await sleep(700);   // let the 200ms Q3-LAW interval fire
        const a = await readState(page);
        console.log('  role A after: ' + JSON.stringify(a));
        check('T2 role A relinquishes the ball (goes to WAIT)', a.waiting === true, 'A did not go to WAIT');
        check('T2 role A jumps to Q3 (no longer stuck in Q2)', a.q === 3, 'A quarter = ' + a.q);

        // ---- T3: role B must NEVER relinquish at the half (B receives the
        // 2nd-half kickoff). Its quarter may legitimately catch up to the wire via
        // the V323 monotonic floor, but it keeps the ball (does not go to WAIT).
        await setupHalftime(page, 'b');
        await sleep(700);
        const b = await readState(page);
        console.log('  role B after: ' + JSON.stringify(b));
        check('T3 role B is NOT forced to relinquish (keeps the ball at the half)',
              b.waiting === false, 'B was sent to WAIT: ' + JSON.stringify(b));
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
