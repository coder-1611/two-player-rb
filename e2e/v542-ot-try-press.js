// e2e/v542-ot-try-press.js — V542 (CFCX, Romans 6:23 vs ssiphone): in overtime, a press on the QB let go without
// a snap gave the ball away 2.5 s later ("OT-TD drive over (the try is over)") — the conversion was never played.
// Two real pages, the engine's own overtime touchdown, the bridge's 1 PT / 2 PT offer, 2 PT, then real mouse input:
//   T1  a press on the QB held 1.45 s and let go with no pull (CFCX's diag: "CONV try started (bkp 1)", "hold 1454ms",
//       the hand-off 2.69 s after the press) does not end the try: 6 s later the ball is still this team's, down 6,
//       the try on the field, nothing handed over
//   T2  the try is still played afterwards — a real snap and throw — and the ball goes over only once it is played
//   RB_E2E_PORT=8806 node e2e/v542-ot-try-press.js
const H = require('./harness');
const TP = require('./two-player');
const QB = require('./qb-bot');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '\n        ' + detail)); };

(async () => {
    console.log('=== V542: an overtime try is over only once it has been PLAYED ===');
    const g = await TP.startTwoPlayerGame({});
    try {
        let off = null;
        for (let i = 0; i < 60 && !off; i++) {
            await sleep(500);
            const ra = await g.a.page.evaluate(() => !!(window._rb2p_realDriveRunning && window._rb2p_realDriveRunning()) && window._rb2p_userIsWaitingForOpponent !== true);
            const rb = await g.b.page.evaluate(() => !!(window._rb2p_realDriveRunning && window._rb2p_realDriveRunning()) && window._rb2p_userIsWaitingForOpponent !== true);
            if (ra !== rb) off = ra ? g.a : g.b;
        }
        if (!off) throw new Error('no drive running on either page');
        await sleep(1500);
        const lines = [];
        off.page.on('console', m => { const t = m.text(); if (/OT-TD|CONV try|SEND |UNWEDGE/.test(t)) lines.push(t.slice(0, 160)); });
        await off.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_clockLicence && window._rb2p_clockLicence('test');
            em.setUserScore(8); em.setOpponentScore(16);   // never tied at the touchdown: a tie in Q5 re-runs the OT coin flip
            window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
            window._rb2p_inOvertime = true; window._rb2p_gameOverReported = false;
            em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 1; em.engineYardLineSigned = 45;
        });
        await sleep(800);
        await off.page.evaluate(() => { const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1); });   // the engine's own touchdown
        let fired = false;
        for (let i = 0; i < 80 && !fired; i++) {
            await sleep(250);
            fired = await off.page.evaluate(() => { const pl = window._rb2p_enumeratePopupInstances() || []; for (const p of pl) if (p && !p._HL2 && p._0G === 100369) { _li(p, p, p._0G); return true; } return false; });
        }
        if (!fired) throw new Error('the 1 PT / 2 PT choice never came up: ' + lines.join(' | '));
        const state = () => off.page.evaluate(() => {
            const em = RB.engineState(), all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let ball = null, of = 0, qb = null;
            for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2; if (n === 'obj_ball') ball = Number(x._kp); if (n === 'obj_playerOF') { of++; if (Number(x._O01) === 1) qb = { x: x.x, y: x.y }; } }
            return { down: Number(em.engineDownNumber), mine: em.enginePossessingTeamIdx === em.engineUserTeamIdx, wait: window._rb2p_userIsWaitingForOpponent === true, ball, of, qb, score: Number(em.userScore), sent: Number(window._rb2p_lastSentOutcomeMs) || 0 };
        });
        let s = null;
        for (let i = 0; i < 60; i++) { await sleep(250); s = await state(); if (s.down === 6 && s.ball === 0 && s.of >= 5 && s.qb) break; }
        if (!(s && s.down === 6 && s.ball === 0 && s.qb)) throw new Error('no try on the field: ' + JSON.stringify(s));
        await sleep(1200);
        // T1: CFCX — a press on the QB, held 1.45 s, let go with no pull
        const cal = await QB.calibrate(off.page);
        const c = cal.toCss(s.qb.x, s.qb.y);
        const sentBefore = s.sent;
        await QB.pointer(off.page).move(c.x, c.y); await sleep(30); await QB.pointer(off.page).down(); await sleep(1450); await QB.pointer(off.page).up();
        await sleep(6000);
        const s1 = await state();
        const t1Lines = lines.slice();
        check('T1 a press on the QB let go without a snap does not end the overtime try (6 s later: still ours, down 6, the try on the field, nothing handed over)',
              t1Lines.some(l => /CONV try started \(bkp 1\)/.test(l)) && s1.mine && !s1.wait && s1.down === 6 && s1.ball === 0 && s1.sent === sentBefore && !t1Lines.some(l => /OT-TD drive over/.test(l)),
              JSON.stringify({ s1, lines: t1Lines }));
        // T2: the try is played for real, and only then does the ball go over
        let rr = null; try { rr = await QB.playOne(off.page, await QB.calibrate(off.page), {}); } catch (e) { rr = { result: 'err ' + e.message }; }
        let s2 = null;
        for (let i = 0; i < 60; i++) { await sleep(250); s2 = await state(); if (s2.sent > sentBefore && s2.wait) break; }
        check('T2 the try is still played afterwards (a real snap), and the ball goes over only after it: ' + JSON.stringify(rr && rr.result),
              lines.some(l => /CONV try in play/.test(l)) && s2.sent > sentBefore && s2.wait && s2.down !== 6,
              JSON.stringify({ s2, bot: rr && rr.result, lines: lines.slice(t1Lines.length) }));
    } finally {
        try { for (const P of [g.a, g.b]) await P.page.evaluate(() => { window._rb2p_gameOverReported = true; }); } catch (e) {}
        await g.cleanup();
    }
    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
