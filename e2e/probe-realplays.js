// e2e/probe-realplays.js — GROUND TRUTH for the commentary bugs. Plays REAL
// downs vs the KC AI defense with trusted mouse input and logs, per play:
//   • the full ball._kp sequence + _Vy sequence
//   • _501 (drive dir), _6F before/after, yardsToGo before/after (TRUE gain)
//   • which roster player's stat_rush_attempts / stat_receive incremented
//   • feedThrew / feedCatch / feedRunner + the emitted feed event
// so pass-vs-run classification, RB-vs-QB naming, and the yardage sign can be
// fixed from data instead of assumptions.
//   node e2e/probe-realplays.js
const H = require('./harness');
const sleep = H.sleep;
async function box(p){ return p.evaluate(()=>{const c=document.getElementById('canvas');const r=c.getBoundingClientRect();return{l:r.left,t:r.top,w:r.width,h:r.height};}); }

async function roster(page){ return page.evaluate(()=>{
    var out=[]; try{
        var c=_si(64),to=null;for(var k in c){if(c.hasOwnProperty(k)){to=c[k];break;}}
        if(to&&to._Ln!=null){var n=_wi(to._Ln);for(var i=0;i<n;i++){var p=_zi(to._Ln,i);if(p==null)continue;
            out.push({i,pos:Number(_Ai(p,'position')),ln:String(_Ai(p,'lname')||''),
                ra:Number(_Ai(p,'stat_rush_attempts'))||0,rc:Number(_Ai(p,'stat_receive'))||0});}}
    }catch(e){} return out;
}); }
async function state(page){ return page.evaluate(()=>{
    var s=RB.engineState()||{},m=s.rawEngineMatch||{};
    var all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];var ballKp=null,btn=0;
    for(var i=0;i<all.length;i++){var x=all[i];if(!x||x._HL2||!x._eE2)continue;var nn=x._eE2._fE2;
        if(nn==='obj_ball')ballKp=Number(x._kp);if(/btn|button/.test(nn||''))btn++;}
    return {vy:Number(s.engineDriveFsmStage),dir:Number(s.engineDriveDirection),
        f6:Math.round(Number(m._6F)),down:Number(s.engineDownNumber),ytg:Math.round(Number(s.engineYardsToGo)),
        kp:ballKp,btn,waiting:window._rb2p_userIsWaitingForOpponent===true};
}); }
async function clickBtn(p){const info=await p.evaluate(()=>{const inst=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];const out=[];for(const x of inst){if(x&&!x._HL2&&x._eE2&&x._eE2._fE2&&/btn|button/.test(x._eE2._fE2))out.push({x:x.x,y:x.y});}const c=document.getElementById('canvas');const r=c.getBoundingClientRect();return{out,left:r.left,top:r.top,rw:r.width,rh:r.height};});if(!info.out.length)return;info.out.sort((a,b)=>a.x-b.x);const b=info.out[0];const sc=Math.min(info.rw/480,info.rh/270),ox=(info.rw-480*sc)/2,oy=(info.rh-270*sc)/2;const sx=info.left+ox+(b.x+44)*sc,sy=info.top+oy+(b.y+14)*sc;await p.mouse.move(sx,sy);await p.mouse.down();await sleep(150);await p.mouse.move(sx+1,sy+1);await p.mouse.up();await sleep(300);}

async function pass(p,pull){const b=await box(p);const X=f=>b.l+b.w*f,Y=f=>b.t+b.h*f;
    await p.mouse.move(X(0.52),Y(0.56));await p.mouse.down();await sleep(600);
    await p.mouse.move(X(pull),Y(0.60),{steps:3});await sleep(100);await p.mouse.up();}
async function run(p){const b=await box(p);const X=f=>b.l+b.w*f,Y=f=>b.t+b.h*f;
    await p.mouse.move(X(0.52),Y(0.56));await p.mouse.down();await sleep(1500);await p.mouse.up();}   // snap, hold, no throw

(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await page.evaluate(() => {
            window._rb2p_computeDefenseAggression = () => 7;   // easy D so plays develop
            window.__feeds = [];
            window._rb2p_pushFeed = e => { window.__feeds.push(Object.assign({}, e)); };
        });
        await page.evaluate(()=>{ try{ window._rb2p_forceUserOffenseDrive(-25); }catch(e){} });
        await sleep(1200);

        for (let n = 0; n < 22; n++) {
            let s = await state(page);
            if (s.waiting) { await sleep(700); continue; }
            if (s.btn > 0) { await clickBtn(page); await sleep(600); continue; }
            if (s.kp == null) { await sleep(400); continue; }
            const pre = s, r0 = await roster(page);
            await page.evaluate(()=>{ window.__feeds = []; window.__kpTrace = []; window.__vyTrace = []; });
            const isPass = n % 3 !== 0;   // ~2/3 passes, 1/3 runs
            // trace kp/vy during the play
            const tracer = setInterval(async () => {
                try { await page.evaluate(() => {
                    var all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];var kp=null;
                    for(var i=0;i<all.length;i++){var x=all[i];if(x&&!x._HL2&&x._eE2&&x._eE2._fE2==='obj_ball'){kp=Number(x._kp);break;}}
                    var vy=Number((RB.engineState()||{}).engineDriveFsmStage);
                    if(window.__kpTrace&&(window.__kpTrace.length===0||window.__kpTrace[window.__kpTrace.length-1]!==kp))window.__kpTrace.push(kp);
                    if(window.__vyTrace&&(window.__vyTrace.length===0||window.__vyTrace[window.__vyTrace.length-1]!==vy))window.__vyTrace.push(vy);
                }); } catch(e){}
            }, 25);
            if (isPass) await pass(page, [0.46,0.44,0.42][n%3]); else await run(page);
            let post = pre;
            for (let t=0;t<24;t++){ await sleep(250); post=await state(page); if(post.down!==pre.down||post.waiting!==pre.waiting||post.btn>0) break; }
            clearInterval(tracer);
            await sleep(150);
            const r1 = await roster(page);
            const cap = await page.evaluate(()=>({feeds:window.__feeds.slice(),kp:(window.__kpTrace||[]).slice(),vy:(window.__vyTrace||[]).slice(),
                threw:!!window._rb2p_feedThrew,caught:!!window._rb2p_feedCatch,runner:window._rb2p_feedRunner||''}));
            const raB = r1.filter(r=>{const b=r0.find(x=>x.i===r.i);return b&&r.ra>b.ra;}).map(r=>`${r.ln}[p${r.pos}]+${r.ra-(r0.find(x=>x.i===r.i)||{ra:0}).ra}`);
            const rcB = r1.filter(r=>{const b=r0.find(x=>x.i===r.i);return b&&r.rc>b.rc;}).map(r=>`${r.ln}[p${r.pos}]`);
            let truth='n/a';
            if(post.down===pre.down+1) truth=(pre.ytg-post.ytg)+'y';
            else if(post.down===1&&pre.down>1) truth='1stDN(≥'+pre.ytg+')';
            else if(post.waiting!==pre.waiting) truth='TURNOVER';
            const feedYds = cap.feeds.length?cap.feeds.map(f=>f.yds).join('/'):'-';
            console.log(`P${n+1} ${isPass?'PASS':'RUN '} dir${pre.dir} 6F${pre.f6}->${post.f6} d${pre.down}&${pre.ytg}->${post.down}&${post.ytg} TRUTH=${truth}`);
            console.log(`    kp[${cap.kp.join(',')}] vy[${cap.vy.join(',')}] threw=${cap.threw} caught=${cap.caught} runner=${cap.runner}`);
            console.log(`    rushAtt+: ${raB.join(',')||'-'}   recv+: ${rcB.join(',')||'-'}   FEED: ${cap.feeds.map(f=>f.k+':'+(f.rb||f.rcv||f.qb||'')+':'+f.yds).join(' | ')||'(none)'}`);
        }
    } finally { await browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
