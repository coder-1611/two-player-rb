#!/usr/bin/env node
// tools/elo-backfill.js — V501 (the owner: "use past games to give everybody a rating, pretend the rating system has always
// been like this"; "games played on the same device against each other don't count"). Rebuilds .rb2p/elo/state.json from
// every finished game in the audit archive (audits/*.json), oldest first, through tools/elo.js's own rate() — the same
// rules a game gets today:
//   · a game = the archive's game split (tools/alltime-stats.js: a 'game' record or a match-start, 3+ snaps)
//   · its players = the device id (the anonymous uid) of each role's latest bind before the game's end; ids exist from
//     2026-09-17 — games before that, or with a role unknown, cannot be rated
//   · ranked when both phones' 'final' entries agree, two different devices, and SAME difficulty (the game record's mode
//     since V470; older games did not record it and count as SAME). V502 (the owner: "account for the 3 friend a day rule
//     games, for rn as they weren't trying to hack the system"): no daily limit, as tools/elo.js today
//   · names: the bind's name, else the room's names (Firebase); the board shows each device's latest name
//   node tools/elo-backfill.js            dry run: the board and the counts, nothing written
//   node tools/elo-backfill.js --write    write the state, publish embedcode/elo (r, top), drop the queue notes it covered
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('./elo.js');
const WRITE = process.argv.includes('--write');
const REPO = path.resolve(__dirname, '..');
const AUDITS = fs.existsSync(path.join(REPO, 'audits')) ? path.join(REPO, 'audits') : '/Users/sohamsthitpragya/Projects/two-player-rb/audits';
const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const STATE = path.join(RB2P, 'elo', 'state.json');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const isTest = b => !!b && (b.src === 'local' || /localhost|127\.0\.0\.1/.test(String(b.host || '')) || /HeadlessChrome/.test(String(b.ua || '')));

function games() {
    const out = [];
    for (const f of fs.readdirSync(AUDITS).filter(x => x.endsWith('.json'))) {
        const code = f.slice(0, -5);
        if (/^Z\d/.test(code)) continue;
        let j; try { j = JSON.parse(fs.readFileSync(path.join(AUDITS, f), 'utf8')); } catch (e) { continue; }
        const tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t);
        if (!tl.length) continue;
        const marks = tl.filter(e => e.k === 'game' || (e.k === 'diag' && /^TURN-> [ab] \(match-start\)$/.test(String(e.m || '')))).map(e => e.t).sort((a, b) => a - b);
        const starts = []; for (const t of marks) if (!starts.length || t - starts[starts.length - 1] > 10000) starts.push(t);
        if (!starts.length) starts.push(tl[0].t);
        for (let i = 0; i < starts.length; i++) {
            const st = starts[i], en = i + 1 < starts.length ? starts[i + 1] - 3000 : Infinity;
            const seg = tl.filter(e => e.t >= st - 3000 && e.t < en);
            if (seg.filter(e => e.k === 'snap').length < 3) continue;
            const binds = {};
            for (const e of tl) if (e.k === 'bind' && e.t < en && (e.role === 'a' || e.role === 'b')) binds[e.role] = e;
            if (Object.values(binds).some(isTest)) continue;
            const fin = {};
            for (const r of ['a', 'b']) { const fs2 = seg.filter(e => e.role === r && e.k === 'final'); if (fs2.length) fin[r] = { su: Number(fs2[fs2.length - 1].su), so: Number(fs2[fs2.length - 1].so) }; }
            if (!fin.a && !fin.b) continue;   // not finished: never a result
            const ga = seg.find(e => e.k === 'game' && e.role === 'a') || seg.find(e => e.k === 'game');
            const start = ga && Number(ga.ms) ? Number(ga.ms) : st;   // a V470+ game: the record's own key (the live queue's id)
            out.push({ code, start, fin, mode: ga ? ga.mode : null, uids: { a: (binds.a && binds.a.uid) || '', b: (binds.b && binds.b.uid) || '' },
                       names: { a: (binds.a && binds.a.name) || '', b: (binds.b && binds.b.name) || '' }, ver: (ga && ga.ver) || (binds.a && binds.a.ver) || '' });
        }
    }
    return out.sort((x, y) => x.start - y.start);
}

async function ownerToken() {   // the firebase CLI's login on this Mac (admin), as tools/elo.js
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}

if (require.main === module) (async () => {   // (loading this file runs nothing)
    const all = games();
    const tok = await ownerToken();
    const get = async p => { const r = await fetch(DB + p + '.json?access_token=' + encodeURIComponent(tok), { cache: 'no-store' }); return r.ok ? r.json() : null; };
    // the rooms' names (for games whose binds carry none) and FIND A PLAYER matches (rooms played since V486, 5 Oct)
    const rooms = [...new Set(all.map(g => g.code))], roomNames = {}, lfgAt = {};
    for (const c of rooms) {
        const gs = all.filter(g => g.code === c);
        if (gs.some(g => !g.names.a || !g.names.b)) roomNames[c] = (await get('rooms/' + c + '/names')) || {};
        if (gs.some(g => g.start >= Date.parse('2026-10-05T05:00:00Z'))) { const lf = await get('rooms/' + c + '/lfg'); if (lf && Number(lf.at)) lfgAt[c] = Number(lf.at); }
    }
    // V506: the owner's set ratings and the live leave penalties stand — replayed at their own time
    let prev = null; try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
    const manual = (prev && prev.manual) || [];
    const adj = manual.map(m => (m.d != null ? { at: Number(m.at), uid: m.uid, minus: -Number(m.d) } : { at: Number(m.at), uid: m.uid, set: Number(m.r) }))   // V521: a penalty (d) or a set rating (r)
        .concat(Object.values((prev && prev.games) || {}).filter(x => x && x.leave && x.applied && !x.reversed && x.uid).map(x => ({ at: Number(x.at), uid: x.uid, minus: Number(x.penalty) || 0 })))
        .concat(Object.values((prev && prev.games) || {}).filter(x => x && x.leave && x.applied && !x.reversed && x.ouid)   // V509/V510: the stayer's gain; V510: undone leaves skipped
            .map(x => ({ at: Number(x.at), uid: x.ouid, minus: -(Number(x.gain != null ? x.gain : x.penalty) || 0), win: !!x.won })))   // V519: a leave won counts as a win
        .sort((x, y) => x.at - y.at);
    const st = { players: {}, games: {}, manual }, why = {};
    const applyAdj = until => { while (adj.length && adj[0].at <= until) { const a = adj.shift(), P = st.players[a.uid] || (st.players[a.uid] = { r: 1000, n: 0, w: 0, l: 0, d: 0, nm: '', fd: {}, last: 0, peak: 1000 });
        if (a.set != null) { P.r = a.set; P.peak = Math.max(P.peak || 1000, a.set); } else { P.r -= a.minus; if (a.win) { P.n++; P.w++; } } } };
    for (const g of all) {
        applyAdj(g.start);
        const gid = g.code + '_' + g.start;
        const names = { a: g.names.a || (roomNames[g.code] || {}).a || '', b: g.names.b || (roomNames[g.code] || {}).b || '' };
        let lobby = false;
        if (lfgAt[g.code]) { const first = all.filter(x => x.code === g.code && x.start > lfgAt[g.code]).sort((x, y) => x.start - y.start)[0]; lobby = !!first && first.start === g.start; }
        const rec = { mode: g.mode || 'same', uids: g.uids, fin: g.fin };   // no recorded mode (before V470): SAME
        const res = E.rate(st, { gid, code: g.code, start: g.start, rec, names, lobby, now: g.start + 600000 }, { friendlyLimit: 0 });
        res.backfill = true;
        st.games[gid] = res;
        const k = res.ranked ? 'ranked' : res.why; why[k] = (why[k] || 0) + 1;
    }
    applyAdj(Infinity);
    if (prev) for (const k of Object.keys(prev.games || {})) if (prev.games[k] && prev.games[k].leave) st.games[k] = prev.games[k];
    const board = E.board(st);
    console.log(all.length + ' finished games; ' + JSON.stringify(why) + (manual.length ? '; ' + manual.length + ' set rating(s) replayed' : ''));
    console.log(Object.keys(st.players).length + ' players rated; ' + board.length + ' on the board (5+ games)');
    board.slice(0, 25).forEach((p, i) => console.log('  #' + (i + 1) + ' ' + p.nm + ' ' + p.r + ' (' + p.w + '-' + p.l + (p.d ? '-' + p.d : '') + ', ' + p.n + ' games)'));
    if (!WRITE) { console.log('(dry run — --write to save and publish)'); return; }
    // keep any game the live job rated after the archive's last game (none expected: run with the job paused)
    let live = null; try { live = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
    const extra = live ? Object.keys(live.games || {}).filter(k => !st.games[k] && live.games[k].ranked) : [];
    if (extra.length) console.log('WARNING: ' + extra.length + ' live-rated game(s) not in the archive are dropped: ' + extra.join(', '));
    st.boardAt = Date.now(); st.kept = !!(live && live.kept); st.backfilledAt = Date.now();
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    if (fs.existsSync(STATE)) fs.copyFileSync(STATE, STATE.replace(/\.json$/, '.before-backfill-' + Date.now() + '.json'));
    fs.writeFileSync(STATE + '.tmp', JSON.stringify(st)); fs.renameSync(STATE + '.tmp', STATE);
    const now = Date.now(), r = {};
    for (const u of Object.keys(st.players)) r[u] = E.pubPlayer(st, u, now);
    const put = async (p, v) => { const x = await fetch(DB + p + '.json?print=silent&access_token=' + encodeURIComponent(tok), { method: 'PUT', body: JSON.stringify(v) }); if (!x.ok) throw new Error('PUT ' + p + ' ' + x.status); };
    await put('embedcode/elo/r', r);
    await put('embedcode/elo/top', { at: now, list: board });
    // the live queue's notes for games the archive now covers
    const q = (await get('rooms/~elo/q')) || {};
    let dropped = 0;
    for (const k of Object.keys(q)) { const v = q[k]; if (v && st.games[v.c + '_' + v.s]) { await fetch(DB + 'rooms/~elo/q/' + k + '.json?print=silent&access_token=' + encodeURIComponent(tok), { method: 'DELETE' }); dropped++; } }
    console.log('written: ' + STATE + '; published ' + Object.keys(r).length + ' players and the board; ' + dropped + ' queue note(s) covered');
})().catch(e => { console.error('FATAL', e && e.message || e); process.exit(2); });
