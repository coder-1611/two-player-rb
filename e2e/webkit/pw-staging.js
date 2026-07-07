// pw-staging.js — reproduce the DHEB/PUCD device freeze: role A stuck on the
// "GET READY / Receive" kickoff staging (visible, 60fps, ball on tee) instead
// of reaching an offensive formation. Real 2P flow, iOS 18.7 UA, heavy CPU hog
// to provoke the slow-device timing the harness has never hit. Judges A by
// obj_playerOF count: >=5 = offense spawned (healthy); 0 with a kickoff button
// present = stuck at staging (the bug).
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOG = parseInt((process.argv[process.argv.indexOf('--hog') + 1] || '85'), 10) || 85;

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'S';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|KICKOFF-SWEEP|STUCK|forceUser|opening drive/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 120)); });
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

const aState = (page) => page.evaluate(() => {
  const out = { inMatch: false, plOF: 0, plDF: 0, ball: 0, koLive: 0, koGhost: 0,
                vy: null, kp: null, waiting: window._rb2p_userIsWaitingForOpponent === true };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try { const em = RB.engineState(); out.vy = em.engineDriveFsmStage; out.kp = em.engineControllerState;
        out.poss = em.enginePossessingTeamIdx === em.engineUserTeamIdx; } catch (e) {}
  try {
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) {
      if (!x || !x._eE2) continue;
      const n = x._eE2._fE2;
      if (n === 'obj_btn_kickoff') { if (x._HL2) out.koGhost++; else out.koLive++; }
      else if (n === 'obj_playerOF' && !x._HL2) out.plOF++;
      else if (n === 'obj_playerDF' && !x._HL2) out.plDF++;
      else if (n === 'obj_ball' && !x._HL2) out.ball++;
    }
  } catch (e) { out.err = String(e && e.message).slice(0, 60); }
  return out;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== STAGING repro (room ' + room + ', HOG ' + HOG + '%) ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await ready(A); await ready(B);

  let stuckTicks = 0, sawOffense = false;
  for (let i = 0; i <= 20; i++) {
    const s = await aState(A);
    const stuck = s.inMatch && !s.waiting && (s.koLive + s.koGhost) > 0 && s.plOF === 0;
    if (s.plOF >= 5) sawOffense = true;
    if (stuck) stuckTicks++;
    console.log('t+' + (i * 2) + 's A: ' + JSON.stringify(s) + (stuck ? '  <-- STUCK@staging' : ''));
    if (i < 20) await sleep(2000);
  }
  await A.screenshot({ path: SHOT + 'staging-A.png' }).catch(() => {});
  // healthy = offense reached and NOT still stuck at the end
  const finalStuck = await aState(A).then(s => s.inMatch && !s.waiting && (s.koLive + s.koGhost) > 0 && s.plOF === 0);
  const reproduced = finalStuck || (stuckTicks >= 5 && !sawOffense);
  console.log('VERDICT: ' + (reproduced
    ? 'STUCK@staging REPRODUCED (offense never reached; stuckTicks=' + stuckTicks + ')'
    : 'healthy — A reached offense (sawOffense=' + sawOffense + ', finalStuck=' + finalStuck + ')'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(reproduced ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
