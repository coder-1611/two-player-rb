// e2e/blue-circle.js — "clicking on the blue circle didn't work": the RB hand-off with REAL trusted input.
//
// The player taps/clicks the blue circle the engine draws around the running back's feet (ball kp 0,
// the pre-snap). Each check finds the circle WHERE IT IS DRAWN (a screenshot, the ring recoloured for
// that one frame) and presses there with trusted input (CDP mouse / touch), then reads the ball:
// kp 19 = BALL_HANDOFF.
//
//   T1  Chromebook touchpad tap-to-click: mouse down+up back to back (one frame) on the circle hands off   (fails before B)
//   T2  an ordinary 90 ms click on the circle hands off (control: passes before and after)
//   T3  landscape iPhone (852x283, the JCTW window): a press low on the screen is answered at all           (fails before C)
//   T4  landscape iPhone: a tap on the circle hands off                                                    (fails before C when the RB stands low)
//   T5  portrait phone (html.rb-rot90, 390x844): a tap on the circle hands off                             (fails before D)
//       — obsolete since V440: an upright phone gets the turn-sideways screen, nothing is rotated (run with ONLY=…)
//   T6  a desktop page scrolled by (40,120): a click on the circle still hands off (the scroll hypothesis; passes on V437)
//
// vs-KC flow (H.enterMatch) — the input mapping under test does not involve Firebase, and every Firebase
// request is blocked, so nothing is written anywhere. TWO_P=1 runs T1+T2 in a real two-player game instead
// (e2e/two-player.js: a harness room, deleted after).
//   RB_E2E_PORT=8840 node e2e/blue-circle.js            ONLY=T1,T3
const H = require('./harness');
const { PNG } = require('pngjs');
const sleep = H.sleep;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = t => ONLY ? ONLY.has(t) : t !== 'T5';   // V441: T5 (the rotated portrait phone) only on request — V440 never rotates
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  — ' + d : '')); };

const ST = () => {
    const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    let ball = null, rb = null, btn = 0;
    for (const x of inst) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2;
        if (n === 'obj_ball') ball = x; else if (n === 'obj_playerOF' && x._O01 === 2) rb = x;
        else if (/btn|button/.test(n) && !/audible|timeout|store|buy|restore|appstore/.test(n)) btn++; }
    return { kp: ball ? ball._kp : null, rb: rb ? { x: rb.x, y: rb.y } : null, btn, waiting: window._rb2p_userIsWaitingForOpponent === true };
};
async function blockFirebase(page) {
    await page.setRequestInterception(true);
    page.on('request', r => { /firebaseio\.com|identitytoolkit|securetoken|googleapis\.com/.test(r.url()) ? r.abort() : r.continue(); });
}
async function openMatch(browser, vp) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await blockFirebase(page);
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Harness'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(9000);
    await H.enterMatch(page);
    return page;
}
// a set play on this page: ball at rest (kp 0), the RB standing still, no dialog (a dialog is answered with its centre)
async function waitSet(page, ms) {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < (ms || 40000)) {
        const s = await page.evaluate(ST);
        if (s.btn) {
            const b = await page.evaluate(() => { for (const x of _Sc2._GL2._oq2) if (x && !x._HL2 && x._eE2 && /btn|button/.test(x._eE2._fE2) && !/audible|timeout|store|buy|restore|appstore/.test(x._eE2._fE2)) return { x: x.x, y: x.y, w: x._8l1 || 40, h: x._VI || 16 }; return null; });
            const c = await page.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
            if (b && !page.__touch) { await page.mouse.click(c.l + (b.x + b.w / 2) / 480 * c.w, c.t + (b.y + b.h / 2) / 270 * c.h, { delay: 80 }); await sleep(900); continue; }
        }
        if (s.kp === 0 && !s.waiting && s.rb && last && last.rb && Math.hypot(s.rb.x - last.rb.x, s.rb.y - last.rb.y) < 0.5) return s;
        last = s; await sleep(300);
    }
    return null;
}
// where the blue circle is drawn (screen px): recolour it magenta, hide the RB's (same-colour) route, screenshot, restore
async function findRing(page, dpr) {
    const save = await page.evaluate(() => { let rb = null; for (const x of _Sc2._GL2._oq2) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF' && x._O01 === 2) rb = x;
        const s = { gi1: global._gi1, w: rb._W01 }; global._gi1 = 0xFF00FF; rb._W01 = -1; return s; });
    await sleep(250);
    const shot = PNG.sync.read(await page.screenshot({ type: 'png' }));
    await page.evaluate(sv => { global._gi1 = sv.gi1; for (const x of _Sc2._GL2._oq2) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF' && x._O01 === 2) x._W01 = sv.w; }, save);
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < shot.height; y++) for (let x = 0; x < shot.width; x++) { const i = (y * shot.width + x) * 4;
        if (shot.data[i] > 200 && shot.data[i + 1] < 60 && shot.data[i + 2] > 200) { sx += x; sy += y; n++; } }
    return n ? { x: sx / n / dpr, y: sy / n / dpr, px: n } : null;
}
// every write to the ball's state (kp) while recording — a setter on the live ball instance, so a state that
// lasts a single engine step (a deadzone press caught up inside one frame) is still seen
async function rec(page, on) {
    if (on) return page.evaluate(() => {
        let b = null; for (const x of _Sc2._GL2._oq2) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { b = x; break; }
        window.__bc = [b ? b._kp : null]; if (!b) return;
        let v = b._kp; window.__bcBall = b;
        Object.defineProperty(b, '_kp', { configurable: true, enumerable: true, get() { return v; }, set(n) { if (n !== v) window.__bc.push(n); v = n; } });
    });
    return page.evaluate(() => { const b = window.__bcBall; if (b) { const v = b._kp; delete b._kp; b._kp = v; window.__bcBall = null; } return window.__bc; });
}
async function press(page, x, y, holdMs) {
    if (page.__touch) {
        const c = page.__cdp || (page.__cdp = await page.target().createCDPSession());
        await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(holdMs);
        await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
        await page.mouse.move(x, y); await sleep(60);
        if (holdMs === 0) await Promise.all([page.mouse.down(), page.mouse.up()]);   // down and up back to back: a touchpad tap-to-click
        else { await page.mouse.down(); await sleep(holdMs); await page.mouse.up(); }
    }
}
// press the drawn circle; returns 'HANDOFF' | 'missed' | 'ignored'
async function tapRing(page, dpr, holdMs, label) {
    const s = await waitSet(page); if (!s) return { v: 'no set play' };
    let ring = null;
    for (let i = 0; i < 10; i++) { const r1 = await findRing(page, dpr); await sleep(300); const r2 = await findRing(page, dpr);
        if (r1 && r2 && Math.hypot(r1.x - r2.x, r1.y - r2.y) < 2) { ring = r2; break; } }
    if (!ring) return { v: 'ring not found / camera still moving' };
    await rec(page, true);
    await press(page, ring.x, ring.y, holdMs);
    await sleep(500);
    const ks = await rec(page, false);
    const v = ks.includes(19) ? 'HANDOFF' : (ks.includes(1) || ks.includes(2)) ? 'missed' : 'ignored';
    console.log('      ' + label + ': circle drawn at ' + Math.round(ring.x) + ',' + Math.round(ring.y) + ' (' + Math.round(100 * ring.y / (await page.evaluate(() => innerHeight))) + '% down), press ' + holdMs + ' ms -> ' + v + ' ' + JSON.stringify(ks));
    if (v === 'HANDOFF') { for (let i = 0; i < 40; i++) { await sleep(250); const e = await page.evaluate(ST); if (e.kp === 4 || e.kp === 0 || e.btn) break; } await sleep(1500); }
    return { v, ring };
}

(async () => {
    console.log('=== BLUE CIRCLE: the RB hand-off with real input ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    let tp = null;
    try {
        if (want('T1') || want('T2') || want('T6')) {
            // which page has the ball (in a real two-player game it can change hands at a 4th down)
            let pages;
            if (process.env.TWO_P === '1') {
                const TP = require('./two-player');
                tp = await TP.startTwoPlayerGame({ browser });
                pages = [tp.a.page, tp.b.page];
                console.log('  (real two-player game, room ' + tp.code + ')');
            }
            const ballPage = async (fresh) => {
                if (!pages) return fresh();
                for (let i = 0; i < 120; i++) { for (const p of pages) { const s = await p.evaluate(ST).catch(() => null); if (s && s.kp === 0 && !s.waiting && s.rb) return p; } await sleep(500); }
                return null;
            };
            if (want('T1')) {
                let page = await ballPage(() => openMatch(browser, { width: 1366, height: 657 }));   // a 1366x768 Chromebook's browser window
                let ok = 0, n = 0;
                for (let i = 0; i < 3 && page; i++) { const r = await tapRing(page, 1, 0, 'T1 click ' + (i + 1)); if (/HANDOFF|missed|ignored/.test(r.v)) { n++; if (r.v === 'HANDOFF') ok++; } if (pages) page = await ballPage(); }
                check('T1 a one-frame click (touchpad tap-to-click) on the blue circle hands off: ' + ok + '/' + n, n >= 2 && ok === n);
                if (!pages && page) await page.close();
            }
            if (want('T2')) {
                let page = await ballPage(() => openMatch(browser, { width: 1366, height: 657 }));
                let r = page ? await tapRing(page, 1, 90, 'T2') : { v: 'no page with the ball' };
                if (pages && r.v === 'no set play') { page = await ballPage(); r = page ? await tapRing(page, 1, 90, 'T2') : r; }   // the ball changed hands at a 4th down
                check('T2 a 90 ms click on the blue circle hands off', r.v === 'HANDOFF', r.v);
                if (!pages && page) await page.close();
            }
            if (want('T6')) {
                // the OPEN.md #9 / F1 hypothesis: a SCROLLED page moves where a click lands. Make the document
                // scrollable the way v419-scroll does, scroll it, and click the circle where it is drawn.
                let page = await ballPage(() => openMatch(browser, { width: 1366, height: 657 }));
                if (pages) { const s0 = await waitSet(page, 8000); if (!s0) page = await ballPage(); }
                const sc = await page.evaluate(() => { let sp = document.getElementById('bc-spacer'); if (!sp) { sp = document.createElement('div'); sp.id = 'bc-spacer';
                    sp.style.cssText = 'position:absolute;left:0;top:0;width:3000px;height:3000px;pointer-events:none;'; document.documentElement.appendChild(sp); }
                    window.scrollTo(40, 120); return [window.scrollX, window.scrollY]; });
                const r = page ? await tapRing(page, 1, 90, 'T6 (scrolled ' + sc + ')') : { v: 'no page with the ball' };
                await page.evaluate(() => { window.scrollTo(0, 0); const sp = document.getElementById('bc-spacer'); if (sp) sp.remove(); });
                check('T6 with the page scrolled ' + JSON.stringify(sc) + ', a click on the blue circle hands off', (sc[0] > 0 || sc[1] > 0) && r.v === 'HANDOFF', r.v);
                if (!pages && page) await page.close();
            }
        }
        if (want('T3') || want('T4')) {
            const page = await openMatch(browser, { width: 852, height: 283, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
            page.__touch = true;
            const lay = await page.evaluate(() => ({ mobile: document.documentElement.classList.contains('rb-mobile'), rot: document.documentElement.classList.contains('rb-rot90'), buf: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight] }));
            console.log('    landscape phone: ' + JSON.stringify(lay));
            if (want('T3')) {
                const s = await waitSet(page);
                // empty grass 76% down the screen, left of the formation: a press there must start a play (deadzone, kp 1)
                // V441: on the GAME picture (V440 shows it whole, with bars beside it — 6% of the WINDOW is now a bar)
                const cr = await page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
                const x = cr.l + cr.w * 0.06, y = cr.t + cr.h * 0.76;
                await rec(page, true); await press(page, x, y, 300);
                const gui = await page.evaluate(() => [_m01(0), _o01(0)]);
                await sleep(300); const ks = await rec(page, false);
                const css = await page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { t: r.top, h: r.height }; });
                const trueGy = Math.round((y - css.t) / css.h * 270);
                console.log('      T3: press at ' + Math.round(x) + ',' + Math.round(y) + ' -> engine GUI y ' + gui[1] + ' (the canvas point is GUI y ' + trueGy + '; >= 250 = the bottom button band, ignored pre-snap) -> ' + JSON.stringify(ks));
                check('T3 a press 76% down a landscape phone is answered (and maps to its GUI point)', s && (ks.includes(1) || ks.includes(2)) && Math.abs(gui[1] - trueGy) <= 3, 'engine GUI y ' + gui[1] + ' vs ' + trueGy);
            }
            if (want('T4')) {
                let r = null;
                for (let i = 0; i < 2; i++) { r = await tapRing(page, 2, 120, 'T4 tap ' + (i + 1)); if (r.v === 'HANDOFF') break; }
                check('T4 a tap on the blue circle hands off on a landscape phone', r && r.v === 'HANDOFF', r && r.v);
            }
            await page.close();
        }
        if (want('T5')) {
            const page = await openMatch(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
            page.__touch = true;
            const rot = await page.evaluate(() => document.documentElement.classList.contains('rb-rot90'));
            let ok = 0, n = 0;
            for (let i = 0; i < 2; i++) { const r = await tapRing(page, 2, 120, 'T5 tap ' + (i + 1)); if (/HANDOFF|missed|ignored/.test(r.v)) { n++; if (r.v === 'HANDOFF') ok++; } }
            check('T5 a tap on the blue circle hands off on a portrait (rotated) phone: ' + ok + '/' + n, rot && n >= 1 && ok === n, 'rb-rot90=' + rot);
            await page.close();
        }
    } catch (e) { console.log('  ERROR ' + (e && e.stack || e)); fail++; }
    if (tp) await tp.cleanup();
    await browser.close().catch(() => {});
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})();
