// e2e/v547-chat-typing.js — V547 (the owner: "the chat when u click it mid game opens up for a sec and then closes which I
// think is because of the no scroll rule"): on a phone, mid-game, V262's "no scroll" heartbeat blurred ANY focused box
// ("blurred lingering input focus") within a second — the keyboard shut on the game's CHAT box. Two real pages as
// landscape phones (html.rb-mobile, touch), a real match, real touches:
//   C1  a tap on the CHAT chip opens the panel (once — the chip acts on its own finger lift)
//   C2  a tap in the box and typing: 4 s later (several heartbeats) the box still has the focus and the words, the panel is open
//   C3  ENTER sends the line (it is in the panel's log) and the box keeps the focus for the next one
//   C4  the panel's x closes it; the box lets go of the focus
//   RB_E2E_PORT=8806 node e2e/v547-chat-typing.js
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '\n        ' + detail)); };

async function tapEl(page, sel) {   // a real touch at the element's centre, the finger wobbling 3 px
    const r = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
    if (!r) return false;
    await page.touchscreen.touchStart(r.x, r.y); await sleep(60); await page.touchscreen.touchMove(r.x + 3, r.y + 1); await sleep(40); await page.touchscreen.touchEnd();
    return true;
}

(async () => {
    console.log('=== V547: the game\'s CHAT box keeps the focus on a phone ===');
    const g = await TP.startTwoPlayerGame({ mobile: 'landscape' });
    try {
        const P = g.a.page;
        await P.evaluate(() => { window.__diag = []; const real = window._rb2p_diagLog; window._rb2p_diagLog = function (m) { window.__diag.push([Date.now(), String(m)]); return real.apply(this, arguments); }; });
        const chip = await P.waitForFunction(() => { const b = document.getElementById('rb-gchat-btn'); return b && !b.hidden && document.documentElement.classList.contains('rb-in-match'); }, { timeout: 40000, polling: 300 }).then(() => true, () => false);
        const mobile = await P.evaluate(() => document.documentElement.classList.contains('rb-mobile'));
        if (!chip) throw new Error('no CHAT chip in the match (mobile ' + mobile + ')');
        await sleep(1500);
        // C1
        await tapEl(P, '#rb-gchat-btn');
        await sleep(900);
        const c1 = await P.evaluate(() => ({ open: !document.getElementById('rb-gchat').hidden, opens: window.__diag.filter(d => /^CHAT (open|shut)/.test(d[1])).map(d => d[1]) }));
        check('C1 a tap on the CHAT chip opens the panel, once', mobile && c1.open && c1.opens.length === 1 && /^CHAT open/.test(c1.opens[0]), JSON.stringify({ mobile, c1 }));
        // C2
        await tapEl(P, '#rb-gchat-input');
        await P.focus('#rb-gchat-input');   // a headless page has no keyboard to raise; the focus is what the heartbeat took
        await P.keyboard.type('hello there');
        const tFocus = Date.now();
        await sleep(4000);
        const c2 = await P.evaluate(t => ({ focused: document.activeElement && document.activeElement.id === 'rb-gchat-input', value: document.getElementById('rb-gchat-input').value,
            open: !document.getElementById('rb-gchat').hidden, blurred: window.__diag.filter(d => d[0] >= t && /blurred lingering input focus/.test(d[1])).length }), tFocus);
        check('C2 typing in the box: 4 s later it still has the focus and the words, the panel open (nothing blurred it)', c2.focused && c2.value === 'hello there' && c2.open && c2.blurred === 0, JSON.stringify(c2));
        // C3
        await P.keyboard.press('Enter');
        await sleep(2500);
        const c3 = await P.evaluate(() => ({ log: document.getElementById('rb-gchat-log').textContent, value: document.getElementById('rb-gchat-input').value,
            focused: document.activeElement && document.activeElement.id === 'rb-gchat-input' }));
        check('C3 ENTER sends the line (it is in the log) and the box keeps the focus', /hello there/.test(c3.log) && c3.value === '' && c3.focused, JSON.stringify(c3));
        // C4
        await tapEl(P, '#rb-gchat .rb-gchat-x');
        await sleep(900);
        const c4 = await P.evaluate(() => ({ open: !document.getElementById('rb-gchat').hidden, focused: document.activeElement && document.activeElement.id === 'rb-gchat-input' }));
        check('C4 the panel\'s x closes it and the box lets go of the focus', !c4.open && !c4.focused, JSON.stringify(c4));
    } catch (e) {
        fail++; console.log('  FAIL  the run stopped: ' + String(e && e.message || e));
    } finally {
        try { for (const Q of [g.a, g.b]) await Q.page.evaluate(() => { window._rb2p_gameOverReported = true; }); } catch (e) {}
        await g.cleanup();
    }
    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
