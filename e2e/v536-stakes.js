// e2e/v536-stakes.js — V536 (the owner: "if 2 ranks are adjacent then double the points possible to be gained or lost to raise
// stakes"; V537: "triple if adjacent ranks"). A real two-device ranked game; the RANKINGS are a test copy (window._rb2p_eloPath) in which the two players are
// #4 and #5 — neighbours.
//   S1  at kickoff both pages know the stakes are double (#4 vs #5, from the board) and show DOUBLE STAKES across the top
//   S2  the banner never takes a tap and goes away by itself
// (The job's arithmetic — doubled wins, losses, draws and leaves, judged by the board when the game began — is e2e/elo-math.js X1-X6.)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = 's' + Date.now().toString(36), TROOT = 'rooms/~elotest/' + RUN;
(async () => {
    console.log('=== V536 DOUBLE STAKES (' + RUN + ') ===');
    const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(); let n = 0;
    const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    let g = null, uidA = '';
    try {
        g = await TP.startTwoPlayerGame({ browser: two, beforeReady: async (page, role) => {
            await page.evaluate((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; }, TROOT);
            if (role === 'a') { await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="same"]'); if (m) m.click(); }); await sleep(1500); uidA = await page.evaluate(() => window._rb2p_eloUid()); }
            if (role === 'b') {   // the board: three others above, then the two players as #4 and #5
                const ua = uidA, ub = await page.evaluate(() => window._rb2p_eloUid());
                const row = (u, nm, r) => ({ u: String(u).slice(0, 8), nm, r, w: 5, l: 5, d: 0, n: 10 });
                await TP.fbPut(TROOT + '/pub/top', { at: Date.now(), list: [row('zz000001x', 'One', 1300), row('zz000002x', 'Two', 1250), row('zz000003x', 'Three', 1200), row(ua, 'Bot A', 1150), row(ub, 'Bot B', 1120), row('zz000006x', 'Six', 1000)] });
            }
        } });
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
        let seen = { a: null, b: null };
        const t0 = Date.now();
        while (Date.now() - t0 < 40000 && !(seen.a && seen.b)) {
            for (const [k, P] of [['a', A], ['b', B]]) if (!seen[k]) {
                const s = await P.page.evaluate(() => { const el = document.getElementById('rb-stakes'), st = window._rb2p_eloStakesNow && window._rb2p_eloStakesNow();
                    return { st, shown: !!(el && getComputedStyle(el).display !== 'none'), text: el ? el.textContent : '', pe: el ? getComputedStyle(el).pointerEvents : '' }; });
                if (s.shown) seen[k] = Object.assign(s, { ms: Date.now() - t0 });
            }
            await sleep(400);
        }
        check('S1 at kickoff both pages know the stakes are raised (#4 vs #5) and say TRIPLE STAKES across the top',
              seen.a && seen.b && seen.a.st && seen.a.st.nb && seen.b.st.nb && /TRIPLE STAKES/.test(seen.a.text) && /#4 VS #5/.test(seen.a.text) && /#5 VS #4/.test(seen.b.text),
              JSON.stringify(seen));
        await sleep(11000);
        const gone = await Promise.all([A, B].map(P => P.page.evaluate(() => { const el = document.getElementById('rb-stakes'); return !el || getComputedStyle(el).display === 'none'; })));
        check('S2 the banner never takes a tap and goes away by itself', seen.a && seen.a.pe === 'none' && gone.every(Boolean), JSON.stringify({ pe: seen.a && seen.a.pe, gone }));
    } finally {
        try { if (g) await Promise.race([g.cleanup(), sleep(15000)]); } catch (e) {} try { await real.close(); } catch (e) {}
        try { await TP.fbDelete(TROOT); } catch (e) {}
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
