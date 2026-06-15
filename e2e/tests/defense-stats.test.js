// V120: defense stats are SPATIAL. (1) rb2pStarDefenders tags on-field
// defenders with _rb2pStar + _7j. (2) The collision observer credits the
// starred defender nearest the carrier at the downing edge (tackles were
// "always 0" with the old _l31/_r81 resolution). (3) collectOppDefStats reads
// obsTck. Places a starred defender on the ball and drives the kp 2→4 edge.
module.exports = {
    name: 'defense stats: starring + spatial tackle credit (V120)',
    browser: true,
    match: true,
    oppUid: 11,
    async run({ page, H }) {
        const tagged = await page.evaluate(() => {
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let df = 0, starred = 0, with7j = 0;
            for (let i = 0; i < all.length; i++) {
                const x = all[i]; if (!x || x._HL2 || !x._eE2 || x._eE2._fE2 !== 'obj_playerDF') continue;
                df++; if (x._rb2pStar) starred++; if (typeof x._7j === 'number' && x._7j > 0) with7j++;
            }
            return { df, starred, with7j, collect: typeof window._rb2p_collectOppDefStats };
        });
        // Put a starred defender on the ball, then drive the play-resolution edge.
        const setup = await page.evaluate(() => {
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let ball = null, starDf = null;
            for (let i = 0; i < all.length; i++) {
                const x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_ball' && !ball) ball = x;
                if (x._eE2._fE2 === 'obj_playerDF' && x._rb2pStar && !starDf) starDf = x;
            }
            if (!ball || !starDf) return { err: 'ball=' + !!ball + ' starDf=' + !!starDf };
            starDf.x = ball.x; starDf.y = ball.y;
            return { ok: true, star: starDf._rb2pStar.ln };
        });
        await page.evaluate(() => { RB.engineState().engineControllerState = 2; });
        await H.sleep(80);
        await page.evaluate(() => { RB.engineState().engineControllerState = 4; }); // carrier downed
        await H.sleep(120);
        const res = await page.evaluate(() => {
            const ods = window._rb2p_collectOppDefStats();
            return { total: ods.length, withTck: ods.filter(s => s.tck > 0) };
        });
        const pass = tagged.df === 11 && tagged.starred === 6 && tagged.with7j === 6 &&
                     setup.ok === true && res.withTck.length > 0;
        return { pass, detail: 'DF=' + tagged.df + ' starred=' + tagged.starred +
                               ' collected=' + res.total + ' withTck=' + JSON.stringify(res.withTck.map(s => s.ln + ':' + s.tck)) };
    }
};
