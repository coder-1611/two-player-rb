// pw-hang7.js — DVH DRIFT: the phone property headless WebKit doesn't have.
// html.rb-rot90 body is sized with 100dvh/100dvw. On every real phone the
// browser toolbar collapses/expands during play (first tap, scroll, READY),
// silently changing dvh WITHOUT any resize event — the rotated <body> box
// shifts under the position:fixed canvas, displacing/clipping it and
// breaking the rotated input frame. layout() never re-runs (no event), so
// it's permanent until refresh. Desktop has no dynamic toolbar; headless
// dvh is static — why no env ever reproduced it.
// Model: at match entry, mutate the body's top/width/height by the toolbar
// delta (~+/-100px) directly — exactly what a dvh change does — with NO
// resize event. Judge pixels + input-frame integrity for 36s.
const { webkit } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOG = 70;
const DELTA = parseInt((process.argv[process.argv.indexOf('--delta') + 1] || '100'), 10) || 100;

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'V';
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
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|ENGINE LOOP|healed/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 110)); });
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
  const out = { inMatch: false, ball: 0, kp: null, clk: null };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    out.rect = Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top);
    const b = document.body.getBoundingClientRect();
    out.body = Math.round(b.width) + 'x' + Math.round(b.height) + '@' + Math.round(b.left) + ',' + Math.round(b.top);
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

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== HANG ENV 7 (room ' + room + ') — silent dvh drift +' + DELTA + 'px at match entry ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await ready(A); await ready(B);

  let started = false;
  for (let i = 0; i < 40; i++) {
    const s = await state(A);
    if (s.inMatch) { started = true; break; }
    await sleep(1000);
  }
  console.log('match started: ' + started);
  if (started) {
    await sleep(800);
    // the toolbar collapse: dvh grows by ~DELTA, silently (no resize event).
    // rb-rot90 body uses top:100dvh, width:100dvh, height:100dvw.
    await A.evaluate(d => {
      const b = document.body;
      const ih = window.innerHeight, iw = window.innerWidth;
      b.style.top = (ih + d) + 'px';
      b.style.width = (ih + d) + 'px';
      b.style.height = iw + 'px';
      console.log('[env] dvh drift applied: body top/width=' + (ih + d));
    }, DELTA);
  }

  let hangTicks = 0;
  for (let i = 0; i <= 6; i++) {
    const s = await state(A);
    const shot = SHOT + 'hang7-A-t' + (i * 6) + '.png';
    await A.screenshot({ path: shot }).catch(() => {});
    let gf = -1; try { gf = greenFraction(shot); } catch (e) {}
    const hang = s.inMatch && s.ball > 0 && s.kp === 2 && gf >= 0 && gf < 0.25;
    if (hang) hangTicks++;
    console.log('t+' + (i * 6) + 's ' + JSON.stringify(s) + ' green=' + gf.toFixed(3) +
                (hang ? '  <-- HANG (field not visible, drive live)' : ''));
    if (i < 6) await sleep(6000);
  }
  const reproduced = hangTicks >= 6;
  console.log('VERDICT: ' + (reproduced
    ? 'HANG REPRODUCED — silent dvh drift hides the live game >30s (no events, no gimmicks)'
    : 'not reproduced (hangTicks=' + hangTicks + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
