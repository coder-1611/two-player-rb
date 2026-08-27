// e2e/v302-qtr-ot.js — two device-reported defects from room UYJU (final 29-0):
//
//   1. "on the quarter switch from 1st to 2nd, I got bumped back 10 yards"
//      The quarter-keep resumed from _rb2p_preRolloverYard, which is captured
//      ONLY while the clock is running — so the quarter's LAST play (the one
//      that runs the clock to 0:00) never made it in, and its gain was erased.
//      V302 latches the settled spot at the Vy=13 park instead.
//
//   2. "the game went to OT after a score of 23-0"
//      V296 armed overtime from `q >= 5` alone, ABOVE the tie check. The
//      game-over detector's first OT guard (`q>=5 && inOvertime -> return`)
//      also sits above ITS tie check, so a decided regulation game that rolled
//      to Q5 armed OT and the FINAL could never fire. V302 requires proof that
//      OT was legitimately entered: a tie, the shared coin flip, or this
//      device's persisted possession counters (the reload case V296 fixed).
//
// A1  the Vy=13 latch captures the SETTLED post-play spot, not the stale one
// A2  the quarter-keep resumes at the latched spot (no backward jump)
// A3  a REAL Q1->Q2 boundary resumes where the last play actually ended
// B1  q=5 while TIED arms overtime
// B2  q=5 unlevel WITH persisted OT counters arms overtime (mid-OT reload)
// B3  q=5 unlevel with NO OT evidence does NOT arm overtime, and FINAL fires

const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function canvasBox(page) {
    return page.evaluate(() => {
        const r = document.getElementById('canvas').getBoundingClientRect();
        return { left: r.left, top: r.top, w: r.width, h: r.height };
    });
}

// TRUSTED snap+throw drag (the engine ignores synthetic in-page events).
async function trustedThrow(page) {
    const b = await canvasBox(page);
    const tx = 0.36 + Math.random() * 0.30, ty = 0.22 + Math.random() * 0.24;
    const x0 = b.left + b.w * 0.50, y0 = b.top + b.h * 0.62;
    const x1 = b.left + b.w * tx,   y1 = b.top + b.h * ty;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
    await page.mouse.move(x1, y1, { steps: 4 });
    await page.mouse.up();
}

async function clickButtons(page) {
    const info = await page.evaluate(() => {
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const out = [];
        for (const x of inst)
            if (x && !x._HL2 && x._eE2 && x._eE2._fE2 && /btn|button/.test(x._eE2._fE2))
                out.push({ x: x.x, y: x.y });
        const r = document.getElementById('canvas').getBoundingClientRect();
        return { out, left: r.left, top: r.top, rw: r.width, rh: r.height };
    });
    if (!info.out.length) return false;
    info.out.sort((a, b) => a.x - b.x);
    const b = info.out[0];
    const scale = Math.min(info.rw / 480, info.rh / 270);
    const offX = (info.rw - 480 * scale) / 2, offY = (info.rh - 270 * scale) / 2;
    const sx = info.left + offX + (b.x + 44) * scale;
    const sy = info.top  + offY + (b.y + 14) * scale;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await sleep(160);
    await page.mouse.move(sx + 1, sy + 1);
    await page.mouse.up();
    await sleep(250);
    return true;
}

async function st(page) {
    return page.evaluate(() => {
        let s = {}; try { s = RB.engineState() || {}; } catch (e) {}
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        let ball = 0, btn = 0;
        for (const x of inst) if (x && !x._HL2 && x._eE2 && x._eE2._fE2) {
            if (x._eE2._fE2 === 'obj_ball') ball++;
            if (/btn|button/.test(x._eE2._fE2)) btn++;
        }
        return {
            q: Number(s.engineQuarter), min: Number(s.engineMinutesLeft),
            sec: Number(s.engineSecondsLeft), vy: Number(s.engineDriveFsmStage),
            kp: Number(s.engineControllerState), down: Number(s.engineDownNumber),
            toGo: Number(s.engineYardsToGo), yard: Number(s.engineYardLineSigned),
            poss: s.enginePossessingTeamIdx === s.engineUserTeamIdx,
            us: Number(s.userScore), them: Number(s.opponentScore),
            waiting: window._rb2p_userIsWaitingForOpponent === true,
            inOt: window._rb2p_inOvertime === true,
            over: window._rb2p_gameOverReported === true,
            ball, btn
        };
    });
}

// Sample yard/down/vy at 40ms so the boundary can be reconstructed afterwards.
async function installSampler(page) {
    await page.evaluate(() => {
        if (window.__ylog) return;
        window.__ylog = []; window.__ylog0 = Date.now();
        setInterval(function () {
            try {
                var s = RB.engineState(); if (!s) return;
                var e = { t: Date.now() - window.__ylog0, q: Number(s.engineQuarter),
                          vy: Number(s.engineDriveFsmStage), kp: Number(s.engineControllerState),
                          yd: Number(s.engineYardLineSigned), d: Number(s.engineDownNumber),
                          tg: Number(s.engineYardsToGo),
                          poss: s.enginePossessingTeamIdx === s.engineUserTeamIdx ? 1 : 0,
                          w: window._rb2p_userIsWaitingForOpponent === true ? 1 : 0 };
                var l = window.__ylog, p = l.length ? l[l.length - 1] : null;
                if (!p || p.q !== e.q || p.vy !== e.vy || p.kp !== e.kp ||
                    Math.abs(p.yd - e.yd) > 0.01 || p.d !== e.d || p.tg !== e.tg ||
                    p.poss !== e.poss || p.w !== e.w) { l.push(e); if (l.length > 9000) l.shift(); }
            } catch (e2) {}
        }, 40);
    });
}

// Put the engine into a specific quarter, moving the V295 governor's baselines
// with it (a bare engineQuarter write is clamped to lastStable+1).
const SET_Q = `(function (q) {
    window._rb2p_lastStableQuarter = q;
    window._rb2p_wireQuarter       = q;
    window._rb2p_qGovPrevQ         = q;
    RB.engineState().engineQuarter = q;
})`;

(async () => {
    console.log('=== V302 QUARTER-SPOT + OT-ENTRY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(4000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;
    const wtr = aWait ? g.a : g.b;

    const bridgeLog = [];
    // Capture every bridge line, so a boundary that goes wrong can be diagnosed
    // from the run instead of guessed at.
    drv.page.on('console', m => {
        const t = m.text();
        if (t.indexOf('[2P') === 0) bridgeLog.push(t);
    });
    await installSampler(drv.page);

    // Get the driver onto a live, playable drive.
    for (let i = 0; i < 14; i++) {
        const s = await st(drv.page);
        if (s.ball > 0 && s.btn === 0 && s.down >= 1 && s.down <= 4) break;
        if (s.btn > 0) await clickButtons(drv.page);
        await sleep(900);
    }

    // ================= A3 FIRST: a REAL Q1->Q2 boundary =================
    // Run this on a CLEAN match, before the synthetic states below perturb the
    // FSM. Expire the Q1 clock mid-play and confirm the drive resumes where the
    // final play actually ended (the Vy=13 park sample), not before it.
    await drv.page.evaluate(() => { window.__ylogMark = window.__ylog.length; });
    // Re-arm the clock to 0:01 before EVERY attempt. The clock only runs while a
    // play is live, so a throw that falls incomplete barely moves it — with a
    // one-shot 0:08 this leg often never reached the boundary at all and skipped
    // itself (and, worse, sometimes half-expired into an ambiguous sample).
    // Re-stamping 0:01 each time makes the very next live snap expire it, which
    // is the authentic case-19 path we want to observe.
    let rolled = false;
    for (let i = 0; i < 16 && !rolled; i++) {
        const s = await st(drv.page);
        if (s.q !== 1) { rolled = true; break; }
        await drv.page.evaluate(() => {
            const e = RB.engineState();
            if (Number(e.engineQuarter) === 1) {
                e.engineMinutesLeft = 0; e.engineSecondsLeft = 1; e.engineTickAllowance = 0;
            }
        });
        if (s.btn > 0) await clickButtons(drv.page);
        else if (s.ball > 0) await trustedThrow(drv.page);
        await sleep(1400);
    }
    await sleep(10000);   // let the Vy=13 park + the 1500ms-dwell keep-drive complete

    const real = await drv.page.evaluate(() => {
        const l = window.__ylog.slice(window.__ylogMark || 0);
        const park = l.find(e => e.vy === 13 && e.q === 2 && e.poss === 1);
        // Resume = the FIRST live playable sample after the keep-drive respawns
        // the drive (vy back to a play stage). Taking the LAST sample instead
        // would drift with any downs played afterwards.
        let resume = null;
        if (park) resume = l.find(e => e.t > park.t && e.q === 2 && e.poss === 1 && !e.w &&
                                       e.vy <= 2 && e.d >= 1 && e.d <= 4);
        return { park, resume, rows: l.filter(e => e.q >= 2).slice(0, 30),
                 rolled: l.some(e => e.q === 2), maxQ: l.reduce((a, e) => Math.max(a, e.q), 1) };
    });
    if (!real.rolled) {
        console.log('  SKIP  A3 — the clock never expired in this run (no boundary to observe)');
    } else {
        console.log('  real boundary: park=' + JSON.stringify(real.park));
        console.log('                 resume=' + JSON.stringify(real.resume));
        console.log('  --- Q2 transition rows ---');
        for (const e of real.rows)
            console.log('    t+' + String(e.t).padStart(6) + ' Q' + e.q + ' vy=' + e.vy +
                        ' kp=' + e.kp + ' yd=' + e.yd.toFixed(2) + ' ' + e.d + '&' + e.tg.toFixed(2) +
                        ' poss=' + e.poss + ' wait=' + e.w);
        check('A3 a single roll to Q2 (no quarter skipped)', real.maxQ === 2, 'maxQ=' + real.maxQ);
        check('A3 real boundary resumed at the settled end-of-Q1 spot',
              real.park && real.resume && Math.abs(real.resume.yd - real.park.yd) < 1.5,
              real.park && real.resume
                  ? ('park yd ' + real.park.yd.toFixed(2) + ' -> resume yd ' + real.resume.yd.toFixed(2))
                  : 'missing park/resume sample');
        check('A3 real boundary kept the settled down & distance',
              real.park && real.resume && real.resume.d === real.park.d,
              real.park && real.resume
                  ? (real.park.d + '&' + real.park.tg.toFixed(1) + ' -> ' +
                     real.resume.d + '&' + real.resume.tg.toFixed(1))
                  : 'missing sample');
        if (real.park && real.resume &&
            (Math.abs(real.resume.yd - real.park.yd) >= 1.5 || real.resume.d !== real.park.d)) {
            console.log('  !! the boundary was taken over by something OTHER than the ' +
                        'quarter-keep (resume landed ' +
                        (real.resume.t - real.park.t) + 'ms after the park; the keep-drive ' +
                        'dwell alone is 1500ms). Bridge log for this window:');
            for (const l of bridgeLog) console.log('     ' + l);
        }
    }

    // ================= A1/A2: deterministic latch + resume =================
    // Recreate the exact failure state: preRollover holds the PRE-SNAP spot of
    // the quarter's last play (own 30 = _6F -20), while the engine has already
    // settled that play 10 yards downfield (own 40 = _6F -10) and parked on
    // Vy=13 with the quarter rolled to 2. Pre-V302 the resume used -20.
    const SETTLED = -10, STALE = -20;
    await drv.page.evaluate((setQ, settled, stale) => {
        eval(setQ)(2);
        const s = RB.engineState();
        // A3 ran a real Q1->Q2 boundary and may have left a latch for Q2. The
        // latch block only fires when _rb2p_qEndLatchQ !== the current quarter,
        // so a leftover would silently block this one from arming and we would
        // assert against A3's spot instead of this scenario's.
        window._rb2p_qEndLatchQ = null;
        window._rb2p_userIsWaitingForOpponent = false;
        s.enginePossessingTeamIdx = s.engineUserTeamIdx;
        // What the clock-gated capture would have (wrongly) held.
        window._rb2p_preRolloverYard = stale;
        window._rb2p_preRolloverDown = 1;
        window._rb2p_preRolloverToGo = 10;
        // The engine's own settled post-play values at the quarter park.
        // Written RAW, the way the engine writes it when a play resolves. The
        // façade setter is the bridge's ball gate (V358) — staging a scenario
        // through it makes the setup look like a bridge PLACEMENT at a quarter
        // boundary, which the gate then holds to the anchor A3's real boundary
        // just armed, and the assertion measures the gate instead of the latch.
        s.rawEngineMatch._6F = settled;
        s.engineDownNumber     = 1;
        s.engineYardsToGo      = 10;
        s.engineMinutesLeft    = 0;
        s.engineSecondsLeft    = 0;
        s.engineDriveFsmStage  = 13;
    }, SET_Q, SETTLED, STALE);

    await sleep(500);   // the tracker runs at 100ms
    const latch = await drv.page.evaluate(() =>
        (typeof window._rb2p_qEndSpot === 'function') ? window._rb2p_qEndSpot(2) : null);
    check('A1 Vy=13 park latched the SETTLED spot, not the stale preRollover',
          latch && Math.abs(latch.yard - SETTLED) < 0.01,
          'latch=' + JSON.stringify(latch) + ' settled=' + SETTLED + ' stale=' + STALE);
    check('A1 latch carried the settled down & distance',
          latch && latch.down === 1 && latch.toGo === 10, JSON.stringify(latch));

    // Let the keep-drive (1500ms dwell) consume it and resume the drive.
    await sleep(5000);
    const afterKeep = await st(drv.page);
    console.log('  after keep-drive: Q' + afterKeep.q + ' yard ' + afterKeep.yard.toFixed(1) +
                ' ' + afterKeep.down + '&' + afterKeep.toGo + ' vy=' + afterKeep.vy);
    check('A2 resumed at the settled spot — NOT bumped back to the stale one',
          Math.abs(afterKeep.yard - SETTLED) < 1.5,
          'resumed at ' + afterKeep.yard.toFixed(1) + ', want ' + SETTLED +
          ' (stale/buggy value would be ' + STALE + ')');
    check('A2 the resume did not lose the 10 yards the last play gained',
          Math.abs(afterKeep.yard - STALE) > 5,
          'resumed at ' + afterKeep.yard.toFixed(1) + ' = the stale pre-snap spot');
    check('A2 keep-drive logged that it used the V302 latch',
          bridgeLog.some(l => l.indexOf('[V302 settled latch]') >= 0),
          bridgeLog.filter(l => l.indexOf('QTR-ADVANCE') >= 0).join(' | ') || '(no QTR-ADVANCE log)');

    // ================= B: overtime entry =================
    const resetMatch = async () => {
        // B1 (the tied case) makes the HOST seed a REAL coin flip at
        // rooms/{code}/ot/p5. Nothing clears it between sub-tests, so the ot
        // subscription re-delivers it and legitimately re-arms overtime for the
        // later cases — B3 was inheriting genuine OT evidence and failing about
        // half the time. A real match purges /ot at startMatch; do the same here.
        await TP.fbDelete('rooms/' + g.code + '/ot');
        for (const side of [g.a, g.b]) {
            await side.page.evaluate(() => { window._rb2p_otFlipSeenPeriod = null; });
        }
        await drv.page.evaluate((setQ) => {
            eval(setQ)(1);
            const s = RB.engineState();
            // NOTE: this 0-0 does NOT stick, and must not be relied on. The score
            // floor ratchets each side upward and only re-arms out of match — its
            // own comment says a wipe to 0-0 is precisely the attack it exists to
            // stop. So scores across these legs are MONOTONIC by construction (see
            // toPeriod5 callers below); this write just clears anything below the
            // running high-water mark.
            s.setUserScore(0); s.setOpponentScore(0);
            s.engineMinutesLeft = 1; s.engineSecondsLeft = 0; s.engineTickAllowance = 0;
            window._rb2p_gameOverReported = false;
        }, SET_Q);
        await sleep(900);   // the q<=1 branch clears inOvertime + all OT evidence
    };
    // Drive the engine to period 5 with a given score, with/without OT evidence.
    const toPeriod5 = async (us, them, evidence) => {
        // Set the SAME decided score on the opponent too. Both pages are live in
        // one Firebase room, so the opponent's live mirror keeps pushing its own
        // scores across — and a momentary 0-0 read on this device looks like a
        // regulation TIE, which legitimately arms overtime and made this leg
        // fail about one run in three. A real decided regulation end has both
        // boards agreeing, so mirror it here too.
        await wtr.page.evaluate((u, t) => {
            const s = RB.engineState();
            s.setUserScore(t); s.setOpponentScore(u);
        }, us, them);
        await drv.page.evaluate((setQ, u, t, ev) => {
            const s = RB.engineState();
            s.setUserScore(u); s.setOpponentScore(t);
            if (ev === 'poss') sessionStorage.setItem('rb2p_otPoss', JSON.stringify({ q: 5, my: 1, opp: 0 }));
            else { try { sessionStorage.removeItem('rb2p_otPoss'); } catch (e) {} }
            window._rb2p_otFlipSeenPeriod = null;
            window._rb2p_otKickoffAppliedPeriod = null;
            eval(setQ)(5);
        }, SET_Q, us, them, evidence);
        await sleep(2500);   // the OT loop and the FINAL detector both run at 300ms
    };

    // ORDER MATTERS: the decided-score case runs FIRST. The tied case makes the
    // host seed a REAL coin flip at rooms/{code}/ot/p5, and once that record
    // exists the opponent device (which runs the same OT logic against its own
    // score view) can re-seed it too — so any later "no OT evidence" assertion
    // is fighting genuine evidence. Assert the clean case before any is created.
    await resetMatch();
    bridgeLog.length = 0;
    await toPeriod5(23, 0, 'none');
    let b = await st(drv.page);
    check('B1 q=5 with a DECIDED score and no OT evidence does NOT arm overtime',
          b.inOt === false, 'inOvertime=' + b.inOt + ' score ' + b.us + '-' + b.them);
    check('B1 the bridge named it as end-of-regulation',
          bridgeLog.some(l => l.indexOf('NOT overtime') >= 0),
          bridgeLog.filter(l => l.indexOf('[2P OT]') === 0).join(' | ') || '(no OT log)');
    // With OT disarmed the FINAL detector is no longer short-circuited.
    await sleep(4000);
    b = await st(drv.page);
    check('B1 the FINAL detector was free to end the 23-0 game',
          b.over === true || bridgeLog.some(l => l.indexOf('[2P FINAL]') === 0),
          'gameOverReported=' + b.over + ' logs=' +
          (bridgeLog.filter(l => l.indexOf('FINAL') >= 0).join(' | ') || 'none'));

    await resetMatch();
    await toPeriod5(27, 21, 'poss');
    b = await st(drv.page);
    check('B2 q=5 unlevel WITH persisted OT counters still arms (mid-OT reload)',
          b.inOt === true, 'inOvertime=' + b.inOt + ' score ' + b.us + '-' + b.them);

    // The tie must sit AT OR ABOVE the running high-water mark (27-21 from B2).
    // This leg used to ask for 21-21; the score floor refused to lower 27 to 21,
    // so the board read 27-21, the game was never tied, and overtime correctly
    // did not arm — the assertion was failing on a precondition that never
    // existed rather than on the behaviour it names. 27-27 is the same tie, and
    // one the ratchet allows.
    await resetMatch();
    await toPeriod5(27, 27, 'none');
    b = await st(drv.page);
    check('B3 q=5 while TIED arms overtime', b.inOt === true,
          'inOvertime=' + b.inOt + ' score ' + b.us + '-' + b.them);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
