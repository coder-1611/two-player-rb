// e2e/v424-freezes.js — the freezes of 2026-09-29 that were the game's own (DPWZ, UVXN), one check each.
//
//   D1  DPWZ  a hand-off applied while a stale "they are live" is in hand (a reconnect delivers the partner's
//             minutes-old live push as new): the phone goes live at once. V423 refused it — the gate read the
//             stamp of the PREVIOUS apply — and both phones waited 15s until TURN-RESCUE.
//   D2  DPWZ  with the flow chain settled and naming this phone, the same stale presence does not refuse a
//             LIVE write (the recovery authority's restage, any rescuer)
//   U1  UVXN  a pick-six thrown at the end of Q2 by B (the second-half receiver): when B's clock rolls to Q3
//             while A is still playing the conversion, B's halftime law declares the second half but WAITS —
//             then A's conversion answer is merged (never staged) and B takes the kickoff. V423 gave B the ball
//             at once: both phones had it for 4-9s.
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 300); } return Object.assign(v || {}, { ms: null }); }
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
// the reconnect's stale copies: the turn record names the partner and its live push says it has the ball, "fresh"
const staleOn = (page, other) => page.evaluate(other => {
    window.__staleIv = setInterval(() => {
        window._rb2p_turnRec = { owner: other, at: Date.now(), why: 'stale' };
        window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: true, yardLine: 0, down: 1 };
        window._rb2p_matchStartMs = Date.now() - 600000; window._rb2p_quarterChangedToMs = 0;   // mid-game (DPWZ: Q2, 10 min in)
    }, 50);
}, other);
const staleOff = page => page.evaluate(() => { clearInterval(window.__staleIv); });

(async () => {
    console.log('=== V424 FREEZES (DPWZ, UVXN) ===');
    // ---- D1 / D2 ----
    {
        const g = await TP.startTwoPlayerGame({});
        await sleep(6000);
        const aWait = await waiting(g.a.page);
        const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;
        await until(async () => { const v = await def.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === off.role, v }; }, 40000, 1000);
        const cons = []; def.page.on('console', m => { const t = m.text(); if (/POSS-REFUSED|POSS gate|POSS ->/.test(t)) cons.push(t.slice(0, 140)); });
        await def.page.evaluate(() => { window._rb2p_lastOpponentOutcomeApplyMs = Date.now() - 60000; });
        await staleOn(def.page, off.role);
        await D.forceDriveEnd(off.page, 'PUNT');
        const live = await until(async () => ({ ok: (await waiting(def.page)) === false }), 6000, 200);
        check('D1 a hand-off applied beside a stale "they are live": the phone goes live at once (no refusal)',
              live.ms !== null && live.ms < 5000 && !cons.some(t => /POSS-REFUSED/.test(t)), JSON.stringify({ ms: live.ms, cons: cons.slice(0, 4) }));
        // D2: parked again with the chain naming this phone; the stale presence stays in hand
        await sleep(4000);
        const d2 = await def.page.evaluate(async (other) => {
            window._rb2p_userIsWaitingForOpponent = true;
            await new Promise(r => setTimeout(r, 300));
            const v = window._rb2p_flowVerdict();
            // the stale presence, set in the same instant as the write (the socket's real turn record can land between ticks)
            window._rb2p_turnRec = { owner: other, at: Date.now(), why: 'stale' };
            window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: true, yardLine: 0, down: 1 };
            window._rb2p_matchStartMs = Date.now() - 600000; window._rb2p_quarterChangedToMs = 0;
            window._rb2p_lastOpponentOutcomeApplyMs = Date.now() - 60000;
            window._rb2p_userIsWaitingForOpponent = false;             // any LIVE writer (the authority's restage)
            return { who: v.who, me: v.me, engaged: window._rb2p_flowEngaged(v), live: window._rb2p_userIsWaitingForOpponent === false };
        }, off.role);
        await staleOff(def.page);
        check('D2 the chain settled and naming this phone: a stale "they are live" does not refuse its LIVE write',
              d2.who === d2.me && d2.engaged === true && d2.live === true && cons.some(t => /POSS gate: the chain names me/.test(t)), JSON.stringify({ d2, cons: cons.slice(-3) }));
        await g.cleanup();
    }

    // ---- U1 ----
    {
        const g = await TP.startTwoPlayerGame({});
        await sleep(6000);
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
        // B has the ball late in Q2 (a hand-off from A), as in UVXN
        await until(async () => { const v = await A.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);
        await D.forceDriveEnd(A.page, 'PUNT');
        await until(async () => ({ ok: (await waiting(B.page)) === false }), 20000, 300);
        for (const s of [A, B]) await s.page.evaluate(() => { const em = RB.engineState(); window._rb2p_clockLicence && window._rb2p_clockLicence('test'); em.engineQuarter = 2; window._rb2p_lastStableQuarter = 2; window._rb2p_wireQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 5; });
        await sleep(2500);
        const cons = []; B.page.on('console', m => { const t = m.text(); if (/Q3-LAW|moot|POSS ->/.test(t)) cons.push(t.slice(0, 140)); });
        // B throws a pick-six at 0:05 and the return runs its clock out: B is the thrower, parked, its engine rolls to Q3
        await B.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_pickSixThisDeviceIsThrower = true; window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixPatCascadeRaisedMs = Date.now();
            window._rb2p_userIsWaitingForOpponent = true;
            em.enginePossessingTeamIdx = em.engineOpponentTeamIdx;   // the interception gave the ball to A
            window._rb2p_declareTurnOwner('OPP', 'pick6');            // as the thrower does ("TURN-> a (pick6)")
            window._rb2p_clockLicence && window._rb2p_clockLicence('test');
            em.engineQuarter = 3; em.engineMinutesLeft = 3; em.engineSecondsLeft = 0;
        });
        // A is playing its conversion (Q2) — its own halftime law waits for it (V294) — no answer for 6s
        // (the scorer's state after the PICK6 apply: the cascade, the sticky PAT flag, the ball on the 2 at down 6)
        await A.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_pickSixPatCascadeActive = true; window._rb2p_pickSixPatCascadeRaisedMs = Date.now(); window._rb2p_pickSixThisDeviceIsThrower = false;
            window._rb2p_patPlayPending = true; window._rb2p_patPlayResolved = false; window._rb2p_p6ScorerOwes = true;
            em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 6; em.engineYardsToGo = 2;
        });
        await sleep(6000);
        const during = await B.page.evaluate(() => ({ wait: window._rb2p_userIsWaitingForOpponent === true, ep: window._rb2p_flowState().me.ep, applied: window._rb2p_q3LawApplied === true }));
        // A's conversion is over: its answer (a PAT_RESULT stamped in the first half)
        const aEp = await A.page.evaluate(() => window._rb2p_flowState().me.ep);
        await A.page.evaluate(() => {
            const em = RB.engineState();
            em.setUserScore(Number(em.userScore) + 2); em.engineDownNumber = 1;   // the try is made
            window._rb2p_shipSyntheticPatResult('test');                          // the scorer's own answer path
        });
        const after = await until(async () => { const v = await B.page.evaluate(() => ({ wait: window._rb2p_userIsWaitingForOpponent === true, applied: window._rb2p_q3LawApplied === true, threw: window._rb2p_pickSixThisDeviceIsThrower === true })); return { ok: !v.wait && v.applied && !v.threw, v }; }, 12000, 300);
        check('U1 the thrower rolls to Q3 during the partner\'s conversion: its halftime law declares the half and waits; the answer is merged and then it takes the kickoff',
              during.wait === true && during.ep === 'H' && during.applied === false && after.ms !== null && cons.some(t => /Q3-LAW waits/.test(t)) && cons.some(t => /moot \(PAT_RESULT/.test(t)),
              JSON.stringify({ during, aEp, after: after.v, ms: after.ms, cons: cons.slice(0, 6) }));
        await g.cleanup();
    }

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
