// V131: a STALE final report (no ts, or ts before this match started) — a
// leftover in a reused room — must NOT end the game. Only a FRESH final does.
// Regression guard for "FINAL popped 3-0 mid-Q4 while the engine played on to 9-0."
const TP = require('../two-player');

function putFinal(code, role, body) {
    return fetch(TP.FB_DB + '/rooms/' + code + '/final/' + role + '.json',
                 { method: 'PUT', body: JSON.stringify(body) });
}
const readA = (page) => page.evaluate(() => {
    const fin = document.getElementById('rb-final');
    return { over: window._rb2p_gameOverReported === true,
             finalShown: !!(fin && fin.style.display !== 'none'),
             startMs: window._rb2p_matchStartMs || 0 };
});

module.exports = {
    name: 'stale final report is ignored; fresh one still ends the game (V131)',
    browser: false,
    async run({ H }) {
        const game = await TP.startTwoPlayerGame();
        try {
            await H.sleep(3000);
            const base = await readA(game.a.page);   // A's opponent is B → A reads final/b
            if (base.over || base.finalShown) return { pass: false, detail: 'game already over before injection' };

            // 1) STALE: ts well before match start → must be ignored.
            await putFinal(game.code, 'b', { score: 3, oppScore: 0, team: 'Pittsburgh', players: [], ts: base.startMs - 100000 });
            await H.sleep(2500);
            const afterStaleTs = await readA(game.a.page);

            // 2) STALE: no ts at all → must be ignored.
            await putFinal(game.code, 'b', { score: 3, oppScore: 0, team: 'Pittsburgh', players: [] });
            await H.sleep(2500);
            const afterNoTs = await readA(game.a.page);

            // The FINAL overlay being shown is the authoritative "game ended"
            // signal: the gameOverReported FLAG can re-arm to false on an early
            // 0-0 match (the detector's fresh-match re-arm), so we don't rely on it.
            const ignoredStale = !afterStaleTs.finalShown && !afterNoTs.finalShown;

            // 3) FRESH: ts = now → MUST end the game (positive control).
            await putFinal(game.code, 'b', { score: 21, oppScore: 7, team: 'Pittsburgh', players: [], ts: Date.now() });
            await H.sleep(2500);
            const afterFresh = await readA(game.a.page);
            const honoredFresh = afterFresh.finalShown;

            return {
                pass: ignoredStale && honoredFresh,
                detail: 'ignoredStale=' + ignoredStale +
                        ' (staleTs over=' + afterStaleTs.over + '/shown=' + afterStaleTs.finalShown +
                        ', noTs over=' + afterNoTs.over + '/shown=' + afterNoTs.finalShown + ')' +
                        ' honoredFresh=' + honoredFresh + ' (over=' + afterFresh.over + '/shown=' + afterFresh.finalShown + ')'
            };
        } finally {
            await game.cleanup();
        }
    }
};
