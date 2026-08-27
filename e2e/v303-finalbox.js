// e2e/v303-finalbox.js — the FINAL box score must never grow a scrollbar.
//
// Device report (screenshot, room UYJU): a light grey bar sat under the QB/RB/WR
// rows. It was the native horizontal SCROLLBAR of each stat row — the row was a
// single `white-space:pre; overflow-x:auto` box, so any line wider than the
// column both drew a scrollbar AND hid its own tail (B. Purdy's line was clipped
// at "2 INT · 5"). V303 splits the row into a fixed monospace POS+NAME prefix and
// a wrapping stat cell.
//
// T1  no stat row overflows horizontally (no scrollbar can render)
// T2  every stat line is fully visible — nothing is clipped off the right edge
// T3  the POS+NAME prefix still lines the stats up in one column
// T4  it still holds at a narrow (phone) width

const H = require('./harness');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// The real lines from room UYJU (final 29-0) — the exact ones that overflowed.
const PLAYERS = [
    { pos: 'QB', name: 'B. Purdy',      line: '9/14 · 166 PASS YDS · 2 PASS TD · 2 INT · 55 LG · 4 CAR · 9 RUSH YDS' },
    { pos: 'RB', name: 'C. McCaffrey',  line: '0 RUSH YDS · 3 REC · 42 REC YDS · 14.0 AVG · 1 REC TD · 19 LG' },
    { pos: 'WR', name: 'M. Evans',      line: '2 REC · 10 REC YDS · 5.0 AVG · 1 REC TD · 9 LG' },
    { pos: 'WR', name: 'J. Jennings',   line: '3 REC · 90 REC YDS · 30.0 AVG · 55 LG' },
    { pos: 'TE', name: 'G. Kittle',     line: '1 REC · 23 REC YDS · 23.0 AVG · 23 LG' },
    { pos: 'QB', name: 'A. Rodgers',    line: '4/14 · 55 PASS YDS · 4 INT · 36 LG · 1 CAR · -4 RUSH YDS' },
    { pos: 'DL', name: 'N. Bosa',       line: '0 TCK · 0 SCK · 0 INT' },
    { pos: 'DB', name: 'D. Lenoir',     line: '2 TCK · 0 SCK · 1 INT' }
];

// Pull the row markup straight out of index.html so the test can never drift
// from the shipped renderer.
function extractRowBuilder() {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const m = html.match(/var rows = players\.map\(function \(p\) \{[\s\S]*?\}\)\.join\(''\);/);
    if (!m) throw new Error('could not locate the FINAL row builder in index.html');
    return m[0];
}

(async () => {
    console.log('=== V303 FINAL BOX SCORE — NO SCROLLBARS ===');
    const rowSrc = extractRowBuilder();
    const browser = await H.launchBrowser();
    const page = await browser.newPage();

    const measure = async (width) => {
        await page.setViewport({ width, height: 900 });
        return page.evaluate((rowSrc, players) => {
            function esc(s) {
                return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
                    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            }
            function pad(str, n) {
                str = String(str);
                return str.length >= n ? str : str + new Array(n - str.length + 1).join(' ');
            }
            // Same column box the renderer wraps the rows in.
            document.body.innerHTML = '';   // measure() is called more than once
            document.body.style.cssText =
                'margin:0;background:#0a1018;color:#fff;font-family:monospace;';
            const col = document.createElement('div');
            col.style.cssText = 'flex:1;min-width:240px;max-width:440px;';
            // Run the shipped builder verbatim, with its free variables supplied.
            // `accent` is the team colour teamColumnHtml(rep, accent) is called
            // with (index.html — teamColumnHtml(me, youC) / (opp, oppC)); the
            // builder grew that dependency and this test was still passing only
            // players/esc/pad, so every run died on `accent is not defined`
            // before a single assertion ran.
            const accent = '#c8f560';
            const build = new Function('players', 'esc', 'pad', 'accent', rowSrc + '\nreturn rows;');
            col.innerHTML = build(players, esc, pad, accent);
            document.body.appendChild(col);

            const out = [];
            for (const row of col.children) {
                const cells = row.querySelectorAll('span');
                const statCell = cells[cells.length - 1];
                out.push({
                    text: row.textContent,
                    rowOverflow: row.scrollWidth - row.clientWidth,
                    cellOverflow: statCell ? statCell.scrollWidth - statCell.clientWidth : 0,
                    statLeft: statCell ? Math.round(statCell.getBoundingClientRect().left) : -1,
                    statRight: statCell ? Math.round(statCell.getBoundingClientRect().right) : -1,
                    colRight: Math.round(col.getBoundingClientRect().right)
                });
            }
            return out;
        }, rowSrc, PLAYERS);
    };

    // ---- wide (desktop) ----
    const wide = await measure(1200);
    check('T1 no stat row overflows horizontally at desktop width',
          wide.every(r => r.rowOverflow <= 1),
          wide.filter(r => r.rowOverflow > 1)
              .map(r => r.text.slice(0, 30) + ' overflow=' + r.rowOverflow + 'px').join(' | '));
    check('T2 no stat CELL is clipped (whole line visible, nothing hidden)',
          wide.every(r => r.cellOverflow <= 1),
          wide.filter(r => r.cellOverflow > 1)
              .map(r => r.text.slice(0, 30) + ' clipped=' + r.cellOverflow + 'px').join(' | '));
    check('T2 no stat text spills past the column edge',
          wide.every(r => r.statRight <= r.colRight + 1),
          wide.filter(r => r.statRight > r.colRight + 1)
              .map(r => r.text.slice(0, 30) + ' right=' + r.statRight + ' col=' + r.colRight).join(' | '));
    const lefts = wide.map(r => r.statLeft);
    check('T3 every stat line starts at the same x (prefix alignment kept)',
          new Set(lefts).size === 1, 'stat left edges: ' + JSON.stringify(lefts));

    // ---- narrow (phone) ----
    const narrow = await measure(390);
    check('T4 still no overflow at a 390px phone width',
          narrow.every(r => r.rowOverflow <= 1 && r.cellOverflow <= 1),
          narrow.filter(r => r.rowOverflow > 1 || r.cellOverflow > 1)
                .map(r => r.text.slice(0, 30) + ' row=' + r.rowOverflow + ' cell=' + r.cellOverflow).join(' | '));

    // Screenshot goes to the OS temp dir, never into the repo.
    const shot = path.join(require('os').tmpdir(), 'finalbox-v303.png');
    await measure(1200);
    await page.screenshot({ path: shot });
    console.log('  screenshot: ' + shot);

    await browser.close();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
