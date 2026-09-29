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
        // A tackle: the ball CARRIER (an offensive player) sits on the ball and the starred
        // defender makes the stop 20px away. (V419: this test used to put the defender ON the
        // ball — since the INT-return guard a defender nearest the ball is a turnover returner
        // being downed, which is credited to nobody, so the old setup could never pass.)
        const setup = await page.evaluate(() => {
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let ball = null, starDf = null, carrier = null;
            for (let i = 0; i < all.length; i++) {
                const x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_ball' && !ball) ball = x;
                if (x._eE2._fE2 === 'obj_playerDF' && x._rb2pStar && !starDf) starDf = x;
                if (x._eE2._fE2 === 'obj_playerOF' && !carrier) carrier = x;
            }
            if (!ball || !starDf || !carrier) return { err: 'ball=' + !!ball + ' starDf=' + !!starDf + ' carrier=' + !!carrier };
            carrier.x = ball.x; carrier.y = ball.y;
            starDf.x = ball.x + 20; starDf.y = ball.y;
            return { ok: true, star: starDf._rb2pStar.ln };
        });
        // The credit keys on the BALL's own state (_kp) changing to 4 = BALL_DOWN (the engine's
        // controller state is a different field). Hold each value across several frames so the
        // 16ms observer sees live (2) and then down (4) even if the engine rewrites it per frame.
        // (the engine re-places its players every frame, so the carrier and the tackler are pinned
        //  beside the ball for the whole edge — as they are at a real tackle)
        const holdBallKp = (kp, ms) => page.evaluate((kp, ms) => new Promise(res => {
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            const ball = all.find(x => x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball');
            const star = all.find(x => x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerDF' && x._rb2pStar);
            const car = all.find(x => x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF');
            const t0 = performance.now();
            (function tick() {
                if (ball) { ball._kp = kp; if (car) { car.x = ball.x; car.y = ball.y; } if (star) { star.x = ball.x + 20; star.y = ball.y; } }
                if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res();
            })();
        }), kp, ms);
        await holdBallKp(2, 120);
        await holdBallKp(4, 150);                               // carrier downed
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
