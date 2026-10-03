// e2e/v434-horn.js — every quarter ends at its horn through the engine's own time-up: no 0:01 extra play, no bounce
// (the owner: "I want this glitch gone along with the buffer", "possession ALWAYS goes to Team B" at halftime).
// The research: ~/Projects/two-player-rb/.rb2p/research/HORN-RESEARCH.md (Opus 5.5 max, 2026-10-02). The cases are its tests, run with REAL
// downs (the QB bot's trusted input, the engine's own 4th-down dialog) — no synthetic drive end:
//
//   M1 Q1 / Q2 / Q3 / Q4 decided / Q4 tied  (e2e/horn-fovl.js) — FOVL's state: a real turnover on downs decided at 0:00,
//      handed to a phone that had itself handed off earlier. Must hold: the hand-off is stamped 0:00; nobody snaps in
//      the old quarter after it; nothing bounces and no rescuer acts; both phones reach the next period with ONE
//      offense — Q1/Q3 the team that has the ball at the turnover spot, 1st & 10, a full clock; halftime Team B's
//      kickoff; Q4 the stats screen (decided) or the overtime coin flip (tied)
//   M11 (V436, QAQL 2 Oct 7:40 pm) the FOVL state at Q1 where the receiver's own last play was a try: V434/V435 took it
//      for "my try crossed the horn" and handed the ball away / mirrored the field (b lost 32 yards)
//   M4 a punt at the Q1 horn (e2e/horn-last-down.js punt) — 4th & 15 with 0:03: the punt's 5-10 s are charged, the
//      hand-off ships Q1 0:00, the receiver starts Q2 at the punt spot, 1st & 10
//
// V433 (the live build before V434) fails every M1 case (OTHER clk1 and the 0:01 down) and M4 (the 0:01 run). A case
// whose setup the real play did not produce (exit 3) is re-run once and never counted as a pass.
const { execFileSync } = require('child_process');
const path = require('path');
let pass = 0, fail = 0;
const cases = [
    ['M1 Q1 horn (FOVL state)', 'horn-fovl.js', { HORN_Q: '1' }],
    ['M1 Q2 horn — halftime, Team B', 'horn-fovl.js', { HORN_Q: '2' }],
    ['M1 Q3 horn', 'horn-fovl.js', { HORN_Q: '3' }],
    ['M1 Q4 horn, decided — the final', 'horn-fovl.js', { HORN_Q: '4', HORN_SCORE: 'lead' }],
    ['M1 Q4 horn, tied — overtime', 'horn-fovl.js', { HORN_Q: '4', HORN_SCORE: 'tie' }],
    ['M4 a punt at the Q1 horn', 'horn-last-down.js', { HORN_Q: '1', HORN_KIND: 'punt' }],
    ['M11 the receiver\'s own last play was a try (QAQL, V436): the horn hand-off is not handed away or mirrored', 'horn-fovl.js', { HORN_Q: '1', HORN_EVENT: 'staletry' }],
];
console.log('=== V434 THE HORN ===');
for (const [name, file, env, args] of cases) {
    let code = null, out = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
        try { out = execFileSync(process.execPath, [path.join(__dirname, file)].concat(args || []), { env: Object.assign({}, process.env, env), encoding: 'utf8', timeout: 400000 }); code = 0; }
        catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); code = e.status; }
        if (code !== 3) break;
        console.log('  (re-run: ' + name + ' — the real play did not produce the case)');
    }
    const fails = out.split('\n').filter(l => /^\s+FAIL/.test(l)).map(l => l.trim().slice(0, 220));
    if (code === 0) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + ' (exit ' + code + ')' + (fails.length ? '\n        ' + fails.join('\n        ') : '')); }
}
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
