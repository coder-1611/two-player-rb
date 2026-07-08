// dump-pat-arming.js — get the HARNESS to the played-out pick-6 2-point scene
// (real modal answer, like pw-pat-click) and, BEFORE any throw drag, (a) sample
// receiver motion for 1.5s and (b) dump the same arming fields captured on the
// phone. Decisive: if the harness receivers are ALSO static pre-input, the
// phone's "frozen" scene is really "waiting for a drag iOS isn't delivering"
// (input bug); if the harness receivers RUN on their own but the phone's don't,
// it's an arming/state difference. Compare the printed arming to the phone dump.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'P'; for (let i = 0; i < 3; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
async function boot(b, l) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  await p.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false)) return p; await sleep(1000); }
  throw new Error(l + ' not ready');
}
async function join(p, r) { for (let i = 0; i < 15; i++) { await p.evaluate(c => { const i2 = document.getElementById('rb-room-input'); if (i2) { i2.value = c; i2.dispatchEvent(new Event('input', { bubbles: true })); } }, r); await p.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); }); await sleep(1500); if (await p.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); })) return; } throw new Error('join'); }
async function ready(p) { for (let i = 0; i < 40; i++) { if (await p.evaluate(() => { const b = document.getElementById('rb-ready'); return !!(b && !b.disabled); })) { await p.evaluate(() => document.getElementById('rb-ready').click()); return; } await sleep(800); } throw new Error('ready'); }
const ARM = `(function(){var e=RB.engineState();var rm=e.rawEngineMatch;var cs=_si(71);var ck=null;for(var k in cs){if(cs.hasOwnProperty(k)&&cs[k]){ck=cs[k];break;}}var cf={};if(ck)["_kp","_7z","_231","_mb1","_Db1","_r11","_s11","_Z21","_u11","_T11","_C31","_Nb1","_OC1","_Hd1"].forEach(function(f){cf[f]=ck[f];});var rf={};["_Nb1","_t11","_UD","_0z","_6F"].forEach(function(f){try{rf[f]=rm[f];}catch(e){}});var a=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];var of=[];for(var i=0;i<a.length&&of.length<4;i++){var x=a[i];if(x&&!x._HL2&&x._eE2&&x._eE2._fE2==="obj_playerOF")of.push(Math.round(x.x)+","+Math.round(x.y));}return {ctrl:cf,rm:rf,of:of,vy:e.engineDriveFsmStage,kp:e.engineControllerState,pat:window._rb2p_patPlayPending===true};})()`;
(async () => {
  await H.ensureServer(); const room = code(); await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  const b = await webkit.launch(); const A = await boot(b, 'A'); const B = await boot(b, 'B');
  await join(A, room); await join(B, room); await ready(A); await ready(B);
  for (let i = 0; i < 45; i++) { if (await A.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } })) break; await sleep(1000); }
  await sleep(3000);
  // trigger a pick-6 that lands the PAT on B (same as pw-pat-resume): write duty+turnover, reload B
  const now = Date.now();
  await fetch(FB + '/rooms/' + room + '/patDuty.json', { method: 'PUT', body: JSON.stringify({ role: 'b', ts: now, scoreUser: 6, scoreOpp: 0 }) });
  await fetch(FB + '/rooms/' + room + '/turnover.json', { method: 'PUT', body: JSON.stringify({ thrower: 'a', yardLine: -20, isPick6: true, resolved: true, ts: now }) });
  await B.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 40; i++) { if (await B.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false)) break; await sleep(1000); }
  // wait for the PAT modal, answer 2PT via _li (the button response) — NO drag
  let answered = false;
  for (let i = 0; i < 20; i++) {
    const r = await B.evaluate(() => {
      const pl = (window._rb2p_enumeratePopupInstances && window._rb2p_enumeratePopupInstances()) || [];
      const b2 = pl.find(p => p && !p._HL2 && p._0G === 100369);
      if (b2) { try { _li(b2, b2, b2._0G); return 'answered'; } catch (e) { return 'err:' + e.message; } }
      return 'no-modal';
    }).catch(() => 'err');
    if (r === 'answered') { answered = true; break; }
    await sleep(1000);
  }
  console.log('modal answered:', answered);
  await sleep(1500);   // let the scene settle
  // sample receiver motion over 1.5s WITHOUT any input
  const s1 = await B.evaluate(ARM);
  await sleep(1500);
  const s2 = await B.evaluate(ARM);
  const moved = JSON.stringify(s1.of) !== JSON.stringify(s2.of);
  console.log('=== HARNESS 2PT scene, NO input ===');
  console.log('receivers moved on their own:', moved, '| s1.of:', JSON.stringify(s1.of), '| s2.of:', JSON.stringify(s2.of));
  console.log('arming:', JSON.stringify(s2, null, 1));
  await fetch(FB + '/rooms/' + room + '.json', { method: 'DELETE' }).catch(() => {});
  await b.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
