// e2e/v428-records.js — a complete game stays a complete game in the records (UZGV, 2026-10-01: Shivom vs soham,
// 49ers 30-0, played to the stats screen, missing from the transcripts and marked UNFINISHED). Pure Node.
//
//   M1  a room's "complete" is its last REAL game's: a phone put into a match alone after the final (R-REOPEN) does
//       not turn a complete game into an unfinished one (24 archived rooms were marked wrong, UZGV among them)
//   M2  UZGV itself (when this Mac's archive is present): complete, one real game
//   M3  the transcripts page hides a room as a test only by its code (harness codes carry a digit) or harness
//       players' names — not because the room has no team names in outcomes (37 real rooms were hidden, UZGV among them)
const fs = require('fs');
const path = require('path');
const R = require('../tools/audit-rules.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const T0 = 1790000000000;
const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});

console.log('=== V428 RECORDS ===');
// ---- M1 ----
{
    const tl = [mk('a', 0, 'bind', { ver: 'V428' }), mk('b', 0, 'bind', { ver: 'V428' }), mk('a', 100, 'game', { ver: 'V428' }), mk('b', 200, 'game', { ver: 'V428' }),
                mk('a', 2000, 'snap', { q: 1, clk: 120, d: 1, y: -20 }), mk('b', 60000, 'snap', { q: 4, clk: 5, d: 1, y: -20 }),
                mk('a', 80000, 'q', { from: 4, to: 5 }), mk('b', 80000, 'q', { from: 4, to: 5 }),
                mk('a', 85000, 'final', { su: 0, so: 30 }), mk('b', 85000, 'final', { su: 30, so: 0 }),
                // a reloads 16s later and is put into a match alone (UZGV)
                mk('a', 101000, 'diag', { m: 'boot' }), mk('a', 102000, 'bind', { ver: 'V428' }), mk('a', 102000, 'game', { ver: 'V428' }),
                mk('a', 102000, 'diag', { m: 'TURN-> a (match-start)' }), mk('a', 103000, 'act', { must: true, can: true, why: '' })];
    const res = R.audit(tl.sort((x, y) => x.t - y.t), {});
    const alone = tl.filter(e => !(e.t > T0 + 100000));
    const base = R.audit(alone.slice().sort((x, y) => x.t - y.t), {});
    check('M1 a lone reopen after the final does not turn the room\'s complete game into an unfinished one',
          base.complete && base.complete.complete === true && res.complete && res.complete.complete === true && res.realGames === 1 && res.flags.some(f => f.rule === 'R-REOPEN'),
          JSON.stringify({ base: base.complete, withReopen: res.complete, realGames: res.realGames, rules: res.flags.map(f => f.rule) }));
}
// ---- M2 ----
{
    const dir = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/rb2p/two-player-rb/audits';
    const f = path.join(dir, 'UZGV.json');
    if (!fs.existsSync(f)) console.log('  SKIP  M2 (the archive of real rooms is not on this machine)');
    else {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        const res = R.audit(R.realign(j.timeline).slice().sort((a, b) => a.t - b.t), {});
        check('M2 UZGV (Shivom vs soham, 30-0 at the stats screen) is complete, with one real game', res.complete && res.complete.complete === true && res.realGames === 1,
              JSON.stringify({ complete: res.complete, games: res.games, realGames: res.realGames }));
    }
}
// ---- M3 ----
{
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'game-transcripts', 'index.html'), 'utf8');
    const a = /const realName = [^\n]*\n/.exec(html), b = /const isTestRoom = [^\n]*\n/.exec(html);
    let isTestRoom = null;
    try { isTestRoom = a && b ? new Function(a[0] + b[0] + 'return isTestRoom;')() : null; } catch (e) {}
    if (!isTestRoom) check('M3 the transcripts page has its test-room rule', false);
    else {
        const P = { a: 'Phone A', b: 'Phone B' };
        const cases = [
            [{ code: 'UZGV', team: P, who: { a: 'Shivom', b: 'soham' } }, false],          // outcomes wiped, real players
            [{ code: 'ABCD', team: { a: 'San Francisco', b: 'Philadelphia' }, who: null }, false],
            [{ code: 'Z3QK', team: { a: 'San Francisco', b: 'Philadelphia' }, who: { a: 'Bot A', b: 'Bot B' } }, true],   // a harness code
            [{ code: 'ZNAM', team: P, who: { a: 'Harness', b: 'Bot B' } }, true],             // harness players, no outcomes
            [{ code: 'QWER', team: P, who: { a: '?', b: '?' } }, true]];
        const got = cases.map(([r, want]) => isTestRoom(r) === want);
        check('M3 a room is hidden as a test by its code or harness players, never because its outcomes are missing', got.every(Boolean), JSON.stringify(got));
    }
}
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
