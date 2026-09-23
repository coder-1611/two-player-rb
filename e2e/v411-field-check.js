// e2e/v411-field-check.js — at least one team is always on the field.
//
//   F1  I wait and the opponent's live push says they have the ball: nothing to fix
//   F2  both waiting, the turn is mine: the first check notes it, the second (10s later) puts my team on the field at their last spot
//   F3  both waiting, the turn is theirs and their phone is alive: I leave it to their check
//   F4  both waiting, the turn is theirs but their phone has been silent 30s+: I take the ball and claim the turn
//   F5  a real game where both phones are parked with nobody on the field recovers within ~20s, and no END GAME button exists
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V411 FIELD CHECK ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    const r = await def.page.evaluate((role) => {
        const other = role === 'a' ? 'b' : 'a';
        const calls = [], turns = [];
        const realF = window._rb2p_forceUserOffenseDrive, realS = window._rb2p_oppSilentMs, realT = window._rb2p_declareTurnOwner;
        window._rb2p_forceUserOffenseDrive = (y, fresh) => { calls.push({ y, fresh }); return true; };
        window._rb2p_declareTurnOwner = (o, w) => { turns.push(o + ':' + w); };
        const reset = () => { window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = 0; window._rb2p_deferredOutcome = null; if (window._twoPlayer && window._twoPlayer.pending) window._twoPlayer.pending.length = 0; };
        const out = {};
        // F1
        reset(); window._rb2p_oppSilentMs = () => 0;
        window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: true }; window._rb2p_turnRec = { owner: other, at: Date.now() };
        out.f1 = [window._rb2p_fieldCheck(), window._rb2p_fieldCheck(), calls.length];
        // F2
        reset(); window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: false, yardLine: 3.64 }; window._rb2p_turnRec = { owner: role, at: Date.now() - 20000 };
        out.f2 = [window._rb2p_fieldCheck(), window._rb2p_fieldCheck(), JSON.stringify(calls.slice(-1)), calls.length];
        // F3
        reset(); const c3 = calls.length; window._rb2p_oppLiveRx = { at: Date.now(), iHaveBall: false, yardLine: 3.64 }; window._rb2p_turnRec = { owner: other, at: Date.now() };
        out.f3 = [window._rb2p_fieldCheck(), window._rb2p_fieldCheck(), calls.length - c3];
        // F4
        reset(); const c4 = calls.length; window._rb2p_oppSilentMs = () => 40000; window._rb2p_oppLiveRx = { at: Date.now() - 40000, iHaveBall: false, yardLine: -12 };
        out.f4 = [window._rb2p_fieldCheck(), window._rb2p_fieldCheck(), calls.length - c4, turns.join(',')];
        window._rb2p_forceUserOffenseDrive = realF; window._rb2p_oppSilentMs = realS; window._rb2p_declareTurnOwner = realT;
        window._rb2p_userIsWaitingForOpponent = true;
        return out;
    }, def.role);
    check('F1 the opponent is on the field: nothing to fix', /opponent is on the field/.test(r.f1[1]) && r.f1[2] === 0, JSON.stringify(r.f1));
    check('F2 turn mine, nobody on the field: check 1 notes it, check 2 puts my team on at their last spot', /check 1/.test(r.f2[0]) && /fixed/.test(r.f2[1]) && /"y":3.64,"fresh":true/.test(r.f2[2]), JSON.stringify(r.f2));
    check('F3 turn theirs and their phone is alive: left to their check', /their check takes it/.test(r.f3[1]) && r.f3[2] === 0, JSON.stringify(r.f3));
    check('F4 turn theirs but their phone is silent 30s+: I take the ball at their last spot and claim the turn', (/fixed/.test(r.f4[0]) || /fixed/.test(r.f4[1])) && r.f4[2] === 1   /* the empty count carries from F3: still nobody on the field */ && /ME:field-check/.test(r.f4[3]), JSON.stringify(r.f4));

    // ---- F5: a real stuck state (both parked, nobody on the field) recovers on its own ----
    await off.page.evaluate(() => {
        window._rb2p_diagLog('F5-START');
        window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = 0; window._rb2p_lastSentOutcome = null;
        window._rb2p_declareTurnOwner('ME', 'test: turn is mine, then my phone parks');
    });
    await def.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; window._rb2p_lastSentOutcomeMs = 0; });
    let live = null; const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
        await sleep(1000);
        const s = await Promise.all([off.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true), def.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true)]);
        if (s[0] || s[1]) { live = { offLive: s[0], defLive: s[1], secs: Math.round((Date.now() - t0) / 1000) }; break; }
    }
    const tail = await off.page.evaluate(() => { const d = String(window._rb2p_readDiagLog()); return d.slice(d.lastIndexOf('F5-START')); });
    const noEnd = await def.page.evaluate(() => !document.getElementById('rb-end-game'));
    check('F5 a real game parked with nobody on the field puts a team back on within 30s; no END GAME button', !!live && live.secs <= 30 && noEnd, JSON.stringify({ live, noEnd, tail: tail.slice(-260) }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
