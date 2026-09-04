// e2e/v378-gvcg.js — room GVCG: a missed two-point try must be called a miss.
//
// From the record: Dallas got the conversion after a pick-six, chose 2 points,
// the ball went airborne at Q1 2:20 — and the attempt failed. Then:
//   152.4s  PAT-INV possession claimed / marker restored / pin -43 -> 48
//           (the invariant re-claimed possession and pinned the ball while the
//            play was resolving — erasing the "possession moved away" signal
//            the guardian needs to declare a miss)
//   155.8s  field empty; no "PAT resolved"; no PAT_RESULT
//   175.3s  PAT-INV force-release after 35s
//   182.6s  TURN-RESCUE -> offense — a formation appeared, the phone stayed WAIT
//   ...     five rescues, both phones on "waiting", both quit at 221s
//
// T1  once the conversion play is snapped, the invariant stands down (no
//     re-claim, no pin) while the play resolves
// T2  a snapped conversion whose ball dies scoreless is resolved MISSED, and
//     the guardian ships the conversion result on its own
// T3  a TURN-RESCUE that stages a drive also takes the ball (the flag flips)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const findBall = () => {
    var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') return x; }
    return null;
};

(async () => {
    console.log('=== V378 ROOM GVCG: A MISSED TWO-POINT TRY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // Stage the scorer's conversion the way the PICK6 applier does.
    const armConversion = page => page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixThisDeviceIsThrower = false;
        window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false;
        window._rb2p_patPlayStartMs = Date.now(); window._rb2p_patClobberCount = 0;
        window._rb2p_patPlaySnappedMs = 0; window._rb2p_patPlayDiedMs = 0; window._rb2p_patResolvedMs = 0;
        window._rb2p_patUserScoreAtStart = Number(em.userScore) || 0;
        window._rb2p_patOppScoreAtStart = Number(em.opponentScore) || 0;
        window._rb2p_userIsWaitingForOpponent = true;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 6; em.engineYardsToGo = 2;
        em.rawEngineMatch._6F = 48; em.engineControllerState = 2;
        window._rb2p_convAuthMs = Date.now();
    });

    // ---- T1: snapped -> the invariant stands down ----
    await armConversion(off.page);
    const t1 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [], ball = null;
        for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        if (!ball) return { noBall: true };
        ball._kp = 0; await new Promise(r => setTimeout(r, 120));
        ball._kp = 2; await new Promise(r => setTimeout(r, 120));           // the snap
        ball._kp = 7; await new Promise(r => setTimeout(r, 120));           // the throw
        const snapped = !!window._rb2p_patPlaySnappedMs;
        // the play resolves: the engine moves the ball and flips possession
        em.rawEngineMatch._6F = -43; em.enginePossessingTeamIdx = em.engineOpponentTeamIdx;
        await new Promise(r => setTimeout(r, 400));                          // ~8 invariant ticks
        return { snapped: snapped, yard: Math.round(Number(em.engineYardLineSigned)), poss: em.enginePossessingTeamIdx, user: em.engineUserTeamIdx,
                 diag: String(window._rb2p_readDiagLog()).slice(-200) };
    });
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 once the conversion play is snapped, the invariant leaves the ball and possession alone',
          !t1.noBall && t1.snapped === true && t1.yard === -43 && t1.poss !== t1.user && /standing down/.test(t1.diag), JSON.stringify(t1));

    // ---- T2: the ball dies scoreless -> MISSED, and the result ships ----
    const sent = [];
    await off.page.evaluate(() => { window.__t2sent = []; const real = window._twoPlayer.send; window.__realSend = real; window._twoPlayer.send = o => { window.__t2sent.push(o.type); real.call(window._twoPlayer, o); }; });
    const t2 = await off.page.evaluate(async () => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [], ball = null;
        for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        ball._kp = 0;                                                        // the ball dies, no points
        const t0 = Date.now(); let resolvedAt = null;
        while (Date.now() - t0 < 5000) { await new Promise(r => setTimeout(r, 100)); if (window._rb2p_patPlayResolved === true) { resolvedAt = Date.now() - t0; break; } }
        const pts = window._rb2p_patResultPoints;
        // the guardian ships a synthetic PAT_RESULT 5s after resolution
        const t1s = Date.now(); let shippedAt = null;
        while (Date.now() - t1s < 8000) { await new Promise(r => setTimeout(r, 100)); if (window.__t2sent.includes('PAT_RESULT')) { shippedAt = Date.now() - t1s; break; } }
        window._twoPlayer.send = window.__realSend;
        return { resolvedAt: resolvedAt, pts: pts, shippedAt: shippedAt, diag: String(window._rb2p_readDiagLog()).slice(-160) };
    });
    console.log('  T2: ' + JSON.stringify(t2));
    check('T2 a snapped conversion whose ball dies scoreless is resolved MISSED within 3s, and the result ships',
          t2.resolvedAt != null && t2.resolvedAt < 3000 && t2.pts === 0 && t2.shippedAt != null && /missed/.test(t2.diag), JSON.stringify(t2));

    // ---- T3: a rescue takes the ball ----
    // GVCG's end state, in a FRESH room: both phones parked, nothing owed, the
    // ledger naming one of them. (T1/T2's room is the wrong stage for this —
    // the conversion result there legitimately hands the other phone a live
    // drive, and a rescue must respect a live opponent.)
    await g.cleanup();
    const g2 = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait2 = await g2.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const idle = aWait2 ? g2.b : g2.a, other = aWait2 ? g2.a : g2.b;
    await other.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });
    const t3 = await idle.page.evaluate(async () => {
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_declareTurnOwner('ME', 'test');                        // the ledger names me, for real
        window._rb2p_matchStartMs = Date.now() - 60000;
        const t0 = Date.now(); let liveAt = null; const samples = [];
        while (Date.now() - t0 < 16000) {
            await new Promise(r => setTimeout(r, 200));
            if (Math.round((Date.now() - t0) / 200) % 5 === 0) samples.push(JSON.stringify({ s: Math.round((Date.now() - t0) / 1000), w: window._rb2p_userIsWaitingForOpponent, turn: window._rb2p_turnRec && window._rb2p_turnRec.owner, opp: window._rb2p_oppLiveRx && [Math.round((Date.now() - window._rb2p_oppLiveRx.at)), window._rb2p_oppLiveRx.iHaveBall], owed: window._rb2p_patOwed() }));
            if (window._rb2p_userIsWaitingForOpponent === false) { liveAt = Date.now() - t0; break; }
        }
        return { liveAt: liveAt, rescued: /TURN-RESCUE -> offense/.test(String(window._rb2p_readDiagLog())), running: window._rb2p_realDriveRunning(), samples: samples };
    });
    console.log('  T3: ' + JSON.stringify({ liveAt: t3.liveAt, rescued: t3.rescued, running: t3.running }));
    if (t3.liveAt == null) (t3.samples || []).forEach(x => console.log('     ' + x));
    check('T3 a TURN-RESCUE that stages a drive also takes the ball (the phone comes off waiting)',
          t3.liveAt != null, JSON.stringify({ liveAt: t3.liveAt, rescued: t3.rescued }));

    await g2.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
