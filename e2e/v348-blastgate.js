// e2e/v348-blastgate.js — the takeaway popup gates possession.
//
// Device reports (through V347): INTERCEPTED/FUMBLE popups still not showing.
// The evt wire is a separate Firebase write racing the outcome; losing that
// race ate the popup. V348: the blast fires synchronously from the SAME
// outcome that grants possession — popup first, ball immediately after.
//
// T1  a turnover outcome (no evt ever sent) blasts INTERCEPTED *and* grants
//     possession — one atomic sequence
// T2  if the evt already blasted this takeaway, the outcome does NOT re-blast
// T3  the thrower (fresh Vy=8 stamp) still never blasts its own pick
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const OUTCOME = extra => Object.assign({
    type: 'OTHER', yardLine: -20, ownSide: false,
    scoreUser: 0, scoreOpp: 0, quarter: 2, minutesLeft: 3, secondsLeft: 0,
    fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
    message: 'Possession change. On your 30 yard line', ts: Date.now()
}, extra);

async function blastState(page) {
    return page.evaluate(() => ({
        shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
        text: (document.getElementById('rb-wait-blast-text') || {}).textContent || '',
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        count: window.__blasts ? window.__blasts.length : -1
    }));
}
async function reset(page) {
    await page.evaluate(() => {
        window.__blasts = [];
        if (!window.__origWFB) {
            window.__origWFB = window._rb2p_waitFeedBig;
            window._rb2p_waitFeedBig = function (t, m) { window.__blasts.push(t); return window.__origWFB(t, m); };
        }
        window._rb2p_lastFumbleMs = 0; window._rb2p_lastTurnoverVy8Ms = 0;
        window._rb2p_evtBlastedAt = {};
        window._rb2p_blastPrevScorerScore = 0;
        window._rb2p_gameOverReported = false;
        window._rb2p_userIsWaitingForOpponent = true;
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await sleep(200);
}

(async () => {
    console.log('=== V348 TAKEAWAY POPUP GATES POSSESSION ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { window._rb2p_myTeamUid = 22; window._rb2p_oppTeamUid = 11; });

        // ---- T1: no evt ever arrived — the outcome itself blasts + grants ----
        await reset(page);
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); }, OUTCOME({ turnover: true }));
        await sleep(350);
        const t1 = await blastState(page);
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 the turnover outcome blasts INTERCEPTED and grants possession',
              t1.shown && /INTERCEPT/.test(t1.text) && t1.waiting === false,
              JSON.stringify(t1));

        // ---- T2: evt got there first — no double blast ----
        await reset(page);
        await page.evaluate(o => {
            window._rb2p_evtBlastedAt = { INT: Date.now() - 1000 };   // the evt path blasted 1s ago
            window._rb2p_applyOpponentOutcome(o);
        }, OUTCOME({ turnover: true }));
        await sleep(350);
        const t2 = await blastState(page);
        console.log('  T2: ' + JSON.stringify(t2));
        check('T2 an already-blasted takeaway is not re-blasted at possession',
              t2.count === 0 && t2.waiting === false, JSON.stringify(t2));

        // ---- T3: the thrower never blasts its own pick ----
        await reset(page);
        await page.evaluate(o => {
            window._rb2p_lastTurnoverVy8Ms = Date.now();   // MY drive just ended in the turnover
            window._rb2p_applyOpponentOutcome(o);
        }, OUTCOME({ turnover: true }));
        await sleep(350);
        const t3 = await blastState(page);
        console.log('  T3: ' + JSON.stringify(t3));
        check('T3 the thrower still never blasts its own pick',
              t3.count === 0, JSON.stringify(t3));
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
