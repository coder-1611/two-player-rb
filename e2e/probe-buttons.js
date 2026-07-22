// e2e/probe-buttons.js — why do TIMEOUT / CHANGE PLAY (audible) appear on one
// device and not the other?
//
// The engine's own obfuscation map (retrobowl.js head) names the fields:
//     _fj  = year        (on obj 64, the career object)
//     _5F  = timeouts    (on obj 71, the match)
//     _l51 = audibles    (on obj 71)
//     _Ws  = op_matchlength
//
// Match init (retrobowl.js ~1966206):
//     _._l51 = -1
//     _._5F  = clamp(2 + obj64.op_matchlength, 2, 3)
//     obj64.year === 1  &&  (_._5F = 0)          <-- year 1: ZERO timeouts
// Audibles (~1366354):
//     obj71.audibles < 0 && obj64.year > 1  ->  obj71.audibles = 1
// Button creation, s_set_up_play (~1456204):
//     if (obj71.audibles)                     -> create the audible/CHANGE PLAY button
//     if (obj71.down === 4 && obj71.timeouts) -> create the 4th-down button
//
// So both buttons are gated on obj64.year > 1 — exactly the "only after the
// first season" behaviour of stock Retro Bowl. This probe prints what each
// device actually has.

const H = require('./harness');
const TP = require('./two-player');

const READ = () => {
    const out = { err: null };
    try {
        const s = RB.engineState();
        const m = s.rawEngineMatch;
        const o64 = _jj(m, _Sc2, 64);
        out.year        = Number(o64._fj);
        out.week        = Number(o64._cn);
        out.matchLength = Number(o64._Ws);
        out.timeouts    = Number(m._5F);
        out.audibles    = Number(m._l51);
        out.quarter     = Number(m._Wy);
        out.down        = Number(m._t11);
        // Which button objects actually exist on the field right now.
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        const names = {};
        for (const x of inst)
            if (x && !x._HL2 && x._eE2 && x._eE2._fE2)
                names[x._eE2._fE2] = (names[x._eE2._fE2] || 0) + 1;
        out.textObjs = Object.keys(names).filter(n => /text|btn|button/i.test(n))
                             .map(n => n + '×' + names[n]);
        // Predict from the engine's own rules.
        out.predictAudibleBtn = !!out.audibles;
        out.predictTimeoutBtn = out.down === 4 && !!out.timeouts;
    } catch (e) { out.err = String(e); }
    return out;
};

(async () => {
    console.log('=== PROBE: timeout / change-play button gating ===');
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(6000);

    for (const side of [g.a, g.b]) {
        const r = await side.page.evaluate(READ);
        console.log('\n--- device ' + side.label + ' (role ' + side.role + ') ---');
        console.log('  obj64.year        = ' + r.year + (r.year === 1 ? '   <-- season 1: buttons SUPPRESSED' : ''));
        console.log('  obj64.week        = ' + r.week);
        console.log('  obj64.op_matchlength = ' + r.matchLength);
        console.log('  obj71.timeouts    = ' + r.timeouts);
        console.log('  obj71.audibles    = ' + r.audibles);
        console.log('  quarter/down      = Q' + r.quarter + ' down ' + r.down);
        console.log('  audible button expected? ' + r.predictAudibleBtn);
        console.log('  timeout button expected? ' + r.predictTimeoutBtn + ' (needs 4th down)');
        console.log('  field text/button objects: ' + JSON.stringify(r.textObjs));
        if (r.err) console.log('  ERR ' + r.err);
    }

    // Does forcing year > 1 alone restore them on the next play setup?
    console.log('\n--- forcing obj64.year = 2 on device ' + g.a.label + ' and re-running s_set_up_play ---');
    const after = await g.a.page.evaluate((readSrc) => {
        const s = RB.engineState(), m = s.rawEngineMatch;
        const o64 = _jj(m, _Sc2, 64);
        o64._fj = 2;                      // year 2
        m._5F   = 3;                      // timeouts
        m._l51  = 1;                      // audibles
        const setUp = RB.getEngineScript('gml_Script_s_set_up_play');
        if (typeof setUp === 'function') setUp(m, _Sc2, 0);
        return eval('(' + readSrc + ')')();
    }, READ.toString());
    console.log('  timeouts=' + after.timeouts + ' audibles=' + after.audibles +
                ' -> field text/button objects: ' + JSON.stringify(after.textObjs));

    await g.cleanup();
})().catch(e => { console.error('ERR', e); process.exit(2); });
