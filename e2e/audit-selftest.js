// e2e/audit-selftest.js — the auditor catches the bugs this project has
// actually had, and stays quiet on a clean game.
//
// Runs a real two-player harness game so the V365 telemetry stream is the
// genuine article, injects the exact irregularities from the bug reports,
// pulls the stream back over REST, and runs tools/audit-game.js's rule engine
// on it.
//
// T1  the stream exists for both roles, with bind/stage/wait entries
// T2  a play whose line moved by the wrong amount is flagged (R-YARD)
// T3  a score that goes down is flagged (R-SCORE)
// T4  both devices waiting > 12s is flagged as a DEADLOCK (R-POSS)
// T5  an overlay flicker is flagged (R-OVL)
// T6  a formation on screen while parked with the cover off is flagged (R-OVL)
// T7  a pick-6 chain that stops after `applied` is flagged (R-P6)
// T8  a clean stretch of play produces no flags at all
// T9  a phantom pick-6 (after a boot / not +6 / no +6 landed) is flagged (R-P6)
// T10 the line moving between two plays is flagged (R-CONT + R-CLOCK)
const H = require('./harness');
const TP = require('./two-player');
const { audit, toTimeline } = require('../tools/audit-game.js');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const has = (res, rule, re) => res.flags.some(f => f.rule === rule && (!re || re.test(f.msg)));

async function pull(g) {
    await g.a.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await g.b.page.evaluate(() => window._rb2p_auditFlushNow && window._rb2p_auditFlushNow());
    await sleep(900);
    const aud = await TP.fbGet('rooms/' + g.code + '/audit') || {};
    return toTimeline({ a: aud.a || {}, b: aud.b || {} });
}

// ---- V380 (room XEDG): the four new rules, on hand-built timelines ----
// T11 the scorer snapping a normal down after its conversion offer (R-GIFT)
// T12 a handoff received while live and applied 20s later / queued (R-STALE)
// T13 the keep-drive firing three times in one quarter (R-KEEP)
// T14 the 300s fallback firing (R-FALLBACK)
// T15 both waiting while one screen is hidden reads "screen was off" (R-POSS)
// T16 8.0 gained with 8.6 to go is NOT a first down — no R-DOWN
function synthetic() {
    const T0 = 1700000000000;
    const mk = (role, dt, k, f) => Object.assign({ t: T0 + dt, role: role, k: k }, f || {});
    const runs = {};
    runs.gift = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L2 pick-6' }),
                 mk('a', 9000, 'snap', { q: 2, clk: 51, y: 48, d: 1, tg: 10, poss: 1, dir: 1 })];
    runs.giftOk = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }),
                   mk('a', 4000, 'snap', { q: 2, clk: 43, y: 35, d: 6, tg: 2, poss: 1, dir: 1 }), mk('a', 9000, 'send', { type: 'KICKOFF', ts: T0 + 9000 })];
    runs.stale = [mk('b', 0, 'bind', { ver: 'V380' }), mk('b', 1000, 'wait', { on: false, why: 'L1' }),
                  mk('b', 5000, 'recv', { type: 'OTHER', ts: 777, via: 'sdk' }), mk('b', 30000, 'wait', { on: true, why: 'L2' }),
                  mk('b', 30100, 'apply', { type: 'OTHER', ts: 777, lagMs: 25100 })];
    runs.staleOld = [mk('b', 0, 'bind', { ver: 'V378' }), mk('b', 1000, 'wait', { on: false, why: 'L1' }), mk('b', 5000, 'recv', { type: 'OTHER', ts: 777, via: 'sdk' })];
    runs.purgedAtQ = [mk('b', 0, 'bind', { ver: 'V380' }), mk('b', 900, 'q', { from: 2, to: 3, clk: 120, d: 1, tg: 10, y: 0 }), mk('b', 1000, 'wait', { on: false, why: 'L1' }),
                      mk('b', 4000, 'recv', { type: 'OTHER', ts: 777, via: 'sdk' }), mk('b', 40000, 'purge', { type: 'OTHER', ts: 777, ageMs: 36000 })];
    runs.keep = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'keep', { q: 2, n: 1, y: 4, d: 1 }), mk('a', 2300, 'keep', { q: 2, n: 2, y: 4, d: 1 }), mk('a', 3600, 'keep', { q: 2, n: 3, y: 4, d: 1 }), mk('a', 4900, 'keep', { q: 2, n: 4, y: 4, d: 1 })];   // V394: the 4th is the loop
    runs.keepOld = [mk('a', 0, 'bind', { ver: 'V378' }), mk('a', 500, 'q', { from: 1, to: 2, clk: 120, d: 1, tg: 10, y: 4 }),
                    mk('a', 1000, 'diag', { m: 'QTR-KEEP resume Q2 y4 d1 clk=120' }), mk('a', 2300, 'diag', { m: 'QTR-KEEP resume Q2 y4 d1 clk=120' }), mk('a', 3600, 'diag', { m: 'QTR-KEEP resume Q2 y4 d1 clk=120' })];
    runs.fallback = [mk('b', 0, 'bind', { ver: 'V380' }), mk('b', 1000, 'guard', { what: 'fallback300', why: 'fired' })];
    runs.hidden = [mk('a', 0, 'bind', { ver: 'V380' }), mk('b', 0, 'bind', { ver: 'V380' }), mk('a', 500, 'wait', { on: true, why: 'L1' }), mk('b', 500, 'wait', { on: true, why: 'L1' }),
                   mk('a', 600, 'vis', { h: true })];
    for (let i = 0; i <= 14; i++) runs.hidden.push(mk('a', 1000 + i * 1000, 'stage', { of: 0, df: 0, ball: 0, wait: true, ovl: true, fps: 60 }));
    runs.down = [mk('a', 0, 'bind', { ver: 'V380' }), mk('a', 1000, 'settle', { type: 'run', name: 'WALKER', gain: 1, y: -7.71, d: 2, tg: 8.59, q: 1, clk: 20, su: 0, so: 0, y0: -9.12, d0: 1 }),
                 mk('a', 2000, 'snap', { q: 1, clk: 20, y: -7.71, d: 2, tg: 8.59, poss: 1, dir: 1 }),
                 mk('a', 8000, 'settle', { type: 'run', name: 'WALKER', gain: 8, y: 0.27, d: 3, tg: 0.62, q: 1, clk: 10, su: 0, so: 0, y0: -7.71, d0: 2 })];
    const A = tl => audit(tl.slice().sort((x, y) => x.t - y.t), {});
    check('T11 the scorer snapping a normal down after its conversion offer is a GIFT (R-GIFT)', has(A(runs.gift), 'R-GIFT', /snapped a normal down/), '');
    check('T11b a conversion kick (down 6) then a kickoff is not (no R-GIFT)', !has(A(runs.giftOk), 'R-GIFT'), JSON.stringify(A(runs.giftOk).flags.map(f => f.msg)));
    check('T12 a handoff received while live and applied 25s later is STALE (R-STALE)', has(A(runs.stale), 'R-STALE', /applied .* 25s after/), JSON.stringify(A(runs.stale).flags.map(f => f.msg)));
    check('T12b on an older build the same receipt is flagged as queued (R-STALE)', has(A(runs.staleOld), 'R-STALE', /queued it for the next park/), '');
    check('T12c a handoff purged right after a quarter change is quiet (no R-STALE)', !has(A(runs.purgedAtQ), 'R-STALE'), JSON.stringify(A(runs.purgedAtQ).flags.map(f => f.msg)));
    check('T13 the keep-drive firing four times in one quarter is flagged (R-KEEP)', has(A(runs.keep), 'R-KEEP', /4 times in Q2/), JSON.stringify(A(runs.keep).flags.map(f => f.msg)));
    check('T13b ...and on an older build from its diag lines (R-KEEP)', has(A(runs.keepOld), 'R-KEEP', /resume x3 in Q2/), JSON.stringify(A(runs.keepOld).flags.map(f => f.msg)));
    check('T14 the 300s fallback firing is flagged (R-FALLBACK)', has(A(runs.fallback), 'R-FALLBACK', /fired/), '');
    check('T15 both waiting while one screen is hidden reads as IDLE, not DEADLOCK (R-POSS)', has(A(runs.hidden), 'R-POSS', /IDLE: .* a's screen was hidden/) && !has(A(runs.hidden), 'R-POSS', /DEADLOCK/), JSON.stringify(A(runs.hidden).flags.map(f => f.msg)));
    check('T16 8.0 gained with 8.6 to go leaves 3rd down — no R-DOWN', !has(A(runs.down), 'R-DOWN'), JSON.stringify(A(runs.down).flags.map(f => f.msg)));
    // V382: a refused clock write is on record
    runs.clock = [mk('b', 0, 'bind', { ver: 'V382' }), mk('b', 1000, 'clock', { from: 65, to: 118, q: 3, who: 'L10259', n: 1 })];
    check('T17 a clock write the law refused is flagged with its writer (R-CLOCK)', has(A(runs.clock), 'R-CLOCK', /65s -> 118s in Q3 .* REFUSED \(writer L10259\)/), JSON.stringify(A(runs.clock).flags.map(f => f.msg)));
    // V390: repeats fold, impact is classified, close problems compound
    runs.repeat = [mk('a', 0, 'bind', { ver: 'V390' })]; for (let i = 0; i < 7; i++) runs.repeat.push(mk('a', 1000 + i * 3000, 'diag', { m: 'FB-STALL live -> REST' }));
    const rr = A(runs.repeat);
    check('T18 the same problem seven times is ONE line marked x7 (not seven)', rr.flags.length === 1 && rr.flags[0].count === 7 && /7 times/.test(rr.flags[0].plain) && rr.rawFlags.length === 7, JSON.stringify(rr.flags.map(f => f.plain)));
    check('T18b a connection stall the backup covered is NOT NOTICEABLE (impact 0)', rr.flags[0].impact === 0 && rr.impact.worstName === 'invisible', JSON.stringify(rr.impact));
    runs.deadlock = [mk('a', 0, 'bind', { ver: 'V390' }), mk('b', 0, 'bind', { ver: 'V390' }), mk('a', 500, 'wait', { on: true, why: 'L1' }), mk('b', 500, 'wait', { on: true, why: 'L1' })];
    for (let i = 0; i <= 14; i++) runs.deadlock.push(mk('a', 1000 + i * 1000, 'stage', { of: 0, df: 0, ball: 0, wait: true, ovl: true, fps: 60 }));
    const rc = A(runs.clock), rk = A(runs.keep), rh = A(runs.hidden), rs = A(runs.stale), rd = A(runs.deadlock);
    check('T19 impact: a refused clock write = invisible; a keep loop = ball moved; a late handoff = score/clock; a screen off = invisible; a true deadlock = game frozen',
          rc.flags[0].impact === 0 && rk.flags[0].impact === 1 && rs.flags[0].impact === 2 && rh.flags.some(f => f.rule === 'R-POSS' && f.impact === 0) && rd.flags.some(f => /DEADLOCK/.test(f.msg) && f.impact === 3),
          JSON.stringify({ rc: rc.flags[0].impact, rk: rk.flags[0].impact, rs: rs.flags[0].impact, rh: rh.flags.map(f => f.rule + f.impact), rd: rd.flags.map(f => f.rule + f.impact) }));
    // a NORMAL touchdown's conversion resolves through the engine (+1 score, then the kickoff) — not a freeze
    runs.patOk = [mk('a', 0, 'bind', { ver: 'V390' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }), mk('a', 4000, 'stage', { of: 11, df: 11, ball: 1, kp: 7, wait: false, ovl: false, fps: 60 }),
                  mk('a', 6000, 'score', { su: 7, so: 0, dsu: 1, dso: 0, q: 1, clk: 40 }), mk('a', 9000, 'send', { type: 'KICKOFF', ts: 9000 })];
    check('T19b a normal touchdown\'s conversion that scored is not "never resolved" (no R-P6)', !has(A(runs.patOk), 'R-P6'), JSON.stringify(A(runs.patOk).flags.map(f => f.msg)));
    // ILVQ: a try at the horn that ended as an ordinary possession change instead of a kickoff
    runs.patCut = [mk('b', 0, 'bind', { ver: 'V391' }), mk('b', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }), mk('b', 4000, 'stage', { of: 11, df: 11, ball: 1, kp: 7, wait: false, ovl: false, fps: 60 }),
                   mk('b', 7000, 'send', { type: 'OTHER', ts: 7000, y: -39, q: 2, clk: 1 })];
    const rpc = A(runs.patCut);
    check('T21 a conversion handed over as OTHER instead of a kickoff is "cut off" (R-P6, ball moved)', has(rpc, 'R-P6', /instead of a kickoff/) && rpc.flags[0].impact === 1, JSON.stringify(rpc.flags.map(f => f.msg + ':' + f.impact)));
    // V394: three shapes that are football, not bugs
    runs.mirror = [mk('a', 0, 'bind', { ver: 'V394' }), mk('a', 1000, 'snap', { q: 1, clk: 42, y: -22.53, d: 4, tg: 5.05, poss: 1, dir: -1 }),
                   mk('a', 9000, 'settle', { type: 'run', name: 'X', gain: -4, y: 26.46, d: 1, tg: 10, q: 1, clk: 32, su: 3, so: 0, y0: -22.53, d0: 4 })];
    check('T22 a failed 4th down that mirrors the line for the other team is not a wrong yard line', !has(A(runs.mirror), 'R-YARD'), JSON.stringify(A(runs.mirror).flags.map(f => f.msg)));
    runs.spot = [mk('a', 0, 'bind', { ver: 'V394' }), mk('a', 1000, 'settle', { type: 'pass', name: 'X', gain: 20, y: 48, d: 6, tg: 2, q: 2, clk: 50, su: 6, so: 0, y0: 28, d0: 1 }),
                 mk('a', 4000, 'snap', { q: 2, clk: 50, y: 35, d: 6, tg: 2, poss: 1, dir: 1 })];
    check('T23 choosing the 1-point kick (the 2 -> the 15 on down 6) is not a moved line', !has(A(runs.spot), 'R-CONT'), JSON.stringify(A(runs.spot).flags.map(f => f.msg)));
    runs.keep3 = [mk('a', 0, 'bind', { ver: 'V394' }), mk('a', 1000, 'keep', { q: 2, n: 1, y: 4, d: 1 }), mk('a', 2300, 'keep', { q: 2, n: 2, y: 4, d: 1 }), mk('a', 3600, 'keep', { q: 2, n: 3, y: 4, d: 1 })];
    runs.keep4 = runs.keep3.concat([mk('a', 4900, 'keep', { q: 2, n: 4, y: 4, d: 1 })]);
    // V395: the post-try hand-off ships typed TD since V394 — that RESOLVES the conversion (no R-P6, no R-GIFT)
    runs.patTd = [mk('a', 0, 'bind', { ver: 'V394' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }), mk('a', 4000, 'stage', { of: 11, df: 11, ball: 1, kp: 7, wait: false, ovl: false, fps: 60 }),
                  mk('a', 7000, 'diag', { m: 'PAT-INV duty retired (conversion over)' }), mk('a', 9000, 'send', { type: 'TD', ts: T0 + 9000, y: 48, q: 1, clk: 100 })];
    check('T25 a conversion followed by the typed-TD hand-off is resolved (no R-P6 "never resolved", no R-GIFT)', !has(A(runs.patTd), 'R-P6') && !has(A(runs.patTd), 'R-GIFT'), JSON.stringify(A(runs.patTd).flags.map(f => f.msg)));
    // V397: a rematch in the same room is a new game — no window reaches across it
    runs.rematch = [mk('a', 0, 'bind', { ver: 'V395' }), mk('a', 100, 'diag', { m: 'TURN-> a (match-start)' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }),
                    mk('a', 4000, 'snap', { q: 4, clk: 0, y: 35, d: 6, tg: 2, poss: 1, dir: -1 }), mk('a', 9000, 'final', { su: 60, so: 56 }), mk('b', 9200, 'final', { su: 56, so: 60 }),
                    mk('a', 20000, 'diag', { m: 'boot' }), mk('a', 30000, 'diag', { m: 'TURN-> a (match-start)' }), mk('b', 30100, 'wait', { on: true, why: 'L5407' }),
                    mk('a', 33000, 'snap', { q: 1, clk: 180, y: -12, d: 1, tg: 10, poss: 1, dir: 1 })];
    const rrm = A(runs.rematch);
    check('T26 a rematch\'s first snap is not a GIFT of the previous game\'s conversion (two games audited apart)', !has(rrm, 'R-GIFT') && rrm.games === 2, JSON.stringify({ games: rrm.games, flags: rrm.flags.map(f => f.msg) }));
    // V397: the scorer's 'applied' a second before the thrower's 'detected'/'sent' (clock skew) is the same chain
    runs.skew = [mk('a', 0, 'bind', { ver: 'V395' }), mk('b', 0, 'bind', { ver: 'V395' }),
                 mk('a', 5000, 'p6', { step: 'applied', su: 26, so: 0 }), mk('a', 5000, 'conv', { ev: 'modal', lic: 'L2 pick-6 (bridge-authorized)' }),
                 mk('b', 6000, 'p6', { step: 'detected', src: 'score-watcher(+6)' }), mk('b', 6100, 'p6', { step: 'sent', plus6: true, su: 0, so: 26 }),
                 mk('a', 12000, 'p6', { step: 'resolved', pts: 0 }), mk('a', 14000, 'p6', { step: 'resultSent', su: 26, so: 0 }), mk('b', 15000, 'p6', { step: 'resultApplied', su: 0, so: 26 })];
    check('T27 a pick-six credited a second before the sender stamped it (clock skew) is a whole chain (no "chain broke")', !has(A(runs.skew), 'R-P6', /chain broke/), JSON.stringify(A(runs.skew).flags.map(f => f.msg)));
    // V397: a pick-six step logged after the FINAL is the game-over screen's tail
    runs.postFinal = [mk('a', 0, 'bind', { ver: 'V395' }), mk('a', 1000, 'final', { su: 76, so: 0 }), mk('b', 1200, 'final', { su: 0, so: 76 }),
                      mk('a', 5000, 'p6', { step: 'detected', src: 'score-watcher(+6)' }), mk('a', 5100, 'p6', { step: 'resultSent', synthetic: true, su: 78, so: 0 })];
    check('T28 a pick-six step after the final is not a broken chain (no R-P6)', !has(A(runs.postFinal), 'R-P6'), JSON.stringify(A(runs.postFinal).flags.map(f => f.msg)));
    // V397: A's conversion crossing the halftime horn (+2 at Q3 3:00, then the hand-off) is not A holding the second-half ball
    runs.halfTail = [mk('a', 0, 'bind', { ver: 'V395' }), mk('b', 0, 'bind', { ver: 'V395' }), mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }),
                     mk('a', 4000, 'snap', { q: 2, clk: 0, y: 48, d: 6, tg: 2, poss: 1, dir: 1 }), mk('a', 11000, 'q', { from: 2, to: 3, clk: 180, d: 1, tg: 2, y: 48 }), mk('b', 11000, 'q', { from: 2, to: 3, clk: 180, d: 1, tg: 10, y: -25 }),
                     mk('a', 11100, 'score', { su: 30, so: 24, dsu: 2, dso: 0, q: 3, clk: 180 }), mk('a', 14000, 'send', { type: 'TD', ts: T0 + 14000, q: 3, clk: 180 }),
                     mk('b', 17000, 'snap', { q: 3, clk: 180, y: -24, d: 1, tg: 10, poss: 1, dir: -1 })];
    check('T29 a conversion that crosses the halftime horn is not A taking the second-half ball (no R-HALF)', !has(A(runs.halfTail), 'R-HALF'), JSON.stringify(A(runs.halfTail).flags.map(f => f.msg)));
    runs.finalMid = [mk('a', 0, 'bind', { ver: 'V395' }), mk('b', 0, 'bind', { ver: 'V395' }), mk('b', 1000, 'p6', { step: 'detected', src: 'score-watcher(+6)' }), mk('b', 1100, 'p6', { step: 'sent', plus6: true, su: 0, so: 76 }),
                     mk('a', 1500, 'p6', { step: 'applied', su: 76, so: 0 }), mk('a', 1500, 'conv', { ev: 'modal', lic: 'L2 pick-6 (bridge-authorized)' }),
                     mk('b', 3000, 'final', { su: 0, so: 76 }), mk('a', 3500, 'final', { su: 76, so: 0 }), mk('a', 8000, 'p6', { step: 'resultSent', synthetic: true, su: 78, so: 0 })];
    check('T28b a chain that was running when the final came stopped, it did not break (no R-P6)', !has(A(runs.finalMid), 'R-P6', /chain broke/), JSON.stringify(A(runs.finalMid).flags.map(f => f.msg)));
    // V398: the 'game' marker splits a reused room; the narrator draws the barrier; flags say which game
    {
        const R = require('../tools/audit-rules.js');
        runs.marked = [mk('a', 0, 'bind', { ver: 'V398' }), mk('b', 0, 'bind', { ver: 'V398' }), mk('a', 100, 'game', { qmins: 3, ver: 'V398' }), mk('b', 900, 'game', { qmins: 3, ver: 'V398' }),
                       mk('a', 1000, 'conv', { ev: 'modal', lic: 'L1 touchdown' }), mk('a', 4000, 'snap', { q: 4, clk: 0, y: 35, d: 6, tg: 2, poss: 1, dir: -1 }), mk('a', 9000, 'final', { su: 60, so: 56 }),
                       mk('a', 30000, 'game', { qmins: 3, ver: 'V398' }), mk('b', 30400, 'game', { qmins: 3, ver: 'V398' }), mk('a', 33000, 'snap', { q: 1, clk: 180, y: -12, d: 1, tg: 10, poss: 1, dir: 1 }),
                       mk('a', 40000, 'settle', { type: 'run', name: 'X', gain: 5, y: 0, d: 2, tg: 5, q: 1, clk: 170, su: 0, so: 0, y0: -12, d0: 1 })];
        const rm = A(runs.marked); const st = R.narrate(runs.marked.slice().sort((x, y) => x.t - y.t), {}).filter(x => x.kind === 'game');
        check('T30 two game markers = two games checked apart, a barrier line in the story, and a flag names its game',
              rm.games === 2 && R.gameStarts(runs.marked).length === 2 && st.length === 1 && /GAME 2 OF 2/.test(st[0].text) && has(rm, 'R-YARD', /run for 5/) && /^Game 2 of 2 in this room/.test(rm.flags.find(f => f.rule === 'R-YARD').plain) && !has(rm, 'R-GIFT'),
              JSON.stringify({ games: rm.games, story: st.map(x => x.text), flags: rm.flags.map(f => f.plain) }));
    }
    check('T24 the gate refusing a third keep is quiet; a fourth is a loop (R-KEEP)', !has(A(runs.keep3), 'R-KEEP') && has(A(runs.keep4), 'R-KEEP'), JSON.stringify([A(runs.keep3).flags.length, A(runs.keep4).flags.length]));
    // three real problems inside 25s: a chain, one level worse than its worst member
    runs.chain = [mk('a', 0, 'bind', { ver: 'V390' }),
        mk('a', 1000, 'settle', { type: 'pass', name: 'X', gain: 15, y: 5, d: 1, tg: 10, q: 1, clk: 44, su: 0, so: 0, y0: 0, d0: 1 }),
        mk('a', 6000, 'settle', { type: 'pass', name: 'X', gain: 8, y: 10.7, d: 2, tg: 2.5, q: 1, clk: 40, su: 0, so: 0, y0: 3.2, d0: 1 }), mk('a', 6500, 'snap', { q: 1, clk: 38, y: 3.2, d: 1, tg: 10, poss: 1, dir: 1 }),   // clock keeps running: the chain is three ball/down problems only
        mk('a', 12000, 'keep', { q: 2, n: 4, y: 4, d: 1 })];   // V394: a fourth keep is the loop
    const rch = A(runs.chain);
    check('T20 three ball/down problems within 25s compound into a SCORE-OR-CLOCK-level chain', rch.impact.chains === 1 && rch.flags.every(f => f.chain === 1) && rch.impact.worstName === 'scoreclock', JSON.stringify({ chains: rch.impact.chains, worst: rch.impact.worstName, flags: rch.flags.map(f => f.rule + ':' + f.impact + ':' + (f.chainImpactName || '-')) }));
}

(async () => {
    console.log('=== AUDIT SELF-TEST ===');
    synthetic();
    const g = await TP.startTwoPlayerGame({});
    await sleep(6000);

    // ---- T1: the stream is real ----
    let tl = await pull(g);
    const kinds = {}; tl.forEach(e => { kinds[e.k] = (kinds[e.k] || 0) + 1; });
    console.log('  T1 kinds: ' + JSON.stringify(kinds));
    check('T1 both devices are streaming (bind + stage + wait present)',
          tl.some(e => e.role === 'a' && e.k === 'bind') && tl.some(e => e.role === 'b' && e.k === 'bind') &&
          kinds.stage > 0 && kinds.wait > 0, JSON.stringify(kinds));

    // ---- T8 first: a clean stretch — no flags ----
    const clean = audit(tl, {});
    check('T8 a clean start of a game produces no flags', clean.flags.length === 0,
          JSON.stringify(clean.flags.map(f => f.rule + ': ' + f.msg)));

    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    // ---- T2: a settle whose line is wrong ----
    await off.page.evaluate(() => {
        window._rb2p_audit('snap', { q: 1, clk: 50, y: 0, d: 1, tg: 10, poss: 1, dir: 1 });
        window._rb2p_audit('settle', { type: 'pass', name: 'KITTLE', gain: 15, y: 5, d: 1, tg: 10, q: 1, clk: 44, su: 0, so: 0, y0: 0, d0: 1 });
    });
    // ---- T3: a score that goes down ----
    await off.page.evaluate(() => { window._rb2p_audit('score', { su: 7, so: 0, dsu: 7, dso: 0, q: 1, clk: 40 }); window._rb2p_audit('score', { su: 0, so: 0, dsu: -7, dso: 0, q: 1, clk: 39 }); });
    // ---- T5: a flicker ----
    await def.page.evaluate(() => { for (let i = 0; i < 5; i++) window._rb2p_audit('ovl', { shown: i % 2 === 0, why: 'test' }); });
    // ---- T4 + T6: both waiting with a formation staged, for 13s of stage samples ----
    // Tagged so the test can re-stamp their times below (a real 13s would
    // make this suite slow for nothing).
    await off.page.evaluate(() => {
        window._rb2p_audit('wait', { on: true, why: 'test', tag: 'dl' });
        for (let i = 0; i <= 14; i++) window._rb2p_audit('stage', { of: 11, df: 11, ball: 1, kp: 0, wait: true, ovl: false, fps: 60, tag: 'dl', i: i });
    });
    await def.page.evaluate(() => {
        window._rb2p_audit('wait', { on: true, why: 'test', tag: 'dl' });
        for (let i = 0; i <= 14; i++) window._rb2p_audit('stage', { of: 0, df: 0, ball: 0, kp: null, wait: true, ovl: true, fps: 60, tag: 'dl', i: i });
    });
    // ---- T7: a pick-6 chain that dies after `applied` ----
    await off.page.evaluate(() => { window._rb2p_audit('p6', { step: 'detected', src: 'test' }); window._rb2p_audit('p6', { step: 'sent', plus6: true }); });
    await def.page.evaluate(() => { window._rb2p_audit('p6', { step: 'applied', su: 6, so: 0 }); });

    // ---- T9: a phantom pick-6 right after a boot, shipped without its +6 ----
    await def.page.evaluate(() => { window._rb2p_audit('diag', { m: 'boot' }); window._rb2p_audit('p6', { step: 'detected', src: 'score-watcher(+9)' }); window._rb2p_audit('p6', { step: 'sent', plus6: false }); });
    // ---- T10: the line moved between two plays ----
    await off.page.evaluate(() => {
        window._rb2p_audit('settle', { type: 'pass', name: 'KITTLE', gain: 8, y: 10.7, d: 2, tg: 2.5, q: 2, clk: 173, su: 0, so: 16, y0: 3.2, d0: 1 });
        window._rb2p_audit('snap', { q: 2, clk: 180, y: 3.2, d: 1, tg: 10, poss: 1, dir: 1 });
    });
    tl = await pull(g);
    // Re-stamp the tagged deadlock scenario onto a window that ENDS before the
    // pick-6 chain begins: the wait entries at T, the samples at T+1s..T+15s.
    const p6t = Math.min(...tl.filter(e => e.k === 'p6').map(e => e.t));
    const T = p6t - 20000;
    for (const e of tl) if (e.tag === 'dl') e.t = (e.k === 'wait') ? T : T + 1000 + (e.i || 0) * 1000;
    tl.sort((x, y) => x.t - y.t);
    const res = audit(tl, {});
    console.log('  flags: ' + res.flags.map(f => '[' + f.rule + '] ' + f.msg).join('\n         '));
    check('T2 a wrong line of scrimmage is flagged (R-YARD)', has(res, 'R-YARD', /should be 15/), '');
    check('T3 a score going down is flagged (R-SCORE)', has(res, 'R-SCORE', /DOWN/), '');
    check('T4 both devices waiting is flagged as a DEADLOCK (R-POSS)', has(res, 'R-POSS', /DEADLOCK/), '');
    check('T5 an overlay flicker is flagged (R-OVL)', has(res, 'R-OVL', /FLICKER/), '');
    check('T6 a formation on screen while parked with the cover off is flagged (R-OVL)', has(res, 'R-OVL', /EXPOSED FORMATION/), '');
    check('T7 a pick-6 chain that stops after applied is flagged (R-P6)', has(res, 'R-P6', /no (modal|resultSent)/), '');
    check('T9 a pick-6 detected right after a boot, or shipped without its +6, is a PHANTOM (R-P6)',
          has(res, 'R-P6', /PHANTOM PICK-6: detected .* after a boot/) && has(res, 'R-P6', /jumped \+9/) && has(res, 'R-P6', /WITHOUT the \+6/), '');
    check('T10 a line that moved between two plays is flagged (R-CONT) and the clock going up with it (R-CLOCK)',
          has(res, 'R-CONT', /LINE MOVED BETWEEN PLAYS/) && has(res, 'R-CLOCK', /between plays/), '');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
