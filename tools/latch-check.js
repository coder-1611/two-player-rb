#!/usr/bin/env node
// tools/latch-check.js — NEVER-FREEZE Phase 2, property 1: "every wait has a deadline".
//
// Every piece of state in index.html that could hold up a snap, a hand-off, a conversion or the stats
// screen must be in the latch registry (tools/latch-registry.js) with its owner, where it is set and
// cleared, its longest legitimate life and what happens past it. Everything else must be on the
// non-blocking list with its own one-line reason. This check fails on any name that is in neither —
// existing or new — so a latch can never again be added without a deadline being decided.
//
// What it scans (index.html):
//   window._rb2p_*            every name. A name whose every assignment is a function is code, not
//                             state, and needs no entry (it cannot hold anything up by itself).
//   closure guards            `var` names that read as guards (…Busy, …Pending, …Ticks, …Checks,
//                             …Applied, …Inited, …InFlight, …Held, …Lock, …Owed, …Latch, …Since, …Hold…)
//   storage keys              sessionStorage / localStorage keys (a key built by concatenation counts
//                             by its literal prefix)
//   room records              the first path segment under rooms/{code}/
//
//   node tools/latch-check.js            check (exit 1 on any unclassified name)
//   node tools/latch-check.js --list     print every name found, grouped, with its classification
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const REG = require('./latch-registry.js');

function scan(src) {
    const found = { window: new Set(), closure: new Set(), storage: new Set(), room: new Set() };
    // window._rb2p_* — and which of them are only ever assigned functions
    const all = new Set([...src.matchAll(/window\.(_rb2p_[A-Za-z0-9_]+)/g)].map(m => m[1]));
    const fdecl = new Set([...src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
    const kinds = {};
    for (const m of src.matchAll(/window\.(_rb2p_[A-Za-z0-9_]+)\s*=(?!=)\s*([^;\n]{0,60})/g)) {
        const v = m[2].trim();
        const isFn = /^function\b/.test(v) || /^\([^)]*\)\s*=>/.test(v) || /^[A-Za-z_$][\w$]*\s*=>/.test(v) ||
                     (/^[A-Za-z_$][\w$]*$/.test(v) && fdecl.has(v)) || /^async\s+function\b/.test(v);
        (kinds[m[1]] = kinds[m[1]] || new Set()).add(isFn ? 'fn' : 'data');
    }
    for (const n of all) {
        const k = kinds[n];
        if (k && k.has('fn') && !k.has('data')) continue;      // code, not state
        found.window.add('window.' + n);
    }
    // closure guards
    const GUARDY = /(Busy|Pending|InFlight|Applied|Applying|Inited|Latch|Ticks|Checks|Armed|Blocked|Owed|Owes|Held|Lock|Reported|Suppress|Guard|Hold|Since|Stuck|stuck)/;
    for (const m of src.matchAll(/\bvar\s+([^;]+);/g)) {
        for (const part of m[1].split(',')) {
            const n = (part.split('=')[0] || '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n) && GUARDY.test(n) && n.length > 3) found.closure.add(n);
        }
    }
    // storage keys
    for (const m of src.matchAll(/(?:session|local)Storage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)) found.storage.add(m[1]);
    // keys built from a literal prefix by a helper (e.g. 'rb2p_flow_' + room + '_' + role)
    for (const m of src.matchAll(/['"]((?:rb2p|rb)_[A-Za-z0-9]+(?:[A-Za-z0-9]*)_)['"]\s*\+/g)) found.storage.add(m[1]);
    // room records
    for (const m of src.matchAll(/['"]rooms\/['"]\s*\+\s*[A-Za-z_$][\w$.]*\s*\+\s*['"]\/([A-Za-z0-9_]+)/g)) found.room.add(m[1]);
    return found;
}

const found = scan(html);
const known = (group, name) => {
    const key = group === 'storage' ? 'storage:' + name : group === 'room' ? 'room:' + name : group === 'closure' ? 'var:' + name : name;
    if (REG.blocking[key]) return { cls: 'BLOCKING', entry: REG.blocking[key] };
    if (REG.nonBlocking[key]) return { cls: 'non-blocking', reason: REG.nonBlocking[key] };
    return null;
};
const LIST = process.argv.includes('--list');
let unknown = [], counts = { BLOCKING: 0, 'non-blocking': 0 };
for (const group of ['window', 'closure', 'storage', 'room']) {
    const names = [...found[group]].sort();
    if (LIST) console.log('\n## ' + group + ' (' + names.length + ')');
    for (const n of names) {
        const k = known(group, n);
        if (!k) { unknown.push(group + ' ' + n); if (LIST) console.log('  ??  ' + n); continue; }
        counts[k.cls]++;
        if (LIST) console.log('  ' + (k.cls === 'BLOCKING' ? 'BLK ' : '    ') + n + (k.reason ? '  — ' + k.reason : '  — ' + (k.entry.kind + ', max ' + k.entry.max)));
    }
}
// every blocking entry must say who owns it, where it is set and cleared, how long it may live and what then
const badEntries = Object.entries(REG.blocking).filter(([, e]) => !(e && e.kind && e.owner && e.set && e.clear && e.max && e.expiry) || !/^(guard|obligation)$/.test(e.kind));
// entries that no longer match anything in the page (kept honest, reported, not fatal)
const present = new Set([...found.window, ...[...found.closure].map(n => 'var:' + n), ...[...found.storage].map(n => 'storage:' + n), ...[...found.room].map(n => 'room:' + n)]);
const stale = Object.keys(REG.blocking).concat(Object.keys(REG.nonBlocking)).filter(k => !present.has(k) && !/^(derived|queue):/.test(k));
const reasonless = Object.entries(REG.nonBlocking).filter(([, r]) => !r || String(r).trim().length < 8 || /^legacy$/i.test(String(r).trim()));

console.log('latch check: ' + counts.BLOCKING + ' blocking (registered), ' + counts['non-blocking'] + ' non-blocking (with reasons), ' + unknown.length + ' UNCLASSIFIED' +
            (badEntries.length ? ', ' + badEntries.length + ' incomplete registry entries' : '') + (reasonless.length ? ', ' + reasonless.length + ' entries without a real reason' : '') +
            (stale.length ? ' (' + stale.length + ' registry names no longer in the page)' : ''));
if (unknown.length) console.log('UNCLASSIFIED — add each to tools/latch-registry.js (blocking with a deadline, or non-blocking with its reason):\n  ' + unknown.join('\n  '));
if (badEntries.length) console.log('INCOMPLETE blocking entries (need kind guard|obligation, owner, set, clear, max, expiry):\n  ' + badEntries.map(([k]) => k).join('\n  '));
if (reasonless.length) console.log('NON-BLOCKING entries with no real reason:\n  ' + reasonless.map(([k]) => k).join('\n  '));
if (stale.length && LIST) console.log('no longer in the page:\n  ' + stale.join('\n  '));
process.exit(unknown.length || badEntries.length || reasonless.length ? 1 : 0);
