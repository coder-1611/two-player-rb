// pw-hang4.js — hang-repro attempt 4: DEGENERATE RESIZE during lock.
// Mechanism under test: on a real phone, locking/unlocking (or the toolbar
// collapse) fires resize events while window.innerWidth/innerHeight report
// degenerate values (0, 1, or swapped). The engine's camera/buffer sizing
// (_tI2/_uI2 + obj_camera "Aspect Ratio") consumes them; a NaN/0 camera
// makes every world draw silently no-op, so the canvas RETAINS the last
// valid frame (the GET READY staging screen) while logic keeps running at
// 60fps and inputs keep mapping — exactly the phone stall signature.
// Flow: lock A before READY (staging frame is the last painted one) →
// inject degenerate resize(s) while locked → wake → pixel-judge 36s.
// Usage: node pw-hang4.js [--w 0 --h 0] [--hog 70]
const { webkit } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const HOG = parseInt(arg('--hog', '70'), 10);
const GW = parseInt(arg('--w', '0'), 10);
const GH = parseInt(arg('--h', '0'), 10);

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'R';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

function greenFraction(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  let g = 0, t = 0;
  for (let i = 0; i < png.data.length; i += 16) {
    const r = png.data[i], gg = png.data[i + 1], b = png.data[i + 2];
    if (gg > 90 && gg > r * 1.15 && gg > b * 1.15) g++;
    t++;
  }
  return g / t;
}

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(() => {
    const realRaf = window.requestAnimationFrame.bind(window);
    let bg = false; const q = [];
    window.requestAnimationFrame = cb => { if (!bg) return realRaf(cb); q.push(cb); return 0; };
    window.__bg = v => { bg = !!v; if (!v) { const cbs = q.splice(0); cbs.forEach(cb => realRaf(cb)); } };
    // degenerate-resize injector: fake innerWidth/innerHeight + resize event
    window.__glitch = (w, h) => {
      if (window.__ow === undefined) { window.__ow = window.innerWidth; window.__oh = window.innerHeight; }
      Object.defineProperty(window, 'innerWidth',  { get: () => w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => h, configurable: true });
      window.dispatchEvent(new Event('resize'));
      try { window.dispatchEvent(new Event('orientationchange')); } catch (e) {}
    };
    window.__unglitch = () => {
      // restore SANE numeric dims (deleting the override nukes the native
      // getter in WebKit, leaving undefined — an env artifact, not iOS)
      Object.defineProperty(window, 'innerWidth',  { get: () => window.__ow, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => window.__oh, configurable: true });
      window.dispatchEvent(new Event('resize'));
    };
  });
  if (HOG > 0) await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|ENGINE LOOP|Application Surface|Aspect Ratio|camera/i.test(t))
      console.log('  [' + label + '] ' + t.slice(0, 120)); });
  page.on('pageerror', e => console.log('  [' + label + ' PAGEERR] ' + String(e.message).slice(0, 120)));
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) return page;
    await sleep(1000);
  }
  throw new Error(label + ': engine never ready');
}

async function join(page, room) {
  for (let i = 0; i < 20; i++) {
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
  for (let i = 0; i < 60; i++) {
    const en = await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); });
    if (en) { await page.evaluate(() => document.getElementById('rb-ready').click()); return; }
    await sleep(800);
  }
  throw new Error('ready never enabled');
}

const state = (page) => page.evaluate(() => {
  const out = { inMatch: false, ball: 0, kp: null, vy: null, clk: null, cw: 0, ch: 0 };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const c = document.getElementById('canvas');
    out.cw = c.width; out.ch = c.height;
    const r = c.getBoundingClientRect();
    out.rect = Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top);
    out.css = (c.style.width || '?') + '/' + (c.style.height || '?');
    out.virt = window.__rbVirt ? Math.round(window.__rbVirt.right - window.__rbVirt.left) + 'x' +
               Math.round(window.__rbVirt.bottom - window.__rbVirt.top) : null;
    out.bodyW = Math.round(document.body.getBoundingClientRect().width);
    out.iw = window.innerWidth + 'x' + window.innerHeight;
  } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState; out.vy = em.engineDriveFsmStage;
    out.clk = em.engineMinutesLeft + ':' + em.engineSecondsLeft;
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') out.ball++;
  } catch (e) {}
  return out;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== HANG ENV 4 (room ' + room + ') — degenerate resize ' + GW + 'x' + GH +
              ' during lock, hog=' + HOG + ' ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await A.evaluate(() => window.__bg(true));
  console.log('A locked; injecting degenerate resize ' + GW + 'x' + GH);
  await A.evaluate(([w, h]) => window.__glitch(w, h), [GW, GH]);
  await ready(A); await ready(B);

  // let match start + drive force land while locked & glitched
  for (let i = 0; i < 40; i++) {
    const s = await state(A);
    if (s.ball > 0) { console.log('drive forced during lock+glitch at t+' + i + 's: ' + JSON.stringify(s)); break; }
    await sleep(1000);
  }
  await sleep(2000);
  console.log('restoring real dimensions + waking A (the unlock)');
  await A.evaluate(() => window.__unglitch());
  await A.evaluate(() => window.__bg(false));

  let frozenTicks = 0;
  for (let i = 0; i <= 6; i++) {
    const s = await state(A);
    const shot = SHOT + 'hang4-A-t' + (i * 6) + '.png';
    await A.screenshot({ path: shot }).catch(() => {});
    let gf = -1; try { gf = greenFraction(shot); } catch (e) {}
    const frozen = s.inMatch && s.ball > 0 && s.kp === 2 && gf >= 0 && gf < 0.25;
    if (frozen) frozenTicks++;
    console.log('t+' + (i * 6) + 's ' + JSON.stringify(s) + ' green=' + gf.toFixed(3) +
                (frozen ? '  <-- PAINT FROZEN over LIVE DRIVE' : ''));
    if (i < 6) await sleep(6000);
  }
  const reproduced = frozenTicks >= 6;
  console.log('VERDICT: ' + (reproduced
    ? 'HANG REPRODUCED — stale paint >30s over a live drive (phone mechanism)'
    : 'not reproduced (frozenTicks=' + frozenTicks + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
