// probe-midmatch-death.js — THE DEVICE-FREEZE SIMULATION (JDVS signature):
// healthy boot, real 2P flow, reach the opening formation, THEN native rAF
// stops delivering (switchable proxy captured by the engine at boot).
// Old behavior: chain dies at the next frame, kicks fail, GET READY freeze.
// V284 expectation: fallback drives frames (~12fps min), match stays alive.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s='Q'; for(let i=0;i<3;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
const SWITCHABLE = () => {
  window.__rafDead = false;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { if (window.__rafDead) return 1; return orig(cb); };
  window.webkitRequestAnimationFrame = window.requestAnimationFrame;
};
async function boot(b,l,init){ const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  if(init) await ctx.addInitScript(init);
  const p=await ctx.newPage();
  p.on('console',m=>{const t=m.text(); if(/fallback driving|FRAME THREW|LOOP DEAD|2P START/i.test(t)) console.log('  ['+l+'] '+t.slice(0,110));});
  await p.goto(H.url(),{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  for(let i=0;i<60;i++){ if(await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000);} throw new Error(l+' not ready'); }
async function join(p,r){ for(let i=0;i<15;i++){ await p.evaluate(c=>{const i2=document.getElementById('rb-room-input'); if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join'); if(j) j.click();}); await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby'); return !!(l&&l.getAttribute('data-active')==='room');})) return;} throw new Error('join'); }
async function ready(p){ for(let i=0;i<40;i++){ if(await p.evaluate(()=>{const b=document.getElementById('rb-ready'); return !!(b&&!b.disabled);})){ await p.evaluate(()=>document.getElementById('rb-ready').click()); return;} await sleep(700);} throw new Error('ready'); }
const STATE = `(function(){ const o={fps:(window._rb2p_engPerSec?window._rb2p_engPerSec():-9),plOF:0,ball:0,inM:false};
  try{o.inM=RB.isEngineInMatchRoom()===true;}catch(e){}
  try{const all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[]; for(const x of all){ if(!x||!x._eE2||x._HL2) continue;
    if(x._eE2._fE2==='obj_playerOF')o.plOF++; else if(x._eE2._fE2==='obj_ball')o.ball++; }}catch(e){} return o; })()`;
(async()=>{
  await H.ensureServer();
  const room=code(); await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const b=await webkit.launch();
  const A=await boot(b,'A',SWITCHABLE);
  const B=await boot(b,'B',null);
  await join(A,room); await join(B,room); await ready(A); await ready(B);
  // wait for the real formation (healthy phase)
  let formed=false;
  for(let i=0;i<30;i++){ const s=await A.evaluate(STATE); if(s.inM&&s.plOF>=5&&s.ball>0){formed=true;console.log('FORMED healthy: '+JSON.stringify(s));break;} await sleep(1000); }
  if(!formed){ console.log('never formed under healthy rAF — abort'); process.exit(2); }
  // NOW kill native rAF mid-match — the JDVS device event
  await A.evaluate(`window.__rafDead = true`);
  console.log('>>> native rAF KILLED mid-match <<<');
  let minFps=999, alive=true;
  for(let t=2;t<=20;t+=2){
    await sleep(2000);
    const s=await A.evaluate(STATE);
    minFps=Math.min(minFps,s.fps);
    console.log('t+'+t+'s after rAF death: '+JSON.stringify(s));
    if(s.fps<=0||!s.inM){alive=false;break;}
  }
  console.log('VERDICT: '+(alive&&minFps>=6
    ? 'PASS — mid-match rAF death survived; fallback kept the match alive (min fps '+minFps+')'
    : 'FAIL — match died (min fps '+minFps+', alive='+alive+')'));
  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close(); process.exit(alive&&minFps>=6?0:3);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
