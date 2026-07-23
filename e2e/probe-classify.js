// e2e/probe-classify.js — pin the PASS-vs-RUN flight discriminator with real
// plays. Uses throw-hold's slingshot gesture (which lands real completions) plus
// pure-hold runs, and logs per play:
//   • flightMax = max distance from the ball to the NEAREST offensive player
//   • catchName (nearest OF at first bkp5) and tackleName (nearest OF at bkp4)
//   • stat_rush_attempts / stat_receive deltas per player (with position)
//   • the kp sequence + TRUTH gain (ytg delta)
//   node e2e/probe-classify.js
const H = require('./harness');
const sleep = H.sleep;
async function box(p){ return p.evaluate(()=>{const c=document.getElementById('canvas');const r=c.getBoundingClientRect();return{l:r.left,t:r.top,w:r.width,h:r.height};}); }
async function setEasy(p){ try{await p.evaluate(()=>{try{window._rb2p_computeDefenseAggression=function(){return 10;};const s=RB.engineState();if(s)s.engineDefenseAggression=10;}catch(e){}});}catch(e){} }

async function roster(page){ return page.evaluate(()=>{
    var out=[]; try{
        var c=_si(64),to=null;for(var k in c){if(c.hasOwnProperty(k)){to=c[k];break;}}
        if(to&&to._Ln!=null){var n=_wi(to._Ln);for(var i=0;i<n;i++){var p=_zi(to._Ln,i);if(p==null)continue;
            out.push({i,pos:Number(_Ai(p,'position')),ln:String(_Ai(p,'lname')||''),
                ra:Number(_Ai(p,'stat_rush_attempts'))||0,rc:Number(_Ai(p,'stat_receive'))||0});}}
    }catch(e){} return out;
}); }
async function st(page){ return page.evaluate(()=>{
    var s=RB.engineState()||{},m=s.rawEngineMatch||{};
    var all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];var kp=null,btn=0;
    for(var i=0;i<all.length;i++){var x=all[i];if(!x||x._HL2||!x._eE2)continue;var nn=x._eE2._fE2;
        if(nn==='obj_ball')kp=Number(x._kp);if(/btn|button/.test(nn||''))btn++;}
    return {vy:Number(s.engineDriveFsmStage),f6:Math.round(Number(m._6F)),down:Number(s.engineDownNumber),
        ytg:Math.round(Number(s.engineYardsToGo)),kp,btn,waiting:window._rb2p_userIsWaitingForOpponent===true};
}); }
async function clickBtn(p){const info=await p.evaluate(()=>{const inst=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];const out=[];for(const x of inst){if(x&&!x._HL2&&x._eE2&&x._eE2._fE2&&/btn|button/.test(x._eE2._fE2))out.push({x:x.x,y:x.y});}const c=document.getElementById('canvas');const r=c.getBoundingClientRect();return{out,left:r.left,top:r.top,rw:r.width,rh:r.height};});if(!info.out.length)return;info.out.sort((a,b)=>a.x-b.x);const b=info.out[0];const sc=Math.min(info.rw/480,info.rh/270),ox=(info.rw-480*sc)/2,oy=(info.rh-270*sc)/2;const sx=info.left+ox+(b.x+44)*sc,sy=info.top+oy+(b.y+14)*sc;await p.mouse.move(sx,sy);await p.mouse.down();await sleep(150);await p.mouse.move(sx+1,sy+1);await p.mouse.up();await sleep(300);}

async function pass(p,pull){const b=await box(p);const X=f=>b.l+b.w*f,Y=f=>b.t+b.h*f;
    await p.mouse.move(X(0.52),Y(0.56));await p.mouse.down();await sleep(650);
    await p.mouse.move(X(pull),Y(0.60),{steps:3});await sleep(120);await p.mouse.up();}
async function run(p){const b=await box(p);const X=f=>b.l+b.w*f,Y=f=>b.t+b.h*f;
    await p.mouse.move(X(0.52),Y(0.56));await p.mouse.down();await sleep(1400);await p.mouse.up();}

// nearest OF name + min distance to the ball, right now
async function ballProbe(page){ return page.evaluate(()=>{
    var all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[];var ball=null;
    for(var i=0;i<all.length;i++){var x=all[i];if(x&&!x._HL2&&x._eE2&&x._eE2._fE2==='obj_ball'){ball=x;break;}}
    if(!ball)return null;
    var best=null,bd=1e12;
    for(var j=0;j<all.length;j++){var p=all[j];if(!p||p._HL2||!p._eE2||p._eE2._fE2!=='obj_playerOF')continue;
        if(!p._7j||p._7j===-4)continue;var dx=p.x-ball.x,dy=p.y-ball.y,d2=dx*dx+dy*dy;
        if(d2<bd){bd=d2;best=p;}}
    var nm='';try{if(best)nm=String(_Ai(best._7j,'lname')||'').toUpperCase();}catch(e){}
    return {kp:Number(ball._kp),dist:Math.round(Math.sqrt(bd)),near:nm};
}); }

(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, { match: true, oppUid: 11 });
        await setEasy(page);
        await page.evaluate(()=>{ try{ window._rb2p_forceUserOffenseDrive(-25); }catch(e){} });
        await sleep(1200);

        for (let n = 0; n < 26; n++) {
            // Start every play from a clean, freshly-spawned offense drive so a
            // turnover/return from the prior play can't pollute the flight metric.
            await page.evaluate(()=>{ try{ window._rb2p_userIsWaitingForOpponent=false; window._rb2p_forceUserOffenseDrive(-25, true); }catch(e){} });
            await sleep(900);
            await setEasy(page);
            let s = await st(page);
            if (s.btn > 0) { await clickBtn(page); await sleep(500); s = await st(page); }
            if (s.kp == null) { await sleep(400); continue; }
            const pre = s, r0 = await roster(page);
            const isPass = n % 2 === 0;
            // sample the ball every ~30ms during the play; STOP once the offense
            // side of the play resolves (caught 5 / picked 9 / tackled 4 / sacked
            // 11) so the flight metric excludes any post-play return.
            let flightMax = 0, catchName = '', tackleName = '', kpseq = [];
            const gesture = isPass ? pass(page, [0.46,0.44,0.42][n%3]) : run(page);
            const sampler = (async () => {
                let resolved = false;
                for (let t = 0; t < 70 && !resolved; t++) {
                    const bp = await ballProbe(page);
                    if (bp) {
                        if (kpseq.length === 0 || kpseq[kpseq.length-1] !== bp.kp) kpseq.push(bp.kp);
                        if (!resolved && bp.dist > flightMax) flightMax = bp.dist;   // only pre-resolution
                        if (bp.kp === 5 && !catchName) catchName = bp.near;
                        if (bp.kp === 4) tackleName = bp.near;
                        if (bp.kp === 4 || bp.kp === 11 || bp.kp === 9) resolved = true;
                    }
                    const cur = await st(page);
                    if (cur.down !== pre.down || cur.waiting !== pre.waiting || cur.btn > 0) break;
                    await sleep(30);
                }
            })();
            await gesture;
            await sampler;
            await sleep(150);
            const post = await st(page), r1 = await roster(page);
            const raB = r1.filter(r=>{const b=r0.find(x=>x.i===r.i);return b&&r.ra>b.ra;}).map(r=>`${r.ln}[p${r.pos}]`);
            const rcB = r1.filter(r=>{const b=r0.find(x=>x.i===r.i);return b&&r.rc>b.rc;}).map(r=>`${r.ln}[p${r.pos}]`);
            let truth = 'n/a';
            if (post.down === pre.down + 1) truth = (pre.ytg - post.ytg) + 'y';
            else if (post.down === 1 && pre.down > 1) truth = '1stDN';
            else if (post.waiting !== pre.waiting) truth = 'TO';
            console.log(`P${n+1} ${isPass?'PASS':'RUN '} flightMax=${String(flightMax).padStart(3)} catch=${(catchName||'-').padEnd(10)} tackle=${(tackleName||'-').padEnd(10)} 6F${pre.f6}->${post.f6} ${truth}`);
            console.log(`     kp[${kpseq.join(',')}]  rushAtt+:${raB.join(',')||'-'}  recv+:${rcB.join(',')||'-'}`);
        }
    } finally { await browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
