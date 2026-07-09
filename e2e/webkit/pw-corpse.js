// pw-corpse.js — reproduce the REAL phone freeze the harness has always missed.
// The phone freeze is NOT "offense never spawned" (plOF==0). It is: offense IS
// on the field (plOF:11) but a CORPSE kickoff button (koGhost:1) survives because
// the engine destroy _cr THROWS in the damaged on-device room and the bridge
// falls back to a raw _HL2 kill that leaves the instance counted by
// instance_exists — which keeps gating obj_controller's step so the snap never
// fires. Here we SIMULATE that by wrapping _cr to throw for obj_btn_kickoff on A,
// exactly as the device does. Then we measure the real signals:
//   koGhost over time  — does the corpse ever get removed? (fix => goes to 0)
//   snap test          — a trusted tap on the field: does the ball respond?
// Verdict FROZEN if the corpse persists / the snap does nothing.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOG = parseInt((process.argv[process.argv.indexOf('--hog') + 1] || '60'), 10) || 60;

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'C';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

// Init script: as soon as the engine's _cr exists, wrap it so destroying an
// obj_btn_kickoff THROWS — exactly the device's damaged-room behavior.
const CORPSE_HOOK = () => {
  const iv = setInterval(() => {
    if (typeof window._cr === 'function' && !window.__crHooked) {
      window.__crHooked = true;
      const orig = window._cr;
      window._cr = function (inst) {
        if (inst && inst._eE2 && inst._eE2._fE2 === 'obj_btn_kickoff') {
          throw new Error('SIMULATED _cr throw (damaged room)');
        }
        return orig.apply(this, arguments);
      };
      clearInterval(iv);
      try { window._rb2p_diagLog && window._rb2p_diagLog('TEST: _cr hooked to throw for kickoff btn'); } catch (e) {}
    }
  }, 15);
  setTimeout(() => clearInterval(iv), 20000);
};

async function bootPage(browser, label, hookCorpse) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addInitScript(pct => {
    const busy = Math.round(50 * pct / 100);
    setInterval(() => { const t0 = performance.now(); while (performance.now() - t0 < busy); }, 50);
  }, HOG);
  if (hookCorpse) await ctx.addInitScript(CORPSE_HOOK);
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|STUCK|forceUser|corpse|neutraliz|snapfix|CORPSE|TEST:/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 130)); });
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false)) return page;
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
    if (await page.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); })) return;
  }
  throw new Error('join failed');
}
async function ready(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); })) {
      await page.evaluate(() => document.getElementById('rb-ready').click()); return;
    }
    await sleep(800);
  }
  throw new Error('ready never enabled');
}
const aState = (page) => page.evaluate(() => {
  const out = { inMatch: false, plOF: 0, plDF: 0, ball: 0, koLive: 0, koGhost: 0,
                vy: null, kp: null, banner: '', waiting: window._rb2p_userIsWaitingForOpponent === true };
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
  // instance_exists count the ENGINE sees for the kickoff button (the gate)
  try { out.koExists = (typeof _si === 'function') ? (function () { let n = 0; const cs = _si(74); for (const k in cs) if (cs.hasOwnProperty(k)) n++; return n; })() : -1; } catch (e) { out.koExists = -2; }
  try { const em = RB.engineState(); out.banner = String(em.rawEngineMatch.__b1 || '').slice(0, 14); } catch (e) {}
  return out;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== CORPSE repro (room ' + room + ', HOG ' + HOG + '%, _cr THROWS for kickoff btn on A) ===');
  const A = await bootPage(browser, 'A', true);   // A gets the corpse hook
  const B = await bootPage(browser, 'B', false);
  await join(A, room); await join(B, room);
  await ready(A); await ready(B);

  // wait for match + corpse to appear
  let sawCorpse = false;
  for (let i = 0; i < 12; i++) {
    const s = await aState(A);
    if (s.inMatch && s.koGhost > 0) { sawCorpse = true; }
    if (sawCorpse) break;
    await sleep(1000);
  }
  console.log('corpse appeared:', sawCorpse);

  // measure koGhost + banner over 16s: does the fix ever clear it?
  let clearedTick = -1;
  for (let i = 0; i <= 16; i += 2) {
    const s = await aState(A);
    const stuck = s.inMatch && !s.waiting && s.plOF >= 5 && (s.koGhost + s.koLive) > 0;
    if (clearedTick < 0 && s.inMatch && s.plOF >= 5 && (s.koGhost + s.koLive) === 0) clearedTick = i;
    console.log('t+' + i + 's A: ' + JSON.stringify(s) + (stuck ? '  <-- CORPSE-STUCK' : ''));
    await sleep(2000);
  }

  // snap test: trusted tap on the field (center of the landscape canvas)
  const before = await aState(A);
  await A.touchscreen.tap(195, 300).catch(() => {});   // mobile-viewport coords
  await sleep(400);
  await A.touchscreen.tap(195, 500).catch(() => {});
  await sleep(1200);
  const after = await aState(A);
  const snapWorked = (after.vy !== before.vy) || (after.ball !== before.ball) ||
                     (JSON.stringify(after) !== JSON.stringify(before) && after.plOF !== before.plOF);
  await A.screenshot({ path: SHOT + 'corpse-A.png' }).catch(() => {});

  const stillStuck = after.inMatch && (after.koGhost + after.koLive) > 0 && after.plOF >= 5;
  console.log('--- snap test --- before vy/ball:', before.vy, before.ball, '| after:', after.vy, after.ball, '| snapWorked:', snapWorked);
  console.log('VERDICT: ' + (stillStuck
    ? 'FROZEN — corpse persists (koGhost+koLive>0, plOF>=5); clearedTick=' + clearedTick
    : 'RECOVERED — corpse gone by t+' + clearedTick + 's'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(stillStuck ? 3 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
