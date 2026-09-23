// tools/audit-rules.js — the ONE rule engine, for the CLI (Node) and for the
// game-transcripts page (browser). Also the plain-English narrator, so the
// page and the detector can never disagree about what happened.
//
// In Node:      const { toTimeline, audit, narrate, explain } = require('./audit-rules.js');
// In a browser: <script src="/tools/audit-rules.js"></script>  ->  window.RB2P_AUDIT
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RB2P_AUDIT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

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
    // ---- the two phones stamp with their OWN clocks (OVUI: b ran ~6s behind a),
    // which turns a clean handoff into a phantom "both live for 3s". Estimate
    // the skew from matched send->recv pairs in BOTH directions: latency adds
    // to one direction and subtracts from the other, so half the difference
    // is the skew, independent of the latency itself. Shift b onto a's clock.
    let skew = 0, pairs = 0;
    try {
        const sends = out.filter(e => e.k === 'send' && typeof e.ts === 'number');
        const recvs = out.filter(e => e.k === 'recv' && typeof e.ts === 'number');
        const ab = [], ba = [];
        // Pair by record ts when it survived (the record can be re-stamped on
        // the way out), else by type and nearness within a minute.
        for (const s of sends) {
            let r = recvs.find(x => x.ts === s.ts && x.role !== s.role);
            if (!r) {
                const cands = recvs.filter(x => x.role !== s.role && x.type === s.type && Math.abs(x.t - s.t) < 60000);
                cands.sort((x, y) => Math.abs(x.t - s.t) - Math.abs(y.t - s.t));
                r = cands[0];
            }
            if (!r) continue;
            (s.role === 'a' ? ab : ba).push(r.t - s.t);
        }
        const med = arr => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
        const mAB = med(ab), mBA = med(ba);
        // delta = how far b's clock is BEHIND a's. a->b pairs measure latency - delta,
        // b->a pairs measure latency + delta.
        if (mAB != null && mBA != null) { skew = Math.round((mBA - mAB) / 2); pairs = ab.length + ba.length; }
        else if (mAB != null) { skew = Math.round(300 - mAB); pairs = ab.length; }     // one direction: assume ~300ms latency
        else if (mBA != null) { skew = Math.round(mBA - 300); pairs = ba.length; }
        // (braces matter: a bare `for ... if ... else` binds the else to the inner if)
        if (Math.abs(skew) > 500) { for (const e of out) { if (e.role === 'b') e.t += skew; } }
        else { skew = 0; }
    } catch (e) { skew = 0; }
    out.sort((a, b) => a.t - b.t || (a.role < b.role ? -1 : 1) || (a.s || 0) - (b.s || 0));
    out.clockSkewMs = skew; out.clockSkewPairs = pairs;
    return out;
}
const fmtT = (t0, t) => ((t - t0) / 1000).toFixed(1).padStart(7) + 's';
function line(t0, e) {
    if (!e) return '        (no entry)';
    const f = Object.assign({}, e); delete f.t; delete f.k; delete f.role; delete f.key; delete f.s;
    return fmtT(t0, e.t) + ' [' + e.role + '] ' + e.k + ' ' + JSON.stringify(f);
}

// ---------------------------------------------------------------- english helpers
function clockStr(clk) {
    if (typeof clk !== 'number' || !isFinite(clk)) return '';
    const m = Math.floor(clk / 60), s = Math.floor(clk % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}
function spot(y) {
    if (typeof y !== 'number' || !isFinite(y)) return '';
    const mark = Math.round(50 - Math.abs(y));
    if (Math.abs(y) < 0.5) return 'the 50';
    return (y > 0 ? "the opponent's " : 'their own ') + mark;
}
function ordinal(d) { return ({ 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' })[d] || (d + 'th'); }
function dd(d, tg) { return (d ? ordinal(d) : '?') + ' & ' + (typeof tg === 'number' ? Math.round(tg) : '?'); }
function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }
function gameClock(e) { return (e && typeof e.q === 'number' && typeof e.clk === 'number') ? 'Q' + e.q + ' ' + clockStr(e.clk) : ''; }

// The pick-six chains that never happened: detected right after a refresh, a
// jump that is not a single +6, or shipped without the +6 on the sender's
// board. Shared by the rules and the narrator so both tell the same story.
function phantomPick6(tl) {
    const out = [];
    const steps = tl.filter(x => x.k === 'p6');
    for (let i = 0; i < steps.length; i++) {
        const d = steps[i]; if (d.step !== 'detected') continue;
        const chain = { detected: d, role: d.role, reasons: [] };
        for (const x of steps.slice(i + 1)) { if (x.step === 'detected') break; if (!chain[x.step]) chain[x.step] = x; }
        const boot = tl.find(x => x.role === d.role && x.k === 'diag' && x.m === 'boot' && x.t <= d.t && d.t - x.t < 20000);
        if (boot) chain.reasons.push('refresh');
        const m = /score-watcher\(\+(\d+)\)/.exec(String(d.src || ''));
        if (m && Number(m[1]) !== 6) chain.reasons.push('jump+' + m[1]);
        if (chain.sent && chain.sent.plus6 === false) chain.reasons.push('no+6');
        if (chain.reasons.length) out.push(chain);
    }
    return out;
}

// ---------------------------------------------------------------- rules
// V398: where each game in a reused room begins. A 'game' entry (written at
// every match start since V398) or, on older builds, the host's
// 'TURN-> x (match-start)' line. Both phones write one within a few seconds —
// one boundary.
function gameStarts(tl) {
    const marks = tl.filter(e => e.k === 'game' || (e.k === 'diag' && /^TURN-> [ab] \(match-start\)$/.test(String(e.m || '')))).map(e => e.t).sort((x, y) => x - y);
    const out = [];
    for (const t of marks) if (!out.length || t - out[out.length - 1] > 10000) out.push(t);
    return out;
}

function audit(tl, extra) {
    // V397: a rematch reuses the room code. Every 'TURN-> x (match-start)'
    // after the first begins a new game — the windows of R-GIFT, R-P6, R-HALF
    // and the chains must never reach across it (LXEI: a rematch's first
    // snap 56s after the previous game's last conversion read as a GIFT).
    if (!(extra && extra._seg)) {
        const starts = gameStarts(tl);
        if (starts.length >= 2) {
            const segs = []; let from = -Infinity;
            for (const c of starts.slice(1).map(t => t - 3000)) { segs.push(tl.filter(e => e.t >= from && e.t < c)); from = c; }
            segs.push(tl.filter(e => e.t >= from));
            const parts = segs.filter(x => x.length).map((x, i) => audit(x, Object.assign({}, extra || {}, { _seg: i + 1 })));
            let chainBase = 0; const folded = [], raw = [];
            parts.forEach((p, i) => {
                for (const f of p.flags) { f.game = i + 1; f.plain = 'Game ' + (i + 1) + ' of ' + parts.length + ' in this room — ' + f.plain; if (f.chain) f.chain += chainBase; folded.push(f); }
                for (const f of p.rawFlags) { f.game = i + 1; raw.push(f); }
                chainBase += Math.max(0, ...p.flags.map(f => f.chain || 0));
            });
            const worst = folded.length ? Math.max(...folded.map(x => Math.max(x.impact, x.chainImpact || 0))) : -1;
            const counts = [0, 0, 0, 0]; folded.forEach(x => counts[x.impact]++);
            const p0 = parts[0].impact;
            const impact = { worst, worstName: worst >= 0 ? p0.names[worst] : 'clean', worstText: worst >= 0 ? p0.texts[worst] : 'nothing wrong', counts, names: p0.names, texts: p0.texts, games: parts.length,
                             raw: raw.length, folded: folded.length, chains: chainBase };
            return { flags: folded, rawFlags: raw, impact, t0: tl[0].t, entries: tl.length, games: parts.length, complete: parts[parts.length - 1].complete };
        }
    }
    const flags = [];
    const t0 = tl.length ? tl[0].t : Date.now();
    const names = (extra && extra.names) || {};
    const T = r => names[r] || ('Phone ' + String(r || '').toUpperCase());
    const other = r => (r === 'a' ? 'b' : 'a');
    // every flag carries: the technical sentence (msg), the plain one (plain),
    // the raw lines it judged (cites) and, when known, the game clock (q, clk)
    const clocked = tl.filter(e => typeof e.q === 'number' && typeof e.clk === 'number');
    const clockAt = t => { let best = null; for (const e of clocked) { if (e.t <= t) best = e; else break; } return best; };
    const flag = (rule, msg, cites, plain) => {
        const at = (cites && cites[0] && cites[0].t) || t0;
        const own = (cites || []).find(e => e && typeof e.q === 'number' && typeof e.clk === 'number');
        const near = own || clockAt(at);
        flags.push({ rule, msg, plain: plain || msg, cites: (cites || []).filter(Boolean).map(e => line(t0, e)),
                     q: near ? near.q : undefined, clk: near ? near.clk : undefined, t: at });
    };
    const byRole = { a: tl.filter(e => e.role === 'a'), b: tl.filter(e => e.role === 'b') };
    const roles = Object.keys(byRole).filter(r => byRole[r].length);

    // ---- R-YARD / R-DOWN: the play-by-play arithmetic, per device ----
    for (const r of roles) {
        const ev = byRole[r];
        let lastSnap = null, lastSettle = null, lastResetAt = -Infinity, lastResetQ3 = false;
        for (const e of ev) {
            if (e.k === 'snap') { lastSnap = e; continue; }
            if (e.k === 'q' || e.k === 'recv' || e.k === 'wait') { lastSettle = null; lastSnap = null; lastResetAt = e.t; lastResetQ3 = e.k === 'q' && e.to === 3; continue; }
            if (e.k !== 'settle') continue;
            // V410: a "settle" fired within 1.5s of a hand-off or a quarter change is the new drive being staged
            // (or halftime resetting the ball for the kickoff), not a play with a gain
            if (e.t - lastResetAt < 1500) { lastSettle = e; continue; }
            const scrim = ['run', 'pass', 'sack', 'incomplete'].includes(e.type);
            if (scrim && e.gain != null && typeof e.y0 === 'number' && typeof e.y === 'number') {
                // The line of scrimmage moves by exactly the gain, in the
                // offense's direction: y is signed from midfield toward the
                // opponent, so a +15 gain from the 50 (y0=0) lands at +15 (the 35).
                const expect = e.y0 + e.gain;
                // A play that reaches the goal line scored: the engine then puts the
                // ball on the 2 (+48) for the conversion and marks down 6, so the
                // line is not "where the gain says" — it is where a touchdown says.
                const scored = Math.abs(e.y) >= 49.5 || expect >= 49.5 || e.d === 6 || (lastSettle && e.su !== lastSettle.su);
                const turnoverMirror = e.d0 === 4 && e.d === 1 && Math.abs(e.y + expect) < 1.6;   // V394: 4th down failed, line mirrored for the other team
                if (!scored && !turnoverMirror && Math.abs(e.y - expect) > 1.6)
                    flag('R-YARD', `${e.type} for ${e.gain}: line was ${e.y0.toFixed(1)}, should be ${expect.toFixed(1)}, is ${e.y.toFixed(1)}`, [lastSnap, e],
                         `${T(r)}: after a ${e.type} for ${e.gain} yards the ball should have been on ${spot(expect)}, but it was on ${spot(e.y)}.`);
            }
            if (scrim && lastSettle && lastSettle.d && typeof e.gain === 'number' && typeof e.d === 'number') {
                // Down & distance: this play FACED the previous settle's resulting
                // down and to-go; its gain decides the down it leaves behind.
                const facedD = lastSettle.d, facedTg = lastSettle.tg, g = e.gain;
                // V380: the settle's gain is rounded; the engine measures the exact
                // one (8.0 vs 8.6 to go is NOT a first down). Judge with the line.
                const gExact = (typeof e.y === 'number' && typeof e.y0 === 'number') ? (e.y - e.y0) : g;
                const first = gExact >= facedTg - 0.05;
                const expD = first ? 1 : facedD + 1;
                const scored = Math.abs(e.y) >= 49.5 || e.su !== lastSettle.su;
                if (!scored && facedD <= 3 && e.d0 === facedD && e.d !== expD)
                    flag('R-DOWN', `${e.type} for ${g} facing ${facedD}&${facedTg.toFixed(1)} left it ${e.d}&${e.tg}, expected down ${expD}`, [lastSettle, e],
                         `${T(r)}: a ${e.type} for ${g} yards on ${dd(facedD, facedTg)} should have left it ${expD === 1 ? '1st & 10' : ordinal(expD) + ' down'}, but the next down was ${ordinal(e.d)}.`);
            }
            lastSettle = e;
        }
    }

    // ---- R-CONT: between two plays of one possession the ball does not move ----
    // MHUY 413s: an 8-yard completion settled at +10.7, 2nd & 2.5; half a second
    // later the next snap was at +3.2, 1st & 10, with the quarter-start clock —
    // a quarter-start restore had re-fired mid-quarter. The previous settle
    // predicts the next snap exactly; a handoff, quarter change or kick resets.
    for (const r of roles) {
        let last = null;
        for (const e of byRole[r]) {
            if (e.k === 'q' || e.k === 'recv' || e.k === 'wait' || e.k === 'p6' || (e.k === 'diag' && /QTR-KEEP resume|kickoff|RESCUE|forcing/i.test(e.m))) { last = null; continue; }
            if (e.k === 'settle') { last = ['run', 'pass', 'sack', 'incomplete'].includes(e.type) && Math.abs(e.y) < 49.5 ? e : null; continue; }
            if (e.k === 'snap' && last) {
                const convSpotChoice = last.d === 6 && e.d === 6 && Math.abs(last.y) >= 34 && Math.abs(e.y) >= 34;   // V394: the 2 <-> the 15 is the 1-pt / 2-pt choice
                if ((Math.abs(e.y - last.y) > 1.6 || e.d !== last.d) && !convSpotChoice)
                    flag('R-CONT', `LINE MOVED BETWEEN PLAYS on ${r}: play settled at ${last.y.toFixed(1)} (${last.d}&${last.tg}), next snap at ${e.y.toFixed(1)} (${e.d}&${e.tg})`, [last, e],
                         `${T(r)}: a play was undone. The last play ended on ${spot(last.y)} at ${dd(last.d, last.tg)}, but the next snap was from ${spot(e.y)} at ${dd(e.d, e.tg)}.`);
                if (typeof e.clk === 'number' && typeof last.clk === 'number' && e.q === last.q && e.clk > last.clk + 0.5)
                    flag('R-CLOCK', `clock went UP between plays inside Q${e.q} on ${r}: ${last.clk}s -> ${e.clk}s`, [last, e],
                         `${T(r)}: the clock went back up from ${clockStr(last.clk)} to ${clockStr(e.clk)} in the middle of quarter ${e.q}.`);
                last = null;
            }
        }
    }

    // ---- R-SCORE: legal deltas, monotonic, both boards converge ----
    for (const r of roles) {
        const other = r === 'a' ? 'b' : 'a';
        const binds = byRole[r].filter(x => x.k === 'bind').map(x => x.t);
        for (const e of byRole[r].filter(x => x.k === 'score')) {
            const isRestore = binds.some(t => e.t >= t - 500 && e.t < t + 3000);
            if (isRestore) {
                // a restore must reproduce what the OTHER phone currently believes
                const view = byRole[other].filter(x => x.k === 'score' && x.t < e.t).pop();
                if (view && (view.so !== e.su || view.su !== e.so))
                    flag('R-SCORE', `RESTORE on ${r} came back ${e.su}-${e.so}, but ${other} had it ${view.so}-${view.su}`, [view, e],
                         `${T(r)} came back from a refresh with the score ${e.su}-${e.so}, but ${T(other)} had it ${view.so}-${view.su}.`);
                continue;
            }
            const deltas = [e.dsu, e.dso];
            for (const dv of deltas) {
                if (dv < 0) flag('R-SCORE', `a score went DOWN by ${-dv} on ${r}`, [e], `A score went DOWN by ${-dv} on ${T(r)}'s phone.`);
                else if (dv > 0 && ![1, 2, 3, 6, 7, 8].includes(dv)) flag('R-SCORE', `illegal score delta +${dv} on ${r}`, [e], `${T(r)}'s board jumped by ${dv} points at once — no single play is worth that.`);
            }
        }
    }
    // ---- COMPLETE = the stats screen appeared after Q4 or overtime ----
    // V405: a game that reached the end of regulation with a decided score, or
    // ended an overtime round, is not complete until BOTH phones showed the
    // final. A phone that stayed visible and never got there is a game defect;
    // a phone that closed before the final is the player's doing (still incomplete).
    const complete = { horn: null, finals: {}, complete: false, incompleteWhy: '' };
    {
        const q5 = tl.find(x => x.k === 'q' && x.to >= 5);
        const scoreAt = (r, t) => { const s = byRole[r].filter(x => x.k === 'score' && x.t <= t + 3000).pop(); return s ? [s.su, s.so] : null; };
        let horn = null;
        if (q5) { const sc = scoreAt(q5.role, q5.t) || scoreAt(other(q5.role), q5.t); if (sc && sc[0] !== sc[1]) horn = q5; }
        const otEnd = tl.find(x => x.k === 'diag' && /round complete|walk-off/.test(String(x.m || '')));
        if (!horn && otEnd) horn = otEnd;
        complete.horn = horn ? horn.t : null;
        for (const r of roles) { const f = byRole[r].find(x => x.k === 'final'); complete.finals[r] = f ? f.t : null; }
        complete.complete = roles.length > 0 && roles.every(r => complete.finals[r]);
        if (horn && !complete.complete) {
            for (const r of roles) {
                if (complete.finals[r]) continue;
                const hid = byRole[r].find(x => x.k === 'vis' && x.h === true && x.t > horn.t && x.t < horn.t + 30000);
                const stayed = byRole[r].some(x => x.t > horn.t + 30000);
                if (!hid && stayed) { complete.incompleteWhy = r + ' stayed on the page but the final never appeared';
                    flag('R-FINAL', `${r} never reached the stats screen: the game was decided at the horn but no final appeared in 30s while the page stayed open`, [horn],
                         `${T(r)}'s game ended at the horn but the stats screen never appeared, even though the phone stayed on the page.`); }
                else if (hid) { complete.incompleteWhy = r + ' closed the page ' + ((hid.t - horn.t) / 1000).toFixed(0) + 's after the horn, before the final';
                    flag('R-FINAL', `${r} closed the page ${((hid.t - horn.t) / 1000).toFixed(0)}s after the horn, before the stats screen appeared`, [horn, hid],
                         `${T(r)} left ${((hid.t - horn.t) / 1000).toFixed(0)} seconds after the horn, before the stats screen came up — the game is not complete.`); }
                else complete.incompleteWhy = r + ' has no final on record';
            }
        }
    }
    {
        // both devices' final view of the score should agree
        const fin = { a: byRole.a.filter(x => x.k === 'final').pop(), b: byRole.b.filter(x => x.k === 'final').pop() };
        if (fin.a && fin.b && (fin.a.su !== fin.b.so || fin.a.so !== fin.b.su))
            flag('R-FINAL', `final boards disagree: a says ${fin.a.su}-${fin.a.so}, b says ${fin.b.su}-${fin.b.so}`, [fin.a, fin.b],
                 `The two phones ended with different final scores: ${T('a')} says ${fin.a.su}-${fin.a.so}, ${T('b')} says ${fin.b.so}-${fin.b.su}.`);
    }

    // ---- R-CLOCK: quarter monotonic, clock never runs backwards inside a quarter ----
    for (const r of roles) {
        let q = 0, clk = null, last = null;
        for (const e of byRole[r]) {
            if (e.k === 'q') {
                if (e.to < e.from) flag('R-CLOCK', `quarter went backwards ${e.from} -> ${e.to} on ${r}`, [e], `${T(r)}: the game went back from quarter ${e.from} to quarter ${e.to}.`);
                if (e.to > 5) flag('R-CLOCK', `quarter ${e.to} does not exist`, [e], `${T(r)}: the game moved to a quarter ${e.to} — there is no such quarter.`);
                q = e.to; clk = null; continue;
            }
            if ((e.k === 'snap' || e.k === 'settle') && typeof e.clk === 'number') {
                if (e.q === q && clk != null && e.clk > clk + 0.5 && e.k === 'snap' && last && last.k === 'snap')
                    flag('R-CLOCK', `clock went UP inside Q${q}: ${clk}s -> ${e.clk}s on ${r}`, [last, e], `${T(r)}: the clock went back up from ${clockStr(clk)} to ${clockStr(e.clk)} in quarter ${q}.`);
                clk = e.clk; last = e;
            }
        }
    }

    // ---- R-POSS: exactly one live device; transitions justified; deadlocks ----
    {
        const wait = { a: null, b: null }, waitSince = { a: 0, b: 0 }, hidden = { a: false, b: false };
        let bothWaitSince = null, bothLiveSince = null;
        let lastRecv = { a: 0, b: 0 }, lastQ = { a: 0, b: 0 };
        let cascade = false;
        for (const e of tl) {
            if (e.k === 'p6' && e.step === 'detected') cascade = true;
            if (e.k === 'p6' && (e.step === 'resultApplied' || e.step === 'driveStarted')) cascade = false;
            if (e.k === 'diag' && /PAT-INV force-release|PAT-INV 35s wall/.test(e.m)) cascade = false;   // the 35s wall ended it
            if (e.k === 'vis') hidden[e.role] = e.h === true;
            if (e.k === 'recv') lastRecv[e.role] = e.t;
            if (e.k === 'diag' && /^OUTCOME (drained|held)/.test(e.m)) lastRecv[e.role] = e.t;
            if (e.k === 'q') lastQ[e.role] = e.t;
            if (e.k === 'wait' && e.refused) {
                const why = /turn is the opponent/.test(e.refused) ? 'the game still thought the other team had it' : /threw it/.test(e.refused) ? 'it had just thrown a pick-six' : e.refused;
                flag('R-POSS', `${e.role} was REFUSED going LIVE: ${e.refused}`, [e], `${T(e.role)} was blocked from taking the ball because ${why}.`); continue;
            }
            if (e.k === 'wait') {
                wait[e.role] = e.on; waitSince[e.role] = e.t;
                if (e.on === false && !cascade) {
                    const justified = (e.t - lastRecv[e.role] < 8000) || (e.t - lastQ[e.role] < 8000) || (e.t - t0 < 15000) || /L\d+/.test(e.why) === false;
                    if (!justified) flag('R-POSS', `${e.role} went LIVE with no handoff in the last 8s (caller ${e.why})`, [e], `${T(e.role)} took the ball with nothing handing it over.`);
                }
            }
            if (e.k === 'stage') {
                const bothWait = wait.a === true && wait.b === true;
                const bothLive = wait.a === false && wait.b === false;
                if (bothWait) {
                    if (!bothWaitSince) bothWaitSince = e.t;
                    else if (e.t - bothWaitSince > (cascade ? 120000 : 12000)) {
                        const secs = ((e.t - bothWaitSince) / 1000).toFixed(0);
                        const hid = roles.find(r => hidden[r]);
                        if (hid) flag('R-POSS', `IDLE: both devices waiting for ${secs}s while ${hid}'s screen was hidden`, [e],
                                      `${T(hid)}'s screen was off (or the app was in the background) for ${secs} seconds while ${T(other(hid))} waited for it.`);
                        else {
                            // V406 (LVVB): a phone that stopped writing anything at all did not deadlock — it closed or crashed
                            const silent = roles.find(r => r !== e.role && !byRole[r].some(x => x.t > e.t - 30000 && x.t <= e.t));
                            if (silent) flag('R-POSS', `SILENT: ${silent}'s phone stopped reporting while ${other(silent)} waited ${secs}s`, [e],
                                             `${T(silent)}'s phone went silent (closed, crashed or lost its connection) while ${T(other(silent))} waited ${secs} seconds.`);
                            else flag('R-POSS', `DEADLOCK: both devices waiting for ${secs}s` + (cascade ? ' (inside a pick-6 cascade)' : ''), [e],
                                     `Both phones sat on "waiting for opponent" for ${secs} seconds — the game was stuck.`);
                        }
                        bothWaitSince = null;
                    }
                }
                else bothWaitSince = null;
                if (bothLive) { if (!bothLiveSince) bothLiveSince = e.t; else if (e.t - bothLiveSince > 3000 && !cascade) { flag('R-POSS', `DOUBLE OFFENSE: both devices live for ${((e.t - bothLiveSince) / 1000).toFixed(0)}s`, [e], `Both phones were on offense at the same time for ${((e.t - bothLiveSince) / 1000).toFixed(0)} seconds.`); bothLiveSince = null; } }
                else bothLiveSince = null;
            }
        }
    }

    // ---- R-POSS: a rescue that staged a drive but left the phone on "waiting" ----
    // GVCG: TURN-RESCUE fired five times, each time a full formation appeared
    // under the cover, and the phone never came off "waiting for opponent".
    for (const r of roles) {
        const resc = byRole[r].filter(x => x.k === 'diag' && /^TURN-RESCUE -> offense/.test(x.m));
        for (const e of resc) {
            const later = byRole[r].find(x => x.k === 'stage' && x.t > e.t + 2000 && x.t < e.t + 8000);
            const wentLive = byRole[r].some(x => x.k === 'wait' && x.on === false && x.t > e.t && x.t < e.t + 8000);
            if (later && later.of >= 6 && later.wait === true && !wentLive) {
                flag('R-POSS', `TURN-RESCUE on ${r} staged a drive but the device stayed WAIT`, [e, later],
                     `${T(r)} tried to take the ball back (a rescue), a formation appeared, but the phone stayed on "waiting for opponent".`);
                break;
            }
        }
    }
    // ---- R-P6: a conversion that was played but never resolved ----
    for (const r of roles) {
        const modals = byRole[r].filter(x => x.k === 'conv' && x.ev === 'modal');
        for (const m of modals) {
            const played = byRole[r].find(x => x.k === 'stage' && x.t > m.t && x.t < m.t + 60000 && (x.kp === 7 || x.kp === 5 || x.kp === 11));
            const after = byRole[r].filter(x => x.t > m.t && x.t < m.t + 120000);
            const resolved = after.some(x => (x.k === 'conv' && (x.ev === 'made' || x.ev === 'missed')) || (x.k === 'p6' && (x.step === 'resolved' || x.step === 'resultSent')) ||
                                             (x.k === 'score' && (x.dsu === 1 || x.dsu === 2)) || (x.k === 'send' && /KICKOFF|PAT_RESULT|^TD$/.test(x.type)));   // V395: V394 ships the post-try hand-off typed TD
            // ILVQ: a failed try at the horn left the scene as a possession change (OTHER, ball at the 11) instead of a kickoff
            const cutShort = !resolved && after.find(x => x.k === 'send' && x.type === 'OTHER');
            if (played && cutShort) flag('R-P6', `conversion on ${r} ended as a plain possession change (OTHER at ${cutShort.y}) instead of a kickoff`, [m, played, cutShort],
                                         `${T(r)}'s conversion try was cut off and handed over as an ordinary turnover — ${T(other(r))} got the ball on ${spot(cutShort.y)} instead of a kickoff.`);
            else if (played && !resolved) flag('R-P6', `conversion on ${r} was PLAYED (ball live) but never resolved`, [m, played],
                                          `${T(r)} played the conversion — the ball went live — but the game never decided whether it was good or missed, and nothing moved on.`);
        }
    }

    // ---- R-OVL: flicker and exposed formations ----
    // The scorer of a pick-6 plays its conversion flagged waiting with the cover
    // deliberately off (V280); from `applied` to `resultSent` on that device the
    // exposed formation is the conversion itself.
    const patWindows = {};
    { let open = null; for (const e of tl.filter(x => x.k === 'p6')) {
        if (e.step === 'applied') open = { role: e.role, from: e.t, to: Infinity };
        if (open && e.role === open.role && (e.step === 'resultSent' || e.step === 'resultApplied')) { open.to = e.t + 3000; (patWindows[open.role] = patWindows[open.role] || []).push(open); open = null; }
    } if (open) (patWindows[open.role] = patWindows[open.role] || []).push(open); }
    const inPat = (r, t) => (patWindows[r] || []).some(w => t >= w.from && t <= w.to);
    for (const r of roles) {
        const ov = byRole[r].filter(x => x.k === 'ovl');
        for (let i = 0; i < ov.length; i++) {
            const win = ov.filter(x => x.t >= ov[i].t && x.t < ov[i].t + 5000);
            if (win.length > 3) { flag('R-OVL', `FLICKER on ${r}: ${win.length} overlay toggles in 5s`, win.slice(0, 6), `${T(r)}'s "waiting for opponent" screen blinked on and off ${win.length} times in 5 seconds.`); i += win.length; }
        }
        let hiddenSince = null;
        for (const e of byRole[r].filter(x => x.k === 'stage')) {
            // A staged scene under a SOLID cover is harmless; the defect is a
            // parked device whose cover is OFF while a formation is on screen.
            if (e.wait === true && e.of >= 6 && e.ovl === false && !inPat(r, e.t)) { if (!hiddenSince) hiddenSince = e; else if (e.t - hiddenSince.t > 5000) { flag('R-OVL', `EXPOSED FORMATION on ${r}: ${e.of} offensive players on screen while parked in WAIT with the cover OFF for ${((e.t - hiddenSince.t) / 1000).toFixed(0)}s`, [hiddenSince, e], `${T(r)} was supposed to be waiting, but its screen showed a full formation for ${((e.t - hiddenSince.t) / 1000).toFixed(0)} seconds.`); hiddenSince = null; } }
            else hiddenSince = null;
        }
    }

    // ---- R-P6: the pick-6 chain, step by step, within budget ----
    {
        const steps = tl.filter(x => x.k === 'p6');
        const budgets = [['detected', 'sent', 9000], ['sent', 'applied', 12000], ['applied', 'modal', 3000], ['modal', 'resultSent', 120000], ['resultSent', 'resultApplied', 8000]];
        // pair modal entries from conv: a modal on the SCORER after 'applied'
        const convModals = tl.filter(x => x.k === 'conv' && x.ev === 'modal');
        const firstFinal = tl.find(x => x.k === 'final');
        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            if (s.step !== 'detected') continue;
            if (firstFinal && s.t > firstFinal.t) continue;   // V397: the game is over — nothing after the final is a chain
            const chain = { detected: s };
            for (const x of steps.slice(i + 1)) { if (x.step === 'detected') break; if (!chain[x.step]) chain[x.step] = x; }
            // V397 (LXXH): the other phone's clock can run a second ahead, so its
            // 'applied' lands BEFORE this phone's 'detected' in the merged
            // timeline. A step from the other phone up to 5s before 'detected'
            // belongs to this chain when nothing later claimed it.
            for (const x of steps.slice(0, i).reverse()) {
                if (s.t - x.t > 5000) break;
                if (x.role === s.role || x.step === 'detected' || chain[x.step]) continue;
                chain[x.step] = x;
            }
            const m = convModals.find(x => chain.applied && x.t >= chain.applied.t && x.t < chain.applied.t + 3000 && x.role === chain.applied.role);
            if (m) chain.modal = m;
            for (const [from, to, ms] of budgets) {
                const stepName = { detected: 'the pick-six was seen', sent: 'it was reported to the other phone', applied: 'the other phone credited it', modal: 'the conversion choice appeared', resultSent: 'the conversion result was sent back', resultApplied: 'the conversion result was received' };
                if (chain[from] && !chain[to] && firstFinal && chain[from].t > firstFinal.t - 5000) continue;   // V397: the game ended here — the chain did not break, it stopped
                if (chain[from] && !chain[to]) flag('R-P6', `pick-6 chain broke: ${from} at +${((chain[from].t - t0) / 1000).toFixed(1)}s but no ${to}`, [chain[from]], `A pick-six got stuck: ${stepName[from]}, but the next step — ${stepName[to]} — never happened.`);
                else if (chain[from] && chain[to] && chain[to].t - chain[from].t > ms) flag('R-P6', `pick-6 step ${from} -> ${to} took ${((chain[to].t - chain[from].t) / 1000).toFixed(1)}s (budget ${ms / 1000}s)`, [chain[from], chain[to]], `A pick-six step was slow: ${stepName[to]} took ${((chain[to].t - chain[from].t) / 1000).toFixed(0)} seconds.`);
            }
            // the thrower must go LIVE within 6s of resultApplied
            if (chain.resultApplied) {
                const live = tl.find(x => x.k === 'wait' && x.on === false && x.role === chain.resultApplied.role && x.t >= chain.resultApplied.t - 500 && x.t < chain.resultApplied.t + 6000);
                if (!live) flag('R-P6', `thrower (${chain.resultApplied.role}) never went LIVE within 6s of PAT_RESULT`, [chain.resultApplied], `${T(chain.resultApplied.role)} never got the ball back after the conversion.`);
            }
            // duplicate modals on the scorer
            if (chain.applied) {
                // V410 (UFHY): the window ends where this chain's result was sent — the NEXT pick-six's modal is not a duplicate
                const dupEnd = Math.min(chain.applied.t + 60000, chain.resultSent ? chain.resultSent.t : Infinity,
                                        ...steps.filter(x => x.step === 'applied' && x.role === chain.applied.role && x.t > chain.applied.t).map(x => x.t));
                const dup = convModals.filter(x => x.role === chain.applied.role && x.t >= chain.applied.t && x.t < dupEnd);
                if (dup.length > 1) flag('R-P6', `${dup.length} conversion modals built for one pick-6 on ${chain.applied.role}`, dup, `${T(chain.applied.role)} was asked to choose a conversion ${dup.length} times for one score.`);
            }
        }
        // PHANTOM pick-6s (MHUY): the score-jump watcher read a resume's score
        // RESTORE (+9, then +17) as a defensive touchdown, and the record it
        // shipped said the +6 had never landed — so the other phone invented it.
        for (const ch of phantomPick6(tl)) {
            const d = ch.detected, r = d.role;
            const boot = tl.find(x => x.role === r && x.k === 'diag' && x.m === 'boot' && x.t <= d.t && d.t - x.t < 20000);
            const m = /score-watcher\(\+(\d+)\)/.exec(String(d.src || ''));
            const tech = [], why = [];
            if (boot) { const secs = Math.max(1, Math.round((d.t - boot.t) / 1000)); tech.push(`PHANTOM PICK-6: detected on ${r} ${((d.t - boot.t) / 1000).toFixed(1)}s after a boot (a restore, not a play)`); why.push(`${secs} second${secs === 1 ? '' : 's'} after ${T(r)}'s phone was refreshed`); }
            if (m && Number(m[1]) !== 6) { tech.push(`PHANTOM PICK-6: the opponent's score jumped +${m[1]} on ${r} — a defensive touchdown is exactly +6`); why.push(`${T(other(r))}'s score had just jumped by ${m[1]} at once (a real touchdown is exactly 6)`); }
            if (ch.sent && ch.sent.plus6 === false) tech.push(`PICK6 shipped from ${r} WITHOUT the +6 having landed there — the other phone will invent the points`);
            const tail = (ch.sent && ch.sent.plus6 === false) ? ` It reported it to ${T(other(r))} without the 6 points ever showing on its own board, so ${T(other(r))}'s phone added them itself.` : ' It never reached the other phone.';
            flag('R-P6', tech.join('; '), [boot, d, ch.sent].filter(Boolean),
                 `${T(r)}'s phone reported a pick-six that never happened — ${why.join(', and ')}.` + tail);
        }
        // THE POINTS THEMSELVES: every score credited on the receiver of a phantom
        // pick-six chain (the +6, and any conversion it then played).
        for (const ch of phantomPick6(tl)) {
            const rcv = other(ch.role);
            const from = ch.applied ? ch.applied.t : (ch.sent ? ch.sent.t : ch.detected.t);
            const until = (ch.resultApplied ? ch.resultApplied.t : from + 120000) + 2000;
            const rcvBinds = tl.filter(x => x.role === rcv && x.k === 'bind').map(x => x.t);
            for (const sc of tl.filter(x => x.k === 'score' && x.role === rcv && x.t >= from - 500 && x.t <= until && x.dsu > 0 &&
                                             !rcvBinds.some(bt => x.t >= bt - 500 && x.t < bt + 3000)))
                flag('R-SCORE', `PHANTOM POINTS: ${rcv} +${sc.dsu} (${sc.su - sc.dsu} -> ${sc.su}) from a pick-6 that never happened`, [sc],
                     `${T(rcv)} was given ${sc.dsu} point${sc.dsu === 1 ? '' : 's'} it did not earn (${sc.su - sc.dsu} → ${sc.su}).`);
        }
        // THE SECOND HALF: this game's rule is that Phone B receives the second-
        // half kickoff. Anything A does with the ball between the Q3 change and
        // B's first Q3 snap is A holding a ball that was never its to hold.
        const q3 = tl.find(x => x.k === 'q' && x.to === 3);
        const bFirst = q3 && tl.find(x => x.role === 'b' && x.k === 'snap' && x.q === 3 && x.t > q3.t);
        if (q3 && bFirst) {
            // V397 (LXEI): A's conversion offered just before the horn resolves
            // AFTER the quarter number changes (+2 at Q3 3:00, then the TD
            // hand-off). That tail is the end of the first half, not A taking
            // the second-half ball.
            const aConvBeforeHorn = tl.some(x => x.role === 'a' && x.k === 'conv' && x.ev === 'modal' && x.t > q3.t - 30000 && x.t < q3.t);
            // V410 (ISOO, OKGT): the last play of the half snapped before the horn and settled just after it — not A holding the ball
            const lastSnapBefore = tl.filter(x => x.role === 'a' && x.k === 'snap' && x.t < q3.t).pop();
            const playAcrossHorn = x => x.k === 'settle' && lastSnapBefore && x.t - q3.t < 3000 && q3.t - lastSnapBefore.t < 30000;
            const held = tl.filter(x => x.role === 'a' && x.t > q3.t && x.t < bFirst.t && !playAcrossHorn(x) &&
                !(aConvBeforeHorn && x.t < q3.t + 10000 && x.k !== 'snap') &&
                ((x.k === 'conv' && x.ev === 'modal') || (x.k === 'score' && x.dsu > 0) || x.k === 'snap' || x.k === 'settle'));
            if (held.length) flag('R-HALF', `A had the ball after the Q3 change before B's first Q3 snap (${held.length} events)`, held.slice(0, 4),
                                  `${T('a')} had the ball to start the second half — it should have been ${T('b')} (they get the ball after halftime). ${T('a')} was on the field ${held.length} time${held.length === 1 ? '' : 's'} before ${T('b')}'s first snap.`);
        }
        // the thrower's engine must never build a conversion modal
        const thrower = steps.find(x => x.step === 'detected');
        if (thrower) {
            const tm = convModals.filter(x => x.role === thrower.role && x.t >= thrower.t && x.t < thrower.t + 30000);
            if (tm.length) flag('R-P6', `the THROWER (${thrower.role}) built ${tm.length} conversion modal(s)`, tm, `${T(thrower.role)} threw the pick-six, yet was shown the conversion choice — that belongs to ${T(other(thrower.role))}.`);
        }
    }

    // ---- R-CONV: conversions only at +48 (the 2) or +35 (the 15) ----
    for (const e of tl.filter(x => x.k === 'diag' && /PAT-PIN re-pinned|PAT-PREPIN|BALLGATE HOLD/.test(x.m))) {
        if (/BALLGATE HOLD/.test(e.m)) flag('R-GATE', `ball gate had to HOLD a placement: ${e.m}`, [e], `A safety check stopped the ball from being moved at the start of a quarter on ${T(e.role)}.`);
    }
    for (const e of tl.filter(x => x.k === 'diag' && /CONVGATE REFUSED/.test(x.m))) flag('R-GATE', e.m, [e], `A safety check refused a conversion that had no touchdown behind it on ${T(e.role)}.`);
    for (const e of tl.filter(x => x.k === 'diag' && /^SCORE-FLOOR/.test(x.m))) flag('R-SCORE', 'a score regressed and was restored: ' + e.m, [e], `Something lowered a score on ${T(e.role)} and it had to be pulled back up.`);

    // ---- R-GIFT (room XEDG, Q2 0:56): the scorer never gets the next drive ----
    // After a conversion offer the scorer's next act is a PAT_RESULT or a
    // kickoff. A normal down snapped before that — with nothing received in
    // between — is a possession it was never owed.
    for (const r of roles) {
        const ev = byRole[r];
        for (const m of ev.filter(x => x.k === 'conv' && x.ev === 'modal')) {
            const result = ev.find(x => x.k === 'send' && (x.type === 'PAT_RESULT' || x.type === 'KICKOFF' || x.type === 'TD') && x.t > m.t && x.t < m.t + 180000);   // V395: TD = the typed kickoff
            const recvAfter = ev.find(x => x.k === 'recv' && x.t > m.t);
            const limit = Math.min(result ? result.t : Infinity, recvAfter ? recvAfter.t : Infinity, m.t + 180000);
            const snap = ev.find(x => x.k === 'snap' && x.t > m.t + 1500 && x.t < limit && x.d != null && x.d !== 6);
            if (snap) flag('R-GIFT', `${r} snapped a normal down (${snap.d}&${Math.round(snap.tg)} at ${snap.y}) ${((snap.t - m.t) / 1000).toFixed(0)}s after its conversion offer, before any PAT_RESULT/KICKOFF was sent`, [m, snap],
                           `${T(r)} was handed a fresh drive on ${spot(snap.y)} while it still owed the conversion — a possession it never earned.`);
        }
        for (const w of ev.filter(x => x.k === 'conv' && x.ev === 'missed' && x.wall))
            flag('R-P6', `the 35s wall resolved ${r}'s conversion as missed`, [w], `${T(r)} let the conversion sit for 35 seconds; it was counted as missed and the game moved on.`);
        for (const gd of ev.filter(x => x.k === 'guard' && (x.what === 'force-drive' || x.what === 'rescue')))
            flag('R-P6', `${r} asked for a drive while owing its conversion result (${gd.what}) — refused`, [gd], `${T(r)} asked for a drive while it still owed the conversion result; the game refused.`);
        for (const fb of ev.filter(x => x.k === 'guard' && x.what === 'fallback300'))
            flag('R-FALLBACK', `300s fallback on ${r}: ${fb.why}`, [fb], fb.why === 'fired'
                 ? `The five-minute emergency timer on ${T(r)} force-started its drive — a conversion result never arrived.`
                 : `A five-minute emergency timer left over from an earlier pick-six went off on ${T(r)} and stood down, as it should.`);
    }
    // ---- R-STALE (room XEDG, Q3 1:05 / Q4 1:12): a handoff that arrived while playing ----
    {
        const live = { a: null, b: null };
        for (const e of tl) {
            if (e.k === 'wait') { live[e.role] = e.on === false; continue; }
            if (e.k !== 'recv' || e.type === 'PICK6' || live[e.role] !== true) continue;
            const r = e.role, o = other(r);
            const purged = tl.find(x => x.k === 'purge' && x.role === r && x.ts === e.ts);
            const applied = tl.find(x => x.k === 'apply' && x.role === r && x.ts === e.ts);
            const qRecent = tl.some(x => x.k === 'q' && x.role === r && e.t - x.t >= 0 && e.t - x.t < 10000);
            const hasApplyKind = tl.some(x => x.k === 'apply' || x.k === 'purge');
            if (purged) { if (!qRecent) flag('R-STALE', `${r} received ${e.type} while LIVE; purged ${Math.round(purged.ageMs / 1000)}s later at its own handoff`, [e, purged],
                                          `${T(o)}'s handoff arrived while ${T(r)} was already playing; it was thrown away at ${T(r)}'s next handoff, as it should be.`); }
            else if (applied) { if (applied.lagMs > 5000) flag('R-STALE', `${r} applied ${o}'s ${e.type} ${Math.round(applied.lagMs / 1000)}s after it arrived`, [e, applied],
                                          `${T(r)} applied ${T(o)}'s handoff ${Math.round(applied.lagMs / 1000)} seconds after it arrived — its clock and score were dragged back to that moment.`); }
            else if (!hasApplyKind) flag('R-STALE', `${r} received ${e.type} while LIVE (this build queued it for the next park)`, [e],
                                         `${T(o)}'s handoff arrived while ${T(r)} was already playing and sat in the queue until ${T(r)} next parked — dragging the clock back to that moment.`);
        }
    }
    // ---- R-KEEP (room XEDG, 288-304s): the between-quarters keep fired again and again ----
    for (const r of roles) {
        const ev = byRole[r];
        const keeps = ev.filter(x => x.k === 'keep');
        if (keeps.length) {
            const byQ = {};
            for (const k of keeps) if (!byQ[k.q] || k.n > byQ[k.q].n) byQ[k.q] = k;
            for (const q of Object.keys(byQ)) if (byQ[q].n >= 4)   // V394: n=3 is the gate's refusal, not a loop
                flag('R-KEEP', `keep-drive fired ${byQ[q].n} times in Q${q} on ${r}`, [byQ[q]], `${T(r)}'s drive was re-staged ${byQ[q].n} times at the start of quarter ${q} — the play kept changing on its own.`);
        } else {
            let q = null, n = 0, firstK = null;
            for (const e of ev) {
                if (e.k === 'q') { if (n >= 3) flag('R-KEEP', `QTR-KEEP resume x${n} in Q${q} on ${r}`, [firstK], `${T(r)}'s drive was re-staged ${n} times at the start of quarter ${q} — the play kept changing on its own (the "infinite audible").`); q = e.to; n = 0; firstK = null; continue; }
                if (e.k === 'diag' && /^QTR-KEEP resume Q/.test(e.m)) { if (!n) firstK = e; n++; }
            }
            if (n >= 3) flag('R-KEEP', `QTR-KEEP resume x${n} in Q${q} on ${r}`, [firstK], `${T(r)}'s drive was re-staged ${n} times at the start of quarter ${q} — the play kept changing on its own (the "infinite audible").`);
        }
    }

    // ---- R-CLOCK (V382): the clock law refused an upward write ----
    for (const e of tl.filter(x => x.k === 'clock'))
        flag('R-CLOCK', `clock write ${e.from}s -> ${e.to}s in Q${e.q} on ${e.role} REFUSED (writer ${e.who}${e.n > 1 ? ', x' + e.n : ''})`, [e],
             `Something tried to move ${T(e.role)}'s clock from ${clockStr(e.from)} back up to ${clockStr(e.to)} in quarter ${e.q}; the game refused it and kept ${clockStr(e.from)}.`);

    // ---- R-XPORT: sends that never got acked while the other side was alive ----
    {
        const sends = tl.filter(x => x.k === 'send' && x.type !== 'PAT_RESULT' || (x.k === 'send' && x.type === 'PAT_RESULT'));
        const acks = tl.filter(x => x.k === 'ack');
        for (const s of sends) {
            const other = s.role === 'a' ? 'b' : 'a';
            const ack = acks.find(a => a.role === other && a.ts === s.ts);
            const recv = tl.find(x => x.k === 'recv' && x.role === other && x.ts === s.ts) ||
                         tl.find(x => x.k === 'diag' && x.role === other && x.t >= s.t && x.t < s.t + 20000 && new RegExp('^OUTCOME (held|drained) \\(' + s.type + '\\)').test(x.m));
            const otherAlive = byRole[other].some(x => x.k === 'stage' && x.t > s.t && x.t < s.t + 20000 && x.fps > 0);
            if (!ack && !recv && otherAlive) flag('R-XPORT', `${s.role}'s ${s.type} was never received by ${other} although ${other} was drawing frames`, [s], `${T(s.role)} handed the ball over, but ${T(other)} never received it even though its screen was on.`);
        }
        for (const e of tl.filter(x => x.k === 'diag' && /FB-STALL|FB-CONN OFFLINE|DELIVERY re-send/.test(x.m))) flag('R-XPORT', e.m, [e], `${T(e.role)}'s connection to the server stalled for a moment; the backup path was used.`);
        for (const e of tl.filter(x => x.k === 'dropped')) flag('R-XPORT', `telemetry dropped ${e.n} entries on ${e.role}`, [e], `${T(e.role)}'s phone could not record ${e.n} moments of the game.`);
    }

    flags.sort((x, y) => x.t - y.t);

    // ---- V390: what the PLAYER felt — impact, repeats folded, chains ----
    // impact 0 invisible (nothing changed for the player: a stall the backup
    // covered, a refused write, a cosmetic flicker), 1 yardline (the ball, the
    // down or a play moved), 2 scoreclock (points or game time changed),
    // 3 gameover (the game froze, deadlocked or ended when it shouldn't).
    const IMPACT_NAME = ['invisible', 'yardline', 'scoreclock', 'gameover'];
    const IMPACT_TEXT = ['the player would not have noticed', 'the ball or the down moved', 'the score or the clock changed', 'the game froze, stalled or ended wrongly'];
    const impactOf = f => {
        const m = f.msg || '';
        switch (f.rule) {
            case 'R-XPORT': return /never received|dropped/.test(m) ? 3 : 0;
            case 'R-OVL': return 0;
            case 'R-GATE': return 1;
            case 'R-YARD': case 'R-DOWN': case 'R-CONT': case 'R-KEEP': return 1;
            case 'R-SCORE': case 'R-GIFT': case 'R-HALF': return 2;
            case 'R-CLOCK': return /REFUSED/.test(m) ? 0 : 2;
            case 'R-STALE': return /purged/.test(m) ? 0 : 2;
            case 'R-FALLBACK': return /fired/.test(m) ? 3 : 0;
            case 'R-FINAL': return /closed the page/.test(m) ? 0 : 3;   // V405: a player leaving before the stats is not the game's fault
            case 'R-POSS': {
                if (/^IDLE|^SILENT/.test(m)) return 0;
                if (/DEADLOCK|stayed WAIT|DOUBLE OFFENSE/.test(m)) return 3;
                if (/REFUSED going LIVE/.test(m)) { const r = /^([ab]) was REFUSED/.exec(m); const role = r && r[1]; const recovered = role && tl.some(x => x.role === role && x.k === 'wait' && x.on === false && !x.refused && x.t > f.t && x.t < f.t + 15000); return recovered ? 0 : 3; }
                return 1;
            }
            case 'R-P6': {
                if (/chain broke|never resolved|never went LIVE/.test(m)) return 3;
                if (/instead of a kickoff/.test(m)) return 1;
                if (/refused|stood down/.test(m)) return 0;
                if (/35s wall/.test(m)) return 2;
                return 2;   // phantom, double modal, thrower modal: points
            }
        }
        return 1;
    };
    for (const f of flags) { f.impact = impactOf(f); f.impactName = IMPACT_NAME[f.impact]; f.impactText = IMPACT_TEXT[f.impact]; }
    // fold repeats: same rule, same sentence with the numbers taken out
    const keyOf = f => f.rule + '|' + String(f.plain).replace(/Q\d+ \d+:\d\d/g, 'Q#').replace(/\d+(\.\d+)?/g, '#');
    const folded = [], byKey = {};
    for (const f of flags) {
        const k = keyOf(f);
        if (byKey[k]) { const g = byKey[k]; g.count++; g.until = f.t; g.untilQ = f.q; g.untilClk = f.clk; if (f.impact > g.impact) { g.impact = f.impact; g.impactName = IMPACT_NAME[f.impact]; g.impactText = IMPACT_TEXT[f.impact]; } continue; }
        f.count = 1; byKey[k] = f; folded.push(f);
    }
    for (const f of folded) if (f.count > 1) {
        const span = (typeof f.untilQ === 'number' && typeof f.untilClk === 'number' && typeof f.q === 'number') ? ' (' + f.count + ' times, from Q' + f.q + ' ' + clockStr(f.clk) + ' to Q' + f.untilQ + ' ' + clockStr(f.untilClk) + ')' : ' (' + f.count + ' times)';
        f.plain = f.plain + span; f.msg = f.msg + ' x' + f.count;
    }
    // chains: problems within 25s of each other compound — a chain of three or
    // more real problems is one level worse than its worst member
    let chainId = 0;
    for (let i = 0; i < folded.length; i++) {
        const f = folded[i]; if (f.chain) continue;
        const members = [f]; let last = f.until || f.t;
        for (let j = i + 1; j < folded.length; j++) { const g = folded[j]; if (g.t - last <= 25000) { members.push(g); last = Math.max(last, g.until || g.t); } else break; }
        if (members.length < 2) continue;
        chainId++;
        const worst = Math.max(...members.map(x => x.impact));
        const real = members.filter(x => x.impact >= 1).length;
        const chainImpact = Math.min(3, worst + (real >= 3 ? 1 : 0));
        for (const x of members) { x.chain = chainId; x.chainSize = members.length; x.chainImpact = chainImpact; x.chainImpactName = IMPACT_NAME[chainImpact]; }
    }
    const worst = folded.length ? Math.max(...folded.map(x => Math.max(x.impact, x.chainImpact || 0))) : -1;
    const counts = [0, 0, 0, 0]; folded.forEach(x => counts[x.impact]++);
    const impact = { worst, worstName: worst >= 0 ? IMPACT_NAME[worst] : 'clean', worstText: worst >= 0 ? IMPACT_TEXT[worst] : 'nothing wrong', counts, names: IMPACT_NAME, texts: IMPACT_TEXT, raw: flags.length, folded: folded.length, chains: chainId };
    return { flags: folded, rawFlags: flags, impact, t0, entries: tl.length, complete };
}


// ---------------------------------------------------------------- english
// What each rule means, for a reader who did not write it.
const RULE_TEXT = {
    'R-YARD':  'The ball did not end up where the play said it should. The line of scrimmage moves by exactly the yards gained; when it does not, something moved the ball behind the play.',
    'R-DOWN':  'The down after a play was not the one football gives you (first down if the gain covered the distance, otherwise the next down).',
    'R-CONT':  'Between two plays of the same drive, the ball or the down changed without a play — a reset or a restore fired in the middle of a drive.',
    'R-SCORE': 'A score changed in a way football cannot produce (it went down, or jumped by an impossible amount), or a phone came back from a refresh with a different score than the other phone had.',
    'R-FINAL': 'A game is complete only when the stats screen appears after the fourth quarter or overtime. This flag means it did not (or the two phones disagreed about the final score).',
    'R-CLOCK': 'Game time went backwards inside a quarter, or the quarter number moved the wrong way — or (V382+) a write that would have done so was refused by the clock law.',
    'R-POSS':  'The two phones disagreed about who had the ball: both waiting (a dead game), both playing offense, a phone taking the ball with nothing handing it over, or a phone refused when it should have been allowed to play.',
    'R-OVL':   'The WAITING FOR OPPONENT cover misbehaved: it blinked, or it was off while the phone was supposed to be waiting, showing a formation that was not that phone\'s to play.',
    'R-P6':    'A pick-six did not go the way it must: a step was late or missing, the wrong phone built a conversion, two conversions appeared for one score, or a pick-six was "detected" that never happened (usually right after a refresh).',
    'R-GATE':  'One of the safety gates had to intervene (it held the ball in place, or refused a conversion). Not wrong by itself — it is the gate doing its job — but worth knowing.',
    'R-XPORT': 'Something between the two phones was lost or delayed: a handoff never arrived while the other phone was awake, or the connection stalled.',
    'R-HALF':  'The wrong team had the ball to start the second half. In this game the second phone always receives the second-half kickoff.',
    'R-GIFT':  'A phone that had just scored a pick-six (or any touchdown) was given a fresh drive instead of kicking off. After a conversion the scorer\'s only next act is to send the result and kick off.',
    'R-STALE': 'A handoff from the other phone arrived while this phone was already playing. It must be thrown away at the next handoff; if it is applied later it drags the clock and score back to that moment.',
    'R-KEEP':  'The between-quarters keep — the thing that continues a drive from Q1 into Q2 (or Q3 into Q4) — fired three or more times for one quarter, re-staging the play each time.',
    'R-FALLBACK': 'The five-minute emergency timer that force-starts a drive when a conversion result never comes back. It must only ever fire for the pick-six that armed it.'
};
// (R-P6 also covers a conversion that was played but never decided; R-POSS a
// rescue that staged a drive while the phone stayed on waiting.)
function explain(rule) { return RULE_TEXT[rule] || ''; }

// Turn the merged timeline into sentences a person can read. `meta.names`
// maps role -> team name. Every sentence keeps its timestamp and role so the
// page can show who saw what.
function narrate(tl, meta) {
    const names = (meta && meta.names) || {};
    const nm = r => names[r] || ('Phone ' + String(r).toUpperCase());
    const other = r => (r === 'a' ? 'b' : 'a');
    const out = [];
    const t0 = tl.length ? tl[0].t : 0;
    // The engine credits the +6 and builds the conversion modal in ONE
    // expression; the bridge notices the play's settle on its next tick
    // (~10ms later) and the score on its next sample (~40ms later). Read by
    // the millisecond, the offer comes first. It belongs after the score.
    tl = tl.slice();
    for (let i = 0; i < tl.length; i++) {
        const e = tl[i];
        if (!((e.k === 'conv' && e.ev === 'modal') || (e.k === 'p6' && e.step === 'modal'))) continue;
        const after = tl.find(x => x.role === e.role && x.t >= e.t && x.t - e.t < 1500 &&
                                   ((x.k === 'score' && x.dsu === 6) || (x.k === 'settle' && x.d === 6)));
        if (!after) continue;
        const scoreLine = tl.find(x => x.role === e.role && x.k === 'score' && x.dsu === 6 && x.t >= e.t && x.t - e.t < 1500) || after;
        const moved = Object.assign({}, e, { t: scoreLine.t + 1, q: scoreLine.q, clk: scoreLine.clk });
        tl[i] = moved;
    }
    tl.sort((a, b) => a.t - b.t || (a.role < b.role ? -1 : 1) || (a.s || 0) - (b.s || 0));
    // score lines that a phantom pick-six produced are said so
    const phantomT = new Set();
    const bindsOf = r => tl.filter(x => x.role === r && x.k === 'bind').map(x => x.t);
    const isRestore = e => bindsOf(e.role).some(bt => e.t >= bt - 500 && e.t < bt + 3000);
    for (const ch of phantomPick6(tl)) {
        const rcv = ch.role === 'a' ? 'b' : 'a';
        const from = ch.applied ? ch.applied.t : (ch.sent ? ch.sent.t : ch.detected.t);
        const until = (ch.resultApplied ? ch.resultApplied.t : from + 120000) + 2000;
        for (const sc of tl.filter(x => x.k === 'score' && x.t >= from - 500 && x.t <= until && !isRestore(x) && ((x.role === rcv && x.dsu > 0) || (x.role === ch.role && x.dso > 0)))) phantomT.add(sc.t + ':' + sc.role);
    }
    const push = (e, text, kind) => out.push({ t: e.t, rel: (e.t - t0) / 1000, role: e.role, text: text, kind: kind || 'play',
                                               q: (typeof e.q === 'number') ? e.q : (typeof e.to === 'number' ? e.to : undefined),
                                               clk: (typeof e.clk === 'number') ? e.clk : undefined });
    let lastQ = {};
    for (const e of tl) {
        const who = nm(e.role);
        switch (e.k) {
            case 'bind':
                push(e, who + (e.ver ? ' joined on ' + e.ver : ' joined') + (out.some(o => o.role === e.role && o.kind === 'system') ? ' again (after a refresh)' : '') + '.', 'system'); break;
            case 'q':
                if (lastQ[e.role] !== e.to) { lastQ[e.role] = e.to; push(e, (e.to === 3 ? 'Halftime. ' : '') + (e.to === 5 ? (((() => { const sc = tl.filter(x => x.role === e.role && x.k === 'score' && x.t <= e.t + 3000).pop(); return sc && sc.su === sc.so; })()) ? 'Overtime begins' : 'End of regulation (the clock hit 0:00 in the 4th)') : 'Quarter ' + e.to + ' begins') + ' on ' + who + '\'s phone' + (e.to === 2 || e.to === 4 ? ', same drive continues from ' + spot(e.y) + ', ' + dd(e.d, e.tg) : '') + '.', 'quarter'); }
                break;
            case 'settle': {
                const g = (typeof e.gain === 'number') ? e.gain : null;
                let s = '';
                const p = cap(e.name);
                if (e.type === 'pass') s = p + ' catches a pass for ' + g + (g === 1 ? ' yard' : ' yards');
                else if (e.type === 'run') s = p + ' runs for ' + g + (g === 1 ? ' yard' : ' yards');
                else if (e.type === 'sack') s = p + ' is sacked' + (g != null ? ' for a loss of ' + Math.abs(g) : '');
                else if (e.type === 'incomplete') s = 'Pass incomplete' + (p ? ' (' + p + ')' : '');
                else s = cap(e.type) + (p ? ' — ' + p : '');
                if (e.d === 6) s += ' — TOUCHDOWN' + (typeof e.clk === 'number' ? ', ' + clockStr(e.clk) + ' left' : '') + '.';
                else s += ' — ball on ' + spot(e.y) + ', ' + dd(e.d, e.tg) + (typeof e.clk === 'number' ? ', ' + clockStr(e.clk) + ' left' : '') + '.';
                push(e, s, 'play'); break;
            }
            case 'score': {
                if (isRestore(e)) { push(e, who + ' came back from the refresh with the score ' + e.su + '-' + e.so + '.', 'system'); break; }
                const parts = [];
                if (e.dsu > 0) parts.push(who + ' +' + e.dsu);
                if (e.dso > 0) parts.push(nm(other(e.role)) + ' +' + e.dso);
                if (e.dsu < 0 || e.dso < 0) parts.push('a score went DOWN');
                const label = (e.dsu === 6 || e.dso === 6) ? 'TOUCHDOWN' : (e.dsu === 3 || e.dso === 3) ? 'FIELD GOAL' : (e.dsu === 2 || e.dso === 2) ? '2-point conversion' : (e.dsu === 1 || e.dso === 1) ? 'extra point' : 'score change';
                const ghost = phantomT.has(e.t + ':' + e.role) ? ' ⚠ NOT EARNED — from a pick-six that never happened (see problems).' : '';
                push(e, label + ': ' + parts.join(', ') + ' — now ' + e.su + '-' + e.so + ' as ' + who + ' sees it.' + ghost, ghost ? 'flagline' : 'score'); break;
            }
            case 'send': push(e, who + ' hands the ball over (' + String(e.type).replace('OTHER', 'possession change').replace('KICKOFF', 'kickoff') + ')' + (typeof e.y === 'number' && e.type !== 'PAT_RESULT' && e.type !== 'PICK6' ? ', ' + nm(other(e.role)) + ' to start on ' + spot(-e.y) : '') + '.', 'handoff'); break;
            case 'recv': push(e, who + ' receives the ' + String(e.type).replace('OTHER', 'possession change').replace('PICK6', 'pick-six').replace('PAT_RESULT', 'conversion result').toLowerCase() + (e.via && e.via !== 'sdk' ? ' (via ' + (e.via === 'drain' ? 'the hold — its screen had been off' : e.via) + ')' : '') + '.', 'handoff'); break;
            case 'wait': if (e.refused) push(e, who + ' tried to take the ball and was refused: ' + e.refused + '.', 'flagline'); else push(e, who + (e.on ? ' waits for the opponent.' : ' is on offense.'), 'poss'); break;
            case 'p6': {
                const m = { detected: who + '\'s phone saw a defensive touchdown against it (pick-six).', sent: who + ' reports the pick-six' + (e.plus6 === false ? ' — but its own score never showed the 6 points' : '') + '.', applied: who + ' is credited the pick-six and gets the conversion choice.', modal: who + ' sees the 1-point / 2-point choice.', resolved: 'Conversion ' + (e.pts ? 'GOOD (+' + e.pts + ')' : 'missed') + ' on ' + who + '.', resultSent: who + ' sends the conversion result' + (e.synthetic ? ' (the fallback did it — the engine did not)' : '') + '.', resultApplied: who + ' receives the conversion result.', driveStarted: who + ' starts the next drive.' };
                push(e, m[e.step] || (who + ': pick-six ' + e.step), 'p6'); break;
            }
            case 'conv': if (e.ev === 'modal') push(e, who + ' is offered the conversion (1 or 2 points).', 'p6'); else if (e.ev === 'missed' && e.wall) push(e, 'Conversion abandoned on ' + who + ' — counted as missed (0).', 'flagline'); else if (e.ev === 'made') push(e, 'Conversion good on ' + who + ' (+' + e.pts + ').', 'score'); break;
            case 'vis': if (e.h === true) push(e, who + '\'s screen went off (app in the background).', 'system'); else if (e.h === false) push(e, who + '\'s screen is back.', 'system'); break;
            case 'diag': {
                const mm = String(e.m || '');
                if (/^boot$/.test(mm)) push(e, who + ' refreshed the page.', 'system');
                else if (/^OUTCOME held/.test(mm)) push(e, who + ' received a handoff while its screen was off — holding it until the screen is back.', 'system');
                else if (/^OUTCOME drained/.test(mm)) push(e, who + ' applies the held handoff now that its screen is back.', 'system');
                else if (/^QTR-KEEP refused — the quarter|^QTR-KEEP resume dropped/.test(mm)) push(e, 'A quarter-start reset was stopped on ' + who + ' (the quarter was already being played).', 'system');
                else if (/^QTR-KEEP resume Q/.test(mm) && !tl.some(x => x.k === 'keep')) push(e, 'Quarter continues for ' + who + ' (re-staged).', 'system');
                else if (/^UNWEDGE/.test(mm)) push(e, who + ' cleared a stuck conversion state before starting its drive.', 'system');
                else if (/^P6-WATCH/.test(mm)) push(e, 'Pick-six watchdog on ' + who + ': ' + mm.replace(/^P6-WATCH /, '') + '.', 'system');
                else if (/^TURN-RESCUE -> shipping/.test(mm)) push(e, who + ' sends the conversion result it owed instead of taking a drive.', 'system');
                else if (/^TURN-RESCUE/.test(mm)) push(e, who + ' took the ball back after both phones sat waiting.', 'system');
                else if (/^PAT-INV 35s wall/.test(mm)) push(e, 'The conversion on ' + who + ' sat for 35 seconds — counted as missed, result sent.', 'flagline');
                else if (/^QTR-KEEP LOOP/.test(mm)) push(e, 'The quarter-start reset on ' + who + ' tried to fire again and was stopped.', 'system');
                else if (/^OUTCOME purged/.test(mm)) break;
                else if (/^P6 drive: replacing/.test(mm)) push(e, who + ' stages its drive fresh (new play).', 'system');
                else if (/^TURN-HEAL/.test(mm)) push(e, who + ' stepped back — the other phone had the ball.', 'system');
                else if (/^FB-STALL|^FB-CONN OFFLINE/.test(mm)) push(e, who + '\'s connection stalled; using the backup path.', 'system');
                else if (/^EVT-> (INT|FUMBLE)/.test(mm)) push(e, 'TURNOVER on ' + who + '.', 'score');
                else if (/^EVT-> FG/.test(mm)) push(e, 'Field goal attempt is GOOD on ' + who + '.', 'score');
                break;
            }
            case 'final': push(e, 'FINAL on ' + who + '\'s phone: ' + e.su + '-' + e.so + '.', 'quarter'); break;
            case 'clock': push(e, 'A write tried to move ' + who + '\'s clock up from ' + clockStr(e.from) + ' to ' + clockStr(e.to) + ' — refused.', 'flagline'); break;
            case 'purge': push(e, who + ' throws away an old ' + String(e.type).replace('OTHER', 'possession change').replace('PAT_RESULT', 'conversion result').toLowerCase() + ' handoff (' + Math.round((e.ageMs || 0) / 1000) + 's old) that had arrived while it was playing.', 'system'); break;
            case 'apply': if ((e.lagMs || 0) > 5000) push(e, who + ' applies a handoff that arrived ' + Math.round(e.lagMs / 1000) + ' seconds ago.', 'flagline'); break;
            case 'keep': push(e, 'Quarter ' + e.q + ' continues for ' + who + ' from ' + spot(e.y) + (e.n > 1 ? ' (re-staged, attempt ' + e.n + ')' : '') + '.', e.n >= 3 ? 'flagline' : 'system'); break;
            case 'guard': {
                const g = { 'field-check': 'Nobody was on the field for 10 seconds — ' + who + '\'s team was put back on at ' + spot(e.y) + ' (' + (e.why || '') + ').',
                            'silent-rescue': who + '\'s opponent went silent after handing over the turn — ' + who + ' took the ball at ' + spot(e.y) + '.',
                            'end-by-player': who + ' ended the game from the waiting screen (' + (e.why || 'opponent gone') + ') and saw the stats.',
                            'post-conv-handoff': who + '\'s conversion had crossed the quarter horn and left it a drive at the 2 — handed off as the kickoff instead.',
                            'try-over': who + '\'s conversion try was over (possession had flipped, field clear) — the bridge stood down and let it resolve as missed.',
                            'final-forced': 'The stats screen was forced on ' + who + ' 20 seconds past a decided horn (' + e.su + '-' + e.so + ').',
                            'keep-fresh': who + '\'s parked scene kept coming back at the quarter start — its drive was spawned fresh' + (e.ok === false ? ' (FAILED)' : '') + '.',
                            'force-drive': who + ' asked for a drive while still owing its conversion result — refused.', rescue: who + ' would have rescued a drive for itself; it owed a conversion result, so the result was sent instead.',
                            fallback300: e.why === 'fired' ? 'The five-minute emergency timer fired on ' + who + ' and force-started its drive.' : 'A five-minute emergency timer from an earlier pick-six went off on ' + who + ' and stood down.' };
                push(e, g[e.what] || (who + ': guard ' + e.what + ' (' + e.why + ')'), e.what === 'fallback300' && e.why === 'fired' ? 'flagline' : 'system'); break;
            }
        }
    }
    // V398: the barrier between games in a reused room
    const starts = gameStarts(tl);
    if (starts.length >= 2) {
        for (let i = 1; i < starts.length; i++)
            out.push({ t: starts[i] - 1, rel: (starts[i] - 1 - t0) / 1000, role: 'a', kind: 'game',
                       text: 'GAME ' + (i + 1) + ' OF ' + starts.length + ' — a new game in the same room. Nothing above carries over.' });
        out.sort((x, y) => x.t - y.t);
    }
    return out;
}

return { toTimeline, audit, narrate, explain, line, fmtT, phantomPick6, gameStarts };
});
