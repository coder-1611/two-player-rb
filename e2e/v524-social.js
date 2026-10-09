// e2e/v524-social.js — V524 (the owner: "add a challenge system, where you can directly challenge someone, but they have
// to be on the rankings page. On it should show when last online. There should also be a dm feature where you can message
// someone, and it is stored forever, like insta"). Two players in separate browsers (their own device ids), the real
// database. A test player is not on the real board, so each page's RANKINGS gets the other as an extra row
// (window._rb2p_rankExtra); the room a challenge makes gets a Z+digit code.
//   T1  LAST ONLINE: A's RANKINGS shows B "ONLINE NOW" under the name; tapping B opens B's card (name, record, ONLINE NOW,
//       CHALLENGE, MESSAGE)
//   T2  a MESSAGE: A writes to B — B's MESSAGES button counts 1, a toast shows it, the list has A's line (new), the
//       conversation shows it and opening it clears the count; B's reply reaches A's open conversation at once
//   T3  stored forever: A reloads the page — the conversation is still there, both messages
//   T4  a CHALLENGE, declined: A challenges B from the card — A waits (CHALLENGE SENT), B gets "<A> CHALLENGES YOU!";
//       NO THANKS — A is told "said no thanks"
//   T5  a CHALLENGE, accepted: B's page makes a room (seat A) and A's page joins it (seat B) — the same room, SAME mode on
//       both, the GAME ON! card on both
//   T6  BLOCK: B blocks A — A's message is refused ("You can't message"), A's challenge too; UNBLOCK — A messages again
const fs = require('fs'), os = require('os'), path = require('path');
const H = require('./harness');
const sleep = H.sleep;
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const CODE = 'Z' + String(Math.floor(Math.random() * 1000)).padStart(3, '0');

async function owner() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    return (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
}
async function open(ctx, name, seams) {
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((n, sm) => {
        Object.assign(window, sm || {});
        try { localStorage.setItem('rb2p_name', n); localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {}
    }, name, seams || null);
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window._rb2p_social && window._rb2p_social.state().started && /entry|room/.test(document.querySelector('#rb-lobby').dataset.active), { timeout: 90000, polling: 300 });
    return page;
}
const view = p => p.evaluate(() => document.querySelector('#rb-lobby').dataset.active);
const st = p => p.evaluate(() => window._rb2p_social.state());
const txt = (p, id) => p.evaluate(i => { const e = document.getElementById(i); return e ? e.textContent : null; }, id);
const shown = (p, id) => p.evaluate(i => { const e = document.getElementById(i); return !!(e && !e.hidden && e.getBoundingClientRect().width > 0); }, id);
const click = (p, id) => p.evaluate(i => document.getElementById(i).click(), id);
const waitFor = (p, fn, arg, ms) => p.waitForFunction(fn, { timeout: ms || 15000, polling: 200 }, arg).then(() => true, () => false);
async function ranks(p, extra) {
    await p.evaluate(x => { window._rb2p_rankExtra = x; document.getElementById('rb-ranks-btn').click(); }, extra);
    await waitFor(p, u => !!document.querySelector('#rb-rank-list li[role="button"] .seen[data-p="' + u + '"]'), extra[0].u, 20000);
}

(async () => {
    console.log('=== V524 CHALLENGES, LAST ONLINE, MESSAGES (room ' + CODE + ') ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    const ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext();
    let A = null, B = null, pA = '', pB = '';
    try {
        A = await open(ctxA, 'SocTest A');
        B = await open(ctxB, 'SocTest B', { _rb2p_forceRoomCode: CODE });
        pA = (await st(A)).me; pB = (await st(B)).me;
        const rowA = { nm: 'SocTest A', r: 1011, w: 5, l: 1, d: 0, n: 6, u: pA }, rowB = { nm: 'SocTest B', r: 1105, w: 7, l: 2, d: 0, n: 9, u: pB };

        // T1
        await ranks(A, [rowB]);
        await waitFor(A, u => /ONLINE NOW/.test(document.querySelector('#rb-rank-list .seen[data-p="' + u + '"]').textContent), pB, 15000);
        const seenRow = await A.evaluate(u => document.querySelector('#rb-rank-list .seen[data-p="' + u + '"]').textContent, pB);
        await A.evaluate(u => document.querySelector('#rb-rank-list .seen[data-p="' + u + '"]').closest('li').click(), pB);
        await waitFor(A, () => /ONLINE NOW/.test(document.getElementById('rb-pcard-seen').textContent), null, 10000);
        const card = { open: await shown(A, 'rb-pcard'), name: await txt(A, 'rb-pcard-name'), rec: await txt(A, 'rb-pcard-rec'), seen: await txt(A, 'rb-pcard-seen'),
                       ch: await shown(A, 'rb-pcard-ch'), dm: await shown(A, 'rb-pcard-dm') };
        check('T1 LAST ONLINE: B shows "ONLINE NOW" on A\'s RANKINGS; tapping B opens the card (name, record, ONLINE NOW, CHALLENGE, MESSAGE)',
              /ONLINE NOW/.test(seenRow) && card.open && card.name === 'SocTest B' && /7-2/.test(card.rec) && card.seen === 'ONLINE NOW' && card.ch && card.dm, JSON.stringify({ seenRow, card }));

        // T2
        await click(A, 'rb-pcard-dm');
        await waitFor(A, () => document.querySelector('#rb-lobby').dataset.active === 'dm', null, 8000);
        await A.evaluate(() => { document.getElementById('rb-dm-input').value = 'hello from A'; document.getElementById('rb-dm-form').requestSubmit(); });
        const gotB = await waitFor(B, () => document.getElementById('rb-msgs-n').textContent === '1', null, 15000);
        const toast = { shown: await shown(B, 'rb-dm-toast'), text: await txt(B, 'rb-dm-toast') };
        await click(B, 'rb-msgs-btn');
        await waitFor(B, () => document.querySelectorAll('#rb-dm-list li[data-p]').length > 0, null, 8000);
        const listB = await B.evaluate(() => Array.from(document.querySelectorAll('#rb-dm-list li[data-p]')).map(li => ({ cls: li.className, t: li.textContent })));
        await B.evaluate(() => document.querySelector('#rb-dm-list li[data-p]').click());
        await waitFor(B, () => /hello from A/.test(document.getElementById('rb-dm-log').textContent), null, 10000);
        const readB = await waitFor(B, () => document.getElementById('rb-msgs-n').textContent === '', null, 10000);
        const logB = await txt(B, 'rb-dm-log');
        await B.evaluate(() => { document.getElementById('rb-dm-input').value = 'hi A, B here'; document.getElementById('rb-dm-form').requestSubmit(); });
        const replyA = await waitFor(A, () => /hi A, B here/.test(document.getElementById('rb-dm-log').textContent), null, 10000);
        check('T2 a MESSAGE: B\'s MESSAGES counts 1 + a toast; the list has A (new); the conversation shows it and clears the count; B\'s reply reaches A at once',
              gotB && toast.shown && /SocTest A: hello from A/.test(toast.text) && listB.length === 1 && listB[0].cls === 'new' && /SocTest A/.test(listB[0].t) &&
              /hello from A/.test(logB) && readB && replyA, JSON.stringify({ gotB, toast, listB, readB, logB, replyA }));

        // T3
        await A.reload({ waitUntil: 'domcontentloaded' });
        await A.waitForFunction(() => window._rb2p_social && window._rb2p_social.state().started && /entry|room/.test(document.querySelector('#rb-lobby').dataset.active), { timeout: 90000, polling: 300 });
        await click(A, 'rb-msgs-btn');
        await waitFor(A, () => document.querySelectorAll('#rb-dm-list li[data-p]').length > 0, null, 10000);
        await A.evaluate(() => document.querySelector('#rb-dm-list li[data-p]').click());
        const kept = await waitFor(A, () => /hello from A/.test(document.getElementById('rb-dm-log').textContent) && /hi A, B here/.test(document.getElementById('rb-dm-log').textContent), null, 10000);
        check('T3 stored: after a reload A\'s conversation with B still has both messages', kept, await txt(A, 'rb-dm-log'));

        // T4
        await click(A, 'rb-dm-back'); await click(A, 'rb-msgs-back');
        await ranks(A, [rowB]);
        await B.evaluate(x => { window._rb2p_rankExtra = x; }, [rowA]);
        await A.evaluate(u => document.querySelector('#rb-rank-list .seen[data-p="' + u + '"]').closest('li').click(), pB);
        await click(A, 'rb-pcard-ch');
        const waitA = await waitFor(A, () => document.getElementById('rb-chal-title').textContent === 'CHALLENGE SENT' && !document.getElementById('rb-chal').hidden, null, 10000);
        const gotCh = await waitFor(B, () => /SocTest A CHALLENGES YOU!/.test(document.getElementById('rb-chal-title').textContent) && !document.getElementById('rb-chal').hidden, null, 15000);
        const inB = { title: await txt(B, 'rb-chal-title'), line: await txt(B, 'rb-chal-line'), yes: await shown(B, 'rb-chal-yes'), no: await shown(B, 'rb-chal-no') };
        await click(B, 'rb-chal-no');
        const toldA = await waitFor(A, () => /said no thanks/.test(document.getElementById('rb-chal-line').textContent), null, 10000);
        check('T4 a CHALLENGE, declined: A waits (CHALLENGE SENT); B gets "SocTest A CHALLENGES YOU!" (rating, ACCEPT, NO THANKS); NO THANKS — A is told',
              waitA && gotCh && /RATING/.test(inB.line) && inB.yes && inB.no && toldA, JSON.stringify({ waitA, gotCh, inB, toldA }));

        // T5
        await click(A, 'rb-chal-ok');
        await A.evaluate(u => document.querySelector('#rb-rank-list .seen[data-p="' + u + '"]').closest('li').click(), pB);
        await click(A, 'rb-pcard-ch');
        await waitFor(B, () => /CHALLENGES YOU!/.test(document.getElementById('rb-chal-title').textContent) && !document.getElementById('rb-chal').hidden, null, 15000);
        await click(B, 'rb-chal-yes');
        const roomOf = p => p.evaluate(() => ({ view: document.querySelector('#rb-lobby').dataset.active, code: document.getElementById('rb-room-name').textContent,
            role: document.getElementById('rb-you-role').textContent, mode: window._rb2p_diffMode, card: !document.getElementById('rb-match').hidden, title: document.getElementById('rb-match-title').textContent }));
        const inRoom = p => waitFor(p, c => document.querySelector('#rb-lobby').dataset.active === 'room' && document.getElementById('rb-room-name').textContent === c, CODE, 30000);
        const bothIn = (await inRoom(B)) && (await inRoom(A));
        await sleep(1500);
        const rA = await roomOf(A), rB = await roomOf(B), stA = await st(A);
        check('T5 a CHALLENGE, accepted: B\'s page makes the room (seat A), A\'s page joins it (seat B) — one room, SAME on both, GAME ON! on both, the challenge gone',
              bothIn && rA.code === CODE && rB.code === CODE && rA.role !== rB.role && rA.mode === 'same' && rB.mode === 'same' && rA.card && rB.card &&
              rA.title === 'GAME ON!' && rB.title === 'GAME ON!' && !stA.out, JSON.stringify({ rA, rB, out: stA.out }));
        for (const p of [A, B]) await p.evaluate(() => { document.getElementById('rb-match-ok').click(); document.getElementById('rb-leave').click(); });
        await Promise.all([A, B].map(p => waitFor(p, () => document.querySelector('#rb-lobby').dataset.active === 'entry', null, 15000)));

        // T6
        await B.evaluate(id => window._rb2p_social.open(id, 'SocTest A'), pA);
        await waitFor(B, () => document.querySelector('#rb-lobby').dataset.active === 'dm', null, 8000);
        await click(B, 'rb-dm-block');
        await waitFor(B, () => document.getElementById('rb-dm-block').textContent === 'UNBLOCK', null, 8000);
        await A.evaluate(id => window._rb2p_social.open(id, 'SocTest B'), pB);
        await waitFor(A, () => document.querySelector('#rb-lobby').dataset.active === 'dm', null, 8000);
        await waitFor(A, () => /can't message/.test(document.getElementById('rb-dm-state').textContent), null, 8000);
        const sentBlocked = await A.evaluate(() => window._rb2p_social.send('are you there?'));
        const stateA = await txt(A, 'rb-dm-state'), inputOff = await A.evaluate(() => document.getElementById('rb-dm-input').disabled);
        const chBlocked = await A.evaluate(r => window._rb2p_social.challenge(r), rowB);
        await click(B, 'rb-dm-block');
        await waitFor(B, () => document.getElementById('rb-dm-block').textContent === 'BLOCK', null, 8000);
        await A.evaluate(id => { window._rb2p_social.open(id, 'SocTest B'); }, pB);
        await sleep(1500);
        const sentAfter = await A.evaluate(() => window._rb2p_social.send('unblocked now'));
        const gotAfter = await waitFor(B, () => /unblocked now/.test(document.getElementById('rb-dm-log').textContent), null, 10000);
        check('T6 BLOCK: B blocks A — A sees "can\'t message", its message and challenge are refused; UNBLOCK — A\'s next message reaches B',
              sentBlocked === false && /can't message/.test(stateA) && inputOff && chBlocked === false && sentAfter === true && gotAfter,
              JSON.stringify({ sentBlocked, stateA, inputOff, chBlocked, sentAfter, gotAfter }));
    } finally {
        try { await browser.close(); } catch (e) {}
        if (pA && pB) {
            const tok = await owner(), [x, y] = [pA, pB].sort();
            for (const p of ['on/' + pA, 'on/' + pB, 'ch/' + pA, 'ch/' + pB, 'dm/t/' + x + '/' + y, 'dm/i/' + pA, 'dm/i/' + pB, 'dm/b/' + pA, 'dm/b/' + pB, 'rooms/' + CODE])
                await fetch(DB + p + '.json?access_token=' + encodeURIComponent(tok), { method: 'DELETE' }).catch(() => {});
        }
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
