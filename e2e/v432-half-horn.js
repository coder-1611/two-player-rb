// e2e/v432-half-horn.js — the halftime horn: no hand-off stamped 0:00, no ping-pong, the half ends after the
// receiver's down (FOVL 2026-10-02 3:35 am and ONFE 8:40 am: both players quit at halftime; HIHR 3:26 am: 11 s).
//
// V430 shipped a drive end that ran out the clock at 0:00 ("keep 0:00") and claimed the receiver's engine would end the
// quarter itself. At the halftime horn it did not, in 3 of 3 real games: the receiver went LIVE at Q2 0:00 with no ball
// on the field (EMPTY-FIELD re-staged the drive — FAILED), its engine's halftime turnover went back as a PUNT stamped
// 0:00, the partner did the same, and the two phones bounced empty possessions every ~7 s (FOVL 5 bounces, ONFE 7 —
// nobody could snap). Before V430, 117 of the archive's 123 hand-offs at the Q2 horn (0:01: the receiver plays one
// down) reached Q3, and none of the other 6 bounced. V432 reverts "keep 0:00"; the owner's 0:01 glitch (one extra down) is back — OPEN.md #4.
//
// The harness cannot make the engine ship its halftime turnover after a REAL play (a real pass or run at Q2 0:04 ends
// the half through the halftime law here, on both builds — tried 2026-10-02); so the drive end at the horn is driven
// the way V430's own test drove it (e2e/v430-expired.js: the clock reaches 0:00, then the engine's possession change in
// the same frame — the bridge's _1c1 hook builds, holds and ships the hand-off). Then:
//   H1  the hand-off at the horn is not stamped 0:00 — the stamp every real bounce carried (V431: clk 0)
//   H2  no ping-pong: in the next 20 s the receiver sends no hand-off it did not play for
//   H3  the receiver has its down (Q2, time on the clock, the sender waits) and plays it for real (a run or a pass
//       through trusted input, e2e/qb-bot.js): the half ends — both phones in Q3, one offense, nothing bounced
const H = require('./harness');
const TP = require('./two-player');
const QB = require('./qb-bot');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 400); } return Object.assign(v || {}, { ms: null }); }
const st = page => page.evaluate(() => { try { if (!window.RB || !RB.engineState()) return null; const s = RB.engineState(); return { q: Number(s.engineQuarter), m: Number(s.engineMinutesLeft), s: Number(s.engineSecondsLeft), wait: window._rb2p_userIsWaitingForOpponent === true }; } catch (e) { return null; } }).catch(() => null);
const audit = async (code, role) => Object.values(await TP.fbGet('rooms/' + code + '/audit/' + role) || {});

// the play that runs out the clock (e2e/v430-expired.js playEndsAt): the quarter at its last second first, then 0:00
// and the engine's possession change in the same frame
async function playEndsAt(page, q, sec, score) {
    await page.evaluate(({ q, score }) => {
        const s = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test', 3000);
        window._rb2p_lastStableQuarter = q; window._rb2p_wireQuarter = q; s.engineQuarter = q;
        s.engineMinutesLeft = 0; s.engineSecondsLeft = 1; s.engineTickAllowance = 0;
        if (score) { s.setUserScore(score[0]); s.setOpponentScore(score[1]); }
    }, { q, score });
    await sleep(4000);
    return page.evaluate(({ q, sec }) => {
        const s = RB.engineState(); if (!s) return 'no state';
        if (Number(s.engineQuarter) !== q) return 'quarter moved to ' + s.engineQuarter;
        s.engineMinutesLeft = 0; s.engineSecondsLeft = sec; s.engineTickAllowance = 0;
        s.enginePossessingTeamIdx = s.engineUserTeamIdx;
        s.engineDriveFsmStage = 2; s.enginePriorFsmStage = 4;
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        try { _1c1(s.rawEngineMatch, _Sc2); return true; } catch (e) { return String(e); }
    }, { q, sec });
}
// one real down on the phone with the ball: tap through a button scene if one is up, then a run (or, with no running
// back in the formation, a pass) through trusted input
async function playDown(page, code, role, tries) {
    const t0 = await page.evaluate(() => Date.now());
    for (let i = 0; i < (tries || 4); i++) {
        let cal = null; try { cal = await QB.calibrate(page); } catch (e) {}
        try { await QB.clickButtons(page, cal, () => {}); } catch (e) {}
        let rr = null; try { rr = await QB.runOne(page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; }
        if (rr && rr.result === 'none') { try { rr = await QB.playOne(page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; } }   // no running back in this formation: a pass
        if (process.env.X_DEBUG) console.log('    runOne: ' + JSON.stringify(rr && { result: rr.result, why: rr.why }) + ' ' + JSON.stringify(await page.evaluate(() => { try { const i = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; const c = {}; for (const x of i) { if (x && !x._HL2 && x._eE2) c[x._eE2._fE2] = (c[x._eE2._fE2] || 0) + 1; } return { ball: c.obj_ball || 0, of: c.obj_playerOF || 0, df: c.obj_playerDF || 0, btn: Object.keys(c).filter(k => /btn|button/i.test(k)) }; } catch (e) { return String(e); } }).catch(() => null)));
        await sleep(2500);
        const sn = (await audit(code, role)).filter(e => e.k === 'snap' && e.t >= t0);
        if (sn.length) return sn[sn.length - 1];
        await sleep(1500);
    }
    return null;
}

(async () => {
    console.log('=== V432 HALFTIME HORN ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = off === g.a ? g.b : g.a;
    const t0 = await def.page.evaluate(() => Date.now());
    const r = await playEndsAt(off.page, 2, 0, [7, 3]);
    await sleep(20000);                                   // the 4 s hold, the send, and what the receiver does with it
    const auD = await audit(g.code, def.role), auO = await audit(g.code, off.role);
    const sendsO = auO.filter(e => e.k === 'send' && e.t >= t0 - 1000);
    const sendsD = auD.filter(e => e.k === 'send' && e.t >= t0), snapsD = auD.filter(e => e.k === 'snap' && e.t >= t0);
    const bounce = sendsD.filter(s => Number(s.q) === 2 && !snapsD.some(n => n.t < s.t));
    console.log('  the sender\'s drive ran out the clock at the Q2 horn: ' + r + '; sent ' + JSON.stringify(sendsO.map(e => e.type + ' Q' + e.q + ' clk' + e.clk)) +
                '; the receiver sent ' + JSON.stringify(sendsD.map(e => e.type + ' Q' + e.q + ' clk' + e.clk)) + ', snapped ' + snapsD.length);
    const horn = sendsO.filter(e => Number(e.q) === 2);
    check('H1 the hand-off at the halftime horn is not stamped 0:00 (the stamp of every real bounce)',
          horn.length >= 1 && horn.every(e => Number(e.clk) >= 1), JSON.stringify(horn.map(e => e.type + ' Q' + e.q + ' clk' + e.clk)));
    check('H2 no ping-pong: the receiver sends no hand-off it did not play for', bounce.length === 0,
          JSON.stringify(bounce.map(e => e.type + ' Q' + e.q + ' clk' + e.clk)));
    // H3: the receiver's down, played for real — then the half ends
    const dNow = await st(def.page), oNow = await st(off.page);
    const hasDown = !!(dNow && oNow && dNow.q === 2 && dNow.wait === false && dNow.m * 60 + dNow.s >= 1 && oNow.wait === true);
    const t1 = await def.page.evaluate(() => Date.now());
    const snapped = hasDown ? await playDown(def.page, g.code, def.role, 4) : null;
    const q3 = await until(async () => { const a = await st(off.page), b = await st(def.page); return { ok: !!(a && b && a.q === 3 && b.q === 3 && (a.wait !== b.wait)), a, b }; }, 60000, 1000);
    await sleep(3000);
    const auD2 = await audit(g.code, def.role), auO2 = await audit(g.code, off.role);
    const all = auD2.map(e => Object.assign({ who: 'def' }, e)).concat(auO2.map(e => Object.assign({ who: 'off' }, e))).filter(e => e.t >= t1).sort((a, b) => a.t - b.t);
    const q2sends = all.filter(e => e.k === 'send' && Number(e.q) === 2);
    const bounce2 = q2sends.filter(s => !all.some(n => n.k === 'snap' && n.who === s.who && n.t < s.t));
    console.log('  the receiver\'s down: ' + JSON.stringify({ dNow, oNow }) + ' snapped ' + (snapped ? 'Q' + snapped.q + ' clk' + snapped.clk : 'no') +
                '; Q2 sends after it ' + JSON.stringify(q2sends.map(e => e.who + ' ' + e.type + ' clk' + e.clk)) + '; Q3 on both ' + (q3.ms !== null ? 'after ' + (q3.ms / 1000) + ' s' : 'never') + ' ' + JSON.stringify({ off: q3.a, def: q3.b }));
    check('H3 the receiver has its down at the horn and plays it for real: the half ends — both phones in Q3, one offense, nothing bounced',
          hasDown && !!snapped && q3.ms !== null && bounce2.length === 0, JSON.stringify({ hasDown, snapped: !!snapped, q3: q3.ms, bounced: bounce2.map(e => e.who + ' ' + e.type) }));
    if (process.env.X_DEBUG) for (const P of [off, def]) console.log('--- ' + (P === off ? 'sender' : 'receiver') + ' diag\n' + String(await P.page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '')).split(',').slice(-45).join('\n'));
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
