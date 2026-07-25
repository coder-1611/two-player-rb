// e2e/v345-halfdir.js — room USFR, both halftime bugs.
//
// BUG A — "after halftime, plays run BACKWARDS". Mechanism (probe-sc1.js):
// an engine quarter-roll the bridge later reverts (the 0:00 re-expiry burst —
// case 19 rolls Q2→Q3→Q4, the governor drags the number back to 3) runs
// _Sc1 (s_switch_drivedirection) once too often: _501 AND every live player's
// _L11 flip, but their POSITIONS and _B01 don't — the formation is INSIDE-OUT.
// The Q3-LAW's forceUserOffenseDrive then ADOPTED that formation (ballCount>0
// skip path), so the first Q3 snap ran the wrong way and a visually-forward
// play resolved as NEGATIVE yards (__6 measures by _501). Fix: the law
// restores the last STABLY-PLAYED direction and spawns freshDrive.
//
// BUG B — a TD at Q3 0:01 was ROLLED BACK: the boundary's case 19 clobbers the
// TD flow to Vy=13, the qEndLatch refuses down=6, and the quarter-keep restored
// the PRE-SNAP preRollover capture ({red zone, 1st, goal-line toGo}) over the
// touchdown — patPlayPending never guards a NORMAL TD (pick-6-scoped). Fix:
// score snapshots ride every capture; a restore over a scored play is VOIDED.
//
// T1  Q3 LAW: b on offense, a waits
// T2  (A) the direction register survives the burst: _501 === Q2's stable dir
// T3  (A) the spawned Q3 formation is consistent (OF behind the line, B01 synced)
// T4  (A) a driven play's _6F moves TOWARD the opponent (+3 for a 3yd gain)
// T5  (B) the TD's +6 survives the Q3→Q4 boundary
// T6  (B) no pre-TD restore: the down is still the PAT marker (6), not 1st&2
// T7  (B) the boundary captures were voided, not left armed
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V345 HALFTIME DIRECTION + BOUNDARY-TD ROLLBACK ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;   // Q2-end offense (the kicker)
    const def = aWait ? g.a : g.b;   // receiver of the missed-FG outcome
    console.log('  Q2 kicker = ' + off.role + ', receiver = ' + def.role);

    // ---- v340 flow: a missed FG as the half expires; the receiver takes over ----
    await Promise.all([
        off.page.evaluate(() => {
            var em = RB.engineState();
            em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 0;
        }),
        def.page.evaluate(() => {
            var em = RB.engineState();
            em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 1;
        })
    ]);
    await def.page.evaluate((sc) => {
        window._twoPlayer.receive({
            type: 'OTHER', turnover: false, yardLine: -25, ownSide: true,
            scoreUser: sc.them, scoreOpp: sc.us,
            quarter: 2, minutesLeft: 0, secondsLeft: 0,
            fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
            message: 'Possession change. On your 25 yard line', ts: Date.now()
        });
    }, await def.page.evaluate(() => ({
        us: Number(RB.engineState().userScore) || 0,
        them: Number(RB.engineState().opponentScore) || 0
    })));
    await off.page.evaluate((other) => {
        window._rb2p_userIsWaitingForOpponent = true;
        if (typeof window._rb2p_declareTurnOwner === 'function')
            window._rb2p_declareTurnOwner(other, 'fg-miss');
    }, def.role);
    await sleep(1500);

    // ---- arm the stable-direction latch on B (clock must RUN a moment), then
    // record Q2's direction ----
    await g.b.page.evaluate(() => {
        var em = RB.engineState();
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 30;
    });
    await sleep(600);
    const dirQ2 = await g.b.page.evaluate(() => Number(RB.engineState().engineDriveDirection));
    console.log('  B stable Q2 direction = ' + dirQ2);

    // ---- inject the rogue burst product on B: clock back at 0:00, ONE extra
    // _Sc1 (what the reverted Q3→Q4 roll ran), then both engines land on Q3 ----
    await g.b.page.evaluate(() => {
        var em = RB.engineState();
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 0; em.engineTickAllowance = 0;
        _Sc1(em.rawEngineMatch, _Sc2);   // s_switch_drivedirection — the rogue flip
        em.engineQuarter = 3;
    });
    await g.a.page.evaluate(() => { RB.engineState().engineQuarter = 3; });
    await sleep(6000);   // Q3 LAW + settle

    const B3 = await g.b.page.evaluate(() => {
        var em = RB.engineState(); var m = em.rawEngineMatch;
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ofBehind = 0, ofTot = 0, balls = 0;
        for (var i = 0; i < all.length; i++) {
            var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
            if (x._eE2._fE2 === 'obj_ball') balls++;
            if (x._eE2._fE2 === 'obj_playerOF') {
                ofTot++;
                if ((Number(x.x) - Number(m._B01)) * Number(m._501) < -4) ofBehind++;
            }
        }
        return { waiting: window._rb2p_userIsWaitingForOpponent === true,
                 q: Number(m._Wy), dir: Number(m._501), f6F: Number(m._6F),
                 B01: Number(m._B01), expB01: 1300 + Number(m._6F) * 20 * Number(m._501),
                 ofBehind: ofBehind, ofTot: ofTot, balls: balls };
    });
    const A3 = await g.a.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        q: Number(RB.engineState().engineQuarter)
    }));
    console.log('  B Q3 = ' + JSON.stringify(B3));
    console.log('  A Q3 = ' + JSON.stringify(A3));

    check('T1 Q3 LAW: b on offense, a waits',
          B3.waiting === false && A3.waiting === true && B3.q === 3 && A3.q === 3,
          JSON.stringify({ b: B3.waiting, a: A3.waiting, bq: B3.q, aq: A3.q }));
    check('T2 (A) _501 survives the burst: Q3 direction === Q2\'s stable direction',
          B3.dir === dirQ2, 'dir=' + B3.dir + ' expected ' + dirQ2);
    check('T3 (A) fresh consistent formation: all OF behind the line, B01 synced to _6F*_501',
          B3.balls === 1 && B3.ofTot === 11 && B3.ofBehind === 11 &&
          Math.abs(B3.B01 - B3.expB01) <= 1,
          JSON.stringify(B3));

    // ---- (A) drive one play with the ENGINE's own resolution: ball moved 3yd
    // in the direction the FORMATION calls forward, then obj_controller Alarm0 ----
    const res = await g.b.page.evaluate(() => {
        try {
            var em = RB.engineState(); var m = em.rawEngineMatch;
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var ball = null, ofx = [];
            for (var i = 0; i < all.length; i++) {
                var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_ball' && !ball) ball = x;
                if (x._eE2._fE2 === 'obj_playerOF') ofx.push(x.x);
            }
            if (!ball || !ofx.length) return { err: 'no field' };
            var mean = ofx.reduce((a, b) => a + b, 0) / ofx.length;
            var visFwd = (mean < m._B01) ? 1 : -1;   // OF huddle behind the line → forward = past it
            var before = Number(m._6F);
            ball._331 = m._B01 + 3 * 20 * visFwd;
            ball.x = ball._331; ball._X_ = 0; ball._kp = 4;
            __6(m, _Sc2);
            var out = { visFwd: visFwd, before: before, after: Number(m._6F),
                        delta: Number(m._6F) - before, down: Number(m._t11) };
            ball._kp = 0;   // dead ball at rest for the part-B setup
            return out;
        } catch (e) { return { err: String(e) }; }
    });
    console.log('  (A) resolve: ' + JSON.stringify(res));
    check('T4 (A) a visually-forward play moves _6F TOWARD the opponent (+3)',
          res && !res.err && Math.abs(res.delta - 3) < 0.5,
          JSON.stringify(res));

    // ================= (B) TD at the Q3→Q4 boundary =================
    // Goal-line drive at Q3 0:01; preRollover captures the PRE-SNAP spot.
    await g.b.page.evaluate(() => {
        var em = RB.engineState(); var m = em.rawEngineMatch;
        em.engineYardLineSigned = 48;    // the 2 — red zone
        em.engineDownNumber = 1; em.engineYardsToGo = 2;
        em.engineDriveFsmStage = 2; em.engineControllerState = 2;
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 1; em.engineTickAllowance = 0;
        window._rb2p_resyncScrimmage(em, 'v345-goal-line');
    });
    await sleep(600);   // the 100ms tracker latches {48, 1, 2} + score
    const capt = await g.b.page.evaluate(() => ({
        y: window._rb2p_preRolloverYard, d: window._rb2p_preRolloverDown,
        t: window._rb2p_preRolloverToGo, s: window._rb2p_preRolloverScore
    }));
    console.log('  captured pre-TD spot: ' + JSON.stringify(capt));
    const baseScore = await g.b.page.evaluate(() => Number(RB.engineState().userScore) || 0);

    // The TD, exactly as the engine runs it (replay stage 9, then s_action_result
    // TOUCHDOWN: +6, 1pt/2pt modal, down→6) — then the boundary's case-19
    // product: quarter→4, Vy→13, clock 0:00 (the governor tops Q4 within 16ms).
    await g.b.page.evaluate(() => {
        var em = RB.engineState(); var m = em.rawEngineMatch;
        m._Vy = 9;                       // TD stage — seen by the V345 latch
        _hB(m, _Sc2, 1);                 // s_action_result: ACTION_RESULT_TOUCHDOWN
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 0; em.engineTickAllowance = 0;
        em.engineQuarter = 4;            // case 19 rolled the quarter…
        em.engineDriveFsmStage = 13;     // …and parked the FSM over the TD flow
    });
    await sleep(5000);   // > the 1500ms Vy=13 dwell + margin

    const B4 = await g.b.page.evaluate(() => {
        var em = RB.engineState();
        return { q: Number(em.engineQuarter), down: Number(em.engineDownNumber),
                 toGo: Number(em.engineYardsToGo), yard: Number(em.engineYardLineSigned),
                 vy: Number(em.engineDriveFsmStage), score: Number(em.userScore) || 0,
                 preYard: window._rb2p_preRolloverYard,
                 resume: window._rb2p_quarterResumePending === true };
    });
    console.log('  after boundary: ' + JSON.stringify(B4) + '  (baseScore=' + baseScore + ')');

    check('T5 (B) the TD\'s +6 survived the boundary',
          B4.score === baseScore + 6, 'score=' + B4.score + ' expected ' + (baseScore + 6));
    check('T6 (B) no pre-TD restore: down is still the PAT marker 6, not the captured 1st&2',
          B4.down === 6, JSON.stringify(B4));
    check('T7 (B) the boundary captures were voided (no armed restore left behind)',
          B4.preYard == null && B4.resume === false,
          'preYard=' + B4.preYard + ' resume=' + B4.resume);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
