// e2e/v430-sync.js — a phone writes a clock sample every ~15 s (DNSX, ZMCM: the checker needs them to line the two
// phones up; a phone's clock can be corrected mid-game).
//
//   S1  over 50 s of a match, each phone's audit stream has a 'sync' entry (server time beside its own) at least every
//       ~20 s. Since V419 every successful upload restarted the 15 s, so a phone uploading every 1.5 s wrote almost none
//       (DNSX: none in 13 minutes)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V430 CLOCK SAMPLES ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(8000);
    const t0 = await g.a.page.evaluate(() => Date.now());
    await sleep(50000);
    const out = {};
    for (const s of [g.a, g.b]) {
        const st = Object.values(await TP.fbGet('rooms/' + g.code + '/audit/' + s.role) || {}).filter(e => e && e.t >= t0 && e.t <= t0 + 50000);
        const syncs = st.filter(e => e.k === 'sync').map(e => e.t).sort((x, y) => x - y);
        let gap = syncs.length ? syncs[0] - t0 : 50000;
        for (let i = 1; i < syncs.length; i++) gap = Math.max(gap, syncs[i] - syncs[i - 1]);
        gap = Math.max(gap, syncs.length ? t0 + 50000 - syncs[syncs.length - 1] : 50000);
        out[s.role] = { syncs: syncs.length, entries: st.length, maxGapS: Math.round(gap / 1000) };
    }
    check('S1 each phone writes a clock sample at least every ~20 s while it uploads', ['a', 'b'].every(r => out[r].syncs >= 2 && out[r].maxGapS <= 22), JSON.stringify(out));
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
