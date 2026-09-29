// V419 (replaces the V132 TTL-sweep test): a page NEVER downloads the whole rooms tree and
// NEVER deletes a room. The V132 client sweep ran FB.get('rooms') — 58.7 MB of every room's
// audit streams by 2026-09-28 — on every load and every 20 minutes of play, and since V396
// played rooms are kept forever (user: "never delete rooms"). An old, unplayed lobby left in
// the database must still be there after a page has loaded and sat in the lobby.
const TP = require('../two-player');

module.exports = {
    name: 'no page downloads the rooms tree or deletes a room (V419; was the V132 sweep)',
    browser: false,
    async run({ H }) {
        await H.ensureServer();
        const stale = TP.randomCode();                         // a harness code (has a digit)
        const old = Date.now() - 5 * 60 * 60 * 1000;          // 5 h old — the V132 sweep deleted these
        await TP.fbPut('rooms/' + stale + '/players', { a: { ts: old, ready: false } });
        const browser = await H.launchBrowser();
        try {
            const page = await browser.newPage();
            await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Harness'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
            await page.goto(H.url(), { waitUntil: 'domcontentloaded' });
            await H.sleep(12000);
            const src = await page.evaluate(async () => (await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text()));
            const noTreeRead = !/FB\.get\(FB\.ref\(db, 'rooms'\)\)/.test(src);
            const still = await TP.fbGet('rooms/' + stale + '/players');
            const survived = !!(still && still.a);
            await TP.deleteRoom(stale);
            return { pass: noTreeRead && survived, detail: 'noTreeRead=' + noTreeRead + ' staleLobbySurvived=' + survived };
        } finally { try { await browser.close(); } catch (e) {} }
    }
};
