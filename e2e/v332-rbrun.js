// e2e/v332-rbrun.js — TWO-TAB end-to-end: an RB run on the offense tab must name
// that RB, with his yards, on the OTHER tab's wait screen.
//
// This is the exact flow the device kept failing ("RB runs don't get shown"):
// two real Firebase pages, the offense runs the ball, and the waiting player's
// WAIT-screen commentary should read "<RB>  ·  N YDS RUN". The headless bot can't
// develop a play via canvas input, so the offense side drives the REAL engine
// state a handoff produces — steps obj_ball through its live-play _kp sequence,
// credits the ball carrier's rush stats, and moves the scrimmage — then lets the
// bridge's OWN observer classify + push it. Nothing about the feed path is
// stubbed: A's observer runs, A pushes to rooms/{code}/feed/a over real Firebase,
// B's listener renders it.
//
// T1  the offense resolves a real RB run (the RB is the credited carrier)
// T2  the offense PUSHES a RUN feed named for the RB, with the yards
// T3  the DEFENSE wait screen names the RB
// T4  the DEFENSE wait screen shows the yards + "RUN"
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Drive a REAL play on the offense page and let the bridge observer handle it.
// opts: { type:'run'|'pass', gain, stepMs, kpseq } — steps obj_ball through the
// given _kp sequence (default a full 0,1,2,5,4), credits the right stat, and
// moves the scrimmage. stepMs tightens the timing to stress the 16ms observer.
async function drivePlay(page, opts) {
    return page.evaluate(async (o) => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ball = null; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        var m = RB.engineState().rawEngineMatch;
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var n = _wi(to._Ln), rbP = null, rbName = '', qbP = null, wrP = null, wrName = '';
        for (var j = 0; j < n; j++) {
            var p = _zi(to._Ln, j); if (!p) continue;
            var pos = Number(_Ai(p, 'position'));
            if (pos === 2 && !rbP) { rbP = p; rbName = String(_Ai(p, 'lname') || '').toUpperCase(); }
            if (pos === 1 && !qbP) qbP = p;
            if ((pos === 3 || pos === 4) && !wrP) { wrP = p; wrName = String(_Ai(p, 'lname') || '').toUpperCase(); }
        }
        if (!ball || !rbP || !qbP) return { err: 'roster missing', hasBall: !!ball };
        window._rb2p_userIsWaitingForOpponent = false;
        var y0 = Number(m._6F), d0 = Number(m._t11), stepMs = o.stepMs || 80;
        var seq = o.kpseq || [0, 1, 2, 5, 4];
        async function step(k) { ball._kp = k; await new Promise(r => setTimeout(r, stepMs)); }
        // Walk the pre-resolution states.
        for (var s = 0; s < seq.length - 1; s++) await step(seq[s]);
        // Credit the play just before the final (resolving) state.
        if (o.type === 'run') {
            _Yi(rbP, 'stat_rush_attempts', (Number(_Ai(rbP, 'stat_rush_attempts')) || 0) + 1);
            _Yi(rbP, 'stat_rush_yards', (Number(_Ai(rbP, 'stat_rush_yards')) || 0) + o.gain);
        } else {
            _Yi(qbP, 'stat_yards', (Number(_Ai(qbP, 'stat_yards')) || 0) + o.gain);   // QB passing
            if (wrP) _Yi(wrP, 'stat_yards', (Number(_Ai(wrP, 'stat_yards')) || 0) + o.gain);  // receiver
        }
        m._6F = y0 + o.gain; m._t11 = d0 + 1;
        await step(seq[seq.length - 1]);                // resolve -> settle + push
        await new Promise(r => setTimeout(r, 250));
        ball._kp = 0;
        return { rbName: rbName, wrName: wrName, yds: o.gain };
    }, opts);
}
function driveRbRun(page, gain) { return drivePlay(page, { type: 'run', gain: gain }); }

(async () => {
    console.log('=== V332 TWO-TAB RB-RUN COMMENTARY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);

    // Whichever page is on offense drives the run; the other is the defense we inspect.
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const def = aWait ? g.a : g.b;
    console.log('  offense = role ' + off.role + ', defense = role ' + def.role);

    // The defense must be on the WAIT cover for the commentary to paint.
    await def.page.evaluate(() => { const w = document.getElementById('rb-waiting'); if (w) w.style.display = 'flex'; });

    // ---- T1: drive the RB run ----
    const run = await driveRbRun(off.page, 7);
    console.log('  drove RB run: ' + JSON.stringify(run));
    check('T1 the offense resolved a real RB run (RB is the credited carrier)',
          run && !run.err && !!run.rbName, JSON.stringify(run));

    // ---- T2: the offense pushed a RUN feed named for the RB ----
    await sleep(700);
    const feed = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    console.log('  feed/' + off.role + ' = ' + JSON.stringify(feed));
    check('T2 the offense pushed a RUN feed named for the RB, with the yards',
          feed && feed.k === 'run' && feed.rb === run.rbName && Number(feed.yds) === 7,
          JSON.stringify(feed));

    // ---- T3/T4: the defense wait screen shows it ----
    await sleep(500);
    const head = await def.page.evaluate(() => ((document.getElementById('rb-wait-headline') || {}).textContent || ''));
    console.log('  DEFENSE headline = "' + head + '"');
    check('T3 the DEFENSE wait screen names the RB',
          !!run.rbName && head.indexOf(run.rbName) >= 0, 'headline="' + head + '"');
    check('T4 the DEFENSE wait screen shows the yards + RUN',
          /7\s*YDS?/.test(head) && /RUN/.test(head), 'headline="' + head + '"');

    // ---- T5: an RB run RIGHT AFTER a pass, tight timing — the real "blank"
    // scenario (the snap re-arm must fire between plays or the run is dropped). ----
    await drivePlay(off.page, { type: 'pass', gain: 11, stepMs: 45 });
    await sleep(200);
    const run2 = await drivePlay(off.page, { type: 'run', gain: 4, stepMs: 45 });
    await sleep(700);
    const feed2 = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    const head2 = await def.page.evaluate(() => ((document.getElementById('rb-wait-headline') || {}).textContent || ''));
    console.log('  after pass->run(tight): feed=' + JSON.stringify(feed2) + '  headline="' + head2 + '"');
    check('T5 an RB run right after a pass still pushes a run for the RB (not dropped)',
          feed2 && feed2.k === 'run' && feed2.rb === run2.rbName && Number(feed2.yds) === 4,
          JSON.stringify(feed2));
    check('T5 the DEFENSE names that RB after the pass->run sequence',
          head2.indexOf(run2.rbName) >= 0 && /RUN/.test(head2), 'headline="' + head2 + '"');
    if (process.env.DBG) {
        const dl = await off.page.evaluate(() => { try { return window._rb2p_readDiagLog(); } catch (e) { return []; } });
        console.log('  [DBG T5 offense log]\n    ' + dl.slice(-8).join('\n    '));
    }

    // ---- T6: a FAST RB run that skips the received (5) state (0,1,2,4) — a
    // quick handoff the 16ms observer must still classify + emit. ----
    const run3 = await drivePlay(off.page, { type: 'run', gain: 9, stepMs: 35, kpseq: [0, 1, 2, 4] });
    await sleep(700);
    const feed3 = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    const head3 = await def.page.evaluate(() => ((document.getElementById('rb-wait-headline') || {}).textContent || ''));
    console.log('  fast run(no-5): feed=' + JSON.stringify(feed3) + '  headline="' + head3 + '"');
    check('T6 a fast RB run (skips the received state) still pushes a run for the RB',
          feed3 && feed3.k === 'run' && feed3.rb === run3.rbName && Number(feed3.yds) === 9,
          JSON.stringify(feed3));
    check('T6 the DEFENSE names that RB on the fast run',
          head3.indexOf(run3.rbName) >= 0 && /RUN/.test(head3), 'headline="' + head3 + '"');

    // ---- T7: the PATHOLOGICAL case — the observer sees only dead->tackle
    // (0,4), MISSING the snap frame, so the per-play baseline is never latched.
    // This is the most likely real "dropped/blank RB run" on a busy/fast device.
    // First run a clean pass so the prior-play state is a pass (a realistic lead-in).
    await drivePlay(off.page, { type: 'pass', gain: 5, stepMs: 60 });
    await sleep(300);
    const run4 = await drivePlay(off.page, { type: 'run', gain: 6, stepMs: 90, kpseq: [0, 4] });
    await sleep(700);
    const feed4 = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
    const head4 = await def.page.evaluate(() => ((document.getElementById('rb-wait-headline') || {}).textContent || ''));
    console.log('  MISSED-SNAP run(0,4): feed=' + JSON.stringify(feed4) + '  headline="' + head4 + '"');
    check('T7 an RB run whose snap frame was missed still names the RB (not blank/QB)',
          feed4 && feed4.k === 'run' && feed4.rb === run4.rbName,
          JSON.stringify(feed4));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
