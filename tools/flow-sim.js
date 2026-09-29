#!/usr/bin/env node
// tools/flow-sim.js — replay real games through the Phase 2 v2 ownership rule (FREEZE-LEDGER.md,
// "per-phone FLOW records, causal ownership") BEFORE any of it runs on a phone.
//
// From each archived timeline it rebuilds what both flow records would have said:
//   sent   = the phone's last 'send' {ts (its own clock), type, after = its staged value then}
//   staged = the last partner outcome ts the phone APPLIED ('apply' entries)
// and at every real snap asks the rule "who owns the ball?". A snap by the phone the rule
// names is a match; anything else is printed with its context so the special transitions
// (halftime, OT, the opening kickoff, pick-six flows) can be named.
//
//   node tools/flow-sim.js [--since V405] [--show 20] [CODE ...]
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./audit-rules.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SINCE = Number(String(opt('--since', 'V405')).replace(/\D/g, ''));
const SHOW = Number(opt('--show', '20'));
const ARCH = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/rb2p/two-player-rb/audits';
const only = args.filter((a, i) => /^[A-Z0-9]{4}$/.test(a) && !(i > 0 && /^--/.test(args[i - 1])));
const verNum = v => Number(String(v || '').replace(/\D/g, '')) || 0;
const other = r => (r === 'a' ? 'b' : 'a');

// the rule: both flow records -> owner ('a'|'b'), or null with a reason
function owner(F) {
    const A = F.a, B = F.b;
    for (const [x, y] of [['a', 'b'], ['b', 'a']]) {
        const X = F[x], Y = F[y];
        if (X.sent && Y.staged !== X.sent.ts) return { who: y, why: 'unapplied hand-off ' + x + '->' + y + ' (' + X.sent.type + ')', pending: true };
    }
    if (!A.sent && !B.sent) return { who: null, why: 'no hand-off yet (opening kickoff)' };
    if (A.sent && !B.sent) return { who: 'b', why: 'only a has sent' };
    if (B.sent && !A.sent) return { who: 'a', why: 'only b has sent' };
    // both sends staged: the later send is the one whose `after` names the other's send
    if (B.sent.after === A.sent.ts) return { who: 'a', why: 'b sent after a (b.after=a.sent)' };
    if (A.sent.after === B.sent.ts) return { who: 'b', why: 'a sent after b (a.after=b.sent)' };
    return { who: null, why: 'chain broken (neither send names the other)' };
}

function segments(tl) {
    const starts = R.gameStarts(tl);
    if (starts.length < 2) return [tl];
    const segs = []; let from = -Infinity;
    for (const c of starts.slice(1).map(t => t - 3000)) { segs.push(tl.filter(e => e.t >= from && e.t < c)); from = c; }
    segs.push(tl.filter(e => e.t >= from));
    return segs.filter(x => x.length);
}

// LIVE (V421+): the phones log the rule's own answer ('own' {who, why}) on every change. At each real
// snap, the latest answer on each phone should name the snapper.
const live = { games: 0, snaps: 0, agree: 0, none: 0, wrong: 0, why: {}, shown: [] };
function liveCheck(seg, label) {
    if (!seg.some(e => e.k === 'own')) return;
    live.games++;
    const last = { a: null, b: null };
    for (const e of seg) {
        if (e.k === 'own' && (e.role === 'a' || e.role === 'b')) last[e.role] = e;
        if (e.k === 'snap' && Number(e.d) !== 6 && (e.role === 'a' || e.role === 'b')) {
            for (const r of ['a', 'b']) {
                const o = last[r]; if (!o) continue;
                live.snaps++;
                if (o.who === e.role) live.agree++;
                else {
                    if (o.who == null) live.none++; else live.wrong++;
                    const k = (o.who == null ? 'NO ANSWER: ' : 'WRONG: ') + String(o.why) + ' (on ' + r + ')';
                    live.why[k] = (live.why[k] || 0) + 1;
                    if (live.shown.length < SHOW) live.shown.push(label + ' snap by ' + e.role + ' Q' + e.q + ' clk ' + e.clk + ' — ' + r + ' said ' + (o.who || 'none') + ' (' + o.why + ')');
                }
            }
        }
    }
}

let games = 0, snaps = 0, match = 0, unknown = 0, wrong = 0; const whyCount = {}; const shown = [];
for (const f of fs.readdirSync(ARCH).filter(x => x.endsWith('.json') && (!only.length || only.includes(x.replace(/\.json$/, ''))))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(ARCH, f), 'utf8')); } catch (e) { continue; }
    const tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t);
    const binds = tl.filter(e => e.k === 'bind');
    if (!binds.length || binds.every(b => b.src === 'local')) continue;
    if (Math.max(...binds.map(b => verNum(b.ver))) < SINCE) continue;
    segments(tl).forEach((seg, gi) => {
        if (seg.filter(e => e.k === 'snap').length < 3) return;
        liveCheck(seg, f.replace('.json', '') + ' g' + (gi + 1));
        games++;
        // EPOCHS: the opening kickoff (A receives, line ~13181), halftime (B receives the 2nd half)
        // and overtime each start possession by LAW, with no hand-off record. An epoch starts as a
        // pseudo-hand-off to its receiver; hand-offs from an older epoch are void.
        const F = { a: { sent: null, staged: null }, b: { sent: null, staged: null } };
        const epochOf = q => (q >= 5 ? 'OT' : q >= 3 ? 'H' : 'K0');
        const rank = { K0: 0, H: 1, OT: 2 };
        let epoch = null, epochSends = new Set(), otOwner = null;
        const startEpoch = (id, receiver) => {
            epoch = id; epochSends = new Set();
            const kicker = other(receiver), tag = 'E:' + id;
            F[kicker] = { sent: { ts: tag, type: 'LAW', after: null }, staged: null };
            F[receiver] = { sent: null, staged: tag };
        };
        startEpoch('K0', 'a');
        // flow records are cumulative, so the ORDER two phones' entries land in the merged timeline must
        // not matter (b's clock ran ~3s behind: its apply appears before a's own send entry). Every
        // apply counts; only a hand-off SENT in an older epoch (by its own quarter) is void.
        const sendEpoch = {};
        for (const x of seg) if (x.k === 'send' && x.ts) sendEpoch[x.ts] = epochOf(Number(x.q) || 1);
        const qOf = { a: 1, b: 1 }; const lastRecovery = { a: 0, b: 0 };
        const t0 = seg[0].t;
        for (const e of seg) {
            const r = e.role; if (r !== 'a' && r !== 'b') continue;
            if (e.k === 'q' && typeof e.to === 'number') {
                qOf[r] = e.to;
                const id = epochOf(e.to);
                if (rank[id] > rank[epoch]) {
                    if (id === 'H') startEpoch('H', 'b');
                    else if (id === 'OT') { epoch = 'OT?'; }       // the coin flip decides; learned from the first OT snap below
                }
            }
            if (epoch === 'OT?' && e.k === 'snap') { otOwner = r; startEpoch('OT', r); }
            if (e.k === 'send' && e.ts) { if (rank[sendEpoch[e.ts]] >= rank[String(epoch).replace('?', '')]) { F[r].sent = { ts: e.ts, type: e.type, after: F[r].staged }; epochSends.add(e.ts); } }
            if (e.k === 'apply' && e.ts) { const ep = sendEpoch[e.ts]; if (!ep || ep === String(epoch).replace('?', '') || rank[ep] >= rank[String(epoch).replace('?', '')]) F[r].staged = e.ts; }
            // RESOLVED also means consciously dropped as moot (b purged a's pre-halftime TD after its own hand-off)
            if (e.k === 'diag' && /^OUTCOME purged/.test(String(e.m || ''))) { const p = F[other(r)].sent; if (p) F[r].staged = p.ts; }
            // the OLD machinery moving the ball outside the chain (rescues, restores, keeps, forced drives)
            if ((e.k === 'guard' && /rescue|field-restore|field-park|keep-fresh|empty-field|p6|fallback|field-check|silent-rescue/.test(String(e.what || ''))) ||
                (e.k === 'diag' && /^TURN-RESCUE -> offense|^P6-WATCH no drive|^P6-FALLBACK|^EMPTY-FIELD re-staged|^QTR-KEEP #3/.test(String(e.m || '')))) lastRecovery[r] = e.t;
            if (e.k === 'snap' && Number(e.d) !== 6) {           // a real down (conversions are the scorer's by rule 5)
                snaps++;
                const o = owner(F);
                if (o.who === r) match++;
                else {
                    if (o.who === null) unknown++; else wrong++;
                    const afterRec = Math.max(lastRecovery.a, lastRecovery.b) > 0 && seg.some(x => x.t <= e.t && x.t >= Math.max(lastRecovery.a, lastRecovery.b) - 1) && (e.t - Math.max(lastRecovery.a, lastRecovery.b) < 600000);
                    const k = (o.who === null ? 'UNKNOWN: ' : 'WRONG: ') + o.why.replace(/\(.*\)/, '').trim() + (afterRec ? ' [after an old recovery]' : '') + ' | q' + e.q;
                    whyCount[k] = (whyCount[k] || 0) + 1;
                    if (shown.length < SHOW) shown.push(f.replace('.json', '') + ' g' + (gi + 1) + ' +' + ((e.t - t0) / 1000).toFixed(1) + 's snap by ' + r + ' Q' + e.q + ' clk ' + e.clk + ' d' + e.d + ' — rule: ' + (o.who || 'none') + ' (' + o.why + ')');
                }
            }
        }
    });
}
console.log('games ' + games + ', snaps ' + snaps + ': rule names the snapper ' + match + ' (' + (100 * match / Math.max(1, snaps)).toFixed(1) + '%), no answer ' + unknown + ', WRONG ' + wrong);
for (const [k, n] of Object.entries(whyCount).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(n).padStart(6) + '  ' + k);
if (shown.length) { console.log('\nexamples:'); shown.forEach(x => console.log('  ' + x)); }
if (live.games) {
    console.log('\nLIVE (the phones\' own logged answers, V421+): games ' + live.games + ', snap×phone ' + live.snaps + ': named the snapper ' + live.agree +
                ' (' + (100 * live.agree / Math.max(1, live.snaps)).toFixed(1) + '%), no answer ' + live.none + ', WRONG ' + live.wrong);
    for (const [k, n] of Object.entries(live.why).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(n).padStart(6) + '  ' + k);
    live.shown.forEach(x => console.log('  ' + x));
}
