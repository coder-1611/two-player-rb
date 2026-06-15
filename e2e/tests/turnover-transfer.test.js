// V121: a turnover routed through a BARE internal _1c1 call (as the engine does
// for interceptions) must fire the bridge's possession-change logic — park the
// thrower (WAIT) and send the INT outcome — so possession actually transfers.
// Regression guard for "interceptions kept the ball with the thrower."
module.exports = {
    name: 'turnover via bare _1c1 sends INT + parks thrower (V121)',
    browser: true,
    match: true,
    async run({ page, H }) {
        const setup = await page.evaluate(() => {
            window.__sent = [];
            if (window._twoPlayer) {
                const orig = window._twoPlayer.send;
                window._twoPlayer.send = function (x) { window.__sent.push(x && x.type); try { return orig.apply(this, arguments); } catch (e) {} };
            }
            const em = RB.engineState();
            em.enginePossessingTeamIdx = em.engineUserTeamIdx;   // user has the ball
            em.engineDriveFsmStage = 2; em.enginePriorFsmStage = 8; // priorVy 8 → INT
            window._rb2p_userOutcomeSendInProgress = false;
            window._rb2p_userIsWaitingForOpponent = false;
            window._rb2p_lastOpponentOutcomeApplyMs = 0;          // bypass the 2s post-receive cooldown
            const hooked = !!(window._1c1 && window._1c1._p2p_hooked);
            try { _1c1(em.rawEngineMatch, _Sc2); } catch (e) { return { err: e.message, hooked }; }
            return { hooked, waiting: window._rb2p_userIsWaitingForOpponent };
        });
        await H.sleep(4500);   // the INT send is held ~4s for the pick-6 window
        const after = await page.evaluate(() => ({ sent: window.__sent, waiting: window._rb2p_userIsWaitingForOpponent }));
        const pass = setup.hooked && setup.waiting === true && after.sent.indexOf('INT') >= 0;
        return { pass, detail: 'hooked=' + setup.hooked + ' parked=' + setup.waiting + ' sent=' + JSON.stringify(after.sent) };
    }
};
