// e2e/v339-intside.js — DEQC Bug 2 + the on-device V336/V335 regressions.
//
// Room DEQC: B threw an INT; INTERCEPTED popped on B (the thrower!) and
// possession bounced back to B. Fixed across V335 (popup routing) + V336
// (turn record) — but the first on-device round exposed three regressions,
// all reproduced/fixed here:
//   • the reconciler demoted off a ≤4s-STALE opponent claim (the thrower's
//     last pre-park push), parking a legitimate interceptor right after the
//     takeaway ("the Q3 interception got skipped", wait-screen flicker);
//   • received events were wall-clock-gated (sender ts within 45s) — phone
//     clocks differ by more than that, so popups silently never showed;
//   • an INT-return settle (scrimmage moves backwards, ZERO stat deltas)
//     invented feed lines like "PURDY -14 YDS" — the owner's rule is
//     box-stat deltas ONLY.
//
// T1  the thrower does NOT blast INTERCEPTED for its own pick
// T2  a reflected outcome cannot bounce possession back (healed to WAIT)
// T3  the legit interceptor holds offense (never parked by a stale claim)
// T4  a popup event with a 2-minute clock skew still blasts (no wall gate)
// T5  a turnover-window settle emits NO feed line; a real play after it does
const H = require('./harness');
const TP = require('./two-player');
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

(async () => {
    console.log('=== V339 INT SIDE + ON-DEVICE REGRESSIONS ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const thrower = aWait ? g.b : g.a;   // on offense: about to throw the pick
    const picker  = aWait ? g.a : g.b;   // waiting: about to intercept
    console.log('  thrower = ' + thrower.role + ', interceptor = ' + picker.role);

    // ---- the INT, exactly as the device runs it ----
    await thrower.page.evaluate((other) => {
        window._rb2p_lastTurnoverVy8Ms = Date.now();        // V317 sender stamp
        window._rb2p_userIsWaitingForOpponent = true;       // the INT handoff parks the thrower
        window._rb2p_declareTurnOwner(other, 'int');        // V336 yield
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    }, picker.role);
    // The interceptor takes the ball; its live pushes now claim iHaveBall.
    await picker.page.evaluate((o) => { window._rb2p_applyOpponentOutcome(o); }, OUTCOME({ turnover: true }));
    await sleep(1800);

    // ---- T1/T2: the DEQC reflection — a turnover outcome reaches the THROWER ----
    await thrower.page.evaluate((o) => { window._rb2p_applyOpponentOutcome(o); }, OUTCOME({ turnover: true }));
    await sleep(700);
    const t1 = await thrower.page.evaluate(() => ({
        shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
        text: (document.getElementById('rb-wait-blast-text') || {}).textContent || '',
        waiting: window._rb2p_userIsWaitingForOpponent === true
    }));
    console.log('  thrower after spurious outcome: ' + JSON.stringify(t1));
    check('T1 the thrower does NOT blast INTERCEPTED for its own pick',
          !(t1.shown && /INTERCEPT|FUMBLE/.test(t1.text)), JSON.stringify(t1));

    // Heal window: 3s apply-grace + newer-claim + 3 reconciler ticks ≈ 5-6s.
    await sleep(6500);
    const t2 = await thrower.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true
    }));
    console.log('  thrower after reconciler window: ' + JSON.stringify(t2));
    check('T2 possession cannot bounce back — the thrower is parked in WAIT',
          t2.waiting === true, JSON.stringify(t2));

    // ---- T3: the legit interceptor still holds offense ----
    const t3 = await picker.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true
    }));
    console.log('  interceptor: ' + JSON.stringify(t3));
    check('T3 the interceptor holds offense (not parked by a stale claim)',
          t3.waiting === false, JSON.stringify(t3));

    // ---- T4: a 2-minute clock skew cannot eat a popup ----
    // (The V335 receiver dropped any event whose SENDER timestamp was >45s
    // old — real phones disagree by minutes, so popups never showed.)
    await thrower.page.evaluate(() => {
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
    await picker.page.evaluate(() => {
        var realNow = Date.now;
        Date.now = function () { return realNow() - 120000; };   // this phone runs 2 min behind
        try { window._rb2p_sendEventBlast('FG'); } finally { Date.now = realNow; }
    });
    await sleep(1200);   // inside the 2.4s blast window (local Firebase is fast)
    const t4 = await thrower.page.evaluate(() => ({
        shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
        text: (document.getElementById('rb-wait-blast-text') || {}).textContent || ''
    }));
    console.log('  skewed-clock event on thrower: ' + JSON.stringify(t4));
    check('T4 a popup event with a 2-minute clock skew still blasts',
          t4.shown && /FIELD GOAL/.test(t4.text), JSON.stringify(t4));

    // ---- T5: a turnover-window settle emits NO feed line ----
    const t5 = await picker.page.evaluate(async () => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ball = null; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        if (!ball) return { err: 'no ball' };
        var m = RB.engineState().rawEngineMatch;
        window._rb2p_userIsWaitingForOpponent = false;
        // The INT return: scrimmage snaps backwards, NOBODY's box stats move.
        window._rb2p_lastTurnoverVy8Ms = Date.now();
        var y0 = Number(m._6F), d0 = Number(m._t11);
        async function step(k) { ball._kp = k; await new Promise(r => setTimeout(r, 80)); }
        await step(0); await step(1); await step(2);
        m._6F = y0 - 14; m._t11 = d0 + 1;
        await step(4);
        await new Promise(r => setTimeout(r, 400));
        ball._kp = 0;
        return { ok: true };
    });
    await sleep(900);
    const feedAfterInt = await TP.fbGet('rooms/' + g.code + '/feed/' + picker.role);
    console.log('  feed after turnover-window settle: ' + JSON.stringify(feedAfterInt));
    check('T5 the INT-return settle emitted NOTHING (no invented "-14 yds" line)',
          !t5.err && feedAfterInt == null,
          'feed=' + JSON.stringify(feedAfterInt));

    // ...and a REAL play after the window emits normally.
    await picker.page.evaluate(() => { window._rb2p_lastTurnoverVy8Ms = Date.now() - 10000; });
    const t5b = await picker.page.evaluate(async () => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ball = null; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        var m = RB.engineState().rawEngineMatch;
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var n = _wi(to._Ln), rbP = null, rbName = '';
        for (var j = 0; j < n; j++) {
            var p = _zi(to._Ln, j); if (!p) continue;
            if (Number(_Ai(p, 'position')) === 2) { rbP = p; rbName = String(_Ai(p, 'lname') || '').toUpperCase(); break; }
        }
        if (!ball || !rbP) return { err: 'roster missing' };
        var y0 = Number(m._6F), d0 = Number(m._t11);
        async function step(k) { ball._kp = k; await new Promise(r => setTimeout(r, 80)); }
        await step(0); await step(1); await step(2); await step(5);
        _Yi(rbP, 'stat_rush_attempts', (Number(_Ai(rbP, 'stat_rush_attempts')) || 0) + 1);
        _Yi(rbP, 'stat_rush_yards', (Number(_Ai(rbP, 'stat_rush_yards')) || 0) + 5);
        m._6F = y0 + 5; m._t11 = d0 + 1;
        await step(4);
        await new Promise(r => setTimeout(r, 400));
        ball._kp = 0;
        return { rbName: rbName };
    });
    await sleep(900);
    const feedAfterRun = await TP.fbGet('rooms/' + g.code + '/feed/' + picker.role);
    console.log('  feed after the real run: ' + JSON.stringify(feedAfterRun));
    check('T5 a real credited run after the window emits normally',
          feedAfterRun && feedAfterRun.k === 'run' && feedAfterRun.rb === t5b.rbName,
          JSON.stringify(feedAfterRun));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
