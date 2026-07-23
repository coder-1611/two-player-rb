// e2e/v323-monotime.js — UNIVERSAL rule: game quarter time only moves forward.
//
// Device report: "the time flow is buggy, sometimes it shifts back quarters."
// V323 adds a monotonic FLOOR to the quarter governor: the engine quarter may
// never drop below the highest one legitimately reached (a quarter stably played
// here, or the wire-authoritative opponent quarter). It's reset at match start.
//
// T1  (static) the governor has the backwards-guard
// T2  a quarter shoved BACKWARDS below the floor is restored (the fix)
// T3  a legitimate quarter at/above the floor is left alone
// T4  a burst roll ahead is still clamped back (existing guard intact)
// T5  a fresh match (Q1, floor reset) is NOT clamped up to a stale floor
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Set the floor + engine quarter, disable the Q3 LAW / OT so only the governor
// acts, wait for the 16ms governor tick, and read back the quarter.
async function run(page, opts) {
    return page.evaluate(async (o) => {
        window._rb2p_inOvertime   = false;
        window._rb2p_myFirebaseRole = null;      // disable the Q3-LAW catch-up
        window._rb2p_q3LawApplied = true;
        window._rb2p_lastStableQuarter = o.stable;
        window._rb2p_wireQuarter       = o.wire;
        RB.engineState().engineQuarter = o.set;
        await new Promise(f => setTimeout(f, 120));   // several 16ms governor ticks
        return Number(RB.engineState().engineQuarter);
    }, opts);
}

(async () => {
    console.log('=== V323 QUARTER TIME ONLY MOVES FORWARD ===');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

    // ---- T1 (static) ----
    check('T1 the governor has the backwards-guard (gBase>=2 && gq<gBase)',
          /if \(gBase >= 2 && gq < gBase\)/.test(html), 'guard not found');

    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        // T2: floor is Q3 (wire), engine shoved back to Q2 -> restored to Q3.
        const t2 = await run(page, { stable: 1, wire: 3, set: 2 });
        console.log('  back-to-Q2 with wire=3 -> Q' + t2);
        check('T2 a backwards quarter is restored to the floor', t2 === 3, 'got Q' + t2);

        // T3: floor is Q2, engine legitimately at Q3 -> untouched.
        const t3 = await run(page, { stable: 2, wire: 2, set: 3 });
        console.log('  legit Q3 with floor Q2 -> Q' + t3);
        check('T3 a legitimate quarter at/above the floor is left alone', t3 === 3, 'got Q' + t3);

        // T4: burst Q1->Q3 (skips Q2) with floor Q1 -> clamped back to gBase+1 = Q2.
        const t4 = await run(page, { stable: 1, wire: 0, set: 3 });
        console.log('  burst Q3 with floor Q1 -> Q' + t4);
        check('T4 a burst roll ahead (skipped a quarter) is still clamped', t4 === 2, 'got Q' + t4);

        // T5: fresh match — floor reset to 1/0, engine at Q1 -> NOT clamped up.
        const t5 = await run(page, { stable: 1, wire: 0, set: 1 });
        console.log('  fresh Q1, floor reset -> Q' + t5);
        check('T5 a fresh Q1 is not clamped up to a stale floor', t5 === 1, 'got Q' + t5);
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
