// e2e/v398-games.js — the barrier between games in a reused room.
//
//   T1  a match start writes rooms/{code}/games/{ms} (ts, by, qmins, ver)
//   T2  the audit stream carries a 'game' entry from BOTH phones
//   T3  the previous game's `audited` marker is gone after a match start
//   T4  the diag log says GAME-START
//   T5  the checker splits a room with two markers into two games (tools/audit-rules.js)
const H = require('./harness');
const TP = require('./two-player');
const R = require('../tools/audit-rules.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V398 GAME BARRIER ===');
    // plant a stale `audited` marker under the code the harness is about to use — the match start must clear it
    const g = await TP.startTwoPlayerGame({ beforeReady: async (page, label, code) => {
        if (label !== 'a') return;
        await TP.fbPut('rooms/' + code + '/audited', { ts: 1, flagged: 0, planted: true });
        const back = await TP.fbGet('rooms/' + code + '/audited');
        if (!back || back.planted !== true) throw new Error('could not plant the audited marker');
    } });
    await sleep(6000);
    const code = g.code;
    const games = await TP.fbGet('rooms/' + code + '/games');
    const keys = Object.keys(games || {});
    const rec = keys.length ? games[keys[0]] : null;
    check('T1 a match start writes rooms/' + code + '/games/{ms} with ts, by, qmins, ver', keys.length === 1 && rec && typeof rec.ts === 'number' && rec.by === 'a' && typeof rec.qmins === 'number' && /^V\d+$/.test(String(rec.ver)), JSON.stringify(games));

    const [audA, audB] = await Promise.all([TP.fbGet('rooms/' + code + '/audit/a'), TP.fbGet('rooms/' + code + '/audit/b')]);
    const gameEntries = r => Object.values(r || {}).filter(e => e && e.k === 'game');
    const ga = gameEntries(audA), gb = gameEntries(audB);
    check('T2 both phones put a \'game\' entry on the audit stream', ga.length === 1 && gb.length === 1 && typeof ga[0].ms === 'number' && typeof ga[0].qmins === 'number', JSON.stringify({ a: ga, b: gb }));

    const audited = await TP.fbGet('rooms/' + code + '/audited');
    check('T3 the stale `audited` marker planted before READY is gone after the match start', audited == null, JSON.stringify(audited));

    const diag = await g.a.page.evaluate(() => String(window._rb2p_readDiagLog()));
    check('T4 the diag log says GAME-START with the quarter length', /GAME-START qmins=\d+/.test(diag), diag.slice(-200));

    // T5: the checker on the real stream + a second synthetic marker 5 minutes later
    const tl = R.toTimeline({ a: audA || {}, b: audB || {} });
    const t1 = tl[tl.length - 1].t + 300000;
    const tl2 = tl.concat([{ role: 'a', key: 'x1', t: t1, k: 'game', ms: t1, qmins: 1, ver: 'V398' }, { role: 'b', key: 'x2', t: t1 + 500, k: 'game', ms: t1, qmins: 1, ver: 'V398' },
                           { role: 'a', key: 'x3', t: t1 + 3000, k: 'snap', q: 1, clk: 60, y: -25, d: 1, tg: 10, poss: 1, dir: 1 }]).sort((x, y) => x.t - y.t);
    const res = R.audit(tl2, {});
    const story = R.narrate(tl2, {}).filter(s => s.kind === 'game');
    check('T5 the checker splits the room into two games at the second marker and the story draws the barrier', R.gameStarts(tl2).length === 2 && res.games === 2 && story.length === 1 && /GAME 2 OF 2/.test(story[0].text), JSON.stringify({ starts: R.gameStarts(tl2).length, games: res.games, story: story.map(s => s.text) }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
