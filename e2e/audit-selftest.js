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

(async () => {
    console.log('=== AUDIT SELF-TEST ===');
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

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
