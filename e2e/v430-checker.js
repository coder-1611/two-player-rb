// e2e/v430-checker.js — the freeze detector, after reading every frozen game of 2026-10-01 on its timeline (V430).
// Pure Node (no browser).
//
//   C1  "both parked" while the partner is AWAY (screen off, or gone silent) is waiting for a player who left — the rule
//       is never to take the ball from an away player — not a freeze (OHGZ, JDZQ, ZMCM); a partner on screen still counts
//   C2  "both parked" is my view of the partner from its record, which can be stale: once the partner itself went live
//       or snapped, it was not parked (ZMCM: an 11.5 s REST backlog)
//   C3  a phone whose clock is corrected mid-game: each moment uses the samples within 10 minutes when there are 3+
//       (DNSX: 26 s, ZMCM: 4.5 s — an hour's window took a sample from before the correction)
//   C4  "no frames drawn" with no tap from that player (V426+ logs every tap) is a screen nobody was looking at (ZNSO)
//   C5  a hand-off wait while a phone had NO network (no upload landed, its next one carried a backlog of 20+) is not
//       the game (CZFL: a laptop just out of a 22-minute sleep, both transports dead)
//   C6  a silence that ends with ENGINE LOOP DEAD — any kick count — is a device that slept (NERM: kicks=7, 15 minutes)
//   C7  the real rooms (when this Mac's archive is present): the artifacts are 0; the reload stalls are counted once
const fs = require('fs');
const path = require('path');
const R = require('../tools/audit-rules.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const T0 = 1790000000000;
const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
const base = (ver) => [mk('a', 0, 'bind', { ver: ver || 'V430' }), mk('b', 0, 'bind', { ver: ver || 'V430' })];
const sorted = tl => tl.sort((x, y) => x.t - y.t);

console.log('=== V430 CHECKER ===');
// ---- C1 ----
{
    const mkCase = partnerHidden => {
        const tl = base().concat([mk('a', 1000, 'act', { must: true, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
            mk('a', 2000, 'wait', { on: true }), mk('a', 2000, 'act', { must: true, can: false, why: 'both parked' })]);
        if (partnerHidden) tl.push(mk('b', 1500, 'vis', { h: true, why: 'pagehide' }));
        for (let t = 3000; t <= 20000; t += 2500) { tl.push(mk('a', t, 'stage', { wait: true })); if (!partnerHidden) tl.push(mk('b', t, 'stage', { wait: true })); }
        tl.push(mk('a', 21000, 'act', { must: true, can: true, why: '' }), mk('a', 21500, 'snap', { q: 1, clk: 90, d: 1, y: -20 }));
        return R.audit(sorted(tl), {});
    };
    const away = mkCase(true), here = mkCase(false);
    check('C1 "both parked" with the partner away is not a freeze; with the partner on screen it is',
          away.frozen.sec === 0 && here.frozen.sec > 10, JSON.stringify({ away: away.frozen.sec, here: here.frozen.sec }));
}
// ---- C2 ----
{
    const tl = base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
        mk('a', 2000, 'act', { must: true, can: false, why: 'both parked' }),
        mk('b', 5000, 'wait', { on: false }), mk('b', 6000, 'snap', { q: 1, clk: 90, d: 1, y: -20 }),     // the partner was live
        mk('a', 16000, 'act', { must: false, can: true, why: '' })]);                                    // a's view catches up
    for (let t = 3000; t <= 15000; t += 2500) tl.push(mk('a', t, 'stage', { wait: true }), mk('b', t, 'stage', { wait: false }));
    const r = R.audit(sorted(tl), {});
    const iv = r.frozen.intervals.find(x => x.role === 'a');
    check('C2 my "both parked" ends when the partner itself goes live (its own stream), not when my stale view catches up',
          r.frozen.sec === 0 && (!iv || iv.ms <= 4500), JSON.stringify(r.frozen.intervals));
}
// ---- C3 ----
{
    const stream = (samples, uid, marks) => {
        const s = {}; let i = 0;
        const put = (t, e) => { s[t + '_' + ('00000' + (i++)).slice(-6)] = Object.assign({ t }, e); };
        put(T0, { k: 'bind', uid });
        for (const [dt, o] of samples) put(T0 + dt, { k: 'sync', srv: T0 + dt + o });
        for (const m of marks) put(T0 + m, { k: 'diag', m: 'marker' + m });
        return s;
    };
    // a: -38 s for the first 8 minutes, corrected to -12 s at 9 minutes, sampled every 15 s after it (V430)
    const sa = [[30000, -38060], [200000, -38070], [480000, -38065]];
    for (let t = 560000; t <= 900000; t += 15000) sa.push([t, -12000 - (t % 3) * 100]);
    const tl = R.toTimeline({ a: stream(sa, 'u1', [700000, 100000]), b: stream([[1000, 300], [600000, 310]], 'u2', []) });
    const late = tl.find(e => e.m === 'marker700000'), early = tl.find(e => e.m === 'marker100000');
    check('C3 after its clock is corrected, a phone\'s entries use the samples near them (-12 s), before it the old offset (-38 s)',
          late && late.t === T0 + 700000 - 12200 && early && early.t === T0 + 100000 - 38070, JSON.stringify({ late: late && late.t - T0 - 700000, early: early && early.t - T0 - 100000 }));
}
// ---- C4 ----
{
    const mkCase = (ver, taps) => {
        const tl = base(ver).concat([mk('a', 1000, 'act', { must: true, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
            mk('a', 2000, 'act', { must: true, can: false, why: 'no frames drawn' }), mk('a', 22000, 'act', { must: true, can: true, why: '' }), mk('a', 23000, 'snap', { q: 1, clk: 90, d: 1, y: -20 })]);
        for (let t = 3000; t <= 21000; t += 2500) tl.push(mk('a', t, 'stage', { fps: 0 }), mk('b', t, 'stage', { wait: true }));
        if (taps) for (const t of [6000, 7000, 9000]) tl.push(mk('a', t, 'diag', { m: 'tap 400,300->gui 380,200 p=mouse' }));
        return R.audit(sorted(tl), {}).frozen.sec;
    };
    const noTap = mkCase('V430', false), tapped = mkCase('V430', true), old = mkCase('V425', false);
    check('C4 "no frames drawn" counts only when the player tapped (V426+); older builds keep the old count',
          noTap === 0 && tapped >= 19 && old >= 19, JSON.stringify({ noTap, tapped, old }));
}
// ---- C5 ----
{
    const mkCase = backlog => {
        const tl = base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
            mk('a', 500, 'sync', { q: 1, srv: T0 + 600 }), mk('b', 500, 'sync', { q: 1, srv: T0 + 600 }),
            mk('a', 40000, 'sync', { q: backlog, srv: T0 + 40100 }), mk('b', 20000, 'sync', { q: 1, srv: T0 + 20100 }),
            mk('a', 30000, 'act', { must: true, can: true, why: '' }), mk('a', 31000, 'snap', { q: 1, clk: 90, d: 1, y: -20 })]);
        for (let t = 3000; t <= 29000; t += 2500) tl.push(mk('a', t, 'stage', { wait: true }), mk('b', t, 'stage', { wait: true }));
        return R.audit(sorted(tl), {}).frozen.sec;
    };
    const offline = mkCase(49), online = mkCase(2);
    check('C5 a hand-off wait while a phone had no network (no upload in it, a backlog of 20+ after) is not counted; with uploads it is',
          offline === 0 && online >= 25, JSON.stringify({ offline, online }));
}
// ---- C6 ----
{
    const tl = base().concat([mk('a', 1000, 'act', { must: false, can: true, why: '' }), mk('b', 1000, 'act', { must: false, can: true, why: '' }),
        mk('a', 2000, 'stage', { wait: true }), mk('b', 2000, 'stage', { wait: true }),
        mk('a', 900000, 'diag', { m: 'ENGINE LOOP DEAD — kicking _fi5 (kicks=7)' }), mk('a', 900500, 'act', { must: true, can: true, why: '' })]);
    for (let t = 4500; t <= 30000; t += 2500) tl.push(mk('b', t, 'stage', { wait: true }));
    const r = R.audit(sorted(tl), {});
    check('C6 a silence that ends with ENGINE LOOP DEAD (kicks=7) is a device asleep — the partner waited for an absent player',
          r.frozen.sec === 0, JSON.stringify(r.frozen.intervals));
}
// ---- C7 ----
{
    const dir = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/rb2p/two-player-rb/audits';
    const rooms = ['CZFL', 'NERM', 'JDZQ', 'ZMCM', 'ZNSO', 'VWWK', 'BXDZ', 'NICE', 'OHGZ'];
    if (!rooms.every(c => fs.existsSync(path.join(dir, c + '.json')))) console.log('  SKIP  C7 (the archive of real rooms is not on this machine)');
    else {
        const sec = {};
        for (const c of rooms) { const j = JSON.parse(fs.readFileSync(path.join(dir, c + '.json'), 'utf8')); sec[c] = R.audit(R.realign(j.timeline).slice().sort((a, b) => a.t - b.t), {}).frozen.sec; }
        check('C7a the artifacts of 2026-09-29..10-01 are not freezes: CZFL (no network), NERM (asleep), JDZQ (partner left), ZMCM (away / stale view), ZNSO (no tap)',
              ['CZFL', 'NERM', 'JDZQ', 'ZMCM', 'ZNSO'].every(c => sec[c] === 0), JSON.stringify(sec));
        check('C7b the reload stalls (the resume parked the phone that had the ball) are counted, once each: VWWK, BXDZ, NICE, OHGZ',
              ['VWWK', 'BXDZ', 'NICE', 'OHGZ'].every(c => sec[c] >= 10 && sec[c] <= 12), JSON.stringify(sec));
    }
}
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
