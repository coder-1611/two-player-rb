// e2e/lobby-phone.js — V466: the lobby on a phone held sideways (html.rb-mobile). V465's play of the day made the
// entry column taller than the screen; the phone rule centered it (justify-content:center), so it overflowed at the TOP
// too, where no scroll reaches — PLAY 2P and JOIN sat above the screen (the live V465 at 844x390: PLAY 2P at y=-485).
// The other suites press PLAY 2P from code, which works off screen; this one measures where the buttons are.
//   P1  on each phone/tablet size: the title, PLAY 2P and JOIN are on the first screen (scrollTop 0; a short phone drops
//       the football)
//   P2  the column scrolls to its very end (the play of the day and the last line are reachable)
//   P3  with no play of the day (a short column), the lobby is still centered on the screen, as before V465
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const SIZES = [[844, 390], [874, 402], [932, 430], [740, 360], [1180, 820]];

async function open(browser, w, h, seams) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2, isLandscape: w > h });
    await page.evaluateOnNewDocument((sm) => {
        Object.assign(window, sm || {});
        try { localStorage.setItem('rb2p_name', 'PhoneCheck'); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {}
    }, seams || null);
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.getElementById('rb-play2p') && document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 60000, polling: 300 });
    if (!seams || !seams._rb2p_potdSource) await page.waitForFunction(() => !document.getElementById('rb-potd').hidden, { timeout: 30000, polling: 300 }).catch(() => {});
    await sleep(800);
    return page;
}
const MEASURE = () => {
    const scr = document.querySelector('#rb-lobby .rb-screen[data-view="entry"]');
    const box = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const kids = Array.from(scr.children).filter(e => e.offsetParent !== null && getComputedStyle(e).display !== 'none');
    return { mobile: document.documentElement.classList.contains('rb-mobile'), vh: innerHeight, scrollTop: scr.scrollTop, scrollH: scr.scrollHeight, clientH: scr.clientHeight,
             scr: box(scr), football: box(document.querySelector('#rb-lobby .rb-wordmark')), play: box(document.getElementById('rb-play2p')), join: box(document.getElementById('rb-join')),
             potdShown: !document.getElementById('rb-potd').hidden, potd: box(document.getElementById('rb-potd')), first: box(kids[0]), last: box(kids[kids.length - 1]) };
};

(async () => {
    console.log('=== V466 THE LOBBY ON A SIDEWAYS PHONE ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        for (const [w, h] of SIZES) {
            const page = await open(browser, w, h);
            const m = await page.evaluate(MEASURE);
            const inView = b => b.top >= 0 && b.bottom <= m.vh;
            console.log('  ' + w + 'x' + h + ': ' + JSON.stringify({ mobile: m.mobile, scrollH: m.scrollH, clientH: m.clientH, football: m.football, play: m.play, join: m.join, potd: m.potdShown }));
            check('P1 ' + w + 'x' + h + ': the title, PLAY 2P and JOIN are on the first screen', m.mobile && m.scrollTop === 0 && inView(m.football) && inView(m.play) && inView(m.join), JSON.stringify(m));
            await page.evaluate(() => { const s = document.querySelector('#rb-lobby .rb-screen[data-view="entry"]'); s.scrollTop = s.scrollHeight; });
            await sleep(300);
            const e = await page.evaluate(MEASURE);
            check('P2 ' + w + 'x' + h + ': the column scrolls to its end (the play of the day and the last line on screen)',
                  e.potdShown && e.last.bottom <= e.scr.bottom + 1 && e.potd.bottom <= e.scr.bottom + 1 && e.football.bottom < 0, JSON.stringify({ last: e.last, potd: e.potd, scr: e.scr }));
            await page.close();
        }
        // ---- P3: a short column (no play of the day) is centered, as before V465 ----
        for (const [w, h] of [[874, 402], [1180, 820]]) {
            const page = await open(browser, w, h, { _rb2p_potdSource: {} });
            const m = await page.evaluate(MEASURE);
            const topGap = m.first.top - m.scr.top, botGap = m.scr.bottom - m.last.bottom;
            console.log('  no play of the day ' + w + 'x' + h + ': ' + JSON.stringify({ scrollH: m.scrollH, clientH: m.clientH, topGap, botGap }));
            check('P3 ' + w + 'x' + h + ': with no play of the day the lobby is centered on the screen',
                  !m.potdShown && (m.scrollH > m.clientH ? m.football.top >= 0 : Math.abs(topGap - botGap) <= 6), JSON.stringify({ topGap, botGap, scrollH: m.scrollH, clientH: m.clientH }));
            await page.close();
        }
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
