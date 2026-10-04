// e2e/max-return-speed.js — V459: in MAX the DBs keep their speed (1.5x) except while the defense RETURNS a turnover;
// then every DB runs at 1.2x HARD's DB accel (0.165). The owner: "after an interception ... DBs are comically fast" —
// "make it 1.2x of hard in max mode after int. Only touch max mode" — "keep the speed unless they're returning turnover".
// Real two-player games; a real throw (the QB bot) or a real run, and the engine's own catch: the probe only stands a
// defender where the ball comes down (and the intended receiver off it).
//   R1  MAX, an interception: in coverage the DBs run 1.5x their engine accel (0.24); from the pick, every DB 0.165
//       — the returner tiring below it, never above (the boost no longer compounds on the carrier's fatigue)
//   R2  MAX, a fumble recovered by a DB (the engine's ball state 10): every DB 0.165 while he returns it
//   R3  MAX, the boost never compounds: the engine's own fatigue step on a ball carrier (_j51 *= 0.9997 a frame,
//       retrobowl.js:66786) applied to a linebacker and a DB tires their boosted accel (+0.03 / 1.5x) — it never climbs
//       (before V459 each step was re-boosted: a carrier hit the 0.35 cap at once)
//   R4  HARD, an interception: the bridge never touches a defender's accel (the engine's own numbers)
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// per frame: the ball, and every defender's accel (with the bridge's captured base/spawn); the forced pick or recovery
const SAMPLER = (mode) => {
    const ip = window.__ip = { rows: [], db: null, mode: mode.kind, pos: mode.pos, forcedAt: 0 };
    if (window.__ipLoop) return;
    window.__ipLoop = true;
    const loop = () => {
        const ip = window.__ip;
        try {
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let ball = null; const df = [], of = [];
            for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2;
                if (n === 'obj_ball') ball = x; else if (n === 'obj_playerDF') df.push(x); else if (n === 'obj_playerOF') of.push(x); }
            const want = d => ip.pos === 7 ? d._O01 === 7 : d._O01 >= 8;
            const nearest = (tx, ty) => { let b = null, bd = 1e9; for (const d of df) { if (!want(d)) continue; const dd = Math.hypot(d.x - tx, d.y - ty); if (dd < bd) { bd = dd; b = d; } } return b; };
            if (ball && ip.mode === 'int' && ball._kp === 3) {   // a pass in the air: the defender stands where it comes down
                let sh = null; try { sh = _jj(RB.engineState().rawEngineMatch, _Sc2, 78); } catch (e) {}
                const tx = sh ? Number(sh._w31) : ball.x, ty = sh ? Number(sh._x31) : ball.y;
                if (!ip.db) ip.db = nearest(tx, ty);
                if (ip.db && isFinite(tx) && isFinite(ty)) { ip.db.x = tx; ip.db.y = ty; ip.db._Da = 0; ip.db._Ea = 0; ip.forcedAt = ip.forcedAt || performance.now(); }
                for (const o of of) { if (o._O01 === 1 || o._O01 === 5) continue; if (Math.hypot(o.x - tx, o.y - ty) < 70) { o.x = tx + (o.x >= tx ? 90 : -90); o.y = ty; o._Da = 0; o._Ea = 0; } }
            }
            if (ball && ip.mode === 'fumble') {
                // a run: once the carrier has had it a moment, the ball comes loose where he is and a DB falls on it
                if (ball._kp === 5 && !ip.loose) { ip.carryT = ip.carryT || performance.now();
                    if (performance.now() - ip.carryT > 700) { const h = all.find(x => x && x.id === ((ball._X_ && typeof ball._X_ === 'object') ? ball._X_.id : ball._X_));
                        if (h) { ip.loose = { x: h.x, y: h.y }; ball._X_ = -4; ball._kp = 13; ball.x = h.x; ball.y = h.y; ball._Y11 = 0; ball._n31 = 0; ball._p31 = h.x - 400; ball._q31 = h.y; ip.forcedAt = performance.now(); } } }
                if (ip.loose && ball._kp === 13) { if (!ip.db) ip.db = nearest(ball.x, ball.y); if (ip.db) { ip.db.x = ball.x; ip.db.y = ball.y; ip.db._Da = 0; ip.db._Ea = 0; }
                    for (const o of of) if (Math.hypot(o.x - ball.x, o.y - ball.y) < 60) { o.x = ball.x - 120; o._Da = 0; o._Ea = 0; } }
            }
            if (ball && ball._kp > 0) {
                ip.rows.push({ t: performance.now(), kp: ball._kp, hold: (ball._X_ && typeof ball._X_ === 'object') ? ball._X_.id : ball._X_,
                    df: df.map(d => [d.id, d._O01, d._j51, d._rb2p_j51base, d._rb2p_j51spawn, d._rb2p_j51out]) });
                if (ip.rows.length > 3000) ip.rows.shift();
            }
        } catch (e) { ip.err = String(e && e.message || e); }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
};

async function scenario(diff, kind, pos) {
    const g = await TP.startTwoPlayerGame({ beforeReady: async (page) => { try { await page.click('.diff-btn[data-dif="' + diff + '"]'); } catch (e) {} } });
    try {
        await sleep(6000);
        for (let i = 0; i < 7; i++) {
            const o = await L.offense(g, 40000); if (!o.ok) continue;
            const P = o.off.page;
            await P.evaluate(SAMPLER, { kind, pos });
            let cal = null; try { cal = await L.QB.calibrate(P); } catch (e) {}
            try { await L.QB.clickButtons(P, cal, () => {}); } catch (e) {}
            try { if (kind === 'int') await L.QB.playOne(P, cal, { minSep: -999, forceMs: 99999, maxHoldMs: 3200 }); else await L.QB.runOne(P, cal, {}); } catch (e) {}
            await sleep(7000);
            const r = await P.evaluate(() => ({ rows: window.__ip.rows, db: window.__ip.db && window.__ip.db.id, err: window.__ip.err, pref: window._rb2p_difficultyPref() }));
            const k = kind === 'int' ? 9 : 10;
            if (r.rows.some(x => x.kp === k && x.hold === r.db)) return r;
            console.log('    (' + diff + ' ' + kind + ' try ' + i + ': no ' + (kind === 'int' ? 'pick' : 'recovery') + (r.err ? ', ' + r.err : '') + ')');
        }
        return null;
    } finally { try { await g.cleanup(); } catch (e) {} }
}
const f4 = v => v == null ? '-' : Number(v).toFixed(4);
const returnRows = (r, k) => { const i = r.rows.findIndex(x => x.kp === k); let j = i; while (j + 1 < r.rows.length && r.rows[j + 1].kp === k) j++; return { pre: r.rows.slice(0, i), ret: r.rows.slice(i, j + 1) }; };

(async () => {
    console.log('=== V459 MAX: DBs at 1.2x HARD only while returning a turnover ===');
    // ---- R1: MAX, an interception by a DB ----
    const r1 = await scenario('max', 'int', 9);
    if (!r1) check('R1 MAX interception', false, 'no interception produced'); else {
        const { pre, ret } = returnRows(r1, 9);
        const lastPre = pre[pre.length - 1], dbsPre = lastPre.df.filter(d => d[1] >= 8);
        const covOk = dbsPre.every(d => Math.abs(d[2] - 1.5 * d[3]) < 0.002);
        let maxRet = 0, minRet = 1, picker = [];
        for (const row of ret.slice(2)) for (const d of row.df) if (d[1] >= 8) { maxRet = Math.max(maxRet, d[2]); minRet = Math.min(minRet, d[2]); if (d[0] === r1.db) picker.push(d[2]); }
        console.log('  coverage: ' + dbsPre.map(d => f4(d[2]) + '/' + f4(d[3])).join(' ') + ' | return (' + ret.length + ' frames): DBs ' + f4(minRet) + '–' + f4(maxRet) +
                    ' | the returner ' + f4(picker[0]) + ' -> ' + f4(picker[picker.length - 1]));
        check('R1 MAX: DBs keep 1.5x in coverage; from the pick every DB runs 0.165 (1.2x HARD), the returner tiring below it, never above',
              covOk && ret.length > 20 && maxRet <= 0.1651 && minRet >= 0.14 && picker.length > 10 && picker[picker.length - 1] < picker[0],
              JSON.stringify({ covOk, frames: ret.length, minRet, maxRet, picker0: picker[0], pickerN: picker[picker.length - 1] }));
    }
    // ---- R2: MAX, a fumble recovered by a DB ----
    const r2 = await scenario('max', 'fumble', 9);
    if (!r2) check('R2 MAX fumble recovered by a DB', false, 'no recovery produced'); else {
        const { ret } = returnRows(r2, 10);
        let maxRet = 0, minRet = 1; for (const row of ret.slice(2)) for (const d of row.df) if (d[1] >= 8) { maxRet = Math.max(maxRet, d[2]); minRet = Math.min(minRet, d[2]); }
        console.log('  fumble return (' + ret.length + ' frames): DBs ' + f4(minRet) + '–' + f4(maxRet));
        check('R2 MAX: a fumble recovered by a DB — every DB runs 0.165 while he returns it', ret.length > 5 && maxRet <= 0.1651 && minRet >= 0.14, JSON.stringify({ frames: ret.length, minRet, maxRet }));
    }
    // ---- R3: MAX, the engine's fatigue step on a linebacker and a DB: their boost tires, never climbs ----
    {
        const g = await TP.startTwoPlayerGame({ beforeReady: async (page) => { try { await page.click('.diff-btn[data-dif="max"]'); } catch (e) {} } });
        try {
            await sleep(6000);
            const o = await L.offense(g, 40000);
            const r3 = o.ok ? await o.off.page.evaluate(() => new Promise(res => {
                const pick = p => { for (const x of _Sc2._GL2._oq2) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerDF' && p(x._O01) && x._rb2p_j51spawn) return x; return null; };
                const lb = pick(n => n === 7), db = pick(n => n >= 8);
                if (!lb || !db) return res({ err: 'no LB/DB' });
                const s0 = { lb: lb._rb2p_j51spawn, db: db._rb2p_j51spawn, lbOut: lb._j51, dbOut: db._j51 }, seq = [];
                let k = 0;
                const step = () => {   // what the engine does to a ball carrier each step, then the bridge runs
                    lb._j51 *= 0.9997; db._j51 *= 0.9997;
                    if (++k % 10 === 0) seq.push([lb._j51, db._j51]);
                    if (k < 150) requestAnimationFrame(step);
                    else setTimeout(() => { const live = x => !x._HL2 && _Sc2._GL2._oq2.indexOf(x) >= 0 && x._rb2p_j51out === x._j51;   // still on the field, still the bridge's
                        res({ s0, seq, lbEnd: lb._j51, dbEnd: db._j51, live: live(lb) && live(db) }); }, 50);
                };
                requestAnimationFrame(step);
            })) : { err: 'nobody has the ball' };
            if (r3.err || !r3.live) check('R3 MAX: the boost never compounds', false, r3.err || 'the players left the field mid-test'); else {
                const lbTop = Math.max(...r3.seq.map(x => x[0])), dbTop = Math.max(...r3.seq.map(x => x[1]));
                console.log('  fatigue x150: LB ' + f4(r3.s0.lbOut) + ' (spawn ' + f4(r3.s0.lb) + ') -> ' + f4(r3.lbEnd) + ', top ' + f4(lbTop) +
                            ' | DB ' + f4(r3.s0.dbOut) + ' (spawn ' + f4(r3.s0.db) + ') -> ' + f4(r3.dbEnd) + ', top ' + f4(dbTop));
                check('R3 MAX: the engine\'s fatigue step tires a boosted linebacker (+0.03) and DB (1.5x) — it never climbs (no compounding)',
                      lbTop <= r3.s0.lb + 0.0301 && r3.lbEnd < r3.s0.lbOut && dbTop <= 1.5 * r3.s0.db + 0.0005 && r3.dbEnd < r3.s0.dbOut,
                      JSON.stringify({ s0: r3.s0, lbTop, dbTop, lbEnd: r3.lbEnd, dbEnd: r3.dbEnd }));
            }
        } finally { try { await g.cleanup(); } catch (e) {} }
    }
    // ---- R4: HARD, an interception: the bridge leaves every defender alone ----
    const r4 = await scenario('hard', 'int', 9);
    if (!r4) check('R4 HARD interception', false, 'no interception produced'); else {
        const touched = r4.rows.some(row => row.df.some(d => d[5] != null));
        const { ret } = returnRows(r4, 9);
        const vals = [...new Set(ret.flatMap(row => row.df.filter(d => d[1] >= 8 && d[0] !== r4.db).map(d => f4(d[2]))))];
        console.log('  HARD: the bridge wrote an accel: ' + touched + ' | DBs in the return: ' + vals.join(' '));
        check('R4 HARD: the bridge never touches a defender\'s accel (no 0.165, no boost)', !touched && !vals.includes('0.1650'), JSON.stringify({ touched, vals }));
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
