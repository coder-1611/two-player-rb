// e2e/probe-commentary.js — GROUND-TRUTH trace of the commentary emitter.
// Plays real downs vs the KC AI defense (single-page harness = real tackles),
// intercepts every _rb2p_pushFeed payload, and logs it alongside the engine's
// authoritative yardage (_6F / yardsToGo deltas) + which roster player's
// stat_rush_attempts actually incremented. Answers:
//   (2a) naming — does the QB's rush_attempts increment on an RB run?
//   (2b) yardage — is (ball.x - _B01)/20*dir short of the engine's real gain?
//   node e2e/probe-commentary.js
const H = require('./harness');
const sleep = H.sleep;

async function box(p){ return p.evaluate(()=>{const c=document.getElementById('canvas');const r=c.getBoundingClientRect();return{l:r.left,t:r.top,w:r.width,h:r.height};}); }
async function setEasy(p){ try{await p.evaluate(()=>{try{window._rb2p_computeDefenseAggression=function(){return 12;};const s=RB.engineState();if(s)s.engineDefenseAggression=12;}catch(e){}});}catch(e){} }

// Full engine + roster snapshot.
async function read(p){ return p.evaluate(()=>{
    let s={};try{s=RB.engineState()||{};}catch(e){}
    const m=s.rawEngineMatch||{};
    const inst=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];
    let ball=null,btn=0;const of=[];
    for(const x of inst){if(!x||x._HL2||!x._eE2||!x._eE2._fE2)continue;const n=x._eE2._fE2;
        if(n==='obj_ball')ball={x:Math.round(x.x),kp:Number(x._kp)};
        else if(n==='obj_playerOF')of.push({x:Math.round(x.x)});
        if(/btn|button/.test(n))btn++;}
    // roster rush attempts + receptions, keyed by position
    let roster=[];
    try{
        const c=_si(64);let to=null;for(const k in c){if(c.hasOwnProperty(k)){to=c[k];break;}}
        if(to&&to._Ln!=null){const nn=_wi(to._Ln);
            for(let i=0;i<nn;i++){const pp=_zi(to._Ln,i);if(pp==null)continue;
                roster.push({i,pos:Number(_Ai(pp,'position')),ln:String(_Ai(pp,'lname')||''),
                    ra:Number(_Ai(pp,'stat_rush_attempts'))||0,rc:Number(_Ai(pp,'stat_receive'))||0});}}
    }catch(e){}
    return {down:s.engineDownNumber,ytg:Math.round(Number(s.engineYardsToGo)),
        yard:Math.round(Number(s.engineYardLineSigned)),dir:Number(s.engineDriveDirection),
        vy:Number(s.engineDriveFsmStage),B01:Math.round(Number(m._B01)),
        waiting:window._rb2p_userIsWaitingForOpponent===true,ball,of,btn,roster};
}); }

async function clickBtn(p){const info=await p.evaluate(()=>{const inst=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];const out=[];for(const x of inst){if(x&&!x._HL2&&x._eE2&&x._eE2._fE2&&/btn|button/.test(x._eE2._fE2))out.push({x:x.x,y:x.y});}const c=document.getElementById('canvas');const r=c.getBoundingClientRect();return{out,left:r.left,top:r.top,rw:r.width,rh:r.height};});if(!info.out.length)return;info.out.sort((a,b)=>a.x-b.x);const b=info.out[0];const sc=Math.min(info.rw/480,info.rh/270),ox=(info.rw-480*sc)/2,oy=(info.rh-270*sc)/2;const sx=info.left+ox+(b.x+44)*sc,sy=info.top+oy+(b.y+14)*sc;await p.mouse.move(sx,sy);await p.mouse.down();await sleep(160);await p.mouse.move(sx+1,sy+1);await p.mouse.up();await sleep(250);}

async function snapRun(p){ const b=await box(p);const X=f=>b.l+b.w*f,Y=f=>b.t+b.h*f;
    await p.mouse.move(X(0.52),Y(0.56)); await p.mouse.down(); await sleep(220); await p.mouse.up(); }
async function snapPass(p,pullX){ const b=await box(p);const X=f=>b.l+b.w*f,Y=f=>b.t+b.h*f;
    await p.mouse.move(X(0.52),Y(0.56)); await p.mouse.down(); await sleep(650);
    await p.mouse.move(X(pullX),Y(0.60),{steps:3}); await sleep(120); await p.mouse.up(); }

(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        // Intercept feed payloads (in vs-KC there's no room so the real pushFeed
        // no-ops; overriding lets us capture exactly what the emitter computed).
        await page.evaluate(() => {
            window.__feeds = [];
            window._rb2p_pushFeed = function (e) { try { window.__feeds.push(Object.assign({t:Date.now()}, e)); } catch (x) {} };
        });
        await setEasy(page);
        await page.evaluate(()=>{ try{ window._rb2p_forceUserOffenseDrive(-25); }catch(e){} });
        await sleep(1200);

        for (let play = 0; play < 16; play++) {
            let s = await read(page);
            if (s.waiting) { await sleep(800); continue; }
            if (s.btn > 0) { await clickBtn(page); await sleep(700); continue; }
            if (!s.ball) { await sleep(500); continue; }
            const before = s;
            await page.evaluate(()=>{ window.__feeds = []; });   // clear per-play
            const isPass = play % 2 === 1;
            if (isPass) await snapPass(page, [0.46,0.44,0.42][play%3]); else await snapRun(page);
            // watch until the down resolves or ball goes dead
            let after = before;
            for (let t = 0; t < 20; t++) {
                await sleep(300);
                after = await read(page);
                if (after.down !== before.down || after.waiting !== before.waiting || after.btn > 0) break;
            }
            const feeds = await page.evaluate(()=>window.__feeds.slice());
            // ground truth: gain by yardsToGo delta when down advanced w/o first down
            let truth = 'n/a';
            if (after.down === before.down + 1) truth = (before.ytg - after.ytg) + 'y (ytgΔ)';
            else if (after.down === 1 && before.down !== 1) truth = 'FIRSTDOWN (≥' + before.ytg + 'y)';
            else if (after.waiting !== before.waiting) truth = 'TURNOVER';
            // which roster rush_attempts incremented
            const bumped = after.roster.filter(r => {
                const b0 = before.roster.find(x => x.i === r.i);
                return b0 && r.ra > b0.ra;
            }).map(r => `${r.ln}[pos${r.pos}]+${r.ra - (before.roster.find(x=>x.i===r.i)||{ra:0}).ra}`);
            const recBumped = after.roster.filter(r => {
                const b0 = before.roster.find(x => x.i === r.i);
                return b0 && r.rc > b0.rc;
            }).map(r => `${r.ln}[pos${r.pos}]`);
            console.log(`\n--- play ${play+1} (${isPass?'PASS':'RUN'}) ---`);
            console.log(`  before: down${before.down}&${before.ytg} yard${before.yard} dir${before.dir} B01=${before.B01} ballX=${before.ball?before.ball.x:'-'}`);
            console.log(`  after:  down${after.down}&${after.ytg} yard${after.yard} ballX=${after.ball?after.ball.x:'-'}`);
            console.log(`  TRUTH gain: ${truth}`);
            console.log(`  rush_attempts bumped: ${bumped.length?bumped.join(', '):'(none)'}`);
            console.log(`  receptions bumped: ${recBumped.length?recBumped.join(', '):'(none)'}`);
            console.log(`  FEED emitted: ${feeds.length?JSON.stringify(feeds.map(f=>({k:f.k,qb:f.qb,rb:f.rb,rcv:f.rcv,yds:f.yds}))):'(none)'}`);
        }
    } finally {
        await browser.close();
    }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
