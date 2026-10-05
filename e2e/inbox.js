// e2e/inbox.js — V471: a message to ONE device (the owner: "at 12:15 pm submit to me the top 5 so far ... send it to the
// chromebook named soham"). The real path: daily.js --publish-only --to ID writes embedcode/inbox/ID (today's top 5), the
// page that is device ID (the seam _rb2p_inboxId) shows it.
//   B1  the device gets the popup: FROM SOHAM, the title, five plays (rank, headline, name; difficulty where recorded)
//   B2  WATCH plays #1 with the game's renderer; choosing #3 puts #3 on its screen and plays it
//   B3  CLOSE hides it, and it does not come back on the next visit; another device never sees it
//   B4  (V481) two pools, each under its title; a pool-B play shows "B #1" and its points, and plays
const path = require('path'), { execFileSync } = require('child_process');
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const ID = 'T3STinbx', REPO = path.resolve(__dirname, '..'), FIREBASE = process.env.FIREBASE_BIN || '/opt/homebrew/bin/firebase';
const fb = (...a) => execFileSync(FIREBASE, a.concat(['--project', 'realretrobowl2p', '--force']), { stdio: 'pipe', timeout: 90000 });
const pixels = () => { const cv = document.getElementById('rb-inbox-cv'), c2 = document.createElement('canvas'); c2.width = 96; c2.height = 54;
    const x = c2.getContext('2d'); x.drawImage(cv, 0, 0, 96, 54); const d = x.getImageData(0, 0, 96, 54).data, s = new Set();
    for (let i = 0; i < d.length; i += 16) s.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return s.size; };
async function open(browser, id, keepStorageFrom) {
    const page = keepStorageFrom || await browser.newPage();
    if (!keepStorageFrom) {
        await page.setViewport({ width: 1366, height: 700 });
        await page.evaluateOnNewDocument((i) => { window._rb2p_inboxId = i; try { localStorage.setItem('rb2p_name', 'InboxCheck'); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {} }, id);
    }
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    return page;
}
(async () => {
    console.log('=== V471 A MESSAGE TO ONE DEVICE ===');
    // the newest finished day on this Mac (a preview is not a finished day)
    const RUNS = path.join(require('os').homedir(), 'Projects/two-player-rb/.rb2p/highlights/runs'), fs = require('fs');
    const day = fs.readdirSync(RUNS).filter(d => /^\d{4}-\d\d-\d\d$/.test(d)).sort().reverse().find(d => { try { const st = JSON.parse(fs.readFileSync(path.join(RUNS, d, 'status.json'), 'utf8')); return st.picks && st.picks.length; } catch (e) { return false; } });
    const until = JSON.parse(fs.readFileSync(path.join(RUNS, day, 'status.json'), 'utf8')).until;
    execFileSync('node', [path.join(REPO, 'tools/highlights/daily.js'), '--publish-only', '--until', String(until), '--to', ID], { stdio: 'pipe', timeout: 300000, env: Object.assign({}, process.env, { PATH: '/opt/homebrew/bin:' + process.env.PATH }) });
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const page = await open(browser, ID);
        const shown = await page.waitForFunction(() => !document.getElementById('rb-inbox').hidden, { timeout: 30000, polling: 300 }).then(() => true).catch(() => false);
        const b1 = await page.evaluate(() => ({ from: document.getElementById('rb-inbox-from').textContent, title: document.getElementById('rb-inbox-title').textContent,
            items: Array.from(document.querySelectorAll('#rb-inbox-list button')).map(b => b.textContent) }));
        console.log('  B1: ' + JSON.stringify(Object.assign({ shown }, b1)).slice(0, 600));
        check('B1 the device gets the popup: FROM SOHAM, the title, five plays (a difficulty chip where the play has one)', shown && b1.from === 'SOHAM' && /TOP 5/.test(b1.title) && b1.items.length === 5 && b1.items.every(t => /^#\d/.test(t)), JSON.stringify(b1));
        await page.evaluate(() => document.getElementById('rb-inbox-go').click());
        await page.waitForFunction(() => window._rb2p_inbox.state().playing, { timeout: 20000, polling: 200 }).catch(() => {});
        await sleep(1500);
        const p1 = await page.evaluate(pixels);
        await page.evaluate(() => document.querySelectorAll('#rb-inbox-list button')[2].click());
        await page.waitForFunction(() => window._rb2p_inbox.state().playing && window._rb2p_inbox.state().rank === 3, { timeout: 20000, polling: 200 }).catch(() => {});
        await sleep(1500);
        const b2 = await page.evaluate((px) => Object.assign(window._rb2p_inbox.state(), { px: (new Function('return (' + px + ')()'))(), rankTxt: document.getElementById('rb-inbox-rank').textContent }), pixels.toString());
        console.log('  B2: ' + JSON.stringify({ p1, b2 }));
        check('B2 WATCH plays #1; choosing #3 puts #3 on the screen and plays it', p1 >= 12 && b2.rank === 3 && b2.rankTxt === '#3' && b2.playing && b2.px >= 12, JSON.stringify({ p1, b2 }));
        await page.evaluate(() => document.getElementById('rb-inbox-close').click());
        await sleep(300);
        const closed = await page.evaluate(() => document.getElementById('rb-inbox').hidden);
        await open(browser, ID, page);
        await sleep(6000);
        const again = await page.evaluate(() => !document.getElementById('rb-inbox').hidden);
        const other = await open(browser, 'zzOther1');
        await sleep(6000);
        const otherSees = await other.evaluate(() => !document.getElementById('rb-inbox').hidden);
        console.log('  B3: ' + JSON.stringify({ closed, again, otherSees }));
        check('B3 CLOSE hides it; it does not come back; another device never sees it', closed && !again && !otherSees, JSON.stringify({ closed, again, otherSees }));
        // ---- B4: two pools ----
        const data = await (await fetch('https://realretrobowl2p-default-rtdb.firebaseio.com/embedcode/inboxPlays/' + ID + '/1.json')).json();
        if (data && data.play) {
            const card = { rank: 1, key: '1', side: 'offense', name: 'Tester', headline: data.headline || 'a play', dif: 'max', toMs: data.toMs };
            const src = { msg: { ts: Date.now(), from: 'Soham', title: 'TWO POOLS', plays: [card],
                pools: [{ title: 'POOL A — the old rules', plays: [card] }, { title: 'POOL B — the points formula', plays: [Object.assign({}, card, { key: 'b1', total: 74, raw: 12, base: 62, breakdown: 'difficulty 20 + TD 20' })] }] },
                plays: { '1': data, 'b1': data } };
            const ctx = await browser.createBrowserContext(), p4 = await ctx.newPage();
            await p4.setViewport({ width: 1366, height: 700 });
            await p4.evaluateOnNewDocument((sv) => { window._rb2p_inboxId = 'T3STpool'; window._rb2p_inboxSource = sv; try { localStorage.setItem('rb2p_name', 'PoolCheck'); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {} }, src);
            await p4.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
            await p4.waitForFunction(() => !document.getElementById('rb-inbox').hidden, { timeout: 30000, polling: 300 }).catch(() => {});
            const heads = await p4.evaluate(() => Array.from(document.querySelectorAll('#rb-inbox-list .ib-pool')).map(x => x.textContent));
            await p4.evaluate(() => document.querySelector('#rb-inbox-list button[data-key="b1"]').click());
            await p4.waitForFunction(() => window._rb2p_inbox.state().playing, { timeout: 20000, polling: 200 }).catch(() => {});
            await sleep(1200);
            const b4 = await p4.evaluate((px) => ({ rank: document.getElementById('rb-inbox-rank').textContent, pts: document.getElementById('rb-inbox-pts').textContent,
                btn: document.querySelector('#rb-inbox-list button[data-key="b1"]').textContent, playing: window._rb2p_inbox.state().playing, px: (new Function('return (' + px + ')()'))() }), pixels.toString());
            await ctx.close();
            console.log('  B4: ' + JSON.stringify(Object.assign({ heads }, b4)));
            check('B4 two pools under their titles; a pool-B play shows "B #1", its points, and plays', heads.length === 2 && /POOL A/.test(heads[0]) && /POOL B/.test(heads[1]) &&
                  b4.rank === 'B #1' && /^74 PTS = 62 measured \+ 12 spectacular/.test(b4.pts) && /74 PTS/.test(b4.btn) && b4.playing && b4.px >= 12, JSON.stringify(Object.assign({ heads }, b4)));
        } else check('B4 the test play exists', false, 'no inboxPlays/' + ID + '/1');
    } finally {
        try { fb('database:remove', '/embedcode/inbox/' + ID); fb('database:remove', '/embedcode/inboxPlays/' + ID); } catch (e) { console.log('  (cleanup: ' + e.message.split('\n')[0] + ')'); }
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
