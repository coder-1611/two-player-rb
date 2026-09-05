// e2e/qb-game.js — a WHOLE two-player game played by the QB bot on both phones,
// in a visible window (HEADFUL=1), 1-minute quarters, default difficulty.
// Screenshots go to $SHOTS every ~25s and at the end; a play-by-play prints.
//   HEADFUL=1 node e2e/qb-game.js
const H = require('./harness');
const TP = require('./two-player');
const B = require('./qb-bot');
const fs = require('fs');
const sleep = H.sleep;
const OUT = process.env.SHOTS || '/private/tmp/claude-501/-Users-sohamsthitpragya-Projects/9832c0f9-d5cb-4e89-9e94-aee63ef2934e/scratchpad/qb-game-shots';
const QMINS = Number(process.env.QMINS || 1);
const DIFF = process.env.DIFF || '';   // lobby difficulty: easy | medium | hard | max (empty = the lobby default)
fs.mkdirSync(OUT, { recursive: true });

(async () => {
    // 1-minute quarters: pick the length in the lobby on the host before READY (it syncs to the guest)
    const g = await TP.startTwoPlayerGame({ beforeReady: async (page, label) => {
        if (label !== 'a') return;
        await page.evaluate((m) => { const b = document.querySelector('[data-len="' + m + '"]'); if (b) b.click(); }, QMINS);
        if (DIFF) await page.evaluate((d) => { const b = document.querySelector('[data-dif="' + d + '"]'); if (b) b.click(); }, DIFF);
        await sleep(600);
    } });
    await sleep(4000);
    const pages = [g.a, g.b];
    const teams = {};
    for (const p of pages) teams[p.role] = await p.page.evaluate(() => { const s = RB.engineState(); return (s.engineTeamDisplayNames || [])[s.engineUserTeamIdx] || '?'; });
    const qm = await g.a.page.evaluate(() => window._rb2p_quarterMins);
    const dif = await g.a.page.evaluate(() => (window._rb2p_difficultyPref ? window._rb2p_difficultyPref() : '?') + ' (aggression ' + (window._rb2p_computeDefenseAggression ? window._rb2p_computeDefenseAggression() : '?') + ')');
    console.log('game on: phone a = ' + teams.a + ', phone b = ' + teams.b + ', quarters ' + qm + ' min, difficulty ' + dif);
    let shot = 0;
    const snapBoth = async (tag) => { shot++; const n = String(shot).padStart(2, '0') + '-' + tag; for (const p of pages) { try { await p.page.screenshot({ path: OUT + '/' + n + '-' + p.role + '.png' }); } catch (e) {} } return n; };
    await snapBoth('kickoff');
    const r = await B.playGame(pages, {
        maxMs: 14 * 60000,
        onTick: () => snapBoth('t' + Math.round((Date.now()) / 1000) % 100000),
        onAir: (role, n) => snapBoth('play' + n + '-' + role + '-air'),
        log: (m) => console.log(m)
    });
    await snapBoth('final');
    const box = {};
    for (const p of pages) box[p.role] = await p.page.evaluate(() => { const out = []; try { const c = _si(64); let to = null; for (const k in c) { if (c.hasOwnProperty(k)) { to = c[k]; break; } } const n = _wi(to._Ln); for (let i = 0; i < n; i++) { const q = _zi(to._Ln, i); if (q == null) continue; const pos = Number(_Ai(q, 'position')); const att = Number(_Ai(q, 'stat_attempts')) || 0, rec = Number(_Ai(q, 'stat_receive')) || 0; if (pos === 1 || rec > 0) out.push({ name: String(_Ai(q, 'lname')), pos, att, rec, yds: Math.round(Number(_Ai(q, 'stat_yards')) || 0), td: (Number(_Ai(q, 'stat_touchdowns')) || 0) }); } } catch (e) {} return out; });
    console.log('FINAL ' + JSON.stringify(r.finals) + ' plays ' + r.plays + ' attempts ' + r.attempts + ' completions ' + r.completions + ' in ' + Math.round(r.ms / 1000) + 's');
    console.log('box a (' + teams.a + '): ' + JSON.stringify(box.a));
    console.log('box b (' + teams.b + '): ' + JSON.stringify(box.b));
    console.log('shots: ' + OUT);
    console.log('RESULT ' + JSON.stringify({ plays: r.plays, completions: r.completions, attempts: r.attempts, finals: r.finals }));
    if (process.env.KEEP_OPEN === '1') { console.log('window stays open 60s'); await sleep(60000); }
    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
