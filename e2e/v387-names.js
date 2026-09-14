// e2e/v387-names.js — the name gate, the bug-report box, the first-run announcement.
//   T1 a fresh device sees the announcement; GOT IT dismisses it and it never returns
//   T2 PLAY 2P without a name shows the name gate; a 1-char name is refused; a real name passes
//   T3 hosting a room writes rooms/{code}/names/a = the name
//   T4 the "!" chip opens the box; SEND stores complaints/{id} with name, room, text, diag
//   T5 the transcripts page shows the player's name beside the team and the report
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    const code = 'ZNAM';
    try {
        await TP.deleteRoom(code);
        const page = await browser.newPage();
        await page.setViewport({ width: 900, height: 560 });
        await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('rb2p_name'); localStorage.removeItem('rb2p_news_v387'); } catch (e) {} });
        await page.goto(H.url(), { waitUntil: 'domcontentloaded' });
        await sleep(9000);
        // T1
        const t1a = await page.evaluate(() => ({ news: !document.getElementById('rb-news').hidden, view: document.getElementById('rb-lobby').dataset.active }));
        await page.click('#rb-news-ok'); await sleep(200);
        const t1b = await page.evaluate(() => ({ news: !document.getElementById('rb-news').hidden, flag: localStorage.getItem('rb2p_news_v387') }));
        console.log('  T1: ' + JSON.stringify({ t1a, t1b }));
        check('T1 a fresh device sees the announcement once, GOT IT dismisses it', t1a.news && !t1b.news && t1b.flag === '1', JSON.stringify({ t1a, t1b }));
        // T2 — the gate is up already (no name); type a bad name, then a good one
        check('T2a with no name the lobby opens on the name gate', t1a.view === 'name', t1a.view);
        await page.type('#rb-name-input', 'S'); await page.click('#rb-name-go'); await sleep(150);
        const t2a = await page.evaluate(() => ({ view: document.getElementById('rb-lobby').dataset.active, msg: document.getElementById('rb-name-msg').textContent }));
        await page.evaluate(() => { document.getElementById('rb-name-input').value = ''; });
        await page.type('#rb-name-input', 'Soham'); await page.keyboard.press('Enter'); await sleep(200);
        const t2b = await page.evaluate(() => ({ view: document.getElementById('rb-lobby').dataset.active, stored: localStorage.getItem('rb2p_name'), shown: document.getElementById('rb-playing-as').textContent }));
        console.log('  T2: ' + JSON.stringify({ t2a, t2b }));
        check('T2b a one-letter name is refused; a real name is stored and shown', t2a.view === 'name' && /2 characters/.test(t2a.msg) && t2b.view === 'entry' && t2b.stored === 'Soham' && /PLAYING AS Soham/.test(t2b.shown), JSON.stringify({ t2a, t2b }));
        // T3 — host a room
        await page.evaluate((c) => { window._rb2p_forceRoomCode = c; }, code);
        await page.click('#rb-play2p'); await sleep(2500);
        const nameA = await TP.fbGet('rooms/' + code + '/names/a');
        console.log('  T3: names/a = ' + JSON.stringify(nameA));
        check('T3 hosting a room writes the name into rooms/{code}/names/a', nameA === 'Soham', JSON.stringify(nameA));
        // T4 — the report box
        const chipBox = await page.evaluate(() => { const r = document.getElementById('rb-complain').getBoundingClientRect(); return { l: Math.round(r.left), b: Math.round(window.innerHeight - r.bottom), w: Math.round(r.width) }; });
        await page.click('#rb-complain'); await sleep(200);
        await page.type('#rb-complain-text', 'Test report: the ball froze in Q2');
        await page.click('#rb-complain-send'); await sleep(2500);
        const st = await page.evaluate(() => document.getElementById('rb-complain-status').textContent);
        const all = await TP.fbGet('complaints') || {};
        const mine = Object.keys(all).map(k => all[k]).filter(c => c && /Test report: the ball froze/.test(c.text)).pop();
        console.log('  T4: chip at left ' + chipBox.l + ' bottom ' + chipBox.b + ' (' + chipBox.w + 'px); status "' + st + '"; stored ' + JSON.stringify(mine && { name: mine.name, room: mine.room, role: mine.role, ver: mine.ver, diag: (mine.diag || '').length }));
        check('T4 the bottom-left chip opens the box and SEND stores the report with name, room and the log', chipBox.l < 20 && chipBox.b < 20 && /Sent/.test(st) && mine && mine.name === 'Soham' && mine.room === code && mine.role === 'a' && (mine.diag || '').length > 50, JSON.stringify({ chipBox, st }));
        // T5 — the transcripts page (needs an audit stream: write a tiny one)
        await page.evaluate(() => { window._rb2p_audit && window._rb2p_audit('bind', { room: 'ZNAM', ver: 'V387' }); window._rb2p_auditFlushNow && window._rb2p_auditFlushNow(); });
        await sleep(1500);
        const tp = await browser.newPage();
        await tp.goto(H.url().replace('index.html', 'game-transcripts/index.html').replace(/\?cb=\d+/, '?tests=1'), { waitUntil: 'domcontentloaded' });
        await sleep(6000);
        const t5 = await tp.evaluate(() => { const t = document.body.innerText; return { names: /Soham/.test(t), report: /Test report: the ball froze/.test(t), reportsHead: /Bug reports/i.test(t) }; });
        console.log('  T5: ' + JSON.stringify(t5));
        check('T5 the transcripts page shows the name beside the team and the report', t5.names && t5.report && t5.reportsHead, JSON.stringify(t5));
        await page.screenshot({ path: '/private/tmp/claude-501/-Users-sohamsthitpragya-Projects/9832c0f9-d5cb-4e89-9e94-aee63ef2934e/scratchpad/v387-lobby.png' });
        // clean up the test complaint + room
        // reports are write-once for players (rules); the owner CLI removes the test ones
        try { for (const k of Object.keys(all)) if (all[k] && all[k].text === 'Test report: the ball froze in Q2') require('child_process').execFileSync('firebase', ['database:remove', '/complaints/' + k, '--project', 'realretrobowl2p', '--force'], { stdio: 'ignore' }); } catch (e) { console.log('  (cleanup skipped: ' + e.message.slice(0, 60) + ')'); }
        await TP.deleteRoom(code);
    } finally { await browser.close(); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
