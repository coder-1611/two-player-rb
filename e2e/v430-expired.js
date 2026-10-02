// e2e/v430-expired.js — a play that runs out the clock ends the quarter: no extra play at 0:01 for the other side
// (the owner: "one second left, interception, the clock goes down to zero, the ball is turned over and the clock goes
// back up to one second"). 53 real hand-offs in the archive did this: a play snapped at 0:01 handed the ball over
// (a turnover, a touchdown, a kickoff) and the receiver got a whole play at 0:01 in the same quarter.
//
// Why: the drive-end record is stamped 0:00 when the play ends, then held 4 s (V352b, for a possible pick-six) and
// RE-STAMPED at the send (V354) — from a parked engine that V293 floors at 0:01 (a parked engine must never see 0:00).
// So the hand-off said 0:01, and the receiver got a second the play had already used.
//
// V432 REVERTED "keep 0:00" (FREEZE-LEDGER.md V432): at the halftime horn the receiver of a 0:00 hand-off could not
// stage a drive and its engine's halftime turnover went back as another 0:00 hand-off — a ping-pong of empty
// possessions in 3 of 3 real games (FOVL and ONFE: both players quit). X1–X3 asserted the V430 rule (no down at 0:01);
// they now assert the restored V429 rule, which the archive shows ending the half (117 of 123 Q2-horn hand-offs, no bounce): the
// hand-off carries 0:01, the receiver gets its one down, the sender waits, and nothing bounces back unplayed. The
// owner's 0:01 glitch is open again (tools/freeze-watch/OPEN.md #4). e2e/v432-half-horn.js plays that down for real.
//
// Each case ends the sender's drive at 0:00 the way a real play does (the clock reaches 0:00, then the engine's own
// possession change in the same frame) and watches the receiver:
//   X1  Q2: the receiver gets its down at 0:01 (V432) — one offense, no hand-off back without a snap
//   X2  Q4 with the score decided: the same (V432)
//   X3  Q1: the same (V432)
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
    // ---- X1–X3 (V432): the receiver gets its one down at 0:01, the sender waits, nothing bounces back unplayed ----
    const oneDown = (q) => async (off, def) => {
        const w = await until(async () => { const a = await st(off.page), b = await st(def.page); return { ok: !!(a && b && b.q === q && b.wait === false && b.m * 60 + b.s >= 1 && a.wait === true), a, b }; }, 25000);
        await sleep(6000);                               // a bounce would come within the 4 s hold
        const a2 = await st(off.page), b2 = await st(def.page);
        return { ok: w.ms !== null && !!(a2 && b2 && a2.wait === true && b2.wait === false && b2.q === q), detail: { ms: w.ms, off: a2, def: b2 } };
    };
    const noBounce = async (code, role, t) => (await audit(code, role)).filter(e => e.k === 'send' && e.t >= t).length === 0;
    for (const [label, q, score] of [['X1 Q2 0:00', 2, [7, 3]], ['X2 Q4 0:00 decided', 4, [21, 10]], ['X3 Q1 0:00', 1, null]]) {
        let still = null;
        const o = await one(label, q, 0, score, async (off, def, g) => { const t = await def.page.evaluate(() => Date.now()); const res = await oneDown(q)(off, def); still = await noBounce(g.code, def.role, t - 8000); return res; });
        check(label.slice(0, 2) + ' a play that runs out the clock in Q' + q + ': the hand-off carries 0:01 and the receiver has its one down, the sender waits, nothing bounced back (V432 revert)',
              o.res.ok && o.sends.some(e => Number(e.clk) >= 1) && !o.sends.some(e => Number(e.q) === q && Number(e.clk) === 0) && still === true, JSON.stringify({ detail: o.res.detail, sends: o.sends.map(e => e.type + ' Q' + e.q + ' clk' + e.clk), noBounce: still }));
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
