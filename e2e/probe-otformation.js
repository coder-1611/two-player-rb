// e2e/probe-otformation.js — reproduce the OT/new-drive FORMATION DESYNC.
// Hypothesis: forceUserOffenseDrive SKIPs s_set_up_play when a ball is already
// on the field (the "mid-drive" guard). At an OT kickoff the ball + scattered
// sprites from the PREVIOUS play are still present, so it shifts those scattered
// positions to the OT spot instead of re-forming the huddle — players end up
// clumped/offset from the play-art (the user's screenshot).
//
//   node e2e/probe-otformation.js
const H = require('./harness');
const sleep = H.sleep;

async function dump(page, label) {
    return page.evaluate((lbl) => {
        var s = RB.engineState(), m = s.rawEngineMatch;
        var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        var of = [], df = [], ball = null;
        for (var i = 0; i < all.length; i++) {
            var x = all[i]; if (!x || x._HL2 || !x._eE2 || !x._eE2._fE2) continue;
            var n = x._eE2._fE2;
            if (n === 'obj_playerOF' && typeof x.x === 'number') of.push(Math.round(x.x));
            else if (n === 'obj_playerDF' && typeof x.x === 'number') df.push(Math.round(x.x));
            else if (n === 'obj_ball' && typeof x.x === 'number') ball = Math.round(x.x);
        }
        var spread = a => a.length ? (Math.max.apply(null, a) - Math.min.apply(null, a)) : 0;
        var mean = a => a.length ? Math.round(a.reduce((p, c) => p + c, 0) / a.length) : null;
        return {
            label: lbl,
            B01: Math.round(Number(m._B01)), vb1: Math.round(Number(m._vb1)),
            ball: ball,
            OFcount: of.length, OFmean: mean(of), OFspread: spread(of),
            DFcount: df.length, DFmean: mean(df), DFspread: spread(df),
            // gap between the formation's mean x and the logical scrimmage line
            OFtoB01: mean(of) != null ? mean(of) - Math.round(Number(m._B01)) : null
        };
    }, label);
}

(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { try { window._rb2p_computeDefenseAggression = () => 12; } catch (e) {} });

        // 1) Fresh drive — s_set_up_play forms a clean huddle at the LOS.
        await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
        await sleep(1200);
        console.log('CLEAN FORMATION:', JSON.stringify(await dump(page, 'fresh')));
        await page.screenshot({ path: 'e2e/tests/otform_1_fresh.png' });

        // 2) Scatter the field the way the END of a real play leaves it: the
        //    ball-carrier + blockers strung out downfield, defenders in pursuit.
        //    (A headless snap won't reliably run a full down, so inject the state
        //    the OT boundary actually inherits.)
        await page.evaluate(() => {
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var i = 0;
            for (var k = 0; k < all.length; k++) {
                var x = all[k]; if (!x || x._HL2 || !x._eE2) continue;
                var n = x._eE2._fE2;
                if (n === 'obj_playerOF' || n === 'obj_playerDF' || n === 'obj_ball') {
                    if (typeof x.x === 'number') { x.x += (i % 5) * 90 + 40; if (typeof x.xprevious === 'number') x.xprevious = x.x; }
                    i++;
                }
            }
        });
        await sleep(300);
        console.log('AFTER SCATTER:', JSON.stringify(await dump(page, 'scattered')));
        await page.screenshot({ path: 'e2e/tests/otform_2_scattered.png' });

        // 3) Simulate the OT kickoff: a NEW possession set via forceUserOffenseDrive
        //    while the previous play's ball/sprites are STILL on the field.
        const preBall = await page.evaluate(() => {
            var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            var n = 0; for (var i = 0; i < all.length; i++) { var x = all[i]; if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') n++; }
            return n;
        });
        console.log('ball instances present when OT drive is forced: ' + preBall + (preBall > 0 ? '  → will take the SKIP path' : ''));
        await page.evaluate(() => { try { window._rb2p_inOvertime = true; window._rb2p_forceUserOffenseDrive(-30, true); } catch (e) {} });
        await sleep(1400);
        const ot = await dump(page, 'OT-forced');
        console.log('OT DRIVE FORMATION:', JSON.stringify(ot));
        await page.screenshot({ path: 'e2e/tests/otform_3_ot.png' });

        console.log('\n--- VERDICT ---');
        console.log('If OT OFspread is large (scattered, ~like the post-play spread) and/or');
        console.log('OFtoB01 is far from ~0, the huddle did NOT re-form at the OT spot = BUG.');
    } finally { await browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
