// e2e/v513-spec-final.js — V513 (the owner: "audience should be able to see stats screen, but no you win or you lose"):
// a watcher of a game sees the stats screen when it ends — the players' final reports (rooms/{code}/final/{a,b}).
//   S1  one phone's report: the screen shows, headed by the winner's name; the missing side says it is waiting
//   S2  both reports: both box cards; never YOU WIN / YOU LOSE; no RUN IT BACK
//   S3  BACK TO WATCH LIVE closes it and returns to the watch list
const H = require('./harness');
const TP = require('./two-player');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
(async () => {
    console.log('=== V513 THE WATCHER\'S STATS SCREEN ===');
    const code = 'Z9' + Math.random().toString(36).slice(2, 4).toUpperCase();
    await H.ensureServer();
    const b = await H.launchBrowser(), p = await b.newPage();
    try {
        await p.setViewport({ width: 1280, height: 800 });
        await p.goto(H.url(), { waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => window._rb2p_specStart && window._rb2p_view, { timeout: 30000 });
        await new Promise(r => setTimeout(r, 4000));
        await p.evaluate((code) => window._rb2p_specStart({ code, an: 'Alpha', bn: 'Bravo', at: 5, bt: 11, sa: 0, sb: 0 }), code);
        await new Promise(r => setTimeout(r, 2000));
        const ts = Date.now(), rep = (team, opp, s, o, pl) => ({ team, oppTeam: opp, score: s, oppScore: o, ts, players: pl });
        await TP.fbPut('rooms/' + code + '/final/a', rep('Kansas City', 'Buffalo', 21, 14, [{ pos: 'QB', name: 'P. MAHOMES', line: '14/20 · 210 YDS · 2 TD', posRank: 0 }]));
        const one = await p.waitForFunction(() => { const f = document.getElementById('rb-final'); return f && f.style.display === 'block' && f.innerText; }, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => '');
        check('S1 one report: the screen shows, the winner\'s name on top, the other side waiting', /ALPHA WINS/i.test(one) && /MAHOMES/.test(one) && /waiting for Bravo/i.test(one), one.replace(/\s+/g, ' ').slice(0, 200));
        await TP.fbPut('rooms/' + code + '/final/b', rep('Buffalo', 'Kansas City', 14, 21, [{ pos: 'QB', name: 'J. ALLEN', line: '18/27 · 240 YDS · 2 TD', posRank: 0 }]));
        await new Promise(r => setTimeout(r, 2500));
        const two = await p.evaluate(() => document.getElementById('rb-final').innerText);
        check('S2 both reports: both box cards, no YOU WIN / YOU LOSE, no RUN IT BACK', /MAHOMES/.test(two) && /ALLEN/.test(two) && !/YOU WIN|YOU LOSE/.test(two) && !/RUN IT BACK/.test(two), two.replace(/\s+/g, ' ').slice(0, 260));
        await p.evaluate(() => document.getElementById('rb-specfinal-back').click());
        await new Promise(r => setTimeout(r, 800));
        const after = await p.evaluate(() => ({ overlay: document.getElementById('rb-final').style.display, view: document.getElementById('rb-lobby').dataset.active }));
        check('S3 BACK TO WATCH LIVE closes it and returns to the watch list', after.overlay === 'none' && after.view === 'watch', JSON.stringify(after));
    } finally { try { await TP.fbDelete('rooms/' + code); } catch (e) {} try { await b.close(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
