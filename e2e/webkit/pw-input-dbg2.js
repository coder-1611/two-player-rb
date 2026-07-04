// WebKit input autopsy #2 — this time re-registering the engine's OWN
// listener so firings are truly counted, and dumping the raw input vars.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await H.ensureServer();
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(12000);
  await H.enterMatch(page, 11);
  await sleep(3000);

  await page.evaluate(() => {
    const c = document.getElementById('canvas');
    window.__log = [];
    // re-register the ENGINE's pointer listener with a logging wrapper
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      c.removeEventListener(ev, _hp2, false);
      c.addEventListener(ev, function (e) {
        if (e.type !== 'pointermove')
          window.__log.push('ENGINE ' + e.type + ' id=' + e.pointerId + ' type=' + e.pointerType +
                            ' btn=' + e.button + ' btns=' + e.buttons);
        return _hp2(e);
      }, false);
    }
  });

  const vars = () => page.evaluate(() => ({
    Bo2: (typeof _Bo2 !== 'undefined') ? Array.from(_Bo2) : null,
    kp2: (typeof _kp2 !== 'undefined') ? _kp2 : null,
    jp2: (typeof _jp2 !== 'undefined') ? _jp2 : null,
    bp2: (typeof _bp2 !== 'undefined') ? _bp2 : null,
    mx: (typeof _9p2 !== 'undefined') ? _9p2 : null,
    my: (typeof _ap2 !== 'undefined') ? _ap2 : null,
    clk: (() => { try { const em = RB.engineState(); return em.engineMinutesLeft + ':' + em.engineSecondsLeft; } catch (e) { return '?'; } })()
  }));

  console.log('pre :', JSON.stringify(await vars()));
  const pt = await page.evaluate(() => {
    const iw = window.innerWidth, ih = window.innerHeight;
    return document.documentElement.classList.contains('rb-rot90')
      ? { x: iw * 0.62, y: ih - ih * 0.5 } : { x: iw * 0.5, y: ih * 0.62 };
  });
  await page.touchscreen.tap(pt.x, pt.y);
  await sleep(800);
  console.log('tap1:', JSON.stringify(await vars()));
  await page.touchscreen.tap(pt.x, pt.y);
  await sleep(800);
  console.log('tap2:', JSON.stringify(await vars()));
  const log = await page.evaluate(() => window.__log);
  console.log('engine listener log:'); log.slice(0, 12).forEach(l => console.log('  ' + l));
  await sleep(2000);
  console.log('end :', JSON.stringify(await vars()));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
