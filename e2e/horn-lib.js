// e2e/horn-lib.js — shared helpers for the horn research tests (HORN-RESEARCH.md). Real downs only: every play here is
// a QB-bot run or pass through trusted input; the only writes are the SETUP of a down (quarter, clock, score, down and
// distance) before the snap — never the drive end, never a possession change, never an engine script call.
const H = require('./harness');
const TP = require('./two-player');
const QB = require('./qb-bot');
const sleep = H.sleep;

// in-page recorder: FSM samples (on change, 10 ms), every bridge diag line, and the engine's end-of-quarter calls
function installRecorder() {
    if (window.__hz) return 'already';
    const hz = window.__hz = { log: [], calls: [], diag: [], last: '' };
    const raw = () => { try { return RB.engineState().rawEngineMatch; } catch (e) { return null; } };
    const brief = () => { const m = raw(); if (!m) return null; return { Wy: m._Wy, Vy: m._Vy, kp: m._kp, z7: m._7z, clk: Number(m._r11) * 60 + Number(m._s11), UD: m._UD, d: m._t11 }; };
    const od = window._rb2p_diagLog;
    if (typeof od === 'function' && !od.__hz) {
        const w = function (msg) { try { hz.diag.push([Date.now(), String(msg)]); if (hz.diag.length > 4000) hz.diag.shift(); } catch (e) {} return od.apply(this, arguments); };
        w.__hz = true; window._rb2p_diagLog = w;
    }
    for (const name of ['_hB', '_eb1', '_Qb1', '_Iy', '_Ky', '_1d1', '_1c1']) {
        const f = window[name];
        if (typeof f !== 'function' || f.__hz) continue;
        const w = function () {
            const b = brief(); let r, err = null;
            try { r = f.apply(this, arguments); } catch (e) { err = String(e && e.message || e); throw e; }
            finally { try { hz.calls.push({ t: Date.now(), fn: name, arg: arguments.length > 2 ? arguments[2] : undefined, b, a: brief(), err }); if (hz.calls.length > 4000) hz.calls.shift(); } catch (e2) {} }
            return r;
        };
        w.__hz = true; window[name] = w;
    }
    setInterval(() => {
        try {
            const m = raw(); if (!m) return;
            const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let ball = 0; const ko = [];
            for (const x of inst) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2; if (n === 'obj_ball') ball++; else if (n === 'obj_btn_kickoff') ko.push(String(x._3z || '?')); }
            const s = RB.engineState();
            const row = { Wy: m._Wy, Vy: m._Vy, kp: m._kp, z7: m._7z, clk: Number(m._r11) * 60 + Number(m._s11), UD: m._UD, oz: m._0z,
                          y: Math.round(Number(m._6F) * 10) / 10, d: m._t11, tg: Math.round(Number(m._l61) * 10) / 10, ball, ko: ko.join('/'),
                          wait: window._rb2p_userIsWaitingForOpponent === true, su: s.userScore, so: s.opponentScore };
            const key = JSON.stringify(row);
            if (key !== hz.last) { hz.last = key; row.t = Date.now(); hz.log.push(row); if (hz.log.length > 8000) hz.log.shift(); }
        } catch (e) {}
    }, 10);
    return 'installed';
}

const st = page => page.evaluate(() => {
    // after the final the engine leaves the match room (no engine state): the game-over fields must still read
    const over = window._rb2p_gameOverReported === true;
    const final = (function () { try { const f = document.getElementById('rb-final'); return !!(f && f.style.display !== 'none' && f.offsetParent !== null); } catch (e) { return false; } })();
    try { if (!RB.engineState() || !RB.engineState().rawEngineMatch) return { q: null, over, final, role: window._rb2p_myFirebaseRole, noEngine: true }; } catch (e) { return { q: null, over, final, role: window._rb2p_myFirebaseRole, noEngine: true }; }
    try {
        const s = RB.engineState(); const m = s.rawEngineMatch;
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let ball = 0;
        for (const x of inst) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') ball++;
        return { q: Number(s.engineQuarter), clk: Number(s.engineMinutesLeft) * 60 + Number(s.engineSecondsLeft), wait: window._rb2p_userIsWaitingForOpponent === true,
                 vy: Number(m._Vy), kp: Number(m._kp), y: Math.round(Number(s.engineYardLineSigned) * 10) / 10, d: Number(s.engineDownNumber), tg: Math.round(Number(s.engineYardsToGo) * 10) / 10,
                 su: Number(s.userScore), so: Number(s.opponentScore), ball, role: window._rb2p_myFirebaseRole, over: window._rb2p_gameOverReported === true,
                 final: (function () { try { const f = document.getElementById('rb-final'); return !!(f && f.style.display !== 'none' && f.offsetParent !== null); } catch (e) { return false; } })() };
    } catch (e) { return null; }
}).catch(() => null);
const audit = async (code, role) => Object.values(await TP.fbGet('rooms/' + code + '/audit/' + role) || {});
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 400); } return Object.assign(v || {}, { ms: null }); }

// one REAL down on the phone with the ball: a run (no running back: a pass), through trusted input
async function realDown(page, opts) {
    opts = opts || {};
    for (let i = 0; i < (opts.tries || 4); i++) {
        let cal = null; try { cal = await QB.calibrate(page); } catch (e) {}
        if (opts.buttons !== false) { try { await QB.clickButtons(page, cal, () => {}); } catch (e) {} }
        let rr = null;
        if (opts.pass) { try { rr = await QB.playOne(page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; } }
        else { try { rr = await QB.runOne(page, cal, { straight: !!opts.straight }); } catch (e) { rr = { result: 'err ' + e.message }; }
               if (rr && rr.result === 'none') { try { rr = await QB.playOne(page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; } } }
        if (rr && rr.result && rr.result !== 'none' && !/^err/.test(rr.result)) return rr;
        await sleep(1500);
    }
    return null;
}

// the setup of a down: quarter (both phones), clock, score, down & distance — all BEFORE the snap
async function setQuarter(pages, q, clkSec) {
    for (const p of pages) await p.evaluate(({ q, clkSec }) => {
        const s = RB.engineState(); if (!s) return;
        if (window._rb2p_clockLicence) window._rb2p_clockLicence('test setup', 3000);
        window._rb2p_lastStableQuarter = q; window._rb2p_wireQuarter = q; s.engineQuarter = q;
        if (!window._rb2p_qToppedEver) window._rb2p_qToppedEver = {};
        for (let k = 1; k <= q; k++) window._rb2p_qToppedEver[k] = true;
        if (q >= 3) { window._rb2p_q3LawApplied = true; try { if (window._rb2p_flowNote) window._rb2p_flowNote('ep', { id: 'H', receiver: 'b' }); } catch (e) {} }
        if (clkSec != null) { s.engineMinutesLeft = Math.floor(clkSec / 60); s.engineSecondsLeft = clkSec % 60; s.engineTickAllowance = 0; }
    }, { q, clkSec });
}
async function setDown(page, opts) {
    return page.evaluate((o) => {
        const s = RB.engineState(); if (!s) return false;
        if (o.clk != null) { s.engineMinutesLeft = Math.floor(o.clk / 60); s.engineSecondsLeft = o.clk % 60; s.engineTickAllowance = 0; }
        if (o.down != null) s.engineDownNumber = o.down;
        if (o.toGo != null) s.engineYardsToGo = o.toGo;
        if (o.score) { s.setUserScore(o.score[0]); s.setOpponentScore(o.score[1]); }
        if (typeof window._rb2p_resyncScrimmage === 'function') window._rb2p_resyncScrimmage(s, 'test setup');
        return true;
    }, opts);
}
async function setMode(pages, mode) { for (const p of pages) { await p.evaluate(m => { window._rb2p_hornMode = m; }, mode); await p.evaluateOnNewDocument(m => { window._rb2p_hornMode = m; }, mode); } }   // a reload keeps the mode
async function dumpRecorder(page, t0) {
    return page.evaluate((t0) => { const z = window.__hz || {}; return { role: window._rb2p_myFirebaseRole, log: (z.log || []).filter(x => x.t >= t0), calls: (z.calls || []).filter(x => x.t >= t0), diag: (z.diag || []).filter(x => x[0] >= t0) }; }, t0).catch(e => ({ err: String(e) }));
}
// which page has the ball (live, a ball on the field) — waits up to ms
async function offense(g, ms) {
    return until(async () => { const A = await st(g.a.page), B = await st(g.b.page);
        const off = A && !A.wait && A.ball > 0 ? g.a : (B && !B.wait && B.ball > 0 ? g.b : null); return { ok: !!off, off, A, B }; }, ms || 30000, 500);
}

module.exports = { H, TP, QB, sleep, installRecorder, st, audit, until, realDown, setQuarter, setDown, setMode, dumpRecorder, offense };
