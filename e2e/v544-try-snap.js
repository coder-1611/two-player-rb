// e2e/v544-try-snap.js — V544 (the owner, after V542's overtime fix: "no not JUST in overtime, this should be the case
// everywhere"): a try counts only once its ball is actually SNAPPED (or kicked) — in regulation too. The snap on record
// (_rb2p_lastSnapMs/Down, read by the horn's "the try was played" test, the Q3 law, C13 and V394's "a new drive") was
// stamped at the PRESS (bkp 1: a finger on the QB). Two real pages, a regulation (Q1) touchdown through the engine's own
// path, its own 1 PT / 2 PT choice, 2 PT, then real mouse input:
//   T0  a press on the QB let go without a pull on a scrimmage down is not a snap (the snap on record does not move)
//   T1  the same on the try: not a snap, not a try played (the horn test says no), the try still on the field 6 s later
//   T2  a real snap then plays the try: the snap on record is the try's (down 6), and the drive ends after it
//   RB_E2E_PORT=8806 node e2e/v544-try-snap.js
const H = require('./harness');
const TP = require('./two-player');
const QB = require('./qb-bot');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '\n        ' + detail)); };

(async () => {
    console.log('=== V544: a try (any try) counts only once it is snapped ===');
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
        off.page.on('console', m => { const t = m.text(); if (/CONV try|SEND |cSNAP|OT-TD|POST-CONV/.test(t)) lines.push(t.slice(0, 160)); });
        const state = () => off.page.evaluate(() => {
            const em = RB.engineState(), all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let ball = null, of = 0, qb = null;
            for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2; if (n === 'obj_ball') ball = Number(x._kp); if (n === 'obj_playerOF') { of++; if (Number(x._O01) === 1) qb = { x: x.x, y: x.y }; } }
            return { down: Number(em.engineDownNumber), q: Number(em.engineQuarter), mine: em.enginePossessingTeamIdx === em.engineUserTeamIdx, wait: window._rb2p_userIsWaitingForOpponent === true,
                     ball, of, qb, score: Number(em.userScore), sent: Number(window._rb2p_lastSentOutcomeMs) || 0,
                     snapMs: Number(window._rb2p_lastSnapMs) || 0, snapDown: Number(window._rb2p_lastSnapDown), tryPlayed: Number(window._rb2p_convTryPlayedMs) || 0,
                     offer: Number(window._rb2p_lastConvModalMs) || 0 };
        });
        const pressAndLetGo = async (qb) => {   // CFCX: a press on the QB held 1.45 s, let go with no pull
            const cal = await QB.calibrate(off.page), c = cal.toCss(qb.x, qb.y);
            await QB.pointer(off.page).move(c.x, c.y); await sleep(30); await QB.pointer(off.page).down(); await sleep(1450); await QB.pointer(off.page).up();
        };
        // T0: a scrimmage down — the press is not a snap
        let s0 = await state();
        for (let i = 0; i < 40 && !(s0.ball === 0 && s0.qb && s0.down !== 6); i++) { await sleep(250); s0 = await state(); }
        const t0 = Date.now();
        await pressAndLetGo(s0.qb);
        await sleep(800);
        const s0b = await state();
        check('T0 a press on the QB let go without a pull is not a snap (the snap on record stays put)',
              lines.some(l => /cSNAP/.test(l)) && !(s0b.snapMs >= t0) && s0b.ball === 0 && !s0b.wait, JSON.stringify({ s0, s0b, lines }));
        // a regulation touchdown through the engine's own path, its own 1 PT / 2 PT choice: 2 PT
        await off.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_clockLicence && window._rb2p_clockLicence('test');
            em.setUserScore(8); em.setOpponentScore(16);
            em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 1; em.engineYardLineSigned = 45;
        });
        await sleep(800);
        const tTd = Date.now();
        await off.page.evaluate(() => { const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1); });
        let fired = false;
        for (let i = 0; i < 100 && !fired; i++) {
            await sleep(250);
            fired = await off.page.evaluate(() => { const pl = window._rb2p_enumeratePopupInstances() || []; for (const p of pl) if (p && !p._HL2 && p._0G === 100369) { _li(p, p, p._0G); return true; } return false; });
        }
        if (!fired) throw new Error('the 1 PT / 2 PT choice never came up: ' + JSON.stringify(await state()) + ' ' + lines.join(' | '));
        let s = null;
        for (let i = 0; i < 60; i++) { await sleep(250); s = await state(); if (s.down === 6 && s.ball === 0 && s.of >= 5 && s.qb) break; }
        if (!(s && s.down === 6 && s.ball === 0 && s.qb)) throw new Error('no try on the field: ' + JSON.stringify(s));
        await sleep(1200);
        // T1: the press on the try
        const sentBefore = s.sent, tPress = Date.now();
        await pressAndLetGo(s.qb);
        await sleep(6000);
        const s1 = await state();
        const horn = await off.page.evaluate((o) => window._rb2p_tryCrossedHorn(o, Date.now() + 1000), s1.offer);
        const t1Lines = lines.slice();
        check('T1 a press on the try let go without a snap is not the try: no snap on record, the horn test says "not played", the try still on the field 6 s later',
              t1Lines.some(l => /CONV try started \(bkp 1\)/.test(l)) && !(s1.snapMs >= tPress) && !(s1.tryPlayed >= tPress) && horn === false &&
              s1.q === 1 && s1.mine && !s1.wait && s1.down === 6 && s1.ball === 0 && s1.sent === sentBefore,
              JSON.stringify({ s1, horn, offerAfterTd: s1.offer >= tTd, lines: t1Lines.slice(-8) }));
        // T2: the try played for real
        const tPlay = Date.now();
        let rr = null; try { rr = await QB.playOne(off.page, await QB.calibrate(off.page), {}); } catch (e) { rr = { result: 'err ' + e.message }; }
        const sSnap = await state();
        let s2 = null;
        for (let i = 0; i < 60; i++) { await sleep(250); s2 = await state(); if (s2.sent > sentBefore && s2.wait) break; }
        check('T2 a real snap plays the try — the snap on record is the try\'s (down 6) — and the drive ends after it: ' + JSON.stringify(rr && rr.result),
              lines.some(l => /CONV try in play/.test(l)) && sSnap.snapDown === 6 && sSnap.snapMs >= tPlay && sSnap.tryPlayed >= tPlay && s2.sent > sentBefore && s2.wait,
              JSON.stringify({ sSnap, s2, bot: rr && rr.result, lines: lines.slice(t1Lines.length) }));
    } finally {
        try { for (const P of [g.a, g.b]) await P.page.evaluate(() => { window._rb2p_gameOverReported = true; }); } catch (e) {}
        await g.cleanup();
    }
    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
