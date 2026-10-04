// e2e/plays-archive.js — V458: the Mac side of the play recorder (tools/plays-archive.js), on a harness room and a
// throw-away archive folder. No browser.
//   A1  a play older than 24 h is moved: the local copy has the same numbers, and its Firebase node is gone
//   A2  a play under 24 h stays in Firebase and is not archived yet
//   A3  the archive keeps 30 days: a day folder 31 days old is deleted, one 29 days old is kept
//   A4  the month's ledger counts the bytes it downloaded; under budget the verdict is recording ON
//   A5  the guard: with the budget spent, the verdict is recording OFF (nothing is published here: --no-flag)
//   A6  a play the daily highlights already copied into the archive is not downloaded again: its Firebase node goes, the
//       copy stays as it was, and the month's ledger does not count it twice
//   A7  the daily highlights' own downloads (ledger-highlights.json) count toward the month's budget
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const TP = require('./two-player');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const pad = n => String(n).padStart(2, '0');
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

(async () => {
    console.log('=== V458 THE PLAYS ARCHIVE ===');
    const code = TP.randomCode();
    const arch = fs.mkdtempSync(path.join(os.tmpdir(), 'plays-archive-'));
    const run = (env, extra) => { try { return execFileSync('node', [path.join(__dirname, '..', 'tools', 'plays-archive.js'), '--room', code, '--no-flag'].concat(extra || []),
        { env: Object.assign({}, process.env, { PLAYS_ARCHIVE: arch }, env), encoding: 'utf8', timeout: 120000 }); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };
    try {
        const now = Date.now(), oldMs = now - 25 * 3600e3, newMs = now - 3600e3;
        const play = ms => ({ v: 1, room: code, role: 'a', at: ms, q: 2, clk: 50, d: 3, y: 21, n: 3, ms: 140, enc: 'b64', z: Buffer.from('numbers of a play ' + ms).toString('base64'), res: { type: 'pass', name: 'KITTLE', gain: 29 } });
        await TP.fbPut('rooms/' + code + '/plays/a/p' + oldMs, play(oldMs));
        await TP.fbPut('rooms/' + code + '/plays/a/p' + newMs, play(newMs));
        const d31 = dayKey(now - 31 * 86400e3), d29 = dayKey(now - 29 * 86400e3);
        for (const d of [d31, d29]) { fs.mkdirSync(path.join(arch, d, 'ZZZZ'), { recursive: true }); fs.writeFileSync(path.join(arch, d, 'ZZZZ', 'a-p1.json'), '{}'); }
        const out1 = run({});
        console.log('  ' + out1.trim().split('\n').pop());
        const local = path.join(arch, dayKey(oldMs), code, 'a-p' + oldMs + '.json');
        const copy = fs.existsSync(local) ? JSON.parse(fs.readFileSync(local, 'utf8')) : null;
        const goneOld = (await TP.fbGet('rooms/' + code + '/plays/a/p' + oldMs)) === null;
        const keptNew = !!(await TP.fbGet('rooms/' + code + '/plays/a/p' + newMs));
        const archivedNew = fs.existsSync(path.join(arch, dayKey(newMs), code, 'a-p' + newMs + '.json'));
        check('A1 a play older than 24 h moves: the local copy has the same numbers and its Firebase node is gone',
              !!copy && copy.z === play(oldMs).z && copy.res.name === 'KITTLE' && goneOld, JSON.stringify({ local: !!copy, goneOld }));
        check('A2 a play under 24 h stays in Firebase, not archived yet', keptNew && !archivedNew, JSON.stringify({ keptNew, archivedNew }));
        check('A3 30 days kept: the 31-day-old day folder is deleted, the 29-day-old one kept',
              !fs.existsSync(path.join(arch, d31)) && fs.existsSync(path.join(arch, d29)), JSON.stringify({ d31: fs.existsSync(path.join(arch, d31)), d29: fs.existsSync(path.join(arch, d29)) }));
        const ledger = JSON.parse(fs.readFileSync(path.join(arch, 'ledger.json'), 'utf8'));
        check('A4 the ledger counts what was downloaded; under budget the verdict is recording ON',
              ledger.bytes > 0 && ledger.plays === 1 && /recording ON/.test(out1), JSON.stringify({ bytes: ledger.bytes, plays: ledger.plays }));
        const out2 = run({ PLAYS_BUDGET_MB: '0.0001' });
        console.log('  ' + out2.trim().split('\n').pop());
        check('A5 the guard: with the month\'s budget spent, the verdict is recording OFF', /recording OFF \(budget reached\)/.test(out2), out2.trim().split('\n').pop());
        // ---- A6: the highlights' copy is the play ----
        const ms6 = now - 26 * 3600e3, big = play(ms6); big.z = Buffer.alloc(60000, 7).toString('base64');   // ~80 KB: a download would show
        await TP.fbPut('rooms/' + code + '/plays/b/p' + ms6, big);
        const f6 = path.join(arch, dayKey(ms6), code, 'b-p' + ms6 + '.json');
        fs.mkdirSync(path.dirname(f6), { recursive: true }); fs.writeFileSync(f6, JSON.stringify(big));
        const mtime6 = fs.statSync(f6).mtimeMs, bytes0 = JSON.parse(fs.readFileSync(path.join(arch, 'ledger.json'), 'utf8')).bytes;
        await new Promise(r => setTimeout(r, 1100));
        const out6 = run({});
        const gone6 = (await TP.fbGet('rooms/' + code + '/plays/b/p' + ms6)) === null;
        const bytes1 = JSON.parse(fs.readFileSync(path.join(arch, 'ledger.json'), 'utf8')).bytes;
        check('A6 a play the highlights already copied is not downloaded again: its node goes, the copy stays, the ledger does not count it',
              gone6 && fs.statSync(f6).mtimeMs === mtime6 && bytes1 - bytes0 < 20000, JSON.stringify({ gone6, kept: fs.statSync(f6).mtimeMs === mtime6, added: bytes1 - bytes0, line: out6.trim().split('\n').pop() }));
        // ---- A7: the highlights' downloads count ----
        const usedMB = bytes1 / 1048576;
        fs.writeFileSync(path.join(arch, 'ledger-highlights.json'), JSON.stringify({ month: JSON.parse(fs.readFileSync(path.join(arch, 'ledger.json'), 'utf8')).month, bytes: 5 * 1048576 }));
        const out7 = run({ PLAYS_BUDGET_MB: String(Math.max(1, Math.ceil(usedMB + 1))) });
        check('A7 the highlights\' downloads count toward the month\'s budget (with them it is spent: recording OFF)', /recording OFF \(budget reached\)/.test(out7), out7.trim().split('\n').pop());
    } finally {
        try { await TP.deleteRoom(code); } catch (e) {}
        try { fs.rmSync(arch, { recursive: true, force: true }); } catch (e) {}
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
