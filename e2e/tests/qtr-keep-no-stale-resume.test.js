// V128: a turnover (user loses the ball) must VOID any pending quarter-resume
// and drop the stale pre-rollover capture. Otherwise the QTR-KEEP watchdog later
// hands the drive back on the OLD down/yard (the "possession starts on 4th down,
// then an incomplete moves the ball 60 yards" turnover-on-downs bug).
module.exports = {
    name: 'turnover voids the stale quarter-resume capture (V128)',
    browser: true,
    match: true,
    async run({ page }) {
        const r = await page.evaluate(() => {
            const em = RB.engineState();
            em.enginePossessingTeamIdx = em.engineUserTeamIdx;        // user has the ball
            em.engineDriveFsmStage = 2; em.enginePriorFsmStage = 8;   // priorVy 8 → turnover/INT
            window._rb2p_userOutcomeSendInProgress = false;
            window._rb2p_userIsWaitingForOpponent  = false;
            window._rb2p_lastOpponentOutcomeApplyMs = 0;
            // Simulate a mid-drive quarter-resume capture being live (down 4 is
            // exactly the value that caused the instant turnover-on-downs).
            window._rb2p_quarterResumePending = true;
            window._rb2p_preRolloverYard = 25;
            window._rb2p_preRolloverDown = 4;
            window._rb2p_preRolloverToGo = 10;
            try { _1c1(em.rawEngineMatch, _Sc2); } catch (e) { return { err: e.message }; }
            return {
                resumePending: window._rb2p_quarterResumePending,
                down: window._rb2p_preRolloverDown,
                yard: window._rb2p_preRolloverYard,
                toGo: window._rb2p_preRolloverToGo,
                waiting: window._rb2p_userIsWaitingForOpponent
            };
        });
        const cleared = (r.resumePending === false && r.down === null &&
                         r.yard === null && r.toGo === null);
        return {
            pass: !r.err && cleared && r.waiting === true,
            detail: r.err || ('resumePending=' + r.resumePending + ' down=' + r.down +
                              ' yard=' + r.yard + ' waiting=' + r.waiting)
        };
    }
};
