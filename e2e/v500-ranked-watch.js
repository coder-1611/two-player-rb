// e2e/v500-ranked-watch.js — V500: RANKINGS and WATCH LIVE in a real two-player game (two devices: two browser profiles),
// with a third device watching. The owner: "create watch games going on thing, where people can spectate games and chat
// around. Then create an elo system where everybody is a 1000 ... like chess elo ... a leaderboard with names censored".
//   L1  the lobby has RANKINGS (a new player reads 1000) and WATCH LIVE; the room says the game is ranked (SAME difficulty)
//   W1  the game is on the WATCH LIVE list (rooms/~live/{code}: the names, the score, the quarter) within 25 s
//   W2  a third device watches from the list: the live picture comes through the waiting player (the 'relay' path) and
//       shows; both players' badges count 1 watcher
//   W3  the watchers' chat: the watcher's line is stored and shows on its screen
//   W4  EXIT: back to the list, the watcher's records gone, the players count 0
//   R1  the final: both phones record it (games/{start}/fin/{a,b}) and note it on the queue; tools/elo.js rates it — two
//       devices, SAME: 1000 -> 1032 and 968 — and both stats screens show their change
const H = require('./harness');
const TP = require('./two-player');
const { execFileSync } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }
const RUN = 'r' + Date.now().toString(36), TROOT = 'rooms/~elotest/' + RUN;
const finalShown = page => page.evaluate(() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display === 'block'); }).catch(() => false);

(async () => {
    console.log('=== V500 RANKINGS + WATCH LIVE (' + RUN + ') ===');
    const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(), ctxC = await real.createBrowserContext(); let n = 0;
    const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    const L1 = {};
    const g = await TP.startTwoPlayerGame({ browser: two, beforeReady: async (page, role) => {
        await page.evaluate((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; }, TROOT);
        if (role === 'a') { await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="same"]'); if (m) m.click(); }); await sleep(1500); }
        await sleep(2500);
        L1[role] = await page.evaluate(() => ({ ranks: !!document.getElementById('rb-ranks-btn'), watch: !!document.getElementById('rb-watch-btn'),
            rating: (document.getElementById('rb-my-rating') || {}).textContent, tag: (document.getElementById('rb-rank-tag') || {}).textContent || '' }));
    } });
    let C = null;
    try {
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a, code = g.code;   // A = role a
        check('L1 the lobby has RANKINGS (a new player reads 1000) and WATCH LIVE; the room says RANKED GAME (SAME)',
              ['a', 'b'].every(r => L1[r] && L1[r].ranks && L1[r].watch && L1[r].rating === '1000' && /RANKED GAME/.test(L1[r].tag)), JSON.stringify(L1));
        // ---- W1: the list
        const w1 = await until(async () => { const e = await TP.fbGet('rooms/~live/' + code); return { ok: !!(e && e.code === code && e.an && e.q), e }; }, 25000, 1000);
        check('W1 the game is on the WATCH LIVE list (names, score, quarter) within 25 s', w1.ms !== null, JSON.stringify(w1.e));
        // ---- W2: a third device watches, from the list
        const realC = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => ctxC.newPage(); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
        C = await TP.openLobbyPage(realC, 'C', {});
        await C.page.evaluate(() => { window._rb2p_watchAll = true; document.getElementById('rb-watch-btn').click(); });
        const listed = await until(async () => ({ ok: await C.page.evaluate(() => [...document.querySelectorAll('#rb-watch-list li')].some(li => /Bot A/.test(li.textContent) && /Bot B/.test(li.textContent))) }), 20000, 700);
        await C.page.evaluate(() => { const li = [...document.querySelectorAll('#rb-watch-list li')].find(l => /Bot A/.test(l.textContent) && /Bot B/.test(l.textContent)); if (li) li.querySelector('button').click(); });
        const w2 = await until(async () => {
            const v = await C.page.evaluate(() => { const s = window._rb2p_view.stats(); const chip = document.getElementById('rb-oppview-chip'); return { mode: s.rcv.mode, rx: s.rcv.rx, showing: s.rcv.showing, chip: chip ? chip.textContent : '', spec: window._rb2p_specState() }; });
            return { ok: v.mode === 'relay' && v.rx > 10 && v.showing, v };
        }, 45000, 800);
        const wa = await A.page.evaluate(() => window._rb2p_watchers), wb = await B.page.evaluate(() => window._rb2p_watchers);
        const badge = await A.page.evaluate(() => (document.getElementById('rb-fb-badge') || {}).textContent || '');
        check('W2 a third device watches from the list: the live picture comes through the waiting player and shows; both players count 1 watcher',
              listed.ms !== null && w2.ms !== null && wa === 1 && wb === 1 && /1 WATCHING/.test(badge), JSON.stringify({ listed: listed.ms, w2: w2.v, afterMs: w2.ms, wa, wb, badge }));
        // ---- W3: the watchers' chat
        await C.page.evaluate(() => { const i = document.getElementById('rb-spec-input'); i.value = 'what a play'; document.getElementById('rb-spec-form').requestSubmit(); });
        const w3 = await until(async () => {
            const chat = await TP.fbGet('rooms/' + code + '/watch/chat') || {}, stored = Object.values(chat).some(m => m && m.text === 'what a play');
            const shown = await C.page.evaluate(() => /what a play/.test((document.getElementById('rb-spec-log') || {}).textContent || ''));
            return { ok: stored && shown, stored, shown };
        }, 10000, 500);
        check('W3 the watchers\' chat: the line is stored and shows on the watcher\'s screen', w3.ms !== null, JSON.stringify(w3));
        // ---- W4: EXIT
        await C.page.evaluate(() => document.getElementById('rb-spec-exit').click());
        const w4 = await until(async () => {
            const back = await C.page.evaluate(() => ({ spec: window._rb2p_specState(), view: document.getElementById('rb-lobby').getAttribute('data-active'), hud: document.getElementById('rb-spec-hud').hidden }));
            const s = await TP.fbGet('rooms/' + code + '/watch/s'), wa2 = await A.page.evaluate(() => window._rb2p_watchers);
            return { ok: !back.spec && back.view === 'watch' && back.hud && !s && wa2 === 0, back, s, wa2 };
        }, 15000, 600);
        check('W4 EXIT: back to the list, the watcher\'s records gone, the players count 0', w4.ms !== null, JSON.stringify(w4));
        // ---- R1: the final, the rating
        const aWait = await A.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
        const off = aWait ? B : A;
        await off.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_clockLicence && window._rb2p_clockLicence('test');
            window._rb2p_gameOverReported = false; window._rb2p_inOvertime = false;
            window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
            em.engineQuarter = 5; em.setUserScore(24); em.setOpponentScore(10);
            window._rb2p_pastRegSeenMs = Date.now() - 25000;
        });
        const ended = await until(async () => ({ ok: (await finalShown(A.page)) && (await finalShown(B.page)) }), 60000, 1000);
        const gk = await A.page.evaluate(() => window._rb2p_gameKey);
        const fins = await until(async () => { const r = await TP.fbGet('rooms/' + code + '/games/' + gk); const q = await TP.fbGet(TROOT + '/q/' + code + '_' + gk);
                                               return { ok: !!(r && r.fin && r.fin.a && r.fin.b && r.uids && r.uids.a && r.uids.b && q), rec: r && { fin: r.fin, uids: r.uids, mode: r.mode }, q: !!q }; }, 20000, 1000);
        let job = '';
        try {
            job = execFileSync('node', [path.join(__dirname, '..', 'tools', 'elo.js'), '--include-test', '--queue', TROOT + '/q', '--pub', TROOT + '/pub',
                '--state', path.join(os.tmpdir(), 'elo-' + RUN + '.json'), '--now', String(Date.now() + 30000)], { encoding: 'utf8', timeout: 60000 });
        } catch (e) { job = 'job failed: ' + (e.stdout || '') + (e.stderr || e.message); }
        const gres = await TP.fbGet(TROOT + '/pub/g/' + code + '_' + gk);
        const winner = (off === A) ? 'a' : 'b', loser = winner === 'a' ? 'b' : 'a';
        const lines = await until(async () => {
            const la = await A.page.evaluate(() => (document.getElementById('rb-final-elo') || {}).textContent || ''), lb = await B.page.evaluate(() => (document.getElementById('rb-final-elo') || {}).textContent || '');
            const want = r => (r === winner ? /RANKED · RATING 1000 → 1032 \(\+32\)/ : /RANKED · RATING 1000 → 968 \(-32\)/);
            return { ok: want('a').test(la) && want('b').test(lb), la, lb };
        }, 60000, 2000);
        check('R1 the final is recorded by both phones and rated on the Mac (two devices, SAME): 1000 -> 1032 / 968, shown on both stats screens',
              ended.ms !== null && fins.ms !== null && !!(gres && gres.ranked && gres[winner] && gres[winner].r1 === 1032 && gres[loser].r1 === 968) && lines.ms !== null,
              JSON.stringify({ ended: ended.ms, fins: fins.rec, g: gres, lines: { a: lines.la, b: lines.lb }, job: job.trim().split('\n').slice(-3) }));
        const errs = [A, B, C].map(P => (P.errors || []).filter(e => !/_GL2/.test(e))).flat();
        check('no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
    } catch (e) { fail++; console.log('  FAIL  ' + (e && e.stack || e)); }
    finally {
        try { if (C) await C.page.close(); } catch (e) {}
        try { await TP.fbDelete(TROOT); } catch (e) {}
        try { await TP.fbDelete('rooms/~live/' + g.code); } catch (e) {}
        try { await g.cleanup(); } catch (e) {}
        try { await real.close(); } catch (e) {}
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
