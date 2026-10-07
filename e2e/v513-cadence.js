// e2e/v513-cadence.js — V513 (the owner: "why is the mirror still uneven? Please fix"): before/after on ONE game. The
// opponent's screen is scored by how many of its frames are shown for as many refreshes as the other phone drew them for
// ("even"; a skipped frame is uneven; a frame during which the waiting page itself missed a refresh — its own load — is
// counted apart). BEFORE = V512's capture gate and play clock (test seams _rb2p_viewCapOld / _rb2p_viewPlayout='v512');
// AFTER = V513's. The arms alternate (before, after, before, after) through real downs, so the machine's own load hits both.
//   C1  a computer sending, a clean link: AFTER at least as even as BEFORE (within 2 points) and 90%+
//   C2  a computer sending, school-Wi-Fi jitter on the waiting page (10 ms average, 3% spikes of 40-100 ms): AFTER no worse
//       than BEFORE (within 3 points — runs of this case differ by about 5 points either way)
//   C3  a phone sending (30 a second), the same jitter: AFTER 3+ points more even than BEFORE
// Each arm's picture delay is reported; AFTER's must stay under 250 ms.
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const ROUNDS = Number(process.env.ROUNDS || 2);

(async () => {
    console.log('=== V513 THE OPPONENT\'S SCREEN, EVEN (before / after) ===');
    const g = await TP.startTwoPlayerGame({});
    try {
        const conds = [['C1', 'a computer sending, a clean link', false, null],
                       ['C2', 'a computer sending, school-Wi-Fi jitter', false, { mean: 10, spike: 0.03 }],
                       ['C3', 'a phone sending (30 a second), school-Wi-Fi jitter', true, { mean: 10, spike: 0.03 }]];
        for (const [id, what, phone, net] of conds) {
            const acc = {};
            for (let r = 0; r < ROUNDS * 2; r++) {
                const arm = r % 2 ? 'after' : 'before';
                const o = await L.offense(g, 45000);
                if (!o.ok) continue;
                const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
                for (const P of [g.a, g.b]) await P.page.evaluate((s) => {
                    window._rb2p_viewPhone = s.phone; window._rb2p_viewCapOld = s.before; window._rb2p_viewPlayout = s.before ? 'v512' : null; window._rb2p_viewNetSim = s.net;
                }, { phone, before: arm === 'before', net });
                await sleep(2500);
                const r0 = await DEF.page.evaluate(() => window._rb2p_view.stats().rcv);
                const delays = [], poll = setInterval(async () => { try { delays.push(await DEF.page.evaluate(() => window._rb2p_view.stats().rcv.delay)); } catch (e) {} }, 500);
                try { await L.realDown(OFF.page, { buttons: true, pass: false }); } catch (e) {}
                await sleep(800); clearInterval(poll);
                const r1 = await DEF.page.evaluate(() => window._rb2p_view.stats().rcv);
                const A = acc[arm] || (acc[arm] = { runs: 0, bad: 0, drops: 0, drawn: 0, late: 0, delays: [] });
                A.runs += r1.cadRuns - r0.cadRuns; A.bad += r1.cadBad - r0.cadBad; A.drops += r1.cadDrops - r0.cadDrops;
                A.drawn += r1.drawn - r0.drawn; A.late += r1.starved - r0.starved; A.delays.push(...delays.filter(x => typeof x === 'number'));
            }
            const sum = a => { if (!a) return null; const d = a.delays.sort((x, y) => x - y); return { frames: a.runs, pageDropped: a.drops, evenPct: a.runs ? +(100 - 100 * a.bad / a.runs).toFixed(1) : null,
                latePct: a.drawn ? +(100 * a.late / a.drawn).toFixed(1) : null, delayMed: d.length ? Math.round(d[d.length >> 1]) : null, delayMax: d.length ? Math.round(d[d.length - 1]) : null }; };
            const B = sum(acc.before), Af = sum(acc.after);
            console.log('  ' + id + ' before ' + JSON.stringify(B) + '\n     after  ' + JSON.stringify(Af));
            const ok = !!(B && Af && B.frames > 60 && Af.frames > 60 && Af.delayMax < 250) &&
                       (id === 'C3' ? Af.evenPct >= B.evenPct + 3 : id === 'C2' ? Af.evenPct >= B.evenPct - 3 : Af.evenPct >= B.evenPct - 2 && Af.evenPct >= 90);
            check(id + ' ' + what + (id === 'C3' ? ': after is 3+ points more even than before' : id === 'C2' ? ': after no worse than before (within 3 points)' : ': after as even as before (within 2 points) and 90%+'),
                  ok, JSON.stringify({ before: B, after: Af }));
        }
    } finally { try { await g.cleanup(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
