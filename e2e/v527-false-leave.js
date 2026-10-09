// e2e/v527-false-leave.js — V527 (room FTAV, the owner: "said he left in the middle but we were both playing and it gave me
// the points and just wait screen happened"): a page whose OWN live line stalls must not call the other player gone. FTAV:
// the waiting page's socket stalled (FB-STALL x7), its copy of the other phone's heartbeat froze for 30 s, and a player who
// was snapping a play every few seconds was noted as left. Two separate browsers, a real match; leave notes go to a test
// queue (window._rb2p_eloQueue), never the real one.
//   F1  my live socket down for 45 s (FB.goOffline — REST still works) while the other phone heartbeats: no leave noted,
//       the waiting screen never says OPPONENT LEFT, and the page says its line was the quiet one (HB via REST)
//   F2  the other phone really goes silent — frozen (its page's script stuck: no heartbeat, no picture, no closed-tab
//       beacon): the leave is still noted (within 45 s)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = 'f' + Date.now().toString(36), TROOT = 'rooms/~elotest/' + RUN;

const look = page => page.evaluate(() => {
    if (window._rb2p_refreshWaitStatus) window._rb2p_refreshWaitStatus();
    const st = document.getElementById('rb-wait-status'), d = window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : [];
    return { status: st ? st.textContent : '', noted: d.some(l => /ELO the other player left/.test(l)), rest: d.some(l => /HB via REST/.test(l)),
             silent: window._rb2p_oppSilentMs ? window._rb2p_oppSilentMs() : -1 };
});

(async () => {
    console.log('=== V527 A QUIET LINE OF MY OWN IS NOT THEIR LEAVE (' + RUN + ') ===');
    const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(); let n = 0;
    const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    let g = null;
    try {
        g = await TP.startTwoPlayerGame({ browser: two, beforeReady: async (page) => {
            await page.evaluate((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; }, TROOT);
        } });
        const A = g.a, B = g.b;
        await sleep(8000);
        // F1
        await A.page.evaluate(() => { window._rb2p_FB.goOffline(window._rb2p_db); });
        const t0 = Date.now(); let bare = [], maxSilent = 0, noted1 = false, rest1 = false;
        while (Date.now() - t0 < 45000) {
            const s = await look(A.page);
            if (/OPPONENT LEFT/.test(s.status)) bare.push(s.status);
            maxSilent = Math.max(maxSilent, s.silent); noted1 = noted1 || s.noted; rest1 = rest1 || s.rest;
            await sleep(500);
        }
        await A.page.evaluate(() => { window._rb2p_FB.goOnline(window._rb2p_db); });
        check('F1 my live socket down 45 s while the other phone heartbeats: no leave noted, never OPPONENT LEFT, the copy kept fresh over REST',
              !noted1 && bare.length === 0 && rest1 && maxSilent < 30000, JSON.stringify({ noted1, bare: bare.slice(0, 2), rest1, maxSilent }));
        await sleep(5000);
        // F2
        await B.page.evaluate(() => { setTimeout(() => { for (;;) {} }, 0); });   // frozen for good (its tab is closed with the browser)
        const t1 = Date.now(); let noted2 = 0;
        while (Date.now() - t1 < 60000 && !noted2) { const s = await look(A.page); if (s.noted) noted2 = Date.now() - t1; await sleep(500); }
        check('F2 the other phone really goes silent (frozen: no heartbeat, no picture, no beacon): the leave is still noted (within 45 s)',
              noted2 > 0 && noted2 <= 45000, 'noted after ' + noted2 + ' ms');
    } finally {
        try { if (g) await Promise.race([g.cleanup(), sleep(15000)]); } catch (e) {}
        try { if (g && g.code) await TP.deleteRoom(g.code); } catch (e) {}
        try { await real.close(); } catch (e) {}
        try { await TP.fbDelete(TROOT); } catch (e) {}
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
