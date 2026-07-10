// probe-immortal3.js — WHY doesn't the match start under zombie-rAF?
// zombie on A only, NO hog, full console from both, FB room state each 3s.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s='P'; for(let i=0;i<3;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
const ZOMBIE = () => { window.requestAnimationFrame = function(){ return 1; }; window.webkitRequestAnimationFrame = window.requestAnimationFrame; };
async function boot(b,l,init){ const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  if(init) await ctx.addInitScript(init);
  const p=await ctx.newPage();
  p.on('console',m=>{const t=m.text(); if(!/fallback driving|Audio_|readyState/i.test(t)) console.log('  ['+l+'] '+t.slice(0,140));});
  await p.goto(H.url(),{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  for(let i=0;i<60;i++){ if(await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000);} throw new Error(l+' not ready'); }
async function join(p,r){ for(let i=0;i<15;i++){ await p.evaluate(c=>{const i2=document.getElementById('rb-room-input'); if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join'); if(j) j.click();}); await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby'); return !!(l&&l.getAttribute('data-active')==='room');})) return;} throw new Error('join'); }
async function ready(p){ for(let i=0;i<40;i++){ if(await p.evaluate(()=>{const b=document.getElementById('rb-ready'); return !!(b&&!b.disabled);})){ await p.evaluate(()=>document.getElementById('rb-ready').click()); return;} await sleep(700);} throw new Error('ready'); }
(async()=>{
  await H.ensureServer();
  const room=code(); await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const b=await webkit.launch();
  console.log('=== room '+room+': zombie on A, no hog ===');
  const A=await boot(b,'A',ZOMBIE);
  const B=await boot(b,'B',null);
  await join(A,room); await join(B,room);
  await ready(A); await ready(B);
  console.log('both readied');
  for(let t=0;t<=30;t+=3){
    const sa=await A.evaluate(`(function(){ try{return {inM:RB.isEngineInMatchRoom()===true, wait:window._rb2p_userIsWaitingForOpponent===true, fps:(window._rb2p_engPerSec?window._rb2p_engPerSec():-9)};}catch(e){return {err:String(e).slice(0,40)};} })()`);
    const sb=await B.evaluate(`(function(){ try{return {inM:RB.isEngineInMatchRoom()===true};}catch(e){return {}; } })()`);
    const fb=await (await fetch(FB+'/rooms/'+room+'.json')).json();
    console.log('t+'+t+'s A:'+JSON.stringify(sa)+' B:'+JSON.stringify(sb)+' fbPlayers:'+JSON.stringify((fb||{}).players||null));
    await sleep(3000);
  }
  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
