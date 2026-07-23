// e2e/v317-intblast.js — a real interception must fire the INTERCEPTED blast.
//
// Device report: "the big INTERCEPTION popup didn't happen." Root cause: a real
// INT ships as outcome.type OTHER (prevVy is stale → inferUserDriveEndType maps
// it to OTHER), and waitFeedBig has no OTHER entry, so no blast. Confirmed live:
// room CTIN (ver 316) shipped turnovers as type=OTHER "Possession change".
// V317: the sender stamps the real-time _Vy=8 turnover moment and flags
// outcome.turnover; the receiver maps a flagged OTHER turnover to an INT blast
// (auto-relabeled FUMBLE when the fumble feed has just arrived).
//
// T1  a flagged OTHER turnover fires the INTERCEPTED blast
// T2  a plain OTHER possession change (no turnover flag) does NOT blast
// T3  a flagged turnover with a fresh fumble feed blasts FUMBLE, not INTERCEPTED
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const OUTCOME = extra => Object.assign({
    type: 'OTHER', yardLine: -20, ownSide: false,
    scoreUser: 0, scoreOpp: 0, quarter: 1, minutesLeft: 5, secondsLeft: 0,
    fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
    message: 'Possession change. On your 30 yard line', ts: Date.now()
}, extra);

async function blastState(page) {
    return page.evaluate(() => ({
        shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
        text: (document.getElementById('rb-wait-blast-text') || {}).textContent || ''
    }));
}
async function resetBlast(page) {
    await page.evaluate(() => {
        try { window._rb2p_waitFeedReset(); } catch (e) {}
        window._rb2p_lastFumbleMs = 0; window._rb2p_lastTurnoverVy8Ms = 0;
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await sleep(200);
}

(async () => {
    console.log('=== V317 INTERCEPTION BLAST FIRES ON A REAL TURNOVER ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { window._rb2p_myTeamUid = 22; window._rb2p_oppTeamUid = 11; });

        // ---- T1: flagged OTHER turnover → INTERCEPTED ----
        await resetBlast(page);
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); }, OUTCOME({ turnover: true }));
        await sleep(350);
        const t1 = await blastState(page);
        console.log('  T1 blast: ' + JSON.stringify(t1));
        check('T1 a flagged OTHER turnover fires the INTERCEPTED blast',
              t1.shown && /INTERCEPT/.test(t1.text), JSON.stringify(t1));

        // ---- T2: plain OTHER (no turnover flag) → no blast ----
        await resetBlast(page);
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); }, OUTCOME({ turnover: false }));
        await sleep(350);
        const t2 = await blastState(page);
        console.log('  T2 blast: ' + JSON.stringify(t2));
        check('T2 a plain OTHER possession change does NOT blast',
              !t2.shown, 'unexpected blast: ' + JSON.stringify(t2));

        // ---- T3: flagged turnover + fresh fumble feed → FUMBLE ----
        await resetBlast(page);
        await page.evaluate(o => {
            window._rb2p_lastFumbleMs = Date.now();   // a fumble feed just landed here
            window._rb2p_applyOpponentOutcome(o);
        }, OUTCOME({ turnover: true }));
        await sleep(350);
        const t3 = await blastState(page);
        console.log('  T3 blast: ' + JSON.stringify(t3));
        check('T3 a flagged turnover with a fresh fumble feed blasts FUMBLE',
              t3.shown && /FUMBLE/.test(t3.text), JSON.stringify(t3));

        // ---- T4 (sender): the FSM turnover stage (_Vy=8) is stamped in real time
        // by the 16ms observer, so buildUserDriveEndOutcome can flag the outcome. ----
        const t4 = await page.evaluate(async () => {
            window._rb2p_lastTurnoverVy8Ms = 0;
            try { RB.engineState().engineDriveFsmStage = 8; } catch (e) {}
            await new Promise(r => setTimeout(r, 120));   // let the 16ms loop tick
            const stamp = Number(window._rb2p_lastTurnoverVy8Ms);
            return { stamped: isFinite(stamp) && stamp > 0 && (Date.now() - stamp) < 2000 };
        });
        check('T4 the _Vy=8 turnover stage is stamped in real time (sender signal)',
              t4.stamped, 'no fresh _rb2p_lastTurnoverVy8Ms stamp');
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
