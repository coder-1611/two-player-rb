// e2e/probe-arenacolor.js — verify the arena theme maps each screen to the
// correct TEAM colour (bug #3). Viewer = SF (22, red a60303); opp = PIT (11,
// gold f8e400). Reads the ACTUAL computed colours the browser paints.
const H = require('./harness');
(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, {});
        const out = await page.evaluate(() => {
            window._rb2p_myTeamUid = 22;   // SAN FRANCISCO (viewer)
            window._rb2p_oppTeamUid = 11;  // PITTSBURGH (opponent on offense)
            const accYou = window._rb2p_teamAccent(22);
            const accOpp = window._rb2p_teamAccent(11);
            if (window._rb2p_arenaApply) window._rb2p_arenaApply();
            // show wait so the elements lay out
            const w = document.getElementById('rb-waiting');
            if (w) w.style.display = 'flex';
            if (window._rb2p_waitFeedLive) window._rb2p_waitFeedLive(1, 10, 20, 0);
            const cs = w ? getComputedStyle(w) : null;
            const poss = document.getElementById('rb-wait-poss');
            const my = document.getElementById('rb-wait-myscore');
            const op = document.getElementById('rb-wait-oppscore');
            const ballLeft = (document.getElementById('rb-wait-ball') || {}).style ?
                document.getElementById('rb-wait-ball').style.left : '?';
            return {
                accYou, accOpp,
                varYou: cs ? cs.getPropertyValue('--rb-you').trim() : '?',
                varOpp: cs ? cs.getPropertyValue('--rb-opp').trim() : '?',
                possText: poss ? poss.textContent : '(no poss el)',
                possColor: poss ? getComputedStyle(poss).color : '?',
                myScoreColor: my ? getComputedStyle(my).color : '?',
                oppScoreColor: op ? getComputedStyle(op).color : '?',
                ballLeft
            };
        });
        console.log(JSON.stringify(out, null, 2));
        console.log('\nEXPECT: accYou≈#a60303 (SF red), accOpp≈#f8e400 (PIT gold)');
        console.log('EXPECT: myScoreColor = SF red, oppScoreColor+possColor = PIT gold');
        console.log('EXPECT: ballLeft for yard=20 (opp in MY half) = calc(30% - 2px) [50-20]');
    } finally { await browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
