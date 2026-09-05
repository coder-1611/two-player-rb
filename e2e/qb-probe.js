// e2e/qb-probe.js — GROUND TRUTH for a QB bot. Plays real snaps with trusted
// mouse input against the KC AI and records, per frame, everything the engine
// knows: the controller's drag (R01, angle), the ball's flight (speed, arc,
// height, projected landing), every player's position/state/route, and the
// outcome. From this the bot's model is fitted instead of assumed.
//   node e2e/qb-probe.js [trials]
const H = require('./harness');
const sleep = H.sleep;
const TRIALS = Number(process.argv[2] || 4);

const inPage = {
    // Map css -> room and css -> gui by probing the engine's own mouse readers.
    calib: () => {
        const c = document.getElementById('canvas'); const r = c.getBoundingClientRect();
        return { left: r.left, top: r.top, w: r.width, h: r.height, bw: c.width, bh: c.height };
    },
    mouseRead: () => ({ rx: _ft._w01(), ry: _ft._x01(), gx: _m01(0), gy: _o01(0) }),
    snap: () => {
        const raw = RB.engineState().rawEngineMatch;
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const num = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : v;
        let ctrl = null, ball = null, shadow = null; const of = [], df = [];
        let ctrlInst = null; try { const m = _si(global._d01); for (const k in m) if (m.hasOwnProperty(k)) { ctrlInst = m[k]; break; } } catch (e) {}
        if (ctrlInst) ctrl = { kp: ctrlInst._kp, R01: num(ctrlInst._R01), ang: num(ctrlInst._511), ox: num(ctrlInst._y01), oy: num(ctrlInst._z01), holder: ctrlInst._X_, e11: num(ctrlInst._e11), g11: num(ctrlInst._g11), bullet: ctrlInst._d11 };
        for (const x of inst) {
            if (!x || x._HL2 || !x._eE2 || !x._eE2._fE2) continue;
            const n = x._eE2._fE2;
            if (n === 'obj_ball') ball = { x: num(x.x), y: num(x.y), kp: x._kp, e11: num(x._e11), g11: num(x._g11), h: num(x._Y11), ang: num(x._511), holder: x._X_ };
            else if (n === 'obj_playerOF' || n === 'obj_playerDF') {
                let spd = null, skill = null, ln = null; try { spd = _Ai(x._7j, 'speed'); skill = _Ai(x._7j, 'skill'); ln = String(_Ai(x._7j, 'lname') || ''); } catch (e) {}
                (n === 'obj_playerOF' ? of : df).push({ id: x.id, x: num(x.x), y: num(x.y), pos: x._O01, anim: x._g21, route: x._W01, pt: x._c71, rx0: num(x._D61), ry0: num(x._E61), bd: num(x._Y01), clear: x._X31, spd, skill, ln, face: x._L11 });
            }
        }
        try { const sh = _jj(raw, _Sc2, 78); if (sh) shadow = { lx: num(sh._S81), ly: num(sh._T81), cx: num(sh._w31), x: num(sh.x), y: num(sh.y) }; } catch (e) {}
        const s = RB.engineState();
        return { t: performance.now(), ctrl, ball, shadow, of, df, dir: s.engineDriveDirection, scrimX: num(raw._B01), scrimY: num(raw._C01), down: s.engineDownNumber, ytg: num(s.engineYardsToGo), y6f: num(raw._6F), vy: s.engineDriveFsmStage, kpc: s.engineControllerState };
    },
    routePoints: (pathIdx) => { try { const n = _e71(pathIdx); const pts = []; for (let i = 0; i < n; i++) pts.push([Math.round(_b71(pathIdx, i)), Math.round(_d71(pathIdx, i))]); return pts; } catch (e) { return null; } },
    startTrace: () => { window.__tr = []; window.__trOn = true; const f = () => { if (!window.__trOn) return; try { window.__tr.push(window.__snap()); } catch (e) {} requestAnimationFrame(f); }; requestAnimationFrame(f); },
    stopTrace: () => { window.__trOn = false; const t = window.__tr || []; window.__tr = []; return t; }
};

(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { window._rb2p_computeDefenseAggression = () => 10; const s = RB.engineState(); if (s) s.engineDefenseAggression = 10; });
        await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
        await sleep(1500);
        // expose the snapshot function in-page for the rAF tracer
        await page.evaluate('window.__snap = ' + inPage.snap.toString());
        const cal = await page.evaluate(inPage.calib);
        console.log('canvas', JSON.stringify(cal));
        // css -> room / gui affine map from two mouse probes
        const p1 = { x: cal.left + cal.w * 0.3, y: cal.top + cal.h * 0.3 }, p2 = { x: cal.left + cal.w * 0.7, y: cal.top + cal.h * 0.7 };
        await page.mouse.move(p1.x, p1.y); await sleep(80); const m1 = await page.evaluate(inPage.mouseRead);
        await page.mouse.move(p2.x, p2.y); await sleep(80); const m2 = await page.evaluate(inPage.mouseRead);
        const map = { rsx: (m2.rx - m1.rx) / (p2.x - p1.x), rsy: (m2.ry - m1.ry) / (p2.y - p1.y), gsx: (m2.gx - m1.gx) / (p2.x - p1.x), gsy: (m2.gy - m1.gy) / (p2.y - p1.y) };
        map.rox = m1.rx - map.rsx * p1.x; map.roy = m1.ry - map.rsy * p1.y;
        const toCss = (rx, ry) => ({ x: (rx - map.rox) / map.rsx, y: (ry - map.roy) / map.rsy });
        console.log('mouse map', JSON.stringify({ m1, m2, map }));

        for (let k = 0; k < TRIALS; k++) {
            let s = await page.evaluate(inPage.snap);
            if (!s.ball || s.ball.kp !== 0 && s.ball.kp !== 1) { console.log('trial ' + k + ': ball not idle (kp ' + (s.ball && s.ball.kp) + ') — waiting'); await sleep(1500); s = await page.evaluate(inPage.snap); }
            const qb = s.of.find(o => o.pos === 1);
            if (!qb) { console.log('no QB found; of=' + JSON.stringify(s.of.map(o => o.pos))); await sleep(1500); continue; }
            const dir = s.dir;
            const qbCss = toCss(qb.x, qb.y);
            console.log('\n=== trial ' + k + ' — QB ' + qb.ln + ' at room(' + qb.x + ',' + qb.y + ') css(' + Math.round(qbCss.x) + ',' + Math.round(qbCss.y) + ') dir ' + dir + ' down ' + s.down + '&' + s.ytg + ' 6F ' + s.y6f);
            // routes of the receivers
            for (const o of s.of) if (o.pos !== 1) { const pts = await page.evaluate(inPage.routePoints, o.route); console.log('  OF pos' + o.pos + ' ' + o.ln + ' spd' + o.spd + ' skill' + o.skill + ' at(' + o.x + ',' + o.y + ') route ' + o.route + ' start(' + o.rx0 + ',' + o.ry0 + ') pts ' + JSON.stringify(pts)); }
            // press on the QB, pull back 30 css px (snap), hold, then pull to a trial vector, release
            const back = -dir;                                     // pull away from the target end zone
            const pullCss = [60, 90, 120, 150][k % 4];
            const dyCss = [0, -20, 20, 0][k % 4];
            await page.mouse.move(qbCss.x, qbCss.y); await page.mouse.down();
            await page.mouse.move(qbCss.x + back * 30, qbCss.y, { steps: 3 });
            await page.evaluate(inPage.startTrace);
            await sleep(900);                                       // routes develop while aiming
            await page.mouse.move(qbCss.x + back * pullCss, qbCss.y + dyCss, { steps: 4 });
            await sleep(120);
            const pre = await page.evaluate(inPage.snap);
            await page.mouse.up();
            await sleep(2600);
            const tr = await page.evaluate(inPage.stopTrace);
            const post = await page.evaluate(inPage.snap);
            // per-frame timeline (every 4th frame): when does the snap actually happen?
            const qbId = qb.id;
            for (let i = 0; i < tr.length; i += 4) {
                const f = tr[i]; const q = f.of.find(o => o.id === qbId) || {}; const wr = f.of.filter(o => o.pos === 3 || o.pos === 4 || o.pos === 2);
                let ndf = 999; for (const d of f.df) { const dd = Math.hypot(d.x - (q.x || 0), d.y - (q.y || 0)); if (dd < ndf) ndf = Math.round(dd); }
                console.log('   f' + String(i).padStart(3) + ' ctrl kp' + (f.ctrl && f.ctrl.kp) + ' R' + (f.ctrl && f.ctrl.R01) + ' | ball kp' + (f.ball && f.ball.kp) + ' (' + (f.ball && f.ball.x) + ',' + (f.ball && f.ball.y) + ') h' + (f.ball && f.ball.h) + ' e' + (f.ball && f.ball.e11) + ' | QB anim' + q.anim + ' (' + q.x + ',' + q.y + ') | WR anims ' + wr.map(o => o.anim + '@' + o.pt).join(' ') + ' | nearest DF ' + ndf);
            }
            // report: drag readback, ball flight summary
            console.log('  drag: css pull ' + pullCss + ' dy ' + dyCss + ' -> ctrl R01 ' + (pre.ctrl && pre.ctrl.R01) + ' ang ' + (pre.ctrl && pre.ctrl.ang) + ' kp ' + (pre.ctrl && pre.ctrl.kp) + ' e11 ' + (pre.ctrl && pre.ctrl.e11) + ' g11 ' + (pre.ctrl && pre.ctrl.g11));
            const air = tr.filter(f => f.ball && f.ball.kp === 7);
            if (air.length) {
                const a0 = air[0], aN = air[air.length - 1];
                console.log('  flight: ' + air.length + ' frames; launch (' + a0.ball.x + ',' + a0.ball.y + ') h' + a0.ball.h + ' e11 ' + a0.ball.e11 + ' g11 ' + a0.ball.g11 + ' ang ' + a0.ball.ang + ' -> last (' + aN.ball.x + ',' + aN.ball.y + ') h' + aN.ball.h + ' dist ' + Math.round(Math.hypot(aN.ball.x - a0.ball.x, aN.ball.y - a0.ball.y)) + ' px');
                const proj = air.find(f => f.shadow && f.shadow.lx); if (proj) console.log('  engine projected landing (' + proj.shadow.lx + ',' + proj.shadow.ly + ') set at frame ' + air.indexOf(proj) + ' h' + proj.ball.h);
                const chase = air.find(f => f.of.some(o => o.anim === 10)); if (chase) { const o = chase.of.find(o => o.anim === 10); console.log('  receiver ' + o.ln + ' went to CATCH at frame ' + air.indexOf(chase) + ' from (' + o.x + ',' + o.y + ') bd ' + o.bd); }
                const dch = air.find(f => f.df.some(o => o.anim === 10)); if (dch) { const o = dch.df.find(o => o.anim === 10); console.log('  DEFENDER ' + o.ln + ' went to INTERCEPT at frame ' + air.indexOf(dch) + ' from (' + o.x + ',' + o.y + ')'); }
            } else console.log('  no airborne frames (kp7); ball kps seen: ' + JSON.stringify([...new Set(tr.map(f => f.ball && f.ball.kp))]));
            // receiver motion: per-receiver average speed px/frame during the hold
            const hold = tr.slice(0, Math.min(tr.length, 50));
            if (hold.length > 10) for (const o of hold[0].of) { const e = hold[hold.length - 1].of.find(q => q.id === o.id); if (e) console.log('  OF ' + o.ln + ' pos' + o.pos + ' moved ' + Math.round(Math.hypot(e.x - o.x, e.y - o.y)) + ' px in ' + (hold.length - 1) + ' frames (' + (Math.hypot(e.x - o.x, e.y - o.y) / (hold.length - 1)).toFixed(2) + ' px/f) anim ' + o.anim + '->' + e.anim + ' pt ' + o.pt + '->' + e.pt); }
            console.log('  outcome: down ' + s.down + '->' + post.down + ' 6F ' + s.y6f + '->' + post.y6f + ' ball kp ' + (post.ball && post.ball.kp) + ' holder ' + (post.ball && post.ball.holder));
            // wait for the next snap-ready state
            for (let w = 0; w < 30; w++) { const q = await page.evaluate(inPage.snap); if (q.ball && (q.ball.kp === 0 || q.ball.kp === 1) && q.kpc === 2 && !q.of.some(o => o.anim === 10)) break; await sleep(300); }
            await sleep(600);
        }
    } finally { await browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
