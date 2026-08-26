// e2e/v358-ballgate.js — THE BALL GATE: one check, every placement.
//
// The rule: at the START of a quarter the ball must be on the EXACT spot the
// last play of the previous quarter left it. Enforced at the single choke point
// every bridge ball placement passes through (`set engineYardLineSigned`), so
// no placement site — present or future — can bypass it.
//
// T1  the gate is wired into the choke point and runs on EVERY placement
// T2  at a Q3->Q4 keep boundary, a placement that moves the ball is HELD
// T3  ...and a placement AT the anchor passes untouched
// T4  E1 halftime (entering Q3) stands down — the ball is SUPPOSED to move
// T5  E2 a conversion owed stands down — the ball belongs on the 2
// T6  E3 a drive handed away (parked) stands down
// T7  E4 a score at the horn stands down — the next placement is a kickoff
// T8  mid-quarter placements are never silent: the gate accounts for them
// T9  the window expires — the gate never holds a quarter hostage
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const setup = (page, opts) => page.evaluate((o) => {
    var em = RB.engineState();
    window._rb2p_patPlayPending = false; window._rb2p_patPlayResolved = false;
    window._rb2p_pickSixPatCascadeActive = false; window._rb2p_patDutyMine = null;
    window._rb2p_patOwedSinceMs = 0; window._rb2p_patStrongSignalMs = 0;
    window._rb2p_userIsWaitingForOpponent = false;
    window._rb2p_userOutcomeSendInProgress = false;
    window._rb2p_lastOpponentOutcomeApplyMs = 0;
    em.enginePossessingTeamIdx = em.engineUserTeamIdx;
    em.setUserScore(o.score || 0); em.setOpponentScore(0);
    em.engineDownNumber = 2; em.engineYardsToGo = 7;
    window._rb2p_armBallAnchor(o.toQ, o.anchor, o.keep);
    return true;
}, opts);

const place = (page, v) => page.evaluate((val) => {
    RB.engineState().engineYardLineSigned = val;
    return Number(RB.engineState().engineYardLineSigned);
}, v);

(async () => {
    console.log('=== V358 THE BALL GATE ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        const t1 = await page.evaluate(() => ({
            gate: typeof window._rb2p_ballGate,
            stats: typeof window._rb2p_ballGateStats,
            wired: (function () {
                var before = window._rb2p_ballGateStats().passes + window._rb2p_ballGateStats().holds;
                RB.engineState().engineYardLineSigned = -12;
                var after = window._rb2p_ballGateStats().passes + window._rb2p_ballGateStats().holds;
                return after > before;   // the gate saw the placement
            })()
        }));
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 the gate exists and every placement goes through it',
              t1.gate === 'function' && t1.wired === true, JSON.stringify(t1));

        // ---- T2/T3: the real rule at a Q3->Q4 keep boundary ----
        await setup(page, { toQ: 4, anchor: -18, keep: true });
        const moved = await place(page, -45);
        const same  = await place(page, -18);
        console.log('  T2/T3: tried -45 -> ' + moved + ' ; tried -18 -> ' + same);
        check('T2 a quarter-start placement that MOVES the ball is held to the anchor',
              Math.abs(moved - (-18)) <= 0.5, 'got ' + moved);
        check('T3 a placement AT the anchor passes untouched',
              Math.abs(same - (-18)) <= 0.5, 'got ' + same);

        // ---- T4: halftime must be allowed to move it ----
        await setup(page, { toQ: 3, anchor: -18, keep: false });
        const half = await place(page, -32);
        const halfWhy = await page.evaluate(() => window._rb2p_ballGateStandDown());
        console.log('  T4: halftime placement -> ' + half + '  (' + halfWhy + ')');
        check('T4 halftime stands down (E1) — the kickoff spot is allowed',
              Math.abs(half - (-32)) <= 0.5 && /^E1/.test(halfWhy), half + ' ' + halfWhy);

        // ---- T5: a conversion owed ----
        await setup(page, { toQ: 4, anchor: -18, keep: true });
        await page.evaluate(() => { window._rb2p_patPlayPending = true; window._rb2p_patStrongSignalMs = Date.now(); });
        const conv = await place(page, 48);
        const convWhy = await page.evaluate(() => window._rb2p_ballGateStandDown());
        console.log('  T5: conversion placement -> ' + conv + '  (' + convWhy + ')');
        check('T5 a conversion owed stands down (E2) — the ball reaches the 2',
              Math.abs(conv - 48) <= 0.5 && /^E2/.test(convWhy), conv + ' ' + convWhy);

        // ---- T6: the drive was handed away ----
        await setup(page, { toQ: 4, anchor: -18, keep: true });
        await page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });
        const punted = await place(page, -40);
        const puntWhy = await page.evaluate(() => window._rb2p_ballGateStandDown());
        console.log('  T6: handed-away placement -> ' + punted + '  (' + puntWhy + ')');
        check('T6 a drive handed away stands down (E3)',
              Math.abs(punted - (-40)) <= 0.5 && /^E3/.test(puntWhy), punted + ' ' + puntWhy);

        // ---- T7: a score at the horn ----
        await setup(page, { toQ: 4, anchor: -18, keep: true, score: 7 });
        await page.evaluate(() => { RB.engineState().setUserScore(14); });   // TD as time expired
        const scored = await place(page, -30);
        const scoredWhy = await page.evaluate(() => window._rb2p_ballGateStandDown());
        console.log('  T7: post-score placement -> ' + scored + '  (' + scoredWhy + ')');
        check('T7 a score at the horn stands down (E4) — a kickoff follows',
              Math.abs(scored - (-30)) <= 0.5 && /^E4/.test(scoredWhy), scored + ' ' + scoredWhy);

        // ---- T8: mid-quarter is checked, not silent ----
        const t8 = await page.evaluate(async () => {
            window._rb2p_qAnchor = null;                      // deep in a quarter
            var before = window._rb2p_ballGateStats().passes;
            for (var i = 0; i < 5; i++) RB.engineState().engineYardLineSigned = -20 - i;
            await new Promise(r => setTimeout(r, 100));
            var log = (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).join('|');
            return { counted: window._rb2p_ballGateStats().passes - before,
                     why: window._rb2p_ballGateStandDown(),
                     logged: /BALLGATE pass x\d+/.test(log) };
        });
        console.log('  T8: ' + JSON.stringify(t8));
        check('T8 mid-quarter placements are counted and reported, never silent',
              t8.counted === 5 && !!t8.why && t8.logged === true, JSON.stringify(t8));

        // ---- T9: the window expires ----
        await setup(page, { toQ: 4, anchor: -18, keep: true });
        await page.evaluate(() => { window._rb2p_qAnchor.ms = Date.now() - 20000; });
        const expired = await place(page, -44);
        console.log('  T9: after the window expired -> ' + expired);
        check('T9 the gate releases after its window (never holds a quarter hostage)',
              Math.abs(expired - (-44)) <= 0.5, 'got ' + expired);
    } catch (e) {
        console.error('ERROR mid-test:', e && e.message); fail++;
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
