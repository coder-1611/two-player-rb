// e2e/v419-touchbot.js — NEVER-FREEZE Phase 3 prerequisite: the bots play through the PHONE
// layer (html.rb-mobile, real touch events, the forced-landscape rotation), not the mouse.
// Every freeze the project has chased lived in that layer (FREEZE-ANATOMY §2).
//
//   M1  portrait phones: html.rb-mobile + rb-rot90 on both pages, and the bot's pointer is touch
//   M2  the touch calibration maps the QB's room position to the screen and back (the rotation included)
//   M3  in portrait, the bot snaps and completes plays with touches (snap + settle on record)
//   M4  in landscape (un-rotated phone), the same
const H = require('./harness');
const TP = require('./two-player');
const B = require('./qb-bot');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function playSome(page, label, n) {
    const out = { snaps: 0, settles: 0, results: [] };
    await page.evaluate(() => { window.__v419snaps = 0; const real = window._rb2p_audit; window._rb2p_audit = function (k, f) { if (k === 'snap') window.__v419snaps++; if (k === 'settle') window.__v419settles = (window.__v419settles || 0) + 1; return real.apply(this, arguments); }; });
    const cal = await B.calibrate(page);
    await page.evaluate('window.__snap = ' + B.IN.snap.toString() + '; window.__lite = ' + B.IN.lite.toString());
    for (let i = 0; i < n; i++) {
        const live = await page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true);
        if (!live) break;
        let r; try { r = await B.playOne(page, cal, {}); } catch (e) { r = { result: 'error', why: String(e.message).slice(0, 80) }; }
        out.results.push(r.result + (r.why ? ':' + r.why : ''));
        await sleep(2500);
    }
    const c = await page.evaluate(() => ({ snaps: window.__v419snaps || 0, settles: window.__v419settles || 0 }));
    out.snaps = c.snaps; out.settles = c.settles;
    return out;
}

(async () => {
    console.log('=== V419 TOUCH BOT (phone layer) ===');
    for (const mode of ['portrait', 'landscape']) {
        const g = await TP.startTwoPlayerGame({ mobile: mode });
        await sleep(7000);
        const lay = await Promise.all([g.a.page, g.b.page].map(p => p.evaluate(() => ({ mobile: document.documentElement.classList.contains('rb-mobile'), rot: document.documentElement.classList.contains('rb-rot90') }))));
        const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
        const off = aWait ? g.b : g.a;
        if (mode === 'portrait') {
            check('M1 portrait phones: rb-mobile + rb-rot90 on both pages, and the bot\'s pointer is touch',
                  lay.every(l => l.mobile && l.rot) && B.pointer(off.page).touch === true, JSON.stringify(lay));
            const cal = await B.calibrate(off.page);
            const s0 = await off.page.evaluate(B.IN.snap);
            const qb = (s0.of || []).find(o => o.pos === 1);
            const css = qb ? cal.toCss(qb.x, qb.y) : null;
            const back = css ? await off.page.evaluate(([x, y]) => { const save = [_9p2, _ap2]; const rot = document.documentElement.classList.contains('rb-rot90');
                let ex = x, ey = y; if (rot) { const m = window.__rbRemapPointer(x + scrollX, y + scrollY); ex = m[0]; ey = m[1]; } _9p2 = ex; _ap2 = ey;
                const r = [_ft._w01(), _ft._x01()]; _9p2 = save[0]; _ap2 = save[1]; return r; }, [css.x, css.y]) : null;
            check('M2 the touch calibration maps the QB to the screen and back within 3 room px (rotation included)',
                  !!back && Math.abs(back[0] - qb.x) <= 3 && Math.abs(back[1] - qb.y) <= 3, JSON.stringify({ qb: qb && [qb.x, qb.y], css, back, affine: cal.affine }));
        } else {
            check('M4a landscape phones: rb-mobile on, not rotated', lay.every(l => l.mobile && !l.rot), JSON.stringify(lay));
        }
        const r = await playSome(off.page, mode, 4);
        check((mode === 'portrait' ? 'M3' : 'M4') + ' ' + mode + ': the bot snaps and plays with touches (snaps and settles on record)',
              r.snaps >= 1 && r.settles >= 1, JSON.stringify(r));
        await g.cleanup();
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
