// e2e/probe-legal-line.js — V535: the lobby's credit / not-affiliated / rights-holders line at three sizes: on the screen,
// overlapping nothing; screenshots for a look
const H = require('./harness');
const OUT = process.env.SHOT_DIR || '/tmp';
(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        for (const [name, vp, ua] of [['desktop', { width: 1280, height: 800 }], ['chromebook', { width: 1366, height: 657 }],
                                      ['phone', { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1']]) {
            const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
            if (ua) await page.setUserAgent(ua);
            await page.setViewport(vp);
            await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Look'); localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_news_v387', '1'); localStorage.setItem('rb2p_ann_refresh_v1', '1'); } catch (e) {} });
            await page.goto(process.env.PROBE_URL || H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
            await page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry' && !!document.querySelector('.rb-entry-foot'), { timeout: 90000 });
            await H.sleep(5000);
            const r = await page.evaluate(() => {
                const L = document.querySelector('.rb-legal') || document.querySelector('.rb-entry-foot .rb-links'), b = L.getBoundingClientRect(), cs = getComputedStyle(L);
                const sc = L.closest('.rb-screen'), scroll = sc ? sc.scrollHeight - sc.clientHeight : 0;
                const hits = [];
                for (const el of document.querySelectorAll('#rb-lobby .rb-screen[data-view="entry"] *')) {
                    if (el === L || L.contains(el) || el.contains(L) || !el.offsetParent) continue;
                    const c = el.getBoundingClientRect(); if (c.width < 2 || c.height < 2) continue;
                    if (getComputedStyle(el).visibility === 'hidden') continue;
                    const ov = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left)) * Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
                    if (ov > 4 && el.children.length === 0) hits.push((el.id || el.className || el.tagName).toString().slice(0, 30));
                }
                // every footer line against the lobby's controls above it (a squeezed foot rides up into the buttons)
                const foot = document.querySelector('#rb-lobby .rb-entry-foot'), fb = foot ? foot.getBoundingClientRect() : null, upper = [];
                for (const el of document.querySelectorAll('#rb-lobby .rb-entry-main button, #rb-lobby .rb-entry-main input, #rb-lobby .rb-entry-main .prompt')) {
                    const c = el.getBoundingClientRect(); if (!c.width || !fb) continue;
                    for (const ln of foot.querySelectorAll('p, .rb-gsites')) { const d = ln.getBoundingClientRect(); if (!d.height || getComputedStyle(ln).display === 'none') continue;
                        const ov = Math.max(0, Math.min(c.right, d.right) - Math.max(c.left, d.left)) * Math.max(0, Math.min(c.bottom, d.bottom) - Math.max(c.top, d.top));
                        if (ov > 4) upper.push((el.id || el.textContent.trim().slice(0, 14)) + ' x ' + (ln.id || ln.className).toString().slice(0, 20)); }
                }
                return { footCollides: upper.slice(0, 5), shown: cs.display !== 'none' && b.height > 0, top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight, inView: b.top >= 0 && b.bottom <= innerHeight, lines: Math.round(b.height / parseFloat(cs.lineHeight)), scroll, overlaps: hits.slice(0, 5), solo: document.getElementById('rb-solo-link').href };
            });
            console.log(name.padEnd(11), JSON.stringify(r));
            await page.screenshot({ path: OUT + '/' + name + '.png' });
            await ctx.close();
        }
    } finally { await browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
