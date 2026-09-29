// e2e/probe-ot2pt.js — diagnostic: what does the engine credit when an overtime 2-point try reaches the end
// zone? (_hB(…, 2) is the engine's own "touchdown on this play" result; _t11 6 = a conversion.)
const H = require('./harness');
const sleep = H.sleep;
(async () => {
    const browser = await H.launchBrowser();
    const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
    await sleep(3000);
    const r = await page.evaluate(() => {
        const em = RB.engineState(), raw = em.rawEngineMatch, out = {};
        const run = (q) => {
            em.setUserScore(14); em.setOpponentScore(14); em.engineQuarter = q;
            em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineDownNumber = 6; em.engineYardsToGo = 2;
            const before = { poss: em.enginePossessingTeamIdx === em.engineUserTeamIdx };
            _hB(raw, _Sc2, 2);
            return { q, userScore: Number(em.userScore), oppScore: Number(em.opponentScore), stillMine: em.enginePossessingTeamIdx === em.engineUserTeamIdx, vy: Number(em.engineDriveFsmStage) };
        };
        out.regulation = run(4);
        out.overtime = run(5);
        return out;
    });
    console.log(JSON.stringify(r, null, 1));
    await browser.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
