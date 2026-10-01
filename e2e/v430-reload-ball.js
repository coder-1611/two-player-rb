// e2e/v430-reload-ball.js — a phone that reloads seconds after it TOOK the ball comes back with the ball
// (VWWK, BXDZ, NICE, AOGO — 2026-10-01, V427: 4 of the day's 11 "both parked" stalls).
//
// What happened in each: phone A applied the partner's hand-off and went LIVE; 2-10 s later its tab reloaded (no
// reason in its log — the player); the resume read A's own `live` record, which still said "no ball" (the tab had
// been throttled — `rAF silent — fallback driving frames` — and the 500 ms push had not caught the hand-off); A came
// back parked in WAIT, the partner was parked too ("both parked"), and only TURN-RESCUE's guess ~9 s later gave A a
// drive. The facts that A had the ball were on the server all along: the partner's hand-off, ACKed by A, newer than
// A's live record, and nothing sent by A since.
//
//   B1  the reloaded phone is LIVE again within 6 s of being back in the match (before TURN-RESCUE's ~9 s guess), the
//       partner stays waiting (never both with the ball)
//   B2  at the same spot: the punt's yard line, 1st & 10 — the restore rule (where the possession stood when the game
//       was last not frozen). V429 came back through TURN-RESCUE's guess at its OWN 25: 39 yards lost after a punt
//   B3  no rescuer was needed: no TURN-RESCUE in the reloaded phone's log
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 250); } return Object.assign(v || {}, { ms: null }); }
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const spot = page => page.evaluate(() => { try { const s = RB.engineState(); return { y: Math.round(Number(s.engineYardLineSigned)), d: Number(s.engineDownNumber), tg: Math.round(Number(s.engineYardsToGo)) }; } catch (e) { return null; } }).catch(() => null);

(async () => {
    console.log('=== V430 RELOAD WITH THE BALL ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = off === g.a ? g.b : g.a;
    // the receiver's tab stops refreshing its live record (as a throttled tab's did): it still says "no ball"
    await def.page.evaluate(() => {
        const F = window._rb2p_FB, orig = F.set;
        window.__liveHeld = true;
        F.set = function (ref) { if (window.__liveHeld && /\/live\/[ab]$/.test(String(ref))) return Promise.resolve(); return orig.apply(this, arguments); };
    });
    await sleep(1500);
    await D.forceDriveEnd(off.page, 'PUNT');
    const took = await until(async () => ({ ok: (await waiting(def.page)) === false }), 20000);
    await sleep(2500);                                   // settled in its new possession (the drive staged)
    const before = await spot(def.page);
    console.log('  the receiver took the punt in ' + took.ms + ' ms at ' + JSON.stringify(before) + '; reloading it now');
    await def.page.evaluate(() => location.reload()).catch(() => {});
    const tBoot = Date.now();
    // the page needs ~9 s to boot the engine (RB_E2E_BOOT_MS); time from its reload
    let inMatchMs = null;
    const back = await until(async () => {
        const w = await waiting(def.page), inM = await def.page.evaluate(() => document.documentElement.classList.contains('rb-in-match')).catch(() => false);
        if (inM && inMatchMs === null) inMatchMs = Date.now() - tBoot;
        return { ok: inM && w === false, w, inM };
    }, 45000, 250);
    await sleep(1500);
    const after = await spot(def.page), offWait = await waiting(off.page);
    const diag = await def.page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '');
    const liveS = back.ms !== null && inMatchMs !== null ? (back.ms - inMatchMs) / 1000 : null;
    console.log('  back in the match ' + (inMatchMs / 1000) + ' s after the reload, LIVE ' + liveS + ' s later; spot ' + JSON.stringify(after) + '; partner waiting ' + offWait);
    check('B1 the reloaded phone has the ball again within 6 s of being back in the match (before any rescuer\'s ~9 s guess), the partner waits',
          liveS !== null && liveS <= 6 && offWait === true, JSON.stringify({ liveS, offWait }));
    check('B2 at the same spot: the punt\'s yard line, 1st & 10', before && after && Math.abs(after.y - before.y) <= 1 && after.d === 1 && after.tg === 10, JSON.stringify({ before, after }));
    check('B3 no rescuer was needed (no TURN-RESCUE guess)', !/TURN-RESCUE -> offense/.test(diag), (diag.match(/[^,]*TURN-RESCUE[^,]*/g) || []).slice(0, 3).join(' | '));
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
