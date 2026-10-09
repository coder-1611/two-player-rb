// e2e/probe-tab-storage.js — what a running 2P match reads and writes in the storage every tab of the browser shares
// (localStorage: the page's own keys and the GameMaker engine's files). Two tabs in one browser (the harness default),
// a few real downs; prints each tab's reads and writes during the match.
const L = require('./horn-lib');
const sleep = L.sleep;
const install = () => {
    if (window.__lsLog) return;
    const log = window.__lsLog = [], t0 = Date.now();
    const rec = (op, k, v) => log.push([Date.now() - t0, op, String(k).slice(0, 80), v == null ? -1 : String(v).length]);
    const S = Storage.prototype;
    for (const m of ['setItem', 'getItem', 'removeItem']) {
        const o = S[m];
        S[m] = function (k, v) { if (this === window.localStorage) rec('ls.' + m, k, m === 'setItem' ? v : null); return o.apply(this, arguments); };
    }
    for (const [fn, op] of [['_Yq2', 'gm.write'], ['_0r2', 'gm.read'], ['_LE2', 'gm.exists']]) {
        const o = window[fn]; if (typeof o !== 'function') { rec('missing', fn); continue; }
        window[fn] = function (name, x) { rec(op, name, op === 'gm.write' ? x : null); return o.apply(this, arguments); };
    }
};
(async () => {
    const g = await L.TP.startTwoPlayerGame({});
    try {
        for (const P of [g.a, g.b]) await P.page.evaluate(install);
        await sleep(3000);
        for (let i = 0; i < 4; i++) {
            const o = await L.offense(g, 30000); if (!o.ok) break;
            const r = await L.realDown(o.off.page, { buttons: true });
            console.log('  down ' + (i + 1) + ' by ' + o.off.role + ': ' + (r && r.result));
            await sleep(2500);
        }
        await sleep(5000);
        for (const P of [g.a, g.b]) {
            const log = await P.page.evaluate(() => window.__lsLog || []);
            const sum = {};
            for (const [t, op, k] of log) { const key = op + ' ' + k; sum[key] = (sum[key] || 0) + 1; }
            console.log('=== tab ' + P.role + ': ' + log.length + ' storage calls during the match');
            Object.entries(sum).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('   ' + String(n).padStart(5) + '  ' + k));
        }
    } finally { await g.cleanup(); }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
