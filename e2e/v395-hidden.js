// e2e/v395-hidden.js — hidden-phone awareness + the post-conversion empty field.
//
//   T1  the opponent's heartbeat drives _rb2p_oppHidden() (fresh 'H' = hidden; stale or 'V' = not)
//   T2  the wait cover's status line says the opponent's screen is off
//   T3  TURN-RESCUE stands down while the opponent is hidden (no rescue, one diag line)
//   T4  P6-WATCH refuses to force a drive over a LIVE opponent
//   T5  the 35s conversion wall does not count time while this page is hidden
//   T6  an empty field within 40s of a conversion offer is handed off as TD, not re-staged
//   T7  a held handoff is stamped on the record (held/heldTs) and audited
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V395 HIDDEN-PHONE ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1: the accessor ----
    const t1 = await def.page.evaluate(() => {
        const out = {};
        window._rb2p_oppHb = { vis: 'H', at: Date.now() }; out.freshH = window._rb2p_oppHidden();
        window._rb2p_oppHb = { vis: 'H', at: Date.now() - 20000 }; out.staleH = window._rb2p_oppHidden();
        window._rb2p_oppHb = { vis: 'V', at: Date.now() }; out.freshV = window._rb2p_oppHidden();
        window._rb2p_oppHb = null; out.none = window._rb2p_oppHidden();
        return out;
    });
    check('T1 fresh H = hidden; stale H, V, none = not hidden', t1.freshH === true && t1.staleH === false && t1.freshV === false && t1.none === false, JSON.stringify(t1));

    // ---- T1b: the real feed — the offense phone goes hidden, the defense phone sees it ----
    await off.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
    let seen = null;
    for (let i = 0; i < 16 && !seen; i++) { await sleep(1000); seen = await def.page.evaluate(() => (window._rb2p_oppHb && window._rb2p_oppHb.vis === 'H') ? window._rb2p_oppHb : null); }
    check('T1b the opponent\'s heartbeat with vis:H reaches this phone within 16s', !!seen, JSON.stringify(seen));

    // ---- T2: the cover's status line ----
    const t2 = await def.page.evaluate(() => { window._rb2p_refreshWaitStatus(); return document.getElementById('rb-wait-status').textContent; });
    check('T2 the wait cover says the opponent\'s screen is off', /SCREEN IS OFF/.test(t2), t2);
    await off.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
    let back = false;
    for (let i = 0; i < 16 && !back; i++) { await sleep(1000); back = await def.page.evaluate(() => !!(window._rb2p_oppHb && window._rb2p_oppHb.vis === 'V')); }
    const t2b = await def.page.evaluate(() => { window._rb2p_refreshWaitStatus(); return document.getElementById('rb-wait-status').textContent; });
    check('T2b ...and goes back to WAITING FOR OPPONENT when the screen returns', back && /WAITING FOR OPPONENT/.test(t2b), JSON.stringify({ back, t2b }));

    // ---- T3: TURN-RESCUE stands down (static: the shipped predicate + the stand-down line) ----
    const t3 = await def.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return { gated: /var bothParked = !handoffInFlight && !oppHiddenR && tR && tR\.owner === myRole/.test(src),
                 logged: /TURN-RESCUE stood down — the opponent\\'s screen is off/.test(src) };
    });
    check('T3 TURN-RESCUE is gated on the opponent being hidden (shipped predicate + stand-down line)', t3.gated && t3.logged, JSON.stringify(t3));

    // ---- T4: P6-WATCH refuses over a live opponent ----
    const t4 = await def.page.evaluate(async (role) => {
        window._rb2p_diagLog('T4-START');
        const other = role === 'a' ? 'b' : 'a';
        const sTr = window._rb2p_turnRec, sOl = window._rb2p_oppLiveRx, sP6 = window._rb2p_p6AwaitDriveMs;
        window._rb2p_turnRec = { owner: other, at: Date.now() };
        window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: true };
        let forced = 0; const realF = window._rb2p_forceUserOffenseDrive; window._rb2p_forceUserOffenseDrive = function () { forced++; return false; };
        window._rb2p_p6AwaitDriveMs = Date.now() - 5000;
        await new Promise(r => setTimeout(r, 2500));
        window._rb2p_forceUserOffenseDrive = realF; window._rb2p_p6AwaitDriveMs = sP6 || 0; window._rb2p_turnRec = sTr; window._rb2p_oppLiveRx = sOl;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T4-START'));
        return { forced, stood: /P6-WATCH stood down — the turn is the opponent's and they are live|P6-WATCH retired — the opponent has the ball/.test(tail)   /* V414: it now retires (no force, no re-arm) */, role, tail: tail.slice(-200) };
    }, def.role);
    check('T4 P6-WATCH stands down over a live opponent instead of forcing a second offense', t4.forced === 0 && t4.stood === true, JSON.stringify(t4));

    // ---- T5: the wall counts screen-on time only (static check of the shipped line) ----
    const t5 = await def.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return /if \(!window\._rb2p_patOwedSinceMs \|\| document\.hidden\) window\._rb2p_patOwedSinceMs = Date\.now\(\);/.test(src);
    });
    check('T5 the 35s wall restarts while the page is hidden (shipped)', t5 === true, '');

    // ---- T6: empty field after a conversion -> hand-off typed TD ----
    const t6 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T6-START');
        window.__t6 = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { window.__t6.push(o.type); real.call(window._twoPlayer, o); };
        window._rb2p_lastConvModalMs = Date.now();
        const s = RB.engineState(); s.enginePossessingTeamIdx = s.engineUserTeamIdx;
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false; window._rb2p_kickoffGraceUntil = 0;
        const act = window._rb2p_emptyFieldAct(s, -32);
        const t0 = Date.now(); while (Date.now() - t0 < 6000 && !window.__t6.length) await new Promise(r => setTimeout(r, 100));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T6-START'));
        return { act, sent: window.__t6, logged: /EMPTY-FIELD after a conversion — handed off \(TD kickoff\)/.test(tail), restaged: /EMPTY-FIELD re-staged/.test(tail) };
    });
    check('T6 an empty field 0s after a conversion offer is handed off as TD (kickoff), never re-staged', t6.act === 'handoff' && t6.sent.includes('TD') && !t6.sent.includes('OTHER') && t6.logged && !t6.restaged, JSON.stringify(t6));

    // ---- T7: a held handoff is stamped on the record ----
    const t7 = await def.page.evaluate(async () => {
        window._rb2p_diagLog('T7-START');
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        window.__t7 = []; const realA = window._rb2p_audit; window._rb2p_audit = function (k, f) { if (k === 'guard' && f && f.what === 'held') window.__t7.push(f); return realA.apply(this, arguments); };
        const blocked = window._rb2p_outcomeApplyBlocked();
        // feed a synthetic future outcome through the receive path's hold branch by calling the drain guard
        let held = null;
        try {
            const val = { type: 'OTHER', ts: Date.now() + 1, yardLine: -20, quarter: 1, minutesLeft: 1, secondsLeft: 0, scoreUser: 0, scoreOpp: 0 };
            if (typeof window._rb2p_testApplyIncoming === 'function') window._rb2p_testApplyIncoming(val, 'test');
            held = window._rb2p_deferredOutcome;
        } catch (e) {}
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        window._rb2p_deferredOutcome = null; window._rb2p_deferredOutcomeSinceMs = 0;
        window._rb2p_audit = realA;
        return { blocked, seam: typeof window._rb2p_testApplyIncoming === 'function', audited: window.__t7.length, held: !!held };
    });
    check('T7 a hidden page reports the hold (apply blocked names the hidden page)' + (t7.seam ? '' : ' [no receive seam: hold path checked statically]'),
          /hidden/.test(String(t7.blocked)) && (!t7.seam || (t7.audited === 1 && t7.held)), JSON.stringify(t7));
    if (!t7.seam) {
        const t7s = await def.page.evaluate(async () => {
            const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
            return /\{ held: myRole, heldTs: Date\.now\(\), heldWhy: String\(applyBlocked\)\.slice\(0, 40\) \}/.test(src) && /_rb2p_audit\('guard', \{ what: 'held'/.test(src);
        });
        check('T7b the hold stamps held/heldTs on the record and audits it (shipped)', t7s === true, '');
    }

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
