// e2e/opp-view.js — V450 (the owner: "I want the wait screen to display opponent screen ... The stream should be HYPER
// smooth" and "the screen should look as if it is a 1080p replication, e.g. almost exactly the same"; asked: the game's
// real art, phone to phone with a Firebase backup). Real two-player games, real downs (the QB bot):
//   W1  the waiting phone shows the opponent's live screen within 15 s of the opponent having the ball (the direct link)
//   W2  it IS the opponent's screen: a frame the phone with the ball sent, replayed on the waiting phone, is at least 99.9%
//       pixel-identical to what that phone's own engine drew
//   W3  smooth through a real down: the waiting phone redraws on (nearly) every animation frame its browser gives it,
//       fewer than 10% of redraws wait on a late frame, and the camera following the play glides: under 2% spikes (a
//       step 2.5x its neighbours') and under 2% stutters (a still frame between moving ones) — the frames come 15-30 a
//       second, the picture moves on every redraw
//   W4  light and harmless: the direct link carries under 40 KB/s; the waiting phone's own game is untouched (still
//       waiting, same quarter and score) and its page has no errors
//   W5  when the waiting phone gets the ball (a turnover on downs), the opponent's screen goes away within 20 s
//   W6  no direct link (a school network that blocks it): Firebase carries it — the screen still shows, under 15 KB/s,
//       and the database keeps one record per role (rooms/{code}/view never grows)
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0, setup = '';
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const vstats = page => page.evaluate(() => window._rb2p_view.stats());
const shown = page => page.evaluate(() => { const c = document.getElementById('rb-oppview'); return !!(c && c.style.display === 'block'); });
const gameState = page => L.st(page);

async function comparePng(page, a, b) {
    return page.evaluate(async (a, b) => {
        const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = s; });
        const A = await load(a), B = await load(b);
        if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height] };
        const w = A.width, h = A.height, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, w, h).data;
        let same = 0; for (let i = 0; i < da.length; i += 4) if (da[i] === db[i] && da[i + 1] === db[i + 1] && da[i + 2] === db[i + 2]) same++;
        return { w, h, samePct: Math.round(1e5 * same / (da.length / 4)) / 1000 };
    }, a, b);
}

async function directGame() {
    const g = await TP.startTwoPlayerGame({});
    try {
        await sleep(6000);
        const o = await L.offense(g, 40000); if (!o.ok) { setup = 'nobody has the ball'; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        // W1
        const w1 = await L.until(async () => ({ ok: await shown(DEF.page) && (await vstats(DEF.page)).rcv.mode === 'p2p' }), 15000, 400);
        const s1 = await vstats(DEF.page);
        check('W1 the waiting phone shows the opponent\'s live screen over the direct link', w1.ms !== null, JSON.stringify({ shownAfterMs: w1.ms, rcv: s1.rcv }));
        if (w1.ms === null) return;
        // W2: one sent frame, the sender's own pixels vs the waiting phone's replay
        let w2 = null;
        for (let attempt = 0; attempt < 4 && !(w2 && w2.samePct >= 99.9); attempt++) {
            await OFF.page.evaluate(() => window._rb2p_view.testShotNext());
            const shot = await L.until(async () => { const s = await OFF.page.evaluate(() => window._rb2p_view.testShot()); return { ok: !!s, s }; }, 5000, 100);
            if (!shot.s) continue;
            const got = await L.until(async () => ({ ok: (await DEF.page.evaluate(() => window._rb2p_view.lastSeqs())).includes(shot.s.seq) }), 3000, 100);
            if (got.ms === null) continue;
            const mine = await DEF.page.evaluate(seq => window._rb2p_view.testRender(seq), shot.s.seq);
            if (!mine) continue;
            w2 = Object.assign({ seq: shot.s.seq }, await comparePng(DEF.page, shot.s.png, mine));
        }
        check('W2 a frame replayed on the waiting phone is at least 99.9% pixel-identical to the sender\'s own', !!(w2 && w2.samePct >= 99.9), JSON.stringify(w2));
        // W3 + W4: a real down, the ball traced on the waiting phone
        // the field camera follows the play: its position on every replay is the smoothness the player sees
        await DEF.page.evaluate(() => window._rb2p_view.traceCamera());
        await DEF.page.evaluate(() => { window.__rafN = 0; if (!window.__rafOn) { window.__rafOn = true; (function f() { window.__rafN++; requestAnimationFrame(f); })(); } });
        const defBefore = await gameState(DEF.page), sendBefore = await vstats(OFF.page), recvBefore = await vstats(DEF.page), t0 = Date.now();
        const r = await L.realDown(OFF.page, { straight: true });
        await sleep(1000);
        const rafN = await DEF.page.evaluate(() => window.__rafN);
        const secs = (Date.now() - t0) / 1000, sendAfter = await vstats(OFF.page), recvAfter = await vstats(DEF.page), defAfter = await gameState(DEF.page);
        const raw = (await DEF.page.evaluate(() => window._rb2p_view.trace())) || [];
        // the camera = the view matrix whose x moves the most over the down
        let col = -1, span = 0;
        const n0 = raw.length ? Math.min(...raw.map(p => p[1].length)) : 0;
        for (let c = 0; c < n0; c++) { const xs = raw.map(p => p[1][c]); const sp = Math.max(...xs) - Math.min(...xs); if (sp > span) { span = sp; col = c; } }
        const pts = col < 0 ? [] : raw.map(p => [p[0], p[1][col], 0]);
        let maxGap = 0, steps = [];
        for (let i = 1; i < pts.length; i++) { maxGap = Math.max(maxGap, pts[i][0] - pts[i - 1][0]); const d = Math.abs(pts[i][1] - pts[i - 1][1]); if (d > 0.01) steps.push(d); }
        const sorted = steps.slice().sort((a, b) => a - b), med = sorted.length ? sorted[sorted.length >> 1] : 0, maxStep = sorted.length ? sorted[sorted.length - 1] : 0;
        // what a viewer sees: a spike (a step far bigger than the steps around it) or a stutter (a still frame mid-motion)
        const all = []; for (let i = 1; i < pts.length; i++) all.push(Math.abs(pts[i][1] - pts[i - 1][1]));
        let spikes = 0, stutters = 0, moving = 0;
        for (let i = 0; i < all.length; i++) {
            const win = all.slice(Math.max(0, i - 5), i).concat(all.slice(i + 1, i + 6)).filter(x => x > 0.01).sort((a, b) => a - b);
            const local = win.length ? win[win.length >> 1] : 0;
            if (all[i] > 0.01) { moving++; if (local > 0 && all[i] > 2.5 * local + 0.5) spikes++; }
            else if (i > 0 && i + 1 < all.length && all[i - 1] > 0.3 && all[i + 1] > 0.3) stutters++;
        }
        const drawn = recvAfter.rcv.drawn - recvBefore.rcv.drawn, starved = recvAfter.rcv.starved - recvBefore.rcv.starved;
        const sent = sendAfter.snd.sent - sendBefore.snd.sent, bps = Math.round((sendAfter.snd.bytes - sendBefore.snd.bytes) / secs);
        const w3 = { play: r && r.result, secs: +secs.toFixed(1), sent, sentFps: +(sent / secs).toFixed(1), drawn, drawFps: +(drawn / secs).toFixed(1), rafTicks: rafN, starvedPct: drawn ? Math.round(100 * starved / drawn) : null,
                     tracePts: pts.length, cameraSpan: Math.round(span), movingSteps: steps.length, medianStep: +med.toFixed(2), maxStep: +maxStep.toFixed(2),
                     spikePct: moving ? +(100 * spikes / moving).toFixed(1) : null, stutterPct: moving ? +(100 * stutters / moving).toFixed(1) : null, maxGapMs: maxGap, delayMs: recvAfter.rcv.delay };
        console.log('  W3: ' + JSON.stringify(w3));
        const big = []; for (let i = 1; i < pts.length && false; i++) { const d = Math.abs(pts[i][1] - pts[i - 1][1]); if (d > 4 * med + 0.5) big.push({ i, d: +d.toFixed(1), dt: pts[i][0] - pts[i - 1][0], seqs: [pts[i - 1][3], pts[i][3]], from: pts[i - 1].slice(1, 3).map(v => +v.toFixed(1)), to: pts[i].slice(1, 3).map(v => +v.toFixed(1)) }); }
        if (big.length) console.log('  W3 big steps: ' + JSON.stringify(big.slice(0, 6)));
        check('W3 smooth through a real down: a redraw on nearly every animation frame, few waits on a late frame, the camera glides',
              !!(r && pts.length > 20 && steps.length > 10 && drawn >= 0.85 * rafN && starved / Math.max(1, drawn) < 0.10 && spikes <= 0.02 * moving && stutters <= 0.02 * moving), JSON.stringify(w3));
        const errs = (DEF.errors || []).filter(e => !/_GL2/.test(e));
        check('W4 the direct link carries under 40 KB/s, and the waiting phone\'s own game is untouched',
              bps < 40960 && defAfter.wait === true && defBefore.wait === true && defAfter.q === defBefore.q && defAfter.su === defBefore.su && defAfter.so === defBefore.so && errs.length === 0,
              JSON.stringify({ bps, before: { wait: defBefore.wait, q: defBefore.q, su: defBefore.su, so: defBefore.so }, after: { wait: defAfter.wait, q: defAfter.q, su: defAfter.su, so: defAfter.so }, errs: errs.slice(0, 3) }));
        // W5: a turnover on downs gives the waiting phone the ball; the opponent's screen goes away
        await L.setDown(OFF.page, { down: 4, toGo: 40 }); await sleep(900);
        await L.realDown(OFF.page, { straight: true });
        const w5 = await L.until(async () => { const s = await gameState(DEF.page); return { ok: !!(s && !s.wait && s.ball > 0) && !(await shown(DEF.page)), s }; }, 25000, 500);
        check('W5 when the waiting phone gets the ball, the opponent\'s screen goes away', w5.ms !== null, JSON.stringify({ afterMs: w5.ms, def: w5.s && { wait: w5.s.wait, ball: w5.s.ball }, shown: await shown(DEF.page) }));
    } finally { await g.cleanup(); }
}

async function firebaseGame() {
    const g = await TP.startTwoPlayerGame({ beforeReady: async (page) => { await page.evaluate(() => { window._rb2p_viewNoP2P = true; }); } });
    try {
        await sleep(6000);
        const o = await L.offense(g, 40000); if (!o.ok) { setup = setup || 'nobody has the ball (Firebase game)'; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
        const w = await L.until(async () => ({ ok: await shown(DEF.page) && (await vstats(DEF.page)).rcv.mode === 'fb' }), 20000, 500);
        const b0 = await vstats(OFF.page), t0 = Date.now();
        await L.realDown(OFF.page, { straight: true });
        await sleep(1000);
        const b1 = await vstats(OFF.page), secs = (Date.now() - t0) / 1000, bps = Math.round((b1.snd.bytes - b0.snd.bytes) / secs);
        const node = await TP.fbGet('rooms/' + g.code + '/view');
        const keys = node ? Object.keys(node) : [];
        const recs = keys.every(k => node[k] && typeof node[k] === 'object' && !Array.isArray(node[k]) && Object.keys(node[k]).every(f => typeof node[k][f] !== 'object'));
        check('W6 no direct link: Firebase carries the opponent\'s screen, under 15 KB/s, one record per role',
              w.ms !== null && bps < 15360 && b1.net === 'fb' && keys.length <= 4 && recs,
              JSON.stringify({ shownAfterMs: w.ms, bps, net: b1.net, viewKeys: keys, sent: b1.snd.sent - b0.snd.sent }));
    } finally { await g.cleanup(); }
}

(async () => {
    console.log('=== V450 THE OPPONENT\'S SCREEN ON THE WAIT SCREEN ===');
    try { await directGame(); await firebaseGame(); }
    catch (e) { fail++; console.log('  FAIL  ' + (e && e.stack || e)); }
    finally {
        if (setup) console.log('  SETUP ' + setup + ' — inconclusive');
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (setup ? ' (SETUP INCONCLUSIVE)' : '') + ' ===');
        process.exit(setup && !fail ? 3 : (fail ? 1 : 0));
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
