// e2e/v368-mhuy.js — the four mechanisms behind room MHUY, each reproduced
// from its audit record and each now refused.
//
//   413s  an 8-yard completion (+10.7, 2nd & 2.5) was followed 0.5s later by a
//         snap at +3.2, 1st & 10, with the quarter-START clock: the between-
//         quarters keep-drive re-fired seven seconds into Q2, after plays had
//         been run. ("my pass got reverted")
//   652s  the halftime field goal: no outcome is sent at halftime, the Q3 law
//         just flips B live — and the V366 possession gate refused it because
//         the ledger still named A and A's half-second-old push claimed the
//         ball. Both phones parked: DEADLOCK 20s, then refreshes.
//   675s  B's reload restored 0-0 -> 16-9 without re-baselining the pick-6
//         score-jump watcher; +9 read as a defensive touchdown; B entered the
//         cascade as the "thrower" and shipped a PICK6 with plus6:false; A
//         invented +6, got a conversion modal, refreshed, got it AGAIN from the
//         duty record, made the 2-pt: EIGHT phantom points (9 -> 17).
//   774s  B's second reload did it again (+17).
//
// T1  a resume-style score restore does NOT enter the pick-6 cascade
// T2  a +9 / +17 opponent jump is never a pick-6; exactly +6 still is
// T3  after a snap in the quarter, the between-quarters keep-drive refuses
//     and a pending quarter resume is dropped
// T4  the possession gate does not refuse LIVE inside 8s of a quarter change
// T5  the live mirror never writes the opponent's clock onto a LIVE device
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V368 ROOM MHUY, REFUSED ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1: a restore is not a touchdown ----
    const t1 = await def.page.evaluate(async () => {
        window.__rbBootMs = Date.now() - 60000;                 // well past the boot grace
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_pick6SentThisPossession = false;
        const em = RB.engineState();
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => sent.push(o.type);
        // the resume's restore, exactly as tryRestore writes it (V368: followed by a re-baseline)
        window._rb2p_resumeState = null;
        em.setUserScore(Number(em.userScore || 0) + 16);
        em.setOpponentScore(Number(em.opponentScore || 0) + 9);
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();   // what the restore now does
        await new Promise(r => setTimeout(r, 700));
        const r = { cascade: window._rb2p_pickSixPatCascadeActive === true, sent: sent };
        window._twoPlayer.send = real; return r;
    });
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 a resume-style score restore does not enter the pick-6 cascade', t1.cascade === false && !t1.sent.includes('PICK6'), JSON.stringify(t1));

    // ---- T2: exactly +6 is a touchdown; +9 and +17 are not ----
    const t2 = await def.page.evaluate(async () => {
        window.__rbBootMs = Date.now() - 60000;
        const em = RB.engineState();
        const real = window._twoPlayer.send; const sent = []; window._twoPlayer.send = o => sent.push(o.type);
        const tryJump = async (n) => {
            window._rb2p_pickSixPatCascadeActive = false; window._rb2p_pickSixThisDeviceIsThrower = false;
            window._rb2p_pick6SentThisPossession = false; window._rb2p_userIsWaitingForOpponent = false;
            if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();
            await new Promise(r => setTimeout(r, 150));
            em.setOpponentScore(Number(em.opponentScore || 0) + n);   // an ENGINE-style write, not re-baselined
            await new Promise(r => setTimeout(r, 400));
            const hit = window._rb2p_pickSixPatCascadeActive === true;
            window._rb2p_pickSixPatCascadeActive = false; window._rb2p_pickSixThisDeviceIsThrower = false;
            return hit;
        };
        const r = { plus9: await tryJump(9), plus17: await tryJump(17), plus6: await tryJump(6) };
        window._twoPlayer.send = real; window._rb2p_pick6SentThisPossession = false;
        return r;
    });
    console.log('  T2: ' + JSON.stringify(t2));
    check('T2 +9 and +17 never enter the cascade; exactly +6 still does', t2.plus9 === false && t2.plus17 === false && t2.plus6 === true, JSON.stringify(t2));

    // ---- T3: once the quarter has been snapped, no quarter-start restore ----
    const t3 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        window._rb2p_qSnappedThisQuarter = true;              // a snap happened this quarter (set by the tracker on the snap)
        window._rb2p_quarterResumePending = true;             // a stale keep still pending
        const y0 = Number(em.engineYardLineSigned);
        await new Promise(r => setTimeout(r, 400));           // the FSM watcher runs at ~300ms
        return { pending: window._rb2p_quarterResumePending === true,
                 diag: String(window._rb2p_readDiagLog()).slice(-160), yardMoved: Math.abs(Number(em.engineYardLineSigned) - y0) > 0.5 };
    });
    console.log('  T3: ' + JSON.stringify(t3));
    check('T3 a pending quarter resume is dropped once the quarter has been played', t3.pending === false && /already been played/.test(t3.diag), JSON.stringify(t3));

    // ---- T4: the halftime flip is not refused ----
    const t4 = await def.page.evaluate((opp) => {
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_matchStartMs = Date.now() - 60000;
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        window._rb2p_turnRec = { owner: opp, at: Date.now() };          // the ledger still names the other side
        window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: true };  // and their last push claims the ball
        window._rb2p_quarterChangedToMs = Date.now();                  // ...but the quarter just changed (the Q3 law)
        window._rb2p_userIsWaitingForOpponent = false;
        const allowed = window._rb2p_userIsWaitingForOpponent === false;
        window._rb2p_userIsWaitingForOpponent = true;
        window._rb2p_quarterChangedToMs = Date.now() - 60000;
        window._rb2p_userIsWaitingForOpponent = false;
        const refusedLater = window._rb2p_userIsWaitingForOpponent === true;
        window._rb2p_userIsWaitingForOpponent = true;
        return { allowed: allowed, refusedLater: refusedLater };
    }, def.role === 'a' ? 'b' : 'a');
    console.log('  T4: ' + JSON.stringify(t4));
    check('T4 LIVE is allowed inside 8s of a quarter change, refused again after', t4.allowed === true && t4.refusedLater === true, JSON.stringify(t4));

    // ---- T5: the mirror leaves a LIVE device\'s clock alone ----
    // off is live. Push a stale clock from def and see whether off adopts it.
    const t5 = await (async () => {
        const before = await off.page.evaluate(() => { const em = RB.engineState(); em.engineMinutesLeft = 1; em.engineSecondsLeft = 23; return 83; });
        await def.page.evaluate(() => {
            const em = RB.engineState();
            em.engineMinutesLeft = 3; em.engineSecondsLeft = 0;     // a stale, higher clock
        });
        await sleep(2500);                                        // several live pushes
        const after = await off.page.evaluate(() => { const em = RB.engineState(); return Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft); });
        return { before: before, after: after, waiting: await off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true) };
    })();
    console.log('  T5: ' + JSON.stringify(t5));
    check('T5 a LIVE device never adopts the opponent\'s clock from the mirror', t5.waiting === false && t5.after <= t5.before, JSON.stringify(t5));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
