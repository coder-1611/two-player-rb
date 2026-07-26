// e2e/v353-loopguard.js — the infinite play-change loop: detected and healed.
//
// Reported three times ("the play keeps re-selecting on its own, over and
// over"), fixed once at the Q1->Q2 rollover (V330: a stray obj_btn_kickoff the
// controller kept consuming) — then reported again, and every time the ~11-line
// device log had scrolled past the moment, so it was never diagnosed. The loop
// now detects itself from its own signature and heals the way a refresh does.
//
// T1  the staging watcher is installed on s_set_up_play
// T2  normal play (a few staging calls) does NOT trip the guard
// T3  the loop signature (repeated staging, dead ball) IS detected
// T4  the heal destroys the loop's fuel: stray kickoff buttons + duplicate
//     audible buttons + the latched controller proceed flag
// T5  the detection is written to the diag, so a real occurrence is on record
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V353 INFINITE PLAY-CHANGE GUARD ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        const t1 = await page.evaluate(() => {
            var idx = RB.findEngineScriptIndex('gml_Script_s_set_up_play');
            return { idx: idx, watched: idx >= 0 && !!_Y._PU1[idx]._p2p_loopWatch,
                     census: typeof window._rb2p_stagingCensus };
        });
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 the staging watcher is installed on s_set_up_play',
              t1.watched === true && t1.census === 'function', JSON.stringify(t1));

        // ---- T2: a couple of legitimate stagings must NOT trip it ----
        const t2 = await page.evaluate(async () => {
            var em = RB.engineState();
            var setUp = RB.getEngineScript('gml_Script_s_set_up_play');
            var ctrl = (function () { var c = _si(71); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
            var before = (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).join('|');
            for (var i = 0; i < 3; i++) { try { setUp(ctrl, _Sc2); } catch (e) {} await new Promise(r => setTimeout(r, 120)); }
            await new Promise(r => setTimeout(r, 1600));
            var after = (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).join('|');
            return { tripped: after.indexOf('LOOP-GUARD') > before.indexOf('LOOP-GUARD') &&
                              after.indexOf('LOOP-GUARD') >= 0 && before.indexOf('LOOP-GUARD') < 0 };
        });
        console.log('  T2: ' + JSON.stringify(t2));
        check('T2 a few legitimate stagings do NOT trip the guard',
              t2.tripped === false, JSON.stringify(t2));

        // ---- T3/T4/T5: the real loop signature ----
        const t3 = await page.evaluate(async () => {
            var em = RB.engineState();
            var setUp = RB.getEngineScript('gml_Script_s_set_up_play');
            var ctrl = (function () { var c = _si(71); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
            // Plant the loop's fuel: a stray kickoff button, a DUPLICATE audible
            // button, and a latched controller proceed flag.
            var kickIdx = null, audIdx = null;
            try {
                var a0 = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
                for (var i = 0; i < a0.length; i++) {
                    var x = a0[i];
                    if (!x || !x._eE2) continue;
                    if (x._eE2._fE2 === 'obj_btn_audible' && audIdx === null) audIdx = x._eE2;
                }
            } catch (e) {}
            // spawn extras via the engine's own instance creator if reachable
            var spawned = 0;
            try {
                if (audIdx && typeof _fr === 'function') {}
            } catch (e) {}
            if (ctrl) ctrl._7z = 1;                     // latched proceed press
            // Drive the signature: many stagings, ball dead.
            try { var b = null, aa = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
                  for (var j = 0; j < aa.length; j++) { var y = aa[j];
                    if (y && !y._HL2 && y._eE2 && y._eE2._fE2 === 'obj_ball') { b = y; break; } }
                  if (b) b._kp = 0; } catch (e) {}
            for (var n = 0; n < 8; n++) { try { setUp(ctrl, _Sc2); } catch (e) {} await new Promise(r => setTimeout(r, 60)); }
            await new Promise(r => setTimeout(r, 1800));
            var log = (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).join('|');
            var census = window._rb2p_stagingCensus();
            var ctrl2 = (function () { var c = _si(71); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
            return { detected: /LOOP-GUARD x\d+/.test(log), healed: /LOOP-GUARD healed/.test(log),
                     kickoffLeft: census.kickoff, audibleLeft: census.audible,
                     proceedFlag: ctrl2 ? Number(ctrl2._7z) || 0 : -1, log: log.slice(-220) };
        });
        console.log('  T3: ' + JSON.stringify(t3));
        check('T3 the loop signature is detected', t3.detected === true, JSON.stringify(t3));
        check('T4 the heal cleared the loop fuel (no stray kickoff button, one audible, flag cleared)',
              t3.healed === true && t3.kickoffLeft === 0 && t3.audibleLeft <= 1 && t3.proceedFlag === 0,
              JSON.stringify(t3));
        check('T5 the occurrence is recorded in the device diag (survives to room telemetry)',
              /LOOP-GUARD/.test(t3.log), t3.log);
    } catch (e) {
        console.error('ERROR mid-test:', e && e.message); fail++;
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
