// e2e/v538-postconv.js — V538 (room KUEV, the owner: "the ball got turned over with a bit left in the half for no reason"):
// the post-conversion hand-off (V406: a try that crosses the horn leaves the scorer a ball at the 2 — the drive is over)
// must not take a REAL drive that reaches the 2-3 after the ball has changed hands since the try.
//   P1  KUEV: a conversion 60 s ago, the quarter changed since, a hand-off taken since the try, my drive on 2nd down at the
//       opponent's 3 — nothing happens: no POST-CONV hand-off, I keep the ball
//   P2  the case it exists for (V406): the try's popup, the quarter changed, NOTHING changed hands, the ball left at the 2 —
//       it still hands off
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function scene(page, handoffSinceTry) {
    await page.evaluate(async (since) => {
        window._rb2p_postConvHandoffFor = 0;
        window._rb2p_userIsWaitingForOpponent = false;
        for (let i = 0; i < 8; i++) {   // my ball at the opponent's 3, 2nd down (a refused force — the 2 s cooldown — is tried again)
            window._rb2p_forceUserOffenseDrive(47, true, { down: 2, toGo: 3 });
            await new Promise(r => setTimeout(r, 1200));
            const e = RB.engineState();
            if (e.enginePossessingTeamIdx === e.engineUserTeamIdx && Math.abs(Number(e.engineYardLineSigned) - 47) < 1 && Number(e.engineDownNumber) === 2) break;
        }
        const e0 = RB.engineState();
        window.__pcSetup = { mine: e0.enginePossessingTeamIdx === e0.engineUserTeamIdx, y: Math.round(Number(e0.engineYardLineSigned) * 10) / 10, down: Number(e0.engineDownNumber) };
        const now = Date.now();
        window._rb2p_lastConvModalMs = now - 60000;            // the try's popup, 60 s ago
        window._rb2p_quarterChangedToMs = now - 30000;         // the quarter changed after it
        window._rb2p_lastSnapDown = 1; window._rb2p_lastSnapMs = now - 10000;   // real downs since (not a snapped try)
        window._rb2p_lastOpponentOutcomeApplyMs = since ? now - 45000 : now - 120000;   // KUEV: a hand-off taken after the try
        window._rb2p_lastSentOutcomeMs = since ? now - 50000 : now - 130000;
        window.__pcMark = 'V538-TEST-MARK-' + now;
        if (window._rb2p_diagLog) window._rb2p_diagLog(window.__pcMark);   // the log is a capped ring: find what follows the mark
    }, handoffSinceTry);
    await sleep(3500);
    return page.evaluate(() => {
        const all = (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).map(String);
        let i = all.length - 1; while (i >= 0 && all[i].indexOf(window.__pcMark) < 0) i--;
        const d = i >= 0 ? all.slice(i + 1) : all;
        const em = RB.engineState();
        return { setup: window.__pcSetup, fired: d.some(l => /POST-CONV the try crossed the horn/.test(l)), mine: em.enginePossessingTeamIdx === em.engineUserTeamIdx,
                 y: Math.round(Number(em.engineYardLineSigned) * 10) / 10, down: Number(em.engineDownNumber), lines: d.filter(l => /POST-CONV|HANDOFF|SEND/.test(l)).slice(0, 3) };
    });
}
(async () => {
    console.log('=== V538 A REAL DRIVE AT THE 3 IS NOT A TRY\'S LEFTOVER (KUEV) ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await sleep(3000);
        const p1 = await scene(page, true);
        check('P1 KUEV: a hand-off taken since the try, my drive at the 3 on 2nd down — no POST-CONV hand-off, my ball', p1.setup.mine && p1.setup.y === 47 && !p1.fired && p1.mine, JSON.stringify(p1));
        const p2 = await scene(page, false);
        check('P2 V406: nothing changed hands since the try, the ball left at the 2 — it still hands off', p2.setup.mine && p2.setup.y === 47 && p2.fired, JSON.stringify(p2));
        await page.close();
    } finally { await browser.close(); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
