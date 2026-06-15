// V110/V112: the OT kickoff must put the RECEIVER on a live, playable drive out
// of the between-quarters park (Vy=13) — the hold-loop overpowers the engine's
// per-frame re-park and kills the kickoff "Receive" button. Regression guard
// for the "both devices stuck on WAITING" OT-start deadlock.
module.exports = {
    name: 'OT kickoff gives the receiver a live drive (V110/V112)',
    browser: true,
    match: true,
    async run({ page, H }) {
        const before = await page.evaluate(() => {
            const em = RB.engineState();
            // Simulate the OT-start park: regulation ended tied → Vy=13 at Wy=5, clock 0.
            em.engineQuarter = 5; em.engineMinutesLeft = 0; em.engineSecondsLeft = 0;
            em.engineDriveFsmStage = 13; em.engineControllerState = 1;
            window._rb2p_inOvertime = true; window._rb2p_otMyPoss = 0; window._rb2p_otOppPoss = 0;
            window._rb2p_userIsWaitingForOpponent = true;
            const myRole = (em.engineUserTeamIdx === 0) ? 'a' : 'b';
            return { myRole };
        });
        // Fire the kickoff with THIS device as the receiver, then let the ~1.5s hold finish.
        await page.evaluate(rr => window._rb2p_applyOtKickoff(rr, rr), before.myRole);
        await H.sleep(2500);
        const after = await page.evaluate(() => {
            const em = RB.engineState();
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let balls = 0, kicks = 0, players = 0;
            for (let i = 0; i < all.length; i++) {
                const x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_ball') balls++;
                if (x._eE2._fE2 === 'obj_btn_kickoff') kicks++;
                if (x._eE2._fE2 === 'obj_playerOF' || x._eE2._fE2 === 'obj_playerDF') players++;
            }
            return { vy: em.engineDriveFsmStage, kp: em.engineControllerState,
                     waiting: window._rb2p_userIsWaitingForOpponent,
                     onOffense: em.enginePossessingTeamIdx === em.engineUserTeamIdx,
                     balls, kicks, players };
        });
        const pass = after.vy === 2 && after.kp === 2 && after.waiting === false &&
                     after.onOffense && after.balls > 0 && after.kicks === 0;
        return { pass, detail: 'vy=' + after.vy + ' kp=' + after.kp + ' waiting=' + after.waiting +
                               ' ball=' + after.balls + ' kickoffBtn=' + after.kicks + ' players=' + after.players };
    }
};
