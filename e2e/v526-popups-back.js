// e2e/v526-popups-back.js — V526 (the owner: "remove the pop up [the announcements: the rankings, the leaving penalty],
// and from now on always add a back button to the pop ups").
//   P1  the announcement popup (NEW: RANKINGS / NEW: LEAVING RULE) is gone from the page
//   P2  every popup has a ◀ BACK at its top left, in sight on the screen, and one tap of it closes the popup: the play of
//       the day, the owner's inbox, the play-of-the-day congrats, the iPhone home-screen tip, the bug report, PLAYER FOUND,
//       the player card (RANKINGS), the challenge card
//   P3  the challenge card's BACK is not offered while a room is being made (nothing to go back to)
//   P4  on a sideways phone the BACK of the tallest popup (the iPhone tip) is on the screen without scrolling
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const POPS = ['rb-news', 'rb-inbox', 'rb-potd-congrats', 'rb-a2hs', 'rb-complain-panel', 'rb-match'];

async function open(browser, vp, ua) {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    if (ua) await page.setUserAgent(ua);
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'BackTest'); localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window._rb2p_social && document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 90000, polling: 300 });
    await sleep(1500);
    return { ctx, page };
}
// the BACK of a popup: shown, at its top, on the screen
const backOf = (page, id) => page.evaluate(i => {
    const box = document.getElementById(i), b = box && box.querySelector('.rb-back');
    if (!b) return { has: false };
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    const first = Array.from(b.parentNode.children).filter(c => getComputedStyle(c).display !== 'none')[0] === b;
    return { has: true, text: b.textContent.trim(), visible: cs.display !== 'none' && r.width > 0, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0, first };
}, id);

(async () => {
    console.log('=== V526 POPUPS: NO ANNOUNCEMENT, A BACK ON EVERY POPUP ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await open(browser, { width: 1280, height: 800 });
        // P1
        check('P1 the announcement popup (NEW: RANKINGS / NEW: LEAVING RULE) is gone', await page.evaluate(() => !document.getElementById('rb-rankintro') && !/NEW: (RANKINGS|LEAVING RULE)/.test(document.body.innerHTML)));
        // P2
        const res = {};
        for (const id of POPS) {
            await page.evaluate(i => { document.getElementById(i).hidden = false; }, id);
            await sleep(200);
            const b = await backOf(page, id);
            await page.click('#' + id + ' .rb-back');
            await sleep(300);
            res[id] = Object.assign(b, { closed: await page.evaluate(i => document.getElementById(i).hidden, id) });
        }
        await page.evaluate(() => window._rb2p_social.card({ nm: 'Card Test', r: 1100, w: 6, l: 2, n: 8, u: 'cardtest' }, 4));
        await sleep(300);
        res['rb-pcard'] = await backOf(page, 'rb-pcard');
        await page.click('#rb-pcard .rb-back'); await sleep(300);
        res['rb-pcard'].closed = await page.evaluate(() => document.getElementById('rb-pcard').hidden);
        await page.evaluate(() => window._rb2p_social.show('NOT THIS TIME', 'Card Test said no thanks.', '', ['ok']));
        await sleep(200);
        res['rb-chal'] = await backOf(page, 'rb-chal');
        await page.click('#rb-chal .rb-back'); await sleep(300);
        res['rb-chal'].closed = await page.evaluate(() => document.getElementById('rb-chal').hidden);
        const bad = Object.entries(res).filter(([k, v]) => !(v.has && v.text === '◀ BACK' && v.visible && v.onScreen && v.first && v.closed));
        check('P2 every popup (' + Object.keys(res).length + ') has ◀ BACK first, at the top, on the screen, and one tap closes it',
              bad.length === 0 && Object.keys(res).length === 8, JSON.stringify(bad.length ? Object.fromEntries(bad) : res));
        // P3
        await page.evaluate(() => window._rb2p_social.show('GAME ON!', 'Making a room for you and Card Test…', '', []));
        await sleep(200);
        const p3 = await backOf(page, 'rb-chal');
        await page.evaluate(() => { document.getElementById('rb-chal').hidden = true; });
        check('P3 no BACK on the challenge card while a room is being made', p3.has && !p3.visible, JSON.stringify(p3));
        // P4
        const ph = await open(browser, { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
        await ph.page.evaluate(() => { document.getElementById('rb-a2hs').hidden = false; });
        await sleep(300);
        const p4 = await backOf(ph.page, 'rb-a2hs');
        await ph.page.tap('#rb-a2hs .rb-back'); await sleep(300);
        p4.closed = await ph.page.evaluate(() => document.getElementById('rb-a2hs').hidden);
        check('P4 a sideways phone: the iPhone tip\'s BACK is on the screen without scrolling, and a tap closes it', p4.visible && p4.onScreen && p4.closed, JSON.stringify(p4));
    } finally { try { await browser.close(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
