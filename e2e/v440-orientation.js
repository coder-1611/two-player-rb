// e2e/v440-orientation.js — the phone / iPad layout (the owner: "make sure the orientation on phone is optimal and NEVER
// switches. If that is impossible, have something that says, play in landscape only, and in this you should be able to
// see the clock and the down and yards. Also the options to change play and call time outs").
//
// A real two-player game on two emulated touch phones (landscape, e2e/two-player.js mobile:'landscape'). On the phone
// with the ball:
//   O1  the WHOLE game is on screen — phone 874x402, phone with the browser toolbar 874x360, small phone 667x375, iPad
//       1180x820: the canvas lies inside the window (V438's cover-scaling cut ~45 px off a phone's top and bottom = the
//       scoreboard: score, quarter, the clock you tap for a timeout, down & distance; and ~138 px off each side of an
//       iPad = down & distance, Change Play)
//   O2  the menu, version and report chips sit beside the picture, not over it (phone)
//   O3  held upright mid-game: the turn-sideways screen covers it, nothing is rotated (no rb-rot90, body untransformed),
//       the engine keeps its landscape picture; turned back, the game shows exactly as before (same rect, same buffer)
// Where a touch lands on the new layout (upright, then turned sideways, scrolled page or not) is e2e/v419-scroll.js T2/T4.
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const rectOf = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 }; }, sel);
const overlaps = (a, b) => !!(a && b && a.shown && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
const view = (page, w, h) => page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

(async () => {
    console.log('=== V440 ORIENTATION ===');
    const g = await TP.startTwoPlayerGame({ mobile: 'landscape' });
    try {
        await sleep(9000);
        const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
        const off = aWait ? g.b : g.a;
        const p = off.page;
        // ---- O1: the whole game on screen at every size ----
        const sizes = [[874, 402], [874, 360], [667, 375], [1180, 820]], cuts = [];
        for (const [w, h] of sizes) {
            await view(p, w, h); await sleep(2200);
            const c = await rectOf(p, '#canvas');
            const cut = c ? { top: Math.max(0, -c.t), bottom: Math.max(0, c.b - h), left: Math.max(0, -c.l), right: Math.max(0, c.r - w) } : null;
            cuts.push({ size: w + 'x' + h, canvas: c, cut });
        }
        console.log('  O1: ' + JSON.stringify(cuts.map(x => x.size + ' cut ' + JSON.stringify(x.cut))));
        check('O1 the whole game is on screen on phones and iPads (nothing cut off: the scoreboard, Change Play, the clock)',
              cuts.every(x => x.cut && x.cut.top <= 1 && x.cut.bottom <= 1 && x.cut.left <= 1 && x.cut.right <= 1), JSON.stringify(cuts));
        // ---- O2: the chips beside the picture ----
        await view(p, 874, 402); await sleep(2200);
        const cv = await rectOf(p, '#canvas');
        const chips = { menu: await rectOf(p, '#rb-hud-toggle'), report: await rectOf(p, '#rb-complain'), version: await rectOf(p, '#rb-vj-chip') };
        const over = Object.entries(chips).filter(([k, r]) => overlaps(r, cv)).map(([k]) => k);
        console.log('  O2: canvas ' + JSON.stringify(cv) + ' chips ' + JSON.stringify(chips));
        check('O2 the menu, version and report chips do not cover the game on a phone', over.length === 0 && Object.values(chips).some(r => r && r.shown), JSON.stringify({ over, chips, cv }));
        // ---- O3: upright mid-game, then back ----
        const buf0 = await p.evaluate(() => { const c = document.getElementById('canvas'); return c.width + 'x' + c.height; });
        await view(p, 402, 874); await sleep(2500);
        const up = await p.evaluate(() => { const t = document.getElementById('rb-turn'); const r = t ? t.getBoundingClientRect() : null; const c = document.getElementById('canvas');
            return { rot: document.documentElement.classList.contains('rb-rot90'), portrait: document.documentElement.classList.contains('rb-portrait'), bodyT: getComputedStyle(document.body).transform,
                     covers: !!(r && getComputedStyle(t).display !== 'none' && r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight), buf: c.width + 'x' + c.height }; });
        await view(p, 874, 402); await sleep(2500);
        const back = await p.evaluate(() => { const c = document.getElementById('canvas'); const t = document.getElementById('rb-turn');
            return { portrait: document.documentElement.classList.contains('rb-portrait'), turn: t ? getComputedStyle(t).display : 'missing', buf: c.width + 'x' + c.height }; });
        const cvBack = await rectOf(p, '#canvas');
        console.log('  O3: upright ' + JSON.stringify(up) + ' | back ' + JSON.stringify(back) + ' rect ' + JSON.stringify(cvBack));
        check('O3 held upright: the turn-sideways screen covers it and nothing is rotated; turned back, the game shows exactly as before',
              !up.rot && up.portrait && up.bodyT === 'none' && up.covers && up.buf === buf0 && !back.portrait && back.turn === 'none' && back.buf === buf0 &&
              cvBack && cv && ['l', 't', 'r', 'b'].every(k => Math.abs(cvBack[k] - cv[k]) <= 2), JSON.stringify({ up, back, buf0, cv, cvBack }));
    } finally { await g.cleanup(); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
