#!/usr/bin/env node
// e2e/run.js — the test runner for two-player-rb.
//
//   node e2e/run.js                 run every test
//   node e2e/run.js turnover ot     run tests whose name matches any arg
//   node e2e/run.js --stop-server   stop the background static server
//
// Each test module in e2e/tests/ exports:
//   { name, browser?, match?, oppUid?, async run(ctx) -> {pass, detail} | throws }
//     browser : true (default) → ctx.page is a loaded page; false → pure JS, no browser
//     match   : true → ctx.page is already driven into a live match (user on offense)
//     ctx     : { page, errors, H }  (H = the harness module; errors = non-benign pageerrors)
//
// A test passes if run() returns {pass:true} (or undefined) and threw nothing.
// One browser is launched and reused; each browser test gets a fresh page so a
// stuck engine in one test can't poison the next.

const fs = require('fs');
const path = require('path');
const H = require('./harness');

const TESTS_DIR = path.join(__dirname, 'tests');

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--stop-server')) { H.stopServer(); console.log('static server stopped'); return; }
    const filters = args.filter(a => !a.startsWith('--'));

    let files = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.js')).sort();
    let tests = files.map(f => Object.assign({ file: f }, require(path.join(TESTS_DIR, f))));
    if (filters.length) {
        tests = tests.filter(t => filters.some(s =>
            (t.name || '').toLowerCase().includes(s.toLowerCase()) || t.file.includes(s)));
    }
    if (!tests.length) { console.log('no matching tests'); return; }

    const needBrowser = tests.some(t => t.browser !== false);
    if (needBrowser) {
        const where = await H.ensureServer();
        console.log('static server: ' + where + ' on port ' + H.PORT + '\n');
    }
    const browser = needBrowser ? await H.launchBrowser() : null;

    const results = [];
    for (const t of tests) {
        const label = t.name || t.file;
        process.stdout.write('• ' + label + ' … ');
        const started = Date.now();
        let page = null, errors = [];
        try {
            let ctx = { H };
            if (t.browser !== false) {
                const opened = await H.openPage(browser, { match: !!t.match, oppUid: t.oppUid });
                page = opened.page; errors = opened.errors; ctx.page = page; ctx.errors = errors;
            }
            const r = await t.run(ctx);
            const pass = !r || r.pass !== false;
            const secs = ((Date.now() - started) / 1000).toFixed(1);
            console.log((pass ? 'PASS' : 'FAIL') + ' (' + secs + 's)' + (r && r.detail ? ' — ' + r.detail : ''));
            if (errors.length) console.log('    page errors: ' + JSON.stringify(errors));
            results.push({ label, pass, detail: r && r.detail });
        } catch (e) {
            console.log('FAIL (threw) — ' + (e && e.message ? e.message : e));
            results.push({ label, pass: false, detail: 'threw: ' + (e && e.message) });
        } finally {
            if (page) await page.close().catch(() => {});
        }
    }
    if (browser) await browser.close().catch(() => {});

    const passed = results.filter(r => r.pass).length;
    console.log('\n' + passed + '/' + results.length + ' passed');
    const failed = results.filter(r => !r.pass);
    if (failed.length) { failed.forEach(f => console.log('  FAIL: ' + f.label)); process.exit(1); }
}

main().catch(e => { console.error('runner error:', e); process.exit(1); });
