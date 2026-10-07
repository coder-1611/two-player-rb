// e2e/v429-passline.js — the stats screen's passing line is the passes thrown (UZGV, 2026-10-01: Purdy 19/23 for 324
// yards showed 30/45). A real two-player game; the QB bot throws real passes through trusted mouse input (easy
// defense); the bridge runs as shipped. The truth is the play-by-play the phone itself recorded (each play's
// settle: a completion, an incompletion) — the stats screen's line (collectBoxScore, what the FINAL shows) must
// equal it. On V428 every catch also added an attempt (and some a completion) to the QB.
//
//   P1  the QB's c/a on the stats screen = the completions / attempts of the plays (an interception is an attempt)
//   P2  the passing yards are untouched (the sum of the completions' gains, as before)
//   P3  the receivers' catches add up to the completions
//   P4  (V508) each receiver's catches are the completions the play-by-play credited to him (SCGU: Kittle 2 for 3)
const H = require('./harness');
const TP = require('./two-player');
const B = require('./qb-bot');
const L = require('./horn-lib');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V429 PASS LINE ===');
    const g = await TP.startTwoPlayerGame({ beforeReady: async (page) => { await page.evaluate(() => { const b = document.querySelector('.diff-btn[data-dif="easy"]'); if (b) b.click(); }); } });   // V508: EASY (MAX's tier tightens the coverage the bot throws into)
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    await off.page.evaluate(() => { window._rb2p_computeDefenseAggression = () => 10; const s = RB.engineState(); if (s) s.engineDefenseAggression = 10; });
    const t0 = await off.page.evaluate(() => Date.now());
    let cal = await B.calibrate(off.page), ints = 0, plays = 0;
    const settles = async () => Object.values(await TP.fbGet('rooms/' + g.code + '/audit/' + off.role) || {}).filter(e => e && e.k === 'settle' && e.t >= t0);
    for (let n = 1; n <= 16; n++) {
        for (let i = 0; i < 60; i++) { const ok = await off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true && !!RB.engineState() && Number(RB.engineState().engineControllerState) === 0).catch(() => false); if (ok) break; await sleep(500); }
        if (await off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true)) break;
        await B.clickButtons(off.page, cal, () => {});
        await L.setDown(off.page, { down: 1, toGo: 10 });   // V508: the drive goes on until there are completions to compare
        const r = await B.playOne(off.page, cal, { log: () => {} });
        plays++;
        if (r.result === 'intercepted') ints++;
        await sleep(4500);
        const st = await settles();
        if (st.filter(e => e.type === 'pass').length >= 3) break;
    }
    await sleep(3000);
    const st = await settles();
    const comp = st.filter(e => e.type === 'pass'), inc = st.filter(e => e.type === 'incomplete');
    const box = await off.page.evaluate(() => { const r = window._rb2p_collectBoxScore(); return r && r.players; });
    const qb = (box || []).find(p => p.pos === 'QB'), recs = (box || []).filter(p => p.pos === 'WR' || p.pos === 'TE' || p.pos === 'RB');
    // an interception ends the play without a settle; the engine's own INT count (not touched by any c/a rule) adds it
    const intLine = qb ? Number((/(\d+) INT\b/.exec(qb.line || '') || [])[1]) || 0 : 0;
    const want = { c: comp.length, a: comp.length + inc.length + Math.max(ints, intLine), yds: comp.reduce((s, e) => s + (Number(e.gain) || 0), 0) };
    const m = qb && /^(\d+)\/(\d+) · (\d+) PASS YDS/.exec(qb.line || '');
    const got = m ? { c: Number(m[1]), a: Number(m[2]), yds: Number(m[3]) } : null;
    const catches = recs.reduce((s, p) => s + (Number((/(\d+) REC\b/.exec(p.line || '') || [])[1]) || 0), 0);
    console.log('  ' + plays + ' plays: ' + JSON.stringify({ settles: st.map(e => e.type + (e.gain != null ? ' ' + e.gain : '')), want, qbLine: qb && qb.line, catches }));
    // the bot is a real player: a drive with no completion proves nothing either way — said, not failed
    if (!want.c) { console.log('  SKIP  no completion was thrown on this drive (the check needs one) — nothing to compare'); }
    else {
        check('P1 the stats screen shows the QB\'s real ' + want.c + '/' + want.a, got && got.c === want.c && got.a === want.a, JSON.stringify({ got, want }));
        check('P2 the passing yards are the completions\' gains (' + Math.round(want.yds) + ')', got && Math.abs(got.yds - want.yds) <= comp.length, JSON.stringify({ got: got && got.yds, want: want.yds }));
        check('P3 the receivers\' catches add up to the completions', catches === want.c, JSON.stringify({ catches, completions: want.c }));
        // V508 (SCGU: Kittle caught 3, the stats screen said 2; Jennings 3, it said 5): each receiver's catches are the
        // completions the play-by-play credited to HIM
        const byName = {}; comp.forEach(e => { const k = String(e.name || '').toUpperCase(); if (k) byName[k] = (byName[k] || 0) + 1; });
        const per = recs.map(p => ({ name: p.name, rec: Number((/(\d+) REC\b/.exec(p.line || '') || [])[1]) || 0 }));
        const wrong = Object.keys(byName).filter(k => { const r = per.find(p => String(p.name || '').toUpperCase().includes(k)); return !r || r.rec !== byName[k]; })
            .concat(per.filter(p => p.rec > 0 && !Object.keys(byName).some(k => String(p.name || '').toUpperCase().includes(k))).map(p => p.name));
        check('P4 each receiver\'s catches are the completions credited to him', wrong.length === 0, JSON.stringify({ plays: byName, box: per }));
    }
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
