// e2e/fumble-popup.js — V461: a fumble's popup says FUMBLE, never INTERCEPTED. The owner: "when a fumble happens, the
// interception pop up happens". A real two-player game; the engine's own fumble (s_drop_ball, _W31 with a fumble) and
// its own recoveries — the probe only stands a player on the loose ball.
//   U1  a lost fumble: the carrier's phone names the takeaway FUMBLE (its event, read off the ball, marked exact) and
//       the other phone shows FUMBLE — never INTERCEPTED
//   U2  an interception: the event says INT and the other phone shows INTERCEPTED (no regression)
//   U3  a fumble the OFFENSE recovered, then the drive ends without a takeaway (a turnover on downs): the other phone
//       shows no takeaway popup at all (the drive's fumble count moved — that alone used to pop INTERCEPTED)
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// mode: 'lost' (a defender recovers), 'kept' (an offense player recovers), 'int' (a pass, picked)
const ARM = (mode) => {
    window.__fp = { mode, at: 0, done: false, kinds: [], after: [] };
    if (window.__fpLoop) return;
    window.__fpLoop = true;
    const loop = () => {
        const F = window.__fp;
        try {
            const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            let ball = null; const df = [], of = [];
            for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2;
                if (n === 'obj_ball') ball = x; else if (n === 'obj_playerDF') df.push(x); else if (n === 'obj_playerOF') of.push(x); }
            const tk = window._rb2p_takeawayKind && window._rb2p_takeawayKind(); if (tk && F.kinds[F.kinds.length - 1] !== tk) F.kinds.push(tk);
            if (ball && !F.done) {
                if ((F.mode === 'lost' || F.mode === 'kept') && ball._kp === 5 && !F.at) {   // a carrier: after a moment, the engine fumbles
                    F.carryT = F.carryT || performance.now();
                    if (performance.now() - F.carryT > 600) {
                        const hid = (ball._X_ && typeof ball._X_ === 'object') ? ball._X_.id : ball._X_;
                        const h = all.find(x => x && x.id === hid);
                        if (h) { _W31(h, h, 1); F.at = performance.now(); F.carrier = h.id;
                            // the engine lets a defender take a loose ball only 100 px or more from the last throw's spot
                            if (F.mode === 'lost') { ball._p31 = ball.x + 400; ball._q31 = ball.y; } }
                    }
                }
                if (F.at && (ball._kp === 3 || ball._kp === 13)) {   // loose: the recovering side stands on it
                    const mine = F.mode === 'kept' ? of.filter(o => o._O01 !== 5 && o.id !== F.carrier) : df.filter(d => d._O01 >= 6);
                    const other = F.mode === 'kept' ? df : of;
                    if (!F.who) { let b = null, bd = 1e9; for (const p of mine) { const dd = Math.hypot(p.x - ball.x, p.y - ball.y); if (dd < bd) { bd = dd; b = p; } } F.who = b; }
                    if (F.who) { F.who.x = ball.x; F.who.y = ball.y; F.who._Da = 0; F.who._Ea = 0; }
                    for (const o of other) if (Math.hypot(o.x - ball.x, o.y - ball.y) < 160) { o.x = ball.x + (o.x >= ball.x ? 200 : -200); o._Da = 0; o._Ea = 0; }
                }
                if (F.mode === 'int' && ball._kp === 3) {
                    let sh = null; try { sh = _jj(RB.engineState().rawEngineMatch, _Sc2, 78); } catch (e) {}
                    const tx = sh ? Number(sh._w31) : ball.x, ty = sh ? Number(sh._x31) : ball.y;
                    if (!F.who) { let b = null, bd = 1e9; for (const d of df) { if (d._O01 < 8) continue; const dd = Math.hypot(d.x - tx, d.y - ty); if (dd < bd) { bd = dd; b = d; } } F.who = b; }
                    if (F.who && isFinite(tx)) { F.who.x = tx; F.who.y = ty; F.who._Da = 0; F.who._Ea = 0; F.at = F.at || performance.now(); }
                    for (const o of of) { if (o._O01 === 1 || o._O01 === 5) continue; if (Math.hypot(o.x - tx, o.y - ty) < 70) { o.x = tx + (o.x >= tx ? 90 : -90); o.y = ty; o._Da = 0; o._Ea = 0; } }
                }
                if (F.at) F.kps = (F.kps || '') + (F.lastKp !== ball._kp ? ball._kp + ' ' : ''); F.lastKp = ball._kp;
                if (F.at) { const tk2 = window._rb2p_takeawayKind && window._rb2p_takeawayKind(); if (tk2 && F.after[F.after.length - 1] !== tk2) F.after.push(tk2); }
            }
        } catch (e) { F.err = String(e && e.message || e); }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
};
const blasts = (page, since) => page.evaluate((since) => (window._rb2p_cmtLog || []).filter(r => r.s === 'blast' && r.ms >= since).map(r => r.t + ' (' + r.lic + ')'), since).catch(() => []);
const now = page => page.evaluate(() => Date.now());
// which path showed it: the takeaway event ('EVT->' on the sender, 'EVT<-' on the receiver) or the hand-off ('BLAST@possession')
const paths = async (code, since) => { const out = [];
    for (const role of ['a', 'b']) for (const e of Object.values(await TP.fbGet('rooms/' + code + '/audit/' + role) || {}))
        if (e.k === 'diag' && e.t >= since && /EVT|BLAST@/.test(String(e.m))) out.push(role + ': ' + e.m);
    return out; };

async function play(g, mode, tries) {
    for (let i = 0; i < (tries || 6); i++) {
        const o = await L.offense(g, 45000); if (!o.ok) continue;
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        await OFF.page.evaluate(ARM, mode);
        const t0 = await now(DEF.page);
        let cal = null; try { cal = await L.QB.calibrate(OFF.page); } catch (e) {}
        try { await L.QB.clickButtons(OFF.page, cal, () => {}); } catch (e) {}
        try { if (mode === 'int') await L.QB.playOne(OFF.page, cal, { minSep: -999, forceMs: 99999, maxHoldMs: 3200 }); else await L.QB.runOne(OFF.page, cal, {}); } catch (e) {}
        await sleep(4000);
        const f = await OFF.page.evaluate(() => ({ at: !!window.__fp.at, kps: window.__fp.kps || '', kinds: window.__fp.kinds, err: window.__fp.err }));
        if (!f.at) { console.log('    (' + mode + ' try ' + i + ': not forced' + (f.err ? ', ' + f.err : '') + ')'); continue; }
        const st = f.kps.trim().split(' ').map(Number);
        const ok = mode === 'lost' ? (st.includes(10) || st.includes(9)) : mode === 'kept' ? (st.includes(5) && !st.includes(9) && !st.includes(10)) : st.includes(9);
        if (!ok) { console.log('    (' + mode + ' try ' + i + ': the ball went ' + f.kps + '— not the case wanted; next down)'); await sleep(6000); continue; }
        return { OFF, DEF, t0, f };
    }
    return null;
}

(async () => {
    console.log('=== V461 A FUMBLE\'S POPUP SAYS FUMBLE ===');
    const g = await TP.startTwoPlayerGame({});
    try {
        await sleep(6000);
        // ---- U1: a lost fumble ----
        const u1 = await play(g, 'lost');
        if (!u1) check('U1 a lost fumble', false, 'no fumble produced'); else {
            const got = await L.until(async () => { const b = await blasts(u1.DEF.page, u1.t0); return { ok: b.length > 0, b }; }, 30000, 500);
            await sleep(1500);
            const b = await blasts(u1.DEF.page, u1.t0), f = await u1.OFF.page.evaluate(() => ({ kps: window.__fp.kps, kinds: window.__fp.kinds }));
            const p1 = await paths(g.code, u1.t0 - 2000);
            console.log('  lost fumble: ball ' + f.kps + '| takeaway ' + JSON.stringify(f.kinds) + ' | paths ' + JSON.stringify(p1) + ' | the other phone: ' + JSON.stringify(b));
            check('U1 a lost fumble: the carrier\'s phone names it FUMBLE and the other phone shows FUMBLE — never INTERCEPTED (every path said FUMBLE)',
                  f.kinds[0] === 'FUMBLE' && b.some(x => /^FUMBLE/.test(x)) && !b.some(x => /INTERCEPTED/.test(x)) && p1.length > 0 && !p1.some(x => /INT\b/.test(x)),
                  JSON.stringify({ kinds: f.kinds, p1, b }));
        }
        // ---- U3: a fumble the offense keeps, then a turnover on downs ----
        const u3 = await play(g, 'kept');
        if (!u3) check('U3 a kept fumble', false, 'no fumble produced'); else {
            const f = await u3.OFF.page.evaluate(() => ({ kps: window.__fp.kps, kinds: window.__fp.after, fums: window._rb2p_driveTurnoverDeltas() }));
            console.log('  kept fumble: ball ' + f.kps + '| takeaway ' + JSON.stringify(f.kinds) + ' | the drive\'s counts ' + JSON.stringify(f.fums));
            // end the drive without a takeaway: 4th and 99, a run
            await sleep(2500);
            const o = await L.offense(g, 30000);
            const same = o.ok && o.off === u3.OFF;
            if (same) {
                await L.setDown(u3.OFF.page, { down: 4, toGo: 99 });
                await sleep(800);
                await u3.OFF.page.evaluate(() => { window.__fp.done = true; });
                await L.realDown(u3.OFF.page, { buttons: true });
            }
            const handed = await L.until(async () => { const A = await L.st(u3.OFF.page); return { ok: !!(A && A.wait) }; }, 40000, 500);
            await sleep(4000);
            const b = await blasts(u3.DEF.page, u3.t0), p3 = await paths(g.code, u3.t0 - 2000);
            console.log('  then 4th & 99: the ball changed hands ' + !!handed.ok + ' | paths ' + JSON.stringify(p3) + ' | the other phone: ' + JSON.stringify(b));
            check('U3 a fumble the offense kept, then a turnover on downs: the other phone shows no takeaway popup',
                  f.kinds.length === 0 && f.fums.fumDelta > 0 && same && handed.ok && !b.some(x => /INTERCEPTED|^FUMBLE/.test(x)) &&
                  !p3.some(x => /BLAST@possession|EVT<- (INT|FUMBLE)/.test(x)),   // (the popup log skips a repeat of the same text: the paths are the proof)
                  JSON.stringify({ kinds: f.kinds, fums: f.fums, same, handed: handed.ok, b, p3 }));
        }
        // ---- U2: an interception ----
        const u2 = await play(g, 'int');
        if (!u2) check('U2 an interception', false, 'no interception produced'); else {
            await L.until(async () => { const b = await blasts(u2.DEF.page, u2.t0); return { ok: b.length > 0 }; }, 30000, 500);
            await sleep(1500);
            const b = await blasts(u2.DEF.page, u2.t0), f = await u2.OFF.page.evaluate(() => ({ kps: window.__fp.kps, kinds: window.__fp.kinds }));
            const p2 = await paths(g.code, u2.t0 - 2000);
            console.log('  interception: ball ' + f.kps + '| takeaway ' + JSON.stringify(f.kinds) + ' | paths ' + JSON.stringify(p2) + ' | the other phone: ' + JSON.stringify(b));
            const pick6 = b.some(x => /PICK 6/.test(x));
            check('U2 an interception: the carrier\'s phone names it INT and the other phone shows INTERCEPTED (or PICK 6 if he scored)',
                  f.kinds[0] === 'INT' && (b.some(x => /INTERCEPTED/.test(x)) || pick6) && !b.some(x => /^FUMBLE/.test(x)) && !p2.some(x => /FUMBLE/.test(x)),
                  JSON.stringify({ kinds: f.kinds, p2, b }));
        }
    } finally {
        try { await g.cleanup(); } catch (e) {}
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
