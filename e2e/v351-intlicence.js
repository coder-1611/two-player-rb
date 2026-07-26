// e2e/v351-intlicence.js — takeaway claims require the engine-credited stat delta.
//
// Room PILP (V350, telemetry in hand): device A kicked a FIELD GOAL as the
// first half expired. A stale/transient Vy=8 at the boundary typed the drive
// end as INT ({type:"INT", turnover:false, "Interception..."}), the Vy=8 evt
// sender shipped INTERCEPTED, and the V348 possession-gated blast popped
// INTERCEPTED on the receiving phone — for a field goal. The owner's law:
// NO popup without its licensing delta. The licence is the OFFENSE roster's
// stat_int/stat_fumbles sum moving since the drive started (the engine
// credits the thrower's roster struct at a real pick — retrobowl.js:52847).
//
// T1  (PILP repro) a stale Vy=8 with ZERO stat delta sends NO takeaway evt
// T2  ...and the drive-end outcome types OTHER, turnover:false, intDelta:0
// T3  ...and applying that outcome on the receiver shows NO INTERCEPTED
// T4  a drive where stat_int increments: outcome carries intDelta>0, type INT
// T5  ...the evt INT ships, and the receiver blasts INTERCEPTED exactly once
//     (evt blast + V348 possession blast dedupe = one popup, not two)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function armBlastCounter(page) {
    await page.evaluate(() => {
        window.__blasts = [];
        if (!window.__origWFB) {
            window.__origWFB = window._rb2p_waitFeedBig;
            window._rb2p_waitFeedBig = function (t, m) { window.__blasts.push(t); return window.__origWFB(t, m); };
        }
        window._rb2p_evtBlastedAt = {};
        window._rb2p_lastFumbleMs = 0; window._rb2p_lastTurnoverVy8Ms = 0;
        window._rb2p_blastPrevScorerScore = 0;
        var b = document.getElementById('rb-wait-blast'); if (b) b.style.display = 'none';
    });
}
async function blastState(page) {
    return page.evaluate(() => ({
        shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
        text: (document.getElementById('rb-wait-blast-text') || {}).textContent || '',
        blasts: window.__blasts || []
    }));
}
// Flash the FSM turnover stage for a few observer ticks, exactly as the
// boundary artifact appears (v317 T4 proved the 16ms loop samples this).
async function flashVy8(page) {
    await page.evaluate(async () => {
        var em = RB.engineState();
        var prev = em.engineDriveFsmStage;
        em.engineDriveFsmStage = 8;
        await new Promise(r => setTimeout(r, 200));
        em.engineDriveFsmStage = prev;
    });
}

(async () => {
    console.log('=== V351 TAKEAWAY LICENCE: NO POPUP WITHOUT ITS STAT DELTA ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const thrower = aWait ? g.b : g.a;   // on offense: the device whose drive ends
    const receiver = aWait ? g.a : g.b;  // waiting: the device that must not see a lie
    console.log('  offense = ' + thrower.role + ', receiver = ' + receiver.role);
    await sleep(1200);   // let the 16ms poll capture the drive baselines

    const baseOk = await thrower.page.evaluate(() =>
        window._rb2p_driveIntBase != null && window._rb2p_driveFumBase != null);
    check('T0 drive stat baselines captured on the offense device', baseOk);

    // ================= T1-T3: the PILP repro (no stat delta) =================
    await armBlastCounter(receiver.page);
    await thrower.page.evaluate(() => { window._rb2p_lastIntEvtMs = 0; });
    const evtBefore = await TP.fbGet('rooms/' + g.code + '/evt/' + thrower.role);
    await flashVy8(thrower.page);
    await sleep(1200);
    const evtAfter = await TP.fbGet('rooms/' + g.code + '/evt/' + thrower.role);
    const evtSent = JSON.stringify(evtAfter) !== JSON.stringify(evtBefore);
    check('T1 a stale Vy=8 with zero stat delta sends NO takeaway evt',
          !evtSent, 'evt shipped: ' + JSON.stringify(evtAfter));

    const outA = await thrower.page.evaluate(() =>
        typeof window._rb2p_buildUserDriveEndOutcome === 'function'
            ? window._rb2p_buildUserDriveEndOutcome(8) : null);
    console.log('  T2 outcome: ' + JSON.stringify(outA && {
        type: outA.type, turnover: outA.turnover, intDelta: outA.intDelta, fumDelta: outA.fumDelta }));
    check('T2 the unlicensed Vy=8 drive-end types OTHER / turnover:false / intDelta 0',
          !!outA && outA.type === 'OTHER' && outA.turnover === false &&
          outA.intDelta === 0 && outA.fumDelta === 0,
          JSON.stringify(outA));

    if (outA) {
        await receiver.page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); }, outA);
        await sleep(500);
        const t3 = await blastState(receiver.page);
        console.log('  T3 receiver: ' + JSON.stringify(t3));
        check('T3 the receiver shows NO INTERCEPTED for the boundary artifact',
              !(t3.shown && /INTERCEPT|FUMBLE/.test(t3.text)) &&
              !t3.blasts.some(k => k === 'INT' || k === 'FUMBLE'),
              JSON.stringify(t3));
    } else {
        check('T3 the receiver shows NO INTERCEPTED for the boundary artifact', false, 'no outcome hook');
    }

    // ================= T4-T5: a REAL pick (stat_int credited) =================
    // Undo T3's possession grant so the receiver is back in WAIT, then credit
    // stat_int on the thrower's roster — the engine's own record of a pick.
    await receiver.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });
    await armBlastCounter(receiver.page);
    await thrower.page.evaluate(() => {
        window._rb2p_lastIntEvtMs = 0;
        var c = _si(64), to = null;
        for (var k in c) { if (c.hasOwnProperty(k)) { to = c[k]; break; } }
        var n = _wi(to._Ln);
        for (var i = 0; i < n; i++) {
            var p = _zi(to._Ln, i);
            if (p != null) { _Yi(p, 'stat_int', (Number(_Ai(p, 'stat_int')) || 0) + 1); break; }
        }
    });
    await flashVy8(thrower.page);
    await sleep(1400);
    const evtInt = await TP.fbGet('rooms/' + g.code + '/evt/' + thrower.role);
    check('T4a the licensed pick ships the INT evt',
          !!evtInt && evtInt.kind === 'INT', JSON.stringify(evtInt));

    const outB = await thrower.page.evaluate(() => window._rb2p_buildUserDriveEndOutcome(8));
    console.log('  T4 outcome: ' + JSON.stringify(outB && {
        type: outB.type, turnover: outB.turnover, intDelta: outB.intDelta, fumDelta: outB.fumDelta }));
    check('T4b the licensed drive-end types INT with intDelta > 0 and turnover:true',
          !!outB && outB.type === 'INT' && outB.intDelta > 0 && outB.turnover === true,
          JSON.stringify(outB));

    // The outcome lands after the evt (the real wire ordering): V348 must
    // dedupe against the evt blast — INTERCEPTED exactly once, possession granted.
    await receiver.page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); }, outB);
    await sleep(600);
    const t5 = await blastState(receiver.page);
    const intBlasts = t5.blasts.filter(k => k === 'INT' || k === 'FUMBLE').length;
    const granted = await receiver.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === false);
    console.log('  T5 receiver: ' + JSON.stringify(t5) + ' granted=' + granted);
    check('T5 the receiver blasts INTERCEPTED exactly once and takes possession',
          intBlasts === 1 && /INTERCEPT/.test(t5.text) && granted,
          'intBlasts=' + intBlasts + ' ' + JSON.stringify(t5));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
