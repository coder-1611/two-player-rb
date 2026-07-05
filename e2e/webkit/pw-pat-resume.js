// pw-pat-resume.js — reproduce "refresh B after a pick-6 → blank field
// instead of the PAT modal". Real 2P match; simulate the pick-6 moment by
// writing the SAME Firebase records the live flow writes (patDuty for B +
// resolved turnover), then reload B and watch the resume: does the PAT
// modal actually appear, or does B land on a blank field?
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const SHOT = __dirname + '/';
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'T';
  for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

async function bootPage(browser, label) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text();
    if (/2P START|2P RESUME|PICK6|PAT|patDuty|pop/i.test(t)) console.log('  [' + label + '] ' + t.slice(0, 130)); });
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
    kp: null, down: null, pops: -1, players: 0, ball: 0, patPend: window._rb2p_patPlayPending === true,
    waitCover: false };
  try { out.inMatch = RB.isEngineInMatchRoom() === true; } catch (e) {}
  try { const w = document.getElementById('rb-wait'); out.waitCover = !!(w && w.style.display !== 'none'); } catch (e) {}
  try {
    const em = RB.engineState();
    out.kp = em.engineControllerState; out.down = em.engineDownNumber;
    const all = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    for (const x of all) {
      if (!x || x._HL2 || !x._eE2) continue;
      if (x._eE2._fE2 === 'obj_ball') out.ball++;
      else if (/obj_player|obj_qb/.test(x._eE2._fE2)) out.players++;
    }
    out.pops = (window._rb2p_enumeratePopupInstances ? window._rb2p_enumeratePopupInstances().length : -1);
  } catch (e) { out.err = String(e && e.message).slice(0, 50); }
  return out;
});

(async () => {
  await H.ensureServer();
  const room = code();
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const browser = await webkit.launch();
  console.log('=== PAT-RESUME repro (room ' + room + ') ===');
  const A = await bootPage(browser, 'A');
  const B = await bootPage(browser, 'B');
  await join(A, room); await join(B, room);
  await ready(A); await ready(B);
  for (let i = 0; i < 45; i++) {
    const s = await probe(A);
    if (s.inMatch) break;
    await sleep(1000);
  }
  console.log('match live; A driving, B waiting. Simulating pick-6 moment records…');
  await sleep(3000);

  // what the live pick-6 flow writes: duty for B + resolved (never-acked
  // pre-V251) turnover from A, scores synced (7-0 to B say)
  const now = Date.now();
  await fetch(FB + '/rooms/' + room + '/patDuty.json', { method: 'PUT',
    body: JSON.stringify({ role: 'b', ts: now, scoreUser: 6, scoreOpp: 0 }) });
  await fetch(FB + '/rooms/' + room + '/turnover.json', { method: 'PUT',
    body: JSON.stringify({ thrower: 'a', yardLine: -20, isPick6: true, resolved: true, ts: now }) });

  console.log('reloading B (the user refresh)…');
  await B.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const ok = await B.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (ok) break;
    await sleep(1000);
  }
  // watch the resume for 25s — modal or blank field?
  let sawModal = false;
  for (let i = 0; i <= 8; i++) {
    const s = await probe(B);
    if (s.pops > 0) sawModal = true;
    console.log('t+' + (i * 3) + 's B: ' + JSON.stringify(s));
    if (i < 8) await sleep(3000);
  }
  await B.screenshot({ path: SHOT + 'pat-resume-B.png' }).catch(() => {});
  console.log('VERDICT: ' + (sawModal
    ? 'PAT modal appeared on resume'
    : 'NO MODAL — blank-field bug reproduced (see pat-resume-B.png)'));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await browser.close();
  process.exit(sawModal ? 0 : 3);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
