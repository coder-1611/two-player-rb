// e2e/horn-last-down.js — HORN-RESEARCH.md tests M2–M7: the last down of a quarter, played for real, by kind:
//   run   (M2, a guard)  a normal down that runs out the clock, no possession change — the offense keeps the ball
//   int   (M3)           a pass thrown at a defender (a real interception, best effort — retried) that runs out the clock
//   punt  (M4)           4th down with 0:03 left: the dialog's Punt (s_action_result(5) -> s_punt costs 5-10 s)
//   fg    (M5)           4th down at the opponent's 15 with 0:02 left: the dialog's Field Goal, kicked for real
//   td    (M6)           1st & goal at the 1 with 0:02 left: a real run in, then the try (1 PT, kicked for real)
//   pick6 (M7, a guard)  a real interception deep in the thrower's own end, returned for a touchdown (retried)
// The setup places the down (bridge staging with its down & distance, the clock) BEFORE the snap; the drive end is the
// engine's own (a real snap, a real dialog choice, a real kick). Then 35 s: a phone offered a ball in the old quarter
// plays it, a conversion offered is kicked, a 4th-down dialog is answered (as players would).
// What must hold: H1 a hand-off decided at the horn is stamped 0:00; H2 nobody snaps a scrimmage down in the old
// quarter after the drive end; H3 nothing bounces, no rescuer acts; H4 the next period starts by rule.
// Env: HORN_Q 1..4, HORN_KIND run|int|pick6|punt|fg|td, HORN_MODE fix|keep0|live, HORN_SCORE tie|lead|p6tie (Q4), RB_E2E_PORT.
//   pick6 + HORN_Q=4 + HORN_SCORE=p6tie is M10 (C6; OPEN.md #5, FGXJ): the pick-six ties it, the try must decide before OT.
const L = require('./horn-lib');
const QB = L.QB;
const fs = require('fs'), path = require('path');
const sleep = L.sleep;
let pass = 0, fail = 0, restoreDiff = false;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function buttons(page) { return page.evaluate(QB.IN.clickButtons); }
async function pressLabel(page, re) {
    const list = await buttons(page); const b = list.find(x => re.test(String(x.label || '')));
    if (!b) return null;
    const cal = await QB.calibrate(page); await QB.pressGui(page, cal, b); return b.label;
}
async function stage(page, y, down, toGo, clk) {
    return page.evaluate(({ y, down, toGo, clk }) => {
        const s = RB.engineState(); if (!s) return 'no state';
        s.engineMinutesLeft = Math.floor(clk / 60); s.engineSecondsLeft = clk % 60; s.engineTickAllowance = 0;
        return window._rb2p_forceUserOffenseDrive(y, true, { down, toGo });
    }, { y, down, toGo, clk });
}
// a short, low pass at the nearest defender in front of the QB (the engine decides the catch)
async function throwAtDefender(page) {
    const s0 = await page.evaluate(QB.IN.snap);
    const qb = s0.of.find(o => o.pos === 1); if (!qb || !s0.ball) return { result: 'none', why: 'no QB' };
    const cal = await QB.calibrate(page);
    const dir = s0.dir, gs = cal.gs, qc = cal.toCss(qb.x, qb.y);
    await QB.pointer(page).move(qc.x, qc.y); await sleep(40); await QB.pointer(page).down();
    let pressed = false; for (let i = 0; i < 8; i++) { await sleep(20); const c = await page.evaluate(QB.IN.snap); if (c.ctrl && c.ctrl.kp === 1) { pressed = true; break; } }
    if (!pressed) { await QB.pointer(page).up(); return { result: 'none', why: 'press' }; }
    await QB.pointer(page).move(qc.x + (-dir) * 26 / gs, qc.y, { steps: 2 });   // the snap (a pull straight back)
    await sleep(500);
    const s = await page.evaluate(QB.IN.snap); const q = s.of.find(o => o.pos === 1) || qb;
    let best = null;
    for (const d of s.df) { const fwd = (d.x - q.x) * dir, dist = Math.hypot(d.x - q.x, d.y - q.y); if (fwd > 30 && dist > 60 && dist < 160 && (!best || dist < best.dist)) best = { d, dist }; }
    if (!best) for (const d of s.df) { const dist = Math.hypot(d.x - q.x, d.y - q.y); if ((d.x - q.x) * dir > 0 && (!best || dist < best.dist)) best = { d, dist }; }
    if (!best) { await QB.pointer(page).up(); return { result: 'none', why: 'no defender' }; }
    const ux = best.d.x - q.x, uy = best.d.y - q.y, Lh = Math.hypot(ux, uy) || 1;
    const R01 = Math.max(28, Math.min(60, best.dist * 0.42));
    await QB.pointer(page).move(qc.x - ux / Lh * R01 / gs, qc.y - uy / Lh * R01 / gs, { steps: 2 }); await sleep(40);
    await QB.pointer(page).up();
    let intd = false;
    for (let w = 0; w < 80; w++) { await sleep(100); const c = await page.evaluate(QB.IN.snap); if (c.ball && c.ball.kp === 9) intd = true; if (!c.ball || (c.ball.kp === 0 && w > 8) || c.waiting) break; }
    return { result: intd ? 'intercepted' : 'not intercepted', target: best.d.ln, dist: Math.round(best.dist) };
}

(async () => {
    const Q = Number(process.env.HORN_Q || 1), KIND0 = process.env.HORN_KIND || 'run', TRY2 = KIND0 === 'td2', KIND = TRY2 ? 'td' : KIND0, MODE = process.env.HORN_MODE || 'fix', SCORE = process.env.HORN_SCORE || 'lead';
    console.log('=== HORN last down — ' + KIND + ' at the Q' + Q + ' horn, mode ' + MODE + (Q === 4 ? ', score ' + SCORE : '') + ' ===');
    const g = await L.TP.startTwoPlayerGame({});
    let verdict = 'ran';
    try {
        await sleep(6000);
        for (const P of [g.a, g.b]) await P.page.evaluate(L.installRecorder);
        await L.setMode([g.a.page, g.b.page], MODE);
        const o = await L.offense(g, 40000);
        if (!o.ok) { console.log('  SETUP nobody has the ball'); verdict = 'setup'; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        if (KIND === 'td' && Q % 2 === 0) {
            // an even quarter reached by writing the quarter skips the engine's direction switch (_Sc1, run by its own
            // end-of-quarter): a goal-line run there goes backwards. Reach it for real: a real run at Q(n-1) 0:01 with no
            // possession change, the engine's own horn (V434), and the keep gives OFF the ball in Q n
            await L.setQuarter([OFF.page, DEF.page], Q - 1, 75);
            await sleep(1500);
            await L.setDown(OFF.page, { clk: 1 }); await sleep(600);
            const rr = await L.realDown(OFF.page, { buttons: false });
            const roll = await L.until(async () => { const a = await L.st(OFF.page), b = await L.st(DEF.page); return { ok: !!(a && b && a.q === Q && b.q === Q && !a.wait && b.wait && a.ball > 0), a, b }; }, 40000, 700);
            console.log('  reached Q' + Q + ' through a real Q' + (Q - 1) + ' horn: ' + JSON.stringify(rr && { result: rr.result, gain: rr.gainYds }) + ' -> ' + (roll.ms !== null ? 'yes, ' + roll.ms + ' ms' : 'NO ' + JSON.stringify({ off: roll.a, def: roll.b })));
            if (roll.ms === null) { console.log('  SETUP the real Q' + (Q - 1) + ' horn did not leave ' + OFF.role + ' the ball in Q' + Q + ' — inconclusive'); verdict = 'setup'; return; }
        } else {
            await L.setQuarter([OFF.page, DEF.page], Q, 75);
        }
        await sleep(1500);
        if (Q === 4) {   // OFF's view [user, opp]: lead = OFF trails by 4 before its last down (a TD/FG decides it), tie = level,
                         // p6tie = OFF leads by 6, so a pick-six ties it BEFORE its try (OPEN.md #5, FGXJ: the try must decide)
            const sc = SCORE === 'tie' ? [10, 10] : SCORE === 'p6tie' ? [16, 10] : [10, 14];
            await OFF.page.evaluate(sc => { const s = RB.engineState(); s.setUserScore(sc[0]); s.setOpponentScore(sc[1]); }, sc);
            await DEF.page.evaluate(sc => { const s = RB.engineState(); s.setUserScore(sc[1]); s.setOpponentScore(sc[0]); }, sc);
        }
        const t0 = await OFF.page.evaluate(() => Date.now());
        let r = null, tdMissed = false;
        if (KIND === 'run') { await L.setDown(OFF.page, { clk: 1 }); await sleep(600); r = await L.realDown(OFF.page, { buttons: false }); }
        else if (KIND === 'int') {
            for (let i = 0; i < 4 && !(r && r.result === 'intercepted'); i++) {
                if (i) { const oo = await L.offense(g, 20000); if (!oo.ok || oo.off !== OFF) break; }
                await L.setDown(OFF.page, { clk: 2, down: 1, toGo: 10 }); await sleep(600);
                r = await throwAtDefender(OFF.page);
                console.log('  throw ' + (i + 1) + ': ' + JSON.stringify(r));
                if (r.result !== 'intercepted') { const sNow = await L.st(OFF.page); if (!sNow || sNow.q !== Q) break; }
            }
        }
        else if (KIND === 'pick6') {
            // M7: a real interception deep in the thrower's own end, so a return for a touchdown is likely; retried
            for (let i = 0; i < 4 && !(r && r.result === 'intercepted'); i++) {
                if (i) { const oo = await L.offense(g, 20000); if (!oo.ok || oo.off !== OFF) break; }
                console.log('  staged: ' + await stage(OFF.page, -47, 1, 10, 2)); await sleep(900);
                r = await throwAtDefender(OFF.page);
                console.log('  throw ' + (i + 1) + ': ' + JSON.stringify(r));
                if (r.result !== 'intercepted') { const sNow = await L.st(OFF.page); if (!sNow || sNow.q !== Q) break; }
            }
        }
        else if (KIND === 'punt') {
            console.log('  staged: ' + await stage(OFF.page, -25, 4, 15, 3)); await sleep(1200);
            const lab = await pressLabel(OFF.page, /^punt$/i); r = { result: lab ? 'punt chosen (' + lab + ')' : 'no punt button: ' + JSON.stringify((await buttons(OFF.page)).map(b => b.label)) };
        }
        else if (KIND === 'fg') {
            console.log('  staged: ' + await stage(OFF.page, 35, 4, 5, 2)); await sleep(1200);
            const lab = await pressLabel(OFF.page, /field ?goal/i); await sleep(900);
            let k = null; try { k = await QB.kickOne(OFF.page, await QB.calibrate(OFF.page), {}); } catch (e) { k = { result: 'err ' + e.message }; }
            r = { result: 'fg ' + (lab || 'no button') + ' -> ' + JSON.stringify(k && (k.result || k)) };
        }
        else if (KIND === 'td') {
            // an easy defense for this one down (a setup knob, e2e inventory) — the goal-line run must score to be this test
            await OFF.page.evaluate(() => { window._rb2p_computeDefenseAggression = () => 10; try { RB.engineState().engineDefenseAggression = 10; } catch (e) {} });
            // and the lobby's EASY defense (a player's own choice; MAX, the default, adds the defender speed bump and the
            // engine's hardest AI tier — the dive from the half-yard line was stuffed 3 in 4 times)
            for (const P of [OFF, DEF]) await P.page.evaluate(() => { try { window.__hornPrevDiff = localStorage.getItem('rb2p_difficulty'); localStorage.setItem('rb2p_difficulty', 'easy'); if (window._rb2p_applyOpDifficulty) window._rb2p_applyOpDifficulty(); } catch (e) {} });
            restoreDiff = true;
            const su0 = ((await L.st(OFF.page)) || {}).su;
            // a new quarter's ball gate (V358) holds the first staging at the quarter's anchor (Q2: the offense's own 11-25)
            // and retires once it has; stage again until the ball really is at the half-yard line
            for (let i = 0; i < 3; i++) {
                console.log('  staged: ' + await stage(OFF.page, 49.5, 1, 0.5, 2)); await sleep(900);
                const sy = await L.st(OFF.page); if (sy && Math.abs(Number(sy.y) - 49.5) <= 1) break;
                console.log('  the ball is at ' + (sy && sy.y) + ', not the goal line — staging again');
            }
            r = await L.realDown(OFF.page, { buttons: false, straight: true });
            if (!r) r = await L.realDown(OFF.page, { buttons: true, straight: true });   // a re-stage can leave a button scene up first
            // (above) a straight dive from the half-yard line (a steered run from the 1 scored 2 in 11)
            await sleep(1500);
            const su1 = (await L.st(OFF.page) || {}).su;
            const scored = (Number(su1) - Number(su0));
            if (r) r.scored = scored;
            if (!(scored >= 6)) tdMissed = true;
        }
        console.log('  last down (' + OFF.role + '): ' + JSON.stringify(r && { result: r.result, gain: r.gainYds }));
        // the team that must have the ball in the next period, by rule
        let rightful = (Q === 2) ? (OFF.role === 'b' ? OFF : DEF) : (KIND === 'run' ? OFF : DEF);
        let p6sent = false;
        if (KIND === 'pick6' || KIND === 'int') {
            // a return for a touchdown ships PICK6 after the return, the replay and the 4 s hold (~15 s after the snap): wait for it
            const p6 = await L.until(async () => ({ ok: (await L.audit(g.code, OFF.role)).some(e => e.k === 'send' && e.type === 'PICK6' && e.t >= t0) }), r && r.result === 'intercepted' ? 35000 : 6000, 1500);
            p6sent = p6.ms !== null;
            if (p6sent && Q !== 2) rightful = OFF;   // after the pick-six and its try, the scorer kicks off to the thrower
            console.log('  pick-six sent: ' + p6sent + ' -> the rightful team next period: ' + rightful.role);
        }
        // 35 s of play as players would: answer a conversion with a kick, answer a dialog, play a ball offered in the old
        // quarter, and play a ball the WRONG team is offered in the new one (METB: a gift down at the 2 snapped in Q3)
        // 35 s, and under load until the next period has begun on both phones (+12 s) — a try kicked at the horn can take
        // 14 s to roll the quarter (V436 gate, Z272: the window closed before Q2 began), capped at 90 s
        const t35 = Date.now() + 35000, tCap = Date.now() + 90000; const acts = []; let playedWrong = false; let nextAt = 0;
        const nextBegun = async () => { const a = await L.st(OFF.page), b = await L.st(DEF.page); return !!(a && b && ((a.q >= Q + 1 && b.q >= Q + 1) || a.over || b.over || a.final || b.final)); };
        while (Date.now() < tCap && (Date.now() < t35 || !nextAt || Date.now() < nextAt + 12000)) {
            if (!nextAt && await nextBegun()) nextAt = Date.now();
            for (const P of [OFF, DEF]) {
                const s = await L.st(P.page); if (!s) continue;
                const bl = await buttons(P.page);
                // a conversion is answered on any phone: a pick-six scorer plays its try while flagged "waiting" (the bridge's own note)
                // V441 (td2): a 2-point RUN try — the ball goes 0 -> 19 (a hand-off), never through the pass snap (OPEN #0a, VCUH)
                if (TRY2 && bl.some(b => /^2 ?pt/i.test(b.label || ''))) { await pressLabel(P.page, /^2 ?pt/i); await sleep(1500); const rr2 = await L.realDown(P.page, { buttons: false, straight: true }); acts.push(P.role + ' try 2PT run ' + JSON.stringify(rr2 && rr2.result)); continue; }
                if (bl.some(b => /^1 ?pt/i.test(b.label || ''))) { const lab = await pressLabel(P.page, /^1 ?pt/i); await sleep(1000); let k = null; try { k = await QB.kickOne(P.page, await QB.calibrate(P.page), {}); } catch (e) {} acts.push(P.role + ' try 1PT ' + JSON.stringify(k && k.result)); continue; }
                if (s.wait) continue;
                if (s.q === Q && s.ball > 0 && s.clk > 0 && s.d >= 1 && s.d <= 4) { const rr = await L.realDown(P.page, { buttons: true }); acts.push(P.role + ' played a down in Q' + Q + ' at clk ' + s.clk + ': ' + (rr && rr.result)); }
                else if (Q <= 3 && !playedWrong && s.q === Q + 1 && s.ball > 0 && s.d >= 1 && s.d <= 4 && P.role !== rightful.role) { playedWrong = true; const rr = await L.realDown(P.page, { buttons: false }); acts.push(P.role + ' (NOT the rightful team) was offered a down in Q' + (Q + 1) + ' and played it: ' + (rr && rr.result)); }
            }
            await sleep(700);
        }
        // the state the next period starts in (read BEFORE anyone plays its first down)
        const S1 = await L.st(OFF.page), S2 = await L.st(DEF.page);
        // the rightful team plays its first down of the new period (so the first snap is on record)
        if (Q <= 3) {
            const R = await L.st(rightful.page);
            const snappedNext = (await L.audit(g.code, rightful.role)).some(e => e.k === 'snap' && Number(e.q) === Q + 1 && e.t >= t0);
            if (R && !R.wait && R.ball > 0 && R.q === Q + 1 && !snappedNext) { const rr = await L.realDown(rightful.page, { buttons: true }); acts.push(rightful.role + ' (the rightful team) played its first down of Q' + (Q + 1) + ': ' + (rr && rr.result)); await sleep(2500); }
        }
        if (acts.length) console.log('  after the last down: ' + JSON.stringify(acts));
        const au = (await L.audit(g.code, OFF.role)).map(e => Object.assign({ who: OFF.role }, e)).concat((await L.audit(g.code, DEF.role)).map(e => Object.assign({ who: DEF.role }, e))).filter(e => e.t >= t0 - 1500).sort((a, b) => a.t - b.t);
        const recO = await L.dumpRecorder(OFF.page, t0 - 1500), recD = await L.dumpRecorder(DEF.page, t0 - 1500);
        const sends = au.filter(e => e.k === 'send');
        const driveEnds = recO.diag.concat(recD.diag).filter(x => /^SEND \w+ Q\d/.test(x[1])).map(x => x[1]);
        const qch = au.filter(e => e.k === 'q').map(e => e.who + ' Q' + e.from + '->' + e.to + ' @' + ((e.t - t0) / 1000).toFixed(1));
        const firstQ = au.find(e => e.k === 'q' && Number(e.from) === Q);
        const tHorn = firstQ ? firstQ.t : Infinity;
        // "after the last down" = after the last down's OWN snap: the offense's last scrimmage snap in Q before its drive-end
        // send (or, with no send — a run that keeps the ball — before the first quarter change). A retried throw or the
        // field goal's own kick is that last down, not an extra play.
        const offSend = au.find(e => e.k === 'send' && e.who === OFF.role && e.t >= t0);
        const tCut = offSend ? offSend.t : tHorn;
        const offLast = au.filter(e => e.k === 'snap' && e.who === OFF.role && Number(e.q) === Q && Number(e.d) !== 6 && e.t <= tCut).pop();
        const tLastDown = offLast ? offLast.t : t0;
        const oldQSnaps = au.filter(e => e.k === 'snap' && Number(e.q) === Q && e.t > tLastDown && Number(e.d) !== 6);
        const tries = au.filter(e => e.k === 'snap' && Number(e.d) === 6);
        const badDiag = recO.diag.concat(recD.diag).filter(x => /force NO-BALL|EMPTY-FIELD.*FAILED|TURN-RESCUE ->|FIELD-CHECK.*(restore|force|park)|SEND PUNT Q\d 0:00|STUCK@staging/.test(x[1]));
        console.log('  drive ends: ' + JSON.stringify(driveEnds) + '\n  sends: ' + JSON.stringify(sends.map(e => e.who + ' ' + e.type + ' Q' + e.q + ' clk' + e.clk)) + '\n  quarter changes: ' + JSON.stringify(qch) + ' | old-quarter scrimmage snaps after the last down: ' + JSON.stringify(oldQSnaps.map(e => e.who + ' clk' + e.clk)) + ' | tries: ' + tries.length);
        console.log('  now: ' + OFF.role + ' ' + JSON.stringify(S1) + '\n       ' + DEF.role + ' ' + JSON.stringify(S2));
        if (badDiag.length) console.log('  rescuer / bounce lines: ' + JSON.stringify(badDiag.slice(0, 8).map(x => x[1])));
        if ((KIND === 'int' || KIND === 'pick6') && !(r && r.result === 'intercepted')) { console.log('  SETUP no interception — inconclusive'); verdict = 'setup'; }
        if (KIND === 'td' && tdMissed) { console.log('  SETUP the goal-line run did not score (' + JSON.stringify(r) + ') — inconclusive'); verdict = 'setup'; }
        // H1: each drive end the sender logged at Qn 0:00 ("SEND X Qn 0:00 (pre …") is shipped as Qn 0:00 — matched to that
        // phone's next send (a re-stamp into the next quarter is a failure too, not a pass)
        const hornPairs = [];
        for (const [P, rec] of [[OFF, recO], [DEF, recD]]) {
            for (const x of (rec.diag || [])) {
                const m = String(x[1]).match(/^SEND (\w+) Q(\d) 0:00 \(pre/); if (!m || m[1] === 'PAT_RESULT' || m[1] === 'PICK6') continue;
                const snd = sends.find(e => e.who === P.role && e.t >= x[0] - 50);
                hornPairs.push({ who: P.role, type: m[1], q: Number(m[2]), sent: snd ? { q: Number(snd.q), clk: Number(snd.clk) } : null });
            }
        }
        check('H1 a hand-off decided at the horn ships Qn 0:00 (never 0:01, never the next quarter)', hornPairs.every(h => h.sent && h.sent.q === h.q && h.sent.clk === 0),
              JSON.stringify(hornPairs));
        check('H2 nobody snaps a scrimmage down in Q' + Q + ' after the last down', oldQSnaps.length === 0, JSON.stringify(oldQSnaps.map(e => e.who + ' clk' + e.clk)));
        const bounces = sends.filter((e, i) => i > 0 && Number(e.q) === Q && e.type !== 'PAT_RESULT' && e.type !== 'PICK6');
        check('H3 nothing bounces and no rescuer acts at the horn', bounces.length === 0 && badDiag.length === 0, JSON.stringify({ bounces: bounces.map(e => e.who + ' ' + e.type), lines: badDiag.length }));
        let ok = false, why = '';
        const byRole = { [OFF.role]: S1, [DEF.role]: S2 };
        if (Q === 4) {
            // p6tie: the try decides — level after it (missed) = overtime, otherwise the final. The score after the try is the
            // last one either recorder saw (after the final the engine leaves the match room and st() has no score)
            let level = SCORE === 'tie' && !(S1 && S2 && S1.su !== S1.so);
            if (SCORE === 'p6tie') {
                const rows = (recO.log || []).filter(x => x.su != null && x.so != null);
                const ls = rows.length ? rows[rows.length - 1] : null;
                level = ls ? Number(ls.su) === Number(ls.so) : !!(S1 && S1.su != null && S1.su === S1.so);
                console.log('  the score after the try (' + OFF.role + '\'s view): ' + (ls ? ls.su + '-' + ls.so : 'unknown') + ' — ' + (level ? 'level: overtime' : 'decided: the final'));
                const otLines = recO.diag.concat(recD.diag).filter(x => /OT waits|OT kickoff|coin|the scorer owes|overtime/i.test(x[1])).map(x => ((x[0] - t0) / 1000).toFixed(1) + ' ' + x[1]);
                if (otLines.length) console.log('  OT lines: ' + JSON.stringify(otLines.slice(0, 10)));
            }
            if (level) { ok = !!(S1 && S2 && S1.q >= 5 && S2.q >= 5 && S1.wait !== S2.wait && !S1.over && !S2.over); why = (SCORE === 'p6tie' ? 'the try missed: ' : '') + 'tied: overtime, one offense'; }
            else { ok = !!(S1 && S2 && (S1.over || S1.final) && (S2.over || S2.final)); why = (SCORE === 'p6tie' ? 'the try decided it at the horn: ' : '') + 'decided: the final on both'; }
        } else if (Q === 2) { const B = byRole.b, A = byRole.a; ok = !!(A && B && A.q === 3 && B.q === 3 && A.wait && !B.wait && B.ball > 0 && B.clk >= 60); why = 'Q3, b has the kickoff'; }
        else {
            const keeper = (KIND === 'run' || ((KIND === 'pick6' || KIND === 'int') && p6sent)) ? OFF : DEF;   // run: the offense keeps; int/punt: the other team has it; fg/td: the other team receives the kickoff; pick-six: the thrower receives it
            const K = keeper === OFF ? S1 : S2, W = keeper === OFF ? S2 : S1;
            ok = !!(K && W && K.q === Q + 1 && W.q === Q + 1 && !K.wait && W.wait && K.clk >= 60 && (KIND === 'run' || K.d === 1));
            why = 'Q' + (Q + 1) + ', ' + keeper.role + ' has the ball' + (KIND === 'run' ? '' : ', 1st & 10') + ', full clock';
            if (KIND === 'pick6' && !p6sent) why += ' (an interception, not returned for a touchdown)';
        }
        check('H4 the next period starts by rule (' + why + ')', ok, JSON.stringify(byRole));
        if (Q <= 3) {
            const firstNext = au.find(e => e.k === 'snap' && Number(e.q) === Q + 1 && Number(e.d) !== 6);
            check('H5 the first snap of Q' + (Q + 1) + ' is the rightful team\'s (' + rightful.role + ')', !!firstNext && firstNext.who === rightful.role, JSON.stringify(firstNext && { who: firstNext.who, y: firstNext.y, d: firstNext.d, clk: firstNext.clk }));
        }
        const out = path.join(__dirname, '..', '..', 'research', 'probe-out', 'LD-' + KIND + '-Q' + Q + '-' + MODE + (Q === 4 ? '-' + SCORE : '') + '-' + g.code + '.json');
        try { fs.mkdirSync(path.dirname(out), { recursive: true }); } catch (eM) {}
        fs.writeFileSync(out, JSON.stringify({ meta: { Q, KIND, MODE, SCORE, room: g.code, off: OFF.role, def: DEF.role, r: r && { result: r.result, gain: r.gainYds }, acts }, audit: au, recO, recD }, null, 1));
        console.log('  wrote ' + out);
    } finally {
        // the harness reuses its browser profiles: put the stored difficulty back for the next test
        if (restoreDiff) for (const P of [g.a, g.b]) await P.page.evaluate(() => { try { const v = window.__hornPrevDiff; if (v == null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', v); } catch (e) {} }).catch(() => {});
        await g.cleanup();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (verdict === 'setup' ? ' (SETUP INCONCLUSIVE)' : '') + ' ===');
        process.exit(verdict === 'setup' ? 3 : (fail ? 1 : 0));
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
