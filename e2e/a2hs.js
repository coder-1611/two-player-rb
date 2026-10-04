// e2e/a2hs.js — V457: an iPhone's first visit suggests adding the game to the Home Screen (the owner: "if the phone is an
// iphone, tell them to add it to home screen for a better experience ... There should be a pop up on iphone for first time
// visitors saying to add it to home page"). WebKit (Safari's engine) as an iPhone 13; Chromium as a desktop and an Android.
//   A1  a first visit (sideways): the first-run news first, then the Home Screen popup — never both at once
//   A2  it is on top of the lobby          A3  GOT IT closes it, and it never comes back (localStorage rb2p_a2hs_v457)
//   B1  upright (news seen): it shows, inside the screen      B2  over the turn-sideways screen
//   C1  opened from the Home Screen (navigator.standalone): no popup, and the visit record says app
//   D1  inside a frame (the Google Sites embed): no popup     E1  a desktop browser / an Android phone: no popup
const fs = require('fs'), path = require('path'), os = require('os');
const H = require('./harness');
const pw = require('playwright');
const SP = process.env.A2HS_SHOTS ? process.env.A2HS_SHOTS.replace(/\/?$/, '/') : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:' + H.PORT + '/index.html';
const vis = (page, id) => page.evaluate(id => { const e = document.getElementById(id); return !!(e && !e.hidden && getComputedStyle(e).display !== 'none'); }, id).catch(() => null);
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
(async () => {
    console.log('=== V457 IPHONE: ADD TO HOME SCREEN ===');
    await H.ensureServer();
    const dir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'); const wk = fs.readdirSync(dir).filter(d => /^webkit-\d+$/.test(d)).sort().pop();
    const webkit = await pw.webkit.launch({ executablePath: path.join(dir, wk, 'pw_run.sh') });
    const iphone = pw.devices['iPhone 13'];
    try {
        // A: a first visit, sideways — the news first, then this popup
        let ctx = await webkit.newContext(Object.assign({}, iphone, { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } }));
        let page = await ctx.newPage(); await page.goto(URL + '?cb=' + Date.now());
        await sleep(2500);
        const newsUp = await vis(page, 'rb-news'), a2hsBeforeNews = await vis(page, 'rb-a2hs');
        await page.click('#rb-news-ok', { timeout: 8000 }).catch(e => console.log('  (news click: ' + String(e.message).split('\n')[0] + ')'));
        await sleep(1500);
        const a2hsUp = await vis(page, 'rb-a2hs');
        if (SP) await page.screenshot({ path: SP + 'a2hs-landscape.png' });
        const onTop = await page.evaluate(() => { const b = document.querySelector('#rb-a2hs .box').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + 20); return !!(e && e.closest('#rb-a2hs')); });
        check('A1 first visit on an iPhone: the news first, then the Home Screen popup (not both at once)', newsUp && !a2hsBeforeNews && a2hsUp, JSON.stringify({ newsUp, a2hsBeforeNews, a2hsUp }));
        check('A2 it is on top of the lobby', onTop);
        await page.click('#rb-a2hs-ok');
        await sleep(300);
        const gone = !(await vis(page, 'rb-a2hs')), flag = await page.evaluate(() => localStorage.getItem('rb2p_a2hs_v457'));
        await page.reload(); await sleep(3000);
        const again = await vis(page, 'rb-a2hs');
        check('A3 GOT IT closes it, and it never comes back', gone && flag === '1' && !again, JSON.stringify({ gone, flag, again }));
        await ctx.close();
        // B: upright, news already seen — straight to the popup, over the turn-sideways screen
        ctx = await webkit.newContext(Object.assign({}, iphone));
        await ctx.addInitScript(() => { try { localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
        page = await ctx.newPage(); await page.goto(URL + '?cb=' + Date.now()); await sleep(2800);
        const land = await vis(page, 'rb-a2hs');
        const fits = await page.evaluate(() => { const b = document.querySelector('#rb-a2hs .box'); const r = b.getBoundingClientRect(); const btn = document.getElementById('rb-a2hs-ok').getBoundingClientRect();
            return { boxTop: Math.round(r.top), boxBottom: Math.round(r.bottom), vh: innerHeight, scrollable: b.scrollHeight > b.clientHeight, btnBottom: Math.round(btn.bottom) }; });
        const onTopB = await page.evaluate(() => { const b = document.querySelector('#rb-a2hs .box').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + 20); return !!(e && e.closest('#rb-a2hs')); });
        if (SP) await page.screenshot({ path: SP + 'a2hs-portrait.png' });
        check('B2 upright: it is over the turn-sideways screen', onTopB);
        check('B1 upright: the popup shows, inside the screen (scrolls inside if taller)', land && fits.boxTop >= 0 && fits.boxBottom <= fits.vh, JSON.stringify(fits));
        await ctx.close();
        // C: from the Home Screen (standalone) — never
        ctx = await webkit.newContext(Object.assign({}, iphone));
        await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true }); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
        page = await ctx.newPage(); await page.goto(URL + '?cb=' + Date.now()); await sleep(2800);
        const sa = await vis(page, 'rb-a2hs'), appFlag = await page.evaluate(() => window._rb2p_whereAmI().app);
        check('C1 opened from the Home Screen: no popup, and the visit says app', !sa && appFlag === true, JSON.stringify({ sa, appFlag }));
        await ctx.close();
        // D: inside a frame (the Google Sites embed) — never
        ctx = await webkit.newContext(Object.assign({}, iphone));
        await ctx.addInitScript(() => { try { localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
        page = await ctx.newPage(); await page.setContent('<iframe id="f" src="' + URL + '?cb=' + Date.now() + '" width="390" height="600"></iframe>'); await sleep(4000);
        const fr = page.frames().find(f => /index\.html/.test(f.url()));
        const inFrame = fr ? await fr.evaluate(() => { const e = document.getElementById('rb-a2hs'); return !!(e && !e.hidden); }).catch(() => 'err') : 'no frame';
        check('D1 inside a frame (the Google Sites embed): no popup', inFrame === false, JSON.stringify({ inFrame }));
        await ctx.close();
    } finally { await webkit.close(); }
    // E: a desktop browser and an Android phone — never
    const chromium = await pw.chromium.launch({ executablePath: H.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        for (const [label, opts] of [['desktop', {}], ['Android', pw.devices['Pixel 7']]]) {
            const ctx = await chromium.newContext(Object.assign({}, opts));
            await ctx.addInitScript(() => { try { localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
            const page = await ctx.newPage(); await page.goto(URL + '?cb=' + Date.now()); await sleep(2800);
            check('E1 ' + label + ': no popup', !(await vis(page, 'rb-a2hs')));
            await ctx.close();
        }
    } finally { await chromium.close(); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
