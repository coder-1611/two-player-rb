// dump-state.js — capture a COMPLETE fingerprint of the engine at the opening:
// every own-property of every obj_controller and obj_btn_kickoff, a full
// instance census, and key globals. Run in the harness to get the HEALTHY
// baseline; the same JS (window._rb2p_fullDump, injected below) runs on the
// real phone via Web Inspector to get the STUCK state. Diffing the two
// fingerprints field-by-field reveals the single difference that keeps the
// phone parked on GET READY. Prints JSON to stdout.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The dump function, as a string, so the identical code runs here AND on the
// phone. Serializes primitive own-properties of instances (skips functions/
// objects/big arrays) so it is safe to JSON.stringify.
const DUMP_FN = `
window._rb2p_fullDump = function () {
  function prims(o) {
    var out = {};
    for (var k in o) {
      try {
        var v = o[k];
        var t = typeof v;
        if (t === 'number' || t === 'string' || t === 'boolean') out[k] = v;
        else if (v === null) out[k] = null;
      } catch (e) {}
    }
    return out;
  }
  var all = (typeof _Sc2 !== 'undefined' && _Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
  var controllers = [], kickoffs = [], census = {};
  for (var i = 0; i < all.length; i++) {
    var x = all[i]; if (!x || !x._eE2) continue;
    var n = x._eE2._fE2;
    var alive = !x._HL2;
    var key = n + (alive ? '' : '(dead)');
    census[key] = (census[key] || 0) + 1;
    if (n === 'obj_controller') controllers.push({ dead: !alive, f: prims(x) });
    else if (n === 'obj_btn_kickoff') kickoffs.push({ dead: !alive, f: prims(x) });
  }
  var g = {};
  try { g.fI2 = _fI2; g.dI2 = _dI2; } catch (e) {}
  try { g.T51_77 = _T51(77); g.T51_71 = _T51(71); } catch (e) {}
  try { var em = RB.engineState(); g.kp = em.engineControllerState; g.vy = em.engineDriveFsmStage;
        g.uScore = em.userScore; g.oScore = em.opponentScore; g.inMatch = RB.isEngineInMatchRoom(); } catch (e) {}
  try { g.waiting = window._rb2p_userIsWaitingForOpponent === true; } catch (e) {}
  try { g.rot = document.documentElement.classList.contains('rb-rot90'); g.virt = window.__rbVirt; } catch (e) {}
  return { census: census, controllers: controllers, kickoffs: kickoffs, globals: g };
};
return 'installed';
`;

async function boot(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) return page; await sleep(1000);
  }
  throw new Error(label + ' not ready');
}
async function join(page, room) {
  for (let i = 0; i < 20; i++) {
    await page.evaluate(c => { const i2 = document.getElementById('rb-room-input'); if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
    await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
    await sleep(1500);
    if (await page.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); })) return;
  }
  throw new Error('join failed');
}
async function ready(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); })) { await page.evaluate(() => document.getElementById('rb-ready').click()); return; }
    await sleep(800);
  }
  throw new Error('ready failed');
}
function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'F'; for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

(async () => {
  await H.ensureServer();
  const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  const A = await boot(browser, 'A'); const B = await boot(browser, 'B');
  await join(A, room); await join(B, room); await ready(A); await ready(B);
  for (let i = 0; i < 45; i++) { if (await A.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } })) break; await sleep(1000); }
  // wait until A reaches the healthy playing state with the full formation
  for (let i = 0; i < 20; i++) {
    const of = await A.evaluate(() => { try { let n = 0; const a = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || []; for (const x of a) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_playerOF') n++; return n; } catch (e) { return -1; } });
    if (of >= 6) break; await sleep(1000);
  }
  await A.evaluate(DUMP_FN);
  const dump = await A.evaluate(() => window._rb2p_fullDump());
  console.log(JSON.stringify(dump, null, 1));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

module.exports = { DUMP_FN };
