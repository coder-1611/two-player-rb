// pw-verjump.js — smoke-test the version jumper: box present, engine still
// boots (no syntax break from the insert), chip opens the panel, and the
// manifest resolves a typed number to the correct commit SHA + githack URL.
const { webkit } = require('playwright');
const PROJ = '/Users/sohamsthitpragya/Projects/two-player-rb';
const H = require(PROJ + '/e2e/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await H.ensureServer();
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  // engine must still boot — proves the insert didn't break parsing
  let engineOk = false;
  for (let i = 0; i < 30; i++) {
    engineOk = await page.evaluate(() => typeof window.s_play_two_player_match === 'function').catch(() => false);
    if (engineOk) break;
    await sleep(1000);
  }

  const box = await page.evaluate(() => !!document.getElementById('rb-verjump'));
  const myVer = await page.evaluate(() => (document.getElementById('rb-vj-chip') || {}).textContent);

  // open the panel
  await page.evaluate(() => document.getElementById('rb-vj-chip').click());
  const opened = await page.evaluate(() => document.getElementById('rb-verjump').getAttribute('data-open'));

  // resolve a version via the (local) manifest the page serves
  const resolved = await page.evaluate(async () => {
    const j = await (await fetch('versions.json', { cache: 'no-store' })).json();
    return { v259: j['259'], v264: j['264'], v268: j['268'], max: Object.keys(j).reduce((a, b) => Math.max(a, +b), 0) };
  });

  // wait for the manifest to load (panel open triggered it), then ask the
  // exposed builder what URL a typed version resolves to
  let target = null;
  for (let i = 0; i < 20; i++) {
    target = await page.evaluate(() => window._rb2p_verJumpUrl && window._rb2p_verJumpUrl('259'));
    if (target) break;
    await sleep(300);
  }
  const badV = await page.evaluate(() => window._rb2p_verJumpUrl('99999'));

  const vjErrors = errors.filter(e => /verjump|rb-vj|Unexpected|SyntaxError/i.test(e));
  console.log('engine boots:      ', engineOk);
  console.log('box present:       ', box, '| chip:', myVer);
  console.log('panel opened:      ', opened === '1');
  console.log('manifest resolves: ', JSON.stringify(resolved));
  console.log('V259 -> URL:       ', target);
  console.log('bad version -> :   ', badV, '(should be null)');
  console.log('chip after load:   ', await page.evaluate(() => (document.getElementById('rb-vj-chip') || {}).textContent));
  console.log('page errors (vj):  ', vjErrors.length ? vjErrors : 'none');
  console.log('all page errors:   ', errors.length ? errors.slice(0, 3) : 'none');

  const chipTxt = await page.evaluate(() => (document.getElementById('rb-vj-chip') || {}).textContent);
  const pass = engineOk && box && opened === '1' &&
    resolved.v259 && /rawcdn\.githack\.com\/coder-1611\/two-player-rb\/[0-9a-f]{7,}\/index\.html$/.test(target || '') &&
    (target || '').indexOf(resolved.v259) > -1 &&
    badV === null && /^V\d+$/.test(chipTxt || '') &&
    vjErrors.length === 0;
  console.log('VERDICT:', pass ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(pass ? 0 : 3);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
