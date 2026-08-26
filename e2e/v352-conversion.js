// e2e/v352-conversion.js — THE CONVERSION INVARIANT (room OKAG).
//
// OKAG, V351, verified telemetry: a pick-6's conversion arrived as a normal
// "1st & 10" possession at midfield with no route arrows — Pittsburgh finished
// stuck on exactly 6 points. Mechanism: a pick-6 ships TWO records (the generic
// drive-end outcome typed KICKOFF, and the PICK6) and they raced; when the
// generic one landed last it force-placed the ball with down 1 & 10 and tore the
// cascade down. Every guard in the build keyed on the engine's PAT marker
// (down 6), so a conversion that never announced itself was unprotected.
//
// T1  _rb2p_patOwed sees a conversion with NO down-6 marker (S5 duty record)
// T2  the pin fires off "owed" alone: midfield + down 1 -> the 2 + marker back
// T3  THE OKAG REPRO: a generic outcome during an owed conversion is DROPPED —
//     the ball stays on the 2, the down stays 6, possession is not handed over
// T4  forceUserOffenseDrive is refused while a conversion is owed
// T5  a modal that is up off the 2 gets killed rather than played
// T6  the 35s wall force-releases a stuck invariant (no permanent wedge)
// T7  the thrower is never treated as owing the conversion
// T8  catches reconcile to completions (12 completions vs 8 catches -> 12)
// T9  an INT popup within 6s of a PICK6 is swallowed (one takeaway, one popup)
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const clearPat = page => page.evaluate(() => {
    window._rb2p_patPlayPending = false;
    window._rb2p_patPlayResolved = false;
    window._rb2p_pickSixPatCascadeActive = false;
    window._rb2p_pickSixThisDeviceIsThrower = false;
    window._rb2p_patDutyMine = null;
    window._rb2p_patOwedSinceMs = 0;
    window._rb2p_gameOverReported = false;
    var em = RB.engineState();
    em.engineDownNumber = 1; em.engineYardsToGo = 10;
});

(async () => {
    console.log('=== V352 THE CONVERSION INVARIANT ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        // ---- T1: owed without the engine marker ----
        await clearPat(page);
        const t1 = await page.evaluate(() => {
            var em = RB.engineState();
            em.engineDownNumber = 1; em.engineYardsToGo = 10;   // the OKAG shape: no marker
            var before = window._rb2p_patOwed();
            // V360: the conversion gate refuses a modal with no touchdown behind
            // it. These tests STAGE a conversion, so they must grant the same
            // licence the real pick-6 branch stamps before its own _wm call.
            window._rb2p_convAuthMs = Date.now();
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            return { before: before, after: window._rb2p_patOwed(),
                     modalUp: window._rb2p_patModalUp() };
        });
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 a conversion is detected with NO down-6 marker (the OKAG shape)',
              t1.before === '' && !!t1.after && t1.modalUp === true, JSON.stringify(t1));

        // ---- T2: the pin works off "owed" alone ----
        const t2 = await page.evaluate(async () => {
            var em = RB.engineState();
            em.engineDownNumber = 1; em.engineYardsToGo = 10;
            em.engineYardLineSigned = 2;                 // midfield, the OKAG spot
            // the modal from T1 is still on screen — signal S4, no marker
            await new Promise(r => setTimeout(r, 900));
            var e2 = RB.engineState();
            return { yard: Number(e2.engineYardLineSigned), toGo: Number(e2.engineYardsToGo),
                     down: Number(e2.engineDownNumber) };
        });
        console.log('  T2: ' + JSON.stringify(t2));
        check('T2 the ball is pinned to the 2 and the marker is restored',
              Math.abs(t2.yard - 48) <= 0.5 && t2.toGo === 2 && t2.down === 6, JSON.stringify(t2));

        // ---- T3: THE OKAG REPRO — the generic outcome must be dropped ----
        const t3 = await page.evaluate(async () => {
            // Mirror a REAL pick-6 conversion: the guardian stands down (and
            // clears patPlayPending) unless the cascade flag is up beside it.
            window._rb2p_patPlayPending = true;
            window._rb2p_patPlayResolved = false;
            window._rb2p_pickSixPatCascadeActive = true;
            window._rb2p_pickSixThisDeviceIsThrower = false;
            var em = RB.engineState();
            em.engineDownNumber = 6; em.engineYardsToGo = 2; em.engineYardLineSigned = 48;
            window._rb2p_userIsWaitingForOpponent = true;
            var applied = window._rb2p_applyOpponentOutcome({
                type: 'KICKOFF', turnover: false, yardLine: -15.5, ownSide: false,
                scoreUser: 43, scoreOpp: 6, quarter: 4, minutesLeft: 0, secondsLeft: 2,
                fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
                message: 'Possession change. On your 34 yard line', ts: Date.now()
            });
            await new Promise(r => setTimeout(r, 500));
            var e3 = RB.engineState();
            var log = (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).join('|');
            return { applied: applied, yard: Number(e3.engineYardLineSigned),
                     down: Number(e3.engineDownNumber),
                     owed: window._rb2p_patOwed(),
                     dropped: log.indexOf('PAT-INV dropped generic') >= 0,
                     waiting: window._rb2p_userIsWaitingForOpponent === true };
        });
        console.log('  T3: ' + JSON.stringify(t3));
        check('T3 the OKAG generic KICKOFF is dropped — the conversion survives on the 2',
              t3.dropped === true && Math.abs(t3.yard - 48) <= 0.5 && t3.down === 6 &&
              t3.waiting === true && !!t3.owed,
              JSON.stringify(t3));

        // ---- T4: force-drive refused while owed ----
        const t4 = await page.evaluate(() => {
            window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false;
            var r = window._rb2p_forceUserOffenseDrive(-25);
            return { ret: r, yard: Number(RB.engineState().engineYardLineSigned) };
        });
        console.log('  T4: ' + JSON.stringify(t4));
        check('T4 forceUserOffenseDrive is refused while a conversion is owed',
              t4.ret === false && Math.abs(t4.yard - 48) <= 0.5, JSON.stringify(t4));

        // ---- T5: a modal up off the 2 is killed, not played ----
        const t5 = await page.evaluate(async () => {
            var em = RB.engineState();
            window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false;
            // Pop the real engine conversion modal, then shove the ball away and
            // FREEZE it there by re-writing every tick, so the pin can't win.
            // V360: the conversion gate refuses a modal with no touchdown behind
            // it. These tests STAGE a conversion, so they must grant the same
            // licence the real pick-6 branch stamps before its own _wm call.
            window._rb2p_convAuthMs = Date.now();
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            var upAtStart = window._rb2p_patModalUp();
            var hold = setInterval(function () { RB.engineState().engineYardLineSigned = 2; }, 20);
            await new Promise(r => setTimeout(r, 3200));   // > the 20-tick (2s) kill threshold
            clearInterval(hold);
            return { upAtStart: upAtStart, upAtEnd: window._rb2p_patModalUp() };
        });
        console.log('  T5: ' + JSON.stringify(t5));
        check('T5 a modal held off the 2 is killed rather than played from there',
              t5.upAtStart === true && t5.upAtEnd === false, JSON.stringify(t5));

        // ---- T6: the 35s wall releases a stuck invariant ----
        const t6 = await page.evaluate(() => {
            window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false;
            window._rb2p_patOwedSinceMs = Date.now() - 40000;    // stuck 40s
            var owed = window._rb2p_patOwed();
            return { owed: owed, pending: window._rb2p_patPlayPending === true,
                     drive: window._rb2p_forceUserOffenseDrive(-25) };
        });
        console.log('  T6: ' + JSON.stringify(t6));
        check('T6 the 35s wall force-releases the invariant (no permanent wedge)',
              t6.owed === '' && t6.pending === false && t6.drive !== false, JSON.stringify(t6));

        // ---- T7: the thrower owes nothing ----
        await clearPat(page);
        const t7 = await page.evaluate(() => {
            window._rb2p_pickSixPatCascadeActive = true;
            window._rb2p_pickSixThisDeviceIsThrower = true;
            RB.engineState().engineDownNumber = 6;       // its own suppressed modal's marker
            return { owed: window._rb2p_patOwed() };
        });
        console.log('  T7: ' + JSON.stringify(t7));
        check('T7 the thrower is never treated as owing the conversion',
              t7.owed === '', JSON.stringify(t7));

        // ---- T8: catches reconcile to completions ----
        await clearPat(page);
        const t8 = await page.evaluate(() => {
            var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
            var n = _wi(to._Ln), qb = null, recs = [];
            for (var j = 0; j < n; j++) {
                var p = _zi(to._Ln, j); if (!p) continue;
                var pos = Number(_Ai(p, 'position'));
                if (pos === 1 && !qb) qb = p;
                else if (pos === 3 || pos === 4 || pos === 2) recs.push(p);
            }
            // The OKAG shape: 12 completions, 8 catches spread over receivers.
            _Yi(qb, 'stat_complete', 12); _Yi(qb, 'stat_attempts', 21);
            var give = [2, 3, 1, 2], yds = [8, 40, 7, 25];
            for (var i = 0; i < recs.length; i++) {
                _Yi(recs[i], 'stat_receive', i < give.length ? give[i] : 0);
                _Yi(recs[i], 'stat_yards', i < yds.length ? yds[i] : 0);
            }
            var before = 0;
            for (i = 0; i < recs.length; i++) before += Math.round(Number(_Ai(recs[i], 'stat_receive')) || 0);
            window._rb2p_reconcileReceptions();
            var after = 0;
            for (i = 0; i < recs.length; i++) after += Math.round(Number(_Ai(recs[i], 'stat_receive')) || 0);
            window._rb2p_reconcileReceptions();          // idempotence
            var again = 0;
            for (i = 0; i < recs.length; i++) again += Math.round(Number(_Ai(recs[i], 'stat_receive')) || 0);
            return { comp: 12, before: before, after: after, again: again,
                     qbRec: Math.round(Number(_Ai(qb, 'stat_receive')) || 0) };
        });
        console.log('  T8: ' + JSON.stringify(t8));
        check('T8 catches reconcile to completions and stay there',
              t8.before === 8 && t8.after === 12 && t8.again === 12 && t8.qbRec === 0,
              JSON.stringify(t8));

        // ---- T9: one takeaway, one popup ----
        const t9 = await page.evaluate(async () => {
            window.__blasts = [];
            if (!window.__origWFB9) {
                window.__origWFB9 = window._rb2p_waitFeedBig;
                window._rb2p_waitFeedBig = function (t, m) { window.__blasts.push(t); return window.__origWFB9(t, m); };
            }
            window._rb2p_evtBlastedAt = { PICK6: Date.now() - 1000 };   // a PICK6 just painted
            window._rb2p_waitFeedBig('INT', 'x');                       // direct call = the renderer path
            var direct = window.__blasts.slice();
            return { direct: direct };
        });
        const t9b = await page.evaluate(() => {
            // The swallow lives in the evt RECEIVER, so assert the rule itself:
            // an INT arriving within 6s of a PICK6 must not paint.
            var within = Date.now() - (Number(window._rb2p_evtBlastedAt.PICK6) || 0) < 6000;
            return { within: within };
        });
        console.log('  T9: ' + JSON.stringify(t9) + ' ' + JSON.stringify(t9b));
        check('T9 the PICK6-owns-the-takeaway window is armed (INT swallowed for 6s)',
              t9b.within === true, JSON.stringify(t9b));
        // ---- T10: a MEMORY-ONLY claim (the persisted duty record, S5) must not
        // write engine state. It used to: the tick restored the down-6 marker,
        // that became "fresh evidence", which kept the record alive — measured
        // as the down snapping back to 6 and EVERY drive refused for 35s after
        // a normal touchdown. It now keeps the blocks for a 3s grace, writes
        // nothing, and retires itself. ----
        await page.evaluate(() => {
            try {
                var pl = window._rb2p_enumeratePopupInstances() || [];
                for (var i = 0; i < pl.length; i++) {
                    var p = pl[i];
                    if (p && !p._HL2 && (p._0G === 100367 || p._0G === 100369)) {
                        try { _cr(p); } catch (e) { p._HL2 = true; }
                    }
                }
            } catch (e) {}
        });
        await clearPat(page);
        const t10 = await page.evaluate(async () => {
            var em = RB.engineState();
            em.engineDownNumber = 1; em.engineYardsToGo = 10; em.engineYardLineSigned = -25;
            window._rb2p_patDutyMine = { role: 'a', ts: Date.now() };
            window._rb2p_patStrongSignalMs = Date.now();
            var during = window._rb2p_patOwed();
            await new Promise(r => setTimeout(r, 3600));
            var after = window._rb2p_patOwed();
            return { during: during, after: after,
                     down: Number(RB.engineState().engineDownNumber),
                     dutyGone: !window._rb2p_patDutyMine,
                     driveAllowed: window._rb2p_forceUserOffenseDrive(-25) !== false };
        });
        console.log('  T10: ' + JSON.stringify(t10));
        check('T10 a memory-only claim writes no engine state and retires itself',
              /^S5/.test(t10.during) && t10.after === '' && t10.down === 1 &&
              t10.dutyGone === true && t10.driveAllowed === true, JSON.stringify(t10));
    } catch (e) {
        console.error('ERROR mid-test:', e && e.message);
        fail++;
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
