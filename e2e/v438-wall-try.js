// e2e/v438-wall-try.js — the 35 s conversion wall never throws away a try the player has just chosen
// (PKXS, RVLS, EKRA, ZNSO, CGQB — 2 Oct 2026, V431/V433: a real try lost in each).
//
// What happened (RVLS, Q3 0:14): a touchdown; the 1 PT / 2 PT choice sat on screen past 35 s, so the wall waited (V415,
// "the conversion choice is on screen"). The player tapped 1 PT at 08:36.2, the engine set the kick at the 35 (08:36.3),
// and at 08:36.5 the wall shipped "resolving the conversion as MISSED" — the kick never happened. PKXS 0.7 s after the
// tap, EKRA 1.0 s, CGQB 1.5 s, ZNSO 2.7 s.
// Why: the wall's two holds — the choice ON screen (V415, 90 s from the offer) and a launched try (V406) — leave the
// moment between them uncovered; the V415 hold looks again every 5 s, so the first look after the tap fired.
//
//   W0  setup: a real touchdown (a goal-line run through trusted input), the choice offered, the wall's V415 hold seen,
//       1 PT taken (the engine's own button, trusted input — the kick set at the 35) while that hold still runs
//   W1  the wall does not resolve the try while the player lines up the kick (5 s, a player reading the meter)
//   W2  the kick is launched and the try ends by football (the scorer's kickoff hand-off), not by the wall
//   W3  the score after the try is the touchdown plus at most the kick's point, and the hand-off carries that score
const L = require('./horn-lib');
const TP = L.TP, QB = L.QB;
const sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const diagOf = page => page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '');
async function buttons(page) { return page.evaluate(QB.IN.clickButtons).catch(() => []); }
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

(async () => {
    console.log('=== V438 THE WALL WAITS FOR A CHOSEN TRY ===');
    const g = await TP.startTwoPlayerGame({});
    let inconclusive = '', restoreDiff = false;
    // the test profiles persist: the lobby setting goes back the way it was
    const restore = async () => { if (restoreDiff) for (const P of [g.a, g.b]) await P.page.evaluate(() => { try { const v = window.__wallPrevDiff; if (v == null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', v); } catch (e) {} }).catch(() => {}); };
    try {
        await sleep(6000);
        const o = await L.offense(g, 30000);
        if (!o.ok) { inconclusive = 'no offense'; throw new Error(inconclusive); }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        // the goal-line run must score to be this test: an easy defense for this one down (the horn tests' setup knob)
        await OFF.page.evaluate(() => { window._rb2p_computeDefenseAggression = () => 10; try { RB.engineState().engineDefenseAggression = 10; } catch (e) {} });
        for (const P of [OFF, DEF]) await P.page.evaluate(() => { try { window.__wallPrevDiff = localStorage.getItem('rb2p_difficulty'); localStorage.setItem('rb2p_difficulty', 'easy'); if (window._rb2p_applyOpDifficulty) window._rb2p_applyOpDifficulty(); } catch (e) {} });
        restoreDiff = true;
        let td = false, su0 = null;
        for (let i = 0; i < 5 && !td; i++) {
            for (let k = 0; k < 3; k++) {
                console.log('  staged: ' + await stage(OFF.page, 49.5, 1, 0.5, 90)); await sleep(900);
                const sy = await L.st(OFF.page); if (sy && Math.abs(Number(sy.y) - 49.5) <= 1) break;
            }
            su0 = ((await L.st(OFF.page)) || {}).su;
            let r = await L.realDown(OFF.page, { buttons: false, straight: true });
            if (!r) r = await L.realDown(OFF.page, { buttons: true, straight: true });
            await sleep(1500);
            const su1 = ((await L.st(OFF.page)) || {}).su;
            td = Number(su1) - Number(su0) >= 6;
            console.log('  the goal-line run: ' + JSON.stringify(r && r.result) + ', score ' + su0 + ' -> ' + su1);
        }
        if (!td) { inconclusive = 'the goal-line run did not score in 5 tries'; throw new Error(inconclusive); }
        const offer = await L.until(async () => ({ ok: (await buttons(OFF.page)).some(b => /^1 ?pt/i.test(b.label || '')) }), 10000, 250);
        const tOffer = Date.now();
        if (offer.ms === null) { inconclusive = 'no 1 PT / 2 PT choice on screen'; throw new Error(inconclusive); }
        const suTD = ((await L.st(OFF.page)) || {}).su;
        try { await OFF.page.bringToFront(); } catch (e) {}   // the scorer's tab is the one in front (a background tab draws no frames)
        console.log('  the choice is on screen (score ' + suTD + '); the player looks at it past the 35 s mark');
        // the wall's V415 hold: its first look after 35 s says "the conversion choice is on screen"
        const held = await L.until(async () => ({ ok: /PAT-INV wall waits — the conversion choice is on screen/.test(await diagOf(OFF.page)) }), 50000, 150);
        if (held.ms === null) { inconclusive = 'the wall never looked at the choice (no V415 hold line in 50 s)'; throw new Error(inconclusive); }
        const tHold = Date.now();
        // the tap on 1 PT — again if the engine did not take it (a press is read at step time)
        let lab = null, tTap = null;
        for (let i = 0; i < 3 && !tTap; i++) {
            const t = Date.now(); lab = await pressLabel(OFF.page, /^1 ?pt/i);
            const kickSet = await L.until(async () => ({ ok: !!(await OFF.page.evaluate(QB.IN.snap).catch(() => ({}))).kick }), 1500, 100);
            if (kickSet.ms !== null) tTap = t;
        }
        if (!tTap) { inconclusive = 'the 1 PT press never set the kick'; throw new Error(inconclusive); }
        console.log('  the wall held at its look; 1 PT taken ' + ((tTap - tHold) / 1000).toFixed(1) + ' s later, ' + ((tTap - tOffer) / 1000).toFixed(1) + ' s after the offer (' + lab + ')');
        // the wall looks every 5 s while it holds (V415, until 90 s after the offer): any 5.5 s after the tap holds a look
        check('W0 setup: a real touchdown, the choice past 35 s (the wall\'s hold seen), 1 PT taken with the hold still running', !!lab && tTap - tOffer < 80000, JSON.stringify({ lab, afterHold: tTap - tHold, afterOffer: tTap - tOffer }));
        // a player reads the kick meter for a few seconds (RVLS: the wall fired 0.3 s after the tap; ZNSO 2.7 s)
        await sleep(5500);
        const dMid = await diagOf(OFF.page);
        const walled = /PAT-INV 35s wall — resolving the conversion as MISSED|PAT-INV force-release after 35s|35s wall — the try is MISSED/.test(dMid);
        check('W1 the wall does not resolve the try while the player lines up the kick', !walled, (dMid.match(/[^,]*35s wall[^,]*/g) || []).slice(0, 2).join(' | '));
        // the kick, through the meter — again if the ball never left the tee (on a loaded machine the bot's press can miss
        // the meter's frame; a player presses again too)
        let k = null, kicks = 0, tryAt = 0;
        for (; kicks < 3 && !tryAt; kicks++) {
            try { await OFF.page.bringToFront(); } catch (e) {}
            try { k = await QB.kickOne(OFF.page, await QB.calibrate(OFF.page), {}); } catch (e) { k = { result: 'err ' + e.message }; }
            const la = await L.until(async () => { const v = await OFF.page.evaluate(() => Number(window._rb2p_convTrySnappedMs) || 0).catch(() => 0); return { ok: v > tTap, v }; }, 3000, 200);
            if (la.ms !== null) tryAt = la.v;
            else if (!(await OFF.page.evaluate(QB.IN.snap).catch(() => ({}))).kick) break;   // the kick scene is gone
        }
        console.log('  the kick: ' + JSON.stringify(k && { result: k.result }) + ' in ' + kicks + ' attempt(s); launched ' + (tryAt ? ((tryAt - tTap) / 1000).toFixed(1) + ' s after the tap' : 'never'));
        // a normal touchdown's try leaves no made/missed record of its own (only a pick-six try and the wall write one):
        // the try's launch is the ball leaving rest on down 6 (convTrySnappedMs), and its end is the scorer's kickoff
        const res = await L.until(async () => {
            const au = await L.audit(g.code, OFF.role);
            const ko = au.filter(e => e.k === 'send' && /^(TD|KICKOFF)$/.test(e.type) && e.t >= tTap).sort((x, y) => x.t - y.t)[0];
            const wall = au.filter(e => e.k === 'conv' && e.wall === true && e.t >= tTap - 1000)[0];
            return { ok: !!ko || !!wall, ko, wall };
        }, 25000, 1000);
        if (!tryAt) tryAt = await OFF.page.evaluate(() => Number(window._rb2p_convTrySnappedMs) || 0).catch(() => 0);
        const dl = await OFF.page.evaluate(() => (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).slice(-60)).catch(() => []);
        console.log('  the scorer\'s log since the offer:\n    ' + dl.map(String).filter(x => /PAT|CONV|wall|kick|KY|modal|SEND|TD|LIVE|WAIT|tap/i.test(x)).slice(-30).join('\n    '));
        const suEnd = await L.until(async () => { const s = await L.st(OFF.page); return { ok: !!s && s.su != null, su: s && s.su }; }, 3000, 300);
        console.log('  the try launched ' + (tryAt ? ((tryAt - tTap) / 1000).toFixed(1) + ' s after the tap' : 'never') + '; the wall ' + (res.wall ? 'RESOLVED it' : 'did not act') +
                    '; the scorer\'s hand-off ' + JSON.stringify(res.ko && { type: res.ko.type, su: res.ko.su }) + '; score ' + suTD + ' -> ' + suEnd.su);
        check('W2 the kick was launched and the try ended by football (the scorer kicked off), not by the wall', tryAt > tTap && !res.wall && !!res.ko, JSON.stringify({ tryAfterTap: tryAt - tTap, wall: res.wall || null, ko: res.ko && res.ko.type }));
        check('W3 the score after the try is the touchdown plus at most the kick\'s 1 point, and the hand-off carries it', !!res.ko && [suTD, suTD + 1].includes(Number(suEnd.su)) && Number(res.ko.su) === Number(suEnd.su),
              JSON.stringify({ suTD, suEnd: suEnd.su, sent: res.ko && res.ko.su }));
    } catch (e) {
        if (!inconclusive) { console.error('FATAL', e); await restore(); await g.cleanup(); process.exit(2); }
    }
    await restore();
    await g.cleanup();
    if (inconclusive) { console.log('\n=== INCONCLUSIVE: ' + inconclusive + ' ==='); process.exit(3); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
