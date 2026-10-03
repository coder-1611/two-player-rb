// e2e/v441-retype.js — OPEN #0b (2 Oct: 17 drive ends in 14 rooms — EEQG, KLHQ, CGQB …): V394 typed EVERY drive end
// within 60 s of the scorer's conversion offer as the touchdown's kickoff ("TD"), also a NEW drive's turnover — so the
// receiver started at a kickoff-return spot instead of the turnover's (EEQG: the turnover at B's +16 → A at its own 27).
//
// Real downs (the QB bot): the scorer (OFF) scores from the half-yard line (the lobby's EASY defense), kicks the 1-point
// try, kicks off; the partner punts it back (the 4th-down dialog); then OFF, staged at its own 45, fails a real 4th & 40
// (the lobby's own defense again) — all within 60 s of OFF's conversion offer.
//   T1  OFF's second drive end ships as what it is — OTHER, a turnover — not TD (V440: TD)
//   T2  the partner then starts at the turnover spot (OFF's 4th down is staged at its own 45, so that is the partner's
//       +5 area), 1st & 10 — not at a kickoff return (its own 15–35)
// A run where the touchdown or a turnover did not happen, or OFF's drive end came 60 s after the offer, is SETUP (exit 3).
const L = require('./horn-lib');
const QB = L.QB;
const sleep = L.sleep;
let pass = 0, fail = 0, setup = '';
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const stage = (page, y, down, toGo, clk) => page.evaluate(({ y, down, toGo, clk }) => {
    const s = RB.engineState(); if (!s) return 'no state';
    s.engineMinutesLeft = Math.floor(clk / 60); s.engineSecondsLeft = clk % 60; s.engineTickAllowance = 0;
    return window._rb2p_forceUserOffenseDrive(y, true, { down, toGo });
}, { y, down, toGo, clk });
const buttons = page => page.evaluate(QB.IN.clickButtons);
async function pressLabel(page, re) { const list = await buttons(page); const b = list.find(x => re.test(String(x.label || ''))); if (!b) return null; const cal = await QB.calibrate(page); await QB.pressGui(page, cal, b); return b.label; }
const live = async (P, ms) => L.until(async () => { const s = await L.st(P.page); return { ok: !!(s && !s.wait && s.ball > 0), s }; }, ms || 30000, 500);

(async () => {
    console.log('=== V441 A NEW DRIVE AFTER A TRY ENDS AS WHAT IT IS ===');
    const g = await L.TP.startTwoPlayerGame({});
    try {
        await sleep(6000);
        const o = await L.offense(g, 40000); if (!o.ok) { setup = 'nobody has the ball'; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        await L.setQuarter([OFF.page, DEF.page], 1, 170);
        for (const P of [OFF, DEF]) await P.page.evaluate(() => { try { window.__v441Diff = localStorage.getItem('rb2p_difficulty'); localStorage.setItem('rb2p_difficulty', 'easy'); if (window._rb2p_applyOpDifficulty) window._rb2p_applyOpDifficulty(); } catch (e) {} });
        await OFF.page.evaluate(() => { window._rb2p_computeDefenseAggression = () => 10; try { RB.engineState().engineDefenseAggression = 10; } catch (e) {} });
        const t0 = await OFF.page.evaluate(() => Date.now());
        // 1. the touchdown (a straight dive from the half-yard line; re-staged until it scores, at most 4 tries)
        let scored = false;
        for (let i = 0; i < 6 && !scored; i++) {
            const su0 = ((await L.st(OFF.page)) || {}).su;
            await stage(OFF.page, 49.5, 1, 0.5, 170 - i * 5); await sleep(900);
            let r = await L.realDown(OFF.page, { buttons: false, straight: true }); if (!r) r = await L.realDown(OFF.page, { buttons: true, straight: true });
            await sleep(2000);
            scored = (Number(((await L.st(OFF.page)) || {}).su) - Number(su0)) >= 6;
            console.log('  dive ' + (i + 1) + ': ' + JSON.stringify(r && { result: r.result, gain: r.gainYds }) + ' scored ' + scored);
        }
        if (!scored) { setup = 'the goal-line dive never scored'; return; }
        // 2. the 1-point try, kicked for real
        const tOffer = await OFF.page.evaluate(() => Number(window._rb2p_lastConvModalMs) || 0);
        const pt = await L.until(async () => ({ ok: (await buttons(OFF.page)).some(b => /^1 ?pt/i.test(b.label || '')) }), 15000, 500);
        for (let i = 0; i < 3 && pt.ms !== null; i++) {   // press 1 PT until its button is gone, then kick for real
            if (!(await buttons(OFF.page)).some(b => /^1 ?pt/i.test(b.label || ''))) break;
            await pressLabel(OFF.page, /^1 ?pt/i); await sleep(1200);
        }
        if (pt.ms !== null) { try { await QB.kickOne(OFF.page, await QB.calibrate(OFF.page), {}); } catch (e) {} }
        // the touchdown is in: back to the lobby's own defense setting (EASY gave up a 69-yard run on a "4th & 40")
        for (const P of [OFF, DEF]) await P.page.evaluate(() => { try { const v = window.__v441Diff; if (v == null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', v); if (window._rb2p_applyOpDifficulty) window._rb2p_applyOpDifficulty(); } catch (e) {} });
        await OFF.page.evaluate(() => { try { delete window._rb2p_computeDefenseAggression; } catch (e) {} });
        // 3. the partner has the kickoff and PUNTS it back (4th & 15, the engine's own dialog — M4's method)
        const d1 = await live(DEF, 45000); if (d1.ms === null) { setup = 'the partner never got the kickoff'; return; }
        await sleep(800); const clkD = ((await L.st(DEF.page)) || {}).clk || 120;
        await stage(DEF.page, -25, 4, 15, clkD); await sleep(1200);
        const punt = await pressLabel(DEF.page, /^punt$/i);
        console.log('  partner 4th & 15: ' + (punt ? 'punt chosen' : 'no punt button: ' + JSON.stringify((await buttons(DEF.page)).map(b => b.label))));
        if (!punt) { setup = 'the partner had no punt button'; return; }
        // 4. OFF has the ball back (a turnover on downs), fails a real 4th & 40 of its own
        const o2 = await live(OFF, 30000); if (o2.ms === null) { setup = 'the partner\'s 4th down did not hand the ball back'; return; }
        // staged at its own 45 (y −5): a turnover there hands the partner the ball at OUR 45 (+5), far from any kickoff
        // return (its own 15–35), so T2 can tell the two apart
        // the spot first (a drive staged AT 4th down brings up the engine's Punt dialog), then the down on that formation
        await sleep(800); const clkNow = ((await L.st(OFF.page)) || {}).clk || 120; await stage(OFF.page, -5, 1, 10, clkNow); await sleep(900);
        await L.setDown(OFF.page, { down: 4, toGo: 40 }); await sleep(700);
        const tSnap2 = await OFF.page.evaluate(() => Date.now());
        let ro = await L.realDown(OFF.page, { buttons: false });
        console.log('  scorer 4th & 40: ' + JSON.stringify(ro && { result: ro.result, gain: ro.gainYds }));
        const d2 = await live(DEF, 30000);
        await sleep(3500);
        const auO = Object.values(await L.TP.fbGet('rooms/' + g.code + '/audit/' + OFF.role) || {}).filter(e => e.t >= t0).sort((a, b) => a.t - b.t);
        const auD = Object.values(await L.TP.fbGet('rooms/' + g.code + '/audit/' + DEF.role) || {}).filter(e => e.t >= t0).sort((a, b) => a.t - b.t);
        const sendsO = auO.filter(e => e.k === 'send').map(e => ({ type: e.type, t: e.t, y: e.y }));
        const end2 = auO.filter(e => e.k === 'send' && e.t > tSnap2)[0];
        const lastSpot = auO.filter(e => e.k === 'snap' && e.t <= tSnap2 + 2000).pop();
        const firstD = auD.filter(e => e.k === 'snap' && end2 && e.t > end2.t)[0];
        console.log('  offer at +' + ((tOffer - t0) / 1000).toFixed(1) + ' s; scorer sends ' + JSON.stringify(sendsO.map(x => x.type + '@+' + ((x.t - t0) / 1000).toFixed(1))) + '; its 2nd drive end ' +
                    (end2 ? end2.type + ' at +' + ((end2.t - tOffer) / 1000).toFixed(1) + ' s after the offer, y ' + end2.y : 'none') + '; partner\'s first snap after it ' + JSON.stringify(firstD && { y: firstD.y, d: firstD.d }));
        if (!end2) { setup = 'the scorer\'s 4th down did not end its drive'; return; }
        if (!ro) { setup = 'the scorer\'s 4th down was never snapped'; return; }
        // the drive end was BUILT before the 4 s hold; the V394 window is the build time (≈ send − 4 s)
        if (end2.t - 4000 - tOffer >= 60000) { setup = 'the scorer\'s second drive ended ' + Math.round((end2.t - tOffer) / 1000) + ' s after the offer (V394 only acts within 60 s)'; return; }
        check('T1 the scorer\'s NEW drive, ended within 60 s of its try, ships as a turnover (OTHER), not as the touchdown\'s kickoff', end2.type === 'OTHER', JSON.stringify({ type: end2.type, afterOffer: end2.t - tOffer }));
        // the hand-off's spot is in the receiver's frame; OFF failed at its own ~45, so the partner's ball belongs near
        // OUR 45 (+5); a kickoff return would put it at its own 15–35 (−15…−35)
        const dNow = await L.st(DEF.page);
        check('T2 the partner starts where the ball was turned over, 1st & 10 — not at a kickoff return',
              !!(dNow && !dNow.wait && Number(dNow.d) === 1 && Number(end2.y) > -12 && Math.abs(Number(dNow.y) - Number(end2.y)) <= 3), JSON.stringify({ partner: dNow && { y: dNow.y, d: dNow.d, wait: dNow.wait }, handoffY: end2.y }));
    } finally {
        for (const P of [g.a, g.b]) await P.page.evaluate(() => { try { const v = window.__v441Diff; if (v == null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', v); } catch (e) {} }).catch(() => {});
        await g.cleanup();
        if (setup) console.log('  SETUP ' + setup + ' — inconclusive');
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (setup ? ' (SETUP INCONCLUSIVE)' : '') + ' ===');
        process.exit(setup ? 3 : (fail ? 1 : 0));
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
