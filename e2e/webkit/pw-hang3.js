// pw-hang3.js — hang-repro attempt 3: judge by PIXELS, not engine state.
// Engine forensics (_17 controller step, retrobowl.js:66361) proved the
// phone's stall state (kp:2, ball:1, clk 2:00) is NORMAL pre-snap logic —
// the anomaly is what's PAINTED (staging screen) vs what the engine thinks.
// So the verdict is now visual: engine says live drive but the composited
// screenshot stays dark (staging panel) instead of green (field) for >30s.
//   - headed WebKit (real compositing path, not headless rasterizer)
//   - CPU hog (weak phone SoC)
//   - lock A before READY (drive forced while loop dead) + post-wake
//     lock/unlock cycles (real phones bounce)
// Usage: node pw-hang3.js [--hog 70] [--cycles 3] [--headed]
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
const CYCLES = parseInt(arg('--cycles', '3'), 10);
const HEADED = process.argv.includes('--headed');

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'G';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

function greenFraction(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  let green = 0, total = 0;
  for (let i = 0; i < png.data.length; i += 16) {   // sample every 4th px
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (g > 90 && g > r * 1.15 && g > b * 1.15) green++;
    total++;
  }
  return green / total;
}

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(() => {
    const realRaf = window.requestAnimationFrame.bind(window);
    const realSI = window.setInterval.bind(window);
    let bg = false; const q = [];
    window.requestAnimationFrame = cb => { if (!bg) return realRaf(cb); q.push(cb); return 0; };
    window.setInterval = function (fn, ms) {
      const rest = Array.prototype.slice.call(arguments, 2);
      if (typeof fn !== 'function') return realSI(fn, ms);
      const g = function () { if (bg) { const n = Date.now();
        if (n - (g.__l || 0) < 950) return; g.__l = n; } return fn.apply(this, arguments); };
      return realSI.apply(window, [g, ms].concat(rest));
    };
    window.__bg = v => { bg = !!v; if (!v) { const cbs = q.splice(0); cbs.forEach(cb => realRaf(cb)); } };
  });
  if (HOG > 0) await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|ENGINE LOOP|Iy suppressed|corpse|Application Surface/i.test(t))
      console.log('  [' + label + '] ' + t.slice(0, 120)); });
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
  const out = { inMatch: false, ball: 0, kp: null, vy: null, clk: null };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
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
  const browser = await webkit.launch({ headless: !HEADED });
  console.log('=== HANG ENV 3 (room ' + room + ', hog=' + HOG + ', cycles=' + CYCLES +
              ', ' + (HEADED ? 'HEADED' : 'headless') + ') — PIXEL VERDICT ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await A.evaluate(() => window.__bg(true));            // lock A first
  console.log('A locked; readying both (match start lands on dead loop)');
  await ready(A); await ready(B);

  for (let i = 0; i < 40; i++) {
    const s = await state(A);
    if (s.ball > 0) { console.log('drive forced during lock at t+' + i + 's'); break; }
    await sleep(1000);
  }
  for (let c = 0; c < CYCLES; c++) {
    await A.evaluate(() => window.__bg(false)); await sleep(1200);
    await A.evaluate(() => window.__bg(true));  await sleep(3500);
  }
  await A.evaluate(() => window.__bg(false));
  console.log('A woken — observing 36s, pixel metric each 6s');

  let darkTicks = 0;
  for (let i = 0; i <= 6; i++) {
    const s = await state(A);
    const shot = SHOT + 'hang3-A-t' + (i * 6) + '.png';
    await A.screenshot({ path: shot }).catch(() => {});
    let gf = -1; try { gf = greenFraction(shot); } catch (e) {}
    const dark = s.inMatch && s.ball > 0 && s.kp === 2 && gf >= 0 && gf < 0.25;
    if (dark) darkTicks++;
    console.log('t+' + (i * 6) + 's ' + JSON.stringify(s) + ' green=' + gf.toFixed(3) +
                (dark ? '  <-- STAGING PAINT w/ LIVE DRIVE' : ''));
    if (i < 6) await sleep(6000);
  }
  const reproduced = darkTicks >= 6;   // all 36s dark while live
  console.log('VERDICT: ' + (reproduced
    ? 'HANG REPRODUCED — staging paint persisted >30s over a live drive'
    : 'not reproduced (darkTicks=' + darkTicks + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
