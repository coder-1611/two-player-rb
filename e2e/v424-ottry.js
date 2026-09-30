// e2e/v424-ottry.js — an overtime touchdown gets a REAL try (room QJFB, V423).
//
// QJFB: A scored in overtime (8 -> 14, tied 14-14) and tapped 2 PT. The engine's own overtime is sudden death:
// its scoring left it at "overtime over" (drive stage 17, a kickoff pending), so the tap only closed the menu —
// the engine's controller sets a 2-point try up only when it is between plays with no ball on the field. The
// field sat empty 25s, then the 30s hand-off gave the ball to B with NO try. And had the try been set up, the
// engine credited a made 2-point try in overtime as a sudden-death touchdown for the OTHER team (+6, possession
// flipped — e2e/probe-ot2pt.js).
//
//   T1  an overtime touchdown scored through the engine's own path (and its Kick Off button tapped, as in QJFB);
//       the 1 PT / 2 PT choice is offered
//   T2  2 PT tapped (the button's own response): the engine's own 2-point try is lined up at the 2 (as in regulation)
//   T3  the made 2-point try: +2 to the scorer, possession NOT flipped; then the ball goes to the other phone
//       as a touchdown kickoff and both phones show the same score
//   T4  the other phone scores in overtime and taps 1 PT: the kick lines up and a made kick is +1 to the kicker
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 300); } return Object.assign(v || {}, { ms: null }); }

const field = page => page.evaluate(() => {
    const em = RB.engineState(), all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    let of = 0, ball = 0;
    for (const x of all) { if (!x || x._HL2 || !x._eE2) continue; const n = x._eE2._fE2; if (n === 'obj_playerOF') of++; if (n === 'obj_ball') ball++; }
    const pops = (window._rb2p_enumeratePopupInstances() || []).filter(p => p && !p._HL2 && p._0G).map(p => p._0G);
    return { of, ball, pops, d: Number(em.engineDownNumber), y: Math.round(Number(em.engineYardLineSigned)), kp: Number(em.engineControllerState), vy: Number(em.engineDriveFsmStage),
             su: Number(em.userScore), so: Number(em.opponentScore), q: Number(em.engineQuarter), mine: em.enginePossessingTeamIdx === em.engineUserTeamIdx,
             wait: window._rb2p_userIsWaitingForOpponent === true, kick: (function () { try { return Number(em.rawEngineMatch._T11); } catch (e) { return null; } })(), ot: window._rb2p_inOvertime === true };
});
const tapChoice = (page, id) => page.evaluate(id => { const pl = window._rb2p_enumeratePopupInstances() || []; for (const p of pl) if (p && !p._HL2 && p._0G === id) { _li(p, p, p._0G); return true; } return false; }, id);
const engineTd = page => page.evaluate(() => { const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1); });
// QJFB: the engine's overtime win spawns a Kick Off button 16ms after the touchdown, and the player tapped it 0.8s
// later during the celebration ("KY fired"). The bridge's kickoff sweeper only runs for 60s after a drive starts —
// QJFB's touchdown came later in the possession, so the button lived. Here the touchdown comes seconds after the
// overtime kickoff: the sweeper is retired first (as it had expired in QJFB), then the button is tapped at 0.8s.
const engineTdAndTapKickoff = page => page.evaluate(async () => {
    window._rb2p_kickoffSweepGen = (window._rb2p_kickoffSweepGen || 0) + 1;
    const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1);
    await new Promise(r => setTimeout(r, 800));
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_btn_kickoff') { _Ky(x, x); return 'kickoff tapped at 800ms'; }
    return 'no kickoff button at 800ms';
});

(async () => {
    console.log('=== V424 OVERTIME TRY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const logs = { a: [], b: [] };
    for (const s of [g.a, g.b]) s.page.on('console', m => { const t = m.text(); if (/OT|PAT|CONV|modal|try|SEND/.test(t)) logs[s.role].push(t.slice(0, 150)); });
    // both phones reach overtime tied; the shared coin flip picks the receiver
    for (const s of [g.a, g.b]) await s.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        em.setUserScore(14); em.setOpponentScore(14);
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
        em.engineMinutesLeft = 3; em.engineSecondsLeft = 0;
    });
    const flip = await until(async () => {
        const fa = await field(g.a.page), fb = await field(g.b.page);
        return { ok: fa.ot && fb.ot && fa.wait !== fb.wait, fa, fb };
    }, 40000, 1000);
    const off = flip.fa && !flip.fa.wait ? g.a : g.b, def = off === g.a ? g.b : g.a;
    console.log('  overtime: receiver = ' + off.role + ' (flip ' + flip.ms + 'ms)');
    await sleep(3000);

    // ---- T1 ----
    const ky = await engineTdAndTapKickoff(off.page);
    console.log('  ' + ky);
    const offered = await until(async () => { const f = await field(off.page); return { ok: f.pops.includes(100369) && f.d === 6, f }; }, 5000, 200);
    check('T1 an overtime touchdown through the engine\'s own scoring offers 1 PT / 2 PT', offered.ms !== null && offered.f.su === 20 && offered.f.so === 14, JSON.stringify(offered.f));

    // ---- T2 ----
    await sleep(1500);
    const beforeTap = await field(off.page);
    await tapChoice(off.page, 100369);
    const lined = await until(async () => { const f = await field(off.page); return { ok: f.ball >= 1 && f.of >= 11 && f.d === 6 && Math.abs(f.y - 48) <= 1, f }; }, 1500, 100);
    const net = logs[off.role].some(t => /set nothing up in 2s/.test(t));
    // as after a regulation touchdown (_hB clears the field, the controller is between plays): the engine lines the
    // 2-point try up behind the choice; 2 PT closes the menu over it, 1 PT replaces it with the kick (T4)
    check('T2 2 PT tapped: the engine\'s own 2-point try is lined up at the 2 within 1.5s (not the 2s net), one formation',
          lined.ms !== null && !net && lined.f.of === 11, JSON.stringify({ beforeTap, after: lined.f, ms: lined.ms, net }));

    // ---- T3 ----
    // the try reaches the end zone. V425: through the engine's REAL path — the ball carrier is the offense, so its
    // play result calls _Ak1(1) (the touchdown replay) -> _Ik1 -> _hB(1), the touchdown branch. V424 called _hB(2)
    // (the DEFENCE-scores branch) here and passed while real games scored every made try +6 (FTYF 14-20-26-32-38).
    const tdSeen0 = logs[off.role].filter(t => /OT-TD touchdown in overtime/.test(t)).length;
    const made = await off.page.evaluate(() => { const em = RB.engineState(); _Ak1(em.rawEngineMatch, _Sc2, 1); return { su: Number(em.userScore), so: Number(em.opponentScore), mine: em.enginePossessingTeamIdx === em.engineUserTeamIdx }; });
    const handed = await until(async () => { const fd = await field(def.page), fo = await field(off.page); return { ok: !fd.wait && fo.wait && fd.su === 14 && fd.so === 22 && fo.su === 22 && fo.so === 14, fd, fo }; }, 20000, 500);
    const tdSeen1 = logs[off.role].filter(t => /OT-TD touchdown in overtime/.test(t)).length;
    check('T3 the made 2-point try (the engine\'s own touchdown path) is +2 to the scorer (22-14), no new touchdown or try, then the other phone gets the ball with the same score',
          made.su === 22 && made.so === 14 && handed.ms !== null && tdSeen1 === tdSeen0, JSON.stringify({ made, tdSeen0, tdSeen1, def: handed.fd, off: handed.fo }));

    // ---- T4: the answering possession — a touchdown and 1 PT ----
    await sleep(3000);
    await engineTd(def.page);
    const off2 = await until(async () => { const f = await field(def.page); return { ok: f.pops.includes(100367) && f.d === 6, f }; }, 5000, 200);
    await sleep(1200);
    const before1 = await field(def.page);
    await tapChoice(def.page, 100367);
    const kick = await until(async () => { const f = await field(def.page); return { ok: f.of >= 11 && f.kick === 1, f }; }, 3000, 200);
    const kicked = await def.page.evaluate(() => { const em = RB.engineState(); em.rawEngineMatch._Z21 = 1; _Ak1(em.rawEngineMatch, _Sc2, 6); return { su: Number(em.userScore), so: Number(em.opponentScore) }; });   // V425: the kick-good path (_Ak1(6) -> _hB(6))
    check('T4 1 PT in overtime: the kick replaces what was lined up (one formation), and a made kick is +1 to the kicker (21-22)',
          off2.ms !== null && kick.ms !== null && kick.f.of === 11 && kicked.su === 21 && kicked.so === 22, JSON.stringify({ offered: off2.f, before1, kick: kick.f, kicked }));

    if (fail) { console.log('\n--- off console ---\n' + logs[off.role].slice(-30).join('\n')); console.log('\n--- def console ---\n' + logs[def.role].slice(-20).join('\n')); }
    for (const s of [g.a, g.b]) await s.page.evaluate(() => { window._rb2p_gameOverReported = true; }).catch(() => {});
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
