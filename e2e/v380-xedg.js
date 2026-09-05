// e2e/v380-xedg.js — room XEDG (KC 43, SF 0): the five laws, each replayed.
//
//   T1  a 300s deadlock fallback armed by one pick-six stands down inside
//       another pick-six's cascade (XEDG Q4 1:12)
//   T2  forceUserOffenseDrive refuses a scorer that still owes its result
//   T3  the 35s wall on the scorer RESOLVES the conversion (missed, 0) and
//       ships PAT_RESULT — the scorer goes to WAIT (XEDG Q2 0:56 — the gift)
//   T4  ...and the thrower stages that next drive FRESH (routes, arrows)
//   T5  an outcome that arrived while I was live is purged at my own
//       handoff, never applied at my next park (XEDG Q3 1:05)
//   T6  the keep-drive refuses its third firing in one quarter (the
//       "infinite audible" at the Q1->Q2 rollover)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V380 ROOM XEDG: THE FIVE LAWS ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T1: the fallback belongs to its cascade ----
    const t1 = await def.page.evaluate(() => {
        const w0 = window._rb2p_userIsWaitingForOpponent;
        window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixThisDeviceIsThrower = true;
        window._rb2p_p6Id = 'NEW';
        const foreign = window._rb2p_p6DeadlockFallback('OLD');
        const stillWaiting = window._rb2p_userIsWaitingForOpponent === w0;
        const stillCascade = window._rb2p_pickSixPatCascadeActive === true;
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_pickSixThisDeviceIsThrower = false;
        const none = window._rb2p_p6DeadlockFallback('NEW');
        return { foreign, stillWaiting, stillCascade, none, diag: String(window._rb2p_readDiagLog()).slice(-160) };
    });
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 a fallback armed for an earlier pick-six stands down inside a later cascade',
          t1.foreign === 'foreign cascade' && t1.stillWaiting && t1.stillCascade && t1.none === 'no cascade' && /P6-FALLBACK stood down/.test(t1.diag), JSON.stringify(t1));

    // ---- T2: the scorer cannot be given a drive ----
    const t2 = await off.page.evaluate(() => {
        window._rb2p_p6ScorerOwes = true; window._rb2p_pickSixThisDeviceIsThrower = false;
        const r = window._rb2p_forceUserOffenseDrive(-25);
        const diag = String(window._rb2p_readDiagLog()).slice(-160);
        window._rb2p_p6ScorerOwes = false;
        return { r, diag };
    });
    console.log('  T2: ' + JSON.stringify(t2));
    check('T2 forceUserOffenseDrive refuses a scorer that owes its result', t2.r === false && /P6 refused force-drive/.test(t2.diag), JSON.stringify(t2));

    // ---- T3: the wall resolves and ships ----
    await def.page.evaluate(() => { window.__fresh = false; });
    await off.page.evaluate(() => {
        window.__t3sent = []; const real = window._twoPlayer.send; window.__realSend = real;
        window._twoPlayer.send = o => { window.__t3sent.push(o.type); real.call(window._twoPlayer, o); };
        const em = RB.engineState();
        window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixThisDeviceIsThrower = false;
        window._rb2p_p6ScorerOwes = true;
        window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false;
        window._rb2p_patPlayStartMs = Date.now(); window._rb2p_patClobberCount = 0;
        window._rb2p_patPlaySnappedMs = 0; window._rb2p_patPlayDiedMs = 0; window._rb2p_patResolvedMs = 0;
        window._rb2p_patUserScoreAtStart = Number(em.userScore) || 0;
        window._rb2p_patOppScoreAtStart = Number(em.opponentScore) || 0;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 6; em.engineYardsToGo = 2;
        em.rawEngineMatch._6F = 48; em.engineControllerState = 2;
        window._rb2p_convAuthMs = Date.now();
        window._rb2p_patOwedSinceMs = Date.now() - 36000;          // the wall is due NOW
    });
    const t3 = await off.page.evaluate(async () => {
        const t0 = Date.now(); let at = null;
        while (Date.now() - t0 < 4000) { await new Promise(r => setTimeout(r, 100)); if (window.__t3sent.includes('PAT_RESULT')) { at = Date.now() - t0; break; } }
        await new Promise(r => setTimeout(r, 300));
        const em = RB.engineState();
        const r = { shippedAt: at, waiting: window._rb2p_userIsWaitingForOpponent === true, owes: window._rb2p_p6ScorerOwes,
                    down: em.engineDownNumber, pending: window._rb2p_patPlayPending, cascade: window._rb2p_pickSixPatCascadeActive,
                    diag: String(window._rb2p_readDiagLog()) };
        r.wall = /35s wall — resolving the conversion as MISSED/.test(r.diag); r.diag = r.diag.slice(-200);
        window._twoPlayer.send = window.__realSend;
        return r;
    });
    console.log('  T3: ' + JSON.stringify(t3));
    check('T3 the 35s wall resolves the conversion as MISSED, ships PAT_RESULT, and the scorer waits',
          t3.shippedAt != null && t3.wall && t3.waiting && t3.owes === false && t3.down !== 6 && t3.pending === false && t3.cascade === false, JSON.stringify(t3));

    // ---- T4: the thrower's next drive is fresh ----
    const t4 = await def.page.evaluate(async () => {
        const t0 = Date.now(); let liveAt = null;
        while (Date.now() - t0 < 8000) { await new Promise(r => setTimeout(r, 200)); if (window._rb2p_userIsWaitingForOpponent === false) { liveAt = Date.now() - t0; break; } }
        await new Promise(r => setTimeout(r, 800));
        const d = String(window._rb2p_readDiagLog());
        return { liveAt, fresh: /force fresh spawn/.test(d), running: window._rb2p_realDriveRunning(), tail: d.slice(-200) };
    });
    console.log('  T4: ' + JSON.stringify({ liveAt: t4.liveAt, fresh: t4.fresh, running: t4.running }));
    check('T4 the thrower receives the result and stages its drive FRESH (new play, routes reset)', t4.liveAt != null && t4.fresh && t4.running, JSON.stringify(t4));

    // ---- T5: a moot outcome is purged at my own handoff ----
    // def is live now. Plant an outcome that "arrived 20s ago" while live, then
    // end def's drive through the real path (a dead FSM -> the stuck-drive
    // handoff -> SEND) and check the purge ran and nothing applied later.
    const t5 = await def.page.evaluate(async () => {
        const em = RB.engineState();
        window._twoPlayer.pending.push({ type: 'OTHER', ts: Date.now() - 20000, _rxMs: Date.now() - 20000,
            yardLine: 10, ownSide: true, scoreUser: Number(em.opponentScore) || 0, scoreOpp: Number(em.userScore) || 0,
            quarter: em.engineQuarter, minutesLeft: 9, secondsLeft: 59, message: 'planted', __planted: true });
        window._rb2p_quarterResumePending = false; window._rb2p_lastOpponentOutcomeApplyMs = 0;
        // The diag log is a bounded ring: read everything after a marker, never by offset.
        window._rb2p_diagLog('T5-START');
        const since = () => { const s = String(window._rb2p_readDiagLog()); const i = s.lastIndexOf('T5-START'); return i < 0 ? s : s.slice(i); };
        // End the drive through the engine's own possession change — the
        // wrapped _1c1 builds the outcome and runs the real SEND site.
        let threw = null;
        try {
            const s = RB.engineState();
            s.enginePossessingTeamIdx = s.engineUserTeamIdx;     // we hold the ball, and give it up as a punt
            s.engineDriveFsmStage = 2; s.enginePriorFsmStage = 12;
            window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false;
            window._rb2p_kickoffGraceUntil = 0;                   // T4's post-result kickoff grace would swallow this
            _1c1(s.rawEngineMatch, _Sc2);
        } catch (e) { threw = String(e && e.message); }
        const t0 = Date.now(); let sentAt = null;
        while (Date.now() - t0 < 6000) { await new Promise(r => setTimeout(r, 200)); if (/SEND [A-Z_]+ Q/.test(since())) { sentAt = Date.now() - t0; break; } }
        const d = since();
        const purged = /OUTCOME purged \(OTHER, 20s old\)/.test(d);
        const stillQueued = window._twoPlayer.pending.some(o => o && o.__planted);
        return { threw, sentAt, purged, stillQueued, waiting: window._rb2p_userIsWaitingForOpponent === true, tail: d.slice(-260) };
    });
    console.log('  T5: ' + JSON.stringify(t5));
    check('T5 an outcome that arrived while live is purged at my own handoff, never queued for the next park',
          t5.sentAt != null && t5.purged && !t5.stillQueued && t5.waiting, JSON.stringify(t5));

    // ---- T6: the keep-drive refuses its third firing ----
    // XEDG's exact shape: the quarter just rolled over with the ball kept, the
    // FSM keeps landing on a dead stage (a stray kickoff button did that on
    // device), and the between-quarters resume fires every ~1.3s. Here the
    // test plays the stray button: after each keep it kills the stage again.
    // Wait for whichever phone ends up with a real drive after T5's punt.
    let kp = null;
    for (let i = 0; i < 40 && !kp; i++) {
        await sleep(300);
        for (const pg of [off, def]) {
            const live = await pg.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === false && window._rb2p_realDriveRunning());
            if (live) { kp = pg; break; }
        }
    }
    if (!kp) {   // nobody staged a drive: stage one on off, the way a handoff would
        kp = off;
        await off.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = false; window._rb2p_forceUserOffenseDrive(-20, true); });
        await sleep(800);
    }
    const t6 = await kp.page.evaluate(async () => {
        const em = RB.engineState();
        const q = Number(em.engineQuarter) || 1;
        window._rb2p_qSnappedThisQuarter = false; window._rb2p_keepQ = null; window._rb2p_keepN = 0;
        window._rb2p_quarterResumePending = true; window._rb2p_quarterChangedTo = q;
        window._rb2p_lastOpponentOutcomeApplyMs = 0; window._rb2p_userOutcomeSendInProgress = false;
        window._rb2p_preRolloverYard = Number(em.engineYardLineSigned) || -20; window._rb2p_preRolloverDown = 1; window._rb2p_preRolloverToGo = 10;
        window._rb2p_diagLog('T6-START');
        const since = () => { const s = String(window._rb2p_readDiagLog()); const i = s.lastIndexOf('T6-START'); return i < 0 ? s : s.slice(i); };
        const seen = []; let n2 = null;
        const t0 = Date.now();
        while (Date.now() - t0 < 14000) {
            em.engineDriveFsmStage = 4;                                  // the stray button's work: dead again
            await new Promise(r => setTimeout(r, 250));
            const n = window._rb2p_keepN || 0;
            if (n && seen[seen.length - 1] !== n) seen.push(n);
            if (n === 2 && n2 == null) n2 = Date.now() - t0;
            if (/QTR-KEEP LOOP — keep #3/.test(since())) break;
        }
        window._rb2p_quarterResumePending = false;
        const d = since();
        return { seen, resumes: (d.match(/QTR-KEEP resume Q/g) || []).length, loop: /QTR-KEEP LOOP — keep #3/.test(d),
                 healed: (d.match(/LOOP-GUARD healed/g) || []).length, ball: window._rb2p_realDriveRunning(), tail: d.slice(-240) };
    });
    console.log('  T6: ' + JSON.stringify(t6));
    check('T6 the keep-drive heals before it spawns and refuses its third firing in one quarter',
          t6.seen.includes(2) && t6.seen.includes(3) && t6.loop && t6.healed >= 3, JSON.stringify(t6));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
