// Phase 1: WebKit 2P baseline with DRAGS (correct gesture).
// Phase 2: reload player A mid-drive -> RESUME flow -> drag again.
// The phone re-enters matches via resume constantly; no env ever tested it.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'Z';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function boot(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|2P RESUME|shielded|POISON|force/.test(t)) console.log('  [' + label + '] ' + t.slice(0, 100)); });
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(12000);
  return page;
}
async function join(page, label, room) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(c => { const i2 = document.getElementById('rb-room-input');
      if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, room);
    await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
    await sleep(1500);
    if (await page.evaluate(() => { const l = document.getElementById('rb-lobby');
      return !!(l && l.getAttribute('data-active') === 'room'); })) return;
  }
  throw new Error(label + ' join failed');
}
async function ready(page) {
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); })) {
      await page.evaluate(() => document.getElementById('rb-ready').click()); return; }
    await sleep(800);
  }
  throw new Error('ready never enabled');
}
const st = (page) => page.evaluate(() => {
  const out = { inMatch: false, waiting: window._rb2p_userIsWaitingForOpponent === true, ball: 0, kp: null, clk: null, down: null };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try { const em = RB.engineState(); out.kp = em.engineControllerState;
    out.clk = em.engineMinutesLeft + ':' + em.engineSecondsLeft; out.down = em.engineDownNumber;
    for (const x of (_Sc2._GL2._oq2 || [])) if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === 'obj_ball') out.ball++;
  } catch (e) {}
  return out;
});
async function drag(page) {
  const p = await page.evaluate(() => {
    const iw = window.innerWidth, ih = window.innerHeight;
    const rot = document.documentElement.classList.contains('rb-rot90');
    const f = (fx, fy) => rot ? { x: iw * fy, y: ih - ih * fx } : { x: iw * fx, y: ih * fy };
    return { a: f(0.5, 0.62), b: f(0.30, 0.35) };
  });
  await page.mouse.move(p.a.x, p.a.y); await page.mouse.down(); await sleep(250);
  await page.mouse.move(p.b.x, p.b.y, { steps: 10 }); await sleep(150); await page.mouse.up();
}

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== room ' + room + ' ===');
  const A = await boot(browser, 'A'), B = await boot(browser, 'B');
  await join(A, 'A', room); await join(B, 'B', room);
  await ready(A); await ready(B);
  for (let i = 0; i < 45; i++) { const [sa, sb] = [await st(A), await st(B)];
    if (sa.inMatch && sb.inMatch) break; await sleep(1000); }
  await sleep(4000);

  console.log('--- phase 1: drags on fresh match ---');
  console.log('A pre :', JSON.stringify(await st(A)));
  await drag(A); await sleep(2500);
  const p1 = await st(A);
  console.log('A drag:', JSON.stringify(p1));
  console.log('phase1: ' + (p1.clk !== '2:0' ? 'PLAYS (baseline ok)' : 'STUCK'));

  console.log('--- phase 2: reload A mid-drive -> resume -> drag ---');
  await A.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(14000);
  for (let i = 0; i < 20; i++) { const s = await st(A); if (s.inMatch) break; await sleep(1000); }
  await sleep(5000);
  const r0 = await st(A);
  console.log('A resumed:', JSON.stringify(r0));
  const clk0 = r0.clk, down0 = r0.down;
  let moved = false;
  for (let i = 0; i < 4; i++) {
    await drag(A); await sleep(2500);
    const s = await st(A);
    console.log('A drag' + (i + 1) + ':', JSON.stringify(s));
    if (s.clk !== clk0 || s.down !== down0) { moved = true; break; }
  }
  await A.screenshot({ path: __dirname + '/wk-resume.png' });
  console.log('VERDICT phase2: ' + (moved ? 'RESUME PLAYS (clean)' : 'STUCK AFTER RESUME — reproduced'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close(); process.exit(moved ? 0 : 3);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
