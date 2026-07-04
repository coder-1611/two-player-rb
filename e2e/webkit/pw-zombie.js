// THE ZOMBIE-PLAYER TEST: make _Y41 throw for every player (exactly what the
// phone logs show: 'Y41 shielded ... x22'), let the V232 shield carry the
// spawn, then attempt a REAL drag-snap. If the snap is dead -> the phone's
// stall is reproduced mechanically: live-looking drive, unplayable.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await H.ensureServer();
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); if (/shielded|2P START/.test(t)) console.log('  |', t.slice(0, 90)); });
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(12000);
  // sabotage the ORIGINAL _Y41 exactly like the phone's failure — the shipped
  // shield (already wrapping it) will catch every throw, like on-device.
  await page.evaluate(() => {
    // the shield wrapped _Y41 at boot; sabotage must throw INSIDE the shield.
    // The shield calls the original via closure — recreate the sandwich:
    // make a thrower, then re-wrap it with the SAME shield semantics the
    // shipped code uses (catch -> log -> return 0).
    const thrower = function () { throw new TypeError('undefined value in expression (phone sim)'); };
    let n = 0;
    _Y41 = function (_, t) {
      try { return thrower(_, t); }
      catch (e) { if (++n <= 3) console.warn('[2p-rb] _Y41 crash shielded (#' + n + '):', e.message); return 0; }
    };
    _Y41.__rb2pWrapped = true;
  });
  await H.enterMatch(page, 11);
  await sleep(3500);
  const st = () => page.evaluate(() => { const em = RB.engineState();
    let ball = 0; for (const x of (_Sc2._GL2._oq2 || [])) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') ball++;
    return { clk: em.engineMinutesLeft + ':' + em.engineSecondsLeft, down: em.engineDownNumber,
             kp: em.engineControllerState, ball }; });
  console.log('pre :', JSON.stringify(await st()));
  const p = await page.evaluate(() => {
    const iw = window.innerWidth, ih = window.innerHeight;
    const rot = document.documentElement.classList.contains('rb-rot90');
    const f = (fx, fy) => rot ? { x: iw * fy, y: ih - ih * fx } : { x: iw * fx, y: ih * fy };
    return { a: f(0.5, 0.62), b: f(0.30, 0.35) };
  });
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(p.a.x, p.a.y); await page.mouse.down(); await sleep(250);
    await page.mouse.move(p.b.x, p.b.y, { steps: 10 }); await sleep(150); await page.mouse.up();
    await sleep(2000);
    console.log('drag' + (i + 1) + ':', JSON.stringify(await st()));
  }
  await page.screenshot({ path: __dirname + '/wk-zombie.png' });
  const s = await st();
  console.log('VERDICT: ' + (s.clk === '2:0'
    ? 'STUCK — zombie players, snap dead (PHONE REPRODUCED, mechanism proven)'
    : 'plays fine despite zombie players (theory dead)'));
  await browser.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
