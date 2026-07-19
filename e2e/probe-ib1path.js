// probe-ib1path.js — which path does the engine use to invoke s_update_commentary
// (_Ib1)? Registry (_Y._PU1[idx], which V115/V295 wrap) or the bare global?
const H = require('./harness');
(async () => {
    const b = await H.launchBrowser();
    const { page } = await H.openPage(b, { match: true });
    const info = await page.evaluate(() => {
        const idx = RB.findEngineScriptIndex('gml_Script_s_update_commentary');
        const reg = _Y._PU1[idx];
        return {
            idx,
            regIsClamp: !!(reg && reg._p2p_clamp),
            globType: typeof _Ib1,
            globIsClamp: (typeof _Ib1 === 'function') && !!_Ib1._p2p_clamp,
            globEqReg: (typeof _Ib1 === 'function') && (_Ib1 === reg),
            helper: typeof window._rb2p_agreedQuarterSec
        };
    });
    console.log('install state:', JSON.stringify(info));
    await page.evaluate(() => {
        window.__cnt = { reg: 0, glob: 0 };
        const idx = RB.findEngineScriptIndex('gml_Script_s_update_commentary');
        const reg = _Y._PU1[idx];
        _Y._PU1[idx] = function () { window.__cnt.reg++; return reg.apply(this, arguments); };
        if (typeof _Ib1 === 'function') {
            const g = _Ib1;
            _Ib1 = function () { window.__cnt.glob++; return g.apply(this, arguments); };
        }
    });
    await H.sleep(4000);
    console.log('counters after 4s in-match:', JSON.stringify(await page.evaluate(() => window.__cnt)));
    // Force the end-of-quarter stage the way the clock-expiry handler does
    // (_Vy=12, clock 0:00) and see which invocation path runs case 19.
    await page.evaluate(() => {
        const s = RB.engineState();
        s.engineMinutesLeft = 0; s.engineSecondsLeft = 0; s.engineTickAllowance = 0;
        s.engineDriveFsmStage = 12;
    });
    for (let i = 0; i < 10; i++) {
        await H.sleep(300);
        const st = await page.evaluate(() => {
            const s = RB.engineState() || {};
            return { cnt: window.__cnt, q: s.engineQuarter, vy: s.engineDriveFsmStage,
                     m: s.engineMinutesLeft, sec: s.engineSecondsLeft };
        });
        console.log('t+' + (i + 1) * 300 + 'ms:', JSON.stringify(st));
        if (st.q > 1 && i > 2) break;
    }
    await b.close();
    process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
