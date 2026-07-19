// e2e/qskip-repro.js — REPRO for the QIAA "whole 2nd quarter skipped" report.
//
// Drives the REAL two-page Firebase flow (two-player.js), forces the driver's
// Q1 clock to 0:01, snaps with TRUSTED input so the clock expires mid-play
// (the authentic engine path: clock-expiry → _Vy=12 → case 19 → quarter++),
// and samples BOTH engines at 40ms resolution around the transition.
//
//   node e2e/qskip-repro.js            # scenario 1: plain Q1 0:01 expiry
//   node e2e/qskip-repro.js --cascade  # scenario 2: pick-6 cascade active at 0:01 (QIAA)
//
// Verdict:
//   PASS — both pages land on Q2 with a fresh clock and the driver resumes;
//          no page ever shows Q>=3 inside the watch window (Q2 can't have
//          legitimately elapsed that fast).
//   FAIL — any page reaches Q>=3 (Q2 skipped), or the pages disagree, or the
//          driver never gets a playable Q2. Dumps the 40ms transition log.

const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

const CASCADE = process.argv.includes('--cascade');

async function canvasBox(page) {
    return page.evaluate(() => {
        const c = document.getElementById('canvas');
        const r = c.getBoundingClientRect();
        return { left: r.left, top: r.top, w: r.width, h: r.height };
    });
}

// TRUSTED snap+throw drag (engine ignores synthetic in-page events).
async function trustedThrow(page) {
    const b = await canvasBox(page);
    const tx = 0.36 + Math.random() * 0.30, ty = 0.22 + Math.random() * 0.24;
    const x0 = b.left + b.w * 0.50, y0 = b.top + b.h * 0.62;
    const x1 = b.left + b.w * tx,  y1 = b.top + b.h * ty;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
    await page.mouse.move(x1, y1, { steps: 4 });
    await page.mouse.up();
}

// Slow trusted press on the leftmost engine button (kickoff/continue/4th-down).
async function clickButtons(page) {
    const info = await page.evaluate(() => {
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const out = [];
        for (const x of inst) {
            if (x && !x._HL2 && x._eE2 && x._eE2._fE2 && /btn|button/.test(x._eE2._fE2))
                out.push({ x: x.x, y: x.y });
        }
        const c = document.getElementById('canvas');
        const r = c.getBoundingClientRect();
        return { out, left: r.left, top: r.top, rw: r.width, rh: r.height };
    });
    if (!info.out.length) return false;
    info.out.sort((a, b) => a.x - b.x);
    const b = info.out[0];
    const GW = 480, GH = 270;
    const scale = Math.min(info.rw / GW, info.rh / GH);
    const offX = (info.rw - GW * scale) / 2, offY = (info.rh - GH * scale) / 2;
    const sx = info.left + offX + (b.x + 44) * scale;
    const sy = info.top + offY + (b.y + 14) * scale;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await sleep(160);
    await page.mouse.move(sx + 1, sy + 1);
    await page.mouse.up();
    await sleep(250);
    return true;
}

async function evalState(page) {
    return page.evaluate(() => {
        let s = {}; try { s = RB.engineState() || {}; } catch (e) {}
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        let ball = 0, btn = 0;
        for (const x of inst) {
            if (x && !x._HL2 && x._eE2 && x._eE2._fE2) {
                const n = x._eE2._fE2;
                if (n === 'obj_ball') ball++;
                if (/btn|button/.test(n)) btn++;
            }
        }
        return {
            waiting: window._rb2p_userIsWaitingForOpponent === true,
            q: Number(s.engineQuarter), min: Number(s.engineMinutesLeft),
            sec: Number(s.engineSecondsLeft), vy: Number(s.engineDriveFsmStage),
            kp: Number(s.engineControllerState), down: Number(s.engineDownNumber),
            poss: s.enginePossessingTeamIdx === s.engineUserTeamIdx,
            us: Number(s.userScore), them: Number(s.opponentScore),
            cascade: window._rb2p_pickSixPatCascadeActive === true,
            ball, btn
        };
    });
}

// In-page 40ms change-log sampler: records every transition of the fields that
// matter for the quarter cascade, with ms timestamps.
async function installSampler(page) {
    await page.evaluate(() => {
        if (window.__qlog) return;
        window.__qlog = [];
        window.__qlog0 = Date.now();
        setInterval(function () {
            try {
                var s = RB.engineState(); if (!s) return;
                var e = {
                    t: Date.now() - window.__qlog0,
                    q: Number(s.engineQuarter),
                    m: Number(s.engineMinutesLeft),
                    s: Number(s.engineSecondsLeft),
                    vy: Number(s.engineDriveFsmStage),
                    kp: Number(s.engineControllerState),
                    poss: s.enginePossessingTeamIdx === s.engineUserTeamIdx ? 1 : 0,
                    w: window._rb2p_userIsWaitingForOpponent === true ? 1 : 0,
                    d: Number(s.engineDownNumber)
                };
                var l = window.__qlog, p = l.length ? l[l.length - 1] : null;
                if (!p || p.q !== e.q || p.m !== e.m || p.s !== e.s || p.vy !== e.vy ||
                    p.kp !== e.kp || p.poss !== e.poss || p.w !== e.w || p.d !== e.d) {
                    l.push(e);
                    if (l.length > 9000) l.shift();
                }
            } catch (e2) {}
        }, 40);
    });
}

async function dumpLog(who, page, sinceMs) {
    const log = await page.evaluate(() => window.__qlog || []);
    const rows = log.filter(e => e.t >= sinceMs);
    console.log('--- ' + who + ' transition log (' + rows.length + ' rows) ---');
    for (const e of rows) {
        console.log('  ' + who + ' t+' + String(e.t).padStart(6) + 'ms  Q' + e.q +
                    ' ' + e.m + ':' + String(e.s).padStart(2, '0') +
                    '  vy=' + e.vy + ' kp=' + e.kp + ' poss=' + e.poss +
                    ' wait=' + e.w + ' down=' + e.d);
    }
}

(async () => {
    console.log('=== Q-SKIP REPRO ' + (CASCADE ? '(scenario 2: pick-6 cascade at 0:01)' : '(scenario 1: plain 0:01 expiry)') + ' ===');
    const g = await TP.startTwoPlayerGame({ logBridge: true });
    console.log('room ' + g.code + '  a=' + g.a.role + '  b=' + g.b.role);
    await installSampler(g.a.page);
    await installSampler(g.b.page);
    await sleep(4000);   // let the opening drive settle

    // Identify the driver (on offense) and the waiter.
    let stA = await evalState(g.a.page);
    const drv = stA.waiting ? g.b : g.a;
    const wtr = stA.waiting ? g.a : g.b;
    console.log('driver=' + drv.label + ' waiter=' + wtr.label);

    // Get the driver into a live, playable snap state (clear kickoff buttons).
    for (let i = 0; i < 14; i++) {
        const s = await evalState(drv.page);
        if (s.ball > 0 && s.btn === 0 && s.down >= 1 && s.down <= 4) break;
        if (s.btn > 0) await clickButtons(drv.page);
        await sleep(900);
    }

    const pre = await evalState(drv.page);
    console.log('pre-expiry driver state: Q' + pre.q + ' ' + pre.min + ':' +
                String(pre.sec).padStart(2, '0') + ' down=' + pre.down +
                ' ball=' + pre.ball + ' btn=' + pre.btn);
    if (pre.q !== 1) { console.log('VERDICT: SETUP-FAIL (not in Q1)'); await g.cleanup(); process.exit(2); }

    // Mark the sampler epoch so dumps start just before the interesting part.
    const mark = await drv.page.evaluate(() => (window.__qlog.length ? window.__qlog[window.__qlog.length - 1].t : 0));
    const markW = await wtr.page.evaluate(() => (window.__qlog.length ? window.__qlog[window.__qlog.length - 1].t : 0));

    if (CASCADE) {
        // Scenario 2 (QIAA): the pick-6 cascade FLAGS are up on the thrower —
        // the exact regime where the V293 waiting pin AND the live-mirror 0:01
        // floor are both excluded (V294), so nothing protects a 0:00 clock.
        // Keep the play mechanics real (snap, clock expires mid-play) and watch
        // whether the roll stays single and governed even with the pins off.
        console.log('cascade scenario: raising thrower-side cascade flags, snapping at 0:01');
        await drv.page.evaluate(() => {
            window._rb2p_pickSixPatCascadeActive    = true;
            window._rb2p_pickSixThisDeviceIsThrower = true;
            window._rb2p_pickSixPatCascadeRaisedMs  = Date.now();   // keep the 30s/60s clears away
            const s = RB.engineState();
            s.engineMinutesLeft = 0; s.engineSecondsLeft = 1; s.engineTickAllowance = 0;
        });
        for (let i = 0; i < 12; i++) {
            const s = await evalState(drv.page);
            if (s.q !== 1 || (s.min === 0 && s.sec === 0)) break;
            if (s.btn > 0) { await clickButtons(drv.page); }
            else if (s.ball > 0) { await trustedThrow(drv.page); }
            await sleep(1400);
        }
    } else {
        // Scenario 1: plain expiry. Set 0:01 and snap so the clock runs out
        // mid-play — the authentic case-19 path.
        await drv.page.evaluate(() => {
            const s = RB.engineState();
            s.engineMinutesLeft = 0; s.engineSecondsLeft = 1; s.engineTickAllowance = 0;
        });
        console.log('driver clock set to 0:01 — snapping until it expires');
        for (let i = 0; i < 12; i++) {
            const s = await evalState(drv.page);
            if (s.q !== 1 || (s.min === 0 && s.sec === 0)) break;
            if (s.btn > 0) { await clickButtons(drv.page); }
            else if (s.ball > 0) { await trustedThrow(drv.page); }
            await sleep(1400);
        }
    }

    // Watch both pages for 50s and journal every quarter/clock milestone.
    const t0 = Date.now();
    let maxQdrv = 1, maxQwtr = 1, q2FreshSeen = false, q2Playable = false,
        verdict = null, lastLine = '';
    while (Date.now() - t0 < 50000) {
        const sd = await evalState(drv.page);
        const sw = await evalState(wtr.page);
        maxQdrv = Math.max(maxQdrv, sd.q || 1);
        maxQwtr = Math.max(maxQwtr, sw.q || 1);
        if (sd.q === 2 && (sd.min * 60 + sd.sec) >= 45) q2FreshSeen = true;
        // Q2 counts as PLAYABLE when the driver is back on a live drive in it
        // (possession, not waiting, and a ball/button/snap state exists). In
        // the cascade scenario the PAT flow may own the driver longer, so this
        // is only required for scenario 1's verdict.
        if (sd.q === 2 && sd.poss && !sd.waiting && (sd.ball > 0 || sd.btn > 0 || sd.kp === 2))
            q2Playable = true;
        const line = 'drv Q' + sd.q + ' ' + sd.min + ':' + String(sd.sec).padStart(2, '0') +
                     ' vy=' + sd.vy + ' poss=' + (sd.poss ? 1 : 0) + ' wait=' + (sd.waiting ? 1 : 0) +
                     ' casc=' + (sd.cascade ? 1 : 0) +
                     '  |  wtr Q' + sw.q + ' ' + sw.min + ':' + String(sw.sec).padStart(2, '0') +
                     ' vy=' + sw.vy + ' wait=' + (sw.waiting ? 1 : 0);
        if (line !== lastLine) { console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's] ' + line); lastLine = line; }
        if ((sd.q >= 3 || sw.q >= 3)) { verdict = 'FAIL — Q3 reached, Q2 was SKIPPED'; break; }
        await sleep(400);
    }

    if (!verdict) {
        if (maxQdrv === 2 && maxQwtr === 2 && q2FreshSeen && (CASCADE || q2Playable))
            verdict = 'PASS — single roll to Q2 with a fresh clock' +
                      (q2Playable ? ' and a playable drive' : '') + ', no skip';
        else if (maxQdrv === 1 && maxQwtr === 1) verdict = 'INCONCLUSIVE — clock never expired (no roll happened)';
        else verdict = 'CHECK — drvMaxQ=' + maxQdrv + ' wtrMaxQ=' + maxQwtr +
                       ' q2fresh=' + q2FreshSeen + ' q2playable=' + q2Playable;
    }
    console.log('\nVERDICT: ' + verdict);

    await dumpLog('DRV', drv.page, mark);
    await dumpLog('WTR', wtr.page, markW);

    await g.cleanup();
    process.exit(verdict.startsWith('PASS') ? 0 : 1);
})().catch(async e => { console.error('ERR', e); process.exit(3); });
