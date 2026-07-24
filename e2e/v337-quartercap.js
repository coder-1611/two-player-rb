// e2e/v337-quartercap.js — DEQC Bug 5: the quarter can never run away, and a
// DEAD opponent cannot strand a decided game.
//
// Room DEQC's end snap showed quarter:123 on BOTH devices. Mechanism: B's
// engine died backgrounded; after the last pick-6 PAT, _rb2p_patPlayResolved
// stayed true, which disables the V293 waiting-side clock pin — so A's parked
// engine expired at 0:00 over and over and rolled its own quarter unbounded
// (the V295 governor's burst clamp only covered Q2..Q4, so past it nothing
// stopped 5 -> 123; the wire then mirrored it to B). And with B dead, nothing
// could finish the game A had already won 22-0.
//
// T1  engineQuarter shoved to 40 is clamped back within ~1s (never > 5)
// T2  a poisoned wireQuarter (123) is clamped too and cannot re-inflate
// T3  DEAD-OPPONENT END: Q4, clock ~0, non-tied, waiting, opponent silent
//     >45s  ->  this device declares the FINAL on its own
// T4  a LIVE opponent in the same spot does NOT trigger the dead-opponent end
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V337 QUARTER CEILING + DEAD-OPPONENT END ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const def = aWait ? g.a : g.b;

    // ---- T1: shove the quarter to 40 and run the governor itself ----
    // (Driving the governor synchronously isolates the CEILING from the OT
    // machinery: with a tied test score, q>=5 would otherwise arm the OT coin
    // flip, which pins q=5 for its own reasons and masks the missing clamp.)
    const t1 = await off.page.evaluate(() => {
        window._rb2p_inOvertime = false;
        var em = RB.engineState();
        var q0 = Number(em.engineQuarter);
        em.engineQuarter = 40;
        window._rb2p_quarterGovernorTick(null);
        var q = Number(RB.engineState().engineQuarter);
        em.engineQuarter = q0;   // restore for the later tests
        return { q: q };
    });
    console.log('  governor on shove-40: ' + JSON.stringify(t1));
    check('T1 a runaway engineQuarter is clamped back (never > 5)',
          t1.q <= 5, 'quarter=' + t1.q);

    // ---- T2: poisoned wire quarter (the DEQC 123, mirrored device-to-device) ----
    const t2 = await off.page.evaluate(() => {
        var em = RB.engineState();
        var q0 = Number(em.engineQuarter);
        window._rb2p_wireQuarter = 123;
        em.engineQuarter = 123;
        window._rb2p_quarterGovernorTick(null);
        var q = Number(RB.engineState().engineQuarter);
        var wire = Number(window._rb2p_wireQuarter);
        em.engineQuarter = q0; window._rb2p_wireQuarter = 0;   // restore
        return { q: q, wire: wire };
    });
    console.log('  governor on poison-123: ' + JSON.stringify(t2));
    check('T2 a poisoned wireQuarter is clamped and cannot re-inflate the engine',
          t2.q <= 5 && t2.wire <= 5, JSON.stringify(t2));

    // ---- T3: dead-opponent end on the WAITING device ----
    // Silence the offense page's live pushes (its engine "dies"), then put the
    // waiting device at Q4 0:19, 22-0, with the opponent's last live push 60s
    // old. The game is decided and cannot proceed — the FINAL must come.
    // Kill EVERY interval on the off page — its 500ms live push included. The
    // off page is not used again (T3/T4 run on the waiting device only).
    await off.page.evaluate(() => { for (var i = 1; i < 100000; i++) clearInterval(i); });
    await sleep(1500);   // let any in-flight push land before back-dating
    const t3 = await def.page.evaluate(async () => {
        // By a real Q4 the Q3 LAW has long since applied; without this latch the
        // law's CATCH-UP branch would force role b onto offense the moment the
        // test sets Q4, un-waiting the device and hiding the signal under test.
        window._rb2p_q3LawApplied = true;
        // A real endgame REACHED Q4 — without this history the governor
        // (correctly) treats a teleported q=4 as a burst and drags it back.
        window._rb2p_lastStableQuarter = 4;
        window._rb2p_wireQuarter = 4;
        var em = RB.engineState();
        em.engineQuarter = 4;
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 19;
        em.setUserScore(0); em.setOpponentScore(22);
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_gameOverReported = false;
        window._rb2p_oppLiveRxAt = Date.now() - 60000;   // opponent silent for 60s
        await new Promise(r => setTimeout(r, 4000));
        return { reported: window._rb2p_gameOverReported === true,
                 waiting: window._rb2p_userIsWaitingForOpponent === true,
                 oppRxAge: Math.round((Date.now() - (Number(window._rb2p_oppLiveRxAt) || 0)) / 1000),
                 q: Number(RB.engineState().engineQuarter),
                 clock: Number(RB.engineState().engineMinutesLeft) + ':' + Number(RB.engineState().engineSecondsLeft) };
    });
    console.log('  dead-opponent end: ' + JSON.stringify(t3));
    check('T3 a decided Q4 game with a 60s-silent opponent declares the FINAL',
          t3.reported === true, JSON.stringify(t3));

    // ---- T4: a LIVE opponent in the same spot does NOT end the game ----
    const t4 = await def.page.evaluate(async () => {
        window._rb2p_q3LawApplied = true;
        window._rb2p_lastStableQuarter = 4;
        window._rb2p_wireQuarter = 4;
        window._rb2p_gameOverReported = false;
        var f = document.getElementById('rb-final'); if (f) f.style.display = 'none';
        var em = RB.engineState();
        em.engineQuarter = 4;
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 19;
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_oppLiveRxAt = Date.now();   // opponent alive RIGHT NOW
        await new Promise(r => setTimeout(r, 4000));
        return { reported: window._rb2p_gameOverReported === true };
    });
    console.log('  live-opponent control: ' + JSON.stringify(t4));
    check('T4 a LIVE opponent at Q4 0:19 does NOT trigger the dead-opponent end',
          t4.reported === false, JSON.stringify(t4));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
