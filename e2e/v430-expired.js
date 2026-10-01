// e2e/v430-expired.js — a play that runs out the clock ends the quarter: no extra play at 0:01 for the other side
// (the owner: "one second left, interception, the clock goes down to zero, the ball is turned over and the clock goes
// back up to one second"). 53 real hand-offs in the archive did this: a play snapped at 0:01 handed the ball over
// (a turnover, a touchdown, a kickoff) and the receiver got a whole play at 0:01 in the same quarter.
//
// Why: the drive-end record is stamped 0:00 when the play ends, then held 4 s (V352b, for a possible pick-six) and
// RE-STAMPED at the send (V354) — from a parked engine that V293 floors at 0:01 (a parked engine must never see 0:00).
// So the hand-off said 0:01, and the receiver got a second the play had already used.
//
// Each case ends the sender's drive at 0:00 the way a real play does (the clock reaches 0:00, then the engine's own
// possession change in the same frame) and watches the receiver:
//   X1  Q2: the half ends — both phones reach Q3 by the halftime law, and the receiver never snaps in Q2
//   X2  Q4 with the score decided: the game ends — the stats screen on both phones, no snap at 0:01
//   X3  Q1: the quarter ends and the receiver keeps the ball into Q2 — no snap in Q1
//   X4  a hand-off with time left (0:05) is unchanged: the receiver plays in the same quarter with the clock it was sent
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 400); } return Object.assign(v || {}, { ms: null }); }
const st = page => page.evaluate(() => { try { const finEl = document.getElementById('rb-final'); if (!window.RB || !RB.engineState()) return { err: 'no engine', fin: !!(finEl && finEl.style.display === 'block') }; const s = RB.engineState(); return { q: Number(s.engineQuarter), m: Number(s.engineMinutesLeft), s: Number(s.engineSecondsLeft), wait: window._rb2p_userIsWaitingForOpponent === true, fin: (function () { const f = document.getElementById('rb-final'); return !!(f && f.style.display === 'block'); })() }; } catch (e) { return null; } }).catch(() => null);
const audit = async (code, role) => Object.values(await TP.fbGet('rooms/' + code + '/audit/' + role) || {});

// end the drive of the phone with the ball the way a play that runs out the clock does: the clock reaches 0:00 (or
// `sec`), then the engine's possession change in the same frame (the bridge's _1c1 hook builds and holds the hand-off)
async function playEndsAt(page, q, sec, score) {
    // first the quarter at its last second (a quarter change resets the clock — do it apart from the expiry); the
    // partner mirrors it within a push or two, as during a real play at 0:01
    await page.evaluate(({ q, score }) => {
        const s = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test', 3000);
        window._rb2p_lastStableQuarter = q; window._rb2p_wireQuarter = q; s.engineQuarter = q;
        s.engineMinutesLeft = 0; s.engineSecondsLeft = 1; s.engineTickAllowance = 0;   // the last second, as the partner sees it too
        if (score) { s.setUserScore(score[0]); s.setOpponentScore(score[1]); }
    }, { q, score });
    await sleep(4000);
    // then the play that runs out the clock: 0:00, and the engine's possession change in the same frame
    return page.evaluate(({ q, sec }) => {
        const s = RB.engineState(); if (!s) return 'no state';
        if (Number(s.engineQuarter) !== q) return 'quarter moved to ' + s.engineQuarter;
        s.engineMinutesLeft = 0; s.engineSecondsLeft = sec; s.engineTickAllowance = 0;
        s.enginePossessingTeamIdx = s.engineUserTeamIdx;
        s.engineDriveFsmStage = 2; s.enginePriorFsmStage = 4;                    // a drive that ended on downs/turnover
        window._rb2p_userOutcomeSendInProgress = false; window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastOpponentOutcomeApplyMs = 0;
        try { _1c1(s.rawEngineMatch, _Sc2); return true; } catch (e) { return String(e); }
    }, { q, sec });
}

async function one(label, q, sec, score, expectFn) {
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = off === g.a ? g.b : g.a;
    const t0 = await def.page.evaluate(() => Date.now());
    const r = await playEndsAt(off.page, q, sec, score);
    const res = await expectFn(off, def, g);
    if (process.env.X_DEBUG) console.log(String(await def.page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(e => 'diag err ' + e.message)).split(',').slice(-40).join('\n'));
    await sleep(3500);                                   // the audit streams upload every 1.5 s
    const snaps = (await audit(g.code, def.role)).filter(e => e.k === 'snap' && e.t >= t0);
    const sends = (await audit(g.code, off.role)).filter(e => e.k === 'send' && e.t >= t0 - 1000);
    console.log('  ' + label + ': drive end ' + r + '; sent ' + JSON.stringify(sends.map(e => e.type + ' Q' + e.q + ' clk' + e.clk)) + '; receiver snaps ' + JSON.stringify(snaps.map(e => 'Q' + e.q + ' clk' + e.clk)) + '; ' + JSON.stringify(res.detail));
    await g.cleanup();
    return { res, snaps, sends };
}

(async () => {
    console.log('=== V430 EXPIRED HAND-OFF ===');
    // ---- X1: Q2 ----
    {
        const o = await one('X1 Q2 0:00', 2, 0, [7, 3], async (off, def) => {
            const w = await until(async () => { const a = await st(off.page), b = await st(def.page); return { ok: a && b && a.q === 3 && b.q === 3, a, b }; }, 30000);
            return { ok: w.ms !== null, detail: { ms: w.ms, off: w.a, def: w.b } };
        });
        check('X1 a play that runs out the clock in Q2 ends the half: both phones in Q3, and the receiver never snapped in Q2',
              o.res.ok && !o.snaps.some(e => Number(e.q) === 2) && o.sends.some(e => Number(e.clk) === 0), JSON.stringify(o.res.detail));
    }
    // ---- X2: Q4, decided ----
    {
        const o = await one('X2 Q4 0:00 decided', 4, 0, [21, 10], async (off, def) => {
            const w = await until(async () => { const a = await st(off.page), b = await st(def.page); return { ok: a && b && a.fin && b.fin, a, b }; }, 45000, 800);
            return { ok: w.ms !== null, detail: { ms: w.ms, off: w.a, def: w.b } };
        });
        check('X2 a play that runs out the clock in Q4 (score decided) ends the game: the stats screen on both phones, no play at 0:01',
              o.res.ok && !o.snaps.some(e => Number(e.q) === 4), JSON.stringify(o.res.detail));
    }
    // ---- X3: Q1 ----
    {
        const o = await one('X3 Q1 0:00', 1, 0, null, async (off, def) => {
            const w = await until(async () => { const a = await st(off.page), b = await st(def.page); return { ok: a && b && a.q === 2 && b.q === 2 && b.wait === false && a.wait === true, a, b }; }, 30000);
            return { ok: w.ms !== null, detail: { ms: w.ms, off: w.a, def: w.b } };
        });
        check('X3 a play that runs out the clock in Q1 ends the quarter and the receiver keeps the ball into Q2 (no snap in Q1)',
              o.res.ok && !o.snaps.some(e => Number(e.q) === 1), JSON.stringify(o.res.detail));
    }
    // ---- X4: time left ----
    {
        const o = await one('X4 Q2 0:05', 2, 5, null, async (off, def) => {
            const w = await until(async () => { const b = await st(def.page); return { ok: b && b.wait === false && b.q === 2, b }; }, 20000);
            await sleep(1500); const b2 = await st(def.page);
            return { ok: w.ms !== null && b2 && b2.q === 2 && b2.m * 60 + b2.s >= 1, detail: { ms: w.ms, def: b2 } };
        });
        check('X4 a hand-off with time left is unchanged: the receiver is live in the same quarter with time on the clock',
              o.res.ok && o.sends.some(e => Number(e.clk) >= 1), JSON.stringify(o.res.detail));
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
