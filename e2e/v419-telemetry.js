// e2e/v419-telemetry.js — NEVER-FREEZE Phase 1: telemetry that can show a freeze.
//
//   T1  entries logged while the audit upload is failing arrive once it works again (the outbox)
//   T2  ...even when the page reloads during the outage (the outbox survives in sessionStorage)
//   T3  'sync' entries carry the server's clock (a resolved number near the phone's t)
//   T4  a main thread hung for 9s is reported by the off-thread watchdog as a 'stall' (visible page)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function stream(code, role) { return (await TP.fbGet('rooms/' + code + '/audit/' + role)) || {}; }
const hasMarker = (st, m) => Object.values(st).some(e => e && e.k === 'diag' && e.m === m);

(async () => {
    console.log('=== V419 TELEMETRY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const P = g.a.page, role = g.a.role || 'a', code = g.code;

    // ---- T1: outage, then recovery ----
    let blocking = true;
    await P.setRequestInterception(true);
    const onReq = req => {
        try {
            if (blocking && /\/audit\//.test(req.url()) && req.method() === 'PATCH') return req.abort('failed');
            return req.continue();
        } catch (e) {}
    };
    P.on('request', onReq);
    const m1 = 'V419-T1-' + Date.now();
    await P.evaluate(m => { window._rb2p_audit('diag', { m: m }); }, m1);
    await sleep(5000);
    const during = hasMarker(await stream(code, role), m1);
    const queued = await P.evaluate(() => window._rb2p_auditOutboxSize());
    blocking = false;
    await sleep(5000);
    const after = hasMarker(await stream(code, role), m1);
    check('T1 an entry logged while uploads fail is held (not on the server, outbox ' + queued + ') and lands once they work', !during && queued > 0 && after, JSON.stringify({ during, queued, after }));

    // ---- T2: outage + reload ----
    blocking = true;
    const m2 = 'V419-T2-' + Date.now();
    await P.evaluate(m => { window._rb2p_audit('diag', { m: m }); }, m2);
    await sleep(3500);                                   // a flush fails and the outbox is saved
    const saved = await P.evaluate(() => Object.keys(sessionStorage).filter(k => /^rb2p_auditOutbox_/.test(k)).map(k => sessionStorage.getItem(k).length));
    blocking = false;
    await P.reload({ waitUntil: 'domcontentloaded' });
    let landed = false;
    for (let i = 0; i < 30 && !landed; i++) { await sleep(2000); landed = hasMarker(await stream(code, role), m2); }
    check('T2 an entry saved during an outage survives a reload and lands after it', saved.length > 0 && landed, JSON.stringify({ saved, landed }));
    P.off('request', onReq);
    try { await P.setRequestInterception(false); } catch (e) {}

    // ---- T3: server clock ----
    await sleep(17000);                                  // at least one sync after the reload
    const st3 = await stream(code, role);
    const syncs = Object.values(st3).filter(e => e && e.k === 'sync');
    const good = syncs.filter(e => typeof e.srv === 'number' && Math.abs(e.srv - e.t) < 60000);
    check('T3 sync entries carry a resolved server time near the phone\'s clock', syncs.length > 0 && good.length === syncs.length,
          JSON.stringify({ n: syncs.length, sample: syncs.slice(-2) }));

    // ---- T4: a hung main thread ----
    const Q = g.b.page, roleB = g.b.role || 'b';
    await Q.evaluate(() => { if (window._rb2p_stallWorkerFeed) window._rb2p_stallWorkerFeed(); });
    await sleep(3000);
    const t4start = Date.now();
    await Q.evaluate(() => { const t0 = Date.now(); while (Date.now() - t0 < 9000) { /* hang */ } });
    let stall = null;
    for (let i = 0; i < 10 && !stall; i++) { await sleep(1500); stall = Object.values(await stream(code, roleB)).find(e => e && e.k === 'stall' && e.t >= t4start - 2000) || null; }
    check('T4 a 9s main-thread hang is reported by the watchdog as a stall on a visible page', !!stall && stall.ms > 6000 && stall.vis === 'V' && typeof stall.srv === 'number', JSON.stringify(stall));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
