#!/usr/bin/env node
// tools/audit-watch.js — audit every finished game, automatically.
//
// Polls Firebase every 60s. A room is due when it has an audit stream and
// either a `final` record or a stream idle for > 3 minutes, and no `audited`
// marker yet — or (V426) entries newer than its `audited` marker that have gone
// quiet for 3 minutes (a rematch, overtime or reload after the first audit). Each due room is handed to tools/audit-game.js, which writes
// `audited` (and `flag` when irregular). The client's sweep never deletes a
// room that is flagged or not yet audited, so the evidence is there when you
// look. Installed as a LaunchAgent by tools/install-audit-watch.sh; logs to
// ~/Projects/two-player-rb/.rb2p/audit-watch.log.
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

// V426 (infra): the watcher no longer downloads the whole rooms tree every minute. That tree is 94 MB (rooms are
// never deleted) and the pull was 70-105 GB a DAY — about 100x the free plan's 10 GB a MONTH (Google's own
// monitoring, 2026-09-30; the project has no billing). Now each tick reads the room list (shallow, ~15 KB), then
// small reads for rooms that are new or were active in the last 2 hours, plus a slow sweep that visits every
// other room once per SWEEP_TICKS ticks; a room's full audit stream is read only when it is audited (once per
// game, by audit-game.js). It also writes ~/Projects/two-player-rb/.rb2p/live-rooms.json — the real rooms with an entry in the last
// 3 minutes — which tools/freeze-watch/quiet.js reads ("is anyone playing right now?").
const fs = require('fs');
const os = require('os');
const STATE_FILE = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p', 'audit-watch-state.json');
const LIVE_FILE = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p', 'live-rooms.json');
const SWEEP_TICKS = 15, ACTIVE_MS = 2 * 60 * 60 * 1000, LIVE_MS = 3 * 60 * 1000;
let st = { rooms: {}, sweep: 0 };
try { st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (!st.rooms) st.rooms = {}; } catch (e) {}
async function getQ(tok, p, q) {
    const r = await fetch(DB + p + '.json?' + (q ? q + '&' : '') + 'auth=' + tok, { cache: 'no-store' });
    return r.ok ? r.json() : null;
}
const slotOf = code => { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SWEEP_TICKS; };
async function newestEntry(tok, code) {
    // audit keys are "<phone time>_<seq>": the last key is the newest entry of that phone
    let m = 0;
    for (const role of ['a', 'b']) {
        const v = await getQ(tok, 'rooms/' + code + '/audit/' + role, 'orderBy=%22$key%22&limitToLast=1');
        for (const k in v || {}) { const e = v[k]; if (e && typeof e.t === 'number' && e.t > m) m = e.t; }
    }
    return m;
}
async function tick() {
    const tok = await auth();
    const list = await getQ(tok, 'rooms', 'shallow=true');
    if (!list) { log('room list unreadable — tick skipped'); return; }
    const now = Date.now(), live = [];
    let reaudits = 0;
    st.sweep = ((Number(st.sweep) || 0) + 1) % SWEEP_TICKS;
    for (const code of Object.keys(list)) {
        let r = st.rooms[code];
        const isNew = !r;
        if (isNew) r = st.rooms[code] = { act: 0 };
        if (!(isNew || now - (r.act || 0) < ACTIVE_MS || slotOf(code) === st.sweep)) continue;
        const kids = await getQ(tok, 'rooms/' + code, 'shallow=true') || {};
        if (!kids.audit) continue;
        const newest = await newestEntry(tok, code);
        if (newest > (r.act || 0)) r.act = newest;
        if (now - newest < LIVE_MS && !/\d/.test(code)) live.push({ code, newest });
        const idle = now - newest > IDLE_MS;
        let why;
        if (kids.audited) {
            // V426 (the detector audit, gap 1): a room was audited once and never again — a rematch, an overtime or
            // a reload after the first audit was never archived (76 of 220 rooms; OUFQ lost 106 of 118 plays). Re-audit
            // when entries newer than the audit have come and gone quiet (never during play), at most every 30 min.
            if (!(newest > (r.aud || 0) + 60000 && idle)) continue;
            if (!r.aud) { const a = await getQ(tok, 'rooms/' + code + '/audited/ts'); r.aud = Number(a) || 1; if (!(newest > r.aud + 60000)) continue; }
            if (now - (r.reAt || 0) < 30 * 60 * 1000 || reaudits >= 10) continue;   // the backlog (209 rooms) drains 10 a tick
            reaudits++;
            r.reAt = now; why = ' (re-audit: entries after the last audit)';
        } else {
            const done = !!kids.final;
            if (!done && !idle) continue;
            why = done ? ' (final present)' : ' (stream idle)';
        }
        log('auditing ' + code + why);
        try {
            const out = execFileSync(process.execPath, [path.join(__dirname, 'audit-game.js'), code], { encoding: 'utf8' });
            log(out.trim().split('\n')[0]);
            r.aud = Date.now();
        } catch (e) {
            const out = (e.stdout || '') + (e.stderr || '');
            log((e.status === 1 ? 'FLAGGED ' : 'ERROR ') + code + ': ' + out.trim().split('\n').slice(0, 3).join(' | '));
            if (e.status === 1) r.aud = Date.now();
        }
    }
    for (const c of Object.keys(st.rooms)) if (!list[c]) delete st.rooms[c];
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(st)); } catch (e) {}
    try { fs.writeFileSync(LIVE_FILE, JSON.stringify({ at: now, rooms: live })); } catch (e) {}
}

let statsAt = 0;
function refreshStats() {
    if (Date.now() - statsAt < 10 * 60 * 1000) return;
    statsAt = Date.now();
    try { execFileSync(process.execPath, [path.join(__dirname, 'alltime-stats.js')], { encoding: 'utf8', timeout: 120000 }); log('stats/alltime refreshed'); }
    catch (e) { log('stats refresh failed: ' + String((e && e.message) || e).slice(0, 120)); }
}
// V419+: keep the per-IP sign-up quota raised (Firebase only raises it for 7 days at a time)
let quotaAt = 0;
function keepSignupQuota() {
    if (Date.now() - quotaAt < 6 * 60 * 60 * 1000) return;
    quotaAt = Date.now();
    try { const out = execFileSync(process.execPath, [path.join(__dirname, 'signup-quota.js')], { encoding: 'utf8', timeout: 60000 }); log(out.trim().split('\n').join(' | ')); }
    catch (e) { log('sign-up quota check failed: ' + String((e && e.message) || e).slice(0, 120)); }
}
(async () => {
    log('audit-watch started');
    for (;;) {
        try { const before = statsAt; await tick(); refreshStats(); keepSignupQuota(); } catch (e) { log('tick error: ' + (e && e.message)); }
        await new Promise(r => setTimeout(r, POLL_MS));
    }
})();
