// e2e/probe-ot.js — diagnostic: what moves the quarter OFF the overtime period?
//
// v296-fixes T2 and v302-qtr-ot B3 both fail around overtime entry. T2 sets the
// engine to quarter 5 with an unequal score and 3.5s later reads back q=2. This
// watches the transition at 100ms and prints every bridge log alongside it, so
// the mechanism is observed rather than guessed.
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

(async () => {
    console.log('=== PROBE: overtime period stability ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);

    const logs = [];
    for (const side of [g.a, g.b]) {
        side.page.on('console', m => {
            const t = m.text();
            if (/OT\]|FINAL|QTR|quarter|overtime|Q3|halftime/i.test(t))
                logs.push('[' + side.role + '] ' + t.slice(0, 150));
        });
    }

    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;
    const wtr = aWait ? g.a : g.b;
    console.log('  driver = ' + drv.role + ', waiter = ' + wtr.role);

    // Exactly the v296 T2 setup.
    for (const side of [g.a, g.b]) {
        await side.page.evaluate(() => {
            const s = RB.engineState();
            s.engineQuarter = 5;
            s.engineMinutesLeft = 9; s.engineSecondsLeft = 0;
            try { sessionStorage.setItem('rb2p_otPoss', JSON.stringify({ q: 5, my: 1, opp: 0 })); } catch (e) {}
        });
    }
    await drv.page.evaluate(() => {
        const s = RB.engineState();
        window._rb2p_inOvertime = false;
        window._rb2p_gameOverReported = false;
        s.engineQuarter = 5;
        s.setUserScore(14); s.setOpponentScore(21);
        s.engineMinutesLeft = 9; s.engineSecondsLeft = 0;
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();
    });

    console.log('\n  t(ms)  drvQ  drvOT  drvScore   wtrQ  wireQ  lastStableQ');
    let prev = null;
    for (let i = 0; i <= 40; i++) {
        const d = await drv.page.evaluate(() => ({
            q: Number(RB.engineState().engineQuarter),
            ot: window._rb2p_inOvertime === true,
            us: Number(RB.engineState().userScore),
            them: Number(RB.engineState().opponentScore),
            wire: window._rb2p_wireQuarter,
            stable: window._rb2p_lastStableQuarter,
            topped: window._rb2p_qToppedEver ? JSON.stringify(window._rb2p_qToppedEver) : null
        }));
        const w = await wtr.page.evaluate(() => Number(RB.engineState().engineQuarter));
        const line = d.q + '|' + d.ot + '|' + d.us + '-' + d.them + '|' + w + '|' + d.wire + '|' + d.stable;
        if (line !== prev) {
            console.log('  ' + String(i * 100).padStart(5) + '   ' + String(d.q).padStart(3) +
                        '  ' + String(d.ot).padStart(5) + '  ' + (d.us + '-' + d.them).padStart(8) +
                        '   ' + String(w).padStart(3) + '  ' + String(d.wire).padStart(5) +
                        '  ' + String(d.stable).padStart(10) + '   topped=' + d.topped);
            prev = line;
        }
        await sleep(100);
    }

    // ---- Scenario B: the way a REAL resume does it (index.html:4451 sets
    // wireQuarter in the same statement that restores the quarter) ----
    console.log('\n  --- Scenario B: q=5 WITH the wire baseline the resume sets ---');
    await drv.page.evaluate(() => {
        const s = RB.engineState();
        window._rb2p_inOvertime = false;
        s.engineQuarter = 5;
        window._rb2p_wireQuarter = Math.max(Number(window._rb2p_wireQuarter) || 0, 5);
        s.engineMinutesLeft = 9; s.engineSecondsLeft = 0;
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();
    });
    await sleep(3000);
    const b2 = await drv.page.evaluate(() => ({
        q: Number(RB.engineState().engineQuarter),
        ot: window._rb2p_inOvertime === true,
        wire: window._rb2p_wireQuarter
    }));
    console.log('   after 3s -> q=' + b2.q + '  inOvertime=' + b2.ot + '  wireQuarter=' + b2.wire);

    // ---- Scenario C: can a test LOWER the score? (v302 B3 wanted 21-21 and
    // read back 27-21, the previous leg's score) ----
    console.log('\n  --- Scenario C: lowering the score ---');
    const c = await drv.page.evaluate(async () => {
        const s = RB.engineState();
        s.setUserScore(27); s.setOpponentScore(21);
        await new Promise(r => setTimeout(r, 800));
        const high = { us: Number(s.userScore), them: Number(s.opponentScore) };
        s.setUserScore(21);                       // what B3 tries to do
        await new Promise(r => setTimeout(r, 1200));
        return { high: high, after: { us: Number(RB.engineState().userScore),
                                      them: Number(RB.engineState().opponentScore) } };
    });
    console.log('   set 27-21 -> ' + JSON.stringify(c.high) +
                ' ; then set user 21 -> ' + JSON.stringify(c.after));

    console.log('\n  --- bridge logs ---');
    logs.slice(-40).forEach(l => console.log('   ' + l));
    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
