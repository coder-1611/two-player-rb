// e2e/v336-singleoffense.js — DEQC Bug 8: exactly ONE team on offense, ever.
//
// Room DEQC ended with possession back on the THROWER (b: iHaveBall:true after
// B threw the pick) — the "one side plays, the other waits" rule broke under
// the desync. V336 adds a wire turn record (rooms/{code}/turn — the yielding
// device declares the next owner on every legitimate possession change) and a
// self-healing reconciler: a device that believes it is ON OFFENSE while the
// latest turn record names the OPPONENT (and the conflict persists ~1.5s) is
// forced back to WAIT. The reconciler only ever DEMOTES — it never yanks a
// waiting device onto offense, so PAT cascades and staging flows are untouched.
//
// T1  match start declares a turn owner matching the on-offense role
// T2  a forced DOUBLE-OFFENSE heals within ~3s: the turn-record owner keeps
//     offense, the other device is parked back in WAIT
// T3  a normal single-offense state is left untouched (no spurious demotion)
// T4  after the offense YIELDS (declareTurnOwner -> opponent), the reconciler
//     parks the stale offense side
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const waiting = t => t.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);

(async () => {
    console.log('=== V336 SINGLE-OFFENSE INVARIANT ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);
    const aW = await waiting(g.a), bW = await waiting(g.b);
    const off = aW ? g.b : g.a;
    const def = aW ? g.a : g.b;
    console.log('  start: a.waiting=' + aW + ' b.waiting=' + bW +
                ' -> offense=' + off.role + ' waiting=' + def.role);
    check('setup: exactly one side is on offense', aW !== bW,
          'a=' + aW + ' b=' + bW);

    // ---- T1: the turn record exists and names the on-offense role ----
    const turn1 = await TP.fbGet('rooms/' + g.code + '/turn');
    console.log('  turn = ' + JSON.stringify(turn1));
    check('T1 match start declared the turn owner = the on-offense role',
          turn1 && turn1.owner === off.role, JSON.stringify(turn1));

    // ---- T2: force BOTH onto offense; the non-owner must heal back to WAIT ----
    await def.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = false; });
    await off.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = false; });
    await sleep(4500);   // V339: demote needs the opponent's claim to be NEWER than the take
    const aW2 = await waiting(g.a), bW2 = await waiting(g.b);
    console.log('  after forced double-offense: a.waiting=' + aW2 + ' b.waiting=' + bW2);
    const healedRole = aW2 ? 'a' : (bW2 ? 'b' : null);
    check('T2 the double-offense healed: exactly one side returned to WAIT',
          aW2 !== bW2, 'a=' + aW2 + ' b=' + bW2);
    check('T2 the turn-record owner kept offense; the other side was parked',
          healedRole === def.role, 'parked=' + healedRole + ' expected=' + def.role);

    // ---- T3: a normal single-offense state is untouched ----
    await sleep(5000);
    const aW3 = await waiting(g.a), bW3 = await waiting(g.b);
    console.log('  5s later: a.waiting=' + aW3 + ' b.waiting=' + bW3);
    check('T3 the reconciler leaves a clean single-offense state alone',
          (aW3 !== bW3) && ((aW3 ? 'a' : 'b') === def.role),
          'a=' + aW3 + ' b=' + bW3);

    // ---- T4 (V339 semantics): a turn record ALONE never parks anyone ----
    // The first build demoted off a fresher record with no live opposing
    // claim — on device that parked legitimate drives mid-cascade (the Q3
    // interception "skip"). Now the record must be corroborated by the
    // opponent actually claiming the ball; a bare yield-declare while the
    // opponent stays in WAIT must leave the offense alone.
    await off.page.evaluate((other) => {
        window._rb2p_declareTurnOwner(other, 'test-yield');
    }, def.role);
    await sleep(4000);
    const offW4 = await waiting(off);
    // restore the record to the truth for cleanup symmetry
    await off.page.evaluate((me) => { window._rb2p_declareTurnOwner(me, 'test-restore'); }, off.role);
    console.log('  after bare yield-declare: ' + off.role + '.waiting=' + offW4);
    check('T4 a bare turn record with no live opposing claim does NOT park the offense',
          offW4 === false, off.role + '.waiting=' + offW4);

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
