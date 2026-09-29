#!/usr/bin/env node
// tools/tl.js — print a window of a room's merged two-phone timeline.
//
//   node tools/tl.js CODE [--game N] [--from S] [--to S] [--kinds a,b] [--grep RE] [--no-stage] [--archive DIR]
//
// Times are seconds from the start of the game (--game picks a rematch; the
// checker's game split). --from/--to bound the window; --kinds keeps only
// those entry kinds; --grep keeps entries whose printed line matches; stage
// samples (every few seconds) are left out with --no-stage.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./audit-rules.js');

const args = process.argv.slice(2);
const code = String(args[0] || '').toUpperCase();
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ARCH = opt('--archive', fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/rb2p/two-player-rb/audits');
if (!code) { console.error('usage: node tools/tl.js CODE [--game N] [--from S] [--to S] [--kinds a,b] [--grep RE] [--no-stage]'); process.exit(2); }
const j = JSON.parse(fs.readFileSync(path.join(ARCH, code + '.json'), 'utf8'));
let tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t);
const starts = R.gameStarts(tl);
const gameN = Number(opt('--game', '0'));
if (gameN && starts.length >= 2) {
    const cuts = starts.slice(1).map(t => t - 3000);
    const lo = gameN === 1 ? -Infinity : cuts[gameN - 2], hi = gameN - 1 < cuts.length ? cuts[gameN - 1] : Infinity;
    tl = tl.filter(e => e.t >= lo && e.t < hi);
}
const t0 = tl.length ? tl[0].t : 0;
const from = Number(opt('--from', '-1e9')), to = Number(opt('--to', '1e9'));
const kinds = opt('--kinds', '') ? new Set(opt('--kinds', '').split(',')) : null;
const re = opt('--grep', '') ? new RegExp(opt('--grep', ''), 'i') : null;
const noStage = args.includes('--no-stage');
const SKIP = new Set(['role', 'key', 'k', 't', 's']);
const fmt = sec => { const neg = sec < 0; sec = Math.abs(sec); const m = Math.floor(sec / 60); return (neg ? '-' : '') + String(m).padStart(2, '0') + ':' + (sec - m * 60).toFixed(1).padStart(4, '0'); };
let n = 0;
for (const e of tl) {
    const s = (e.t - t0) / 1000;
    if (s < from || s > to) continue;
    if (kinds && !kinds.has(e.k)) continue;
    if (noStage && e.k === 'stage') continue;
    let body;
    if (e.k === 'diag') body = String(e.m || '');
    else body = Object.keys(e).filter(k => !SKIP.has(k)).map(k => k + '=' + (typeof e[k] === 'object' ? JSON.stringify(e[k]) : e[k])).join(' ');
    const line = fmt(s) + ' ' + e.role + ' ' + String(e.k).padEnd(6) + ' ' + body;
    if (re && !re.test(line)) continue;
    console.log(line.slice(0, 260));
    n++;
}
console.error('[' + code + (gameN ? ' game ' + gameN : '') + '] ' + n + ' lines; game start ' + new Date(t0).toLocaleString() + (starts.length >= 2 ? '; ' + starts.length + ' games in room' : ''));
