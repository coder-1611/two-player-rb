// tools/highlights/features.js — V458: what happened in a recorded play, measured from its track (index.html recTrack)
// with the engine's own rules: tackles broken, defenders who dove and missed or were left behind, stiff arms, hurdles,
// dives, yards after contact, a pass's air yards and hang time, and the clock and score around it — plus the play's story
// in words and the moments worth a picture. The daily highlights short-list on these numbers; the judge decides.
//
// The engine (retrobowl.js): the line of scrimmage is at x = 1300 + yardLine × 20 × direction — 20 px a yard, midfield
// at 1300, goal lines at 300 and 2300. A player's action (_g21, set by _Z01): 2 running, 3 in a tackle (engaged), 4 going
// down, 5 diving, 8 hurdling (spends one of his jumps, _q51), 9 stiff-arming (spends one of his stiff arms, _p51; the
// defenders on him go down), 11 throwing. A tackle on the carrier lands when his tackle count (__51, fed by every
// defender on him) passes his strength; an engagement that ends any other way is a broken tackle.
// The ball (_kp, set by the engine's ball object): 0 before the snap, 1/2 the QB has it, 19 a hand-off, 3 in the air,
// 5 caught / carried, 9 intercepted (the return), 13 loose (a fumble), 10 recovered; and how a play ends — 4 tackled,
// 6 TOUCHDOWN (the carrier crossed the goal line), 7 incomplete / out of play, 8 the carrier out of bounds, 11 a sack,
// 14 a field goal good, 15 a kick that failed.
//
// A track frame (v2): [t, ballX, ballY, ballH, ballState, holderIdx, holderStiffArmsLeft, holderJumpsLeft,
// holderTackleCount, [k, x, y, action, engagedIdx, ...]] (v1 had no jumps). Roster: [id, 'O'|'D', position, surname].
'use strict';
const zlib = require('zlib');

const PX = 20, MID = 1300;
const A = { RUN: 2, ENGAGED: 3, DOWN: 4, DIVE: 5, HURDLE: 8, STIFF: 9, THROW: 11 };
const FLIGHT = new Set([3]);
const LIVE = new Set([1, 2, 5, 9, 10, 19]);   // the ball in a player's hands, the play on
const STOPPED = new Set([4, 8, 11]);          // tackled, out of bounds, sacked
const ENDED = new Set([4, 6, 7, 8, 11, 12, 14, 15, 16, 17]);   // every way a play ends (the recording runs on past it)
const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'OL', 6: 'DL', 7: 'LB', 8: 'DB', 9: 'DB' };

function inflate(b64, enc) {
    const buf = Buffer.from(b64, 'base64');
    if (/^deflate-raw/.test(enc || '')) return zlib.inflateRawSync(buf);
    if (/^deflate/.test(enc || '')) return zlib.inflateSync(buf);
    return buf;
}
function decodeTrack(play) {
    if (!play || !play.zt) return null;
    try { return JSON.parse(inflate(play.zt, play.encT).toString('utf8')); } catch (e) { return null; }
}
function parseFrames(tr) {
    const v2 = Number(tr.v) >= 2;
    return tr.frames.map(f => {
        const ps = f[v2 ? 9 : 8] || [], P = new Map();
        for (let i = 0; i + 4 < ps.length; i += 5) P.set(ps[i], { x: ps[i + 1], y: ps[i + 2], a: ps[i + 3], e: ps[i + 4] });
        return { t: f[0], bx: f[1], by: f[2], bh: f[3], bs: f[4], hk: f[5], stiff: f[6], jumps: v2 ? f[7] : null, tcnt: f[v2 ? 8 : 7], P };
    });
}
const mmss = s => Math.floor(s / 60) + ':' + String(Math.max(0, Math.round(s)) % 60).padStart(2, '0');

function features(play) {
    const tr = decodeTrack(play), res = play.res || {};
    const dir = Number(play.dir) < 0 ? -1 : 1;
    const out = {
        id: (play.room || '?') + '-' + (play.role || '?') + '-p' + play.at, room: play.room, role: play.role, at: play.at, ver: play.ver, dif: play.dif || '',
        q: Number(play.q), clk: Number(play.clk), down: Number(play.d), toGo: Number(play.tg), y0: Number(play.y), via: play.via || '',
        endClk: res.clk != null ? Number(res.clk) : null, result: res.type || null, handoff: res.handoff || null, name: res.name || '',
        gain: res.gain != null && isFinite(Number(res.gain)) ? Number(res.gain) : null, durS: play.ms ? Math.round(play.ms / 100) / 10 : null,
        hasTrack: !!tr, events: [], story: ''
    };
    // the clock and the score (the recording phone is the offense: su is its score, so the opponent's)
    const su = Number(res.su), so = Number(res.so);
    if (isFinite(su) && isFinite(so)) { out.scoreAfter = [su, so]; }
    out.lateInHalf = (out.q === 2 || out.q >= 4) && out.clk <= 10;
    if (!tr || !tr.frames || tr.frames.length < 3) { out.td = Number(res.d) === 6 || res.handoff === 'TD'; finish(out); return out; }

    // the play itself: up to the frame it ended (a recording runs on past the whistle, sometimes into the next snap —
    // whose QB would read as the play's last ball carrier)
    const R = tr.roster || [], F0 = parseFrames(tr);
    const endI = F0.findIndex((fr, i) => i > 0 && ENDED.has(fr.bs));
    const F = endI > 0 ? F0.slice(0, endI + 1) : F0;
    const side = k => (R[k] ? R[k][1] : '?');
    const pos = k => (R[k] ? (POS[R[k][2]] || '') : '');
    const nm = k => (R[k] ? (R[k][3] || pos(k) || 'player') : '?');                       // a surname, else his position
    const who = k => (R[k] && R[k][3]) ? ((pos(k) ? pos(k) + ' ' : '') + R[k][3]) : ((/^[AEIOU]/.test(pos(k)) ? 'an ' : 'a ') + (pos(k) || 'player'));
    const fwd = x => (x - MID) * dir / PX;                     // yards from midfield, toward the offense's goal (+50 = its goal line)
    const spot = x => { const s = fwd(x); if (s >= 50) return 'the end zone'; if (s <= -50) return 'their own end zone'; const m = Math.round(50 - Math.abs(s)); return m === 50 ? 'midfield' : (s < 0 ? 'own ' : 'opp ') + m; };
    const live = fr => fr.hk >= 0 && LIVE.has(fr.bs);
    // a kick (a field goal, a punt: the holder kneels — action 14 — and the ball takes the kick states) is no run
    out.kick = out.via === 'kick' || F.some(fr => fr.bs === 14 || fr.bs === 15) || F.some(fr => fr.hk >= 0 && fr.P.get(fr.hk) && fr.P.get(fr.hk).a === 14);
    out.sack = F.some(fr => fr.bs === 11); out.fumble = F.some(fr => fr.bs === 13); out.outOfBounds = F.some(fr => fr.bs === 8);
    const ev = (t, kind, text, k, w) => out.events.push({ t, kind, text, who: k != null ? nm(k) : undefined, w: w || 1 });

    // the snap, and where the play died (the ball dead, or the last live frame)
    const snapX = F[0].bx;
    let lastLive = -1; for (let i = 0; i < F.length; i++) if (live(F[i])) lastLive = i;
    const y0 = isFinite(out.y0) ? out.y0 : fwd(snapX);
    const snapSpot = Math.abs(y0) < 0.5 ? 'midfield' : (y0 < 0 ? 'own ' : 'opp ') + Math.round(50 - Math.abs(y0));
    const toGo = out.toGo < 0.5 ? 'inches' : String(Math.max(1, Math.round(out.toGo)));
    ev(F[0].t, 'snap', 'snap at ' + snapSpot + (out.down >= 1 && out.down <= 4 ? ' (' + ['', '1st', '2nd', '3rd', '4th'][out.down] + ' & ' + toGo + ')' : ''), null, 3);

    // the pass: thrown (the frame before the ball first flies), caught / intercepted / dropped
    const fl = F.findIndex(fr => FLIGHT.has(fr.bs));
    if (fl > 0) {
        const thr = F[fl - 1], thrower = thr.hk;
        let ci = fl; while (ci < F.length && FLIGHT.has(F[ci].bs)) ci++;
        const c = ci < F.length ? F[ci] : null;   // the first frame after the flight: caught (5), picked (9), or incomplete (7)
        const peak = Math.max(...F.slice(fl, ci).map(fr => fr.bh || 0));
        const pass = { from: thrower >= 0 ? nm(thrower) : '', throwAt: spot(thr.bx), hangS: c ? Math.round((c.t - thr.t) / 100) / 10 : null, peak };
        if (c && c.hk >= 0 && c.bs !== 7) {
            pass.airYds = Math.round((fwd(c.bx) - fwd(thr.bx)) * 10) / 10;
            pass.to = nm(c.hk); pass.caught = side(c.hk) === 'O'; pass.intercepted = side(c.hk) === 'D';
            const rc = c.P.get(c.hk) || { x: c.bx, y: c.by };
            pass.contested = [...c.P].filter(([k, p]) => side(k) !== side(c.hk) && Math.hypot(p.x - rc.x, p.y - rc.y) <= 1.5 * PX).length;
            ev(thr.t, 'throw', (pass.from ? pass.from + ' throws' : 'thrown') + ' from ' + pass.throwAt + ' — ' + Math.round(pass.airYds) + ' air yards, ' + pass.hangS + ' s in the air', thrower, pass.airYds >= 30 ? 3 : 2);
            ev(c.t, pass.intercepted ? 'interception' : 'catch', (pass.intercepted ? 'INTERCEPTED by ' + who(c.hk) : 'caught by ' + who(c.hk)) + ' at ' + spot(c.bx) +
               (pass.contested ? ' with ' + pass.contested + (pass.intercepted ? ' receiver' : ' defender') + (pass.contested > 1 ? 's' : '') + ' within 1.5 yd' : ''), c.hk, 3);
        } else {
            const land = F[ci - 1];   // the last frame in the air: where it came down
            pass.airYds = Math.round((fwd(land.bx) - fwd(thr.bx)) * 10) / 10; pass.incomplete = true;
            ev(thr.t, 'throw', (pass.from ? pass.from + ' throws' : 'thrown') + ' from ' + pass.throwAt + ' — ' + Math.round(pass.airYds) + ' yards downfield, incomplete', thrower, 1);
        }
        out.pass = pass;
    }

    // the carriers, in turn; engagements with each; broken tackles, stiff arms, hurdles, dives; defenders beaten
    const engagedNow = (fr, d, h) => { const pd = fr.P.get(d), ph = fr.P.get(h); return !!((pd && pd.e === h) || (ph && ph.e === d)); };
    // a defender held by a blocker within 0.3 s of a moment was not free to make the play
    const blockedNear = (i, d, h) => { for (let j = i; j >= 0 && F[i].t - F[j].t <= 300; j--) { const p = F[j].P.get(d); if (p && p.e >= 0 && p.e !== h) return true; }
                                       for (let j = i + 1; j < F.length && F[j].t - F[i].t <= 300; j++) { const p = F[j].P.get(d); if (p && p.e >= 0 && p.e !== h) return true; } return false; };
    // after a dive at him the carrier kept going: still up a second later, and 1.5 yd or more away from where he was
    const escaped = (h, t) => {
        let p0 = null;
        for (const fr of F) {
            if (fr.t < t) continue; if (fr.t > t + 1000) break;
            const ph = fr.P.get(h); if (!ph || fr.hk !== h || !live(fr)) return false;
            if (ph.a === A.DOWN || ph.a === 6) return false;
            if (!p0) p0 = ph; else if (Math.hypot(ph.x - p0.x, ph.y - p0.y) >= 1.5 * PX) return true;
        }
        return false;
    };
    // the carrier went down (or the ball died) within ms of t with this defender on top of him: the defender made the tackle
    const tackledBy = (h, d, t, ms) => {
        for (const fr of F) {
            if (fr.t < t) continue; if (fr.t > t + ms) break;
            const ph = fr.P.get(h), pd = fr.P.get(d);
            const down = STOPPED.has(fr.bs) || (ph && (ph.a === A.DOWN || ph.a === 6));
            if (down && ph && pd && Math.hypot(pd.x - ph.x, pd.y - ph.y) <= 1.5 * PX) return true;
        }
        return false;
    };
    const eps = new Map();          // `${h}:${d}` -> { h, d, t0, t1, x0, x1, tcnt }
    const broken = [], missed = [], beatenSet = new Set(), stiffs = [], hurdles = [], dives = [];
    const threat = new Map();       // `${h}:${d}` -> closest approach { dist, t, hx }
    const dove = new Map();         // `${h}:${d}` -> t the defender started a dive near him
    let prev = null, firstContact = null, carrierRun = new Map(), topSpeed = 0;
    for (let i = 0; i < F.length; i++) {
        const fr = F[i];
        if (!live(fr)) { prev = null; continue; }
        const h = fr.hk, ph = fr.P.get(h); if (!ph) { prev = null; continue; }
        const foe = side(h) === 'O' ? 'D' : 'O';
        for (const [d, p] of fr.P) {
            if (side(d) !== foe) continue;
            const key = h + ':' + d, dist = Math.hypot(p.x - ph.x, p.y - ph.y);
            if (engagedNow(fr, d, h)) {
                let e = eps.get(key);
                if (!e || e.closed) { e = { h, d, t0: fr.t, x0: ph.x, tcnt: 0 }; eps.set(key, e); if (firstContact === null) firstContact = { h, x: ph.x, t: fr.t }; }
                e.t1 = fr.t; e.x1 = ph.x; e.tcnt = Math.max(e.tcnt, fr.tcnt || 0); e.open = true;
            } else {
                const e = eps.get(key);
                if (e && e.open) { e.open = false; e.closed = true; e.endI = i; }
            }
            // a defender close enough to make the play (not held by a blocker)
            if (dist <= 1.5 * PX && (p.e < 0 || p.e === h) && !blockedNear(i, d, h)) { const t0 = threat.get(key); if (!t0 || dist < t0.dist) threat.set(key, { dist, t: fr.t, hx: ph.x }); }
            if (p.a === A.DIVE && dist <= 4 * PX && !dove.has(key)) { const pp = prev && prev.P.get(d); if (!pp || pp.a !== A.DIVE) dove.set(key, fr.t); }
        }
        // the carrier's own moves (a change of state against the last frame with the same carrier)
        const was = prev && prev.hk === h ? prev.P.get(h) : null;
        if (ph.a === A.STIFF && (!was || was.a !== A.STIFF)) stiffs.push({ h, t: fr.t, x: ph.x });
        else if (prev && prev.hk === h && fr.stiff < prev.stiff && !stiffs.some(s => s.h === h && Math.abs(s.t - fr.t) < 600)) stiffs.push({ h, t: fr.t, x: ph.x });
        if (ph.a === A.HURDLE && (!was || was.a !== A.HURDLE)) hurdles.push({ h, t: fr.t, x: ph.x });
        else if (prev && prev.hk === h && fr.jumps != null && prev.jumps != null && fr.jumps < prev.jumps && !hurdles.some(s => s.h === h && Math.abs(s.t - fr.t) < 600)) hurdles.push({ h, t: fr.t, x: ph.x });
        if (ph.a === A.DIVE && (!was || was.a !== A.DIVE)) dives.push({ h, t: fr.t, x: ph.x });
        if (was && fr.t > prev.t) {
            const sp = Math.hypot(ph.x - was.x, ph.y - was.y) / PX / ((fr.t - prev.t) / 1000);
            if (sp < 25) topSpeed = Math.max(topSpeed, sp);
        }
        const cr = carrierRun.get(h) || { from: ph.x, t0: fr.t, maxY: ph.y, minY: ph.y }; cr.to = ph.x; cr.t1 = fr.t; cr.maxY = Math.max(cr.maxY, ph.y); cr.minY = Math.min(cr.minY, ph.y); carrierRun.set(h, cr);
        prev = fr;
    }
    // an engagement that ended with the carrier still up and the ball still his: a broken tackle
    const downSoon = (e) => {
        const t1 = e.t1;
        for (let i = 0; i < F.length; i++) {
            const fr = F[i]; if (fr.t < t1) continue; if (fr.t > t1 + 450) break;
            if (STOPPED.has(fr.bs)) return true;
            if (fr.hk !== e.h) return true;            // the ball came loose / changed hands
            const ph = fr.P.get(e.h); if (ph && (ph.a === A.DOWN || ph.a === 6)) return true;
        }
        return false;
    };
    for (const e of eps.values()) {
        if (!e.closed) continue;                         // still on him when the play died: the tackle that ended it
        if (downSoon(e)) continue;
        const viaStiff = stiffs.some(s => s.h === e.h && s.t >= e.t0 - 100 && s.t <= e.t1 + 450);
        broken.push({ h: e.h, d: e.d, t: e.t1, x: e.x1, viaStiff, meter: e.tcnt });
    }
    // defenders who had him and never got a hand on him, left behind: missed dives (jukes) and beaten
    const engagedPairs = new Set([...eps.keys()]);
    for (const [key, t] of dove) {
        if (engagedPairs.has(key)) continue;
        const [h, d] = key.split(':').map(Number), cr = carrierRun.get(h);
        if (!cr || tackledBy(h, d, t, 900) || !escaped(h, t)) continue;
        const fr = F.find(f => f.t >= t) || F[F.length - 1], ph = fr.P.get(h);
        missed.push({ h, d, t, x: ph ? ph.x : undefined });
    }
    for (const [key, th] of threat) {
        if (engagedPairs.has(key) || dove.has(key)) continue;
        const [h, d] = key.split(':').map(Number), cr = carrierRun.get(h);
        if (cr && (fwd(cr.to) - fwd(th.hx)) * (side(h) === 'O' ? 1 : -1) >= 3 && !tackledBy(h, d, th.t, 99999)) beatenSet.add(key);
    }
    const beaten = [...beatenSet].map(k => { const [h, d] = k.split(':').map(Number); return { h, d, t: threat.get(k).t, x: threat.get(k).hx }; });
    for (const b of broken) ev(b.t, 'broken', (b.viaStiff ? 'stiff-arms ' + who(b.d) + ' off a tackle' : 'breaks ' + who(b.d) + '\'s tackle') + ' at ' + spot(b.x), b.h, 5);
    for (const s of stiffs) if (!broken.some(b => b.viaStiff && b.h === s.h && Math.abs(b.t - s.t) < 600)) ev(s.t, 'stiff', 'stiff arm at ' + spot(s.x), s.h, 4);
    for (const s of hurdles) ev(s.t, 'hurdle', 'hurdles at ' + spot(s.x), s.h, 4);
    for (const m of missed) ev(m.t, 'missed', who(m.d) + ' dives and misses' + (m.x != null ? ' at ' + spot(m.x) : ''), m.h, 4);
    for (const b of beaten) ev(b.t, 'beaten', 'leaves ' + who(b.d) + ' behind at ' + spot(b.x), b.h, 3);
    for (const d of dives) ev(d.t, 'dive', 'dives at ' + spot(d.x), d.h, 2);

    // the hero (the last carrier) and where the ball ended
    const endFr = lastLive >= 0 ? F[lastLive] : F[F.length - 1];
    const hero = lastLive >= 0 ? F[lastLive].hk : -1;
    const endX = endFr.P.get(endFr.hk) ? endFr.P.get(endFr.hk).x : endFr.bx;
    out.hero = hero >= 0 ? nm(hero) : ''; out.heroPos = hero >= 0 ? pos(hero) : ''; out.heroSide = hero >= 0 ? side(hero) : '';
    const s = hero >= 0 ? fwd(endX) : null;
    const tdFr = F.find(fr => fr.bs === 6);
    out.td = !!tdFr || (s !== null && ((side(hero) === 'O' && s >= 50) || (side(hero) === 'D' && s <= -50)));
    out.defensiveTd = out.td && hero >= 0 && side(hero) === 'D';
    out.pick6 = !!(out.defensiveTd && out.pass && out.pass.intercepted);
    if (out.gain == null) out.gain = (out.pass && out.pass.incomplete) ? 0 : Math.round(fwd(endX) - fwd(snapX));
    out.tacklesBroken = broken.length; out.brokenBy = broken.map(b => nm(b.d));
    out.missedTackles = missed.length; out.missedBy = missed.map(m => nm(m.d));
    out.beaten = beaten.length; out.beatenWho = beaten.map(b => nm(b.d));
    out.stiffArms = stiffs.length; out.hurdles = hurdles.length; out.dives = dives.length;
    out.tackleAttempts = new Set([...eps.values()].map(e => e.d)).size;
    const heroRun = hero >= 0 ? carrierRun.get(hero) : null;
    out.runYds = heroRun ? Math.round((fwd(heroRun.to) - fwd(heroRun.from)) * (side(hero) === 'D' ? -1 : 1) * 10) / 10 : 0;   // a defender runs the other way
    if (out.pass && out.pass.intercepted) { out.returnYds = out.runYds; if (res.gain == null) out.gain = null; }
    out.lateralYds = heroRun ? Math.round((heroRun.maxY - heroRun.minY) / PX * 10) / 10 : 0;
    out.yardsAfterContact = firstContact && firstContact.h === hero ? Math.round((fwd(endX) - fwd(firstContact.x)) * 10) / 10 : 0;
    out.topSpeed = Math.round(topSpeed * 10) / 10;
    out.firstTouchedAt = firstContact && firstContact.h === hero ? spot(firstContact.x) : (out.tackleAttempts ? '' : 'never touched');
    if (out.td) ev(tdFr ? tdFr.t : endFr.t, 'td', (out.pick6 ? 'PICK-SIX — ' : out.defensiveTd ? 'DEFENSIVE TOUCHDOWN — ' : 'TOUCHDOWN — ') + who(hero) + ' scores', hero, 5);
    else if (out.sack) ev(endFr.t, 'end', who(hero) + ' sacked at ' + spot(endX), hero, 2);
    else if (out.outOfBounds) ev(endFr.t, 'end', who(hero) + ' out of bounds at ' + spot(endX), hero, 2);
    else if (out.pass && out.pass.incomplete) { /* the throw's own line says it */ }
    else if (hero >= 0 && side(hero) === 'D') ev(endFr.t, 'end', who(hero) + ' brought down at ' + spot(endX) + (out.returnYds ? ' after a ' + Math.round(out.returnYds) + '-yard return' : ''), hero, 2);
    else if (hero >= 0) ev(endFr.t, 'end', who(hero) + ' down at ' + spot(endX), hero, 2);
    if (out.fumble) { const fr = F.find(f => f.bs === 13); ev(fr.t, 'fumble', 'FUMBLE at ' + spot(fr.bx), null, 4); }
    out.events.sort((a, b) => a.t - b.t);
    finish(out);
    return out;
}

function finish(out) {
    // the score before the play (a touchdown is 6 for the offense, a pick-six 6 for the defense)
    if (out.scoreAfter) {
        const [su, so] = out.scoreAfter;
        const before = out.td ? (out.defensiveTd ? [su, so - 6] : [su - 6, so]) : [su, so];
        out.scoreBefore = before;
        const m0 = before[0] - before[1], m1 = su - so;
        out.leadChange = out.td && ((!out.defensiveTd && m0 <= 0 && m1 > 0) || (out.defensiveTd && m0 >= 0 && m1 < 0));
        out.tyingOrGoAhead = out.td && Math.abs(m0) <= 6;
    }
    out.score = scoreOf(out);
    out.story = story(out);
}

// the short-list score: elusiveness, power and drama first. A long gain alone counts little (the owner: "I don't just
// want normal 50 yard touchdowns, the plays need to be incredible like juking a bunch of players, stiff arms breaking
// tackles, last moment hail marys")
function scoreOf(f) {
    let s = 0;
    s += 5 * (f.tacklesBroken || 0) + 4 * (f.stiffArms || 0) + 4 * (f.hurdles || 0) + 3.5 * (f.missedTackles || 0) + 2.5 * (f.beaten || 0);
    s += Math.max(0, f.yardsAfterContact || 0) / 4 + (f.dives && f.td ? 2 : 0);
    s += (f.td ? 2 : 0) + Math.min(100, Math.max(0, f.gain || 0)) / 20;
    if (f.pass) {
        const a = f.pass.airYds || 0;
        if (f.pass.caught || f.pass.intercepted) s += a >= 50 ? 6 : a >= 40 ? 4.5 : a >= 30 ? 2.5 : a >= 20 ? 1 : 0;
        if (f.pass.caught) s += 1.5 * Math.min(2, f.pass.contested || 0) + ((f.pass.hangS || 0) >= 2.5 ? 1 : 0);
    }
    // V480 (the owner: "don't choose interceptions unless they are EXTREMELY impressive"): no bonus for a pick itself — a
    // return makes the list by its own moves (beaten, broken tackles) like any carry
    if (f.lateInHalf) s += f.td ? 10 : ((f.gain || 0) >= 20 ? 3 : 0);
    if (f.leadChange && f.q >= 4) s += 5;
    s += ({ max: 8, ultramax: 8, hard: 5.3, medium: 2, easy: 0.7 }[String(f.dif || '').toLowerCase()] || 2);   // V480: the owner's 12/8/3/1 (scaled), unknown as MED
    return Math.round(s * 10) / 10;
}

function story(f) {
    const parts = [];
    const ctx = 'Q' + (f.q >= 5 ? 'OT' : f.q) + ' ' + mmss(f.clk || 0) + (f.scoreBefore ? ', ' + (f.scoreBefore[0] > f.scoreBefore[1] ? 'up ' : f.scoreBefore[0] < f.scoreBefore[1] ? 'down ' : 'tied ') + f.scoreBefore[0] + '-' + f.scoreBefore[1] : '');
    parts.push(ctx + '.');
    for (const e of f.events) if (e.kind !== 'snap' || true) parts.push('[' + (e.t / 1000).toFixed(1) + ' s] ' + e.text + '.');
    const tail = [];
    if (f.gain != null) tail.push((f.gain >= 0 ? '+' : '') + Math.round(f.gain) + ' yd');
    if (f.td) tail.push(f.pick6 ? 'pick-six' : 'touchdown');
    if (f.leadChange) tail.push('takes the lead');
    if (f.endClk === 0) tail.push('as time expires');
    if (tail.length) parts.push('Result: ' + tail.join(', ') + '.');
    return parts.join(' ');
}

// a one-line title for files and lists
function title(f) {
    const intc = f.pass && f.pass.intercepted;
    const bits = [f.hero || f.name || '', intc ? 'interception' : '', f.td ? (f.pick6 ? 'pick-six' : 'TD') : '', intc ? (f.returnYds ? Math.round(f.returnYds) + ' yd return' : '') : (f.gain != null ? Math.round(f.gain) + ' yd' : '')];
    const extra = [];
    if (f.tacklesBroken) extra.push(f.tacklesBroken + ' broken tackle' + (f.tacklesBroken > 1 ? 's' : ''));
    if (f.missedTackles + f.beaten) extra.push((f.missedTackles + f.beaten) + ' beaten');
    if (f.stiffArms) extra.push(f.stiffArms + ' stiff arm' + (f.stiffArms > 1 ? 's' : ''));
    if (f.hurdles) extra.push('hurdle');
    if (f.pass && f.pass.airYds >= 35 && (f.pass.caught || f.pass.intercepted)) extra.push(Math.round(f.pass.airYds) + ' yd in the air');
    return bits.filter(Boolean).join(' ') + (extra.length ? ' (' + extra.join(', ') + ')' : '');
}

// the moments worth a picture, at most n, in time order: the snap, the throw and catch, every special event, the end
function keyMoments(f, n) {
    n = n || 9;
    const ev = f.events.slice().sort((a, b) => b.w - a.w || a.t - b.t);
    const pick = [], near = t => pick.some(p => Math.abs(p.t - t) < 250);
    for (const e of ev) { if (pick.length >= n) break; if (!near(e.t)) pick.push({ t: e.t, label: e.text }); }
    // fill the gaps with the moments between, evenly — up to a second and a half past the whistle
    const last = f.events.filter(e => e.kind === 'end' || e.kind === 'td').map(e => e.t)[0];
    const end = last != null ? Math.min(last + 1500, f.durS ? f.durS * 1000 : 1e9) : (f.durS ? f.durS * 1000 : (pick.length ? Math.max(...pick.map(p => p.t)) : 0));
    for (let k = 1; pick.length < n && k < 40; k++) {
        const ts = pick.map(p => p.t).concat([0, end]).sort((a, b) => a - b);
        let gi = 0, gw = -1; for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > gw) { gw = ts[i] - ts[i - 1]; gi = i; }
        if (gw < 400) break;
        const t = Math.round((ts[gi] + ts[gi - 1]) / 2); if (!near(t)) pick.push({ t, label: '' }); else break;
    }
    return pick.sort((a, b) => a.t - b.t);
}

// V481 (the owner's points formula, 5 Oct): "max is 20 hard 8 med 2 easy 0. touchdown 20, first down 5, 4th down
// conversion 10 + num of yards ... (4th down conversion also gets +5 and touchdown gets both), yardage is worth half a
// point, ... the clutch things are 20 seconds, overtime plays get 1.2x boost and spectacularness is a raw score out of 16
// ... + 2 times (stiff arms and jukes)". The numeric parts; the judge adds its raw spectacular score (0-16); an overtime
// play's total is x1.2.
const DIF_PTS = { max: 45, ultramax: 45, hard: 8, medium: 2, easy: 0 };   // V482: 40; V484 (the owner: "from tomorrow make offense max +55"): 55; V499 ("make max worth 45 points"): 45
function points(f) {
    const offense = f.heroSide !== 'D', kick = !!f.kick || /kick|punt|fg/i.test(String(f.via || ''));
    // V483 (the owner: "in defensive plays no difficulty boost, maybe just +10"): a pick or a fumble return gets a flat 10
    const dk = String(f.dif || '').toLowerCase(), difficulty = !offense ? 10 : (DIF_PTS[dk] != null ? DIF_PTS[dk] : 2);   // not recorded: as MED
    const conv = offense && !kick && f.down >= 1 && f.down <= 4 && (f.td || (f.gain != null && f.toGo > 0 && f.gain >= f.toGo));
    const td = f.td ? 20 : 0, firstDown = conv ? 5 : 0, fourth = conv && f.down === 4 ? 10 + Math.round(f.toGo) : 0;
    const yards = Math.round(Math.max(0, offense ? (f.gain || 0) : (f.returnYds || 0)) / 3 * 10) / 10;   // V484 (the owner: "reduce yardage weight to 1/3"): 1/3 a yard
    let situation = 0;
    const late = f.endClk != null ? f.endClk : f.clk;
    if (f.td && f.scoreBefore && f.scoreAfter) {
        const b = f.scoreBefore, a = f.scoreAfter;
        const m0 = offense ? b[0] - b[1] : b[1] - b[0], m1 = offense ? a[0] - a[1] : a[1] - a[0];   // the scoring side's margin
        const goAhead = m0 <= 0 && m1 > 0, ties = m0 < 0 && m1 === 0;
        if (f.q >= 5 && goAhead) situation += 20;                       // overtime: any go-ahead score wins it
        else if (f.q === 4 && late <= 20 && goAhead) situation += 20;   // a game-winner in the last 20 s
        else if (f.q === 4 && late <= 20 && ties) situation += 12;      // a game-tyer in the last 20 s
        else if (f.q === 4 && (goAhead || ties)) situation += 6;        // go-ahead / tying earlier in the 4th
        if ((f.q === 2 || f.q >= 4) && late === 0) situation += 5;      // scored as the clock hit 0:00
    }
    if (f.scoreBefore && Math.abs(f.scoreBefore[0] - f.scoreBefore[1]) >= 21) situation -= 5;   // a blowout
    const jukes = (f.missedTackles || 0) + (f.beaten || 0);           // dove and missed + left behind (never both)
    const moves = 4 * ((f.stiffArms || 0) + jukes);                  // V499 (the owner: "increase value of total jukes and stiff arms"): 4 each (was 2)
    const base = difficulty + td + firstDown + fourth + yards + situation + moves;
    return { difficulty, td, firstDown, fourth, yards, situation, stiffArms: f.stiffArms || 0, jukes, moves, base: Math.round(base * 10) / 10, ot: f.q >= 5 };
}
const pointsTotal = (p, raw) => Math.round((p.base + Math.max(0, Math.min(16, Number(raw) || 0))) * (p.ot ? 1.2 : 1) * 10) / 10;

module.exports = { decodeTrack, features, scoreOf, story, title, keyMoments, inflate, PX, MID, points, pointsTotal };
