// e2e/v425-rematch.js — a rematch in the same room and the same tabs (NPJD, ZJCF, NGKD, WNPB, JKYT, FGXJ — 6 of the
// 7 games that froze on 2026-09-30).
//
// Game 1: A punts to B (B stages A's hand-off), then A ends another drive and — inside its 4s hold — both players go
// BACK TO LOBBY (the final screen's button: skip the resume, reload the tab), rejoin the code and READY again: game 2.
//
//   R1  no phantom hand-off: V424 copied the partner's PREVIOUS-game record into the new game ("FLOW healed my last
//       send"), the chain gave the ball to B, the recovery authority parked A — which was playing the opening drive —
//       and B could not apply a hand-off that never existed: both parked until the players left. Now: no heal, A plays
//       its opening drive, B waits, both chains name A.
//   R2  the drive end A was holding in game 1 is not shipped into game 2 (FGXJ: a punt held after the overtime final
//       reached the rematch and gave B the opening ball too — both had it)
//   R3  after the final nothing is handed off (FGXJ's punt came 3s after the final, the engine playing on)
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const verdict = page => page.evaluate(() => { try { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why, fresh: v.fresh }; } catch (e) { return null; } }).catch(() => null);
const backToLobby = page => page.evaluate(() => {   // exactly what the final screen's BACK TO LOBBY does
    try { sessionStorage.setItem('rb2p_skipResumeOnce', '1'); } catch (e) {}
    try { sessionStorage.removeItem('rb2p_matchLive'); } catch (e) {}
    location.reload();
}).catch(() => {});

(async () => {
    console.log('=== V425 REMATCH ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
    const logs = { a: [], b: [] };
    for (const s of [A, B]) s.page.on('console', m => { const t = m.text(); if (/FLOW|RECOVER|lost|SEND|POSS ->|GAME-START|held|RESUME|resum|enterRoom|install|TRY-RESTORE|restore/i.test(t)) logs[s.role].push(t.slice(0, 160)); });
    await until(async () => { const v = await verdict(A.page); return { ok: v && v.fresh && v.who === 'a', v }; }, 40000, 1000);

    // ---- game 1: A punts, B stages it ----
    await D.forceDriveEnd(A.page, 'PUNT');
    await until(async () => ({ ok: (await waiting(B.page)) === false }), 20000, 500);
    await sleep(6000);                                             // both records published (B's staged = A's punt)
    // B punts back; A ends ANOTHER drive and both leave inside its 4s hold
    await D.forceDriveEnd(B.page, 'PUNT');
    await until(async () => ({ ok: (await waiting(A.page)) === false }), 20000, 500);
    await sleep(4000);
    const sentN0 = logs.a.filter(t => /SEND PUNT/.test(t)).length;
    await D.forceDriveEnd(A.page, 'PUNT');
    await sleep(1200);
    const held = await A.page.evaluate(() => Object.keys(sessionStorage).filter(k => /^rb2p_flowHeld_/.test(k)).length);
    const mark = logs.a.length, markB = logs.b.length;
    await Promise.all([backToLobby(A.page), backToLobby(B.page)]);
    // engine boot, and both in-match heartbeats go stale (15s): READY then starts a NEW game — with a fresh
    // heartbeat it resumes game 1 instead (V266), which is the held punt's legitimate home
    await sleep(18000);

    // ---- game 2: rejoin the code, READY ----
    for (const [s, label] of [[A, 'A'], [B, 'B']]) {
        await s.page.evaluate(() => { try { localStorage.setItem('rb2p_name', localStorage.getItem('rb2p_name') || 'Harness'); } catch (e) {} });
        await TP.joinRoom(label, s.page, g.code);
    }
    for (const s of [A, B]) await s.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled) b.click(); });
    const started = await until(async () => {
        const ia = await A.page.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => false);
        const ib = await B.page.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => false);
        if (!(ia && ib)) for (const s of [A, B]) await s.page.evaluate(() => { const b = document.getElementById('rb-ready'); if (b && !b.disabled) b.click(); }).catch(() => {});
        return { ok: ia && ib };
    }, 60000, 1500);
    if (started.ms === null) { console.log('  FAIL  game 2 never started'); fail++; await g.cleanup(); process.exit(1); }
    const g2a = logs.a.slice(mark), g2b = logs.b.slice(markB); console.log('--- A after the lobby ---\n' + g2a.slice(0, 25).join('\n'));
    console.log('  game 2 started (' + started.ms + 'ms); A held a punt at the lobby: ' + held);
    await sleep(20000);                                              // the phantom's window: heal, park (2s), 3 looks (~10s)
    const all2a = logs.a.slice(mark), all2b = logs.b.slice(markB);
    const vA = await verdict(A.page), vB = await verdict(B.page);
    const wA = await waiting(A.page), wB = await waiting(B.page);
    const healed = all2a.concat(all2b).filter(t => /FLOW healed/.test(t));
    const parked = all2a.filter(t => /RECOVER park/.test(t));
    const lost = all2b.filter(t => /never reached the server/.test(t));
    check('R1 game 2 has no phantom hand-off: no heal from game 1, A is not parked, B loses nothing; A has the opening ball and both chains name A',
          healed.length === 0 && parked.length === 0 && lost.length === 0 && wA === false && wB === true && vA && vA.who === 'a' && vB && vB.who === 'a',
          JSON.stringify({ healed, parked, lost, wA, wB, vA, vB }));
    const shipped = all2a.filter(t => /FLOW shipped the/.test(t)), dropped = all2a.filter(t => /FLOW dropped the/.test(t));
    check('R2 the punt A was holding when it left game 1 is not shipped into game 2' + (held ? '' : ' (nothing was held — V425 refuses or the hold shipped before the reload)'),
          shipped.length === 0 && wB === true, JSON.stringify({ held, shipped, dropped, g2a: g2a.slice(0, 6) }));

    // ---- R3: after the final nothing is handed off ----
    const r3 = await A.page.evaluate(async () => {
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o && o.type); return real.call(window._twoPlayer, o); };
        window._rb2p_gameOverReported = true;
        const lines = []; const realDL = window._rb2p_diagLog; window._rb2p_diagLog = function (m) { lines.push(String(m)); return realDL.apply(this, arguments); };
        const s = RB.engineState();
        s.enginePossessingTeamIdx = s.engineUserTeamIdx; s.engineDriveFsmStage = 2; s.enginePriorFsmStage = 12;
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false; window._rb2p_lastOpponentOutcomeApplyMs = 0;
        try { _1c1(s.rawEngineMatch, _Sc2); } catch (e) {}
        await new Promise(r => setTimeout(r, 6000));
        window._twoPlayer.send = real; window._rb2p_diagLog = realDL;
        return { sent, refused: lines.some(l => /SEND refused — the game is over/.test(l)), held: Object.keys(sessionStorage).filter(k => /^rb2p_flowHeld_/.test(k)).length };
    });
    check('R3 a drive end after the final is not handed off (nothing sent, nothing held)', r3.sent.length === 0 && r3.refused === true && r3.held === 0, JSON.stringify(r3));

    if (fail) { console.log('\n--- A ---\n' + logs.a.slice(-40).join('\n')); console.log('\n--- B ---\n' + logs.b.slice(-30).join('\n')); }
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
