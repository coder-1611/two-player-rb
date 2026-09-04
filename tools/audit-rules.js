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
                // A play that reaches the goal line scored: the engine then puts the
                // ball on the 2 (+48) for the conversion and marks down 6, so the
                // line is not "where the gain says" — it is where a touchdown says.
                const scored = Math.abs(e.y) >= 49.5 || expect >= 49.5 || e.d === 6 || (lastSettle && e.su !== lastSettle.su);
                if (!scored && Math.abs(e.y - expect) > 1.6)
                    flag('R-YARD', `${e.type} for ${e.gain}: line was ${e.y0.toFixed(1)}, should be ${expect.toFixed(1)}, is ${e.y.toFixed(1)}`, [lastSnap, e]);
            }
            if (scrim && lastSettle && lastSettle.d && typeof e.gain === 'number' && typeof e.d === 'number') {
                // Down & distance: this play FACED the previous settle's resulting
                // down and to-go; its gain decides the down it leaves behind.
                const facedD = lastSettle.d, facedTg = lastSettle.tg, g = e.gain;
                const first = g >= facedTg - 0.6;
                const expD = first ? 1 : facedD + 1;
                const scored = Math.abs(e.y) >= 49.5 || e.su !== lastSettle.su;
                if (!scored && facedD <= 3 && e.d0 === facedD && e.d !== expD)
                    flag('R-DOWN', `${e.type} for ${g} facing ${facedD}&${facedTg.toFixed(1)} left it ${e.d}&${e.tg}, expected down ${expD}`, [lastSettle, e]);
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
                if (Math.abs(e.y - last.y) > 1.6 || e.d !== last.d)
                    flag('R-CONT', `LINE MOVED BETWEEN PLAYS on ${r}: play settled at ${last.y.toFixed(1)} (${last.d}&${last.tg}), next snap at ${e.y.toFixed(1)} (${e.d}&${e.tg})`, [last, e]);
                if (typeof e.clk === 'number' && typeof last.clk === 'number' && e.q === last.q && e.clk > last.clk + 0.5)
                    flag('R-CLOCK', `clock went UP between plays inside Q${e.q} on ${r}: ${last.clk}s -> ${e.clk}s`, [last, e]);
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
                    flag('R-SCORE', `RESTORE on ${r} came back ${e.su}-${e.so}, but ${other} had it ${view.so}-${view.su}`, [view, e]);
                continue;
            }
            const d = [e.dsu, e.dso];
            for (const dd of d) {
                if (dd < 0) flag('R-SCORE', `a score went DOWN by ${-dd} on ${r}`, [e]);
                else if (dd > 0 && ![1, 2, 3, 6, 7, 8].includes(dd)) flag('R-SCORE', `illegal score delta +${dd} on ${r}`, [e]);
            }
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
            if (e.k === 'diag' && /^OUTCOME (drained|held)/.test(e.m)) lastRecv[e.role] = e.t;
            if (e.k === 'q') lastQ[e.role] = e.t;
            if (e.k === 'wait' && e.refused) { flag('R-POSS', `${e.role} was REFUSED going LIVE: ${e.refused}`, [e]); continue; }
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
            if (win.length > 3) { flag('R-OVL', `FLICKER on ${r}: ${win.length} overlay toggles in 5s`, win.slice(0, 6)); i += win.length; }
        }
        let hiddenSince = null;
        for (const e of byRole[r].filter(x => x.k === 'stage')) {
            // A staged scene under a SOLID cover is harmless; the defect is a
            // parked device whose cover is OFF while a formation is on screen.
            if (e.wait === true && e.of >= 6 && e.ovl === false && !inPat(r, e.t)) { if (!hiddenSince) hiddenSince = e; else if (e.t - hiddenSince.t > 5000) { flag('R-OVL', `EXPOSED FORMATION on ${r}: ${e.of} offensive players on screen while parked in WAIT with the cover OFF for ${((e.t - hiddenSince.t) / 1000).toFixed(0)}s`, [hiddenSince, e]); hiddenSince = null; } }
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
        // PHANTOM pick-6s (MHUY): the score-jump watcher read a resume's score
        // RESTORE (+9, then +17) as a defensive touchdown, and the record it
        // shipped said the +6 had never landed — so the other phone invented it.
        for (const d of steps.filter(x => x.step === 'detected')) {
            const boot = tl.find(x => x.role === d.role && x.k === 'diag' && x.m === 'boot' && x.t <= d.t && d.t - x.t < 20000);
            if (boot) flag('R-P6', `PHANTOM PICK-6: detected on ${d.role} ${((d.t - boot.t) / 1000).toFixed(1)}s after a boot (a restore, not a play)`, [boot, d]);
            const m = /score-watcher\(\+(\d+)\)/.exec(String(d.src || ''));
            if (m && Number(m[1]) !== 6) flag('R-P6', `PHANTOM PICK-6: the opponent's score jumped +${m[1]} on ${d.role} — a defensive touchdown is exactly +6`, [d]);
        }
        for (const s of steps.filter(x => x.step === 'sent' && x.plus6 === false))
            flag('R-P6', `PICK6 shipped from ${s.role} WITHOUT the +6 having landed there — the other phone will invent the points`, [s]);
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
            const recv = tl.find(x => x.k === 'recv' && x.role === other && x.ts === s.ts) ||
                         tl.find(x => x.k === 'diag' && x.role === other && x.t >= s.t && x.t < s.t + 20000 && new RegExp('^OUTCOME (held|drained) \\(' + s.type + '\\)').test(x.m));
            const otherAlive = byRole[other].some(x => x.k === 'stage' && x.t > s.t && x.t < s.t + 20000 && x.fps > 0);
            if (!ack && !recv && otherAlive) flag('R-XPORT', `${s.role}'s ${s.type} was never received by ${other} although ${other} was drawing frames`, [s]);
        }
        for (const e of tl.filter(x => x.k === 'diag' && /FB-STALL|FB-CONN OFFLINE|DELIVERY re-send/.test(x.m))) flag('R-XPORT', e.m, [e]);
        for (const e of tl.filter(x => x.k === 'dropped')) flag('R-XPORT', `telemetry dropped ${e.n} entries on ${e.role}`, [e]);
    }

    return { flags, t0, entries: tl.length };
}


// ---------------------------------------------------------------- english
// What each rule means, for a reader who did not write it.
const RULE_TEXT = {
    'R-YARD':  'The ball did not end up where the play said it should. The line of scrimmage moves by exactly the yards gained; when it does not, something moved the ball behind the play.',
    'R-DOWN':  'The down after a play was not the one football gives you (first down if the gain covered the distance, otherwise the next down).',
    'R-CONT':  'Between two plays of the same drive, the ball or the down changed without a play — a reset or a restore fired in the middle of a drive.',
    'R-SCORE': 'A score changed in a way football cannot produce (it went down, or jumped by an impossible amount), or a phone came back from a refresh with a different score than the other phone had.',
    'R-FINAL': 'The two phones ended the game disagreeing about the final score.',
    'R-CLOCK': 'Game time went backwards inside a quarter, or the quarter number moved the wrong way.',
    'R-POSS':  'The two phones disagreed about who had the ball: both waiting (a dead game), both playing offense, a phone taking the ball with nothing handing it over, or a phone refused when it should have been allowed to play.',
    'R-OVL':   'The WAITING FOR OPPONENT cover misbehaved: it blinked, or it was off while the phone was supposed to be waiting, showing a formation that was not that phone\'s to play.',
    'R-P6':    'A pick-six did not go the way it must: a step was late or missing, the wrong phone built a conversion, two conversions appeared for one score, or a pick-six was "detected" that never happened (usually right after a refresh).',
    'R-GATE':  'One of the safety gates had to intervene (it held the ball in place, or refused a conversion). Not wrong by itself — it is the gate doing its job — but worth knowing.',
    'R-XPORT': 'Something between the two phones was lost or delayed: a handoff never arrived while the other phone was awake, or the connection stalled.'
};
function explain(rule) { return RULE_TEXT[rule] || ''; }

function clockStr(clk) {
    if (typeof clk !== 'number' || !isFinite(clk)) return '';
    const m = Math.floor(clk / 60), s = Math.round(clk % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}
function spot(y) {
    // y is signed from midfield toward the opponent, for the device that has the ball
    if (typeof y !== 'number' || !isFinite(y)) return '';
    const mark = Math.round(50 - Math.abs(y));
    if (Math.abs(y) < 0.5) return 'the 50';
    return (y > 0 ? "the opponent's " : 'their own ') + mark;
}
function ordinal(d) { return ({ 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' })[d] || (d + 'th'); }
function dd(d, tg) { return (d ? ordinal(d) : '?') + ' & ' + (typeof tg === 'number' ? Math.round(tg) : '?'); }
function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }

// Turn the merged timeline into sentences a person can read. `meta.names`
// maps role -> team name. Every sentence keeps its timestamp and role so the
// page can show who saw what.
function narrate(tl, meta) {
    const names = (meta && meta.names) || {};
    const nm = r => names[r] || ('Phone ' + String(r).toUpperCase());
    const other = r => (r === 'a' ? 'b' : 'a');
    const out = [];
    const t0 = tl.length ? tl[0].t : 0;
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
                if (lastQ[e.role] !== e.to) { lastQ[e.role] = e.to; push(e, (e.to === 3 ? 'Halftime. ' : '') + (e.to === 5 ? 'Overtime begins' : 'Quarter ' + e.to + ' begins') + ' on ' + who + '\'s phone' + (e.to === 2 || e.to === 4 ? ', same drive continues from ' + spot(e.y) + ', ' + dd(e.d, e.tg) : '') + '.', 'quarter'); }
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
                s += ' — ball on ' + spot(e.y) + ', ' + dd(e.d, e.tg) + (typeof e.clk === 'number' ? ', ' + clockStr(e.clk) + ' left' : '') + '.';
                push(e, s, 'play'); break;
            }
            case 'score': {
                const parts = [];
                if (e.dsu > 0) parts.push(who + ' +' + e.dsu);
                if (e.dso > 0) parts.push(nm(other(e.role)) + ' +' + e.dso);
                if (e.dsu < 0 || e.dso < 0) parts.push('a score went DOWN');
                const label = (e.dsu === 6 || e.dso === 6) ? 'TOUCHDOWN' : (e.dsu === 3 || e.dso === 3) ? 'FIELD GOAL' : (e.dsu === 2 || e.dso === 2) ? '2-point conversion' : (e.dsu === 1 || e.dso === 1) ? 'extra point' : 'score change';
                push(e, label + ': ' + parts.join(', ') + ' — now ' + e.su + '-' + e.so + ' as ' + who + ' sees it.', 'score'); break;
            }
            case 'send': push(e, who + ' hands the ball over (' + String(e.type).replace('OTHER', 'possession change').replace('KICKOFF', 'kickoff') + ')' + (typeof e.y === 'number' && e.type !== 'PAT_RESULT' && e.type !== 'PICK6' ? ', ' + nm(other(e.role)) + ' to start on ' + spot(-e.y) : '') + '.', 'handoff'); break;
            case 'recv': push(e, who + ' receives the ' + String(e.type).replace('OTHER', 'possession change').replace('PICK6', 'pick-six').replace('PAT_RESULT', 'conversion result').toLowerCase() + (e.via && e.via !== 'sdk' ? ' (via ' + (e.via === 'drain' ? 'the hold — its screen had been off' : e.via) + ')' : '') + '.', 'handoff'); break;
            case 'wait': if (e.refused) push(e, who + ' tried to take the ball and was refused: ' + e.refused + '.', 'flagline'); else push(e, who + (e.on ? ' waits for the opponent.' : ' is on offense.'), 'poss'); break;
            case 'p6': {
                const m = { detected: who + '\'s phone saw a defensive touchdown against it (pick-six).', sent: who + ' reports the pick-six' + (e.plus6 === false ? ' — but its own score never showed the 6 points' : '') + '.', applied: who + ' is credited the pick-six and gets the conversion choice.', modal: who + ' sees the 1-point / 2-point choice.', resolved: 'Conversion ' + (e.pts ? 'GOOD (+' + e.pts + ')' : 'missed') + ' on ' + who + '.', resultSent: who + ' sends the conversion result' + (e.synthetic ? ' (the fallback did it — the engine did not)' : '') + '.', resultApplied: who + ' receives the conversion result.', driveStarted: who + ' starts the next drive.' };
                push(e, m[e.step] || (who + ': pick-six ' + e.step), 'p6'); break;
            }
            case 'conv': if (e.ev === 'modal') push(e, who + ' is offered the conversion (1 or 2 points).', 'p6'); else if (e.ev === 'made') push(e, 'Conversion good on ' + who + ' (+' + e.pts + ').', 'score'); break;
            case 'vis': if (e.h === true) push(e, who + '\'s screen went off (app in the background).', 'system'); else if (e.h === false) push(e, who + '\'s screen is back.', 'system'); break;
            case 'diag': {
                const mm = String(e.m || '');
                if (/^boot$/.test(mm)) push(e, who + ' refreshed the page.', 'system');
                else if (/^OUTCOME held/.test(mm)) push(e, who + ' received a handoff while its screen was off — holding it until the screen is back.', 'system');
                else if (/^OUTCOME drained/.test(mm)) push(e, who + ' applies the held handoff now that its screen is back.', 'system');
                else if (/^QTR-KEEP refused|^QTR-KEEP resume dropped/.test(mm)) push(e, 'A quarter-start reset was stopped on ' + who + ' (the quarter was already being played).', 'system');
                else if (/^UNWEDGE/.test(mm)) push(e, who + ' cleared a stuck conversion state before starting its drive.', 'system');
                else if (/^P6-WATCH/.test(mm)) push(e, 'Pick-six watchdog on ' + who + ': ' + mm.replace(/^P6-WATCH /, '') + '.', 'system');
                else if (/^TURN-RESCUE/.test(mm)) push(e, who + ' took the ball back after both phones sat waiting.', 'system');
                else if (/^TURN-HEAL/.test(mm)) push(e, who + ' stepped back — the other phone had the ball.', 'system');
                else if (/^FB-STALL|^FB-CONN OFFLINE/.test(mm)) push(e, who + '\'s connection stalled; using the backup path.', 'system');
                else if (/^EVT-> (INT|FUMBLE)/.test(mm)) push(e, 'TURNOVER on ' + who + '.', 'score');
                else if (/^EVT-> FG/.test(mm)) push(e, 'Field goal attempt is GOOD on ' + who + '.', 'score');
                break;
            }
            case 'final': push(e, 'FINAL on ' + who + '\'s phone: ' + e.su + '-' + e.so + '.', 'quarter'); break;
        }
    }
    return out;
}

return { toTimeline, audit, narrate, explain, line, fmtT };
});
