// e2e/v523-rosters.js — V523 (the owner: "make purdy a 5 star qb with max everything and update all the rosters for
// performance and roster shifts"): every team's roster as the game itself installs it (the lobby's VIEW ROSTER path,
// applyCustomRoster into the engine's roster list).
//   T1  each of the 32 teams installs its 12 TEAM_ROSTERS players — name, position, the four ratings and the face,
//       slot by slot, in the order QB RB WR WR TE K DL DL LB LB DB DB
//   T2  Brock Purdy (49ers QB): accuracy, arm, speed and stamina all 10 in the engine, and the engine's own player
//       rating (__B, what the stars show) is 10 of 10 = 5 stars
//   T3  nobody else has a 10, and every installed player's engine rating is 1-10
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const ORDER = [1, 2, 4, 4, 3, 10, 6, 6, 7, 7, 8, 8];

(async () => {
    console.log('=== V523 ROSTERS (2026, through week 4) + PURDY 5 STARS ===');
    await H.ensureServer();
    const br = await H.launchBrowser();
    try {
        const { page, errors } = await H.openPage(br);
        await page.waitForFunction(() => { try { return typeof window._rb2p_previewRoster === 'function' && _ft._gt() >= 0; } catch (e) { return false; } }, { timeout: 90000 });
        const bad = [], tens = [], ratings = [];
        let purdy = null;
        for (let uid = 0; uid < 32; uid++) {
            const ok = await page.evaluate(u => window._rb2p_previewRoster(u), uid);
            await sleep(500);
            const r = await page.evaluate(u => {
                const want = window._rb2p_TEAM_ROSTERS[u], ctrl = _si(64);
                let o = null; for (const k in ctrl) { o = ctrl[k]; break; }
                const got = [];
                for (let i = 0; i < _wi(o._Ln); i++) {
                    const p = _zi(o._Ln, i);
                    got.push({ fn: _Ai(p, 'fname'), ln: _Ai(p, 'lname'), pos: _Ai(p, 'position'), sk: _Ai(p, 'skill'), st: _Ai(p, 'strength'),
                               sp: _Ai(p, 'speed'), sa: _Ai(p, 'stamina'), skin: _Ai(p, 'skin'), fy: _Ai(p, 'face_y'), fx: _Ai(p, 'face_x'), stars: __B(null, null, p) });
                }
                return { want, got };
            }, uid);
            await page.evaluate(() => window._rb2p_exitRosterPreview());
            await sleep(300);
            if (!ok || r.want.length !== 12 || r.got.length !== 12) { bad.push(uid + ': ' + r.want.length + ' in the table, ' + r.got.length + ' installed'); continue; }
            // the roster screen sorts the engine's list by position, so each table player is found by name
            r.want.forEach((w, i) => {
                const g = r.got.find(x => x.fn === w.fn && x.ln === w.ln);
                if (w.pos !== ORDER[i]) bad.push(uid + '#' + i + ' ' + w.fn + ' ' + w.ln + ': out of slot order');
                if (!g) { bad.push(uid + '#' + i + ' ' + w.fn + ' ' + w.ln + ': not installed'); return; }
                const diff = ['pos', 'sk', 'st', 'sp', 'sa', 'skin', 'fy', 'fx'].filter(f => String(w[f]) !== String(g[f]));
                if (diff.length) bad.push(uid + '#' + i + ' ' + w.fn + ' ' + w.ln + ': ' + diff.join(','));
                ratings.push(g.stars);
                if ([g.sk, g.st, g.sp, g.sa].some(v => v >= 10) && !(uid === 22 && w.ln === 'Purdy')) tens.push(uid + ' ' + g.fn + ' ' + g.ln);
            });
            if (uid === 22) purdy = r.got.find(x => x.ln === 'Purdy') || null;
        }
        check('T1 all 32 teams install their 12 TEAM_ROSTERS players (name, position, ratings, face), the table in slot order',
              bad.length === 0, bad.slice(0, 8).join(' | '));
        check('T2 Brock Purdy: 10/10/10/10 in the engine and the engine rating 10 of 10 (5 stars)',
              !!purdy && purdy.fn === 'Brock' && purdy.ln === 'Purdy' && purdy.pos === 1 && [purdy.sk, purdy.st, purdy.sp, purdy.sa].every(v => v === 10) && purdy.stars === 10,
              JSON.stringify(purdy));
        check('T3 nobody else has a 10; every engine rating is 1-10 (' + ratings.length + ' players)',
              tens.length === 0 && ratings.length === 384 && ratings.every(v => v >= 1 && v <= 10), JSON.stringify({ tens, n: ratings.length }));
        if (errors.length) console.log('  page errors: ' + errors.slice(0, 3).join(' | '));
    } finally { try { await br.close(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
