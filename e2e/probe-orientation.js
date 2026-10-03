// e2e/probe-orientation.js — what a phone / iPad shows in a real two-player game: screenshots of the offense phone at
// the pre-snap state in several viewports (the engine's buffer is sized at boot; later sizes = toolbar / rotation changes)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
const OUT = process.env.ORIENT_OUT || require('path').join(process.env.HOME, 'rb2p', 'research', 'orient');
(async () => {
    const MODE = process.env.ORIENT_MODE || 'landscape';
    const g = await TP.startTwoPlayerGame({ mobile: MODE });
    try {
        await sleep(9000);
        const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
        const off = aWait ? g.b : g.a, def = off === g.a ? g.b : g.a;
        const info = p => p.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); const s = RB.engineState();
            return { win: innerWidth + 'x' + innerHeight, buf: c.width + 'x' + c.height, css: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height),
                     rot: document.documentElement.classList.contains('rb-rot90'), q: s && s.engineQuarter, clk: s && (s.engineMinutesLeft + ':' + s.engineSecondsLeft), d: s && s.engineDownNumber, tg: s && s.engineYardsToGo }; });
        const sizes = (process.env.ORIENT_SIZES || '').split(',').filter(Boolean).map(x => x.split('x').map(Number));
        console.log('boot ' + MODE + ': offense ' + off.role + ' ' + JSON.stringify(await info(off.page)));
        await off.page.screenshot({ path: OUT + '/' + MODE + '-boot-offense.png' });
        await def.page.screenshot({ path: OUT + '/' + MODE + '-boot-defense.png' });
        for (const [w, h] of sizes) {
            await off.page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
            await sleep(2500);
            console.log(w + 'x' + h + ': ' + JSON.stringify(await info(off.page)));
            await off.page.screenshot({ path: OUT + '/' + MODE + '-' + w + 'x' + h + '.png' });
        }
    } finally { await g.cleanup(); }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
