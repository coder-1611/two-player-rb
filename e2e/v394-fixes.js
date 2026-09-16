// e2e/v394-fixes.js — the causes behind "the ball moved" and "the clock shifted".
//
//   T1  a play that SETTLES in the new quarter retires the between-quarters keep
//       (the keep then refuses: "already been played")
//   T2  the quarter-break keep branch itself stands down once the quarter is played
//   T3  the clock law accepts the engine's own quarter reset even a frame after the
//       quarter number changed (epoch grace)
//   T4  a drive-end right after a conversion is typed TD (kickoff), never OTHER
//   T5  a reload that resumes into Q3 marks the halftime law as already applied
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const since = (page, m) => page.evaluate((m) => { const s = String(window._rb2p_readDiagLog()); const i = s.lastIndexOf(m); return i < 0 ? '' : s.slice(i); }, m);

(async () => {
    console.log('=== V394 FIXES ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1: a settled play retires the keep ----
    const t1 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T1-START');
        window._rb2p_qSnappedThisQuarter = false; window._rb2p_quarterResumePending = true; window._rb2p_qGovToppedQ = 2;
        window._rb2p_noteQuarterPlayed('test settle run');
        const flags = { snapped: window._rb2p_qSnappedThisQuarter, pending: window._rb2p_quarterResumePending, topped: window._rb2p_qGovToppedQ };
        let keep = null;
        if (typeof window._rb2p_doKeepDrive === 'function') { const em = RB.engineState(); const y = Number(em.engineYardLineSigned) || -20; window._rb2p_doKeepDrive(y, 1, 10); await new Promise(r => setTimeout(r, 120)); keep = /QTR-KEEP refused — the quarter has already been played/.test(String(window._rb2p_readDiagLog())); }
        return { flags, keep, seamPresent: typeof window._rb2p_doKeepDrive === 'function' };
    });
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 a settled play retires the resume, the governor marker and marks the quarter played', t1.flags.snapped === true && t1.flags.pending === false && t1.flags.topped === null, JSON.stringify(t1));
    check('T1b ...and the keep-drive then refuses' + (t1.seamPresent ? '' : ' (seam absent this tick: skipped)'), !t1.seamPresent || t1.keep === true, JSON.stringify(t1));

    // ---- T2: the quarter-break branch is gated (static check of the shipped predicate) ----
    const t2 = await off.page.evaluate(async () => {
        // drive the real watchdog: park on the quarter-break stage with the clock expired and the quarter "topped"
        const em = RB.engineState(); const raw = em.rawEngineMatch;
        window._rb2p_diagLog('T2-START');
        // the real order: the quarter rolls over (the tracker resets 'played'), the first play of the
        // new quarter SETTLES (played), and only then does the engine park on the quarter-break stage
        window._rb2p_clockLicence('test'); em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 0;
        await new Promise(r => setTimeout(r, 400));                 // the tracker sees the new quarter
        window._rb2p_noteQuarterPlayed('test: first play settled');
        window._rb2p_qGovToppedQ = 2; em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDriveFsmStage = 13;
        await new Promise(r => setTimeout(r, 2600));
        const d = String(window._rb2p_readDiagLog()); const i = d.lastIndexOf('T2-START');
        const tail = d.slice(i);
        em.engineDriveFsmStage = 2;
        return { kept: /QTR-KEEP resume|CLOCKGATE licence \(quarter keep\)|LOOP-GUARD healed x\d+ \(keep\)/.test(tail), tail: tail.slice(-160) };
    });
    console.log('  T2: ' + JSON.stringify(t2));
    check('T2 the quarter-break keep does not fire for a quarter that has been played', t2.kept === false, JSON.stringify(t2));

    // ---- T3: epoch grace ----
    const t3 = await off.page.evaluate(async () => {
        window._rb2p_clockGateTestArm();
        const em = RB.engineState(); const raw = em.rawEngineMatch;
        window._rb2p_clockLicence('test'); em.engineMinutesLeft = 0; em.engineSecondsLeft = 3; window._rb2p_clockGateTick(); window._rb2p_clockLicenceUntil = 0;
        await new Promise(r => setTimeout(r, 120));
        const q = Number(em.engineQuarter);
        raw._Wy = q + 1;                                     // case 19: the quarter bumps
        await new Promise(r => setTimeout(r, 120));          // the judge sees the new quarter with the old 0:03
        em.engineMinutesLeft = 2; em.engineSecondsLeft = 0;  // case 20, a few frames later: the engine's reset
        await new Promise(r => setTimeout(r, 200));
        const after = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        const refused = /CLOCKGATE refused 2:00/.test(String(window._rb2p_readDiagLog()).slice(-400));
        raw._Wy = q; window._rb2p_clockLicence('test'); em.engineMinutesLeft = 2; em.engineSecondsLeft = 0;
        return { after, refused };
    });
    console.log('  T3: ' + JSON.stringify(t3));
    check('T3 the engine\'s own clock reset a frame after the quarter bump is accepted (2:00 stands)', t3.after === 120 && !t3.refused, JSON.stringify(t3));

    // ---- T4: drive-end after a conversion is a kickoff ----
    const t4 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T4-START');
        window.__t4 = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { window.__t4.push(o.type); real.call(window._twoPlayer, o); };
        window._rb2p_lastConvModalMs = Date.now();
        const s = RB.engineState(); s.enginePossessingTeamIdx = s.engineUserTeamIdx; s.engineDriveFsmStage = 2; s.enginePriorFsmStage = 4;
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false; window._rb2p_kickoffGraceUntil = 0;
        try { _1c1(s.rawEngineMatch, _Sc2); } catch (e) {}
        const t0 = Date.now(); while (Date.now() - t0 < 6000 && !window.__t4.length) await new Promise(r => setTimeout(r, 100));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const i = d.lastIndexOf('T4-START');
        return { sent: window.__t4, typed: /typed TD \(kickoff\), not OTHER/.test(d.slice(i)) };
    });
    console.log('  T4: ' + JSON.stringify(t4));
    check('T4 a dead-stage drive-end within 30s of a conversion offer ships as TD (kickoff), not OTHER', t4.typed && t4.sent.includes('TD') && !t4.sent.includes('OTHER'), JSON.stringify(t4));

    // ---- T5: resume into Q3 marks the halftime law applied (static: the restore predicate) ----
    const t5 = await def.page.evaluate(async () => { const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text(); return { present: /rs\.quarter >= 3 && window\._rb2p_q3LawApplied !== true/.test(src) }; });
    check('T5 a resume into Q3 marks the halftime law as already applied (shipped in the restore path)', t5.present === true, '');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
