#!/usr/bin/env node
// tools/audit-watch.js — audit every finished game, automatically.
//
// Polls Firebase every 60s. A room is due when it has an audit stream and
// either a `final` record or a stream idle for > 3 minutes, and no `audited`
// marker yet. Each due room is handed to tools/audit-game.js, which writes
// `audited` (and `flag` when irregular). The client's sweep never deletes a
// room that is flagged or not yet audited, so the evidence is there when you
// look. Installed as a LaunchAgent by tools/install-audit-watch.sh; logs to
// ~/rb2p/audit-watch.log.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0';
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const IDLE_MS = 3 * 60 * 1000;
const POLL_MS = 60 * 1000;

const auth = () => require('./fb-auth.js').token();
async function get(tok, p) {
    const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' });
    return r.ok ? r.json() : null;
}
function newestT(stream) {
    let m = 0;
    for (const role of Object.keys(stream || {})) for (const k of Object.keys(stream[role] || {})) {
        const e = stream[role][k]; if (e && typeof e.t === 'number' && e.t > m) m = e.t;
    }
    return m;
}
const log = (m) => console.log(new Date().toISOString() + ' ' + m);

async function tick() {
    const tok = await auth();
    const rooms = await get(tok, 'rooms') || {};
    for (const code of Object.keys(rooms)) {
        const r = rooms[code] || {};
        if (!r.audit || r.audited) continue;
        const done = !!r.final;
        const idle = Date.now() - newestT(r.audit) > IDLE_MS;
        if (!done && !idle) continue;
        log('auditing ' + code + (done ? ' (final present)' : ' (stream idle)'));
        try {
            const out = execFileSync(process.execPath, [path.join(__dirname, 'audit-game.js'), code], { encoding: 'utf8' });
            log(out.trim().split('\n')[0]);
        } catch (e) {
            // exit 1 = flagged (normal), 2 = could not audit
            const out = (e.stdout || '') + (e.stderr || '');
            log((e.status === 1 ? 'FLAGGED ' : 'ERROR ') + code + ': ' + out.trim().split('\n').slice(0, 3).join(' | '));
        }
    }
}

// V409: refresh the all-time totals (stats/alltime) after audits, at most every 10 minutes
let statsAt = 0;
function refreshStats() {
    if (Date.now() - statsAt < 10 * 60 * 1000) return;
    statsAt = Date.now();
    try { execFileSync(process.execPath, [path.join(__dirname, 'alltime-stats.js')], { encoding: 'utf8', timeout: 120000 }); log('stats/alltime refreshed'); }
    catch (e) { log('stats refresh failed: ' + String((e && e.message) || e).slice(0, 120)); }
}
(async () => {
    log('audit-watch started');
    for (;;) {
        try { const before = statsAt; await tick(); refreshStats(); } catch (e) { log('tick error: ' + (e && e.message)); }
        await new Promise(r => setTimeout(r, POLL_MS));
    }
})();
