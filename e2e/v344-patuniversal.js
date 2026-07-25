// e2e/v344-patuniversal.js — EVERY PAT snaps from the 2, and score popups
// only ever originate from the phone on offense.
//
// Device report (screenshot): a NORMAL touchdown's 1-or-2-point modal lined up
// at ~midfield — V338's pin only covered the pick-6 cascade, and a regular
// TD's conversion inherits the TD play's final spot. Plus: TOUCHDOWN popped on
// the SCORER's own screen when the PAT flow was clean — the waiting device's
// score, bumped by wire sync outside the outcome-apply window, was being
// evented BACK at the scorer.
//
// T1  a normal-TD PAT (down 6, no pick-6 flags) is pinned to 48 within ~1s
// T2  the pin releases the moment the down leaves 6 (choice made)
// T3  a WAITING device whose score jumps does NOT event TOUCHDOWN at the scorer
// T4  the device ON OFFENSE still events its TD (the legit popup is unharmed)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const blastState = page => page.evaluate(() => ({
    shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
    text: (document.getElementById('rb-wait-blast-text') || {}).textContent || ''
}));

(async () => {
    console.log('=== V344 UNIVERSAL PAT PIN + OFFENSE-ONLY SCORE EVENTS ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const def = aWait ? g.a : g.b;
    console.log('  offense = ' + off.role + ', waiting = ' + def.role);

    // ---- T1: a NORMAL TD's PAT — down 6, ball wherever the TD play ended ----
    const t1 = await off.page.evaluate(async () => {
        window._rb2p_patPlayPending = false;          // explicitly NOT the pick-6 cascade
        window._rb2p_pickSixPatCascadeActive = false;
        var em = RB.engineState();
        em.engineDownNumber = 6;                      // the engine's PAT-pending marker
        em.engineYardLineSigned = 2;                  // ~midfield, as in the screenshot
        await new Promise(r => setTimeout(r, 1000));
        return { yard: Number(RB.engineState().engineYardLineSigned),
                 toGo: Number(RB.engineState().engineYardsToGo) };
    });
    console.log('  normal-TD PAT: ' + JSON.stringify(t1));
    check('T1 a normal-TD PAT is pinned to the 2 (yard 48) within ~1s',
          Math.abs(t1.yard - 48) <= 0.5 && t1.toGo === 2, JSON.stringify(t1));

    // ---- T2: the choice is made — the pin lets go ----
    const t2 = await off.page.evaluate(async () => {
        var em = RB.engineState();
        em.engineDownNumber = 1;                      // scene started
        em.engineYardLineSigned = -20;
        await new Promise(r => setTimeout(r, 800));
        return { yard: Number(RB.engineState().engineYardLineSigned) };
    });
    console.log('  after choice: ' + JSON.stringify(t2));
    check('T2 the pin releases once the down leaves 6',
          Math.abs(t2.yard - (-20)) <= 0.5, JSON.stringify(t2));

    // ---- T3: a WAITING device's score jump must NOT event a popup ----
    // (the clean-PAT wire ordering: the waiting phone's own score rises via
    // sync with no recent outcome apply — the old code sent 'TD' to the scorer)
    await off.page.evaluate(() => {
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await def.page.evaluate(() => {
        window._rb2p_lastOpponentOutcomeApplyMs = 0;   // outside the apply window
        var em = RB.engineState();
        em.setUserScore(Number(em.userScore || 0) + 6);
    });
    await sleep(2500);
    const t3 = await blastState(off.page);
    console.log('  offense blast after waiting-side +6: ' + JSON.stringify(t3));
    check('T3 a waiting device\'s score jump does not pop TOUCHDOWN at the scorer',
          !(t3.shown && /TOUCHDOWN/.test(t3.text)), JSON.stringify(t3));

    // ---- T4: the offense's own TD still events normally ----
    await def.page.evaluate(() => {
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await off.page.evaluate(() => {
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        var em = RB.engineState();
        em.setUserScore(Number(em.userScore || 0) + 6);
    });
    await sleep(2000);
    const t4 = await blastState(def.page);
    console.log('  waiting blast after offense +6: ' + JSON.stringify(t4));
    check('T4 the offense\'s TD still pops TOUCHDOWN on the waiting device',
          t4.shown && /TOUCHDOWN/.test(t4.text), JSON.stringify(t4));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
