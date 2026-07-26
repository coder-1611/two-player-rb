// e2e/v333-boxscore.js — DEQC Bug 4: QB pass completions leaked onto a receiver.
//
// Room DEQC (V332) final box: team A showed PURDY 3/5 passing while a WR
// carried an impossible 2/1 (2 completions on 1 attempt); team B's QB had the
// same leak (a WR at 3/2). The engine credits a play's passing line to an
// "active player" index that is sometimes a non-QB, so the FINAL undercounted
// the QB (3 shown, ~5 real). stat_complete / stat_attempts are PASSER stats
// (field map, index.html ~9238) and there are no non-QB passes in Retro Bowl,
// so ANY completion/attempt found on a non-QB roster player belongs to the QB.
//
// T1  seeding QB 3/5 + WR 2/1 -> the FINAL QB line renders 5/6
// T2  after collect, the WR retains NO raw pass completions/attempts
// T3  the WR's receiving line is untouched (REC count + REC YDS intact)
// T4  collect is idempotent — a second collect still renders 5/6 (not 7/7)
// T5  the raw box publish (collectRawOffStats) carries no non-QB completions
const H = require('./harness');
const TP = require('./two-player');

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V333 QB PASSING-STAT RE-ATTRIBUTION ===');
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    console.log('  using the on-offense page = role ' + off.role);

    const res = await off.page.evaluate(() => {
        var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        if (!to || to._Ln == null) return { err: 'no roster' };
        var n = _wi(to._Ln), qbP = null, wrP = null, wrIdx = -1;
        for (var j = 0; j < n; j++) {
            var p = _zi(to._Ln, j); if (!p) continue;
            var pos = Number(_Ai(p, 'position'));
            if (pos === 1 && !qbP) qbP = p;
            if ((pos === 3 || pos === 4) && !wrP) { wrP = p; wrIdx = j; }
        }
        if (!qbP || !wrP) return { err: 'roster missing QB/WR' };
        // The exact DEQC shape: PURDY 3/5, a receiver carrying an impossible 2/1.
        _Yi(qbP, 'stat_complete', 3); _Yi(qbP, 'stat_attempts', 5); _Yi(qbP, 'stat_yards', 80);
        _Yi(wrP, 'stat_complete', 2); _Yi(wrP, 'stat_attempts', 1);
        _Yi(wrP, 'stat_yards', 45);  _Yi(wrP, 'stat_receive', 4);

        function nameOf(p) {
            var f = '', l = '';
            try { f = String(_Ai(p, 'fname') || ''); } catch (e) {}
            try { l = String(_Ai(p, 'lname') || ''); } catch (e) {}
            return (f ? f.charAt(0) + '. ' : '') + l;
        }
        var qbNm = nameOf(qbP), wrNm = nameOf(wrP);
        function lines() {
            var rep = window._rb2p_collectBoxScore();
            var qbLine = '', wrLine = '';
            for (var i = 0; i < rep.players.length; i++) {
                var pl = rep.players[i];
                if (pl.name === qbNm && !qbLine) qbLine = pl.line;
                if (pl.name === wrNm && !wrLine) wrLine = pl.line;
            }
            return { qbLine: qbLine, wrLine: wrLine };
        }
        var first = lines();
        var wrRawC = Number(_Ai(wrP, 'stat_complete')) || 0;
        var wrRawA = Number(_Ai(wrP, 'stat_attempts')) || 0;
        var wrRawY = Number(_Ai(wrP, 'stat_yards')) || 0;
        var second = lines();   // idempotency: re-collect must not double-move
        var raw = window._rb2p_collectRawOffStats();
        var rawWr = null;
        for (var r = 0; r < raw.length; r++) if (raw[r].i === wrIdx) rawWr = raw[r].st;
        return { qbLine1: first.qbLine, wrLine1: first.wrLine,
                 qbLine2: second.qbLine,
                 wrRawC: wrRawC, wrRawA: wrRawA, wrRawY: wrRawY,
                 rawWr: rawWr };
    });
    console.log('  result: ' + JSON.stringify(res));

    check('T1 the FINAL QB line renders 5/6 (leaked completions re-attributed)',
          res && !res.err && res.qbLine1 && res.qbLine1.indexOf('5/6') === 0,
          'qbLine="' + (res && res.qbLine1) + '"');
    check('T2 the WR retains no raw pass completions/attempts',
          res && res.wrRawC === 0 && res.wrRawA === 0,
          'wr stat_complete=' + (res && res.wrRawC) + ' stat_attempts=' + (res && res.wrRawA));
    // V352: catches now reconcile to completions, so the WR's REC count is
    // expected to move (here: to 5, matching the QB's re-attributed 5/6 — he is
    // the only receiver with receiving yardage). What V333 protects is the
    // receiving PRODUCTION: stat_yards must never be moved by the passing
    // re-attribution, and the receiving line must still be his.
    check('T3 the WR keeps his receiving yards, and his catches match the completions',
          res && res.wrRawY === 45 && res.wrLine1 &&
          res.wrLine1.indexOf('5 REC') >= 0 && res.wrLine1.indexOf('45 REC YDS') >= 0,
          'wrLine="' + (res && res.wrLine1) + '" wrRawY=' + (res && res.wrRawY));
    check('T4 a second collect still renders 5/6 (idempotent, not 7/7)',
          res && res.qbLine2 && res.qbLine2.indexOf('5/6') === 0,
          'qbLine2="' + (res && res.qbLine2) + '"');
    check('T5 the raw box publish carries no non-QB completions',
          res && (!res.rawWr || ((Number(res.rawWr.stat_complete) || 0) === 0 &&
                                 (Number(res.rawWr.stat_attempts) || 0) === 0)),
          'rawWr=' + JSON.stringify(res && res.rawWr));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
