#!/usr/bin/env node
// tools/freeze-watch/firings.js — did a fix do anything in REAL games, and did it do harm?
// (the method of FIX-AUDIT-2026-09-30.md, as a tool: every fix shipped is checked against the games it fired in)
//
//   node tools/freeze-watch/firings.js --pattern 'RECOVER park|guard:recover' [--since 2026-09-30T21:17Z] [--archive DIR]
//
// --pattern is a regex matched against a diag line's text, or "guard:<what>" for an audit guard entry (both can
// be combined with |). For every real game (harness rooms excluded) with a firing after --since it prints the
// firing and what followed within 30s: the next snap (and whose), a counted freeze starting, a flag of impact >= 1
// (score / ball / clock / game), a phone leaving (pagehide), the stats screen. The verdict per firing is a HINT
// (OK / LOOK / HARM?) — every LOOK and HARM? must be read on the timeline (tools/tl.js) before it is called either.
'use strict';
const fs = require('fs'), path = require('path');
const R = require(path.join(__dirname, '..', 'audit-rules.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const pattern = arg('--pattern'); if (!pattern) { console.error('--pattern required'); process.exit(2); }
const since = arg('--since') ? Date.parse(arg('--since')) || Number(arg('--since')) : Date.now() - 24 * 3600 * 1000;
// the watcher's archive first — a worktree's audits/ holds only the rooms audit-game.js fetched there (see precheck.js)
const MAIN_AUDITS = '/Users/sohamsthitpragya/Projects/two-player-rb/audits';
const dir = arg('--archive', fs.existsSync(MAIN_AUDITS) ? MAIN_AUDITS : path.join(__dirname, '..', '..', 'audits'));
const guardRe = /^guard:(.+)$/;
const parts = pattern.split('|'), diagRe = new RegExp(parts.filter(p => !guardRe.test(p)).join('|') || '(?!)'), guardWhat = parts.map(p => guardRe.exec(p)).filter(Boolean).map(m => m[1]);
const isHarness = (code, tl) => /\d/.test(code) || tl.filter(e => e.k === 'bind').every(b => b.src === 'local' || /localhost|127\.0\.0\.1/.test(b.host || '') || b.test === true);
const W = 30000;
let total = 0, games = 0; const verdicts = { OK: 0, LOOK: 0, 'HARM?': 0 };
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const st = fs.statSync(path.join(dir, f)); if (st.mtimeMs < since) continue;
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    const code = f.replace(/\.json$/, '');
    let tl0 = j.timeline || []; try { tl0 = R.realign(tl0); } catch (e) {}
    const tl = tl0.slice().sort((a, b) => a.t - b.t);
    if (!tl.length || isHarness(code, tl)) continue;
    const hits = tl.filter(e => e.t >= since && ((e.k === 'diag' && diagRe.test(e.m || '')) || (e.k === 'guard' && guardWhat.includes(e.what))));
    if (!hits.length) continue;
    games++;
    let res = null; try { res = R.audit(tl, {}); } catch (e) {}
    const t0 = tl[0].t, rel = t => ((t - t0) / 1000).toFixed(1);
    const ver = [...new Set(tl.filter(e => e.k === 'bind').map(e => e.ver))].join('/');
    console.log('\n== ' + code + ' (' + ver + ') ' + new Date(t0).toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    let lastT = -Infinity;
    for (const h of hits) {
        if (h.t - lastT < 15000) continue;    // repeats within 15s are one episode
        lastT = h.t; total++;
        const after = tl.filter(e => e.t > h.t && e.t <= h.t + W);
        const snap = after.find(e => e.k === 'snap');
        const froze = res && res.frozen && res.frozen.intervals.find(iv => iv.kind && iv.from >= h.t - 2000 && iv.from <= h.t + W);
        const bad = res ? res.flags.filter(fl => fl.impact >= 1 && fl.t >= h.t - 1000 && fl.t <= h.t + W && fl.rule !== 'R-XPORT') : [];
        const left = after.filter(e => e.k === 'vis' && !e.opp && e.why === 'pagehide');
        const fin = after.find(e => e.k === 'final');
        const v = froze || bad.some(fl => fl.impact >= 2) ? 'HARM?' : (!snap && !fin) || left.length ? 'LOOK' : 'OK';
        verdicts[v]++;
        console.log('  ' + rel(h.t) + 's ' + h.role + ' ' + (h.k === 'guard' ? 'guard ' + h.what + ' ' + JSON.stringify(Object.assign({}, h, { t: undefined, role: undefined, k: undefined, key: undefined, s: undefined })).slice(0, 120) : h.m.slice(0, 140)));
        console.log('      -> ' + v + ' | next snap: ' + (snap ? snap.role + ' +' + ((snap.t - h.t) / 1000).toFixed(1) + 's' : 'none in 30s') +
                    (froze ? ' | FROZE ' + Math.round(froze.ms / 1000) + 's (' + froze.why + ', ' + froze.kind + ')' : '') +
                    (bad.length ? ' | flags: ' + bad.map(fl => fl.rule + ' ' + fl.msg.slice(0, 60)).join('; ') : '') +
                    (left.length ? ' | left: ' + left.map(e => e.role).join(',') : '') + (fin ? ' | stats screen' : ''));
    }
}
console.log('\n' + total + ' firings in ' + games + ' real games since ' + new Date(since).toISOString() + ' — OK ' + verdicts.OK + ', LOOK ' + verdicts.LOOK + ', HARM? ' + verdicts['HARM?'] +
            (total ? '' : ' (never fired)') + '\n(hints only: read every LOOK / HARM? with tools/tl.js before judging)');
