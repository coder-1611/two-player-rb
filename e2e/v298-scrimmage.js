// e2e/v298-scrimmage.js — verify the V298 fixes against the REAL engine.
//
//   node e2e/v298-scrimmage.js
//
// THE BUG (device-reported, room KSKC): "1st & 10, incomplete pass, now 2nd & 2"
// and "drive started on the opponent's 8, an incomplete throw moved me 8 yards".
//
// The engine keeps the scrimmage and first-down marker in PIXELS:
//     _B01 = 1300 + _6F  * 20 * _501
//     _vb1 = _B01  + _l61 * 20 * _501
// and resolves each play as s = (ballX - _B01)/20, then _l61 -= s, _6F += s.
// Both are recomputed only inside s_set_up_play. The bridge moved _6F/_l61 in
// seven places and never touched _B01/_vb1 — so after a bridge-forced spot the
// next snap measured the dead ball against a stale origin and invented yardage.
//
// T1  after forceUserOffenseDrive, the pixel scrimmage matches the yard line
// T2  the "opponent's 8" drive start specifically (the reported scenario)
// T3  the Q3-LAW pattern: distance written AFTER the spawn still lands the
//     first-down marker in the right place
// T4  a phantom-gain simulation: with the scrimmage correct, a dead ball at the
//     line of scrimmage yields s == 0 (no invented yards, down/distance intact)

const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  PASS  ' + name); }
    else    { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// Read the engine's pixel state and what it SHOULD be for the current yard/toGo.
async function scrimmage(page) {
    return page.evaluate(() => {
        const s = RB.engineState();
        const m = s.rawEngineMatch;
        const yd = Number(s.engineYardLineSigned);
        const tg = Number(s.engineYardsToGo);
        const dir = Number(s.engineDriveDirection);
        const wantB01 = 1300 + yd * 20 * dir;
        return {
            yard: yd, toGo: tg, down: Number(s.engineDownNumber), dir: dir,
            b01: Number(m._B01), vb1: Number(m._vb1),
            wantB01: wantB01, wantVb1: wantB01 + tg * 20 * dir
        };
    });
}

(async () => {
    console.log('=== V298 SCRIMMAGE / DOWN-AND-DISTANCE VERIFICATION ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(4000);

    const aWaiting = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWaiting ? g.b : g.a;
    console.log('driver = ' + drv.label);

    // ---- T1: a normal forced drive ----
    await drv.page.evaluate(() => window._rb2p_forceUserOffenseDrive(-25));
    await sleep(1200);
    let sc = await scrimmage(drv.page);
    check('T1 scrimmage px matches yard line after a forced drive',
          Math.abs(sc.b01 - sc.wantB01) < 1,
          '_B01=' + Math.round(sc.b01) + ' want ' + Math.round(sc.wantB01) + ' (yard ' + sc.yard + ')');
    check('T1 first-down marker matches distance-to-go',
          Math.abs(sc.vb1 - sc.wantVb1) < 1,
          '_vb1=' + Math.round(sc.vb1) + ' want ' + Math.round(sc.wantVb1) + ' (toGo ' + sc.toGo + ')');

    // ---- T2: the reported scenario — drive starting on the opponent's 8 ----
    await drv.page.evaluate(() => window._rb2p_forceUserOffenseDrive(42));   // _6F +42 = opponent's 8
    await sleep(1200);
    sc = await scrimmage(drv.page);
    check('T2 opponent-8 drive start: scrimmage px correct',
          Math.abs(sc.b01 - sc.wantB01) < 1,
          '_B01=' + Math.round(sc.b01) + ' want ' + Math.round(sc.wantB01));
    check('T2 opponent-8 drive start: first-down marker correct',
          Math.abs(sc.vb1 - sc.wantVb1) < 1,
          '_vb1=' + Math.round(sc.vb1) + ' want ' + Math.round(sc.wantVb1));

    // ---- T3: the Q3-LAW pattern (distance written AFTER the spawn) ----
    const t3 = await drv.page.evaluate(() => {
        window._rb2p_forceUserOffenseDrive(42);
        const s = RB.engineState();
        s.engineDownNumber = 1;
        s.engineYardsToGo  = 10;                    // written AFTER the setup, as Q3-LAW does
        const before = Number(s.rawEngineMatch._vb1);
        window._rb2p_resyncScrimmage(s, 'test');
        const m = s.rawEngineMatch;
        const dir = Number(s.engineDriveDirection);
        const wantB01 = 1300 + Number(s.engineYardLineSigned) * 20 * dir;
        return { before: before, after: Number(m._vb1),
                 want: wantB01 + Number(s.engineYardsToGo) * 20 * dir };
    });
    check('T3 late distance write still lands the first-down marker correctly',
          Math.abs(t3.after - t3.want) < 1,
          'marker=' + Math.round(t3.after) + ' want ' + Math.round(t3.want));

    // ---- T4: phantom-gain simulation ----
    // With the scrimmage correct, a ball dead AT the line of scrimmage must
    // compute s == 0 — i.e. an incompletion cannot invent yards. Then replay the
    // pre-fix condition (stale _B01) to show it WOULD have.
    const t4 = await drv.page.evaluate(() => {
        window._rb2p_forceUserOffenseDrive(42);
        const s = RB.engineState();
        s.engineDownNumber = 1; s.engineYardsToGo = 10;
        window._rb2p_resyncScrimmage(s, 'test');
        const m = s.rawEngineMatch;
        const dir = Number(s.engineDriveDirection);
        // A dead ball sits at the line of scrimmage: ballX == the true scrimmage px.
        const trueScrimmageX = 1300 + Number(s.engineYardLineSigned) * 20 * dir;
        const gainFixed = (trueScrimmageX - Number(m._B01)) / 20;
        // Pre-fix: _B01 left at a previous spot 160px away.
        const staleB01 = Number(m._B01) - 160;
        const gainStale = (trueScrimmageX - staleB01) / 20;
        return { gainFixed: gainFixed, gainStale: gainStale,
                 toGoAfterFixed: 10 - gainFixed, toGoAfterStale: 10 - gainStale };
    });
    check('T4 incompletion invents NO yardage once the scrimmage is synced',
          Math.abs(t4.gainFixed) < 0.01,
          'phantom gain = ' + t4.gainFixed.toFixed(2) + ' yds');
    check('T4 1st & 10 stays 10 to go (was becoming 2nd & 2)',
          Math.abs(t4.toGoAfterFixed - 10) < 0.01,
          'toGo would be ' + t4.toGoAfterFixed.toFixed(1));
    console.log('        [pre-fix control] a 160px-stale scrimmage would have invented ' +
                t4.gainStale.toFixed(1) + ' yds -> "1st & 10" becomes "2nd & ' +
                t4.toGoAfterStale.toFixed(0) + '"  (matches the report exactly)');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
