// e2e/v516-live-lastplay.js — V516 (the owner: "in the live watching section, show minutes since last actual play happened,
// as some games are just left open"): player a's page stamps rooms/~live/{code}.lp when the clock, the quarter or the score
// last moved; the WATCH LIVE list says how long ago that was.
//   P1  the list: a game whose last play was 12.5 min ago reads "LAST PLAY 12 MIN AGO"; one 20 s ago "LAST PLAY JUST NOW";
//       a host on an older build (no lp): the play-by-play feed's last play — 47 min ago, or 9 h 53 min ago ("9 HR 53 MIN")
//   P2  a real game: after a real down the stamp moves to the play; with no play for 20 s it stays where it was
const L = require('./horn-lib');
const TP = L.TP, H = L.H, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
(async () => {
    console.log('=== V516 LAST PLAY ON THE WATCH LIVE LIST ===');
    const rnd = () => Math.random().toString(36).slice(2, 4).toUpperCase();
    const c1 = 'Z9' + rnd(), c2 = 'Z8' + rnd(), c3 = 'Z7' + rnd(), c4 = 'Z6' + rnd();
    const now = Date.now(), entry = (code, lp) => ({ code, t: now, lp, an: 'Idle', bn: 'Open', at: 5, bt: 11, sa: 7, sb: 3, q: 2, clk: 75, dif: 'max', mode: 'same', w: 0 });
    let g = null;
    try {
        await TP.fbPut('rooms/~live/' + c1, entry(c1, now - 12.5 * 60000));
        await TP.fbPut('rooms/~live/' + c2, Object.assign(entry(c2, now - 20000), { an: 'Busy' }));
        const old = (code, nm) => { const e = entry(code, 0); delete e.lp; e.an = nm; return e; };   // an older build: no lp
        await TP.fbPut('rooms/~live/' + c3, old(c3, 'Oldie'));
        await TP.fbPut('rooms/' + c3 + '/feed', { a: { k: 'run', ts: now - 47.5 * 60000 }, b: { k: 'pass', ts: now - 50 * 60000 } });
        await TP.fbPut('rooms/~live/' + c4, old(c4, 'Ghost'));
        await TP.fbPut('rooms/' + c4 + '/feed', { a: { k: 'sack', ts: now - (9 * 60 + 53.5) * 60000 } });
        await H.ensureServer();
        const b = await H.launchBrowser(), p = await b.newPage();
        await p.goto(H.url(), { waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => document.getElementById('rb-watch-btn'), { timeout: 30000 });
        await sleep(4000);
        await p.evaluate(() => { window._rb2p_watchAll = true; document.getElementById('rb-watch-btn').click(); });
        const txt = await p.waitForFunction(() => { const l = document.getElementById('rb-watch-list'); const t = l && l.innerText; return t && ['Idle', 'Busy', 'Oldie', 'Ghost'].every(n => t.includes(n)) ? t : null; }, { timeout: 15000 }).then(h => h.jsonValue()).catch(async () => p.evaluate(() => document.getElementById('rb-watch-list').innerText));
        const t = String(txt).replace(/\s+/g, ' ');
        check('P1 the list says how long ago each game\'s last play was (12 MIN AGO / JUST NOW; older builds from the feed: 47 MIN AGO / 9 HR 53 MIN AGO)',
              /LAST PLAY 12 MIN AGO/.test(t) && /LAST PLAY JUST NOW/.test(t) && /LAST PLAY 47 MIN AGO/.test(t) && /LAST PLAY 9 HR 53 MIN AGO/.test(t), t.slice(0, 500));
        await b.close();
        // P2: a real game
        g = await TP.startTwoPlayerGame({});
        const code = g.code, getLp = async () => { const v = await TP.fbGet('rooms/~live/' + code); return v && Number(v.lp) || 0; };
        let lp0 = 0; for (let i = 0; i < 30 && !lp0; i++) { lp0 = await getLp(); if (!lp0) await sleep(1000); }
        const o = await L.offense(g, 45000);
        const tPlay = Date.now();
        try { await L.realDown(o.off.page, { buttons: true, pass: false }); } catch (e) {}
        await sleep(17000);   // the next 15 s write
        const lp1 = await getLp();
        await sleep(20000);   // nobody plays
        const lp2 = await getLp();
        check('P2 a real down moves the stamp to the play; 20 s with no play leaves it where it was',
              lp0 > 0 && lp1 > lp0 && lp1 >= tPlay - 2000 && lp2 === lp1, JSON.stringify({ lp0, lp1, tPlay, lp2, idleMs: lp2 ? Date.now() - lp2 : null }));
    } finally {
        try { for (const c of [c1, c2, c3, c4]) await TP.fbDelete('rooms/~live/' + c); for (const c of [c3, c4]) await TP.fbDelete('rooms/' + c); } catch (e) {}
        try { if (g) await g.cleanup(); } catch (e) {}
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
