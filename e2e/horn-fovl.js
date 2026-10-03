// e2e/horn-fovl.js — HORN-RESEARCH.md test M1: a hand-off from a REAL last down that ran out the clock, received by a
// phone that has itself handed the ball off earlier (FOVL's receiver: parked after its own send).
//
//   1. the phone with the ball (O1) fails a real 4th & 25 mid-quarter -> its turnover on downs hands the ball to O2;
//   2. O2 fails a real 4th & 25 snapped at 0:01 — the run outlives the clock, the turnover on downs is decided at 0:00
//      and handed to O1 (the engine's own path: s_set_up_play down 5 -> s_action_result(4) -> case 29 -> _1c1);
//   3. if O1 is then offered a ball in the same quarter it plays it for real (a player would: the 0:01 glitch).
// What must hold (the owner's rules), by horn:
//   M1a the horn hand-off is stamped 0:00 (V433 ships 0:01: one extra play)
//   M1b nobody snaps in the old quarter after the horn hand-off (no extra play)
//   M1c nothing bounces: no hand-off is sent in the old quarter after the horn hand-off; no "force NO-BALL", no
//       "EMPTY-FIELD ... FAILED", no rescuer (TURN-RESCUE / FIELD-CHECK) at the horn
//   M1d both phones reach the next period within 15 s with ONE offense and the right one: Q1/Q3 — O1 (the team with
//       the ball after the last down) at the turnover spot, 1st & 10, full clock; halftime — role b, the kickoff;
//       Q4 — the stats screen on both (decided) or the overtime coin flip (tied)
// Env: HORN_Q 1..4 (default 2), HORN_MODE fix | keep0 | live (default fix), HORN_SCORE tie | lead (Q4), RB_E2E_PORT.
const L = require('./horn-lib');
const fs = require('fs'), path = require('path');
const sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    const Q = Number(process.env.HORN_Q || 2), MODE = process.env.HORN_MODE || 'fix', SCORE = process.env.HORN_SCORE || 'lead';
    console.log('=== HORN M1 (FOVL state) — Q' + Q + ' horn, mode ' + MODE + (Q === 4 ? ', score ' + SCORE : '') + ' ===');
    const g = await L.TP.startTwoPlayerGame({});
    let verdict = 'ran';
    try {
        await sleep(6000);
        for (const P of [g.a, g.b]) await P.page.evaluate(L.installRecorder);
        await L.setMode([g.a.page, g.b.page], MODE);
        const o = await L.offense(g, 40000);
        if (!o.ok) { console.log('  SETUP nobody has the ball: ' + JSON.stringify({ A: o.A, B: o.B })); verdict = 'setup'; return; }
        const O1 = o.off, O2 = O1 === g.a ? g.b : g.a;
        await L.setQuarter([O1.page, O2.page], Q, 75);
        await sleep(1500);
        // 1. O1's real turnover on downs, mid-quarter
        await L.setDown(O1.page, { clk: 65, down: 4, toGo: 25 });
        await sleep(700);
        const r1 = await L.realDown(O1.page, { buttons: false });
        const got = await L.until(async () => { const a = await L.st(O1.page), b = await L.st(O2.page); return { ok: !!(a && b && a.wait && !b.wait && b.ball > 0), a, b }; }, 30000, 500);
        console.log('  pre-horn: ' + O1.role + ' ran ' + JSON.stringify(r1 && { result: r1.result, gain: r1.gainYds }) + ' on 4th & 25 -> ' + O2.role + ' has the ball: ' + (got.ok ? 'yes after ' + got.ms + ' ms' : 'NO ' + JSON.stringify({ O1: got.a, O2: got.b })));
        if (!got.ok) { verdict = 'setup'; return; }
        await sleep(2500);
        const fsm1 = await O1.page.evaluate(() => { const m = RB.engineState().rawEngineMatch; return { Vy: m._Vy, kp: m._kp, z7: m._7z }; });
        console.log('  ' + O1.role + ' (the receiver-to-be) parked at ' + JSON.stringify(fsm1) + ' (FOVL: a phone parked after its own send)');
        // V436 (QAQL 7:40 pm): the receiver's own last play was a try a moment ago — its kickoff went out, the partner
        // drove, and the partner's turnover reaches it at the horn. V434/V435 read that try as "my try crossed the horn":
        // POST-CONV fired on the RECEIVER and its forced possession change mirrored the field (b lost 32 yards). The
        // setup writes the bridge's own bookkeeping of a try (offer 3 s ago, the try snapped 1.5 s ago), nothing else.
        if (process.env.HORN_EVENT === 'staletry') {
            await O1.page.evaluate(() => { const now = Date.now(); window._rb2p_lastConvModalMs = now - 3000; window._rb2p_lastSnapDown = 6; window._rb2p_lastSnapMs = now - 1500; });
            console.log('  ' + O1.role + '\'s last play is now a try (offer 3 s ago, snapped 1.5 s ago) — as b\'s was in QAQL');
        }
        // 2. the horn: O2's real turnover on downs snapped at 0:01
        const lead = Q === 4 ? (SCORE === 'tie' ? [10, 10] : [3, 10]) : null;   // O2's view: user, opp
        await L.setDown(O2.page, { clk: 1, down: 4, toGo: 25, score: lead });
        if (lead) await O1.page.evaluate((l) => { const s = RB.engineState(); s.setUserScore(l[1]); s.setOpponentScore(l[0]); }, lead);
        await sleep(700);
        const t0 = await O2.page.evaluate(() => Date.now());
        const r2 = await L.realDown(O2.page, { buttons: false });
        console.log('  horn down: ' + O2.role + ' ran ' + JSON.stringify(r2 && { result: r2.result, gain: r2.gainYds }) + ' on 4th & 25 at 0:01');
        // M8 / M9: the receiver reloads across the horn, or its screen is off when the hand-off ships
        const EVENT = process.env.HORN_EVENT || '';
        if (EVENT === 'hidden') {
            // the screen goes off before the hand-off ships (the bridge's own signal: document.hidden — v395's method;
            // CDP's frozen lifecycle did not take effect with focus emulation on)
            const setHidden = (h) => O1.page.evaluate((h) => {
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
                document.dispatchEvent(new Event('visibilitychange'));
            }, h);
            await setHidden(true);
            await sleep(12000);
            const held = await O1.page.evaluate(() => ((window.__hz && window.__hz.diag) || []).filter(x => /OUTCOME held/.test(x[1])).map(x => x[1]));
            console.log('  M9: ' + O1.role + '\'s screen was off for 12 s while the hand-off shipped — held: ' + JSON.stringify(held.slice(0, 2)));
            await setHidden(false);
            if (!held.length) { console.log('  SETUP the hand-off was not held (the screen-off fault did not apply) — inconclusive'); verdict = 'setup'; }
        } else if (EVENT === 'reload' || EVENT === 'reloadhold') {
            if (EVENT === 'reload') {
                const ap = await L.until(async () => { const a = (await L.audit(g.code, O1.role)).filter(e => e.k === 'apply' && e.t >= t0); return { ok: a.length > 0 }; }, 15000, 300);
                console.log('  M8: ' + O1.role + ' applied the hand-off: ' + (ap.ok ? 'yes' : 'NO') + ' — reloading it now');
            } else { await sleep(1500); console.log('  M8: reloading ' + O1.role + ' inside the sender\'s 4 s hold'); }
            await O1.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('  reload: ' + e.message));
            const back = await L.until(async () => { const ok = await O1.page.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => false); return { ok }; }, 45000, 1000);
            console.log('  M8: ' + O1.role + ' back in the match after the reload: ' + (back.ok ? 'yes, ' + back.ms + ' ms' : 'NO'));
            await O1.page.evaluate(L.installRecorder).catch(() => {});
            await O1.page.evaluate(m => { window._rb2p_hornMode = m; }, MODE).catch(() => {});
        }
        // 3. 30 s: a receiver offered a ball in the old quarter plays it (as a player would)
        let extra = null; const tEnd = Date.now() + 30000;
        while (Date.now() < tEnd) {
            const s1 = await L.st(O1.page);
            if (!extra && s1 && !s1.wait && s1.ball > 0 && s1.q === Q && s1.clk > 0) { extra = await L.realDown(O1.page, { buttons: false }); console.log('  ' + O1.role + ' was offered a down in Q' + Q + ' (clk ' + s1.clk + ') and played it: ' + JSON.stringify(extra && { result: extra.result, gain: extra.gainYds })); }
            await sleep(700);
        }
        const A1 = await L.st(O1.page), A2 = await L.st(O2.page);
        const au1 = (await L.audit(g.code, O1.role)).filter(e => e.t >= t0 - 1500), au2 = (await L.audit(g.code, O2.role)).filter(e => e.t >= t0 - 1500);
        const rec1 = await L.dumpRecorder(O1.page, t0 - 1500), rec2 = await L.dumpRecorder(O2.page, t0 - 1500);
        const all = au1.map(e => Object.assign({ who: O1.role }, e)).concat(au2.map(e => Object.assign({ who: O2.role }, e))).sort((a, b) => a.t - b.t);
        const driveEnd = rec2.diag.find(x => /^SEND \w+ Q\d/.test(x[1]));
        // the sender's NEXT send after its drive end — whatever quarter it carries (a re-stamp into Q+1 must fail M1a)
        const hornSend = driveEnd ? au2.find(e => e.k === 'send' && e.t >= driveEnd[0] - 50) : au2.find(e => e.k === 'send' && Number(e.q) === Q);
        console.log('  O2 drive end: ' + (driveEnd ? driveEnd[1] : 'none') + ' | sent: ' + (hornSend ? hornSend.type + ' Q' + hornSend.q + ' clk' + hornSend.clk : 'nothing'));
        if (!hornSend || !driveEnd || !/ 0:00 \(pre/.test(driveEnd[1])) { console.log('  SETUP the horn down did not end in a hand-off decided at 0:00 — inconclusive'); verdict = 'setup'; }
        else {
            const tH = hornSend.t;
            const oldQSnaps = all.filter(e => e.k === 'snap' && Number(e.q) === Q && e.t > tH);
            const oldQSends = all.filter(e => e.k === 'send' && Number(e.q) === Q && e.t > tH + 100);
            const badDiag = rec1.diag.concat(rec2.diag).filter(x => /force NO-BALL|EMPTY-FIELD.*FAILED|TURN-RESCUE ->|FIELD-CHECK.*(restore|force)|SEND PUNT Q\d 0:00/.test(x[1]));
            const qs = all.filter(e => e.k === 'q' && e.t > tH).map(e => e.who + ' Q' + e.from + '->' + e.to + ' @' + ((e.t - tH) / 1000).toFixed(1) + 's');
            console.log('  after: ' + O1.role + ' ' + JSON.stringify(A1) + '\n         ' + O2.role + ' ' + JSON.stringify(A2));
            console.log('  quarter changes: ' + JSON.stringify(qs) + ' | old-quarter snaps ' + oldQSnaps.length + ', old-quarter sends ' + JSON.stringify(oldQSends.map(e => e.who + ' ' + e.type + ' clk' + e.clk)));
            if (badDiag.length) console.log('  rescuer / bounce lines: ' + JSON.stringify(badDiag.slice(0, 8).map(x => x[1])));
            check('M1a the horn hand-off ships Q' + Q + ' 0:00', Number(hornSend.clk) === 0 && Number(hornSend.q) === Q, hornSend.type + ' Q' + hornSend.q + ' clk' + hornSend.clk);
            check('M1b nobody snaps in Q' + Q + ' after the horn hand-off (no extra play)', oldQSnaps.length === 0, JSON.stringify(oldQSnaps.map(e => e.who + ' clk' + e.clk)));
            check('M1c nothing bounces and no rescuer acts at the horn', oldQSends.length === 0 && badDiag.length === 0, JSON.stringify({ sends: oldQSends.map(e => e.who + ' ' + e.type), lines: badDiag.length }));
            let right = false, why = '';
            if (Q === 4) {
                if (SCORE === 'tie') { right = !!(A1 && A2 && A1.q >= 5 && A2.q >= 5 && (A1.wait !== A2.wait) && !A1.over && !A2.over); why = 'overtime: one offense in Q5'; }
                else { right = !!(A1 && A2 && (A1.over || A1.final) && (A2.over || A2.final)); why = 'the final on both'; }
            } else if (Q === 2) {
                const B = O1.role === 'b' ? A1 : A2, A = O1.role === 'a' ? A1 : A2;
                right = !!(A && B && A.q === 3 && B.q === 3 && A.wait === true && B.wait === false && B.ball > 0 && B.clk >= 60); why = 'Q3, b has the kickoff';
            } else {
                right = !!(A1 && A2 && A1.q === Q + 1 && A2.q === Q + 1 && A1.wait === false && A2.wait === true && A1.d === 1 && A1.clk >= 60); why = 'Q' + (Q + 1) + ', ' + O1.role + ' keeps the ball, 1st & 10, full clock';
            }
            check('M1d the next period starts by rule (' + why + ')', right, JSON.stringify({ [O1.role]: A1, [O2.role]: A2 }));
            if (process.env.HORN_EVENT === 'staletry') {
                const pc = rec1.diag.filter(x => x[0] >= t0 && /POST-CONV the try crossed the horn/.test(x[1])).map(x => x[1]);
                const hy = Number(hornSend.y), ay = A1 ? Number(A1.y) : NaN;
                check('M1e a try that is NOT the last play before the horn does not hand the ball away: no POST-CONV on ' + O1.role + ', its ball at the hand-off spot (' + hy + '), not mirrored',
                      pc.length === 0 && isFinite(ay) && Math.sign(ay) === Math.sign(hy) && Math.abs(ay - hy) <= 3, JSON.stringify({ postConv: pc, handoffY: hy, ballY: ay }));
            }
        }
        const out = path.join(__dirname, '..', '..', 'research', 'probe-out', 'M1-Q' + Q + '-' + MODE + (Q === 4 ? '-' + SCORE : '') + (process.env.HORN_EVENT ? '-' + process.env.HORN_EVENT : '') + '-' + g.code + '.json');
        try { fs.mkdirSync(path.dirname(out), { recursive: true }); } catch (eM) {}
        fs.writeFileSync(out, JSON.stringify({ meta: { Q, MODE, SCORE, room: g.code, O1: O1.role, O2: O2.role, r1: r1 && r1.result, r2: r2 && { result: r2.result, gain: r2.gainYds }, extra: extra && extra.result, fsm1 }, audit: all, rec1, rec2 }, null, 1));
        console.log('  wrote ' + out);
    } finally {
        await g.cleanup();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (verdict === 'setup' ? ' (SETUP INCONCLUSIVE)' : '') + ' ===');
        process.exit(verdict === 'setup' ? 3 : (fail ? 1 : 0));
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
