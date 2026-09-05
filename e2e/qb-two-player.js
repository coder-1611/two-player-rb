// e2e/qb-two-player.js — start a REAL two-player game (two pages, Firebase) and
// let the QB bot play the offense phone through trusted mouse input until the
// quarterback has thrown two completions in a row. Screenshots of BOTH phones
// are saved along the way so the result can be watched, not just read.
//   node e2e/qb-two-player.js [maxPlays] [--easy]
const H = require('./harness');
const TP = require('./two-player');
const B = require('./qb-bot');
const fs = require('fs');
const sleep = H.sleep;
const MAX = Number(process.argv[2] || 12);
const EASY = process.argv.includes('--easy');
const OUT = process.env.SHOTS || '/private/tmp/claude-501/-Users-sohamsthitpragya-Projects/9832c0f9-d5cb-4e89-9e94-aee63ef2934e/scratchpad/qb-shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    let off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;
    console.log('offense = phone ' + off.role + ', watching = phone ' + def.role + (EASY ? ' (easy defense)' : ' (default difficulty)'));
    if (EASY) await off.page.evaluate(() => { window._rb2p_computeDefenseAggression = () => 10; const s = RB.engineState(); if (s) s.engineDefenseAggression = 10; });
    let shot = 0;
    const snapBoth = async (tag) => { shot++; const n = String(shot).padStart(2, '0') + '-' + tag; await off.page.screenshot({ path: OUT + '/' + n + '-offense.png' }); await def.page.screenshot({ path: OUT + '/' + n + '-watching.png' }); return n; };
    await snapBoth('before');
    const team = await off.page.evaluate(() => { const s = RB.engineState(); const n = s.engineTeamDisplayNames || []; return n[s.engineUserTeamIdx] || '?'; });
    console.log('QB team: ' + team);
    // play, screenshotting the ball in flight on both phones during each play
    const origPlayOne = B.playOne;
    const r = await B.playUntil(off.page, {
        maxPlays: MAX, consecutive: 2, maxMs: 300000,
        onAir: async (n) => { await snapBoth('play' + n + '-ball-in-air'); },
        log: (m) => console.log(m)
    });
    await snapBoth('after');
    // the commentary the players actually saw (the bridge's feed) and the box stats
    const diag = await off.page.evaluate(() => String(window._rb2p_readDiagLog()));
    const feed = diag.split(',').filter(l => /cFEED/.test(l)).slice(-6);
    console.log('feed lines: ' + JSON.stringify(feed));
    const stats = await off.page.evaluate(() => { const out = []; try { const c = _si(64); let to = null; for (const k in c) { if (c.hasOwnProperty(k)) { to = c[k]; break; } } const n = _wi(to._Ln); for (let i = 0; i < n; i++) { const p = _zi(to._Ln, i); if (p == null) continue; const pos = Number(_Ai(p, 'position')); if (pos === 1 || Number(_Ai(p, 'stat_receive')) > 0) out.push({ name: String(_Ai(p, 'lname')), pos, att: Number(_Ai(p, 'stat_attempts')) || 0, rec: Number(_Ai(p, 'stat_receive')) || 0, yds: Number(_Ai(p, 'stat_yards')) || 0 }); } } catch (e) {} return out; });
    console.log('box: ' + JSON.stringify(stats));
    console.log('screenshots in ' + OUT + ': ' + fs.readdirSync(OUT).join(', '));
    console.log('RESULT ' + JSON.stringify({ ok: r.ok, plays: r.plays, completions: r.completions, consec: r.consec, results: r.history.map(h => h.result + (h.caughtBy ? ':' + h.caughtBy : '')) }));
    await g.cleanup();
    process.exit(r.ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
