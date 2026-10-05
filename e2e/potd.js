// e2e/potd.js — V465: the play of the day on the front page. The owner: "a PLAY OF THE DAY banner and then a portion on the
// main page where the number one play is displayed along with offensive user name if offense play and defensive if
// defensive play ... a comments section ... the device that did the play should get an alert saying congrats, and a way
// to respond back to me the creator ... a special flair if they comment ... archived each day into a viewable section".
// The published play (embedcode/potd — the real one); comments on a throw-away path (rooms/~potdtest).
//   D1  the section shows the play of the day: its headline and OFFENSE/DEFENSE · the player's name
//   D2  WATCH replays it with the game's renderer: real pictures on the canvas, then a REPLAY button
//   D3  a comment posts and shows in the list (the player's name and words)
//   D4  the play's maker carries the PLAY OF THE DAY flair on his comments; another player does not
//   D5  the banner shows once per play of the day; WATCH IT closes it and plays; it does not come back
//   D6  on the maker's device: the congrats, not the banner — and a message sent back reaches the creator
//   D7  the archive lists the days (loaded when it is opened); choosing one shows it
// V467 (the owner: "make it top 3 but number 1 prominent and show difficulty"):
//   D8  #2 and #3 are cards beside #1, each with its headline, its player and its difficulty
//   D9  a card puts its play on the big screen (its rank, its words) and plays it; #1 becomes a card
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const ROOT = 'rooms/~potdtest/c/';
const LABEL = d => ({ easy: 'EASY', medium: 'MED', hard: 'HARD', max: 'MAX', ultramax: 'MAX' })[String(d || '').toLowerCase()] || '';

async function open(browser, seams) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((sm) => { Object.assign(window, sm); try { localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_name', 'PotdCheck'); } catch (e) {} }, Object.assign({ _rb2p_potdCommentsRoot: ROOT }, seams || {}));
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window._rb2p_potd && document.getElementById('rb-potd') && !document.getElementById('rb-potd').hidden, { timeout: 60000, polling: 300 }).catch(() => {});
    return page;
}

(async () => {
    console.log('=== V465 THE PLAY OF THE DAY ===');
    const potd = await (await fetch(DB + 'embedcode/potd.json')).json();
    if (!potd || !potd.date) { console.log('  (no play of the day published)'); process.exit(1); }
    const day = potd.date;
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        // ---- D1 ----
        const page = await open(browser);
        const d1 = await page.evaluate(() => ({ shown: !document.getElementById('rb-potd').hidden, title: document.getElementById('rb-potd-title').textContent,
            who: document.getElementById('rb-potd-who').textContent, banner: !document.getElementById('rb-news').hidden, rank: document.getElementById('rb-potd-rank').textContent,
            dif: document.getElementById('rb-potd-difl').hidden ? '' : document.getElementById('rb-potd-dif').textContent }));
        console.log('  D1: ' + JSON.stringify(d1));
        check('D1 the section shows the play of the day: #1, its headline, OFFENSE/DEFENSE · the player\'s name, its difficulty (no banner in a test run)',
              d1.shown && d1.rank === '#1' && d1.title === potd.headline && d1.who.indexOf((potd.side === 'defense' ? 'DEFENSE' : 'OFFENSE') + ' · ' + potd.name) === 0 && !d1.banner &&
              d1.dif === LABEL(potd.dif), JSON.stringify(d1));
        // ---- D8: #2 and #3 as cards ----
        const top = potd.top || [potd];
        const d8 = await page.evaluate(() => Array.from(document.querySelectorAll('#rb-potd-more .potd-card')).map(b => ({ rank: b.dataset.rank, h: b.querySelector('.h').textContent,
            w: b.querySelector('.w').textContent, dif: (b.querySelector('.potd-dif') || { textContent: '' }).textContent })));
        console.log('  D8: ' + JSON.stringify(d8));
        check('D8 #2 and #3 are cards: headline, player, difficulty', top.length === 3 && d8.length === 2 && [1, 2].every(i => {
            const c = d8[i - 1], e = top[i]; return c && c.rank === String(i + 1) && c.h === e.headline && c.w.indexOf((e.side === 'defense' ? 'DEFENSE' : 'OFFENSE') + ' · ' + e.name) === 0 && c.dif === LABEL(e.dif); }), JSON.stringify(d8));
        // ---- D9: a card puts its play on the big screen and plays it ----
        await page.evaluate(() => document.querySelector('#rb-potd-more .potd-card[data-rank="3"]').click());
        await page.waitForFunction(() => window._rb2p_potd.state().playing, { timeout: 20000, polling: 200 }).catch(() => {});
        await sleep(1500);
        const d9 = await page.evaluate(() => {
            const cv = document.getElementById('rb-potd-cv'), c2 = document.createElement('canvas'); c2.width = 96; c2.height = 54;
            const x = c2.getContext('2d'); x.drawImage(cv, 0, 0, 96, 54); const d = x.getImageData(0, 0, 96, 54).data, colors = new Set();
            for (let i = 0; i < d.length; i += 16) colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
            return { st: window._rb2p_potd.state(), rank: document.getElementById('rb-potd-rank').textContent, title: document.getElementById('rb-potd-title').textContent,
                     who: document.getElementById('rb-potd-who').textContent, colors: colors.size, cards: Array.from(document.querySelectorAll('#rb-potd-more .potd-card')).map(b => b.dataset.rank).join(',') };
        });
        console.log('  D9: ' + JSON.stringify(d9));
        check('D9 a card puts its play on the big screen and plays it; #1 becomes a card', d9.st.rank === 3 && d9.rank === '#3' && d9.title === top[2].headline &&
              d9.who.indexOf((top[2].side === 'defense' ? 'DEFENSE' : 'OFFENSE') + ' · ' + top[2].name) === 0 && d9.st.playing && d9.colors >= 12 && d9.cards === '1,2', JSON.stringify(d9));
        await page.evaluate(() => window._rb2p_potd.stage(1));
        // ---- D2 ----
        await page.evaluate(() => document.getElementById('rb-potd-go').click());
        await sleep(2500);
        const d2a = await page.evaluate(() => {
            const cv = document.getElementById('rb-potd-cv'), c2 = document.createElement('canvas'); c2.width = 96; c2.height = 54;
            const x = c2.getContext('2d'); x.drawImage(cv, 0, 0, 96, 54); const d = x.getImageData(0, 0, 96, 54).data, colors = new Set();
            for (let i = 0; i < d.length; i += 16) colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
            return { playing: window._rb2p_potd.state().playing, colors: colors.size, w: cv.width, msg: document.getElementById('rb-potd-msg').textContent };
        });
        const ended = await page.waitForFunction(() => !document.getElementById('rb-potd-go').hidden, { timeout: 30000, polling: 300 }).then(() => true).catch(() => false);
        const btn = await page.evaluate(() => document.getElementById('rb-potd-go').textContent);
        console.log('  D2: ' + JSON.stringify(Object.assign(d2a, { ended, btn })));
        check('D2 WATCH replays it with the game\'s renderer: real pictures on the canvas, then REPLAY', d2a.playing && d2a.colors >= 12 && ended && /REPLAY/.test(btn), JSON.stringify(d2a));
        // ---- D3 + D4 ----
        const tok = await TP.fbToken();
        const winnerC = { uid: potd.uid, name: 'TheMaker', text: 'that was me', ts: Date.now() - 5000 };
        await fetch(DB + ROOT + day + '/a0.json?auth=' + tok, { method: 'PUT', body: JSON.stringify(winnerC) });
        await page.evaluate(() => { document.querySelector('#rb-potd-talk > summary').click(); });
        await sleep(300);
        await page.evaluate(() => { document.getElementById('rb-potd-input').value = 'what a run'; document.getElementById('rb-potd-form').requestSubmit(); });
        await page.waitForFunction(() => /Posted/.test(document.getElementById('rb-potd-msg').textContent), { timeout: 20000, polling: 300 }).catch(() => {});
        await sleep(800);
        const d3 = await page.evaluate(() => Array.from(document.querySelectorAll('#rb-potd-cmts li')).map(li => ({ t: li.textContent, flair: !!li.querySelector('.potd-flair'), vis: li.getBoundingClientRect().height > 0 })));
        const peek = await page.evaluate(() => ({ n: document.getElementById('rb-potd-ncmt').textContent, peek: document.getElementById('rb-potd-peek').textContent }));
        console.log('  D3 row: ' + JSON.stringify(peek));
        console.log('  D3/D4: ' + JSON.stringify(d3));
        check('D3 a comment posts and shows in the list (the COMMENTS row opens; it counts them and shows the newest)', d3.some(c => /what a run/.test(c.t) && !c.flair && c.vis) && /· 2/.test(peek.n) && /what a run/.test(peek.peek), JSON.stringify({ d3, peek }));
        check('D4 the play\'s maker carries the PLAY OF THE DAY flair; another player does not', d3.some(c => /TheMaker/.test(c.t) && c.flair) && d3.some(c => /what a run/.test(c.t) && !c.flair), JSON.stringify(d3));
        // ---- D7 ----
        const before7 = await page.evaluate(() => document.querySelectorAll('#rb-potd-days button').length);
        await page.evaluate(() => { document.querySelector('#rb-potd-past > summary').click(); });
        await page.waitForFunction(() => document.querySelectorAll('#rb-potd-days button').length > 0, { timeout: 15000, polling: 200 }).catch(() => {});
        const d7 = await page.evaluate(() => { const bs = Array.from(document.querySelectorAll('#rb-potd-days button')); return { n: bs.length, first: bs[0] && bs[0].textContent, on: bs.filter(b => b.classList.contains('on')).length }; });
        d7.before = before7;
        console.log('  D7: ' + JSON.stringify(d7));
        check('D7 the archive loads when opened and lists the days, today\'s marked', d7.before === 0 && d7.n >= 1 && d7.on === 1 && /\w/.test(d7.first || ''), JSON.stringify(d7));
        await page.close();
        // ---- D5: the banner, once ----
        const p5 = await open(browser, { _rb2p_potdForce: true, _rb2p_potdUid: 'someone-else' });
        await page.evaluate(() => {}).catch(() => {});
        const b1 = await p5.waitForFunction(() => !document.getElementById('rb-news').hidden, { timeout: 15000, polling: 200 }).then(() => true).catch(() => false);
        const head = await p5.evaluate(() => document.getElementById('rb-news-head').textContent);
        const bdif = await p5.evaluate(() => document.getElementById('rb-news-dif').hidden ? '' : document.getElementById('rb-news-difc').textContent);
        await p5.evaluate(() => document.getElementById('rb-news-ok').click());
        await sleep(1500);
        const after = await p5.evaluate(() => ({ banner: !document.getElementById('rb-news').hidden, playing: window._rb2p_potd.state().playing, congrats: !document.getElementById('rb-potd-congrats').hidden }));
        await p5.reload({ waitUntil: 'domcontentloaded' });
        await sleep(5000);
        const again = await p5.evaluate(() => !document.getElementById('rb-news').hidden);
        console.log('  D5: ' + JSON.stringify({ b1, head, after, again }));
        check('D5 the banner shows once per play of the day; WATCH IT closes it and plays; it does not come back',
              b1 && head === potd.headline && bdif === LABEL(potd.dif) && !after.banner && after.playing && !after.congrats && !again, JSON.stringify({ b1, bdif, after, again }));
        await p5.close();
        // ---- D6: the maker's device ----
        const p6 = await open(browser, { _rb2p_potdForce: true, _rb2p_potdUid: potd.uid });
        const c1 = await p6.waitForFunction(() => !document.getElementById('rb-potd-congrats').hidden, { timeout: 15000, polling: 200 }).then(() => true).catch(() => false);
        const banner6 = await p6.evaluate(() => !document.getElementById('rb-news').hidden);
        await p6.evaluate(() => { window.__sent = null; window._rb2p_sendComplaint = async (t, ch) => { window.__sent = { t, ch }; return 'x'; };
            document.getElementById('rb-potd-congrats-text').value = 'thanks for the game!'; document.getElementById('rb-potd-congrats-send').click(); });
        await sleep(2000);
        const sent = await p6.evaluate(() => ({ sent: window.__sent, open: !document.getElementById('rb-potd-congrats').hidden }));
        console.log('  D6: ' + JSON.stringify({ c1, banner6, sent }));
        check('D6 on the maker\'s device: the congrats, not the banner — and the message goes to the creator',
              c1 && !banner6 && sent.sent && sent.sent.t === 'thanks for the game!' && /PLAY OF THE DAY reply/.test(sent.sent.ch[0]) && !sent.open, JSON.stringify({ c1, banner6, sent }));
        await p6.close();
    } finally {
        try { const tok = await TP.fbToken(); await fetch(DB + 'rooms/~potdtest.json?auth=' + tok, { method: 'DELETE' }); } catch (e) {}
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
