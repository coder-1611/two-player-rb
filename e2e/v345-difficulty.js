// e2e/v345-difficulty.js — SHARED difficulty must actually be shared.
//
// Device report (room USFR, V344): role B's badge showed DIF:MAX(SAME) while
// role A was playing on EASY — "same difficulty" mode, two different
// difficulties. Root cause: config/sharedDifficulty was written ONLY by
// explicit clicks (a DEFENSE button while in SAME mode, or the SAME mode
// button itself). Two devices that RESTORED mode='same' from localStorage
// (no click this session) never wrote it, the subscription's `if (v && ...)`
// never fired, and each device silently kept its OWN local rb2p_difficulty.
// V345: role A seeds config/sharedDifficulty from its local pick when absent
// (the quarterMins/diffMode pattern) and a value seen while still in
// 'different' is remembered and adopted on the flip into SAME.
//
// Repro needs two ISOLATED localStorage universes (two phones), so this test
// runs TWO browser instances — the shared-profile two-tab harness would let
// one page's localStorage write bleed into the other and mask the bug.
//
// T1  both pages end in SAME mode
// T2  both pages' rb2p_difficulty converge on the host's pick ('easy')
// T3  rooms/{code}/config/sharedDifficulty was seeded ('easy' in Firebase)
// T4  both in-match badges show DIF:EASY(SAME) (the USFR symptom, healed)
// T5  computeDefenseAggression on BOTH pages is in the easy band (neither -5)
// T6  (opportunistic) a page whose engine _001 got applied matches its agg
const H = require('./harness');
const TP = require('./two-player');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// Seed localStorage the way a REAL prior session would have, then reboot the
// page so the closure state (currentDiffMode etc.) initializes from it — the
// exact "restored SAME mode, no click this session" shape from the USFR game.
async function seedAndReboot(entry, kv) {
    await entry.page.evaluate(m => { for (const k in m) localStorage.setItem(k, m[k]); }, kv);
    await entry.page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await H.sleep(Number(process.env.RB_E2E_BOOT_MS || 9000));
    const ok = await TP.waitFor(entry.page,
        () => typeof window.s_play_two_player_match === 'function', 20000);
    if (!ok) throw new Error('[' + entry.label + '] engine never came back after seed+reload');
}

const readDiff = () => ({
    pref: (localStorage.getItem('rb2p_difficulty') || 'max'),
    mode: window._rb2p_diffMode,
    agg: (function () { try { return window._rb2p_computeDefenseAggression(); } catch (e) { return null; } })(),
    applied: (function () { try { var s = RB.engineState(); return s ? s.engineDefenseAggression : null; } catch (e) { return null; } })(),
    waiting: window._rb2p_userIsWaitingForOpponent === true,
    badge: ((document.getElementById('rb-fb-badge') || {}).textContent || '')
});

(async () => {
    console.log('=== V345 SHARED DIFFICULTY ACTUALLY SHARED (SAME mode converges) ===');
    await H.ensureServer();
    const browserA = await H.launchBrowser();
    const browserB = await H.launchBrowser();
    const code = TP.randomCode();
    await TP.deleteRoom(code);
    try {
        const a = await TP.openLobbyPage(browserA, 'A', {});
        const b = await TP.openLobbyPage(browserB, 'B', {});
        // Phone A last played on EASY, phone B on MAX; BOTH had SAME mode
        // persisted. Nobody touches a settings button this session.
        await seedAndReboot(a, { rb2p_difficulty: 'easy', rb2p_diff_mode: 'same' });
        await seedAndReboot(b, { rb2p_difficulty: 'max',  rb2p_diff_mode: 'same' });

        a.role = await TP.hostRoom('A', a.page, code);
        b.role = await TP.joinRoom('B', b.page, code);

        // Convergence is a lobby-time affair (the config subscriptions arm in
        // enterRoom) — B should adopt the host-seeded value before kickoff.
        const converged = await TP.waitFor(b.page,
            () => localStorage.getItem('rb2p_difficulty') === 'easy', 15000);
        if (!converged) console.log('  (B never adopted the shared value in the lobby — expect FAILs)');

        await TP.readyUp('A', a.page);
        await TP.readyUp('B', b.page);
        await TP.waitForMatch('A', a.page);
        await TP.waitForMatch('B', b.page);
        await H.sleep(2500);   // let the badge tick + any late config echo settle

        const dA = await a.page.evaluate(readDiff);
        const dB = await b.page.evaluate(readDiff);
        console.log('  A: ' + JSON.stringify(dA));
        console.log('  B: ' + JSON.stringify(dB));

        check('T1 both pages in SAME mode', dA.mode === 'same' && dB.mode === 'same',
              'A=' + dA.mode + ' B=' + dB.mode);
        check('T2 difficulty prefs converged on the host pick (easy)',
              dA.pref === 'easy' && dB.pref === 'easy',
              'A=' + dA.pref + ' B=' + dB.pref + ' (the USFR split)');
        const shared = await TP.fbGet('rooms/' + code + '/config/sharedDifficulty');
        check('T3 config/sharedDifficulty seeded in Firebase', shared === 'easy',
              'got ' + JSON.stringify(shared));
        check('T4 both badges show DIF:EASY(SAME)',
              dA.badge.indexOf('DIF:EASY(SAME)') !== -1 && dB.badge.indexOf('DIF:EASY(SAME)') !== -1,
              'A="' + dA.badge + '" B="' + dB.badge + '"');
        // The per-play applier (forceUserOffenseDrive) writes _001 from
        // computeDefenseAggression() — easy is base 7 nudged by the opponent's
        // D rating; max is EXACTLY -5. Neither page may be sitting on -5.
        check('T5 computeDefenseAggression in the easy band on both (neither -5/max)',
              typeof dA.agg === 'number' && typeof dB.agg === 'number' && dA.agg > 0 && dB.agg > 0,
              'A=' + dA.agg + ' B=' + dB.agg);
        // Opportunistic: the page that OWNS the drive has had forceUserOffenseDrive
        // write _001; its live register must equal that page's computed aggression.
        // (The WAITING side's _001 is whatever native match init left — e.g. 10 —
        // until it gets an offense drive of its own, so it proves nothing here.)
        const appliedSeen = [dA, dB].filter(d => !d.waiting && typeof d.applied === 'number' && d.applied !== 0);
        if (appliedSeen.length)
            check('T6 applied engine _001 matches computeDefenseAggression',
                  appliedSeen.every(d => Math.abs(d.applied - d.agg) < 1e-9),
                  JSON.stringify(appliedSeen.map(d => [d.applied, d.agg])));
        else
            console.log('  (T6 skipped — no play setup had applied _001 yet; T2/T5 cover the input it reads)');
    } finally {
        try { await browserA.close(); } catch (e) {}
        try { await browserB.close(); } catch (e) {}
        await TP.deleteRoom(code);
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
