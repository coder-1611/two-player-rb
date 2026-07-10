// pw-twotab.js — reproduce the freeze via the USER'S recipe:
//   Tab A: PLAY 2P (creates room as A).  Tab B: enter code + ready.
//   Tab A: ready.  ==> the "GET READY" screen appears on A — the crucial point
//   where it fails. Watch A closely through that moment.
// Human-like delays (real players don't rush). Local server by default so we can
// iterate on edits; --live for the deploy. --headed for a real render window.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const HEADED = argv.includes('--headed');
const HOG = argv.includes('--hog') ? parseInt(argv[argv.indexOf('--hog') + 1], 10) : 0;
const URL = LIVE ? 'https://two-player-rb.vercel.app/' : null;

async function boot(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  if (HOG) await ctx.addInitScript(pct => { const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50); }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|STUCK|killKO|neutraliz|corpse|VERSION|forceUser/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 120)); });
  await page.goto(URL || H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 60; i++) { if (await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false)) return page; await sleep(1000); }
  throw new Error(label + ' engine never ready');
}
const A_STATE = (page) => page.evaluate(() => {
  const o = { inMatch: false, plOF: 0, plDF: 0, ball: 0, koLive: 0, koGhost: 0, vy: null, kp: null, banner: '', getReady: false,
              waiting: window._rb2p_userIsWaitingForOpponent === true };
  try { o.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try { const em = RB.engineState(); o.vy = em.engineDriveFsmStage; o.kp = em.engineControllerState;
        o.banner = String(em.rawEngineMatch.__b1 || '').slice(0, 14); o.getReady = /get\s*ready/i.test(o.banner); } catch (e) {}
  const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
  for (const x of all) { if (!x || !x._eE2) continue; const n = x._eE2._fE2;
    if (n === 'obj_btn_kickoff') { if (x._HL2) o.koGhost++; else o.koLive++; }
    else if (n === 'obj_playerOF' && !x._HL2) o.plOF++;
    else if (n === 'obj_playerDF' && !x._HL2) o.plDF++;
    else if (n === 'obj_ball' && !x._HL2) o.ball++; }
  return o;
});

(async () => {
  if (!LIVE) await H.ensureServer();
  const browser = await webkit.launch({ headless: !HEADED });
  console.log('=== TWO-TAB repro (' + (LIVE ? 'LIVE deploy' : 'LOCAL') + ', headed=' + HEADED + ', hog=' + HOG + ') ===');
  const A = await boot(browser, 'A');
  await sleep(2500);                                   // human: look at lobby

  // Tab A: PLAY 2P -> creates a room as A
  await A.evaluate(() => { const b = document.getElementById('rb-play2p'); if (b) b.click(); });
  await sleep(2500);
  const code = await A.evaluate(() => { const n = document.getElementById('rb-room-name'); return n ? (n.textContent || '').trim().replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase() : ''; });
  console.log('A created room:', code || '(code not shown on page — checking FB)');
  let room = code;
  if (!room) { const rooms = await (await fetch(FB + '/rooms.json?shallow=true')).json(); room = Object.keys(rooms || {}).pop(); }
  console.log('using room:', room);

  // Tab B: open, enter code, join, ready
  const B = await boot(browser, 'B');
  await sleep(2000);                                   // human: switch tabs
  for (let i = 0; i < 15; i++) {
    await B.evaluate(c => { const i2 = document.getElementById('rb-room-input'); if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
    await B.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
    await sleep(1200);
    if (await B.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); })) break;
  }
  await sleep(1500);
  for (let i = 0; i < 30; i++) { if (await B.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); })) { await B.evaluate(() => document.getElementById('rb-ready').click()); break; } await sleep(500); }
  console.log('B joined + readied');
  await sleep(2500);                                   // human: switch back to A

  // Tab A: ready  ==> THE CRUCIAL POINT
  for (let i = 0; i < 30; i++) { if (await A.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); })) { await A.evaluate(() => document.getElementById('rb-ready').click()); break; } await sleep(500); }
  console.log('A readied — WATCHING for GET READY freeze...');

  // watch A intensely through the opening
  let sawGetReady = false, sawKo = false, reachedPlay = false, stuckTicks = 0;
  for (let i = 0; i <= 40; i++) {
    const s = await A_STATE(A);
    if (s.getReady || s.koLive + s.koGhost > 0) { sawGetReady = sawGetReady || s.getReady; sawKo = sawKo || (s.koLive + s.koGhost > 0); }
    const stuck = s.inMatch && !s.waiting && (s.getReady || (s.koLive + s.koGhost) > 0);
    if (stuck) stuckTicks++;
    if (s.inMatch && s.plOF >= 5 && (s.koLive + s.koGhost) === 0 && !s.getReady) reachedPlay = true;
    if (i % 2 === 0 || stuck) console.log('t+' + (i * 0.75).toFixed(1) + 's A: ' + JSON.stringify(s) + (stuck ? '  <== STUCK/GET-READY' : ''));
    await sleep(750);
  }
  await A.screenshot({ path: SHOT + 'twotab-A.png' }).catch(() => {});
  const finalStuck = await A_STATE(A).then(s => s.inMatch && !s.waiting && (s.getReady || (s.koLive + s.koGhost) > 0));
  console.log('--- sawGetReady:', sawGetReady, '| sawKickoffBtn:', sawKo, '| reachedPlay:', reachedPlay, '| stuckTicks:', stuckTicks);
  console.log('VERDICT: ' + (finalStuck || (stuckTicks >= 6 && !reachedPlay)
    ? 'FREEZE REPRODUCED (stuck at GET READY/staging)'
    : 'no freeze — A reached live offense'));
  if (room) await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
