// e2e/game-dif.js — V470 (the owner: "clearly store the difficulty level in games so you can pick it out"): every game's
// record (rooms/{code}/games/{start}) carries its difficulty. A SAME-mode game on HARD (the two test pages share one
// browser's storage, so a DIFFERENT game cannot give them two levels here):
//   G1  the record says mode 'same', dif 'hard', difs.a 'hard' (A writes the record) and difs.b 'hard' (B finds A's record
//       — keyed by A's start time — and adds its own)
//   G2  a DIFFERENT game on two devices with their own storage (B in a separate browser context), A on EASY and B on MAX:
//       the record says mode 'different', no shared dif, difs.a 'easy', difs.b 'max'
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
(async () => {
    console.log('=== V470 THE DIFFICULTY ON EVERY GAME ===');
    await H.ensureServer();
    const g = await TP.startTwoPlayerGame({
        beforeReady: async (page, role) => {
            if (role !== 'a') return;
            await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="same"]'); if (m) m.click(); }); await sleep(1000);
            await page.evaluate(() => { const b = document.querySelector('.diff-btn[data-dif="hard"]'); if (b) b.click(); }); await sleep(1500);
        } });
    try {
        await sleep(15000);   // the match is on; b looks for a's record every 5 s
        const games = await TP.fbGet('rooms/' + g.code + '/games') || {};
        const recs = Object.values(games);
        const r = recs[recs.length - 1] || {};
        const set = await Promise.all([g.a.page, g.b.page].map(p => p.evaluate(() => ({ dif: window._rb2p_difficultyPref(), mode: window._rb2p_diffMode }))));
        console.log('  G1: ' + JSON.stringify({ n: recs.length, rec: r, set }));
        check('G1 the game\'s record: mode same, dif hard, difs.a and difs.b hard (B added its own)', recs.length === 1 && r.mode === 'same' && r.dif === 'hard' && r.difs && r.difs.a === 'hard' && r.difs.b === 'hard',
              JSON.stringify({ rec: r, set }));
        try { await g.cleanup(); } catch (e) {}
        // ---- G2: two devices, each its own storage ----
        const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(); let n = 0;
        const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
        const pick = { a: 'easy', b: 'max' };
        const g2 = await TP.startTwoPlayerGame({ browser: two,
            beforeReady: async (page, role) => {
                if (role === 'a') { await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="different"]'); if (m) m.click(); }); await sleep(1500); }
                await page.evaluate((d) => { try { localStorage.setItem('rb2p_difficulty', d); sessionStorage.setItem('rb2p_difficulty', d); } catch (e) {} }, pick[role]);   // V532: the tab's own choice, as the lobby button makes it
            } });
        try {
            await sleep(15000);
            const recs2 = Object.values(await TP.fbGet('rooms/' + g2.code + '/games') || {}), r2 = recs2[recs2.length - 1] || {};
            const set2 = await Promise.all([g2.a.page, g2.b.page].map(p => p.evaluate(() => ({ dif: window._rb2p_difficultyPref(), mode: window._rb2p_diffMode }))));
            console.log('  G2: ' + JSON.stringify({ n: recs2.length, rec: r2, set: set2 }));
            check('G2 a DIFFERENT game on two devices: mode different, difs.a easy, difs.b max', recs2.length === 1 && r2.mode === 'different' && !r2.dif && r2.difs && r2.difs.a === 'easy' && r2.difs.b === 'max',
                  JSON.stringify({ rec: r2, set: set2 }));
        } finally { try { await g2.cleanup(); } catch (e) {} try { await real.close(); } catch (e) {} }
    } finally {
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
