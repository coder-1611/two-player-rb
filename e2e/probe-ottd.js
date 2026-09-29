// e2e/probe-ottd.js — diagnostic (room QJFB, V423): an overtime touchdown scored through the
// ENGINE's own path (_Ak1 -> _Ik1 -> _hB case 0 at quarter 5: +6 and _Vy 17), the bridge's
// 1 PT / 2 PT offer, then the player's tap on 2 PT (the button's own script). Prints the
// engine state every 250ms so what happens to the try is observed, not guessed.
//   node e2e/probe-ottd.js [kick]   — "kick": tap the leftover kickoff button first (QJFB did)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
const KICK = process.argv[2] === 'kick';

(async () => {
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const logs = [];
    off.page.on('console', m => { const t = m.text(); if (/OT|PAT|CONV|KY|modal|UNWEDGE|SEND|POSS|eb1/.test(t)) logs.push(((Date.now() - T0) / 1000).toFixed(1) + ' ' + t.slice(0, 150)); });
    let T0 = Date.now();
    const snap = () => off.page.evaluate(() => {
        const em = RB.engineState(), all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        let of = 0, kick = 0; const names77 = [];
        for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2; if (n === 'obj_playerOF') of++; if (n === 'obj_btn_kickoff' && x._IL2) kick++; }
        try { for (const x of (_si(77) || [])) if (x && !x._HL2) names77.push(x._eE2 && x._eE2._fE2); } catch (e) {}
        const pops = (window._rb2p_enumeratePopupInstances() || []).filter(p => p && !p._HL2 && p._0G).map(p => p._0G);
        return { kp: Number(em.engineControllerState), vy: Number(em.engineDriveFsmStage), d: Number(em.engineDownNumber), y: Math.round(Number(em.engineYardLineSigned)),
                 su: Number(em.userScore), so: Number(em.opponentScore), q: Number(em.engineQuarter), of, kick, pops, o77: names77.join(','),
                 z7: (function () { try { return _jj(em.rawEngineMatch, _Sc2, 71)._7z; } catch (e) { return '?'; } })(),
                 wait: window._rb2p_userIsWaitingForOpponent === true, eb1: window.__eb1n || 0 };
    });
    await off.page.evaluate(() => {
        if (!window.__eb1wrapped) { const o = _eb1; window.__eb1n = 0; _eb1 = function () { window.__eb1n++; console.log('eb1 called t11=' + arguments[0]._t11); return o.apply(this, arguments); }; window.__eb1wrapped = true; }
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        em.setUserScore(8); em.setOpponentScore(14);
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
        window._rb2p_inOvertime = true; window._rb2p_gameOverReported = false;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 1; em.engineYardLineSigned = 45;
    });
    await sleep(800);
    console.log('before TD  ', JSON.stringify(await snap()));
    T0 = Date.now();
    await off.page.evaluate(() => { const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1); });
    let fired = false, kicked = false;
    for (let i = 0; i < 100; i++) {
        const s = await snap();
        console.log(((Date.now() - T0) / 1000).toFixed(1).padStart(5), JSON.stringify(s));
        if (KICK && !kicked && s.kick > 0) {
            kicked = true;
            const r = await off.page.evaluate(() => { const all = _Sc2._GL2._oq2; for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_btn_kickoff' && x._IL2) { _Ky(x, x); return 'kickoff tapped'; } return 'none'; });
            console.log('      >>> ' + r);
        }
        if (!fired && s.pops.includes(100369)) {
            fired = true; await sleep(1500);
            const r = await off.page.evaluate(() => { const pl = window._rb2p_enumeratePopupInstances() || []; for (const p of pl) if (p && !p._HL2 && p._0G === 100369) { _li(p, p, p._0G); return 'fired 2 PT'; } return 'no button'; });
            console.log('      >>> ' + r);
        }
        await sleep(250);
        if (fired && i > 60) break;
    }
    console.log('\n--- console ---\n' + logs.slice(0, 80).join('\n'));
    await off.page.evaluate(() => { window._rb2p_gameOverReported = true; });
    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
