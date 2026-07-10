// probe-immortal.js — validate V284's immortal scheduler against BOTH proven
// failure classes:
//  T1 zombie-rAF from the start: rAF registers but NEVER fires (init script).
//     Old code: game can't even boot its loop. New code: fallback drives it.
//  T2 mid-match frame throw: make _No2 throw for ~2s. Old code: chain dies
//     forever. New code: chain survives, FRAME THREW logged, recovers to 60.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s='M'; for(let i=0;i<3;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
const ZOMBIE = () => {
  // rAF that registers but never delivers — the iOS zombie, from page start
  window.requestAnimationFrame = function () { return 1; };
  window.webkitRequestAnimationFrame = window.requestAnimationFrame;
};
async function boot(b, l, init) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on('console', m => { const t = m.text(); if (/immortal|fallback|FRAME THREW|kick/i.test(t)) console.log('  ['+l+'] '+t.slice(0,110)); });
  await p.goto(H.url(), { waitUntil:'domcontentloaded', timeout:60000 }).catch(()=>{});
  for (let i=0;i<50;i++){ if (await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000); }
  throw new Error(l+' engine never ready');
}
async function join(p,r){ for(let i=0;i<15;i++){ await p.evaluate(c=>{const i2=document.getElementById('rb-room-input'); if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join'); if(j) j.click();}); await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby'); return !!(l&&l.getAttribute('data-active')==='room');})) return;} throw new Error('join'); }
async function ready(p){ for(let i=0;i<40;i++){ if(await p.evaluate(()=>{const b=document.getElementById('rb-ready'); return !!(b&&!b.disabled);})){ await p.evaluate(()=>document.getElementById('rb-ready').click()); return;} await sleep(700);} throw new Error('ready'); }
const FPS = `(window._rb2p_engPerSec ? window._rb2p_engPerSec() : -9)`;
(async()=>{
  await H.ensureServer();
  const b = await webkit.launch();

  console.log('--- T1: ZOMBIE-rAF FROM BOOT ---');
  const room = code(); await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const A = await boot(b,'A', ZOMBIE);   // A's rAF NEVER fires
  const B = await boot(b,'B', null);
  await join(A,room); await join(B,room); await ready(A); await ready(B);
  for(let i=0;i<40;i++){ if(await A.evaluate(()=>{try{return RB.isEngineInMatchRoom()===true;}catch(e){return false;}})) break; await sleep(1000);}
  await sleep(5000);
  const fpsZ = await A.evaluate(FPS);
  const stA = await A.evaluate(`(function(){ const o={plOF:0,ball:0}; try{ const all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];
    for(const x of all){ if(x&&!x._HL2&&x._eE2){ if(x._eE2._fE2==='obj_playerOF')o.plOF++; if(x._eE2._fE2==='obj_ball')o.ball++; } } }catch(e){} return o; })()`);
  console.log('T1 zombie-rAF: fps=' + fpsZ + ' state=' + JSON.stringify(stA));
  console.log('T1 VERDICT: ' + (fpsZ >= 8 ? 'PASS — fallback drives the game with rAF fully dead' : 'FAIL — fps ' + fpsZ));

  console.log('--- T2: MID-MATCH FRAME THROW (2s) ---');
  await A.evaluate(`(function(){ window.__origNo2=_No2; _No2=function(){ throw new Error('SIMULATED _No2 throw'); }; })()`);
  await sleep(2000);
  const fpsThrow = await A.evaluate(FPS);
  await A.evaluate(`(function(){ _No2=window.__origNo2; })()`);
  await sleep(3000);
  const fpsAfter = await A.evaluate(FPS);
  console.log('T2 during-throw fps=' + fpsThrow + ' after-restore fps=' + fpsAfter);
  console.log('T2 VERDICT: ' + (fpsAfter >= 8 ? 'PASS — chain survived a repeating frame throw' : 'FAIL — chain died (fps ' + fpsAfter + ')'));

  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
