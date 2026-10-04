// e2e/v449-ready-left.js — a rematch READY is not "the partner is mid-match" just because the partner's last page said
// it LEFT (OPEN.md #3; QFJK 2 Oct 2:35 pm, VZLC 2 Oct 8:17 pm, OKYW; 22 rematch joins in the archive).
//
// What happened (VZLC, V435): game 1 ended at the stats screen. A went back to the lobby first (14:01.8); B stayed on
// the stats screen and went back 25 s later (14:26.4) — its BACK TO LOBBY reload wrote the V403 "left" beacon,
// hb/b = {vis:'X', ts: now}. Both pressed READY 12 s later. B's guard read A's 37 s-old beacon and started game 2. A's
// guard read B's beacon as "the partner's heartbeat is fresh", then read final/b — already removed by B's start (or
// older than 60 s) — and RELOADED into a resume of the game its own READY had just started. The resume took game 1's
// last touchdown again ("RESUME the TD I took before the reload is newer than my live record — taking it again"),
// harmless there only because A was game 2's opening receiver anyway; OKYW's join dropped the first hand-off as moot.
//
// The guard's "a fresh final means a rematch" exemption cannot help the phone that left first: its lobby page removes
// the partner's final as a leftover (index.html ~17835, V296/V422 F27 — a page that started no match takes any partner
// final as stale). So the live build reloads that phone EVERY time the partner's beacon is under 15 s old.
// The test plays the real flow: game 1 ends through the engine's own final path, A leaves the stats screen first, B
// lingers 65 s (past the guard's 60 s too), then leaves; both press READY within seconds of B's beacon.
//   L1  both phones run game 2's start themselves (a `game` audit entry on each, after the READY)
//   L2  A's page did not reload (a marker set on the page before READY survives)
//   L3  A's guard said why it started: `guard ready-left` with the beacon's age
//   L4  game 2 runs: one phone has the ball, the other waits for it, no "taking it again"
// The guard's real job is unchanged — a partner mid-match (heartbeat V/H) still sends a READY into the resume; that is
// e2e/v432-rematch-join.js R1 (A in game 2 for 7 s, B's READY reloads into it). X counts only when the tab's own flow
// record says its last game here is over; V450_CONTROL=1 removes A's tab record before READY (a fresh tab's view) and
// checks the other side: the guard still reloads A, and the resumed page audits the read (guard ready-reload, X,
// tabFinal false). The control is a manual check, not part of the suite run.
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 400); } return Object.assign(v || {}, { ms: null }); }
const inMatch = page => page.evaluate(() => { try { return document.documentElement.classList.contains('rb-in-match') && RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => null);
const finalShown = page => page.evaluate(() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display === 'block'); }).catch(() => false);
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const diag = page => page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '');
// BACK TO LOBBY reloads the page; the lobby's data-active is still 'room' from before the match until it does, so wait
// for the NEW page (a marker on the old one is gone) in the room with its READY enabled
async function leaveToLobby(P, label, code) {
    await P.page.evaluate(() => { window.__v449old = 1; const b = document.getElementById('rb-final-leave'); if (b) b.click(); }).catch(() => {});
    const t = Date.now();
    const back = await until(async () => {
        const r = await P.page.evaluate(() => { const l = document.getElementById('rb-lobby'), b = document.getElementById('rb-ready');
            return { old: window.__v449old === 1, room: !!(l && l.getAttribute('data-active') === 'room'), ready: !!(b && !b.disabled) }; }).catch(() => null);
        return { ok: !!(r && !r.old && r.room && r.ready), r };
    }, 30000, 300);
    if (back.ms === null) { console.log('  (' + label + ' not back in the room after its BACK TO LOBBY: ' + JSON.stringify(back.r) + ' — joining)'); await TP.joinRoom(label, P.page, code); }
    return t;
}

(async () => {
    console.log('=== V452 READY AFTER THE PARTNER LEFT ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a, code = g.code;
    await sleep(8000);
    // ---- game 1 ends: a decided game past the horn on the phone with the ball, the engine's own final path ----
    const off = (await waiting(A.page)) ? B : A;
    await off.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        window._rb2p_gameOverReported = false; window._rb2p_inOvertime = false;
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        em.engineQuarter = 5; em.setUserScore(21); em.setOpponentScore(14);
        window._rb2p_pastRegSeenMs = Date.now() - 25000;
    });
    const ended = await until(async () => ({ ok: (await finalShown(A.page)) && (await finalShown(B.page)) }), 60000, 1000);
    const tFinal = Date.now();
    console.log('  game 1 ended: the stats screen on both ' + (ended.ms !== null));
    if (ended.ms === null) { console.log('  FAIL  setup: game 1 never reached the stats screen on both phones'); fail++; await g.cleanup(); process.exit(1); }

    // ---- A goes back to the lobby first; B stays on the stats screen past the guard's 60 s final window ----
    await sleep(3000);
    await leaveToLobby(A, 'A', code);
    { const left = 66000 - (Date.now() - tFinal); if (left > 0) await sleep(left); }
    const finB = await TP.fbGet('rooms/' + code + '/final/b');
    const tBLeft = await leaveToLobby(B, 'B', code);
    const hbB = await TP.fbGet('rooms/' + code + '/hb/b');
    console.log('  B left the stats screen ' + Math.round((tBLeft - tFinal) / 1000) + ' s after the final (final/b ' + (finB && finB.ts ? Math.round((Date.now() - finB.ts) / 1000) + ' s old' : 'absent') + '); hb/b now ' + JSON.stringify(hbB));

    // ---- the rematch: both press READY within seconds of B's beacon ----
    // The harness reloads a page in 10-14 s under the gate's load (a phone: a few seconds — VZLC B went from BACK TO
    // LOBBY to its game 2 start in 12 s, both READY presses included), which can age B's beacon past the guard's 15 s
    // before anyone can press READY. B's own beacon is re-stamped now — the same record its page wrote, at the time a
    // phone's reload would have reached the lobby.
    const hbB2 = await TP.fbGet('rooms/' + code + '/hb/b');
    if (hbB2 && hbB2.vis === 'X') { console.log('  B\'s beacon is ' + ((Date.now() - hbB2.ts) / 1000).toFixed(1) + ' s old after the harness reload — re-stamped'); await TP.fbPut('rooms/' + code + '/hb/b', Object.assign({}, hbB2, { ts: Date.now() })); }
    else console.log('  SETUP: no "left" beacon from B on the server: ' + JSON.stringify(hbB2));
    const CONTROL = process.env.V450_CONTROL === '1';
    if (CONTROL) console.log('  CONTROL: A\'s tab flow record removed before READY: ' + await A.page.evaluate(c => { const k = 'rb2p_flow_' + c + '_a', had = !!sessionStorage.getItem(k); sessionStorage.removeItem(k); return had; }, code));
    else console.log('  A\'s tab flow record says final: ' + await A.page.evaluate(c => { try { return JSON.parse(sessionStorage.getItem('rb2p_flow_' + c + '_a') || 'null').final; } catch (e) { return null; } }, code));
    await A.page.evaluate(() => { window.__v449mark = 1; });
    await sleep(300);
    const tReady = Date.now();
    await B.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled && b.dataset.state !== 'ready') b.click(); }).catch(() => {});
    await sleep(700);
    await A.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled && b.dataset.state !== 'ready') b.click(); }).catch(() => {});
    console.log('  READY on both ' + ((tReady - tBLeft) / 1000).toFixed(1) + ' s after B pressed BACK TO LOBBY');
    const both = await until(async () => ({ ok: (await inMatch(A.page)) === true && (await inMatch(B.page)) === true }), 60000, 500);
    await sleep(9000);                                    // game 2 settles; the audit streams upload every 1.5 s
    const mark = await A.page.evaluate(() => window.__v449mark === 1).catch(() => null);
    const auA = Object.values(await TP.fbGet('rooms/' + code + '/audit/a') || {});
    const auB = Object.values(await TP.fbGet('rooms/' + code + '/audit/b') || {});
    const gA = auA.filter(e => e.k === 'game' && e.t >= tReady - 2000), gB = auB.filter(e => e.k === 'game' && e.t >= tReady - 2000);
    const gl = auA.filter(e => e.k === 'guard' && (e.what === 'ready-left' || e.what === 'ready-reload') && e.t >= tReady - 2000);
    const dA = await diag(A.page), dB = await diag(B.page);
    console.log('  game 2: both in a match ' + (both.ms !== null) + '; game entries a ' + gA.length + ' b ' + gB.length + '; A\'s page kept its marker ' + mark + '; A\'s guard entries ' + JSON.stringify(gl.map(e => ({ what: e.what, age: e.age, vis: e.vis, fin: e.fin, tabFinal: e.tabFinal }))));
    if (CONTROL) {
        check('C1 (control, a tab that does not know its last game ended) the guard still reloads A into the resume',
              mark !== true && gA.length === 0 && gB.length >= 1, JSON.stringify({ mark, a: gA.length, b: gB.length }));
        check('C2 (control) the resumed page audits the guard\'s read: ready-reload, the X beacon, tabFinal false',
              gl.some(e => e.what === 'ready-reload' && e.vis === 'X' && e.tabFinal === false && e.age < 15000), JSON.stringify(gl));
        await g.cleanup();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
    check('L1 both phones started game 2 themselves (a game entry on each after the READY)',
          gA.length >= 1 && gB.length >= 1, JSON.stringify({ a: gA.length, b: gB.length, both: both.ms }));
    check('L2 A\'s page did not reload into a resume',
          mark === true && !/READY blocked/.test(dA), JSON.stringify({ mark, blocked: /READY blocked/.test(dA) }));
    check('L3 A\'s guard logged why it started (guard ready-left, the beacon\'s age)',
          gl.some(e => e.what === 'ready-left' && e.age >= 0 && e.age < 15000), JSON.stringify(gl));
    const wA = await waiting(A.page), wB = await waiting(B.page);
    const again = /taking it again/.test(dA) || /taking it again/.test(dB);
    check('L4 game 2 runs: exactly one phone has the ball, no hand-off taken again',
          both.ms !== null && wA !== null && wB !== null && wA !== wB && !again, JSON.stringify({ wA, wB, again }));
    if (process.env.X_DEBUG) console.log(dA.split(',').slice(-40).join('\n'));
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
