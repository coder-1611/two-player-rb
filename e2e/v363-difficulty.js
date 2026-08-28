// e2e/v363-difficulty.js — the difficulty setting can only ever be a real tier.
//
// Live report: both players picked MAX and device B still read "DIF:UNDEFINED".
// Cause: localStorage.setItem(key, undefined) stores the STRING "undefined",
// which is truthy — so it walks straight past every `|| 'max'` default in the
// build and the setting is poisoned permanently. It came from the click
// handler being bound to `.diff-btn:not(.len-btn):not(.mode-btn)`, and
// `.diff-btn` is a shared visual class: the TEAM SELECT dropdown and the VIEW
// ROSTER button wear it too, and neither carries a data-dif — so clicking
// either called setUserDifficultyPref(undefined).
//
// It was never only cosmetic: rb2pBumpDefenderSpeed gates the MAX-only
// defender speed bump on `pref === 'max'`, so a poisoned device quietly played
// a softer defense than the one it had chosen.
//
// T1  a poisoned "undefined" reads back as max, and is HEALED in storage
// T2  every other junk value heals the same way
// T3  a real tier is returned untouched (no clobbering a deliberate choice)
// T4  the setter refuses a non-tier instead of storing it
// T5  only [data-dif] controls are wired — VIEW ROSTER / team select are not
// T6  with a poisoned value, the MAX defender speed bump still recognises MAX
const H = require('./harness');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V363 DIFFICULTY IS ALWAYS A REAL TIER ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });

        // ---- T1: the exact corruption B is carrying ----
        const t1 = await page.evaluate(() => {
            localStorage.setItem('rb2p_difficulty', String(undefined));   // "undefined"
            const raw = localStorage.getItem('rb2p_difficulty');
            const read = window._rb2p_difficultyPref();
            return { raw: raw, read: read, healed: localStorage.getItem('rb2p_difficulty') };
        });
        console.log('  T1: ' + JSON.stringify(t1));
        check('T1 a stored "undefined" reads as max and is healed in storage',
              t1.raw === 'undefined' && t1.read === 'max' && t1.healed === 'max',
              JSON.stringify(t1));

        // ---- T2: any junk, same treatment ----
        const t2 = await page.evaluate(() => {
            const out = {};
            ['null', '', 'MAX', 'insane', '5'].forEach(v => {
                localStorage.setItem('rb2p_difficulty', v);
                out[v || '(empty)'] = window._rb2p_difficultyPref();
            });
            return out;
        });
        console.log('  T2: ' + JSON.stringify(t2));
        check('T2 every non-tier value reads as max',
              Object.keys(t2).every(k => t2[k] === 'max'), JSON.stringify(t2));

        // ---- T3: a deliberate choice is never clobbered ----
        const t3 = await page.evaluate(() => {
            const out = {};
            ['easy', 'medium', 'hard', 'max', 'ultramax'].forEach(v => {
                localStorage.setItem('rb2p_difficulty', v);
                out[v] = window._rb2p_difficultyPref();
            });
            return out;
        });
        console.log('  T3: ' + JSON.stringify(t3));
        check('T3 a real tier is returned untouched',
              Object.keys(t3).every(k => t3[k] === k), JSON.stringify(t3));

        // ---- T4: the setter is the other half of the guarantee ----
        // Clicking the REAL control that caused this — no test-only hook.
        const t4 = await page.evaluate(() => {
            localStorage.setItem('rb2p_difficulty', 'hard');
            const before = localStorage.getItem('rb2p_difficulty');
            const roster = document.querySelector('#rb-view-roster');
            const select = document.querySelector('#rb-team-select');
            if (roster) roster.click();
            if (select) select.click();
            try {   // the roster overlay may have opened; put it away
                if (typeof window._rb2p_hideRosterOverlay === 'function') window._rb2p_hideRosterOverlay();
                var ov = document.querySelector('.show');
                if (ov) ov.classList.remove('show');
            } catch (e) {}
            return { hasRosterBtn: !!roster, hasSelect: !!select, before: before,
                     after: localStorage.getItem('rb2p_difficulty') };
        });
        console.log('  T4: ' + JSON.stringify(t4));
        check('T4 clicking VIEW ROSTER / the team select never touches the difficulty',
              t4.hasRosterBtn === true && t4.after === 'hard', JSON.stringify(t4));

        // ---- T5: the wiring itself ----
        const t5 = await page.evaluate(() => {
            const lobby = document.getElementById('rb-lobby');
            const old = lobby.querySelectorAll('.diff-btn:not(.len-btn):not(.mode-btn)');
            const now = lobby.querySelectorAll('.diff-btn[data-dif]');
            const oldNoDif = Array.prototype.filter.call(old, b => !b.dataset.dif)
                                  .map(b => b.id || b.tagName.toLowerCase());
            return { oldCount: old.length, newCount: now.length, oldNoDif: oldNoDif,
                     newAllHaveDif: Array.prototype.every.call(now, b => !!b.dataset.dif) };
        });
        console.log('  T5: ' + JSON.stringify(t5));
        check('T5 the old selector caught data-dif-less controls; the new one cannot',
              t5.oldNoDif.length > 0 && t5.newCount === 4 && t5.newAllHaveDif === true,
              JSON.stringify(t5));

        // ---- T6: the gameplay consequence, not just the label ----
        const t6 = await page.evaluate(() => {
            localStorage.setItem('rb2p_difficulty', String(undefined));
            // What rb2pBumpDefenderSpeed asks. Poisoned, this used to be false,
            // so the MAX-only defender speed bump silently never applied.
            const isMax = (window._rb2p_difficultyPref() === 'max');
            const agg = (typeof window._rb2p_computeDefenseAggression === 'function')
                ? window._rb2p_computeDefenseAggression() : null;
            localStorage.setItem('rb2p_difficulty', 'max');
            return { isMax: isMax, aggression: agg };
        });
        console.log('  T6: ' + JSON.stringify(t6));
        check('T6 a poisoned device still gets MAX defense (bump recognised, aggression -5)',
              t6.isMax === true && t6.aggression === -5, JSON.stringify(t6));

        await page.close();
    } finally {
        await browser.close();
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
