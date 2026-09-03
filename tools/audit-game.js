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

// ---------------------------------------------------------------- timeline
function toTimeline(streams) {
    const out = [];
    for (const role of Object.keys(streams)) {
        const s = streams[role] || {};
        for (const key of Object.keys(s)) {
            const e = s[key];
            if (!e || typeof e !== 'object' || typeof e.t !== 'number') continue;
            out.push(Object.assign({ role: role, key: key }, e));
        }
    }
    out.sort((a, b) => a.t - b.t || (a.role < b.role ? -1 : 1) || (a.s || 0) - (b.s || 0));
    return out;
}
const fmtT = (t0, t) => ((t - t0) / 1000).toFixed(1).padStart(7) + 's';
function line(t0, e) {
    const f = Object.assign({}, e); delete f.t; delete f.k; delete f.role; delete f.key; delete f.s;
    return fmtT(t0, e.t) + ' [' + e.role + '] ' + e.k + ' ' + JSON.stringify(f);
}

// ---------------------------------------------------------------- rules
function audit(tl, extra) {
    const flags = [];
    const t0 = tl.length ? tl[0].t : Date.now();
    const flag = (rule, msg, cites) => flags.push({ rule, msg, cites: (cites || []).map(e => line(t0, e)) });
    const byRole = { a: tl.filter(e => e.role === 'a'), b: tl.filter(e => e.role === 'b') };
    const roles = Object.keys(byRole).filter(r => byRole[r].length);

    // ---- R-YARD / R-DOWN: the play-by-play arithmetic, per device ----
    for (const r of roles) {
        const ev = byRole[r];
        let lastSnap = null, lastSettle = null;
        for (const e of ev) {
            if (e.k === 'snap') { lastSnap = e; continue; }
            if (e.k === 'q' || e.k === 'recv' || e.k === 'wait') { lastSettle = null; lastSnap = null; continue; }
            if (e.k !== 'settle') continue;
            const scrim = ['run', 'pass', 'sack', 'incomplete'].includes(e.type);
            if (scrim && e.gain != null && typeof e.y0 === 'number' && typeof e.y === 'number') {
                // The line of scrimmage moves by exactly the gain, in the
                // offense's direction: y is signed from midfield toward the
                // opponent, so a +15 gain from the 50 (y0=0) lands at +15 (the 35).
                const expect = e.y0 + e.gain;
                const scored = Math.abs(e.y) >= 49.5 || (lastSettle && e.su !== lastSettle.su);
                if (!scored && Math.abs(e.y - expect) > 1.6)
                    flag('R-YARD', `${e.type} for ${e.gain}: line was ${e.y0.toFixed(1)}, should be ${expect.toFixed(1)}, is ${e.y.toFixed(1)}`, [lastSnap, e]);
            }
            if (scrim && lastSettle && lastSettle.d && e.d0 && typeof lastSettle.gain === 'number') {
                // Down & distance: the previous settle predicts this snap's down.
                const g = lastSettle.gain;
                const first = g >= lastSettle.tg - 0.6;
                const expD = first ? 1 : lastSettle.d + 1;
                if (lastSettle.d <= 3 && e.d0 !== expD && e.d0 !== 1)
                    flag('R-DOWN', `after ${lastSettle.type} for ${g} on ${lastSettle.d}&${lastSettle.tg}, next snap was down ${e.d0}, expected ${expD}`, [lastSettle, e]);
            }
            lastSettle = e;
        }
    }

    // ---- R-SCORE: legal deltas, monotonic, both boards converge ----
    for (const r of roles) {
        let prev = null;
        for (const e of byRole[r].filter(x => x.k === 'score')) {
            const d = [e.dsu, e.dso];
            for (const dd of d) {
                if (dd < 0) flag('R-SCORE', `a score went DOWN by ${-dd} on ${r}`, [e]);
                else if (dd > 0 && ![1, 2, 3, 6, 7, 8].includes(dd)) flag('R-SCORE', `illegal score delta +${dd} on ${r}`, [e]);
            }
            prev = e;
        }
    }
    {
        // both devices' final view of the score should agree
        const fin = { a: byRole.a.filter(x => x.k === 'final').pop(), b: byRole.b.filter(x => x.k === 'final').pop() };
        if (fin.a && fin.b && (fin.a.su !== fin.b.so || fin.a.so !== fin.b.su))
            flag('R-FINAL', `final boards disagree: a says ${fin.a.su}-${fin.a.so}, b says ${fin.b.su}-${fin.b.so}`, [fin.a, fin.b]);
    }

    // ---- R-CLOCK: quarter monotonic, clock never runs backwards inside a quarter ----
    for (const r of roles) {
        let q = 0, clk = null, last = null;
        for (const e of byRole[r]) {
            if (e.k === 'q') {
                if (e.to < e.from) flag('R-CLOCK', `quarter went backwards ${e.from} -> ${e.to} on ${r}`, [e]);
                if (e.to > 5) flag('R-CLOCK', `quarter ${e.to} does not exist`, [e]);
                q = e.to; clk = null; continue;
            }
            if ((e.k === 'snap' || e.k === 'settle') && typeof e.clk === 'number') {
                if (e.q === q && clk != null && e.clk > clk + 0.5 && e.k === 'snap' && last && last.k === 'snap')
                    flag('R-CLOCK', `clock went UP inside Q${q}: ${clk}s -> ${e.clk}s on ${r}`, [last, e]);
                clk = e.clk; last = e;
            }
        }
    }

    // ---- R-POSS: exactly one live device; transitions justified; deadlocks ----
    {
        const wait = { a: null, b: null }, waitSince = { a: 0, b: 0 };
        let bothWaitSince = null, bothLiveSince = null;
        let lastRecv = { a: 0, b: 0 }, lastQ = { a: 0, b: 0 };
        let cascade = false;
        for (const e of tl) {
            if (e.k === 'p6' && e.step === 'detected') cascade = true;
            if (e.k === 'p6' && (e.step === 'resultApplied' || e.step === 'driveStarted')) cascade = false;
            if (e.k === 'recv') lastRecv[e.role] = e.t;
            if (e.k === 'q') lastQ[e.role] = e.t;
            if (e.k === 'wait') {
                wait[e.role] = e.on; waitSince[e.role] = e.t;
                if (e.on === false && !cascade) {
                    const justified = (e.t - lastRecv[e.role] < 8000) || (e.t - lastQ[e.role] < 8000) || (e.t - t0 < 15000) || /L\d+/.test(e.why) === false;
                    if (!justified) flag('R-POSS', `${e.role} went LIVE with no handoff in the last 8s (caller ${e.why})`, [e]);
                }
            }
            if (e.k === 'stage') {
                const bothWait = wait.a === true && wait.b === true;
                const bothLive = wait.a === false && wait.b === false;
                if (bothWait) {
                    if (!bothWaitSince) bothWaitSince = e.t;
                    else if (e.t - bothWaitSince > (cascade ? 120000 : 12000)) {
                        flag('R-POSS', `DEADLOCK: both devices waiting for ${((e.t - bothWaitSince) / 1000).toFixed(0)}s` + (cascade ? ' (inside a pick-6 cascade)' : ''), [e]);
                        bothWaitSince = null;
                    }
                }
                else bothWaitSince = null;
                if (bothLive) { if (!bothLiveSince) bothLiveSince = e.t; else if (e.t - bothLiveSince > 3000 && !cascade) { flag('R-POSS', `DOUBLE OFFENSE: both devices live for ${((e.t - bothLiveSince) / 1000).toFixed(0)}s`, [e]); bothLiveSince = null; } }
                else bothLiveSince = null;
            }
        }
    }

    // ---- R-OVL: flicker and hidden formations ----
    for (const r of roles) {
        const ov = byRole[r].filter(x => x.k === 'ovl');
        for (let i = 0; i < ov.length; i++) {
            const win = ov.filter(x => x.t >= ov[i].t && x.t < ov[i].t + 5000);
            if (win.length > 3) { flag('R-OVL', `FLICKER on ${r}: ${win.length} overlay toggles in 5s`, win.slice(0, 6)); i += win.length; }
        }
        let hiddenSince = null;
        for (const e of byRole[r].filter(x => x.k === 'stage')) {
            // A staged scene under a SOLID cover is harmless; the defect is a
            // parked device whose cover is OFF while a formation is on screen.
            if (e.wait === true && e.of >= 6 && e.ovl === false) { if (!hiddenSince) hiddenSince = e; else if (e.t - hiddenSince.t > 5000) { flag('R-OVL', `EXPOSED FORMATION on ${r}: ${e.of} offensive players on screen while parked in WAIT with the cover OFF for ${((e.t - hiddenSince.t) / 1000).toFixed(0)}s`, [hiddenSince, e]); hiddenSince = null; } }
            else hiddenSince = null;
        }
    }

    // ---- R-P6: the pick-6 chain, step by step, within budget ----
    {
        const steps = tl.filter(x => x.k === 'p6');
        const budgets = [['detected', 'sent', 9000], ['sent', 'applied', 12000], ['applied', 'modal', 3000], ['modal', 'resultSent', 120000], ['resultSent', 'resultApplied', 8000]];
        // pair modal entries from conv: a modal on the SCORER after 'applied'
        const convModals = tl.filter(x => x.k === 'conv' && x.ev === 'modal');
        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            if (s.step !== 'detected') continue;
            const chain = { detected: s };
            for (const x of steps.slice(i + 1)) { if (x.step === 'detected') break; if (!chain[x.step]) chain[x.step] = x; }
            const m = convModals.find(x => chain.applied && x.t >= chain.applied.t && x.t < chain.applied.t + 3000 && x.role === chain.applied.role);
            if (m) chain.modal = m;
            for (const [from, to, ms] of budgets) {
                if (chain[from] && !chain[to]) flag('R-P6', `pick-6 chain broke: ${from} at +${((chain[from].t - t0) / 1000).toFixed(1)}s but no ${to}`, [chain[from]]);
                else if (chain[from] && chain[to] && chain[to].t - chain[from].t > ms) flag('R-P6', `pick-6 step ${from} -> ${to} took ${((chain[to].t - chain[from].t) / 1000).toFixed(1)}s (budget ${ms / 1000}s)`, [chain[from], chain[to]]);
            }
            // the thrower must go LIVE within 6s of resultApplied
            if (chain.resultApplied) {
                const live = tl.find(x => x.k === 'wait' && x.on === false && x.role === chain.resultApplied.role && x.t >= chain.resultApplied.t - 500 && x.t < chain.resultApplied.t + 6000);
                if (!live) flag('R-P6', `thrower (${chain.resultApplied.role}) never went LIVE within 6s of PAT_RESULT`, [chain.resultApplied]);
            }
            // duplicate modals on the scorer
            if (chain.applied) {
                const dup = convModals.filter(x => x.role === chain.applied.role && x.t >= chain.applied.t && x.t < chain.applied.t + 60000);
                if (dup.length > 1) flag('R-P6', `${dup.length} conversion modals built for one pick-6 on ${chain.applied.role}`, dup);
            }
        }
        // the thrower's engine must never build a conversion modal
        const thrower = steps.find(x => x.step === 'detected');
        if (thrower) {
            const tm = convModals.filter(x => x.role === thrower.role && x.t >= thrower.t && x.t < thrower.t + 30000);
            if (tm.length) flag('R-P6', `the THROWER (${thrower.role}) built ${tm.length} conversion modal(s)`, tm);
        }
    }

    // ---- R-CONV: conversions only at +48 (the 2) or +35 (the 15) ----
    for (const e of tl.filter(x => x.k === 'diag' && /PAT-PIN re-pinned|PAT-PREPIN|BALLGATE HOLD/.test(x.m))) {
        if (/BALLGATE HOLD/.test(e.m)) flag('R-GATE', `ball gate had to HOLD a placement: ${e.m}`, [e]);
    }
    for (const e of tl.filter(x => x.k === 'diag' && /CONVGATE REFUSED/.test(x.m))) flag('R-GATE', e.m, [e]);
    for (const e of tl.filter(x => x.k === 'diag' && /^SCORE-FLOOR/.test(x.m))) flag('R-SCORE', 'a score regressed and was restored: ' + e.m, [e]);

    // ---- R-XPORT: sends that never got acked while the other side was alive ----
    {
        const sends = tl.filter(x => x.k === 'send' && x.type !== 'PAT_RESULT' || (x.k === 'send' && x.type === 'PAT_RESULT'));
        const acks = tl.filter(x => x.k === 'ack');
        for (const s of sends) {
            const other = s.role === 'a' ? 'b' : 'a';
            const ack = acks.find(a => a.role === other && a.ts === s.ts);
            const recv = tl.find(x => x.k === 'recv' && x.role === other && x.ts === s.ts);
            const otherAlive = byRole[other].some(x => x.k === 'stage' && x.t > s.t && x.t < s.t + 20000 && x.fps > 0);
            if (!ack && !recv && otherAlive) flag('R-XPORT', `${s.role}'s ${s.type} was never received by ${other} although ${other} was drawing frames`, [s]);
        }
        for (const e of tl.filter(x => x.k === 'diag' && /FB-STALL|FB-CONN OFFLINE|DELIVERY re-send|via rest-poll/.test(x.m))) flag('R-XPORT', e.m, [e]);
        for (const e of tl.filter(x => x.k === 'dropped')) flag('R-XPORT', `telemetry dropped ${e.n} entries on ${e.role}`, [e]);
    }

    return { flags, t0, entries: tl.length };
}

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
            lines.push('- ' + f.msg);
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
    const res = audit(tl, { outcomes, turn, p6, fin });
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
        console.log('=== AUDIT ' + code + ': ' + report.verdict + ' (' + res.entries + ' entries, ' + res.flags.length + ' flags) ===');
        for (const f of res.flags) { console.log('  [' + f.rule + '] ' + f.msg); for (const c of f.cites) console.log('      ' + c); }
        console.log('report: audits/' + code + '.md');
    }
    process.exit(res.flags.length ? 1 : 0);
}
if (require.main === module) main().catch(e => { console.error('FATAL', e); process.exit(2); });
module.exports = { audit, toTimeline };
