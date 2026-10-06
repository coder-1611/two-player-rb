// e2e/find-player.js — V486: FIND A PLAYER (the waiting line and the lobby chat). Two separate browsers (their own
// storage and device ids) on a test-only line (window._rb2p_lfgRoot = rooms/~lfgtest/<run>), so real players never see
// them; the rooms a match makes get Z+digit codes (the real generator makes letters only) and LfgTest names.
//   F1  A waits: B's lobby button says 1 WAITING, and B's FIND screen lists A with a PLAY button (no difficulty in line)
//   F2  a chat line from A shows on B's FIND screen
//   F3  B looks too: they are matched by themselves — one room, B made it (seat A) and A joined it (seat B), SAME mode
//       on both, the line empty again; V487: the room asks them to pick the difficulty, and A's pick (HARD) reaches B
//   F3b V488: both get the PLAYER FOUND card with the other's name (LET'S GO closes it); the found player's room has a
//       chat and a line from A reaches B's room chat
//   F3c V488: in the game (the 'game' view) the same chat is a CHAT chip: A's side-panel line shows on B's chip as 1
//       unread + a peek, B's panel has it and opening clears the count; keys typed in it never reach the game
//   F4  both leave; A waits, B (not in line) taps A's PLAY: one room, SAME mode on both; F4b a friend's room has no chat
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
async function find(p, go) {
    await p.evaluate(() => document.getElementById('rb-find').click());
    await p.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'find', { timeout: 10000 });
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
        await find(A.page, true);
        await A.page.waitForFunction(() => window._rb2p_lfg.state().waiting && Object.keys(window._rb2p_lfg.state().q).length === 1, { timeout: 15000, polling: 200 }).catch(() => {});
        await B.page.waitForFunction(() => /1 WAITING/.test(document.getElementById('rb-find-n').textContent), { timeout: 15000, polling: 200 }).catch(() => {});
        const btn = await B.page.evaluate(() => document.getElementById('rb-find').textContent);
        await find(B.page, false);
        await B.page.waitForFunction(() => /LfgTestA/.test(document.getElementById('rb-find-list').textContent), { timeout: 10000, polling: 200 }).catch(() => {});
        const list1 = await B.page.evaluate(() => Array.from(document.querySelectorAll('#rb-find-list li')).map(li => ({ t: li.textContent, play: !!li.querySelector('button') })));
        console.log('  F1: ' + JSON.stringify({ btn, list1 }));
        const noDif = await B.page.evaluate(() => !document.querySelector('#rb-lobby [data-view="find"] [data-fdif], #rb-find-list .potd-dif'));
        check('F1 A waits: B\'s lobby button says 1 WAITING; B\'s FIND screen lists A with PLAY, and no difficulty anywhere in line',
              /FIND A PLAYER1 WAITING/.test(btn) && list1.length === 1 && /LfgTestA/.test(list1[0].t) && list1[0].play && noDif, JSON.stringify({ btn, list1, noDif }));
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
        const rA0 = await room(A.page);
        await A.page.evaluate(() => document.querySelector('#rb-lobby .diff-btn[data-dif="hard"]').click());   // the pick, in the room
        await B.page.waitForFunction(() => localStorage.getItem('rb2p_difficulty') === 'hard', { timeout: 10000, polling: 200 }).catch(() => {});
        const rA = await room(A.page), rB = await room(B.page);
        const cfg = await get('rooms/' + c1 + '/config') || {}, pl = await get('rooms/' + c1 + '/players') || {}, q3 = await get(ROOT + '/q');
        console.log('  F3: ' + JSON.stringify({ rA0: rA0.status, rA, rB, cfg, players: Object.keys(pl), q: q3 }));
        check('F3 matched by themselves: one room, B made it (A) and A joined (B), SAME mode, the line empty; the room asks for the difficulty and A\'s HARD reaches B',
              rA.code === c1 && rB.code === c1 && rB.role === 'A' && rA.role === 'B' && rA.mode === 'same' && rB.mode === 'same' && /Pick the difficulty together/.test(rA0.status) &&
              rA.dif === 'hard' && rB.dif === 'hard' && cfg.diffMode === 'same' && cfg.sharedDifficulty === 'hard' && pl.a && pl.b && !q3, JSON.stringify({ rA0: rA0.status, rA, rB, cfg, q3 }));
        // ---- F3b ----
        const alertOf = p => p.evaluate(() => { const m = document.getElementById('rb-match'); return { shown: !m.hidden, name: document.getElementById('rb-match-name').textContent }; });
        const alA = await alertOf(A.page), alB = await alertOf(B.page);
        await A.page.evaluate(() => document.getElementById('rb-match-ok').click());
        const closedA = await A.page.evaluate(() => document.getElementById('rb-match').hidden);
        const roomLine = 'gg pick max? ' + RUN;
        await A.page.waitForFunction(() => !document.getElementById('rb-room-chat').hidden, { timeout: 10000, polling: 200 }).catch(() => {});
        await A.page.evaluate(t => { document.getElementById('rb-room-chat-input').value = t; document.getElementById('rb-room-chat-form').requestSubmit(); }, roomLine);
        await B.page.waitForFunction(t => document.getElementById('rb-room-chat-log').textContent.indexOf(t) >= 0, { timeout: 10000, polling: 200 }, roomLine).catch(() => {});
        const rcB = await B.page.evaluate(() => ({ shown: !document.getElementById('rb-room-chat').hidden, log: document.getElementById('rb-room-chat-log').textContent }));
        console.log('  F3b: ' + JSON.stringify({ alA, alB, closedA, rcB }));
        check('F3b both get PLAYER FOUND with the other\'s name (LET\'S GO closes it); the found room has a chat and A\'s line reaches B',
              alA.shown && alA.name === 'LfgTestB' && alB.shown && alB.name === 'LfgTestA' && closedA && rcB.shown && rcB.log.indexOf('LfgTestA' + roomLine) >= 0,
              JSON.stringify({ alA, alB, closedA, rcB }));
        // ---- F3c ----
        await Promise.all([A, B].map(x => x.page.evaluate(() => window._rb2p_lfg.view('game'))));
        await sleep(500);
        const chipA = await A.page.evaluate(() => !document.getElementById('rb-gchat-btn').hidden);
        await A.page.evaluate(() => document.getElementById('rb-gchat-btn').click());
        const gameLine = 'nice throw ' + RUN;
        await A.page.evaluate(t => { document.getElementById('rb-gchat-input').value = t; document.getElementById('rb-gchat-form').requestSubmit(); }, gameLine);
        await B.page.waitForFunction(() => document.querySelector('#rb-gchat-btn .n').textContent === '1', { timeout: 10000, polling: 200 }).catch(() => {});
        const shutB = await B.page.evaluate(() => ({ chip: !document.getElementById('rb-gchat-btn').hidden, n: document.querySelector('#rb-gchat-btn .n').textContent,
            peek: document.getElementById('rb-gchat-peek').hidden ? '' : document.getElementById('rb-gchat-peek').textContent }));
        await B.page.evaluate(() => { window.__keyLeak = 0; window.addEventListener('keydown', () => { window.__keyLeak++; }); document.getElementById('rb-gchat-btn').click(); });
        await B.page.focus('#rb-gchat-input'); await B.page.keyboard.type('ok');
        const openB = await B.page.evaluate(() => ({ panel: !document.getElementById('rb-gchat').hidden, log: document.getElementById('rb-gchat-log').textContent,
            n: document.querySelector('#rb-gchat-btn .n').textContent, typed: document.getElementById('rb-gchat-input').value, leak: window.__keyLeak }));
        console.log('  F3c: ' + JSON.stringify({ chipA, shutB, openB }));
        check('F3c mid-game: the CHAT chip shows; A\'s line is 1 unread + a peek on B; B\'s panel has it, the count clears; typing never reaches the game',
              chipA && shutB.chip && shutB.n === '1' && shutB.peek.indexOf(gameLine) >= 0 && openB.panel && openB.log.indexOf('LfgTestA' + gameLine) >= 0 && openB.n === '' &&
              openB.typed === 'ok' && openB.leak === 0, JSON.stringify({ chipA, shutB, openB }));
        await Promise.all([A, B].map(x => x.page.evaluate(() => window._rb2p_lfg.view('room'))));
        // ---- F4 ----
        await Promise.all([A, B].map(x => x.page.evaluate(() => document.getElementById('rb-leave').click())));
        await Promise.all([A, B].map(x => x.page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 15000 }).catch(() => {})));
        await find(A.page, true);
        await find(B.page, false);
        await B.page.waitForFunction(() => !!document.querySelector('#rb-find-list li button'), { timeout: 15000, polling: 200 }).catch(() => {});
        const c2 = code();
        await B.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.querySelector('#rb-find-list li button').click(); }, c2);
        await Promise.all([A, B].map(x => x.page.waitForFunction(c => document.querySelector('#rb-lobby').dataset.active === 'room' && document.getElementById('rb-room-name').textContent === c,
            { timeout: 30000, polling: 200 }, c2).catch(() => {})));
        await sleep(2500);
        const sA = await room(A.page), sB = await room(B.page), cfg2 = await get('rooms/' + c2 + '/config') || {};
        console.log('  F4: ' + JSON.stringify({ sA, sB, cfg2 }));
        check('F4 a tap on a waiting player: one room, SAME mode on both pages and in the room, one difficulty on both',
              sA.code === c2 && sB.code === c2 && sA.mode === 'same' && sB.mode === 'same' && sA.dif === sB.dif && cfg2.sharedDifficulty === sA.dif && cfg2.diffMode === 'same',
              JSON.stringify({ sA, sB, cfg2 }));
        // F4b: a friend's room (PLAY 2P, a code) has no chat
        await Promise.all([A, B].map(x => x.page.evaluate(() => document.getElementById('rb-leave').click())));
        await Promise.all([A, B].map(x => x.page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 15000 }).catch(() => {})));
        const c3 = code();
        await A.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.getElementById('rb-play2p').click(); }, c3);
        await A.page.waitForFunction(c => document.getElementById('rb-room-name').textContent === c && document.querySelector('#rb-lobby').dataset.active === 'room', { timeout: 20000, polling: 200 }, c3).catch(() => {});
        await sleep(2500);
        await A.page.evaluate(() => window._rb2p_lfg.view('game'));
        const friend = await A.page.evaluate(() => ({ chat: !document.getElementById('rb-room-chat').hidden, alert: !document.getElementById('rb-match').hidden, chip: !document.getElementById('rb-gchat-btn').hidden }));
        await A.page.evaluate(() => window._rb2p_lfg.view('room'));
        check('F4b a friend\'s room (PLAY 2P) has no chat, no CHAT chip in the game, no PLAYER FOUND card', !friend.chat && !friend.alert && !friend.chip, JSON.stringify(friend));
        // ---- F5 ----
        await Promise.all([A, B].map(x => x.page.evaluate(() => document.getElementById('rb-leave').click())));
        await Promise.all([A, B].map(x => x.page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 15000 }).catch(() => {})));
        await find(A.page, true);
        await find(B.page, false);
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
