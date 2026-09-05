// e2e/qb-bot.js — a QB that plays Retro Bowl like a person: trusted mouse input
// only (press on the QB, pull past the deadzone = the snap, hold and aim while
// the routes develop, release), reading the field the way eyes would and
// predicting where the receiver and the ball will meet.
//
// What the engine does (measured, e2e/qb-probe.js; see retrobowl.js):
//   press within 40 room px of the QB -> controller kp 1 (deadzone)
//   drag > 20 GUI px               -> kp 2: SNAP; receivers run routes; QB drops back
//   release with R01 >= 20         -> throw: e0 = R01 * throw_power, arc g0 = .35 e0
//   ball per frame: e *= .986, g -= .08, h += g, pos += (cos a, sin a) e  (y down)
//   throw direction a = 180 - dir(origin -> pointer): the ball flies OPPOSITE the pull
//   the ball's shadow (obj 78) re-simulates the flight every frame: _w31/_x31 = landing
//   a receiver catches a ball that comes down (h <= 30, or <= 60 when it chases) on top of it
//
// Usage (library): const B = require('./qb-bot'); await B.playUntil(page, { consecutive: 2 })
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GUI_PER_CSS_DEFAULT = 480 / 900;

const IN = {
    calib: () => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; },
    mouseRead: () => ({ rx: _ft._w01(), ry: _ft._x01(), gx: _m01(0), gy: _o01(0) }),
    snap: () => {
        const raw = RB.engineState().rawEngineMatch;
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const num = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : v;
        let ctrl = null, ball = null, shadow = null; const of = [], df = [];
        try { const m = _si(global._d01); for (const k in m) if (m.hasOwnProperty(k)) { const c = m[k]; ctrl = { kp: c._kp, R01: num(c._R01), ang: num(c._511), holder: c._X_ }; break; } } catch (e) {}
        for (const x of inst) {
            if (!x || x._HL2 || !x._eE2 || !x._eE2._fE2) continue;
            const n = x._eE2._fE2;
            if (n === 'obj_ball') ball = { x: num(x.x), y: num(x.y), kp: x._kp, e11: num(x._e11), g11: num(x._g11), h: num(x._Y11), ang: num(x._511), holder: x._X_ };
            else if (n === 'obj_playerOF' || n === 'obj_playerDF') {
                let ln = null, skill = null; try { ln = String(_Ai(x._7j, 'lname') || ''); skill = _Ai(x._7j, 'skill'); } catch (e) {}
                (n === 'obj_playerOF' ? of : df).push({ id: x.id, x: num(x.x), y: num(x.y), pos: x._O01, anim: x._g21, route: x._W01, pt: x._c71, rx0: num(x._D61), ry0: num(x._E61), ln, skill, tp: num(x._f11) });
            }
        }
        try { const sh = _jj(raw, _Sc2, 78); if (sh) shadow = { lx: num(sh._w31), ly: num(sh._x31), hx: num(sh._S81), hy: num(sh._T81) }; } catch (e) {}
        const s = RB.engineState();
        // dialog buttons only (kickoff / 4th down / PAT / continue) — never the always-present audible or timeout buttons
        let btn = 0; for (const x of inst) if (x && !x._HL2 && x._eE2 && /btn|button/.test(x._eE2._fE2 || '') && !/audible|timeout|store|buy|restore|appstore/.test(x._eE2._fE2 || '')) btn++;
        return { t: performance.now(), ctrl, ball, shadow, of, df, dir: s.engineDriveDirection, scrimX: num(raw._B01), down: s.engineDownNumber, ytg: num(s.engineYardsToGo), y6f: num(raw._6F), vy: s.engineDriveFsmStage, kpc: s.engineControllerState, btn,
                 waiting: window._rb2p_userIsWaitingForOpponent === true, su: s.userScore, so: s.opponentScore };
    },
    routePoints: (pathIdx) => { try { const n = _e71(pathIdx); const pts = []; for (let i = 0; i < n; i++) pts.push([_b71(pathIdx, i), _d71(pathIdx, i)]); return pts; } catch (e) { return null; } },
    startTrace: () => { window.__tr = []; window.__trOn = true; const f = () => { if (!window.__trOn) return; try { window.__tr.push(window.__snap()); } catch (e) {} requestAnimationFrame(f); }; requestAnimationFrame(f); },
    stopTrace: () => { window.__trOn = false; const t = window.__tr || []; window.__tr = []; return t; },
    diagTail: (n) => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '').slice(-(n || 600)),
    clickButtons: () => {
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; const out = [];
        for (const x of inst) if (x && !x._HL2 && x._eE2 && /btn|button/.test(x._eE2._fE2 || '') && !/audible|timeout|store|buy|restore|appstore/.test(x._eE2._fE2 || '')) {
            let label = ''; try { for (const k in x) { const v = x[k]; if (typeof v === 'string' && v.length > 1 && v.length < 24 && /^[A-Za-z0-9 !?'.-]+$/.test(v) && !/^obj_|^spr_|^snd_|^fnt_/.test(v)) { label = v; break; } } } catch (e) {}
            out.push({ n: x._eE2._fE2, x: x.x, y: x.y, label });
        }
        try { out.ytg = RB.engineState().engineYardsToGo; } catch (e) {}
        return out;
    }
};

// ---- the ball's flight, integrated exactly as the engine does ----
function simThrow(e0, angDeg, h0) {
    let e = e0, g = 0.35 * e0, h = (h0 == null ? 20 : h0), x = 0, y = 0, f = 0;
    const a = angDeg * Math.PI / 180;
    const pts = [];
    while (f < 400) {
        e *= 0.986; g -= 0.08; x += Math.cos(a) * e; y += Math.sin(a) * e; h += g; f++;
        pts.push({ x, y, h, f });
        if (h <= 1 && g < 0) break;
    }
    return { frames: f, dx: x, dy: y, pts };
}
// range for a given e0 (room px) — monotonic in e0
function rangeFor(e0) { const s = simThrow(e0, 0); return { range: Math.hypot(s.dx, s.dy), frames: s.frames }; }
function e0ForRange(D, e0max) {
    let lo = 1, hi = e0max;
    if (rangeFor(hi).range < D) return { e0: hi, short: true, frames: rangeFor(hi).frames };
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (rangeFor(mid).range < D) lo = mid; else hi = mid; }
    return { e0: hi, short: false, frames: rangeFor(hi).frames };
}

// ---- route prediction: where a receiver will be in `frames`, at `speed` px/frame ----
function routePolyline(o, pts) {
    if (!pts || !pts.length) return null;
    const flip = o.ry0 > 300 ? -1 : 1;
    return pts.map(p => ({ x: o.rx0 + p[0], y: o.ry0 + flip * p[1] }));
}
function predictAlongRoute(o, poly, speed, frames) {
    // from the current position toward point `pt`, then on through the polyline
    let x = o.x, y = o.y, i = Math.min(o.pt || 0, poly ? poly.length - 1 : 0), left = speed * frames;
    if (!poly || i >= poly.length) return { x, y, done: true };
    while (left > 0 && i < poly.length) {
        const tx = poly[i].x, ty = poly[i].y, d = Math.hypot(tx - x, ty - y);
        if (d < 20) { i++; continue; }                     // the engine advances at 20 px
        const step = Math.min(left, d);
        x += (tx - x) / d * step; y += (ty - y) / d * step; left -= step;
    }
    return { x, y, done: i >= poly.length };
}

async function calibrate(page) {
    const cal = await page.evaluate(IN.calib);
    const p1 = { x: cal.left + cal.w * 0.3, y: cal.top + cal.h * 0.3 }, p2 = { x: cal.left + cal.w * 0.7, y: cal.top + cal.h * 0.7 };
    await page.mouse.move(p1.x, p1.y); await sleep(60); const m1 = await page.evaluate(IN.mouseRead);
    await page.mouse.move(p2.x, p2.y); await sleep(60); const m2 = await page.evaluate(IN.mouseRead);
    const rsx = (m2.rx - m1.rx) / (p2.x - p1.x), rsy = (m2.ry - m1.ry) / (p2.y - p1.y);
    const gs = (m2.gx - m1.gx) / (p2.x - p1.x) || GUI_PER_CSS_DEFAULT;
    return { cal, rsx, rsy, rox: m1.rx - rsx * p1.x, roy: m1.ry - rsy * p1.y, gs,
             toCss: (rx, ry) => ({ x: (rx - (m1.rx - rsx * p1.x)) / rsx, y: (ry - (m1.ry - rsy * p1.y)) / rsy }) };
}

async function clickButtons(page, cal, log) {
    const list = await page.evaluate(IN.clickButtons);
    if (log && list.length) log('  dialog: ' + list.map(b => b.n + (b.label ? '"' + b.label + '"' : '') + '@' + Math.round(b.x) + ',' + Math.round(b.y)).join(' '));
    // Prefer GO FOR IT on 4th & short, else PUNT, else FG, else whatever is there. A
    // press is read at STEP time, so hold it for a few frames.
    const pick = list.find(b => /go/i.test(b.label || '')) && Number(list.ytg) <= 3 ? list.find(b => /go/i.test(b.label || '')) : (list.find(b => /punt/i.test(b.label || '')) || list.find(b => /kick|continue|ok|receive/i.test(b.label || '')) || list[0]);
    if (!pick) return 0;
    const x = cal.cal.left + pick.x / 480 * cal.cal.w, y = cal.cal.top + pick.y / 270 * cal.cal.h;
    await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(300);
    return pick.n + (pick.label ? '"' + pick.label + '"' : '');
}

// One play. Returns { result: 'complete'|'incomplete'|'intercepted'|'run'|'sack'|'none', ... }
async function playOne(page, cal, opts) {
    opts = opts || {};
    const log = opts.log || (() => {});
    const s0 = await page.evaluate(IN.snap);
    const qb = s0.of.find(o => o.pos === 1);
    if (!qb || !s0.ball) return { result: 'none', why: 'no QB/ball' };
    const dir = s0.dir;                                  // +1 offense goes +x, -1 goes -x
    const tp = qb.tp || 0.156;                           // throw power
    const e0max = 74 * tp;
    const qbCss = cal.toCss(qb.x, qb.y);
    // route polylines
    const routes = {};
    for (const o of s0.of) if (o.pos !== 1 && o.route >= 0) { routes[o.id] = routePolyline(o, await page.evaluate(IN.routePoints, o.route)); }
    // press on the QB and SNAP with a small pull straight back (opposite the drive)
    const gs = cal.gs;                                   // gui px per css px
    const pullBack = (guiLen) => ({ x: qbCss.x + (-dir) * guiLen / gs, y: qbCss.y });
    await page.mouse.move(qbCss.x, qbCss.y); await sleep(40); await page.mouse.down();
    // the engine registers the press at STEP time: give it two frames so the drag
    // origin is the QB (moving at once made the origin wherever the pointer was
    // when it first came within 40 px of the QB — and the throw angle went wild)
    let pressed = false;
    for (let i = 0; i < 8; i++) { await sleep(20); const c = await page.evaluate(IN.snap); if (c.ctrl && c.ctrl.kp === 1) { pressed = true; break; } }
    if (!pressed) { await page.mouse.up(); return { result: 'none', why: 'press not registered' }; }
    const p0 = pullBack(26); await page.mouse.move(p0.x, p0.y, { steps: 2 });
    await page.evaluate(IN.startTrace);
    const tSnap = Date.now();
    let prev = null, prevT = 0, best = null, thrown = false, decided = null, samples = 0;
    const vel = {};                                      // id -> {vx,vy} px/frame (measured)
    let lastAim = p0;
    while (Date.now() - tSnap < (opts.maxHoldMs || 1700)) {
        await sleep(40);
        const s = await page.evaluate(IN.snap);
        samples++;
        if (!s.ball || !s.ctrl || s.ctrl.kp !== 2) { if (s.ctrl && s.ctrl.kp !== 2 && s.ctrl.kp !== 1) { log('  controller left aim state (kp ' + s.ctrl.kp + ')'); break; } }
        const q = s.of.find(o => o.pos === 1) || qb;
        if (prev) {
            const dtF = Math.max(1, (s.t - prev.t) / (1000 / 60));
            for (const o of s.of.concat(s.df)) { const p = prev.of.concat(prev.df).find(z => z.id === o.id); if (p) vel[o.id] = { vx: (o.x - p.x) / dtF, vy: (o.y - p.y) / dtF }; }
        }
        prev = s;
        const held = Date.now() - tSnap;
        if (held < (opts.minHoldMs || 450)) continue;      // let the routes open up
        // evaluate every receiver
        const cands = [];
        for (const o of s.of) {
            if (o.pos === 1 || o.pos === 5) continue;
            if (o.anim !== 2 && o.anim !== 0) continue;
            const v = vel[o.id] || { vx: 0, vy: 0 };
            const speed = Math.hypot(v.vx, v.vy);
            const poly = routes[o.id];
            // iterate: lead time -> landing point -> flight time
            let frames = 45, P = null, e0 = null, short = false;
            for (let it = 0; it < 4; it++) {
                P = (poly && speed > 0.3) ? predictAlongRoute(o, poly, speed, frames) : { x: o.x + v.vx * frames, y: o.y + v.vy * frames };
                const D = Math.hypot(P.x - q.x, P.y - q.y);
                const r = e0ForRange(D, e0max); e0 = r.e0; short = r.short; frames = r.frames;
            }
            const fwd = (P.x - q.x) * dir;                  // downfield component
            if (fwd < 5) continue;                          // never throw backwards
            let sep = 999, who = null;
            for (const d of s.df) { const dv = vel[d.id] || { vx: 0, vy: 0 }; const dx = d.x + dv.vx * frames - P.x, dy = d.y + dv.vy * frames - P.y; const dd = Math.hypot(dx, dy); if (dd < sep) { sep = dd; who = d.ln; } }
            const gain = fwd / 20;
            cands.push({ o, P, e0, frames, sep, who, short, gain, speed, score: sep + Math.min(gain, 12) * 1.5 - (short ? 40 : 0) });
        }
        cands.sort((a, b) => b.score - a.score);
        const top = cands[0];
        if (top) {
            // aim: pointer = origin - (target direction) * R01, in gui px (the throw goes opposite the pull)
            const R01 = Math.min(74, Math.max(21, top.e0 / tp));
            const ux = (top.P.x - q.x), uy = (top.P.y - q.y), L = Math.hypot(ux, uy) || 1;
            const aim = { x: qbCss.x - ux / L * R01 / gs, y: qbCss.y - uy / L * R01 / gs };
            if (Math.hypot(aim.x - lastAim.x, aim.y - lastAim.y) > 2) { await page.mouse.move(aim.x, aim.y, { steps: 2 }); lastAim = aim; }
            // closed loop: the ball's shadow projects the landing point for the CURRENT drag (the dotted line a player sees)
            for (let it = 0; it < 2; it++) {
                await sleep(18);
                const c = await page.evaluate(IN.snap);
                if (!c.shadow || !c.shadow.lx || !c.ctrl || c.ctrl.kp !== 2) break;
                const ex = top.P.x - c.shadow.lx, ey = top.P.y - c.shadow.ly;
                if (Math.hypot(ex, ey) < 4) break;
                // landing moves with the pull: same direction as -pull, magnitude ~ R01^2 -> correct the pull vector
                const offx = lastAim.x - qbCss.x, offy = lastAim.y - qbCss.y, offL = Math.hypot(offx, offy) || 1;
                const projD = Math.hypot(c.shadow.lx - q.x, c.shadow.ly - q.y) || 1, wantD = Math.hypot(top.P.x - q.x, top.P.y - q.y);
                const scale = Math.sqrt(Math.max(0.3, Math.min(3, wantD / projD)));
                const angProj = Math.atan2(c.shadow.ly - q.y, c.shadow.lx - q.x), angWant = Math.atan2(top.P.y - q.y, top.P.x - q.x);
                const rot = angWant - angProj;
                const nx = (offx * Math.cos(rot) - offy * Math.sin(rot)) * scale, ny = (offx * Math.sin(rot) + offy * Math.cos(rot)) * scale;
                const nl = Math.hypot(nx, ny), maxL = 74 / gs, minL = 21 / gs;
                const k = nl > maxL ? maxL / nl : nl < minL ? minL / nl : 1;
                lastAim = { x: qbCss.x + nx * k, y: qbCss.y + ny * k };
                await page.mouse.move(lastAim.x, lastAim.y, { steps: 2 });
            }
            best = top;
            const ready = top.sep >= (opts.minSep || 26) && held >= (opts.minHoldMs || 450);
            const forced = held >= (opts.forceMs || 1300);
            if (ready || forced) {
                // let the pointer settle one frame, read back the engine's own landing projection if it has one
                await sleep(30);
                const chk = await page.evaluate(IN.snap);
                decided = { top, held, R01, forced, ctrl: chk.ctrl, shadow: chk.shadow, qb: { x: q.x, y: q.y } };
                await page.mouse.up(); thrown = true; break;
            }
        }
    }
    if (!thrown) { await page.mouse.up(); }               // pointer released anyway (run/throw whatever the aim was)
    // watch the play to its end
    let tr = null, end = null, shotAir = false;
    for (let w = 0; w < 120; w++) {
        await sleep(100);
        const s = await page.evaluate(IN.snap);
        if (!shotAir && s.ball && s.ball.kp === 3 && opts.onAir) { shotAir = true; try { await opts.onAir(); } catch (e) {} }
        if (!s.ball) { end = s; break; }
        if (s.ball.kp === 0 && w > 5) { end = s; break; }
        if (s.down !== s0.down || s.waiting !== s0.waiting || s.btn > 0) { end = s; break; }
    }
    tr = await page.evaluate(IN.stopTrace);
    const air = tr.filter(f => f.ball && f.ball.kp === 3);
    const ofIds = new Set(s0.of.map(o => o.id));
    let caughtBy = null, intBy = null, landing = null, sacked = false;
    for (const f of tr) {
        if (f.ball && f.ball.kp === 5 && air.length && f.ball.holder && f.ball.holder !== qb.id) { const o = f.of.find(z => z.id === f.ball.holder); const d = f.df.find(z => z.id === f.ball.holder); if (o) { caughtBy = o.ln; break; } if (d) { intBy = d.ln; break; } }
        if (f.ball && f.ball.kp === 9) { const d = f.df.find(z => z.id === f.ball.holder); intBy = (d && d.ln) || 'DF'; break; }
        if (f.ball && f.ball.kp === 11) sacked = true;
    }
    if (air.length) { const a = air[air.length - 1]; landing = { x: a.ball.x, y: a.ball.y, h: a.ball.h, frames: air.length, first: air[0] && air[0].ball }; }
    const gainYds = end ? ((end.y6f - s0.y6f) * dir) : null;   // +6F is toward the opponent: sign by drive dir? (6F is signed from midfield toward the opponent)
    const result = intBy ? 'intercepted' : caughtBy ? 'complete' : air.length ? 'incomplete' : sacked ? 'sack' : 'run';
    return { result, caughtBy, intBy, landing, decided, best, end, s0, tr, samples, gainYds };
}

async function playUntil(page, opts) {
    opts = opts || {};
    const log = opts.log || console.log;
    const cal = await calibrate(page);
    await page.evaluate('window.__snap = ' + IN.snap.toString());
    let consec = 0, plays = 0, completions = 0; const history = []; const t0 = Date.now(); let lastWaitLog = 0;
    while (plays < (opts.maxPlays || 20) && Date.now() - t0 < (opts.maxMs || 240000)) {
        let s = await page.evaluate(IN.snap);
        if (Date.now() - lastWaitLog > 5000) { lastWaitLog = Date.now(); log('  ... state: waiting=' + s.waiting + ' btn=' + s.btn + ' ball=' + (s.ball ? 'kp' + s.ball.kp : 'none') + ' kpc=' + s.kpc + ' vy=' + s.vy + ' down=' + s.down + ' of=' + s.of.length); }
        if (s.waiting) { await sleep(500); continue; }
        if (s.btn > 0) { const n = await clickButtons(page, cal, log); log('  pressed ' + n); await sleep(700); continue; }
        if (!s.ball || (s.ball.kp !== 0 && s.ball.kp !== 1) || s.kpc !== 2) { await sleep(300); continue; }
        const r = await playOne(page, cal, { log, minSep: opts.minSep, minHoldMs: opts.minHoldMs, forceMs: opts.forceMs, onAir: opts.onAir ? (() => opts.onAir(plays + 1)) : null });
        if (r.result === 'none') { await sleep(500); continue; }
        plays++;
        const d = r.decided;
        const tgt = d ? (d.top.o.ln + ' pos' + d.top.o.pos + ' sep ' + Math.round(d.top.sep) + 'px (' + d.top.who + ') lead ' + d.top.frames + 'f R01 ' + Math.round(d.R01) + (d.forced ? ' FORCED' : '') + ' held ' + d.held + 'ms') : 'no decision';
        const pred = d ? '(' + Math.round(d.top.P.x) + ',' + Math.round(d.top.P.y) + ')' : '';
        const land = r.landing ? '(' + Math.round(r.landing.x) + ',' + Math.round(r.landing.y) + ') after ' + r.landing.frames + 'f' : 'no flight';
        const engProj = d && d.shadow && d.shadow.lx ? ' engine-projected (' + Math.round(d.shadow.lx) + ',' + Math.round(d.shadow.ly) + ')' : '';
        const readback = d && d.ctrl ? ' ctrl R01 ' + d.ctrl.R01 + ' ang ' + d.ctrl.ang : '';
        log('play ' + plays + ' [' + s.down + '&' + s.ytg + ' at 6F ' + s.y6f + ']: ' + r.result.toUpperCase() + (r.caughtBy ? ' by ' + r.caughtBy : '') + (r.intBy ? ' by ' + r.intBy : '') +
            ' | target ' + tgt + ' -> predicted ' + pred + ' landed ' + land + engProj + readback + (r.gainYds != null ? ' | gain ' + Math.round(r.gainYds) + ' yd' : ''));
        history.push(r);
        if (r.result === 'complete') { completions++; consec++; } else if (r.result === 'run' && !r.decided) { /* nothing thrown: does not break a streak */ } else consec = 0;
        if (consec >= (opts.consecutive || 2)) { log('*** ' + consec + ' CONSECUTIVE COMPLETIONS ***'); return { ok: true, plays, completions, consec, history }; }
        await sleep(800);
    }
    return { ok: false, plays, completions, consec, history };
}

module.exports = { IN, simThrow, rangeFor, e0ForRange, routePolyline, predictAlongRoute, calibrate, playOne, playUntil, clickButtons };

if (require.main === module) {
    // standalone: vs the KC AI in the single-page harness
    const H = require('./harness');
    (async () => {
        await H.ensureServer();
        const browser = await H.launchBrowser();
        try {
            const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
            const dif = Number(process.env.DIF || 10);
            await page.evaluate((dif) => { window._rb2p_computeDefenseAggression = () => dif; const s = RB.engineState(); if (s) s.engineDefenseAggression = dif; }, dif);
            await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
            await sleep(1500);
            const r = await playUntil(page, { maxPlays: Number(process.argv[2] || 12), consecutive: 2 });
            console.log('RESULT ' + JSON.stringify({ ok: r.ok, plays: r.plays, completions: r.completions }));
        } finally { await browser.close(); }
    })().catch(e => { console.error('FATAL', e); process.exit(2); });
}
