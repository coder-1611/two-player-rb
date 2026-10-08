// e2e/v519-leave-instant.js — V519 (the owner: "as soon as a player leaves I should get points ... needs to be immediate";
// "make it as if someone won a game"): a real two-device ranked game; one player closes the tab; the rating job in watch
// mode (here on a test queue) — the player who stayed sees "+N RATING TO YOU" within seconds, N = a win's points.
//   I1  the stayer's page notes the leave within 3 s of the tab closing (was 20 s, before that 2 min)
//   I2  the stayer is shown the points within 10 s of the tab closing, and they are a win's points (games +1, wins +1)
const H = require('./harness');
const TP = require('./two-player');
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const RUN = 'i' + Date.now().toString(36), TROOT = 'rooms/~elotest/' + RUN, STATE = path.join(os.tmpdir(), 'elo-' + RUN + '.json');
(async () => {
    console.log('=== V519 A LEAVE PAYS THE STAYER AT ONCE (' + RUN + ') ===');
    const job = spawn('node', [path.join(__dirname, '..', 'tools', 'elo.js'), '--watch', '--include-test', '--queue', TROOT + '/q', '--pub', TROOT + '/pub', '--state', STATE], { stdio: ['ignore', 'pipe', 'pipe'] });
    let jobLog = ''; job.stdout.on('data', d => { jobLog += d; }); job.stderr.on('data', d => { jobLog += d; });
    const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(); let n = 0;
    const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    let g = null;
    try {
        g = await TP.startTwoPlayerGame({ browser: two, beforeReady: async (page, role) => {
            await page.evaluate((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; }, TROOT);
            if (role === 'a') { await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="same"]'); if (m) m.click(); }); await sleep(1500); }
        } });
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
        await sleep(8000);
        const t0 = Date.now();
        await B.page.close();   // the other player leaves
        let noted = 0, shown = 0, gain = 0;
        for (let i = 0; i < 60 && !shown; i++) {
            const s = await A.page.evaluate(() => ({ gain: Number(window._rb2p_leaveGain) || 0, diag: (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : []).filter(l => /ELO the other player left/.test(l)).length }));
            if (s.diag && !noted) noted = Date.now() - t0;
            if (s.gain > 0) { shown = Date.now() - t0; gain = s.gain; }
            await sleep(500);
        }
        const st = JSON.parse(fs.readFileSync(STATE, 'utf8')), res = Object.values(st.games || {}).find(x => x && x.leave) || {};
        const stayer = res.ouid && st.players[res.ouid];
        console.log('  tab closed -> noted ' + (noted / 1000).toFixed(1) + ' s -> points on the stayer\'s screen ' + (shown / 1000).toFixed(1) + ' s (+' + gain + ')');
        check('I1 the stayer\'s page notes the leave within 3 s of the tab closing', noted > 0 && noted <= 3000, JSON.stringify({ notedMs: noted }));
        check('I2 the stayer is shown the points within 10 s, and they are a win\'s points (a game and a win)', shown > 0 && shown <= 10000 && res.won && gain === res.or1 - res.or0 && stayer && stayer.w === 1 && stayer.n === 1,
              JSON.stringify({ shownMs: shown, gain, res: { rule: res.rule, penalty: res.penalty, gain: res.gain, won: res.won }, stayer: stayer && { r: stayer.r, n: stayer.n, w: stayer.w }, job: jobLog.trim().split('\n').slice(-2) }));
    } finally {
        try { job.kill(); } catch (e) {}
        try { if (g) await g.cleanup(); } catch (e) {} try { await real.close(); } catch (e) {}
        try { await TP.fbDelete(TROOT); } catch (e) {} try { fs.unlinkSync(STATE); } catch (e) {}
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
