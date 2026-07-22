// e2e/v300-sprites.js — the ball and players must FOLLOW a relocated scrimmage.
//
// Device report: after placing a drive, the sprites stayed where they were and
// only the chain marker moved — "I was on my 30, threw an incomplete pass, it
// said -60 yards and 2nd & 60". Cause: moving _6F/_B01 relocated the logical
// spot and the markers, but not the physical sprites, so the engine scored the
// next play as (ballX - _B01)/20 and read the leftover gap as a huge loss.
//
// T1  a mid-drive relocation shifts every field sprite by exactly the scrimmage delta
// T2  after relocating, a dead ball at the line yields ZERO phantom yardage
// T3  scenario.js produces a clean formation sitting at the new scrimmage
// T4  a no-op re-sync (same spot) must NOT move anything

const fs = require('fs');
const path = require('path');
const H = require('./harness');
const TP = require('./two-player');

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const FIELD_SNAPSHOT = () => {
    const s = RB.engineState(), m = s.rawEngineMatch;
    const all = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    const F = { obj_ball: 1, obj_player: 1, obj_playerOF: 1, obj_playerDF: 1 };
    const xs = [];
    let ballX = null;
    for (const x of all) {
        if (x && !x._HL2 && x._eE2 && x._eE2._fE2 && F[x._eE2._fE2] && typeof x.x === 'number') {
            xs.push(Math.round(x.x));
            if (x._eE2._fE2 === 'obj_ball' && ballX === null) ballX = x.x;
        }
    }
    return { b01: Number(m._B01), vb1: Number(m._vb1), yard: Number(s.engineYardLineSigned),
             toGo: Number(s.engineYardsToGo), dir: Number(s.engineDriveDirection),
             n: xs.length, xs, ballX };
};

(async () => {
    console.log('=== V300 SPRITES-FOLLOW-THE-SCRIMMAGE ===');
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(4000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;

    // ---- T1: mid-drive relocation (a ball is already out, so setUpPlay is skipped)
    const t1 = await drv.page.evaluate((snapFn) => {
        const snap = eval('(' + snapFn + ')');
        const s = RB.engineState();
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_forceUserOffenseDrive(-20);        // own 30
        const before = snap();
        // Relocate WITHOUT respawning: exactly the mid-drive path.
        s.engineYardLineSigned = 40;                     // opponent's 10
        s.engineYardsToGo = 10;
        window._rb2p_resyncScrimmage(s, 'test-relocate');
        const after = snap();
        return { before, after };
    }, FIELD_SNAPSHOT.toString());

    const dxScrim = t1.after.b01 - t1.before.b01;
    const dxSprite = t1.after.xs.length && t1.before.xs.length
        ? (t1.after.xs[0] - t1.before.xs[0]) : null;
    console.log('  scrimmage moved ' + Math.round(dxScrim) + 'px; first sprite moved ' + dxSprite + 'px');
    check('T1 sprite count unchanged by the move',
          t1.after.n === t1.before.n, t1.before.n + ' -> ' + t1.after.n);
    check('T1 every field sprite moved by exactly the scrimmage delta',
          t1.before.xs.length > 0 &&
          t1.before.xs.every((x, i) => Math.abs((t1.after.xs[i] - x) - dxScrim) <= 1),
          'expected ' + Math.round(dxScrim) + 'px shift on all ' + t1.before.n);

    // ---- T2: no phantom yardage after the relocation
    const t2 = await drv.page.evaluate(() => {
        const s = RB.engineState(), m = s.rawEngineMatch;
        const dir = Number(s.engineDriveDirection);
        // A dead ball at the line of scrimmage must score as zero yards.
        const trueScrimmageX = 1300 + Number(s.engineYardLineSigned) * 20 * dir;
        const gain = (trueScrimmageX - Number(m._B01)) / 20;
        return { gain, toGo: Number(s.engineYardsToGo), toGoAfter: Number(s.engineYardsToGo) - gain };
    });
    check('T2 dead ball at the line = 0 phantom yards',
          Math.abs(t2.gain) < 0.01, 'gain=' + t2.gain.toFixed(2));
    check('T2 "1st & 10" would stay 10 to go',
          Math.abs(t2.toGoAfter - t2.toGo) < 0.01,
          'toGo ' + t2.toGo + ' -> ' + t2.toGoAfter.toFixed(1));

    // ---- T3: scenario.js gives a clean formation at the new spot
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'scenario.js'), 'utf8');
    const t3 = await drv.page.evaluate((s2, snapFn) => {
        const snap = eval('(' + snapFn + ')');
        eval(s2);
        return snap();
    }, src, FIELD_SNAPSHOT.toString());
    await H.sleep(800);
    const t3b = await drv.page.evaluate(FIELD_SNAPSHOT);
    check('T3 scenario spawned a full clean formation (22 players + ball)',
          t3b.n >= 23, 'field sprites = ' + t3b.n);
    check('T3 scrimmage matches the requested yard line',
          Math.abs(t3b.b01 - (1300 + t3b.yard * 20 * t3b.dir)) < 1,
          '_B01=' + Math.round(t3b.b01));
    // The ball starts with the QB, a little behind the line — but must be in the
    // same neighbourhood as the scrimmage, not a whole field away.
    check('T3 ball sits near the new scrimmage (not stranded downfield)',
          t3b.ballX !== null && Math.abs(t3b.ballX - t3b.b01) < 400,
          'ballX=' + Math.round(t3b.ballX) + ' _B01=' + Math.round(t3b.b01) +
          ' gap=' + Math.round(Math.abs(t3b.ballX - t3b.b01)) + 'px');

    // ---- T4: a no-op re-sync must not disturb the field
    const t4 = await drv.page.evaluate((snapFn) => {
        const snap = eval('(' + snapFn + ')');
        const before = snap();
        window._rb2p_resyncScrimmage(RB.engineState(), 'test-noop');
        return { before, after: snap() };
    }, FIELD_SNAPSHOT.toString());
    check('T4 re-syncing the same spot moves nothing',
          t4.before.xs.every((x, i) => t4.after.xs[i] === x),
          'sprites shifted on a no-op re-sync');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
