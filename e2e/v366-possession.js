// e2e/v366-possession.js — THE POSSESSION LEDGER.
//
// Live report: a pick-6, the PAT played, and possession never changed — both
// phones in WAIT, the scorer's phone with a formation under a flickering
// overlay, then a drive with no arrows. Every one of those is two devices
// disagreeing about who is live. V366 gives possession the yard-line
// treatment: one choke point (the flag is an accessor), a conserved quantity
// (the turn ledger), a step ledger for the pick-6 with a watchdog that
// completes any step past its budget, and the five defects the audit found.
//
// T1  the accessor refuses LIVE on the thrower while its cascade is active
// T2  the accessor refuses LIVE when the ledger names a live opponent — and
//     allows it right after an outcome addressed to me
// T3  the conversion gate refuses the THROWER's modal (R4): possession, down
//     and yard untouched on the thrower
// T4  the send-poll park leaves the thrower parked: opp possession, down 1, own 25
// T5  the overlay lift ignores a formation the ledger says is not mine
// T6  the watchdog forces the thrower's drive when PAT_RESULT is applied but
//     no real drive is running (the wedge)
// T7  the scorer's leftover post-PAT scene stays under a SOLID overlay
// T8  the pick-6 ledger is written to Firebase, step by step
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const reset = page => page.evaluate(() => {
    window._rb2p_pickSixPatCascadeActive = false; window._rb2p_pickSixThisDeviceIsThrower = false;
    window._rb2p_patPlayPending = false; window._rb2p_patPlayResolved = false;
    window._rb2p_pick6SentThisPossession = false; window._rb2p_gameOverReported = false;
    window._rb2p_p6AwaitDriveMs = 0; window._rb2p_p6ScorerSentMs = 0; window._rb2p_p6ResultAppliedMs = 0;
    window._rb2p_convAuthMs = 0; window._rb2p_lastTd6Ms = 0;
    try { (window._rb2p_enumeratePopupInstances() || []).forEach(p => { try { if (!p._HL2) _cr(p); } catch (e) {} }); } catch (e) {}
});
const census = page => page.evaluate(() => {
    var of = 0, ball = 0, all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (var i = 0; i < all.length; i++) { var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
        if (x._eE2._fE2 === 'obj_playerOF') of++; else if (x._eE2._fE2 === 'obj_ball') ball++; }
    var em = RB.engineState();
    return { of: of, ball: ball, poss: em.enginePossessingTeamIdx, user: em.engineUserTeamIdx,
             down: Number(em.engineDownNumber), yard: Math.round(Number(em.engineYardLineSigned)),
             waiting: window._rb2p_userIsWaitingForOpponent === true };
});

(async () => {
    console.log('=== V366 THE POSSESSION LEDGER ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;
    console.log('  offense = ' + off.role + ', waiting = ' + def.role);

    // ---- T1: the thrower cannot go live mid-cascade ----
    await reset(def.page);
    const t1 = await def.page.evaluate(() => {
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_pickSixThisDeviceIsThrower = true; window._rb2p_pickSixPatCascadeActive = true;
        window._rb2p_userIsWaitingForOpponent = false;             // some stray writer
        var refused = window._rb2p_userIsWaitingForOpponent === true;
        window._rb2p_pickSixPatCascadeActive = false;              // the PAT_RESULT applier clears this first...
        window._rb2p_userIsWaitingForOpponent = false;             // ...then goes live
        var allowed = window._rb2p_userIsWaitingForOpponent === false;
        window._rb2p_pickSixThisDeviceIsThrower = false;
        return { refused: refused, allowed: allowed, diag: String(window._rb2p_readDiagLog()).slice(-160) };
    });
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 the thrower cannot go LIVE while its cascade is active, and can once it clears',
          t1.refused === true && t1.allowed === true && /POSS-REFUSED LIVE/.test(t1.diag), JSON.stringify(t1));

    // ---- T2: the ledger names a live opponent ----
    await reset(def.page);
    const t2 = await def.page.evaluate(async () => {
        window._rb2p_userIsWaitingForOpponent = true;
        var me = (window._rb2p_turnRec && window._rb2p_turnRec.owner) ? null : null;
        var other = null;
        // find my role from the bind (the accessor uses the same source)
        window._rb2p_turnRec = { owner: (location.hash || '') , at: Date.now() };
        // the test harness exposes roles on the page; derive the opponent from our own role
        var myRole = window.__rb2pRole || null;
        return { myRole: myRole };
    });
    const myRoleDef = def.role, oppRoleDef = def.role === 'a' ? 'b' : 'a';
    const t2b = await def.page.evaluate(async (opp) => {
        window._rb2p_matchStartMs = Date.now() - 60000;
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        window._rb2p_turnRec = { owner: opp, at: Date.now() };
        window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: true };
        window._rb2p_userIsWaitingForOpponent = false;
        var refused = window._rb2p_userIsWaitingForOpponent === true;
        // an outcome addressed to me just applied -> the ledger echo may lag: allowed
        window._rb2p_lastOpponentOutcomeApplyMs = Date.now();
        window._rb2p_userIsWaitingForOpponent = false;
        var allowed = window._rb2p_userIsWaitingForOpponent === false;
        window._rb2p_userIsWaitingForOpponent = true;
        return { refused: refused, allowed: allowed };
    }, oppRoleDef);
    console.log('  T2: ' + JSON.stringify(t2b));
    check('T2 LIVE is refused under a live opponent claim, allowed right after an outcome applies',
          t2b.refused === true && t2b.allowed === true, JSON.stringify(t2b));

    // ---- T3: R4 on the thrower ----
    await reset(def.page);
    const t3 = await def.page.evaluate(() => {
        var em = RB.engineState();
        window._rb2p_pickSixThisDeviceIsThrower = true; window._rb2p_pickSixPatCascadeActive = true;
        em.enginePossessingTeamIdx = em.engineOpponentTeamIdx; em.engineDownNumber = 1; em.rawEngineMatch._6F = -20;
        em.engineDriveFsmStage = 9;
        var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
        _wm(em.rawEngineMatch, _Sc2, '', msg, _Xi(em.rawEngineMatch, _Sc2, 'match_1pt'), _Xi(em.rawEngineMatch, _Sc2, 'match_2pt'), 100367, 100369, 16777215, 0.7);
        var r = { modal: window._rb2p_patModalUp(), refusal: window._rb2p_convGateLastRefusal,
                  poss: em.enginePossessingTeamIdx, user: em.engineUserTeamIdx, down: Number(em.engineDownNumber), yard: Math.round(Number(em.engineYardLineSigned)) };
        window._rb2p_pickSixThisDeviceIsThrower = false; window._rb2p_pickSixPatCascadeActive = false;
        return r;
    });
    console.log('  T3: ' + JSON.stringify(t3));
    check('T3 the thrower\'s conversion modal is refused (R4) and its engine is untouched',
          t3.modal === false && /^R4/.test(t3.refusal) && t3.poss !== t3.user && t3.down === 1 && t3.yard === -20, JSON.stringify(t3));

    // ---- T4: the park empties the field ----
    await reset(off.page);
    const t4 = await off.page.evaluate(async () => {
        var em = RB.engineState();
        var opp0 = Number(em.opponentScore) || 0;
        window._rb2p_opponentScoreAtDriveStart = opp0;
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();
        var realSend = window._twoPlayer.send, sent = [];
        window._twoPlayer.send = o => { sent.push(o.type); };
        window._rb2p_enterPickSixCascade('probe');
        await new Promise(r => setTimeout(r, 120));
        em.setOpponentScore(opp0 + 6);                     // the +6 lands
        await new Promise(r => setTimeout(r, 500));        // the send-poll fires and parks
        var of = 0, ball = 0, all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        for (var i = 0; i < all.length; i++) { var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
            if (x._eE2._fE2 === 'obj_playerOF') of++; else if (x._eE2._fE2 === 'obj_ball') ball++; }
        window._twoPlayer.send = realSend;
        return { sent: sent, of: of, ball: ball, poss: em.enginePossessingTeamIdx, user: em.engineUserTeamIdx,
                 down: Number(em.engineDownNumber), yard: Math.round(Number(em.engineYardLineSigned)) };
    });
    console.log('  T4: ' + JSON.stringify(t4));
    check('T4 after the PICK6 ships the thrower is parked: opp possession, down 1, own 25',
          t4.sent.includes('PICK6') && t4.poss !== t4.user && t4.down === 1 && t4.yard === -25, JSON.stringify(t4));

    // ---- T5: the overlay lift needs the ledger ----
    await reset(off.page);
    const t5 = await off.page.evaluate(async (opp) => {
        // stage a formation, park, and say the turn is the opponent's
        if (typeof window._rb2p_forceUserOffenseDrive === 'function') window._rb2p_forceUserOffenseDrive(-25);
        await new Promise(r => setTimeout(r, 800));
        window._rb2p_turnRec = { owner: opp, at: Date.now() };
        window._rb2p_userIsWaitingForOpponent = true;
        var w = document.getElementById('rb-waiting'); if (w) w.style.display = 'flex';
        var toggles = 0, last = w ? w.style.display : null;
        var t0 = Date.now();
        while (Date.now() - t0 < 4000) {
            await new Promise(r => setTimeout(r, 100));
            var d = w ? w.style.display : null;
            if (d !== last) { toggles++; last = d; }
        }
        var of = 0, all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF') of++; }
        return { of: of, toggles: toggles, shown: w ? w.style.display : null };
    }, off.role === 'a' ? 'b' : 'a');
    console.log('  T5: ' + JSON.stringify(t5));
    check('T5 a staged formation the ledger says is not mine never lifts the overlay (no flicker)',
          t5.of >= 6 && t5.toggles === 0 && t5.shown === 'flex', JSON.stringify(t5));

    // ---- T6: the wedge — PAT_RESULT applied, no real drive ----
    await off.page.evaluate(() => { window._rb2p_turnRec = { owner: null, at: 0 }; });
    await reset(off.page);
    const t6 = await off.page.evaluate(async () => {
        var em = RB.engineState();
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 6;   // the wedge shape
        em.engineControllerState = 1;                                               // and no live play
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_p6AwaitDriveMs = Date.now() - 5000;                            // "applied 5s ago"
        await new Promise(r => setTimeout(r, 2600));                                // one watchdog tick
        var running = window._rb2p_realDriveRunning();
        return { running: running, waiting: window._rb2p_userIsWaitingForOpponent === true,
                 diag: String(window._rb2p_readDiagLog()).slice(-200) };
    });
    console.log('  T6: ' + JSON.stringify(t6));
    check('T6 the watchdog forces a real drive when PAT_RESULT applied but nothing was running',
          t6.running === true && t6.waiting === false && /P6-WATCH no drive/.test(t6.diag), JSON.stringify(t6));

    // ---- T7: the scorer's leftover post-PAT scene stays UNDER a solid overlay ----
    // (The reported "hidden formation": the scene itself is harmless while the
    // cover is solid — the defect was the cover lifting for it. The ledger
    // names the thrower after PAT_RESULT, so the lift never fires here.)
    await reset(def.page);
    const t7 = await def.page.evaluate(async (opp) => {
        window._rb2p_turnRec = { owner: null, at: 0 };
        if (typeof window._rb2p_forceUserOffenseDrive === 'function') window._rb2p_forceUserOffenseDrive(-25);
        await new Promise(r => setTimeout(r, 800));
        window._rb2p_turnRec = { owner: opp, at: Date.now() };                     // PAT_RESULT declared the thrower
        window._rb2p_userIsWaitingForOpponent = true;
        var w = document.getElementById('rb-waiting'); if (w) w.style.display = 'flex';
        var toggles = 0, last = w ? w.style.display : null, t0 = Date.now();
        while (Date.now() - t0 < 4000) { await new Promise(r => setTimeout(r, 100)); var d = w ? w.style.display : null; if (d !== last) { toggles++; last = d; } }
        var of = 0, all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF') of++; }
        return { of: of, toggles: toggles, shown: w ? w.style.display : null };
    }, def.role === 'a' ? 'b' : 'a');
    console.log('  T7: ' + JSON.stringify(t7));
    check('T7 the scorer\'s leftover scene stays under a solid overlay (no lift, no flicker)',
          t7.of >= 6 && t7.toggles === 0 && t7.shown === 'flex', JSON.stringify(t7));

    // ---- T8: the ledger on Firebase ----
    const t8id = await off.page.evaluate(() => {
        window._rb2p_p6Id = 'T8' + Date.now();
        window._rb2p_p6Step('detected', { src: 'test' }); window._rb2p_p6Step('sent', { plus6: true });
        return window._rb2p_p6Id;
    });
    await def.page.evaluate((id) => { window._rb2p_p6Id = id; window._rb2p_p6Step('applied', { su: 6, so: 0 }); }, t8id);
    await sleep(1500);
    const ledger = await TP.fbGet('rooms/' + g.code + '/p6/' + t8id);
    console.log('  T8: ' + JSON.stringify(ledger));
    check('T8 the pick-6 ledger records each step with its role',
          ledger && ledger.detected && ledger.detected.role === off.role && ledger.sent && ledger.applied && ledger.applied.role === def.role,
          JSON.stringify(ledger));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
