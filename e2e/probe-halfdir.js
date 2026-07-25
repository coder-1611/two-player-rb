// e2e/probe-halfdir.js — EXPLORATORY (not a test): dump every direction-related
// register on both pages through the v340-style halftime flow, then resolve one
// engine-math play on the Q3 offense and watch which way _6F moves.
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

async function dirDump(page, tag) {
    const d = await page.evaluate(() => {
        var out = {};
        try {
            var em = RB.engineState(); var m = em.rawEngineMatch;
            out.q = m._Wy; out.vy = m._Vy; out.kp = m._kp;
            out.UD = m._UD; out.z0 = m._0z; out.yKick = m.__y;
            out.dir501 = m._501; out.f6F = m._6F; out.B01 = m._B01; out.vb1 = m._vb1;
            out.down = m._t11; out.toGo = m._l61;
            out.expB01 = 1300 + m._6F * 20 * m._501;
            out.clock = m._r11 + ':' + m._s11;
            out.score = (m._Sb1 || []).join('-');
            out.waiting = window._rb2p_userIsWaitingForOpponent === true;
            out.preYard = window._rb2p_preRolloverYard;
            out.resume = window._rb2p_quarterResumePending === true;
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var of = [], df = [], balls = 0, ballKp = null, ballX = null;
            for (var i = 0; i < all.length; i++) {
                var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                var n = x._eE2._fE2;
                if (n === 'obj_playerOF') of.push(x._L11);
                if (n === 'obj_playerDF') df.push(x._L11);
                if (n === 'obj_ball') { balls++; ballKp = x._kp; ballX = Math.round(x.x); }
            }
            function census(a) { var c = {}; a.forEach(v => c[v] = (c[v] || 0) + 1); return c; }
            out.ofL11 = census(of); out.dfL11 = census(df);
            out.balls = balls; out.ballKp = ballKp; out.ballX = ballX;
        } catch (e) { out.err = String(e); }
        return out;
    });
    console.log('  [' + tag + '] ' + JSON.stringify(d));
    return d;
}

(async () => {
    console.log('=== PROBE halfdir ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    const def = aWait ? g.a : g.b;
    console.log('  Q2 kicker(offense) = ' + off.role + ', receiver = ' + def.role);

    await dirDump(g.a.page, 'A boot');
    await dirDump(g.b.page, 'B boot');

    // ---- v340 flow: missed FG as the half expires ----
    await Promise.all([
        off.page.evaluate(() => {
            var em = RB.engineState();
            em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 0;
        }),
        def.page.evaluate(() => {
            var em = RB.engineState();
            em.engineQuarter = 2; em.engineMinutesLeft = 0; em.engineSecondsLeft = 1;
        })
    ]);
    await def.page.evaluate((sc) => {
        window._twoPlayer.receive({
            type: 'OTHER', turnover: false, yardLine: -25, ownSide: true,
            scoreUser: sc.them, scoreOpp: sc.us,
            quarter: 2, minutesLeft: 0, secondsLeft: 0,
            fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
            message: 'Possession change. On your 25 yard line', ts: Date.now()
        });
    }, await def.page.evaluate(() => ({
        us: Number(RB.engineState().userScore) || 0,
        them: Number(RB.engineState().opponentScore) || 0
    })));
    await off.page.evaluate((other) => {
        window._rb2p_userIsWaitingForOpponent = true;
        if (typeof window._rb2p_declareTurnOwner === 'function')
            window._rb2p_declareTurnOwner(other, 'fg-miss');
    }, def.role);
    await sleep(1500);
    await dirDump(g.a.page, 'A postFG');
    await dirDump(g.b.page, 'B postFG');

    await off.page.evaluate(() => { RB.engineState().engineQuarter = 3; });
    await def.page.evaluate(() => { RB.engineState().engineQuarter = 3; });
    await sleep(6000);

    const A3 = await dirDump(g.a.page, 'A Q3');
    const B3 = await dirDump(g.b.page, 'B Q3');

    // ---- resolve one play with the ENGINE's own math on the Q3 offense (B) ----
    const offQ3 = B3.waiting === false ? g.b : g.a;
    console.log('  Q3 offense page = ' + offQ3.role);
    const res = await offQ3.page.evaluate(() => {
        try {
            var em = RB.engineState(); var m = em.rawEngineMatch;
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var ball = null, ofL = null;
            for (var i = 0; i < all.length; i++) {
                var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_ball' && !ball) ball = x;
                if (x._eE2._fE2 === 'obj_playerOF' && ofL == null) ofL = x._L11;
            }
            if (!ball) return { err: 'no ball' };
            var before = { f6F: m._6F, down: m._t11, toGo: m._l61, B01: m._B01, dir: m._501, ofL11: ofL };
            // 3 yards "forward" as the FORMATION faces (ofL11).
            var fwd = (ofL === -1) ? -1 : 1;
            ball._331 = m._B01 + 3 * 20 * fwd;
            ball.x = ball._331;
            ball._X_ = 0;
            ball._kp = 4;                       // BALL_DOWN
            if (typeof __6 !== 'function') return { err: 'no __6', before: before };
            __6(m, _Sc2);                       // obj_controller Alarm0: resolve
            var after = { f6F: m._6F, down: m._t11, toGo: m._l61, B01: m._B01 };
            return { before: before, after: after, fwd: fwd,
                     delta6F: after.f6F - before.f6F };
        } catch (e) { return { err: String(e && e.stack || e) }; }
    });
    console.log('  PLAY RESOLVE: ' + JSON.stringify(res));

    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
