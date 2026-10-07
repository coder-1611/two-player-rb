#!/usr/bin/env node
// tools/elo.js — V500 (the owner, 6 Oct: "create an elo system where everybody is a 1000 and at first points fluctuate a
// lot but as account gets more games it flattens out, like chess elo ... a system that stops cheating from friendly matches
// by saying you can't have more than 3 ranked games in a non lobby set up per day ... a leaderboard with names censored if
// slurs"). Run every 2 minutes by the LaunchAgent com.rb2p.elo (tools/install-elo.sh).
//   · the phones, at each final (index.html _rb2p_eloGameOver): rooms/{code}/games/{start}/fin/{role} = { su, so, t, uid }
//     and the note rooms/~elo/q/{code}_{start}; the game record (written at the start) carries mode, difs, uids, qmins
//   · a game is RANKED when both phones recorded the same final, the players are two different ids, both had the SAME
//     difficulty, and — unless it was a FIND A PLAYER game (the room's first game after its lfg match) — neither player
//     already had 3 ranked code games that day (Central time). Otherwise it is kept unranked, with the reason. A game whose
//     second final never came is unranked after 10 minutes. A phone cannot write its own rating: only this job does.
//   · Elo: everyone starts at 1000; E = 1 / (1 + 10^((Rb - Ra) / 400)); a player's K = 16 + 48·e^(-n/10), n = their ranked
//     games so far (64 at the first, ~34 at 10, ~22 at 20, ~16 from 40 on): big swings at first, flat later; a tie is 0.5
//   · the truth is .rb2p/elo/state.json; it publishes embedcode/elo: top (the board: 5+ games, the top 50, names censored
//     for slurs), r/{uid} (each player: rating, games, W-L-T, today's ranked code games), g/{code_start} (each game's change
//     — the stats screen shows it), at
//   node tools/elo.js            one run (what the LaunchAgent does)
//   node tools/elo.js --report   the board, nothing changed
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
const NOW = () => Number(opt('--now', Date.now()));
const SETTLE_MS = 20000, ONE_SIDE_MS = 10 * 60000, FRIENDLY_PER_DAY = 3, BOARD_MIN = 5, BOARD_N = 50, KEEP_G_MS = 2 * 86400e3;
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
function rate(st, g) {   // g = { gid, code, start, rec, names, lobby, now }
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
    if (!g.lobby && (codeGamesOn(st, ua, day) >= FRIENDLY_PER_DAY || codeGamesOn(st, ub, day) >= FRIENDLY_PER_DAY)) {
        out.why = 'a player already had ' + FRIENDLY_PER_DAY + ' ranked code games today'; return out;
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
async function run(st, io, now) {
    const q = (await io.get(QUEUE)) || {};
    const items = Object.keys(q).filter(k => q[k] && q[k].c && q[k].s).map(k => ({ key: k, code: String(q[k].c), start: Number(q[k].s), t: Number(q[k].t) || 0 }))
        .sort((a, b) => a.start - b.start);
    const changed = new Set(), done = [];
    for (const it of items) {
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
        const res = rate(st, { gid, code: it.code, start: it.start, rec, names, lobby, now });
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
        for (const d of done) g[d.gid] = { ranked: d.ranked, why: d.why || '', at: d.at, lobby: d.lobby, a: d.a || null, b: d.b || null };
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
else module.exports = { K, expected, dayOf, rate, run, publish, board, pubPlayer, FRIENDLY_PER_DAY };
