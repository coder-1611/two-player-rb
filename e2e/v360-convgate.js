// e2e/v360-convgate.js — THE CONVERSION GATE.
//
// A conversion (the 1PT/2PT modal) may only ever be constructed for a REAL
// touchdown — a normal TD, a pick-6, or a conversion already legitimately in
// progress — and only at a LEGAL yard line. Everything else is refused at the
// one choke point every conversion modal in the game passes through: _wm.
//
// Verified against the engine before writing a line of this:
//   • of 137 _wm() call sites in retrobowl.js, exactly ONE builds a conversion
//     modal (matchmsg_PATor2 with _ne1/_oe1 = 100367/100369), plus the bridge's
//     own pick-6 pop. There is no second constructor.
//   • the 2-point attempt (and the modal) live on the 2  = _6F +48.
//   • the 1-point KICK is snapped from the 15 = _6F +35 — s_set_up_fieldgoal
//     (_lB) does `_Z21 = 1, _6F = 35`. BOTH are legal conversion spots.
//
// T1  the gate is wired into the choke point and accounts for EVERY popup
// T2  an unlicensed conversion is REFUSED (the "it spawned after a refresh" class)
// T3  a touchdown (+6 on our own score) licences it
// T4  an explicit pick-6 authorization licences it
// T5  a conversion already in progress licences a re-pop (kill-and-repop lives)
// T6  a conversion is only ever built on the 2 — midfield is pinned first
// T7  the 1-pt KICK spot (+35) is legal and is NOT dragged back to the 2
// T8  a duty record the score has moved past is refused (the refresh spawn)
// T9  a finished game refuses a conversion outright
// T10 non-conversion popups are untouched by the gate
// T11 the engine's own touchdown stage is an independent second licence
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Put the device in a clean, no-conversion-owed state.
const clearPat = page => page.evaluate(() => {
    window._rb2p_patPlayPending = false;
    window._rb2p_patPlayResolved = false;
    window._rb2p_pickSixPatCascadeActive = false;
    window._rb2p_pickSixThisDeviceIsThrower = false;
    window._rb2p_patDutyMine = null;
    window._rb2p_patOwedSinceMs = 0;
    window._rb2p_gameOverReported = false;
    window._rb2p_convAuthMs = 0;
    window._rb2p_lastTd6Ms = 0;
    var em = RB.engineState();
    em.engineDownNumber = 1; em.engineYardsToGo = 10;
    em.enginePatModeFlag = 0;
    try {
        var pl = window._rb2p_enumeratePopupInstances() || [];
        for (var i = 0; i < pl.length; i++) { try { if (!pl[i]._HL2) _cr(pl[i]); } catch (e) {} }
    } catch (e) {}
});

// Build a conversion modal exactly the way the engine's TD path does.
const popConversion = page => page.evaluate(() => {
    var em = RB.engineState();
    var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
    var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
    var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
    _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
    return { modalUp: window._rb2p_patModalUp(),
             yard: Number(RB.engineState().engineYardLineSigned),
             stats: window._rb2p_convGateStats ? window._rb2p_convGateStats() : null };
});

(async () => {
    console.log('=== V360 THE CONVERSION GATE ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        // ---- T1: wired into the choke point, and it accounts for everything ----
        await clearPat(page);
        const t1 = await page.evaluate(() => {
            var s0 = window._rb2p_convGateStats ? window._rb2p_convGateStats() : null;
            return { hooked: typeof window._rb2p_conversionGate === 'function' &&
                             typeof _wm === 'function' && _wm.__rb2pPatPin === true,
                     stats: s0 };
        });
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 the gate is installed at the _wm choke point and reports itself',
              t1.hooked === true && t1.stats && typeof t1.stats.popups === 'number',
              JSON.stringify(t1));

        // ---- T2: no licence -> REFUSED ----
        // Nothing scored, no pick-6, no conversion in progress. This is the
        // shape a stale reload takes, and it must never reach the screen.
        await clearPat(page);
        const t2 = await popConversion(page);
        console.log('  T2: ' + JSON.stringify(t2));
        check('T2 an unlicensed conversion modal is REFUSED (never constructed)',
              t2.modalUp === false && t2.stats && t2.stats.refusals > 0,
              JSON.stringify(t2));

        // ---- T3: a touchdown licences it ----
        // The engine credits +6 and pops in ONE expression, so at construction
        // time our score is exactly 6 above the last sample. That delta IS the
        // licence — no stage read, no guesswork.
        await clearPat(page);
        const t3 = await page.evaluate(async () => {
            var em = RB.engineState();
            em.setUserScore(Number(em.userScore || 0));
            await new Promise(r => setTimeout(r, 120));      // let the sampler take a baseline
            em.setUserScore(Number(RB.engineState().userScore || 0) + 6);   // the touchdown
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            return { modalUp: window._rb2p_patModalUp(),
                     licence: window._rb2p_conversionLastLicence || '' };
        });
        console.log('  T3: ' + JSON.stringify(t3));
        check('T3 a touchdown (+6 on our score) licences the conversion',
              t3.modalUp === true && /^L1/.test(t3.licence), JSON.stringify(t3));

        // ---- T4: an explicit pick-6 authorization licences it ----
        await clearPat(page);
        const t4 = await page.evaluate(() => {
            window._rb2p_convAuthMs = Date.now();          // what the pick-6 branch stamps
            var em = RB.engineState();
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            return { modalUp: window._rb2p_patModalUp(),
                     licence: window._rb2p_conversionLastLicence || '' };
        });
        console.log('  T4: ' + JSON.stringify(t4));
        check('T4 an explicit pick-6 authorization licences the conversion',
              t4.modalUp === true && /^L2/.test(t4.licence), JSON.stringify(t4));

        // ---- T5: a conversion already in progress may re-pop ----
        // The invariant KILLS a modal that is up off the 2 and relies on it
        // re-popping once the ball is legal. If the gate refused that re-pop the
        // conversion would be lost forever, so a strong live signal is a licence.
        await clearPat(page);
        const t5 = await page.evaluate(() => {
            // Isolate the L3 path: make sure no touchdown delta is in play, so
            // the ONLY thing that can licence this pop is the live conversion.
            var emS = RB.engineState();
            window._rb2p_convScorePrev = { u: Number(emS.userScore) || 0,
                                           o: Number(emS.opponentScore) || 0, ms: Date.now() };
            window._rb2p_lastTd6Ms = 0;
            window._rb2p_convAuthMs = 0;
            window._rb2p_patPlayPending = true;            // S1 — a live conversion
            var em = RB.engineState();
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            var r = { modalUp: window._rb2p_patModalUp(),
                      licence: window._rb2p_conversionLastLicence || '' };
            window._rb2p_patPlayPending = false;
            return r;
        });
        console.log('  T5: ' + JSON.stringify(t5));
        check('T5 a conversion already in progress licences a re-pop',
              t5.modalUp === true && /^L3/.test(t5.licence), JSON.stringify(t5));

        // ---- T6: built on the 2, never anywhere else ----
        await clearPat(page);
        const t6 = await page.evaluate(() => {
            var em = RB.engineState();
            window._rb2p_convAuthMs = Date.now();
            em.rawEngineMatch._6F = 0;                     // midfield — the OKAG screenshot
            var before = Number(RB.engineState().engineYardLineSigned);
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            return { before: before,
                     atPop: Number(RB.engineState().engineYardLineSigned),
                     modalUp: window._rb2p_patModalUp() };
        });
        console.log('  T6: ' + JSON.stringify(t6));
        check('T6 a conversion is only ever constructed on the 2 (+48)',
              t6.modalUp === true && Math.abs(t6.atPop - 48) <= 0.5, JSON.stringify(t6));

        // ---- T7: the 1-pt KICK spot is legal (Law D) ----
        // s_set_up_fieldgoal puts the extra point on the 15 (_6F 35) and sets
        // the PAT flag. The conversion invariant used to know only ONE legal
        // spot (+48) and dragged the kick back to the 2 within 50ms.
        await clearPat(page);
        const t7 = await page.evaluate(async () => {
            var em = RB.engineState();
            em.engineDownNumber = 6;                       // a conversion is owed
            em.enginePatModeFlag = 1;                      // _Z21 — the 1PT click set this
            em.rawEngineMatch._6F = 35;                    // s_set_up_fieldgoal's own write
            await new Promise(r => setTimeout(r, 400));    // ~8 ticks of the 50ms invariant
            var yard = Number(RB.engineState().engineYardLineSigned);
            em.enginePatModeFlag = 0; em.engineDownNumber = 1;
            return { yard: yard };
        });
        console.log('  T7: ' + JSON.stringify(t7) + '  (35 = the 15-yard line)');
        check('T7 the 1-pt kick spot (+35) is legal and is NOT pulled back to the 2',
              Math.abs(t7.yard - 35) <= 0.5, JSON.stringify(t7));

        // ---- T8: a duty the score has moved past is dead ----
        await clearPat(page);
        const t8 = await page.evaluate(() => {
            var f = window._rb2p_patDutyStillOwed;
            if (typeof f !== 'function') return { missing: true };
            return {
                live:      f({ scoreUser: 14, scoreOpp: 7 }, 14, 7),   // mid-conversion
                converted: f({ scoreUser: 14, scoreOpp: 7 }, 16, 7),   // the 2-pt landed
                kicked:    f({ scoreUser: 14, scoreOpp: 7 }, 15, 7),   // the 1-pt landed
                oppScored: f({ scoreUser: 14, scoreOpp: 7 }, 14, 14),  // game moved on
                lagging:   f({ scoreUser: 14, scoreOpp: 7 }, 8, 7),    // stale heartbeat
                noScores:  f({ role: 'A' }, 14, 7)                     // old record
            };
        });
        console.log('  T8: ' + JSON.stringify(t8));
        check('T8 a duty record the score has moved past is refused; a live one survives',
              !t8.missing && t8.live === '' && !!t8.converted && !!t8.kicked &&
              !!t8.oppScored && t8.lagging === '' && t8.noScores === '',
              JSON.stringify(t8));

        // ---- T9: a finished game never shows a conversion ----
        await clearPat(page);
        const t9 = await page.evaluate(() => {
            window._rb2p_gameOverReported = true;
            window._rb2p_convAuthMs = Date.now();          // even fully authorized
            var em = RB.engineState();
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            var r = { modalUp: window._rb2p_patModalUp(),
                      refusal: window._rb2p_convGateLastRefusal || '' };
            window._rb2p_gameOverReported = false;
            return r;
        });
        console.log('  T9: ' + JSON.stringify(t9));
        check('T9 a finished game refuses a conversion outright',
              t9.modalUp === false && /^R1/.test(t9.refusal), JSON.stringify(t9));

        // ---- T10: ordinary popups are none of the gate's business ----
        await clearPat(page);
        const t10 = await page.evaluate(() => {
            var em = RB.engineState();
            var s0 = window._rb2p_convGateStats();
            // the 4th-down punt menu — a real, unrelated modal
            _wm(em.rawEngineMatch, _Sc2, '', _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PlayPunt'),
                _Xi(em.rawEngineMatch, _Sc2, 'down_4'), _Xi(em.rawEngineMatch, _Sc2, 'Punt'),
                100361, 100363, 16777215, 0.7);
            var built = 0;
            try {
                var pl = window._rb2p_enumeratePopupInstances() || [];
                for (var i = 0; i < pl.length; i++)
                    if (pl[i] && !pl[i]._HL2 && (pl[i]._0G === 100361 || pl[i]._0G === 100363)) built++;
            } catch (e) {}
            var s1 = window._rb2p_convGateStats();
            return { built: built, popupsCounted: s1.popups - s0.popups,
                     refusalsAdded: s1.refusals - s0.refusals };
        });
        console.log('  T10: ' + JSON.stringify(t10));
        check('T10 a non-conversion popup is counted but never refused',
              t10.built > 0 && t10.popupsCounted > 0 && t10.refusalsAdded === 0,
              JSON.stringify(t10));

        // ---- T11: the engine's own touchdown stage is a licence too ----
        // A NORMAL touchdown has no other signal at construction time: the
        // down-6 marker is stamped after _wm returns and no modal is up yet.
        // L1 (the score delta) carries it, and this is the independent second
        // witness in case the sampler's window is ever disturbed.
        await clearPat(page);
        const t11 = await page.evaluate(() => {
            var em = RB.engineState();
            window._rb2p_convScorePrev = { u: Number(em.userScore) || 0,
                                           o: Number(em.opponentScore) || 0, ms: Date.now() };
            window._rb2p_lastTd6Ms = 0; window._rb2p_convAuthMs = 0;
            var vy0 = Number(em.engineDriveFsmStage);
            em.engineDriveFsmStage = 9;                     // the engine's TD stage
            var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
            var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
            var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
            _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
            var r = { modalUp: window._rb2p_patModalUp(),
                      licence: window._rb2p_conversionLastLicence || '' };
            RB.engineState().engineDriveFsmStage = vy0;
            return r;
        });
        console.log('  T11: ' + JSON.stringify(t11));
        check('T11 the engine touchdown stage independently licences a conversion',
              t11.modalUp === true && /^L1b/.test(t11.licence), JSON.stringify(t11));

        await page.close();
    } finally {
        await browser.close();
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
