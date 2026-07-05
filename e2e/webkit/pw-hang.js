// pw-hang.js — reproduce the PHONE HANG (staging/GET READY persists while
// the drive is live). Live-phone probe (V248, via USB Web Inspector) showed
// the exact stall state to recreate:
//   inMatch, waiting:false, kp:2 vy:2 ball:1 down:1 clk 2:00, b1:''
//   _7z:0 (staging never dismissed), btn:0+g1 and the corpse RE-SHOWN every
//   frame (tap-bridge kept logging "de-ghosted" for minutes), and the diag
//   log full of "ENGINE LOOP DEAD — kicking _fi5" (phone lock cycles).
// Prime suspect: forceUserOffenseDrive runs while the engine loop is DEAD
// (phone locked: rAF suspended, timers ~1Hz — bridge polls still run) and
// the engine wakes INTO an already-live drive, leaving its staging FSM
// half-entered (_7z=0) and re-showing the killed button forever.
//
// Sequence per attempt:
//   join+ready both → suspend A's loop (rAF gate + 1Hz intervals, like a
//   locked iPhone) → wait for A's bridge to force the opening drive DURING
//   the suspension → wake A → observe 35s.
// HANG = for >30s: _7z stays 0 AND the corpse keeps getting re-shown after
// parking (x returns > -1000), i.e. the staging screen is being repainted.
// Usage: node pw-hang.js [--cycles N] [--hog PCT]
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOG = parseInt((process.argv[process.argv.indexOf('--hog') + 1] || '0'), 10) || 0;
const CYCLES = parseInt((process.argv[process.argv.indexOf('--cycles') + 1] || '1'), 10) || 1;

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'H';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  // locked-iPhone gate: rAF suspended (queued), interval callbacks ~1Hz.
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
  if (HOG > 0) await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|2P DIAG|ENGINE LOOP|Iy suppressed|corpse|de-ghost/i.test(t))
      console.log('  [' + label + '] ' + t.slice(0, 120)); });
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) return page;
    await sleep(1000);
  }
  throw new Error(label + ': engine never ready');
}

async function join(page, label, room) {
  for (let i = 0; i < 15; i++) {
    await page.evaluate(c => { const i2 = document.getElementById('rb-room-input');
      if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
    await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
    await sleep(1500);
    const inRoom = await page.evaluate(() => {
      const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); });
    if (inRoom) return;
  }
  throw new Error(label + ' join failed');
}
async function ready(page, label) {
  for (let i = 0; i < 40; i++) {
    const en = await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); });
    if (en) { await page.evaluate(() => document.getElementById('rb-ready').click()); return; }
    await sleep(800);
  }
  throw new Error(label + ' ready never enabled');
}

// full stall-signature probe, incl. _7z and a corpse re-show test
const probe = (page) => page.evaluate(() => {
  const out = { inMatch: false, waiting: window._rb2p_userIsWaitingForOpponent === true,
    ball: 0, liveBtn: 0, ghostBtn: 0, kp: null, vy: null, clk: null, z7: null, reshow: false };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState; out.vy = em.engineDriveFsmStage;
    out.clk = em.engineMinutesLeft + ':' + em.engineSecondsLeft;
    const cs = _si(71);
    for (const k in cs) if (cs.hasOwnProperty(k)) { out.z7 = cs[k]._7z; break; }
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) {
      if (!x || !x._eE2) continue;
      if (x._eE2._fE2 === 'obj_ball') { if (!x._HL2) out.ball++; }
      else if (x._eE2._fE2 === 'obj_btn_kickoff') {
        x._HL2 ? out.ghostBtn++ : out.liveBtn++;
        // re-show detector: was parked at -2000 (by bridge) but engine
        // moved it back on-screen = staging code repainting every frame
        if (x.x > -1000 && x.__rbParkedOnce) out.reshow = true;
        if (x.x <= -1000) x.__rbParkedOnce = true;
      }
    }
  } catch (e) { out.err = String(e && e.message).slice(0, 60); }
  return out;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== HANG ENV (room ' + room + ', hog=' + HOG + ', cycles=' + CYCLES + ') ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, 'A', room); await join(B, 'B', room);
  console.log('joined; locking A BEFORE ready so match start lands on a dead loop');
  await A.evaluate(() => window.__bg(true));      // lock A first
  await ready(A, 'A'); await ready(B, 'B');       // B ready triggers match start

  // wait for A's bridge (1Hz timers still run) to force the drive while locked
  let forcedDuringLock = false;
  for (let i = 0; i < 40; i++) {
    const s = await probe(A);
    if (s.ball > 0 || s.inMatch) { forcedDuringLock = true;
      console.log('drive state during LOCK at t+' + i + 's: ' + JSON.stringify(s)); break; }
    await sleep(1000);
  }
  console.log('forced during lock: ' + forcedDuringLock);

  // extra lock/unlock cycles (real phones bounce) then final wake
  for (let c = 1; c < CYCLES; c++) {
    await A.evaluate(() => window.__bg(false)); await sleep(1500);
    await A.evaluate(() => window.__bg(true));  await sleep(4000);
  }
  await A.evaluate(() => window.__bg(false));
  console.log('A woken — observing 36s for the hang signature');

  let hangTicks = 0, samples = [];
  for (let i = 0; i <= 12; i++) {
    const s = await probe(A);
    samples.push(s);
    const hangish = s.inMatch && !s.waiting && s.ball > 0 && s.kp === 2 &&
                    s.z7 === 0 && (s.reshow || s.liveBtn > 0);
    if (hangish) hangTicks++;
    console.log('t+' + (i * 3) + 's ' + JSON.stringify(s) + (hangish ? '  <-- HANG SIGNATURE' : ''));
    if (i < 12) await sleep(3000);
  }
  await A.screenshot({ path: SHOT + 'hang-A.png' }).catch(() => {});
  const reproduced = hangTicks >= 10;   // >=30s of continuous hang signature
  console.log('VERDICT: ' + (reproduced
    ? 'HANG REPRODUCED (>30s staging repaint with live drive — matches phone)'
    : 'not reproduced this run (hangTicks=' + hangTicks + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
