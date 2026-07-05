// pw-hang2.js — hang-repro attempt 2: DUPLICATE TAB, same room + same role.
// The live phone probe showed TWO game tabs open simultaneously (different
// ?v= session tokens) — an old session surviving in the iOS tab switcher
// next to the active one. The old tab keeps its Firebase listeners and
// bridge polls running (~1Hz backgrounded): it consumes outcome messages,
// re-writes live/{role} snapshots with stale state, and fights the active
// tab over the same role records. No env has ever modeled this.
// Flow: A1 joins + readies → A2 opens (same context, seeded sessionStorage
// so it enters the room as role 'a' too) → A1 backgrounded (old tab) →
// B readies → match starts with TWO role-a tabs alive. Observe A2 (the tab
// the user watches) for the hang signature >30s.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'D';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

const BG_GATE = () => {
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
  window.__bg = v => { bg = !!v; };
};

async function newCtx(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(BG_GATE);
  return ctx;
}

async function bootPage(ctx, label, seed) {
  const page = await ctx.newPage();
  if (seed) await page.addInitScript(s => {
    try { sessionStorage.setItem('rb_room', s.room);
          sessionStorage.setItem('rb_role_' + s.room, s.role); } catch (e) {}
  }, seed);
  page.on('console', m => { const t = m.text();
    if (/2P START|2P DIAG|2P RESUME|ENGINE LOOP|Iy suppressed|corpse|de-ghost|POISON|spawn/i.test(t))
      console.log('  [' + label + '] ' + t.slice(0, 130)); });
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

const probe = (page) => page.evaluate(() => {
  const out = { inMatch: false, waiting: window._rb2p_userIsWaitingForOpponent === true,
    ball: 0, liveBtn: 0, ghostBtn: 0, kp: null, vy: null, clk: null, z7: null, reshow: false,
    lobbyShown: false };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try { const l = document.getElementById('rb-lobby');
        out.lobbyShown = !!(l && l.style.display !== 'none'); } catch (e) {}
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
  console.log('=== HANG ENV 2: duplicate role-a tab (room ' + room + ') ===');
  const ctxA = await newCtx(browser), ctxB = await newCtx(browser);
  const A1 = await bootPage(ctxA, 'A1');
  const B  = await bootPage(ctxB, 'B');
  await join(A1, room); console.log('[A1] joined as a');
  await join(B, room);  console.log('[B] joined as b');
  await ready(A1);      console.log('[A1] ready');

  // the "old tab": user opens the game again in a NEW tab; the old one
  // stays alive in the switcher. A2 boots with rb_room seeded → resume path.
  const A2 = await bootPage(ctxA, 'A2', { room: room, role: 'a' });
  console.log('[A2] booted with seeded resume session (same room+role)');
  await A1.evaluate(() => window.__bg(true));   // old tab backgrounded (1Hz)
  console.log('[A1] backgrounded — now the stale interfering tab');

  await ready(B); console.log('[B] ready → match should start with 2 role-a tabs');

  // wait for match on A2 (the visible tab)
  let started = false;
  for (let i = 0; i < 45; i++) {
    const s = await probe(A2);
    if (s.inMatch) { started = true; break; }
    if (i % 5 === 0) console.log('waiting A2 match, t+' + i + 's: ' + JSON.stringify(s));
    await sleep(1000);
  }
  console.log('A2 in match: ' + started);

  let hangTicks = 0;
  for (let i = 0; i <= 12; i++) {
    const s2 = await probe(A2);
    const s1 = await probe(A1).catch(() => ({}));
    const hangish = s2.inMatch && !s2.waiting && s2.ball > 0 && s2.kp === 2 &&
                    s2.z7 === 0 && (s2.reshow || s2.liveBtn > 0);
    const stuck = !s2.inMatch && started === false && i > 4;   // never even started
    if (hangish || stuck) hangTicks++;
    console.log('t+' + (i * 3) + 's A2:' + JSON.stringify(s2) + (hangish ? ' <-- HANG SIG' : ''));
    if (i % 3 === 0) console.log('        A1:' + JSON.stringify(s1));
    if (i < 12) await sleep(3000);
  }
  await A2.screenshot({ path: SHOT + 'hang2-A2.png' }).catch(() => {});
  await A1.screenshot({ path: SHOT + 'hang2-A1.png' }).catch(() => {});
  const reproduced = hangTicks >= 10;
  console.log('VERDICT: ' + (reproduced
    ? 'HANG REPRODUCED with duplicate tab (>30s)'
    : 'not reproduced (hangTicks=' + hangTicks + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
