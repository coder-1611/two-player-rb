// e2e/v425-ot-resume.js — the deadlocks behind VVLQ and the rematch phantoms (2026-09-30).
//
//   V4  a phone PLAYING its drive is not parked for a hand-off the partner has not taken (the chain said "a->b
//       unapplied" for a hand-off that never existed: V424 parked A in 2s, B could not apply it — both parked)
//   V3  overtime, both phones parked, the flow chain gives the ball to S while the turn record names R (VVLQ: a reload
//       rewrote it): V424's R rescue was refused by the force-drive guard and S waited for the turn record — for good.
//       Now the guard is shadow: the older rescuer acts and one phone has the ball within 30s.
//   V1  a reload mid-game is not a match start: A's resume no longer writes "the turn is a's (match-start)"
//   V2  a reload mid-overtime does not apply the current period's coin flip again (VVLQ: it staged A as the receiver
//       of a period half played)
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 500); } return Object.assign(v || {}, { ms: null }); }
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const verdict = page => page.evaluate(() => { try { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why, fresh: v.fresh, apply: v.apply || null }; } catch (e) { return null; } }).catch(() => null);

(async () => {
    console.log('=== V425 OT / RESUME DEADLOCKS ===');
    const g = await TP.startTwoPlayerGame({});
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
    const logs = { a: [], b: [] };
    for (const s of [A, B]) s.page.on('console', m => { const t = m.text(); if (/RECOVER|TURN-|OT\]|OT flip|FLOW|POSS ->|lost/.test(t)) logs[s.role].push(t.slice(0, 160)); });
    await until(async () => { const v = await verdict(A.page); return { ok: v && v.fresh && v.who === 'a', v }; }, 40000, 1000);

    // ---- V4: a hand-off the partner cannot take does not park the phone playing ----
    {
        const mark = logs.a.length;
        await A.page.evaluate(() => { window._rb2p_flowNote('send', { ts: Date.now() - 1000, type: 'PUNT' }); });   // a hand-off that is on no server
        await sleep(14000);                                                                                        // 2s park, 3 looks
        const parked = logs.a.slice(mark).filter(t => /RECOVER park/.test(t));
        const wA = await waiting(A.page);
        check('V4 a phone playing its drive is not parked for a hand-off the partner never took (it plays on)', parked.length === 0 && wA === false, JSON.stringify({ parked, wA, v: await verdict(A.page) }));
        // put the chain right again: A's opening drive continues — a real hand-off supersedes the phantom
        await D.forceDriveEnd(A.page, 'PUNT');
        await until(async () => ({ ok: (await waiting(B.page)) === false }), 25000, 500);
        await D.forceDriveEnd(B.page, 'PUNT');
        await until(async () => ({ ok: (await waiting(A.page)) === false }), 25000, 500);
        await sleep(3000);
    }

    // ---- overtime ----
    for (const s of [A, B]) await s.page.evaluate(() => {
        const em = RB.engineState();
        window._rb2p_clockLicence && window._rb2p_clockLicence('test');
        em.setUserScore(14); em.setOpponentScore(14);
        window._rb2p_lastStableQuarter = 5; window._rb2p_wireQuarter = 5; em.engineQuarter = 5;
        em.engineMinutesLeft = 3; em.engineSecondsLeft = 0;
    });
    const flip = await until(async () => {
        const [wa, wb] = [await waiting(A.page), await waiting(B.page)];
        const ot = await A.page.evaluate(() => window._rb2p_inOvertime === true);
        return { ok: ot && wa !== wb && wa !== null && wb !== null, wa, wb };
    }, 40000, 1000);
    const Rcv = flip.wa === false ? A : B, Snd = Rcv === A ? B : A;
    console.log('  overtime: receiver = ' + Rcv.role);
    await sleep(4000);

    // ---- V3: the chain names S, the turn record names R, both parked ----
    {
        await D.forceDriveEnd(Rcv.page, 'PUNT');                            // R hands the ball to S
        await until(async () => ({ ok: (await waiting(Snd.page)) === false }), 25000, 500);
        await sleep(5000);                                                   // both records published: S staged R's punt
        const mark = logs[Snd.role].length;
        await Snd.page.evaluate(() => { window._rb2p_userIsWaitingForOpponent = true; });                     // S parked
        await Rcv.page.evaluate(() => { window._rb2p_declareTurnOwner('ME', 'test: a reload rewrote it'); });   // the turn record: R
        // V425: the chain is shadow — the older rescuer follows the turn record; what must hold is NO DEADLOCK
        const took = await until(async () => { const ws = await waiting(Snd.page), wr = await waiting(Rcv.page); return { ok: ws !== wr && ws !== null && wr !== null, ws, wr }; }, 30000, 1000);
        const vS = await verdict(Snd.page);
        check('V3 (V425) overtime, both parked, the chain and the turn record disagree: within 30s exactly one phone has the ball (no deadlock)',
              took.ms !== null, JSON.stringify({ ms: took.ms, ws: took.ws, wr: took.wr, vS, S: logs[Snd.role].slice(mark).slice(-6) }));
        await sleep(3000);
    }

    // ---- V1 / V2: A reloads mid-overtime ----
    {
        const turnBefore = await TP.fbGet('rooms/' + g.code + '/turn');
        const mark = logs.a.length;
        await A.page.reload({ waitUntil: 'domcontentloaded' });
        await until(async () => ({ ok: await A.page.evaluate(() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => false) }), 45000, 1000);
        await sleep(10000);
        const after = logs.a.slice(mark);
        const turnAfter = await TP.fbGet('rooms/' + g.code + '/turn');
        const matchStart = after.filter(t => /TURN-> a \(match-start\)/.test(t));
        check('V1 a reload mid-game is not a match start: no "match-start" turn written', matchStart.length === 0 && !(turnAfter && turnAfter.why === 'match-start'),
              JSON.stringify({ matchStart, turnBefore, turnAfter }));
        const reapplied = after.filter(t => /applying p5/.test(t)), skipped = after.filter(t => /OT flip p5 already played/.test(t));
        check('V2 a reload mid-overtime does not apply the current period\'s coin flip again', reapplied.length === 0 && skipped.length >= 1,
              JSON.stringify({ reapplied, skipped, after: after.slice(0, 12) }));
    }

    for (const s of [A, B]) await s.page.evaluate(() => { window._rb2p_gameOverReported = true; }).catch(() => {});
    if (fail) { console.log('\n--- A ---\n' + logs.a.slice(-30).join('\n')); console.log('\n--- B ---\n' + logs.b.slice(-30).join('\n')); }
    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
