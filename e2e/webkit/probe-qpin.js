// probe-qpin.js — V293 regulation quarter-pin. In a real 2P match, make B the
// WAITING side with a 0:00 clock (what the driver's live-push writes at a
// quarter boundary). OLD: B's parked engine expires and rolls ITS OWN quarter
// (YNUP double-advance). NEW: clock floors to 0:01, quarter holds.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code(){const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let s='V';for(let i=0;i<3;i++)s+=c[Math.floor(Math.random()*c.length)];return s;}
async function boot(b){const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'})).newPage();
  await p.goto(H.url(),{waitUntil:'domcontentloaded'}).catch(()=>{});
  for(let i=0;i<50;i++){ if(await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000);} throw new Error('not ready');}
async function join(p,r){for(let i=0;i<15;i++){await p.evaluate(c=>{const i2=document.getElementById('rb-room-input');if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join');if(j)j.click();});await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby');return !!(l&&l.getAttribute('data-active')==='room');}))return;}throw new Error('join');}
async function ready(p){for(let i=0;i<40;i++){if(await p.evaluate(()=>{const b2=document.getElementById('rb-ready');return !!(b2&&!b2.disabled);})){await p.evaluate(()=>document.getElementById('rb-ready').click());return;}await sleep(700);}throw new Error('ready');}
(async()=>{
  await H.ensureServer();
  const room=code();await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const b=await webkit.launch();
  const A=await boot(b),B=await boot(b);
  await join(A,room);await join(B,room);await ready(A);await ready(B);
  for(let i=0;i<30;i++){if(await B.evaluate(()=>{try{return RB.isEngineInMatchRoom()===true;}catch(e){return false;}}))break;await sleep(1000);}
  await sleep(3000);
  // B: force the trigger — waiting + clock 0:00, quarter 1
  const before=await B.evaluate(`(function(){ const em=RB.engineState();
    window._rb2p_userIsWaitingForOpponent = true;
    em.engineQuarter=1; em.engineMinutesLeft=0; em.engineSecondsLeft=0;
    return {q:+em.engineQuarter,m:+em.engineMinutesLeft,s:+em.engineSecondsLeft}; })()`);
  console.log('trigger set:',JSON.stringify(before));
  await sleep(4000);
  const after=await B.evaluate(`(function(){ const em=RB.engineState();
    return {q:+em.engineQuarter,m:+em.engineMinutesLeft,s:+em.engineSecondsLeft}; })()`);
  console.log('after 4s:',JSON.stringify(after));
  const ok = after.q===1 && (after.m*60+after.s)>=1;
  console.log('VERDICT:',ok?'PASS — waiting-side quarter pinned (clock floored, Q held at 1)':'FAIL — q='+after.q+' clk='+after.m+':'+after.s);
  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close();process.exit(ok?0:3);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
