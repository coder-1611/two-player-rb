// e2e/v414-field-restore.js — a freeze puts possession back how it was (unless the ball changed hands).
//
//   R1  KKFU: they had the ball, their phone went quiet (reloading): I do NOT take it — their check restores them
//   R2  DPSY: they handed me the turn and froze: I restore my team at the spot their last push left the ball
//   R3  my own freeze: I had the ball at 3rd & 4 on the 12: I come back at 3rd & 4 on the 12
//   R4  double offense: both on the field and the ball is theirs: I park
//   R5  SQHJ: I owe a conversion result but nothing is on my screen: the result ships
//   R6  SQHJ: the thrower's pick-six watchdog retires when a new conversion is mine (no modal killed)
//   R7  JUQX: the native-end final uses the last in-match board, not the empty engine's 0-0 (shipped)
//   R8  a real game parked with nobody on the field puts the rightful owner back on
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V414 FIELD RESTORE ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    const r = await def.page.evaluate((role) => {
        const me = role, other = role === 'a' ? 'b' : 'a', now = Date.now(), room = sessionStorage.getItem('rb_room');
        const calls = [], parks = [];
        const realF = window._rb2p_forceUserOffenseDrive, realT = window._rb2p_declareTurnOwner;
        window._rb2p_forceUserOffenseDrive = (y, fresh, dd) => { calls.push({ y, fresh, dd: dd || null }); return true; };
        window._rb2p_declareTurnOwner = () => {};
        const base = () => { window._rb2p_lastSentOutcomeMs = 0; window._rb2p_lastOpponentOutcomeApplyMs = 0; window._rb2p_deferredOutcome = null;
                             if (window._twoPlayer && window._twoPlayer.pending) window._twoPlayer.pending.length = 0; window._rb2p_p6ScorerOwes = false; };
        const two = () => { const a = window._rb2p_fieldCheck(); window._rb2p_fieldAge(10000); return [a, window._rb2p_fieldCheck()]; };   // V415: 10 real seconds
        const out = {};
        // R1
        base(); window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_lastGood = { room, owner: other, at: now - 40000 };
        window._rb2p_turnRec = { owner: other, at: now - 60000, why: 'send-OTHER' };
        window._rb2p_oppLiveRx = { at: now - 40000, iHaveBall: true, yardLine: -15 };
        window._rb2p_oppHb = { vis: 'X', at: now - 30000 };
        const c1 = calls.length; out.r1 = two().concat(calls.length - c1);
        // R2
        base(); window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_lastGood = { room, owner: other, at: now - 40000 };
        window._rb2p_turnRec = { owner: me, at: now - 20000, why: 'send-OTHER' };
        window._rb2p_oppLiveRx = { at: now - 19000, iHaveBall: false, yardLine: 3.64 };
        const c2 = calls.length; out.r2 = two().concat(JSON.stringify(calls.slice(c2)));
        // R3
        base(); window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_lastGood = { room, owner: me, at: now - 30000, yard: 12, down: 3, toGo: 4 };
        window._rb2p_turnRec = { owner: me, at: now - 100000, why: 'send-KICKOFF' };
        window._rb2p_oppLiveRx = { at: now, iHaveBall: false, yardLine: -30 };
        window._rb2p_oppHb = { vis: 'V', at: now };
        const c3 = calls.length; out.r3 = two().concat(JSON.stringify(calls.slice(c3)));
        // R4
        base(); window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastGood = { room, owner: other, at: now - 20000 };
        window._rb2p_turnRec = { owner: other, at: now - 100000, why: 'send-OTHER' };
        window._rb2p_oppLiveRx = { at: now, iHaveBall: true, yardLine: 10 };
        out.r4 = two().concat(window._rb2p_userIsWaitingForOpponent === true);
        // R5
        base(); window._rb2p_userIsWaitingForOpponent = false;
        const shipped = []; const realShip = window._rb2p_shipSyntheticPatResult, realUp = window._rb2p_patModalUp, realOwed = window._rb2p_patOwed;
        window._rb2p_shipSyntheticPatResult = w => { shipped.push(w); return true; };
        window._rb2p_patModalUp = () => false; window._rb2p_patOwed = () => '';
        window._rb2p_p6ScorerOwes = true; window._rb2p_pickSixThisDeviceIsThrower = false; window._rb2p_patPlayPending = false; window._rb2p_lastConvModalMs = now - 30000;
        out.r5 = two().concat(shipped.length);
        window._rb2p_shipSyntheticPatResult = realShip; window._rb2p_patModalUp = realUp; window._rb2p_patOwed = realOwed; window._rb2p_p6ScorerOwes = false;
        window._rb2p_forceUserOffenseDrive = realF; window._rb2p_declareTurnOwner = realT;
        window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastGood = null;
        return out;
    }, def.role);
    check('R1 they had the ball and went quiet (reload): I do NOT take it', /their check restores them/.test(r.r1[1]) && r.r1[2] === 0, JSON.stringify(r.r1));
    check('R2 they handed me the turn and froze: my team back on where their push left the ball', (/restored/.test(r.r2[0]) || /restored/.test(r.r2[1])) && /"y":3.64/.test(r.r2[2])   /* still nobody on the field from R1 */, JSON.stringify(r.r2));
    check('R3 my own freeze at 3rd & 4 on the 12: back on at 3rd & 4 on the 12', /restored/.test(r.r3[1]) && /"y":12,"fresh":true,"dd":\{"down":3,"toGo":4\}/.test(r.r3[2]), JSON.stringify(r.r3));
    check('R4 both teams on the field and the ball is theirs: I park', /parked/.test(r.r4[1]) && r.r4[2] === true, JSON.stringify(r.r4));
    check('R5 I owe a conversion result with nothing on screen: the result ships', /owed result was shipped/.test(r.r5[1]) && r.r5[2] === 1, JSON.stringify(r.r5));

    // ---- R6: the stale thrower watchdog retires inside a new conversion ----
    const r6 = await def.page.evaluate(async () => {
        window._rb2p_diagLog('R6-START');
        const unw = []; const realU = window._rb2p_unwedgeConversion; window._rb2p_unwedgeConversion = w => { unw.push(w); };
        const realRDR = window._rb2p_realDriveRunning;
        window._rb2p_p6ScorerOwes = true; window._rb2p_pickSixThisDeviceIsThrower = false;
        window._rb2p_p6AwaitDriveMs = Date.now() - 6000;
        await new Promise(r => setTimeout(r, 4500));
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('R6-START'));
        const res = { armed: window._rb2p_p6AwaitDriveMs, unwedged: unw.length, retired: /P6-WATCH retired — a new conversion is mine/.test(tail) };
        window._rb2p_unwedgeConversion = realU; window._rb2p_p6ScorerOwes = false;
        return res;
    });
    check('R6 the stale pick-six watchdog retires inside a new conversion and kills nothing', r6.armed === 0 && r6.unwedged === 0 && r6.retired, JSON.stringify(r6));

    // ---- R7: native-end final (shipped predicate) ----
    const r7 = await def.page.evaluate(async () => { const src = await (await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })).text();
        return /natRep\.score = gameOverLastU; natRep\.oppScore = gameOverLastO;/.test(src) && /gameOverLastU = u; gameOverLastO = o;/.test(src); });
    check('R7 the native-end final uses the last in-match board (shipped)', r7 === true, '');

    // ---- R8: a real parked game recovers to the rightful owner ----
    await off.page.evaluate(() => { window._rb2p_diagLog('R8-START'); window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = 0; window._rb2p_lastSentOutcome = null; window._rb2p_lastOpponentOutcomeApplyMs = 0; });
    await def.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = 0; window._rb2p_lastOpponentOutcomeApplyMs = 0; });
    let live = null; const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
        await sleep(1000);
        const s = await Promise.all([off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true), def.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true)]);
        if (s[0] || s[1]) { live = { offLive: s[0], defLive: s[1], secs: Math.round((Date.now() - t0) / 1000) }; break; }
    }
    const tail = await off.page.evaluate(() => { const d = String(window._rb2p_readDiagLog()); return d.slice(d.lastIndexOf('R8-START')); });
    check('R8 a real game parked with nobody on the field puts the team that had the ball back on (within 30s)', !!live && live.offLive && !live.defLive && live.secs <= 30, JSON.stringify({ live, tail: tail.slice(-300) }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
