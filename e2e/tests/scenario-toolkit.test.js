// V133: exercises the scenario director (scenario.js) end-to-end on a live
// two-player game. Demonstrates the reusable primitives later scenario tests
// (end-of-quarter possession, turnovers, TDs, OT) build on:
//   1. manually CHOOSE A TIME       — D.setClock(page, {q,min,sec})
//   2. director-driven TURNOVER     — D.forceTurnover hands the ball across devices
const TP = require('../two-player');
const D  = require('../scenario');

module.exports = {
    name: 'scenario director: set clock + force a turnover across devices (V133)',
    browser: false,
    async run({ H }) {
        const game = await TP.startTwoPlayerGame();
        try {
            const off = await D.offensePage(game);
            const def = D.otherPage(game, off);
            // Freeze both bots so they don't snap/undo the setup.
            await D.pauseBoth(game);

            // 1) Manually choose a time — Q2, 1:07 — and confirm it took.
            await D.setClock(off, { q: 2, min: 1, sec: 7 });
            await H.sleep(400);
            const t = await D.state(off);
            const timeOk = (t.quarter === 2 && t.min === 1 && t.sec === 7);

            // 2) Force the offense to turn it over; possession must move to the
            //    OTHER device (the INT send is held ~4s, then synced over Firebase).
            const offBefore = await D.state(off);
            await D.forceTurnover(off);
            const offNowWaiting = await D.waitForState(off, s => s.waiting === true, 6000);
            const defGotBall    = await D.waitForState(def, s => s.waiting === false && s.possByUser, 14000);

            const turnoverOk = !!(offBefore.possByUser && offNowWaiting && defGotBall);
            return {
                pass: timeOk && turnoverOk,
                detail: 'setClock→Q' + t.quarter + ' ' + t.min + ':' + String(t.sec).padStart(2, '0') +
                        ' (ok=' + timeOk + ') | turnover: offWaiting=' + !!offNowWaiting +
                        ' defGotBall=' + !!defGotBall + ' (ok=' + turnoverOk + ')'
            };
        } finally {
            await game.cleanup();
        }
    }
};
