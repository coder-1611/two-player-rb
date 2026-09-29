// e2e/v422-latchcheck.js — NEVER-FREEZE Phase 2, property 1, in the suite: every name in index.html that
// could hold up play is in the latch registry with a deadline, or on the non-blocking list with its own
// reason (tools/latch-check.js). A new latch without a decided deadline fails the suite.
//
//   L1  the static check passes (no unclassified name, no incomplete entry, no reasonless entry)
//   L2  the check catches a new, unregistered latch (a planted `window._rb2p_newLatchX = true` fails it)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const ROOT = path.resolve(__dirname, '..');
function run(root) {
    try { return { code: 0, out: execFileSync('node', [path.join(root, 'tools', 'latch-check.js')], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
console.log('=== V422 LATCH REGISTRY CHECK ===');
const r1 = run(ROOT);
check('L1 every name that could hold up play is registered with a deadline, or non-blocking with its own reason', r1.code === 0, r1.out.split('\n').slice(0, 12).join(' | '));
// L2: a copy of the page with one new latch planted must fail
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'latchcheck-'));
fs.mkdirSync(path.join(tmp, 'tools'));
for (const f of ['latch-check.js', 'latch-registry.js', 'latch-nonblocking.json', 'latch-blocking-extra.json']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(tmp, 'tools', f));
fs.writeFileSync(path.join(tmp, 'index.html'), fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '\n<script>window._rb2p_newLatchX = true;</script>\n');
const r2 = run(tmp);
check('L2 a planted, unregistered latch fails the check (and is named)', r2.code === 1 && /_rb2p_newLatchX/.test(r2.out), r2.out.split('\n').slice(0, 6).join(' | '));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
