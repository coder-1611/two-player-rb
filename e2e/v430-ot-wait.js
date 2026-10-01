// e2e/v430-ot-wait.js — the overtime receiver waits for the partner's try instead of being refused once (ZQMT,
// 2026-10-01, V427: a real 13 s freeze).
//
// ZQMT: the game was tied at the horn while A was still playing its conversion (live, the turn record naming A). The
// coin flip gave B the overtime kickoff; B's _rb2p_applyOtKickoff went LIVE before declaring its turn, so V366 rule 2
// REFUSED it ("the turn is the opponent's and they are live") — and nothing came back to it: the flip was applied,
// the drive staged behind the waiting cover, until TURN-RESCUE's guess 13 s later. And when the flip lands within 8 s
// of the receiver's own quarter change (this test), V368's quarter exemption let the LIVE through instead: BOTH
// phones on offense while A played its try (V429 fails O1 that way).
//
//   O1  while the partner is still playing (its try owed, live), the receiver does not go live — never two offenses
//   O2  the moment the partner finishes (its own kickoff apply parks it), the receiver goes live — within 4 s, with no
//       rescuer's guess (on V429 it stayed parked until TURN-RESCUE)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 250); } return Object.assign(v || {}, { ms: null }); }
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const diagHas = (page, re) => page.evaluate(src => new RegExp(src).test(String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')), re.source).catch(() => false);

(async () => {
    console.log('=== V430 OT KICKOFF WAITS ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(8000);
    const A = g.a.role === 'a' ? g.a : g.b;
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = off === g.a ? g.b : g.a;
    // the partner (off) is still playing its conversion: its own kickoff apply defers ("conversion owed") and it stays live
    await off.page.evaluate(() => { window.__realPatOwed = window._rb2p_patOwed; window._rb2p_patOwed = () => true; });
    // the coin flip gives the kickoff to the phone that waited (def), as in ZQMT
    await A.page.evaluate(rcv => {
        let gid = 'g'; try { gid = (window._rb2p_flowState && window._rb2p_flowState().me.gid) || 'g'; } catch (e) {}
        const room = sessionStorage.getItem('rb_room');
        sessionStorage.setItem('rb2p_otFlip_' + room + '_' + gid + '_5', JSON.stringify({ receiver: rcv, period: 5, ts: Date.now() }));
    }, def.role);
    // the horn: tied, overtime
    for (const s of [off, def]) await s.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        em.setUserScore(14); em.setOpponentScore(14);
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
        em.engineMinutesLeft = 3; em.engineSecondsLeft = 0;
    });
    // the flip reaches def
    const flipped = await until(async () => ({ ok: await def.page.evaluate(() => Number(window._rb2p_otKickoffAppliedPeriod) === 5 || /OT kickoff|POSS-REFUSED LIVE/.test(String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : ''))).catch(() => false) }), 30000, 500);
    await sleep(5000);
    const dW = await waiting(def.page), oW = await waiting(off.page);
    check('O1 while the partner still plays its try, the overtime receiver does not go live (never two offenses)',
          flipped.ms !== null && dW === true && oW === false, JSON.stringify({ flipped: flipped.ms, defWaiting: dW, offWaiting: oW, refused: await diagHas(def.page, /POSS-REFUSED LIVE/), waits: await diagHas(def.page, /OT kickoff waits/) }));
    // the partner's try is over: its deferred kickoff apply runs and parks it
    await off.page.evaluate(() => { window._rb2p_patOwed = window.__realPatOwed; });
    const t1 = Date.now();
    const live = await until(async () => { const d = await waiting(def.page), o = await waiting(off.page); return { ok: d === false && o === true, d, o }; }, 15000, 250);
    const rescued = await diagHas(def.page, /TURN-RESCUE -> offense/);
    check('O2 once the partner has finished, the receiver goes live within 4 s, with no rescuer\'s guess',
          live.ms !== null && live.ms <= 4000 && !rescued, JSON.stringify({ ms: live.ms, def: live.d, off: live.o, rescued }));
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
