// e2e/v419-scroll.js — F1: a scrolled page must not move where a tap lands.
//
// BUZT/EQSX/GJRF/VXAU (iPhone and iPad Safari, un-rotated): the page scrolled by
// 137-443px and every tap landed that far off target — the engine read page
// coordinates while measuring the canvas in viewport coordinates.
//
//   T1  a landscape touch phone boots un-rotated with the mobile layer on
//   T2  the same screen point, touched before and after a 150,100 scroll, lands on the same engine point
//   T3  the same holds for a mouse click on a desktop page
//   T4  (V440) a phone held upright gets the turn-sideways screen, never a rotated game; turned sideways, taps land
//       where the finger is, scrolled page or not
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// the engine's pointer, and where the finger is on the DISPLAYED canvas (its current rect)
async function engineXY(page, sx, sy) {
    return page.evaluate((sx, sy) => { try { const r = document.getElementById('canvas').getBoundingClientRect();
        return { e: [_m01(0), _o01(0)], rel: [sx - r.left, sy - r.top] }; } catch (e) { return null; } }, sx, sy);
}
// a tap lands where the finger is: the engine point follows the finger's canvas position
// (scale calibrated from the unscrolled tap), whether or not the canvas moved with the scroll
function lands(before, after) {
    if (!before || !after) return false;
    const kx = before.e[0] / before.rel[0], ky = before.e[1] / before.rel[1];
    return Math.abs(after.e[0] - after.rel[0] * kx) <= 2 && Math.abs(after.e[1] - after.rel[1] * ky) <= 2;
}
async function makeScrollable(page, sx, sy) {
    return page.evaluate((sx, sy) => {
        let sp = document.getElementById('v419-spacer');
        if (!sp) { sp = document.createElement('div'); sp.id = 'v419-spacer'; sp.style.cssText = 'position:absolute;left:0;top:0;width:4000px;height:4000px;pointer-events:none;'; document.documentElement.appendChild(sp); }
        window.scrollTo(sx, sy);
        return [window.scrollX, window.scrollY];
    }, sx, sy);
}

(async () => {
    console.log('=== V419 SCROLL-PROOF INPUT ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();

    // ---- touch phone, landscape (un-rotated) ----
    const page = await browser.newPage();
    await page.setViewport({ width: 874, height: 402, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Harness'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded' });
    await sleep(9000);
    const t1 = await page.evaluate(() => ({ mobile: document.documentElement.classList.contains('rb-mobile'), rot: document.documentElement.classList.contains('rb-rot90'), coarse: matchMedia('(hover: none) and (pointer: coarse)').matches }));
    check('T1 a landscape touch phone boots with the mobile layer on and un-rotated', t1.mobile && !t1.rot, JSON.stringify(t1));
    await H.enterMatch(page);
    await page.evaluate(() => document.documentElement.classList.add('rb-in-match'));
    const cdp = await page.target().createCDPSession();
    const touchAt = async (x, y) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await sleep(60);
        const xy = await engineXY(page, x, y);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(200);
        return xy;
    };
    const before = await touchAt(500, 200);
    const scrolled = await makeScrollable(page, 150, 100);
    const after = await touchAt(500, 200);   // same SCREEN point
    await page.evaluate(() => { window.scrollTo(0, 0); const sp = document.getElementById('v419-spacer'); if (sp) sp.remove(); });
    check('T2 touch: with the page scrolled, a tap still lands where the finger is on the displayed canvas ' + JSON.stringify(scrolled),
          scrolled[0] > 0 && lands(before, after),
          JSON.stringify({ before, after, scrolled }));
    await page.close();

    // ---- touch phone held UPRIGHT. V440: never rotated — the turn-sideways screen covers it; turned sideways, the
    //      un-rotated game takes taps where the finger is, scrolled page or not (the owner: "make sure the orientation
    //      on phone is optimal and NEVER switches ... play in landscape only") ----
    const pp = await browser.newPage();
    await pp.setViewport({ width: 402, height: 874, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await pp.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Harness'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
    await pp.goto(H.url(), { waitUntil: 'domcontentloaded' });
    await sleep(9000);
    const upright = await pp.evaluate(() => ({ rot: document.documentElement.classList.contains('rb-rot90'), portrait: document.documentElement.classList.contains('rb-portrait'),
        turn: getComputedStyle(document.getElementById('rb-turn') || document.body).display, bodyT: getComputedStyle(document.body).transform }));
    await H.enterMatch(pp);
    await pp.evaluate(() => document.documentElement.classList.add('rb-in-match'));
    await pp.setViewport({ width: 874, height: 402, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });   // turned sideways
    await sleep(2500);
    const sideways = await pp.evaluate(() => ({ portrait: document.documentElement.classList.contains('rb-portrait'), turn: getComputedStyle(document.getElementById('rb-turn') || document.body).display }));
    const pcdp = await pp.target().createCDPSession();
    const ptouch = async (x, y) => {
        await pcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await sleep(60); const xy = await engineXY(pp, x, y);
        await pcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(200);
        return xy;
    };
    const pBefore = await ptouch(500, 200);
    const pScrolled = await makeScrollable(pp, 60, 120);
    const pAfter = await ptouch(500, 200);
    await pp.evaluate(() => { window.scrollTo(0, 0); const sp = document.getElementById('v419-spacer'); if (sp) sp.remove(); });
    check('T4 a phone held upright gets the turn-sideways screen, never a rotated game; turned sideways, a tap lands where the finger is, scrolled ' + JSON.stringify(pScrolled),
          !upright.rot && upright.portrait && upright.turn === 'flex' && upright.bodyT === 'none' && !sideways.portrait && sideways.turn === 'none' && (pScrolled[0] > 0 || pScrolled[1] > 0) && lands(pBefore, pAfter),
          JSON.stringify({ upright, sideways, pBefore, pAfter, pScrolled }));
    await pp.close();

    // ---- desktop mouse ----
    const dp = await browser.newPage();
    await dp.setViewport({ width: 900, height: 560 });
    await dp.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Harness'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
    await dp.goto(H.url(), { waitUntil: 'domcontentloaded' });
    await sleep(9000);
    await H.enterMatch(dp);
    await dp.mouse.move(520, 260); await sleep(150);
    const mBefore = await engineXY(dp, 520, 260);
    const mScrolled = await makeScrollable(dp, 150, 100);
    await dp.mouse.move(521, 260); await dp.mouse.move(520, 260); await sleep(150);
    const mAfter = await engineXY(dp, 520, 260);
    await dp.evaluate(() => { window.scrollTo(0, 0); const sp = document.getElementById('v419-spacer'); if (sp) sp.remove(); });
    check('T3 mouse: with the page scrolled, a click still lands where the pointer is on the displayed canvas ' + JSON.stringify(mScrolled),
          mScrolled[0] > 0 && lands(mBefore, mAfter),
          JSON.stringify({ mBefore, mAfter, mScrolled }));
    await dp.close();

    await browser.close();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
