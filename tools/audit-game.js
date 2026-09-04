#!/usr/bin/env node
// tools/audit-game.js — replay a finished (or live) game's telemetry against
// the rules of football and flag anything that could not have happened.
//
//   node tools/audit-game.js CODE            audit, write audits/CODE.{json,md},
//                                            write rooms/CODE/flag if irregular
//   node tools/audit-game.js CODE --dry      audit only, write nothing to Firebase
//   node tools/audit-game.js CODE --json     print the report as JSON
//
// Exit codes: 0 clean, 1 flagged, 2 could not audit (no stream / auth).
//
// Reads rooms/CODE/audit/{a,b} (the V365 per-device stream), outcomes, turn,
// p6, final. Merges both devices into one timeline and runs the rules below.
// Every flag cites the entries it judged, so a report is evidence, not opinion.
'use strict';
const fs = require('fs');
const path = require('path');

const KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0';
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';

const auth = () => require('./fb-auth.js').token();
async function get(tok, p) {
    const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' });
    if (!r.ok) return null;
    return r.json();
}
async function put(tok, p, obj) {
    const r = await fetch(DB + p + '.json?auth=' + tok, { method: 'PUT', body: JSON.stringify(obj) });
    return r.ok;
}

const { toTimeline, audit, line, fmtT } = require('./audit-rules.js');

// ---------------------------------------------------------------- report
function render(code, res, tl) {
    const lines = [];
    lines.push('# Audit ' + code);
    lines.push('');
    lines.push('entries: ' + res.entries + '   flags: ' + res.flags.length + '   verdict: ' + (res.flags.length ? 'FLAGGED' : 'CLEAN'));
    lines.push('');
    const byRule = {};
    for (const f of res.flags) (byRule[f.rule] = byRule[f.rule] || []).push(f);
    for (const rule of Object.keys(byRule)) {
        lines.push('## ' + rule + ' (' + byRule[rule].length + ')');
        for (const f of byRule[rule]) {
            lines.push('- ' + f.plain + '  _(' + f.msg + ')_');
            for (const c of f.cites) lines.push('    ' + c);
        }
        lines.push('');
    }
    lines.push('## Timeline');
    lines.push('```');
    for (const e of tl) lines.push(line(res.t0, e));
    lines.push('```');
    return lines.join('\n');
}

async function main() {
    const args = process.argv.slice(2);
    const code = (args.find(a => !a.startsWith('--')) || '').toUpperCase();
    const dry = args.includes('--dry'), asJson = args.includes('--json');
    if (!code) { console.error('usage: audit-game.js CODE [--dry] [--json]'); process.exit(2); }
    const tok = await auth();
    const [aud, outcomes, turn, p6, fin] = await Promise.all([
        get(tok, 'rooms/' + code + '/audit'), get(tok, 'rooms/' + code + '/outcomes'),
        get(tok, 'rooms/' + code + '/turn'), get(tok, 'rooms/' + code + '/p6'), get(tok, 'rooms/' + code + '/final')]);
    if (!aud || (!aud.a && !aud.b)) { console.error('no audit stream for ' + code + ' (pre-V365 game, or swept)'); process.exit(2); }
    const tl = toTimeline({ a: aud.a || {}, b: aud.b || {} });
    const nmA = (outcomes && outcomes.a && outcomes.a.fromTeam) || (outcomes && outcomes.b && outcomes.b.toTeam) || 'Phone A';
    const nmB = (outcomes && outcomes.b && outcomes.b.fromTeam) || (outcomes && outcomes.a && outcomes.a.toTeam) || 'Phone B';
    const res = audit(tl, { outcomes, turn, p6, fin, names: { a: nmA, b: nmB } });
    const dir = path.resolve(__dirname, '..', 'audits');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    const report = { code, at: Date.now(), verdict: res.flags.length ? 'FLAGGED' : 'CLEAN', flags: res.flags, entries: res.entries };
    fs.writeFileSync(path.join(dir, code + '.json'), JSON.stringify({ report, timeline: tl }, null, 1));
    fs.writeFileSync(path.join(dir, code + '.md'), render(code, res, tl));
    if (!dry) {
        await put(tok, 'rooms/' + code + '/audited', { ts: Date.now(), flagged: res.flags.length, rules: [...new Set(res.flags.map(f => f.rule))] });
        if (res.flags.length) await put(tok, 'rooms/' + code + '/flag', { ts: Date.now(), n: res.flags.length, rules: [...new Set(res.flags.map(f => f.rule))], first: res.flags[0].msg });
    }
    if (asJson) console.log(JSON.stringify(report, null, 1));
    else {
        console.log('=== AUDIT ' + code + ': ' + report.verdict + ' (' + res.entries + ' entries, ' + res.flags.length + ' flags' + (tl.clockSkewMs ? ', b\'s clock shifted ' + (tl.clockSkewMs > 0 ? '+' : '') + (tl.clockSkewMs / 1000).toFixed(1) + 's onto a\'s from ' + tl.clockSkewPairs + ' handoffs' : '') + ') ===');
        for (const f of res.flags) { console.log('  [' + f.rule + '] ' + (f.q != null ? 'Q' + f.q + ' ' + Math.floor(f.clk / 60) + ':' + ('0' + Math.floor(f.clk % 60)).slice(-2) + ' — ' : '') + f.plain); console.log('      (' + f.msg + ')'); for (const c of f.cites) console.log('      ' + c); }
        console.log('report: audits/' + code + '.md');
    }
    process.exit(res.flags.length ? 1 : 0);
}
if (require.main === module) main().catch(e => { console.error('FATAL', e); process.exit(2); });
module.exports = { audit, toTimeline };   // re-exported from audit-rules.js
