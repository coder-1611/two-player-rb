// e2e/v506-leave.js — V506: THE LEAVING PENALTY in a real two-player game (two devices: two browser profiles). The owner:
// "add a leaving penalty for pepole who leave first in a ranked game" (the formula: "elo - 0.25(minutes left in int)|point
// differential|"); "make any username with soham in it exempt".
//   L1  one player closes the tab mid-game; the one who stays notes it (the wait cut to 8 s here, 2 minutes live) with the
//       leaver's role and the score and clock when they went
//   L2  the Mac's job (the wait cut to 0 here, 10 minutes live) takes 0.25 x the whole minutes left x the point difference
//       from the leaver — and nothing from a leaver whose name has "soham" in it
const H = require('./harness');
const TP = require('./two-player');
const { execFileSync } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }
const RUN = 'l' + Date.now().toString(36), TROOT = 'rooms/~elotest/' + RUN;

async function game(leaverName) {
    const real = await H.launchBrowser(), ctxB = await real.createBrowserContext(); let n = 0;
    const two = new Proxy(real, { get(t, k) { if (k === 'newPage') return () => (n++ === 0 ? t.newPage() : ctxB.newPage()); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    const g = await TP.startTwoPlayerGame({ browser: two, beforeReady: async (page, role) => {
        await page.evaluate((r) => { window._rb2p_eloQueue = r + '/q'; window._rb2p_eloPath = r + '/pub'; window._rb2p_leaveWaitMs = 8000; }, TROOT);
        if (role === 'a') { await page.evaluate(() => { const m = document.querySelector('.mode-btn[data-mode="same"]'); if (m) m.click(); }); await sleep(1500); }
    } });
    return { g, real };
}

(async () => {
    console.log('=== V506 THE LEAVING PENALTY (' + RUN + ') ===');
    const out = {};
    for (const [label, leaverName] of [['plain', 'Bot B'], ['exempt', 'SohamTest']]) {
        const { g, real } = await game();
        try {
            const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a, code = g.code;
            await sleep(6000);
            // B's name for this game (the exemption reads the room's names); A ahead 14-0 in Q2 at 1:30, 2-minute quarters
            await TP.fbPut('rooms/' + code + '/names/b', leaverName);
            await A.page.evaluate(() => { const em = RB.engineState(); window._rb2p_clockLicence && window._rb2p_clockLicence('test', 3000);
                em.setUserScore(14); em.setOpponentScore(0); window._rb2p_lastStableQuarter = 2; window._rb2p_wireQuarter = 2; window._rb2p_qToppedEver = { 1: true, 2: true }; em.engineQuarter = 2; em.engineMinutesLeft = 1; em.engineSecondsLeft = 30; em.engineTickAllowance = 0;
                window._rb2p_quarterMins = 2; });
            const gk = await A.page.evaluate(() => window._rb2p_gameKey);
            await B.page.close();   // B leaves: its pagehide beacon says so
            const note = await until(async () => { const v = await TP.fbGet(TROOT + '/q/' + code + '_' + gk + '_left'); return { ok: !!(v && v.left), v }; }, 100000, 1500);
            let job = '';
            try {
                job = execFileSync('node', [path.join(__dirname, '..', 'tools', 'elo.js'), '--include-test', '--queue', TROOT + '/q', '--pub', TROOT + '/pub', '--leave-wait-ms', '0',
                    '--state', path.join(os.tmpdir(), 'elo-' + RUN + '-' + label + '.json')], { encoding: 'utf8', timeout: 60000 });
            } catch (e) { job = 'job failed: ' + (e.stdout || '') + (e.stderr || e.message); }
            const st = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'elo-' + RUN + '-' + label + '.json'), 'utf8'));
            out[label] = { note: note.v && note.v.left, res: st.games[code + '_' + gk + '_left'], job: job.trim().split('\n').slice(-1)[0] };
        } finally { try { await g.cleanup(); } catch (e) {} try { await real.close(); } catch (e) {} }
    }
    const p = out.plain || {}, x = out.exempt || {};
    const L = p.note || {};
    check('L1 the player who stays notes the leave: the leaver\'s role, the score and the clock when they went',
          !!(L.role && L.by && L.role !== L.by && Number(L.q) === 2 && Number(L.clk) <= 90 && Number(L.clk) >= 80 && Math.abs(Number(L.su) - Number(L.so)) === 14 && Number(L.qmins) === 2),
          JSON.stringify(p.note));
    const r = p.res || {};
    check('L2 the job takes 0.25 x 5 whole minutes x 14 = 17.5 from the leaver; nothing from a leaver named with soham',
          !!(r.applied && r.minutes === 5 && r.diff === 14 && r.penalty === 17.5 && r.r0 === 1000 && r.r1 === 983) && !!(x.res && !x.res.applied && /soham/.test(x.res.why)),
          JSON.stringify({ plain: r, exempt: x.res, jobs: [p.job, x.job] }));
    try { await TP.fbDelete(TROOT); } catch (e) {}
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
