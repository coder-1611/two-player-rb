// pw-deaf.js — instrument WHY the re-popped PAT modal ignores real taps
// (device V258: taps land, gui-mouse tracks, buttons never fire; env
// pw-pat-click reproduced the same but was mis-read as an env quirk).
// Flow = pw-pat-click up to "modal visible", then:
//   1. identify engine object types 46 & 39 (the _t2 click gates)
//   2. dump gate state: _si(46) depths, _si(39)._XB1
//   3. sentinel the buttons' _7D1 (=7) to learn if their step even runs
//   4. sample per-frame: gui-mouse, held/pressed/released flags, hover
//      (_YC1 with the engine's own numbers), _7D1/_WC1
//   5. REAL touchscreen tap at the button's visual center, then a slow
//      mouse press — see exactly which link in the chain breaks.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'D';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/PICK6|PAT|re-pop|DIAG/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 120)); });
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) return page;
    await sleep(1000);
  }
  throw new Error(label + ': engine never ready');
}
async function join(page, room) {
  for (let i = 0; i < 15; i++) {
    await page.evaluate(c => { const i2 = document.getElementById('rb-room-input');
      if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
    await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
    await sleep(1500);
    const inRoom = await page.evaluate(() => {
      const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); });
    if (inRoom) return;
  }
  throw new Error('join failed');
}
async function ready(page) {
  for (let i = 0; i < 40; i++) {
    const en = await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); });
    if (en) { await page.evaluate(() => document.getElementById('rb-ready').click()); return; }
    await sleep(800);
  }
  throw new Error('ready never enabled');
}

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== DEAF-MODAL instrumentation (room ' + room + ') ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await ready(A); await ready(B);
  for (let i = 0; i < 45; i++) {
    const s = await A.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } });
    if (s) break;
    await sleep(1000);
  }
  await sleep(3000);
  const now = Date.now();
  await fetch(FB + '/rooms/' + room + '/patDuty.json', { method: 'PUT',
    body: JSON.stringify({ role: 'b', ts: now, scoreUser: 6, scoreOpp: 0 }) });
  await fetch(FB + '/rooms/' + room + '/turnover.json', { method: 'PUT',
    body: JSON.stringify({ thrower: 'a', yardLine: -20, isPick6: true, resolved: true, ts: now }) });
  console.log('reloading B…');
  await B.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const ok = await B.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) break;
    await sleep(1000);
  }
  // wait for the re-pop loop to surface the modal
  let up = false;
  for (let i = 0; i < 15; i++) {
    up = await B.evaluate(() => {
      const pl = (window._rb2p_enumeratePopupInstances && window._rb2p_enumeratePopupInstances()) || [];
      return pl.filter(p => p && !p._HL2 && p._g2 !== 0 && p.x > -1000).length > 0;
    }).catch(() => false);
    if (up) break;
    await sleep(2000);
  }
  if (!up) { console.log('FATAL: modal never appeared'); process.exit(1); }
  console.log('modal visible — instrumenting…');

  // ---- 1+2: object identities + gate state ----
  const gates = await B.evaluate(() => {
    const nm = i => { try { const o = _Ec2._Ue2(i); return o && (o._fE2 || o._51 || ('obj#' + i)); } catch (e) { return 'err:' + e.message; } };
    const dump = i => { try { return _si(i).map(o => ({
      id: o.id, depth: o._Ca, g2: o._g2, en: o._5G, xb1: o._XB1,
      x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o._8l1 || 0), h: Math.round(o._VI || 0),
      og: o._0G, dead: !!o._HL2, name: o._eE2 && o._eE2._fE2 })); } catch (e) { return 'err:' + e.message; } };
    let h01 = null; try { h01 = global._H01; } catch (e) { try { h01 = window.global && window.global._H01; } catch (e2) {} }
    return { name46: nm(46), name39: nm(39), si46: dump(46), si39: dump(39), H01: h01,
             fI2: (typeof _fI2 !== 'undefined' ? _fI2 : null), dI2: (typeof _dI2 !== 'undefined' ? _dI2 : null),
             virt: window.__rbVirt, ih: window.innerHeight, iw: window.innerWidth,
             rot: document.documentElement.classList.contains('rb-rot90') };
  });
  console.log('GATES: ' + JSON.stringify(gates, null, 1));

  // ---- 3+4: sentinel + per-frame sampler ----
  await B.evaluate(() => {
    window.__samp = [];
    const pl = (window._rb2p_enumeratePopupInstances() || []).filter(p => p && !p._HL2);
    for (const p of pl) if (p._0G === 100367 || p._0G === 100369) p._7D1 = 7;  // sentinel
    (function tick() {
      try {
        const pl2 = (window._rb2p_enumeratePopupInstances() || []).filter(p => p && !p._HL2);
        const b = pl2.find(p => p._0G === 100369);
        const s = {
          t: Math.round(performance.now()),
          mx: Math.round(_m01(0)), my: Math.round(_o01(0)),
          held: _8p2._hn2[0] ? 1 : 0, pressed: _8p2._cn2[0] ? 1 : 0, released: _8p2._gn2[0] ? 1 : 0,
          pops: pl2.length
        };
        if (b) {
          s.d7 = b._7D1; s.wc = b._WC1;
          s.inB = _YC1(_m01(0), _o01(0), b.x, b.y, b.x + b._8l1, b.y + b._VI) ? 1 : 0;
          s.bx = Math.round(b.x); s.by = Math.round(b.y); s.bw = Math.round(b._8l1); s.bh = Math.round(b._VI);
        }
        const last = window.__samp[window.__samp.length - 1];
        const key = o => o && [o.mx, o.my, o.held, o.pressed, o.released, o.d7, o.wc, o.inB, o.pops].join(',');
        if (!last || key(last) !== key(s)) window.__samp.push(s);
        if (window.__samp.length > 400) window.__samp.shift();
      } catch (e) { window.__samp.push({ err: String(e).slice(0, 80) }); }
      if (!window.__sampStop) requestAnimationFrame(tick);
    })();
  });

  // visual center of the 2PT button -> page coords (forward map, same math
  // the engine renders + _m01 inverse-maps with)
  const pt = await B.evaluate(() => {
    const pl = (window._rb2p_enumeratePopupInstances() || []).filter(p => p && !p._HL2);
    const b = pl.find(p => p._0G === 100369);
    if (!b) return null;
    const gx = b.x + (b._8l1 || 0) / 2, gy = b.y + (b._VI || 0) / 2;
    const v = window.__rbVirt;
    const GW = (typeof _fI2 !== 'undefined' && _fI2 > 0) ? _fI2 : 480;
    const GH = (typeof _dI2 !== 'undefined' && _dI2 > 0) ? _dI2 : 270;
    if (v && document.documentElement.classList.contains('rb-rot90')) {
      const lx = v.left + gx / GW * (v.right - v.left);
      const ly = v.top + gy / GH * (v.bottom - v.top);
      return { x: Math.round(ly), y: Math.round(window.innerHeight - lx), gx: Math.round(gx), gy: Math.round(gy) };
    }
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: Math.round(r.left + gx / GW * r.width), y: Math.round(r.top + gy / GH * r.height),
             gx: Math.round(gx), gy: Math.round(gy) };
  });
  console.log('2PT button center: ' + JSON.stringify(pt));
  if (!pt) { console.log('FATAL: no 2pt button'); process.exit(1); }

  console.log('--- REAL touchscreen tap ---');
  await B.touchscreen.tap(pt.x, pt.y);
  await sleep(1000);
  console.log('--- slow mouse press (150ms) ---');
  await B.mouse.move(pt.x, pt.y); await B.mouse.down(); await sleep(150); await B.mouse.up();
  await sleep(1000);

  const out = await B.evaluate(() => { window.__sampStop = true; return {
    samp: window.__samp,
    pend: window._rb2p_patPlayPending === true, resolved: window._rb2p_patPlayResolved === true,
    pops: (window._rb2p_enumeratePopupInstances() || []).filter(p => p && !p._HL2).length }; });
  console.log('post: pend=' + out.pend + ' resolved=' + out.resolved + ' pops=' + out.pops);
  console.log('SAMPLES (' + out.samp.length + ' transitions):');
  for (const s of out.samp) console.log('  ' + JSON.stringify(s));
  await B.screenshot({ path: SHOT + 'deaf-B.png' }).catch(() => {});
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
