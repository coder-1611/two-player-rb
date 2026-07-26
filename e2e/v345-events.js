// e2e/v345-events.js — room USFR round 2: the FG/INT popups that never fired,
// and the "PURDY -64 YDS" line that broke the box-delta law.
//
// Three V344 defects, each reproduced here red-first:
//  • The V344 "on offense" event gate ate the real FIELD GOAL popup whenever
//    the +3 credited after the drive-end send had already parked the kicker.
//  • The V339 Vy=8 INT sender had a waiting-flag guard — but the INT flip
//    parks the thrower BEFORE the 16ms observer samples Vy=8, so the guard
//    blocked the very event it existed to send. INTERCEPTED never fired.
//  • A settle with ZERO box-stat movement (the halftime field-flip shoving
//    _6F under a parked snap, outside any turnover window) fell through to
//    the QB-keep fallback: "PURDY -64 YDS". The law is now absolute: no stat
//    delta, no line — whatever the ball position did.
//
// T1  a no-stat settle emits NOTHING (even a huge _6F swing, no turnover stamp)
// T2  a FG credited AFTER the kicker parked still pops FIELD GOAL on the other phone
// T3  Vy=8 with the thrower already parked still sends INT — INTERCEPTED pops
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
    console.log('=== V345 EVENT GUARDS + THE ABSOLUTE BOX-DELTA LAW ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const def = aWait ? g.a : g.b;
    console.log('  offense = ' + off.role + ', waiting = ' + def.role);

    // ---- T1: a big _6F swing with ZERO credited stats emits nothing ----
    const t1 = await off.page.evaluate(async () => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ball = null; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        if (!ball) return { err: 'no ball' };
        var m = RB.engineState().rawEngineMatch;
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastTurnoverVy8Ms = 0;            // NOT a turnover window — the USFR case
        var y0 = Number(m._6F), d0 = Number(m._t11);
        async function step(k) { ball._kp = k; await new Promise(r => setTimeout(r, 80)); }
        await step(0); await step(1); await step(2);
        m._6F = y0 - 64; m._t11 = d0 + 1;              // the halftime flip: -64, nobody credited
        await step(4);
        await new Promise(r => setTimeout(r, 400));
        ball._kp = 0;
        return { ok: true };
    });
    await sleep(900);
    const feed1 = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    console.log('  feed after no-stat -64 settle: ' + JSON.stringify(feed1));
    check('T1 a no-stat settle emits NOTHING (no invented -64 line)',
          !t1.err && feed1 == null, 'feed=' + JSON.stringify(feed1));

    // ---- T2: the parked-kicker FIELD GOAL ----
    // The USFR ordering: kick is good, the drive-end send parks the kicker,
    // THEN the +3 hits the board. The popup must still reach the other phone.
    await def.page.evaluate(() => {
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await off.page.evaluate(() => {
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        window._rb2p_lastScoreSyncMs = 0;              // engine-earned, not wire-synced
        window._rb2p_userIsWaitingForOpponent = true;  // already parked by the send
        var em = RB.engineState();
        em.setUserScore(Number(em.userScore || 0) + 3);
    });
    await sleep(2000);
    const t2 = await blastState(def.page);
    console.log('  FG-after-park blast on waiting phone: ' + JSON.stringify(t2));
    check('T2 a FG credited after the kicker parked still pops FIELD GOAL',
          t2.shown && /FIELD GOAL/.test(t2.text), JSON.stringify(t2));
    await off.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = false; });

    // ---- T3: the parked-thrower INTERCEPTION ----
    // The INT flip parks the thrower before the observer samples Vy=8; the
    // event must fire anyway (a parked engine can't reach Vy=8 by itself).
    await def.page.evaluate(() => {
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await off.page.evaluate(() => {
        window._rb2p_lastIntEvtMs = 0;
        window._rb2p_lastFumbleMs = 0;
        // V351: a takeaway popup now requires the ENGINE's own interception
        // credit — a bare turnover stage is not evidence (that licence is what
        // stopped a field goal blasting INTERCEPTED in room PILP). So credit the
        // QB a real stat_int, exactly as the engine does on a genuine pick.
        try {
            var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
            var n = _wi(to._Ln);
            for (var j = 0; j < n; j++) {
                var p = _zi(to._Ln, j);
                if (p && Number(_Ai(p, 'position')) === 1) {
                    _Yi(p, 'stat_int', (Number(_Ai(p, 'stat_int')) || 0) + 1);
                    break;
                }
            }
        } catch (e) {}
        window._rb2p_userIsWaitingForOpponent = true;   // the INT handoff already parked us
        RB.engineState().engineDriveFsmStage = 8;       // the engine's turnover stage
    });
    await sleep(1500);
    await off.page.evaluate(() => {
        RB.engineState().engineDriveFsmStage = 4;       // stop re-stamping
        window._rb2p_userIsWaitingForOpponent = false;
    });
    const t3 = await blastState(def.page);
    console.log('  INT-after-park blast on other phone: ' + JSON.stringify(t3));
    check('T3 Vy=8 with the thrower already parked still pops INTERCEPTED',
          t3.shown && /INTERCEPT/.test(t3.text), JSON.stringify(t3));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
