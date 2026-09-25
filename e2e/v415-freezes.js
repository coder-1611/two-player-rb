// e2e/v415-freezes.js — the freezes of 2026-09-24/25, one check each.
//
//   F1  VJGW  a forced drive clears the one-shot "hand-off in progress" guard (A sent nothing for 5.5 min)
//   F2  VJGW  a queued hand-off I have played past is purged, never applied minutes later
//   F3  HUPE/MEOE  a try that crosses the HALFTIME horn is not handed off — the halftime rule decides
//   F4  LNRI  the 35s wall waits while the 1 PT / 2 PT choice is on screen, and never fires into a snapped try
//   F5  VJGW  the field check needs 10 real seconds (two ticks in a burst are not enough)
//   F6  VJGW  the field check waits while the turn has just moved (the hand-off is on its way)
//   F7  LYHM  an overtime touchdown gets its conversion, and then the drive is handed over (no repeat touchdowns)
//   F8  checker: a held hand-off is a hidden screen (not a deadlock); a player closing the game mid pick-six is LEFT (not a freeze)
const H = require('./harness');
const TP = require('./two-player');
const R = require('../tools/audit-rules.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V415 FREEZES ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- F1 ----
    const f1 = await def.page.evaluate(() => {
        window._rb2p_userOutcomeSendInProgress = true;
        const ok = window._rb2p_forceUserOffenseDrive(-20, true);
        const cleared = window._rb2p_userOutcomeSendInProgress === false;
        window._rb2p_userIsWaitingForOpponent = true;
        return { ok, cleared };
    });
    check('F1 a forced drive clears the hand-off-in-progress guard', f1.cleared === true, JSON.stringify(f1));
    await sleep(1500);

    // ---- F2 ----
    const f2 = await def.page.evaluate(async () => {
        window._rb2p_diagLog('F2-START');
        window._rb2p_userIsWaitingForOpponent = true;
        const now = Date.now();
        window._rb2p_lastSnapMs = now - 10000;
        window._twoPlayer.pending.push({ type: 'OTHER', ts: now - 60000, _rxMs: now - 40000, yardLine: 12, scoreUser: 0, scoreOpp: 0, quarter: 1, minutesLeft: 1, secondsLeft: 0 });
        const t0 = Date.now(); while (Date.now() - t0 < 4000 && window._twoPlayer.pending.length) await new Promise(r => setTimeout(r, 100));
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('F2-START'));
        return { left: window._twoPlayer.pending.length, purged: /OUTCOME purged \(OTHER, \d+s old\) — I have played past it/.test(tail), live: window._rb2p_userIsWaitingForOpponent !== true };
    });
    check('F2 a queued hand-off I played past is purged (not applied)', f2.left === 0 && f2.purged && !f2.live, JSON.stringify(f2));

    // ---- F3 ----
    const f3 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('F3-START');
        const em = RB.engineState(); const sQ = em.engineQuarter, sStable = window._rb2p_lastStableQuarter, sWire = window._rb2p_wireQuarter;
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o.type); return real.call(window._twoPlayer, o); };
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        window._rb2p_lastStableQuarter = 3; window._rb2p_wireQuarter = 3; em.engineQuarter = 3;
        window._rb2p_postConvHandoffFor = 0;
        window._rb2p_lastConvModalMs = Date.now() - 12000; window._rb2p_quarterChangedToMs = Date.now() - 1000;
        window._rb2p_lastSnapDown = 6; window._rb2p_lastSnapMs = Date.now() - 8000;
        window._rb2p_userIsWaitingForOpponent = false; window._rb2p_userOutcomeSendInProgress = false;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineYardLineSigned = 48; em.engineDownNumber = 1;
        await new Promise(r => setTimeout(r, 2500));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d;   // the diag ring is short: search all of it
        window._rb2p_lastConvModalMs = 0; em.engineQuarter = sQ; window._rb2p_lastStableQuarter = sStable; window._rb2p_wireQuarter = sWire; em.engineYardLineSigned = -25;
        return { sent, decided: /crossed into Q3 — the halftime rule decides possession/.test(tail) || /CLOCKGATE licence \(Q3 law\)/.test(tail) };   // either path: the halftime rule owns it
    });
    check('F3 a try crossing the halftime horn is not handed off (the halftime rule decides)', f3.decided && !f3.sent.includes('TD'), JSON.stringify(f3));

    // ---- F4 ----
    const f4 = await off.page.evaluate(() => {
        window._rb2p_diagLog('F4-START');
        const em = RB.engineState(); const out = {};
        const realUp = window._rb2p_patModalUp;
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_p6ScorerOwes = false; window._rb2p_patPlayPending = false;
        window._rb2p_patDutyMine = { ts: Date.now() }; em.engineDownNumber = 6;
        // (a) the choice is on screen 38s after the offer: wait
        window._rb2p_lastConvModalMs = Date.now() - 38000; window._rb2p_patOwedSinceMs = Date.now() - 40000; window._rb2p_convTrySnappedMs = 0;
        window._rb2p_patModalUp = () => true;
        out.a = window._rb2p_patOwed();
        out.aWaits = /PAT-INV wall waits — the conversion choice is on screen/.test(String(window._rb2p_readDiagLog()));
        // (b) the try was snapped 2.5s ago: defer
        window._rb2p_patModalUp = () => false;
        window._rb2p_patOwedSinceMs = Date.now() - 40000; window._rb2p_convTrySnappedMs = Date.now() - 2500;
        out.b = window._rb2p_patOwed();
        out.bDefers = /PAT-INV wall deferred — the try is in flight/.test(String(window._rb2p_readDiagLog()));
        out.pendingKept = !!window._rb2p_patDutyMine;
        window._rb2p_patModalUp = realUp; window._rb2p_patDutyMine = null; em.engineDownNumber = 1; window._rb2p_patOwedSinceMs = 0; window._rb2p_lastConvModalMs = 0; window._rb2p_convTrySnappedMs = 0;
        try { window._rb2p_setPatDuty(null); } catch (e) {}
        return out;
    });
    check('F4 the 35s wall waits for the choice on screen and never fires into a snapped try', !!f4.a && f4.aWaits && !!f4.b && f4.bDefers && f4.pendingKept, JSON.stringify(f4));

    // ---- F5 + F6 ----
    const f56 = await def.page.evaluate((role) => {
        const other = role === 'a' ? 'b' : 'a', now = Date.now(), room = sessionStorage.getItem('rb_room');
        const calls = []; const realF = window._rb2p_forceUserOffenseDrive, realT = window._rb2p_declareTurnOwner;
        window._rb2p_forceUserOffenseDrive = (y, f, dd) => { calls.push(y); return true; };
        window._rb2p_declareTurnOwner = () => {};
        window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = 0; window._rb2p_lastOpponentOutcomeApplyMs = 0; window._rb2p_p6ScorerOwes = false;
        window._rb2p_lastGood = { room, owner: role, at: now - 30000, yard: -10, down: 2, toGo: 7 };
        window._rb2p_oppLiveRx = { at: now, iHaveBall: false, yardLine: 5 };
        window._rb2p_turnRec = { owner: role, at: now - 60000, why: 'send-OTHER' };
        const burst = [window._rb2p_fieldCheck(), window._rb2p_fieldCheck(), window._rb2p_fieldCheck()];
        const afterBurst = calls.length;
        window._rb2p_fieldAge(10000);
        const later = window._rb2p_fieldCheck();
        // F6: the turn moved 3s ago -> wait for the hand-off
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_turnRec = { owner: role, at: Date.now() - 3000, why: 'send-OTHER' };
        const inflight = window._rb2p_fieldCheck();
        window._rb2p_forceUserOffenseDrive = realF; window._rb2p_declareTurnOwner = realT; window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastGood = null;
        return { burst, afterBurst, later, calls: calls.length, inflight };
    }, def.role);
    check('F5 three checks in a burst do nothing; 10 real seconds later the rightful owner is restored', f56.afterBurst === 0 && /restored/.test(f56.later) && f56.calls === 1, JSON.stringify(f56));
    check('F6 while the turn has just moved, the field check waits for the hand-off', /a hand-off is on its way/.test(f56.inflight), JSON.stringify(f56));

    // ---- F7: overtime touchdown ----
    const f7 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('F7-START');
        const em = RB.engineState(); const sU = em.userScore;
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o.type); return real.call(window._twoPlayer, o); };
        window._rb2p_userIsWaitingForOpponent = false; window._rb2p_userOutcomeSendInProgress = false; window._rb2p_lastSentOutcomeMs = 0; window._rb2p_kickoffGraceUntil = 0;
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_p6ScorerOwes = false;
        const sO = em.opponentScore, sQ = em.engineQuarter, sStable = window._rb2p_lastStableQuarter, sWire = window._rb2p_wireQuarter;
        em.setUserScore(20); em.setOpponentScore(13);                    // untied: the OT coordinator requests no coin flip
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
        window._rb2p_inOvertime = true; window._rb2p_gameOverReported = false;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 1;
        await new Promise(r => setTimeout(r, 700));                     // the checker learns the score
        em.setUserScore((Number(em.userScore) || 0) + 6);                // the touchdown
        let offered = false; const t0 = Date.now();
        while (Date.now() - t0 < 4000 && !offered) { await new Promise(r => setTimeout(r, 150)); offered = window._rb2p_patModalUp() === true; }
        const down6 = Number(em.engineDownNumber) === 6;
        // the try: +2 credited, the modal gone
        try { const pl = window._rb2p_enumeratePopupInstances() || []; for (const p of pl) if (p && (p._0G === 100367 || p._0G === 100369)) { try { _cr(p); } catch (e) { p._HL2 = true; } } } catch (e) {}
        em.setUserScore((Number(em.userScore) || 0) + 2); em.engineDownNumber = 1;
        const t1 = Date.now(); while (Date.now() - t1 < 6000 && !sent.length) await new Promise(r => setTimeout(r, 150));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d;
        window._rb2p_gameOverReported = true;   // keep the final detector out while we rewind
        window._rb2p_inOvertime = false; em.setUserScore(sU); em.setOpponentScore(sO); em.engineQuarter = sQ; window._rb2p_lastStableQuarter = sStable; window._rb2p_wireQuarter = sWire;
        window._rb2p_patDutyMine = null; try { window._rb2p_setPatDuty(null); } catch (e) {}
        return { offered, down6, sent, detected: /OT-TD touchdown in overtime/.test(tail), offerLog: /offering 1 PT \/ 2 PT/.test(tail), handoff: /OT-TD drive over \(the try is over\)/.test(tail) };
    });
    check('F7 an overtime touchdown gets its conversion, then the drive is handed over as a TD kickoff', f7.detected && f7.offered && f7.down6 && f7.offerLog && f7.handoff && f7.sent.includes('TD'), JSON.stringify(f7));

    // ---- F8: checker ----
    const T0 = 1700000000000; const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
    const held = [mk('a', 0, 'bind', { ver: 'V415' }), mk('b', 0, 'bind', { ver: 'V415' }), mk('a', 500, 'wait', { on: true, why: 'L1' }), mk('b', 500, 'wait', { on: true, why: 'L1' }),
                  mk('a', 900, 'guard', { what: 'held', type: 'TD' })];
    for (let i = 0; i <= 20; i++) held.push(mk('b', 1000 + i * 1000, 'stage', { of: 0, df: 0, ball: 0, wait: true, ovl: true, fps: 60 }), mk('a', 1000 + i * 1000, 'hb', {}));
    const rh = R.audit(held.sort((x, y) => x.t - y.t), {});
    const left = [mk('a', 0, 'bind', { ver: 'V415' }), mk('b', 0, 'bind', { ver: 'V415' }), mk('b', 1000, 'p6', { step: 'detected' }), mk('b', 1100, 'p6', { step: 'sent' }),
                  mk('a', 1200, 'p6', { step: 'applied' }), mk('a', 1200, 'conv', { ev: 'modal', lic: 'L2 pick-6' }), mk('a', 9000, 'vis', { h: true, why: 'pagehide' })];
    const rl = R.audit(left, {});
    check('F8 checker: a held hand-off reads as a hidden screen (no DEADLOCK); closing the game mid pick-six is LEFT (not a freeze)',
          !rh.flags.some(f => /DEADLOCK/.test(f.msg)) && rl.flags.some(f => /^LEFT: a closed the game/.test(f.msg) && f.impact === 0) && !rl.flags.some(f => /chain broke/.test(f.msg)),
          JSON.stringify({ held: rh.flags.map(f => f.msg), left: rl.flags.map(f => f.msg + ' i' + f.impact) }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
