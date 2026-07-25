// e2e/probe-sc1.js — EXPLORATORY: what does a rogue _Sc1 (s_switch_drivedirection,
// the thing an engine quarter-roll burst runs before the governor drags the
// quarter back) leave behind on a LIVE formation, and what does the Q3-LAW's
// forceUserOffenseDrive skip-path then do with it?
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

async function dump(page, tag) {
    const d = await page.evaluate(() => {
        var out = {};
        try {
            var em = RB.engineState(); var m = em.rawEngineMatch;
            out.q = m._Wy; out.dir501 = m._501; out.f6F = m._6F;
            out.B01 = m._B01; out.vb1 = m._vb1; out.vy = m._Vy; out.kp = m._kp;
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var ofx = [], ofl = [], ball = null;
            for (var i = 0; i < all.length; i++) {
                var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_playerOF') { ofx.push(Math.round(x.x)); ofl.push(x._L11); }
                if (x._eE2._fE2 === 'obj_ball' && !ball) ball = x;
            }
            out.ofXmin = Math.min.apply(null, ofx); out.ofXmax = Math.max.apply(null, ofx);
            out.ofL11 = ofl.join(',');
            out.ballX = ball ? Math.round(ball.x) : null;
            // formation-forward: where do the OF stand relative to the line?
            // healthy spawn: QB & runners BEHIND _B01 (opposite the drive dir).
            var behind = 0, ahead = 0;
            for (var j = 0; j < ofx.length; j++) {
                var rel = (ofx[j] - m._B01) * m._501;   // >0 = ahead of the line in drive dir
                if (rel > 4) ahead++; else if (rel < -4) behind++;
            }
            out.ofAheadOfLine = ahead; out.ofBehindLine = behind;
        } catch (e) { out.err = String(e); }
        return out;
    });
    console.log('  [' + tag + '] ' + JSON.stringify(d));
    return d;
}

(async () => {
    console.log('=== PROBE _Sc1 on a live formation ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    console.log('  offense = ' + off.role);

    await dump(off.page, 'baseline');

    // rogue direction switch, exactly what a case-19 burst runs (_Sc1 flips
    // _501 AND every live player _L11 — but NOT the pixel scrimmage _B01).
    await off.page.evaluate(() => { _Sc1(RB.engineState().rawEngineMatch, _Sc2); });
    await dump(off.page, 'after _Sc1');

    // what the law's skip-path resync then does (sprites follow the mirrored B01)
    await off.page.evaluate(() => { window._rb2p_resyncScrimmage(null, 'probe'); });
    await sleep(300);
    await dump(off.page, 'after resync');

    // resolve a play: ball moved 3yd in the direction the FORMATION calls
    // forward (the side the OF stand behind), then the engine's own math.
    const res = await off.page.evaluate(() => {
        try {
            var em = RB.engineState(); var m = em.rawEngineMatch;
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var ball = null, ofx = [];
            for (var i = 0; i < all.length; i++) {
                var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
                if (x._eE2._fE2 === 'obj_ball' && !ball) ball = x;
                if (x._eE2._fE2 === 'obj_playerOF') ofx.push(x.x);
            }
            if (!ball) return { err: 'no ball' };
            var mean = ofx.reduce((a, b) => a + b, 0) / ofx.length;
            var visFwd = (mean < m._B01) ? 1 : -1;   // OF huddle behind the line -> forward = toward the line and past it
            var before = { f6F: m._6F, dir: m._501 };
            ball._331 = m._B01 + 3 * 20 * visFwd;
            ball.x = ball._331; ball._X_ = 0; ball._kp = 4;
            __6(m, _Sc2);
            return { visFwd: visFwd, before: before, f6Fafter: m._6F, delta: m._6F - before.f6F };
        } catch (e) { return { err: String(e) }; }
    });
    console.log('  RESOLVE(visual-forward): ' + JSON.stringify(res));

    await g.cleanup();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
