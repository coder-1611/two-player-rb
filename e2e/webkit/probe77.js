const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await H.ensureServer();
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  await p.goto(H.url(), { waitUntil:'domcontentloaded', timeout:60000 }).catch(()=>{});
  await sleep(9000);
  await H.enterMatch(p, 11);
  await sleep(3000);
  const info = await p.evaluate(() => {
    const out = {};
    // name of object types 71 and 77 via _Ec2._Ue2
    function objName(i){ try { const o=_Ec2._Ue2(i); return o && (o._fE2 || o._51 || o.name || Object.keys(o).slice(0,6)); } catch(e){ return 'err:'+e.message; } }
    out.t71 = objName(71); out.t77 = objName(77);
    // _T51(77) value + census of alive instance type-names
    try { out.T51_77 = _T51(77); } catch(e){ out.T51_77 = 'err'; }
    try {
      const all=(_Sc2&&_Sc2._GL2&&_Sc2._GL2._oq2)||[]; const cnt={};
      for(const x of all){ if(!x||x._HL2||!x._eE2)continue; const n=x._eE2._fE2; cnt[n]=(cnt[n]||0)+1; }
      out.census = cnt;
    } catch(e){ out.census='err:'+e.message; }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
