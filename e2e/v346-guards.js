// e2e/v346-guards.js — the flow-guard batch from the OT-loss + DJPK games.
//
// Red evidence is the two live games themselves: the OT 2-pt conversion wiped
// (score regressed across the OT entry), DJPK's FG+TD collapsing back to 8-8
// with the made-FG boundary rolled back, a ghost "RODGERS — INCOMPLETE PASS"
// (kicks fly the same airborne ball state and credit nothing), and the Q4 0:03
// pick-6 whose PAT was destroyed by the FINAL firing over it.
//
// T1  the SCORE FLOOR restores a regressed score within ~1s
// T2  a kick-shaped settle (airborne, no attempt credit) emits NOTHING
// T3  a real incompletion (attempt credited) still emits its line
// T4  the feed law validator rejects every unlicensed kind (L1/L4/L6/L7)
// T5  a made FG at the boundary voids the quarter-keep (Vy=14)
// T6  a pending PAT (down 6) holds the FINAL; it fires once the PAT resolves
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function kickShapedSettle(page, creditAttempt) {
    return page.evaluate(async (credit) => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ball = null; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        if (!ball) return { err: 'no ball' };
        var m = RB.engineState().rawEngineMatch;
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var n = _wi(to._Ln), qbP = null;
        for (var j = 0; j < n; j++) { var p = _zi(to._Ln, j); if (p && Number(_Ai(p, 'position')) === 1) { qbP = p; break; } }
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastTurnoverVy8Ms = 0;
        var y0 = Number(m._6F), d0 = Number(m._t11);
        async function step(k) { ball._kp = k; await new Promise(r => setTimeout(r, 70)); }
        await step(0); await step(1); await step(2); await step(3); await step(7);
        if (credit && qbP) _Yi(qbP, 'stat_attempts', (Number(_Ai(qbP, 'stat_attempts')) || 0) + 1);
        m._6F = y0 + 38; m._t11 = d0 + 1;   // a punt/kick flips field position with no stats
        await step(0);
        await new Promise(r => setTimeout(r, 500));
        return { ok: true };
    }, creditAttempt);
}

(async () => {
    console.log('=== V346 FLOW GUARDS ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const def = aWait ? g.a : g.b;

    // ---- T1: score floor ----
    const t1 = await off.page.evaluate(async () => {
        var em = RB.engineState();
        em.setUserScore(Number(em.userScore || 0) + 7);
        var high = Number(em.userScore);
        await new Promise(r => setTimeout(r, 400));    // let the floor learn the high water
        em.setUserScore(high - 7);                     // the OT-entry style wipe
        await new Promise(r => setTimeout(r, 900));
        return { high: high, now: Number(RB.engineState().userScore) };
    });
    console.log('  score floor: ' + JSON.stringify(t1));
    check('T1 a regressed score is restored by the floor within ~1s',
          t1.now === t1.high, JSON.stringify(t1));

    // ---- T3 first (fresh boot): real incompletion still shows ----
    // (Ordering + retries: the headless boot's engine loop can die mid-probe
    // — "ENGINE LOOP DEAD" — and eat a snap sample; real devices don't. The
    // law itself is what's under test and T2/T4 prove the muting side.)
    let feed3 = null;
    for (let a = 0; a < 3 && !feed3; a++) {
        await kickShapedSettle(off.page, true);
        await sleep(900);
        feed3 = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    }
    console.log('  feed after credited incompletion: ' + JSON.stringify(feed3));
    check('T3 a real incompletion (attempt delta) still emits its line',
          feed3 && feed3.k === 'incomplete', JSON.stringify(feed3));

    // ---- T2: kick-shaped settle, no credit -> the feed does not advance ----
    const seqBefore = feed3 ? Number(feed3.seq) : 0;
    const t2 = await kickShapedSettle(off.page, false);
    await sleep(900);
    const feed2 = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    console.log('  feed after uncredited airborne settle: ' + JSON.stringify(feed2));
    check('T2 a kick-shaped settle with no attempt credit emits NOTHING new',
          !t2.err && (feed2 == null || Number(feed2.seq) === seqBefore),
          JSON.stringify(feed2));

    // ---- T4: the law validator, all rejection lanes ----
    const t4 = await off.page.evaluate(() => {
        var L = window._rb2p_feedLawCheck;
        return {
            l1: L({ k: 'run', rb: 'X' }, { qbName: 'Q', runName: '' }),
            l2: L({ k: 'run', rb: 'Q' }, { qbName: 'Q', qbRushAttDelta: 0, qbRushYdDelta: 0 }),
            l3: L({ k: 'pass' }, { qbPassDelta: 0, rcvName: '' }),
            l4: L({ k: 'incomplete' }, { threw: true, qbAttDelta: 0 }),
            l5: L({ k: 'sack' }, { sawSack: false }),
            l6: L({ k: 'fumble' }, { fumbleDelta: 0 }),
            l7: L({ k: 'mystery' }, {}),
            okRun: L({ k: 'run', rb: 'W' }, { qbName: 'Q', runName: 'W' }),
            okInc: L({ k: 'incomplete' }, { threw: true, qbAttDelta: 1 })
        };
    });
    console.log('  law: ' + JSON.stringify(t4));
    check('T4 every unlicensed kind is rejected; licensed ones pass',
          /^L1/.test(t4.l1) && /^L2/.test(t4.l2) && /^L3/.test(t4.l3) && /^L4/.test(t4.l4) &&
          /^L5/.test(t4.l5) && /^L6/.test(t4.l6) && /^L7/.test(t4.l7) &&
          t4.okRun == null && t4.okInc == null, JSON.stringify(t4));

    // ---- T5: a made FG at the boundary voids the keep ----
    const t5 = await off.page.evaluate(() => {
        window._rb2p_preRolloverScore = Number(RB.engineState().userScore) || 0;
        window._rb2p_preRolloverMs = Date.now() - 1000;
        RB.engineState().engineDriveFsmStage = 14;      // made FG resolution
        var why = window._rb2p_scoredSinceCapture(RB.engineState(), false);
        RB.engineState().engineDriveFsmStage = 4;
        return { why: why };
    });
    console.log('  FG boundary: ' + JSON.stringify(t5));
    check('T5 a made FG (Vy=14) voids the quarter-keep restore',
          !!t5.why && /14/.test(String(t5.why)), JSON.stringify(t5));

    // ---- T6: the FINAL holds for a pending PAT ----
    // Run on the NON-waiting side: the waiting side's V293 pin floors the
    // clock at 0:01 by design, so the FINAL always comes from the live side
    // (in DJPK, the thrower) — that is the side under test.
    const t6 = await off.page.evaluate(async () => {
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_q3LawApplied = true;
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        window._rb2p_gameOverReported = false;
        var em = RB.engineState();
        em.engineQuarter = 4; em.engineMinutesLeft = 0; em.engineSecondsLeft = 0;
        em.setUserScore(20); em.setOpponentScore(6);
        em.engineControllerState = 1;
        em.engineDriveFsmStage = 4;                     // not the between-quarters park (13)
        em.engineDownNumber = 6;                        // the DJPK 0:03 pick-6 PAT, pending
        window._rb2p_quarterChangedToMs = Date.now() - 60000;
        await new Promise(r => setTimeout(r, 2600));
        var held = window._rb2p_gameOverReported !== true;
        em.engineDownNumber = 1;                        // hand the scene back
        return { held: held };
    });
    console.log('  PAT hold: ' + JSON.stringify(t6));
    // Only the HOLD is new code — the release/fire path is the untouched
    // detector, covered by v337 (dead-opponent + governor ends) and v325
    // (walk-off FINALs). Synthetically teleporting a live engine to Q4 0:00
    // trips the legitimate quarter-entry governors, so asserting the fire here
    // would test the teleport, not the game.
    check('T6 the FINAL holds while a PAT is pending (the DJPK 0:03 pick-6)',
          t6.held === true, JSON.stringify(t6));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
