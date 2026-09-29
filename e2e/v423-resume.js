// e2e/v423-resume.js — NEVER-FREEZE Phase 2, V423: the last resume gaps.
//
//   R4  (the v2 review #7) a reload inside a PUNT's 4s hold: the page ships the punt it was holding (kept in the
//       tab), the partner gets the ball, and both chains agree — the drive end is not lost with the page
//   R5  (the v2 review #6) a reload after 30s with the screen off while the partner's phone clock runs 2 minutes
//       behind: the phone resumes. V423 adds a server-time "game in progress" signal (the partner's flow record
//       written within 60s); this check is a behavior check only — V422 also resumes here (another of the resume's
//       signals marked the game live), so it does not by itself prove the new signal is needed.
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
const ready = async (P) => until(async () => { const v = await P.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { fresh: v.fresh, who: v.who }; }); return { ok: v.fresh && v.who === 'a', v }; }, 40000, 1000);

(async () => {
    console.log('=== V423 RESUME GAPS ===');

    // ---- R4: a reload inside a punt's hold ----
    {
        const g = await TP.startTwoPlayerGame({});
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
        await ready(A);
        const cons = []; A.page.on('console', m => { const t = m.text(); if (/FLOW shipped|held/.test(t)) cons.push(t.slice(0, 140)); });
        await D.forceDriveEnd(A.page, 'PUNT');                  // held 4s
        await sleep(1200);
        const heldPre = await A.page.evaluate(() => !!sessionStorage.getItem(Object.keys(sessionStorage).find(k => /^rb2p_flowHeld_/.test(k)) || '_none_'));
        await A.page.reload({ waitUntil: 'domcontentloaded' });  // inside the hold
        const bGot = await until(async () => ({ ok: (await waiting(B.page)) === false }), 40000, 1000);
        await sleep(4000);
        const vA = await A.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why, wait: window._rb2p_userIsWaitingForOpponent === true }; });
        const vB = await B.page.evaluate(() => { const v = window._rb2p_flowVerdict(); return { who: v.who, why: v.why }; });
        check('R4 a reload inside a punt\'s hold: the reloaded page ships the punt it was holding; B gets the ball; both chains name B',
              heldPre && bGot.ms !== null && vA.who === 'b' && vB.who === 'b' && vA.wait === true && cons.some(t => /FLOW shipped the PUNT/.test(t)),
              JSON.stringify({ heldPre, bGot: bGot.ms, vA, vB, cons: cons.slice(0, 4) }));
        await g.cleanup();
    }

    // ---- R5: a reload judged "in progress" on the server's clock ----
    {
        const g = await TP.startTwoPlayerGame({});
        const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a;
        await ready(A);
        await D.forceDriveEnd(A.page, 'PUNT');
        await until(async () => ({ ok: (await waiting(B.page)) === false }), 30000, 500);
        // B's phone clock now runs 2 minutes behind (phones in the wild were off by 40s; this makes it unmissable)
        await F.installSeams(B.page, { skewMs: -120000 });
        await B.page.reload({ waitUntil: 'domcontentloaded' });
        await until(async () => ({ ok: await inMatch(B.page) }), 40000, 1000);
        const skewed = await B.page.evaluate(() => window.__rbSkewMs);
        // A's own live pushes stop: its screen goes off for 30s (a frozen page pushes nothing), then it reloads
        const off = await F.screenOff(A.page);
        await sleep(30000);
        // reload while still frozen: a woken page would push a fresh live record first (its own clock would then say
        // "in progress" and the server-time check would not be what decided)
        await A.page.reload({ waitUntil: 'domcontentloaded' }).catch(async () => { await off.undo(); await A.page.reload({ waitUntil: 'domcontentloaded' }); });
        const r5 = await until(async () => ({ ok: await inMatch(A.page) }), 40000, 1000);
        check('R5 a reload after 30s screen-off while the partner\'s clock runs 2 min behind: the phone resumes',
              skewed === -120000 && r5.ms !== null, JSON.stringify({ skewed, r5 }));
        await g.cleanup();
    }

    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
