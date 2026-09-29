// e2e/v419-accuracy.js — the never-freeze baseline's first fixes (FREEZE-LEDGER.md).
//
//   T0  harness codes carry a digit (a real code never does) and a real room is never a harness room
//   T1  F6: the third quarter keep's fresh spawn keeps the down and distance (was a free 1st & 10)
//   T2  F8: a silent partner in the Q4 endgame is waited for — no one-sided FINAL
//   T3  the FINAL waits for a conversion still being played (forced path), and not past its bound
//   T4  F9: a rescue applies a held hand-off instead of guessing a drive, and never runs on a hidden page
//   T5  F16: the resume re-pop loop stops once the try has started (shipped check)
//   T6  F3: the cover keeps saying SCREEN IS OFF after the partner's screen went off, and says
//       STOPPED RESPONDING after 12s of silence from a visible partner
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V419 ACCURACY ===');

    // ---- T0 ----
    const codes = Array.from({ length: 200 }, () => TP.randomCode());
    const realHarness = await TP.isHarnessRoom('KELX');          // a real room (read-only check)
    check('T0 200 harness codes all carry a digit; a real room (KELX) is not a harness room',
          codes.every(c => /\d/.test(c) && c.length === 4) && realHarness === false, JSON.stringify({ bad: codes.filter(c => !/\d/.test(c)), realHarness }));

    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1: keep #3 keeps 3rd & 0.93 ----
    const t1 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        const q = Number(em.engineQuarter) || 1;
        window._rb2p_keepQ = q; window._rb2p_keepEpoch = Number(window._rb2p_quarterChangedToMs) || 0; window._rb2p_keepN = 0;
        const guards = []; const realA = window._rb2p_audit;
        window._rb2p_audit = function (k, f) { if (k === 'guard' && f && f.what === 'keep-fresh') guards.push(f); return realA.apply(this, arguments); };
        const r1 = window._rb2p_keepGate(q, -13, 3, 0.93);
        const r2 = window._rb2p_keepGate(q, -13, 3, 0.93);
        const r3 = window._rb2p_keepGate(q, -13, 3, 0.93);
        await new Promise(r => setTimeout(r, 400));
        window._rb2p_audit = realA;
        return { r1, r2, r3, down: Number(em.engineDownNumber), toGo: Number(em.engineYardsToGo), yard: Number(em.engineYardLineSigned), guards };
    });
    check('T1 the third keep spawns fresh at the kept 3rd & 0.93 (not 1st & 10) and audits it',
          t1.r3 === false && t1.down === 3 && Math.abs(t1.toGo - 0.93) < 0.01 && Math.round(t1.yard) === -13 &&
          t1.guards.length === 1 && t1.guards[0].d === 3 && t1.guards[0].tg === 0.93, JSON.stringify(t1));

    // ---- T2: DEAD-OPP no longer ends the game ----
    const t2 = await def.page.evaluate(async () => {
        window._rb2p_diagLog('T2-START');
        const em = RB.engineState();
        const save = { q: em.engineQuarter, mn: em.engineMinutesLeft, sc: em.engineSecondsLeft, su: em.userScore, so: em.opponentScore,
                       rx: window._rb2p_oppLiveRxAt, qc: window._rb2p_quarterChangedToMs };
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        if (window._rb2p_clockLicence) window._rb2p_clockLicence('test T2', 4000);
        em.engineQuarter = 4; em.engineMinutesLeft = 0; em.engineSecondsLeft = 40;
        em.setUserScore(28); em.setOpponentScore(21);
        window._rb2p_quarterChangedToMs = Date.now() - 200000;
        window._rb2p_deadOppLogMs = 0;
        const t0 = Date.now();
        while (Date.now() - t0 < 3500) { window._rb2p_oppLiveRxAt = Date.now() - 60000; await new Promise(r => setTimeout(r, 200)); }
        const over = window._rb2p_gameOverReported === true;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T2-START'));
        // put it back
        if (window._rb2p_clockLicence) window._rb2p_clockLicence('test T2 restore', 4000);
        em.engineQuarter = save.q; em.engineMinutesLeft = save.mn; em.engineSecondsLeft = save.sc;
        em.setUserScore(save.su || 0); em.setOpponentScore(save.so || 0);
        window._rb2p_oppLiveRxAt = Date.now(); window._rb2p_quarterChangedToMs = save.qc;
        window._rb2p_lastStableQuarter = Number(save.q) || 1; window._rb2p_wireQuarter = Number(save.q) || 1;
        return { over, waited: /DEAD-OPP WAIT/.test(tail), oldEnd: /DEAD-OPP END/.test(tail), waiting: window._rb2p_userIsWaitingForOpponent === true };
    });
    check('T2 a partner silent 60s with 0:40 left in a decided Q4 is waited for: no FINAL, a DEAD-OPP WAIT line',
          t2.waiting && !t2.over && t2.waited && !t2.oldEnd, JSON.stringify(t2));
    const t2s = await def.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return { noDeadEnd: /var endSignal = \(pastRegulation \|\| regulationOver\) &&/.test(src) && !/pastRegulation \|\| regulationOver \|\| deadOppEnd/.test(src) };
    });
    check('T2b the end signal no longer includes the dead-opponent shortcut (shipped)', t2s.noDeadEnd, JSON.stringify(t2s));

    // ---- T3: the final waits for a conversion being played ----
    const t3 = await off.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return {
            forced: /if \(q >= 5 && u !== o && !window\._rb2p_inOvertime && !document\.hidden && !convLiveF &&/.test(src),
            bound: /Date\.now\(\) - \(Number\(window\._rb2p_lastConvModalMs\) \|\| 0\) < 120000/.test(src),
            hold: /\+\+gameOverPlayWaitTicks < \(v346PatHold \? 400 : 40\)/.test(src)
        };
    });
    check('T3 the forced FINAL waits for a live conversion (bounded 120s from the offer) and the normal hold matches (shipped)',
          t3.forced && t3.bound && t3.hold, JSON.stringify(t3));

    // ---- T4: rescue applies a held hand-off; hidden pages never rescue ----
    // Park BOTH phones and declare the turn on the server (a rescue must see a real standoff).
    await off.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });
    await sleep(1500);
    const t4 = await def.page.evaluate(async () => {
        window._rb2p_diagLog('T4-START');
        if (typeof window._rb2p_declareTurnOwner === 'function') window._rb2p_declareTurnOwner('ME', 'test T4');
        const calls = []; const realDrain = window._rb2p_drainDeferredOutcome;
        const realForce = window._rb2p_forceUserOffenseDrive; let forced = 0;
        window._rb2p_forceUserOffenseDrive = function () { forced++; return false; };
        window._rb2p_drainDeferredOutcome = function (why) { calls.push(why); if (why === 'rescue') window._rb2p_deferredOutcome = null; return ''; };
        window._rb2p_lastSentOutcome = null; window._rb2p_lastSentOutcomeMs = 0;
        // hidden first: no rescue, no drain by the rescue
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        window._rb2p_deferredOutcome = { type: 'OTHER', ts: Date.now(), yardLine: 12, quarter: 1, minutesLeft: 1, secondsLeft: 0, scoreUser: 0, scoreOpp: 0 };
        await new Promise(r => setTimeout(r, 2500));
        const hiddenRescueCalls = calls.filter(c => c === 'rescue').length;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        const t0 = Date.now();
        while (Date.now() - t0 < 11000 && !calls.includes('rescue') && forced === 0) await new Promise(r => setTimeout(r, 100));   // the old rescue needs 8s to fire
        window._rb2p_drainDeferredOutcome = realDrain; window._rb2p_forceUserOffenseDrive = realForce;
        window._rb2p_deferredOutcome = null; window._rb2p_deferredOutcomeSinceMs = 0;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T4-START'));
        return { hiddenRescueCalls, visibleRescue: calls.includes('rescue'), forced, logged: /TURN-RESCUE -> applying the held OTHER/.test(tail), guessed: /TURN-RESCUE -> offense/.test(tail) };
    });
    await off.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = false; });   // the phone with the ball plays on
    await sleep(1500);
    check('T4 a hidden page never rescues; a visible one applies the held hand-off and stages no guessed drive',
          t4.hiddenRescueCalls === 0 && t4.visibleRescue && t4.logged && t4.forced === 0 && !t4.guessed, JSON.stringify(t4));

    // ---- T5: re-pop loop stop (shipped) ----
    const t5 = await def.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return { stop: /Number\(window\._rb2p_convTrySnappedMs\) > loopStartMs \|\|\s*Number\(window\._rb2p_patPlaySnappedMs\) > loopStartMs/.test(src),
                 recount: /prevLive = nowLive;/.test(src) };
    });
    check('T5 the resume re-pop loop stops once the try starts and counts the modal it created (shipped)', t5.stop && t5.recount, JSON.stringify(t5));

    // ---- T6: the cover tells the truth ----
    const t6 = await def.page.evaluate(() => {
        const out = {};
        const save = window._rb2p_oppHb, saveRx = window._rb2p_oppLiveRxAt;
        window._rb2p_oppHb = { vis: 'H', at: Date.now() - 45000, ts: Date.now() - 45000, fps: 0 }; window._rb2p_oppLiveRxAt = Date.now() - 45000;
        window._rb2p_refreshWaitStatus(); out.staleHidden = document.getElementById('rb-wait-status').textContent;
        window._rb2p_oppHb = { vis: 'V', at: Date.now() - 14000, ts: Date.now() - 14000, fps: 30 }; window._rb2p_oppLiveRxAt = Date.now() - 14000;
        window._rb2p_refreshWaitStatus(); out.silent14 = document.getElementById('rb-wait-status').textContent;
        window._rb2p_oppHb = { vis: 'V', at: Date.now() - 4000, ts: Date.now() - 4000, fps: 30 }; window._rb2p_oppLiveRxAt = Date.now() - 1000;
        window._rb2p_refreshWaitStatus(); out.fresh = document.getElementById('rb-wait-status').textContent;
        window._rb2p_oppHb = save; window._rb2p_oppLiveRxAt = saveRx; window._rb2p_refreshWaitStatus();
        return out;
    });
    check('T6 cover: 45s after "screen off" it still says SCREEN IS OFF; 14s silent says STOPPED RESPONDING; a live partner says WAITING',
          /SCREEN IS OFF/.test(t6.staleHidden) && /STOPPED RESPONDING/.test(t6.silent14) && /WAITING FOR OPPONENT/.test(t6.fresh), JSON.stringify(t6));

    // ---- T7: F19 — no kickoff after a decided horn ----
    const t7 = await off.page.evaluate(async () => {
        // the refusal is audited (guard ky-refused); the tap-bridge block logs to its own ring (rb2p_diag233)
        const guards = []; const realA = window._rb2p_audit;
        window._rb2p_audit = function (k, f) { if (k === 'guard' && f && f.what === 'ky-refused') guards.push(f); return realA.apply(this, arguments); };
        try { sessionStorage.setItem('rb2p_diag233', '[]'); } catch (e) {}
        const em = RB.engineState();
        const save = { q: em.engineQuarter, su: em.userScore, so: em.opponentScore, st: window._rb2p_lastStableQuarter, w: window._rb2p_wireQuarter, ot: window._rb2p_inOvertime };
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; window._rb2p_inOvertime = false; window._rb2p_kyRefusedLogMs = 0;
        em.engineQuarter = 5; em.setUserScore(30); em.setOpponentScore(24);
        let threw = null; const wrapped = !!(_Ky && _Ky.__rb2pWrapped);
        try { _Ky(em.rawEngineMatch, _Sc2); } catch (e) { threw = String(e && e.message); }
        await new Promise(r => setTimeout(r, 300));
        const inMatch = RB.isEngineInMatchRoom();
        const ring = (() => { try { return JSON.parse(sessionStorage.getItem('rb2p_diag233') || '[]'); } catch (e) { return []; } })();
        window._rb2p_audit = realA;
        em.engineQuarter = save.q; em.setUserScore(save.su || 0); em.setOpponentScore(save.so || 0);
        window._rb2p_lastStableQuarter = save.st; window._rb2p_wireQuarter = save.w; window._rb2p_inOvertime = save.ot;
        return { wrapped, refused: guards.length === 1 && guards[0].su === 30 && guards[0].so === 24, fired: ring.some(l => /KY fired/.test(l)), ringRefused: ring.some(l => /KY refused/.test(l)), inMatch, threw };
    });
    check('T7 F19: after a decided horn the kickoff button is refused (no KY fired) and the engine stays in the match',
          t7.wrapped && t7.refused && t7.ringRefused && !t7.fired && t7.inMatch && !t7.threw, JSON.stringify(t7));
    const t7s = await off.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return /qK >= 5 && uK !== oK && window\._rb2p_inOvertime !== true/.test(src);
    });
    check('T7b the refusal leaves overtime (a tied score) alone (shipped condition)', t7s, '');

    // ---- T8: the send guard (VJGW's flag): never expired while waiting; expired when it blocks the phone with the ball ----
    const t8w = await def.page.evaluate(async () => {            // the waiting phone: legitimately set through the opponent's drive
        window._rb2p_userOutcomeSendInProgress = true;
        await new Promise(r => setTimeout(r, 25000));
        const still = window._rb2p_userOutcomeSendInProgress === true;
        window._rb2p_userOutcomeSendInProgress = false;
        return { still };
    });
    check('T8a the send guard is NOT expired on the waiting phone (it guards the opponent\'s whole drive)', t8w.still === true, JSON.stringify(t8w));
    const t8 = await off.page.evaluate(async () => {
        const guards = []; const realA = window._rb2p_audit;
        window._rb2p_audit = function (k, f) { if (k === 'guard' && f && f.what === 'latch-expired') guards.push(f); return realA.apply(this, arguments); };
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_userOutcomeSendInProgress = true; const t0 = Date.now();
        while (Date.now() - t0 < 30000 && window._rb2p_userOutcomeSendInProgress === true) await new Promise(r => setTimeout(r, 500));
        window._rb2p_audit = realA;
        return { cleared: window._rb2p_userOutcomeSendInProgress === false, afterMs: Date.now() - t0, guards };
    });
    check('T8b set while this phone has the ball (VJGW), it expires at ~20s, on record',
          t8.cleared && t8.afterMs >= 19000 && t8.afterMs <= 24000 && t8.guards.length === 1 && t8.guards[0].name === 'userOutcomeSendInProgress', JSON.stringify(t8));

    // ---- T9: a stats screen that fails to draw is retried (last: it ends this page's game) ----
    const t9 = await off.page.evaluate(async () => {
        const guards = []; const realA = window._rb2p_audit;
        window._rb2p_audit = function (k, f) { if (k === 'guard' && f && f.what === 'final-render-retry') guards.push(f); return realA.apply(this, arguments); };
        window._rb2p_testRenderFaults = 2;                      // the first two draws throw
        window._rb2p_reportGameOver({ team: 'T', oppTeam: 'O', score: 21, oppScore: 14, players: [] });
        const t0 = Date.now(); let shown = false;
        while (Date.now() - t0 < 5000 && !shown) { await new Promise(r => setTimeout(r, 200)); const f = document.getElementById('rb-final'); shown = !!(f && getComputedStyle(f).display !== 'none'); }
        window._rb2p_audit = realA;
        const left = window._rb2p_testRenderFaults; window._rb2p_testRenderFaults = 0;
        return { retries: guards.length, shown, left };
    });
    check('T9 a stats screen whose render throws is retried and appears once it can', t9.retries >= 1 && t9.shown, JSON.stringify(t9));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
