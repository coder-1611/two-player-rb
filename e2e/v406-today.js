// e2e/v406-today.js — the five defects from 2026-09-22's games and the complaint.
//
//   T1  the INTERCEPTED banner needs a real takeaway: a KICKOFF/TD outcome never carries the hint, and the receiver ignores the hint alone
//   T2  the 35s wall stands down for a try in flight, for a drive that already handed off, and resolves MADE when the score moved
//   T3  the conversion licence sees a +6 since the last snap even when the tick baseline already absorbed it
//   T4  a conversion that crossed the horn and left a drive at the 2 is handed off as a kickoff
//   T5  a live payload from before the last applied hand-off never counts as "live" (shipped predicate); the post-try hand-off window is 60s
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V406 TODAY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;
    const src = await off.page.evaluate(async () => (await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text()));

    // ---- T1 ----
    check('T1 the sender puts the turnover hint only on INT/OTHER, and the receiver lights INTERCEPTED only on real deltas or an INT type',
          /turnover: isTurnover && \(type === 'INT' \|\| type === 'OTHER'\)/.test(src) && /: \(outcome\.type === 'INT'\);/.test(src) && !/: \(outcome\.turnover === true\);/.test(src), '');

    // ---- T2 ----
    const t2 = await off.page.evaluate(async () => {
        const out = {}; const em = RB.engineState();
        const sU = em.userScore;
        window._rb2p_diagLog('T2-START');
        // (a) a try in flight: the wall defers
        window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixThisDeviceIsThrower = false;
        window._rb2p_patPlayPending = true; window._rb2p_patDutyMine = { ts: Date.now() }; window._rb2p_p6ScorerOwes = true;
        window._rb2p_patUserScoreAtStart = Number(em.userScore) || 0;
        window._rb2p_patOwedSinceMs = Date.now() - 40000; window._rb2p_patPlaySnappedMs = Date.now() - 3000;
        em.engineDownNumber = 6;
        const w1 = window._rb2p_patOwed();
        out.deferred = !!w1 && window._rb2p_patPlayPending === true && /wall deferred — the try is in flight/.test(String(window._rb2p_readDiagLog()));
        // (b) the drive already handed off: the wall stands down and retires the duty
        window._rb2p_patPlaySnappedMs = 0; window._rb2p_patOwedSinceMs = Date.now() - 40000;
        window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = Date.now() - 3000;
        const w2 = window._rb2p_patOwed();
        out.stoodDown = w2 === '' && window._rb2p_patPlayPending === false && !window._rb2p_patDutyMine;
        window._rb2p_userIsWaitingForOpponent = false;
        // (c) the score moved +2 since the offer: the wall resolves MADE and ships
        window._rb2p_patPlayPending = true; window._rb2p_patDutyMine = { ts: Date.now() }; window._rb2p_p6ScorerOwes = true;
        window._rb2p_patOwedSinceMs = Date.now() - 40000; window._rb2p_patUserScoreAtStart = Number(em.userScore) || 0;
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o.type); return real.call(window._twoPlayer, o); };
        em.setUserScore((Number(em.userScore) || 0) + 2); em.engineDownNumber = 6;
        const w3 = window._rb2p_patOwed();
        await new Promise(r => setTimeout(r, 300));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T2-START'));
        out.made = /resolving the conversion as MADE/.test(tail) && window._rb2p_patResultPoints === 2 && sent.includes('PAT_RESULT');
        out.w = [w1, w2, w3];
        // restore
        em.setUserScore(sU); em.engineDownNumber = 1; window._rb2p_pickSixPatCascadeActive = false; window._rb2p_patPlayPending = false; window._rb2p_patDutyMine = null;
        window._rb2p_p6ScorerOwes = false; window._rb2p_patOwedSinceMs = 0; window._rb2p_userIsWaitingForOpponent = false; window._rb2p_lastSentOutcome = null;
        return out;
    });
    check('T2 the wall defers for a try in flight, stands down after a hand-off, and resolves MADE when the score moved', t2.deferred && t2.stoodDown && t2.made, JSON.stringify(t2));

    // ---- T3 ----
    const t3 = await off.page.evaluate(() => {
        const em = RB.engineState(); const sU = em.userScore;
        window._rb2p_convAuthMs = 0; window._rb2p_lastTd6Ms = 0;
        window._rb2p_scoreAtLastSnap = Number(em.userScore) || 0; window._rb2p_lastSnapMs = Date.now() - 5000;
        em.setUserScore((Number(em.userScore) || 0) + 6);
        window._rb2p_convScorePrev = { u: Number(em.userScore) || 0 };   // the tick baseline already absorbed the +6 (the race)
        const lic = window._rb2p_conversionLicence();
        em.setUserScore(sU); window._rb2p_scoreAtLastSnap = sU;
        const none = window._rb2p_conversionLicence();
        return { lic, none };
    });
    check('T3 +6 since the last snap is a licence even when the tick baseline raced ahead; no +6 = no licence', /L1c touchdown \(\+6 since the snap\)/.test(String(t3.lic)) && !t3.none, JSON.stringify(t3));

    // ---- T4 ----
    const t4 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T4-START');
        const em = RB.engineState();
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o.type); return real.call(window._twoPlayer, o); };
        window._rb2p_lastConvModalMs = Date.now() - 12000; window._rb2p_quarterChangedToMs = Date.now() - 2000;
        window._rb2p_patPlayPending = false; window._rb2p_patDutyMine = null; window._rb2p_p6ScorerOwes = false; window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_kickoffGraceUntil = 0;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineYardLineSigned = 48; em.engineDownNumber = 1; em.engineYardsToGo = 2;
        const t0 = Date.now(); while (Date.now() - t0 < 6000 && !sent.length) await new Promise(r => setTimeout(r, 100));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T4-START'));
        window._rb2p_lastConvModalMs = 0;
        return { sent, logged: /POST-CONV the try crossed the horn/.test(tail) };
    });
    check('T4 a drive left at the 2 after a horn-crossing conversion is handed off as a TD kickoff', t4.logged && t4.sent.includes('TD') && !t4.sent.includes('OTHER'), JSON.stringify(t4));

    // ---- T5 ----
    check('T5 stale live payloads from before the last applied hand-off are ignored, and the post-try typing window is 60s',
          /opponentLivePayload\.iHaveBall === true &&\s*\n?\s*Number\(opponentLivePayload\.ts\) < \(Number\(window\._rb2p_lastAppliedOutcomeTs\) \|\| 0\)\) return;/.test(src) &&
          /window\._rb2p_lastAppliedOutcomeTs = val\.ts;/.test(src) && /_rb2p_lastConvModalMs\) \|\| 0\) < 60000\) \{ type = 'TD'/.test(src), '');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
