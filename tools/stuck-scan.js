#!/usr/bin/env node
// tools/stuck-scan.js — find the moments a real player was stuck, from the
// telemetry we already have (no can-act monitor needed). This is the
// "second, independent measure" of NEVER-FREEZE-PROMPT.md Phase 1, run over
// archived games.
//
//   node tools/stuck-scan.js [--since V414] [--min 10] [--archive DIR] [CODE ...]
//
// Episodes it reports, per game:
//   STUCK-LIVE   a phone had the ball (not waiting), its screen was on, the
//                player kept tapping (>= 2 taps), and nothing moved the game
//                (no snap, settle, conversion step, hand-off, quarter, final)
//                for more than --min seconds
//   COVERED      a phone had the ball but the wait cover was up over it
//   BOTH-WAIT    both phones waiting, both screens on, no hand-off in flight
//   BOTH-LIVE    both phones had the ball at once, both screens on
// Durations are measured on each phone's own clock; hidden stretches never count.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./audit-rules.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SINCE = Number(String(opt('--since', 'V414')).replace(/\D/g, ''));
const MIN = Number(opt('--min', '10')) * 1000;
// the watcher's archive first — a worktree's audits/ holds only the rooms audit-game.js fetched there (see freeze-watch/precheck.js)
const MAIN_AUDITS = '/Users/sohamsthitpragya/rb2p/two-player-rb/audits';
const ARCH = opt('--archive', fs.existsSync(MAIN_AUDITS) ? MAIN_AUDITS : path.resolve(__dirname, '..', 'audits'));
const only = args.filter((a, i) => /^[A-Z0-9]{4}$/.test(a) && !(i > 0 && /^--/.test(args[i - 1])));
const verNum = v => Number(String(v || '').replace(/\D/g, '')) || 0;
const PROGRESS = new Set(['snap', 'settle', 'send', 'recv', 'apply', 'conv', 'q', 'final', 'p6', 'game']);

function segments(tl) {
    const starts = R.gameStarts(tl);
    if (starts.length < 2) return [tl];
    const segs = []; let from = -Infinity;
    for (const c of starts.slice(1).map(t => t - 3000)) { segs.push(tl.filter(e => e.t >= from && e.t < c)); from = c; }
    segs.push(tl.filter(e => e.t >= from));
    return segs.filter(x => x.length);
}

function scan(seg) {
    const out = [];
    const st = { a: { wait: null, hid: false, ovl: false, lastProg: 0, taps: 0, inPlay: false, p6: false }, b: { wait: null, hid: false, ovl: false, lastProg: 0, taps: 0, inPlay: false, p6: false } };
    const t0 = seg[0].t;
    let bothWaitSince = 0, bothLiveSince = 0, inFlightUntil = 0;
    const open = {};    // role -> {kind, from, taps}
    const close = (role, kind, t, why) => {
        const o = open[role + kind]; if (!o) return;
        if (t - o.from >= MIN) out.push({ kind, role, from: (o.from - t0) / 1000, secs: (t - o.from) / 1000, taps: o.taps, scr: o.scr || 0, end: why });
        delete open[role + kind];
    };
    for (const e of seg) {
        const r = e.role; if (r !== 'a' && r !== 'b') continue;
        const s = st[r];
        if (e.k === 'vis' && !e.opp) { s.hid = e.h === true; if (s.hid) { close(r, 'STUCK-LIVE', e.t, 'hidden'); close(r, 'COVERED', e.t, 'hidden'); } else s.lastProg = e.t; }
        if (e.k === 'wait') { s.wait = e.on === true; s.lastProg = e.t; s.taps = 0; if (s.wait) { close(r, 'STUCK-LIVE', e.t, 'went to wait'); close(r, 'COVERED', e.t, 'went to wait'); } }
        if (e.k === 'ovl') { s.ovl = e.shown === true; if (!s.ovl) close(r, 'COVERED', e.t, 'cover down'); }
        if (e.k === 'send') inFlightUntil = e.t + 15000;
        if (e.k === 'recv' || e.k === 'apply') inFlightUntil = 0;
        if (PROGRESS.has(e.k)) { s.lastProg = e.t; s.taps = 0; close(r, 'STUCK-LIVE', e.t, e.k); }
        // a play in progress (snap -> whistle) is the player playing, not stuck
        if (e.k === 'snap') s.inPlay = true;
        if (e.k === 'settle' || e.k === 'send' || e.k === 'conv' || e.k === 'q' || e.k === 'wait') s.inPlay = false;
        // the pick-six scorer plays its conversion while flagged waiting (V247/V280)
        if (e.k === 'p6' && (e.step === 'applied' || e.step === 'modal')) s.p6 = true;
        if (e.k === 'p6' && (e.step === 'resultSent' || e.step === 'resolved')) s.p6 = false;
        if (e.k === 'send' && e.type === 'PAT_RESULT') s.p6 = false;
        if (e.k === 'diag' && /^tap /.test(String(e.m || ''))) {
            s.taps++;
            if (s.wait === false && !s.hid && !s.inPlay && s.taps >= 2 && e.t - s.lastProg >= 3000 && !open[r + 'STUCK-LIVE']) open[r + 'STUCK-LIVE'] = { from: s.lastProg, taps: 0 };
            if (open[r + 'STUCK-LIVE']) { open[r + 'STUCK-LIVE'].taps++; if (/ scr-?\d/.test(String(e.m))) open[r + 'STUCK-LIVE'].scr = (open[r + 'STUCK-LIVE'].scr || 0) + 1; }
        }
        if (s.wait === false && !s.hid && s.ovl && !open[r + 'COVERED']) open[r + 'COVERED'] = { from: e.t, taps: 0 };
        // both phones
        const A = st.a, B = st.b;
        const bothVisible = !A.hid && !B.hid;
        if (A.wait === true && B.wait === true && bothVisible && e.t > inFlightUntil && !A.p6 && !B.p6) { if (!bothWaitSince) bothWaitSince = e.t; }
        else if (bothWaitSince) { if (e.t - bothWaitSince >= MIN) out.push({ kind: 'BOTH-WAIT', role: 'ab', from: (bothWaitSince - t0) / 1000, secs: (e.t - bothWaitSince) / 1000, end: e.k }); bothWaitSince = 0; }
        if (A.wait === false && B.wait === false && bothVisible) { if (!bothLiveSince) bothLiveSince = e.t; }
        else if (bothLiveSince) { if (e.t - bothLiveSince >= 5000) out.push({ kind: 'BOTH-LIVE', role: 'ab', from: (bothLiveSince - t0) / 1000, secs: (e.t - bothLiveSince) / 1000, end: e.k }); bothLiveSince = 0; }
    }
    const tEnd = seg[seg.length - 1].t;
    // V432 (OPEN.md #2): a hand-off PING-PONG — a phone sends the ball back with no snap since it took it (a bounce);
    // two in a row, from the first unplayed hand-off to the next snap, a phone leaving, or 10 s after the last bounce.
    // Each phone is live under 7 s at a time, so no stretch above ever reaches --min (FOVL, ONFE, JCPA: both quit).
    {
        const got = {}, seen = new Set(); let run = null;
        const end = t => { if (run && run.n >= 2) { const to = Math.min(t, run.last + 10000); if (to - run.from >= MIN) out.push({ kind: 'PING-PONG', role: 'ab', from: (run.from - t0) / 1000, secs: (to - run.from) / 1000, end: run.n + ' bounces' }); } run = null; };
        for (const e of seg) {
            if (e.k === 'apply') { got[e.role] = e.t; continue; }
            if (e.k === 'snap') { got[e.role] = null; end(e.t); continue; }
            if (run && ((e.k === 'vis' && !e.opp && e.why === 'pagehide') || e.k === 'final')) { end(e.t); continue; }
            if (e.k !== 'send' || (e.ts != null && seen.has(String(e.ts)))) continue;
            if (e.ts != null) seen.add(String(e.ts));
            if (e.type === 'PAT_RESULT') { got[e.role] = null; end(e.t); continue; }   // the pick-six scorer's try, not a bounce
            if (got[e.role] != null) { if (!run) run = { from: got[e.role], n: 0, last: e.t }; run.n++; run.last = e.t; } else end(e.t);
            got[e.role] = null;
        }
        end(tEnd);
    }
    // a phone's stretch ends with ITS record, not the room's (GCPD: B's stream stopped mid-try, A's sleeping tab wrote
    // for 36 more minutes — "stuck 2,197 s")
    const lastOf = r => { for (let i = seg.length - 1; i >= 0; i--) if (seg[i].role === r) return seg[i].t; return tEnd; };
    for (const k of Object.keys(open)) close(k[0], k.slice(1), k[0] === 'a' || k[0] === 'b' ? lastOf(k[0]) : tEnd, 'end of record');
    return out;
}

const fmt = sec => { const m = Math.floor(sec / 60); return String(m).padStart(2, '0') + ':' + (sec - m * 60).toFixed(1).padStart(4, '0'); };
const files = fs.readdirSync(ARCH).filter(f => f.endsWith('.json') && (!only.length || only.includes(f.replace(/\.json$/, ''))));
const tally = {}; let games = 0, gamesWith = 0;
for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(ARCH, f), 'utf8')); } catch (e) { continue; }
    const tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t);
    const binds = tl.filter(e => e.k === 'bind');
    if (!tl.length || (binds.length && binds.every(b => b.src === 'local'))) continue;
    segments(tl).forEach((seg, gi, all) => {
        const vmax = Math.max(0, ...seg.filter(e => e.k === 'bind').map(b => verNum(b.ver)), ...(seg.some(e => e.k === 'bind') ? [] : binds.map(b => verNum(b.ver))));
        if (vmax < SINCE || seg.filter(e => e.k === 'snap').length < 3) return;
        games++;
        const eps = scan(seg);
        if (!eps.length) return;
        gamesWith++;
        console.log(f.replace(/\.json$/, '') + ' g' + (gi + 1) + '/' + all.length + ' V' + vmax + ' ' + new Date(seg[0].t).toLocaleString());
        for (const x of eps) { tally[x.kind] = (tally[x.kind] || 0) + 1; console.log('   ' + x.kind.padEnd(10) + ' ' + x.role + ' at ' + fmt(x.from) + ' for ' + x.secs.toFixed(1) + 's' + (x.taps != null ? ' taps=' + x.taps : '') + (x.scr ? ' SCROLLED-TAPS=' + x.scr : '') + ' (ended: ' + x.end + ')'); }
    });
}
console.log('\n' + games + ' games scanned (V' + SINCE + '+), ' + gamesWith + ' with an episode over ' + MIN / 1000 + 's: ' + JSON.stringify(tally));
