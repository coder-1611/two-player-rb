// e2e/v335-blast.js — DEQC Bug 7: event popups fire AT the event, exactly once.
//
// Device report: the TOUCHDOWN popup waited for the PAT (and a MISSED PAT
// swallowed it entirely); the other popups "usually don't show up." Root: the
// V318 blast fired off the drive-end outcome, which ships only AFTER the PAT
// resolves — and a dead/slow opponent (DEQC: B's engine died backgrounded)
// dropped it. V335: the scoring device publishes a dedicated per-event signal
// to rooms/{code}/evt/{role} the MOMENT the points land (TD at the +6, FG at
// the +3, INT/PICK6 at the takeaway), the waiting device blasts on receive and
// de-dups by seq/ts, and the legacy outcome-driven blast stands down when the
// opponent is on >= V335 (it stays for older opponents — e2e/v317-intblast).
//
// T1  a TD blasts TOUCHDOWN on the waiting device AT the TD — no PAT involved
// T2  the TD blast fired exactly once, and never again while the PAT goes on
//     to MISS (score never moves again) — the missed PAT cannot swallow it
// T3  a FG (+3) blasts FIELD GOAL exactly once
// T4  an INT event blasts INTERCEPTED on the TAKEAWAY device exactly once —
//     and never on the thrower's own screen
// T5  a real pick-6 cascade (enterPickSixCascade) blasts PICK 6 on the scorer
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Wrap waitFeedBig on a page so every blast is counted + recorded.
async function armBlastCounter(page) {
    await page.evaluate(() => {
        window.__blasts = [];
        if (!window.__origWaitFeedBig) {
            window.__origWaitFeedBig = window._rb2p_waitFeedBig;
            window._rb2p_waitFeedBig = function (type, message) {
                window.__blasts.push({ type: type, at: Date.now() });
                return window.__origWaitFeedBig(type, message);
            };
        } else {
            window.__blasts = [];
        }
    });
}
const blasts = page => page.evaluate(() => window.__blasts || []);
const blastShown = page => page.evaluate(() => ({
    shown: getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none',
    text: (document.getElementById('rb-wait-blast-text') || {}).textContent || ''
}));

(async () => {
    console.log('=== V335 EVENT BLASTS FIRE AT THE EVENT, EXACTLY ONCE ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;   // the scoring device
    const def = aWait ? g.a : g.b;   // the waiting device that must see the popups
    console.log('  offense = ' + off.role + ', waiting = ' + def.role);
    await armBlastCounter(def.page);
    await armBlastCounter(off.page);

    // ---- T1/T2: TOUCHDOWN at the +6, PAT never resolves ----
    await off.page.evaluate(() => {
        var em = RB.engineState();
        em.setUserScore(Number(em.userScore || 0) + 6);   // the TD lands NOW
        // no PAT is ever played, let alone made — the drive-end outcome that the
        // OLD system needed will never ship
    });
    await sleep(2500);
    const t1 = await blastShown(def.page);
    const t1b = await blasts(def.page);
    console.log('  after TD: blast=' + JSON.stringify(t1) + ' fired=' + JSON.stringify(t1b));
    check('T1 the waiting device blasts TOUCHDOWN at the TD (no PAT involved)',
          t1.shown && /TOUCHDOWN/.test(t1.text),
          JSON.stringify(t1));
    await sleep(4000);   // the PAT window passes with the PAT MISSED (no score)
    const t2b = await blasts(def.page);
    check('T2 the TD blast fired exactly once and a missed PAT cannot swallow it',
          t2b.filter(b => b.type === 'TD').length === 1,
          'TD blasts=' + JSON.stringify(t2b));

    // ---- T3: FIELD GOAL ----
    await armBlastCounter(def.page);
    await off.page.evaluate(() => {
        var em = RB.engineState();
        em.setUserScore(Number(em.userScore || 0) + 3);
    });
    await sleep(2500);
    const t3 = await blastShown(def.page);
    const t3b = await blasts(def.page);
    console.log('  after FG: blast=' + JSON.stringify(t3) + ' fired=' + JSON.stringify(t3b));
    check('T3 a +3 blasts FIELD GOAL on the waiting device exactly once',
          /FIELD GOAL/.test(t3.text) && t3b.filter(b => b.type === 'FG').length === 1,
          JSON.stringify({ t3, t3b }));

    // ---- T4: INT — the takeaway side blasts, the thrower NEVER does ----
    // The waiting device (def) is about to intercept: the OFFENSE (thrower)
    // detects the pick and publishes the INT event.
    await armBlastCounter(def.page);
    await armBlastCounter(off.page);
    await off.page.evaluate(() => { window._rb2p_sendEventBlast('INT'); });
    await sleep(2500);
    const t4def = await blastShown(def.page);
    const t4defB = await blasts(def.page);
    const t4offB = await blasts(off.page);
    console.log('  after INT: def=' + JSON.stringify(t4def) + ' defFired=' +
                JSON.stringify(t4defB) + ' offFired=' + JSON.stringify(t4offB));
    check('T4 the INT blasts INTERCEPTED on the takeaway device exactly once',
          /INTERCEPT/.test(t4def.text) && t4defB.filter(b => b.type === 'INT').length === 1,
          JSON.stringify({ t4def, t4defB }));
    check('T4 the thrower device shows NO interception blast of its own',
          t4offB.filter(b => b.type === 'INT' || b.type === 'FUMBLE').length === 0,
          'thrower fired: ' + JSON.stringify(t4offB));

    // ---- T5: a real pick-6 cascade publishes the PICK6 event ----
    // The OFF page threw a pick-6: enterPickSixCascade is the real bridge entry.
    await armBlastCounter(def.page);
    await off.page.evaluate(() => {
        window._rb2p_opponentScoreAtDriveStart = Number(RB.engineState().opponentScore) || 0;
        window._rb2p_enterPickSixCascade('v335-test');
    });
    await sleep(3000);
    const t5 = await blastShown(def.page);
    const t5b = await blasts(def.page);
    console.log('  after PICK6 cascade: def=' + JSON.stringify(t5) + ' fired=' + JSON.stringify(t5b));
    check('T5 the pick-6 cascade blasts PICK 6 on the scoring (waiting) device',
          t5b.filter(b => b.type === 'PICK6').length === 1,
          JSON.stringify({ t5, t5b }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
