// e2e/roster-back.js — V447 (the owner: "clicking the back button takes too many clicks on iphone, this is when we go
// view rosters"). The lobby's VIEW ROSTER on an emulated iPhone 13 held sideways: WebKit (Safari's engine) with touch,
// plus Chromium for a real touch swipe (WebKit's driver has no touch move).
//   R1  from the roster grid, ONE tap of BACK is the lobby
//   R2  from a player's card, ONE tap of BACK is the lobby (V86 took it to the grid: two taps)
//   R3  a card's ◀ ROSTER is the grid, still in the preview; the grid shows no ◀ ROSTER
//   R4  a swipe that ends on another card opens nothing (the engine opens the card under a lifted finger) — WebKit
//       pointer events, and a real Chromium touch swipe
//   R5  BACK acts on the finger lifting even when the browser sends no click (iOS drops it when the finger moves a
//       little), and the click that does follow never lands on the lobby that appeared under the finger
const fs = require('fs'), path = require('path'), os = require('os');
const H = require('./harness');
const pw = require('playwright');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function launch(kind) {
    try { return await pw[kind].launch(); } catch (e) {
        if (kind === 'chromium') return pw.chromium.launch({ executablePath: H.CHROME });   // the suite's Google Chrome
        if (kind !== 'webkit') throw e;
        // the bundled WebKit for this Playwright may be missing; use the newest installed build
        const dir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
        const builds = fs.readdirSync(dir).filter(d => /^webkit-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
        if (!builds.length) throw e;
        return pw.webkit.launch({ executablePath: path.join(dir, builds[0], 'pw_run.sh') });
    }
}
async function phone(kind) {
    const br = await launch(kind);
    const ctx = await br.newContext({ ...pw.devices['iPhone 13 landscape'] });
    // a returning player: the one-time news box dismissed, a name given
    await ctx.addInitScript(() => { try { localStorage.setItem('rb2p_news_v387', '1'); localStorage.setItem('rb2p_name', 'Roster Test'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(H.url());
    await page.waitForFunction(() => { try { return typeof window._rb2p_previewRoster === 'function' && _ft._gt() >= 0; } catch (e) { return false; } }, null, { timeout: 90000 });
    await sleep(1500);
    return { br, ctx, page };
}
const state = page => page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!(e && getComputedStyle(e).display !== 'none'); };
    return { room: _ft._gt(), preview: !!window._rb2p_rosterPreviewActive, back: vis('rb-preview-back'), roster: vis('rb-preview-roster'),
             lobby: getComputedStyle(document.getElementById('rb-lobby')).display };
});
async function open(page) {
    if ((await state(page)).preview) { await page.evaluate(() => window._rb2p_exitRosterPreview()); await sleep(400); }
    await page.evaluate(() => document.getElementById('rb-view-roster').click());   // the lobby's VIEW ROSTER
    await page.waitForFunction(() => _ft._gt() === 25 && getComputedStyle(document.getElementById('rb-preview-back')).display === 'block', null, { timeout: 10000 });
    await sleep(900);
}
const center = (page, id) => page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
const canvasAt = (page, fx, fy) => page.evaluate(({ fx, fy }) => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, { fx, fy });
async function tapCard(page) {   // a real tap on the first card that opens
    for (const [fx, fy] of [[0.3, 0.3], [0.45, 0.3], [0.3, 0.62], [0.6, 0.3]]) {
        const p = await canvasAt(page, fx, fy); await page.touchscreen.tap(p.x, p.y); await sleep(900);
        if ((await state(page)).room === 22) return true;
    }
    return false;
}
const ptr = (page, el, steps) => page.evaluate(({ el, steps }) => {   // pointer events only — no click follows
    const t = el === 'canvas' ? document.getElementById('canvas') : document.getElementById(el);
    for (const [type, x, y] of steps) t.dispatchEvent(new PointerEvent(type, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
}, { el, steps });

(async () => {
    console.log('=== V447 ROSTER BACK (iPhone 13, sideways) ===');
    await H.ensureServer();
    const W = await phone('webkit');
    const page = W.page;
    try {
        // R1
        await open(page);
        let b = await center(page, 'rb-preview-back'); await page.touchscreen.tap(b.x, b.y); await sleep(800);
        const r1 = await state(page);
        check('R1 from the roster grid, one tap of BACK is the lobby', !r1.preview && r1.lobby === 'flex', JSON.stringify(r1));
        // R2 + R3
        await open(page);
        const opened = await tapCard(page);
        const onCard = await state(page);
        await (async () => {
            if (!opened) { check('R2 (setup) a tap on a card opens it', false, JSON.stringify(onCard)); return; }
            const r = await center(page, 'rb-preview-roster').catch(() => null);
            if (r && onCard.roster) { await page.touchscreen.tap(r.x, r.y); await sleep(800); }
            const r3 = await state(page);
            check('R3 a card\'s ◀ ROSTER is the grid, still in the preview, and the grid shows no ◀ ROSTER',
                  onCard.roster && r3.room === 25 && r3.preview && !r3.roster, JSON.stringify({ onCard, after: r3 }));
            if (!(await tapCard(page))) { check('R2 (setup) a tap on a card opens it again', false); return; }
            b = await center(page, 'rb-preview-back'); await page.touchscreen.tap(b.x, b.y); await sleep(800);
            const r2 = await state(page);
            check('R2 from a player\'s card, one tap of BACK is the lobby', !r2.preview && r2.lobby === 'flex', JSON.stringify(r2));
        })();
        // R4 (WebKit pointer events): down on a card, a swipe to the next card, up there
        await open(page);
        const a = await canvasAt(page, 0.3, 0.3), c2 = await canvasAt(page, 0.45, 0.3);
        await ptr(page, 'canvas', [['pointerdown', a.x, a.y], ['pointermove', a.x + 20, a.y], ['pointermove', (a.x + c2.x) / 2, a.y], ['pointerup', c2.x, c2.y]]);
        await sleep(900);
        const r4w = await state(page);
        // R5: BACK pressed, the finger slides 6 px, lifts — no click from the browser
        const bb = await center(page, 'rb-preview-back');
        await page.evaluate(() => { window.__lobbyClicks = 0; document.getElementById('rb-lobby').addEventListener('click', () => { window.__lobbyClicks++; }); });
        await ptr(page, 'rb-preview-back', [['pointerdown', bb.x, bb.y], ['pointermove', bb.x + 6, bb.y + 3], ['pointerup', bb.x + 6, bb.y + 3]]);
        await sleep(800);
        const r5a = await state(page);
        // ... and a real tap whose click follows: it must not reach the lobby now under the finger
        await open(page);
        await page.evaluate(() => { window.__lobbyClicks = 0; });
        b = await center(page, 'rb-preview-back'); await page.touchscreen.tap(b.x, b.y); await sleep(900);
        const r5b = await page.evaluate(() => window.__lobbyClicks);
        check('R5 BACK acts on the finger lifting with no click from the browser, and its click never lands on the lobby',
              !r5a.preview && r5a.lobby === 'flex' && r5b === 0, JSON.stringify({ noClick: r5a, lobbyClicksAfterTap: r5b }));
        // R4 (Chromium real touch): the same swipe through the browser's touch input
        const C = await phone('chromium');
        let r4c = null;
        try {
            await open(C.page);
            const cdp = await C.ctx.newCDPSession(C.page);
            const p0 = await canvasAt(C.page, 0.3, 0.3), p1 = await canvasAt(C.page, 0.45, 0.3);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y }] });
            for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x + (p1.x - p0.x) * i / 6, y: p0.y }] }); await sleep(30); }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await sleep(900);
            r4c = await state(C.page);
            // control: a plain tap still opens a card here
            const tapOpens = await tapCard(C.page);
            r4c.tapStillOpens = tapOpens;
        } finally { await C.br.close(); }
        check('R4 a swipe that ends on another card opens nothing (WebKit pointer + Chromium real touch); a tap still opens a card',
              r4w.room === 25 && r4w.preview && r4c && r4c.room === 25 && r4c.tapStillOpens === true, JSON.stringify({ webkit: r4w, chromium: r4c }));
    } catch (e) {
        fail++; console.log('  FAIL  ' + (e && e.message || e));
    } finally {
        await W.br.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
