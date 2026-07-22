// e2e/v306-midplay.js — the quarter boundary must not restart a live play.
//
// Device report: "after the 3 to 4 quarter shift a play got restarted mid THROW,
// as if it was an incomplete pass, but the down remained same."
//
// Root cause, from a 40ms trace of three real plays (the kp cycle below): the
// "is a play in progress?" predicate whitelisted the ball's _kp against
// {2,3,5,9,10,11,13}. The ball's ACTUAL cycle is:
//     0 -> 1 -> 2 -> 3 -> 7 -> 0     (a pass, incomplete; down 1 -> 2)
//     0 -> 1 -> 2 -> 5 -> 4 -> 0     (catch + run + tackle; down 2 -> 3)
// so 7 = ball IN FLIGHT and 4 = tackle — NEITHER was whitelisted, and the ball
// rests at _kp = 0 between downs. During a pass the predicate wrongly said "no
// play", so the Vy=13 quarter-keep ran s_set_up_play and respawned the formation
// on top of the throw, re-running the same down.
//
// V306: (1) rb2pPlayInProgress() is inverted to `_kp !== 0`, so no unobserved
// in-flight state can re-open the hole; (2) the quarter-keep AND the V302 latch
// wait for the ball to be dead (capped at 12s).
//
// The predicate is the root cause and is tested exhaustively (T1). The two fixes
// are each a one-line `if (rb2pPlayInProgress()) ...` in front of the respawn;
// T2 asserts, from the shipped source, that both guards exist and sit BEFORE the
// respawn they protect. T1 (predicate correct) ∘ T2 (respawn gated on it) is the
// full guarantee. T3 is a best-effort live integration check that SKIPs — never
// falsely passes — if the narrow mid-pass-boundary window isn't hit headlessly.

const H = require('./harness');
const TP = require('./two-player');
const fs = require('fs');
const path = require('path');
const sleep = H.sleep;

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const SET_BALL_KP = `(function (kp) {
    var all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (var i = 0; i < all.length; i++) {
        var x = all[i];
        if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') { x._kp = kp; return true; }
    }
    return false;
})`;

(async () => {
    console.log('=== V306 QUARTER BOUNDARY MUST NOT RESTART A LIVE PLAY ===');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

    // ---------- T2 (static, deterministic): both respawn paths are gated ----------
    // The quarter-keep's doKeepDrive and the V302 latch each respawn / capture the
    // drive; both must consult rb2pPlayInProgress() FIRST. Assert against the
    // shipped source so a future edit that drops either guard fails here.
    const keepGuard = /if \(typeof rb2pPlayInProgress === 'function' && rb2pPlayInProgress\(\)\) \{[\s\S]{0,600}?holding the quarter-keep/;
    check('T2 the quarter-keep holds on a live play before doKeepDrive',
          keepGuard.test(html), 'no live-play hold found before the keep');
    // The latch guard sits in the qEndLatch block, negated (only latch when NOT live).
    const latchBlock = html.slice(html.indexOf('window._rb2p_qEndLatchQ !== qNow'),
                                  html.indexOf('window._rb2p_qEndLatchQ !== qNow') + 400);
    check('T2 the V302 latch refuses to capture while a play is live',
          /!\(typeof rb2pPlayInProgress === 'function' && rb2pPlayInProgress\(\)\)/.test(latchBlock),
          'latch block does not gate on rb2pPlayInProgress');
    // And the predicate itself must be the inverted form, not the old whitelist.
    const predBody = html.slice(html.indexOf('function rb2pPlayInProgress()'),
                                html.indexOf('function rb2pPlayInProgress()') + 700);
    check('T2 the predicate is the inverted `_kp !== 0` form (not the old whitelist)',
          /_kp\)\s*!==\s*0/.test(predBody) && !/k === 2 \|\| k === 3/.test(predBody),
          'predicate still uses the old kp whitelist');

    // ---------- T1 (live engine): the predicate matches the real kp cycle ----------
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;
    const log = [];
    drv.page.on('console', m => { const t = m.text(); if (t.indexOf('[2P') === 0) log.push(t); });

    // Re-derive the SHIPPED predicate (it's a closure — not on window) and test it.
    const m = html.match(/function rb2pPlayInProgress\(\)\s*\{[\s\S]*?\n {12}\}/);
    if (!m) { console.log('could not extract rb2pPlayInProgress'); await g.cleanup(); process.exit(2); }
    await drv.page.evaluate((src) => {
        window.__pred = eval('(' + src.replace('function rb2pPlayInProgress', 'function') + ')');
    }, m[0]);

    const LIVE = [1, 2, 3, 4, 5, 7];   // snap, hands, tackle, run, pass-in-flight
    const t1 = await drv.page.evaluate((setKp, live) => {
        const setBall = eval('(' + setKp + ')');
        const out = { live: {}, dead: null };
        for (const k of live) { setBall(k); out.live[k] = window.__pred(); }
        setBall(0); out.dead = window.__pred();
        return out;
    }, SET_BALL_KP.toString(), LIVE);
    console.log('  live states: ' + JSON.stringify(t1.live) + '  dead(0): ' + t1.dead);
    check('T1 every LIVE ball state (incl. 7=in-flight, 4=tackle) reads as in-progress',
          LIVE.every(k => t1.live[k] === true),
          'failing: ' + LIVE.filter(k => t1.live[k] !== true).join(','));
    check('T1 the dead ball (kp=0) reads as NOT in progress', t1.dead === false, 'kp0=' + t1.dead);
    check('T1 the old whitelist would have MISSED an in-flight pass (kp=7)',
          t1.live[7] === true, 'regression: kp=7 no longer live');

    // ---------- T3 (best-effort live integration; SKIPs, never false-passes) ----------
    // Try to reproduce a real mid-pass quarter boundary. Get onto a live drive,
    // throw, and the instant the ball is airborne, expire the clock. If we manage
    // to catch the park with the ball still live, the keep must NOT respawn it.
    async function canvasBox() {
        return drv.page.evaluate(() => {
            const r = document.getElementById('canvas').getBoundingClientRect();
            return { left: r.left, top: r.top, w: r.width, h: r.height };
        });
    }
    async function clearButtons() {
        for (let i = 0; i < 6; i++) {
            const info = await drv.page.evaluate(() => {
                const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
                const out = [];
                for (const x of inst) if (x && !x._HL2 && x._eE2 && /btn|button/.test(x._eE2._fE2 || ''))
                    out.push({ x: x.x, y: x.y });
                const r = document.getElementById('canvas').getBoundingClientRect();
                return { out, left: r.left, top: r.top, rw: r.width, rh: r.height };
            });
            if (!info.out.length) return;
            info.out.sort((a, b) => a.x - b.x); const b = info.out[0];
            const sc = Math.min(info.rw / 480, info.rh / 270);
            const sx = info.left + (info.rw - 480 * sc) / 2 + (b.x + 44) * sc;
            const sy = info.top + (info.rh - 270 * sc) / 2 + (b.y + 14) * sc;
            await drv.page.mouse.move(sx, sy); await drv.page.mouse.down(); await sleep(160);
            await drv.page.mouse.move(sx + 1, sy + 1); await drv.page.mouse.up(); await sleep(600);
        }
    }
    const liveNow = () => drv.page.evaluate(() => window.__pred && window.__pred());
    const seenAdvance = new Set();   // (kept simple: any QTR-ADVANCE line = a keep fired)

    // The precise bug signal is subtle headless: at a live park the previous
    // play's 11 OF are legitimately still on the field, so "11 players present"
    // does NOT mean a respawn. A real respawn is doKeepDrive firing WHILE live —
    // observable only as the "[2P QTR-ADVANCE] ... KEEPING" log appearing before
    // any dead-ball sample. Because the pass resolves (~1.7s flight) right around
    // the keep's 1500ms dwell, that ordering is racy to catch. So T3 is reported
    // as an OBSERVATION, not a pass/fail gate — the guarantee is T1 (kp=7 reads
    // live) ∘ T2 (both respawn paths return on a live read, before respawning).
    let caughtLiveAtPark = false, keepFiredWhileLive = false, held = false, reproduced = false;
    for (let attempt = 0; attempt < 10 && !reproduced; attempt++) {
        await clearButtons();
        await drv.page.evaluate(() => {
            window._rb2p_lastStableQuarter = 1; window._rb2p_wireQuarter = 1; window._rb2p_qGovPrevQ = 1;
            RB.engineState().engineQuarter = 1; window._rb2p_qEndLatchQ = null;
        });
        const box = await canvasBox();
        await drv.page.mouse.move(box.left + box.w * 0.5, box.top + box.h * 0.62);
        await drv.page.mouse.down();
        await drv.page.mouse.move(box.left + box.w * 0.46, box.top + box.h * 0.42, { steps: 4 });
        await drv.page.mouse.move(box.left + box.w * 0.42, box.top + box.h * 0.24, { steps: 4 });
        await drv.page.mouse.up();
        // Wait for the pass to be airborne, then expire the clock at that instant.
        let live = false;
        for (let i = 0; i < 30; i++) { if (await liveNow()) { live = true; break; } await sleep(20); }
        if (!live) { await sleep(700); continue; }
        await drv.page.evaluate(() => {
            const s = RB.engineState();
            s.engineMinutesLeft = 0; s.engineSecondsLeft = 0; s.engineTickAllowance = 0;
        });
        // Watch the park briefly.
        for (let i = 0; i < 30; i++) {
            const s = await drv.page.evaluate(() => {
                const st = RB.engineState();
                const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
                let of = 0; for (const x of inst) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF') of++;
                return { vy: Number(st.engineDriveFsmStage), of, live: window.__pred && window.__pred(), q: Number(st.engineQuarter) };
            });
            if (s.vy === 13 && s.live) { caughtLiveAtPark = true; reproduced = true; }
            // A keep that fires while the ball is live IS the bug.
            if (s.live && log.some(l => l.indexOf('[2P QTR-ADVANCE] Vy=13') >= 0 &&
                                        !seenAdvance.has(l))) keepFiredWhileLive = true;
            if (log.some(l => l.indexOf('holding the quarter-keep') >= 0)) held = true;
            await sleep(60);
        }
    }
    if (!reproduced) {
        console.log('  [obs] T3 — did not land the clock expiry inside a live pass this run ' +
                    '(narrow window). The guard is proven by T1 ∘ T2.');
    } else {
        console.log('  [obs] T3 reproduced a live-ball quarter park' +
                    (held ? '; the bridge logged a HOLD' : '') +
                    (keepFiredWhileLive ? '; !! keep fired WHILE LIVE (bug)' : '; keep did not fire while live'));
        // Informational only — if it ever DOES catch a keep firing mid-live, shout,
        // but do not fail the suite on the racy negative.
        if (keepFiredWhileLive)
            check('T3 (observed) the keep must not fire while a play is live', false,
                  'caught a mid-live keep — investigate');
    }

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
