// e2e/v424-checker.js — the freeze checker: TEMPORARY vs PERMANENT, and the four "frozen" games of 2026-09-29.
// Pure Node (no browser).
//
//   C1  the clock offset is the SMALLEST srv - t sample (the rest is upload delay): FQHW's background tab
//       uploaded 27s late and the median slid its whole stream 24s
//   C2  one device playing both seats (the same account) has ONE clock: one offset for both
//   C3  a freeze the game went on from (a snap after it) is TEMPORARY; one it never went on from is PERMANENT
//   C4  a conversion answer MERGED by the thrower after its halftime law (V422 moot) is a received answer —
//       not "pick-6 chain broke" (UVXN)
//   C5  the real rooms (when this Mac's archive is present): FQHW and RPLB are not freezes; DPWZ, UVXN and
//       QJFB are temporary
//   C6  (RPLB) a dark screen stays dark until the phone says otherwise; a phone whose stream goes silent 20s is gone
const fs = require('fs');
const path = require('path');
const R = require('../tools/audit-rules.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const T0 = 1790000000000;

console.log('=== V424 CHECKER ===');
// ---- C1 / C2 ----
{
    const stream = (offs, uid) => {
        const s = {}; let i = 0;
        const put = (t, e) => { s[t + '_' + ('00000' + (i++)).slice(-6)] = Object.assign({ t }, e); };
        put(T0, { k: 'bind', uid });
        offs.forEach((o, n) => put(T0 + 1000 + n * 15000, { k: 'sync', srv: T0 + 1000 + n * 15000 + o }));
        put(T0 + 50000, { k: 'diag', m: 'marker' });
        return s;
    };
    const tl = R.toTimeline({ a: stream([121, 27653], 'u1'), b: stream([400, 450], 'u2') });
    const ma = tl.find(e => e.role === 'a' && e.m === 'marker'), mb = tl.find(e => e.role === 'b' && e.m === 'marker');
    check('C1 each phone\'s offset is its smallest sample (a: 121ms, not the 27653ms upload delay)', ma.t === T0 + 50000 + 121 && mb.t === T0 + 50000 + 400, JSON.stringify({ a: ma.t - T0 - 50000, b: mb.t - T0 - 50000 }));
    const tl2 = R.toTimeline({ a: stream([121, 27653], 'same'), b: stream([3000, 3100], 'same') });
    const ma2 = tl2.find(e => e.role === 'a' && e.m === 'marker'), mb2 = tl2.find(e => e.role === 'b' && e.m === 'marker');
    check('C2 one account on both seats is one device: both phones get the same offset', ma2.t === mb2.t && tl2.sameDevice === true, JSON.stringify({ a: ma2.t - T0 - 50000, b: mb2.t - T0 - 50000, same: tl2.sameDevice }));
}
// ---- C3 ----
{
    const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
    const base = () => [mk('a', 0, 'bind', { ver: 'V424' }), mk('b', 0, 'bind', { ver: 'V424' })];
    const tmp = base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
                               mk('a', 16000, 'act', { must: true, can: true, why: '' }), mk('a', 17000, 'snap', { q: 1, clk: 100, d: 1, y: -20 })]);
    const rt = R.audit(tmp, {});
    const perm = base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' })]);
    for (let t = 5000; t <= 31000; t += 5000) perm.push(mk('a', t, 'stage', { of: 0, df: 0, ball: 0, wait: true, fps: 60 }), mk('b', t, 'stage', { of: 0, df: 0, ball: 0, wait: true, fps: 60 }));   // both on screen, logging
    const rp = R.audit(perm, {});
    const ivt = rt.frozen.intervals.find(x => x.kind), ivp = rp.frozen.intervals.find(x => x.kind);
    check('C3 15s of both waiting, then a snap: TEMPORARY; 30s of both waiting to the end: PERMANENT',
          ivt && ivt.kind === 'temporary' && rt.frozen.temporary.n === 1 && ivp && ivp.kind === 'permanent' && rp.frozen.permanent.n === 1 &&
          rt.flags.some(f => /^FROZEN: .* — temporary$/.test(f.msg) && f.impact === 3) && rp.flags.some(f => /^FROZEN: .* — permanent$/.test(f.msg) && f.impact === 3),
          JSON.stringify({ t: rt.frozen, p: rp.frozen }));
}
// ---- C6 (RPLB) ----
{
    const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
    const tl = [mk('a', 0, 'bind', { ver: 'V423' }), mk('b', 0, 'bind', { ver: 'V423' }),
                mk('a', 1000, 'act', { must: true, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
                mk('a', 2000, 'vis', { h: true }), mk('a', 2000, 'act', { must: true, can: false, why: 'hidden' }),
                mk('a', 25000, 'send', { type: 'PICK6', ts: 1 }), mk('a', 26000, 'act', { must: false, can: true, why: '' })];   // the dark page ends the play and says "need not act"
    for (let t = 3000; t <= 18000; t += 5000) tl.push(mk('b', t, 'stage', { wait: true, fps: 60 }));                     // b's page stops at 18s: asleep or closed
    for (let t = 27000; t <= 420000; t += 5000) tl.push(mk('a', t, 'diag', { m: 'rAF silent — fallback driving frames' }));   // a's dark page runs on
    const r = R.audit(tl.sort((x, y) => x.t - y.t), {});
    check('C6 (RPLB) a dark screen stays dark until it says otherwise, and a silent phone is gone: nobody on screen, no freeze',
          r.frozen.sec === 0, JSON.stringify(r.frozen));
}
// ---- C4 ----
{
    const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
    const tl = [mk('a', 0, 'bind', { ver: 'V423' }), mk('b', 0, 'bind', { ver: 'V423' }),
                mk('b', 1000, 'p6', { step: 'detected' }), mk('b', 1100, 'p6', { step: 'sent' }), mk('a', 1300, 'p6', { step: 'applied' }),
                mk('a', 1300, 'conv', { ev: 'modal', lic: 'L2 pick-6' }), mk('a', 1300, 'p6', { step: 'modal' }),
                mk('a', 16000, 'p6', { step: 'resultSent', synthetic: true }), mk('a', 16000, 'send', { type: 'PAT_RESULT', ts: 555 }),
                mk('b', 17200, 'recv', { type: 'PAT_RESULT', ts: 555 }), mk('b', 17200, 'purge', { type: 'PAT_RESULT', ts: 555, why: 'older epoch K0', epochMoot: true })];
    const r = R.audit(tl, {});
    check('C4 a merged (moot) conversion answer is a received answer — no "chain broke", no "never went LIVE"',
          !r.flags.some(f => /chain broke|never went LIVE/.test(f.msg)), JSON.stringify(r.flags.filter(f => f.rule === 'R-P6').map(f => f.msg)));
}
// ---- C5 ----
{
    const dir = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/Projects/two-player-rb/audits';
    const want = { FQHW: 'none', RPLB: 'none', DPWZ: 'temporary', UVXN: 'temporary', QJFB: 'temporary' };
    if (!Object.keys(want).every(c => fs.existsSync(path.join(dir, c + '.json')))) console.log('  SKIP  C5 (the archive of real rooms is not on this machine)');
    else {
        const got = {};
        for (const c of Object.keys(want)) {
            const j = JSON.parse(fs.readFileSync(path.join(dir, c + '.json'), 'utf8'));
            const res = R.audit(R.realign(j.timeline).slice().sort((a, b) => a.t - b.t), {});
            got[c] = res.frozen.sec > 0 ? (res.frozen.permanent.n ? 'permanent' : 'temporary') : 'none';
        }
        check('C5 the real rooms: FQHW (a clock artifact) and RPLB (both players gone) are not freezes; DPWZ, UVXN, QJFB are temporary', Object.keys(want).every(c => got[c] === want[c]), JSON.stringify(got));
    }
}
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
