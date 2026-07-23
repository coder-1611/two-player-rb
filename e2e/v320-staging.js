// e2e/v320-staging.js — the opening-kickoff staging healer must stand down once
// a play has run.
//
// Device report: "after the change of quarters the plays auto-change at a
// consistent interval, infinitely — like clicking the audible button." Root
// cause: the STUCK@staging self-healer (index.html ~11203) fires every 700ms
// while (0-0 && a kickoff-button ghost && formation && !waiting), calling
// proceedKickoff (_7z=1, a button press the engine consumes as a play-change).
// It targets the OPENING freeze, but a 0-0 game reached via timelapse keeps 0-0
// across quarters, and a lingering kickoff ghost kept it armed. V320 gates it on
// _rb2p_anyPlayRun: once any play has developed (ball kp 4/5), stand down.
//
// T1  the atStaging gate requires _rb2p_anyPlayRun !== true (static, from source)
// T2  a developed play (ball kp 5) sets _rb2p_anyPlayRun = true
// T3  a dead ball (kp 0) does NOT set it (the opening staging stays healable)
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const SET_BALL_KP = `(function (kp) {
    var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (var i = 0; i < all.length; i++) { var x = all[i];
        if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { x._kp = kp; return true; } }
    return false;
})`;

(async () => {
    console.log('=== V320 OPENING-STAGING HEALER STANDS DOWN AFTER A PLAY ===');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

    // ---- T1 (static): the gate is present in the atStaging condition ----
    const at = html.slice(html.indexOf('var atStaging = inMH'),
                          html.indexOf('var atStaging = inMH') + 260);
    check('T1 atStaging requires _rb2p_anyPlayRun !== true',
          /window\._rb2p_anyPlayRun\s*!==\s*true/.test(at),
          'gate not found in atStaging: ' + at.slice(0, 160));

    // ---- T2/T3 (functional): the flag is set by a developed play, not a dead ball ----
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        const r = await page.evaluate(async (setKp) => {
            const setBall = eval('(' + setKp + ')');
            window._rb2p_anyPlayRun = false;
            setBall(0);
            await new Promise(f => setTimeout(f, 120));   // a few observer ticks
            const afterDead = window._rb2p_anyPlayRun === true;
            setBall(5);                                    // ball "received" = a play developed
            await new Promise(f => setTimeout(f, 120));
            const afterLive = window._rb2p_anyPlayRun === true;
            return { afterDead, afterLive };
        }, SET_BALL_KP.toString());
        check('T2 a developed play (ball kp 5) sets _rb2p_anyPlayRun = true', r.afterLive,
              'flag stayed false after kp=5');
        check('T3 a dead ball (kp 0) does NOT set the flag (opening stays healable)', !r.afterDead,
              'flag was set with no play run');
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
