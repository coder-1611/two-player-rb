// e2e/probe-ot2pt-play.js — diagnostic (room CFCX, V542): an overtime touchdown, the bridge's 1 PT / 2 PT offer,
// 2 PT, and then the try PLAYED through real mouse input (qb-bot). Every change of the ball's state, the down,
// the score and the overtime check's verdict is recorded as it happens, so the try's own life is observed, not
// guessed. CFCX: Romans's 2 PT pass was handed off 2.7 s after its snap (1.3 s after the throw), no points.
//   RB_E2E_PORT=8806 node e2e/probe-ot2pt-play.js [runs] [stray]
//   run: the try is a hand-off run against the EASY defense (a 2 PT that scores, to watch the credit)
//   stray: click the QB half a second after the touchdown, before the 1 PT / 2 PT offer — what Romans did in
//   CFCX (783.5 s: "cDROP y=39 d=1", "cSNAP y=39 d=1": a scrimmage snap on the touchdown's own line)
const H = require('./harness');
const TP = require('./two-player');
const QB = require('./qb-bot');
const sleep = H.sleep;
const RUNS = Number(process.argv[2]) || 1;
const STRAY = process.argv.includes('stray') || process.argv.includes('straysnap');
const STRAY_SNAP = process.argv.includes('straysnap');   // a quick flick: press on the QB, pull 30 gui px, let go (a real snap)
const RUN = process.argv.includes('run');
const HOLD = process.argv.includes('hold');   // CFCX: press the QB, hold 1.45 s WITHOUT pulling, let go — no snap; then wait   // the try as a hand-off run (an easy defense), not a pass

async function oneRun(run) {
    const g = await TP.startTwoPlayerGame({});
    try {
        // the offense = the page with a real drive running (the opening kickoff can take a while to settle)
        let off = null;
        for (let i = 0; i < 60 && !off; i++) {
            await sleep(500);
            const ra = await g.a.page.evaluate(() => !!(window._rb2p_realDriveRunning && window._rb2p_realDriveRunning()) && window._rb2p_userIsWaitingForOpponent !== true);
            const rb = await g.b.page.evaluate(() => !!(window._rb2p_realDriveRunning && window._rb2p_realDriveRunning()) && window._rb2p_userIsWaitingForOpponent !== true);
            if (ra !== rb) off = ra ? g.a : g.b;
        }
        if (!off) return { run, result: 'no drive running' };
        await sleep(1500);
        if (RUN) for (const P of [g.a, g.b]) await P.page.evaluate(() => { try { sessionStorage.setItem('rb2p_difficulty', 'easy'); if (window._rb2p_applyOpDifficulty) window._rb2p_applyOpDifficulty(); } catch (e) {} });
        const logs = [];
        const allLogs = [];
        off.page.on('console', m => { const t = m.text(); allLogs.push([Date.now(), t.slice(0, 200)]); if (/OT-TD|CONV|UNWEDGE|SEND |PAT-INV|try/.test(t)) logs.push([Date.now(), t.slice(0, 160)]); });
        // the recorder: every change, at 10 ms resolution
        await off.page.evaluate(() => {
            window.__ot = []; let last = '';
            const balls = () => { const out = []; const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') out.push(Number(x._kp)); return out.join('/') || '-'; };
            window.__otTimer = setInterval(() => {
                try {
                    const em = RB.engineState();
                    const s = 'ball ' + balls() + ' · down ' + Number(em.engineDownNumber) + ' · score ' + Number(em.userScore) + ' · stage ' + Number(em.engineDriveFsmStage) +
                        ' · ctl ' + Number(em.engineControllerState) + ' · live ' + (window._rb2p_playInProgress && window._rb2p_playInProgress() ? 1 : 0) +
                        ' · ' + (window._rb2p_userIsWaitingForOpponent === true ? 'WAIT' : 'mine') + ' · poss ' + (em.enginePossessingTeamIdx === em.engineUserTeamIdx ? 'me' : 'them');
                    if (s !== last) { window.__ot.push([Date.now(), s]); last = s; }
                } catch (e) {}
            }, 10);
            const o = window._rb2p_otTdCheck; let lastR = '';
            window._rb2p_otTdCheck = function () { const r = o.apply(this, arguments); if (r !== lastR) { window.__ot.push([Date.now(), 'CHECK -> ' + r]); lastR = r; } return r; };
        });
        await off.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_clockLicence && window._rb2p_clockLicence('test');
            em.setUserScore(8); em.setOpponentScore(16);   // never tied at the touchdown: a tie in Q5 re-runs the OT coin flip
            window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
            window._rb2p_inOvertime = true; window._rb2p_gameOverReported = false;
            em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 1; em.engineYardLineSigned = 45;
        });
        await sleep(800);
        const T0 = Date.now();
        await off.page.evaluate(() => { const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1); });   // the engine's own touchdown
        let stray = 'no';
        if (STRAY) {
            // a click on the QB before the offer (the offer waits 900 ms after the touchdown)
            for (let i = 0; i < 6 && stray === 'no'; i++) {
                await sleep(120);
                const qb = await off.page.evaluate(() => {
                    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
                    for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF' && Number(x._O01) === 1) return { x: x.x, y: x.y };
                    return null;
                });
                if (!qb) continue;
                let cal = null; try { cal = await QB.calibrate(off.page); } catch (e) {}
                if (!cal) continue;
                const c = cal.toCss(qb.x, qb.y);
                await QB.pointer(off.page).move(c.x, c.y); await sleep(30); await QB.pointer(off.page).down(); await sleep(60);
                if (STRAY_SNAP) { const dir = await off.page.evaluate(() => Number(RB.engineState().engineDriveDirection) || 1); await QB.pointer(off.page).move(c.x - dir * 30 / cal.gs, c.y, { steps: 2 }); await sleep(60); }
                await QB.pointer(off.page).up();
                const k = await off.page.evaluate(() => { const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') return Number(x._kp); return null; });
                stray = (STRAY_SNAP ? 'flicked' : 'clicked') + ' the QB ' + ((Date.now() - T0) / 1000).toFixed(2) + ' s after the touchdown (ball now ' + k + ')';
            }
        }
        let fired = false;
        for (let i = 0; i < 80 && !fired; i++) {
            await sleep(250);
            fired = await off.page.evaluate(() => { const pl = window._rb2p_enumeratePopupInstances() || []; for (const p of pl) if (p && !p._HL2 && p._0G === 100369) { _li(p, p, p._0G); return true; } return false; });
        }
        if (!fired) {
            const ot = await off.page.evaluate(() => window.__ot || []);
            return { run, result: 'no 2 PT button', stray, lines: ot.concat(allLogs.filter(l => l[0] < T0 + 2500).map(l => [l[0], '   console: ' + l[1]])).sort((a, b) => a[0] - b[0]).filter(l => l[0] >= T0 - 300).map(l => ((l[0] - T0) / 1000).toFixed(2).padStart(7) + 's  ' + l[1]) };
        }
        // the try on the field: a ball at rest, down 6, a QB
        let ready = false;
        for (let i = 0; i < 60 && !ready; i++) {
            await sleep(250);
            ready = await off.page.evaluate(() => {
                const em = RB.engineState(); if (Number(em.engineDownNumber) !== 6) return false;
                const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let ball = false, of = 0;
                for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; if (x._eE2._fE2 === 'obj_ball' && Number(x._kp) === 0) ball = true; if (x._eE2._fE2 === 'obj_playerOF') of++; }
                return ball && of >= 5;
            });
        }
        if (!ready) return { run, result: 'no try formation', stray };
        await sleep(1200);
        let cal = null; try { cal = await QB.calibrate(off.page); } catch (e) {}
        let rr = null;
        if (HOLD) {
            const qb = await off.page.evaluate(() => { const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF' && Number(x._O01) === 1) return { x: x.x, y: x.y }; return null; });
            const c = cal.toCss(qb.x, qb.y);
            await QB.pointer(off.page).move(c.x, c.y); await sleep(30); await QB.pointer(off.page).down(); await sleep(1450); await QB.pointer(off.page).up();
            rr = { result: 'held the QB 1.45 s, no pull' };
        } else { try { rr = RUN ? await QB.runOne(off.page, cal, {}) : await QB.playOne(off.page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; } }
        await sleep(15000);
        const out = await off.page.evaluate(() => { clearInterval(window.__otTimer); return { ot: window.__ot, snap: Number(window._rb2p_convTrySnappedMs) || 0 }; });
        const z = out.snap || T0;
        const lines = out.ot.concat(logs.map(l => [l[0], '   console: ' + l[1]])).sort((a, b) => a[0] - b[0])
            .filter(l => l[0] >= T0 - 300).map(l => ((l[0] - z) / 1000).toFixed(2).padStart(7) + 's  ' + l[1]);
        return { run, stray, bot: rr && rr.result, snapAfterTdS: out.snap ? ((out.snap - T0) / 1000).toFixed(1) : 'never', lines };
    } finally {
        try { await g.a.page.evaluate(() => { window._rb2p_gameOverReported = true; }); await g.b.page.evaluate(() => { window._rb2p_gameOverReported = true; }); } catch (e) {}
        await g.cleanup();
    }
}

(async () => {
    for (let r = 1; r <= RUNS; r++) {
        const o = await oneRun(r);
        console.log('=== run ' + r + ': stray ' + o.stray + ' · bot ' + JSON.stringify(o.bot || o.result) + ' · try snapped ' + (o.snapAfterTdS || '-') + ' s after the touchdown');
        if (o.lines) console.log(o.lines.join('\n'));
    }
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
