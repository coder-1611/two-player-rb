// pw-corpse2.js — get a REAL kickoff button in the harness, reproduce the corpse,
// and DISCOVER the removal primitive that avoids the throwing Destroy event.
// Steps on A:
//   1. no-op forceUserOffenseDrive so the engine reaches NATIVE kickoff staging
//      and actually creates an obj_btn_kickoff (koLive>0).
//   2. hook _cr to throw for obj_btn_kickoff (device damaged-room behavior).
//   3. find the button's numeric OBJECT INDEX (scan _si(N)).
//   4. call the REAL force -> spawns OF:11, killKickoffButtons _cr-throws -> CORPSE.
//   5. probe which removal makes instance count go to 0 WITHOUT throwing:
//        a) _cr(inst)                      — single, runs Destroy -> expect THROW
//        b) _cr(inst, IDX, false)          — obj path, skip Destroy, run CleanUp
//        c) manual _2f2(_PL2) + _HL2 + splice from _oq2
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'D';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

const HOOKS = () => {
  // suppress opening force + hook _cr to throw for kickoff buttons
  const iv = setInterval(() => {
    if (typeof window._rb2p_forceUserOffenseDrive === 'function' && !window.__forceSaved) {
      window.__forceSaved = window._rb2p_forceUserOffenseDrive;
      window._rb2p_forceUserOffenseDrive = function () { return true; }; // no-op success -> pollA stops, native staging stays
    }
    if (typeof window._cr === 'function' && !window.__crHooked) {
      window.__crHooked = true;
      const orig = window._cr;
      window._cr = function (inst) {
        if (inst && inst._eE2 && inst._eE2._fE2 === 'obj_btn_kickoff' && arguments.length === 1) {
          throw new Error('SIMULATED _cr throw (damaged room)');
        }
        return orig.apply(this, arguments);
      };
      window.__crOrig = orig;
    }
    if (window.__forceSaved && window.__crHooked) clearInterval(iv);
  }, 15);
  setTimeout(() => clearInterval(iv), 25000);
};

async function bootPage(browser, label, hooks) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  if (hooks) await ctx.addInitScript(hooks);
  const page = await ctx.newPage();
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
const count = (page) => page.evaluate(() => {
  const o = { koLive: 0, koGhost: 0, plOF: 0, ball: 0, inMatch: false, vy: null, kp: null };
  try { o.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try { const em = RB.engineState(); o.vy = em.engineDriveFsmStage; o.kp = em.engineControllerState; } catch (e) {}
  const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
  for (const x of all) { if (!x || !x._eE2) continue; const n = x._eE2._fE2;
    if (n === 'obj_btn_kickoff') { if (x._HL2) o.koGhost++; else o.koLive++; }
    else if (n === 'obj_playerOF' && !x._HL2) o.plOF++;
    else if (n === 'obj_ball' && !x._HL2) o.ball++; }
  return o;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== CORPSE2 (room ' + room + ') ===');
  const A = await bootPage(browser, 'A', HOOKS);
  const B = await bootPage(browser, 'B', null);
  await join(A, room); await join(B, room);
  await ready(A); await ready(B);

  // 1) wait for native staging -> a LIVE kickoff button
  let staged = false;
  for (let i = 0; i < 25; i++) {
    const c = await count(A);
    if (c.inMatch && c.koLive > 0) { staged = true; console.log('native staging @t' + i + 's:', JSON.stringify(c)); break; }
    if (i % 3 === 0) console.log('  waiting staging t' + i + 's:', JSON.stringify(c));
    await sleep(1000);
  }
  if (!staged) { console.log('NEVER reached native staging (no live kickoff button)'); await browser.close(); process.exit(2); }

  // 2) find the object index of obj_btn_kickoff
  const idx = await A.evaluate(() => {
    for (let n = 0; n < 260; n++) {
      try { const list = _si(n); if (list && list.length) {
        for (const it of list) { if (it && it._eE2 && it._eE2._fE2 === 'obj_btn_kickoff') return n; }
      } } catch (e) {}
    }
    return -1;
  });
  console.log('obj_btn_kickoff OBJECT INDEX =', idx);

  // 3) reproduce the corpse: call the REAL force (spawns OF, kill _cr-throws)
  const forceRes = await A.evaluate(() => {
    try { return { ret: window.__forceSaved ? window.__forceSaved(-25) : 'no-saved' }; }
    catch (e) { return { err: String(e && e.message).slice(0, 80) }; }
  });
  await sleep(600);
  console.log('after real force:', JSON.stringify(forceRes), '|', JSON.stringify(await count(A)));

  // 4) probe removal primitives on the corpse
  const probe = await A.evaluate((IDX) => {
    const out = {};
    const listKO = () => { let live = 0, ghost = 0, exists = -1;
      const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
      for (const x of all) { if (x && x._eE2 && x._eE2._fE2 === 'obj_btn_kickoff') { if (x._HL2) ghost++; else live++; } }
      try { const l = _si(IDX); exists = l ? l.length : -1; } catch (e) {}
      return { live, ghost, exists };
    };
    out.before = listKO();
    // b) object-index path, skip Destroy event (i=false)
    try {
      const anchor = (_si(71) && _si(71)[Object.keys(_si(71))[0]]) || null;
      out.objPath = 'called';
      _cr(anchor || _Sc2, IDX, false);
      out.objPathOK = true;
    } catch (e) { out.objPathErr = String(e && e.message).slice(0, 80); }
    out.afterObjPath = listKO();
    return out;
  }, idx);
  console.log('REMOVAL PROBE:', JSON.stringify(probe, null, 1));

  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
