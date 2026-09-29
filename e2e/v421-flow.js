// e2e/v421-flow.js — NEVER-FREEZE Phase 2, increment A: the per-phone FLOW records (shadow mode).
//
//   F1  both phones publish rooms/{room}/flow/{role} over REST: one game id (B adopts A's), rising seq, epoch K0
//   F2  at the kickoff the rule names A (the opening receiver) on BOTH phones
//   F3  a real drive end: A's record shows the hold in flight, then the send with its causal link (after)
//   F4  once B has applied the hand-off, the rule names B on BOTH phones (B.staged === A.sent.ts)
//   F6  a reload carries on from the phone's own record (same game, staged, seq continues)
//   F5  the rule is a pure function: the chain cases (unapplied, after-links, epochs, holds) on fixtures
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const flowOf = (code, role) => TP.fbGet('rooms/' + code + '/flow/' + role);
const ownOn = page => page.evaluate(() => { const s = window._rb2p_flowState(); const me = s.me, p = s.partner; const role = window._rb2p_myFirebaseRole;
    return window._rb2p_flowOwner(role === 'a' ? me : p, role === 'a' ? p : me); });

(async () => {
    console.log('=== V421 FLOW RECORDS (shadow) ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(9000);
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;

    // ---- F1 ----
    const fa1 = await flowOf(g.code, 'a'); await sleep(6000); const fa2 = await flowOf(g.code, 'a'); const fb = await flowOf(g.code, 'b');
    check('F1 both phones publish flow records: one game id (B adopted A\'s), rising seq, epoch K0',
          fa1 && fa2 && fb && fa2.seq > fa1.seq && /^g\d+$/.test(String(fa2.gid)) && fb.gid === fa2.gid && fa2.ep === 'K0' && fb.ep === 'K0' && typeof fa2.srv === 'number',
          JSON.stringify({ a: fa2 && { gid: fa2.gid, seq: fa2.seq, ep: fa2.ep, srv: fa2.srv }, b: fb && { gid: fb.gid, seq: fb.seq, ep: fb.ep }, seq1: fa1 && fa1.seq }));

    // ---- F2 ----
    const oA = await ownOn(A.page), oB = await ownOn(B.page);
    check('F2 at the kickoff the rule names A (the opening receiver) on BOTH phones', oA.who === 'a' && oB.who === 'a', JSON.stringify({ onA: oA, onB: oB }));

    // ---- F3 + F4: a real drive end (a punt through the engine's own _1c1) ----
    const offIsA = await A.page.evaluate(() => window._rb2p_userIsWaitingForOpponent !== true);
    const off = offIsA ? A : B;
    await D.forceDriveEnd(off.page, 'PUNT');
    await sleep(1500);
    const held = await off.page.evaluate(() => window._rb2p_flowState().me.held);
    let sent = null;
    for (let i = 0; i < 12 && !sent; i++) { await sleep(1000); const st = await off.page.evaluate(() => window._rb2p_flowState().me); if (st.sent && st.sent.type !== 'LAW') sent = st.sent; }
    check('F3 a real drive end: the hold is in flight on the record, then the send carries its causal link',
          !!held && !!sent && sent.ts != null && sent.after === 'E:K0', JSON.stringify({ held, sent }));
    let agree = null;
    for (let i = 0; i < 20; i++) {
        await sleep(1000);
        const a = await ownOn(A.page), b = await ownOn(B.page);
        if (a.who === 'b' && b.who === 'b') { agree = { a, b }; break; }
        agree = { a, b };
    }
    const fbAfter = await flowOf(g.code, 'b');
    check('F4 once B applied the hand-off, the rule names B on BOTH phones (B.staged === A.sent.ts)',
          agree && agree.a.who === 'b' && agree.b.who === 'b' && fbAfter && sent && fbAfter.staged === sent.ts, JSON.stringify({ agree, bStaged: fbAfter && fbAfter.staged, sentTs: sent && sent.ts }));

    // ---- F6: a reload carries on from the phone's own record (not a blank one the partner would ignore) ----
    const preB = await flowOf(g.code, 'b');
    await B.page.reload({ waitUntil: 'domcontentloaded' });
    let postB = null, restoredLine = false;
    for (let i = 0; i < 30; i++) {
        await sleep(2000);
        postB = await flowOf(g.code, 'b');
        if (postB && postB.srv > preB.srv && postB.seq > preB.seq) break;
    }
    try { restoredLine = await B.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('rb2p_diag') || '[]').concat(JSON.parse(sessionStorage.getItem('rb2p_diag') || '[]')).some(l => /FLOW restored/.test(String(l))); } catch (e) { return null; } }); } catch (e) {}
    await sleep(4000);
    const a6 = await ownOn(A.page).catch(() => null), b6 = await ownOn(B.page).catch(() => null);
    check('F6 after a reload the phone carries on from its own record: same game, same staged hand-off, seq continues; the rule still names B on both',
          postB && preB && postB.gid === preB.gid && postB.staged === preB.staged && postB.seq > preB.seq && a6 && b6 && a6.who === 'b' && b6.who === 'b',
          JSON.stringify({ pre: preB && { gid: preB.gid, seq: preB.seq, staged: preB.staged }, post: postB && { gid: postB.gid, seq: postB.seq, staged: postB.staged }, a6, b6, restoredLine }));

    // ---- F5: the rule on fixtures ----
    const F5 = await A.page.evaluate(() => {
        const R = window._rb2p_flowOwner, gid = 'g1';
        const rec = (o) => Object.assign({ gid, ep: 'K0', epRx: 'a', held: null, trust: true }, o);
        const cases = {
            kickoff:   R(rec({ sent: null, staged: 'E:K0' }), rec({ sent: { ts: 'E:K0', after: null }, staged: null })),
            unapplied: R(rec({ sent: { ts: 100, after: 'E:K0' }, staged: 'E:K0' }), rec({ sent: { ts: 'E:K0', after: null }, staged: null })),
            applied:   R(rec({ sent: { ts: 100, after: 'E:K0' }, staged: 'E:K0' }), rec({ sent: { ts: 'E:K0', after: null }, staged: 100 })),
            back:      R(rec({ sent: { ts: 100, after: 'E:K0' }, staged: 200 }), rec({ sent: { ts: 200, after: 100 }, staged: 100 })),
            hold:      R(rec({ sent: { ts: 100, after: 'E:K0' }, staged: 200, held: { since: 1, type: 'PUNT' } }), rec({ sent: { ts: 200, after: 100 }, staged: 100 })),
            halftime:  R(rec({ ep: 'H', epRx: 'b', sent: { ts: 'E:H', after: null }, staged: null }), rec({ sent: { ts: 200, after: 100 }, staged: 100 })),   // b still in K0: normalised to the H start
            otherGame: R(rec({ gid: 'g2', sent: null, staged: 'E:K0' }), rec({ sent: { ts: 'E:K0', after: null }, staged: null })),
            // V422 (the v2 review): a hand-off decided in the first half and shipped after the halftime law is void
            lateHalf:  R(rec({ ep: 'H', epRx: 'b', sent: { ts: 'E:H', after: null }, staged: 555 }), rec({ ep: 'H', epRx: 'b', staged: 'E:H', sent: { ts: 555, after: 'E:H', ep: 'K0' } })),
            // a hand-off its receiver rejected (V208: an engine-AI score) never happened: the sender keeps the ball
            rejected:  R(rec({ sent: { ts: 700, after: 600 }, staged: 600 }), rec({ sent: { ts: 600, after: 'E:K0' }, staged: 'E:K0', rej: 700 })),
            // a record not born at this game's start (a page that joined mid-game) has no chain
            untrusted: R(rec({ sent: null, staged: 'E:K0', trust: false }), rec({ sent: { ts: 'E:K0', after: null }, staged: null })),
        };
        return cases;
    });
    const w = k => F5[k] && F5[k].who;
    check('F5 the rule on fixtures: kickoff→a, unapplied→b (apply), applied→b, back→a, hold→none, halftime→b, other game→none, a first-half hand-off shipped after the law→b (void), a rejected phantom→its sender, untrusted→none',
          w('kickoff') === 'a' && w('unapplied') === 'b' && F5.unapplied.apply === 'b' && w('applied') === 'b' && w('back') === 'a' && w('hold') === null && w('halftime') === 'b' && w('otherGame') === null &&
          w('lateHalf') === 'b' && w('rejected') === 'a' && w('untrusted') === null,
          JSON.stringify(F5));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
