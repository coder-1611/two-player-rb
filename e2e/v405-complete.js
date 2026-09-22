// e2e/v405-complete.js — a game is complete when the stats screen appears; conversions never hang.
//
//   T1  in kick mode, the ball leaving rest counts as the try (patTryStarted)
//   T2  possession flipped away + empty field 8s after the offer = the try is over (PAT-INV stands down, guard resolves MISSED)
//   T3  a second conversion modal while one is up is a duplicate (refused)
//   T4  20s past a decided horn on a visible page the FINAL is forced, even with a play "in progress"
//   T5  the checker: a decided horn with no final on a phone that stayed = INCOMPLETE (gameover); closed early = incomplete, player's doing
const H = require('./harness');
const TP = require('./two-player');
const R = require('../tools/audit-rules.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V405 COMPLETE ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1 ----
    const t1 = await off.page.evaluate(() => {
        const em = RB.engineState(); const s = em.enginePatModeFlag;
        em.enginePatModeFlag = 1;
        const kick = window._rb2p_patTryStarted(4, 0, true), stillAtRest = window._rb2p_patTryStarted(0, 0, true), notChecked = window._rb2p_patTryStarted(4, 0, false);
        em.enginePatModeFlag = 0;
        const noKickMode = window._rb2p_patTryStarted(4, 0, true);
        em.enginePatModeFlag = s;
        return { kick, stillAtRest, notChecked, noKickMode };
    });
    check('T1 in kick mode the ball leaving rest is the try; at rest, outside kick mode, or unchecked it is not', t1.kick === true && !t1.stillAtRest && !t1.notChecked && !t1.noKickMode, JSON.stringify(t1));

    // ---- T2 ----
    const t2 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T2-START');
        const em = RB.engineState();
        // the shape: a pick-6 conversion owed, the offer 10s old, no snap seen, the engine has flipped possession away and cleared the field
        window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixThisDeviceIsThrower = false;
        window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false; window._rb2p_patPlaySnappedMs = 0; window._rb2p_patPlayDiedMs = 0;
        window._rb2p_patDutyMine = true; window._rb2p_lastConvModalMs = Date.now() - 10000;
        window._rb2p_patUserScoreAtStart = Number(em.userScore) || 0; window._rb2p_patOppScoreAtStart = Number(em.opponentScore) || 0;
        const sent = []; const realSend = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o.type); return realSend.call(window._twoPlayer, o); };
        // clear the field and flip possession the way the engine does after a try
        try { const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of all) { if (x && !x._HL2 && x._eE2 && /obj_ball|obj_playerOF|obj_playerDF/.test(x._eE2._fE2)) { try { _cr(x); } catch (e) { x._HL2 = true; } } } } catch (e) {}
        em.enginePossessingTeamIdx = em.engineUserTeamIdx ? 0 : 1; em.engineYardLineSigned = -40; em.engineDownNumber = 1;
        const t0 = Date.now(); let resolved = false;
        while (Date.now() - t0 < 7000) { await new Promise(r => setTimeout(r, 200)); if (window._rb2p_patPlayResolved === true) { resolved = true; break; } }
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T2-START'));
        window._twoPlayer.send = realSend;
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_patPlayPending = false; window._rb2p_patDutyMine = null;
        return { resolved, stood: /PAT-INV the try is over/.test(tail), claimed: /PAT-INV possession claimed/.test(tail), missed: /PAT resolved: missed/.test(tail), pts: window._rb2p_patResultPoints, sent, tail: tail.slice(-300) };
    });
    check('T2 a try the bridge never saw, with possession flipped and the field clear, resolves MISSED instead of being restored', t2.stood && !t2.claimed && t2.resolved && t2.missed && t2.pts === 0, JSON.stringify(t2));

    // ---- T3 ----
    const t3 = await off.page.evaluate(() => {
        const realUp = window._rb2p_patModalUp;
        window._rb2p_patModalUp = () => true; window._rb2p_lastConvModalMs = Date.now() - 3000;
        const dupNow = window._rb2p_convDuplicate();
        window._rb2p_lastConvModalMs = Date.now() - 60000; const dupOld = window._rb2p_convDuplicate();
        window._rb2p_patModalUp = () => false; window._rb2p_lastConvModalMs = Date.now() - 3000; const dupGone = window._rb2p_convDuplicate();
        window._rb2p_patModalUp = realUp; window._rb2p_lastConvModalMs = 0;
        return { dupNow, dupOld, dupGone };
    });
    const t3s = await off.page.evaluate(async () => { const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text(); return /window\._rb2p_convDuplicate\(\)\) refusal = 'a conversion modal is already up \(duplicate\)'/.test(src); });
    check('T3 a second offer while one is up (within 20s) is a duplicate; an old or gone modal is not; the gate refuses it', t3.dupNow === true && !t3.dupOld && !t3.dupGone && t3s === true, JSON.stringify({ t3, t3s }));

    // ---- T4 ----
    const t4 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T4-START');
        const em = RB.engineState();
        const sQ = em.engineQuarter, sU = em.userScore, sO = em.opponentScore, sStable = window._rb2p_lastStableQuarter, sWire = window._rb2p_wireQuarter;
        let reported = null; const realRep = window._rb2p_reportGameOver; window._rb2p_reportGameOver = rep => { reported = rep; };
        window._rb2p_gameOverReported = false; window._rb2p_inOvertime = false;
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        em.engineQuarter = 5; em.setUserScore(31); em.setOpponentScore(20);
        window._rb2p_pastRegSeenMs = Date.now() - 25000;          // the dwell is long over
        window._rb2p_patPlayPending = true;                          // a hold that used to block the final for 30s
        const t0 = Date.now(); while (Date.now() - t0 < 3000 && !reported) await new Promise(r => setTimeout(r, 100));
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T4-START'));
        window._rb2p_patPlayPending = false; window._rb2p_reportGameOver = realRep; window._rb2p_gameOverReported = true;
        em.engineQuarter = sQ; em.setUserScore(sU); em.setOpponentScore(sO); window._rb2p_lastStableQuarter = sStable; window._rb2p_wireQuarter = sWire;
        await new Promise(r => setTimeout(r, 400)); window._rb2p_pastRegSeenMs = 0;
        return { reported: !!reported, forced: /FINAL forced — 20s past a decided horn/.test(tail) };
    });
    check('T4 20s past a decided horn on a visible page the FINAL is forced through any hold', t4.reported && t4.forced, JSON.stringify(t4));

    // ---- T5: the checker's definition of complete ----
    const T0 = 1700000000000; const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
    const base = [mk('a', 0, 'bind', { ver: 'V405' }), mk('b', 0, 'bind', { ver: 'V405' }), mk('a', 1000, 'score', { su: 20, so: 14, dsu: 6, dso: 0, q: 4, clk: 5 }),
                  mk('a', 5000, 'q', { from: 4, to: 5, clk: 0, d: 1, tg: 10, y: 0 }), mk('b', 5100, 'q', { from: 4, to: 5, clk: 0, d: 1, tg: 10, y: 0 })];
    const stayed = base.concat([mk('a', 12000, 'final', { su: 20, so: 14 }), mk('a', 40000, 'stage', { of: 0, df: 0, ball: 0, wait: true, ovl: true, fps: 60 }), mk('b', 40000, 'stage', { of: 0, df: 0, ball: 0, wait: true, ovl: true, fps: 60 })]);
    const left = base.concat([mk('a', 12000, 'final', { su: 20, so: 14 }), mk('b', 9000, 'vis', { h: true, why: 'pagehide' })]);
    const done = base.concat([mk('a', 12000, 'final', { su: 20, so: 14 }), mk('b', 12200, 'final', { su: 14, so: 20 })]);
    const rs = R.audit(stayed, {}), rl = R.audit(left, {}), rd = R.audit(done, {});
    const has = (r, re) => r.flags.some(f => f.rule === 'R-FINAL' && re.test(f.msg));
    check('T5 no final on a phone that stayed = INCOMPLETE at game-over level; closed early = incomplete but not the game\'s fault; both finals = complete',
          !rs.complete.complete && has(rs, /never reached the stats screen/) && rs.flags.find(f => f.rule === 'R-FINAL').impact === 3 &&
          !rl.complete.complete && has(rl, /closed the page 4s after the horn/) && rl.flags.find(f => f.rule === 'R-FINAL').impact === 0 &&
          rd.complete.complete && !rd.flags.some(f => f.rule === 'R-FINAL'),
          JSON.stringify({ s: rs.flags.map(f => f.msg), l: rl.flags.map(f => f.msg), d: rd.complete }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
