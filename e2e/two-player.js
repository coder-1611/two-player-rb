// e2e/two-player.js — spin up TWO headless pages that join the SAME room over
// the REAL Firebase RTDB, ready up, and launch a live match — so genuinely
// cross-device behavior (the stuff the single-page harness can't reach) becomes
// testable headlessly. This drives the real lobby flow:
//
//   page A: type code → JOIN  (claims slot 'a')
//   page B: type code → JOIN  (claims slot 'b')
//   both:   READY → the players subscription sees a.ready && b.ready → startMatch
//
// Both pages talk to https://realretrobowl2p-default-rtdb.firebaseio.com (open
// rules), exactly like two real phones. Test rooms use a 'Z'-prefixed random
// code and are deleted on cleanup so the shared DB stays tidy.

const H = require('./harness');

const FB_DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const FB_API_KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0';

// V298: the RTDB rules now require auth (auth != null), so the bare REST calls
// these tests used all started returning "Permission denied" — which surfaced as
// bogus test FAILURES rather than an obvious infrastructure error. Sign in
// anonymously once (same thing the page does) and hang ?auth=<idToken> on every
// REST call. Cached for the process lifetime.
// V366: ONE identity for every run on this Mac, refreshed, not re-minted.
// A fresh anonymous sign-up per suite (x40 suites per gate, plus the audit
// watcher) tripped Firebase's per-IP limit — TOO_MANY_ATTEMPTS_TRY_LATER — and
// the last four two-player suites of a gate "crashed" at host time. See
// tools/fb-auth.js (cache in ~/rb2p/.fbtok.json).
let _fbToken = null;
async function fbToken() {
    if (_fbToken) return _fbToken;
    _fbToken = await require('../tools/fb-auth.js').token();
    return _fbToken;
}
// Authenticated REST helpers — use these instead of raw fetch on the DB.
async function fbUrl(path) { return FB_DB + '/' + path + '.json?auth=' + (await fbToken()); }
async function fbGet(path) { const r = await fetch(await fbUrl(path)); return r.json(); }
async function fbPut(path, val) {
    return fetch(await fbUrl(path), { method: 'PUT', body: JSON.stringify(val) });
}
async function fbDelete(path) { return fetch(await fbUrl(path), { method: 'DELETE' }); }

function randomCode() {
    // 4 chars; 'Z' prefix marks it a test room and avoids colliding with the
    // short codes humans actually type.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = 'Z';
    for (let i = 0; i < 3; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

async function deleteRoom(code) {
    try { await fbDelete('rooms/' + code); }
    catch (e) { /* best-effort cleanup */ }
}

// Poll a page-side predicate until it returns truthy or the timeout elapses.
async function waitFor(page, pageFn, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        let v = false;
        try { v = await page.evaluate(pageFn); } catch (e) {}
        if (v) return true;
        await H.sleep(300);
    }
    return false;
}

// Boot a page to the lobby: engine up + the 2P launcher present. (Does NOT enter
// the single-player vs-KC match — that's what the normal harness does.)
async function openLobbyPage(browser, label, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 560 });
    // CRITICAL for two tabs in one browser: the GameMaker engine advances on
    // requestAnimationFrame, which Chrome PAUSES for any hidden/backgrounded
    // tab — and only one tab can be foreground at a time. Focus emulation makes
    // this page always report focused+visible so its rAF loop keeps running even
    // while the other page is in front (otherwise the first-opened page freezes
    // mid-launch at room 2 and never reaches the match).
    try {
        const client = await page.target().createCDPSession();
        await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    } catch (e) { /* fall back to whatever foregrounding the caller does */ }
    const errors = [];
    const logs = [];
    page.on('pageerror', e => { if (!H.KNOWN_BENIGN_ERR.test(e.message)) errors.push(e.message); });
    page.on('console', m => {
        const t = m.text();
        logs.push(t);
        if (opts.logBridge && /\[2P/.test(t)) console.log('    [' + label + '] ' + t);
    });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await H.sleep(Number(process.env.RB_E2E_BOOT_MS || 9000));
    const ready = await waitFor(page,
        () => typeof window.s_play_two_player_match === 'function', 20000);
    if (!ready) throw new Error('[' + label + '] engine 2P launcher never appeared');
    return { page, label, errors, logs };
}

// Type the code and click JOIN, retrying until the room view appears (Firebase
// may still be importing on the first click). Returns the claimed role ('a'/'b').
async function joinRoom(label, page, code) {
    for (let attempt = 0; attempt < 10; attempt++) {
        await page.evaluate(c => {
            const i = document.getElementById('rb-room-input');
            if (i) { i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); }
        }, code);
        await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
        const inRoom = await waitFor(page,
            () => { const l = document.getElementById('rb-lobby');
                    return !!(l && l.getAttribute('data-active') === 'room'); }, 6000);
        if (inRoom) {
            const role = await page.evaluate(
                () => ((document.getElementById('rb-you-role') || {}).textContent || '').trim().toLowerCase());
            return role;
        }
        await H.sleep(1000);   // FB not ready yet (or room full mid-retry) — try again
    }
    throw new Error('[' + label + '] join failed for room ' + code);
}

// HOST a room via the PLAY 2P button (the real host flow — it creates the room
// so a joiner's typed code has something to reference). Pins the code via the
// generateRoomCode test seam. Returns the claimed role ('a').
async function hostRoom(label, page, code) {
    await page.evaluate(c => { window._rb2p_forceRoomCode = c; }, code);
    for (let attempt = 0; attempt < 10; attempt++) {
        await page.evaluate(() => { const p = document.getElementById('rb-play2p'); if (p) p.click(); });
        const inRoom = await waitFor(page,
            () => { const l = document.getElementById('rb-lobby');
                    return !!(l && l.getAttribute('data-active') === 'room'); }, 8000);
        if (inRoom) {
            return page.evaluate(
                () => ((document.getElementById('rb-you-role') || {}).textContent || '').trim().toLowerCase());
        }
        await H.sleep(1000);   // FB not ready yet — try again
    }
    throw new Error('[' + label + '] host (PLAY 2P) failed for room ' + code);
}

// Click READY once it's enabled (it enables only when both slots are filled).
async function readyUp(label, page) {
    const enabled = await waitFor(page,
        () => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); }, 20000);
    if (!enabled) throw new Error('[' + label + '] READY never enabled');
    await page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b) b.click(); });
}

async function waitForMatch(label, page) {
    const ok = await waitFor(page,
        () => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }, 45000);
    if (!ok) throw new Error('[' + label + '] match never started');
}

// Read a compact cross-device snapshot from one page.
async function snapshot(page) {
    return page.evaluate(() => {
        let s = {};
        try { s = RB.engineState() || {}; } catch (e) {}
        return {
            inMatch: (function () { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } })(),
            role: ((document.getElementById('rb-you-role') || {}).textContent || '').trim().toLowerCase(),
            waiting: window._rb2p_userIsWaitingForOpponent === true,
            myUid: Number(window._rb2p_myTeamUid),
            oppUid: Number(window._rb2p_oppTeamUid),
            quarter: s.engineQuarter,
            userTeamIdx: s.engineUserTeamIdx
        };
    });
}

// The whole flow. Returns { browser, code, a, b, snapshot, waitFor, cleanup }.
// Pass { browser } to reuse one; otherwise a dedicated browser is launched and
// closed by cleanup(). Pass { logBridge:true } to echo each page's [2P …] logs.
async function startTwoPlayerGame(opts) {
    opts = opts || {};
    await H.ensureServer();
    const browser = opts.browser || await H.launchBrowser();
    const ownBrowser = !opts.browser;
    const code = opts.code || randomCode();
    await deleteRoom(code);   // start from a clean room

    const a = await openLobbyPage(browser, 'A', opts);
    const b = await openLobbyPage(browser, 'B', opts);
    // A HOSTS (PLAY 2P creates the room), then B JOINS the now-existing code.
    // A typed code must reference a real room, so the host must go first.
    a.role = await hostRoom('A', a.page, code);
    b.role = await joinRoom('B', b.page, code);
    await readyUp('A', a.page);
    await readyUp('B', b.page);
    await waitForMatch('A', a.page);
    await waitForMatch('B', b.page);

    async function cleanup() {
        try { await a.page.close(); } catch (e) {}
        try { await b.page.close(); } catch (e) {}
        await deleteRoom(code);
        if (ownBrowser) { try { await browser.close(); } catch (e) {} }
    }

    return {
        browser, code, a, b, ownBrowser,
        snapshot, deleteRoom, cleanup,
        waitFor: (page, fn, ms) => waitFor(page, fn, ms || 15000)
    };
}

module.exports = {
    FB_DB, FB_API_KEY, fbToken, fbGet, fbPut, fbDelete,
    randomCode, deleteRoom, waitFor, openLobbyPage,
    joinRoom, hostRoom, readyUp, waitForMatch, snapshot, startTwoPlayerGame
};
