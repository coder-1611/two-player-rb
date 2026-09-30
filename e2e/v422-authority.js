// e2e/v422-authority.js — NEVER-FREEZE Phase 2: the recovery authority, acting from the flow records.
//
// V425: in real games (2026-09-29/30) the authority's park was wrong 8 times of 8, its apply 3 of 4 (stale
// hand-offs), the force-drive guard 4 of 4 — the chain is not reliable at the halftime/OT boundaries and around
// reloads. Restage, park and the guard are SHADOW now (they say what they would do); APPLY acts only for a hand-off
// that is provably new and of this half; the older rescuers decide again. A1/A3/A6 are rewritten to that.
//
//   A1  the force-drive guard: the parked phone (the chain gives the ball to the other one) cannot stage a
//       drive of its own; the phone with the ball can
//   A2  a random draw is made once per possession start: the kickoff return spot is the same on every call
//   A3  both phones parked and the ball is A's: the monitor says "parked, the ball is mine" (must act, can't),
//       then A comes back on at its last staged spot WITH its down and distance (3rd & 4), within 10s;
//       the other phone stays parked; audited 'recover restage'
//   A4  both phones live and the ball is A's: B parks within 10s ('recover park'); A stays live
//   A5  a hand-off lost on the receiver (consumed but never queued — F23's shape): the authority applies
//       the server's copy over REST and the receiver comes on with the ball
//   A6  the partner stopped writing (hidden / its REST dead): its FACTS still decide — the phone with the
//       ball, parked, is restored anyway (the v2 review #3: presence never blocks the must-act phone)
//   A6b a partner with no TRUSTED record (an older build): the authority stands down and the guard is off
//   A9  a hand-off whose drive ended in the first half, arriving after this phone's halftime law, is moot:
//       its score is merged, it is never staged (the v2 review #1)
//   A7  the Q3 law retries a failed staging (F28) at the same stored spot, and B ends up on offense
//   W1  a NORMAL touchdown's try stuck past the 35s wall is MISSED and the scorer kicks off — never 1st & 10
//       at the 2 (the v2 review #16: rooms GVCG, MHUY, XEDG)
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const st = page => page.evaluate(() => {
    const em = RB.engineState() || {};
    return { wait: window._rb2p_userIsWaitingForOpponent === true, y: Number(em.engineYardLineSigned), d: Number(em.engineDownNumber), tg: Number(em.engineYardsToGo),
             q: Number(em.engineQuarter), rec: Object.assign({}, window._rb2p_recoverStats || {}) };
});
const verdict = page => page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why, fresh: v.fresh, apply: v.apply || null, split: v.epochSplit }; });
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }

(async () => {
    console.log('=== V422 RECOVERY AUTHORITY ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
    // both flow records fresh and on one game (B adopts A's game id)
    const ready = await until(async () => { const va = await verdict(A.page), vb = await verdict(B.page); return { ok: va.fresh && vb.fresh && va.who === 'a' && vb.who === 'a', va, vb }; }, 40000, 1000);
    check('setup: both phones read fresh flow records and agree the ball is A\'s', ready.ok, JSON.stringify(ready));

    // ---- A1: the guard (V425: shadow) ----
    const a1b = await B.page.evaluate(() => {
        const lines = []; const realDL = window._rb2p_diagLog; window._rb2p_diagLog = function (m) { lines.push(String(m)); return realDL.apply(this, arguments); };
        window._rb2p_flowRefusalLogMs = 0;
        const guard = window._rb2p_flowStageAllowed();
        const r = window._rb2p_forceUserOffenseDrive(-20);
        window._rb2p_diagLog = realDL;
        window._rb2p_userIsWaitingForOpponent = true;          // B back to its seat for the rest of the test
        return { guard, r, said: lines.some(l => /FLOW \(shadow\) would refuse force-drive/.test(l)) };
    });
    const a1a = await A.page.evaluate(() => { const em = RB.engineState(); return window._rb2p_forceUserOffenseDrive(Number(em.engineYardLineSigned), false); });
    check('A1 (V425) the guard is shadow: the chain gives the ball to A, B\'s drive is not refused, the guard says it would have; A\'s is staged',
          a1b.guard !== true && a1b.r !== false && a1b.said && a1a === true, JSON.stringify({ a1b, a1a }));
    await sleep(3000);

    // ---- A2: one draw per possession start ----
    const a2 = await A.page.evaluate(() => { const y1 = window._rb2p_kickoffReturnYard(), y2 = window._rb2p_kickoffReturnYard(), y3 = window._rb2p_kickoffReturnYard(); return { y1, y2, y3, draw: window._rb2p_flowState().me.draw }; });
    check('A2 the kickoff return spot is drawn once per possession start and reused (and kept in the flow record)',
          a2.y1 === a2.y2 && a2.y2 === a2.y3 && a2.y1 <= -10 && a2.y1 >= -25 && a2.draw && a2.draw.y === a2.y1, JSON.stringify(a2));

    // ---- A3: both parked, the ball is A's ----
    await A.page.evaluate(() => { window._rb2p_forceUserOffenseDrive(-12, false, { down: 3, toGo: 4 }); });
    const spot = await A.page.evaluate(() => window._rb2p_flowSpot());
    const rec0 = (await st(A.page)).rec.restage || 0;
    const shadowA = []; A.page.on('console', m => { const t = m.text(); if (/RECOVER \(shadow\)|TURN-RESCUE|field/.test(t)) shadowA.push(t.slice(0, 120)); });
    await A.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });
    const mon = await until(async () => { const m = await A.page.evaluate(() => window._rb2p_canActState()); return { ok: m.must === true && m.can === false && m.why === 'both parked', m }; }, 12000, 500);
    const a3 = await until(async () => { const s = await st(A.page); return { ok: !s.wait, s }; }, 25000, 500);
    const b3 = await st(B.page);
    check('A3a (V425) both phones parked: the monitor says "both parked" (a fact, whoever the chain names)', mon.ms !== null, JSON.stringify(mon));
    check('A3 (V425) both parked with the ball A\'s: the authority only says it would restage; the older rescuers bring A back on at its last spot WITH its down and distance, within 25s; B stays parked',
          spot && spot.d === 3 && Math.abs(spot.tg - 4) < 0.01 && a3.ms !== null && Math.abs(a3.s.y - (-12)) < 0.6 && a3.s.d === 3 && Math.abs(a3.s.tg - 4) < 0.6 && b3.wait === true &&
          ((await st(A.page)).rec.restage || 0) === rec0, JSON.stringify({ spot, a3, b3, shadowA: shadowA.slice(0, 6) }));

    // ---- A4: both live, the ball is A's ----
    const pk0 = (await st(B.page)).rec.park || 0;
    await B.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = false; });
    // either the authority (2s) or TURN-HEAL — which the chain now lets act when it AGREES the ball is A's — parks B
    const a4 = await until(async () => { const s = await st(B.page); return { ok: s.wait, s }; }, 12000, 250);
    const a4a = await st(A.page);
    const a4by = ((await st(B.page)).rec.park || 0) > pk0 ? 'the recovery authority' : 'TURN-HEAL (agreeing with the chain)';
    check('A4 both live with the ball A\'s: B parks within 10s (' + a4by + '); A stays live', a4.ms !== null && a4.ms <= 10000 && a4a.wait === false, JSON.stringify({ a4, a4a }));

    // ---- A5: a hand-off lost on the receiver ----
    await B.page.evaluate(() => {
        window.__dropped = []; window.__realRecv = window._twoPlayer.receive;
        window._twoPlayer.receive = function (o) { window.__dropped.push(o && o.ts); };   // consumed, never queued
    });
    await D.forceDriveEnd(A.page, 'PUNT');
    const lost = await until(async () => { const d = await B.page.evaluate(() => window.__dropped.slice()); return { ok: d.length > 0, d }; }, 20000, 500);
    await B.page.evaluate(() => { window._twoPlayer.receive = window.__realRecv; });
    const sentTs = await A.page.evaluate(() => { const s = window._rb2p_flowState().me.sent; return s && s.ts; });
    const ap0 = (await st(B.page)).rec.apply || 0;
    // V425: the authority's APPLY (4s) or a rescuer's look at the server (TURN-RESCUE 3s in) takes the real punt —
    // either way it is the hand-off itself that is staged, never a guessed drive
    const a5 = await until(async () => {
        const s = await st(B.page); const staged = await B.page.evaluate(() => window._rb2p_flowState().me.staged);
        return { ok: !s.wait && String(staged) === String(sentTs), s, staged };
    }, 20000, 500);
    const a5v = await verdict(A.page);
    check('A5 a hand-off consumed but lost on the receiver is applied from the server\'s copy (REST) — the authority\'s apply or the rescue\'s look, never a guess; the receiver comes on with the ball',
          lost.ok && a5.ms !== null && a5v.who === 'b', JSON.stringify({ lost: lost.d, sentTs, a5, a5v }));

    // ---- A6: the partner stops writing; its facts still decide ----
    await A.page.evaluate(() => { window.__realPutA = window._rb2p_fbRestPut; window._rb2p_fbRestPut = (p, b) => (/\/flow\//.test(p) ? Promise.resolve(false) : window.__realPutA(p, b)); });
    const stale = await until(async () => { const v = await B.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who, facts: v.facts }; }); return { ok: !v.fresh && v.facts && v.who === 'b', v }; }, 30000, 1000);
    const rs0 = (await st(B.page)).rec.restage || 0;
    await B.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });
    const a6 = await until(async () => { const s = await st(B.page); return { ok: !s.wait, s }; }, 25000, 500);
    await A.page.evaluate(() => { window._rb2p_fbRestPut = window.__realPutA; });
    check('A6 (V425) the partner stopped writing its record: parked B (whose ball it is) is back on within 25s by the older rescuers — the authority does not restage',
          stale.ok && a6.ms !== null && ((await st(B.page)).rec.restage || 0) === rs0, JSON.stringify({ stale, a6 }));

    // ---- A6b: an untrusted partner record (an older build: no chain from the game's start) ----
    await A.page.evaluate(() => { window.__realPutA2 = window._rb2p_fbRestPut; window._rb2p_fbRestPut = (p, b) => (/\/flow\//.test(p) ? window.__realPutA2(p, Object.assign({}, b, { trust: false })) : window.__realPutA2(p, b)); });
    const a6b = await until(async () => { const r = await B.page.evaluate(() => ({ tick: window._rb2p_recoverTick(), guard: window._rb2p_flowStageAllowed(), why: window._rb2p_flowVerdict().why })); return { ok: /not born at this game/.test(r.tick) && r.guard === true, r }; }, 25000, 1000);
    await A.page.evaluate(() => { window._rb2p_fbRestPut = window.__realPutA2; });
    await until(async () => { const v = await verdict(B.page); return { ok: v.who === 'b', v }; }, 20000, 1000);
    check('A6b with no trusted partner record (an older build) the authority stands down and the guard is off', a6b.ms !== null, JSON.stringify(a6b));

    // ---- A9: a first-half hand-off arriving after this phone's halftime law is moot ----
    const a9pre = await A.page.evaluate(() => { window._rb2p_flowNote('ep', { id: 'H', receiver: 'b' }); const em = RB.engineState(); return { staged: window._rb2p_flowState().me.staged, so: Number(em.opponentScore), wait: window._rb2p_userIsWaitingForOpponent === true }; });
    await D.forceDriveEnd(B.page, 'PUNT');
    const bSent = await until(async () => { const s = await B.page.evaluate(() => window._rb2p_flowState().me.sent); return { ok: !!(s && s.type !== 'LAW' && s.ep === 'K0'), s }; }, 20000, 500);
    await sleep(3000);
    const a9 = await A.page.evaluate(() => ({ staged: window._rb2p_flowState().me.staged, wait: window._rb2p_userIsWaitingForOpponent === true, pending: (window._twoPlayer.pending || []).length }));
    check('A9 a punt whose drive ended in the first half, arriving after this phone\'s halftime law, is moot: never staged, the phone stays parked',
          bSent.ok && a9.wait === true && String(a9.staged) === String(a9pre.staged) && a9.pending === 0, JSON.stringify({ a9pre, bSent, a9 }));

    // ---- A7: the Q3 law retries a failed staging at the same spot ----
    const a7 = await B.page.evaluate(async () => {
        const realF = window._rb2p_forceUserOffenseDrive; const calls = [];
        window._rb2p_forceUserOffenseDrive = function (y, fresh, dd) { calls.push(y); if (calls.length <= 2) return false; return realF(y, fresh, dd); };
        const em = RB.engineState();
        window._rb2p_lastStableQuarter = 2; window._rb2p_q3LawApplied = false; window._rb2p_userIsWaitingForOpponent = true;
        if (window._rb2p_clockLicence) window._rb2p_clockLicence('test: halftime', 3000);
        em.engineQuarter = 3;
        const t0 = Date.now();
        while (Date.now() - t0 < 6000 && !(calls.length >= 3 && window._rb2p_userIsWaitingForOpponent === false)) await new Promise(r => setTimeout(r, 100));
        window._rb2p_forceUserOffenseDrive = realF;
        await new Promise(r => setTimeout(r, 600));
        return { calls, live: window._rb2p_userIsWaitingForOpponent === false, y: Number(em.engineYardLineSigned), ep: window._rb2p_flowState().me.ep, applied: window._rb2p_q3LawApplied === true };
    });
    check('A7 the Q3 law retries a failed staging (F28) at the same stored spot and B ends up on offense',
          a7.calls.length >= 3 && a7.calls.every(y => y === a7.calls[0]) && a7.live && Math.abs(a7.y - a7.calls[0]) < 0.6 && a7.ep === 'H' && a7.applied, JSON.stringify(a7));

    // no recovery may have moved a score or wound a clock back
    const bad = [];
    for (const P of [A, B]) await P.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await sleep(4000);
    const aud = [ ...Object.values((await TP.fbGet('rooms/' + g.code + '/audit/a')) || {}), ...Object.values((await TP.fbGet('rooms/' + g.code + '/audit/b')) || {}) ];
    const recs = aud.filter(e => e && e.k === 'guard' && e.what === 'recover');
    check('A8 every recovery is audited (guard recover, with before/after) and none moved the score or the clock',
          // V425: only APPLY acts (restage and park are shadow) — at least the A5 apply, or the rescue's server look
          (recs.length >= 1 || aud.some(e => e && e.k === 'guard' && e.what === 'rescue-server-apply')) && recs.every(e => e.before && e.after && !e.bad) && bad.length === 0,
          JSON.stringify({ n: recs.length, actions: recs.map(e => e.action), bad: recs.filter(e => e.bad).map(e => e.bad).concat(bad) }));

    await g.cleanup();

    // ---- W1 (a clean game): the 35s wall on a normal touchdown's try: MISSED, then the kickoff ----
    const g2 = await TP.startTwoPlayerGame({});
    const A2 = g2.a.role === 'a' ? g2.a : g2.b, B2 = A2 === g2.a ? g2.b : g2.a;
    await until(async () => { const v = await verdict(A2.page); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);
    const w1pre = await A2.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_pickSixThisDeviceIsThrower = false; window._rb2p_patPlayPending = false;
        window._rb2p_p6ScorerOwes = false; window._rb2p_patDutyMine = null; window._rb2p_patPlayResolved = false;
        em.engineYardLineSigned = 48; em.engineDownNumber = 6; em.engineYardsToGo = 2;
        window._rb2p_lastConvModalMs = Date.now() - 100000; window._rb2p_quarterChangedToMs = Date.now() - 200000;   // offered long ago, no horn since
        window._rb2p_patOwedSinceMs = Date.now() - 40000;                                                            // stuck 40s
        const su = Number(em.userScore);
        return { su, owed: window._rb2p_patOwed() };
    });
    const w1 = await until(async () => { const a = await st(A2.page), b = await st(B2.page); return { ok: a.wait === true && b.wait === false, a, b }; }, 20000, 500);
    const w1a = await A2.page.evaluate(() => ({ su: Number(RB.engineState().userScore), sent: window._rb2p_flowState().me.sent }));
    check('W1 a normal touchdown\'s try stuck past the 35s wall is MISSED (no points) and the scorer kicks off: the other phone gets the ball, the scorer never gets a drive at the 2',
          w1pre.owed === '' && w1.ms !== null && w1a.su === w1pre.su && w1a.sent && w1a.sent.type === 'TD', JSON.stringify({ w1pre, w1, w1a }));
    await g2.cleanup();

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
