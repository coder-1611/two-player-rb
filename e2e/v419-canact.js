// e2e/v419-canact.js — NEVER-FREEZE Phase 1: the can-act monitor, proven in real pages.
// A monitor never seen to say "cannot act" proves nothing (NEVER-FREEZE-PROMPT.md, Phase 1).
//
//   C1  the phone with the ball must act and can; the waiting phone need not act
//   C2  a 40x40 element over the field point reads "covered by #v419-block" within 2s, and clears when removed
//   C3  the bridge's own wait cover, forced onto the phone that has the ball, is lifted within 2s
//   C4  an engine that stops stepping reads "engine not stepping"
//   C5  (phone layout) a touch the engine still holds with no finger on the glass reads "pointer wedged"; C5b the
//       V423 authority releases it within 4s (a local remedy)
//   C7  a hand-off waiting on a phone whose engine stopped reads "hand-off waiting, no frames"
//   C8  a decided game with no stats screen reads "stats screen missing"
//   C9  a held mouse button (a Chromebook drag) is not "pointer wedged"
//   C6  end to end: a 12s foreign cover on the phone with the ball is audited and the checker calls it FROZEN
const H = require('./harness');
const TP = require('./two-player');
const { audit, toTimeline } = require('../tools/audit-game.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const state = page => page.evaluate(() => window._rb2p_canActState());
async function waitState(page, pred, ms) {
    const t0 = Date.now(); let s = null;
    while (Date.now() - t0 < ms) { s = await state(page); if (pred(s)) return { s, ms: Date.now() - t0 }; await sleep(250); }
    return { s, ms: null };
}

(async () => {
    console.log('=== V419 CAN-ACT MONITOR ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- C1 ----
    const c1o = await waitState(off.page, s => s.must && s.can, 8000), c1d = await state(def.page);
    check('C1 the phone with the ball must act and can; the waiting phone need not act', !!c1o.ms || (c1o.s && c1o.s.must && c1o.s.can), JSON.stringify({ off: c1o.s, def: c1d }));
    check('C1b the waiting phone reads must=false', c1d.must === false, JSON.stringify(c1d));

    // ---- C2: an element over the field ----
    await off.page.evaluate(() => {
        const cv = document.getElementById('canvas').getBoundingClientRect();
        const b = document.createElement('div'); b.id = 'v419-block';
        b.style.cssText = 'position:fixed;width:40px;height:40px;background:#f0f;z-index:99999;left:' + (cv.left + cv.width / 2 - 20) + 'px;top:' + (cv.top + cv.height / 2 - 20) + 'px;';
        document.body.appendChild(b);
    });
    const c2 = await waitState(off.page, s => s.must && !s.can && /covered by #v419-block/.test(s.why), 2500);
    await off.page.evaluate(() => { const b = document.getElementById('v419-block'); if (b) b.remove(); });
    const c2b = await waitState(off.page, s => s.must && s.can, 2500);
    check('C2 an element over the field point reads "covered by #v419-block" within 2s, and clears when removed', c2.ms !== null && c2b.ms !== null, JSON.stringify({ c2, c2b }));

    // ---- C3: the bridge's own cover never stays on the phone with the ball ----
    const c3 = await off.page.evaluate(async () => {
        const w = document.getElementById('rb-waiting'); if (!w) return { err: 'no cover' };
        w.style.display = 'flex'; const t0 = Date.now();
        while (Date.now() - t0 < 3000 && w.style.display !== 'none') await new Promise(r => setTimeout(r, 50));
        return { liftedMs: w.style.display === 'none' ? Date.now() - t0 : null };
    });
    check('C3 the bridge\'s own wait cover, forced onto the phone with the ball, is lifted within 2s', c3.liftedMs !== null && c3.liftedMs <= 2000, JSON.stringify(c3));

    // ---- C4: the engine stops stepping ----
    await off.page.evaluate(() => { window.__v419eng = window._rb2p_engPerSec; window._rb2p_engPerSec = () => 0; });
    const c4 = await waitState(off.page, s => !s.can && s.why === 'engine not stepping', 2500);
    await off.page.evaluate(() => { window._rb2p_engPerSec = window.__v419eng; });
    check('C4 an engine that stops stepping reads "engine not stepping"', c4.ms !== null, JSON.stringify(c4));

    // ---- C9: a held mouse button (a Chromebook QB aiming) is a finger on the glass, not a wedge ----
    const cvm = await off.page.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.85, y: r.top + r.height * 0.15 }; });
    await off.page.mouse.move(cvm.x, cvm.y); await off.page.mouse.down();
    await sleep(4500);
    const c9 = await state(off.page);
    await off.page.mouse.up();
    check('C9 a mouse button held 4.5s (a Chromebook drag) is not read as "pointer wedged"', c9.why !== 'pointer wedged', JSON.stringify(c9));

    // ---- C7: a hand-off waiting on a phone whose engine has stopped ----
    const c7 = await def.page.evaluate(async () => {
        window._rb2p_deferredOutcome = { type: 'OTHER', ts: Date.now(), yardLine: 10, quarter: 1, minutesLeft: 1, secondsLeft: 0, scoreUser: 0, scoreOpp: 0 };
        window.__v419eng2 = window._rb2p_engPerSec; window._rb2p_engPerSec = () => 0;
        const realDrain = window._rb2p_drainDeferredOutcome; window._rb2p_drainDeferredOutcome = () => 'test holds it';
        await new Promise(r => setTimeout(r, 400));
        const st = window._rb2p_canActState();
        window._rb2p_engPerSec = window.__v419eng2; window._rb2p_drainDeferredOutcome = realDrain;
        window._rb2p_deferredOutcome = null; window._rb2p_deferredOutcomeSinceMs = 0;
        return st;
    });
    check('C7 a hand-off waiting on a phone whose engine stopped: must act, cannot ("hand-off waiting, no frames")', c7.must && !c7.can && c7.why === 'hand-off waiting, no frames', JSON.stringify(c7));

    // ---- C6: end to end ----
    const t6 = Date.now();
    await off.page.evaluate(() => {
        const cv = document.getElementById('canvas').getBoundingClientRect();
        const b = document.createElement('div'); b.id = 'v419-cover';
        b.style.cssText = 'position:fixed;width:120px;height:120px;background:#0f0;z-index:99999;left:' + (cv.left + cv.width / 2 - 60) + 'px;top:' + (cv.top + cv.height / 2 - 60) + 'px;';
        document.body.appendChild(b);
    });
    await sleep(12500);
    await off.page.evaluate(() => { const b = document.getElementById('v419-cover'); if (b) b.remove(); });
    await sleep(2500);
    await off.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await def.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await sleep(3000);
    const streams = { a: (await TP.fbGet('rooms/' + g.code + '/audit/a')) || {}, b: (await TP.fbGet('rooms/' + g.code + '/audit/b')) || {} };
    const tl = toTimeline(streams).filter(e => e.t >= t6 - 60000);
    const res = audit(tl, {});
    const fz = res.flags.filter(f => f.rule === 'R-FREEZE');
    check('C6 a 12s foreign cover on the phone with the ball is audited (act entries) and the checker calls it FROZEN (impact 3)',
          tl.some(e => e.k === 'act' && e.can === false && /v419-cover/.test(e.why || '')) && fz.some(f => /^FROZEN: .* could not act \(covered by #v419-cover\) for 1[2-4]s/.test(f.msg) && f.impact === 3),
          JSON.stringify({ acts: tl.filter(e => e.k === 'act').map(e => e.role + ':' + e.must + '/' + e.can + ' ' + e.why).slice(-6), fz: fz.map(f => f.msg) }));
    // ---- C8: a decided game with no stats screen (last: it changes the score) ----
    const c8 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; window._rb2p_inOvertime = false;
        em.engineQuarter = 5; em.setUserScore(28); em.setOpponentScore(21); em.engineDownNumber = 1;
        const fin = document.getElementById('rb-final'); if (fin) fin.style.display = 'none';
        await new Promise(r => setTimeout(r, 400));
        return window._rb2p_canActState();
    });
    check('C8 a decided game with no stats screen: must act, cannot ("stats screen missing")', c8.must && !c8.can && /^stats screen missing/.test(c8.why), JSON.stringify(c8));
    await g.cleanup();

    // ---- C5: a wedged touch, phone layout (a landscape two-player game on touch phones) ----
    const gm = await TP.startTwoPlayerGame({ mobile: 'landscape' });
    await sleep(6000);
    const mWait = await gm.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const moff = mWait ? gm.b : gm.a;
    const cdp = await moff.page.target().createCDPSession();
    const pt = await moff.page.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.85, y: r.top + r.height * 0.15 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await sleep(100);
    // the finger lifts, but only the document hears it (the engine's canvas listener never does)
    await moff.page.evaluate(() => { try { document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [], bubbles: true })); } catch (e) {} });
    const c5 = await waitState(moff.page, s => !s.can && s.why === 'pointer wedged', 16000);   // a lost pointer-up ages out at 10s, then 2s of wedge
    check('C5 (touch phone) a touch the engine still holds with no finger on the glass reads "pointer wedged"', c5.ms !== null, JSON.stringify(c5));
    // V423: the recovery authority releases it (a local remedy) within 4s more — the engine's own heal waits for a new touch
    const uw0 = await moff.page.evaluate(() => (window._rb2p_recoverStats || {}).unwedge || 0);
    const c5b = await waitState(moff.page, s => s.why !== 'pointer wedged', 9000);
    const uw1 = await moff.page.evaluate(() => (window._rb2p_recoverStats || {}).unwedge || 0);
    check('C5b the recovery authority releases the wedged touch (no new touch needed)', c5b.ms !== null && uw1 > uw0, JSON.stringify({ c5b, uw0, uw1 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await gm.cleanup();

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
