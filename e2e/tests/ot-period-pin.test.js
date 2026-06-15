// V117: during OT the engine is pinned in ONE never-ending period — the quarter
// counter (_Wy) must not climb past 5 (the "@quarter_6" / period-loop bug) and
// the clock must not expire (the clock-0 rollover freeze). Force a bad state and
// confirm it's clamped back.
module.exports = {
    name: 'OT pins quarter=5 + keeps the clock alive (V117)',
    browser: true,
    match: true,
    async run({ page, H }) {
        await page.evaluate(() => {
            window._rb2p_inOvertime = true;
            const em = RB.engineState();
            em.engineQuarter = 6;          // simulate the engine rolling into "@quarter_6"
            em.engineMinutesLeft = 0;      // simulate the clock having expired
            em.engineSecondsLeft = 0;
        });
        await H.sleep(1500);   // per-frame _Ib1 pin + 300ms coordinator
        const after = await page.evaluate(() => {
            const em = RB.engineState();
            return { q: em.engineQuarter, min: em.engineMinutesLeft };
        });
        const pass = after.q === 5 && after.min >= 5;
        return { pass, detail: 'quarter=' + after.q + ' min=' + after.min };
    }
};
