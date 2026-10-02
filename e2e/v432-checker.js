// e2e/v432-checker.js — the freeze detector counts a hand-off PING-PONG (OPEN.md #2, V432). Pure Node (no browser).
//
// V430's "keep 0:00" bounced the ball between the phones at the Q1, Q2 and Q3 horns in 9 real rooms; the checker
// counted none of them (FOVL: CLEAN; JCPA: 11 bounces in 88 s, both players quit) — each phone was "live" for under
// 7 s at a time, so no stuck stretch ever reached 10 s.
//
//   P1  two bounces in a row (a phone sends the ball back with no snap since it took it) and nobody snaps again:
//       a PERMANENT freeze, from the first unplayed hand-off to a phone leaving the page
//   P2  a ping-pong the next snap ends is TEMPORARY, measured to that snap
//   P3  ONE bounce is not a freeze (GCPD, QNGB: one bounce, then the halftime law or a snap)
//   P4  the pick-six exchange (PICK6 -> the scorer's PAT_RESULT, a kicked try logs no snap) is not a bounce
//   P5  a glance away inside the ping-pong (screen off 1.6 s, no pagehide) does not split it (ONFE, TWYB)
//   P6  a hand-off re-sent with the same ts (a resume) is not another bounce
//   P7  the real rooms (when this Mac's archive is present): the 9 ping-pong rooms are counted once each, with the
//       right kind; BVTQ (a V414 pick-six exchange), GCPD and QNGB (one bounce) are not
//   P8  R-DOWN: a gain within the log's rounding of the line is the engine's call (NPXZ: 9.99 facing 10 = "2nd & 0.01",
//       44 such flags in 41 rooms were artifacts); a real wrong down (9.5 facing 10 left 1st & 10) is still flagged
const fs = require('fs');
const path = require('path');
const R = require('../tools/audit-rules.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const T0 = 1790000000000;
const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
const other = r => (r === 'a' ? 'b' : 'a');
const sorted = tl => tl.sort((x, y) => x.t - y.t);
const pp = r => (r.frozen.intervals || []).filter(iv => iv.kind && /ping-pong/.test(iv.why || ''));

// a game: a drives and its play runs out the clock; then `bounces` hand-offs go back and forth unplayed, 7 s apart
// (the real cadence: 4 s hold + the receiver's failed re-stage); opts.end = 'snap' | 'leave'
function game(bounces, opts) {
    opts = opts || {};
    const tl = [mk('a', 0, 'bind', { ver: 'V431' }), mk('b', 0, 'bind', { ver: 'V431' }),
                mk('a', 500, 'act', { must: true, can: true, why: '' }), mk('b', 500, 'act', { must: false, can: true, why: '' }),
                mk('a', 1000, 'snap', { q: 2, clk: 4, d: 1, y: -20 })];
    let t = 9000, from = 'a', ts = T0 + 9000;
    const send = (r, tt, type) => { tl.push(mk(r, tt, 'send', { type: type || 'OTHER', q: 2, clk: 0, ts: ts })); tl.push(mk(other(r), tt + 150, 'apply', { type: type || 'OTHER', ts: ts })); tl.push(mk(r, tt, 'act', { must: false, can: true, why: '' }), mk(other(r), tt + 300, 'act', { must: true, can: true, why: '' })); ts += 7000; };
    send('a', t);                                             // the real play's hand-off
    for (let i = 0; i < bounces; i++) {
        t += 7000; from = other(from);
        if (opts.glanceAt === i) tl.push(mk(from, t - 3000, 'vis', { h: true }), mk(from, t - 1400, 'vis', { h: false }));
        send(from, t, 'PUNT');
        if (opts.resendAt === i) { tl.push(mk(from, t + 2000, 'send', { type: 'PUNT', q: 2, clk: 0, ts: ts - 7000 })); }
    }
    const last = t;
    if (opts.end === 'snap') tl.push(mk(other(from), last + 5000, 'snap', { q: 3, clk: 120, d: 1, y: -25 }));
    else tl.push(mk('a', last + 5000, 'vis', { h: true, why: 'pagehide' }), mk('b', last + 5200, 'vis', { h: true, why: 'pagehide' }));
    tl.push(mk('a', last + 60000, 'stage', { wait: true }));  // an open tab writes on — the record ends much later
    return { r: R.audit(sorted(tl), {}), last, firstApply: T0 + 9150 };
}

console.log('=== V432 CHECKER (hand-off ping-pong) ===');
{
    const g = game(4, { end: 'leave' }), iv = pp(g.r);
    check('P1 four bounces, then both phones leave: ONE permanent freeze, from the first unplayed hand-off to the leave',
          iv.length === 1 && iv[0].kind === 'permanent' && iv[0].from === g.firstApply && Math.abs(iv[0].from + iv[0].ms - (T0 + g.last + 5000)) < 50 && g.r.impact.worst === 3,
          JSON.stringify(iv.map(x => ({ kind: x.kind, from: x.from - T0, ms: x.ms, why: x.why }))) + ' worst=' + (g.r.impact && g.r.impact.worst));
}
{
    const g = game(3, { end: 'snap' }), iv = pp(g.r);
    check('P2 a ping-pong the next snap ends is TEMPORARY, measured to that snap',
          iv.length === 1 && iv[0].kind === 'temporary' && Math.abs(iv[0].from + iv[0].ms - (T0 + g.last + 5000)) < 50,
          JSON.stringify(iv.map(x => ({ kind: x.kind, from: x.from - T0, ms: x.ms }))));
}
{
    const g = game(1, { end: 'snap' });
    check('P3 one bounce is not a freeze', pp(g.r).length === 0 && g.r.frozen.sec === 0, JSON.stringify(g.r.frozen.intervals));
}
{
    // a's pass is returned for a touchdown: a sends PICK6 (its own snap before), b plays its try (a kick — no snap) and
    // answers PAT_RESULT, a takes the kickoff and snaps; then b, again with no snap, would be ONE bounce at most
    const tl = [mk('a', 0, 'bind', { ver: 'V431' }), mk('b', 0, 'bind', { ver: 'V431' }), mk('a', 500, 'act', { must: true, can: true, why: '' }),
        mk('a', 1000, 'snap', { q: 1, clk: 90, d: 1, y: -20 }),
        mk('a', 8000, 'send', { type: 'PICK6', ts: 1 }), mk('b', 8150, 'apply', { type: 'PICK6', ts: 1 }),
        mk('b', 20000, 'send', { type: 'PAT_RESULT', ts: 2 }), mk('a', 20150, 'apply', { type: 'PAT_RESULT', ts: 2 }),
        mk('a', 30000, 'send', { type: 'PICK6', ts: 3 }), mk('b', 30150, 'apply', { type: 'PICK6', ts: 3 }),
        mk('b', 42000, 'send', { type: 'PAT_RESULT', ts: 4 }), mk('a', 42150, 'apply', { type: 'PAT_RESULT', ts: 4 }),
        mk('a', 50000, 'snap', { q: 1, clk: 80, d: 1, y: -25 })];
    const r = R.audit(sorted(tl), {});
    check('P4 the pick-six exchange (PICK6 -> PAT_RESULT, the try logs no snap) is not a ping-pong', pp(r).length === 0, JSON.stringify(r.frozen.intervals));
}
{
    const g = game(5, { end: 'leave', glanceAt: 2 }), iv = pp(g.r);
    check('P5 a glance away inside the ping-pong (screen off 1.6 s) does not split it — one freeze',
          iv.length === 1 && iv[0].from === g.firstApply, JSON.stringify(iv.map(x => ({ kind: x.kind, from: x.from - T0, ms: x.ms, why: x.why }))));
}
{
    const g = game(1, { end: 'snap', resendAt: 0 });
    check('P6 a hand-off re-sent with the same ts is not another bounce', pp(g.r).length === 0, JSON.stringify(g.r.frozen.intervals));
}
{
    const dir = '/Users/sohamsthitpragya/rb2p/two-player-rb/audits';
    if (!fs.existsSync(path.join(dir, 'FOVL.json'))) console.log('  SKIP  P7 (no archive on this machine)');
    else {
        const want = { ATAN: 'permanent', FOVL: 'permanent', JCPA: 'permanent', ONFE: 'permanent', HIHR: 'temporary', HNWX: 'temporary', PHCY: 'temporary', TWYB: 'temporary', WGVH: 'temporary', BVTQ: null, GCPD: null, QNGB: null };
        const got = {};
        for (const code of Object.keys(want)) {
            const f = path.join(dir, code + '.json');
            if (!fs.existsSync(f)) { got[code] = 'missing'; continue; }
            const tl = R.realign(JSON.parse(fs.readFileSync(f, 'utf8')).timeline || []).slice().sort((x, y) => x.t - y.t);
            const iv = pp(R.audit(tl, {}));
            got[code] = iv.length === 0 ? null : iv.length === 1 ? iv[0].kind : iv.map(x => x.kind).join('+');
        }
        const bad = Object.keys(want).filter(c => got[c] !== want[c]);
        check('P7 the real rooms: the 9 ping-pongs counted once each (4 permanent, 5 temporary); BVTQ, GCPD, QNGB not', bad.length === 0,
              bad.map(c => c + ' want ' + want[c] + ' got ' + got[c]).join('; '));
    }
}
{
    const down = (y1, d1, tg1) => {
        const tl = [mk('a', 0, 'bind', { ver: 'V431' }), mk('b', 0, 'bind', { ver: 'V431' }),
            mk('a', 1000, 'snap', { q: 1, clk: 90, d: 3, y: -41.92 }),
            mk('a', 8000, 'settle', { type: 'pass', q: 1, clk: 80, d: 1, d0: 3, tg: 10, gain: 14, y: -27.44, y0: -41.92, so: 0, su: 0 }),
            mk('a', 9000, 'snap', { q: 1, clk: 80, d: 1, y: -27.44 }),
            mk('a', 16000, 'settle', { type: 'pass', q: 1, clk: 70, d: d1, d0: 1, tg: tg1, gain: Math.round(y1 + 27.44), y: y1, y0: -27.44, so: 0, su: 0 })];
        return (R.audit(sorted(tl), {}).rawFlags || []).filter(f => f.rule === 'R-DOWN');
    };
    const inches = down(-17.45, 2, 0.01), wrong = down(-17.94, 1, 10);
    check('P8 R-DOWN: 9.99 facing 10 left "2nd & 0.01" is football (not flagged); 9.5 facing 10 left 1st & 10 is still flagged',
          inches.length === 0 && wrong.length === 1, JSON.stringify({ inches: inches.map(f => f.msg), wrong: wrong.map(f => f.msg) }));
}
console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
