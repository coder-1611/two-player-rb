// e2e/home-screen.js — V474 (the owner: "when a phone saves to Home Screen ... they also save the full
// https://two-player-rb.vercel.app/?v=muv9020d ... figure out a way so this doesn't affect anything negatively"):
//   S1  an address saved with an OLD token (a day old) gets a fresh one at the visit's start, and the engine is fetched
//       with the fresh one (not the saved one's cached copy)
//   S2  a fresh token (this visit's own) is kept — no extra trip
//   S3  a Home Screen launch never joins: ?join= is dropped from a standalone launch (the code box stays empty)
//   S4  an invite this device already joined fills the code but does not join again; a new one still joins by itself
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const base = () => H.url().replace(/\?.*$/, '');
async function visit(browser, query, init) {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();   // its own storage: a fresh device
    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluateOnNewDocument((ini) => {
        try { localStorage.setItem('rb2p_name', 'HomeCheck'); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {}
        if (ini && ini.standalone) Object.defineProperty(navigator, 'standalone', { get: () => true });
        if (ini && ini.used) try { localStorage.setItem('rb2p_joins_used', JSON.stringify(ini.used)); } catch (e) {}
    }, init || null);
    await page.goto(base() + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.getElementById('rb-play2p') && document.querySelector('#rb-lobby').dataset.active, { timeout: 60000, polling: 300 });
    await sleep(6000);   // the invite poll runs every 500 ms once a name is set
    const st = await page.evaluate(() => ({ url: location.href, v: new URL(location.href).searchParams.get('v'), view: document.querySelector('#rb-lobby').dataset.active,
        code: document.getElementById('rb-room-input').value, msg: document.getElementById('rb-entry-msg').textContent,
        engine: performance.getEntriesByType('resource').map(r => r.name).filter(n => /retrobowl\.js/.test(n)) }));
    await ctx.close();
    return st;
}
(async () => {
    console.log('=== V474 A SAVED ADDRESS (HOME SCREEN, BOOKMARK, LINK) DOES NO HARM ===');
    await H.ensureServer();
    let code = 'QZ9X'; for (const c of ['QZ9X', 'QZ8W', 'QZ7V']) { if (!(await TP.fbGet('rooms/' + c + '/players'))) { code = c; break; } }
    const browser = await H.launchBrowser();
    try {
        const old = (Date.now() - 86400e3).toString(36);
        const s1 = await visit(browser, '?v=' + old);
        const age1 = Date.now() - parseInt(s1.v, 36);
        console.log('  S1: ' + JSON.stringify({ saved: old, now: s1.v, ageSec: Math.round(age1 / 1000), engine: s1.engine }));
        check('S1 an old saved token is replaced at the visit\'s start; the engine is fetched with the new one', s1.v !== old && age1 >= 0 && age1 < 120000 && s1.engine.some(n => n.indexOf('v=' + s1.v) >= 0) && !s1.engine.some(n => n.indexOf('v=' + old) >= 0), JSON.stringify(s1));
        const fresh = Date.now().toString(36);
        const s2 = await visit(browser, '?v=' + fresh);
        console.log('  S2: ' + JSON.stringify({ given: fresh, now: s2.v }));
        check('S2 a fresh token is kept (no extra trip)', s2.v === fresh, JSON.stringify(s2));
        const s3 = await visit(browser, '?join=' + code + '&v=' + old, { standalone: true });
        console.log('  S3: ' + JSON.stringify({ url: s3.url.replace(/^.*\//, '/'), code: s3.code, view: s3.view, msg: s3.msg }));
        check('S3 a Home Screen launch drops ?join= and does not join', !/join=/.test(s3.url) && s3.code === '' && s3.view === 'entry' && !s3.msg, JSON.stringify(s3));
        const s4a = await visit(browser, '?join=' + code, { used: [{ c: code, t: Date.now() - 86400e3 }] });
        const s4b = await visit(browser, '?join=' + code);
        console.log('  S4: ' + JSON.stringify({ usedBefore: { code: s4a.code, view: s4a.view, msg: s4a.msg, url: s4a.url.replace(/^.*\//, '/') }, newInvite: { code: s4b.code, view: s4b.view, msg: s4b.msg } }));
        check('S4 an invite already used here fills the code but does not join; a new one still joins by itself',
              s4a.code === code && s4a.view === 'entry' && !s4a.msg && !/join=/.test(s4a.url) && (s4b.view !== 'entry' || !!s4b.msg), JSON.stringify({ s4a, s4b }));
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
