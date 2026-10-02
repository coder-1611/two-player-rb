#!/usr/bin/env node
// tools/freeze-watch/quiet.js — is a REAL game being played right now? (never push a build into a live game)
//
//   node tools/freeze-watch/quiet.js            exit 0 = quiet, 1 = a game is live (listed)
//   node tools/freeze-watch/quiet.js --wait 90  wait up to 90 minutes for a quiet moment (checks every minute)
//
// "Live" = a non-harness room with an audit entry in the last 3 minutes AND actual play in the last 10 (V431). The audit watcher writes that list every
// minute to ~/rb2p/live-rooms.json; if the file is stale (the watcher is down) this reads the rooms the watcher saw
// active in the last 2 hours straight from the database (their newest entry only — never the whole tree).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const LIVE_FILE = path.join(os.homedir(), 'rb2p', 'live-rooms.json');
const STATE_FILE = path.join(os.homedir(), 'rb2p', 'audit-watch-state.json');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const LIVE_MS = 3 * 60 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function liveNow() {
    try {
        const j = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
        if (Date.now() - j.at < 3 * 60 * 1000) return { via: 'watcher', rooms: j.rooms.filter(r => Date.now() - r.newest < LIVE_MS) };
    } catch (e) {}
    // fallback: the watcher's recently-active rooms, checked directly — only if its state is recent; if the watcher is
    // not running there is no cheap way to see every room, so this says LIVE (never push blind)
    // and if even that is old (the watcher is not running), every room's newest entry is read (slow, ~1 MB, accurate)
    let stAge = Infinity; try { stAge = Date.now() - fs.statSync(STATE_FILE).mtimeMs; } catch (e) {}
    const tok = await require(path.join(__dirname, '..', 'fb-auth.js')).token();
    let st = { rooms: {} }; try { st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
    let recent;
    if (stAge < 15 * 60 * 1000) recent = Object.keys(st.rooms || {}).filter(c => !/\d/.test(c) && Date.now() - (st.rooms[c].act || 0) < 2 * 3600 * 1000);
    else {
        const r0 = await fetch(DB + 'rooms.json?shallow=true&auth=' + tok);
        if (!r0.ok) throw new Error('room list unreadable');
        recent = Object.keys(await r0.json() || {}).filter(c => !/\d/.test(c));
    }
    const rooms = [];
    for (const code of recent) {
        let m = 0;
        for (const role of ['a', 'b']) {
            const r = await fetch(DB + 'rooms/' + code + '/audit/' + role + '.json?orderBy=%22$key%22&limitToLast=1&auth=' + tok);
            const v = r.ok ? await r.json() : null;
            for (const k in v || {}) if (v[k] && v[k].t > m) m = v[k].t;
        }
        if (Date.now() - m < LIVE_MS) rooms.push({ code, newest: m });
    }
    return { via: (stAge < 15 * 60 * 1000 ? 'direct, ' : 'every room (the watcher is not running), ') + recent.length + ' rooms checked', rooms };
}

// V431: a tab left open writes entries forever (its status line, its clock samples) with nobody playing — ZIJY counted as
// "live" from 3 pm to 7 pm, CRTI's last play was 46 minutes old — and blocked every push. A room is live only if it had
// actual PLAY in the last 10 minutes — what only a player makes happen: a snap, its result, the hand-off that ends a
// drive, a match start. (A hidden tab's engine keeps running its clock: its quarter changes, applies and possession
// switches happen with nobody there — CRTI.)
const PLAY = new Set(['snap', 'settle', 'send', 'game']);
const PLAY_MS = 10 * 60 * 1000;
async function playedRecently(tok, code) {
    for (const role of ['a', 'b']) {
        const r = await fetch(DB + 'rooms/' + code + '/audit/' + role + '.json?orderBy=%22$key%22&limitToLast=150&auth=' + tok);
        const v = r.ok ? await r.json() : null;
        for (const k in v || {}) { const e = v[k]; if (e && PLAY.has(e.k) && Date.now() - Number(e.t) < PLAY_MS) return true; }
    }
    return false;
}
async function playingNow() {
    const l = await liveNow();
    if (!l.rooms.length) return Object.assign(l, { idle: [] });
    const tok = await require(path.join(__dirname, '..', 'fb-auth.js')).token();
    const playing = [], idle = [];
    for (const r of l.rooms) (await playedRecently(tok, r.code) ? playing : idle).push(r);
    return { via: l.via, rooms: playing, idle };
}

(async () => {
    const i = process.argv.indexOf('--wait');
    const waitMin = i > 0 ? Number(process.argv[i + 1]) || 60 : 0;
    const t0 = Date.now();
    for (;;) {
        const l = await playingNow();
        const idleTxt = l.idle && l.idle.length ? '; open but nobody playing for 10+ min: ' + l.idle.map(r => r.code).join(', ') : '';
        if (!l.rooms.length) { console.log('QUIET — no real game being played (' + l.via + idleTxt + ')'); process.exit(0); }
        const desc = l.rooms.map(r => r.code + ' (' + Math.round((Date.now() - r.newest) / 1000) + 's ago)').join(', ');
        if (!waitMin || Date.now() - t0 > waitMin * 60000) { console.log('LIVE — ' + desc + ' (' + l.via + ')'); process.exit(1); }
        console.log(new Date().toISOString() + ' live: ' + desc + ' — waiting');
        await sleep(60000);
    }
})().catch(e => { console.error('quiet check failed: ' + (e && e.message) + ' — treat as LIVE'); process.exit(1); });
