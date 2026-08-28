// e2e/v363-outcomehold.js — a drive record is never consumed by a device that
// cannot apply it. Room RDOG: "a punt happened but it never reached my computer".
//
// The telemetry named the state exactly:
//     hb/a   { fps: 0, vis: "H" }
//     dbg/a  "ENGINE LOOP DEAD — kicking _fi5", "rAF silent — fallback driving frames"
//     outcomes/b { type: "KICKOFF", message: "Possession change. On your 23 yard
//                  line", ack: "a", ackTs: ... }
//
// A hidden tab still runs Firebase callbacks, but the browser throttles rAF to
// ZERO. So the receive handler ran, advanced lastTs (record consumed), wrote the
// ack — and then could not stage the drive, because staging needs frames. The
// ack meant "delivered" when only delivery had happened, and the ball was gone.
//
// T1  the gate names a hidden page as unable to apply
// T2  an outcome arriving at a hidden device is HELD — not consumed, not acked
// T3  it is applied as soon as the device can draw again
// T4  a device that CAN apply is unaffected (no deferral in the normal path)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Make document.hidden report true without actually backgrounding the tab
// (a real background would also stop puppeteer's own evaluate timing).
const setHidden = (page, hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    window._rb2p_diagFpsSeen = false;      // don't let a stale fps sample decide
}, hidden);

(async () => {
    console.log('=== V363 A HELD OUTCOME IS NEVER LOST (room RDOG) ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;      // has the ball — will punt
    const def = aWait ? g.a : g.b;      // waiting — must receive it
    console.log('  offense = ' + off.role + ', receiver = ' + def.role);

    // ---- T1: the gate names the state ----
    await setHidden(def.page, true);
    const t1 = await def.page.evaluate(() => window._rb2p_outcomeApplyBlocked());
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 a hidden page is named as unable to stage a drive',
          typeof t1 === 'string' && /hidden/.test(t1), JSON.stringify(t1));

    // ---- T2: the punt lands in Firebase but is HELD, not consumed ----
    const puntTs = await off.page.evaluate(() => {
        const em = RB.engineState();
        const o = {
            type: 'KICKOFF', yardLine: -26.6, ownSide: false, turnover: false,
            message: 'Possession change. On your 23 yard line',
            quarter: Number(em.engineQuarter) || 1,
            minutesLeft: 0, secondsLeft: 20,
            scoreUser: Number(em.userScore) || 0, scoreOpp: Number(em.opponentScore) || 0,
            fromTeam: 'Buffalo', toTeam: 'San Francisco', ts: Date.now()
        };
        window._twoPlayer.send(o);
        return o.ts;
    });
    await sleep(2500);
    const t2 = await def.page.evaluate(() => ({
        held: !!window._rb2p_deferredOutcome,
        heldType: window._rb2p_deferredOutcome ? window._rb2p_deferredOutcome.type : null
    }));
    const rec2 = await TP.fbGet('rooms/' + g.code + '/outcomes/' + off.role);
    console.log('  T2: ' + JSON.stringify(t2) + '  ack=' + (rec2 && rec2.ack));
    check('T2 a punt arriving at a blind device is HELD, and never acked',
          t2.held === true && t2.heldType === 'KICKOFF' && !(rec2 && rec2.ack),
          JSON.stringify(t2) + ' ack=' + JSON.stringify(rec2 && rec2.ack));

    // ---- T3: it arrives the moment the device can draw again ----
    await setHidden(def.page, false);
    await def.page.evaluate(() => { window._rb2p_diagFpsSeen = false; });
    await sleep(3000);
    const t3 = await def.page.evaluate(() => ({
        stillHeld: !!window._rb2p_deferredOutcome,
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        yard: Number(RB.engineState().engineYardLineSigned)
    }));
    const rec3 = await TP.fbGet('rooms/' + g.code + '/outcomes/' + off.role);
    console.log('  T3: ' + JSON.stringify(t3) + '  ack=' + (rec3 && rec3.ack));
    check('T3 the held punt is applied once frames return, and acked then',
          t3.stillHeld === false && rec3 && rec3.ack === def.role,
          JSON.stringify(t3) + ' ack=' + JSON.stringify(rec3 && rec3.ack));
    check('T3 the receiver actually took possession from the held punt',
          t3.waiting === false, 'stillWaiting=' + t3.waiting);

    // ---- T4: the normal path is untouched ----
    const t4 = await def.page.evaluate(() => window._rb2p_outcomeApplyBlocked());
    console.log('  T4: ' + JSON.stringify(t4));
    check('T4 a device that can draw reports no block at all', t4 === '', JSON.stringify(t4));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
