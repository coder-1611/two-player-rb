// e2e/qtr-tap.js — V453: a tap in the end-of-quarter pause never starts the engine's own next quarter.
// The owner (LQOB, 3 Oct): "q1 to q2 there was no punt" and "the infinite play glitch … only one time and only on quarter
// boundaries". At a quarter's end the engine parks at Vy=13 ("End of …" and its Continue button); in commentary mode ANY
// tap re-entered s_update_commentary and ran e20, the single-player continuation, against the bridge's own start of the
// quarter. Both cases as players hit them, through real input (the only writes are the setup of a down, as horn-lib):
//   K0/T0  (both) the pause held: no tap in it ran e20 (the mechanism, measured on the engine's own call)
//   K  (keep)  a real down runs out the Q1 clock with no possession change; in the pause the offense taps the screen
//              and any Continue / Kick Off / Receive drawn, like a player waiting to go on (KAFA, NSZC, TCUE)
//      K1  the next quarter's play is set up ONCE (one keep: no second keep, no "fresh spawn, routes reset")
//      K2  the offense's first Q2 snap is on the spot and down the last Q1 down left
//      K3  nobody ships a hand-off in Q2 before that snap
//   T  (touchdown at 0:00)  the scorer's touchdown hand-off lands on the receiver at Q1 0:00, so the horn ends Q1 on the
//              receiver; in the pause the receiver taps and presses whatever is drawn (LQOB, NPRA, VZLC)
//      T1  the receiver ships nothing in Q2 before its first snap (LQOB: a PUNT at 3:00 — the ball kicked to the scorer)
//      T2  the receiver snaps Q2's first down from the hand-off's spot, while the scorer waits
// The scorer's drive end in T is the scenario seam (scenario.js forceDriveEnd, prior stage 9): the subject is the receiver.
// Env: QT_CASE keep|td (default: both, one game each), RB_E2E_PORT.
const L = require('./horn-lib');
const D = require('./scenario');
const QB = L.QB;
const sleep = L.sleep;
let pass = 0, fail = 0, setupFail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const engineButtons = page => page.evaluate(QB.IN.clickButtons).then(l => l.filter(b => b.x > -1000)).catch(() => []);
async function tapCenter(page) {
    const box = await page.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45 }; });
    const P = QB.pointer(page);
    await P.move(box.x, box.y); await sleep(30); await P.down(); await sleep(70); await P.up();
}
// a player in the pause: press what the engine draws (Continue / Kick Off / Receive), else tap the field, every 600 ms
async function tapThroughPause(page, ms) {
    const acts = []; const t0 = Date.now();
    let cal = null; try { cal = await QB.calibrate(page); } catch (e) {}
    while (Date.now() - t0 < ms) {
        const bl = await engineButtons(page);
        const b = bl.find(x => /continue|kick ?off|receive/i.test(String(x.label || '')));
        if (b && cal) { await QB.pressGui(page, cal, b); acts.push(((Date.now() - t0) / 1000).toFixed(1) + ' pressed ' + b.label); }
        else { await tapCenter(page); acts.push(((Date.now() - t0) / 1000).toFixed(1) + ' tap'); }
        await sleep(600);
    }
    return acts;
}
const live = page => L.st(page).then(s => !!(s && !s.wait && s.ball > 0 && s.d >= 1 && s.d <= 4));

async function runCase(KIND) {
    console.log('\n=== QTR-TAP — ' + (KIND === 'keep' ? 'K: a tapped pause after a down that ran out Q1' : 'T: a touchdown hand-off at Q1 0:00, the receiver taps') + ' ===');
    const g = await L.TP.startTwoPlayerGame({});
    try {
        await sleep(6000);
        for (const P of [g.a, g.b]) await P.page.evaluate(L.installRecorder);
        const o = await L.offense(g, 40000);
        if (!o.ok) { console.log('  SETUP nobody has the ball'); setupFail++; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        await L.setQuarter([OFF.page, DEF.page], 1, 75);
        await sleep(1500);
        const t0 = await OFF.page.evaluate(() => Date.now());
        let SUB = OFF, other = DEF, rr = null;   // SUB = the phone whose pause is tapped
        if (KIND === 'keep') {
            await L.setDown(OFF.page, { clk: 1 }); await sleep(600);
            rr = await L.realDown(OFF.page, { buttons: false });
            console.log('  the last Q1 down (' + OFF.role + '): ' + JSON.stringify(rr && { result: rr.result, gain: rr.gainYds }));
        } else {
            SUB = DEF; other = OFF;
            const sent = await OFF.page.evaluate(() => {
                const s = RB.engineState(); if (!s) return 'no state';
                if (window._rb2p_clockLicence) window._rb2p_clockLicence('test setup', 3000);
                s.setUserScore((Number(s.userScore) || 0) + 7);
                s.engineMinutesLeft = 0; s.engineSecondsLeft = 0; s.engineTickAllowance = 0;
                return true;
            });
            const fe = await D.forceDriveEnd(OFF.page, 'TD');
            console.log('  the scorer (' + OFF.role + ') ends its drive with a touchdown at Q1 0:00: ' + JSON.stringify({ sent, fe }));
        }
        // the subject's quarter turns to Q2: the pause
        const q2 = await L.until(async () => { const s = await L.st(SUB.page); return { ok: !!(s && s.q === 2), s }; }, 30000, 150);
        if (q2.ms === null) { console.log('  SETUP ' + SUB.role + ' never reached Q2: ' + JSON.stringify(q2.s)); setupFail++; return; }
        // the mechanism, measured: a call of the engine's commentary step at Vy=13 that leaves Vy=13 is e20, the
        // single-player continuation (the bridge leaves the pause by writing the stage, never through this call)
        await SUB.page.evaluate(() => {
            const f = window._Ib1; window.__e20 = { calls: 0, ran: 0, to: [] };
            window._Ib1 = function (_, t) { const v0 = _ && Number(_._Vy); const r = f.apply(this, arguments);
                try { if (v0 === 13) { window.__e20.calls++; if (Number(_._Vy) !== 13) { window.__e20.ran++; window.__e20.to.push(Number(_._Vy)); } } } catch (e) {} return r; };
        });
        const tQ = Date.now();
        const acts = await tapThroughPause(SUB.page, KIND === 'keep' ? 4500 : 5500);
        console.log('  ' + SUB.role + ' in the pause: ' + JSON.stringify(acts));
        // the quarter starts: the subject has the ball (a formation and a ball), then a beat for any re-spawn
        const lv = await L.until(async () => ({ ok: await live(SUB.page) }), 25000, 300);
        await sleep(2500);
        const before = await L.st(SUB.page), otherBefore = await L.st(other.page);
        console.log('  ' + SUB.role + ' live in Q2 ' + (lv.ms !== null ? (Math.round((Date.now() - tQ) / 100) / 10) + ' s after the pause began' : 'NEVER') + ': ' + JSON.stringify(before) + '; ' + other.role + ': ' + JSON.stringify(otherBefore && { q: otherBefore.q, wait: otherBefore.wait }));
        let r2 = null;
        if (lv.ms !== null && before && !before.wait) r2 = await L.realDown(SUB.page, { buttons: true });
        console.log('  ' + SUB.role + ' plays Q2\'s first down: ' + JSON.stringify(r2 && { result: r2.result, gain: r2.gainYds }));
        await sleep(3000);   // the audit streams upload every 1.5 s
        const au = (await L.audit(g.code, OFF.role)).map(e => Object.assign({ who: OFF.role }, e)).concat((await L.audit(g.code, DEF.role)).map(e => Object.assign({ who: DEF.role }, e))).filter(e => e.t >= t0 - 1500).sort((a, b) => a.t - b.t);
        const rec = await L.dumpRecorder(SUB.page, t0 - 1500);
        const diag = rec.diag || [];
        const qch = au.find(e => e.k === 'q' && e.who === SUB.role && Number(e.from) === 1 && Number(e.to) === 2);
        const firstSnap = au.find(e => e.k === 'snap' && e.who === SUB.role && Number(e.q) === 2 && Number(e.d) !== 6);
        const tSnap = firstSnap ? firstSnap.t : Infinity;
        const keeps = au.filter(e => e.k === 'keep' && e.who === SUB.role && Number(e.q) === 2);
        const fresh = au.filter(e => e.k === 'guard' && e.what === 'keep-fresh' && e.who === SUB.role);
        const sendsQ2 = au.filter(e => e.k === 'send' && Number(e.q) === 2 && e.t < tSnap);
        const holds = au.filter(e => e.k === 'guard' && e.what === 'qtr-hold' && e.who === SUB.role).map(e => 'Q' + e.q);
        const e20 = await SUB.page.evaluate(() => window.__e20).catch(() => null);
        const kicks = (rec.calls || []).filter(c => c.fn === '_Ky').length;
        console.log('  ' + SUB.role + ': q change ' + JSON.stringify(qch && { y: qch.y, d: qch.d, tg: qch.tg }) + '; keeps ' + JSON.stringify(keeps.map(k => ({ n: k.n, y: k.y, d: k.d, at: ((k.t - tQ) / 1000).toFixed(1) }))) +
                    '; fresh spawns ' + fresh.length + '; first Q2 snap ' + JSON.stringify(firstSnap && { y: firstSnap.y, d: firstSnap.d, tg: firstSnap.tg, at: ((firstSnap.t - tQ) / 1000).toFixed(1) }) +
                    '; sends in Q2 before it ' + JSON.stringify(sendsQ2.map(e => e.who + ' ' + e.type + ' clk' + e.clk)) + '; held ' + JSON.stringify(holds) + '; _Ky calls ' + kicks + '; e20 ' + JSON.stringify(e20));
        check(KIND.charAt(0).toUpperCase() + '0 the pause held: no tap in it ran the engine\'s single-player continuation (e20)', !!e20 && e20.ran === 0, JSON.stringify(e20));
        if (KIND === 'keep') {
            const kept = rr && !/intercept|fumble|touchdown|td/i.test(String(rr.result || ''));
            if (!kept || !qch) { console.log('  SETUP the last Q1 down did not keep the ball into Q2 (' + JSON.stringify(rr) + ') — inconclusive'); setupFail++; return; }
            const settle = au.filter(e => e.k === 'settle' && e.who === OFF.role && Number(e.q) === 1).pop();
            check('K1 the next quarter\'s play is set up once (one keep, no re-spawn, no fresh spawn)', keeps.length === 1 && fresh.length === 0,
                  JSON.stringify({ keeps: keeps.map(k => k.n), fresh: fresh.length }));
            check('K2 the first Q2 snap is on the spot and down the last Q1 down left', !!firstSnap && !!keeps[0] && Math.abs(Number(firstSnap.y) - Number(keeps[0].y)) <= 1 && Number(firstSnap.d) === Number(keeps[0].d) &&
                  (!settle || Math.abs(Number(keeps[0].y) - Number(settle.y)) <= 1.5),
                  JSON.stringify({ snap: firstSnap && { y: firstSnap.y, d: firstSnap.d }, keep: keeps[0] && { y: keeps[0].y, d: keeps[0].d }, settle: settle && { y: settle.y, d: settle.d } }));
            check('K3 nobody ships a hand-off in Q2 before that snap', sendsQ2.length === 0, JSON.stringify(sendsQ2.map(e => e.who + ' ' + e.type)));
        } else {
            const horn = au.find(e => e.k === 'guard' && e.what === 'horn' && e.who === SUB.role);
            if (!horn || !qch) { console.log('  SETUP the touchdown hand-off did not end Q1 on the receiver at 0:00 (horn ' + !!horn + ') — inconclusive'); setupFail++; return; }
            const sub2 = sendsQ2.filter(e => e.who === SUB.role);
            check('T1 the receiver ships nothing in Q2 before its first snap (LQOB: a PUNT at 3:00)', sub2.length === 0, JSON.stringify(sub2.map(e => e.type + ' clk' + e.clk + ' y' + e.y)));
            check('T2 the receiver snaps Q2\'s first down from the hand-off\'s spot while the scorer waits',
                  !!firstSnap && Math.abs(Number(firstSnap.y) - Number(horn.y)) <= 1.5 && Number(firstSnap.d) === 1 && !!(otherBefore && otherBefore.wait),
                  JSON.stringify({ snap: firstSnap && { y: firstSnap.y, d: firstSnap.d }, handoffSpot: horn.y, scorerWaiting: otherBefore && otherBefore.wait }));
        }
        if (process.env.QT_DEBUG) console.log(diag.filter(x => x[0] >= tQ - 2000 && x[0] <= tQ + 9000).map(x => '    ' + ((x[0] - tQ) / 1000).toFixed(1) + ' ' + x[1]).join('\n'));
    } finally { await g.cleanup(); }
}

(async () => {
    const which = process.env.QT_CASE ? [process.env.QT_CASE] : ['keep', 'td'];
    for (const k of which) await runCase(k);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (setupFail ? ' (' + setupFail + ' SETUP INCONCLUSIVE)' : '') + ' ===');
    process.exit(fail ? 1 : (setupFail ? 3 : 0));
})().catch(e => { console.error('FATAL', e); process.exit(2); });
