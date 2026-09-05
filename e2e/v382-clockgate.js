// e2e/v382-clockgate.js — THE CLOCK LAW: within a quarter the clock only goes down.
//
//   T1  the engine's own countdown runs untouched (no refusals while it ticks)
//   T2  a write that moves the clock UP in the same quarter is refused within
//       150ms, the clock is put back, and the writer is named
//   T3  +1 second (rounding) is tolerated
//   T4  MHUY: a stale, higher clock pushed by the live opponent is refused on
//       the parked phone — through the real mirror
//   T5  XEDG: a handoff record carrying a higher clock is refused when applied
//       — through the real outcome applier — and the drive still starts
//   T6  a quarter change resets the law (the engine's 2:00 stands)
//   T7  a licensed upward write stands
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const clk = page => page.evaluate(() => { const em = RB.engineState(); return Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft); });
const stats = page => page.evaluate(() => { const s = window._rb2p_clockGateStats(); return { q: s.q, accepted: s.accepted, refusals: s.refusals, passes: s.passes }; });
const since = (page, marker) => page.evaluate((marker) => { const s = String(window._rb2p_readDiagLog()); const i = s.lastIndexOf(marker); return i < 0 ? '' : s.slice(i); }, marker);
const mark = (page, m) => page.evaluate((m) => { window._rb2p_diagLog(m); }, m);

(async () => {
    console.log('=== V382 THE CLOCK LAW ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;
    for (const pg of [off, def]) await pg.page.evaluate(() => window._rb2p_clockGateTestArm());

    // ---- T1: the countdown is untouched ----
    // The offense's clock runs while a play is live; make one run.
    const r0 = await stats(off.page);
    const c0 = await clk(off.page);
    await off.page.evaluate(() => { const em = RB.engineState(); em.engineTickAllowance = 0; });
    await sleep(3200);
    const c1 = await clk(off.page);
    const r1 = await stats(off.page);
    const t1 = { c0, c1, refusalsBefore: r0.refusals, refusalsAfter: r1.refusals, passes: r1.passes - r0.passes };
    console.log('  T1: ' + JSON.stringify(t1));
    check('T1 the engine\'s own countdown runs untouched (no refusals)', t1.refusalsAfter === t1.refusalsBefore && t1.passes > 30 && c1 <= c0, JSON.stringify(t1));

    // ---- T2: an upward write is refused and the writer named ----
    await mark(off.page, 'T2-START');
    const t2 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        const before = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        em.engineMinutesLeft = Number(em.engineMinutesLeft) + 1;          // +60s, same quarter: the XEDG shape
        const t0 = Date.now(); let seenUp = false, backAt = null;
        while (Date.now() - t0 < 1500) {
            await new Promise(r => setTimeout(r, 25));
            const now = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
            if (now > before + 1) seenUp = true;
            if (seenUp && now <= before + 1) { backAt = Date.now() - t0; break; }
        }
        const after = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        return { before, after, seenUp, backAt };
    });
    const d2 = await since(off.page, 'T2-START');
    const who2 = (/CLOCKGATE refused [0-9:]+ — kept [0-9:]+ \(Q\d, writer (L\d+|[^,)]+)/.exec(d2) || [])[1];
    console.log('  T2: ' + JSON.stringify(Object.assign(t2, { writer: who2 })));
    // (the judge runs every 50ms — the transient is usually gone before the first sample)
    check('T2 a same-quarter upward write is refused within 150ms and the writer is named',
          t2.after <= t2.before + 1 && (t2.backAt == null || t2.backAt < 150) && /^L\d+$/.test(String(who2)) && /CLOCKGATE refused 3:00 — kept 2:00/.test(d2), JSON.stringify(t2) + ' ' + d2.slice(-160));

    // ---- T3: +1 second is tolerated ----
    const t3 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        const before = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        const r0 = window._rb2p_clockGateStats().refusals;
        em.engineSecondsLeft = Number(em.engineSecondsLeft) + 1;
        await new Promise(r => setTimeout(r, 200));
        const after = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        return { before, after, refusals: window._rb2p_clockGateStats().refusals - r0 };
    });
    console.log('  T3: ' + JSON.stringify(t3));
    check('T3 one second of rounding is tolerated (no refusal)', t3.refusals === 0 && t3.after >= t3.before, JSON.stringify(t3));

    // ---- T4: MHUY — the live mirror pushes a stale, higher clock onto the parked phone ----
    await mark(def.page, 'T4-START');
    const defBefore = await clk(def.page);
    await off.page.evaluate(() => {   // the LIVE phone's clock jumps up, licensed (it is the stale-clock stand-in)
        const em = RB.engineState(); window._rb2p_clockLicence('test: stale opponent clock', 3000);
        em.engineMinutesLeft = Number(em.engineMinutesLeft) + 1;
    });
    await sleep(2500);                                                 // several 500ms live pushes
    const defAfter = await clk(def.page);
    const d4 = await since(def.page, 'T4-START');
    const t4 = { defBefore, defAfter, refused: /CLOCKGATE refused/.test(d4) };
    console.log('  T4: ' + JSON.stringify(t4));
    check('T4 a stale higher clock from the live opponent is refused on the parked phone (the mirror)', t4.defAfter <= t4.defBefore + 1 && t4.refused, JSON.stringify(t4) + ' ' + d4.slice(-160));

    // ---- T5: XEDG — a handoff record with a higher clock is applied; the clock stays ----
    await mark(def.page, 'T5-START');
    const t5 = await def.page.evaluate(async () => {
        const em = RB.engineState();
        // The idle game sits at 2:00; put this phone at 0:30 first (licensed), so a
        // record carrying 1:23 is the XEDG shape: same quarter, 53 seconds UP.
        window._rb2p_clockLicence('test: park at 0:30');
        em.engineMinutesLeft = 0; em.engineSecondsLeft = 30;
        window._rb2p_clockGateTick(); window._rb2p_clockLicenceUntil = 0;  // accepted = 0:30, licence closed at once
        await new Promise(r => setTimeout(r, 900));                        // the mirror's higher clock is refused from here on
        const before = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        const q = Number(em.engineQuarter);
        const hi = 83;
        window._twoPlayer.receive({ type: 'OTHER', ts: Date.now(), yardLine: 10, ownSide: true,
            scoreUser: Number(em.opponentScore) || 0, scoreOpp: Number(em.userScore) || 0,
            quarter: q, minutesLeft: Math.floor(hi / 60), secondsLeft: hi % 60, message: 'stale clock handoff' });
        const t0 = Date.now(); let liveAt = null;
        while (Date.now() - t0 < 6000) { await new Promise(r => setTimeout(r, 100)); if (window._rb2p_userIsWaitingForOpponent === false) { liveAt = Date.now() - t0; break; } }
        await new Promise(r => setTimeout(r, 300));
        const after = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        return { before, hi, after, liveAt, running: window._rb2p_realDriveRunning() };
    });
    const d5 = await since(def.page, 'T5-START');
    console.log('  T5: ' + JSON.stringify(t5));
    check('T5 a handoff carrying a higher clock is applied without raising the clock, and the drive starts',
          t5.liveAt != null && t5.after <= t5.before + 1 && /CLOCKGATE refused/.test(d5), JSON.stringify(t5) + ' ' + d5.slice(-160));

    // ---- T6: a quarter change resets the law ----
    await mark(off.page, 'T6-START');
    const t6 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        const q = Number(em.engineQuarter);
        em.engineQuarter = q + 1; em.engineMinutesLeft = 2; em.engineSecondsLeft = 0;   // what the engine does at a rollover
        await new Promise(r => setTimeout(r, 200));
        const after = Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft);
        return { q: q + 1, after, stQ: window._rb2p_clockGateStats().q };
    });
    const d6 = await since(off.page, 'T6-START');
    console.log('  T6: ' + JSON.stringify(t6));
    check('T6 a quarter change resets the law — the fresh 2:00 stands', t6.after === 120 && t6.stQ === t6.q && /CLOCKGATE epoch Q/.test(d6), JSON.stringify(t6));

    // ---- T7: a licensed upward write stands ----
    const t7 = await off.page.evaluate(async () => {
        const em = RB.engineState();
        em.engineMinutesLeft = 1; em.engineSecondsLeft = 0;
        await new Promise(r => setTimeout(r, 150));
        window._rb2p_clockLicence('test: licensed');
        em.engineMinutesLeft = 1; em.engineSecondsLeft = 45;
        await new Promise(r => setTimeout(r, 200));
        return { after: Number(em.engineMinutesLeft) * 60 + Number(em.engineSecondsLeft) };
    });
    console.log('  T7: ' + JSON.stringify(t7));
    check('T7 a licensed upward write stands', t7.after === 105, JSON.stringify(t7));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
