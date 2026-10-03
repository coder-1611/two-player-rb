// e2e/final-scroll.js — V448 (the owner: "the FINAL screen is not scrollable on a phone"). Two touch phones held
// sideways (874x402) play a real two-player game; it ends through the engine's own time-up at the Q4 horn (the horn
// law: a drive staged at a regulation 0:00 is refused and the engine ends the game) with one team ahead.
//   F1  a finger drag on the FIELD is still cancelled (V256: nothing in a game may pan — iOS stops the frame clock)
//   F2  the bug report's checklist scrolls under a finger when it runs past its box
//   F3  the FINAL screen is taller than the phone, and a finger swipe scrolls it
//   F4  swiping on, BACK TO LOBBY comes fully on screen
// Before V448 the page's touchmove cancel (V256) caught the FINAL screen too: scrollTop stayed 0.
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function swipe(page, x, y0, dy, steps) {   // a real finger: touchstart, touchmoves, touchend (Puppeteer touchscreen)
    await page.touchscreen.touchStart(x, y0);
    for (let i = 1; i <= (steps || 10); i++) { await page.touchscreen.touchMove(x, y0 - dy * i / (steps || 10)); await sleep(16); }
    await page.touchscreen.touchEnd();
    await sleep(700);
}
const recordMoves = page => page.evaluate(() => {
    window.__fsMoves = []; if (window.__fsBound) return; window.__fsBound = true;
    window.addEventListener('touchmove', e => { window.__fsMoves.push(e.defaultPrevented); }, { passive: true });   // after the page's own (document) handler
});

(async () => {
    console.log('=== V448 FINAL SCREEN SCROLLS ON A PHONE ===');
    const g = await TP.startTwoPlayerGame({ mobile: 'landscape' });
    try {
        await sleep(6000);
        const o = await L.offense(g, 40000); if (!o.ok) { check('setup: somebody has the ball', false); return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a, P = OFF.page;
        const vp = await P.evaluate(() => ({ w: innerWidth, h: innerHeight, mobile: document.documentElement.classList.contains('rb-mobile') }));
        // F1: a drag on the field
        await recordMoves(P);
        const cv = await P.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; });
        await swipe(P, cv.x, cv.y, 60, 6);
        const f1 = await P.evaluate(() => window.__fsMoves.slice());
        check('F1 a finger drag on the field is still cancelled (no panning in a game)', vp.mobile && f1.length > 0 && f1.every(Boolean), JSON.stringify({ vp, moves: f1 }));
        // F2: the bug report's checklist
        await P.evaluate(() => { const c = document.getElementById('rb-complain'); if (c) c.click(); });
        await sleep(600);
        const ch = await P.evaluate(() => { const e = document.getElementById('rb-complain-choices'); if (!e) return null; const r = e.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height * 0.75, sh: e.scrollHeight, ch: e.clientHeight, top0: e.scrollTop, shown: r.height > 0 }; });
        let f2 = null;
        if (ch && ch.shown && ch.sh > ch.ch + 20) {
            await swipe(P, ch.x, ch.y, Math.min(100, ch.y - 10), 8);
            f2 = Object.assign(ch, { top1: await P.evaluate(() => document.getElementById('rb-complain-choices').scrollTop) });
            check('F2 the bug report\'s checklist scrolls under a finger', f2.top1 > 20, JSON.stringify(f2));
        } else console.log('  (F2 skipped — the checklist fits this screen: ' + JSON.stringify(ch) + ')');
        await P.evaluate(() => { const p = document.getElementById('rb-complain-panel'); if (p) p.hidden = true; const c = document.getElementById('rb-complain'); if (c) c.classList.remove('open'); });
        // the end of the game: Q4, 0:00, the offense ahead 21-7 on both phones; the next drive staged meets the horn
        await L.setQuarter([OFF.page, DEF.page], 4, 0);
        await L.setDown(OFF.page, { clk: 0, score: [21, 7] });
        await DEF.page.evaluate(() => { const s = RB.engineState(); s.setUserScore(7); s.setOpponentScore(21); });
        const staged = await P.evaluate(() => { try { return String(window._rb2p_forceUserOffenseDrive(-20, true)); } catch (e) { return 'err ' + e.message; } });
        const fin = await L.until(async () => ({ ok: await P.evaluate(() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display !== 'none' && f.querySelector('.rb-scroll')); }) }), 40000, 500);
        console.log('  the horn: forceUserOffenseDrive → ' + staged + '; the FINAL on screen after ' + (fin.ms === null ? 'never' : (fin.ms / 1000).toFixed(1) + ' s'));
        if (fin.ms === null) { check('setup: the game ended at the Q4 horn and the FINAL screen showed', false, staged); return; }
        await sleep(1500);
        const sc0 = await P.evaluate(() => { const s = document.querySelector('#rb-final .rb-scroll'); return { sh: s.scrollHeight, ch: s.clientHeight, top: s.scrollTop }; });
        // F3: one swipe up the middle of the screen
        await recordMoves(P);
        await swipe(P, vp.w / 2, vp.h * 0.8, vp.h * 0.55, 10);
        const top1 = await P.evaluate(() => document.querySelector('#rb-final .rb-scroll').scrollTop);
        const moves = await P.evaluate(() => window.__fsMoves.slice());
        check('F3 the FINAL screen is taller than the phone and a finger swipe scrolls it',
              sc0.sh > sc0.ch + 50 && top1 > 60, JSON.stringify({ scroller: sc0, scrollTopAfterSwipe: top1, cancelledMoves: moves.filter(Boolean).length + '/' + moves.length }));
        // F4: keep swiping to BACK TO LOBBY
        for (let i = 0; i < 12; i++) {
            const done = await P.evaluate(() => { const s = document.querySelector('#rb-final .rb-scroll'); return s.scrollTop + s.clientHeight >= s.scrollHeight - 2; });
            if (done) break;
            await swipe(P, vp.w / 2, vp.h * 0.8, vp.h * 0.55, 10);
        }
        const btn = await P.evaluate(() => { const b = document.getElementById('rb-final-leave'); const r = b.getBoundingClientRect(); const s = document.querySelector('#rb-final .rb-scroll');
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, scrollTop: s.scrollTop, max: s.scrollHeight - s.clientHeight }; });
        check('F4 swiping on, BACK TO LOBBY comes fully on screen', btn.top >= 0 && btn.bottom <= btn.h, JSON.stringify(btn));
    } catch (e) {
        fail++; console.log('  FAIL  ' + (e && e.message || e));
    } finally {
        await g.cleanup();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
