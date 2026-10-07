// e2e/elo-math.js — V500 (the owner: "an elo system where everybody is a 1000 and at first points fluctuate a lot but as
// account gets more games it flattens out, like chess elo ... you can't have more than 3 ranked games in a non lobby set up
// per day ... a leaderboard with names censored if slurs"). tools/elo.js on a fake database (no browser, no Firebase):
//   E1  everyone starts at 1000; the first game moves both by 32 (K 64 at the first game, 16 + 48·e^(-n/10) after)
//   E2  it flattens: after 30 ranked games a win against an equal player moves about 9; an upset moves more than a favourite's win
//   E3  3 ranked CODE games a day: the 4th game between two friends is unranked (both players' counts); a FIND A PLAYER game
//       (the room's first game after its lfg match) still counts that day; a rematch in a lobby room is a code game
//   E4  unranked with the reason: different difficulties, one device on both sides, the phones disagree, one final only
//       (after 10 minutes — before that it waits); a final under 20 s old waits for the other phone
//   E5  the run: the queue notes are deleted when done; a second phone's note for a game already rated is dropped
//   E6  the publish: r/{uid} (rating, games, today's code games), g/{game} (the change), top (5+ games, names censored)
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
    // E3: four code games between two friends on one day, then a FIND A PLAYER game, then a rematch in that lobby room
    {
        const st = { players: {}, games: {} };
        const g = [0, 1, 2, 3].map(i => game('FRND', T0 + i * 900000));
        const lob = game('LOBY', T0 + 4 * 900000), rem = game('LOBY', T0 + 5 * 900000);
        const io = fakeDb({ rooms: { FRND: room(g), LOBY: room([lob, rem], null, T0 + 4 * 900000 - 60000),
                                     '~elo': { q: queue(g.map(x => ['FRND', x.ts, x.ts + 600000]).concat([['LOBY', lob.ts, lob.ts + 600000], ['LOBY', rem.ts, rem.ts + 600000]])) } } });
        const out = await E.run(st, io, T0 + 6 * 900000 + 700000);
        const by = Object.fromEntries(out.done.map(d => [d.gid, d]));
        const r = g.map(x => by['FRND_' + x.ts].ranked), lr = by['LOBY_' + lob.ts], rr = by['LOBY_' + rem.ts];
        check('E3 3 ranked code games a day: the 4th is unranked; a FIND A PLAYER game still counts; its rematch is a code game (unranked too)',
              r.join() === 'true,true,true,false' && /3 ranked code games/.test(by['FRND_' + g[3].ts].why) && lr.ranked && lr.lobby && !rr.ranked && !rr.lobby,
              JSON.stringify({ code: r, lobby: { ranked: lr.ranked, lobby: lr.lobby }, rematch: { ranked: rr.ranked, why: rr.why } }));
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
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
