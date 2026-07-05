// pw-hang8.js — STUCK POINTER SLOT: the engine's _hp2 writes click state
// ONLY from slot 0 (_Xo2 allocates by pointerId). If a touch's pointerup is
// ever lost, slot 0 stays occupied by the dead pointerId forever; every
// later touch allocates slot 1+ and the engine registers NO clicks and NO
// gui-mouse movement — while DOM listeners (the diag tap-bridge) still see
// every tap. That is EXACTLY the phone stall's input signature
// (gui-mouse pinned at 0,24 while taps were logged). Touch pointer-ids are
// phone-only; a mouse cannot wedge this. Refresh resets the slots.
// Phase 1: prove the wedge (synthetic pointerdown w/o up → real taps dead).
// Phase 2: check the engine's actual slot state + whether a stuck slot
//          blocks the staging tap-anywhere dismissal (_l11(1)).
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await H.ensureServer();
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(10000);
  await H.enterMatch(page, 11);
  await sleep(3000);

  const input = () => page.evaluate(() => ({
    slots: (typeof _Bo2 !== 'undefined') ? Array.from(_Bo2).slice(0, 6) : null,
    jp2: (typeof _jp2 !== 'undefined') ? _jp2 : null,
    kp2: (typeof _kp2 !== 'undefined') ? _kp2 : null,
    gm: (() => { try { return Math.round(_m01(0)) + ',' + Math.round(_o01(0)); } catch (e) { return '?'; } })(),
    clk: (() => { try { const em = RB.engineState(); return em.engineMinutesLeft + ':' + em.engineSecondsLeft; } catch (e) { return '?'; } })()
  }));

  console.log('baseline           :', JSON.stringify(await input()));
  // healthy tap first — engine should see it (slot 0 alloc + release)
  await page.touchscreen.tap(200, 500);
  await sleep(500);
  console.log('after healthy tap  :', JSON.stringify(await input()));

  // THE WEDGE: pointerdown with a touch pointerId that never gets an up
  await page.evaluate(() => {
    const c = document.getElementById('canvas');
    c.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 777, pointerType: 'touch', isPrimary: true,
      clientX: 100, clientY: 400, button: 0, buttons: 1, bubbles: true
    }));
  });
  await sleep(300);
  console.log('after lost-up down :', JSON.stringify(await input()));

  // now the user taps like on the phone — do any register?
  for (let i = 0; i < 4; i++) {
    await page.touchscreen.tap(150 + i * 40, 450 + i * 30);
    await sleep(400);
    console.log('tap ' + (i + 1) + ' (real)      :', JSON.stringify(await input()));
  }

  // drag attempt (the snap gesture) — does the engine see it?
  await page.touchscreen.tap(200, 500);  // no-op check
  const before = await input();
  await page.evaluate(async () => {});
  // drag via touchscreen: down-move-up isn't exposed; use mouse (slot 0 path
  // shares the same slot table for pointer events in WebKit)
  await page.mouse.move(200, 500); await page.mouse.down();
  await sleep(150); await page.mouse.move(260, 420, { steps: 5 }); await page.mouse.up();
  await sleep(800);
  const after = await input();
  console.log('drag before        :', JSON.stringify(before));
  console.log('drag after         :', JSON.stringify(after));
  console.log('VERDICT: ' + ((after.gm === before.gm && after.jp2 === before.jp2)
    ? 'ENGINE INPUT DEAD after one lost pointerup — STUCK-SLOT WEDGE CONFIRMED (matches phone: DOM sees taps, engine sees nothing)'
    : 'engine still receives input — slot theory not confirmed in this form'));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
