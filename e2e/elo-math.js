// e2e/elo-math.js — V500 (the owner: "an elo system where everybody is a 1000 and at first points fluctuate a lot but as
// account gets more games it flattens out, like chess elo ... you can't have more than 3 ranked games in a non lobby set up
// per day ... a leaderboard with names censored if slurs"). tools/elo.js on a fake database (no browser, no Firebase):
//   E1  everyone starts at 1000; the first game moves both by 32 (K 64 at the first game, 16 + 48·e^(-n/10) after)
//   E2  it flattens: after 30 ranked games a win against an equal player moves about 9; an upset moves more than a favourite's win
//   E3  V502: no daily limit by default (4 code games between two friends all count); --friendly-limit 3 brings back V500's
//       rule: the 4th is unranked, a FIND A PLAYER game (the room's first game after its lfg match) still counts, a rematch does not
//   E4  unranked with the reason: different difficulties, one device on both sides, the phones disagree, one final only
//       (after 10 minutes — before that it waits); a final under 20 s old waits for the other phone
//   E5  the run: the queue notes are deleted when done; a second phone's note for a game already rated is dropped
//   E6  the publish: r/{uid} (rating, games, today's code games), g/{game} (the change), top (5+ games, names censored)
//   E7  V506 the leaving penalty: 0.25 x whole minutes left x |point difference|; soham names exempt; none when tied,
//       finished after all or unranked; overtime counts its own clock
//   E8  the job waits 10 minutes after the note (they may come back), then takes the points and drops the note
const E = require('../tools/elo.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const T0 = Date.parse('2026-10-07T15:00:00Z');   // 10 am Central
function fakeDb(data) {
    const db = JSON.parse(JSON.stringify(data)), writes = [];
    const at = p => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), db);
    const setAt = (p, v) => { const ks = p.split('/'), last = ks.pop(); let o = db; for (const k of ks) o = o[k] || (o[k] = {}); if (v == null) delete o[last]; else o[last] = v; };
    return { db, writes,
        get: async (p, q) => { const v = at(p); if (q === 'shallow=true' && v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => o[k] = true); return o; } return v == null ? null : JSON.parse(JSON.stringify(v)); },
        put: async (p, v) => { writes.push(['put', p]); setAt(p, v); },
        patch: async (p, v) => { writes.push(['patch', p]); for (const k of Object.keys(v)) setAt(p + '/' + k, v[k]); },
        del: async p => { writes.push(['del', p]); setAt(p, null); } };
}
function game(code, start, opts) {   // a finished game: the record and both phones' notes
    const o = Object.assign({ ua: 'uidA0000aaaa', ub: 'uidB0000bbbb', sa: 21, sb: 14, mode: 'same', fins: 'ab' }, opts || {});
    const rec = { ts: start, mode: o.mode, uids: { a: o.ua, b: o.ub }, fin: {} };
    if (o.fins.includes('a')) rec.fin.a = { su: o.sa, so: o.sb, uid: o.ua, t: start + 600000 };
    if (o.fins.includes('b')) rec.fin.b = { su: o.sb2 != null ? o.sb2 : o.sb, so: o.sa, uid: o.ub, t: start + 600000 };
    return rec;
}
function room(recs, names, lfgAt) { const r = { games: {}, names: names || { a: 'Soham', b: 'Kai' } }; recs.forEach(x => r.games[x.ts] = x); if (lfgAt) r.lfg = { at: lfgAt }; return r; }
const queue = (entries) => { const q = {}; entries.forEach(([c, s, t]) => q[c + '_' + s] = { c, s, t }); return q; };

(async () => {
    console.log('=== V500 THE RATING (tools/elo.js on a fake database) ===');
    // E1
    {
        const st = { players: {}, games: {} };
        const r = E.rate(st, { gid: 'AAAA_1', code: 'AAAA', start: T0, rec: game('AAAA', T0), names: { a: 'Soham', b: 'Kai' }, lobby: false, now: T0 + 700000 });
        check('E1 everyone starts at 1000; the first game moves both by 32 (K 64)', r.ranked && r.a.r0 === 1000 && r.a.r1 === 1032 && r.b.r1 === 968 && Math.round(E.K(0)) === 64 && Math.round(E.K(10)) === 34,
              JSON.stringify({ a: r.a, b: r.b, K0: E.K(0), K10: E.K(10) }));
    }
    // E2
    {
        const st = { players: { x: { r: 1000, n: 30, w: 15, l: 15, d: 0, nm: 'X', fd: {}, peak: 1000 }, y: { r: 1000, n: 30, w: 15, l: 15, d: 0, nm: 'Y', fd: {}, peak: 1000 } }, games: {}, rankSnaps: [{ at: 0, ids: '' }] };   // V536: not neighbours (an empty board when the game began)
        const r = E.rate(st, { gid: 'B_1', code: 'BBBB', start: T0, rec: game('BBBB', T0, { ua: 'x', ub: 'y' }), lobby: true, now: T0 });
        const st2 = { players: { x: { r: 1200, n: 30, w: 0, l: 0, d: 0, fd: {} }, y: { r: 1000, n: 30, w: 0, l: 0, d: 0, fd: {} } }, games: {}, rankSnaps: [{ at: 0, ids: '' }] };   // V536: not neighbours (an empty board when the game began)
        const fav = E.rate(st2, { gid: 'C_1', code: 'CCCC', start: T0, rec: game('CCCC', T0, { ua: 'x', ub: 'y' }), lobby: true, now: T0 });
        const st3 = { players: { x: { r: 1200, n: 30, w: 0, l: 0, d: 0, fd: {} }, y: { r: 1000, n: 30, w: 0, l: 0, d: 0, fd: {} } }, games: {}, rankSnaps: [{ at: 0, ids: '' }] };   // V536: not neighbours (an empty board when the game began)
        const ups = E.rate(st3, { gid: 'D_1', code: 'DDDD', start: T0, rec: game('DDDD', T0, { ua: 'y', ub: 'x' }), lobby: true, now: T0 });
        check('E2 it flattens: 30 games in, an even win moves 9; an upset moves more than a favourite\'s win', r.a.d === 9 && ups.a.d > fav.a.d && fav.a.d > 0,
              JSON.stringify({ even: r.a.d, favourite: fav.a.d, upset: ups.a.d }));
    }
    // E3: four code games between two friends on one day, then a FIND A PLAYER game, then a rematch in that lobby room —
    // V502 ("Right now don't have any anti cheating rules yet"): with no limit (the default) all six count; the limit is
    // still there for later (--friendly-limit 3): the 4th code game is unranked, the lobby game counts, its rematch does not
    {
        const mk = () => { const g = [0, 1, 2, 3].map(i => game('FRND', T0 + i * 900000)), lob = game('LOBY', T0 + 4 * 900000), rem = game('LOBY', T0 + 5 * 900000);
            return { g, lob, rem, io: fakeDb({ rooms: { FRND: room(g), LOBY: room([lob, rem], null, T0 + 4 * 900000 - 60000),
                '~elo': { q: queue(g.map(x => ['FRND', x.ts, x.ts + 600000]).concat([['LOBY', lob.ts, lob.ts + 600000], ['LOBY', rem.ts, rem.ts + 600000]])) } } }) }; };
        const A0 = mk(), out0 = await E.run({ players: {}, games: {} }, A0.io, T0 + 6 * 900000 + 700000);
        const B = mk(), out3 = await E.run({ players: {}, games: {} }, B.io, T0 + 6 * 900000 + 700000, { friendlyLimit: 3 });
        const by0 = Object.fromEntries(out0.done.map(d => [d.gid, d])), by3 = Object.fromEntries(out3.done.map(d => [d.gid, d]));
        const all0 = out0.done.length === 6 && out0.done.every(d => d.ranked);
        const r3 = B.g.map(x => by3['FRND_' + x.ts].ranked), lr = by3['LOBY_' + B.lob.ts], rr = by3['LOBY_' + B.rem.ts];
        check('E3 no daily limit by default (all 6 count); --friendly-limit 3 still makes the 4th code game and the lobby rematch unranked',
              all0 && r3.join() === 'true,true,true,false' && /3 ranked code games/.test(by3['FRND_' + B.g[3].ts].why) && lr.ranked && lr.lobby && !rr.ranked && !rr.lobby,
              JSON.stringify({ noLimit: out0.done.map(d => d.ranked), limit3: { code: r3, lobby: lr.ranked, rematch: rr.ranked } }));
    }
    // E4
    {
        const st = { players: {}, games: {} };
        const now = T0 + 700000;
        const cases = {
            DIFF: game('DIFF', T0, { mode: 'different' }), SAME: game('SAME', T0, { ub: 'uidA0000aaaa' }),
            DISA: game('DISA', T0, { sb2: 7 }), ONE1: game('ONE1', T0 - 1200000, { fins: 'a' }), ONE2: game('ONE2', T0, { fins: 'a' }), NEW1: game('NEW1', T0)
        };
        const rooms = {}; Object.keys(cases).forEach(c => rooms[c] = room([cases[c]]));
        rooms['~elo'] = { q: queue([['DIFF', T0, T0 + 600000], ['SAME', T0, T0 + 600000], ['DISA', T0, T0 + 600000], ['ONE1', T0 - 1200000, T0 - 1200000 + 600000],
                                    ['ONE2', T0, T0 + 600000], ['NEW1', T0, now - 5000]]) };
        const io = fakeDb({ rooms });
        const out = await E.run(st, io, now);
        const by = Object.fromEntries(out.done.map(d => [d.code, d]));
        const ok = by.DIFF && /different difficulties/.test(by.DIFF.why) && by.SAME && /same device/.test(by.SAME.why) && by.DISA && /disagree/.test(by.DISA.why) &&
                   by.ONE1 && /only one phone/.test(by.ONE1.why) && !by.ONE2 && !by.NEW1 && !Object.values(by).some(d => d.ranked);
        check('E4 unranked with the reason (difficulty, one device, disagreeing phones, one final after 10 min); the young ones wait', ok,
              JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, d]) => [k, d.why]))) + ' waiting: ' + JSON.stringify(Object.keys(io.db.rooms['~elo'].q)));
    }
    // E5 + E6: the run deletes its notes; the publish
    {
        const st = { players: {}, games: {} };
        const N = 'nig' + 'ger';
        // five FIND A PLAYER games (each room's first game after its match), one more note for the first game
        const recs = [0, 1, 2, 3, 4].map(i => game('PUB' + i, T0 + i * 3600000, { ua: 'uidC0000cccc', ub: 'uidD0000dddd' }));
        const rooms = {}; recs.forEach((x, i) => rooms['PUB' + i] = room([x], { a: 'wisdom' + N, b: 'Kai' }, x.ts - 60000));
        rooms['~elo'] = { q: Object.assign(queue(recs.map((x, i) => ['PUB' + i, x.ts, x.ts + 600000])), { ['PUB0_' + recs[0].ts + '_b']: { c: 'PUB0', s: recs[0].ts, t: recs[0].ts + 600000 } }) };
        const io = fakeDb({ rooms });
        const now = T0 + 5 * 3600000;
        const out = await E.run(st, io, now);
        await E.publish(st, io, out.changed, out.done, now);
        const left = Object.keys(io.db.rooms['~elo'].q || {});
        check('E5 every note is deleted once its game is decided (a second note for a rated game too)', left.length === 0 && out.done.length === 5, JSON.stringify({ left, done: out.done.length }));
        const pub = io.db.embedcode && io.db.embedcode.elo, c = pub && pub.r && pub.r.uidC0000cccc, top = pub && pub.top;
        const g0 = pub && pub.g && pub.g['PUB0_' + recs[0].ts];
        const day = E.dayOf(now);
        check('E6 the publish: each player (rating, games, today\'s code games), each game\'s change, the board (5+ games, the name censored)',
              !!(c && c.n === 5 && c.fdd === day && g0 && g0.ranked && g0.a && top && top.list.length === 2 && top.list[0].nm === 'wisdom******' && top.list[0].u === 'uidC0000'),
              JSON.stringify({ c, g0, top }));
    }
    // E7 + E8 (V506): the leaving penalty — 0.25 x whole minutes left x |point difference| from the player who left first
    {
        const base = () => ({ players: { lv: { r: 1000, n: 3, w: 1, l: 2, d: 0, nm: 'Kai', fd: {}, peak: 1000 } }, games: {} });
        const rec = (o) => Object.assign({ mode: 'same', uids: { a: 'lv', b: 'sty' }, fin: {} }, o || {});
        const L = (o) => Object.assign({ role: 'a', by: 'b', q: 2, clk: 90, qmins: 2, su: 14, so: 0 }, o || {});   // Q2 1:30, 2-minute quarters, 14 apart
        const go = (st, o) => E.leavePenalty(st, Object.assign({ gid: 'LEAV_1_left', code: 'LEAV', start: T0, rec: rec(), names: { a: 'Kai', b: 'Lee' }, left: L(), now: T0 }, o));
        const s1 = base(), r1 = go(s1, {});                                                   // 1:30 + Q3 + Q4 = 5:30 -> 5 minutes; 0.25 x 5 x 14 = 17.5
        const r2 = go(base(), { names: { a: 'xX SohamTest Xx', b: 'Lee' } });                 // exempt
        const r3 = go(base(), { left: L({ su: 7, so: 7 }) });                                 // tied: nothing to take
        const r4 = go(base(), { rec: rec({ fin: { a: { su: 3, so: 7 }, b: { su: 7, so: 3 } } }) });   // finished after all
        const r5 = go(base(), { rec: rec({ mode: 'different' }) });                           // not ranked
        const r6 = go(base(), { left: L({ q: 5, clk: 125, su: 3, so: 10 }) });                // overtime: 2 whole minutes x 7 = 3.5
        const ok = r1.applied && r1.minutes === 5 && r1.diff === 14 && r1.penalty === 17.5 && Math.abs(s1.players.lv.r - 982.5) < 1e-9 &&
                   r2.applied && r2.penalty === 0 && r2.exempt && r2.gain === 32 && /soham/.test(r2.why) && r3.applied && r3.penalty === 0 && r3.gain === 32 && !r4.applied && /finished/.test(r4.why) &&
                   !r5.applied && /not a ranked/.test(r5.why) && r6.applied && r6.minutes === 2 && r6.penalty === 3.5;
        check('E7 the leaving penalty: 0.25 x 5 min x 14 = 17.5 off; soham names pay nothing but the stayer still wins (V521); a tied game costs the leaver nothing but still wins the stayer\'s game (V519); none when finished, unranked; overtime uses its clock', ok,
              JSON.stringify({ r1: [r1.minutes, r1.diff, r1.penalty, s1.players.lv.r], r2: r2.why, r3: [r3.penalty, r3.gain], r4: r4.why, r5: r5.why, r6: [r6.minutes, r6.penalty] }));
        // E8 (V510, the owner: "give point to opponent immediately after one leaves"): the run applies a leave at once —
        // the leaver's points go to the player who stayed, the note goes, and the result is published for the staying phone
        const st = base(), note = { c: 'LEAV', s: T0, t: T0 + 600000, left: L() };
        const io = fakeDb({ rooms: { LEAV: { games: { [T0]: rec() }, names: { a: 'Kai', b: 'Lee' } }, '~elo': { q: { ['LEAV_' + T0 + '_left']: note } } } });
        const out = await E.run(st, io, T0 + 600000 + 1000);
        await E.publish(st, io, out.changed, out.done, T0 + 600000 + 1000);
        const g = ((io.db.embedcode || {}).elo || {}).g || {}, pubL = g['LEAV_' + T0 + '_left_a'];
        const landed = Math.abs(st.players.lv.r - 982.5) < 1e-9 && Math.abs(st.players.sty.r - 1032) < 1e-9 && st.players.sty.w === 1 && st.players.sty.n === 1 && out.changed.has('lv') && out.changed.has('sty') &&
                       Object.keys(io.db.rooms['~elo'].q || {}).length === 0 && st.games['LEAV_' + T0 + '_left_a'].applied;
        const shown = !!(pubL && pubL.leave && pubL.applied && pubL.b && pubL.b.d === 32 && pubL.a && pubL.a.d === -17);
        check('E8 a leave lands at the first run: -17.5 from the leaver; the player who stayed WINS the game (V519: +32, a first win at even ratings, 1 game 1 win); the note gone, the result published', landed && shown,
              JSON.stringify({ lv: st.players.lv.r, sty: st.players.sty && st.players.sty.r, pubL, left: Object.keys(io.db.rooms['~elo'].q || {}) }));
    }
    // E9 (V509): the late leave — under a minute left, a forfeit: 3 x what a loss to that player costs, to the player who stayed
    {
        const base = () => ({ players: { lv: { r: 1000, n: 10, w: 5, l: 5, d: 0, nm: 'Kai', fd: {}, peak: 1000 }, sty: { r: 1100, n: 40, w: 20, l: 20, d: 0, nm: 'Lee', fd: {}, peak: 1100 } }, games: {}, rankSnaps: [{ at: 0, ids: '' }] });   // V536: not neighbours
        const rec = (o) => Object.assign({ mode: 'same', uids: { a: 'lv', b: 'sty' }, fin: {} }, o || {});
        const L = (o) => Object.assign({ role: 'a', by: 'b', q: 4, clk: 1, qmins: 2, su: 29, so: 7 }, o || {});   // Q4 0:01, the leaver down 22
        const go = (st, o) => E.leavePenalty(st, Object.assign({ gid: 'LATE_1_left', code: 'LATE', start: T0, rec: rec(), names: { a: 'Kai', b: 'Lee' }, left: L(), now: T0 }, o));
        const loss = E.K(10) * E.expected(1000, 1100);                                        // what a loss would have cost: ~34 x 0.36 = 12.3
        const s1 = base(), r1 = go(s1, {});
        const s2 = base(), r2 = go(s2, { left: L({ su: 0, so: 21, clk: 59 }) });               // ahead with 0:59 left: still a forfeit
        const s3 = base(), r3 = go(s3, { left: L({ clk: 60 }) });                              // 1:00 left: the whole-minute formula (0.25 x 1 x 22)
        const r4 = go(base(), { names: { a: 'SOHAM 2', b: 'Lee' } });                          // exempt
        const r5 = go(base(), { rec: rec({ fin: { a: { su: 7, so: 29 } } }) });               // the leaver's phone recorded the final
        const r6 = go(base(), { left: L({ q: 5, clk: 30, su: 3, so: 3 }) });                   // overtime, 0:30, tied: a forfeit too
        const want = Math.round(3 * loss * 100) / 100, win = E.K(40) * (1 - E.expected(1100, 1000));   // V519: the stayer's win, ~6.1
        const ok = r1.applied && r1.rule === 'late' && r1.penalty === want && Math.abs(s1.players.lv.r - (1000 - want)) < 1e-9 && Math.abs(s1.players.sty.r - (1100 + win)) < 1e-9 &&
                   r1.ouid === 'sty' && r1.or1 === Math.round(1100 + win) && s1.players.lv.n === 10 && s1.players.sty.w === 21 && s1.players.sty.n === 41 &&
                   r2.applied && r2.penalty === want && r3.applied && r3.rule !== 'late' && r3.penalty === 5.5 && Math.abs(s3.players.sty.r - (1100 + win)) < 1e-9 &&
                   r4.applied && r4.penalty === 0 && r4.exempt && /soham/.test(r4.why) && !r5.applied && /recorded the final/.test(r5.why) && r6.applied && r6.rule === 'late';
        check('E9 under a minute left: the leaver loses 3 x a loss (' + want + '), whatever the score; the stayer wins the game (V519: +' + win.toFixed(2) + ', a win, not the leaver\'s loss); 1:00 left is the minute formula; exempt / own final: nothing',
              ok, JSON.stringify({ want, r1: [r1.rule, r1.penalty, s1.players.lv.r, s1.players.sty.r], r2: r2.penalty, r3: [r3.rule, r3.penalty], r4: r4.why, r5: r5.why, r6: r6.rule }));
        // the run: the stayer's new rating is published too
        const st = base(), note = { c: 'LATE', s: T0, t: T0, left: L() };
        const io = fakeDb({ rooms: { LATE: { games: { [T0]: rec() }, names: { a: 'Kai', b: 'Lee' } }, '~elo': { q: { ['LATE_' + T0 + '_left']: note } } } });
        const out = await E.run(st, io, T0 + 10 * 60000 + 1000);
        check('E10 the job publishes both: the leaver and the player who stayed', out.changed.has('lv') && out.changed.has('sty') && st.games['LATE_' + T0 + '_left_a'].rule === 'late',
              JSON.stringify([...out.changed]));
        // E11 (V510): they came back and both phones recorded the final — the leave is undone, then the game is rated
        const st2 = base(), recF = rec({ fin: { a: { su: 7, so: 14, uid: 'lv' }, b: { su: 14, so: 7, uid: 'sty' } } });
        const io2 = fakeDb({ rooms: { LATE: { games: { [T0]: rec() }, names: { a: 'Kai', b: 'Lee' } }, '~elo': { q: { ['LATE_' + T0 + '_left']: note } } } });
        await E.run(st2, io2, T0 + 1000);   // the leave lands
        const afterLeave = [st2.players.lv.r, st2.players.sty.r];
        io2.db.rooms.LATE.games[T0] = recF;   // ...they came back and finished: both finals
        io2.db.rooms['~elo'].q = { ['LATE_' + T0]: { c: 'LATE', s: T0, t: T0 + 60000 } };
        const out2 = await E.run(st2, io2, T0 + 60000 + 30000);
        const lvEnd = st2.players.lv.r, styEnd = st2.players.sty.r, Lg = st2.games['LATE_' + T0 + '_left_a'], Gg = st2.games['LATE_' + T0];
        const okU = afterLeave[0] < 1000 && afterLeave[1] > 1100 && Lg.reversed && Gg && Gg.ranked && Gg.a.r0 === 1000 && Gg.b.r0 === 1100 && lvEnd < 1000 && styEnd > 1100 &&
                    out2.done.some(d => d.leave && d.reversed);
        check('E11 they came back and finished: the leave is undone (both back to 1000 / 1100) and the game is rated from there', okU,
              JSON.stringify({ afterLeave, reversed: Lg.reversed, game: Gg && [Gg.ranked, Gg.a, Gg.b], end: [lvEnd, styEnd] }));
    }
    // E12 (V521, OMJG): the stayer's hidden tab was reported first ("a left", noted by b); then a reports b leaving — a was
    // still there: a's leave is undone, b's applied (b pays, a wins)
    {
        const st = { players: { pa: { r: 1000, n: 20, w: 10, l: 10, d: 0, nm: 'Ann', fd: {}, peak: 1000 }, pb: { r: 1000, n: 20, w: 10, l: 10, d: 0, nm: 'Bob', fd: {}, peak: 1000 } }, games: {} };
        const rec = { mode: 'same', uids: { a: 'pa', b: 'pb' }, fin: {} };
        const n1 = { c: 'OMJX', s: T0, t: T0 + 1000, left: { role: 'a', by: 'b', q: 4, clk: 100, qmins: 3, su: 6, so: 14, at: T0 + 1000 } };
        const io = fakeDb({ rooms: { OMJX: { games: { [T0]: rec }, names: { a: 'Ann', b: 'Bob' } }, '~elo': { q: { ['OMJX_' + T0 + '_left_a']: n1 } } } });
        await E.run(st, io, T0 + 2000);
        const mid = [st.players.pa.r, st.players.pb.r, st.players.pb.w];
        io.db.rooms['~elo'].q = { ['OMJX_' + T0 + '_left_b']: { c: 'OMJX', s: T0, t: T0 + 120000, left: { role: 'b', by: 'a', q: 4, clk: 34, qmins: 3, su: 14, so: 6, at: T0 + 120000 } } };
        await E.run(st, io, T0 + 121000);
        const La = st.games['OMJX_' + T0 + '_left_a'], Lb = st.games['OMJX_' + T0 + '_left_b'];
        const ok = mid[0] < 1000 && mid[1] > 1000 && La.reversed && Lb.applied && Lb.rule === 'late' && st.players.pa.r > 1000 && st.players.pb.r < 1000 && st.players.pa.w === 11 && st.players.pb.w === 10;
        check('E12 a leave reported for a player who then reports the other leaving is undone; the real leaver pays and the stayer wins (OMJG)', ok,
              JSON.stringify({ mid, aReversed: La.reversed, b: Lb && [Lb.rule, Lb.penalty, Lb.gain], end: [st.players.pa.r, st.players.pb.r, st.players.pa.w, st.players.pb.w] }));
    }
    // E14-E17 (V529, the owner: "refreshing fixes lag" — make it an announcement): a refresh is not a leave. The page that
    // noted the leave sees them come back and sends a "back" note; within 2 minutes the leave is undone
    {
        const mk = () => ({ players: { pa: { r: 1000, n: 20, w: 10, l: 10, d: 0, nm: 'Ann', fd: {}, peak: 1000 }, pb: { r: 1000, n: 20, w: 10, l: 10, d: 0, nm: 'Bob', fd: {}, peak: 1000 } }, games: {} });
        const rec = { mode: 'same', uids: { a: 'pa', b: 'pb' }, fin: {} };
        const lv = (t) => ({ c: 'BACK', s: T0, t, left: { role: 'a', by: 'b', q: 3, clk: 100, qmins: 3, su: 6, so: 14, at: t } });
        const bk = (t, since) => ({ c: 'BACK', s: T0, t, back: { role: 'a', by: 'b', at: t, since: since || T0 + 1000 } });
        const K_L = 'BACK_' + T0 + '_left_a', K_B = 'BACK_' + T0 + '_back_a';
        // E14
        const st = mk(), io = fakeDb({ rooms: { BACK: { games: { [T0]: rec }, names: { a: 'Ann', b: 'Bob' } }, '~elo': { q: { [K_L]: lv(T0 + 1000) } } } });
        await E.run(st, io, T0 + 2000);
        const mid = [st.players.pa.r, st.players.pb.r, st.players.pb.w, st.players.pb.n];
        io.db.rooms['~elo'].q = { [K_B]: bk(T0 + 20000) };
        const o14 = await E.run(st, io, T0 + 21000);
        const L14 = st.games[K_L];
        check('E14 they came back 18 s after the leave (a refresh): the leave is undone — both back to 1000, the stayer\'s win taken back; published as reversed',
              mid[0] < 1000 && mid[1] > 1000 && mid[2] === 11 && L14.reversed && L14.back && st.players.pa.r === 1000 && st.players.pb.r === 1000 && st.players.pb.w === 10 && st.players.pb.n === 20 &&
              o14.done.some(d => d.leave && d.reversed) && Object.keys(io.db.rooms['~elo'].q || {}).length === 0,
              JSON.stringify({ mid, end: [st.players.pa.r, st.players.pb.r, st.players.pb.w, st.players.pb.n], L14: L14 && [L14.reversed, L14.back, L14.why] }));
        // E15: they left for real later in the same game — applied again
        io.db.rooms['~elo'].q = { [K_L]: lv(T0 + 300000) };
        await E.run(st, io, T0 + 301000);
        check('E15 after a refresh, a real leave later in the same game counts again', st.games[K_L].applied && !st.games[K_L].reversed && st.players.pa.r < 1000 && st.players.pb.r > 1000,
              JSON.stringify({ L: [st.games[K_L].applied, st.games[K_L].reversed], end: [st.players.pa.r, st.players.pb.r] }));
        // E16: back after more than 2 minutes — a leave, not a refresh
        const st2 = mk(), io2 = fakeDb({ rooms: { BACK: { games: { [T0]: rec }, names: { a: 'Ann', b: 'Bob' } }, '~elo': { q: { [K_L]: lv(T0 + 1000) } } } });
        await E.run(st2, io2, T0 + 2000);
        io2.db.rooms['~elo'].q = { [K_B]: bk(T0 + 200000) };
        await E.run(st2, io2, T0 + 201000);
        check('E16 back after more than 2 minutes: the leave stands', !st2.games[K_L].reversed && st2.players.pa.r < 1000, JSON.stringify([st2.games[K_L].reversed, st2.players.pa.r]));
        // E17: the leave and the back land in the same pass (the back sorted after its leave): nothing changes in the end
        const st3 = mk(), io3 = fakeDb({ rooms: { BACK: { games: { [T0]: rec }, names: { a: 'Ann', b: 'Bob' } }, '~elo': { q: { [K_B]: bk(T0 + 9000), [K_L]: lv(T0 + 1000) } } } });
        await E.run(st3, io3, T0 + 10000);
        check('E17 a leave and its "back" in the same pass: the leave lands and is undone — no change', st3.games[K_L] && st3.games[K_L].reversed && st3.players.pa.r === 1000 && st3.players.pb.r === 1000,
              JSON.stringify([st3.games[K_L] && st3.games[K_L].reversed, st3.players.pa.r, st3.players.pb.r]));
        // E18: a late copy of the first leave note (a stalled line delivers it after the "back") is not a new leave
        const st4 = mk(), io4 = fakeDb({ rooms: { BACK: { games: { [T0]: rec }, names: { a: 'Ann', b: 'Bob' } }, '~elo': { q: { [K_L]: lv(T0 + 1000) } } } });
        await E.run(st4, io4, T0 + 2000);
        io4.db.rooms['~elo'].q = { [K_B]: bk(T0 + 20000) }; await E.run(st4, io4, T0 + 21000);
        io4.db.rooms['~elo'].q = { [K_L]: lv(T0 + 1000) }; await E.run(st4, io4, T0 + 40000);
        check('E18 a late copy of the leave note after the refresh was undone: not counted again', st4.games[K_L].reversed && st4.players.pa.r === 1000 && st4.players.pb.r === 1000,
              JSON.stringify([st4.games[K_L].reversed, st4.players.pa.r, st4.players.pb.r]));
        // E19: a late copy of the first "back" note after a real leave later: it names the first leave, so the real one stands
        io4.db.rooms['~elo'].q = { [K_L]: lv(T0 + 300000) }; await E.run(st4, io4, T0 + 301000);
        io4.db.rooms['~elo'].q = { [K_B]: bk(T0 + 20000) }; await E.run(st4, io4, T0 + 320000);
        check('E19 a late copy of an old "back" note does not undo a later real leave', !st4.games[K_L].reversed && st4.players.pa.r < 1000 && st4.players.pb.r > 1000,
              JSON.stringify([st4.games[K_L].reversed, st4.players.pa.r, st4.players.pb.r]));
        // E20: the "back" note got to the queue before its leave note: it waits (up to a minute) and then undoes it
        const st5 = mk(), io5 = fakeDb({ rooms: { BACK: { games: { [T0]: rec }, names: { a: 'Ann', b: 'Bob' } }, '~elo': { q: { [K_B]: bk(T0 + 20000) } } } });
        await E.run(st5, io5, T0 + 21000);
        const held = !!(io5.db.rooms['~elo'].q || {})[K_B];
        io5.db.rooms['~elo'].q[K_L] = lv(T0 + 1000); await E.run(st5, io5, T0 + 24000);
        check('E20 a "back" that arrives before its leave waits for it, then undoes it', held && st5.games[K_L] && st5.games[K_L].reversed && st5.players.pa.r === 1000 && st5.players.pb.r === 1000 &&
              Object.keys(io5.db.rooms['~elo'].q || {}).length === 0, JSON.stringify({ held, L: st5.games[K_L] && st5.games[K_L].reversed, r: [st5.players.pa.r, st5.players.pb.r], q: Object.keys(io5.db.rooms['~elo'].q || {}) }));
    }
    // M1-M5 (V530, ACCOUNTS — the owner: "so they can unify their devices"): a device that logs in to an account; its own
    // record joins the account's once both sides asked
    {
        const DEV = 'devDEVICE0000000000000000001', ACC = 'accACCOUNT000000000000000001', PEER = 'peerPEER0000000000000000001';
        const f8 = DEV.slice(0, 8), a8 = ACC.slice(0, 8), q8 = PEER.slice(0, 8);
        const mkSt = () => ({ players: { [DEV]: { r: 1100, n: 10, w: 7, l: 3, d: 0, nm: 'Dev', fd: { '2026-10-08': 2 }, peak: 1120, last: T0 - 5000 },
                                         [ACC]: { r: 1000, n: 30, w: 15, l: 15, d: 0, nm: 'Acc', fd: { '2026-10-08': 1 }, peak: 1050, last: T0 - 9000 } }, games: {}, manual: [] });
        const note = { c: '~acct', s: T0, t: T0, merge: { from: DEV, into: ACC } };
        // M1
        const st = mkSt(), io = fakeDb({ acct: { [DEV]: { into: ACC }, [ACC]: { from: { [DEV]: T0 } } }, rooms: { '~elo': { q: { ['merge_' + DEV]: note } } } });
        const o1 = await E.run(st, io, T0 + 1000);
        await E.publish(st, io, o1.changed, o1.done, T0 + 1000);
        const A1 = st.players[ACC], want = (1000 * 30 + 1100 * 10) / 40;
        const pub = io.db.embedcode && io.db.embedcode.elo && io.db.embedcode.elo.r;
        check('M1 both asked: merged — 40 games, 22-18, the rating the games-weighted average (' + want + '), the higher peak, days added up; the device\'s record gone, the account\'s published',
              A1 && !st.players[DEV] && A1.n === 40 && A1.w === 22 && A1.l === 18 && Math.abs(A1.r - want) < 1e-9 && A1.peak === 1120 && A1.fd['2026-10-08'] === 3 && A1.nm === 'Acc' &&
              st.alias[DEV] === ACC && pub && pub[ACC] && pub[ACC].n === 40 && !(DEV in pub) && Object.keys(io.db.rooms['~elo'].q || {}).length === 0,
              JSON.stringify({ A1, alias: st.alias, pub: pub && Object.keys(pub) }));
        // M2
        const stB = mkSt(), ioB = fakeDb({ acct: { [DEV]: { into: ACC } }, rooms: { '~elo': { q: { ['merge_' + DEV]: note } } } });
        await E.run(stB, ioB, T0 + 1000);
        const stC = mkSt(), ioC = fakeDb({ acct: { [ACC]: { from: { [DEV]: T0 } } }, rooms: { '~elo': { q: { ['merge_' + DEV]: note } } } });
        await E.run(stC, ioC, T0 + 1000);
        const stD = mkSt(), ioD = fakeDb({ acct: { [DEV]: { into: PEER }, [ACC]: { from: { [DEV]: T0 } } }, rooms: { '~elo': { q: { ['merge_' + DEV]: note } } } });
        await E.run(stD, ioD, T0 + 1000);
        check('M2 only one side asked (or the device asked for a different account): refused — nothing changes',
              stB.players[DEV] && stB.players[ACC].n === 30 && stC.players[DEV] && stC.players[ACC].n === 30 && stD.players[DEV] && stD.players[ACC].n === 30 && !stB.alias && !stC.alias && !stD.alias,
              JSON.stringify([stB.players[ACC].n, stC.players[ACC].n, stD.players[ACC].n]));
        // M3: a game the device finished before it logged in, rated after the merge: the account's
        const g3 = game('MRG3', T0 + 2000, { ua: DEV, ub: PEER });
        const io3 = fakeDb({ rooms: { MRG3: room([g3], { a: 'Dev', b: 'Peer' }), '~elo': { q: queue([['MRG3', T0 + 2000, T0 + 600000]]) } } });
        await E.run(st, io3, T0 + 2000 + 700000);
        check('M3 a game the device finished before logging in, rated after the merge, counts for the account (no ghost record)',
              !st.players[DEV] && st.players[ACC].n === 41 && st.players[PEER] && st.players[PEER].n === 1, JSON.stringify({ acc: st.players[ACC].n, dev: !!st.players[DEV] }));
        // M4: a throwaway device's leaves can't be washed out
        const st4 = { players: { [DEV]: { r: 980, n: 0, w: 0, l: 0, d: 0, nm: 'Dev', fd: {}, peak: 1000, left: 1 }, [ACC]: { r: 1050, n: 10, w: 6, l: 4, d: 0, nm: 'Acc', fd: {}, peak: 1060 } },
                      games: { LV_1_left_a: { gid: 'LV_1_left_a', leave: true, applied: true, reversed: false, uid: DEV, ouid: PEER, penalty: 20, at: T0 } }, manual: [] };
        const io4 = fakeDb({ acct: { [DEV]: { into: ACC }, [ACC]: { from: { [DEV]: T0 } } }, rooms: { '~elo': { q: { ['merge_' + DEV]: note } } } });
        await E.run(st4, io4, T0 + 1000);
        const lt4 = E.leaveTotals(st4)[ACC];
        check('M4 a device with only a leave (980, no games) merged into 1050: 1030 — the leave still costs its 20 points, and it is now the account\'s',
              Math.abs(st4.players[ACC].r - 1030) < 1e-9 && st4.players[ACC].left === 1 && lt4 && lt4.pts === 20 && st4.games.LV_1_left_a.uid === ACC, JSON.stringify({ r: st4.players[ACC].r, lt4 }));
        // M5: the messages and blocks
        const tid = (x, y) => (x < y ? [x, y] : [y, x]);
        const [t1, t2] = tid(f8, q8), dmT = {}; dmT[t1] = { [t2]: { m1: { f: f8, x: 'hi from the device', at: T0 }, m2: { f: q8, x: 'hi back', at: T0 + 1 } } };
        const io5 = fakeDb({ acct: { [DEV]: { into: ACC }, [ACC]: { from: { [DEV]: T0 } } }, rooms: { '~elo': { q: { ['merge_' + DEV]: note } } },
                             dm: { t: dmT, i: { [f8]: { [q8]: { n: 'Peer', x: 'hi back', at: T0 + 1, f: q8 } }, [q8]: { [f8]: { n: 'Dev', x: 'hi back', at: T0 + 1, f: q8 } } },
                                   b: { [f8]: { zzzzzzzz: true }, [q8]: { [f8]: true } } } });
        await E.run(mkSt(), io5, T0 + 1000);
        const [n1, n2] = tid(a8, q8), th = ((io5.db.dm.t[n1] || {})[n2]) || {};
        check('M5 messages: the conversation is now the account\'s (each message as it was, the sender id moved); both inbox lines point at the account; blocks follow',
              th.m1 && th.m1.f === a8 && th.m1.x === 'hi from the device' && th.m2 && th.m2.f === q8 && io5.db.dm.i[a8] && io5.db.dm.i[a8][q8] && io5.db.dm.i[q8][a8] && !io5.db.dm.i[q8][f8] &&
              io5.db.dm.b[a8] && io5.db.dm.b[a8].zzzzzzzz && io5.db.dm.b[q8][a8] === true, JSON.stringify({ th, i: io5.db.dm.i, b: io5.db.dm.b }));
    }
    // X1-X6 (V536, the owner: "if 2 ranks are adjacent then double the points possible to be gained or lost to raise stakes"; V537: "triple if adjacent ranks")
    {
        const U = { one: 'p1aaaaaaaaaaaaaaaaaaaaaaaaaa', two: 'p2bbbbbbbbbbbbbbbbbbbbbbbbbb', three: 'p3cccccccccccccccccccccccccc', nu: 'p4dddddddddddddddddddddddddd' };
        const mk = () => ({ players: {
            [U.one]: { r: 1200, n: 20, w: 15, l: 5, d: 0, nm: 'One', fd: {}, peak: 1200 }, [U.two]: { r: 1150, n: 20, w: 12, l: 8, d: 0, nm: 'Two', fd: {}, peak: 1150 },
            [U.three]: { r: 1100, n: 20, w: 10, l: 10, d: 0, nm: 'Three', fd: {}, peak: 1100 }, [U.nu]: { r: 1000, n: 2, w: 1, l: 1, d: 0, nm: 'New', fd: {}, peak: 1000 } }, games: {}, manual: [] });
        const one = (st, ua, ub, start) => E.rate(st, { gid: 'STK_' + start, code: 'STK', start, rec: game('STK', start, { ua, ub, sa: 21, sb: 14 }), names: { a: 'A', b: 'B' }, lobby: false, now: start + 700000 });
        const normal = (ra, rb, n) => E.K(n) * (1 - E.expected(ra, rb));   // a win's points, the ratings before
        // X1: #2 vs #3 (neighbours) — triple
        const s1 = mk(); const r1 = one(s1, U.two, U.three, T0);
        check('X1 #2 vs #3, neighbours on the board: the win counts triple (and the loss) — the record says so, with the ranks',
              r1.ranked && r1.sx === 3 && r1.ranks && r1.ranks.a === 2 && r1.ranks.b === 3 && Math.abs((s1.players[U.two].r - 1150) - 3 * normal(1150, 1100, 20)) < 1e-9 &&
              Math.abs((1100 - s1.players[U.three].r) - 3 * normal(1150, 1100, 20)) < 1e-9, JSON.stringify({ sx: r1.sx, ranks: r1.ranks, a: r1.a, b: r1.b }));
        // X2: #1 vs #3 — not neighbours
        const s2 = mk(); const r2 = one(s2, U.one, U.three, T0);
        check('X2 #1 vs #3 (not neighbours): normal points', r2.ranked && !r2.sx && Math.abs((s2.players[U.one].r - 1200) - normal(1200, 1100, 20)) < 1e-9, JSON.stringify({ sx: r2.sx, a: r2.a }));
        // X3: the board as it stood when the game began
        const s3 = mk(); E.noteBoard(s3, [{ u: 'p1aaaaaa' }, { u: 'p2bbbbbb' }, { u: 'p3cccccc' }], T0); E.noteBoard(s3, [{ u: 'p2bbbbbb' }, { u: 'p3cccccc' }, { u: 'p1aaaaaa' }], T0 + 60000);
        const early = E.stakes(s3, U.one, U.two, T0 + 30000), late = E.stakes(s3, U.one, U.two, T0 + 90000);
        check('X3 judged by the board when the game began: neighbours at its start (#1 vs #2) play for triple though the board changed during it; a game begun after the change does not (#3 vs #1)',
              early.nb && early.ra === 1 && early.rb === 2 && !late.nb && late.ra === 3 && late.rb === 1, JSON.stringify({ early, late }));
        // X4: a leave between neighbours costs and pays triple; undone exactly
        const s4 = mk();
        const L4 = E.leavePenalty(s4, { gid: 'STK_' + T0 + '_left_a', code: 'STK', start: T0, rec: { mode: 'same', uids: { a: U.two, b: U.three }, fin: {} }, names: { a: 'Two', b: 'Three' },
                                        left: { role: 'a', by: 'b', q: 3, clk: 100, qmins: 3, su: 6, so: 14, at: T0 + 5000 }, now: T0 + 6000 });
        s4.games[L4.gid] = L4;
        const mid4 = [s4.players[U.two].r, s4.players[U.three].r];
        E.undoLeave(s4, L4.gid, T0 + 9000);
        check('X4 a leave between neighbours: the leaver pays triple (24, not 8) and the stayer gets triple a win\'s points; a refresh\'s undo restores both exactly',
              L4.applied && L4.sx === 3 && L4.penalty === 24 && Math.abs((mid4[1] - 1100) - 3 * E.K(20) * (1 - E.expected(1100, 1150))) < 1e-9 && mid4[0] === 1150 - 24 &&
              s4.players[U.two].r === 1150 && Math.abs(s4.players[U.three].r - 1100) < 1e-9, JSON.stringify({ L4: [L4.penalty, L4.gain, L4.sx], mid4, end: [s4.players[U.two].r, s4.players[U.three].r] }));
        // X5: not on the board (fewer than 5 games) — never double
        const s5 = mk(); const r5 = one(s5, U.nu, U.three, T0);
        check('X5 a player not on the board (2 games) vs #3: normal points', r5.ranked && !r5.sx, JSON.stringify({ sx: r5.sx }));
        // X6: the remembered boards: one per change, the old ones dropped (the last one before the window kept)
        const s6 = mk(); E.noteBoard(s6, [{ u: 'a' }, { u: 'b' }], T0); E.noteBoard(s6, [{ u: 'a' }, { u: 'b' }], T0 + 1000); E.noteBoard(s6, [{ u: 'b' }, { u: 'a' }], T0 + 2000);
        E.noteBoard(s6, [{ u: 'a' }, { u: 'b' }], T0 + 13 * 3600e3); E.noteBoard(s6, [{ u: 'b' }, { u: 'a' }], T0 + 26 * 3600e3);
        check('X6 the board is remembered once per change, and boards older than 12 hours go (the last one before the window stays)',
              s6.rankSnaps.length === 2 && s6.rankSnaps[0].at === T0 + 13 * 3600e3 && s6.rankSnaps[1].at === T0 + 26 * 3600e3, JSON.stringify(s6.rankSnaps.map(x => x.at - T0)));
    }
    // E13 (V521): points lost to leaving — the board and each player's record carry them (leaves + the owner's penalties)
    {
        const st = { players: {}, games: {}, manual: [] };
        for (let i = 0; i < 6; i++) st.players['u' + i] = { r: 1000 + i, n: 6, w: 3, l: 3, d: 0, nm: 'P' + i, fd: {}, peak: 1000 };
        st.games.X1_1_left_a = { leave: true, applied: true, uid: 'u1', penalty: 17.5 };
        st.games.X2_1_left_b = { leave: true, applied: true, uid: 'u1', penalty: 3 };
        for (let k = 0; k < 11; k++) st.games['Y' + k + '_1_left_a'] = { leave: true, applied: true, uid: 'u1', penalty: 0 };   // V521b: 13 leaves, so shown
        for (let k = 0; k < 12; k++) st.games['W' + k + '_1_left_a'] = { leave: true, applied: true, uid: 'u3', penalty: 1 };   // 12 leaves: not shown
        st.games.X3_1_left_a = { leave: true, applied: true, reversed: true, uid: 'u1', penalty: 40 };   // undone: not counted
        st.games.X4_1_left_a = { leave: true, applied: true, exempt: true, uid: 'u2', penalty: 0 };      // exempt: not counted
        st.manual.push({ uid: 'u1', d: -254, at: 1, why: 'leaving' });
        const b = E.board(st), row = b.find(p => p.u === 'u1'), clean = b.find(p => p.u === 'u2'), mine = E.pubPlayer(st, 'u1', Date.now());
        const twelve = b.find(p => p.u === 'u3');
        check('E13 points lost to leaving: 17.5 + 3 + the owner\'s 254 = 275 over 13 leaves, shown (more than 12 left); 12 leaves not shown; undone and exempt not counted',
              row && row.lp === 275 && row.lc === 13 && clean && clean.lp == null && twelve && twelve.lp == null && mine.lp === 275, JSON.stringify({ row, twelve, clean, mine: { lp: mine.lp, lc: mine.lc } }));
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
