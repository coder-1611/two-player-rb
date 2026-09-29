#!/usr/bin/env node
// tools/freeze-baseline.js — every real game since a version, re-checked with
// today's rules, with every freeze signal pulled out (NEVER-FREEZE-PROMPT.md,
// Phase 0; also the daily pass of Phase 5).
//
//   node tools/freeze-baseline.js [--since V395] [--archive DIR] [--json OUT] [--no-complaints]
//
// Reads the audit archive (audits/*.json, one file per room: the merged
// two-phone timeline the watcher stored) and the complaints in RTDB. A room
// is split into games the same way the checker splits rematches. A game is
// a match with at least 3 snaps. Harness rooms (every bind from the local
// server) are left out.
//
// For each game it prints the signals that decide its class:
//   impact-3 flags     the checker says the game froze, stalled or ended wrongly
//   recoveries         a watchdog had to act (the main path failed)
//   stand-downs        held hand-offs and retired watchers (not recoveries)
//   complaints         the in-game "!" box for that room
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./audit-rules.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SINCE = Number(String(opt('--since', 'V395')).replace(/\D/g, ''));
const ARCH = opt('--archive', fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/rb2p/two-player-rb/audits');
const OUT = opt('--json', '');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';

const verNum = v => Number(String(v || '').replace(/\D/g, '')) || 0;
const localDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
const hhmm = ms => { const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

// what counts as a recovery (the main path failed) vs a stand-down
const REC_GUARDS = new Set(['field-restore', 'field-park', 'field-owe', 'keep-fresh', 'try-over', 'final-forced', 'post-conv-handoff',
                            'ot-td-conversion', 'ot-td-handoff', 'empty-field']);
const OLD_REC_GUARDS = new Set(['field-check', 'silent-rescue', 'end-by-player']);          // V410-V413
const STAND_DOWNS = new Set(['held', 'p6-watch-retired', 'force-drive']);
const REC_DIAG = [/^TURN-RESCUE -> offense/, /^P6-WATCH no drive 4s after PAT_RESULT — forcing it/, /^P6-FALLBACK 300s/, /^DEAD-OPP END/,
                  /^QTR-KEEP #3/, /^QTR-KEEP LOOP/, /^DELIVERY re-send/, /^EMPTY-FIELD re-staged/, /^FINAL forced/];

function recoveriesOf(seg, ver) {
    const out = [], stands = [];
    for (const e of seg) {
        if (e.k === 'guard') {
            const w = String(e.what || '');
            if (REC_GUARDS.has(w) || (OLD_REC_GUARDS.has(w) && ver >= 410 && ver <= 413) ||
                (w === 'rescue' && e.ok !== false) || (w === 'fallback300' && /fired/.test(String(e.why || '')))) out.push({ t: e.t, role: e.role, what: w, why: e.why || e.state || '' });
            else if (STAND_DOWNS.has(w)) stands.push({ t: e.t, role: e.role, what: w });
        } else if (e.k === 'conv' && e.wall === true) out.push({ t: e.t, role: e.role, what: 'conv-wall', why: e.res || e.result || '' });
        else if (e.k === 'diag') {
            const m = String(e.m || '');
            const hit = REC_DIAG.find(re => re.test(m));
            if (hit) out.push({ t: e.t, role: e.role, what: 'diag', why: m.slice(0, 90) });
        }
    }
    return { recoveries: out, standDowns: stands };
}

function segments(tl) {
    const starts = R.gameStarts(tl);
    if (starts.length < 2) return [tl];
    const segs = []; let from = -Infinity;
    for (const c of starts.slice(1).map(t => t - 3000)) { segs.push(tl.filter(e => e.t >= from && e.t < c)); from = c; }
    segs.push(tl.filter(e => e.t >= from));
    return segs.filter(x => x.length);
}

async function complaintsByRoom() {
    if (args.includes('--no-complaints')) return {};
    try {
        const tok = await require('./fb-auth.js').token();
        const r = await fetch(DB + 'complaints.json?auth=' + tok, { cache: 'no-store' });
        const all = r.ok ? await r.json() : {};
        const by = {};
        for (const id of Object.keys(all || {})) { const c = all[id]; if (!c || !c.room) continue; (by[c.room] = by[c.room] || []).push(Object.assign({ id }, c)); }
        return by;
    } catch (e) { console.error('complaints: ' + e.message); return {}; }
}

(async () => {
    const complaints = await complaintsByRoom();
    const files = fs.readdirSync(ARCH).filter(f => f.endsWith('.json'));
    const games = [];
    let harness = 0, old = 0, tiny = 0;
    for (const f of files) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(ARCH, f), 'utf8')); } catch (e) { continue; }
        const tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t);
        if (!tl.length) continue;
        const code = f.replace(/\.json$/, '');
        const binds = tl.filter(e => e.k === 'bind');
        if (binds.length && binds.every(b => b.src === 'local' || /localhost|127\.0\.0\.1/.test(String(b.host || '')))) { harness++; continue; }
        const segs = segments(tl);
        segs.forEach((seg, gi) => {
            const sb = seg.filter(e => e.k === 'bind');
            const vers = [...new Set((sb.length ? sb : binds).map(b => b.ver).filter(Boolean))].sort((a, b) => verNum(a) - verNum(b));
            const vmax = Math.max(0, ...vers.map(verNum));
            if (vmax < SINCE) { old++; return; }
            const snaps = seg.filter(e => e.k === 'snap').length;
            if (snaps < 3) { tiny++; return; }
            let res; try { res = R.audit(seg, { _seg: gi + 1 }); } catch (e) { res = { flags: [], complete: {}, err: e.message }; }
            const imp3 = (res.flags || []).filter(x => x.impact === 3 || (x.chainImpact || 0) === 3);
            const { recoveries, standDowns } = recoveriesOf(seg, vmax);
            const cmp = (complaints[code] || []).filter(c => c.ts >= seg[0].t - 60000 && c.ts <= seg[seg.length - 1].t + 3600000);
            games.push({
                code, game: gi + 1, of: segs.length, vers, vmax, start: seg[0].t, end: seg[seg.length - 1].t,
                src: [...new Set(sb.map(b => b.src))].join('+'), snaps,
                complete: !!(res.complete && res.complete.complete), horn: !!(res.complete && res.complete.horn), incompleteWhy: (res.complete && res.complete.incompleteWhy) || '',
                worst: res.impact ? res.impact.worst : -1,
                imp3: imp3.map(x => ({ rule: x.rule, msg: String(x.msg || '').slice(0, 140), t: (x.at && x.at.t) || x.t || null, chainImpact: x.chainImpact || 0, impact: x.impact })),
                flags: (res.flags || []).map(x => ({ rule: x.rule, impact: x.impact, msg: String(x.msg || '').slice(0, 100) })),
                recoveries, standDowns,
                complaints: cmp.map(c => ({ ts: c.ts, role: c.role, ver: c.ver, choices: c.choices || [], text: String(c.text || '').slice(0, 160) })),
            });
        });
    }
    games.sort((a, b) => a.start - b.start);

    // per version
    const byV = {};
    for (const g of games) {
        const v = 'V' + g.vmax; const b = byV[v] = byV[v] || { games: 0, complete: 0, horn: 0, imp3: 0, rec: 0, recGames: 0, cmp: 0 };
        b.games++; if (g.complete) b.complete++; if (g.horn) b.horn++; if (g.imp3.length) b.imp3++; b.rec += g.recoveries.length; if (g.recoveries.length) b.recGames++; if (g.complaints.length) b.cmp++;
    }
    console.log('FREEZE BASELINE — real games on V' + SINCE + '+ (archive ' + ARCH + ', ' + files.length + ' rooms; skipped ' + harness + ' harness rooms, ' + old + ' older games, ' + tiny + ' games under 3 snaps)\n');
    console.log('version  games  to-horn  complete  impact-3  games-w/-recovery (firings)  complaints');
    for (const v of Object.keys(byV).sort((a, b) => verNum(a) - verNum(b))) {
        const b = byV[v];
        console.log(v.padEnd(8) + String(b.games).padStart(6) + String(b.horn).padStart(9) + String(b.complete).padStart(10) + String(b.imp3).padStart(10) + String(b.recGames).padStart(12) + (' (' + b.rec + ')').padEnd(17) + String(b.cmp).padStart(11));
    }
    const tot = games.length, i3 = games.filter(g => g.imp3.length).length, rg = games.filter(g => g.recoveries.length).length, cg = games.filter(g => g.complaints.length).length;
    console.log('\ntotal ' + tot + ' games · ' + i3 + ' with an impact-3 flag · ' + rg + ' with a recovery firing · ' + cg + ' with a complaint');

    // what the impact-3 flags say (rule + message shape)
    const shapes = {};
    for (const g of games) for (const f of g.imp3) { const k = f.rule + ': ' + f.msg.replace(/\d+(\.\d+)?/g, 'N').slice(0, 80); shapes[k] = (shapes[k] || 0) + 1; }
    console.log('\nimpact-3 flag shapes:');
    for (const [k, n] of Object.entries(shapes).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(n).padStart(5) + '  ' + k);
    const rshapes = {};
    for (const g of games) for (const r of g.recoveries) { const k = r.what + (r.what === 'diag' ? ' ' + r.why.replace(/\d+(\.\d+)?/g, 'N').slice(0, 50) : ''); rshapes[k] = (rshapes[k] || 0) + 1; }
    console.log('\nrecovery firings:');
    for (const [k, n] of Object.entries(rshapes).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5) + '  ' + k);

    if (OUT) { fs.writeFileSync(OUT, JSON.stringify(games, null, 1)); console.log('\nwrote ' + games.length + ' games to ' + OUT); }
})().catch(e => { console.error(e); process.exit(1); });
