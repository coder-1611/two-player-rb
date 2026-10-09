// e2e/v532-tabs.js — V532 (the owner: "make it that tabs are disconnected from each other, I have seen a lot of overflow
// from one tab to another that causes glitches"). Real pages, as tabs of ONE browser (one shared storage).
//   T1  settings: tab 1 has read its settings; tab 2 changes every one (difficulty, quarter length, mode, ULTRAMAX value,
//       the defender-speed knobs read every frame, drive direction, name) — tab 1's stay; a NEW tab 3 starts from tab 2's
//   T2  a setting no tab had chosen yet is pinned as "none" in tab 1: tab 2 choosing one later does not reach it
//   T3  a COPY of an open tab (its session copied: tab id, room, role, seat id) finds the original holding its tab, starts
//       clean (no room, role or seat id; its settings kept) and loads again — the original untouched; a RELOAD of the
//       original is not a copy (same tab, its room kept)
//   T4  the database connection's sign-in: each tab's IS the page's own sign-in (the same id — no second account), and
//       signing one tab's connection out leaves the other tab's signed in
//   T5  no shared-storage write of the turnover backup is left in the page (it carried no room)
const H = require('./harness');
const fs = require('fs'), path = require('path');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = Date.now().toString(36);
async function tab(ctx, pre) {
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((o) => {
        try {
            localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_news_v387', '1'); localStorage.setItem('rb2p_ann_refresh_v1', '1');
            if (o.copy && !localStorage.getItem('v532copied_' + o.run)) {   // a browser's "duplicate tab": the session comes along, once
                localStorage.setItem('v532copied_' + o.run, '1');
                Object.keys(o.copy).forEach(k => sessionStorage.setItem(k, o.copy[k]));
            }
        } catch (e) {}
    }, Object.assign({ run: RUN }, pre || {}));
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!(window._rb2p_tabGet && window._rb2p_difficultyPref && window._rb2p_playerName && window._rb2p_getDefSpeedBump && window._rb2p_sdkUid && document.getElementById('rb-lobby')), { timeout: 90000, polling: 300 });
    return page;
}
const settings = page => page.evaluate(() => ({ dif: window._rb2p_difficultyPref(), dir: window._rb2p_driveDirPref(), bump: window._rb2p_getDefSpeedBump(),
    db: window._rb2p_getDbSpeedMult(), ultra: window._rb2p_tabGet('rb2p_ultramax_value'), qm: window._rb2p_tabGet('rb2p_quarter_mins'),
    mode: window._rb2p_tabGet('rb2p_diff_mode'), name: window._rb2p_playerName() }));
const sess = page => page.evaluate(() => { const o = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); o[k] = sessionStorage.getItem(k); } return o; });

(async () => {
    console.log('=== V532 TABS ARE DISCONNECTED (' + RUN + ') ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const ctx = await browser.createBrowserContext();
        // T1 + T2
        const pre = await ctx.newPage(); await pre.goto(H.url(), { waitUntil: 'domcontentloaded' });
        await pre.evaluate(() => { localStorage.setItem('rb2p_difficulty', 'hard'); localStorage.setItem('rb2p_quarter_mins', '2'); localStorage.setItem('rb2p_diff_mode', 'same');
                                   localStorage.setItem('rb2p_driveDir', '1'); localStorage.setItem('rb2p_name', 'Tab One'); localStorage.removeItem('rb2p_def_speed_bump');
                                   localStorage.removeItem('rb2p_db_speed_mult'); localStorage.removeItem('rb2p_ultramax_value'); });
        await pre.close();
        const t1 = await tab(ctx), s1a = await settings(t1);
        const t2 = await tab(ctx);
        await t2.evaluate(() => { const S = window._rb2p_tabSet; S('rb2p_difficulty', 'easy'); S('rb2p_quarter_mins', 3); S('rb2p_diff_mode', 'different'); S('rb2p_driveDir', -1);
                                  S('rb2p_name', 'Tab Two'); window._rb2p_setDefSpeedBump(0.2); window._rb2p_setDbSpeedMult(2.5); S('rb2p_ultramax_value', -3); });
        await sleep(500);
        const s1b = await settings(t1), t3 = await tab(ctx), s3 = await settings(t3);
        const same = JSON.stringify(s1a) === JSON.stringify(s1b);
        check('T1 tab 2 changes every setting: tab 1 keeps its own (hard, 2 min, same, right, Tab One); a NEW tab starts from tab 2\'s',
              same && s1a.dif === 'hard' && s1a.qm === '2' && s1a.name === 'Tab One' && s3.dif === 'easy' && s3.qm === '3' && s3.mode === 'different' && s3.dir === -1 && s3.name === 'Tab Two' && s3.bump === 0.2 && s3.db === 2.5 && s3.ultra === '-3',
              JSON.stringify({ s1a, s1b, s3 }));
        check('T2 settings no tab had chosen (the speed knobs, ULTRAMAX) are pinned in tab 1: tab 2 choosing them later does not reach its game',
              s1b.bump === 0.03 && s1b.db === 1.5 && s1b.ultra === null, JSON.stringify(s1b));
        // T3
        await t1.evaluate(() => { sessionStorage.setItem('rb_room', 'ZQ1X'); sessionStorage.setItem('rb_role_ZQ1X', 'a'); sessionStorage.setItem('rb2p_sid', 'sid-original'); });
        const orig = await sess(t1);
        const t4 = await tab(ctx, { copy: orig });
        let c = null; for (let i = 0; i < 40; i++) { await sleep(250); c = await sess(t4).catch(() => null); if (c && c.rb2p_tab && c.rb2p_tab !== orig.rb2p_tab && c.rb2p_tabCopyAt) break; }
        await t4.waitForFunction(() => !!window._rb2p_tabReady, { timeout: 60000 }).catch(() => {});
        const c2 = await sess(t4), o2 = await sess(t1);
        const tReady0 = Date.now();
        await t1.reload({ waitUntil: 'domcontentloaded' });
        await t1.waitForFunction(() => !!window._rb2p_tabReady, { timeout: 90000 });
        const rel = await t1.evaluate(async () => { const t0 = Date.now(); const r = await window._rb2p_tabReady; return { r, ms: Date.now() - t0, tab: sessionStorage.getItem('rb2p_tab'), copy: !!window._rb2p_tabWasCopy }; });
        check('T3 a copied tab starts clean (new tab id; no room or role; a seat id of its own; its settings kept) — the original untouched',
              c2.rb2p_tab && c2.rb2p_tab !== orig.rb2p_tab && !c2.rb_room && !c2.rb_role_ZQ1X && c2.rb2p_sid !== 'sid-original' && c2.rb2p_difficulty === orig.rb2p_difficulty &&
              o2.rb_room === 'ZQ1X' && o2.rb_role_ZQ1X === 'a' && o2.rb2p_sid === 'sid-original' && o2.rb2p_tab === orig.rb2p_tab,
              JSON.stringify({ copy: { tab: c2.rb2p_tab, room: c2.rb_room, role: c2.rb_role_ZQ1X, sid: c2.rb2p_sid, dif: c2.rb2p_difficulty }, orig: { tab: o2.rb2p_tab, room: o2.rb_room, sid: o2.rb2p_sid } }));
        check('T3b a reload of the original is not a copy: the same tab', rel.tab === orig.rb2p_tab && !rel.copy && rel.r && !rel.r.copy, JSON.stringify(rel));
        // T4
        await sleep(1500);
        const auth = await Promise.all([t2, t3].map(p => p.evaluate(() => ({ rest: window._rb2p_restUid(), sdk: window._rb2p_sdkUid(), seeded: window._rb2p_sdkSeeded === true }))));
        await t2.evaluate(() => window._rb2p_sdkOut());
        await sleep(2500);
        const after = await Promise.all([t2, t3].map(p => p.evaluate(() => window._rb2p_sdkUid())));
        check('T4 each tab\'s connection signs in as the page itself (same id, no second account); one tab signing out leaves the other signed in',
              auth.every(a => a.rest && a.sdk && a.sdk.uid === a.rest && a.seeded) && auth[0].rest === auth[1].rest && after[0] === null && after[1] && after[1].uid === auth[1].rest,
              JSON.stringify({ auth, after }));
        // T5
        const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        check('T5 no shared-storage write of the turnover backup is left', !/localStorage\.setItem\('rb2p_pendingInt'/.test(src) && /sessionStorage\.setItem\('rb2p_pendingInt'/.test(src));
    } finally { try { await browser.close(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
