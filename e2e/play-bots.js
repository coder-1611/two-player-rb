// play-bots.js — drive TWO bots that actually PLAY, using Node-side TRUSTED
// mouse input (the engine's snap/throw only responds to real drags, not in-page
// synthetic PointerEvents). Opens two windows (visible by default) in one room
// and plays both sides until killed.
//
//   node play-bots.js                 # two VISIBLE windows in room PLAY
//   node play-bots.js --headless ROOM # headless (for verification), custom room
//   ROOM defaults to 'PLAY'.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FB_DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';

const args = process.argv.slice(2);
const HEADLESS = args.includes('--headless');
const ROOM = (args.find(a => !a.startsWith('--')) || 'PLAY').toUpperCase().slice(0, 4);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clearRoom() { try { await fetch(FB_DB + '/rooms/' + ROOM + '.json', { method: 'DELETE' }); } catch (e) {} }

async function openWindow(label, xpos) {
    const browser = await puppeteer.launch({
        executablePath: CHROME, headless: HEADLESS ? 'new' : false, defaultViewport: null,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
               '--mute-audio', '--window-size=760,600', '--window-position=' + xpos + ',40',
               '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
               '--disable-renderer-backgrounding']
    });
    const page = (await browser.pages())[0] || await browser.newPage();
    try { const c = await page.target().createCDPSession(); await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) {}
    await page.goto('http://localhost:8790/index.html?cb=' + Date.now(), { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(9000);   // engine boot
    return { browser, page, label };
}

async function evalState(page) {
    return page.evaluate(() => {
        let s = {}; try { s = RB.engineState() || {}; } catch (e) {}
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        let ball = 0, btn = 0; for (const x of inst) { if (x && !x._HL2 && x._eE2 && x._eE2._fE2) { const n = x._eE2._fE2; if (n === 'obj_ball') ball++; if (/btn|button/.test(n)) btn++; } }
        return {
            inMatch: (() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } })(),
            waiting: window._rb2p_userIsWaitingForOpponent === true,
            over: window._rb2p_gameOverReported === true,
            finalShown: (() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display !== 'none'); })(),
            min: s.engineMinutesLeft, sec: s.engineSecondsLeft, q: s.engineQuarter,
            us: s.userScore, them: s.opponentScore, down: s.engineDownNumber, ball, btn
        };
    });
}
async function canvasBox(page) { return page.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; }); }

// A TRUSTED throw drag: press near the QB, drag downfield to a varied target, release.
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
// Click each on-screen button at its ACTUAL position. Button instances carry
// GUI-space x/y (canvas-internal pixels), so map to client coords via the canvas
// rect. Works for any button scene (kickoff, 4th-down PUNT/GO, PAT, continue) —
// the old fixed "zones" missed the 4th-down buttons (which sit mid-left).
async function clickButtons(page) {
    const info = await page.evaluate(() => {
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const out = [];
        for (const x of inst) { if (x && !x._HL2 && x._eE2 && x._eE2._fE2 && /btn|button/.test(x._eE2._fE2)) out.push({ x: x.x, y: x.y }); }
        const c = document.getElementById('canvas'); const r = c.getBoundingClientRect();
        return { out, cw: c.width, ch: c.height, left: r.left, top: r.top, rw: r.width, rh: r.height };
    });
    // Button .x/.y are GUI-space; the GUI layer is the 480x270 application
    // surface (per the engine), NOT the 760px backbuffer. Click using the
    // 480x270 mapping, and also the canvas-internal mapping as a fallback, so
    // whichever space the engine uses gets hit.
    for (const b of info.out) {
        const candidates = [
            [info.left + (b.x / 480) * info.rw, info.top + (b.y / 270) * info.rh],
            [info.left + (b.x / info.cw) * info.rw, info.top + (b.y / info.ch) * info.rh]
        ];
        for (const [sx, sy] of candidates) { await page.mouse.click(sx, sy); await sleep(120); }
    }
}

async function joinRoom(w) {
    for (let i = 0; i < 12; i++) {
        const view = await w.page.evaluate(() => { const l = document.getElementById('rb-lobby'); return l && l.getAttribute('data-active'); });
        if (view === 'room') { console.log('[' + w.label + '] joined room ' + ROOM); return; }
        await w.page.evaluate(c => { const i = document.getElementById('rb-room-input'); if (i) { i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); } }, ROOM);
        await w.page.click('#rb-join').catch(() => {});
        await sleep(1200);
    }
}
async function readyUp(w) {
    // The READY button only enables once BOTH slots are filled — so call this
    // AFTER both windows have joined.
    for (let i = 0; i < 25; i++) {
        const enabled = await w.page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); });
        if (enabled) { await w.page.click('#rb-ready').catch(() => {}); console.log('[' + w.label + '] readied'); return; }
        await sleep(800);
    }
    console.log('[' + w.label + '] WARNING: ready never enabled');
}

// Per-window play loop using TRUSTED input.
async function playLoop(w) {
    let lastPlay = 0, lastLog = 0;
    while (true) {
        try {
            const s = await evalState(w.page);
            if (s.inMatch && !s.waiting && (Date.now() - lastLog > 4000)) {
                lastLog = Date.now();
                console.log('[' + w.label + '] off Q' + s.q + ' ' + s.min + ':' + String(s.sec).padStart(2, '0') +
                            ' down=' + s.down + ' ball=' + s.ball + ' btn=' + s.btn + ' score=' + s.us + '-' + s.them);
            }
            if (s.inMatch) {
                if (s.over || s.finalShown) { await sleep(1500); continue; }   // game done — stop playing
                if (!s.waiting) {
                    if (s.btn > 0) { await clickButtons(w.page); }
                    else if (s.ball > 0 && Date.now() - lastPlay > 1500) { lastPlay = Date.now(); await trustedThrow(w.page); }
                }
            }
        } catch (e) {}
        await sleep(500);
    }
}

(async () => {
    await clearRoom();
    const A = await openWindow('A', 20);
    const B = await openWindow('B', 780);
    await joinRoom(A);                 // claim both slots FIRST...
    await joinRoom(B);
    await readyUp(A);                  // ...then ready both (button needs both present)
    await readyUp(B);
    console.log('both in — playing room ' + ROOM + (HEADLESS ? ' (headless)' : ' (watch the two windows)'));
    playLoop(A); playLoop(B);
    await new Promise(() => {});   // keep alive
})().catch(e => { console.error('ERR', e); process.exit(1); });
