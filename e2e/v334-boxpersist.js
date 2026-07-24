// e2e/v334-boxpersist.js — DEQC R1: the FULL box score persists to Firebase on
// EVERY play resolution, and a published count can never go DOWN.
//
// Room DEQC lost stats to desync/refresh/engine-death because the box record
// was only written at stable snap boundaries. Now the observer's settle
// publishes the full per-player raw stats after every play, and the write is a
// RATCHET: each stat published is the max ever seen this match, so a
// post-refresh zeroed roster (or any late lower write) can never shrink it.
//
// T1  an RB run publishes rooms/{code}/box/{role} with the carry + yards
// T2  a following pass publishes again (per-play cadence, seq advances)
// T3  MONOTONIC: zeroing the roster + forcing a publish cannot shrink the record
// T4  the published record carries no non-QB pass completions (the V333 sweep
//     runs before every publish)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Same engine-driving technique as e2e/v332-rbrun.js: step obj_ball through its
// live _kp sequence, credit the right stat, move the scrimmage, let the
// bridge's OWN observer settle + publish.
async function drivePlay(page, opts) {
    return page.evaluate(async (o) => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var ball = null; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { ball = x; break; } }
        var m = RB.engineState().rawEngineMatch;
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var n = _wi(to._Ln), rbP = null, rbIdx = -1, qbP = null, qbIdx = -1, wrP = null, wrIdx = -1;
        for (var j = 0; j < n; j++) {
            var p = _zi(to._Ln, j); if (!p) continue;
            var pos = Number(_Ai(p, 'position'));
            if (pos === 2 && !rbP) { rbP = p; rbIdx = j; }
            if (pos === 1 && !qbP) { qbP = p; qbIdx = j; }
            if ((pos === 3 || pos === 4) && !wrP) { wrP = p; wrIdx = j; }
        }
        if (!ball || !rbP || !qbP) return { err: 'roster missing', hasBall: !!ball };
        window._rb2p_userIsWaitingForOpponent = false;
        var y0 = Number(m._6F), d0 = Number(m._t11), stepMs = o.stepMs || 80;
        var seq = o.kpseq || [0, 1, 2, 5, 4];
        async function step(k) { ball._kp = k; await new Promise(r => setTimeout(r, stepMs)); }
        for (var s = 0; s < seq.length - 1; s++) await step(seq[s]);
        if (o.type === 'run') {
            _Yi(rbP, 'stat_rush_attempts', (Number(_Ai(rbP, 'stat_rush_attempts')) || 0) + 1);
            _Yi(rbP, 'stat_rush_yards', (Number(_Ai(rbP, 'stat_rush_yards')) || 0) + o.gain);
        } else {
            _Yi(qbP, 'stat_yards', (Number(_Ai(qbP, 'stat_yards')) || 0) + o.gain);
            if (wrP) _Yi(wrP, 'stat_yards', (Number(_Ai(wrP, 'stat_yards')) || 0) + o.gain);
        }
        m._6F = y0 + o.gain; m._t11 = d0 + 1;
        await step(seq[seq.length - 1]);
        await new Promise(r => setTimeout(r, 250));
        ball._kp = 0;
        return { rbIdx: rbIdx, qbIdx: qbIdx, wrIdx: wrIdx, yds: o.gain };
    }, opts);
}
function entry(box, idx) {
    if (!box || !box.stats) return null;
    for (var i = 0; i < box.stats.length; i++) if (box.stats[i].i === idx) return box.stats[i].st;
    return null;
}

(async () => {
    console.log('=== V334 PER-PLAY BOX-SCORE PERSISTENCE ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    console.log('  offense = role ' + off.role);

    // ---- T1: an RB run lands in rooms/{code}/box/{role} ----
    const run = await drivePlay(off.page, { type: 'run', gain: 7 });
    console.log('  drove run: ' + JSON.stringify(run));
    await sleep(1500);
    const box1 = await TP.fbGet('rooms/' + g.code + '/box/' + off.role);
    const rb1 = entry(box1, run.rbIdx);
    console.log('  box after run: n=' + (box1 && box1.n) + ' rb=' + JSON.stringify(rb1));
    check('T1 the RB run was published (carry + yards in box/{role})',
          rb1 && Number(rb1.stat_rush_attempts) >= 1 && Number(rb1.stat_rush_yards) >= 7,
          JSON.stringify(rb1));

    // ---- T2: the next play publishes again ----
    const p2 = await drivePlay(off.page, { type: 'pass', gain: 12 });
    await sleep(1500);
    const box2 = await TP.fbGet('rooms/' + g.code + '/box/' + off.role);
    const qb2 = entry(box2, p2.qbIdx);
    console.log('  box after pass: n=' + (box2 && box2.n) + ' qb=' + JSON.stringify(qb2));
    check('T2 the pass was published on its own play (per-play cadence)',
          qb2 && Number(qb2.stat_yards) >= 12 &&
          Number(box2.n) > Number(box1.n),
          'qb=' + JSON.stringify(qb2) + ' n ' + (box1 && box1.n) + ' -> ' + (box2 && box2.n));

    // ---- T3: MONOTONIC — a zeroed roster cannot shrink the published record ----
    await off.page.evaluate((rbIdx) => {
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var p = _zi(to._Ln, rbIdx);
        _Yi(p, 'stat_rush_attempts', 0); _Yi(p, 'stat_rush_yards', 0);
        window._rb2p_publishBoxNow('test-zeroed');
    }, run.rbIdx);
    await sleep(1200);
    const box3 = await TP.fbGet('rooms/' + g.code + '/box/' + off.role);
    const rb3 = entry(box3, run.rbIdx);
    console.log('  box after zero+publish: rb=' + JSON.stringify(rb3));
    check('T3 the ratchet held — zeroed roster did not shrink the published stats',
          rb3 && Number(rb3.stat_rush_attempts) >= 1 && Number(rb3.stat_rush_yards) >= 7,
          JSON.stringify(rb3));

    // ---- T4: the publish is Bug-4 clean (no non-QB completions ever ship) ----
    await off.page.evaluate((wrIdx) => {
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var p = _zi(to._Ln, wrIdx);
        _Yi(p, 'stat_complete', 2); _Yi(p, 'stat_attempts', 1);
        window._rb2p_publishBoxNow('test-leak');
    }, p2.wrIdx);
    await sleep(1200);
    const box4 = await TP.fbGet('rooms/' + g.code + '/box/' + off.role);
    const wr4 = entry(box4, p2.wrIdx), qb4 = entry(box4, p2.qbIdx);
    console.log('  box after leak+publish: wr=' + JSON.stringify(wr4) + ' qb=' + JSON.stringify(qb4));
    check('T4 no non-QB completions in the published record; QB got them',
          (!wr4 || ((Number(wr4.stat_complete) || 0) === 0 && (Number(wr4.stat_attempts) || 0) === 0)) &&
          qb4 && Number(qb4.stat_complete) >= 2,
          'wr=' + JSON.stringify(wr4) + ' qb=' + JSON.stringify(qb4));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
