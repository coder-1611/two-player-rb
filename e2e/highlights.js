// e2e/highlights.js — V458: the daily highlights (tools/highlights/daily.js) on real recorded plays of a two-player game.
// The owner: "everyday at 6 pm a sonnet 5.5 to look at all the plays that happened in the 24 hr period and choose the top
// 5 most impressive ... Also make sure it actually runs". The judge here is a stand-in (e2e/highlights-stub-judge.js):
// this test proves the machinery, the 6 pm LaunchAgent runs the real one.
//   H1  the recorder keeps the play's track (v2: the roster with names; the ball and every player, each frame), and a
//       play ends at the dead ball, not at the 30 s cap
//   H2  the track is read right: from the positions alone (20 px a yard) the carrier's gain matches the engine's own
//       settle within 3 yards, and the carrier is the player the settle names
//   H3  a day's run: every play measured (plays.tsv), the short list written up (candidates.md) and drawn — a contact
//       sheet per short-listed play — next to JUDGE.md, for the judge
//   H4  the judge's top5.json becomes the day's README and videos (360p here), in rank order
//   H5  a judge that writes nothing (asked twice) leaves the measured order — and the README and status say so
//   H6  a day with no plays: the README says so, with the recording guard's state
//   H7  a day already done is not redone (the 6:30 pm second chance exits at once)
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
const F = require('../tools/highlights/features.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const rec = page => page.evaluate(() => window._rb2p_view && window._rb2p_view.rec()).catch(() => null);
const TOOLS = path.join(__dirname, '..', 'tools');

(async () => {
    console.log('=== V458 THE DAILY HIGHLIGHTS ===');
    const g = await TP.startTwoPlayerGame({});
    const code = g.code;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'highlights-')), arch = path.join(tmp, 'archive'), out = path.join(tmp, 'out'), runs = path.join(tmp, 'runs');
    const daily = (extra, env) => { try { return execFileSync('node', [path.join(TOOLS, 'highlights', 'daily.js'), '--archive', arch, '--out', out, '--runs', runs, '--no-firebase', '--include-test'].concat(extra),
        { env: Object.assign({}, process.env, env || {}), encoding: 'utf8', timeout: 600000 }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + ' EXIT ' + e.status; } };
    try {
        await sleep(6000);
        for (const P of [g.a, g.b]) await P.page.evaluate(() => { window._rb2p_recForce = true; });
        // ---- three real downs: a run, a pass, a run ----
        for (let i = 0; i < 3; i++) {
            const o = await L.offense(g, 40000); if (!o.ok) { console.log('  (down ' + i + ': nobody has the ball)'); continue; }
            const before = await rec(o.off.page);
            const d = await L.realDown(o.off.page, { buttons: true, pass: i === 1 });
            const st = await L.until(async () => { const r = await rec(o.off.page); return { ok: !!(r && before && r.uploads > before.uploads), r }; }, 30000, 500);
            console.log('  down ' + i + ': ' + JSON.stringify(d && { result: d.result, gain: d.gainYds }) + ' stored ' + JSON.stringify(st.r && st.r.last));
            await sleep(1500);
        }
        const stored = await TP.fbGet('rooms/' + code + '/plays') || {};
        const plays = [].concat(...Object.values(stored).map(r => Object.values(r || {})));
        console.log('  stored plays: ' + plays.length);
        // ---- H1: the track, and the end at the dead ball ----
        const tracks = plays.map(p => ({ p, tr: F.decodeTrack(p) }));
        const h1 = tracks.map(({ p, tr }) => ({ v: tr && tr.v, roster: tr && tr.roster.length, named: tr ? tr.roster.filter(r => r[3]).length : 0, frames: tr && tr.frames.length,
                                               end: p.end, s: Math.round(p.ms / 100) / 10, dead: tr ? tr.frames.some(f => [4, 6, 7, 8, 11].includes(f[4])) : false }));
        console.log('  tracks: ' + JSON.stringify(h1));
        check('H1 every play keeps its track (v2: 22+ players, some named, the ball each frame) and ends at the dead ball, not the 30 s cap',
              plays.length >= 2 && h1.every(x => x.v === 2 && x.roster >= 22 && x.named >= 1 && x.frames >= 10 && x.end !== 'cap' && x.s < 20), JSON.stringify(h1));
        // ---- H2: positions to yards: the carrier's gain from the track alone vs the engine's settle ----
        const h2 = plays.filter(p => p.res && p.res.type && p.res.gain != null && p.res.type !== 'handoff').map(p => {
            const q = JSON.parse(JSON.stringify(p)); delete q.res.gain;
            const f = F.features(q), fr = F.features(p);
            return { engine: Number(p.res.gain), track: f.gain, name: p.res.name, hero: fr.hero };
        });
        console.log('  gains: ' + JSON.stringify(h2));
        check('H2 from the positions alone (20 px a yard) the gain matches the engine\'s settle within 3 yd, and the carrier is the one it names',
              h2.length >= 1 && h2.every(x => Math.abs(x.track - x.engine) <= 3 && String(x.hero).toUpperCase() === String(x.name).toUpperCase()), JSON.stringify(h2));
        // ---- the plays move to a throw-away archive, as the hourly job moves them ----
        const mv = execFileSync('node', [path.join(TOOLS, 'plays-archive.js'), '--room', code, '--min-age-ms', '0', '--no-flag'], { env: Object.assign({}, process.env, { PLAYS_ARCHIVE: arch }), encoding: 'utf8', timeout: 120000 });
        console.log('  ' + mv.trim().split('\n').pop());
        // ---- H3 + H4: a day's run with the stand-in judge ----
        const o1 = daily(['--judge-cmd', 'node ' + path.join(__dirname, 'highlights-stub-judge.js'), '--height', '360']);
        console.log(o1.trim().split('\n').map(l => '    | ' + l).join('\n'));
        const day = fs.existsSync(runs) ? fs.readdirSync(runs)[0] : null, rd = day ? path.join(runs, day) : null, od = day ? path.join(out, day) : null;
        const tsvRows = rd && fs.existsSync(path.join(rd, 'plays.tsv')) ? fs.readFileSync(path.join(rd, 'plays.tsv'), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).length - 1 : -1;
        const sheets = rd && fs.existsSync(path.join(rd, 'sheets')) ? fs.readdirSync(path.join(rd, 'sheets')).filter(f => /\.jpg$/.test(f)) : [];
        const cand = rd && fs.existsSync(path.join(rd, 'candidates.md')) ? (fs.readFileSync(path.join(rd, 'candidates.md'), 'utf8').match(/^## /gm) || []).length : 0;
        const st1 = rd ? JSON.parse(fs.readFileSync(path.join(rd, 'status.json'), 'utf8')) : {};
        check('H3 every play measured (plays.tsv), the short list written up and drawn (a sheet each), JUDGE.md beside them',
              tsvRows === plays.length && cand >= 1 && sheets.length === cand && fs.existsSync(path.join(rd, 'JUDGE.md')) && sheets.every(f => fs.statSync(path.join(rd, 'sheets', f)).size > 20000),
              JSON.stringify({ tsvRows, plays: plays.length, cand, sheets: sheets.length }));
        const top = rd ? JSON.parse(fs.readFileSync(path.join(rd, 'top5.json'), 'utf8')) : { picks: [] };
        const readme = od && fs.existsSync(path.join(od, 'README.md')) ? fs.readFileSync(path.join(od, 'README.md'), 'utf8') : '';
        const vids = od && fs.existsSync(od) ? fs.readdirSync(od).filter(f => /\.mp4$/.test(f)).sort() : [];
        const want = Math.min(5, plays.length);
        const vprobe = vids.length ? execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height,r_frame_rate', '-of', 'csv=p=0', path.join(od, vids[0])], { encoding: 'utf8' }).trim() : '';
        check('H4 the judge\'s picks become the README and the videos (360p, 60 fps), in rank order',
              st1.ok === true && st1.judge === 'test command' && top.picks.length === want && vids.length === want && vids.every((v, i) => v.startsWith((i + 1) + ' - ')) &&
              top.picks.every(p => readme.includes(p.headline)) && /^360,60\/1/.test(vprobe),
              JSON.stringify({ ok: st1.ok, judge: st1.judge, picks: top.picks.length, want, vids, vprobe, errors: st1.errors }));
        // ---- H5: a judge that writes nothing ----
        const o2 = daily(['--force', '--no-video', '--judge-cmd', 'false']);
        const st2 = JSON.parse(fs.readFileSync(path.join(rd, 'status.json'), 'utf8'));
        const readme2 = fs.readFileSync(path.join(od, 'README.md'), 'utf8');
        check('H5 a judge that writes nothing (asked twice) leaves the measured order — said in the README and the status',
              /FAILED/.test(String(st2.judge)) && st2.picks.length === want && /The judge failed/.test(readme2) && /measured/.test(readme2),
              JSON.stringify({ judge: st2.judge, picks: st2.picks, errors: st2.errors, tail: o2.trim().split('\n').slice(-3) }));
        // ---- H6: a day with no plays ----
        const out6 = path.join(tmp, 'out6'), runs6 = path.join(tmp, 'runs6');
        const o6 = (() => { try { return execFileSync('node', [path.join(TOOLS, 'highlights', 'daily.js'), '--archive', arch, '--out', out6, '--runs', runs6, '--no-firebase', '--include-test', '--judge-cmd', 'false', '--until', String(Date.now() - 10 * 86400e3)],
            { encoding: 'utf8', timeout: 120000 }); } catch (e) { return String(e.stdout || '') + ' EXIT ' + e.status; } })();
        const d6 = fs.existsSync(out6) ? fs.readdirSync(out6)[0] : null, readme6 = d6 ? fs.readFileSync(path.join(out6, d6, 'README.md'), 'utf8') : '';
        check('H6 a day with no plays: the README says so, with the recording guard\'s state', /No plays were recorded/.test(readme6) && /recording guard/.test(readme6),
              JSON.stringify({ readme6: readme6.slice(0, 300), tail: o6.trim().split('\n').slice(-2) }));
        // ---- H7: a finished day is not redone ----
        const t7 = Date.now(), o7 = daily(['--judge-cmd', 'false']);   // (never the real judge from a test)
        check('H7 a day already done is not redone (the 6:30 pm second chance exits at once)', /already there/.test(o7) && Date.now() - t7 < 15000, o7.trim().split('\n').slice(-2).join(' | '));
    } finally {
        try { await g.cleanup(); } catch (e) {}
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
