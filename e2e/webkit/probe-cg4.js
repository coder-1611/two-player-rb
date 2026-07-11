// probe-cg4.js — validate the _cg4 stuck-pause theory (XOVC signature):
// enter a real 2P match, force _cg4=true (iOS blur-without-focus), confirm
// the EXACT device signature (engine ticks, buffer stale, state healthy),
// then run _ag4(false) and confirm the game resumes.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const FB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function code() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s='R'; for(let i=0;i<3;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
async function boot(b,l){ const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  const p=await ctx.newPage();
  await p.goto(H.url(),{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  for(let i=0;i<50;i++){ if(await p.evaluate(()=>typeof window.s_play_two_player_match==='function').catch(()=>false)) return p; await sleep(1000);} throw new Error(l+' not ready'); }
async function join(p,r){ for(let i=0;i<15;i++){ await p.evaluate(c=>{const i2=document.getElementById('rb-room-input'); if(i2){i2.value=c;i2.dispatchEvent(new Event('input',{bubbles:true}));}},r);
  await p.evaluate(()=>{const j=document.getElementById('rb-join'); if(j) j.click();}); await sleep(1200);
  if(await p.evaluate(()=>{const l=document.getElementById('rb-lobby'); return !!(l&&l.getAttribute('data-active')==='room');})) return;} throw new Error('join'); }
async function ready(p){ for(let i=0;i<40;i++){ if(await p.evaluate(()=>{const b=document.getElementById('rb-ready'); return !!(b&&!b.disabled);})){ await p.evaluate(()=>document.getElementById('rb-ready').click()); return;} await sleep(700);} throw new Error('ready'); }
const ST = `(function(){ const o={eng:(window._rb2p_engPerSec?window._rb2p_engPerSec():-9),
  cg4:(typeof _cg4!=='undefined')?_cg4:'?', ag4:(typeof _ag4), plOF:0, inM:false, hash:''};
  try{o.inM=RB.isEngineInMatchRoom()===true;}catch(e){}
  try{const all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[]; for(const x of all){ if(x&&!x._HL2&&x._eE2&&x._eE2._fE2==='obj_playerOF')o.plOF++; }}catch(e){}
  try{const c=document.getElementById('canvas'); o.hash=c.toDataURL('image/jpeg',0.3).length+'';}catch(e){o.hash='err';}
  return o; })()`;
(async()=>{
  await H.ensureServer();
  const room=code(); await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  const b=await webkit.launch();
  const A=await boot(b,'A'), B=await boot(b,'B');
  await join(A,room); await join(B,room); await ready(A); await ready(B);
  let ok=false;
  for(let i=0;i<30;i++){ const s=await A.evaluate(ST); if(s.inM&&s.plOF>=5){ok=true;console.log('healthy in-match:',JSON.stringify(s));break;} await sleep(1000); }
  if(!ok){ console.log('never entered match'); process.exit(2); }
  // simulate iOS blur-without-focus: engine's own pause latch
  const latch = await A.evaluate(`(function(){ try { _ag4(true); return 'ag4(true) called'; } catch(e){ return 'ERR '+e.message; } })()`);
  console.log('latch:', latch);
  await sleep(1500);   // per-tick promoter turns _8g4 -> _n83 -> _cg4
  const frozen1 = await A.evaluate(ST);
  await sleep(1500);
  const frozen2 = await A.evaluate(ST);
  const bufferStale = frozen1.hash === frozen2.hash;
  console.log('FROZEN? cg4=' + frozen2.cg4 + ' eng=' + frozen2.eng + ' bufferStale=' + bufferStale, JSON.stringify(frozen2));
  const isDeviceSignature = frozen2.cg4 === true && frozen2.eng > 0 && bufferStale;
  console.log('DEVICE-SIGNATURE REPRODUCED:', isDeviceSignature);
  // THE FIX: engine's own unpause
  const fix = await A.evaluate(`(function(){ try { _ag4(false); return 'ag4(false) called, cg4='+_cg4; } catch(e){ return 'ERR '+e.message; } })()`);
  console.log('fix:', fix);
  await sleep(1500);
  const after1 = await A.evaluate(ST);
  await sleep(1200);
  const after2 = await A.evaluate(ST);
  const resumed = after1.hash !== after2.hash && after2.cg4 === false;
  console.log('AFTER FIX:', JSON.stringify(after2), 'bufferAdvancing=' + (after1.hash !== after2.hash));
  console.log('VERDICT: ' + (isDeviceSignature && resumed
    ? 'PASS — stuck _cg4 reproduces the freeze; _ag4(false) resumes the game'
    : 'FAIL/PARTIAL — sig=' + isDeviceSignature + ' resumed=' + resumed));
  await fetch(FB+'/rooms/'+room+'.json',{method:'DELETE'}).catch(()=>{});
  await b.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
