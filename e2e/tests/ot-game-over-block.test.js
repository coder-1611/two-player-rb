// V116: during OT the bridge owns game-over. The engine's native end-match
// (_1d1 = s_end_match → the "X win the Retro Bowl" season flow) must be
// SWALLOWED — calling it as the engine does internally should leave the match
// alive (still STATE_MATCH) and parked at the dead stage 4, NOT tear it down.
module.exports = {
    name: 'engine native game-over (_1d1) blocked during OT (V116)',
    browser: true,
    match: true,
    async run({ page }) {
        const r = await page.evaluate(() => {
            const out = {};
            out.inMatchBefore = (_ft._gt() === 17);
            out.hookInstalled = !!(window._1d1 && window._1d1._p2p_otGuard);
            window._rb2p_inOvertime = true;
            window._rb2p_gameOverReported = false;
            const em = RB.engineState();
            em.engineDriveFsmStage = 18;                 // the game-over-eval stage
            try { _1d1(em.rawEngineMatch, _Sc2, 1); out.called = 'ok'; } // exactly as the engine calls it
            catch (e) { out.called = 'ERR:' + e.message; }
            out.inMatchAfter = (_ft._gt() === 17);
            out.vyAfter = RB.engineState().engineDriveFsmStage;
            return out;
        });
        const pass = r.hookInstalled && r.inMatchBefore && r.inMatchAfter && r.vyAfter === 4;
        return { pass, detail: 'hook=' + r.hookInstalled + ' stillInMatch=' + r.inMatchAfter + ' vy=' + r.vyAfter };
    }
};
