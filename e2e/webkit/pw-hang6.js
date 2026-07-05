// pw-hang6.js — NO-GIMMICK hang hunt: the SOFT KEYBOARD lifecycle.
// User correction: no locking/app-switching involved — the match simply
// never starts. The one phone event that fires at exactly that moment on
// every phone (iOS + Android) and never on desktop: the on-screen keyboard.
// Type room code → page resized → tap READY → keyboard dismisses DURING
// matchmaking → resize events with transitional dims land at match start.
// Model: REAL Playwright viewport resizes (fires real resize events + flips
// the orientation media query when height < width — which toggles rb-rot90
// mid-flow). CPU hog for phone timing. Sweep dismiss timings.
const { webkit } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOG = 70;
const FULL = { width: 390, height: 844 };

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'K';
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
    viewport: FULL, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|ENGINE LOOP|healed|layout|Iy suppressed/i.test(t))
      console.log('    [' + label + '] ' + t.slice(0, 110)); });
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
      if (i2) { i2.focus(); i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
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
  const out = { inMatch: false, ball: 0, kp: null, clk: null, rot: document.documentElement.classList.contains('rb-rot90') };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    out.rect = Math.round(r.width) + 'x' + Math.round(r.height);
    out.virt = window.__rbVirt ? Math.round(window.__rbVirt.right - window.__rbVirt.left) : null;
  } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState;
    out.clk = em.engineMinutesLeft + ':' + em.engineSecondsLeft;
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') out.ball++;
  } catch (e) {}
  return out;
});

async function attempt(browser, name, kbH, dismissAt) {
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  console.log('--- attempt ' + name + ': keyboard ' + FULL.width + 'x' + kbH +
              ', dismiss at ' + dismissAt + ' (room ' + room + ') ---');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');

  // keyboard OPENS when the user taps the room-code input
  await A.setViewportSize({ width: FULL.width, height: kbH });
  await join(A, room);
  await join(B, room);
  if (dismissAt === 'beforeReady') { await A.setViewportSize(FULL); await sleep(400); }
  await ready(A);
  if (dismissAt === 'afterReady') { await A.setViewportSize(FULL); }
  await ready(B);

  // wait for match; dismiss keyboard at the requested moment
  let started = false;
  for (let i = 0; i < 40; i++) {
    const s = await state(A);
    if (s.inMatch) {
      started = true;
      if (dismissAt === 'atMatch') await A.setViewportSize(FULL);
      if (dismissAt === 'afterForce') { await sleep(600); await A.setViewportSize(FULL); }
      break;
    }
    await sleep(1000);
  }
  if (!started) {
    await A.setViewportSize(FULL);
    console.log('  MATCH NEVER STARTED — repro-worthy; A state: ' + JSON.stringify(await state(A)));
    await A.screenshot({ path: SHOT + 'hang6-' + name + '-nostart.png' }).catch(() => {});
    await A.context().close(); await B.context().close();
    await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
    return 'NOSTART';
  }

  let frozenTicks = 0;
  for (let i = 0; i <= 6; i++) {
    const s = await state(A);
    const shot = SHOT + 'hang6-' + name + '-t' + (i * 6) + '.png';
    await A.screenshot({ path: shot }).catch(() => {});
    let gf = -1; try { gf = greenFraction(shot); } catch (e) {}
    const frozen = s.inMatch && s.ball > 0 && s.kp === 2 && gf >= 0 && gf < 0.25;
    if (frozen) frozenTicks++;
    console.log('  t+' + (i * 6) + 's ' + JSON.stringify(s) + ' green=' + gf.toFixed(3) +
                (frozen ? '  <-- HANG' : ''));
    if (i < 6) await sleep(6000);
  }
  await A.context().close(); await B.context().close();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  return frozenTicks >= 6 ? 'HANG' : 'clean';
}

(async () => {
  await H.ensureServer();
  const browser = await webkit.launch();
  // 448 = typical iOS keyboard remainder (still portrait);
  // 330 = aggressive keyboard (330 < 390 → orientation MQ flips to
  //       LANDSCAPE mid-lobby → rb-rot90 toggles → the dangerous case)
  const plan = [
    ['kb330-atMatch',   330, 'atMatch'],
    ['kb330-afterReady', 330, 'afterReady'],
    ['kb448-atMatch',   448, 'atMatch'],
    ['kb330-afterForce', 330, 'afterForce'],
    ['kb448-afterReady', 448, 'afterReady']
  ];
  for (const [name, h, at] of plan) {
    const r = await attempt(browser, name, h, at);
    console.log('=== ' + name + ': ' + r + ' ===');
    if (r === 'HANG' || r === 'NOSTART') { await browser.close(); process.exit(3); }
  }
  console.log('VERDICT: all keyboard timings clean');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
