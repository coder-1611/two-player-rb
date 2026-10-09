#!/usr/bin/env node
// tools/elo.js — V500 (the owner, 6 Oct: "create an elo system where everybody is a 1000 and at first points fluctuate a
// lot but as account gets more games it flattens out, like chess elo ... a system that stops cheating from friendly matches
// by saying you can't have more than 3 ranked games in a non lobby set up per day ... a leaderboard with names censored if
// slurs"). Run every 2 minutes by the LaunchAgent com.rb2p.elo (tools/install-elo.sh).
//   · the phones, at each final (index.html _rb2p_eloGameOver): rooms/{code}/games/{start}/fin/{role} = { su, so, t, uid }
//     and the note rooms/~elo/q/{code}_{start}; the game record (written at the start) carries mode, difs, uids, qmins
//   · a game is RANKED when both phones recorded the same final, the players are two different devices, and both had the
//     SAME difficulty. Otherwise it is kept unranked, with the reason. A game whose second final never came is unranked
//     after 10 minutes. A phone cannot write its own rating: only this job does.
//   · V506 (the owner: "add a leaving penalty for pepole who leave first in a ranked game"; the formula: "elo - 0.25(minutes
//     left in int)|point differential|"; "make any username with soham in it exempt"): the player who stays notes a leave
//     (rooms/~elo/q/{code}_{start}_left: the leaver's role, the score and the clock when they went). 10 minutes later, if
//     the game was not finished after all, the leaver of a ranked game (two devices, SAME) loses 0.25 x the whole minutes
//     of game time left x |the point difference| — unless their name has "soham" in it. No win or loss is recorded.
//   · V509 (the owner: "there is a trend of people leaving with one second left. Make it that if people leave with less
//     than a minute left they lose 3x the original points lost and the guy who stays gets those points"): under a minute
//     of game time left the whole-minute formula is 0 — a free way out of a loss (5 such leaves on 7 Oct, all at 0 points).
//     Now a leave with under 60 s left is a forfeit, as in chess: the leaver loses 3 x what a loss to that player costs
//     (their K x E), whatever the score, and the player who stayed gains exactly that. Not when the leaver's own phone
//     recorded the final (it finished the game on their side). Still no win or loss recorded; soham names still exempt.
//   · V510 (the owner: "give point to opponent immediately after one leaves"): every leave — either rule — hands the
//     leaver's points to the player who stayed, at the job's next run (no 10-minute wait; the staying phone notes it 20 s
//     after the leaver's page closed, or after a minute of silence). If they come back and both phones record the final,
//     the leave is undone before the game is rated. The result is published at g/{code_start_left} for the staying phone.
//   · V519 (the owner: "as soon as a player leaves I should get points ... needs to be immediate"; "make it as if someone
//     won a game, not the amount the other guy lost"; "I never LOSE leave points but I can get from others leaving"): the
//     stayer gets a WIN (their K x (1 - E), counted in games and wins) whatever the leaver pays; the leaver's rules stand
//     (soham names still pay nothing — and then nothing happens). --watch: a resident loop (LaunchAgent com.rb2p.elo,
//     KeepAlive) that checks the queue every 3 s — the staying phone notes a closed tab at once, a silent one after 30 s.
//   · the owner's set ratings (st.manual: [{ uid, r, at }]) stand; tools/elo-backfill.js replays them in order
//   · V502 (the owner: "Right now don't have any anti cheating rules yet"): the V500 limit of 3 ranked code games a day per
//     player is OFF; --friendly-limit N turns it back on (a FIND A PLAYER game — the room's first game after its lfg match
//     — never counts toward it). The per-day counts are still kept.
//   · Elo: everyone starts at 1000; E = 1 / (1 + 10^((Rb - Ra) / 400)); a player's K = 16 + 48·e^(-n/10), n = their ranked
//     games so far (64 at the first, ~34 at 10, ~22 at 20, ~16 from 40 on): big swings at first, flat later; a tie is 0.5
//   · the truth is .rb2p/elo/state.json; it publishes embedcode/elo: top (the board: everyone with 5+ games — V512, the owner:
//     "list every one"; it was the top 50 — names censored
//     for slurs), r/{uid} (each player: rating, games, W-L-T, today's ranked code games), g/{code_start} (each game's change
//     — the stats screen shows it), at
//   node tools/elo.js            one run (what the LaunchAgent does)
//   node tools/elo.js --report   the board, nothing changed
//   node tools/elo.js --set-rating UID-OR-PREFIX=1112   the owner sets a rating (kept in st.manual; published at once)
//   node tools/elo.js --board    publish the board now (it is otherwise republished on a change or every 30 minutes)
//   node tools/elo.js --watch    V519: stay running and check the queue every 3 s (what the LaunchAgent runs)
//   node tools/elo.js --penalize UID-OR-PREFIX=254   V521: the owner's leaving penalty (st.manual { d, why: 'leaving' }; on the board)
//   --queue P --pub P --state F --include-test --now MS --token-file F   (tests)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(k);
const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const STATE = opt('--state', path.join(RB2P, 'elo', 'state.json'));
const QUEUE = opt('--queue', 'rooms/~elo/q');
const PUB = opt('--pub', 'embedcode/elo');
const INCLUDE_TEST = has('--include-test'), REPORT = has('--report');
const FRIENDLY_LIMIT = Number(opt('--friendly-limit', 0)) || 0;   // V502: 0 = off
const NOW = () => Number(opt('--now', Date.now()));
const SETTLE_MS = 20000, ONE_SIDE_MS = 10 * 60000, BOARD_MIN = 5, BOARD_N = Infinity, KEEP_G_MS = 2 * 86400e3;   // V512: everyone with 5+ (was the top 50)
const BACK_MS = 120000;   // V529: a player back within 2 minutes of a leave refreshed the page — the leave is undone
const BACK_HOLD_MS = 60000;   // V529: a "came back" note that got here before its leave note waits this long for it
const backSeen = new Map();   // V529: such a note's key -> when this job first saw it
const LEAVE_WAIT_MS = Number(opt('--leave-wait-ms', 0));   // V510: at once (V506 waited 10 minutes); a finished game undoes it
const EXEMPT = /soham/i;                                              // V506: the owner's names never pay it
const LATE_SEC = 60, LATE_X = 3;                                      // V509: under a minute left, 3 x a loss, to the stayer
const log = m => console.log(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + m);
let CEN = null; try { CEN = require('./highlights/censor.js'); } catch (e) {}
const cleanName = n => { const s = String(n || '').trim().slice(0, 16); return CEN && CEN.censorName ? CEN.censorName(s) : s; };

// ---- the rating ----
const K = n => 16 + 48 * Math.exp(-(Number(n) || 0) / 10);
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
const dayOf = ms => new Date(Number(ms)).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const player = (st, uid) => st.players[uid] || (st.players[uid] = { r: 1000, n: 0, w: 0, l: 0, d: 0, nm: '', fd: {}, last: 0, peak: 1000 });
// V530: a device id merged into an account (it logged in) is that account from then on — a game it finished before is
// rated to the account
const alias = (st, uid) => { let u = String(uid || ''), k = 0; while (u && st.alias && st.alias[u] && k++ < 8) u = st.alias[u]; return u; };
const codeGamesOn = (st, uid, day) => (st.players[uid] && st.players[uid].fd && st.players[uid].fd[day]) || 0;

// decide one finished game: { ranked, why, ... } and, when ranked, apply it to the state
function rate(st, g, opts) {   // g = { gid, code, start, rec, names, lobby, now }; opts.friendlyLimit (0 = no daily limit)
    const limit = opts && opts.friendlyLimit != null ? Number(opts.friendlyLimit) || 0 : FRIENDLY_LIMIT;
    const rec = g.rec || {}, fin = rec.fin || {}, uids = rec.uids || {};
    const out = { gid: g.gid, code: g.code, start: g.start, at: g.now, ranked: false, why: '', lobby: !!g.lobby };
    const ua = alias(st, uids.a || (fin.a && fin.a.uid) || ''), ub = alias(st, uids.b || (fin.b && fin.b.uid) || '');   // V530: merged devices
    out.ua = ua; out.ub = ub;
    if (String(rec.ver || '') === 'V500') { out.why = 'played on V500, before the ratings used the device id'; return out; }   // V501: V500 wrote the SDK's uid
    if (!fin.a || !fin.b) { out.why = 'only one phone recorded the final'; return out; }
    if (Number(fin.a.su) !== Number(fin.b.so) || Number(fin.a.so) !== Number(fin.b.su)) { out.why = 'the two phones disagree on the score'; return out; }
    out.sa = Number(fin.a.su); out.sb = Number(fin.a.so);
    if (!ua || !ub) { out.why = 'a player could not be identified'; return out; }
    if (ua === ub) { out.why = 'the same device played both sides'; return out; }
    if (rec.mode !== 'same') { out.why = 'the players had different difficulties'; return out; }
    const day = dayOf(g.start);
    if (limit > 0 && !g.lobby && (codeGamesOn(st, ua, day) >= limit || codeGamesOn(st, ub, day) >= limit)) {
        out.why = 'a player already had ' + limit + ' ranked code games today'; return out;
    }
    const A = player(st, ua), B = player(st, ub);
    const S = out.sa > out.sb ? 1 : out.sa < out.sb ? 0 : 0.5;
    const ea = expected(A.r, B.r), eb = 1 - ea;
    const da = K(A.n) * (S - ea), db = K(B.n) * ((1 - S) - eb);
    out.a = { r0: Math.round(A.r), r1: Math.round(A.r + da), d: Math.round(A.r + da) - Math.round(A.r) };
    out.b = { r0: Math.round(B.r), r1: Math.round(B.r + db), d: Math.round(B.r + db) - Math.round(B.r) };
    A.r += da; B.r += db; A.n++; B.n++;
    if (S === 1) { A.w++; B.l++; } else if (S === 0) { A.l++; B.w++; } else { A.d++; B.d++; }
    A.peak = Math.max(A.peak || 1000, A.r); B.peak = Math.max(B.peak || 1000, B.r);
    A.last = B.last = g.start;
    if (g.names) { if (g.names.a) A.nm = String(g.names.a).slice(0, 16); if (g.names.b) B.nm = String(g.names.b).slice(0, 16); }
    if (!g.lobby) { A.fd[day] = (A.fd[day] || 0) + 1; B.fd[day] = (B.fd[day] || 0) + 1; }
    for (const P of [A, B]) for (const d of Object.keys(P.fd)) if (d < dayOf(g.now - 3 * 86400e3)) delete P.fd[d];   // a few days kept
    out.ranked = true;
    return out;
}

// V506: the leaving penalty — the leaver of a ranked game, 0.25 x whole minutes left x |point difference|
function leavePenalty(st, g) {   // g = { gid, code, start, rec, names, left, now }
    const rec = g.rec || {}, fin = rec.fin || {}, uids = rec.uids || {}, L = g.left || {};
    const role = L.role === 'a' || L.role === 'b' ? L.role : '', other = role === 'a' ? 'b' : 'a';
    const out = { gid: g.gid, code: g.code, start: g.start, at: g.now, leave: true, applied: false, why: '', role };
    if (fin.a && fin.b) { out.why = 'the game was finished after all'; return out; }
    const uid = role ? alias(st, uids[role] || (fin[role] && fin[role].uid) || '') : '', ouid = role ? alias(st, uids[other] || (fin[other] && fin[other].uid) || '') : '';   // V530: merged devices
    out.uid = uid;
    if (!uid) { out.why = 'the player who left could not be identified'; return out; }
    if (uid === ouid) { out.why = 'the same device played both sides'; return out; }
    if (rec.mode !== 'same') { out.why = 'not a ranked game (the players had different difficulties)'; return out; }
    const name = String((g.names || {})[role] || ''), known = st.players[uid] && st.players[uid].nm;
    const exempt = EXEMPT.test(name) || EXEMPT.test(String(known || ''));   // V521: pays nothing — but the player who stayed still wins
    const q = Number(L.q) || 1, clk = Math.max(0, Number(L.clk) || 0), qmins = Number(L.qmins) || 2;
    const leftSec = q >= 5 ? clk : clk + Math.max(0, 4 - q) * qmins * 60;
    out.minutes = Math.floor(leftSec / 60); out.diff = Math.abs((Number(L.su) || 0) - (Number(L.so) || 0));
    out.lat = Number(L.at) || 0;   // V529: when the other phone saw them go (its clock) — a "came back" note names this leave by it
    if (leftSec < LATE_SEC && fin[role]) { out.why = 'the leaver\'s phone recorded the final'; return out; }
    const P = player(st, uid), O = ouid ? player(st, ouid) : null, pr = P.r, orr = O ? O.r : 1000;   // the ratings before
    // the player who left: V509 under a minute left, 3 x a loss; V506 otherwise, 0.25 x the whole minutes x the gap
    if (exempt) { out.rule = 'exempt'; out.exempt = true; out.penalty = 0; out.why = 'exempt: the name has soham in it (pays nothing; the stayer still wins)'; }
    else if (leftSec < LATE_SEC) {
        const lost = K(P.n) * expected(pr, orr);
        out.rule = 'late'; out.secs = leftSec; out.lost = Math.round(lost * 100) / 100; out.penalty = Math.round(LATE_X * lost * 100) / 100;
    } else { out.rule = 'min'; out.penalty = Math.round(0.25 * out.minutes * out.diff * 100) / 100; }
    out.r0 = Math.round(P.r); P.r -= out.penalty; out.r1 = Math.round(P.r); if (!exempt) P.left = (P.left || 0) + 1;
    out[role] = { r0: out.r0, r1: out.r1, d: out.r1 - out.r0 };
    if (name && !P.nm) P.nm = name.slice(0, 16);
    // V519 (the owner: "make it as if someone won a game, not the amount the other guy lost"): the player who stayed
    // wins the game — a win's points against that player (their own K x (1 - E), the ratings before the leave), counted
    // as a game and a win — whatever the leaver pays (a tied game's leave pays the stayer too)
    if (O) {
        const win = K(O.n) * (1 - expected(orr, pr));
        out.ouid = ouid; out.won = true; out.gain = Math.round(win * 100) / 100; out.or0 = Math.round(O.r);
        out.gx = win;   // V529: the exact gain, so an undo (a refresh) restores the rating exactly
        O.r += win; O.n++; O.w++; O.last = g.start; O.peak = Math.max(O.peak || 1000, O.r); out.or1 = Math.round(O.r);
        out[other] = { r0: out.or0, r1: out.or1, d: out.or1 - out.or0 };
        const oname = String((g.names || {})[other] || ''); if (oname && !O.nm) O.nm = oname.slice(0, 16);
    }
    out.applied = true;
    return out;
}

// V510: they came back and the game was finished after all — the leave is undone (both phones' finals rate it instead)
function undoLeave(st, gidL, now) {
    const L = st.games[gidL];
    if (!L || !L.leave || !L.applied || L.reversed) return null;
    const P = st.players[L.uid]; if (P) { P.r += Number(L.penalty) || 0; if (!L.exempt) P.left = Math.max(0, (P.left || 0) - 1); }
    const O = L.ouid ? st.players[L.ouid] : null;
    if (O) { O.r -= Number(L.gx != null ? L.gx : L.gain) || 0; if (L.won) { O.n = Math.max(0, (O.n || 0) - 1); O.w = Math.max(0, (O.w || 0) - 1); } }   // V519: the win too
    L.reversed = true; L.reversedAt = now;
    return L;
}

// V521 (the owner: "from now on, show how many points they lost from leaving"): per player, the rating points taken by
// leaves (applied, not undone) and by the owner's leaving penalties (--penalize), and how many games they left
function leaveTotals(st) {
    const m = {};
    for (const g of Object.values(st.games || {})) {
        if (!g || !g.leave || !g.applied || g.reversed || !g.uid || g.exempt) continue;
        const x = m[g.uid] || (m[g.uid] = { pts: 0, n: 0 }); x.pts += Number(g.penalty) || 0; x.n++;
    }
    for (const a of st.manual || []) if (a && a.why === 'leaving' && Number(a.d) < 0) { const x = m[a.uid] || (m[a.uid] = { pts: 0, n: 0 }); x.pts += -Number(a.d); }
    return m;
}
// V521b (the owner: "only show minus for ziyad not anyone else unless above 12 left games"): the red number is shown for
// Ziyad, and for anyone else only when they have left more than 12 games
const LP_ALWAYS = new Set(['lITtwndiu0QACt4A3prDlqwetUv2']), LP_MIN_GAMES = 12;
const showLp = (st, uid, lt) => !!(lt && lt.pts >= 0.5 && (lt.n > LP_MIN_GAMES || LP_ALWAYS.has(uid) || !!(st.players[uid] && st.players[uid].lpa)));   // V530: lpa = merged from one
function board(st) {
    const LT = leaveTotals(st);
    return Object.keys(st.players).map(u => Object.assign({ u }, st.players[u])).filter(p => p.n >= BOARD_MIN)
        .sort((x, y) => y.r - x.r || y.n - x.n).slice(0, BOARD_N)
        .map(p => { const lt = LT[p.u]; return Object.assign({ nm: cleanName(p.nm) || 'a player', r: Math.round(p.r), w: p.w, l: p.l, d: p.d, n: p.n, u: p.u.slice(0, 8) },
                                                          showLp(st, p.u, lt) ? { lp: Math.round(lt.pts), lc: lt.n } : {}); });
}
function pubPlayer(st, uid, now) {
    const p = st.players[uid], today = dayOf(now);
    const lt = leaveTotals(st)[uid];
    return Object.assign({ r: Math.round(p.r), n: p.n, w: p.w, l: p.l, d: p.d, nm: cleanName(p.nm), fd: (p.fd && p.fd[today]) || 0, fdd: today, peak: Math.round(p.peak || p.r) },
                         showLp(st, uid, lt) ? { lp: Math.round(lt.pts), lc: lt.n } : {});
}

// V530: ACCOUNTS (the owner: "create an account system, where users have a username and password so they can open their
// account from anywhere ... so they can unify their devices"). Making an account keeps the device's own id (nothing to
// do here). LOGGING IN on another device switches that page to the account's id — and that device's own record (its
// anonymous id: games, wins, messages) is merged into the account, once both sides asked: acct/<from>/into = <into>,
// written by the device as itself before it switched, and acct/<into>/from/<from>, written by the account. Nobody can
// push a record into someone else's account, or take one.
//   the record: games, wins, losses, draws and leaves added up; the rating = the two GAME ratings (the rating with its
//   leaving penalties added back) averaged by games, then every leaving penalty of both taken off again (a throwaway
//   device's leaves can't be washed out by a merge); the peak the higher one; the games and the owner's penalties are
//   re-keyed to the account (their points lost to leaving follow); from then on the device id IS the account (alias)
//   the messages (the 8-character ids): the device's conversations are copied into the account's (each message as it was,
//   "stored forever"; the sender id rewritten), each other player's inbox line moves to the account, blocks move too
function mergeRecord(st, from, into, now) {
    const F = st.players[from], A = player(st, into);
    const lt = leaveTotals(st), pf = (lt[from] && lt[from].pts) || 0, pa = (lt[into] && lt[into].pts) || 0;
    const out = { from, into, had: !!F, r0: Math.round(A.r), n0: A.n || 0, fr: F ? Math.round(F.r) : null, fn: F ? F.n || 0 : 0 };
    if (F) {
        const nA = A.n || 0, nF = F.n || 0, gA = A.r + pa, gF = F.r + pf;
        const g = nA + nF > 0 ? (gA * nA + gF * nF) / (nA + nF) : 1000;
        A.r = g - pa - pf;
        A.n = nA + nF; A.w = (A.w || 0) + (F.w || 0); A.l = (A.l || 0) + (F.l || 0); A.d = (A.d || 0) + (F.d || 0);
        A.left = (A.left || 0) + (F.left || 0); A.peak = Math.max(A.peak || 1000, F.peak || 1000, A.r); A.last = Math.max(A.last || 0, F.last || 0);
        A.fd = A.fd || {}; for (const d of Object.keys(F.fd || {})) A.fd[d] = (A.fd[d] || 0) + F.fd[d];
        if (!A.nm && F.nm) A.nm = F.nm;
        if (LP_ALWAYS.has(from) || F.lpa) A.lpa = true;
        delete st.players[from];
    }
    for (const g of Object.values(st.games)) { if (!g) continue; if (g.uid === from) g.uid = into; if (g.ouid === from) g.ouid = into; if (g.ua === from) g.ua = into; if (g.ub === from) g.ub = into; }
    for (const a of st.manual || []) if (a && a.uid === from) a.uid = into;
    st.alias = st.alias || {}; st.alias[from] = into;
    (st.merges = st.merges || []).push({ from, into, at: now });
    out.r1 = Math.round(A.r); out.n1 = A.n;
    return out;
}
async function mergeMessages(io, from, into) {
    const f8 = from.slice(0, 8), a8 = into.slice(0, 8), tid = (x, y) => (x < y ? x + '/' + y : y + '/' + x);
    if (f8 === a8) return 0;
    const fix = o => (o && typeof o === 'object' ? Object.assign({}, o, o.f === f8 ? { f: a8 } : {}) : o);
    const inbox = (await io.get('dm/i/' + f8)) || {};
    let moved = 0;
    for (const q of Object.keys(inbox)) {
        if (q === a8) continue;   // the account messaging its own old device: nothing to keep
        const msgs = (await io.get('dm/t/' + tid(f8, q))) || {}, put = {};
        for (const k of Object.keys(msgs)) put[k] = fix(msgs[k]);
        if (Object.keys(put).length) { await io.patch('dm/t/' + tid(a8, q), put); moved += Object.keys(put).length; }
        const mine = (await io.get('dm/i/' + a8 + '/' + q)) || null, line = fix(inbox[q]);
        if (!mine || Number(mine.at || 0) < Number(line.at || 0)) await io.put('dm/i/' + a8 + '/' + q, line);
        const theirs = await io.get('dm/i/' + q + '/' + f8);
        if (theirs) {
            const cur = await io.get('dm/i/' + q + '/' + a8);
            if (!cur || Number(cur.at || 0) < Number(theirs.at || 0)) await io.put('dm/i/' + q + '/' + a8, fix(theirs));
            await io.del('dm/i/' + q + '/' + f8);
        }
    }
    const blocks = (await io.get('dm/b/' + f8)) || {};
    if (Object.keys(blocks).length) await io.patch('dm/b/' + a8, blocks);
    const all = (await io.get('dm/b')) || {};
    for (const p of Object.keys(all)) if (p !== f8 && all[p] && all[p][f8]) await io.put('dm/b/' + p + '/' + a8, all[p][f8]);
    return moved;
}

// one pass over the queue. io = { get(path, query), put, patch, del } (tests pass a fake)
async function run(st, io, now, opts) {
    const q = (await io.get(QUEUE)) || {};
    // V529: a game's leaves first, then its result, then the "came back" notes (whatever order they arrived in)
    const kind = x => (x.left ? 0 : x.back ? 2 : 1);
    const items = Object.keys(q).filter(k => q[k] && q[k].c && q[k].s).map(k => ({ key: k, code: String(q[k].c), start: Number(q[k].s), t: Number(q[k].t) || 0, left: q[k].left || null, back: q[k].back || null, merge: q[k].merge || null }))
        .sort((a, b) => a.start - b.start || kind(a) - kind(b));
    const changed = new Set(), done = [];
    for (const it of items) {
        if (it.merge) {   // V530: a device logged in to an account — its own record joins the account's
            const from = String(it.merge.from || ''), into = String(it.merge.into || '');
            if (from.length >= 20 && into.length >= 20 && from !== into && !(st.alias && st.alias[from])) {
                const okF = (await io.get('acct/' + from + '/into')) === into, okI = !!(await io.get('acct/' + into + '/from/' + from));
                if (okF && okI) {
                    const m = mergeRecord(st, from, into, now);
                    let moved = 0; try { moved = await mergeMessages(io, from, into); } catch (e) { log('merge messages ' + from + ': ' + (e && e.message)); }
                    changed.add(into); (st._unpub = st._unpub || []).push(from);
                    log('MERGED ' + from + ' into the account ' + into + (m.had ? ': ' + m.fn + ' games at ' + m.fr + ' + ' + m.n0 + ' at ' + m.r0 + ' -> ' + m.n1 + ' at ' + m.r1 : ' (no games)') + ', ' + moved + ' messages');
                } else log('merge ' + from + ' -> ' + into + ' refused: ' + (!okF ? 'the device did not ask' : 'the account did not ask'));
            }
            await io.del(QUEUE + '/' + it.key);
            continue;
        }
        if (it.back) {   // V529 (the owner: "refreshing fixes lag" — the announcement): the player the other phone noted as gone
            // came back within 2 minutes — a refresh, not a leave: undone (their points back, the stayer's win taken back). The
            // note names its leave by the moment it was seen (both times are the stayer's clock), so a late copy of an old
            // note never undoes a later leave
            const br = it.back.role === 'a' || it.back.role === 'b' ? it.back.role : '';
            const gidB = it.code + '_' + it.start + '_left_' + br;
            const LB = br ? st.games[gidB] : null;
            if (br && !LB) {   // its leave note isn't here yet (written first, but a stalled line can deliver it later)
                const f = backSeen.get(it.key) || now; backSeen.set(it.key, f);
                if (now - f < BACK_HOLD_MS) continue;
            }
            backSeen.delete(it.key);
            const bAt = Number(it.back.at) || 0, lat = Number(LB && LB.lat) || 0;
            if (LB && LB.leave && LB.applied && !LB.reversed && lat && Number(it.back.since) === lat && bAt >= lat && bAt - lat <= BACK_MS) {
                const u = undoLeave(st, gidB, now);
                if (u) {
                    u.back = true; u.backAt = bAt; u.why = 'came back after ' + Math.round((bAt - lat) / 1000) + ' s (a refresh) — undone';
                    changed.add(u.uid); if (u.ouid) changed.add(u.ouid); done.push(u); log('leave undone ' + gidB + ' — ' + u.why);
                }
            }
            await io.del(QUEUE + '/' + it.key);
            continue;
        }
        if (it.left) {   // V506: a leave the other player noted
            // V521 (the owner: "that didn't happen when someone left my game" — OMJG: his hidden tab was reported first, the
            // real leave 2 min later was dropped as the game's second note): one note per LEAVER (…_left_a / _left_b), and
            // a leaver who then reports the other was still there — that earlier leave is undone first
            const lr = it.left.role === 'a' || it.left.role === 'b' ? it.left.role : '', by = it.left.by === 'a' || it.left.by === 'b' ? it.left.by : '';
            const gidL = it.code + '_' + it.start + '_left' + (lr ? '_' + lr : '');
            // V529: a leave undone because they came back can happen again (they left for real later)
            const prevL = st.games[gidL], reLeave = !!(prevL && prevL.reversed && prevL.back && Number(it.left.at) > Number(prevL.backAt || Infinity));
            if ((prevL && !reLeave) || (!INCLUDE_TEST && /^Z\d/.test(it.code))) { await io.del(QUEUE + '/' + it.key); continue; }
            if (now - it.t < LEAVE_WAIT_MS) continue;   // they may come back and finish the game
            for (const k0 of [it.code + '_' + it.start + '_left_' + by, it.code + '_' + it.start + '_left']) {
                const old = by && st.games[k0];
                if (old && old.leave && old.role === by && old.applied && !old.reversed && Number(old.at) <= Number(it.t)) {
                    const u = undoLeave(st, k0, now);
                    if (u) { changed.add(u.uid); if (u.ouid) changed.add(u.ouid); done.push(u); log('leave undone ' + k0 + ' — ' + by + ' was still there (it reported the other player leaving)'); }
                }
            }
            const recL = (await io.get('rooms/' + it.code + '/games/' + it.start)) || {};
            const namesL = (await io.get('rooms/' + it.code + '/names')) || {};
            const resL = leavePenalty(st, { gid: gidL, code: it.code, start: it.start, rec: recL, names: namesL, left: it.left, now });
            st.games[gidL] = resL;
            if (resL.applied) { changed.add(resL.uid); if (resL.ouid) changed.add(resL.ouid); }
            done.push(resL);   // V510: its result is published (the player who stayed sees the points it gave them)
            await io.del(QUEUE + '/' + it.key);
            log((resL.applied ? 'LEFT ' : 'leave, no penalty ') + gidL + ' ' + resL.role + (!resL.applied ? ' — ' + resL.why
                : (resL.rule === 'late' ? ' ' + resL.r0 + '->' + resL.r1 + ' (-' + resL.penalty + ': ' + resL.secs + ' s left, 3 x a loss of ' + resL.lost + ')'
                : ' ' + resL.r0 + '->' + resL.r1 + ' (-' + resL.penalty + ': ' + resL.minutes + ' min x ' + resL.diff + ' pts x 0.25)') +
                  (resL.ouid ? ', the stayer wins: ' + resL.or0 + '->' + resL.or1 + ' (+' + resL.gain + ')' : '')));
            continue;
        }
        const gid = it.code + '_' + it.start;
        if (st.games[gid]) { await io.del(QUEUE + '/' + it.key); continue; }   // rated before (a second phone's note)
        if (!INCLUDE_TEST && /^Z\d/.test(it.code)) { await io.del(QUEUE + '/' + it.key); continue; }   // the e2e harness's rooms
        if (now - it.t < SETTLE_MS) continue;   // the other phone's final may be on its way
        const rec = (await io.get('rooms/' + it.code + '/games/' + it.start)) || {};
        if (!(rec.fin && rec.fin.a && rec.fin.b) && now - it.t < ONE_SIDE_MS) continue;
        const names = (await io.get('rooms/' + it.code + '/names')) || {};
        // a FIND A PLAYER game: the room's first game after its lfg match (a rematch is a code game)
        let lobby = false;
        const lf = await io.get('rooms/' + it.code + '/lfg');
        if (lf && Number(lf.at)) {
            const keys = Object.keys((await io.get('rooms/' + it.code + '/games', 'shallow=true')) || {}).map(Number).filter(k => k > Number(lf.at)).sort((a, b) => a - b);
            lobby = keys.length > 0 && keys[0] === it.start;
        }
        if (rec.fin && rec.fin.a && rec.fin.b) {   // V510: finished after a leave was applied — the leave is undone
            for (const sfx of ['_left', '_left_a', '_left_b']) {
                const u = undoLeave(st, gid + sfx, now);
                if (u) { changed.add(u.uid); if (u.ouid) changed.add(u.ouid); done.push(u); log('leave undone ' + gid + sfx + ' — they came back and the game was finished'); }
            }
        }
        const res = rate(st, { gid, code: it.code, start: it.start, rec, names, lobby, now }, opts);
        st.games[gid] = res;
        if (res.ranked) { changed.add(res.ua); changed.add(res.ub); }
        done.push(res);
        await io.del(QUEUE + '/' + it.key);
        log((res.ranked ? 'RANKED ' : 'unranked ') + gid + ' ' + (res.sa != null ? res.sa + '-' + res.sb : '') + (res.ranked ? ' a ' + res.a.r0 + '->' + res.a.r1 + ' b ' + res.b.r0 + '->' + res.b.r1 + (res.lobby ? ' (lobby)' : '') : ' — ' + res.why));
    }
    return { changed, done };
}

async function publish(st, io, changed, done, now) {
    if (changed.size || (st._unpub && st._unpub.length)) {
        const r = {}; for (const u of changed) if (st.players[u]) r[u] = pubPlayer(st, u, now);
        for (const u of st._unpub || []) r[u] = null;   // V530: merged into an account
        delete st._unpub;
        await io.patch(PUB + '/r', r);
    }
    if (done.length) {
        const g = {};
        for (const d of done) g[d.gid] = d.leave
            ? { leave: true, applied: !!d.applied, reversed: !!d.reversed, rule: d.rule || '', penalty: d.penalty || 0, role: d.role || '', why: d.why || '', at: d.at, lat: d.lat || 0, a: d.a || null, b: d.b || null }   // V529: lat = which leave (a game can have a refresh, then a real one)
            : { ranked: d.ranked, why: d.why || '', at: d.at, lobby: d.lobby, a: d.a || null, b: d.b || null };
        await io.patch(PUB + '/g', g);
    }
    // old game notes go (the state keeps them); the board every run (cheap) so a censor change shows
    const gone = {};
    for (const gid of Object.keys(st.games)) if (now - (st.games[gid].at || 0) > KEEP_G_MS && !st.games[gid].pruned) { gone[gid] = null; st.games[gid].pruned = true; }
    if (Object.keys(gone).length) await io.patch(PUB + '/g', gone);
    await io.put(PUB + '/top', { at: now, list: board(st) });
}

function load() { try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); s.players = s.players || {}; s.games = s.games || {}; return s; } catch (e) { return { players: {}, games: {} }; } }
function save(st) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); const tmp = STATE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st)); fs.renameSync(tmp, STATE); }

async function ownerToken() {   // the firebase CLI's login on this Mac (admin), as tools/alltime-stats.js
    const tf = opt('--token-file', '');
    if (tf) return fs.readFileSync(tf, 'utf8').trim();
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}
function restIO(tok) {
    const u = (p, q) => DB + p + '.json?access_token=' + encodeURIComponent(tok) + (q ? '&' + q : '');
    const ok = async (r, what) => { if (!r.ok) throw new Error(what + ' ' + r.status + ' ' + (await r.text()).slice(0, 120)); return r; };
    return {
        get: async (p, q) => (await ok(await fetch(u(p, q), { cache: 'no-store', signal: AbortSignal.timeout(20000) }), 'GET ' + p)).json(),
        put: async (p, v) => ok(await fetch(u(p, 'print=silent'), { method: 'PUT', body: JSON.stringify(v), signal: AbortSignal.timeout(20000) }), 'PUT ' + p),
        patch: async (p, v) => ok(await fetch(u(p, 'print=silent'), { method: 'PATCH', body: JSON.stringify(v), signal: AbortSignal.timeout(20000) }), 'PATCH ' + p),
        del: async p => ok(await fetch(u(p, 'print=silent'), { method: 'DELETE', signal: AbortSignal.timeout(20000) }), 'DELETE ' + p)
    };
}

async function main() {
    const st = load(), now = NOW();
    if (REPORT) {
        const b = board(st);
        console.log(Object.keys(st.players).length + ' players, ' + Object.values(st.games).filter(g => g.ranked).length + ' ranked games, ' + Object.keys(st.games).length + ' recorded');
        b.forEach((p, i) => console.log('#' + (i + 1) + ' ' + p.nm + ' ' + p.r + ' (' + p.w + '-' + p.l + (p.d ? '-' + p.d : '') + ', ' + p.n + ' games)'));
        return;
    }
    const io = restIO(await ownerToken());
    if (has('--board')) {   // V512: the board now
        await io.put(PUB + '/top', { at: now, list: board(st) }); st.boardAt = now; save(st);
        // V521b: and the record of everyone who has lost points to leaving, so a player's own line follows the same rule
        const r = {}; for (const u of Object.keys(leaveTotals(st))) if (st.players[u]) r[u] = pubPlayer(st, u, now);
        if (Object.keys(r).length) await io.patch(PUB + '/r', r);
        log('BOARD published: ' + board(st).length + ' players');
        return;
    }
    const pen = opt('--penalize', '');
    if (pen) {   // V521 (the owner: "penalize him 254 points and show this on leaderboard"): a leaving penalty by the owner
        const [who, val] = pen.split('='), d = Number(val);
        const ids = Object.keys(st.players).filter(u => u === who || u.indexOf(who) === 0);
        if (ids.length !== 1 || !(d > 0)) throw new Error('--penalize: ' + ids.length + ' players match ' + who + ' (need exactly 1) or bad points ' + val);
        const P = st.players[ids[0]], was = Math.round(P.r);
        P.r -= d; (st.manual = st.manual || []).push({ uid: ids[0], d: -d, at: now, was, why: 'leaving' });
        save(st);
        await io.patch(PUB + '/r', { [ids[0]]: pubPlayer(st, ids[0], now) });
        await io.put(PUB + '/top', { at: now, list: board(st) }); st.boardAt = now; save(st);
        log('PENALIZED ' + ids[0].slice(0, 8) + ' (' + (P.nm || '?') + ') ' + was + ' -> ' + Math.round(P.r) + ' (-' + d + ', leaving)');
        return;
    }
    const setR = opt('--set-rating', '');
    if (setR) {   // V506 (the owner: "Make soham rating 1112")
        const [who, val] = setR.split('='), r = Number(val);
        const ids = Object.keys(st.players).filter(u => u === who || u.indexOf(who) === 0);
        if (ids.length !== 1 || !isFinite(r)) throw new Error('--set-rating: ' + ids.length + ' players match ' + who + ' (need exactly 1) or bad value ' + val);
        const P = st.players[ids[0]], was = Math.round(P.r);
        P.r = r; P.peak = Math.max(P.peak || 1000, r);
        (st.manual = st.manual || []).push({ uid: ids[0], r, at: now, was });
        save(st);
        await io.patch(PUB + '/r', { [ids[0]]: pubPlayer(st, ids[0], now) });
        await io.put(PUB + '/top', { at: now, list: board(st) }); st.boardAt = now; save(st);
        log('SET ' + ids[0].slice(0, 8) + ' (' + (P.nm || '?') + ') ' + was + ' -> ' + r);
        return;
    }
    if (has('--watch')) {   // V519: resident — the queue every 3 s (launchd keeps it alive); the owner token renewed every 45 min
        let tokAt = Date.now(), io2 = io;
        log('watching ' + QUEUE + ' every 3 s');
        for (;;) {
            try {
                if (Date.now() - tokAt > 45 * 60000) { io2 = restIO(await ownerToken()); tokAt = Date.now(); }
                const st2 = load(), now2 = Date.now();   // the file each pass: a --set-rating / --board in between stands
                const r = await run(st2, io2, now2);
                if (r.done.length || r.changed.size) save(st2);
                if (r.done.length || r.changed.size || !st2.boardAt || now2 - st2.boardAt > 30 * 60000) { await publish(st2, io2, r.changed, r.done, now2); st2.boardAt = now2; save(st2); }
            } catch (e) { log('watch: ' + (e && e.message || e)); }
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    const { changed, done } = await run(st, io, now);
    save(st);
    if (done.length || changed.size || !st.boardAt || now - st.boardAt > 30 * 60000) {
        await publish(st, io, changed, done, now); st.boardAt = now; save(st);
    }
    if (!st.kept) {   // the pre-V419 room sweep skips a room with `audited`
        for (const r of ['rooms/~elo', 'rooms/~live']) await io.put(r + '/audited', { ts: now, keep: 'V500: the rating queue / the WATCH LIVE list' });
        st.kept = true; save(st);
    }
}

if (require.main === module) main().catch(e => { log('FATAL ' + (e && e.message || e)); process.exit(2); });
else module.exports = { K, expected, dayOf, rate, leavePenalty, undoLeave, leaveTotals, run, publish, board, pubPlayer, mergeRecord, mergeMessages, alias };
