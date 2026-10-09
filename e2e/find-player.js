// e2e/find-player.js — FIND A PLAYER (V486-V493): the line, the lobby chat, the matched room. Separate browsers (their
// own storage and device ids) on a test-only line (window._rb2p_lfgRoot = rooms/~lfgtest/<run>), so real players never
// see them; the rooms a match makes get Z+digit codes (the real generator makes letters only) and LfgTest names.
//   F1  V493: A looks — A's screen is a search card (no list), B's lobby shows the banner A PLAYER WANTS A GAME (no
//       count on the FIND button), and B's FIND screen has no list but the true crowd: players in the last hour, games
//       today, games being played now, the last match made here (the published numbers, here a test record)
//   F2  a chat line from A shows on B's FIND screen
//   F3  B looks too: they are matched by themselves — one room, B made it (seat A) and A joined it (seat B), SAME mode
//       on both, the line empty again; the room asks them to pick the difficulty, and A's pick (HARD) reaches B
//   F3b both get the PLAYER FOUND card with the other's name (LET'S GO closes it); the room's chat carries A's line to B
//   F3c in the game (the 'game' view) the same chat is a CHAT chip: A's side-panel line shows on B's chip as 1 unread +
//       a peek, B's panel has it and opening clears the count; keys typed in it never reach the game
//   F4  V493: both leave; A looks, B taps the banner on the lobby: one room, SAME mode on both
//   F4b a friend's room (PLAY 2P, joined by its code) has the chat too once both are in, and the CHAT chip in the game
//       — but no PLAYER FOUND card
//   F6  V493: the search card: the clock runs; PLAY THE COMPUTER after the solo time, the open invite after the invite
//       time (test times: 2 s and 4 s); a quiet hour says so honestly
//   F7  V493: the open invite — a new page opened with ?play=<C's id> plays C by itself (one room)
//   F8  V493: the line's record (log/<day>): starts, and matches by both maker and joiner, with how they came (banner, invite)
//   F5  a waiting tab that closes leaves the line (onDisconnect): B's banner goes within seconds
//   F9  V493: STOP LOOKING takes you out of the line and back to FIND A GAME
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = Date.now().toString(36), ROOT = 'rooms/~lfgtest/' + RUN;
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const code = () => 'Z' + String(Math.floor(Math.random() * 1000)).padStart(3, '0');

async function open(browser, name, seams, query) {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((n, root, sm) => {
        window._rb2p_lfgRoot = root;
        Object.assign(window, sm || {});
        try { localStorage.setItem('rb2p_name', n); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {}
    }, name, ROOT, seams || null);
    const u = new URL(H.url()); for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v);
    await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window._rb2p_lfg && /entry|room/.test(document.querySelector('#rb-lobby').dataset.active), { timeout: 90000, polling: 300 });
    return { ctx, page };
}
const room = p => p.evaluate(() => ({ view: document.querySelector('#rb-lobby').dataset.active, code: document.getElementById('rb-room-name').textContent,
    role: document.getElementById('rb-you-role').textContent, mode: window._rb2p_diffMode, dif: localStorage.getItem('rb2p_difficulty'),
    status: document.getElementById('rb-status').textContent }));
async function find(p, go) {
    await p.evaluate(() => document.getElementById('rb-find').click());
    await p.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'find', { timeout: 10000 });
    if (go) await p.evaluate(() => document.getElementById('rb-find-go').click());
}
const leaveBoth = async (...xs) => {
    await Promise.all(xs.map(x => x.page.evaluate(() => { const l = document.getElementById('rb-leave'); if (document.querySelector('#rb-lobby').dataset.active === 'room') l.click(); else document.getElementById('rb-find-back') && document.querySelector('#rb-lobby').dataset.active === 'find' && document.getElementById('rb-find-back').click(); })));
    await Promise.all(xs.map(x => x.page.waitForFunction(() => document.querySelector('#rb-lobby').dataset.active === 'entry', { timeout: 15000 }).catch(() => {})));
};
const inRoom = (xs, c) => Promise.all(xs.map(x => x.page.waitForFunction(cc => document.querySelector('#rb-lobby').dataset.active === 'room' && document.getElementById('rb-room-name').textContent === cc,
    { timeout: 30000, polling: 200 }, c).catch(() => {})));
const banner = p => p.evaluate(() => { const b = document.getElementById('rb-lfg-banner'); const r = b.getBoundingClientRect(); return { shown: !b.hidden && r.width > 0, text: b.textContent }; });

(async () => {
    console.log('=== FIND A PLAYER (line ' + ROOT + ') ===');
    await H.ensureServer();
    const tok = await require('../tools/fb-auth.js').token();
    const get = async p => (await fetch(DB + p + '.json?auth=' + tok)).json();
    const browser = await H.launchBrowser();
    const now = Date.now();
    const busy = { at: now, lastHour: 38, today: { players: 270, games: 242 }, playingNow: 3, lobby: { lastMatchAt: now - 4 * 60000 }, waitByHour: {} };
    try {
        const A = await open(browser, 'LfgTestA'), B = await open(browser, 'LfgTestB', { _rb2p_lobbyStatsSrc: busy });
        // ---- F1 ----
        await find(A.page, true);
        await A.page.waitForFunction(() => window._rb2p_lfg.state().waiting && Object.keys(window._rb2p_lfg.state().q).length === 1, { timeout: 15000, polling: 200 }).catch(() => {});
        await sleep(1500);
        const cardA = await A.page.evaluate(() => ({ idle: !document.getElementById('rb-find-idle').hidden, search: !document.getElementById('rb-find-search').hidden, clock: document.getElementById('rb-find-clock').textContent }));
        await B.page.waitForFunction(() => !document.getElementById('rb-lfg-banner').hidden, { timeout: 15000, polling: 200 }).catch(() => {});
        const bn1 = await banner(B.page), btn = await B.page.evaluate(() => document.getElementById('rb-find').textContent);
        await find(B.page, false);
        await B.page.waitForFunction(() => !document.getElementById('rb-find-crowd').hidden, { timeout: 10000, polling: 200 }).catch(() => {});
        const scrB = await B.page.evaluate(() => ({ list: !!document.getElementById('rb-find-list'), crowd: document.getElementById('rb-find-crowd').textContent,
            feed: Array.from(document.querySelectorAll('#rb-find-feed li')).map(li => li.textContent), bannerOnFind: !document.getElementById('rb-lfg-banner').hidden && document.getElementById('rb-lfg-banner').getBoundingClientRect().width > 0 }));
        console.log('  F1: ' + JSON.stringify({ cardA, bn1, btn, scrB }));
        check('F1 A gets a search card (no list); B\'s lobby shows the banner, the FIND button no count; B\'s FIND screen: no list, the true crowd + feed',
              !cardA.idle && cardA.search && /^0:0\d$/.test(cardA.clock) && bn1.shown && /A PLAYER WANTS A GAME/.test(bn1.text) && btn === 'FIND A PLAYER' && !scrB.list &&
              /38 players in the last hour · 242 games today/.test(scrB.crowd) && scrB.feed.some(t => /3 games are being played right now/.test(t)) &&
              scrB.feed.some(t => /last match made here 4 min ago/.test(t)) && !scrB.bannerOnFind, JSON.stringify({ cardA, bn1, btn, scrB }));
        // ---- F2 ----
        const line = 'hello from A ' + RUN;
        await A.page.evaluate(t => { document.getElementById('rb-chat-input').value = t; document.getElementById('rb-chat-form').requestSubmit(); }, line);
        await B.page.waitForFunction(t => document.getElementById('rb-chat-log').textContent.indexOf(t) >= 0, { timeout: 10000, polling: 200 }, line).catch(() => {});
        const chat = await B.page.evaluate(() => document.getElementById('rb-chat-log').textContent);
        check('F2 a chat line from A shows on B\'s FIND screen, with A\'s name', chat.indexOf('LfgTestA' + line) >= 0, chat.slice(-200));
        // ---- F3 ----
        const c1 = code();
        await B.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.getElementById('rb-find-go').click(); }, c1);
        await inRoom([A, B], c1);
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
        // ---- F4: the banner ----
        await leaveBoth(A, B);
        await find(A.page, true);
        await B.page.waitForFunction(() => !document.getElementById('rb-lfg-banner').hidden, { timeout: 15000, polling: 200 }).catch(() => {});
        const c2 = code();
        await B.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.getElementById('rb-lfg-banner').click(); }, c2);
        await inRoom([A, B], c2);
        await sleep(2500);
        const sA = await room(A.page), sB = await room(B.page), cfg2 = await get('rooms/' + c2 + '/config') || {};
        console.log('  F4: ' + JSON.stringify({ sA, sB, cfg2 }));
        check('F4 a tap on the lobby\'s banner plays the one looking: one room, SAME mode on both pages and in the room, one difficulty',
              sA.code === c2 && sB.code === c2 && sA.mode === 'same' && sB.mode === 'same' && sA.dif === sB.dif && cfg2.sharedDifficulty === sA.dif && cfg2.diffMode === 'same',
              JSON.stringify({ sA, sB, cfg2 }));
        // ---- F4b: a friend's room (PLAY 2P, a code) has the chat too (V489) ----
        await leaveBoth(A, B);
        const c3 = code();
        await A.page.evaluate(c => { window._rb2p_forceRoomCode = c; document.getElementById('rb-play2p').click(); }, c3);
        await A.page.waitForFunction(c => document.getElementById('rb-room-name').textContent === c && document.querySelector('#rb-lobby').dataset.active === 'room', { timeout: 20000, polling: 200 }, c3).catch(() => {});
        await sleep(1500);
        const alone = await A.page.evaluate(() => !document.getElementById('rb-room-chat').hidden);
        await B.page.evaluate(c => { document.getElementById('rb-room-input').value = c; document.getElementById('rb-join').click(); }, c3);
        await A.page.waitForFunction(() => !document.getElementById('rb-room-chat').hidden, { timeout: 20000, polling: 200 }).catch(() => {});
        await A.page.evaluate(() => window._rb2p_lfg.view('game'));
        const friend = await A.page.evaluate(() => ({ chat: !document.getElementById('rb-room-chat').hidden, alert: !document.getElementById('rb-match').hidden, chip: !document.getElementById('rb-gchat-btn').hidden }));
        friend.alone = alone; friend.bAlert = await B.page.evaluate(() => !document.getElementById('rb-match').hidden);
        await A.page.evaluate(() => window._rb2p_lfg.view('room'));
        check('F4b a friend\'s room (a code): the chat once both are in (not while alone), the CHAT chip in the game, no PLAYER FOUND card',
              !friend.alone && friend.chat && !friend.alert && !friend.bAlert && friend.chip, JSON.stringify(friend));
        await leaveBoth(A, B);
        // ---- F6: the search card's clock, its offers, an honest quiet hour ----
        const quiet = { at: Date.now(), lastHour: 3, today: { players: 40, games: 5 }, playingNow: 0, lobby: {}, waitByHour: {} };
        const C = await open(browser, 'LfgTestC', { _rb2p_lfgTimes: { solo: 2, invite: 4 }, _rb2p_lobbyStatsSrc: quiet });
        await find(C.page, true);
        await sleep(800);
        const c6a = await C.page.evaluate(() => ({ solo: !document.getElementById('rb-find-solo').hidden, invite: !document.getElementById('rb-find-invite').hidden, est: document.getElementById('rb-find-est').textContent }));
        await sleep(2500);
        const c6b = await C.page.evaluate(() => ({ solo: !document.getElementById('rb-find-solo').hidden, invite: !document.getElementById('rb-find-invite').hidden, href: document.getElementById('rb-find-solo-link').href, target: document.getElementById('rb-find-solo-link').target }));
        await sleep(2200);
        const c6c = await C.page.evaluate(() => ({ invite: !document.getElementById('rb-find-invite').hidden, clock: document.getElementById('rb-find-clock').textContent }));
        console.log('  F6: ' + JSON.stringify({ c6a, c6b, c6c }));
        check('F6 the search card: the clock runs; PLAY THE COMPUTER (a new tab) after the solo time, the open invite after the invite time; a quiet hour says so',
              !c6a.solo && !c6a.invite && /Quiet right now/.test(c6a.est) && c6b.solo && !c6b.invite && /retrobowlofficial\.com/.test(c6b.href) && c6b.target === '_blank' &&
              c6c.invite && /^0:0[4-9]$/.test(c6c.clock), JSON.stringify({ c6a, c6b, c6c }));
        // ---- F7: the open invite ----
        const sidC = await C.page.evaluate(() => window._rb2p_lfg.sid), c7 = code();
        const D = await open(browser, 'LfgTestD', { _rb2p_forceRoomCode: c7 }, { play: sidC });
        await inRoom([C, D], c7);
        await sleep(1500);
        const r7c = await room(C.page), r7d = await room(D.page), url7 = await D.page.evaluate(() => location.search);
        console.log('  F7: ' + JSON.stringify({ r7c, r7d, url7 }));
        check('F7 the open invite: a page opened with ?play=<C> plays C by itself — one room — and the link\'s ?play= is gone from its address',
              r7c.code === c7 && r7d.code === c7 && r7d.role === 'A' && r7c.role === 'B' && !/play=/.test(url7), JSON.stringify({ r7c, r7d, url7 }));
        // ---- F8: the line's record ----
        await sleep(1500);
        const day = new Date().toISOString().slice(0, 10), log = Object.values(await get(ROOT + '/log/' + day) || {});
        const kinds = log.map(x => x.k + (x.role ? ':' + x.role : '') + (x.via ? ':' + x.via : ''));
        console.log('  F8: ' + JSON.stringify(kinds));
        check('F8 the record: starts, matches by maker and joiner (with their waits), the banner and invite matches marked',
              kinds.filter(k => /^start/.test(k)).length >= 3 && kinds.some(k => k === 'match:maker:banner') && kinds.some(k => k === 'match:maker:invite') &&
              log.filter(x => x.k === 'match' && x.role === 'joiner').every(x => typeof x.w === 'number' && x.w >= 0) && log.filter(x => x.k === 'match' && x.role === 'joiner').length >= 3,
              JSON.stringify(kinds));
        // ---- F5: a closed tab leaves the line (B's banner goes) ----
        await find(A.page, true);
        await B.page.waitForFunction(() => !document.getElementById('rb-lfg-banner').hidden, { timeout: 15000, polling: 200 }).catch(() => {});
        const before5 = await banner(B.page), t0 = Date.now();
        await A.page.close();
        await B.page.waitForFunction(() => document.getElementById('rb-lfg-banner').hidden, { timeout: 30000, polling: 250 }).catch(() => {});
        const after5 = await banner(B.page);
        console.log('  F5: ' + JSON.stringify({ before5: before5.shown, after5: after5.shown, ms: Date.now() - t0 }));
        check('F5 a waiting tab that closes leaves the line: the banner on B goes within seconds', before5.shown && !after5.shown && Date.now() - t0 < 30000, JSON.stringify({ before5, after5 }));
        // ---- F9: STOP LOOKING ----
        await find(B.page, true);
        await sleep(800);
        const w9 = await B.page.evaluate(() => window._rb2p_lfg.state().waiting);
        await B.page.evaluate(() => document.getElementById('rb-find-stop').click());
        await sleep(800);
        const s9 = await B.page.evaluate(() => ({ waiting: window._rb2p_lfg.state().waiting, idle: !document.getElementById('rb-find-idle').hidden, search: !document.getElementById('rb-find-search').hidden, state: document.getElementById('rb-find-state').textContent }));
        const q9 = await get(ROOT + '/q');
        check('F9 STOP LOOKING: out of the line, back to FIND A GAME', w9 && !s9.waiting && s9.idle && !s9.search && /Stopped looking/.test(s9.state) && !q9, JSON.stringify({ w9, s9, q9 }));
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
