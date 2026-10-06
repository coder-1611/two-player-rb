// e2e/find-player.js — V486: FIND A PLAYER (the waiting line and the lobby chat). Two separate browsers (their own
// storage and device ids) on a test-only line (window._rb2p_lfgRoot = rooms/~lfgtest/<run>), so real players never see
// them; the rooms a match makes get Z+digit codes (the real generator makes letters only) and LfgTest names.
//   F1  A waits at HARD: B's lobby button says 1 WAITING, and B's FIND screen lists A at HARD with a PLAY button
//   F2  a chat line from A shows on B's FIND screen
//   F3  B looks for HARD too: they are matched by themselves — one room, B made it (seat A) and A joined it (seat B),
//       SAME mode at HARD on both pages and in the room's config, and the line is empty again
//   F4  both leave; A waits at EASY, B (not in line) taps A's PLAY: one room at EASY (A's difficulty), SAME mode
//   F5  a waiting tab that closes leaves the line (onDisconnect): B's list is empty again within seconds
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = Date.now().toString(36), ROOT = 'rooms/~lfgtest/' + RUN;
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const code = () => 'Z' + String(Math.floor(Math.random() * 1000)).padStart(3, '0');

async function open(browser, name) {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((n, root) => {
        window._rb2p_lfgRoot = root;
        try { localStorage.setItem('rb2p_name', n); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {}
    }, name, ROOT);
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window._rb2p_lfg && document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 90000, polling: 300 });
    return { ctx, page };
}
const view = p => p.evaluate(() => document.querySelector('#rb-lobby').dataset.active);
const room = p => p.evaluate(() => ({ view: document.querySelector('#rb-lobby').dataset.active, code: document.getElementById('rb-room-name').textContent,
    role: document.getElementById('rb-you-role').textContent, mode: window._rb2p_diffMode, dif: localStorage.getItem('rb2p_difficulty'),
    status: document.getElementById('rb-status').textContent }));
async function findAt(p, dif, go) {
    await p.evaluate(() => document.getElementById('rb-find').click());
    await p.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'find', { timeout: 10000 });
    await p.evaluate(d => document.querySelector('#rb-lobby [data-fdif="' + d + '"]').click(), dif);
    if (go) await p.evaluate(() => document.getElementById('rb-find-go').click());
}

(async () => {
    console.log('=== V486 FIND A PLAYER (line ' + ROOT + ') ===');
    await H.ensureServer();
    const tok = await require('../tools/fb-auth.js').token();
    const get = async p => (await fetch(DB + p + '.json?auth=' + tok)).json();
    const browser = await H.launchBrowser();
    try {
        const A = await open(browser, 'LfgTestA'), B = await open(browser, 'LfgTestB');
        // ---- F1 ----
        await findAt(A.page, 'hard', true);
        await A.page.waitForFunction(() => window._rb2p_lfg.state().waiting && Object.keys(window._rb2p_lfg.state().q).length === 1, { timeout: 15000, polling: 200 }).catch(() => {});
        await B.page.waitForFunction(() => /1 WAITING/.test(document.getElementById('rb-find-n').textContent), { timeout: 15000, polling: 200 }).catch(() => {});
        const btn = await B.page.evaluate(() => document.getElementById('rb-find').textContent);
        await findAt(B.page, 'hard', false);
        await B.page.waitForFunction(() => /LfgTestA/.test(document.getElementById('rb-find-list').textContent), { timeout: 10000, polling: 200 }).catch(() => {});
        const list1 = await B.page.evaluate(() => Array.from(document.querySelectorAll('#rb-find-list li')).map(li => ({ t: li.textContent, play: !!li.querySelector('button') })));
        console.log('  F1: ' + JSON.stringify({ btn, list1 }));
        check('F1 A waits at HARD: B\'s lobby button says 1 WAITING; B\'s FIND screen lists A at HARD with PLAY',
              /FIND A PLAYER1 WAITING/.test(btn) && list1.length === 1 && /LfgTestA/.test(list1[0].t) && /HARD/.test(list1[0].t) && list1[0].play, JSON.stringify({ btn, list1 }));
        // ---- F2 ----
        const line = 'hello from A ' + RUN;
        await A.page.evaluate(t => { document.getElementById('rb-chat-input').value = t; document.getElementById('rb-chat-form').requestSubmit(); }, line);
        await B.page.waitForFunction(t => document.getElementById('rb-chat-log').textContent.indexOf(t) >= 0, { timeout: 10000, polling: 200 }, line).catch(() => {});
        const chat = await B.page.evaluate(() => document.getElementById('rb-chat-log').textContent);
        check('F2 a chat line from A shows on B\'s FIND screen, with A\'s name', chat.indexOf('LfgTestA' + line) >= 0, chat.slice(-200));
        // ---- F3 ----
        const c1 = code();
        await B.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.getElementById('rb-find-go').click(); }, c1);
        await Promise.all([A, B].map(x => x.page.waitForFunction(c => document.querySelector('#rb-lobby').dataset.active === 'room' && document.getElementById('rb-room-name').textContent === c,
            { timeout: 30000, polling: 200 }, c1).catch(() => {})));
        await sleep(2500);
        const rA = await room(A.page), rB = await room(B.page);
        const cfg = await get('rooms/' + c1 + '/config') || {}, pl = await get('rooms/' + c1 + '/players') || {}, q3 = await get(ROOT + '/q');
        console.log('  F3: ' + JSON.stringify({ rA, rB, cfg, players: Object.keys(pl), q: q3 }));
        check('F3 the same difficulty matches by itself: one room, B made it (A) and A joined (B), SAME at HARD on both and in the room; the line is empty',
              rA.code === c1 && rB.code === c1 && rB.role === 'A' && rA.role === 'B' && rA.mode === 'same' && rB.mode === 'same' && rA.dif === 'hard' && rB.dif === 'hard' &&
              cfg.diffMode === 'same' && cfg.sharedDifficulty === 'hard' && pl.a && pl.b && !q3, JSON.stringify({ rA, rB, cfg, q3 }));
        // ---- F4 ----
        await Promise.all([A, B].map(x => x.page.evaluate(() => document.getElementById('rb-leave').click())));
        await Promise.all([A, B].map(x => x.page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 15000 }).catch(() => {})));
        await findAt(A.page, 'easy', true);
        await findAt(B.page, 'max', false);
        await B.page.waitForFunction(() => !!document.querySelector('#rb-find-list li button'), { timeout: 15000, polling: 200 }).catch(() => {});
        const c2 = code();
        await B.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.querySelector('#rb-find-list li button').click(); }, c2);
        await Promise.all([A, B].map(x => x.page.waitForFunction(c => document.querySelector('#rb-lobby').dataset.active === 'room' && document.getElementById('rb-room-name').textContent === c,
            { timeout: 30000, polling: 200 }, c2).catch(() => {})));
        await sleep(2500);
        const sA = await room(A.page), sB = await room(B.page), cfg2 = await get('rooms/' + c2 + '/config') || {};
        console.log('  F4: ' + JSON.stringify({ sA, sB, cfg2 }));
        check('F4 a tap on a waiting player: one room at THEIR difficulty (EASY), SAME mode, on both pages and in the room',
              sA.code === c2 && sB.code === c2 && sA.mode === 'same' && sB.mode === 'same' && sA.dif === 'easy' && sB.dif === 'easy' && cfg2.sharedDifficulty === 'easy' && cfg2.diffMode === 'same',
              JSON.stringify({ sA, sB, cfg2 }));
        // ---- F5 ----
        await Promise.all([A, B].map(x => x.page.evaluate(() => document.getElementById('rb-leave').click())));
        await Promise.all([A, B].map(x => x.page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 15000 }).catch(() => {})));
        await findAt(A.page, 'max', true);
        await findAt(B.page, 'medium', false);
        await B.page.waitForFunction(() => /LfgTestA/.test(document.getElementById('rb-find-list').textContent), { timeout: 15000, polling: 200 }).catch(() => {});
        const before5 = await B.page.evaluate(() => document.getElementById('rb-find-list').textContent);
        const t0 = Date.now();
        await A.page.close();
        await B.page.waitForFunction(() => !/LfgTestA/.test(document.getElementById('rb-find-list').textContent), { timeout: 30000, polling: 250 }).catch(() => {});
        const after5 = await B.page.evaluate(() => document.getElementById('rb-find-list').textContent);
        console.log('  F5: ' + JSON.stringify({ before5, after5, ms: Date.now() - t0 }));
        check('F5 a waiting tab that closes leaves the line (within seconds)', /LfgTestA/.test(before5) && !/LfgTestA/.test(after5) && Date.now() - t0 < 30000, JSON.stringify({ before5, after5 }));
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
