// probe-lobby-rects.js — render the mobile lobby at the PHONE's aspect and print
// on-screen center fractions (fx,fy) of controls + calibration anchors I can see
// in the mirror (PLAY 2P, SAME/DIFFERENT, VIEW ROSTER), so I can solve the
// fraction->mirror-point mapping and tap join/ready exactly.
const { webkit } = require('playwright');
const H = require('/Users/sohamsthitpragya/Projects/two-player-rb/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VW = 390, VH = 662;   // ~phone game viewport (Safari chrome reduces height)
(async () => {
  await H.ensureServer();
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  await p.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false)) break; await sleep(1000); }
  await sleep(1500);
  const frac = (sel, byId) => `(() => { const el = ${byId ? "document.getElementById('"+sel+"')" : "document.querySelector(\""+sel+"\")"}; if(!el) return null; const r=el.getBoundingClientRect(); return {fx:+((r.x+r.width/2)/innerWidth).toFixed(3), fy:+((r.y+r.height/2)/innerHeight).toFixed(3), vis:r.width>0}; })()`;
  const entry = await p.evaluate(() => {
    const g = (el) => { if(!el) return null; const r=el.getBoundingClientRect(); return {fx:+((r.x+r.width/2)/innerWidth).toFixed(3), fy:+((r.y+r.height/2)/innerHeight).toFixed(3), vis:r.width>0}; };
    return {
      play2p: g(document.getElementById('rb-play2p')),
      roomInput: g(document.getElementById('rb-room-input')),
      join: g(document.getElementById('rb-join')),
      same: g(document.querySelector('[data-mode="same"]')),
      different: g(document.querySelector('[data-mode="different"]')),
    };
  });
  console.log('ENTRY @'+VW+'x'+VH+':', JSON.stringify(entry));
  await p.evaluate(() => document.getElementById('rb-play2p').click());
  await sleep(2500);
  const room = await p.evaluate(() => {
    const g = (el) => { if(!el) return null; const r=el.getBoundingClientRect(); return {fx:+((r.x+r.width/2)/innerWidth).toFixed(3), fy:+((r.y+r.height/2)/innerHeight).toFixed(3), vis:r.width>0}; };
    return {
      ready: g(document.getElementById('rb-ready')),
      leave: g(document.getElementById('rb-leave')),
      viewRoster: g(document.getElementById('rb-view-roster')),
      defMax: g(document.querySelector('[data-dif="max"]')),
      qtr2: g(document.querySelector('[data-len="2"]')),
      slotA: g(document.getElementById('rb-slot-a')),
    };
  });
  console.log('ROOM  @'+VW+'x'+VH+':', JSON.stringify(room));
  await b.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
