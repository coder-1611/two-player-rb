// pw-hang5.js — literal GET READY hang: the degenerate resize (pw-hang4's
// proven render-killer) is armed INSIDE the page and fires the instant the
// match room is entered — freezing the canvas ON the staging/GET READY
// frame while the drive goes live underneath. Verdict: 36s of (a) live
// drive state, (b) screenshot pixel-identical to the freeze frame, (c)
// frame not blank.
const { webkit } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOG = 70;

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'S';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

function pngStats(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  let lum = 0, n = 0;
  for (let i = 0; i < png.data.length; i += 16) {
    lum += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++;
  }
  return { data: png.data, w: png.width, h: png.height, meanLum: lum / n };
}
function diffFrac(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let diff = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 16) {
    if (Math.abs(a.data[i] - b.data[i]) > 12 ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > 12) diff++;
    n++;
  }
  return diff / n;
}

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(() => {
    // Full iOS lock model, three behaviors at once:
    //  1. engine reads 0x0 dims (window.innerWidth/innerHeight poisoned)
    //     → app-surface/camera recreated at 0 → PERMANENT render wedge
    //  2. canvas backing writes elided (iOS defers them for hidden pages)
    //     → last painted frame survives in the buffer
    //  3. canvas CSS frozen (layout() can't shrink the element)
    //     → the surviving frame stays VISIBLE at full size
    window.__glitch = (w, h) => {
      try {
        const c = document.getElementById('canvas');
        const cw = c.width, ch = c.height;
        Object.defineProperty(c, 'width',  { set: () => {}, get: () => cw, configurable: true });
        Object.defineProperty(c, 'height', { set: () => {}, get: () => ch, configurable: true });
        const st = c.style;
        if (!st.__rbFrozen) { st.__rbFrozen = true;
          const orig = st.setProperty.bind(st);
          st.__rbOrigSet = orig;
          st.setProperty = function () {};
        }
      } catch (e) {}
      Object.defineProperty(window, 'innerWidth',  { get: () => w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => h, configurable: true });
      window.dispatchEvent(new Event('resize'));
    };
    window.__unglitch = () => {
      try { delete window.innerWidth; delete window.innerHeight; } catch (e) {}
      try { const st = document.getElementById('canvas').style;
            if (st.__rbOrigSet) { st.setProperty = st.__rbOrigSet; st.__rbFrozen = false; } } catch (e) {}
      window.dispatchEvent(new Event('resize'));
    };
    // fire the moment the engine enters the match room = the GET READY frame
    window.__armStagingGlitch = () => {
      const iv = setInterval(() => {
        try {
          if (window.RB && RB.isEngineInMatchRoom() === true) {
            clearInterval(iv);
            // let the GET READY staging frame actually PAINT (2 frames),
            // then kill rendering — the frozen frame is the staging screen
            requestAnimationFrame(() => requestAnimationFrame(() => {
              window.__glitchedAt = Date.now();
              window.__glitch(0, 0);
              setTimeout(() => window.__unglitch(), 3000);
            }));
          }
        } catch (e) {}
      }, 25);
    };
  });
  await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|ENGINE LOOP|Application Surface/i.test(t))
      console.log('  [' + label + '] ' + t.slice(0, 110)); });
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
  const out = { inMatch: false, ball: 0, kp: null, clk: null, glitchedAt: window.__glitchedAt || 0 };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState;
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
  console.log('=== HANG ENV 5 (room ' + room + ') — glitch armed AT match entry (GET READY frame) ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await A.evaluate(() => window.__armStagingGlitch());
  await ready(A); await ready(B);

  for (let i = 0; i < 45; i++) {
    const s = await state(A);
    if (s.glitchedAt) { console.log('glitch fired at match entry; state: ' + JSON.stringify(s)); break; }
    await sleep(1000);
  }
  await sleep(4000);   // unglitch happened at +3s

  const base = SHOT + 'hang5-A-t0.png';
  await A.screenshot({ path: base });
  const baseStats = pngStats(base);
  console.log('freeze frame meanLum=' + baseStats.meanLum.toFixed(1) + ' (blank black would be ~5)');

  let frozenTicks = 0;
  for (let i = 1; i <= 6; i++) {
    await sleep(6000);
    const s = await state(A);
    const shot = SHOT + 'hang5-A-t' + (i * 6) + '.png';
    await A.screenshot({ path: shot });
    const d = diffFrac(baseStats, pngStats(shot));
    const frozen = s.inMatch && s.ball > 0 && s.kp === 2 && d < 0.02 && baseStats.meanLum > 15;
    if (frozen) frozenTicks++;
    console.log('t+' + (i * 6) + 's ' + JSON.stringify(s) + ' diffVsFreeze=' + (d * 100).toFixed(2) + '%' +
                (frozen ? '  <-- FROZEN ON STAGING FRAME, DRIVE LIVE' : ''));
  }
  const reproduced = frozenTicks >= 5;   // >=30s frozen
  console.log('VERDICT: ' + (reproduced
    ? 'GET READY HANG REPRODUCED >30s (frozen staging frame over live drive)'
    : 'not reproduced (frozenTicks=' + frozenTicks + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
