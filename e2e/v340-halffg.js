// e2e/v340-halffg.js — DEQC Bug 1 (the prime SUSPECT): a FG missed AS the half
// expires must leave a CLEAN halftime transition behind.
//
// Room DEQC: B missed a FG as the Q2 clock hit 0:00; A saw a blank field for a
// moment, then "back to normal" — and the rest of that game went off the rails
// (wrong-side INT popup, possession bounce, a PAT from the 20, quarter 123).
// The owner's note: treat this transition as the SUSPECTED TRIGGER of the
// desync cascade, not a cosmetic glitch. The blank frame itself is a transient
// (the V183 spawn-gate purge); what this test pins down is the part that
// matters — the STATE the transition leaves behind, which is what the later
// bugs fed on. A missed FG ships as type OTHER (only a MADE FG gets vy 14 /
// type FG — index.html inferUserDriveEndType), stamped Q2 0:00.
//
// T1  the missed-FG outcome at Q2 0:00 applies (the receiver takes the ball)
// T2  both engines land in Q3 exactly (no runaway, no skipped quarter)
// T3  the Q3 LAW holds: role b has the ball, role a waits — single offense
// T4  no stale QTR-KEEP capture survives on either side
// T5  the turn record agrees with the on-field possession (owner = b)
// T6  the receiving side flapped possession at most twice (apply + Q3 LAW),
//     not the DEQC-style bounce
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V340 MISSED FG AT THE HALF — CLEAN TRANSITION ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;   // the KICKER (on offense in Q2)
    const def = aWait ? g.a : g.b;   // the receiver of the missed-FG outcome
    console.log('  kicker = ' + off.role + ', receiver = ' + def.role);

    // Arm a possession-flap sampler on the receiving side.
    await def.page.evaluate(() => {
        window.__flips = 0;
        window.__prevW = window._rb2p_userIsWaitingForOpponent === true;
        window.__flapIv = setInterval(() => {
            var w = window._rb2p_userIsWaitingForOpponent === true;
            if (w !== window.__prevW) { window.__flips++; window.__prevW = w; }
        }, 150);
    });

    // ---- the miss, exactly as the wire carries it: Q2, clock expired ----
    await Promise.all([
        off.page.evaluate(() => {
            var em = RB.engineState();
            em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 0;
        }),
        def.page.evaluate(() => {
            var em = RB.engineState();
            em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 1;
        })
    ]);
    await def.page.evaluate((sc) => {
        window._twoPlayer.receive({
            type: 'OTHER', turnover: false,
            yardLine: -25, ownSide: true,
            scoreUser: sc.them, scoreOpp: sc.us,
            quarter: 2, minutesLeft: 0, secondsLeft: 0,
            fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
            message: 'Possession change. On your 25 yard line', ts: Date.now()
        });
    }, await def.page.evaluate(() => ({
        us: Number(RB.engineState().userScore) || 0,
        them: Number(RB.engineState().opponentScore) || 0
    })));
    // The kicker's own device parks after its send (mirror the send-side flags).
    await off.page.evaluate((other) => {
        window._rb2p_userIsWaitingForOpponent = true;
        if (typeof window._rb2p_declareTurnOwner === 'function')
            window._rb2p_declareTurnOwner(other, 'fg-miss');
    }, def.role);
    await sleep(1500);
    const t1 = await def.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true);
    check('T1 the missed-FG outcome applied — the receiver took the ball', t1 === true,
          'receiver waiting=' + !t1);

    // ---- the half rolls: both engines enter Q3 (the engine's own rollover) ----
    await off.page.evaluate(() => { RB.engineState().engineQuarter = 3; });
    await def.page.evaluate(() => { RB.engineState().engineQuarter = 3; });
    await sleep(6000);   // Q3 LAW + reconciler settle window

    const A = await g.a.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        q: Number(RB.engineState().engineQuarter),
        resume: window._rb2p_quarterResumePending === true,
        preYard: window._rb2p_preRolloverYard
    }));
    const B = await g.b.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        q: Number(RB.engineState().engineQuarter),
        resume: window._rb2p_quarterResumePending === true,
        preYard: window._rb2p_preRolloverYard
    }));
    const flips = await def.page.evaluate(() => { clearInterval(window.__flapIv); return window.__flips; });
    const turn = await TP.fbGet('rooms/' + g.code + '/turn');
    console.log('  A=' + JSON.stringify(A));
    console.log('  B=' + JSON.stringify(B));
    console.log('  receiver flips=' + flips + '  turn=' + JSON.stringify(turn));

    check('T2 both engines are in Q3 exactly', A.q === 3 && B.q === 3,
          'A.q=' + A.q + ' B.q=' + B.q);
    check('T3 Q3 LAW: role b on offense, role a waiting — single offense',
          A.waiting === true && B.waiting === false,
          'a.waiting=' + A.waiting + ' b.waiting=' + B.waiting);
    // The on-offense side's preYard is its LIVE spot (the 100ms tracker
    // re-captures continuously while the ball is held with a running clock —
    // legit by construction). The bug was the WAITING side keeping Q2's
    // capture armed into the half (pre-fix: A carried -15 while parked).
    check('T4 no armed resume anywhere; the WAITING side carries no leftover capture',
          !A.resume && !B.resume &&
          (A.waiting ? A.preYard == null : B.preYard == null),
          JSON.stringify({ A, B }));
    check('T5 the turn record names b (agrees with the field)',
          turn && turn.owner === 'b', JSON.stringify(turn));
    check('T6 the receiver flapped at most twice (no DEQC possession bounce)',
          flips <= 2, 'flips=' + flips);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
