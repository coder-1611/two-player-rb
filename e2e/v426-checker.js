// e2e/v426-checker.js — the freeze detector, re-checked against real games (the detector audit of 2026-09-30:
// the checker counted about 2 of every 3 real freezes). Pure Node (no browser).
//
//   K1  a silence is judged by how it ENDS: a page that just writes again was on screen (counted); one that comes
//       back with a reload was gone (not counted). The old rule called every 20s silence "gone" — 1,051 healthy ones
//   K2  "FB-CONN OFFLINE" no longer hides a freeze: since V364 a phone with its socket down plays on over REST (CZFL)
//   K3  a stuck state reported after the monitor's grace ("empty field 9s") counts from when it began — once, and
//       never back past the phone's previous report (DAXK, KHIX: players who reloaded at 10-15s were never counted)
//   K4  the clock offset is taken per moment (samples within an hour), not per room: a sample from the next day
//       no longer moves the whole game (UVXN)
//   K5  a phone that reopens the room after the stats screen and is put into a match alone is R-REOPEN, not a frozen
//       game (EQXQ); a real rematch (both phones play) is still checked as a game
//   K6  the hang watchdog's own sleep ("kind: sleep") is a device asleep, not a hang
//   K7  the real rooms (when this Mac's archive is present): CZFL, NERM, NGKD, WNPB, DAXK, FGXJ counted as they
//       read on their timelines; FQHW, RPLB, VVVS, PCBC, LBZF stay clean; EQXQ and EXYT are R-REOPEN
const fs = require('fs');
const path = require('path');
const R = require('../tools/audit-rules.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const T0 = 1790000000000;
const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
const base = () => [mk('a', 0, 'bind', { ver: 'V426' }), mk('b', 0, 'bind', { ver: 'V426' })];
const sorted = tl => tl.sort((x, y) => x.t - y.t);

console.log('=== V426 CHECKER ===');
// ---- K1 ----
{
    // both waiting from 1s; b writes nothing for 25s, then writes again (a plain stage line) and a snaps at 27s
    const quiet = sorted(base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
        mk('a', 6000, 'stage', { wait: true }), mk('a', 12000, 'stage', { wait: true }), mk('a', 18000, 'stage', { wait: true }), mk('a', 24000, 'stage', { wait: true }),
        mk('b', 26000, 'stage', { wait: true }), mk('a', 26500, 'act', { must: true, can: true, why: '' }), mk('a', 27000, 'snap', { q: 1, clk: 100, d: 1, y: -20 })]));
    const rq = R.audit(quiet, {});
    // the same, but b's stream comes back with a reload: b was gone, nobody was frozen
    const gone = sorted(base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
        mk('a', 6000, 'stage', { wait: true }), mk('a', 12000, 'stage', { wait: true }), mk('a', 18000, 'stage', { wait: true }), mk('a', 24000, 'stage', { wait: true }),
        mk('b', 26000, 'diag', { m: 'boot' }), mk('b', 26500, 'bind', { ver: 'V426' }), mk('a', 26500, 'act', { must: true, can: true, why: '' }), mk('a', 27000, 'snap', { q: 1, clk: 100, d: 1, y: -20 })]));
    const rg = R.audit(gone, {});
    check('K1 a 25s silence that ends with a plain write was on screen (counted); one that ends with a reload was gone (not)',
          rq.frozen.sec >= 24 && rq.frozen.intervals.some(x => x.why === 'both waiting' && x.kind === 'temporary') && rg.frozen.sec === 0,
          JSON.stringify({ quiet: rq.frozen.sec, gone: rg.frozen.sec }));
}
// ---- K2 ----
{
    const tl = sorted(base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
        mk('a', 3000, 'diag', { m: 'FB-CONN OFFLINE' })]));
    for (let t = 5000; t <= 30000; t += 5000) tl.push(mk('a', t, 'stage', { wait: true }), mk('b', t, 'stage', { wait: true }));
    tl.push(mk('a', 31000, 'act', { must: true, can: true, why: '' }), mk('a', 32000, 'snap', { q: 1, clk: 100, d: 1, y: -20 }));
    const r = R.audit(sorted(tl), {});
    check('K2 a socket that dropped (FB-CONN OFFLINE) does not hide 30s of both phones waiting', r.frozen.sec >= 29, JSON.stringify(r.frozen.intervals));
}
// ---- K3 ----
{
    const tl = sorted(base().concat([mk('a', 500, 'act', { must: false, can: true, why: '' }), mk('b', 500, 'act', { must: true, can: true, why: '' }),
        mk('b', 10000, 'act', { must: true, can: false, why: 'empty field 9s' }),
        mk('b', 12000, 'vis', { h: true }), mk('b', 12500, 'vis', { h: false }),                // a glance away and back: the same stall, not a second one
        mk('b', 13000, 'act', { must: true, can: true, why: '' }), mk('b', 13500, 'snap', { q: 1, clk: 100, d: 1, y: -20 })]));
    for (let t = 2000; t <= 13000; t += 2000) tl.push(mk('a', t, 'stage', { wait: true }), mk('b', t, 'stage', { wait: false }));
    const r = R.audit(sorted(tl), {});
    const iv = r.frozen.intervals.filter(x => x.role === 'b' && x.why === 'empty field');
    // b was stuck from 1s (10s - its 9s grace) to 12s (hidden): 11s, counted once; the 0.5s after it came back is no second freeze
    check('K3 "empty field 9s" counts from 9s before the report — once — and never before the previous report',
          iv.length === 1 && iv[0].from === T0 + 1000 && iv[0].kind === 'temporary' && r.frozen.sec === 11, JSON.stringify(r.frozen.intervals));
}
// ---- K4 ----
{
    const stream = (samples, uid) => {
        const s = {}; let i = 0;
        const put = (t, e) => { s[t + '_' + ('00000' + (i++)).slice(-6)] = Object.assign({ t }, e); };
        put(T0, { k: 'bind', uid });
        for (const [dt, o] of samples) put(T0 + dt, { k: 'sync', srv: T0 + dt + o });
        put(T0 + 50000, { k: 'diag', m: 'marker' });
        return s;
    };
    // a: 400ms during the game; the same tab reopened 20 hours later reads -11000 (the device clock was corrected overnight)
    const tl = R.toTimeline({ a: stream([[1000, 400], [30000, 650], [20 * 3600000, -11000]], 'u1'), b: stream([[1000, 300]], 'u2') });
    const ma = tl.find(e => e.role === 'a' && e.m === 'marker');
    const late = tl.find(e => e.role === 'a' && e.k === 'sync' && e.srv === T0 + 20 * 3600000 - 11000);
    check('K4 a sample from the next day does not move the game: the game\'s entries keep the game\'s offset (400ms), the late ones their own',
          ma.t === T0 + 50000 + 400 && late && late.t === T0 + 20 * 3600000 - 11000, JSON.stringify({ marker: ma.t - T0 - 50000, late: late && late.t - T0 - 20 * 3600000 }));
}
// ---- K5 ----
{
    const game1 = base().concat([mk('a', 100, 'game', { ver: 'V426' }), mk('b', 200, 'game', { ver: 'V426' }),
        mk('a', 1000, 'act', { must: true, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
        mk('a', 2000, 'snap', { q: 1, clk: 100, d: 1, y: -20 }), mk('b', 60000, 'snap', { q: 4, clk: 5, d: 1, y: -20 }),
        mk('a', 90000, 'final', { su: 7, so: 3 }), mk('b', 90000, 'final', { su: 3, so: 7 })]);
    // a reloads 20s after the stats screen and is put into a match alone; it sits stuck 60s, b is on its stats screen
    const lone = game1.concat([mk('a', 110000, 'diag', { m: 'boot' }), mk('a', 111000, 'bind', { ver: 'V426' }), mk('a', 111000, 'game', { ver: 'V426' }),
        mk('a', 111000, 'diag', { m: 'TURN-> a (match-start)' }), mk('a', 112000, 'act', { must: true, can: false, why: 'resume did not re-enter the match' })]);
    for (let t = 115000; t <= 175000; t += 5000) lone.push(mk('a', t, 'stage', { wait: false }), mk('b', t, 'stage', { wait: true }));
    const rl = R.audit(sorted(lone), {});
    // a real rematch: both phones start it and both play; b gets stuck 30s: still a frozen game
    const rem = game1.concat([mk('a', 120000, 'game', { ver: 'V426' }), mk('b', 121000, 'game', { ver: 'V426' }),
        mk('a', 122000, 'act', { must: true, can: true, why: '' }), mk('a', 123000, 'snap', { q: 1, clk: 100, d: 1, y: -20 }),
        mk('b', 130000, 'snap', { q: 1, clk: 80, d: 1, y: -20 }), mk('b', 131000, 'act', { must: true, can: false, why: 'empty field' })]);
    for (let t = 132000; t <= 165000; t += 5000) rem.push(mk('a', t, 'stage', { wait: true }), mk('b', t, 'stage', { wait: false }));
    const rr = R.audit(sorted(rem), {});
    check('K5 a lone reopen after the final is R-REOPEN, not a frozen game; a real rematch\'s stall still counts',
          // (V428: R-REOPEN is impact 0 — the game record is untouched; the 6 pm sweep lists it by name)
          rl.frozen.sec === 0 && rl.flags.some(f => f.rule === 'R-REOPEN' && f.impact === 0) && !rl.flags.some(f => f.rule === 'R-FREEZE') &&
          rr.frozen.sec >= 30 && !rr.flags.some(f => f.rule === 'R-REOPEN'),
          JSON.stringify({ lone: rl.frozen.sec, loneRules: rl.flags.map(f => f.rule), rematch: rr.frozen.sec }));
}
// ---- K6 ----
{
    const tl = sorted(base().concat([mk('a', 1000, 'stall', { ms: 40000, vis: 'V', kind: 'sleep' }), mk('b', 2000, 'stall', { ms: 12000, vis: 'V' })]));
    const r = R.audit(tl, {});
    const ha = r.flags.filter(f => f.rule === 'R-HANG');
    check('K6 the watchdog asleep too (kind sleep) is a device asleep (impact 0); an awake watchdog\'s stall on screen is a HANG (impact 3)',
          ha.some(f => /^device asleep 40s on a/.test(f.msg) && f.impact === 0) && ha.some(f => /^HANG: b/.test(f.msg) && f.impact === 3), JSON.stringify(ha.map(f => [f.msg, f.impact])));
}
// ---- K7 ----
{
    const dir = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/Projects/two-player-rb/audits';
    const rooms = ['CZFL', 'NERM', 'NGKD', 'WNPB', 'DAXK', 'FGXJ', 'FQHW', 'RPLB', 'VVVS', 'PCBC', 'LBZF', 'EQXQ', 'EXYT', 'UVXN'];
    if (!rooms.every(c => fs.existsSync(path.join(dir, c + '.json')))) console.log('  SKIP  K7 (the archive of real rooms is not on this machine)');
    else {
        const got = {};
        for (const c of rooms) {
            const j = JSON.parse(fs.readFileSync(path.join(dir, c + '.json'), 'utf8'));
            got[c] = R.audit(R.realign(j.timeline).slice().sort((a, b) => a.t - b.t), {});
        }
        const ivs = c => got[c].frozen.intervals.filter(x => x.kind);
        const has = (c, why, minS, kind) => ivs(c).some(x => x.why === why && x.ms >= minS * 1000 && (!kind || x.kind === kind));
        // V430: CZFL and NERM were read on their timelines (the 2026-10-01 investigation) — CZFL's receiver had NO
        // network at all (a laptop just out of a 22-minute sleep: both transports dead), NERM's sender slept inside the
        // 4 s hand-off hold (ENGINE LOOP DEAD kicks=7 after 15 minutes). Neither is the game freezing a present player:
        // V430's checker no longer counts them (e2e/v430-checker.js C5, C6, C7a). The expectations follow.
        check('K7a CZFL: the receiver had no network (V430) — not counted', got.CZFL.frozen.sec === 0, JSON.stringify(ivs('CZFL')));
        check('K7b NERM: the sender slept inside the hold (V430) — not counted', got.NERM.frozen.sec === 0, JSON.stringify(ivs('NERM')));
        check('K7c NGKD: both parked with no decision ~55s (silences that ended in plain writes no longer cut it to 24s)', has('NGKD', 'both parked, no decision', 50));
        check('K7d WNPB: b parked with no decision 62s on screen, one freeze (not 20s + 22s)', has('WNPB', 'both parked, no decision', 60));
        check('K7e DAXK: b\'s empty field from when it began (14.5s), counted once', has('DAXK', 'empty field', 14) && ivs('DAXK').filter(x => x.why === 'empty field').length === 1);
        check('K7f FGXJ: the overtime kickoff stuck behind "the scorer owes a PAT" 11s', has('FGXJ', 'empty field', 10, 'temporary'));
        const clean = ['FQHW', 'RPLB', 'VVVS', 'PCBC', 'LBZF'];
        check('K7g the clean rooms stay clean: ' + clean.join(', '), clean.every(c => got[c].frozen.sec === 0), JSON.stringify(clean.map(c => c + ':' + got[c].frozen.sec)));
        check('K7h UVXN stays a temporary freeze (11s)', got.UVXN.frozen.sec > 0 && got.UVXN.frozen.permanent.n === 0, JSON.stringify(got.UVXN.frozen.intervals.filter(x => x.kind)));
        check('K7i EQXQ and EXYT: a phone put into a match alone after the final is R-REOPEN', ['EQXQ', 'EXYT'].every(c => got[c].flags.some(f => f.rule === 'R-REOPEN')));
    }
}
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
