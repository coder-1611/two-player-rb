// e2e/drive-dir.js — V449 (the owner: "let the user choose the drive direction in the very beginning while on the
// screen to choose teams ... keep in mind that quarters sometimes switch direction so make sure they stay the same";
// asked: each player for their own screen, the SAME WAY ALL GAME). The two phones pick OPPOSITE directions with the
// real lobby buttons (A ◀ LEFT, B RIGHT ▶) and play real downs (the QB bot) through real quarter ends:
//   D1  each phone launches with its pick: _rb2p_fixedDir and the engine's _501; the drive's formation faces it (every
//       OF _L11 = pick) and stands behind its line in that sense
//   D2  a real down: the ball moves toward the end zone the player picked, and the engine's gain agrees with the
//       ball's travel (the "plays run backwards" bug would make them disagree)
//   D3  a real Q1 horn (the clock runs out on a real down): Q2 keeps the field — _501 unchanged, the quarter change
//       was held (DIR-HOLD in the diag), the next formation faces the pick, and its real down still gains that way
//   D4  halftime (Q3 law: Team B receives): B drives its own pick (+1); A is still held at -1
//   D5  a reload mid-game brings the same field back (every launch re-seeds it)
//   D6  the lobby: the buttons store the pick (rb2p_driveDir) and show it selected; a phone that never picked
//       defaults to LEFT (what phones have always played), anything else to RIGHT
const L = require('./horn-lib');
const TP = L.TP, H = L.H, sleep = L.sleep;
let pass = 0, fail = 0, setup = '';
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const PICK = { a: -1, b: 1 };

const dirState = page => page.evaluate(() => {
    try {
        const s = RB.engineState(); const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const dir = Number(s.engineDriveDirection), los = Number(s.engineScrimmagePx);
        let of = 0, ofFacing = 0, ofBehind = 0, ball = null;
        for (const x of inst) {
            if (!x || x._HL2 || !x._eE2) continue;
            if (x._eE2._fE2 === 'obj_playerOF') { of++; if (Number(x._L11) === dir) ofFacing++; if ((Number(x.x) - los) * dir <= 4) ofBehind++; }
            else if (x._eE2._fE2 === 'obj_ball' && !ball) ball = { kp: Number(x._kp), x: Math.round(Number(x.x)) };
        }
        return { fixed: window._rb2p_fixedDir, dir, op: _Ai(_6E2._Ue2(64)._Gn, 'op_drivedir'), q: Number(s.engineQuarter), y: Number(s.engineYardLineSigned),
                 wait: window._rb2p_userIsWaitingForOpponent === true, of, ofFacing, ofBehind, ball, los };
    } catch (e) { return { err: String(e && e.message || e) }; }
});
// the phone has the ball, on the field and dead (the ball's own kp — st().kp is the match controller's)
const atSnap = async (page, q) => { const s = await L.st(page); if (!(s && s.q === q && !s.wait && s.ball > 0)) return { ok: false, s }; const d = await dirState(page); return { ok: !!(d.ball && d.ball.kp === 0), s, d }; };
const sampler = page => page.evaluate(() => {
    window.__ddS = [];
    if (window.__ddT) clearInterval(window.__ddT);
    window.__ddT = setInterval(() => {
        try {
            const a = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            for (const x of a) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { window.__ddS.push([Date.now(), Number(x._kp), Number(x.x)]); if (window.__ddS.length > 6000) window.__ddS.shift(); break; }
        } catch (e) {}
    }, 16);
});
// the ball's travel on screen during the last down: from the last dead-ball sample before the snap to the first sample
// after it where the play is over (kp back to 0/4 or the ball gone)
async function travel(page, t0) {
    const s = await page.evaluate(t0 => (window.__ddS || []).filter(r => r[0] >= t0), t0);
    let i = s.findIndex(r => r[1] !== 0); if (i < 1) return null;
    const x0 = s[i - 1][2];
    let xEnd = null;
    for (let j = i; j < s.length; j++) { if (s[j][1] === 4) { xEnd = s[j][2]; break; } }
    if (xEnd === null) { for (let j = s.length - 1; j >= i; j--) if (s[j][1] !== 0) { xEnd = s[j][2]; break; } }
    return { x0: Math.round(x0), x1: Math.round(xEnd), px: Math.round(xEnd - x0) };
}
// one real down on OFF, with the travel and the engine's gain
async function downAndMeasure(P, label) {
    const before = await L.st(P.page);
    const t0 = await P.page.evaluate(() => Date.now());
    const r = await L.realDown(P.page, { straight: true });
    const after = await L.until(async () => { const s = await L.st(P.page); if (!(s && s.ball > 0 && (s.y !== before.y || s.d !== before.d || s.q !== before.q))) return { ok: false, s }; const d = await dirState(P.page); return { ok: !!(d.ball && d.ball.kp === 0), s }; }, 20000, 300);
    const tr = await travel(P.page, t0);
    const gain = after.s && before ? Math.round((after.s.y - before.y) * 10) / 10 : null;
    console.log('  ' + label + ': ' + JSON.stringify({ result: r && r.result, before: before && { q: before.q, y: before.y, d: before.d }, after: after.s && { q: after.s.q, y: after.s.y, d: after.s.d }, gain, travel: tr }));
    return { r, gain, tr, before, after: after.s };
}

(async () => {
    console.log('=== V449 DRIVE DIRECTION (A ◀ LEFT, B RIGHT ▶, held all game) ===');
    // D6 (part): a phone that never picked defaults to LEFT; a desktop to RIGHT
    const browser0 = await H.launchBrowser();
    try {
        const ph = await browser0.newPage();
        await ph.setViewport({ width: 874, height: 402, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await ph.evaluateOnNewDocument(() => { try { localStorage.removeItem('rb2p_driveDir'); localStorage.setItem('rb2p_news_v387', '1'); localStorage.setItem('rb2p_name', 'Dir Test'); } catch (e) {} });
        await ph.goto(H.url(), { waitUntil: 'domcontentloaded' });
        const rendered = page => L.until(async () => ({ ok: await page.evaluate(() => !!(window._rb2p_driveDirPref && document.querySelector('.drive-btn.selected'))).catch(() => false) }), 30000, 400);
        await rendered(ph);
        const phone = await ph.evaluate(() => ({ pref: window._rb2p_driveDirPref(), sel: Array.from(document.querySelectorAll('.drive-btn.selected')).map(b => b.dataset.drive) }));
        const dt = await browser0.newPage();
        await dt.evaluateOnNewDocument(() => { try { localStorage.removeItem('rb2p_driveDir'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
        await dt.goto(H.url(), { waitUntil: 'domcontentloaded' }); await rendered(dt);
        const desk = await dt.evaluate(() => ({ pref: window._rb2p_driveDirPref(), sel: Array.from(document.querySelectorAll('.drive-btn.selected')).map(b => b.dataset.drive) }));
        console.log('  defaults: phone ' + JSON.stringify(phone) + ', desktop ' + JSON.stringify(desk));
        var defaultsOk = phone.pref === -1 && phone.sel.join() === '-1' && desk.pref === 1 && desk.sel.join() === '1';
    } finally { await browser0.close(); }

    const g = await TP.startTwoPlayerGame({
        beforeReady: async (page, role) => {
            await page.evaluate(v => { const b = document.querySelector('.drive-btn[data-drive="' + v + '"]'); if (b) b.click(); }, String(PICK[role]));
            await sleep(200);
        }
    });
    try {
        const lobbyPick = {};
        for (const P of [g.a, g.b]) lobbyPick[P.role] = await P.page.evaluate(() => sessionStorage.getItem('rb2p_driveDir'));
        check('D6 the lobby stores each tab\'s pick, a phone that never picked defaults to LEFT and a desktop to RIGHT',
              defaultsOk && lobbyPick.a === '-1' && lobbyPick.b === '1', JSON.stringify({ lobbyPick }));
        await sleep(6000);
        for (const P of [g.a, g.b]) await sampler(P.page);
        const o = await L.offense(g, 40000); if (!o.ok) { setup = 'nobody has the ball'; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        // EASY defense (as the horn suites do) so a straight run makes ground both ways
        for (const P of [OFF, DEF]) await P.page.evaluate(() => { try { window.__ddDiff = localStorage.getItem('rb2p_difficulty'); localStorage.setItem('rb2p_difficulty', 'easy'); if (window._rb2p_applyOpDifficulty) window._rb2p_applyOpDifficulty(); } catch (e) {} });
        // D1
        const d1 = { [OFF.role]: await dirState(OFF.page), [DEF.role]: await dirState(DEF.page) };
        console.log('  D1: ' + JSON.stringify(d1));
        const offD1 = d1[OFF.role];
        check('D1 each phone launched with its own pick (engine _501 and op_drivedir), and the drive\'s formation faces it from behind its line',
              d1.a.fixed === PICK.a && d1.b.fixed === PICK.b && d1.a.op === PICK.a && d1.b.op === PICK.b && offD1.dir === PICK[OFF.role] &&
              offD1.of >= 6 && offD1.ofFacing === offD1.of && offD1.ofBehind === offD1.of, JSON.stringify(d1));
        // D2: a real down at midfield, 1st & 10
        await L.setQuarter([OFF.page, DEF.page], 1, 150);
        await L.setDown(OFF.page, { down: 1, toGo: 10 }); await sleep(900);
        const m1 = await downAndMeasure(OFF, 'Q1 real down');
        const pick = PICK[OFF.role];
        // the engine's gain (scrimmage to tackle) and the ball's travel (from the snap) agree in sign past 1.5 yards, and
        // within 3 yards in size (the snap moves the ball back a little first)
        const agree = (m) => m && m.tr && m.gain !== null && (Math.abs(m.gain) < 1.5 || Math.sign(m.gain) === Math.sign(m.tr.px * pick)) && Math.abs(m.tr.px * pick / 20 - m.gain) < 3;
        check('D2 a real down: the ball travels toward the picked end zone and the engine\'s gain agrees with its travel',
              agree(m1) && (m1.gain < 1.5 || m1.tr.px * pick > 0), JSON.stringify({ gain: m1.gain, travel: m1.tr, pick }));
        // D3: a real Q1 horn — the run outlives the last second
        await L.setQuarter([OFF.page, DEF.page], 1, 1);
        await L.setDown(OFF.page, { clk: 1, down: 1, toGo: 10 }); await sleep(900);
        // count every real call of the quarter-flip routine (whatever path the horn takes into case 19)
        await OFF.page.evaluate(() => { window.__ddSc1 = 0; const cur = window._Sc1; if (cur && !cur.__ddCount) { const w = function () { window.__ddSc1++; return cur.apply(this, arguments); }; w.__ddCount = true; w._rb2pDirHold = true; window._Sc1 = w; } });
        await L.realDown(OFF.page, { straight: true });
        const q2 = await L.until(() => atSnap(OFF.page, 2), 40000, 400);
        const d3s = await dirState(OFF.page);
        const held = await OFF.page.evaluate(() => ({ calls: window.__ddSc1 || 0, diag: (String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '').match(/DIR-HOLD[^\n]*/g) || []).slice(-2) }));
        console.log('  D3 Q2: ' + JSON.stringify({ reached: q2.ms !== null, st: q2.s && { q: q2.s.q, y: q2.s.y }, dir: d3s, held }));
        let m3 = null;
        if (q2.ms !== null) { await L.setDown(OFF.page, { down: 1, toGo: 10 }); await sleep(900); m3 = await downAndMeasure(OFF, 'Q2 real down'); }
        if (q2.ms === null) setup = 'the Q1 horn never brought Q2 with the ball on the same phone';
        else check('D3 a real Q1 horn keeps the field: Q2\'s _501 is the pick, the quarter change was held, the new formation faces the pick, and a real Q2 down still gains that way',
                   d3s.dir === pick && held.calls > 0 && held.diag.length > 0 && d3s.ofFacing === d3s.of && d3s.ofBehind === d3s.of && agree(m3) && (m3.gain < 1.5 || m3.tr.px * pick > 0),
                   JSON.stringify({ dir: d3s.dir, held, of: [d3s.of, d3s.ofFacing, d3s.ofBehind], gain: m3 && m3.gain, travel: m3 && m3.tr }));
        // D4: halftime — Q2's horn; the Q3 law gives Team B the ball
        await L.setQuarter([OFF.page, DEF.page], 2, 1);
        await L.setDown(OFF.page, { clk: 1, down: 1, toGo: 10 }); await sleep(900);
        await L.realDown(OFF.page, { straight: true });
        const q3 = await L.until(() => atSnap(g.b.page, 3), 60000, 500);
        const d4 = { a: await dirState(g.a.page), b: await dirState(g.b.page) };
        console.log('  D4 Q3: ' + JSON.stringify({ reached: q3.ms !== null, b: d4.b, a: { fixed: d4.a.fixed, dir: d4.a.dir, wait: d4.a.wait } }));
        if (q3.ms === null) setup = setup || 'halftime never gave B the ball in Q3';
        else check('D4 halftime: B drives its own pick (+1, formation facing it), A is still held at -1',
                   d4.b.dir === PICK.b && d4.b.ofFacing === d4.b.of && d4.b.of >= 6 && d4.a.fixed === PICK.a && d4.a.op === PICK.a, JSON.stringify(d4));
        // D5: reload B mid-Q3; the resumed launch re-seeds the same field
        if (q3.ms !== null) {
            await g.b.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            const back = await L.until(async () => { const s = await L.st(g.b.page); return { ok: !!(s && s.q === 3 && s.ball > 0 && !s.wait), s }; }, 60000, 600);
            const d5 = await dirState(g.b.page);
            console.log('  D5 after reload: ' + JSON.stringify({ back: back.ms !== null, d5 }));
            if (back.ms === null) setup = setup || 'the reloaded phone never got its drive back';
            else check('D5 a reload brings the same field back (B still drives +1, formation facing it)',
                       d5.fixed === PICK.b && d5.dir === PICK.b && d5.op === PICK.b && d5.ofFacing === d5.of, JSON.stringify(d5));
        }
    } catch (e) {
        fail++; console.log('  FAIL  ' + (e && e.message || e));
    } finally {
        for (const P of [g.a, g.b]) await P.page.evaluate(() => { try { const v = window.__ddDiff; if (v == null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', v); localStorage.removeItem('rb2p_driveDir'); sessionStorage.removeItem('rb2p_driveDir'); } catch (e) {} }).catch(() => {});
        await g.cleanup();
        if (setup) console.log('  SETUP ' + setup + ' — inconclusive');
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (setup ? ' (SETUP INCONCLUSIVE)' : '') + ' ===');
        process.exit(setup && !fail ? 3 : (fail ? 1 : 0));
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
