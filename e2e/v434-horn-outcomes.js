// e2e/v434-horn-outcomes.js — the horn after the last downs that need a real play to happen (HORN-RESEARCH.md §4.2):
// e2e/v434-horn.js covers the FOVL state at every horn and the punt; this suite covers what else can end a quarter.
//   M2  a run that runs out the Q2 clock, no possession change (a guard: green on V433 too)
//   M3  an interception on the last down of Q1 (the other team starts Q2 at the spot, 1st & 10)
//   M5  a field goal on the last down of Q1 (kicked for real; the other team receives)
//   M6  a touchdown on the last down of Q1 / Q2 / Q3, then its try (V434 C10, C13: the scorer kicks off; at halftime
//       Team B — the scorer never gets a free down in the next period)
//   M7  a pick-six on the last down of Q1 (a guard)
//   M10 a pick-six at the Q4 horn that ties the game before its try (V434 C6, FGXJ): the try decides before overtime
//   M8  the receiver reloads after taking the horn hand-off (the FOVL state at halftime)
//   M9  the receiver's screen is off while the horn hand-off ships (the FOVL state at Q1)
// A case whose real play did not happen (exit 3: no interception, no touchdown) is re-run once and never counted as a
// pass; the suite fails if more than half of the cases stay inconclusive.
const { execFileSync } = require('child_process');
const path = require('path');
let pass = 0, fail = 0, setup = 0;
const cases = [
    ['M2 a run out of the Q2 clock (guard)', 'horn-last-down.js', { HORN_Q: '2', HORN_KIND: 'run' }],
    ['M3 an interception at the Q1 horn', 'horn-last-down.js', { HORN_Q: '1', HORN_KIND: 'int' }],
    ['M5 a field goal at the Q1 horn', 'horn-last-down.js', { HORN_Q: '1', HORN_KIND: 'fg' }],
    ['M6 a touchdown and its try at the Q1 horn', 'horn-last-down.js', { HORN_Q: '1', HORN_KIND: 'td' }],
    ['M6 a touchdown and its try at the halftime horn', 'horn-last-down.js', { HORN_Q: '2', HORN_KIND: 'td' }],
    ['M6 a touchdown and its try at the Q3 horn', 'horn-last-down.js', { HORN_Q: '3', HORN_KIND: 'td' }],
    ['M7 a pick-six at the Q1 horn (guard)', 'horn-last-down.js', { HORN_Q: '1', HORN_KIND: 'pick6' }],
    ['M10 a pick-six ties it at the Q4 horn — the try decides before overtime', 'horn-last-down.js', { HORN_Q: '4', HORN_KIND: 'pick6', HORN_SCORE: 'p6tie' }],
    ['M8 the receiver reloads at the halftime horn', 'horn-fovl.js', { HORN_Q: '2', HORN_EVENT: 'reload' }],
    ['M9 the receiver\'s screen is off at the Q1 horn', 'horn-fovl.js', { HORN_Q: '1', HORN_EVENT: 'hidden' }],
];
console.log('=== V434 THE HORN — LAST-DOWN OUTCOMES ===');
for (const [name, file, env] of cases) {
    let code = null, out = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
        try { out = execFileSync(process.execPath, [path.join(__dirname, file)], { env: Object.assign({}, process.env, env), encoding: 'utf8', timeout: 420000 }); code = 0; }
        catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); code = e.status; }
        if (code !== 3) break;
        console.log('  (re-run: ' + name + ' — the real play did not produce the case)');
    }
    const fails = out.split('\n').filter(l => /^\s+FAIL/.test(l)).map(l => l.trim().slice(0, 220));
    if (code === 0) { pass++; console.log('  PASS  ' + name); }
    else if (code === 3) { setup++; console.log('  ----  ' + name + ' — inconclusive twice (the real play did not happen; not a pass)'); }
    else { fail++; console.log('  FAIL  ' + name + ' (exit ' + code + ')' + (fails.length ? '\n        ' + fails.join('\n        ') : '')); }
}
if (setup * 2 > cases.length) { fail++; console.log('  FAIL  more than half of the cases were inconclusive (' + setup + ' of ' + cases.length + ') — nothing proven'); }
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed' + (setup ? ' (' + setup + ' inconclusive)' : '') + ' ===');
process.exit(fail ? 1 : 0);
