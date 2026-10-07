// e2e/v498-clock-pin.js — V498 (room CGEW, 6 Oct; the owner: "soham's difficulty went up from hard to max in the middle
// of game while other guys remained the same, this was when same difficulty was selected. Also game ended early. This was
// a disaster please fix."). A real two-player game:
//   K1  a held record's re-stamp keeps the drive's clock (1:09) over a copied one (0:01) — the CGEW hand-off that gave the
//       other phone the ball with one second left — and still takes a real run-off of a few seconds
//   K2  a waiting phone whose clock is pinned near 0:00 while the driver's is far higher follows the driver within 9 s
//   K3  a quarter-change frame ("Q 0:00" pushed by the driver) does not pin the waiting phone's clock at 0:01
//   K4  another tab of the site picking a different difficulty does not change a running game's difficulty
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
// the COMMITTED clock: the clock law's own tick first (a mirror write can sit for up to 50 ms before it is judged)
const clk = page => page.evaluate(() => { window._rb2p_clockGateTick(); const em = RB.engineState(); return { q: Number(em.engineQuarter), s: Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft) }; });
const setClk = (page, s) => page.evaluate((s) => { window._rb2p_clockLicence('test: set the clock', 3000); const em = RB.engineState(); em.engineTickAllowance = 0; em.engineMinutesLeft = Math.floor(s / 60); em.engineSecondsLeft = s % 60; window._rb2p_clockGateTick(); }, s);
// the on-page diag ring keeps 11 lines: record every line from now on
const record = page => page.evaluate(() => { if (window.__k498) return; window.__k498 = []; const f = window._rb2p_diagLog; window._rb2p_diagLog = function (m) { try { window.__k498.push(String(m)); } catch (e) {} return f.apply(this, arguments); }; });
const lines = (page, re) => page.evaluate((re) => (window.__k498 || []).filter(l => new RegExp(re).test(l)), re);

(async () => {
    console.log('=== V498 THE CLOCK PIN (CGEW) AND A GAME\'S DIFFICULTY PER TAB ===');
    const g = await TP.startTwoPlayerGame({});
    let tab = null;
    try {
        await sleep(5000);
        const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
        const OFF = aWait ? g.b : g.a, DEF = aWait ? g.a : g.b;
        for (const P of [OFF, DEF]) { await P.page.evaluate(() => window._rb2p_clockGateTestArm()); await record(P.page); }
        // the driver's clock high enough that a quarter-change frame stands out (30 s+); the waiting phone set alike
        let c = await clk(OFF.page);
        if (c.s < 70) { await setClk(OFF.page, 95); await setClk(DEF.page, 95); await sleep(1500); c = await clk(OFF.page); }
        const q = c.q;
        console.log('  driver at Q' + q + ' ' + c.s + 's');

        // ---- K1: the re-stamp (on the waiting phone, whose engine is only a copy) ----
        const k1a = await DEF.page.evaluate((q) => {   // the engine 6 s below the record's 1:09 — a kick's run-off: taken
            const em = RB.engineState(); em.engineMinutesLeft = 1; em.engineSecondsLeft = 3;   // a lower clock: no licence (one would let K2's pin heal at once)
            const o = { type: 'PUNT', quarter: q, minutesLeft: 1, secondsLeft: 9 }; window._rb2p_restampOutcome(o); return o.minutesLeft * 60 + o.secondsLeft;
        }, q);
        const k1b = await DEF.page.evaluate((q) => {   // the engine at 0:01 — the copied pin: the record keeps 1:09
            window._rb2p_clockLicenceUntil = 0; const em = RB.engineState(); em.engineMinutesLeft = 0; em.engineSecondsLeft = 1; window._rb2p_clockGateTick();
            const o = { type: 'TD', quarter: q, minutesLeft: 1, secondsLeft: 9 }; window._rb2p_restampOutcome(o); return o.minutesLeft * 60 + o.secondsLeft;
        }, q);
        const k1d = await lines(DEF.page, 'SEND-RESTAMP kept');
        check('K1 a re-stamp keeps the drive\'s 1:09 over a copied 0:01, and still takes a real 6 s run-off',
              k1a === 63 && k1b === 69 && k1d.length >= 1, JSON.stringify({ k1a, k1b, k1d }));

        // ---- K2: the waiting phone is now pinned at 0:01 while the driver shows c.s — it follows within 9 s ----
        const t2 = Date.now(); let k2 = null;
        while (Date.now() - t2 < 9000) {
            const d = await clk(DEF.page), o = await clk(OFF.page);
            if (d.q === o.q && Math.abs(d.s - o.s) <= 2 && d.s > 30) { k2 = { afterMs: Date.now() - t2, def: d.s, off: o.s }; break; }
            await sleep(250);
        }
        const k2d = await lines(DEF.page, 'follows the driver');
        check('K2 a waiting clock pinned at 0:01 follows the driver\'s clock within 9 s', !!k2 && k2d.length >= 1, JSON.stringify({ k2, k2d: k2d.slice(-1) }));

        // ---- K3: a quarter-change frame from the driver ----
        const live = await TP.fbGet('rooms/' + g.code + '/live') || {};
        const offRole = Object.keys(live).find(r => live[r] && live[r].iHaveBall === true);
        const before3 = await clk(DEF.page);
        let k3 = { offRole, before: before3 };
        if (offRole) {
            const fake = Object.assign({}, live[offRole], { quarter: before3.q, minutesLeft: 0, secondsLeft: 0, iHaveBall: true, ts: Date.now() + 50 });
            await TP.fbPut('rooms/' + g.code + '/live/' + offRole, fake);
            let min3 = before3.s; const t3 = Date.now();
            while (Date.now() - t3 < 2500) { const d = await clk(DEF.page); min3 = Math.min(min3, d.s); await sleep(60); }
            k3 = Object.assign(k3, { min3, after: await clk(DEF.page), note: (await lines(DEF.page, 'quarter-change frame')).slice(-1) });
        }
        check('K3 a quarter-change frame (Q ' + before3.q + ' 0:00 from the driver) does not pin the waiting clock',
              !!offRole && k3.min3 >= before3.s - 3 && k3.after.s >= before3.s - 3 && k3.note.length === 1, JSON.stringify(k3));

        // ---- K4: another tab picks another difficulty; the running game keeps its own ----
        const k4a = await OFF.page.evaluate(() => ({ pref: window._rb2p_difficultyPref(), pin: sessionStorage.getItem('rb2p_difficulty'),
                                                   aggr: window._rb2p_computeDefenseAggression(), local: localStorage.getItem('rb2p_difficulty') }));
        const other = k4a.pref === 'max' ? 'easy' : 'max';
        tab = await TP.openLobbyPage(g.browser, 'C', {});   // the same browser: the site's saved settings are shared
        const clicked = await tab.page.evaluate((d) => { const b = document.querySelector('.diff-btn[data-dif="' + d + '"]'); if (b) { b.click(); return true; } localStorage.setItem('rb2p_difficulty', d); return false; }, other);
        await sleep(800);
        const k4b = await OFF.page.evaluate(() => ({ pref: window._rb2p_difficultyPref(), aggr: window._rb2p_computeDefenseAggression(), local: localStorage.getItem('rb2p_difficulty') }));
        check('K4 another tab picking ' + other.toUpperCase() + ' leaves the running game on ' + String(k4a.pref).toUpperCase(),
              k4a.pin === k4a.pref && k4b.local === other && k4b.pref === k4a.pref && k4b.aggr === k4a.aggr, JSON.stringify({ k4a, clicked, k4b }));
        await tab.page.evaluate((v) => { if (v == null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', v); }, k4a.local);

        const errs = [OFF, DEF].map(P => (P.errors || []).filter(e => !/_GL2/.test(e))).flat();
        check('no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    } catch (e) { fail++; console.log('  FAIL  ' + (e && e.stack || e)); }
    finally {
        try { if (tab) await tab.page.close(); } catch (e) {}
        try { await g.cleanup(); } catch (e) {}
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
