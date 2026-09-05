// e2e/audit-selftest.js — the auditor catches the bugs this project has
// actually had, and stays quiet on a clean game.
//
// Runs a real two-player harness game so the V365 telemetry stream is the
// genuine article, injects the exact irregularities from the bug reports,
// pulls the stream back over REST, and runs tools/audit-game.js's rule engine
// on it.
//
// T1  the stream exists for both roles, with bind/stage/wait entries
// T2  a play whose line moved by the wrong amount is flagged (R-YARD)
// T3  a score that goes down is flagged (R-SCORE)
// T4  both devices waiting > 12s is flagged as a DEADLOCK (R-POSS)
// T5  an overlay flicker is flagged (R-OVL)
// T6  a formation on screen while parked with the cover off is flagged (R-OVL)
// T7  a pick-6 chain that stops after `applied` is flagged (R-P6)
// T8  a clean stretch of play produces no flags at all
// T9  a phantom pick-6 (after a boot / not +6 / no +6 landed) is flagged (R-P6)
// T10 the line moving between two plays is flagged (R-CONT + R-CLOCK)
const H = require('./harness');
const TP = require('./two-player');
const { audit, toTimeline } = require('../tools/audit-game.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const has = (res, rule, re) => res.flags.some(f => f.rule === rule && (!re || re.test(f.msg)));

async function pull(g) {
    await g.a.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await g.b.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await sleep(900);
    const aud = await TP.fbGet('rooms/' + g.code + '/audit') || {};
    return toTimeline({ a: aud.a || {}, b: aud.b || {} });
}

// ---- V380 (room XEDG): the four new rules, on hand-built timelines ----
// T11 the scorer snapping a normal down after its conversion offer (R-GIFT)
// T12 a handoff received while live and applied 20s later / queued (R-STALE)
// T13 the keep-drive firing three times in one quarter (R-KEEP)
// T14 the 300s fallback firing (R-FALLBACK)
// T15 both waiting while one screen is hidden reads "screen was off" (R-POSS)
// T16 8.0 gained with 8.6 to go is NOT a first down — no R-DOWN
function synthetic() {
    const T0 = 1700000000000;
    const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role: role, k: k }, f || {});
    const runs = {};
    runs.gift = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L2 pick-6' }),
                 mk('a', 9000, 'snap', { q: 2, clk: 51, y: 48, d: 1, tg: 10, poss: 1, dir: 1 })];
    runs.giftOk = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }),
                   mk('a', 4000, 'snap', { q: 2, clk: 43, y: 35, d: 6, tg: 2, poss: 1, dir: 1 }), mk('a', 9000, 'send', { type: 'KICKOFF', ts: T0 + 9000 })];
    runs.stale = [mk('b', 0, 'bind', { ver: 'V380' }), mk('b', 1000, 'wait', { on: false, why: 'L1' }),
                  mk('b', 5000, 'recv', { type: 'OTHER', ts: 777, via: 'sdk' }), mk('b', 30000, 'wait', { on: true, why: 'L2' }),
                  mk('b', 30100, 'apply', { type: 'OTHER', ts: 777, lagMs: 25100 })];
    runs.staleOld = [mk('b', 0, 'bind', { ver: 'V378' }), mk('b', 1000, 'wait', { on: false, why: 'L1' }), mk('b', 5000, 'recv', { type: 'OTHER', ts: 777, via: 'sdk' })];
    runs.purgedAtQ = [mk('b', 0, 'bind', { ver: 'V380' }), mk('b', 900, 'q', { from: 2, to: 3, clk: 120, d: 1, tg: 10, y: 0 }), mk('b', 1000, 'wait', { on: false, why: 'L1' }),
                      mk('b', 4000, 'recv', { type: 'OTHER', ts: 777, via: 'sdk' }), mk('b', 40000, 'purge', { type: 'OTHER', ts: 777, ageMs: 36000 })];
    runs.keep = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'keep', { q: 2, n: 1, y: 4, d: 1 }), mk('a', 2300, 'keep', { q: 2, n: 2, y: 4, d: 1 }), mk('a', 3600, 'keep', { q: 2, n: 3, y: 4, d: 1 })];
    runs.keepOld = [mk('a', 0, 'bind', { ver: 'V378' }), mk('a', 500, 'q', { from: 1, to: 2, clk: 120, d: 1, tg: 10, y: 4 }),
                    mk('a', 1000, 'diag', { m: 'QTR-KEEP resume Q2 y4 d1 clk=120' }), mk('a', 2300, 'diag', { m: 'QTR-KEEP resume Q2 y4 d1 clk=120' }), mk('a', 3600, 'diag', { m: 'QTR-KEEP resume Q2 y4 d1 clk=120' })];
    runs.fallback = [mk('b', 0, 'bind', { ver: 'V380' }), mk('b', 1000, 'guard', { what: 'fallback300', why: 'fired' })];
    runs.hidden = [mk('a', 0, 'bind', { ver: 'V380' }), mk('b', 0, 'bind', { ver: 'V380' }), mk('a', 500, 'wait', { on: true, why: 'L1' }), mk('b', 500, 'wait', { on: true, why: 'L1' }),
                   mk('a', 600, 'vis', { h: true })];
    for (let i = 0; i <= 14; i++) runs.hidden.push(mk('a', 1000 + i * 1000, 'stage', { of: 0, df: 0, ball: 0, wait: true, ovl: true, fps: 60 }));
    runs.down = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'settle', { type: 'run', name: 'WALKER', gain: 1, y: -7.71, d: 2, tg: 8.59, q: 1, clk: 20, su: 0, so: 0, y0: -9.12, d0: 1 }),
                 mk('a', 2000, 'snap', { q: 1, clk: 20, y: -7.71, d: 2, tg: 8.59, poss: 1, dir: 1 }),
                 mk('a', 8000, 'settle', { type: 'run', name: 'WALKER', gain: 8, y: 0.27, d: 3, tg: 0.62, q: 1, clk: 10, su: 0, so: 0, y0: -7.71, d0: 2 })];
    const A = tl => audit(tl.slice().sort((x, y) => x.t - y.t), {});
    check('T11 the scorer snapping a normal down after its conversion offer is a GIFT (R-GIFT)', has(A(runs.gift), 'R-GIFT', /snapped a normal down/), '');
    check('T11b a conversion kick (down 6) then a kickoff is not (no R-GIFT)', !has(A(runs.giftOk), 'R-GIFT'), JSON.stringify(A(runs.giftOk).flags.map(f => f.msg)));
    check('T12 a handoff received while live and applied 25s later is STALE (R-STALE)', has(A(runs.stale), 'R-STALE', /applied .* 25s after/), JSON.stringify(A(runs.stale).flags.map(f => f.msg)));
    check('T12b on an older build the same receipt is flagged as queued (R-STALE)', has(A(runs.staleOld), 'R-STALE', /queued it for the next park/), '');
    check('T12c a handoff purged right after a quarter change is quiet (no R-STALE)', !has(A(runs.purgedAtQ), 'R-STALE'), JSON.stringify(A(runs.purgedAtQ).flags.map(f => f.msg)));
    check('T13 the keep-drive firing three times in one quarter is flagged (R-KEEP)', has(A(runs.keep), 'R-KEEP', /3 times in Q2/), '');
    check('T13b ...and on an older build from its diag lines (R-KEEP)', has(A(runs.keepOld), 'R-KEEP', /resume x3 in Q2/), JSON.stringify(A(runs.keepOld).flags.map(f => f.msg)));
    check('T14 the 300s fallback firing is flagged (R-FALLBACK)', has(A(runs.fallback), 'R-FALLBACK', /fired/), '');
    check('T15 both waiting while one screen is hidden reads as IDLE, not DEADLOCK (R-POSS)', has(A(runs.hidden), 'R-POSS', /IDLE: .* a's screen was hidden/) && !has(A(runs.hidden), 'R-POSS', /DEADLOCK/), JSON.stringify(A(runs.hidden).flags.map(f => f.msg)));
    check('T16 8.0 gained with 8.6 to go leaves 3rd down — no R-DOWN', !has(A(runs.down), 'R-DOWN'), JSON.stringify(A(runs.down).flags.map(f => f.msg)));
    // V382: a refused clock write is on record
    runs.clock = [mk('b', 0, 'bind', { ver: 'V382' }), mk('b', 1000, 'clock', { from: 65, to: 118, q: 3, who: 'L10259', n: 1 })];
    check('T17 a clock write the law refused is flagged with its writer (R-CLOCK)', has(A(runs.clock), 'R-CLOCK', /65s -> 118s in Q3 .* REFUSED \(writer L10259\)/), JSON.stringify(A(runs.clock).flags.map(f => f.msg)));
}

(async () => {
    console.log('=== AUDIT SELF-TEST ===');
    synthetic();
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);

    // ---- T1: the stream is real ----
    let tl = await pull(g);
    const kinds = {}; tl.forEach(e => { kinds[e.k] = (kinds[e.k] || 0) + 1; });
    console.log('  T1 kinds: ' + JSON.stringify(kinds));
    check('T1 both devices are streaming (bind + stage + wait present)',
          tl.some(e => e.role === 'a' && e.k === 'bind') && tl.some(e => e.role === 'b' && e.k === 'bind') &&
          kinds.stage > 0 && kinds.wait > 0, JSON.stringify(kinds));

    // ---- T8 first: a clean stretch — no flags ----
    const clean = audit(tl, {});
    check('T8 a clean start of a game produces no flags', clean.flags.length === 0,
          JSON.stringify(clean.flags.map(f => f.rule + ': ' + f.msg)));

    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T2: a settle whose line is wrong ----
    await off.page.evaluate(() => {
        window._rb2p_audit('snap', { q: 1, clk: 50, y: 0, d: 1, tg: 10, poss: 1, dir: 1 });
        window._rb2p_audit('settle', { type: 'pass', name: 'KITTLE', gain: 15, y: 5, d: 1, tg: 10, q: 1, clk: 44, su: 0, so: 0, y0: 0, d0: 1 });
    });
    // ---- T3: a score that goes down ----
    await off.page.evaluate(() => { window._rb2p_audit('score', { su: 7, so: 0, dsu: 7, dso: 0, q: 1, clk: 40 }); window._rb2p_audit('score', { su: 0, so: 0, dsu: -7, dso: 0, q: 1, clk: 39 }); });
    // ---- T5: a flicker ----
    await def.page.evaluate(() => { for (let i = 0; i < 5; i++) window._rb2p_audit('ovl', { shown: i % 2 === 0, why: 'test' }); });
    // ---- T4 + T6: both waiting with a formation staged, for 13s of stage samples ----
    // Tagged so the test can re-stamp their times below (a real 13s would
    // make this suite slow for nothing).
    await off.page.evaluate(() => {
        window._rb2p_audit('wait', { on: true, why: 'test', tag: 'dl' });
        for (let i = 0; i <= 14; i++) window._rb2p_audit('stage', { of: 11, df: 11, ball: 1, kp: 0, wait: true, ovl: false, fps: 60, tag: 'dl', i: i });
    });
    await def.page.evaluate(() => {
        window._rb2p_audit('wait', { on: true, why: 'test', tag: 'dl' });
        for (let i = 0; i <= 14; i++) window._rb2p_audit('stage', { of: 0, df: 0, ball: 0, kp: null, wait: true, ovl: true, fps: 60, tag: 'dl', i: i });
    });
    // ---- T7: a pick-6 chain that dies after `applied` ----
    await off.page.evaluate(() => { window._rb2p_audit('p6', { step: 'detected', src: 'test' }); window._rb2p_audit('p6', { step: 'sent', plus6: true }); });
    await def.page.evaluate(() => { window._rb2p_audit('p6', { step: 'applied', su: 6, so: 0 }); });

    // ---- T9: a phantom pick-6 right after a boot, shipped without its +6 ----
    await def.page.evaluate(() => { window._rb2p_audit('diag', { m: 'boot' }); window._rb2p_audit('p6', { step: 'detected', src: 'score-watcher(+9)' }); window._rb2p_audit('p6', { step: 'sent', plus6: false }); });
    // ---- T10: the line moved between two plays ----
    await off.page.evaluate(() => {
        window._rb2p_audit('settle', { type: 'pass', name: 'KITTLE', gain: 8, y: 10.7, d: 2, tg: 2.5, q: 2, clk: 173, su: 0, so: 16, y0: 3.2, d0: 1 });
        window._rb2p_audit('snap', { q: 2, clk: 180, y: 3.2, d: 1, tg: 10, poss: 1, dir: 1 });
    });
    tl = await pull(g);
    // Re-stamp the tagged deadlock scenario onto a window that ENDS before the
    // pick-6 chain begins: the wait entries at T, the samples at T+1s..T+15s.
    const p6t = Math.min(...tl.filter(e => e.k === 'p6').map(e => e.t));
    const T = p6t - 20000;
    for (const e of tl) if (e.tag === 'dl') e.t = (e.k === 'wait') ? T : T + 1000 + (e.i || 0) * 1000;
    tl.sort((x, y) => x.t - y.t);
    const res = audit(tl, {});
    console.log('  flags: ' + res.flags.map(f => '[' + f.rule + '] ' + f.msg).join('\n         '));
    check('T2 a wrong line of scrimmage is flagged (R-YARD)', has(res, 'R-YARD', /should be 15/), '');
    check('T3 a score going down is flagged (R-SCORE)', has(res, 'R-SCORE', /DOWN/), '');
    check('T4 both devices waiting is flagged as a DEADLOCK (R-POSS)', has(res, 'R-POSS', /DEADLOCK/), '');
    check('T5 an overlay flicker is flagged (R-OVL)', has(res, 'R-OVL', /FLICKER/), '');
    check('T6 a formation on screen while parked with the cover off is flagged (R-OVL)', has(res, 'R-OVL', /EXPOSED FORMATION/), '');
    check('T7 a pick-6 chain that stops after applied is flagged (R-P6)', has(res, 'R-P6', /no (modal|resultSent)/), '');
    check('T9 a pick-6 detected right after a boot, or shipped without its +6, is a PHANTOM (R-P6)',
          has(res, 'R-P6', /PHANTOM PICK-6: detected .* after a boot/) && has(res, 'R-P6', /jumped \+9/) && has(res, 'R-P6', /WITHOUT the \+6/), '');
    check('T10 a line that moved between two plays is flagged (R-CONT) and the clock going up with it (R-CLOCK)',
          has(res, 'R-CONT', /LINE MOVED BETWEEN PLAYS/) && has(res, 'R-CLOCK', /between plays/), '');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
