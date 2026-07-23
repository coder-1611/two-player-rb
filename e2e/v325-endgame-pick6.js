// e2e/v325-endgame-pick6.js — a pick-6 as regulation expires must WALK OFF,
// not pop a phantom PAT.
//
// Device report: "there is a pick 6 at the end of the game that goes wrong —
// it brings the team that intercepts into the middle of the field, treats it
// like a PAT, and then goes back to normal." Root cause: the scorer-side PICK6
// receive branch unconditionally set up + popped the extra-point modal, even
// when regulation had already expired. The +6 alone had decided the game, so
// the PAT was moot; it flashed a midfield PAT scene that then vanished the
// instant the thrower's FINAL propagated back.
//
// V325: mirror the existing OT walk-off. When the WIRE clock (the live
// thrower's) shows regulation is over (Q4+ at 0:00) with a NON-TIED score, OR
// the game has already been declared over on this device, skip the PAT and
// declare FINAL directly. A tie (-> overtime) still plays the PAT (the extra
// point can win it in regulation), so that path is unchanged.
//
// T1  (static) the scorer PICK6 branch has the walk-off gate before needsPAT
// T2  end-of-regulation, non-tied PICK6 -> FINAL, NO PAT set up
// T3  mid-game PICK6 (Q2, time left) -> PAT set up as before, game NOT over
// T4  a PICK6 that arrives AFTER the game is already over -> NO PAT
// T5  a TIE at end of regulation still plays the PAT (walk-off does not fire)
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// scoreUser = the SENDER's (thrower's) score; scoreOpp = the sender's view of
// the SCORER's score (already includes the +6, so pick6Plus6Missing:false).
// On receive the branch maps scoreUser -> our opponentScore and scoreOpp -> our
// userScore, so (scoreOpp, scoreUser) become (ourScore, oppScore).
const PICK6 = extra => Object.assign({
    type: 'PICK6', yardLine: 0, ownSide: true, needsPAT: true,
    pick6Plus6Missing: false,
    scoreUser: 14, scoreOpp: 15,          // -> scorer leads 15-14 (non-tied)
    quarter: 4, minutesLeft: 0, secondsLeft: 0,
    fromTeam: 'Pittsburgh', toTeam: 'San Francisco',
    message: 'PICK SIX! Defensive touchdown.', ts: Date.now()
}, extra);

async function readState(page) {
    return page.evaluate(() => ({
        over:        window._rb2p_gameOverReported === true,
        patPending:  window._rb2p_patPlayPending === true,
        cascade:     window._rb2p_pickSixPatCascadeActive === true,
        finalShown:  (function () { try { var f = document.getElementById('rb-final'); return !!(f && f.style.display !== 'none'); } catch (e) { return false; } })()
    }));
}
async function resetOver(page) {
    await page.evaluate(() => {
        window._rb2p_gameOverReported        = false;
        window._rb2p_inOvertime              = false;
        window._rb2p_patPlayPending          = false;
        window._rb2p_patPlayResolved         = false;
        window._rb2p_pickSixPatCascadeActive = false;
        window._rb2p_pick6SentThisPossession = false;
        var f = document.getElementById('rb-final'); if (f) f.style.display = 'none';
    });
    await sleep(120);
}

(async () => {
    console.log('=== V325 END-OF-GAME PICK-6 WALK-OFF ===');

    // ---- T1 (static) ----
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const branchStart = html.indexOf("if (outcome.type === 'PICK6') {");
    const needsPatAt   = html.indexOf('if (outcome.needsPAT === true) {', branchStart);
    const gateRegion   = html.slice(branchStart, needsPatAt);
    check('T1 the scorer PICK6 branch has the walk-off gate before the needsPAT block',
          /p6WireExpired/.test(gateRegion) && /p6AlreadyOver/.test(gateRegion) &&
          /skipping PAT, /.test(gateRegion),
          'walk-off gate not found before needsPAT');

    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => { window._rb2p_myTeamUid = 22; window._rb2p_oppTeamUid = 11; });

        // ---- T2: end-of-regulation, non-tied -> FINAL, no PAT ----
        await resetOver(page);
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); }, PICK6());
        await sleep(400);
        const t2 = await readState(page);
        console.log('  T2 state: ' + JSON.stringify(t2));
        check('T2 an end-of-regulation pick-6 declares the game over', t2.over === true, JSON.stringify(t2));
        check('T2 an end-of-regulation pick-6 does NOT set up a PAT', t2.patPending === false, JSON.stringify(t2));
        check('T2 an end-of-regulation pick-6 leaves no active PAT cascade', t2.cascade === false, JSON.stringify(t2));

        // ---- T3: mid-game (Q2, time left) -> PAT plays, game not over ----
        await resetOver(page);
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); },
                            PICK6({ quarter: 2, minutesLeft: 5, secondsLeft: 0, scoreUser: 7, scoreOpp: 13 }));
        await sleep(400);
        const t3 = await readState(page);
        console.log('  T3 state: ' + JSON.stringify(t3));
        check('T3 a mid-game pick-6 still sets up the PAT (unchanged)', t3.patPending === true, JSON.stringify(t3));
        check('T3 a mid-game pick-6 does NOT end the game', t3.over === false, JSON.stringify(t3));

        // ---- T4: PICK6 that arrives after the game is already over -> no PAT ----
        await resetOver(page);
        await page.evaluate(() => { window._rb2p_gameOverReported = true; });
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); },
                            PICK6({ quarter: 2, minutesLeft: 8, secondsLeft: 30 }));   // even mid-clock: already over
        await sleep(400);
        const t4 = await readState(page);
        console.log('  T4 state: ' + JSON.stringify(t4));
        check('T4 a pick-6 after the game is over does NOT pop a PAT', t4.patPending === false, JSON.stringify(t4));

        // ---- T5: a TIE at end of regulation still plays the PAT (no walk-off) ----
        await resetOver(page);
        await page.evaluate(o => { window._rb2p_applyOpponentOutcome(o); },
                            PICK6({ scoreUser: 14, scoreOpp: 14 }));   // -> 14-14 tie
        await sleep(400);
        const t5 = await readState(page);
        console.log('  T5 state: ' + JSON.stringify(t5));
        check('T5 a tie at end of regulation still sets up the PAT (can win in regulation)',
              t5.patPending === true, JSON.stringify(t5));
        check('T5 a tie at end of regulation does NOT declare the game over',
              t5.over === false, JSON.stringify(t5));
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
