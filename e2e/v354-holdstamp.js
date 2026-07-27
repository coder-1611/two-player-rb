// e2e/v354-holdstamp.js — a HELD drive-end must ship LIVE time, not stale time.
//
// Device report: "I punted in the 3rd quarter and it took me to the beginning
// of the 4th." V352b made the drive-end hold UNIVERSAL (every type but
// PAT_RESULT waits ~4s so a pick-6 can cancel-and-upgrade it). The record is
// BUILT at the drive end, so its quarter/clock/score froze there — and the
// receiver writes those absolutely. With 1-minute quarters a 4s hold is 7% of
// a quarter, so a punt held across a boundary handed the other phone a quarter
// and a clock that no longer existed.
//
// T1  a punt held across a quarter boundary ships the LIVE quarter, not the stale one
// T2  the clock shipped is the live clock (never the frozen one)
// T3  the yard line is NOT re-stamped (it is a physical spot, not perishable)
// T4  a normal hold with no boundary ships unchanged (no spurious re-stamp)
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V354 HELD DRIVE-END SHIPS LIVE TIME ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        const res = await page.evaluate(async () => {
            var sent = [];
            var realSend = window._twoPlayer.send;
            window._twoPlayer.send = function (o) { sent.push(JSON.parse(JSON.stringify(o))); };
            var em = RB.engineState();

            // --- T1/T2/T3: a punt built in Q3 0:03, shipped after the roll to Q4 ---
            em.engineQuarter = 3; em.engineMinutesLeft = 0; em.engineSecondsLeft = 3;
            var built = { type: 'PUNT', turnover: false, yardLine: -34.5,
                          quarter: 3, minutesLeft: 0, secondsLeft: 3,
                          scoreUser: 7, scoreOpp: 3, message: 'Punt.', ts: Date.now() };
            window._rb2p_pendingTurnoverOutcome = built;
            window._rb2p_pendingTurnoverHeldMs = Date.now();
            // the quarter rolls while the record sits in the hold
            em.engineQuarter = 4; em.engineMinutesLeft = 1; em.engineSecondsLeft = 0;
            em.setUserScore(10);
            // fire the hold the way its timer does
            window._twoPlayer.send(window._rb2p_restampOutcome(built));
            await new Promise(r => setTimeout(r, 200));

            // --- T4: a plain hold, no boundary ---
            em.engineQuarter = 4; em.engineMinutesLeft = 0; em.engineSecondsLeft = 40;
            var built2 = { type: 'PUNT', turnover: false, yardLine: -20,
                           quarter: 4, minutesLeft: 0, secondsLeft: 40,
                           scoreUser: 10, scoreOpp: 3, message: 'Punt.', ts: Date.now() };
            window._twoPlayer.send(window._rb2p_restampOutcome(built2));
            await new Promise(r => setTimeout(r, 200));

            window._twoPlayer.send = realSend;
            return { sent: sent, log: (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).filter(function (l) { return /SEND-RESTAMP/.test(l); }) };
        });

        const s1 = res.sent[0] || {}, s2 = res.sent[1] || {};
        console.log('  shipped #1: ' + JSON.stringify(s1));
        console.log('  shipped #2: ' + JSON.stringify(s2));
        console.log('  restamp log: ' + JSON.stringify(res.log));
        check('T1 the punt ships the LIVE quarter (4), not the frozen one (3)',
              Number(s1.quarter) === 4, JSON.stringify(s1));
        check('T2 the punt ships the LIVE clock (1:00), not the frozen 0:03',
              Number(s1.minutesLeft) === 1 && Number(s1.secondsLeft) === 0, JSON.stringify(s1));
        check('T3 the yard line is untouched (a physical spot, not perishable)',
              Math.abs(Number(s1.yardLine) - (-34.5)) < 0.01, JSON.stringify(s1));
        check('T4 a hold with no boundary ships unchanged',
              Number(s2.quarter) === 4 && Number(s2.secondsLeft) === 40, JSON.stringify(s2));
    } catch (e) {
        console.error('ERROR mid-test:', e && e.message); fail++;
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
