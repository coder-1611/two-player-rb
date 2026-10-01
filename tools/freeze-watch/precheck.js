#!/usr/bin/env node
// tools/freeze-watch/precheck.js — what happened in REAL games since the last freeze-watch run; writes the run's
// brief (markdown) and exits 0 when there is work, 3 when there is none (the run then does not wake the model).
//
//   node tools/freeze-watch/precheck.js --out BRIEF.md [--daily] [--since ISO]
//
// Work = a frozen game (R-FREEZE, by today's rules) not handled before; a stuck episode from the independent
// measure (tools/stuck-scan.js) that the checker did NOT count; a player's bug report; a release not yet audited
// against real games; and, with --daily (the 6 pm run), every noticeable (impact >= 1) problem of the day.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..', '..');
const R = require(path.join(REPO, 'tools', 'audit-rules.js'));
const HOME = path.join(os.homedir(), 'rb2p', 'freeze-watch');
const STATE = path.join(HOME, 'state.json');
const AUDITS = fs.existsSync(path.join(REPO, 'audits')) ? path.join(REPO, 'audits') : path.join(os.homedir(), 'rb2p', 'two-player-rb', 'audits');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const daily = process.argv.includes('--daily');
const out = arg('--out', path.join(HOME, 'brief.md'));
fs.mkdirSync(HOME, { recursive: true });
let st = { lastRun: 0, lastReleaseAudited: null, handled: {} };
try { st = Object.assign(st, JSON.parse(fs.readFileSync(STATE, 'utf8'))); } catch (e) {}
const since = arg('--since') ? Date.parse(arg('--since')) : (st.lastRun || Date.now() - 24 * 3600 * 1000);
const fmt = ms => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago' });
const isHarness = (code, tl) => /\d/.test(code) || tl.filter(e => e.k === 'bind').every(b => b.src === 'local' || /localhost|127\.0\.0\.1/.test(b.host || '') || b.test === true);
const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

(async () => {
    const lines = [];
    const say = s => lines.push(s);
    let work = 0;
    say('# Freeze-watch brief — ' + fmt(Date.now()) + (daily ? ' (6 pm run: includes the daily sweep)' : ''));
    say('Since the last run: ' + (st.lastRun ? fmt(since) : 'none recorded — looking back 24 h (' + fmt(since) + ')') + '.');

    // ---- releases not yet audited against real games ----
    let rel = '';
    try {
        execFileSync('git', ['-C', REPO, 'fetch', '-q', 'origin'], { stdio: 'ignore' });
        const range = st.lastReleaseAudited ? st.lastReleaseAudited + '..origin/main' : '-3';
        rel = execFileSync('git', ['-C', REPO, 'log', '--format=%h %ci %s', ...(st.lastReleaseAudited ? [range] : ['-3', 'origin/main'])], { encoding: 'utf8' }).trim();
    } catch (e) { rel = '(git log failed: ' + e.message + ')'; }
    say('\n## Releases to audit against real games (did each fix fire? help? harm?)');
    if (st.lastReleaseAudited && !rel) say('None new since ' + st.lastReleaseAudited + '.');
    else { say('```\n' + rel + '\n```'); if (rel) work++; }

    // ---- games archived in the last 3 days (a freeze stays on the list until a run marks it handled) ----
    const window0 = Math.min(since, Date.now() - 3 * 24 * 3600 * 1000);
    const rooms = [];
    for (const f of fs.readdirSync(AUDITS).filter(x => x.endsWith('.json'))) {
        const p = path.join(AUDITS, f);
        if (fs.statSync(p).mtimeMs < window0 - 10 * 60 * 1000) continue;
        let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
        const code = f.replace(/\.json$/, '');
        let tl = j.timeline || []; try { tl = R.realign(tl); } catch (e) {}
        tl = tl.slice().sort((a, b) => a.t - b.t);
        if (!tl.length || isHarness(code, tl)) continue;
        let res = null; try { res = R.audit(tl, {}); } catch (e) { continue; }
        rooms.push({ code, tl, res });
    }
    const roomsNew = rooms.filter(r => r.tl[r.tl.length - 1].t >= since);
    say('\n## Real games played since then: ' + roomsNew.length + ' (frozen games below cover the last 3 days, minus those already handled)');

    // ---- frozen games (R-FREEZE, today's rules) ----
    const frozen = [];
    for (const r of rooms) for (const iv of (r.res.frozen && r.res.frozen.intervals) || []) {
        if (!iv.kind || iv.from < window0) continue;
        const key = r.code + '@' + Math.round(iv.from / 1000);
        if (st.handled[key]) continue;
        frozen.push({ room: r.code, key, at: iv.from, sec: Math.round(iv.ms / 1000), why: iv.why, kind: iv.kind, role: iv.role,
                      ver: [...new Set(r.tl.filter(e => e.k === 'bind').map(e => e.ver))].join('/'), rel: ((iv.from - r.tl[0].t) / 1000).toFixed(1) });
    }
    say('\n## Frozen games not handled before: ' + frozen.length);
    for (const f of frozen) say('- **' + f.room + '** (' + f.ver + ') at +' + f.rel + 's (' + fmt(f.at) + '): ' + f.role + ' "' + f.why + '" ' + f.sec + 's — **' + f.kind + '**  `node tools/tl.js ' + f.room + ' --from ' + Math.max(0, Math.floor(f.rel - 60)) + ' --to ' + Math.ceil(Number(f.rel) + f.sec + 30) + ' --no-stage`');
    work += frozen.length;

    // ---- the independent measure: stuck episodes the checker did not count ----
    say('\n## Independent stuck measure (tools/stuck-scan.js) on these games — anything the checker did NOT count is a detector question');
    if (roomsNew.length) {
        try {
            const sc = execFileSync(process.execPath, [path.join(REPO, 'tools', 'stuck-scan.js'), '--archive', AUDITS, ...roomsNew.map(r => r.code)], { encoding: 'utf8', timeout: 300000 });
            const keep = sc.split('\n').filter(l => l.trim()).slice(0, 80);
            say('```\n' + keep.join('\n') + '\n```');
            if (/stuck|episode/i.test(sc) && !/no episodes|0 episodes/i.test(sc)) work++;
        } catch (e) { say('(stuck-scan failed: ' + String(e.message).slice(0, 200) + ')'); }
    } else say('(no games)');

    // ---- players' bug reports ----
    let comps = [];
    try {
        const tok = await require(path.join(REPO, 'tools', 'fb-auth.js')).token();
        const c = await (await fetch(DB + 'complaints.json?auth=' + tok)).json() || {};
        comps = Object.values(c).filter(x => x && x.ts > since).sort((a, b) => a.ts - b.ts);
    } catch (e) { say('\n(complaints unreadable: ' + e.message + ')'); }
    say('\n## Bug reports from players since then: ' + comps.length);
    for (const c of comps) say('- ' + fmt(c.ts) + ' room ' + (c.room || '?') + ' (' + (c.ver || '?') + '): ' + JSON.stringify(c.choices || []) + ' "' + String(c.text || '').slice(0, 200) + '"');
    work += comps.length;

    // ---- the daily sweep: noticeable problems that are not freezes ----
    if (daily) {
        say('\n## Daily sweep — today\'s noticeable problems (impact >= 1, not R-FREEZE)');
        const byRule = {};
        const reopens = [];   // V428: R-REOPEN is impact 0 (the game record is untouched) but must never come back
        for (const f of fs.readdirSync(AUDITS).filter(x => x.endsWith('.json'))) {
            const p = path.join(AUDITS, f); if (fs.statSync(p).mtimeMs < today0) continue;
            let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
            const code = f.replace(/\.json$/, '');
            let tl = j.timeline || []; try { tl = R.realign(tl); } catch (e) {}
            tl = tl.slice().sort((a, b) => a.t - b.t);
            if (!tl.length || isHarness(code, tl) || tl[tl.length - 1].t < today0) continue;
            let res; try { res = R.audit(tl, {}); } catch (e) { continue; }
            for (const fl of res.flags) {
                if (fl.rule === 'R-REOPEN' && fl.t >= today0) reopens.push(code + ' (' + [...new Set(tl.filter(e => e.k === 'bind').map(e => e.ver))].join('/') + '): ' + fl.msg.slice(0, 120));
                if (!(fl.impact >= 1) || fl.rule === 'R-FREEZE' || fl.t < today0) continue;
                const k = fl.rule + ' [' + fl.impactName + ']';
                const b = (byRule[k] = byRule[k] || { n: 0, rooms: new Set(), ex: [] });
                b.n++; b.rooms.add(code); if (b.ex.length < 4) b.ex.push(code + ' +' + ((fl.t - tl[0].t) / 1000).toFixed(0) + 's: ' + fl.msg.slice(0, 120));
            }
        }
        const ks = Object.keys(byRule).sort((a, b) => byRule[b].rooms.size - byRule[a].rooms.size);
        if (!ks.length) say('None.');
        if (reopens.length) { say('- **R-REOPEN** (a phone put into a match alone after the final — V428 should have ended this; on a V428+ build it is a regression, find out why): ' + reopens.length); for (const r of reopens.slice(0, 6)) say('  - ' + r); work++; }
        for (const k of ks) { say('- **' + k + '**: ' + byRule[k].n + ' in ' + byRule[k].rooms.size + ' games'); for (const e of byRule[k].ex) say('  - ' + e); }
        work += ks.length;
        // the known roots not fixed yet: the 6 pm run works the top one when the day brought nothing new
        let open = [];
        try { open = fs.readFileSync(path.join(__dirname, 'OPEN.md'), 'utf8').split('\n').filter(l => /^## \d+\./.test(l)); } catch (e) {}
        say('\n## Open items (tools/freeze-watch/OPEN.md): ' + open.length);
        for (const l of open) say('- ' + l.replace(/^## /, ''));
        work += open.length;
    }

    // ---- the published counter, for reference ----
    try {
        const tok = await require(path.join(REPO, 'tools', 'fb-auth.js')).token();
        const fz = await (await fetch(DB + 'stats/alltime/freeze.json?auth=' + tok)).json();
        if (fz) say('\n## Published freeze counter\nToday: ' + JSON.stringify(fz.today) + '; 7 days: ' + JSON.stringify(fz.week) + '.');
    } catch (e) {}

    say('\n---\nKeys of the frozen games above (mark them handled in state.json when done): ' + JSON.stringify(frozen.map(f => f.key)));
    fs.writeFileSync(out, lines.join('\n') + '\n');
    console.log('brief: ' + out + ' — ' + (work ? work + ' item(s) of work' : 'nothing to do'));
    process.exit(work ? 0 : 3);
})().catch(e => { console.error('precheck failed: ' + (e && e.stack)); process.exit(1); });
