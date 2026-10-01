// e2e/v428-ready.js — a READY starts ONE game, on the page that pressed it (UZGV, 2026-10-01: Shivom vs soham, a
// complete 30-0 game, vanished from the records: Shivom's phone reloaded 16s after the final, saw both seats still
// READY from the finished game, started a new game alone — and that start wiped the finished game's final, outcomes
// and audit marker; R-REOPEN in 31 archived rooms).
//
// A real game is played to the stats screen on both phones (the engine's own final path), then phone A reloads with
// its seat still READY on the server (its disconnect handler gone, as after a mid-game reconnect — the state UZGV's
// reload found).
//
//   E1  the reloaded phone is NOT put into a match: no new game, the finished game's outcomes (the team names the
//       records show) and its final are kept, it waits in the room lobby. (The lobby still drops the PARTNER's final
//       report as a leftover, V296 — nothing in the records reads it.)
//   E2  pressing READY there does not start a game alone while the partner still sits on its stats screen
//   E3  a rematch still starts: the partner goes back to the lobby, presses READY — both phones are in a match
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }
const inMatch = page => page.evaluate(() => document.documentElement.classList.contains('rb-in-match')).catch(() => null);
const finalShown = page => page.evaluate(() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display === 'block'); }).catch(() => false);
const lobbyRoom = page => page.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); }).catch(() => false);

(async () => {
    console.log('=== V428 READY ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a, code = g.code;
    await sleep(6000);
    // a drive end, so the room has outcomes (the team names the records show)
    const aWait = await A.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? B : A, def = off === A ? B : A;
    await D.forceDriveEnd(off.page, 'PUNT');
    await until(async () => ({ ok: (await def.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === false)) === true }), 25000, 500);
    await sleep(4000);
    // ---- the game ends: a decided horn on the phone with the ball, the engine's own final path ----
    const off2 = (await A.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true)) ? B : A;
    await off2.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        window._rb2p_gameOverReported = false; window._rb2p_inOvertime = false;
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        em.engineQuarter = 5; em.setUserScore(30); em.setOpponentScore(0);
        window._rb2p_pastRegSeenMs = Date.now() - 25000;
    });
    const ended = await until(async () => ({ ok: (await finalShown(A.page)) && (await finalShown(B.page)) }), 60000, 1000);
    const fin0 = await TP.fbGet('rooms/' + code + '/final'), out0 = await TP.fbGet('rooms/' + code + '/outcomes'), games0 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length;
    console.log('  the game ended: stats screen on both ' + (ended.ms !== null) + ', final ' + Object.keys(fin0 || {}).join('') + ', outcomes ' + Object.keys(out0 || {}).join('') + ', games ' + games0);
    if (ended.ms === null || !fin0 || !out0) { console.log('  FAIL  setup: the game never reached the stats screen on both phones'); fail++; await g.cleanup(); process.exit(1); }

    // ---- A reloads with its seat still READY on the server ----
    // the seat UZGV's reload found: still READY on the server, and no disconnect handler left to remove it
    await A.page.evaluate(async c => { const F = window._rb2p_FB, db = window._rb2p_db; await F.onDisconnect(F.ref(db, 'rooms/' + c + '/players/a')).cancel(); await F.set(F.ref(db, 'rooms/' + c + '/players/a/ready'), true); }, code);
    const seat0 = await TP.fbGet('rooms/' + code + '/players');
    await A.page.evaluate(() => location.reload()).catch(() => {});
    await sleep(25000);
    const fin1 = await TP.fbGet('rooms/' + code + '/final'), out1 = await TP.fbGet('rooms/' + code + '/outcomes'), games1 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length;
    const aIn1 = await inMatch(A.page), aLobby1 = await lobbyRoom(A.page);
    check('E1 a phone that reloads after the final is not put into a match: the finished game\'s final and outcomes stay, no new game, it waits in the room',
          aIn1 === false && aLobby1 === true && games1 === games0 && !!fin1 && !!out1,
          JSON.stringify({ seatsBefore: seat0, aIn1, aLobby1, games0, games1, final: Object.keys(fin1 || {}), outcomes: !!out1 }));

    // ---- E2: A presses READY while B still sits on its stats screen ----
    await A.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled) b.click(); });
    await sleep(10000);
    const aIn2 = await inMatch(A.page), games2 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length, fin2 = await TP.fbGet('rooms/' + code + '/final');
    check('E2 READY on the reloaded phone does not start a game alone while the partner is on its stats screen',
          aIn2 === false && games2 === games0 && !!fin2 && (await finalShown(B.page)),
          JSON.stringify({ aIn2, games2, final: Object.keys(fin2 || {}), players: await TP.fbGet('rooms/' + code + '/players') }));

    // ---- E3: B goes back to the lobby and presses READY — the rematch starts on both ----
    await B.page.evaluate(() => { try { sessionStorage.setItem('rb2p_skipResumeOnce', '1'); } catch (e) {} try { sessionStorage.removeItem('rb2p_matchLive'); } catch (e) {} location.reload(); }).catch(() => {});
    await sleep(18000);                                   // the old game's heartbeats go stale (else V266 resumes it)
    if (!(await lobbyRoom(B.page))) await TP.joinRoom('B', B.page, code);
    await B.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled && b.dataset.state !== 'ready') b.click(); });
    const both = await until(async () => ({ ok: (await inMatch(A.page)) === true && (await inMatch(B.page)) === true }), 60000, 1500);
    const games3 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length;
    check('E3 a rematch still starts: the partner back in the lobby presses READY and both phones are in a match',
          both.ms !== null && games3 === games0 + 1, JSON.stringify({ ms: both.ms, games3, players: await TP.fbGet('rooms/' + code + '/players') }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
