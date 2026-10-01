// e2e/probe-stats.js — what the ENGINE credits to each player on a real play (UZGV: the stats screen showed Purdy
// 30/45 for a 19/23 game). A real two-player game; the QB bot throws real passes through trusted mouse input on an
// easy defense; the bridge's V333 re-attribution and V352 reconcile are switched OFF so the raw engine credits are
// seen. After every play: each rostered player's stat_complete / stat_attempts / stat_yards / stat_receive /
// stat_rush_attempts, as a delta from before the play.
//   node e2e/probe-stats.js [plays]
const H = require('./harness');
const TP = require('./two-player');
const B = require('./qb-bot');
const sleep = H.sleep;
const MAX = Number(process.argv[2] || 8);
const KEYS = ['stat_complete', 'stat_attempts', 'stat_yards', 'stat_receive', 'stat_rush_attempts', 'stat_touchdowns', 'stat_interceptions'];

(async () => {
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    await off.page.evaluate(() => {
        window._rb2p_reattributePassingStats = () => 0; window._rb2p_reconcileReceptions = () => 0;   // raw engine credits
        window._rb2p_computeDefenseAggression = () => 10; const s = RB.engineState(); if (s) s.engineDefenseAggression = 10;
    });
    const dump = () => off.page.evaluate(keys => {
        const out = {};
        const c = _si(64); let to = null; for (const k in c) { if (c.hasOwnProperty(k)) { to = c[k]; break; } }
        const n = _wi(to._Ln);
        for (let i = 0; i < n; i++) {
            const p = _zi(to._Ln, i); if (p == null) continue;
            const r = { pos: Number(_Ai(p, 'position')) }; for (const k of keys) r[k] = Number(_Ai(p, k)) || 0;
            out[i + ':' + String(_Ai(p, 'lname'))] = r;
        }
        return out;
    }, KEYS);
    let cal = await B.calibrate(off.page);
    for (let n = 1; n <= MAX; n++) {
        // wait until it is this phone's snap
        for (let i = 0; i < 60; i++) { const ok = await off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true && !!RB.engineState() && Number(RB.engineState().engineControllerState) === 0).catch(() => false); if (ok) break; await sleep(500); }
        await B.clickButtons(off.page, cal, () => {});
        const before = await dump();
        const r = await B.playOne(off.page, cal, { log: () => {} });
        await sleep(4500);
        const after = await dump();
        const d = [];
        for (const k of Object.keys(after)) {
            const a = after[k], b = before[k] || {}; const ch = {};
            for (const s of KEYS) { const x = Math.round((a[s] - (b[s] || 0)) * 10) / 10; if (x) ch[s.replace('stat_', '')] = x; }
            if (Object.keys(ch).length) d.push(k + '(pos ' + a.pos + ') ' + JSON.stringify(ch));
        }
        console.log('PLAY ' + n + ': ' + r.result + (r.caughtBy ? ' to ' + r.caughtBy : '') + '\n   ' + (d.join('\n   ') || '(no stat changed)'));
        if (await off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true)) { console.log('   (possession went over — stop)'); break; }
    }
    const diag = await off.page.evaluate(() => String(window._rb2p_readDiagLog()));
    console.log('feed: ' + JSON.stringify(diag.split(',').filter(l => /cFEED/.test(l))));
    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
