// e2e/v426-telemetry.js — the page telemetry the freeze detector needs (the detector audit of 2026-09-30).
//
//   W1  the hang watchdog (the real worker source from index.html, on a simulated clock) tells a device that SLEPT
//       (the worker itself was away the whole gap: kind 'sleep') from a page that HUNG (the worker kept ticking:
//       kind 'hang') — 18 of 20 "HANG" flags were sleeps
//   W2  a real 9s main-thread hang in the browser is reported as kind 'hang'
//   W3  a mouse click in a match (a Chromebook, not a touch phone) is logged as a tap — 128 of 154 V424 games had no
//       taps at all, so a player pressing a dead screen was invisible
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function stream(code, role) { return (await TP.fbGet('rooms/' + code + '/audit/' + role)) || {}; }

(async () => {
    console.log('=== V426 TELEMETRY ===');
    // ---- W1: the worker's own logic on a simulated clock ----
    {
        const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
        const m = /var src = ("var url=null[\s\S]*?2000\);");\s*\n\s*var w = new Worker/.exec(html);
        let src = null; try { src = m && eval(m[1]); } catch (e) {}
        if (!src) check('W1 the watchdog source was found in index.html', false);
        else {
            let now = 1790000000000, tickFn = null, answering = true;
            const posted = [], sent = [];
            const ctx = { Date: { now: () => now }, JSON, setInterval: (f) => { tickFn = f; }, fetch: (u, o) => { sent.push(JSON.parse(o.body)); return Promise.resolve(); } };
            ctx.postMessage = msg => posted.push(msg);
            vm.createContext(ctx); vm.runInContext(src, ctx);
            const tick = () => { tickFn(); while (posted.length) { const p = posted.shift(); if (p.ping && answering) ctx.onmessage({ data: { pong: 1, vis: 'V' } }); } };
            ctx.onmessage({ data: { url: 'https://x/rooms/T/audit/a.json' } });
            for (let i = 0; i < 10; i++) { now += 2000; tick(); }
            const quiet = sent.length;
            now += 40000; tick();                                  // the device slept 40s: the worker was away too
            const slept = sent.slice(quiet).map(b => Object.values(b)[0]);
            for (let i = 0; i < 8; i++) { now += 2000; tick(); }   // awake again, past the 10s report spacing
            answering = false;                                     // the page hangs; the worker keeps ticking
            const before = sent.length;
            for (let i = 0; i < 6; i++) { now += 2000; tick(); }
            const hung = sent.slice(before).map(b => Object.values(b)[0]);
            check('W1 the watchdog says "sleep" when it was away the whole gap and "hang" when it kept ticking',
                  quiet === 0 && slept.length === 1 && slept[0].k === 'stall' && slept[0].kind === 'sleep' && slept[0].ms >= 40000 &&
                  hung.length === 1 && hung[0].kind === 'hang' && hung[0].ms > 6000 && hung[0].wk <= 2000,
                  JSON.stringify({ quiet, slept, hung }));
        }
    }

    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const code = g.code;

    // ---- W2: a real hang ----
    {
        const Q = g.b.page, roleB = g.b.role || 'b';
        await Q.evaluate(() => { if (window._rb2p_stallWorkerFeed) window._rb2p_stallWorkerFeed(); });
        await sleep(3000);
        const t0 = Date.now();
        await Q.evaluate(() => { const s = Date.now(); while (Date.now() - s < 9000) { /* hang */ } });
        let stall = null;
        for (let i = 0; i < 10 && !stall; i++) { await sleep(1500); stall = Object.values(await stream(code, roleB)).find(e => e && e.k === 'stall' && e.t >= t0 - 2000) || null; }
        check('W2 a 9s main-thread hang in the browser is a stall of kind "hang"', !!stall && stall.kind === 'hang' && stall.ms > 6000 && stall.vis === 'V', JSON.stringify(stall));
    }

    // ---- W3: a mouse click is a tap ----
    {
        const P = g.a.page, roleA = g.a.role || 'a';
        const inMatch = await P.evaluate(() => document.documentElement.classList.contains('rb-in-match') && !document.documentElement.classList.contains('rb-mobile'));
        const t0 = Date.now();
        const box = await P.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.15 }; });
        await P.mouse.click(box.x, box.y);
        let tap = null;
        for (let i = 0; i < 8 && !tap; i++) { await sleep(1500); tap = Object.values(await stream(code, roleA)).find(e => e && e.k === 'diag' && /^tap \d+,\d+->gui \d+,\d+.* p=mouse$/.test(e.m || '') && e.t >= t0 - 1000) || null; }
        check('W3 a mouse click in a match on a desktop page (not a touch phone) is logged as a tap', inMatch && !!tap, JSON.stringify({ inMatch, tap }));
    }

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
