// e2e/v386-emptyfield.js — room FEED: a live phone whose field emptied while its page was
// hidden gets its drive staged again (T1); a kick scene / a dialog is left alone (T2).
const H = require('./harness');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
(async () => {
    await H.ensureServer(); const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { try { window._rb2p_forceUserOffenseDrive(-25); } catch (e) {} });
        await sleep(1500);
        const t1 = await page.evaluate(async () => {
            window._rb2p_userIsWaitingForOpponent = false;
            const kill = () => { const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let n = 0; for (const x of inst) { if (x && !x._HL2 && x._eE2 && /^obj_ball$|^obj_playerOF$|^obj_playerDF$/.test(x._eE2._fE2 || '')) { try { _cr(x); } catch (e) { x._HL2 = true; } n++; } } return n; };
            const killed = kill();
            const count = () => { const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; let b = 0, o = 0; for (const x of inst) { if (x && !x._HL2 && x._eE2) { if (x._eE2._fE2 === 'obj_ball') b++; if (x._eE2._fE2 === 'obj_playerOF') o++; } } return { b, o }; };
            const t0 = Date.now(); let restagedAt = null;
            while (Date.now() - t0 < 8000) { await new Promise(r => setTimeout(r, 100)); const c = count(); if (c.b > 0 && c.o >= 6) { restagedAt = Date.now() - t0; break; } }
            return { killed, restagedAt, after: count(), diag: String(window._rb2p_readDiagLog()).slice(-160) };
        });
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 a live phone with an empty field gets its drive re-staged within ~4s', t1.killed > 0 && t1.restagedAt != null && t1.restagedAt < 4500 && /EMPTY-FIELD re-staged/.test(t1.diag), JSON.stringify(t1));
        const t2 = await page.evaluate(async () => {
            const em = RB.engineState(); em.rawEngineMatch._T11 = 1;                 // a kick scene: the law must stand down
            const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of inst) { if (x && !x._HL2 && x._eE2 && /^obj_ball$|^obj_playerOF$|^obj_playerDF$/.test(x._eE2._fE2 || '')) { try { _cr(x); } catch (e) { x._HL2 = true; } } }
            const d0 = String(window._rb2p_readDiagLog()).length;
            await new Promise(r => setTimeout(r, 4000));
            const fired = /EMPTY-FIELD/.test(String(window._rb2p_readDiagLog()).slice(d0));
            em.rawEngineMatch._T11 = 0;
            return { fired };
        });
        console.log('  T2: ' + JSON.stringify(t2));
        check('T2 in a kick scene the law stands down', t2.fired === false, JSON.stringify(t2));
    } finally { await browser.close(); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
