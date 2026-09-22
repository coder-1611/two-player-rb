// e2e/v403-endings.js — why games ended early, fixed.
//
//   T1  the THIRD keep in one quarter spawns the drive FRESH (routes reset); the fourth is refused
//   T2  the FINAL banner appears the instant the horn decides the game (Q5, score not tied)
//   T3  the banner hides when the real final overlay shows, and at match start
//   T4  a pagehide writes hb vis:'X' with keepalive; the other phone reads "OPPONENT LEFT THE GAME"
//   T5  the engine ending natively past the horn is reported as the FINAL even with OT disarmed (shipped predicate)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V403 ENDINGS ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1: keep gate — third firing = fresh spawn, fourth = refusal ----
    const t1 = await off.page.evaluate(() => {
        window._rb2p_diagLog('T1-START');
        const calls = []; const real = window._rb2p_forceUserOffenseDrive;
        window._rb2p_forceUserOffenseDrive = function (y, fresh) { calls.push({ y, fresh }); return true; };
        window._rb2p_keepQ = null; window._rb2p_keepN = 0; window._rb2p_keepLoopDiagMs = 0;
        const q = Number(RB.engineState().engineQuarter) || 1;
        const r = [1, 2, 3, 4].map(() => window._rb2p_keepGate(q, -20, 1));
        window._rb2p_forceUserOffenseDrive = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T1-START'));
        window._rb2p_keepQ = null; window._rb2p_keepN = 0;
        return { r, calls, fresh: /QTR-KEEP #3 — .*fresh spawn at -20/.test(tail), refused4: /QTR-KEEP LOOP — keep #4/.test(tail) };
    });
    check('T1 keeps 1-2 pass, keep 3 spawns FRESH at the keep yard, keep 4 is refused',
          t1.r[0] === true && t1.r[1] === true && t1.r[2] === false && t1.r[3] === false && t1.calls.length === 1 && t1.calls[0].y === -20 && t1.calls[0].fresh === true && t1.fresh && t1.refused4, JSON.stringify(t1));

    // ---- T2: FINAL banner at the horn ----
    // on the waiting phone the quarter is governed by the wire (it follows the live opponent), so drive this on the offense phone
    const t2 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        const sQ = em.engineQuarter, sU = em.userScore, sO = em.opponentScore, sRep = window._rb2p_gameOverReported;
        window._rb2p_gameOverReported = false; window._rb2p_pastRegSeenMs = 0;
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        // the quarter governor treats a jump of more than one quarter as a glitch: walk the baseline up first
        const sStable = window._rb2p_lastStableQuarter, sWire = window._rb2p_wireQuarter;
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        em.engineQuarter = 5; em.setUserScore(31); em.setOpponentScore(20);
        await new Promise(r => setTimeout(r, 900));
        const qSeen = em.engineQuarter;
        const el = document.getElementById('rb-final-soon');
        const out = { shown: !!(el && el.style.display === 'block'), text: el ? el.textContent : null, qSeen };
        // restore before the real final detector fires
        window._rb2p_gameOverReported = true; em.engineQuarter = sQ; em.setUserScore(sU); em.setOpponentScore(sO);
        window._rb2p_lastStableQuarter = sStable; window._rb2p_wireQuarter = sWire;
        await new Promise(r => setTimeout(r, 400));
        window._rb2p_gameOverReported = sRep; window._rb2p_pastRegSeenMs = 0;
        return out;
    });
    check('T2 the FINAL banner shows within a second of Q5 with a decided score', t2.shown && /FINAL — 31 – 20/.test(String(t2.text)), JSON.stringify(t2));

    // ---- T3: the banner hides with the real final and at match start ----
    const t3 = await off.page.evaluate(() => {
        const el = document.getElementById('rb-final-soon');
        window._rb2p_hideFinalSoon();
        return { hidden: !!(el && el.style.display === 'none') };
    });
    const t3s = await def.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return { atFinal: /finalOverlay\.style\.display = 'block';\s*\n\s*try \{ if \(window\._rb2p_hideFinalSoon\) window\._rb2p_hideFinalSoon\(\); \}/.test(src),
                 atStart: /hideFinal\(\);\s*\n\s*try \{ if \(window\._rb2p_hideFinalSoon\) window\._rb2p_hideFinalSoon\(\); \}/.test(src) };
    });
    check('T3 the banner hides on demand, when the final overlay shows, and at match start', t3.hidden && t3s.atFinal && t3s.atStart, JSON.stringify({ t3, t3s }));

    // ---- T4: pagehide -> hb vis 'X' -> the other phone says LEFT ----
    const hbUrlReady = await off.page.evaluate(() => typeof window._rb2p_hbUrl === 'string' && window._rb2p_hbUrl.length > 10);
    // a page that really left stops heartbeating; the harness page stays open, so suspend its writer
    await off.page.evaluate(() => { window._rb2p_hbSuspend = true; window.dispatchEvent(new Event('pagehide')); });
    await sleep(1500);
    const hb = await TP.fbGet('rooms/' + g.code + '/hb/' + off.role);
    let left = false, status = '';
    for (let i = 0; i < 12 && !left; i++) { await sleep(1000); left = await def.page.evaluate(() => window._rb2p_oppLeft()); }
    status = await def.page.evaluate(() => { window._rb2p_refreshWaitStatus(); return document.getElementById('rb-wait-status').textContent; });
    check('T4 a pagehide writes hb vis:X (keepalive) and the other phone reads OPPONENT LEFT THE GAME',
          hbUrlReady && hb && hb.vis === 'X' && left && /OPPONENT LEFT THE GAME/.test(status), JSON.stringify({ hbUrlReady, hb, left, status }));
    // the leaving phone comes back: its next heartbeat must clear the state
    await off.page.evaluate(() => { window._rb2p_hbSuspend = false; window.dispatchEvent(new Event('pageshow')); });   // V405: a returning page heartbeats at once
    let back = false; const trace = [];
    for (let i = 0; i < 14 && !back; i++) {
        await sleep(1000);
        back = await def.page.evaluate(() => !window._rb2p_oppLeft());
        if (i % 3 === 2) trace.push({ i, hb: await TP.fbGet('rooms/' + g.code + '/hb/' + off.role), opp: await def.page.evaluate(() => window._rb2p_oppHb), inMatch: await off.page.evaluate(() => RB.isEngineInMatchRoom()), susp: await off.page.evaluate(() => window._rb2p_hbSuspend),
                                    cls: await off.page.evaluate(() => document.documentElement.classList.contains('rb-in-match')), room: await off.page.evaluate(() => sessionStorage.getItem('rb_room')), hbNow: await off.page.evaluate(() => window._rb2p_hbNow('trace')) });
    }
    check('T4b ...and the next heartbeat clears it', back, JSON.stringify(trace));

    // ---- T5: native end past the horn = FINAL (shipped predicate) ----
    const t5 = await def.page.evaluate(async () => {
        const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return /var pastHornV403 = gameOverLastQ >= 5 \|\| \(gameOverLastQ === 4 && gameOverLastClk === 0\);/.test(src) &&
               /gameOverWasInMatch && !nowInMatch && \(window\._rb2p_inOvertime \|\| pastHornV403\)/.test(src);
    });
    check('T5 the engine\'s native end past the horn reports the FINAL even with OT disarmed (shipped)', t5 === true, '');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
