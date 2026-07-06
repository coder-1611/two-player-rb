// pw-input.js — why does a touch tap update the engine's pointer POSITION
// but never its click bitmask (_bp2 / _8p2._hn2[0])? Logs every raw event
// the canvas sees + engine input state right after the engine's own
// handlers ran (our listeners are attached after the engine's, so
// same-target bubble order puts us second).
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await H.ensureServer();
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(9000);
  await H.enterMatch(page, 11);
  await sleep(3000);

  await page.evaluate(() => {
    window.__ev = [];
    const snap = () => ({
      bp2: (typeof _bp2 !== 'undefined') ? _bp2 : '?',
      slots: (typeof _Bo2 !== 'undefined') ? Array.from(_Bo2).slice(0, 4).join('/') : '?',
      p9: (typeof _9p2 !== 'undefined') ? Math.round(_9p2) : '?',
      hn: (typeof _8p2 !== 'undefined') ? (_8p2._hn2[0] ? 1 : 0) : '?',
      cn: (typeof _8p2 !== 'undefined') ? (_8p2._cn2[0] ? 1 : 0) : '?',
      gn: (typeof _8p2 !== 'undefined') ? (_8p2._gn2[0] ? 1 : 0) : '?'
    });
    const tgt = document.getElementById('canvas');
    const kinds = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel',
                   'touchstart', 'touchend', 'touchmove', 'touchcancel',
                   'mousedown', 'mouseup'];
    for (const k of kinds) {
      const h = e => {
        const d = { ev: k, t: Math.round(performance.now()) };
        if (e.pointerId !== undefined) { d.pid = e.pointerId; d.ptype = e.pointerType;
          d.prim = e.isPrimary ? 1 : 0; d.btn = e.button; d.btns = e.buttons; }
        if (e.changedTouches) d.tid = Array.from(e.changedTouches).map(t2 => t2.identifier).join('/');
        d.after = snap();
        window.__ev.push(d);
        if (window.__ev.length > 60) window.__ev.shift();
      };
      tgt.addEventListener(k, h, { passive: true });
      document.addEventListener(k, h, { passive: true, capture: false });
    }
    // also record engine-step latching: sample the bitmask every rAF
    window.__raf = [];
    (function tick() {
      const s = snap();
      const last = window.__raf[window.__raf.length - 1];
      if (!last || JSON.stringify(last.s) !== JSON.stringify(s))
        window.__raf.push({ t: Math.round(performance.now()), s });
      if (window.__raf.length > 40) window.__raf.shift();
      if (!window.__stop) requestAnimationFrame(tick);
    })();
  });

  console.log('--- touchscreen.tap(200, 400) ---');
  await page.touchscreen.tap(200, 400);
  await sleep(600);
  let dump = await page.evaluate(() => { const e = window.__ev.splice(0), r = window.__raf.splice(0); return { e, r }; });
  for (const d of dump.e) console.log('EV  ' + JSON.stringify(d));
  for (const d of dump.r) console.log('RAF ' + JSON.stringify(d));

  console.log('--- mouse click(200, 400) ---');
  await page.mouse.move(200, 400); await page.mouse.down(); await sleep(120); await page.mouse.up();
  await sleep(600);
  dump = await page.evaluate(() => { const e = window.__ev.splice(0), r = window.__raf.splice(0); return { e, r }; });
  for (const d of dump.e) console.log('EV  ' + JSON.stringify(d));
  for (const d of dump.r) console.log('RAF ' + JSON.stringify(d));

  await page.evaluate(() => { window.__stop = true; });
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
