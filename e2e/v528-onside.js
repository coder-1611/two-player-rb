// e2e/v528-onside.js — V528 (the owner: "just add normal retro bowl one, but raise odds to 10% + .25(kicker total points
// out of 40)"): Retro Bowl's own onside kick, back in two-player, in a real two-phone match (real Firebase).
// The kickoff is set up the way the game reaches it: Q4, the kicking side behind, 1:00 left, then the kickoff stage
// (the commentary step the engine runs after a score); the popup's own buttons are pressed (_li, as the game does).
//   O1  the offer: Retro Bowl's popup (NO / YES) on the kicking phone; the odds = 10 + 0.25 x the kicker's four ratings
//   O2  YES, recovered: the kicker KEEPS the ball — not waiting, 1st & 10 at its own 45-50, a ball on the field; the other
//       phone still waits; nothing was handed off (no SEND)
//   O3  YES, not recovered: the other phone gets the ball near midfield (its spot is the kicker's 45-50), the kicker waits
//   O4  NO: the normal kickoff — the other phone receives, the kicker waits
//   O5  no offer when the kicking side is ahead (Retro Bowl's rule): the normal kickoff, no popup
//   O6  never both phones on offense
//   O7  the popup left unanswered: NO by itself (30 s; 4 s here) — the normal kickoff, the other phone receives
//   O8  never offered inside the pick-six chain, with a conversion owed, after the final, or at 0:00 (_rb2p_onsideAllowed)
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const view = page => page.evaluate(() => {
    try {
        const s = RB.engineState(), m = s.rawEngineMatch;
        const pops = (window._rb2p_enumeratePopupInstances && window._rb2p_enumeratePopupInstances()) || [];
        const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let ball = 0;
        for (const x of inst) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') ball++;
        return { vy: Number(m._Vy), has: s.enginePossessingTeamIdx === s.engineUserTeamIdx, wait: window._rb2p_userIsWaitingForOpponent === true,
                 y: Math.round(Number(s.engineYardLineSigned) * 10) / 10, d: Number(s.engineDownNumber), tg: Math.round(Number(s.engineYardsToGo) * 10) / 10,
                 su: Number(s.userScore), so: Number(s.opponentScore), q: Number(s.engineQuarter), ball,
                 onside: pops.filter(p => p && !p._HL2 && (p._0G === 100371 || p._0G === 100373)).length, pops: pops.length, last: window._rb2p_onsideLast || null };
    } catch (e) { return { err: String(e && e.message || e) }; }
});
// the kicking phone, in the state a score leaves it: Q4, the clock, the score, the kickoff stage; one commentary step
async function kickoff(page, score, clk) {
    return page.evaluate(({ score, clk }) => {
        const s = RB.engineState();
        if (window._rb2p_clockLicence) window._rb2p_clockLicence('test setup', 3000);
        s.engineQuarter = 4; s.engineMinutesLeft = Math.floor(clk / 60); s.engineSecondsLeft = clk % 60;
        s.setUserScore(score[0]); s.setOpponentScore(score[1]);
        s.enginePossessingTeamIdx = s.engineUserTeamIdx;
        // where a score leaves the engine: after the conversion (the ball at the 2), the commentary state (kp 1) at the
        // kickoff stage (Vy 1) — then the kickoff (in a game it runs on by itself; here the KICK OFF press)
        s.rawEngineMatch._6F = 48;
        s.rawEngineMatch._kp = 1;
        s.engineDriveFsmStage = 1;   // COMM_STAGE kickoff
        window._rb2p_proceedKickoff();
        return true;
    }, { score, clk });
}
const press = (page, id) => page.evaluate(id => {
    const pl = window._rb2p_enumeratePopupInstances() || [];
    for (const p of pl) if (p && !p._HL2 && p._0G === id) { _li(p, p, p._0G); return true; }
    return false;
}, id);
const sends = async (page, since) => (await L.dumpRecorder(page, since)).diag.filter(d => /^SEND [A-Z_0-9]+ Q/.test(d[1])).map(d => d[1]);   // the hand-offs (not the clock line)
const onsideDiag = async (page, since) => (await L.dumpRecorder(page, since)).diag.filter(d => /ONSIDE|SEND [A-Z]/.test(d[1])).map(d => d[1]);
const kickerTotal = page => page.evaluate(() => {
    const uid = Number(window._rb2p_myTeamUid), specs = window._rb2p_TEAM_ROSTERS[uid] || [];
    const k = specs.find(p => p.pos === 10); return k ? { total: k.sk + k.st + k.sp + k.sa, name: k.ln } : null;
});

(async () => {
    console.log('=== V528 ONSIDE KICK (Retro Bowl\'s own, 10% + 0.25 x the kicker\'s total) ===');
    const g = await TP.startTwoPlayerGame({});
    try {
        for (const p of [g.a.page, g.b.page]) await p.evaluate(L.installRecorder);
        let o = await L.offense(g, 45000);
        if (!o.ok) throw new Error('nobody has the ball');
        let K = o.off, R = K === g.a ? g.b : g.a;
        await L.setQuarter([g.a.page, g.b.page], 4, 60);
        await R.page.evaluate(() => { const s = RB.engineState(); s.setUserScore(17); s.setOpponentScore(10); });

        // O1
        const kt = await kickerTotal(K.page);
        let t0 = Date.now();
        await kickoff(K.page, [10, 17], 60);
        await sleep(1500);
        let v = await view(K.page);
        const want = 10 + 0.25 * (kt ? kt.total : 0);
        check('O1 the offer: Retro Bowl\'s popup (NO / YES) on the kicking phone, odds 10 + 0.25 x ' + (kt && kt.name) + '\'s ' + (kt && kt.total) + '/40 = ' + want + '%',
              v.vy === 25 && v.onside === 2 && v.last && Math.abs(v.last.odds - want) < 1e-9, JSON.stringify({ v, kt }));

        // O2
        await K.page.evaluate(() => { window._rb2p_onsideForce = 'in'; });
        t0 = Date.now();
        await press(K.page, 100373);
        const kept = await L.until(async () => { const k = await view(K.page); return { ok: ![25, 26, 27, 28, 29].includes(k.vy) && k.ball > 0 && !k.wait, k }; }, 20000, 300);   // no taps: it moves on by itself
        await sleep(5000);   // a hand-off would be shipped by now (the hold is 4 s)
        const k2 = await view(K.page), r2 = await view(R.page), s2 = await sends(K.page, t0);
        check('O2 YES, recovered: the kicker keeps the ball (1st & 10 at its own 45-50, a ball, not waiting); the other phone still waits; nothing handed off',
              kept.ok && k2.has && !k2.wait && k2.d === 1 && k2.tg === 10 && k2.y >= -5.5 && k2.y <= 0.5 && k2.ball > 0 && r2.wait && s2.length === 0 && k2.last && k2.last.roll === 'in',
              JSON.stringify({ k2, r2, sends: s2, ms: kept.ms, diag: await onsideDiag(K.page, t0) }));

        // O3
        await K.page.evaluate(() => { window._rb2p_onsideForce = 'out'; });
        t0 = Date.now();
        await kickoff(K.page, [10, 17], 55);
        await L.until(async () => { const k = await view(K.page); return { ok: k.onside === 2 }; }, 8000, 300);
        await press(K.page, 100373);
        const got = await L.until(async () => { const k = await view(K.page), r = await view(R.page); return { ok: k.wait && !r.wait && r.ball > 0, k, r }; }, 30000, 400);
        const k3 = await view(K.page), r3 = await view(R.page), s3 = await sends(K.page, t0);
        check('O3 YES, not recovered: the other phone gets the ball at the kicker\'s 45-50 (its signed spot 0..+5), the kicker waits; one KICKOFF hand-off',
              got.ok && k3.wait && !r3.wait && r3.has && r3.y >= -0.5 && r3.y <= 5.5 && s3.length === 1 && /^SEND KICKOFF/.test(s3[0]) && k3.last && k3.last.roll === 'out',
              JSON.stringify({ k3, r3, sends: s3, diag: await onsideDiag(K.page, t0) }));

        // O4: now R has the ball; R kicks (behind), NO — after a moment (in a game a kickoff never follows a hand-off within
        // seconds; the bridge ignores a possession flip for 2 s after one lands)
        [K, R] = [R, K];
        await sleep(4000);
        await K.page.evaluate(() => { window._rb2p_onsideForce = null; });
        t0 = Date.now();
        await kickoff(K.page, [10, 17], 50);
        const offered = await L.until(async () => { const k = await view(K.page); return { ok: k.onside === 2 }; }, 8000, 300);
        await press(K.page, 100371);
        const got4 = await L.until(async () => { const k = await view(K.page), r = await view(R.page); return { ok: k.wait && !r.wait && r.ball > 0, k, r }; }, 30000, 400);
        const s4 = await sends(K.page, t0);
        check('O4 NO: the normal kickoff — the other phone receives on its own side (own 1-49), the kicker waits (one KICKOFF hand-off)',
              offered.ok && got4.ok && s4.length === 1 && /^SEND KICKOFF/.test(s4[0]) && got4.r.y < 0, JSON.stringify({ k: got4.k, r: got4.r, sends: s4, diag: await onsideDiag(K.page, t0) }));

        // O5: R now has the ball; R kicks while AHEAD — no offer
        [K, R] = [R, K];
        await sleep(4000);
        t0 = Date.now();
        await kickoff(K.page, [24, 17], 45);
        await sleep(1500);
        const v5 = await view(K.page);
        const got5 = await L.until(async () => { const k = await view(K.page), r = await view(R.page); return { ok: k.wait && !r.wait && r.ball > 0, k, r }; }, 30000, 400);
        check('O5 ahead: no onside popup (Retro Bowl\'s rule) — the normal kickoff', v5.onside === 0 && got5.ok, JSON.stringify({ v5, k: got5.k, r: got5.r }));

        // O7: R has the ball again; R kicks (behind) and leaves the popup unanswered
        [K, R] = [R, K];
        await sleep(4000);
        await K.page.evaluate(() => { window._rb2p_onsideAskMs = 4000; window._rb2p_onsideForce = null; });
        t0 = Date.now();
        await kickoff(K.page, [10, 17], 40);
        const asked = await L.until(async () => { const k = await view(K.page); return { ok: k.onside === 2 }; }, 8000, 300);
        const got7 = await L.until(async () => { const k = await view(K.page), r = await view(R.page); return { ok: k.wait && !r.wait && r.ball > 0, k, r }; }, 30000, 400);
        const s7 = await sends(K.page, t0), d7 = await onsideDiag(K.page, t0);
        check('O7 the popup left unanswered: NO by itself — the normal kickoff (one KICKOFF hand-off), the other phone receives',
              asked.ok && got7.ok && s7.length === 1 && /^SEND KICKOFF/.test(s7[0]) && d7.some(l => /no answer in/.test(l)), JSON.stringify({ k: got7.k, r: got7.r, sends: s7, diag: d7 }));

        // O8: the gate, on the phone that now has the ball
        const gate = await R.page.evaluate(() => {
            const s = RB.engineState(), f = window._rb2p_onsideAllowed, out = {};
            const keep = { c: window._rb2p_pickSixPatCascadeActive, o: window._rb2p_p6ScorerOwes, m: s.engineMinutesLeft, sec: s.engineSecondsLeft };
            out.plain = f();
            window._rb2p_pickSixPatCascadeActive = true; out.pick6 = f(); window._rb2p_pickSixPatCascadeActive = keep.c;
            window._rb2p_p6ScorerOwes = true; out.scorerOwes = f(); window._rb2p_p6ScorerOwes = keep.o;
            if (window._rb2p_clockLicence) window._rb2p_clockLicence('test', 2000);
            s.engineMinutesLeft = 0; s.engineSecondsLeft = 0; out.zero = f(); s.engineMinutesLeft = keep.m; s.engineSecondsLeft = keep.sec;
            return out;
        });
        check('O8 offered on a plain late kickoff, never inside the pick-six chain (cascade or the scorer owing) or at 0:00',
              gate.plain === true && gate.pick6 === false && gate.scorerOwes === false && gate.zero === false, JSON.stringify(gate));

        // O6
        const A = await view(g.a.page), B = await view(g.b.page);
        check('O6 never both phones on offense', !(A.has && !A.wait && B.has && !B.wait), JSON.stringify({ A, B }));
    } finally { try { await g.cleanup(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
