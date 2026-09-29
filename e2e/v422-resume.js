// e2e/v422-resume.js — NEVER-FREEZE Phase 2: resume, the OT flip and server time.
//
//   S1  every hand-off record carries the server's write time (srv, F27)
//   R2  a reload whose snapshot claims the ball while the flow chain gives it to the partner resumes
//       PARKED — the refused drive is not retried every 50ms, and the refusal is logged a handful of
//       times, not thousands
//   R1  a reload while the socket is open but silent (MSZT's shape): every resume read now gives up after
//       8s and is retried with the room kept (F26: an error in the resume used to forget the room for
//       good), and the game resumes once the socket answers. (On V421 a silent socket hung the resume
//       instead — no deadline, no retry; the forgetting needed a read that REJECTS, e.g. offline.)
//   O1  the OT coin flip lands on the server over REST while the host's socket is offline, and the
//       other phone, also offline, reads it over REST (F24)
//   R3  (the code review #1) a reload inside an interception's hold: the re-sent INT lands on the thrower's REAL
//       chain; the receiver plays, hands back, and the thrower takes the ball — no divergent deadlock
//   H1  (the code review #2) halftime with the parked phone's socket dead: B catches up from A's flow epoch and
//       takes the second half (B learned the horn only from the SDK mirror before)
//   M1  (the code review #5) both phones parked while the authority cannot decide is reported by the monitor
//       ("both parked, no decision") — freeze (b), which no local flag saw
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const F = require('./faults');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const inMatch = page => page.evaluate(() => document.documentElement.classList.contains('rb-in-match') && !!(RB && RB.isEngineInMatchRoom && RB.isEngineInMatchRoom())).catch(() => false);

(async () => {
    console.log('=== V422 RESUME, OT FLIP, SERVER TIME ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
    await until(async () => { const v = await A.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);

    // ---- S1: a hand-off carries the server's write time ----
    await D.forceDriveEnd(A.page, 'PUNT');
    const s1 = await until(async () => { const o = await TP.fbGet('rooms/' + g.code + '/outcomes/a'); return { ok: !!(o && typeof o.srv === 'number' && o.fe === 'K0' && o.fa !== undefined), o: o && { type: o.type, srv: o.srv, fe: o.fe, fa: o.fa } }; }, 20000, 1000);
    check('S1 a hand-off record carries the server\'s write time and its chain (fe, fa)', s1.ms !== null, JSON.stringify(s1));
    await until(async () => ({ ok: (await waiting(B.page)) === false }), 20000, 500);   // B has the ball now

    // ---- R2: a resume the chain refuses comes back parked ----
    // The resume takes "who had the ball" from the per-play snapshot, which can still say "mine" right
    // after a hand-off (it is written between plays). Reproduce that on A's reload.
    await A.page.evaluateOnNewDocument(() => {
        let rsv = null;
        Object.defineProperty(window, '_rb2p_resumeState', { configurable: true,
            get() { return rsv; }, set(v) { rsv = v; if (v && typeof v === 'object') { v.iHaveBall = true; window.__rbResumeClaimed = true; } } });
    });
    const consA = []; A.page.on('console', m => { const t = m.text(); if (/FLOW refused|RESUME/.test(t)) consA.push(t.slice(0, 160)); });
    await A.page.reload({ waitUntil: 'domcontentloaded' });
    const r2 = await until(async () => ({ ok: (await inMatch(A.page)) && (await waiting(A.page)) === true && (await waiting(B.page)) === false }), 40000, 1000);
    await sleep(6000);
    const r2b = { aWait: await waiting(A.page), bWait: await waiting(B.page), claimed: await A.page.evaluate(() => window.__rbResumeClaimed === true).catch(() => null) };
    const refusals = consA.filter(t => /FLOW refused/.test(t)).length;
    const parkedLine = consA.some(t => /RESUME the chain says the partner has the ball/.test(t));
    check('R2 a resume whose snapshot claims the ball while the chain gives it to the partner comes back parked; the partner keeps the ball; the refusal is not retried every 50ms',
          r2.ms !== null && r2b.claimed === true && r2b.aWait === true && r2b.bWait === false && refusals >= 1 && refusals <= 5 && parkedLine,
          JSON.stringify({ r2, r2b, refusals, parkedLine }));

    // ---- R1: a reload while the database is unreachable keeps the room and resumes ----
    // the socket stays OPEN but silent from the first byte (the half-open shape of room MSZT): every read hangs
    await F.installSeams(B.page);
    await B.page.evaluateOnNewDocument(() => { window.__rbWsBlackhole = true; });
    const consB = []; B.page.on('console', m => { const t = m.text(); if (/RESUME/.test(t)) consB.push(t.slice(0, 160)); });
    await B.page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(12000);
    const r1mid = await B.page.evaluate(() => ({ room: sessionStorage.getItem('rb_room'), inMatch: document.documentElement.classList.contains('rb-in-match') })).catch(e => ({ err: String(e.message) }));
    await B.page.evaluate(() => { window.__rbWsBlackhole = false; });
    const r1 = await until(async () => ({ ok: await inMatch(B.page) }), 60000, 1000);
    const failedLine = consB.filter(t => /restore failed/.test(t));
    check('R1 a reload while the database cannot be reached keeps the room and resumes once it is back (F26) — the reads really failed',
          r1mid.room && r1mid.inMatch === false && r1.ms !== null && failedLine.length >= 1, JSON.stringify({ r1mid, r1, failedLine: failedLine.slice(0, 3) }));

    // ---- O1: the OT flip over REST ----
    await sleep(4000);
    await A.page.evaluate(() => { try { window._rb2p_FB.goOffline(window._rb2p_db); } catch (e) {} });
    await B.page.evaluate(() => { try { window._rb2p_FB.goOffline(window._rb2p_db); } catch (e) {} });
    await sleep(1000);
    await A.page.evaluate(() => { window._rb2p_requestOtKickoff(5); });
    const o1 = await until(async () => { const f = await TP.fbGet('rooms/' + g.code + '/ot/p5'); return { ok: !!(f && (f.receiver === 'a' || f.receiver === 'b') && typeof f.srv === 'number'), f }; }, 20000, 1000);
    // (in Q1 the OT coordinator resets its OT state every tick — this runs as if the game were past Q1)
    await B.page.evaluate(() => { RB.engineState().engineQuarter = 2; window._rb2p_otKickoffPending = true; });
    const o1b = await until(async () => ({ ok: await B.page.evaluate(() => Number(window._rb2p_otFlipSeenPeriod) === 5) }), 20000, 1000);
    check('O1 the OT flip reaches the server over REST with the host\'s socket offline, and the other phone reads it over REST (F24)',
          o1.ms !== null && o1b.ms !== null, JSON.stringify({ o1, o1b }));
    await A.page.evaluate(() => { try { window._rb2p_FB.goOnline(window._rb2p_db); } catch (e) {} });
    await B.page.evaluate(() => { try { window._rb2p_FB.goOnline(window._rb2p_db); } catch (e) {} });

    await g.cleanup();

    // ---- R3: a reload inside an interception's hold ----
    {
        const g3 = await TP.startTwoPlayerGame({});
        const A3 = g3.a.role === 'a' ? g3.a : g3.b, B3 = A3 === g3.a ? g3.b : g3.a;
        await until(async () => { const v = await A3.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);
        // one full exchange first, so A's chain holds an earlier send (the deadlock needs one: A's record must
        // say an older send of A's is the last one, while B has staged the re-sent INT)
        await D.forceDriveEnd(A3.page, 'PUNT');
        await until(async () => ({ ok: (await waiting(B3.page)) === false }), 30000, 500);
        await sleep(2500);
        await D.forceDriveEnd(B3.page, 'PUNT');
        await until(async () => ({ ok: (await waiting(A3.page)) === false }), 30000, 500);
        await sleep(2500);
        await A3.page.evaluate(() => { window._rb2p_saveTurnover({ yardLine: -30, isPick6: false }); });   // the INT, saved the instant it happens
        await D.forceDriveEnd(A3.page, 'INT');                                                                 // the hold starts (4s)
        await sleep(1200);
        await A3.page.reload({ waitUntil: 'domcontentloaded' });                                              // inside the hold
        const bGot = await until(async () => ({ ok: (await waiting(B3.page)) === false }), 45000, 1000);
        await sleep(3000);
        await D.forceDriveEnd(B3.page, 'PUNT');
        const aBack = await until(async () => ({ ok: (await waiting(A3.page)) === false && (await waiting(B3.page)) === true }), 40000, 1000);
        await sleep(3000);
        const vA = await A3.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why }; });
        const vB = await B3.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why }; });
        check('R3 a reload inside an interception\'s hold: the re-sent INT gives B the ball, B hands back, A takes it — both chains agree (no divergent deadlock)',
              bGot.ms !== null && aBack.ms !== null && vA.who === 'a' && vB.who === 'a', JSON.stringify({ bGot: bGot.ms, aBack: aBack.ms, vA, vB }));
        await g3.cleanup();
    }

    // ---- H1: halftime with the parked phone's socket dead ----
    {
        const gh = await TP.startTwoPlayerGame({});
        const Ah = gh.a.role === 'a' ? gh.a : gh.b, Bh = Ah === gh.a ? gh.b : gh.a;
        await until(async () => { const v = await Ah.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);
        await Bh.page.evaluate(() => { try { window._rb2p_FB.goOffline(window._rb2p_db); } catch (e) {} const em = RB.engineState(); em.engineQuarter = 2; window._rb2p_lastStableQuarter = 2; });
        await sleep(1500);
        await Ah.page.evaluate(() => { const em = RB.engineState(); window._rb2p_lastStableQuarter = 2; window._rb2p_q3LawApplied = false; if (window._rb2p_clockLicence) window._rb2p_clockLicence('test: halftime', 3000); em.engineQuarter = 3; });
        const h1 = await until(async () => {
            const b = await Bh.page.evaluate(() => ({ wait: window._rb2p_userIsWaitingForOpponent === true, ep: window._rb2p_flowState().me.ep, q: Number(RB.engineState().engineQuarter) }));
            const a = await Ah.page.evaluate(() => ({ wait: window._rb2p_userIsWaitingForOpponent === true, ep: window._rb2p_flowState().me.ep }));
            return { ok: b.wait === false && b.ep === 'H' && a.wait === true && a.ep === 'H', a, b };
        }, 30000, 1000);
        await Bh.page.evaluate(() => { try { window._rb2p_FB.goOnline(window._rb2p_db); } catch (e) {} });
        check('H1 halftime with B\'s socket dead: B catches up from A\'s flow epoch and takes the second half; A is parked', h1.ms !== null, JSON.stringify(h1));
        await gh.cleanup();
    }

    // ---- M1: both parked, no decision ----
    {
        const gm = await TP.startTwoPlayerGame({});
        const Am = gm.a.role === 'a' ? gm.a : gm.b, Bm = Am === gm.a ? gm.b : gm.a;
        await until(async () => { const v = await Am.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);
        // A parks and its epoch moves ahead of B's: the authority stands down on both (an epoch change)
        await Am.page.evaluate(() => { window._rb2p_flowNote('ep', { id: 'H', receiver: 'b' }); window._rb2p_userIsWaitingForOpponent = true; });
        const m1 = await until(async () => { const st = await Am.page.evaluate(() => window._rb2p_canActState()); return { ok: st.must === true && st.can === false && st.why === 'both parked, no decision', st }; }, 20000, 500);
        check('M1 both phones parked while the authority cannot decide: the monitor reports it (must act, cannot: "both parked, no decision")', m1.ms !== null, JSON.stringify(m1));
        await gm.cleanup();
    }

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
