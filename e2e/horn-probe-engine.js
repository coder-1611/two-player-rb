// e2e/horn-probe-engine.js — RESEARCH PROBE (HORN-RESEARCH.md, question 2): what the engine and the bridge really do
// when a quarter's clock runs out during a REAL down (QB bot, trusted input), at each horn.
//
// Records on BOTH phones, from just before the snap to well after the next quarter starts:
//   - every call of the engine's end-of-quarter scripts (global wrappers: _Ib1 s_update_commentary, _hB
//     s_action_result, _eb1 s_set_up_play, _Qb1 is_quarter_over, _Iy kickoff button, _Ky its press, _1d1
//     s_end_match, _1c1 s_change_possession) with the FSM stage / quarter / clock before and after;
//   - the FSM state every 10 ms when it changes (Wy, Vy, kp, 7z, clock, possession, spot, down, ball, kickoff button);
//   - every bridge diag line (the ring holds ~11, so the logger is wrapped).
// Usage: RB_E2E_PORT=8830 node e2e/horn-probe-engine.js [Q1,Q2,Q3,Q4]   (default: all four horns, in order)
const H = require('./harness');
const TP = require('./two-player');
const QB = require('./qb-bot');
const fs = require('fs');
const path = require('path');
const sleep = H.sleep;
const OUT = process.env.HORN_OUT || path.join(__dirname, '..', '..', 'research', 'probe-out');

function install() {
    if (window.__hz) return 'already';
    const hz = window.__hz = { log: [], calls: [], diag: [], last: '' };
    const raw = () => { try { return RB.engineState().rawEngineMatch; } catch (e) { return null; } };
    const brief = () => { const m = raw(); if (!m) return null; return { Wy: m._Wy, Vy: m._Vy, kp: m._kp, z7: m._7z, clk: Number(m._r11) * 60 + Number(m._s11), UD: m._UD, d: m._t11 }; };
    const od = window._rb2p_diagLog;
    if (typeof od === 'function' && !od.__hz) {
        const w = function (msg) { try { hz.diag.push([Date.now(), String(msg)]); if (hz.diag.length > 3000) hz.diag.shift(); } catch (e) {} return od.apply(this, arguments); };
        w.__hz = true; window._rb2p_diagLog = w;
    }
    for (const name of ['_Ib1', '_hB', '_eb1', '_Qb1', '_Iy', '_Ky', '_1d1', '_1c1', '_Sc1', '_Dc1', '_Zb1']) {
        const f = window[name];
        if (typeof f !== 'function' || f.__hz) continue;
        const w = function () {
            const b = brief(); let r, err = null;
            try { r = f.apply(this, arguments); } catch (e) { err = String(e && e.message || e); throw e; }
            finally { try { hz.calls.push({ t: Date.now(), fn: name, arg: arguments.length > 2 ? arguments[2] : undefined, b, a: brief(), r: (typeof r === 'number' ? r : undefined), err }); if (hz.calls.length > 4000) hz.calls.shift(); } catch (e2) {} }
            return r;
        };
        w.__hz = true; window[name] = w;
    }
    setInterval(() => {
        try {
            const m = raw(); if (!m) return;
            const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let ball = 0, bkp = null; const ko = [];
            for (const x of inst) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2;
                if (n === 'obj_ball') { ball++; bkp = x._kp; } else if (n === 'obj_btn_kickoff') ko.push(String(x._3z || '?')); }
            const row = { Wy: m._Wy, Vy: m._Vy, kp: m._kp, z7: m._7z, clk: Number(m._r11) * 60 + Number(m._s11), Yc1: m._Yc1, UD: m._UD, oz: m._0z,
                          y: Math.round(Number(m._6F) * 10) / 10, d: m._t11, tg: Math.round(Number(m._l61) * 10) / 10, d01: m._0d1, ball, bkp, ko: ko.join('/'),
                          wait: window._rb2p_userIsWaitingForOpponent === true, su: RB.engineState().userScore, so: RB.engineState().opponentScore };
            const key = JSON.stringify(row);
            if (key !== hz.last) { hz.last = key; row.t = Date.now(); hz.log.push(row); if (hz.log.length > 6000) hz.log.shift(); }
        } catch (e) {}
    }, 10);
    let g = {}; try { g = { mu: global._mu, Mr: global._Mr, H01: global._H01, pokiFn: typeof window.poki_commercial_break_raw, y: raw().__y, oz: raw()._0z, UD: raw()._UD, Ws: _jj(raw(), _Sc2, 64)._Ws, qmins: window._rb2p_quarterMins, qlen: window._rb2p_quarterLenSec, role: window._rb2p_myFirebaseRole }; } catch (e) { g.err = String(e); }
    return g;
}
const st = page => page.evaluate(() => { try { const s = RB.engineState(); return { q: Number(s.engineQuarter), clk: Number(s.engineMinutesLeft) * 60 + Number(s.engineSecondsLeft), wait: window._rb2p_userIsWaitingForOpponent === true, vy: s.engineDriveFsmStage, su: s.userScore, so: s.opponentScore, role: window._rb2p_myFirebaseRole }; } catch (e) { return null; } }).catch(() => null);
const audit = async (code, role) => Object.values(await TP.fbGet('rooms/' + code + '/audit/' + role) || {});

async function playDown(page, tries) {
    for (let i = 0; i < (tries || 4); i++) {
        let cal = null; try { cal = await QB.calibrate(page); } catch (e) {}
        try { await QB.clickButtons(page, cal, () => {}); } catch (e) {}
        let rr = null; try { rr = await QB.runOne(page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; }
        if (rr && rr.result === 'none') { try { rr = await QB.playOne(page, cal, {}); } catch (e) { rr = { result: 'err ' + e.message }; } }
        if (rr && rr.result && rr.result !== 'none' && !/^err/.test(rr.result)) return rr;
        await sleep(1500);
    }
    return null;
}
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return v; await sleep(every || 500); } return v || {}; }

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const horns = (process.argv[2] || 'Q1,Q2,Q3,Q4').split(',').map(s => Number(String(s).replace(/\D/g, '')));
    const g = await TP.startTwoPlayerGame({});
    console.log('room ' + g.code);
    await sleep(6000);
    const ga = await g.a.page.evaluate(install), gb = await g.b.page.evaluate(install);
    console.log('globals a ' + JSON.stringify(ga) + '\n        b ' + JSON.stringify(gb));
    const results = [];
    for (const q of horns) {
        // the phone with the ball in quarter q
        const r = await until(async () => { const A = await st(g.a.page), B = await st(g.b.page); const off = A && !A.wait && A.q === q ? g.a : (B && !B.wait && B.q === q ? g.b : null); return { ok: !!off, off, A, B }; }, 90000, 1000);
        if (!r.ok) { console.log('Q' + q + ': nobody has the ball in Q' + q + ' — ' + JSON.stringify({ A: r.A, B: r.B })); break; }
        const off = r.off, def = off === g.a ? g.b : g.a;
        if (q === 4) await off.page.evaluate(() => { const s = RB.engineState(); s.setUserScore(Number(s.userScore) + 7); });   // a decided game at the final horn
        await sleep(1500);
        // the quarter's last seconds (the clock only goes down; no licence needed)
        await off.page.evaluate(() => { const s = RB.engineState(); s.engineMinutesLeft = 0; s.engineSecondsLeft = 3; s.engineTickAllowance = 0; });
        await sleep(2500);
        const t0 = Date.now();
        const before = { off: await st(off.page), def: await st(def.page) };
        const rr = await playDown(off.page, 4);
        console.log('Q' + q + ' horn: ' + off.role + ' played ' + JSON.stringify(rr && { result: rr.result, gain: rr.gainYds }) + ' from ' + JSON.stringify(before));
        const nextQ = q + 1;
        const done = await until(async () => { const A = await st(g.a.page), B = await st(g.b.page); return { ok: !!(A && B && A.q >= nextQ && B.q >= nextQ && A.wait !== B.wait && Math.max(A.clk, B.clk) > 0), A, B }; }, q === 4 ? 25000 : 45000, 1000);
        await sleep(4000);
        const after = { off: await st(off.page), def: await st(def.page) };
        console.log('   after: ' + JSON.stringify(after) + (done.ok ? '' : '  (did not settle: ' + JSON.stringify({ A: done.A, B: done.B }) + ')'));
        const dump = {};
        for (const P of [off, def]) {
            dump[P === off ? 'off' : 'def'] = await P.page.evaluate((t0) => { const z = window.__hz || {}; return { role: window._rb2p_myFirebaseRole, log: (z.log || []).filter(x => x.t >= t0 - 3000), calls: (z.calls || []).filter(x => x.t >= t0 - 3000), diag: (z.diag || []).filter(x => x[0] >= t0 - 3000) }; }, t0).catch(e => ({ err: String(e) }));
        }
        dump.audit = { a: (await audit(g.code, 'a')).filter(e => e.t >= t0 - 3000), b: (await audit(g.code, 'b')).filter(e => e.t >= t0 - 3000) };
        dump.meta = { q, room: g.code, offRole: off.role, before, after, play: rr && { result: rr.result, gain: rr.gainYds } };
        const f = path.join(OUT, 'engine-Q' + q + '-' + g.code + '.json');
        fs.writeFileSync(f, JSON.stringify(dump, null, 1));
        console.log('   wrote ' + f);
        results.push({ q, ok: done.ok });
        if (q === 4) break;
    }
    await g.cleanup();
    console.log(JSON.stringify(results));
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
