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
        const es = RB.engineState(); if (!es || !es.rawEngineMatch) return { over: true, of: [], df: [], btn: 0 };
        const raw = es.rawEngineMatch;
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const num = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : v;
        let ctrl = null, ball = null, shadow = null; const of = [], df = [];
        try { const m = _si(global._d01); for (const k in m) if (m.hasOwnProperty(k)) { const c = m[k]; ctrl = { kp: c._kp, R01: num(c._R01), ang: num(c._511), holder: c._X_, meter: num(c._D11), meterDir: c._201, arrow: num(c._101), arrowX: num(c._801) }; break; } } catch (e) {}
        for (const x of inst) {
            if (!x || x._HL2 || !x._eE2 || !x._eE2._fE2) continue;
            const n = x._eE2._fE2;
            if (n === 'obj_ball') ball = { x: num(x.x), y: num(x.y), kp: x._kp, e11: num(x._e11), g11: num(x._g11), h: num(x._Y11), ang: num(x._511), holder: x._X_ };
            else if (n === 'obj_playerOF' || n === 'obj_playerDF') {
                let ln = null, skill = null; try { ln = String(_Ai(x._7j, 'lname') || ''); skill = _Ai(x._7j, 'skill'); } catch (e) {}
                (n === 'obj_playerOF' ? of : df).push({ id: x.id, x: num(x.x), y: num(x.y), pos: x._O01, anim: x._g21, route: x._W01, pt: x._c71, rx0: num(x._D61), ry0: num(x._E61), ln, skill, tp: num(x._f11) });
            }
        }
        try { const sh = _jj(raw, _Sc2, 78); if (sh) {
            shadow = { lx: num(sh._w31), ly: num(sh._x31), hx: num(sh._S81), hy: num(sh._T81), oi: Number(sh._OI) || 0 };
            // the projected trajectory (x, y, height per sampled step): the descending crossings of 30 and 60
            const xs = sh._9L1, ys = sh._aL1, hs = sh._bL1;
            if (xs && ys && hs) { let peak = -1, pk = -1; const n = Math.min(xs.length, ys.length, hs.length);
                for (let i = 0; i < n; i++) { const h = Number(hs[i]); if (!isFinite(h) || (h === 0 && i > 0)) break; if (h > peak) { peak = h; pk = i; } }
                shadow.peak = num(peak); shadow.steps = n;
                for (let i = pk; i < n; i++) { const h = Number(hs[i]); if (!isFinite(h) || (h === 0 && i > 0)) break; if (shadow.c60x == null && h <= 60) { shadow.c60x = num(xs[i]); shadow.c60y = num(ys[i]); shadow.c60i = i; } if (h <= 30) { shadow.c30x = num(xs[i]); shadow.c30y = num(ys[i]); shadow.c30i = i; break; } }
            }
        } } catch (e) {}
        const s = RB.engineState();
        // dialog buttons only (kickoff / 4th down / PAT / continue) — never the always-present audible or timeout buttons
        let btn = 0; for (const x of inst) if (x && !x._HL2 && x._eE2 && /btn|button/.test(x._eE2._fE2 || '') && !/audible|timeout|store|buy|restore|appstore/.test(x._eE2._fE2 || '')) btn++;
        let kickerLeg = null; try { const c = _si(64); let to = null; for (const k in c) { if (c.hasOwnProperty(k)) { to = c[k]; break; } } const n = _wi(to._Ln); for (let i = 0; i < n; i++) { const q = _zi(to._Ln, i); if (q == null) continue; const pz = Number(_Ai(q, 'position')); if (pz >= 9) { const st = Number(_Ai(q, 'strength')); if (kickerLeg == null || st > kickerLeg) kickerLeg = st; } } } catch (e) {}
        let audible = null; for (const x of inst) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_btn_audible') { audible = { x: x.x, y: x.y, w: Number(x._8l1) || 0, h: Number(x._VI) || 0 }; break; }
        return { t: performance.now(), ctrl, ball, shadow, of, df, kick: raw._T11 === 1, pat: window._rb2p_patPlayPending === true || Number(s.engineDownNumber) === 6, dir: s.engineDriveDirection, scrimX: num(raw._B01), down: s.engineDownNumber,
                 q: s.engineQuarter, clk: Number(s.engineMinutesLeft) * 60 + Number(s.engineSecondsLeft), kickerLeg, audible, timeoutCalled: raw._u11, ytg: num(s.engineYardsToGo), y6f: num(raw._6F), vy: s.engineDriveFsmStage, kpc: s.engineControllerState, btn,
                 waiting: window._rb2p_userIsWaitingForOpponent === true, su: s.userScore, so: s.opponentScore };
    },
    routePoints: (pathIdx) => { try { const n = _e71(pathIdx); const pts = []; for (let i = 0; i < n; i++) pts.push([_b71(pathIdx, i), _d71(pathIdx, i)]); return pts; } catch (e) { return null; } },
    lite: () => {
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        let ball = null; const of = [], df = [];
        for (const x of inst) {
            if (!x || x._HL2 || !x._eE2) continue;
            const n = x._eE2._fE2;
            if (n === 'obj_ball') ball = { x: x.x, y: x.y, kp: x._kp, h: x._Y11, holder: x._X_ };
            else if (n === 'obj_playerOF') of.push({ id: x.id, x: x.x, y: x.y, anim: x._g21 });
            else if (n === 'obj_playerDF') df.push({ id: x.id, x: x.x, y: x.y, anim: x._g21 });
        }
        return { t: performance.now(), ball, of, df };
    },
    startTrace: () => { window.__tr = []; window.__trOn = true; const f = () => { if (!window.__trOn) return; try { window.__tr.push(window.__lite()); } catch (e) {} requestAnimationFrame(f); }; requestAnimationFrame(f); },
    stopTrace: () => { window.__trOn = false; const t = window.__tr || []; window.__tr = []; return t; },
    diagTail: (n) => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '').slice(-(n || 600)),
    clickButtons: () => {
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; const out = [];
        for (const x of inst) if (x && !x._HL2 && x._eE2 && /btn|button/.test(x._eE2._fE2 || '') && !/audible|timeout|store|buy|restore|appstore/.test(x._eE2._fE2 || '')) {
            let label = ''; try { for (const k in x) { const v = x[k]; if (typeof v === 'string' && v.length > 1 && v.length < 24 && /^[A-Za-z0-9 !?'.-]+$/.test(v) && !/^obj_|^spr_|^snd_|^fnt_/.test(v)) { label = v; break; } } } catch (e) {}
            out.push({ n: x._eE2._fE2, x: x.x, y: x.y, w: Number(x._8l1) || 0, h: Number(x._VI) || 0, label });   // x,y = TOP-LEFT; the engine hit-tests x..x+w, y..y+h
        }
        try { out.ytg = RB.engineState().engineYardsToGo; } catch (e) {}
        return out;
    }
};

// ---- the ball's flight, integrated exactly as the engine does ----
function simThrow(e0, angDeg, h0) {
    let e = e0, g = 0.35 * e0, h = (h0 == null ? 20 : h0), x = 0, y = 0, f = 0;
    const a = angDeg * Math.PI / 180;
    const pts = []; let cx = null, cy = null, cf = null;
    while (f < 400) {
        e *= 0.986; g -= 0.08; x += Math.cos(a) * e; y += Math.sin(a) * e; h += g; f++;
        pts.push({ x, y, h, f });
        if (g < 0 && h <= 22 && cx == null) { cx = x; cy = y; cf = f; }   // the catch window: the ball is takeable below 30; aim its middle
        if (h <= 1 && g < 0) break;
    }
    if (cx == null) { cx = x; cy = y; cf = f; }
    return { frames: f, dx: x, dy: y, cx, cy, cf, pts };
}
// distance to the catch window for a given e0 (room px) — monotonic in e0
function rangeFor(e0) { const s = simThrow(e0, 0); return { range: Math.hypot(s.cx, s.cy), frames: s.cf }; }
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
    const rsx = (m2.rx - m1.rx) / (p2.x - p1.x) || 1.07, rsy = (m2.ry - m1.ry) / (p2.y - p1.y) || 1.07;
    const gs = (m2.gx - m1.gx) / (p2.x - p1.x) || GUI_PER_CSS_DEFAULT;
    return { cal, rsx, rsy, rox: m1.rx - rsx * p1.x, roy: m1.ry - rsy * p1.y, gs,
             toCss: (rx, ry) => ({ x: (rx - (m1.rx - rsx * p1.x)) / rsx, y: (ry - (m1.ry - rsy * p1.y)) / rsy }) };
}

async function clickButtons(page, cal, log) {
    const list = await page.evaluate(IN.clickButtons);
    if (!list.length) return 0;
    const s = await page.evaluate(IN.snap);
    const L = b => String(b.label || '');
    let pick = null, why = '';
    const pat1 = list.find(b => /^1 ?pt/i.test(L(b))), pat2 = list.find(b => /^2 ?pt/i.test(L(b)));
    // The 4th-down dialog carries the small choice buttons (obj_button) AND the big kick button
    // (obj_btn_fieldgoal, labelled Punt or Field Goal by field position). Its hit box is not
    // where its x/y say — pressing it looped forever in OT. Always answer with a small button.
    const small = list.filter(b => b.n === 'obj_button'), pool = small.length ? small : list;
    const go = pool.find(b => /4th|go/i.test(L(b))), punt = pool.find(b => /punt/i.test(L(b))), fg = pool.find(b => /field ?goal/i.test(L(b)));
    const key = list.map(b => L(b)).join('|') + '@' + Math.round(s.y6f) + '/' + s.q + '/' + s.clk;
    clickButtons.repeat = (clickButtons.lastKey === key) ? (clickButtons.repeat || 0) + 1 : 0; clickButtons.lastKey = key;
    if (pat1 || pat2) { const n = T.pat(s); pick = (n === 2 && pat2) ? pat2 : (pat1 || pat2); why = 'PAT: ' + n + ' (lead ' + T.lead(s) + ', Q' + s.q + ')'; }
    else if (go || punt || fg) {
        let d = T.fourth(s);
        if (clickButtons.repeat >= 2) { d = (clickButtons.repeat % 2) ? 'go' : 'fg'; why = 'dialog keeps returning -> trying '; }   // the same dialog again: the last answer was not accepted
        pick = d === 'fg' ? (fg || go) : d === 'go' ? (go || punt) : (punt || fg || go);
        why += '4th & ' + Math.round(s.ytg) + ' at the ' + (T.yardsToGoal(s) <= 50 ? 'opp ' + Math.round(T.yardsToGoal(s)) : 'own ' + Math.round(100 - T.yardsToGoal(s))) + ', FG ' + Math.round(T.fgDistance(s)) + ' yd (range ' + T.fgRange(s) + ', leg ' + s.kickerLeg + '), lead ' + T.lead(s) + ', Q' + s.q + ' ' + s.clk + 's -> ' + d.toUpperCase();
    }
    else pick = list.find(b => /kick|continue|ok|receive/i.test(L(b))) || list[0];
    if (log) log('  dialog [' + list.map(b => L(b) || b.n).join(' | ') + '] -> ' + (L(pick) || pick.n) + (why ? '   (' + why + ')' : ''));
    await pressGui(page, cal, pick);
    return (L(pick) || pick.n);
}

// One play. Returns { result: 'complete'|'incomplete'|'intercepted'|'run'|'sack'|'none', ... }
async function playOne(page, cal, opts) {
    opts = opts || {};
    const log = opts.log || (() => {});
    const s0 = await page.evaluate(IN.snap);
    const qb = s0.of.find(o => o.pos === 1);
    if (!qb || !s0.ball) return { result: 'none', why: 'no QB/ball' };
    // the camera follows the ball: re-measure the room->css map for THIS play
    try { const c2 = await calibrate(page); if (isFinite(c2.rsx) && isFinite(c2.rsy) && Math.abs(c2.rsx) > 0.1) cal = c2; } catch (e) {}
    const dir = s0.dir;                                  // +1 offense goes +x, -1 goes -x
    const tp = qb.tp || 0.156;                           // throw power
    const e0max = 74 * tp;
    const qbCss = cal.toCss(qb.x, qb.y);
    if (!isFinite(qbCss.x) || !isFinite(qbCss.y) || !isFinite(cal.gs) || cal.gs <= 0) return { result: 'none', why: 'bad calibration' };
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
    while (Date.now() - tSnap < (opts.maxHoldMs || 2600)) {
        await sleep(70);
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
        if (held < (opts.minHoldMs || 900) - 250) continue;   // let the routes open up
        // evaluate every receiver
        const cands = [];
        for (const o of s.of) {
            if (o.pos === 1 || o.pos === 5) continue;
            if (o.anim !== 2 && o.anim !== 0) continue;
            const v = vel[o.id] || { vx: 0, vy: 0 };
            const speed = Math.hypot(v.vx, v.vy) * (Number(process.env.SPEED_K) || opts.speedK || 1);
            const poly = routes[o.id];
            // iterate: lead time -> landing point -> flight time
            let frames = 45, P = null, e0 = null, short = false;
            for (let it = 0; it < 4; it++) {
                P = (poly && speed > 0.3) ? predictAlongRoute(o, poly, speed, frames) : { x: o.x + v.vx * frames, y: o.y + v.vy * frames };
                const D = Math.hypot(P.x - q.x, P.y - q.y);
                const r = e0ForRange(D, e0max); e0 = r.e0; short = r.short; frames = r.frames;
            }
            const fwd = (P.x - q.x) * dir;                  // downfield from the QB
            const past = (P.x - s.scrimX) * dir;            // downfield from the LINE
            if (fwd < 20) continue;                         // never throw backwards
            if (past < (Number(s.down) >= 3 ? 40 : 20)) continue;  // a catch behind the line is a loss waiting to happen
            // separation = how much sooner the receiver gets there than the closest defender COULD,
            // if that defender turned and ran at his speed the moment the ball left (a break on the ball)
            let sep = 999, who = null, reach = 999;
            for (const d of s.df) {
                const dv = vel[d.id] || { vx: 0, vy: 0 };
                const dspd = Math.min(2.6, Math.max(1.8, Math.hypot(dv.vx, dv.vy)));
                const now = Math.hypot(d.x - P.x, d.y - P.y);
                const drift = Math.hypot(d.x + dv.vx * frames - P.x, d.y + dv.vy * frames - P.y);   // where he is going anyway
                if (drift < sep) { sep = drift; who = d.ln; }
                // could he break on the ball? ~18 frames to read it, then half his speed toward it
                const r = Math.min(now, drift) - dspd * Math.max(0, frames - 18) * 0.5;
                if (r < reach) reach = r;
            }
            // the throwing lane: a defender standing within 26 px of the line QB->P and ahead of the QB gets a hand on it
            // the ball leaves the hand ~20 high and is catchable (< 30) for its first ~60 px: a lineman
            // anywhere near that stretch, or near the line QB->P, gets a hand on it
            let lane = 999;
            for (const d of s.df) {
                const ax = P.x - q.x, ay = P.y - q.y, L2 = ax * ax + ay * ay || 1, Lr = Math.sqrt(L2);
                const t = ((d.x - q.x) * ax + (d.y - q.y) * ay) / L2;
                if (t > -0.05 && t < 0.92) { const px = q.x + ax * Math.max(0, t), py = q.y + ay * Math.max(0, t); const dd = Math.hypot(d.x - px, d.y - py); const near = (t * Lr < 70) ? dd * 0.8 : dd; if (near < lane) lane = near; }
                const dq = Math.hypot(d.x - q.x, d.y - q.y);
                if (dq < 70) { const cos = ((d.x - q.x) * ax + (d.y - q.y) * ay) / (dq * Lr || 1); if (cos > Math.cos(35 * Math.PI / 180)) lane = Math.min(lane, 8); }
            }
            const gain = past / 20;
            const sticks = Number(s.down) >= 3 ? (gain >= Number(s.ytg) ? 25 : -15) : 0;
            const deepPen = (frames > 45 && Number(s.ytg) <= 10) ? (frames - 45) * 1.5 : 0;
            cands.push({ o, P, e0, frames, sep, who, reach, lane, short, gain, speed,
                         score: sep + Math.min(reach, 0) * 1.5 + Math.min(gain, 25) * 2.2 + sticks - (short ? 40 : 0) - deepPen - (lane < 26 ? (26 - lane) * 2 : 0) });
        }
        cands.sort((a, b) => b.score - a.score);
        const top = cands[0];
        if (top) {
            // aim: pointer = origin - (target direction) * R01, in gui px (the throw goes opposite the pull)
            const R01 = Math.min(74, Math.max(24, top.e0 / tp));
            const ux = (top.P.x - q.x), uy = (top.P.y - q.y), L = Math.hypot(ux, uy) || 1;
            const aim = { x: qbCss.x - ux / L * R01 / gs, y: qbCss.y - uy / L * R01 / gs };
            if (Math.hypot(aim.x - lastAim.x, aim.y - lastAim.y) > 2) { await page.mouse.move(aim.x, aim.y, { steps: 2 }); lastAim = aim; }
            // closed loop: the ball's shadow projects the landing point for the CURRENT drag (the dotted line a player sees)
            for (let it = 0; it < 3; it++) {
                await sleep(18);
                const c = await page.evaluate(IN.snap);
                if (!c.shadow || !c.shadow.lx || !c.ctrl || c.ctrl.kp !== 2) break;
                const px = (c.shadow.c30x != null) ? c.shadow.c30x : c.shadow.lx, py = (c.shadow.c30y != null) ? c.shadow.c30y : c.shadow.ly;   // the projected catch-window point
                // the engine's own flight time to that point (sample index x sampling period): re-place the receiver there
                if (c.shadow.c30i != null) {
                    const F2 = (c.shadow.c30i + 1) * ((c.shadow.oi || 0) + 1);
                    if (Math.abs(F2 - top.frames) > 4 && F2 > 5 && F2 < 200) {
                        const o2 = c.of.find(z => z.id === top.o.id) || top.o;
                        const P2 = (routes[top.o.id] && top.speed > 0.3) ? predictAlongRoute(o2, routes[top.o.id], top.speed, F2) : { x: o2.x + (vel[top.o.id] || { vx: 0 }).vx * F2, y: o2.y + (vel[top.o.id] || { vy: 0 }).vy * F2 };
                        top.engineFrames = F2; top.frames = F2; top.P = P2;
                    }
                }
                const ex = top.P.x - px, ey = top.P.y - py;
                if (Math.hypot(ex, ey) < 4) break;
                // the point moves with the pull: same direction as -pull, magnitude ~ R01^2 -> correct the pull vector
                const offx = lastAim.x - qbCss.x, offy = lastAim.y - qbCss.y, offL = Math.hypot(offx, offy) || 1;
                const projD = Math.hypot(px - q.x, py - q.y) || 1, wantD = Math.hypot(top.P.x - q.x, top.P.y - q.y);
                const scale = Math.sqrt(Math.max(0.3, Math.min(3, wantD / projD)));
                const angProj = Math.atan2(py - q.y, px - q.x), angWant = Math.atan2(top.P.y - q.y, top.P.x - q.x);
                const rot = angWant - angProj;
                const nx = (offx * Math.cos(rot) - offy * Math.sin(rot)) * scale, ny = (offx * Math.sin(rot) + offy * Math.cos(rot)) * scale;
                const nl = Math.hypot(nx, ny), maxL = 74 / gs, minL = 24 / gs;
                const k = nl > maxL ? maxL / nl : nl < minL ? minL / nl : 1;
                lastAim = { x: qbCss.x + nx * k, y: qbCss.y + ny * k };
                await page.mouse.move(lastAim.x, lastAim.y, { steps: 2 });
            }
            best = top;
            const minHold = opts.minHoldMs || 900, forceAt = opts.forceMs || 1900;
            const ready = (top.sep >= (opts.minSep || 26) && top.reach >= -10 && top.lane >= 18 && held >= minHold) || (held >= minHold + 500 && top.sep >= 16 && top.reach >= -25 && top.lane >= 12);
            const forced = held >= forceAt;
            if (forced && (top.sep < -15 || top.lane < 8)) {   // only when the best receiver is plainly covered; otherwise take the risky throw
                // nobody open and the rush is coming: throw it AWAY (over the sideline, forward) — an incompletion, never a pick
                const ux = dir, uy = (q.y < 300) ? -1 : 1, L = Math.hypot(ux, uy);
                const R01 = 60;
                const away = { x: qbCss.x - ux / L * R01 / gs, y: qbCss.y - uy / L * R01 / gs };
                await page.mouse.move(away.x, away.y, { steps: 2 }); await sleep(30);
                decided = { top, held, R01, forced, thrownAway: true, qb: { x: q.x, y: q.y } };
                await page.mouse.up(); thrown = true; break;
            }
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
    let tr = null, end = null, shotAir = false, steer = null;
    for (let w = 0; w < 120; w++) {
        await sleep(100);
        const s = await page.evaluate(IN.snap);
        if (!shotAir && s.ball && s.ball.kp === 3 && opts.onAir) { shotAir = true; try { await opts.onAir(); } catch (e) {} }
        if (!steer && thrown && s.ball && s.ball.kp === 5 && s.ball.holder && s.ball.holder !== qb.id && s.of.some(o => o.id === s.ball.holder)) { steer = await steerCarrier(page, cal, s0, opts); }
        if (!s.ball) { end = s; break; }
        if (s.ball.kp === 0 && w > 5) { end = s; break; }
        if (s.down !== s0.down || s.waiting !== s0.waiting || s.btn > 0) { end = s; break; }
    }
    tr = await page.evaluate(IN.stopTrace);
    const air = tr.filter(f => f.ball && f.ball.kp === 3);
    const ofIds = new Set(s0.of.map(o => o.id));
    let caughtBy = null, intBy = null, landing = null, sacked = false;
    const nameOf = id => { const o = s0.of.find(z => z.id === id) || s0.df.find(z => z.id === id); return o ? o.ln : null; };
    for (const f of tr) {
        if (f.ball && f.ball.kp === 5 && air.length && f.ball.holder && f.ball.holder !== qb.id) { const o = f.of.find(z => z.id === f.ball.holder); const d = f.df.find(z => z.id === f.ball.holder); if (o) { caughtBy = nameOf(o.id) || 'OF'; break; } if (d) { intBy = nameOf(d.id) || 'DF'; break; } }
        if (f.ball && f.ball.kp === 9) { const d = f.df.find(z => z.id === f.ball.holder); intBy = (d && nameOf(d.id)) || 'DF'; break; }
        if (f.ball && f.ball.kp === 11) sacked = true;
    }
    let predErr = null;
    if (air.length) {
        // the TRUE landing: the first frame the ball comes down to the ground after its peak (kp stays 3 while it rolls)
        let peak = -1, pk = 0; for (let i = 0; i < air.length; i++) { const h = Number(air[i].ball.h) || 0; if (h > peak) { peak = h; pk = i; } }
        let li = air.length - 1; for (let i = pk; i < air.length; i++) { if ((Number(air[i].ball.h) || 0) <= 1.5) { li = i; break; } }
        const a = air[li]; landing = { x: a.ball.x, y: a.ball.y, h: a.ball.h, frames: li + 1, peak: Math.round(peak), first: air[0] && air[0].ball };
        if (decided && decided.top && !decided.thrownAway) {
            const rid = decided.top.o.id, P = decided.top.P;
            const at = a.of.find(z => z.id === rid), at0 = air[0].of.find(z => z.id === rid);
            let closest = 999; for (const f of air.slice(0, landing.frames)) { const z = f.of.find(w => w.id === rid); if (z) closest = Math.min(closest, Math.hypot(z.x - f.ball.x, z.y - f.ball.y)); }
            if (at && at0) {
                const ux = P.x - at0.x, uy = P.y - at0.y, L = Math.hypot(ux, uy) || 1;      // along the receiver's intended path
                const along = ((at.x - P.x) * ux + (at.y - P.y) * uy) / L;                  // + = receiver went PAST the spot, - = short of it
                predErr = { px: Math.round(Math.hypot(at.x - P.x, at.y - P.y)), along: Math.round(along), ballToRecv: Math.round(Math.hypot(at.x - a.ball.x, at.y - a.ball.y)), closest: Math.round(closest), peak: landing.peak, flightFrames: landing.frames, predFrames: decided.top.frames, speedAtDecision: Math.round(decided.top.speed * 100) / 100, anim: at.anim };
            }
        }
    }
    const gainYds = end ? (end.y6f - s0.y6f) : null;   // _6F is signed toward the opponent's goal on every drive
    const result = intBy ? 'intercepted' : caughtBy ? 'complete' : (decided && decided.thrownAway) ? 'throwaway' : air.length ? 'incomplete' : sacked ? 'sack' : 'run';
    return { result, caughtBy, intBy, landing, decided, best, end, s0, tr, samples, gainYds, predErr, steer };
}

async function playUntil(page, opts) {
    opts = opts || {};
    const log = opts.log || console.log;
    const cal = await calibrate(page);
    await page.evaluate('window.__snap = ' + IN.snap.toString() + '; window.__lite = ' + IN.lite.toString());
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
            ' | target ' + tgt + ' -> predicted ' + pred + ' landed ' + land + engProj + readback + (r.gainYds != null ? ' | gain ' + Math.round(r.gainYds) + ' yd' : '') + (r.predErr ? ' | recv err ' + r.predErr.px + 'px (along ' + r.predErr.along + ', ball-recv ' + r.predErr.ballToRecv + ', closest ' + r.predErr.closest + ', peak ' + r.predErr.peak + ', flight ' + r.predErr.flightFrames + '/' + r.predErr.predFrames + 'f, spd ' + r.predErr.speedAtDecision + ', anim ' + r.predErr.anim + ')' : ''));
        history.push(r);
        if (r.result === 'complete') { completions++; consec++; } else if (r.result === 'run' && !r.decided) { /* nothing thrown: does not break a streak */ } else consec = 0;
        if (consec >= (opts.consecutive || 2)) { log('*** ' + consec + ' CONSECUTIVE COMPLETIONS ***'); return { ok: true, plays, completions, consec, history }; }
        await sleep(800);
    }
    return { ok: false, plays, completions, consec, history };
}

// ---- the ball carrier: a swipe (press, move > 20 room px, release) gives him a nudge that way ----
async function swipeAt(page, x, y, dx, dy) {
    await page.mouse.move(x, y); await page.mouse.down(); await sleep(35);
    await page.mouse.move(x + dx, y + dy, { steps: 2 }); await sleep(35); await page.mouse.up();
}
// keep swiping the runner upfield, away from the nearest defender, until he is down
async function steerCarrier(page, cal, s0, opts) {
    const dir = s0.dir; let swipes = 0, last = null;
    for (let i = 0; i < 60; i++) {
        const s = await page.evaluate(IN.snap);
        if (!s.ball || s.ball.kp !== 5 || !s.ball.holder) break;
        const c = s.of.find(o => o.id === s.ball.holder); if (!c) break;
        // defenders ahead of the runner: steer away from the nearest one's lane
        let ax = dir, ay = 0, nearest = null, nd = 999;
        for (const d of s.df) { const fwd = (d.x - c.x) * dir; if (fwd < -10) continue; const dd = Math.hypot(d.x - c.x, d.y - c.y); if (dd < nd) { nd = dd; nearest = d; } }
        if (nearest && nd < 110) { const side = (nearest.y >= c.y) ? -1 : 1; const tilt = nd < 50 ? 0.9 : 0.5; ax = dir * (1 - tilt); ay = side * tilt; }
        // stay in bounds (field y 132..468)
        if (c.y < 165 && ay < 0) ay = 0.4; if (c.y > 435 && ay > 0) ay = -0.4;
        const L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L;
        const cc = cal.toCss(c.x, c.y);
        if (isFinite(cc.x) && isFinite(cc.y)) { await swipeAt(page, cc.x - ax * 10, cc.y - ay * 10, ax * 34, ay * 34); swipes++; last = { ax: Math.round(ax * 10) / 10, ay: Math.round(ay * 10) / 10, nd: Math.round(nd) }; }
        await sleep(160);
    }
    return { swipes, last };
}

// ---- TACTICS: what a coach decides, from the situation ----
// Field: 20 px per yard; _6F is signed yards from midfield toward the opponent's
// goal (+50 = goal line). The uprights sit 10 yards behind the goal line.
const T = {
    yardsToGoal: s => 50 - Number(s.y6f),
    fgDistance: s => 50 - Number(s.y6f) + 17,                       // LOS -> uprights (+ the 7-yard hold)
    // a good press gives e0 ~ 100 * M11, M11 = .065 + .001235 * leg(1..10); the ball must be
    // >= 60 high at the uprights (kick gravity .03/frame): leg 5 ~ 55 yd, leg 10 ~ 70 yd. Keep margin.
    fgRange: s => { const leg = Math.max(1, Math.min(10, Number(s.kickerLeg) || 5)); return Math.round(41 + leg * 1.9); },   // leg 1 ~43, leg 10 ~60 (physics ~46..65 minus the power-press margin)
    lead: s => Number(s.su) - Number(s.so),
    late: s => (s.q === 2 || s.q >= 4) && s.clk <= 60,
    last: s => s.q >= 4 && s.clk <= 120,
    // 4th down: 'fg' | 'go' | 'punt'
    fourth: s => {
        const ytg = Number(s.ytg), ytgoal = T.yardsToGoal(s), lead = T.lead(s);
        if (T.fgDistance(s) <= T.fgRange(s) && !(ytg <= 1 && ytgoal <= 3) && !(T.last(s) && lead < -3)) return 'fg';
        if (T.last(s) && lead < 0) return 'go';                        // trailing, last two minutes: no punting
        if (ytg <= 1) return ytgoal <= 60 ? 'go' : 'punt';
        if (ytg <= 3 && ytgoal <= 45) return 'go';
        if (ytg <= 5 && ytgoal <= 35 && lead <= 0) return 'go';
        if (s.q === 2 && s.clk <= 25 && lead <= 0 && ytgoal <= 50) return 'go';
        return 'punt';
    },
    // after a touchdown: 1 or 2 (the +6 is already on the board when the dialog shows)
    pat: s => {
        const lead = T.lead(s);
        if (s.q < 4 && !(s.q === 3 && s.clk < 30)) return 1;
        if ([-2, -5, -10, -13, 1, 4, 5, 12].includes(lead)) return 2;
        return 1;
    },
    // 'run' | 'pass' before the snap (bestSep = the best forecast separation, px)
    playType: (s, bestSep, rnd) => {
        const ytg = Number(s.ytg), ytgoal = T.yardsToGoal(s), lead = T.lead(s), d = Number(s.down);
        if (s.q >= 4 && lead > 0 && s.clk <= 90 && d <= 3) return 'run';   // leading late: keep the clock moving
        if (T.last(s) && lead < 0) return 'pass';                         // trailing late: no
        if (ytg <= 2 && d >= 2) return 'run';
        if (ytgoal <= 3) return rnd < 0.6 ? 'run' : 'pass';
        if (d === 1 && ytgoal > 15 && rnd < 0.3) return 'run';
        if (bestSep != null && bestSep < 22 && d <= 2 && ytg <= 6) return 'run';
        return 'pass';
    },
    // the routes on the field can't reach the sticks on 3rd/4th down: change the play (once)
    wantAudible: (s, deepest) => (Number(s.down) >= 3 && deepest != null && deepest < Number(s.ytg) * 20 - 10),
    // a timeout: trailing, late in the half, clock running after an in-bounds play
    wantTimeout: (s, clockRunning) => T.late(s) && T.lead(s) < 0 && clockRunning && s.clk > 3
};

// press a GUI button given its top-left + size (engine hit-test x..x+w, y..y+h)
async function pressGui(page, cal, b) {
    const x = cal.cal.left + (b.x + (b.w || 40) / 2) / 480 * cal.cal.w, y = cal.cal.top + (b.y + (b.h || 16) / 2) / 270 * cal.cal.h;
    await page.mouse.move(x, y); await sleep(50); await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(250);
}

// a RUN: the handoff is a press within 20 room px of the running back
async function runOne(page, cal, opts) {
    const log = (opts && opts.log) || (() => {});
    const s0 = await page.evaluate(IN.snap);
    const rb = s0.of.find(o => o.pos === 2);
    if (!rb || !s0.ball) return { result: 'none', why: 'no RB' };
    try { const c2 = await calibrate(page); if (isFinite(c2.rsx) && Math.abs(c2.rsx) > 0.1) cal = c2; } catch (e) {}
    const c = cal.toCss(rb.x, rb.y);
    if (!isFinite(c.x)) return { result: 'none', why: 'bad calibration' };
    await page.mouse.move(c.x, c.y); await sleep(40);
    const mr = await page.evaluate(IN.mouseRead); const missPx = Math.hypot(mr.rx - rb.x, mr.ry - rb.y);
    await page.mouse.down();
    let handed = false;
    for (let i = 0; i < 10; i++) { await sleep(20); const k = await page.evaluate(IN.snap); if (k.ctrl && k.ctrl.kp === 19) { handed = true; break; } }
    await sleep(60); await page.mouse.up();
    if (!handed) return { result: 'none', why: 'handoff not taken (press ' + Math.round(missPx) + ' px from the RB, ctrl kp ' + (await page.evaluate(IN.snap)).ctrl.kp + ')' };
    await sleep(250);
    const steer = await steerCarrier(page, cal, s0, opts);
    let end = null;
    for (let w = 0; w < 100; w++) { await sleep(100); const s = await page.evaluate(IN.snap); if (!s.ball) { end = s; break; } if (s.ball.kp === 0 && w > 5) { end = s; break; } if (s.down !== s0.down || s.waiting !== s0.waiting || s.btn > 0) { end = s; break; } }
    const gainYds = end ? (end.y6f - s0.y6f) : null;
    return { result: 'run', caughtBy: null, runner: rb.ln, end, s0, gainYds, steer };
}

// ---- a KICK (PAT / field goal / punt): the engine's two-tap kick ----
//   kp 0: a power meter (_D11) swings 0..55; a press starts the run-up (kp 1 -> release -> kp 2)
//   kp 2: when the kicker reaches the ball, an aim arrow (_101) swings 200..400 about the
//         goal line; the next press kicks with power (50 + meter) x kick_power. Meter < 15 = shank.
async function kickOne(page, cal, opts) {
    const log = (opts && opts.log) || (() => {});
    const t0 = Date.now();
    const c0 = await page.evaluate(IN.calib);
    const cx = c0.left + c0.w * 0.5, cy = c0.top + c0.h * 0.55;
    await page.mouse.move(cx, cy); await sleep(40);
    let phase = 'power', meterAt = null, arrowAt = null;
    while (Date.now() - t0 < 12000) {
        const s = await page.evaluate(IN.snap);
        if (!s.kick || !s.ctrl) return { result: 'none', why: 'not kicking' };
        const k = s.ctrl.kp;
        if (phase === 'power' && k === 0) {
            if (s.ctrl.meter >= 44 && s.ctrl.meterDir === 1) { await page.mouse.down(); await sleep(60); await page.mouse.up(); meterAt = s.ctrl.meter; phase = 'runup'; }
            await sleep(12); continue;
        }
        if (phase === 'runup') { if (k === 2) phase = 'aim'; else if (k > 2) phase = 'flight'; await sleep(20); continue; }
        if (phase === 'aim' && k === 2) {
            // the arrow swings 200..400; measure its speed from consecutive samples and press so that the
            // press (read ~1.5 frames later) lands on the middle
            const now = performance.now();
            if (kickOne.prev && s.ctrl.arrow !== kickOne.prev.a) { const dt = Math.max(1, (now - kickOne.prev.t) / 16.7); kickOne.v = Math.abs(s.ctrl.arrow - kickOne.prev.a) / dt; }
            kickOne.prev = { a: s.ctrl.arrow, t: now };
            const v = kickOne.v || 6;
            const toGo = (300 - s.ctrl.arrow) * (s.ctrl.meterDir || 1);       // + = approaching the middle
            const lead = v * 1.5;
            if (toGo >= -2 && toGo <= lead + 1) { await page.mouse.down(); await sleep(60); await page.mouse.up(); arrowAt = s.ctrl.arrow; kickOne.lead = { v: Math.round(v * 10) / 10, toGo: Math.round(toGo) }; phase = 'flight'; }
            await sleep(6); continue;
        }
        if (phase === 'flight') { if (k !== 2 && k !== 1 && k !== 0) break; if (Date.now() - t0 > 6000) break; await sleep(60); continue; }
        await sleep(20);
    }
    let end = null, kickedAng = null;
    for (let w = 0; w < 60; w++) { await sleep(150); const s = await page.evaluate(IN.snap); end = s; if (kickedAng == null && s.ball && s.ball.kp === 3) kickedAng = s.ball.ang; if (!s.kick || !s.ctrl || s.ctrl.kp === 0 || s.btn > 0) break; }
    log('  kick: power ' + meterAt + ' aim ' + arrowAt + (kickOne.lead ? ' (v ' + kickOne.lead.v + '/f, pressed ' + kickOne.lead.toGo + ' early)' : '') + ' angle ' + kickedAng + ' -> ' + (end ? end.su + '-' + end.so : '?'));
    kickOne.prev = null; kickOne.v = null; kickOne.lead = null;
    return { result: 'kick', meterAt, arrowAt, end };
}

// ---- a WHOLE game: play whichever phone has the ball until the final whistle ----
async function playGame(pages, opts) {
    opts = opts || {};
    const log = opts.log || console.log;
    const cals = {};
    for (const p of pages) { cals[p.role] = await calibrate(p.page); await p.page.evaluate('window.__snap = ' + IN.snap.toString() + '; window.__lite = ' + IN.lite.toString()); }
    const t0 = Date.now(); let plays = 0, completions = 0, attempts = 0, lastShot = 0, lastState = 0, front = null; const results = []; const lastClockRunning = {}, timeoutsUsed = {}, audibled = {};
    const over = async () => { for (const p of pages) { const o = await p.page.evaluate(() => window._rb2p_gameOverReported === true || (() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display !== 'none'); })()); if (o) return p.role; } return null; };
    while (Date.now() - t0 < (opts.maxMs || 15 * 60000)) {
        const done = await over(); if (done) { log('GAME OVER (final on phone ' + done + ')'); break; }
        let anyLive = false;
        if (opts.onTick && Date.now() - lastShot > (opts.shotEveryMs || 25000)) { lastShot = Date.now(); try { await opts.onTick(); } catch (e) {} }
        let acted = false;
        for (const p of pages) {
          try {
            const s = await p.page.evaluate(IN.snap);
            if (s.over) continue; anyLive = true;
            if (Date.now() - lastState > 8000) { lastState = Date.now(); log('  [' + p.role + '] waiting=' + s.waiting + ' btn=' + s.btn + ' ball=' + (s.ball ? 'kp' + s.ball.kp : '-') + ' kpc=' + s.kpc + ' vy=' + s.vy + ' Q' + (await p.page.evaluate(() => RB.engineState().engineQuarter)) + ' ' + s.su + '-' + s.so); }
            if (s.btn > 0) {
                if (front !== p.role) { try { await p.page.bringToFront(); } catch (e) {} front = p.role; }
                const n = await clickButtons(p.page, cals[p.role], log); log('  [' + p.role + '] pressed ' + n); acted = true; await sleep(600); continue;
            }
            // a kick (PAT / FG / punt) — the kicking phone may carry the bridge's waiting flag during its PAT
            if (s.kick && s.ctrl && s.ctrl.kp <= 2 && s.ball) {
                if (front !== p.role) { try { await p.page.bringToFront(); } catch (e) {} front = p.role; await sleep(150); }
                const kr = await kickOne(p.page, cals[p.role], { log });
                if (kr.result === 'kick') { plays++; acted = true; log('play ' + plays + ' [' + p.role + '] KICK (' + (s.pat ? 'PAT' : 'FG/punt') + ')'); results.push({ role: p.role, result: 'kick' }); await sleep(500); continue; }
            }
            if (s.waiting) continue;
            if (!s.ball || (s.ball.kp !== 0 && s.ball.kp !== 1) || s.kpc !== 2) continue;
            if (front !== p.role) { try { await p.page.bringToFront(); } catch (e) {} front = p.role; await sleep(150); }
            // a timeout? (trailing late, clock running after an in-bounds play)
            if (T.wantTimeout(s, lastClockRunning[p.role]) && !timeoutsUsed[p.role + s.q]) {
                const tb = await p.page.evaluate(() => { const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of inst) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_btn_timeout') return { x: x.x, y: x.y, w: Number(x._8l1) || 0, h: Number(x._VI) || 0 }; return null; });
                if (tb) { await pressGui(p.page, cals[p.role], tb); timeoutsUsed[p.role + s.q] = true; log('  [' + p.role + '] TIMEOUT (trailing ' + T.lead(s) + ', ' + s.clk + 's left in Q' + s.q + ')'); await sleep(600); continue; }
            }
            // read the formation: best forecast separation and the deepest route on the field
            let bestSep = null, deepest = null;
            try {
                const routes = [];
                for (const o of s.of) if (o.pos !== 1 && o.pos !== 5 && o.route >= 0) { const pts = await p.page.evaluate(IN.routePoints, o.route); const poly = routePolyline(o, pts); if (poly) routes.push({ o, poly }); }
                for (const r of routes) { const depth = Math.max(...r.poly.map(pt => (pt.x - s.scrimX) * s.dir)); if (deepest == null || depth > deepest) deepest = depth; }
            } catch (e) {}
            const situ = s.down + '&' + Math.round(s.ytg) + ' ' + (T.yardsToGoal(s) <= 50 ? 'opp ' + Math.round(T.yardsToGoal(s)) : 'own ' + Math.round(100 - T.yardsToGoal(s))) + ' Q' + s.q + ' ' + s.clk + 's ' + s.su + '-' + s.so;
            if (T.wantAudible(s, deepest) && s.audible && !audibled[p.role + s.down + Math.round(s.y6f)]) {
                audibled[p.role + s.down + Math.round(s.y6f)] = true;
                await pressGui(p.page, cals[p.role], s.audible); log('  [' + p.role + '] AUDIBLE (' + situ + ': deepest route ' + Math.round(deepest / 20) + ' yd, need ' + Math.round(s.ytg) + ')'); await sleep(500); continue;
            }
            const type = T.playType(s, bestSep, Math.random());
            log('  [' + p.role + '] ' + situ + ' -> ' + type.toUpperCase() + (deepest != null ? ' (deepest route ' + Math.round(deepest / 20) + ' yd)' : ''));
            let r;
            if (type === 'run') { r = await runOne(p.page, cals[p.role], { log }); if (r.result === 'none') { r = await playOne(p.page, cals[p.role], { log, minSep: opts.minSep, minHoldMs: opts.minHoldMs, forceMs: opts.forceMs }); } }
            else r = await playOne(p.page, cals[p.role], { log, minSep: opts.minSep, minHoldMs: opts.minHoldMs, forceMs: opts.forceMs, onAir: opts.onAir ? (() => opts.onAir(p.role, plays + 1)) : null });
            if (r.result === 'none') { log('  [' + p.role + '] no play: ' + r.why); await sleep(400); continue; }
            plays++; acted = true;
            if (r.decided && !r.decided.thrownAway) attempts++;
            if (r.result === 'complete') completions++;
            const d = r.decided;
            lastClockRunning[p.role] = (r.result === 'complete' || r.result === 'run');
            log('play ' + plays + ' [' + p.role + ' ' + situ + '] ' + (type === 'run' ? 'RUN' : 'PASS') + ' -> ' + r.result.toUpperCase() + (r.caughtBy ? ' to ' + r.caughtBy : '') + (r.runner ? ' ' + r.runner : '') + (r.intBy ? ' by ' + r.intBy : '') +
                (d && !d.thrownAway ? ' | ' + d.top.o.ln + ' sep ' + Math.round(d.top.sep) + ' held ' + d.held + 'ms' + (d.forced ? ' forced' : '') : '') + (r.gainYds != null ? ' | ' + Math.round(r.gainYds) + ' yd' : '') + (r.steer && r.steer.swipes ? ' | steered x' + r.steer.swipes : '') + (r.predErr ? ' | err ' + r.predErr.px + 'px along ' + r.predErr.along + ' flight ' + r.predErr.flightFrames + '/' + r.predErr.predFrames : ''));
            results.push({ role: p.role, type, result: r.result, to: r.caughtBy, by: r.intBy, gain: r.gainYds });
            await sleep(500);
          } catch (e) {
            anyLive = true;
            log('  [' + p.role + '] page hiccup (' + String(e && e.message).slice(0, 60) + ') — the phone probably reloaded; waiting for it');
            try { await p.page.mouse.up(); } catch (e2) {}
            await sleep(2500);
            try { cals[p.role] = await calibrate(p.page); await p.page.evaluate('window.__snap = ' + IN.snap.toString() + '; window.__lite = ' + IN.lite.toString()); } catch (e3) {}
          }
        }
        if (!anyLive) { log('GAME OVER (match room left)'); break; }
        if (!acted) await sleep(400);
    }
    const finals = {};
    for (const p of pages) finals[p.role] = await p.page.evaluate(() => { const s = RB.engineState(); if (!s) return null; return { su: s.userScore, so: s.opponentScore, q: s.engineQuarter, team: (s.engineTeamDisplayNames || [])[s.engineUserTeamIdx] }; });
    return { plays, attempts, completions, results, finals, ms: Date.now() - t0 };
}

module.exports = { IN, T, simThrow, rangeFor, e0ForRange, routePolyline, predictAlongRoute, calibrate, playOne, runOne, playUntil, playGame, kickOne, clickButtons, pressGui, steerCarrier, swipeAt };

if (require.main === module) {
    // standalone: vs the KC AI in the single-page harness
    const H = require('./harness');
    (async () => {
        await H.ensureServer();
        const browser = await H.launchBrowser();
        try {
            const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
            const dif = Number(process.env.DIF || -5);   // -5 = the lobby's MAX (the default two-player difficulty)
            await page.evaluate((dif) => { window._rb2p_computeDefenseAggression = () => dif; const s = RB.engineState(); if (s) s.engineDefenseAggression = dif; }, dif);
            await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
            await sleep(1500);
            const r = await playUntil(page, { maxPlays: Number(process.argv[2] || 12), consecutive: 2 });
            console.log('RESULT ' + JSON.stringify({ ok: r.ok, plays: r.plays, completions: r.completions }));
        } finally { await browser.close(); }
    })().catch(e => { console.error('FATAL', e); process.exit(2); });
}
