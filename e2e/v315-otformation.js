// e2e/v315-otformation.js — the OT kickoff must RE-FORM the huddle, not inherit
// the previous play's scattered sprites.
//
// Device report (screenshot): at the OT start the players sat well off the line
// of scrimmage / play-art. Root cause: forceUserOffenseDrive SKIPs s_set_up_play
// when a ball is already on the field (the mid-drive guard). At an OT kickoff the
// PREVIOUS play's ball + strung-out sprites are still present, so it just SHIFTED
// those scattered positions to the OT spot. V315 adds a freshDrive flag that
// clears the stale field first so a clean formation spawns.
//
// T1  with freshDrive, a scattered field re-forms into a tight huddle at the LOS
// T2  negative control: WITHOUT freshDrive the scatter is preserved (bug shape)
// T3  no duplicate spawn — exactly 11 OF after the fresh force
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function dump(page) {
    return page.evaluate(() => {
        var m = RB.engineState().rawEngineMatch;
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var of = [];
        for (var i = 0; i < all.length; i++) {
            var x = all[i]; if (!x || x._HL2 || !x._eE2) continue;
            if (x._eE2._fE2 === 'obj_playerOF' && typeof x.x === 'number') of.push(x.x);
        }
        var spread = of.length ? Math.round(Math.max.apply(null, of) - Math.min.apply(null, of)) : 0;
        var mean = of.length ? of.reduce((p, c) => p + c, 0) / of.length : 0;
        return { OFcount: of.length, OFspread: spread, OFtoB01: Math.round(mean - Number(m._B01)) };
    });
}
async function scatter(page) {
    await page.evaluate(() => {
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [], i = 0;
        for (var k = 0; k < all.length; k++) {
            var x = all[k]; if (!x || x._HL2 || !x._eE2) continue;
            var n = x._eE2._fE2;
            if (n === 'obj_playerOF' || n === 'obj_playerDF' || n === 'obj_ball') {
                if (typeof x.x === 'number') { x.x += (i % 5) * 90 + 40; if (typeof x.xprevious === 'number') x.xprevious = x.x; }
                i++;
            }
        }
    });
    await sleep(250);
}

(async () => {
    console.log('=== V315 OT KICKOFF RE-FORMS THE HUDDLE ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { try { window._rb2p_computeDefenseAggression = () => 12; } catch (e) {} });

        // ---- T2 (negative control): WITHOUT freshDrive, the scatter persists ----
        await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
        await sleep(1100);
        await scatter(page);
        const scat = await dump(page);
        await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-30 /* no freshDrive */); } catch (e) {} });
        await sleep(1200);
        const noFresh = await dump(page);
        console.log('  scattered: ' + JSON.stringify(scat) + '  → no-freshDrive: ' + JSON.stringify(noFresh));
        check('T2 without freshDrive the scattered formation is NOT re-formed (bug shape reproduced)',
              noFresh.OFspread > 250 && Math.abs(noFresh.OFtoB01) > 120,
              'expected the scatter to persist; got ' + JSON.stringify(noFresh));

        // ---- T1 + T3: WITH freshDrive, a scattered field re-forms cleanly ----
        await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
        await sleep(1100);
        await scatter(page);
        const scat2 = await dump(page);
        await page.evaluate(() => { try { window._rb2p_inOvertime = true; window._rb2p_forceUserOffenseDrive(-30, true); } catch (e) {} });
        await sleep(1300);
        const fresh = await dump(page);
        console.log('  scattered: ' + JSON.stringify(scat2) + '  → freshDrive: ' + JSON.stringify(fresh));
        check('T1 with freshDrive the huddle RE-FORMS tight at the line (spread small, mean near LOS)',
              fresh.OFspread < 200 && Math.abs(fresh.OFtoB01) < 90,
              'expected a tight huddle; got ' + JSON.stringify(fresh));
        check('T3 exactly 11 offensive players after the fresh force (no duplicate spawn)',
              fresh.OFcount === 11, 'OFcount=' + fresh.OFcount);
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
