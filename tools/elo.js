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
const codeGamesOn = (st, uid, day) => (st.players[uid] && st.players[uid].fd && st.players[uid].fd[day]) || 0;

// decide one finished game: { ranked, why, ... } and, when ranked, apply it to the state
function rate(st, g, opts) {   // g = { gid, code, start, rec, names, lobby, now }; opts.friendlyLimit (0 = no daily limit)
    const limit = opts && opts.friendlyLimit != null ? Number(opts.friendlyLimit) || 0 : FRIENDLY_LIMIT;
    const rec = g.rec || {}, fin = rec.fin || {}, uids = rec.uids || {};
    const out = { gid: g.gid, code: g.code, start: g.start, at: g.now, ranked: false, why: '', lobby: !!g.lobby };
    const ua = String(uids.a || (fin.a && fin.a.uid) || ''), ub = String(uids.b || (fin.b && fin.b.uid) || '');
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
    const uid = role ? String(uids[role] || (fin[role] && fin[role].uid) || '') : '', ouid = role ? String(uids[other] || (fin[other] && fin[other].uid) || '') : '';
    out.uid = uid;
    if (!uid) { out.why = 'the player who left could not be identified'; return out; }
    if (uid === ouid) { out.why = 'the same device played both sides'; return out; }
    if (rec.mode !== 'same') { out.why = 'not a ranked game (the players had different difficulties)'; return out; }
    const name = String((g.names || {})[role] || ''), known = st.players[uid] && st.players[uid].nm;
    if (EXEMPT.test(name) || EXEMPT.test(String(known || ''))) { out.why = 'exempt: the name has soham in it'; return out; }
    const q = Number(L.q) || 1, clk = Math.max(0, Number(L.clk) || 0), qmins = Number(L.qmins) || 2;
    const leftSec = q >= 5 ? clk : clk + Math.max(0, 4 - q) * qmins * 60;
    out.minutes = Math.floor(leftSec / 60); out.diff = Math.abs((Number(L.su) || 0) - (Number(L.so) || 0));
    let P, O;
    if (leftSec < LATE_SEC) {   // V509: the late leave — a forfeit, 3 x a loss
        if (fin[role]) { out.why = 'the leaver\'s phone recorded the final'; return out; }
        P = player(st, uid); O = ouid ? player(st, ouid) : null;
        const lost = K(P.n) * expected(P.r, O ? O.r : 1000);
        out.rule = 'late'; out.secs = leftSec; out.lost = Math.round(lost * 100) / 100; out.penalty = Math.round(LATE_X * lost * 100) / 100;
    } else {                    // V506: 0.25 x the whole minutes left x |the point difference|
        out.rule = 'min'; out.penalty = Math.round(0.25 * out.minutes * out.diff * 100) / 100;
        if (!(out.penalty > 0)) { out.why = 'the score was tied'; return out; }
        P = player(st, uid); O = ouid ? player(st, ouid) : null;
    }
    out.r0 = Math.round(P.r); P.r -= out.penalty; out.r1 = Math.round(P.r); P.left = (P.left || 0) + 1;
    out[role] = { r0: out.r0, r1: out.r1, d: out.r1 - out.r0 };
    if (name && !P.nm) P.nm = name.slice(0, 16);
    if (O) {   // V509 (late) / V510 (every leave): the player who stayed gets exactly what the leaver lost
        out.ouid = ouid; out.gain = out.penalty; out.or0 = Math.round(O.r); O.r += out.gain; out.or1 = Math.round(O.r); O.peak = Math.max(O.peak || 1000, O.r);
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
    const P = st.players[L.uid]; if (P) { P.r += Number(L.penalty) || 0; P.left = Math.max(0, (P.left || 0) - 1); }
    const O = L.ouid ? st.players[L.ouid] : null; if (O) O.r -= Number(L.gain) || 0;
    L.reversed = true; L.reversedAt = now;
    return L;
}

function board(st) {
    return Object.keys(st.players).map(u => Object.assign({ u }, st.players[u])).filter(p => p.n >= BOARD_MIN)
        .sort((x, y) => y.r - x.r || y.n - x.n).slice(0, BOARD_N)
        .map(p => ({ nm: cleanName(p.nm) || 'a player', r: Math.round(p.r), w: p.w, l: p.l, d: p.d, n: p.n, u: p.u.slice(0, 8) }));
}
function pubPlayer(st, uid, now) {
    const p = st.players[uid], today = dayOf(now);
    return { r: Math.round(p.r), n: p.n, w: p.w, l: p.l, d: p.d, nm: cleanName(p.nm), fd: (p.fd && p.fd[today]) || 0, fdd: today, peak: Math.round(p.peak || p.r) };
}

// one pass over the queue. io = { get(path, query), put, patch, del } (tests pass a fake)
async function run(st, io, now, opts) {
    const q = (await io.get(QUEUE)) || {};
    const items = Object.keys(q).filter(k => q[k] && q[k].c && q[k].s).map(k => ({ key: k, code: String(q[k].c), start: Number(q[k].s), t: Number(q[k].t) || 0, left: q[k].left || null }))
        .sort((a, b) => a.start - b.start);
    const changed = new Set(), done = [];
    for (const it of items) {
        if (it.left) {   // V506: a leave the other player noted
            const gidL = it.code + '_' + it.start + '_left';
            if (st.games[gidL] || (!INCLUDE_TEST && /^Z\d/.test(it.code))) { await io.del(QUEUE + '/' + it.key); continue; }
            if (now - it.t < LEAVE_WAIT_MS) continue;   // they may come back and finish the game
            const recL = (await io.get('rooms/' + it.code + '/games/' + it.start)) || {};
            const namesL = (await io.get('rooms/' + it.code + '/names')) || {};
            const resL = leavePenalty(st, { gid: gidL, code: it.code, start: it.start, rec: recL, names: namesL, left: it.left, now });
            st.games[gidL] = resL;
            if (resL.applied) { changed.add(resL.uid); if (resL.ouid) changed.add(resL.ouid); }
            done.push(resL);   // V510: its result is published (the player who stayed sees the points it gave them)
            await io.del(QUEUE + '/' + it.key);
            log((resL.applied ? 'LEFT ' : 'leave, no penalty ') + gidL + ' ' + resL.role + (!resL.applied ? ' — ' + resL.why
                : resL.rule === 'late' ? ' ' + resL.r0 + '->' + resL.r1 + ' (-' + resL.penalty + ': ' + resL.secs + ' s left, 3 x a loss of ' + resL.lost + ')' + (resL.ouid ? ', the stayer ' + resL.or0 + '->' + resL.or1 : '')
                : ' ' + resL.r0 + '->' + resL.r1 + ' (-' + resL.penalty + ': ' + resL.minutes + ' min x ' + resL.diff + ' pts x 0.25)'));
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
            const u = undoLeave(st, gid + '_left', now);
            if (u) { changed.add(u.uid); if (u.ouid) changed.add(u.ouid); done.push(u); log('leave undone ' + gid + '_left — they came back and the game was finished'); }
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
    if (changed.size) { const r = {}; for (const u of changed) r[u] = pubPlayer(st, u, now); await io.patch(PUB + '/r', r); }
    if (done.length) {
        const g = {};
        for (const d of done) g[d.gid] = d.leave
            ? { leave: true, applied: !!d.applied, reversed: !!d.reversed, rule: d.rule || '', penalty: d.penalty || 0, role: d.role || '', why: d.why || '', at: d.at, a: d.a || null, b: d.b || null }
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
        log('BOARD published: ' + board(st).length + ' players');
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
else module.exports = { K, expected, dayOf, rate, leavePenalty, undoLeave, run, publish, board, pubPlayer };
