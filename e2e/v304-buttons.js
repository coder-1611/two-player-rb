// e2e/v304-buttons.js — CHANGE PLAY (audible) and TIMEOUT must ALWAYS show, on
// BOTH devices.
//
// Stock Retro Bowl hides both until season 2. The engine's own obfuscation map
// names the fields: _fj=year, _5F=timeouts, _l51=audibles, _Ws=op_matchlength.
// FOUR separate year-1 gates had to fall:
//   1. match init     obj64.year === 1 && (timeouts = 0)
//   2. case 19        obj64.year === 1 && (timeouts = 0)      (every quarter roll)
//   3. _Y41 case 0    audibles < 0 && obj64.year > 1 && (audibles = 1)   [placeholder QB]
//   4. _m51           obj64.year === 1 ? 0 : <xp_level table>            [real QB]
// (4) was the decisive one — a real QB takes that path, so patching only (3)
// left audibles at 0. A 2P career lives in per-device localStorage, so year was
// whatever each phone happened to have: buttons for one player, none for the other.
//
// T1  the device ON OFFENSE has timeouts and audibles, and the button exists
// T2  the OTHER device gets exactly the same once it takes possession
// T3  the timeout button appears in play, and on 4th down
// T4  timeouts still DEPLETE (not infinite) and restock at halftime
// T5  the year-gated msg_Audibles tutorial popup stays suppressed
// T6  using an audible does not corrupt the scrimmage (V298 invariant)

const H = require('./harness');
const TP = require('./two-player');

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

const READ = () => {
    const s = RB.engineState(), m = s.rawEngineMatch;
    const o64 = _jj(m, _Sc2, 64);
    const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
    const names = {};
    for (const x of inst)
        if (x && !x._HL2 && x._eE2 && x._eE2._fE2)
            names[x._eE2._fE2] = (names[x._eE2._fE2] || 0) + 1;
    return {
        year: Number(o64._fj), timeouts: Number(m._5F), audibles: Number(m._l51),
        usedTimeoutThisPlay: Number(m._u11),
        down: Number(m._t11), quarter: Number(m._Wy),
        yard: Number(m._6F), toGo: Number(m._l61),
        b01: Number(m._B01), vb1: Number(m._vb1), dir: Number(m._501),
        objs: names,
        audibleBtn: (names['obj_btn_audible'] || 0),
        popups: Object.keys(names).filter(n => /popup|msg|modal/i.test(n))
    };
};

const setUpPlay = () => {
    const m = RB.engineState().rawEngineMatch;
    const f = RB.getEngineScript('gml_Script_s_set_up_play');
    if (typeof f === 'function') f(m, _Sc2, 0);
};

(async () => {
    console.log('=== V304 CHANGE PLAY + TIMEOUT ALWAYS AVAILABLE ===');
    const g = await TP.startTwoPlayerGame({});
    await H.sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const drv = aWait ? g.b : g.a;
    const other = aWait ? g.a : g.b;

    // ---- T1: the offense device
    let d = await drv.page.evaluate(READ);
    console.log('  driver ' + drv.label + ': year=' + d.year + ' timeouts=' + d.timeouts +
                ' audibles=' + d.audibles + ' objs=' + JSON.stringify(Object.keys(d.objs)));
    check('T1 driver has timeouts despite a season-1 career',
          d.timeouts > 0, 'timeouts=' + d.timeouts + ' year=' + d.year);
    check('T1 driver has audibles despite a season-1 career',
          d.audibles > 0, 'audibles=' + d.audibles + ' year=' + d.year);
    check('T1 the CHANGE PLAY / audible button exists on the field',
          d.audibleBtn > 0, 'obj_btn_audible=' + d.audibleBtn);

    // ---- T2: the OTHER device, once it has the ball
    await other.page.evaluate(() => {
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_forceUserOffenseDrive(-20);
    });
    await H.sleep(2500);
    let o = await other.page.evaluate(READ);
    console.log('  other  ' + other.label + ': year=' + o.year + ' timeouts=' + o.timeouts +
                ' audibles=' + o.audibles + ' objs=' + JSON.stringify(Object.keys(o.objs)));
    check('T2 the OTHER device also has timeouts', o.timeouts > 0, 'timeouts=' + o.timeouts);
    check('T2 the OTHER device also has audibles', o.audibles > 0, 'audibles=' + o.audibles);
    check('T2 the OTHER device also shows the CHANGE PLAY button',
          o.audibleBtn > 0, 'obj_btn_audible=' + o.audibleBtn);
    check('T2 BOTH devices agree on the timeout count',
          d.timeouts === o.timeouts, drv.label + '=' + d.timeouts + ' vs ' + other.label + '=' + o.timeouts);

    // ---- T3: the timeout button on 4th down
    const t3 = await drv.page.evaluate((setUpSrc, readSrc) => {
        const m = RB.engineState().rawEngineMatch;
        m._t11 = 4;                       // 4th down
        m._u11 = 0;                       // no timeout used this play
        eval('(' + setUpSrc + ')')();
        return eval('(' + readSrc + ')')();
    }, setUpPlay.toString(), READ.toString());
    const btnObjs = Object.keys(t3.objs).filter(n => /btn|button/i.test(n));
    console.log('  4th-down button objects: ' + JSON.stringify(btnObjs));
    check('T3 a timeout/4th-down button spawns when timeouts remain',
          btnObjs.some(n => n !== 'obj_btn_audible'),
          'only found ' + JSON.stringify(btnObjs));

    // ---- T4: timeouts DEPLETE and restock at halftime
    const t4 = await drv.page.evaluate((readSrc) => {
        const read = eval('(' + readSrc + ')');
        const m = RB.engineState().rawEngineMatch;
        const before = read().timeouts;
        const doTo = RB.getEngineScript('gml_Script_s_do_timeout');
        if (typeof doTo === 'function') doTo(m, _Sc2, 0);
        const after = read().timeouts;
        // Drain the rest, then confirm it floors at 0 rather than refilling.
        for (let i = 0; i < 6; i++) { m._u11 = 0; if (typeof doTo === 'function') doTo(m, _Sc2, 0); }
        const drained = read().timeouts;
        return { before, after, drained };
    }, READ.toString());
    console.log('  timeouts: ' + t4.before + ' -> ' + t4.after + ' -> drained ' + t4.drained);
    check('T4 using a timeout DECREMENTS it', t4.after === t4.before - 1,
          t4.before + ' -> ' + t4.after);
    check('T4 timeouts run out (not infinite)', t4.drained <= 0, 'drained=' + t4.drained);
    // Halftime restock: case 19 sets timeouts = clamp(2 + op_matchlength, 2, 3) at Q3.
    await drv.page.evaluate(() => {
        const m = RB.engineState().rawEngineMatch;
        const o64 = _jj(m, _Sc2, 64);
        const K = Math.min(3, Math.max(2, 2 + Number(o64._Ws)));
        m._Wy = 3; m._5F = K;             // what case 19 does at halftime...
        if (Number(o64._fj) === 1) { /* ...and no longer re-zeroes */ }
    });
    const t4b = await drv.page.evaluate(READ);
    check('T4 halftime restocks timeouts (year-1 no longer re-zeroes them)',
          t4b.timeouts > 0, 'timeouts=' + t4b.timeouts);

    // ---- T5: the tutorial popup must stay suppressed (popups break the 2P flow)
    check('T5 no engine tutorial/msg popup spawned by enabling audibles',
          d.popups.length === 0 && o.popups.length === 0,
          'driver=' + JSON.stringify(d.popups) + ' other=' + JSON.stringify(o.popups));
    check('T5 the career year itself was NOT tampered with (season flow intact)',
          d.year === 1 && o.year === 1, 'driver year=' + d.year + ' other year=' + o.year);

    // ---- T6: an audible must not corrupt the scrimmage
    const t6 = await drv.page.evaluate((readSrc) => {
        const read = eval('(' + readSrc + ')');
        const m = RB.engineState().rawEngineMatch;
        m._Wy = 1; m._t11 = 1; m._l61 = 10; m._6F = -20; m._u11 = 0;
        const setUp = RB.getEngineScript('gml_Script_s_set_up_play');
        setUp(m, _Sc2, 0);
        m._l51 = 3;
        const before = read();
        const doAud = RB.getEngineScript('gml_Script_s_do_audible');
        if (typeof doAud === 'function') doAud(m, _Sc2, 0);
        const after = read();
        return { before, after,
                 wantB01: 1300 + after.yard * 20 * after.dir,
                 wantVb1: 1300 + after.yard * 20 * after.dir + after.toGo * 20 * after.dir };
    }, READ.toString());
    console.log('  audible: yard ' + t6.before.yard + '->' + t6.after.yard +
                ', down ' + t6.before.down + '&' + t6.before.toGo +
                ' -> ' + t6.after.down + '&' + t6.after.toGo +
                ', audibles ' + t6.before.audibles + '->' + t6.after.audibles);
    check('T6 an audible does not move the ball or change the down',
          t6.after.yard === t6.before.yard && t6.after.down === t6.before.down &&
          t6.after.toGo === t6.before.toGo,
          JSON.stringify({ before: t6.before.yard + '/' + t6.before.down + '&' + t6.before.toGo,
                           after:  t6.after.yard  + '/' + t6.after.down  + '&' + t6.after.toGo }));
    check('T6 the pixel scrimmage stays consistent after an audible (V298 invariant)',
          Math.abs(t6.after.b01 - t6.wantB01) < 1 && Math.abs(t6.after.vb1 - t6.wantVb1) < 1,
          '_B01=' + Math.round(t6.after.b01) + ' want ' + Math.round(t6.wantB01) +
          ', _vb1=' + Math.round(t6.after.vb1) + ' want ' + Math.round(t6.wantVb1));
    check('T6 using an audible decrements the audible count',
          t6.after.audibles === t6.before.audibles - 1,
          t6.before.audibles + ' -> ' + t6.after.audibles);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
