// e2e/v438-reload-played-on.js — a phone that took the ball, PLAYED ON, and reloaded comes back where it was
// (FXTE, 2 Oct 2026 8:07 am, V431 — OPEN.md #1).
//
// What happened: B took a TD kickoff, played three downs into Q2 (3rd & 4 at its 46, 2:54 left) and reloaded 22 s after
// taking the ball. The resume said "the TD I took before the reload is newer than my live record — taking it again" and
// put B back at the kickoff, 1st & 10, with the hand-off's clock (0:01): ~2:53 of the half and the downs were lost.
//
// Why: the resume reads my "stable snapshot" (rooms/{code}/snap/{role}, V197) instead of my live record whenever the
// snapshot is under 25 s old. The snapshot is written only while I wait, or at the controller's kp 1 beat that the
// 500 ms sampler almost never sees on offense — so after a hand-off it stays the WAITING snapshot from before it.
// FXTE's B pushed its live record all along (A's mirror followed B's quarter change at 4:06.8, after B's ACK at 3:54.7),
// so only the snapshot can have said "no ball, older than my ACK". V430's "take it again" then applied the TD a second time.
//
// Each attempt: the partner punts (a real hand-off record, the normal apply); the receiver plays ONE real down (the QB
// bot's throw-away: snap, throw it over the sideline — FXTE's last down was an incompletion) and reloads.
//   P0  setup (FXTE's state): on the server the receiver's snapshot says "waiting" from before the hand-off and its live
//       record says it has the ball — and the resume READ that snapshot inside its 25 s window (timed from the page's
//       own "[2P RESUME]" lines). A read after the window is no test of the bug: the attempt is retried with the roles
//       swapped (3 attempts), then exit 3 — inconclusive, never a pass.
//   P1  back in the match LIVE within 6 s, the partner waits (one offense)
//   P2  at the spot of its last down: yard line, down and distance as before the reload — not the hand-off's 1st & 10
//   P3  the hand-off was not taken again ("taking it again" / "ACKed-but-unseen" not in its log)
//   P4  the clock it had (within 4 s), not the hand-off's
const L = require('./horn-lib');
const TP = L.TP, D = require('./scenario');
const sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const waiting = page => page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true).catch(() => null);
const where = page => page.evaluate(() => { try { const s = RB.engineState(); return { y: Math.round(Number(s.engineYardLineSigned) * 10) / 10, d: Number(s.engineDownNumber), tg: Math.round(Number(s.engineYardsToGo) * 10) / 10, q: Number(s.engineQuarter), clk: Number(s.engineMinutesLeft) * 60 + Number(s.engineSecondsLeft), kp: Number(s.engineControllerState) }; } catch (e) { return null; } }).catch(() => null);
const SNAP_FRESH = 25000;

// the QB bot's throw-away (e2e/qb-bot.js playOne, "nobody open"): press the QB, pull back past the snap, throw it over
// the sideline, forward — through trusted input, like a player
async function throwAway(page) {
    const QB = L.QB; let cal = null; try { cal = await QB.calibrate(page); } catch (e) { return { result: 'none', why: 'calibrate' }; }
    const s0 = await page.evaluate(QB.IN.snap); const qb = s0.of.find(o => o.pos === 1);
    if (!qb || !s0.ball) return { result: 'none', why: 'no QB/ball' };
    const dir = s0.dir, gs = cal.gs, qbCss = cal.toCss(qb.x, qb.y), P = QB.pointer(page);
    await P.move(qbCss.x, qbCss.y); await sleep(40); await P.down();
    let pressed = false;
    for (let i = 0; i < 10; i++) { await sleep(20); const c = await page.evaluate(QB.IN.snap); if (c.ctrl && c.ctrl.kp === 1) { pressed = true; break; } }
    if (!pressed) { await P.up(); return { result: 'none', why: 'press not registered' }; }
    await P.move(qbCss.x + (-dir) * 26 / gs, qbCss.y, { steps: 2 });          // the snap: a small pull straight back
    await sleep(700);
    const q = ((await page.evaluate(QB.IN.snap)).of || []).find(o => o.pos === 1) || qb;
    const ux = dir, uy = (q.y < 300) ? -1 : 1, Lh = Math.hypot(ux, uy);
    await P.move(qbCss.x - ux / Lh * 60 / gs, qbCss.y - uy / Lh * 60 / gs, { steps: 2 }); await sleep(30);
    await P.up();
    return { result: 'thrown away' };
}

// one attempt; returns { conclusive, why } — the checks run only on a conclusive attempt
async function attempt(g, off, def, n) {
    console.log('\n  -- attempt ' + n + ': ' + off.role + ' punts to ' + def.role);
    await D.forceDriveEnd(off.page, 'PUNT');
    const took = await L.until(async () => ({ ok: (await waiting(def.page)) === false && (await waiting(off.page)) === true }), 25000, 150);
    if (took.ms === null) return { conclusive: false, why: 'the punt was not taken in 25 s' };
    const tookAt = Date.now();
    await L.until(async () => { const w = await where(def.page); return { ok: !!w && w.kp === 2 && w.d === 1 }; }, 6000, 150);
    const s0 = await where(def.page);
    console.log('  ' + def.role + ' took the punt in ' + took.ms + ' ms at ' + JSON.stringify(s0));
    // ONE real down, then the reload (FXTE reloaded 1 s after its last down settled)
    let rr = await throwAway(def.page);
    if (!rr || rr.result === 'none') rr = await L.realDown(def.page, { pass: true });
    const settled = await L.until(async () => { const w = await where(def.page); return { ok: !!w && (w.d !== s0.d || Math.abs(w.y - s0.y) > 0.5), w }; }, 12000, 150);
    const before = await where(def.page), stillMine = (await waiting(def.page)) === false;
    const [snapR, liveR] = await Promise.all([TP.fbGet('rooms/' + g.code + '/snap/' + def.role), TP.fbGet('rooms/' + g.code + '/live/' + def.role)]);
    const nowMs = Date.now();
    console.log('  the down: ' + JSON.stringify(rr && rr.result) + ' -> ' + JSON.stringify(before) + ', ' + ((nowMs - tookAt) / 1000).toFixed(1) + ' s after taking the ball');
    console.log('  server: snapshot ' + JSON.stringify(snapR && { iHaveBall: snapR.iHaveBall, age: snapR.ts ? (nowMs - snapR.ts) / 1000 : null }) +
                ', live ' + JSON.stringify(liveR && { iHaveBall: liveR.iHaveBall, down: liveR.down, y: liveR.yardLine && Math.round(liveR.yardLine * 10) / 10, age: liveR.ts ? (nowMs - liveR.ts) / 1000 : null }));
    if (!(stillMine && before && settled.ok && before.d >= 1 && before.d <= 4)) return { conclusive: false, why: 'the down did not leave the receiver on a later down with the ball' };
    if (!(snapR && snapR.iHaveBall === false && snapR.ts < tookAt && liveR && liveR.iHaveBall === true && nowMs - liveR.ts < 3000))
        return { conclusive: false, why: 'the server did not hold FXTE\'s records (a stale waiting snapshot, a live record with the ball)' };

    // the reload; the resume's own console lines tell when it read the snapshot
    const seen = [];
    const onC = m => { try { const t = m.text(); if (/\[2P RESUME\]|TURN-RESCUE|RECOVER|FIELD-CHECK/.test(t)) seen.push([Date.now(), t.slice(0, 170)]); } catch (e) {} };
    def.page.on('console', onC);
    await def.page.evaluate(() => location.reload()).catch(() => {});
    const tBoot = Date.now();
    let inMatchMs = null;
    const back = await L.until(async () => {
        const w = await waiting(def.page), inM = await def.page.evaluate(() => document.documentElement.classList.contains('rb-in-match')).catch(() => false);
        if (inM && inMatchMs === null) inMatchMs = Date.now() - tBoot;
        return { ok: inM && w === false, w, inM };
    }, 45000, 250);
    // its field staged (a scrimmage down on the field), up to 10 s — a resume stages its drive a beat after LIVE
    await L.until(async () => { const w = await where(def.page); return { ok: !!w && w.d >= 1 && w.d <= 4 && w.kp === 2 && Math.abs(w.y) > 0.01 }; }, 10000, 250);
    await sleep(1000);
    def.page.off('console', onC);
    const readAt = seen.length ? seen[0][0] : null, ageAtRead = readAt ? (readAt - snapR.ts) / 1000 : null;
    console.log('  the resume (console): ' + JSON.stringify(seen.slice(0, 6).map(x => '+' + ((x[0] - tBoot) / 1000).toFixed(1) + 's ' + x[1])));
    console.log('  the resume read the snapshot by ' + (readAt ? ((readAt - tBoot) / 1000).toFixed(1) + ' s after the reload, at age ' + ageAtRead.toFixed(1) + ' s' : '(no resume line)'));
    if (ageAtRead === null || ageAtRead * 1000 >= SNAP_FRESH - 500) return { conclusive: false, why: 'the resume read the snapshot after its 25 s window (' + ageAtRead + ' s)' };

    const after = await where(def.page), offWait = await waiting(off.page);
    const diag = await def.page.evaluate(() => String(window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : '')).catch(() => '');
    const liveS = back.ms !== null && inMatchMs !== null ? (back.ms - inMatchMs) / 1000 : null;
    console.log('  back in the match ' + (inMatchMs / 1000) + ' s after the reload, LIVE ' + liveS + ' s later; now ' + JSON.stringify(after) + '; partner waiting ' + offWait);
    check('P0 setup: one real down after the hand-off; the resume read a waiting snapshot from before it (' + ageAtRead.toFixed(1) + ' s old) while the live record had the ball', true);
    check('P1 back LIVE within 6 s of being in the match, the partner waits', liveS !== null && liveS <= 6 && offWait === true, JSON.stringify({ liveS, offWait }));
    check('P2 at the spot of its last down (yard line, down, distance)', !!(after && Math.abs(after.y - before.y) <= 1 && after.d === before.d && Math.abs(after.tg - before.tg) <= 1),
          JSON.stringify({ before, after }));
    const tookAgain = /taking it again/.test(diag) || seen.some(x => /taking it again|ACKed-but-unseen/.test(x[1]));
    check('P3 the hand-off was not taken again', !tookAgain, ((diag.match(/[^\n,]*taking it again[^\n,]*/) || [''])[0] || seen.filter(x => /again|unseen/.test(x[1])).map(x => x[1]).join(' | ')).slice(0, 200));
    check('P4 the clock it had (within 4 s)', !!(after && after.q === before.q && Math.abs(after.clk - before.clk) <= 4), JSON.stringify({ before: before && [before.q, before.clk], after: after && [after.q, after.clk] }));
    return { conclusive: true };
}

(async () => {
    console.log('=== V438 RELOAD AFTER PLAYING ON ===');
    const g = await TP.startTwoPlayerGame({});
    let res = null;
    try {
        await sleep(6000);
        for (let n = 1; n <= 3; n++) {
            const aW = await waiting(g.a.page), bW = await waiting(g.b.page);
            if (aW === bW) { await sleep(3000); continue; }
            const off = aW ? g.b : g.a, def = off === g.a ? g.b : g.a;
            await sleep(1500);
            res = await attempt(g, off, def, n);
            if (res.conclusive) break;
            console.log('  attempt ' + n + ' inconclusive: ' + res.why);
            await sleep(3000);
        }
    } catch (e) { console.error('FATAL', e); await g.cleanup(); process.exit(2); }
    await g.cleanup();
    if (!res || !res.conclusive) { console.log('\n=== INCONCLUSIVE: ' + (res ? res.why : 'no attempt ran') + ' ==='); process.exit(3); }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
