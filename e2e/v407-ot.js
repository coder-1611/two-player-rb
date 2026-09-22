// e2e/v407-ot.js — "OT" only when overtime is real; test runs are not views.
//
//   T1  the engine's quarter-5 label reads FINAL when regulation was decided, OT when tied or overtime is armed
//   T2  the engine's "Overtime!" commentary is blank unless overtime is real
//   T3  the wait cover's quarter name follows the same rule
//   T4  a harness page is a test run: no visit record is written
//   T5  the narrator says "End of regulation" for a decided horn and "Overtime begins" only when tied
const H = require('./harness');
const TP = require('./two-player');
const R = require('../tools/audit-rules.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V407 OT LABEL ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;

    const t = await off.page.evaluate(() => {
        const em = RB.engineState(); const raw = em.rawEngineMatch;
        const sU = em.userScore, sO = em.opponentScore, sOt = window._rb2p_inOvertime;
        const out = { hooked: !!(window._Xi && _Xi.__rb2pOtLabel) };
        window._rb2p_inOvertime = false; em.setUserScore(24); em.setOpponentScore(16);
        out.decided = _Xi(raw, _Sc2, 'quarter_5'); out.decidedComm = _Xi(raw, _Sc2, 'comm_stage_overtime');
        out.decidedName = window._rb2p_qtrName(5);
        em.setUserScore(16); em.setOpponentScore(16);
        out.tied = _Xi(raw, _Sc2, 'quarter_5'); out.tiedName = window._rb2p_qtrName(5);
        em.setUserScore(24); em.setOpponentScore(16); window._rb2p_inOvertime = true;
        out.armed = _Xi(raw, _Sc2, 'quarter_5'); out.armedComm = _Xi(raw, _Sc2, 'comm_stage_overtime'); out.armedName = window._rb2p_qtrName(5);
        out.q4 = _Xi(raw, _Sc2, 'quarter_4');
        window._rb2p_inOvertime = sOt; em.setUserScore(sU); em.setOpponentScore(sO);
        return out;
    });
    check('T1 quarter 5 reads FINAL when decided, OT when tied, OT when overtime is armed; quarter 4 untouched', t.hooked && t.decided === 'FINAL' && t.tied === 'OT' && t.armed === 'OT' && /4TH/i.test(String(t.q4)), JSON.stringify(t));
    check('T2 the Overtime! commentary is blank when regulation was decided and intact when overtime is armed', t.decidedComm === '' && /Overtime/.test(String(t.armedComm)), JSON.stringify({ d: t.decidedComm, a: t.armedComm }));
    check('T3 the wait cover names quarter 5 the same way', t.decidedName === 'FINAL' && t.tiedName === 'OT' && t.armedName === 'OT', JSON.stringify(t));

    // ---- T4 ----
    const t4 = await off.page.evaluate(() => ({ testRun: window._rb2p_isTestRun(), visitId: window._rb2p_visitId, webdriver: navigator.webdriver, host: location.hostname }));
    check('T4 a harness page is a test run and writes no visit record', t4.testRun === true && t4.visitId == null, JSON.stringify(t4));

    // ---- T5 ----
    const T0 = 1700000000000; const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role, k }, f || {});
    const decided = [mk('a', 0, 'bind', { ver: 'V407' }), mk('a', 1000, 'score', { su: 24, so: 16, dsu: 2, dso: 0, q: 4, clk: 0 }), mk('a', 1200, 'q', { from: 4, to: 5, clk: 0, d: 1, tg: 10, y: 48 })];
    const tied = [mk('a', 0, 'bind', { ver: 'V407' }), mk('a', 1000, 'score', { su: 16, so: 16, dsu: 0, dso: 0, q: 4, clk: 0 }), mk('a', 1200, 'q', { from: 4, to: 5, clk: 0, d: 1, tg: 10, y: 0 })];
    const sd = R.narrate(decided, {}).filter(x => x.kind === 'quarter').map(x => x.text).join(' | ');
    const st = R.narrate(tied, {}).filter(x => x.kind === 'quarter').map(x => x.text).join(' | ');
    check('T5 the narrator: "End of regulation" when decided, "Overtime begins" only when tied', /End of regulation/.test(sd) && !/Overtime begins/.test(sd) && /Overtime begins/.test(st), JSON.stringify({ sd, st }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
