// probe-softhalt.js — validate V286 against the engine soft-halt (THE device
// freeze): mid-match, fire an uncaught error from a timer (the class of error
// _hi5 turns into game_end). V285 behavior: _pY2 flips to end state -> step+
// draw gated off -> ticks alive, buffer stale = the JDVS/XOVC freeze. V286:
// handlers disarmed -> error logged, _pY2 stays -1, game unaffected. Then
// simulate a direct GML-level _5B (bypasses handlers) -> sentinel resurrects.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s='S'; for(let i=0;i<3;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
async function boot(b,l){ const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  const p=await ctx.newPage();
  p.on('console',m=>{const t=m.text(); if(/disarmed|UNCAUGHT|SOFT-HALT|resurrect/i.test(t)) console.log('  ['+l+'] '+t.slice(0,110));});
  await p.goto(H.url(),{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  for(let i=0;i<50;i++){ if(await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000);} throw new Error(l+' not ready'); }
async function join(p,r){ for(let i=0;i<15;i++){ await p.evaluate(c=>{const i2=document.getElementById('rb-room-input'); if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join'); if(j) j.click();}); await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby'); return !!(l&&l.getAttribute('data-active')==='room');})) return;} throw new Error('join'); }
async function ready(p){ for(let i=0;i<40;i++){ if(await p.evaluate(()=>{const b=document.getElementById('rb-ready'); return !!(b&&!b.disabled);})){ await p.evaluate(()=>document.getElementById('rb-ready').click()); return;} await sleep(700);} throw new Error('ready'); }
const ST = `(function(){ const o={pY2:(typeof _pY2!=='undefined')?_pY2:'?', eng:(window._rb2p_engPerSec?window._rb2p_engPerSec():-9), hash:''};
  try{const c=document.getElementById('canvas'); o.hash=String(c.toDataURL('image/jpeg',0.3).length);}catch(e){o.hash='err';} return o; })()`;
(async()=>{
  await H.ensureServer();
  const room=code(); await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const b=await webkit.launch();
  const A=await boot(b,'A'), B=await boot(b,'B');
  await join(A,room); await join(B,room); await ready(A); await ready(B);
  for(let i=0;i<30;i++){ if(await A.evaluate(()=>{try{return RB.isEngineInMatchRoom()===true;}catch(e){return false;}})) break; await sleep(1000); }
  await sleep(3000);
  console.log('baseline:', JSON.stringify(await A.evaluate(ST)));
  // T1: uncaught error from a timer (the _hi5 class)
  await A.evaluate(`setTimeout(function(){ throw new Error('DEVICE-SIM uncaught timer error'); }, 10)`);
  await sleep(2000);
  const t1a = await A.evaluate(ST); await sleep(1200); const t1b = await A.evaluate(ST);
  const t1ok = t1b.pY2 === -1 && t1a.hash !== t1b.hash;
  console.log('T1 after uncaught error:', JSON.stringify(t1b), 'bufferAdvancing=' + (t1a.hash!==t1b.hash));
  console.log('T1 VERDICT:', t1ok ? 'PASS — uncaught error no longer halts the engine' : 'FAIL');
  // T2: direct GML-level _5B(-1) (bypasses window handlers) -> sentinel must resurrect
  const flip = await A.evaluate(`(function(){ try { _5B(-1); return 'called _5B(-1), pY2='+_pY2; } catch(e){ return 'ERR '+e.message; } })()`);
  console.log('T2 flip:', flip);
  await sleep(2500);   // sentinel runs at 700ms
  const t2a = await A.evaluate(ST); await sleep(1200); const t2b = await A.evaluate(ST);
  const t2ok = t2b.pY2 === -1 && t2a.hash !== t2b.hash;
  console.log('T2 after sentinel window:', JSON.stringify(t2b), 'bufferAdvancing=' + (t2a.hash!==t2b.hash));
  console.log('T2 VERDICT:', t2ok ? 'PASS — sentinel resurrected a direct game_end' : 'FAIL (pY2=' + t2b.pY2 + ')');
  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close(); process.exit(t1ok&&t2ok?0:3);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
