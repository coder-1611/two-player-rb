// e2e/v432-rematch-join.js — a phone that joins its partner's NEW game through the resume path plays that game, not
// the last one (OKYW, 2026-10-01 7:54 pm: "both parked" 11-12 s at the first hand-off of the rematch; the same in JCTW,
// YISX, FMBV, VAKL, YUHQ, OCCX, ISLU, DAZA, BXDZ, ZMCM, EQXQ, KHIX, SJTR — 17 rematch starts in 14 rooms since V421).
//
// What happened: game 1 ended at the stats screen on both phones (B's flow record: epoch H, final). Both went back to
// the lobby and pressed READY together. A started game 2; B's READY took the V266 guard ("the partner is mid-match":
// its heartbeat fresh, its final already removed by its own match start) and reloaded into a RESUME of A's game. The
// resume never runs the game note, so the tab restore gave B game 1's record — epoch H. A's first hand-off of game 2
// (epoch K0) was "moot" on B ("the law of this half owns the ball") and dropped: both parked until TURN-RESCUE guessed
// ~12 s later, at B's own 25 instead of the spot.
//
// The test plays game 1 through a real halftime (the drive that runs out Q2 — the halftime law gives both phones epoch
// H) to the stats screen, sends both phones back to the lobby with the stats screen's own button, starts game 2 on A,
// and lets B's READY go through the real guard → reload → resume. Then A's drive ends (a punt):
//   R1  (setup) B came into game 2 through the resume with game 1's record restored from its tab — OKYW's state
//   R2  B takes A's first hand-off: the punt applied on B (its own apply), not dropped as moot (V431: dropped, and B
//       got the ball 12-28 s later from TURN-RESCUE's guess at its own 25). The time to LIVE is printed, not judged:
//       under the gate's parallel load a normal punt takes 8-12 s (the 4 s pick-six hold, the kick).
//   R3  no rescuer guessed it (no TURN-RESCUE -> offense), and only one phone has the ball
//   R4  B's flow record on the server is no longer game 1's (not final, not epoch H) — the V432 reset said so in the
//       audit (guard flow-stale)
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const QB = require('./qb-bot');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 400); } return Object.assign(v || {}, { ms: null }); }
const inMatch = page => page.evaluate(() => { try { return document.documentElement.classList.contains('rb-in-match') && RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => null);
const finalShown = page => page.evaluate(() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display === 'block'); }).catch(() => false);
const lobbyRoom = page => page.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); }).catch(() => false);
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const diag = page => page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '');
const st = page => page.evaluate(() => { try { const s = RB.engineState(); return { q: Number(s.engineQuarter), y: Math.round(Number(s.engineYardLineSigned)), d: Number(s.engineDownNumber), tg: Math.round(Number(s.engineYardsToGo)), wait: window._rb2p_userIsWaitingForOpponent === true }; } catch (e) { return null; } }).catch(() => null);

// the drive that runs out the clock at the Q2 horn (as e2e/v430-expired.js X1): the halftime law takes both phones
// into Q3 with epoch H
async function playEndsAtHalf(page) {
    await page.evaluate(() => {
        const s = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test', 3000);
        window._rb2p_lastStableQuarter = 2; window._rb2p_wireQuarter = 2; s.engineQuarter = 2;
        s.engineMinutesLeft = 0; s.engineSecondsLeft = 1; s.engineTickAllowance = 0;
        s.setUserScore(7); s.setOpponentScore(3);
    });
    await sleep(4000);
    return page.evaluate(() => {
        const s = RB.engineState(); if (!s) return 'no state';
        if (Number(s.engineQuarter) !== 2) return 'quarter moved to ' + s.engineQuarter;
        s.engineMinutesLeft = 0; s.engineSecondsLeft = 0; s.engineTickAllowance = 0;
        s.enginePossessingTeamIdx = s.engineUserTeamIdx;
        s.engineDriveFsmStage = 2; s.enginePriorFsmStage = 4;
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        try { _1c1(s.rawEngineMatch, _Sc2); return true; } catch (e) { return String(e); }
    });
}

(async () => {
    console.log('=== V432 REMATCH JOIN ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a, code = g.code;
    await sleep(6000);
    // ---- game 1: through a real halftime (epoch H on both phones) ----
    const aWait = await waiting(A.page);
    const off = aWait ? B : A;
    const half = await playEndsAtHalf(off.page);
    // V432: the hand-off at the horn carries 0:01 again (the V430 revert), so the receiver has one down to play — it
    // plays it for real (a run, or a pass with no running back; e2e/qb-bot.js), then the half ends by the halftime law.
    // (On V431 the 0:00 hand-off took both phones straight to Q3.) Setup waits are generous: the gate runs 4 at a time.
    const rcv = off === A ? B : A;
    const down = await until(async () => { const a = await st(A.page), b = await st(B.page), r = await st(rcv.page); return { ok: !!(a && b && ((a.q === 3 && b.q === 3) || (r && r.q === 2 && r.wait === false))), a, b, r }; }, 30000);
    if (down.r && down.r.q === 2 && down.r.wait === false) {
        for (let i = 0; i < 4; i++) {
            let cal = null; try { cal = await QB.calibrate(rcv.page); } catch (e) {}
            try { await QB.clickButtons(rcv.page, cal, () => {}); } catch (e) {}
            let rr = null; try { rr = await QB.runOne(rcv.page, cal, {}); } catch (e) {}
            if (rr && rr.result === 'none') { try { await QB.playOne(rcv.page, cal, {}); } catch (e) {} }
            await sleep(4000);
            const s2 = await st(rcv.page); if (!s2 || s2.q !== 2 || s2.wait) break;
        }
    }
    const q3 = await until(async () => { const a = await st(A.page), b = await st(B.page); return { ok: a && b && a.q === 3 && b.q === 3, a, b }; }, 75000);
    const epB = await until(async () => { const f = await TP.fbGet('rooms/' + code + '/flow/b'); return { ok: !!(f && f.ep === 'H'), f }; }, 40000, 1000);
    console.log('  game 1: the Q2 drive ' + half + '; both in Q3 ' + (q3.ms !== null) + '; B\'s record epoch ' + (epB.f && epB.f.ep));
    await sleep(3000);
    // ---- game 1 ends: a decided horn on the phone with the ball, the engine's own final path ----
    const off2 = (await waiting(A.page)) ? B : A;
    await off2.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        window._rb2p_gameOverReported = false; window._rb2p_inOvertime = false;
        window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
        em.engineQuarter = 5; em.setUserScore(30); em.setOpponentScore(0);
        window._rb2p_pastRegSeenMs = Date.now() - 25000;
    });
    const ended = await until(async () => ({ ok: (await finalShown(A.page)) && (await finalShown(B.page)) }), 60000, 1000);
    await sleep(4000);                                    // the records publish the final
    const g1 = await TP.fbGet('rooms/' + code + '/flow/b');
    console.log('  game 1 ended: stats screen on both ' + (ended.ms !== null) + '; B\'s record ' + JSON.stringify(g1 && { gid: g1.gid, ep: g1.ep, final: g1.final }));
    if (ended.ms === null || !g1 || g1.ep !== 'H' || g1.final !== true) { console.log('  FAIL  setup: game 1 did not end with B\'s record in epoch H at the stats screen'); fail++; await g.cleanup(); process.exit(1); }
    const gid1 = g1.gid;

    // ---- both back to the lobby with the stats screen's own button ----
    for (const P of [B, A]) {
        await P.page.evaluate(() => { const b = document.getElementById('rb-final-leave'); if (b) b.click(); }).catch(() => {});
        await sleep(1000);
    }
    await sleep(12000);
    for (const [P, l] of [[A, 'A'], [B, 'B']]) if (!(await lobbyRoom(P.page))) await TP.joinRoom(l, P.page, code);
    await sleep(16000);                                   // the pages' "left" beacons go stale (else A's own READY takes the guard)
    // ---- the rematch: B's READY reaches the server first, A starts game 2 ----
    await TP.fbPut('rooms/' + code + '/players/b/ready', true);
    await A.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled && b.dataset.state !== 'ready') b.click(); });
    const aIn = await until(async () => ({ ok: (await inMatch(A.page)) === true }), 45000, 500);
    await sleep(7000);                                    // A's in-match heartbeat is on the server
    // ---- B presses READY: the V266 guard sees A mid-match and reloads B into a resume of A's game ----
    const tB = Date.now();
    await B.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled) b.click(); }).catch(() => {});
    const bIn = await until(async () => ({ ok: (await inMatch(B.page)) === true && (await waiting(B.page)) === true }), 60000, 500);
    await sleep(8000);                                    // B settles in A's game (and its record meets A's)
    const dB0 = await diag(B.page);
    const restored = (dB0.match(/FLOW restored from this tab (g\d+) ep (\w+)/) || []);
    const games = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {});
    console.log('  game 2: A in a match ' + (aIn.ms !== null) + '; B in it ' + (bIn.ms !== null ? Math.round((Date.now() - tB) / 1000) + ' s after its READY' : 'never') + '; games ' + games.length + '; B restored ' + (restored[1] || '-') + ' ep ' + (restored[2] || '-'));
    check('R1 (setup) B joined game 2 through the resume with game 1\'s record restored from its tab (OKYW\'s state)',
          aIn.ms !== null && bIn.ms !== null && restored[1] === gid1 && restored[2] === 'H' && !/GAME-START/.test(dB0),
          JSON.stringify({ aIn: aIn.ms, bIn: bIn.ms, restored: restored.slice(1), gid1 }));

    // ---- A's first drive ends: a punt ----
    const aSt0 = await st(A.page);
    if (aSt0 && aSt0.wait) console.log('  (A is not on offense: ' + JSON.stringify(aSt0) + ')');
    const tSend = Date.now();
    await D.forceDriveEnd(A.page, 'PUNT');
    const took = await until(async () => ({ ok: (await waiting(B.page)) === false }), 30000, 250);
    await sleep(2000);
    const dB = await diag(B.page), bSt = await st(B.page), aWait2 = await waiting(A.page);
    const tookS = took.ms !== null ? took.ms / 1000 : null;
    await sleep(2500);                                    // the audit streams upload every 1.5 s
    const auB = Object.values(await TP.fbGet('rooms/' + code + '/audit/b') || {});
    const sendA = Object.values(await TP.fbGet('rooms/' + code + '/audit/a') || {}).filter(e => e.k === 'send' && e.t >= tSend - 1000)[0];
    const applyB = sendA ? auB.find(e => e.k === 'apply' && String(e.ts) === String(sendA.ts)) : null, applied = !!applyB;
    const purged = auB.filter(e => e.k === 'purge' && e.t >= tSend - 1000).map(e => e.type + (e.epochMoot ? ' epochMoot' : '') + ' ' + (e.why || ''));
    const staleG = auB.filter(e => e.k === 'guard' && e.what === 'flow-stale');
    const moot = /OUTCOME moot/.test(dB) || purged.some(x => /epochMoot/.test(x)), rescue = /TURN-RESCUE -> offense/.test(dB);
    console.log('  A punted (' + (sendA ? sendA.type + ' ts ' + sendA.ts : 'no send seen') + '): B LIVE ' + tookS + ' s after the drive end at ' + JSON.stringify(bSt) + '; applied ' + applied + '; purged ' + JSON.stringify(purged) + '; A waiting ' + aWait2 + '; TURN-RESCUE ' + rescue + '; flow-stale ' + JSON.stringify(staleG.map(e => e.was + ' gap ' + Math.round(e.gap / 1000) + 's')));
    check('R2 B takes A\'s first hand-off of game 2: the punt applied by B itself, not dropped as moot',
          applied && !moot && tookS !== null, JSON.stringify({ applied, moot, purged, tookS, applyLagS: applyB && sendA ? (applyB.t - sendA.t) / 1000 : null }));
    check('R3 no rescuer guessed it (no TURN-RESCUE), and only B has the ball',
          !rescue && aWait2 === true && bSt && bSt.wait === false, JSON.stringify({ rescue, aWait2, bSt }));
    const fB = await TP.fbGet('rooms/' + code + '/flow/b');
    check('R4 B\'s flow record is no longer game 1\'s (not final, not epoch H), and the reset is in the audit (flow-stale)',
          !!fB && fB.final !== true && fB.ep !== 'H' && staleG.length >= 1, JSON.stringify({ rec: fB && { gid: fB.gid, ep: fB.ep, final: fB.final, trust: fB.trust }, staleGuards: staleG.length }));
    if (process.env.X_DEBUG) console.log(dB.split(',').slice(-60).join('\n'));
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
