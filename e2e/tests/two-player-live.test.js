// V129: a REAL two-player simulation. Two headless pages join the same room over
// the live Firebase RTDB, ready up, and launch a match — then we assert the
// cross-device coordination the single-page tests can't reach:
//   • A claims slot 'a', B claims slot 'b'
//   • both pages are in a live engine match
//   • teams resolve to the defaults (A=San Francisco 22, B=Pittsburgh 11) and
//     each device sees the other's team as its opponent (mirrored)
//   • possession is COMPLEMENTARY — exactly one device is on offense and the
//     other is waiting (you can't have both driving at once)
//   • neither page threw a non-benign error
//
// browser:false so the runner doesn't hand us its single page — this test owns
// its browser + both pages (and calls ensureServer itself when run alone).
const TP = require('../two-player');

module.exports = {
    name: 'two simulated players join one room and launch a match (V129)',
    browser: false,
    async run({ H }) {
        const game = await TP.startTwoPlayerGame({ logBridge: false });
        try {
            // Let the opening kickoff settle so possession is assigned on both.
            await game.waitFor(game.a.page,
                () => { try { return RB.isEngineInMatchRoom(); } catch (e) { return false; } }, 5000);
            await H.sleep(4000);

            // Poll until possession is complementary (one waiting, one not) — the
            // opening kickoff takes a moment to resolve on both devices.
            let A, B, complementary = false;
            for (let i = 0; i < 20; i++) {
                A = await TP.snapshot(game.a.page);
                B = await TP.snapshot(game.b.page);
                complementary = (A.waiting !== B.waiting);
                if (complementary) break;
                await H.sleep(700);
            }

            const rolesOk   = (game.a.role === 'a' && game.b.role === 'b');
            const inMatchOk  = (A.inMatch && B.inMatch);
            // Defaults: A=SF(22), B=Pitt(11); each sees the other as opponent.
            const teamsOk    = (A.myUid === 22 && A.oppUid === 11 &&
                                B.myUid === 11 && B.oppUid === 22);
            const errorsOk   = (game.a.errors.length === 0 && game.b.errors.length === 0);

            const pass = rolesOk && inMatchOk && teamsOk && complementary && errorsOk;
            const detail =
                'room=' + game.code +
                ' roles=' + game.a.role + '/' + game.b.role +
                ' inMatch=' + A.inMatch + '/' + B.inMatch +
                ' teams A(' + A.myUid + 'v' + A.oppUid + ') B(' + B.myUid + 'v' + B.oppUid + ')' +
                ' waiting A=' + A.waiting + ' B=' + B.waiting + ' (complementary=' + complementary + ')' +
                (errorsOk ? '' : ' ERRORS A=' + JSON.stringify(game.a.errors) + ' B=' + JSON.stringify(game.b.errors));
            return { pass, detail };
        } finally {
            await game.cleanup();
        }
    }
};
