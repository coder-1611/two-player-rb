// e2e/potd-layout.js — V467: the plays of the day on the front page, at every screen size. The owner: "I don't like the
// incomplete feel of the bottom being cut off, make it more natural" (V465 put the panel under the lobby: on a 1920x855
// desktop it started 620 px down and the screen's bottom edge and the ticker cut it in half).
//   L1  a wide screen (desktops, Chromebooks, a tablet held sideways): the lobby on the left, the plays on the right — the
//       whole panel on the first screen above the ticker, nothing scrolls, PLAY 2P and JOIN whole and clear of the panel,
//       #1 the biggest thing in it
//   L2  a narrow screen (a phone held sideways, a tall window): the first screen ends between the lobby and the plays
//       (nothing cut in half), PLAY 2P and JOIN whole; the PLAYS OF THE DAY chip shows and brings the panel into view
//   L3  no play of the day: the lobby is the one centered column it always was (no grid, no chip)
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const WIDE = [[1920, 855], [1536, 730], [1366, 635], [1280, 600], [1180, 820, 'tablet']];
const NARROW = [[844, 390, 'phone'], [932, 430, 'phone'], [740, 360, 'phone'], [800, 900]];

async function open(browser, w, h, mobile, seams) {
    const page = await browser.newPage();
    await page.setViewport(mobile ? { width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2, isLandscape: w > h } : { width: w, height: h });
    await page.evaluateOnNewDocument((sm) => {
        Object.assign(window, sm || {});
        try { localStorage.setItem('rb2p_name', 'LayoutCheck'); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {}
    }, seams || null);
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.getElementById('rb-play2p') && document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 60000, polling: 300 });
    if (!seams || !seams._rb2p_potdSource) await page.waitForFunction(() => window._rb2p_potd && !document.getElementById('rb-potd').hidden, { timeout: 30000, polling: 300 });
    await sleep(1800);   // the font, then fit()
    return page;
}
const MEASURE = () => {
    const b = s => { const e = typeof s === 'string' ? document.querySelector(s) : s; if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const scr = document.querySelector('#rb-lobby .rb-screen[data-view="entry"]'), tk = document.querySelector('#rb-lobby .rb-ticker');
    const tkr = tk && getComputedStyle(tk).display !== 'none' ? tk.getBoundingClientRect().top : innerHeight;
    return { vw: innerWidth, vh: innerHeight, ticker: Math.round(tkr), mobile: document.documentElement.classList.contains('rb-mobile'),
             grid: getComputedStyle(scr).display === 'grid', scrollTop: scr.scrollTop, scrollH: scr.scrollHeight, clientH: scr.clientHeight,
             potdShown: !document.getElementById('rb-potd').hidden, potd: b('#rb-potd'), stage: b('#rb-potd .potd-stage'), cards: Array.from(document.querySelectorAll('#rb-potd .potd-card')).map(b),
             play: b('#rb-play2p'), join: b('#rb-join'), wordmark: b('#rb-lobby .rb-wordmark'), foot: b('.rb-entry-foot'), main: b('.rb-entry-main'),
             cue: document.getElementById('rb-potd-cue').hidden ? null : b('#rb-potd-cue') };
};
const r0 = m => JSON.stringify(m, (k, v) => typeof v === 'number' ? Math.round(v) : v);

(async () => {
    console.log('=== V467 THE PLAYS OF THE DAY ON EVERY SCREEN ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        for (const [w, h, kind] of WIDE) {
            const page = await open(browser, w, h, kind === 'tablet');
            const m = await page.evaluate(MEASURE);
            const whole = x => x && x.t >= 0 && x.b <= m.ticker + 0.5 && x.l >= 0 && x.r <= m.vw;
            const apart = (x, y) => x.r <= y.l || y.r <= x.l || x.b <= y.t || y.b <= x.t;
            const biggest = m.stage && m.cards.length === 2 && m.cards.every(c => m.stage.w * m.stage.h >= 3 * c.w * c.h);
            console.log('  ' + w + 'x' + h + ': ' + r0({ grid: m.grid, scroll: [m.scrollH, m.clientH], potd: m.potd, stage: [m.stage.w, m.stage.h], ticker: m.ticker, foot: m.foot && m.foot.b, wordmark: m.wordmark }));
            check('L1 ' + w + 'x' + h + (kind ? ' (' + kind + ')' : '') + ': lobby left, plays right, all on the first screen; #1 the biggest',
                  m.grid && m.potdShown && m.scrollH <= m.clientH + 1 && whole(m.potd) && whole(m.play) && whole(m.join) && whole(m.wordmark) && m.foot.b <= m.ticker + 0.5 &&
                  apart(m.play, m.potd) && apart(m.join, m.potd) && apart(m.wordmark, m.potd) && biggest && !m.cue, r0(m));
            await page.close();
        }
        for (const [w, h, kind] of NARROW) {
            const page = await open(browser, w, h, kind === 'phone');
            const m = await page.evaluate(MEASURE);
            const whole = x => x && x.t >= 0 && x.b <= Math.min(m.vh, m.ticker) + 0.5;
            console.log('  ' + w + 'x' + h + ': ' + r0({ grid: m.grid, potdTop: m.potd.t, vh: m.vh, play: m.play, join: m.join, cue: m.cue }));
            const okFirst = !m.grid && m.potd.t >= m.vh && whole(m.play) && whole(m.join) && m.cue && m.cue.b <= Math.min(m.vh, m.ticker) &&
                            (m.cue.r <= m.join.l || m.cue.l >= m.join.r || m.cue.b <= m.join.t || m.cue.t >= m.join.b);
            await page.evaluate(() => document.getElementById('rb-potd-cue').click());
            await sleep(1500);
            const m2 = await page.evaluate(MEASURE);
            check('L2 ' + w + 'x' + h + (kind ? ' (' + kind + ')' : '') + ': the first screen ends between the lobby and the plays; the chip brings them into view',
                  okFirst && m2.potd.t >= -1 && m2.potd.t < m2.vh / 3 && !m2.cue, r0({ first: { potdTop: m.potd.t, cue: m.cue, play: m.play, join: m.join }, after: { potdTop: m2.potd.t, cue: m2.cue } }));
            await page.close();
        }
        for (const [w, h, kind] of [[1920, 855], [844, 390, 'phone']]) {
            const page = await open(browser, w, h, kind === 'phone', { _rb2p_potdSource: {} });
            const m = await page.evaluate(MEASURE);
            console.log('  no play of the day ' + w + 'x' + h + ': ' + r0({ grid: m.grid, main: m.main, play: m.play, cue: m.cue }));
            check('L3 ' + w + 'x' + h + ': no play of the day — the one centered column (no grid, no chip)', !m.grid && !m.potdShown && !m.cue &&
                  Math.abs((m.play.l + m.play.r) / 2 - m.vw / 2) <= 2, r0(m));
            await page.close();
        }
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
