// tools/highlights/censor.js — V485 (the owner: "censor the slur"): the page's slur filter — index.html, between
// SLUR-FILTER-START and SLUR-FILTER-END — run in Node, so a name or a line is censored before it is published to the
// public front page. One source: the page's own text.
const fs = require('fs'), path = require('path');
function load(file) {
    const s = fs.readFileSync(file || path.join(__dirname, '..', '..', 'index.html'), 'utf8');
    const a = s.indexOf('/* SLUR-FILTER-START */'), b = s.indexOf('/* SLUR-FILTER-END */');
    if (a < 0 || b < a) throw new Error('the slur filter is missing from index.html');
    const f = new Function(s.slice(a, b) + '\nreturn { censor: censor, hasSlur: hasSlur };')();
    // a player's name: censored; nothing left but stars, no name ('' — the page says "a player")
    f.censorName = n => { const c = f.censor(n || ''); return /[a-z0-9]/i.test(c) ? c : ''; };
    return f;
}
module.exports = Object.assign(load(), { load });
