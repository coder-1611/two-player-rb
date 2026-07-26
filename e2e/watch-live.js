// e2e/watch-live.js — the tests, but VISIBLE.
//
// Everything else in e2e/ runs headless. This opens the same two real browser
// pages, joins a real Firebase room, starts a real 2-player match, and then
// exercises the conversion invariant on screen so you can watch it happen:
// the ball is shoved to midfield, the conversion modal is popped, and you see
// where it lands. Windows stay open until you press Ctrl-C.
//
//   cd ~/rb2p/two-player-rb && node e2e/watch-live.js
const H = require('./harness');
const TP = require('./two-player');
const puppeteer = H.puppeteer;
const sleep = H.sleep;

// Headed override of the harness launcher (same flags, just visible + bigger).
H.launchBrowser = async function () {
    return puppeteer.launch({
        executablePath: H.CHROME,
        headless: false,
        defaultViewport: null,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
               '--enable-unsafe-swiftshader', '--mute-audio',
               '--window-size=1100,760',
               '--disable-background-timer-throttling',
               '--disable-backgrounding-occluded-windows',
               '--disable-renderer-backgrounding']
    });
};

(async () => {
    console.log('\n=== WATCH LIVE — two real phones, one real Firebase room ===\n');
    const g = await TP.startTwoPlayerGame({});
    console.log('  room code: ' + g.code + '   (readable at rooms/' + g.code + ' in Firebase)');
    console.log('  two windows are open: role A and role B\n');
    await sleep(4000);

    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;
    console.log('  role ' + off.role + ' is on offense — watching the conversion invariant on that window\n');

    // Bring the offense window to the front so you're looking at the right one.
    try { await off.page.bringToFront(); } catch (e) {}
    await sleep(1500);

    const say = (m) => console.log(m);
    const beat = async (ms, label) => { if (label) say('      ...' + label + ' (' + (ms/1000) + 's)'); await sleep(ms); };

    say('STEP 1 — just look at the field. Normal play, nothing touched.');
    await beat(6000, 'watching');

    say('');
    say('STEP 2 — I am now moving the ball to MIDFIELD and leaving it there.');
    say('         The sprites will jump once; that is me relocating the field, not a bug.');
    await off.page.evaluate(() => {
        var em = RB.engineState();
        window._rb2p_patPlayPending = false; window._rb2p_patPlayResolved = false;
        window._rb2p_pickSixPatCascadeActive = false; window._rb2p_patDutyMine = null;
        window._rb2p_patOwedSinceMs = 0;
        em.engineDownNumber = 1; em.engineYardsToGo = 10;
        em.engineYardLineSigned = 2;
        if (typeof window._rb2p_resyncScrimmage === 'function') {
            try { window._rb2p_resyncScrimmage(em, 'watch-demo'); } catch (e) {}
        }
    });
    await beat(8000, 'ball is sitting at midfield — look at where the line of scrimmage is');
    const mid = await off.page.evaluate(() => Number(RB.engineState().engineYardLineSigned));
    say('      confirmed: ball at ' + mid + ' (midfield). This is where OKAG showed you the PAT.');

    say('');
    say('STEP 3 — popping the CONVERSION MODAL in...');
    for (const n of [3, 2, 1]) { say('         ' + n + '...'); await sleep(1200); }
    const res = await off.page.evaluate(async () => {
        var em = RB.engineState();
        var msg = _Xi(em.rawEngineMatch, _Sc2, 'matchmsg_PATor2');
        var l1 = _Xi(em.rawEngineMatch, _Sc2, 'match_1pt');
        var l2 = _Xi(em.rawEngineMatch, _Sc2, 'match_2pt');
        var before = Number(RB.engineState().engineYardLineSigned);
        _wm(em.rawEngineMatch, _Sc2, '', msg, l1, l2, 100367, 100369, 16777215, 0.7);
        var atPop = Number(RB.engineState().engineYardLineSigned);
        return { before: before, atPop: atPop };
    });
    say('');
    say('      ball right BEFORE the modal was created : ' + res.before + '   (midfield)');
    say('      ball the INSTANT the modal exists       : ' + res.atPop +
        (Math.abs(res.atPop - 48) <= 0.5 ? '   <-- THE 2-YARD LINE' : '   <-- WRONG'));
    say('');
    say('      Look at the window now: the 1PT/2PT buttons are up, and the ball is');
    say('      on the 2 — it was never drawn at midfield for even one frame.');
    await beat(15000, 'modal is up, take your time');

    console.log('=== windows stay open — Ctrl-C to close ===');
    await new Promise(() => {});   // hold forever
})().catch(e => { console.error('FATAL', e); process.exit(2); });
