// probe-loopdeath.js — reproduce the phone's loop-death signature in the harness.
// Steps: boot 2P match on A, then (1) read loading_screen/_Yh5/_cg4/_Xh5,
// (2) EXPERIMENT A: remove loading_screen -> watch fps, (3) restore,
// (4) EXPERIMENT B: zombie-rAF (window._di5 = no-op) -> watch fps,
// (5) try our watchdog-style kick _fi5() during each -> does it throw/draw?
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s='L'; for(let i=0;i<3;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
async function boot(b,l){ const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  const p=await ctx.newPage();
  await p.goto(H.url(),{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  for(let i=0;i<40;i++){ if(await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000);} throw new Error(l+' not ready'); }
async function join(p,r){ for(let i=0;i<15;i++){ await p.evaluate(c=>{const i2=document.getElementById('rb-room-input'); if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join'); if(j) j.click();}); await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby'); return !!(l&&l.getAttribute('data-active')==='room');})) return;} throw new Error('join'); }
async function ready(p){ for(let i=0;i<40;i++){ if(await p.evaluate(()=>{const b=document.getElementById('rb-ready'); return !!(b&&!b.disabled);})){ await p.evaluate(()=>document.getElementById('rb-ready').click()); return;} await sleep(700);} throw new Error('ready'); }
const READ = `({ ls: !!document.getElementById('loading_screen'),
   yh5: (typeof _Yh5!=='undefined')?_Yh5:'?', cg4:(typeof _cg4!=='undefined')?_cg4:'?',
   xh5:(typeof _Xh5!=='undefined')?_Xh5:'?', fps: (window._rb2p_engPerSec?window._rb2p_engPerSec():-9) })`;
const KICK = `(function(){ try { _fi5(); return 'kick OK'; } catch(e){ return 'kick THREW: '+String(e && e.message).slice(0,80); } })()`;
(async()=>{
  await H.ensureServer();
  const room=code(); await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const b=await webkit.launch();
  const A=await boot(b,'A'), B=await boot(b,'B');
  await join(A,room); await join(B,room); await ready(A); await ready(B);
  for(let i=0;i<40;i++){ if(await A.evaluate(()=>{try{return RB.isEngineInMatchRoom()===true;}catch(e){return false;}})) break; await sleep(1000);}
  await sleep(4000);
  console.log('BASELINE:', JSON.stringify(await A.evaluate(READ)));
  // EXPERIMENT A: remove loading_screen
  await A.evaluate(()=>{ const l=document.getElementById('loading_screen'); if(l){ window.__savedLS=l; l.remove(); } });
  await sleep(2500);
  console.log('AFTER remove loading_screen:', JSON.stringify(await A.evaluate(READ)));
  console.log('  kick while removed:', await A.evaluate(KICK));
  // restore
  await A.evaluate(()=>{ if(window.__savedLS) document.body.appendChild(window.__savedLS); });
  await sleep(2500);
  console.log('AFTER restore:', JSON.stringify(await A.evaluate(READ)));
  // EXPERIMENT B: zombie rAF
  await A.evaluate(()=>{ window.__origDi5=window._di5; window._di5=function(){ return 0; }; });
  await sleep(2500);
  console.log('AFTER zombie-rAF:', JSON.stringify(await A.evaluate(READ)));
  console.log('  kick while zombie:', await A.evaluate(KICK));
  console.log('  fps after kicks:', JSON.stringify(await A.evaluate(READ)));
  // restore rAF: one manual kick should revive the chain
  await A.evaluate(()=>{ window._di5=window.__origDi5; });
  await A.evaluate(KICK);
  await sleep(2000);
  console.log('AFTER rAF restore + 1 kick:', JSON.stringify(await A.evaluate(READ)));
  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
