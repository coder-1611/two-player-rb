// e2e/v296-fixes.js — verify the V296 bug fixes against the REAL page/engine.
//
//   node e2e/v296-fixes.js
//
// T1 (#1)  a leftover final/{opp} must NOT pop the FINAL over the lobby, and
//          must be purged — previously it soft-locked the room for a rematch.
// T2 (#13) quarter>=5 with a NON-tied score (a mid-OT reload) must arm overtime
//          and must NOT declare game over — previously it ended the match ~1.2s
//          in, killing the answering possession.
// T3 (#2)  startMatch must leave no live/snap/box records from a prior match.
// T4 (#10) the drive-end score baseline must re-arm while off offense, so a
//          scoreless forced end can't inherit an earlier drive's points.
// T5 (#3)  a player slot must carry a session id (ownership token).

const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
const FB_DB = TP.FB_DB;

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  PASS  ' + name); }
    else    { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

async function fbPut(path, val) {
    await fetch(FB_DB + '/' + path + '.json',
                { method: 'PUT', body: JSON.stringify(val) });
}
async function fbGet(path) {
    const r = await fetch(FB_DB + '/' + path + '.json');
    return r.json();
}

(async () => {
    console.log('=== V296 FIX VERIFICATION ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();

    // ---------------------------------------------------------------- T1 (#1)
    console.log('\nT1 (#1): leftover final/{opp} must not hijack the lobby');
    const code = 'Z' + Math.random().toString(36).slice(2, 5).toUpperCase();
    await fetch(FB_DB + '/rooms/' + code + '.json', { method: 'DELETE' });
    // A finished game's leftovers, exactly as they'd survive in a reused room.
    await fbPut('rooms/' + code + '/final/a',
                { ts: Date.now() - 120000, team: 'Pittsburgh', score: 21, players: [] });
    await fbPut('rooms/' + code + '/players/a', { ts: Date.now(), ready: false, sid: 'other-device' });

    const p1 = await TP.openLobbyPage(browser, 'T1', {});
    const role1 = await TP.joinRoom('T1', p1.page, code);
    await sleep(4000);
    const t1 = await p1.page.evaluate(() => {
        const f = document.getElementById('rb-final');
        const l = document.getElementById('rb-lobby');
        return {
            finalShown: !!(f && getComputedStyle(f).display !== 'none'),
            lobbyView: l && l.getAttribute('data-active'),
            readyDisabled: (document.getElementById('rb-ready') || {}).disabled,
            gameOver: window._rb2p_gameOverReported === true
        };
    });
    check('FINAL overlay does NOT cover the lobby', t1.finalShown === false,
          'finalShown=' + t1.finalShown);
    check('game-over flag not set from a leftover', t1.gameOver === false);
    check('still in the room view (rematch reachable)', t1.lobbyView === 'room',
          'view=' + t1.lobbyView);
    const leftover = await fbGet('rooms/' + code + '/final/a');
    check('leftover final/a (opponent) purged from Firebase', leftover === null,
          'still=' + JSON.stringify(leftover));
    check('joined as role b (slot a was another device)', role1 === 'b', 'role=' + role1);
    const slot = await fbGet('rooms/' + code + '/players/' + role1);
    check('T5 (#3): my slot carries a session id', !!(slot && slot.sid),
          'slot=' + JSON.stringify(slot));
    await p1.page.close();
    await fetch(FB_DB + '/rooms/' + code + '.json', { method: 'DELETE' });

    // --------------------------------------------------------- T2/T3/T4 in-match
    console.log('\nT2 (#13) / T3 (#2) / T4 (#10): live match checks');
    const g = await TP.startTwoPlayerGame({ browser, logBridge: false });
    await sleep(4000);

    // T3: no leftover live/snap/box should exist right after a fresh start.
    const roomDump = await fbGet('rooms/' + g.code);
    check('T3 (#2): startMatch purged box/ (no prior-match residue)',
          !roomDump || roomDump.box === undefined,
          'box=' + JSON.stringify(roomDump && roomDump.box));

    // T2: simulate the mid-OT reload state — Q5, NOT tied, inOvertime lost.
    const drv = (await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true))
        ? g.b : g.a;
    await drv.page.evaluate(() => {
        const s = RB.engineState();
        window._rb2p_inOvertime = false;          // what a reload leaves behind
        window._rb2p_gameOverReported = false;
        s.engineQuarter = 5;                       // overtime
        s.setUserScore(14); s.setOpponentScore(21); // NOT tied: answer still owed
        s.engineMinutesLeft = 9; s.engineSecondsLeft = 0;
        // A real resume RESTORES the score, it does not "score" it. Re-baseline the
        // pick-6 score watcher the same way the live mirror / resume path does,
        // otherwise this synthetic jump reads as a defensive TD and trips the OT
        // walk-off (which is correct behavior for a genuine +6, just not for a
        // restore).
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();
    });
    await sleep(3500);   // detector needs only ~1.2s to have declared FINAL
    const t2 = await drv.page.evaluate(() => ({
        inOt: window._rb2p_inOvertime === true,
        over: window._rb2p_gameOverReported === true,
        q: Number(RB.engineState().engineQuarter)
    }));
    check('T2 (#13): overtime re-armed from quarter>=5 despite unequal score', t2.inOt === true);
    if (t2.over) {
        const who = { drv: [], wtr: [] };
        who.drv = drv.logs.filter(l => /FINAL|OT\]/.test(l)).slice(-8);
        const other = (drv === g.a) ? g.b : g.a;
        who.wtr = other.logs.filter(l => /FINAL|OT\]/.test(l)).slice(-8);
        const oth = await other.page.evaluate(() => ({
            over: window._rb2p_gameOverReported === true,
            inOt: window._rb2p_inOvertime === true,
            q: Number(RB.engineState().engineQuarter)
        }));
        console.log('    [debug] other device: over=' + oth.over + ' inOt=' + oth.inOt + ' q=' + oth.q);
        console.log('    [debug] driver logs: ' + JSON.stringify(who.drv));
        console.log('    [debug] other  logs: ' + JSON.stringify(who.wtr));
    }
    check('T2 (#13): did NOT declare game over (answering possession preserved)', t2.over === false,
          'gameOverReported=' + t2.over);
    check('T2 (#13): still in the OT period', t2.q === 5, 'q=' + t2.q);

    // T4: baseline must track my score while I am NOT on offense.
    const t4 = await drv.page.evaluate(async () => {
        const s = RB.engineState();
        window._rb2p_inOvertime = false;
        window._rb2p_userIsWaitingForOpponent = true;       // off offense
        await new Promise(r => setTimeout(r, 1200));        // watchdog ticks at 250ms
        // The baseline must equal my CURRENT score, so a later scoreless stall
        // computes delta 0 ('INT') instead of inheriting earlier drives' points.
        return { baseline: Number(window._rb2p_scoreBaseline),
                 myScore: Number(s.userScore) };
    });
    check('T4 (#10): score baseline re-arms to current score while off offense',
          t4.baseline === t4.myScore,
          'baseline=' + t4.baseline + ' score=' + t4.myScore);

    await g.cleanup();
    try { await browser.close(); } catch (e) {}

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
