// pw-2p.js — the phone-analog testing environment: REAL WebKit (Safari's
// engine) x2 pages, iPhone viewport (rb-mobile + rb-rot90 active), real
// Firebase room, full lobby flow. Starts a match and judges:
//   STUCK-GET-READY = for >=20s after match start, player A's taps produce
//   no snap (clock parked, down unchanged) — the phone's exact symptom.
// Usage: node pw-2p.js [--clearstorage] [--slow <ms-per-task-block>]
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const CLEAR = process.argv.includes('--clearstorage');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'Z';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|2P DIAG|2p-rb\]|shielded|POISON/.test(t)) console.log('  [' + label + '] ' + t.slice(0, 110)); });
  page.on('pageerror', e => console.log('  [' + label + ' PAGEERR] ' + String(e.message).slice(0, 110)));
  if (CLEAR) await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(12000);
  const ok = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
  if (!ok) throw new Error(label + ': engine never ready');
  return page;
}

async function join(page, label, room) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(c => { const i2 = document.getElementById('rb-room-input');
      if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
    await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
    await sleep(1500);
    const inRoom = await page.evaluate(() => {
      const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); });
    if (inRoom) { console.log('[' + label + '] joined ' + room); return; }
  }
  throw new Error(label + ' join failed');
}
async function ready(page, label) {
  for (let i = 0; i < 30; i++) {
    const en = await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); });
    if (en) { await page.evaluate(() => document.getElementById('rb-ready').click()); console.log('[' + label + '] ready'); return; }
    await sleep(800);
  }
  throw new Error(label + ' ready never enabled');
}

const state = (page) => page.evaluate(() => {
  const out = { inMatch: false, waiting: window._rb2p_userIsWaitingForOpponent === true,
    ball: 0, liveBtn: 0, kp: null, vy: null, clk: null, down: null,
    eng: (window._rb2p_engPerSec && window._rb2p_engPerSec()) || -1,
    gl: (window._rb2p_glStatus && window._rb2p_glStatus()) || '?' };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState; out.vy = em.engineDriveFsmStage;
    out.clk = em.engineMinutesLeft + ':' + em.engineSecondsLeft; out.down = em.engineDownNumber;
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) {
      if (!x || x._HL2 || !x._eE2) continue;
      if (x._eE2._fE2 === 'obj_ball') out.ball++;
      else if (x._eE2._fE2 === 'obj_btn_kickoff') out.liveBtn++;
    }
  } catch (e) { out.err = String(e && e.message).slice(0, 40); }
  return out;
});

// tap the field like the user does (rotation-aware: portrait rb-rot90)
async function fieldTap(page) {
  const p = await page.evaluate(() => {
    const iw = window.innerWidth, ih = window.innerHeight;
    const rot = document.documentElement.classList.contains('rb-rot90');
    const fx = 0.5, fy = 0.62;          // mid-field, near QB
    if (!rot) return { x: iw * fx, y: ih * fy };
    return { x: ih * 0 + iw * fy, y: ih - ih * fx };   // inverse of body rotation (lx=fx*ih, ly=fy*iw)
  });
  await page.touchscreen.tap(Math.round(p.x), Math.round(p.y));
}

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== WEBKIT 2P ENV (room ' + room + (CLEAR ? ', storage cleared' : '') + ') ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, 'A', room); await join(B, 'B', room);
  await ready(A, 'A'); await ready(B, 'B');

  // wait for match on both
  let matched = false;
  for (let i = 0; i < 45; i++) {
    const [sa, sb] = [await state(A), await state(B)];
    if (sa.inMatch && sb.inMatch) { matched = true; break; }
    await sleep(1000);
  }
  console.log('match started on both: ' + matched);
  if (!matched) {
    await A.screenshot({ path: SHOT + 'wk-A-nomatch.png' });
    await B.screenshot({ path: SHOT + 'wk-B-nomatch.png' });
    const [sa, sb] = [await state(A), await state(B)];
    console.log('A:', JSON.stringify(sa)); console.log('B:', JSON.stringify(sb));
    console.log('VERDICT: MATCH NEVER STARTED (also a repro-worthy failure)');
    await browser.close(); process.exit(2);
  }

  // A is on offense: observe 25s, tapping like the user; stuck = clock never moves
  await sleep(4000);
  const first = await state(A);
  console.log('A t0:', JSON.stringify(first));
  let clkMoved = false, snapDown = first.down;
  for (let i = 0; i < 10; i++) {
    await fieldTap(A);
    await sleep(2500);
    const s = await state(A);
    if (i % 2 === 0) console.log('A t+' + ((i + 1) * 2.5) + 's', JSON.stringify(s));
    if (s.clk !== first.clk || s.down !== snapDown) { clkMoved = true; break; }
  }
  await A.screenshot({ path: SHOT + 'wk-A-final.png' });
  await B.screenshot({ path: SHOT + 'wk-B-final.png' });
  const verdict = clkMoved ? 'CLEAN (game responds — NOT the phone yet)' :
    'STUCK-GET-READY REPRODUCED (taps dead, clock parked — matches the phone)';
  console.log('VERDICT: ' + verdict);
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(clkMoved ? 0 : 3);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
