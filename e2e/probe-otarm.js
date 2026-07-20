// probe-otarm.js — when does inOvertime arm vs when does the detector declare?
const H = require('./harness');
const TP = require('./two-player');

(async () => {
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(4000);
    const aWaiting = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWaiting ? g.b : g.a;
    const wtr = aWaiting ? g.a : g.b;
    // Sample the WAITING device too — its quarter arrives over the wire, so its
    // detector may race its own OT arming and end the game for both sides.
    await wtr.page.evaluate(() => {
        window.__otlog = [];
        window.__t0 = Date.now();
        setInterval(function () {
            try {
                const s = RB.engineState();
                window.__otlog.push({
                    t: Date.now() - window.__t0,
                    ot: window._rb2p_inOvertime === true ? 1 : 0,
                    over: window._rb2p_gameOverReported === true ? 1 : 0,
                    q: Number(s.engineQuarter),
                    us: Number(s.userScore), them: Number(s.opponentScore),
                    wait: window._rb2p_userIsWaitingForOpponent === true ? 1 : 0
                });
            } catch (e) {}
        }, 100);
    });
    await drv.page.evaluate(() => {
        window.__otlog = [];
        window.__t0 = Date.now();
        setInterval(function () {
            try {
                const s = RB.engineState();
                window.__otlog.push({
                    t: Date.now() - window.__t0,
                    ot: window._rb2p_inOvertime === true ? 1 : 0,
                    over: window._rb2p_gameOverReported === true ? 1 : 0,
                    q: Number(s.engineQuarter),
                    us: Number(s.userScore), them: Number(s.opponentScore),
                    wait: window._rb2p_userIsWaitingForOpponent === true ? 1 : 0
                });
            } catch (e) {}
        }, 100);
        // Now simulate the mid-OT reload state.
        const s = RB.engineState();
        window._rb2p_inOvertime = false;
        window._rb2p_gameOverReported = false;
        s.engineQuarter = 5;
        s.setUserScore(14); s.setOpponentScore(21);
        s.engineMinutesLeft = 9; s.engineSecondsLeft = 0;
    });
    await H.sleep(6000);
    for (const [label, pg] of [['DRIVER', drv], ['WAITER', wtr]]) {
        const log = await pg.page.evaluate(() => window.__otlog || []);
        console.log('--- ' + label + ' ---');
        let prev = null;
        for (const e of log) {
            const sig = [e.ot, e.over, e.q, e.us, e.them, e.wait].join(',');
            if (sig !== prev) {
                console.log('  t+' + String(e.t).padStart(5) + 'ms  inOT=' + e.ot + ' over=' + e.over +
                            ' Q' + e.q + ' ' + e.us + '-' + e.them + ' wait=' + e.wait);
                prev = sig;
            }
        }
        const logs = pg.logs.filter(l => /FINAL|OT\]/.test(l)).slice(-8);
        logs.forEach(l => console.log('    log: ' + l));
    }
    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
