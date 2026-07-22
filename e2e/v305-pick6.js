// e2e/v305-pick6.js — a PICK6 that lands while we are ON OFFENSE must still be
// applied.
//
// Device report (room ZCGR, both sides on V304): "after a pick 6, nothing
// happened, just a normal interception behavior."
//
// Firebase evidence:
//   turnover  = { isPick6: true, resolved: true, thrower: 'b', yardLine: -21.02 }
//   outcomes.b= { type:'PICK6', scoreUser:0, scoreOpp:14, needsPAT:true, ack:'a' }
//   live.a    = { myScore: 8,  ... yardLine: -21, iHaveBall: true }   <-- never got +6
//   live.b    = { myScore: 0,  oppScore: 14 }                          <-- sender was right
// A sat at 8 while B had already credited it 14, and A was driving from exactly
// the interception spot: plain-INT behaviour, the pick-6 silently dropped.
//
// Root cause: inbound outcomes are drained in exactly ONE place (the poll loop),
// behind `if (_rb2p_userIsWaitingForOpponent === true && !scorerPlayingPat)`.
// The sender defers a PICK6 until its own engine credits the +6 (V57), which
// took 8.5s here — by then the interception handoff had already put the scorer
// ON OFFENSE, so it was never in WAIT and the queue was never drained. The ACK
// is written immediately after receive() queues the record, so `ack:'a'` proves
// only that it arrived, not that it was applied.
//
// T1  a PICK6 arriving while we are ON OFFENSE is applied (+6 and the PAT)
// T2  a normal drive outcome arriving while we are ON OFFENSE is still NOT
//     applied (the existing protection must not regress)

const H = require('./harness');
const TP = require('./two-player');

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const SNAP = () => {
    const s = RB.engineState();
    const popups = (typeof window._rb2p_enumeratePopupInstances === 'function')
        ? window._rb2p_enumeratePopupInstances() : [];
    return {
        us: Number(s.userScore), them: Number(s.opponentScore),
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        pending: (window._twoPlayer && window._twoPlayer.pending || []).length,
        pendingTypes: (window._twoPlayer && window._twoPlayer.pending || []).map(o => o && o.type),
        patPending: window._rb2p_patPlayPending === true,
        cascade: window._rb2p_pickSixPatCascadeActive === true,
        popupCount: popups.length,
        patButtons: popups.filter(p => p._0G === 100367 || p._0G === 100369).length,
        down: Number(s.engineDownNumber), yard: Number(s.engineYardLineSigned)
    };
};

(async () => {
    console.log('=== V305 PICK6 ARRIVING WHILE ON OFFENSE ===');
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;
    console.log('  scorer-to-be = ' + drv.label + ' (the device on offense)');

    const before = await drv.page.evaluate(SNAP);
    console.log('  before: ' + JSON.stringify(before));
    check('setup: the device is ON OFFENSE, not waiting', before.waiting === false,
          'waiting=' + before.waiting);

    // ---- T1: feed it the exact PICK6 shape room ZCGR carried.
    const want = before.us + 6;
    await drv.page.evaluate((scoreOpp, scoreUser) => {
        window._twoPlayer.receive({
            type: 'PICK6', message: 'PICK SIX! Defensive touchdown.',
            yardLine: 0, ownSide: true, needsPAT: true, pick6Plus6Missing: false,
            scoreUser: scoreUser,     // the SENDER's own score
            scoreOpp: scoreOpp,       // the sender's view of OUR score, +6 included
            quarter: 2, minutesLeft: 0, secondsLeft: 18,
            fromTeam: 'Pittsburgh', toTeam: 'San Francisco', ts: Date.now()
        });
    }, want, before.them);

    await H.sleep(4000);
    const after = await drv.page.evaluate(SNAP);
    console.log('  after:  ' + JSON.stringify(after));

    check('T1 the pick-6 six points landed',
          after.us === want, 'score ' + before.us + ' -> ' + after.us + ', wanted ' + want);
    check('T1 the PICK6 was drained from the queue (not left sitting)',
          after.pendingTypes.indexOf('PICK6') < 0,
          'pending=' + JSON.stringify(after.pendingTypes));
    check('T1 the PAT is now pending on this device (it must play it)',
          after.patPending === true, 'patPlayPending=' + after.patPending);
    check('T1 the PAT modal actually popped',
          after.patButtons > 0,
          'PAT buttons=' + after.patButtons + ' of ' + after.popupCount + ' popup instances');

    // ---- T2: the existing protection must not regress. A normal drive
    // outcome arriving while we are on offense must still be held, not applied.
    await drv.page.evaluate(() => {
        // Return to a clean on-offense state.
        window._rb2p_patPlayPending = false;
        window._rb2p_patPlayResolved = false;
        window._rb2p_pickSixPatCascadeActive = false;
        window._rb2p_userIsWaitingForOpponent = false;
        window._twoPlayer.pending.length = 0;
        window._rb2p_forceUserOffenseDrive(-20);
    });
    await H.sleep(2000);
    const t2before = await drv.page.evaluate(SNAP);
    await drv.page.evaluate((them) => {
        window._twoPlayer.receive({
            type: 'PUNT', message: 'Punt.', yardLine: -25, ownSide: true,
            scoreUser: them, scoreOpp: 0, quarter: 2, minutesLeft: 0, secondsLeft: 10,
            ts: Date.now()
        });
    }, t2before.them);
    await H.sleep(3000);
    const t2after = await drv.page.evaluate(SNAP);
    console.log('  T2 after: ' + JSON.stringify(t2after));
    check('T2 a normal PUNT outcome is still HELD while we are on offense',
          t2after.pendingTypes.indexOf('PUNT') >= 0,
          'pending=' + JSON.stringify(t2after.pendingTypes) +
          ' (must not drain non-PICK6 outcomes mid-drive)');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
