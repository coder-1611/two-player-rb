// e2e/game-dif.js — V470 (the owner: "clearly store the difficulty level in games so you can pick it out"): every game's
// record (rooms/{code}/games/{start}) carries its difficulty. A SAME-mode game on HARD (the two test pages share one
// browser's storage, so a DIFFERENT game cannot give them two levels here):
//   G1  the record says mode 'same', dif 'hard', difs.a 'hard' (A writes the record) and difs.b 'hard' (B finds A's record
//       — keyed by A's start time — and adds its own)
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
    } finally {
        try { await g.cleanup(); } catch (e) {}
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
