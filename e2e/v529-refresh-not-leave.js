// e2e/v529-refresh-not-leave.js — V529 (the owner: "we have realized that refreshing fixes lag right? Make this a pop up for
// an announcement"; "add the leave warning to the pop up but that it will be removed").
//   R1  the announcement: on the lobby's first screen, once per device — ◀ BACK first and on screen, LAGGING? REFRESH, the
//       leave warning (DON'T LEAVE EARLY, the last-minute rule) and that a refresh's leave is removed within 2 minutes;
//       BACK closes it, and it never comes back on that device
//   R2  a sideways phone: BACK and GOT IT both on the screen without scrolling
//   R3  a real ranked two-device game, the rating job watching a test queue: one player REFRESHES — the stayer's page
//       notes the leave and the job applies it (the stayer is shown the points); the refreshed page resumes the match; the
//       stayer's page notes them back and the job undoes the leave — both ratings exactly as before, the stayer's game
//       and win taken back, the waiting screen no longer says OPPONENT LEFT
//   R4  then that player leaves for real (closes the tab): noted again and it counts — the stayer gets a win's points
const H = require('./harness');
const TP = require('./two-player');
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = 'r' + Date.now().toString(36), TROOT = 'rooms/~elotest/' + RUN, STATE = path.join(os.tmpdir(), 'elo-' + RUN + '.json');

async function lobbyPage(browser, vp, ua, opts) {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    if (ua) await page.setUserAgent(ua);
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'AnnTest'); localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} window._rb2p_annForce = true; });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 90000, polling: 300 });
    return { ctx, page };
}
const annLook = page => page.evaluate(() => {
    const an = document.getElementById('rb-announce'), box = an && an.querySelector('.box'), b = an && an.querySelector('.rb-back'), ok = document.getElementById('rb-announce-ok');
    if (!an) return { has: false };
    const r = b.getBoundingClientRect(), o = ok.getBoundingClientRect(), first = Array.from(b.parentNode.children).filter(c => getComputedStyle(c).display !== 'none')[0] === b;
    return { has: true, shown: !an.hidden, text: (box.innerText || '').replace(/\s+/g, ' '), back: b.textContent.trim(), first,
             backOn: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight, okOn: o.width > 0 && o.top >= 0 && o.bottom <= innerHeight, scrolled: box.scrollTop, overflow: box.scrollHeight - box.clientHeight };
});
const waitLook = page => page.evaluate(() => {
    if (window._rb2p_refreshWaitStatus) window._rb2p_refreshWaitStatus();
    const st = document.getElementById('rb-wait-status'), d = window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : [];
    return { status: st ? st.textContent : '', gain: Number(window._rb2p_leaveGain) || 0, left: d.filter(l => /ELO the other player left/.test(l)).length,
             back: d.filter(l => /ELO the other player came back/.test(l)).length };
});
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { players: {}, games: {} }; } };

(async () => {
    console.log('=== V529 A REFRESH IS NOT A LEAVE + THE ANNOUNCEMENT (' + RUN + ') ===');
    await H.ensureServer();
    // R1 + R2: the announcement
    {
        const br = await H.launchBrowser();
        try {
            const { page } = await lobbyPage(br, { width: 1280, height: 800 });
            let a = null; for (let i = 0; i < 30; i++) { a = await annLook(page); if (a.shown) break; await sleep(500); }
            const t = a.text || '';
            const words = /LAGGING\? REFRESH/.test(t) && /refresh the page/i.test(t) && /DON'T LEAVE EARLY/.test(t) && /last minute/.test(t) && /A REFRESH ISN'T LEAVING/.test(t) && /within 2 minutes/.test(t) && /removed/.test(t);
            await page.click('#rb-announce .rb-back'); await sleep(400);
            const closed = await page.evaluate(() => document.getElementById('rb-announce').hidden), key = await page.evaluate(() => localStorage.getItem('rb2p_ann_refresh_v1'));
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 90000, polling: 300 });
            await sleep(6000);
            const again = (await annLook(page)).shown;
            check('R1 the announcement on the lobby: ◀ BACK first and on screen; LAGGING? REFRESH + the leave warning + "removed within 2 minutes"; BACK closes it for good',
                  a.shown && a.back === '◀ BACK' && a.first && a.backOn && words && closed && !!key && !again, JSON.stringify({ shown: a.shown, back: a.back, first: a.first, backOn: a.backOn, words, closed, key: !!key, again, text: t.slice(0, 400) }));
            const ph = await lobbyPage(br, { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
                'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
            let p = null; for (let i = 0; i < 30; i++) { p = await annLook(ph.page); if (p.shown) break; await sleep(500); }
            check('R2 a sideways phone: BACK and GOT IT both on the screen without scrolling', p.shown && p.backOn && p.okOn && p.overflow <= 1, JSON.stringify(p && { shown: p.shown, backOn: p.backOn, okOn: p.okOn, overflow: p.overflow }));
            await ph.page.tap('#rb-announce-ok'); await sleep(300);
        } finally { try { await br.close(); } catch (e) {} }
    }
    // R3 + R4: a refresh in a real ranked game
    const job = spawn('node', [path.join(__dirname, '..', 'tools', 'elo.js'), '--watch', '--include-test', '--queue', TROOT + '/q', '--pub', TROOT + '/pub', '--state', STATE], { stdio: ['ignore', 'pipe', 'pipe'] });
    let jobLog = ''; job.stdout.on('data', d => { jobLog += d; }); job.stderr.on('data', d => { jobLog += d; });
    const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(); let n = 0;
    const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    let g = null;
    try {
        g = await TP.startTwoPlayerGame({ browser: two, beforeReady: async (page, role) => {
            await page.evaluate((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; }, TROOT);
            if (role === 'a') { await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="same"]'); if (m) m.click(); }); await sleep(1500); }
        } });
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
        await B.page.evaluateOnNewDocument((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; }, TROOT);   // its reload keeps to the test queue
        await sleep(8000);
        // R3
        const t0 = Date.now();
        await B.page.reload({ waitUntil: 'domcontentloaded' });
        let noted = 0, shown = 0, gain = 0, resumed = 0, back = 0, cleared = 0, undone = 0, st = null, res = null, stat = '';
        while (Date.now() - t0 < 150000 && !(undone && cleared)) {
            const s = await waitLook(A.page);
            if (s.left && !noted) noted = Date.now() - t0;
            if (s.gain > 0 && !shown) { shown = Date.now() - t0; gain = s.gain; }
            if (!resumed && await B.page.evaluate(() => document.documentElement.classList.contains('rb-in-match') && !!(window.RB && RB.isEngineInMatchRoom && RB.isEngineInMatchRoom())).catch(() => false)) resumed = Date.now() - t0;
            if (s.back && !back) back = Date.now() - t0;
            if (back && !cleared && s.gain === 0 && !/OPPONENT LEFT/.test(s.status)) { cleared = Date.now() - t0; stat = s.status; }
            st = readState(); res = Object.values(st.games || {}).find(x => x && x.leave) || null;
            if (res && res.reversed && res.back && !undone) undone = Date.now() - t0;
            await sleep(500);
        }
        const stayer = res && res.ouid && st.players[res.ouid], leaver = res && res.uid && st.players[res.uid];
        console.log('  refresh -> noted ' + (noted / 1000).toFixed(1) + ' s, +' + gain + ' shown ' + (shown / 1000).toFixed(1) + ' s, resumed ' + (resumed / 1000).toFixed(1) + ' s, back noted ' +
                    (back / 1000).toFixed(1) + ' s, undone ' + (undone / 1000).toFixed(1) + ' s, cleared ' + (cleared / 1000).toFixed(1) + ' s ("' + stat + '")');
        check('R3 a refresh: the leave is noted and paid at once, the page resumes the match, then the return undoes it — both ratings exactly as before, the stayer\'s game and win taken back, OPPONENT LEFT gone',
              noted > 0 && shown > 0 && resumed > 0 && back > 0 && undone > 0 && cleared > 0 && stayer && leaver && stayer.r === 1000 && leaver.r === 1000 && stayer.n === 0 && stayer.w === 0 && (leaver.left || 0) === 0,
              JSON.stringify({ noted, shown, gain, resumed, back, undone, cleared, res: res && { applied: res.applied, reversed: res.reversed, back: res.back, why: res.why }, stayer, leaver, job: jobLog.trim().split('\n').slice(-3) }));
        // R4
        const t1 = Date.now();
        await B.page.close();
        let again = 0, gain2 = 0, res2 = null;
        while (Date.now() - t1 < 30000 && !again) {
            const s = await waitLook(A.page);
            res2 = Object.values(readState().games || {}).find(x => x && x.leave) || null;
            if (s.gain > 0 && res2 && res2.applied && !res2.reversed) { again = Date.now() - t1; gain2 = s.gain; }
            await sleep(500);
        }
        const st2 = readState(), stayer2 = res2 && res2.ouid && st2.players[res2.ouid];
        check('R4 then a real leave (the tab closed): noted again and it counts — the stayer gets a win\'s points', again > 0 && again <= 10000 && stayer2 && stayer2.w === 1 && stayer2.r > 1000 && gain2 === res2.or1 - res2.or0,
              JSON.stringify({ again, gain2, res2: res2 && { applied: res2.applied, reversed: res2.reversed, gain: res2.gain }, stayer2, job: jobLog.trim().split('\n').slice(-2) }));
    } finally {
        try { job.kill(); } catch (e) {}
        try { if (g) await Promise.race([g.cleanup(), sleep(15000)]); } catch (e) {} try { await real.close(); } catch (e) {}
        try { await TP.fbDelete(TROOT); } catch (e) {} try { fs.unlinkSync(STATE); } catch (e) {}
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
