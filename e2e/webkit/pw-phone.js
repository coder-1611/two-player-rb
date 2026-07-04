// pw-phone.js — phone-fidelity 2P WebKit env: STARVED MAIN THREAD.
// A tunable CPU hog blocks each page's main thread HOG% of every 50ms slice
// from boot onward (simulating a weak phone SoC), so boot / Firebase
// handshake / match-room construction overlap in time like on a real phone.
//
// NO INPUT IS EVER SENT. Verdict is purely observational (per user):
// start a match, watch 30s — if the GET READY / staging screen persists
// (diag box + engine state + screenshot), the stall is reproduced.
//
// Usage: HOG=0|50|70|90 SLICE=50|250 node pw-phone.js   (HOG=0 → baseline)
// SLICE = hog period in ms. Small slice = smooth slowdown; big slice =
// long janky freezes (GC / thermal-throttle style), the phone-realistic mode.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const HOG = Math.max(0, Math.min(95, parseInt(process.env.HOG || '70', 10)));
const SLICE = Math.max(20, parseInt(process.env.SLICE || '50', 10));
// BG=1 → simulate iOS backgrounding: right after READY, suspend rAF and
// clamp timers to ~1Hz on both pages (screen lock / app switch), foreground
// again 20s later. This is when the match room is constructed on a phone.
const BG = process.env.BG === '1';
// FRESH=1 → wipe localStorage/IndexedDB at boot (iOS evicts site data often;
// fresh save → welcome popup, which gates ALL engine input via _si(46)).
const FRESH = process.env.FRESH === '1';
// NET=1 → drop the network for 20s right after READY (screen lock kills the
// radio; Firebase disconnects mid-matchmaking, presence/messages get missed).
const NET = process.env.NET === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// everything slows down under the hog — scale waits/retries accordingly
const K = 1 + HOG / 25 + (SLICE > 100 ? 2 : 0);

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'P';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  // iOS-background gate: window.__bg(true|false) suspends rAF (queued, not
  // dropped — engine loop freezes like a hidden Safari tab) and rate-limits
  // interval callbacks to ~1Hz; fakes document.hidden + visibilitychange.
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
    try {
      Object.defineProperty(document, 'hidden', { get: () => bg, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => bg ? 'hidden' : 'visible', configurable: true });
    } catch (e) {}
    window.__bg = v => { bg = !!v;
      try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) {}
      if (!bg) { const cbs = q.splice(0); cbs.forEach(cb => realRaf(cb)); } };
  });
  if (FRESH) await ctx.addInitScript(() => {
    try { localStorage.clear(); } catch (e) {}
    try { indexedDB.databases && indexedDB.databases().then(ds =>
      ds.forEach(d => d && d.name && indexedDB.deleteDatabase(d.name))); } catch (e) {}
  });
  if (HOG > 0) await ctx.addInitScript(([pct, slice]) => {
    // block pct% of every SLICE ms on the main thread, from boot onward
    const busy = Math.round(slice * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, slice);
  }, [HOG, SLICE]);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|2P DIAG|2p-rb\]|shielded|POISON|spawn/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 120)); });
  page.on('pageerror', e => console.log('  [' + label + ' PAGEERR] ' + String(e.message).slice(0, 120)));
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < Math.round(30 * K); i++) {
    const ok = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) { console.log('[' + label + '] engine ready after ~' + i + 's'); return page; }
    await sleep(1000);
  }
  throw new Error(label + ': engine never ready (HOG=' + HOG + ')');
}

async function join(page, label, room) {
  for (let i = 0; i < Math.round(15 * K); i++) {
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
  for (let i = 0; i < Math.round(40 * K); i++) {
    const en = await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); });
    if (en) { await page.evaluate(() => document.getElementById('rb-ready').click()); console.log('[' + label + '] ready'); return; }
    await sleep(800);
  }
  throw new Error(label + ' ready never enabled');
}

// pure observation: engine state + live diag box text + GET READY banner
const state = (page) => page.evaluate(() => {
  const out = { inMatch: false, waiting: window._rb2p_userIsWaitingForOpponent === true,
    ball: 0, liveBtn: 0, ghostBtn: 0, kp: null, vy: null, clk: null, b1: '',
    eng: (window._rb2p_engPerSec && window._rb2p_engPerSec()) || -1,
    diag: '' };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState; out.vy = em.engineDriveFsmStage;
    out.clk = em.engineMinutesLeft + ':' + em.engineSecondsLeft;
    out.b1 = String(em.rawEngineMatch && em.rawEngineMatch.__b1 || '').slice(0, 24);
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) {
      if (!x || !x._eE2) continue;
      if (x._eE2._fE2 === 'obj_ball') { if (!x._HL2) out.ball++; }
      else if (x._eE2._fE2 === 'obj_btn_kickoff') { x._HL2 ? out.ghostBtn++ : out.liveBtn++; }
    }
  } catch (e) { out.err = String(e && e.message).slice(0, 40); }
  try { const d = document.getElementById('rb-diag');
    out.diag = (d && d.textContent || '').replace(/\s+/g, ' ').slice(0, 150); } catch (e) {}
  return out;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== PHONE-CPU ENV  HOG=' + HOG + '% SLICE=' + SLICE + 'ms  room=' + room + ' ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, 'A', room); await join(B, 'B', room);
  await ready(A, 'A'); await ready(B, 'B');

  if (BG || NET) {
    console.log('[LOCK] simulating screen lock for 20s (' +
      (BG ? 'rAF+timers frozen' : '') + (BG && NET ? ' + ' : '') + (NET ? 'network dropped' : '') + ')');
    if (BG) { await A.evaluate(() => window.__bg(true)); await B.evaluate(() => window.__bg(true)); }
    if (NET) { await A.context().setOffline(true); await B.context().setOffline(true); }
    await sleep(20000);
    if (NET) { await A.context().setOffline(false); await B.context().setOffline(false); }
    if (BG) { await A.evaluate(() => window.__bg(false)); await B.evaluate(() => window.__bg(false)); }
    console.log('[LOCK] unlocked both');
  }

  let matched = false;
  for (let i = 0; i < Math.round(60 * K); i++) {
    const [sa, sb] = [await state(A), await state(B)];
    if (sa.inMatch && sb.inMatch) { matched = true; break; }
    await sleep(1000);
  }
  console.log('match started on both: ' + matched);
  if (!matched) {
    await A.screenshot({ path: SHOT + 'ph-A-nomatch.png' }).catch(() => {});
    await B.screenshot({ path: SHOT + 'ph-B-nomatch.png' }).catch(() => {});
    console.log('A:', JSON.stringify(await state(A)));
    console.log('B:', JSON.stringify(await state(B)));
    console.log('VERDICT: MATCH NEVER STARTED under HOG=' + HOG + ' (repro-worthy failure)');
    await browser.close(); process.exit(2);
  }

  // observe 30 real seconds, zero input, sampling both sides
  const samples = [];
  for (let i = 0; i <= 10; i++) {
    const [sa, sb] = [await state(A), await state(B)];
    samples.push([sa, sb]);
    console.log('t+' + (i * 3) + 's A:', JSON.stringify(sa));
    console.log('       B:', JSON.stringify(sb));
    if (i < 10) await sleep(3000);
  }
  await A.screenshot({ path: SHOT + 'ph-A-HOG' + HOG + '-' + SLICE + (typeof BG !== 'undefined' && BG ? '-bg' : '') + '.png' }).catch(() => {});
  await B.screenshot({ path: SHOT + 'ph-B-HOG' + HOG + '-' + SLICE + (typeof BG !== 'undefined' && BG ? '-bg' : '') + '.png' }).catch(() => {});

  const last = samples[samples.length - 1];
  const off = last[0].waiting ? last[1] : last[0];   // offense side
  const stuckish = /get\s*ready/i.test(off.b1) || off.ghostBtn > 0 ||
                   (off.ball === 0 && off.kp === 2);
  console.log('VERDICT: ' + (stuckish
    ? 'GET-READY SIGNATURE PRESENT at t+30s (banner/ghost/no-ball) — compare vs baseline'
    : 'no GET READY signature at t+30s — screen state matches healthy baseline'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(stuckish ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
