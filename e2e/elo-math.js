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
        const st = { players: { x: { r: 1000, n: 30, w: 15, l: 15, d: 0, nm: 'X', fd: {}, peak: 1000 }, y: { r: 1000, n: 30, w: 15, l: 15, d: 0, nm: 'Y', fd: {}, peak: 1000 } }, games: {} };
        const r = E.rate(st, { gid: 'B_1', code: 'BBBB', start: T0, rec: game('BBBB', T0, { ua: 'x', ub: 'y' }), lobby: true, now: T0 });
        const st2 = { players: { x: { r: 1200, n: 30, w: 0, l: 0, d: 0, fd: {} }, y: { r: 1000, n: 30, w: 0, l: 0, d: 0, fd: {} } }, games: {} };
        const fav = E.rate(st2, { gid: 'C_1', code: 'CCCC', start: T0, rec: game('CCCC', T0, { ua: 'x', ub: 'y' }), lobby: true, now: T0 });
        const st3 = { players: { x: { r: 1200, n: 30, w: 0, l: 0, d: 0, fd: {} }, y: { r: 1000, n: 30, w: 0, l: 0, d: 0, fd: {} } }, games: {} };
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
                   !r2.applied && /soham/.test(r2.why) && !r3.applied && /tied/.test(r3.why) && !r4.applied && /finished/.test(r4.why) &&
                   !r5.applied && /not a ranked/.test(r5.why) && r6.applied && r6.minutes === 2 && r6.penalty === 3.5;
        check('E7 the leaving penalty: 0.25 x 5 min x 14 = 17.5 off; soham names exempt; none when tied, finished, unranked; overtime uses its clock', ok,
              JSON.stringify({ r1: [r1.minutes, r1.diff, r1.penalty, s1.players.lv.r], r2: r2.why, r3: r3.why, r4: r4.why, r5: r5.why, r6: [r6.minutes, r6.penalty] }));
        // E8: the run — a note under 10 minutes old waits; at 10 minutes the penalty lands and the note goes
        const st = base(), note = { c: 'LEAV', s: T0, t: T0 + 600000, left: L() };
        const io = fakeDb({ rooms: { LEAV: { games: { [T0]: rec() }, names: { a: 'Kai', b: 'Lee' } }, '~elo': { q: { ['LEAV_' + T0 + '_left']: note } } } });
        await E.run(st, io, T0 + 600000 + 5 * 60000);
        const waited = !!io.db.rooms['~elo'].q && Object.keys(io.db.rooms['~elo'].q).length === 1 && st.players.lv.r === 1000;
        const out = await E.run(st, io, T0 + 600000 + 10 * 60000 + 1000);
        const landed = Math.abs(st.players.lv.r - 982.5) < 1e-9 && out.changed.has('lv') && Object.keys(io.db.rooms['~elo'].q || {}).length === 0 && st.games['LEAV_' + T0 + '_left'].applied;
        check('E8 the job waits 10 minutes (they may come back), then takes the points and drops the note', waited && landed, JSON.stringify({ waited, r: st.players.lv.r, left: Object.keys(io.db.rooms['~elo'].q || {}) }));
    }
    // E9 (V509): the late leave — under a minute left, a forfeit: 3 x what a loss to that player costs, to the player who stayed
    {
        const base = () => ({ players: { lv: { r: 1000, n: 10, w: 5, l: 5, d: 0, nm: 'Kai', fd: {}, peak: 1000 }, sty: { r: 1100, n: 40, w: 20, l: 20, d: 0, nm: 'Lee', fd: {}, peak: 1100 } }, games: {} });
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
        const want = Math.round(3 * loss * 100) / 100;
        const ok = r1.applied && r1.rule === 'late' && r1.penalty === want && Math.abs(s1.players.lv.r - (1000 - want)) < 1e-9 && Math.abs(s1.players.sty.r - (1100 + want)) < 1e-9 &&
                   r1.ouid === 'sty' && r1.or1 === Math.round(1100 + want) && s1.players.lv.n === 10 && s1.players.sty.w === 20 &&
                   r2.applied && r2.penalty === want && r3.applied && r3.rule !== 'late' && r3.penalty === 5.5 && Math.abs(s3.players.sty.r - 1100) < 1e-9 &&
                   !r4.applied && /soham/.test(r4.why) && !r5.applied && /recorded the final/.test(r5.why) && r6.applied && r6.rule === 'late';
        check('E9 under a minute left: the leaver loses 3 x a loss (' + want + ') and the stayer gains it, whatever the score; 1:00 left is the old formula; exempt / own final: nothing',
              ok, JSON.stringify({ want, r1: [r1.rule, r1.penalty, s1.players.lv.r, s1.players.sty.r], r2: r2.penalty, r3: [r3.rule, r3.penalty], r4: r4.why, r5: r5.why, r6: r6.rule }));
        // the run: the stayer's new rating is published too
        const st = base(), note = { c: 'LATE', s: T0, t: T0, left: L() };
        const io = fakeDb({ rooms: { LATE: { games: { [T0]: rec() }, names: { a: 'Kai', b: 'Lee' } }, '~elo': { q: { ['LATE_' + T0 + '_left']: note } } } });
        const out = await E.run(st, io, T0 + 10 * 60000 + 1000);
        check('E10 the job publishes both: the leaver and the player who stayed', out.changed.has('lv') && out.changed.has('sty') && st.games['LATE_' + T0 + '_left'].rule === 'late',
              JSON.stringify([...out.changed]));
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
