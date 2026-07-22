// probe-scenario.js — exercise scenario.js in a REAL two-page match.
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const TP = require('./two-player');

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                 : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'scenario.js'), 'utf8');
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(4000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;

    // Paste the file exactly as a user would.
    const res = await drv.page.evaluate(s => { eval(s); return true; }, src);
    check('script pastes and runs', res === true);
    await H.sleep(1500);

    const st = await drv.page.evaluate(() => {
        const s = RB.engineState(), m = s.rawEngineMatch;
        const dir = Number(s.engineDriveDirection);
        const yd = Number(s.engineYardLineSigned), tg = Number(s.engineYardsToGo);
        const wantB01 = 1300 + yd * 20 * dir;
        let ball = 0, plOF = 0;
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        for (const x of inst) {
            if (x && !x._HL2 && x._eE2 && x._eE2._fE2) {
                if (x._eE2._fE2 === 'obj_ball') ball++;
                if (/playerOF/.test(x._eE2._fE2)) plOF++;
            }
        }
        return {
            q: Number(s.engineQuarter), min: Number(s.engineMinutesLeft),
            sec: Number(s.engineSecondsLeft), us: Number(s.userScore),
            them: Number(s.opponentScore), yard: yd, down: Number(s.engineDownNumber),
            toGo: tg, waiting: window._rb2p_userIsWaitingForOpponent === true,
            hasBall: s.enginePossessingTeamIdx === s.engineUserTeamIdx,
            b01: Number(m._B01), wantB01, vb1: Number(m._vb1),
            wantVb1: wantB01 + tg * 20 * dir, ball, plOF
        };
    });
    console.log('  state:', JSON.stringify(st));

    check('Q4 set', st.q === 4, 'q=' + st.q);
    check('clock 1:00', st.min === 1 && st.sec === 0, st.min + ':' + st.sec);
    check('trailing 13-21', st.us === 13 && st.them === 21, st.us + '-' + st.them);
    check("ball on the opponent's 1 (_6F +49)", st.yard === 49, '_6F=' + st.yard);
    check('1st & goal from 1', st.down === 1 && st.toGo === 1, st.down + ' & ' + st.toGo);
    check('on offense, not waiting', st.hasBall && !st.waiting);
    check('a live drive spawned (11 OF + ball)', st.plOF >= 11 && st.ball > 0,
          'OF=' + st.plOF + ' ball=' + st.ball);
    check('scrimmage px synced (V298)', Math.abs(st.b01 - st.wantB01) < 1,
          '_B01=' + Math.round(st.b01) + ' want ' + Math.round(st.wantB01));
    check('first-down marker synced', Math.abs(st.vb1 - st.wantVb1) < 1,
          '_vb1=' + Math.round(st.vb1) + ' want ' + Math.round(st.wantVb1));

    // custom-options form
    const st2 = await drv.page.evaluate(() => {
        rb2pScenario({ ownYard: 20, down: 3, toGo: 7, q: 2, min: 1, sec: 30 });
        const s = RB.engineState();
        return { yard: Number(s.engineYardLineSigned), down: Number(s.engineDownNumber),
                 toGo: Number(s.engineYardsToGo), q: Number(s.engineQuarter) };
    });
    check('custom: own 20 -> _6F -30, 3rd & 7, Q2',
          st2.yard === -30 && st2.down === 3 && st2.toGo === 7 && st2.q === 2,
          JSON.stringify(st2));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
