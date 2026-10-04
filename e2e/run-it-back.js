// e2e/run-it-back.js — V454: RUN IT BACK on the stats screen starts the next game on the same code.
// The owner: "when a game is over, there is a button on the stats screen saying run it back, and this should be
// prominent and this button starts the game again on same code".
//   R1  both stats screens show RUN IT BACK — on the first screen, the biggest button there (and on a phone's
//       landscape screen too, without scrolling)
//   R2  A taps it: A's page comes back to the SAME room with its seat READY — nobody pressed READY on that page
//   R3  B's stats screen says A wants to run it back
//   R4  B taps it: the next game starts on both phones in the same room (a second games/ entry, a GAME-START on each),
//       Q1 with a full clock, 0-0, exactly one phone with the ball
//   B1  (RIB_BOTH=1) both tap within a second: the next game starts on both, no guard reload
//   R5  the start was clean: no READY-guard reload into a resume (V452), no score or quarter carried from game 1, and
//       game 2's first hand-off is applied by the other phone itself (not dropped as moot, no rescuer)
// Game 1 is a real 2P game that runs 65 s (as v432-rematch-join: a real game lasts minutes), then ends by the engine's own
// final path (a decided horn on the phone with the ball).
const H = require('./harness');
const TP = require('./two-player');
const D = require('./scenario');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function until(fn, ms, every) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v && v.ok) return Object.assign(v, { ms: Date.now() - t0 }); await sleep(every || 400); } return Object.assign(v || {}, { ms: null }); }
const inMatch = page => page.evaluate(() => { try { return document.documentElement.classList.contains('rb-in-match') && RB.isEngineInMatchRoom() === true; } catch (e) { return false; } }).catch(() => null);
const finalShown = page => page.evaluate(() => { const f = document.getElementById('rb-final'); return !!(f && f.style.display === 'block'); }).catch(() => false);
const lobbyRoom = page => page.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); }).catch(() => false);
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const diag = page => page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '');
const st = page => page.evaluate(() => { try { const s = RB.engineState(); return { q: Number(s.engineQuarter), clk: Number(s.engineMinutesLeft) * 60 + Number(s.engineSecondsLeft), su: Number(s.userScore), so: Number(s.opponentScore), wait: window._rb2p_userIsWaitingForOpponent === true }; } catch (e) { return null; } }).catch(() => null);
// the stats screen's buttons, as a player sees them
const finalButtons = page => page.evaluate(() => {
    const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height), font: parseFloat(cs.fontSize), text: e.textContent.trim() }; };
    const sc = document.querySelector('#rb-final .rb-scroll');
    return { vw: innerWidth, vh: innerHeight, scrollTop: sc ? sc.scrollTop : null, again: r('rb-final-again'), leave: r('rb-final-leave'), share: r('rb-final-share'),
             note: (document.getElementById('rb-final-again-note') || {}).textContent || '', noteRect: r('rb-final-again-note') };
}).catch(e => ({ err: String(e) }));

(async () => {
    console.log('=== V454 RUN IT BACK ===');
    const g = await TP.startTwoPlayerGame({});
    const g1Start = Date.now();
    const A = g.a.role === 'a' ? g.a : g.b, B = A === g.a ? g.b : g.a, code = g.code;
    try {
        await sleep(6000);
        // ---- game 1: a real game that runs 65 s, then a decided horn on the phone with the ball (the engine's own final) ----
        { const el = Date.now() - g1Start; if (el < 65000) await sleep(65000 - el); }
        const off = (await waiting(A.page)) ? B : A;
        await off.page.evaluate(() => {
            const em = RB.engineState();
            window._rb2p_clockLicence && window._rb2p_clockLicence('test');
            window._rb2p_gameOverReported = false; window._rb2p_inOvertime = false;
            window._rb2p_lastStableQuarter = 4; window._rb2p_wireQuarter = 4;
            em.engineQuarter = 5; em.setUserScore(24); em.setOpponentScore(10);
            window._rb2p_pastRegSeenMs = Date.now() - 25000;
        });
        const ended = await until(async () => ({ ok: (await finalShown(A.page)) && (await finalShown(B.page)) }), 60000, 1000);
        await sleep(3000);
        const games1 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length;
        console.log('  game 1 ended: the stats screen on both ' + (ended.ms !== null) + '; games in the room ' + games1);
        if (ended.ms === null) { console.log('  FAIL  setup: game 1 did not reach the stats screen on both phones'); fail++; return; }

        // ---- R1: the button, as each player sees it; then B at a phone's landscape size ----
        const fa = await finalButtons(A.page), fb = await finalButtons(B.page);
        if (process.env.RIB_SHOTS) await A.page.screenshot({ path: process.env.RIB_SHOTS + '/rib-desktop.png' }).catch(() => {});
        await B.page.setViewport({ width: 844, height: 390 }); await sleep(800);
        const fp = await finalButtons(B.page);
        if (process.env.RIB_SHOTS) await B.page.screenshot({ path: process.env.RIB_SHOTS + '/rib-phone.png' }).catch(() => {});
        await B.page.setViewport({ width: fb.vw, height: fb.vh }); await sleep(500);
        const onFirst = f => !!(f && f.again && f.again.top >= 0 && f.again.bottom <= f.vh && (!f.noteRect || f.noteRect.bottom <= f.vh) && (f.scrollTop || 0) === 0);
        const biggest = f => !!(f && f.again && f.leave && f.again.font > f.leave.font && f.again.w * f.again.h > f.leave.w * f.leave.h);
        console.log('  A: ' + JSON.stringify(fa) + '\n  B: ' + JSON.stringify(fb) + '\n  B at 844x390: ' + JSON.stringify(fp && { again: fp.again, vh: fp.vh }));
        check('R1 RUN IT BACK is on both stats screens, on the first screen and the biggest button there (also at 844x390, no scrolling)',
              onFirst(fa) && onFirst(fb) && onFirst(fp) && biggest(fa) && biggest(fb) && /RUN IT BACK/.test(fa.again.text) && /RUN IT BACK/.test(fb.again.text),
              JSON.stringify({ a: fa.again, b: fb.again, phone: fp && fp.again, vhPhone: fp && fp.vh }));

        // ---- RIB_BOTH=1: both players tap it within a second (two friends at once) ----
        if (process.env.RIB_BOTH) {
            const tAB = Date.now();
            await Promise.all([A.page.click('#rb-final-again'), sleep(700).then(() => B.page.click('#rb-final-again'))]);
            const bothB = await until(async () => ({ ok: (await inMatch(A.page)) === true && (await inMatch(B.page)) === true }), 90000, 700);
            await sleep(6000);
            const sA2 = await st(A.page), sB2 = await st(B.page), g2 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length;
            const dd = (await diag(A.page)) + (await diag(B.page));
            console.log('  both tapped: game 2 on both ' + (bothB.ms !== null ? Math.round((Date.now() - tAB) / 100) / 10 + ' s after the taps' : 'NO') + '; A ' + JSON.stringify(sA2) + '; B ' + JSON.stringify(sB2) + '; games ' + g2);
            check('B1 both tap at once: the next game starts on both (Q1, 0-0, one ball), no READY-guard reload',
                  bothB.ms !== null && g2 === games1 + 1 && sA2 && sB2 && sA2.q === 1 && sB2.q === 1 && sA2.su + sA2.so + sB2.su + sB2.so === 0 && sA2.wait !== sB2.wait && !/READY blocked — opponent mid-match/.test(dd),
                  JSON.stringify({ both: bothB.ms, games1, g2, sA2, sB2 }));
            return;
        }
        // ---- R2: A taps it ----
        const tA = Date.now();
        await A.page.click('#rb-final-again');
        const aBack = await until(async () => {
            const room = await lobbyRoom(A.page), seat = await TP.fbGet('rooms/' + code + '/players/a');
            const sess = await A.page.evaluate(() => sessionStorage.getItem('rb_room')).catch(() => null);
            return { ok: room && sess === code && !!(seat && seat.ready === true), room, sess, seat };
        }, 60000, 700);
        const dA = await diag(A.page);
        if (aBack.ms === null) console.log('  A\'s page now: ' + JSON.stringify(await A.page.evaluate(() => ({ flag: sessionStorage.getItem('rb2p_runItBack'), skip: sessionStorage.getItem('rb2p_skipResumeOnce'),
            engineRoom: (function () { try { return _ft._gt(); } catch (e) { return 'n/a'; } })(), home: (function () { try { return RB.isEngineInHomeRoom(); } catch (e) { return 'err'; } })(),
            readyDisabled: (document.getElementById('rb-ready') || {}).disabled, readyText: (document.getElementById('rb-ready') || {}).textContent,
            view: (document.getElementById('rb-lobby') || { getAttribute: () => null }).getAttribute('data-active') })).catch(e => String(e))) + '\n  A diag tail: ' + dA.split(',').slice(-14).join(' | ').slice(0, 1500));
        console.log('  A back in ' + (aBack.sess || '?') + ' ' + (aBack.ms !== null ? Math.round((Date.now() - tA) / 100) / 10 + ' s after the tap' : 'NEVER') + ', seat ' + JSON.stringify(aBack.seat));
        check('R2 A\'s page comes back to the same room with its seat READY, without a READY press on that page',
              aBack.ms !== null && /RUN IT BACK — READY pressed for this page/.test(dA), JSON.stringify({ room: aBack.room, sess: aBack.sess, seat: aBack.seat, readyLine: /RUN IT BACK — READY/.test(dA) }));

        // ---- R3: B hears it ----
        const heard = await until(async () => { const f = await finalButtons(B.page); return { ok: /WANTS TO RUN IT BACK/.test(f.note || ''), note: f.note }; }, 15000, 500);
        if (process.env.RIB_SHOTS) await B.page.screenshot({ path: process.env.RIB_SHOTS + '/rib-heard.png' }).catch(() => {});
        check('R3 B\'s stats screen says A wants to run it back', heard.ms !== null, JSON.stringify({ note: heard.note }));

        // ---- R4: B taps it: game 2 on both ----
        const tB = Date.now();
        await B.page.click('#rb-final-again');
        const both = await until(async () => ({ ok: (await inMatch(A.page)) === true && (await inMatch(B.page)) === true }), 90000, 700);
        await sleep(6000);
        const sA = await st(A.page), sB = await st(B.page);
        const games2 = Object.keys(await TP.fbGet('rooms/' + code + '/games') || {}).length;
        const dA2 = await diag(A.page), dB2 = await diag(B.page);
        console.log('  game 2: both in a match ' + (both.ms !== null ? Math.round((Date.now() - tB) / 100) / 10 + ' s after B\'s tap' : 'NO') + '; A ' + JSON.stringify(sA) + '; B ' + JSON.stringify(sB) + '; games ' + games2);
        const oneBall = !!(sA && sB && sA.wait !== sB.wait);
        check('R4 the next game starts on both phones in the same room: Q1, a full clock, 0-0, one phone with the ball',
              both.ms !== null && games2 === games1 + 1 && /GAME-START/.test(dA2) && /GAME-START/.test(dB2) &&
              sA && sB && sA.q === 1 && sB.q === 1 && sA.su === 0 && sA.so === 0 && sB.su === 0 && sB.so === 0 && sA.clk >= 100 && sB.clk >= 100 && oneBall,
              JSON.stringify({ both: both.ms, games1, games2, sA, sB }));

        // ---- R5: a clean start — no guard reload, and game 2's first hand-off lands ----
        const guardReload = /READY blocked — opponent mid-match/.test(dA2 + dB2);
        const off2 = sA && !sA.wait ? A : B, rcv2 = off2 === A ? B : A;
        const tSend = Date.now();
        await D.forceDriveEnd(off2.page, 'PUNT');
        const took = await until(async () => ({ ok: (await waiting(rcv2.page)) === false }), 30000, 250);
        await sleep(3500);
        const auR = Object.values(await TP.fbGet('rooms/' + code + '/audit/' + rcv2.role) || {});
        const sendO = Object.values(await TP.fbGet('rooms/' + code + '/audit/' + off2.role) || {}).filter(e => e.k === 'send' && e.t >= tSend - 1000)[0];
        const applied = !!(sendO && auR.find(e => e.k === 'apply' && String(e.ts) === String(sendO.ts)));
        const dR = await diag(rcv2.page);
        const moot = /OUTCOME moot/.test(dR), rescue = /TURN-RESCUE -> offense/.test(dR);
        console.log('  game 2\'s first hand-off: ' + off2.role + ' punted (' + (sendO ? sendO.type : 'no send') + '); ' + rcv2.role + ' LIVE ' + (took.ms !== null ? took.ms / 1000 + ' s' : 'never') + '; applied ' + applied + '; moot ' + moot + '; rescue ' + rescue + '; guard reload ' + guardReload);
        check('R5 a clean start: no READY-guard reload into a resume, and game 2\'s first hand-off is applied by the receiver itself',
              !guardReload && applied && !moot && !rescue && took.ms !== null, JSON.stringify({ guardReload, applied, moot, rescue, took: took.ms }));
        if (process.env.RIB_DEBUG) console.log(dA2.split(',').slice(-40).join('\n'));
    } finally {
        await g.cleanup();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
