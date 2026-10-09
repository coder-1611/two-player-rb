#!/usr/bin/env node
// tools/seen-backfill.js — V524: LAST ONLINE for everyone at once. A page sets on/<its 8 characters> while it is open
// (V524 on); before V524 nothing did, so the RANKINGS would show nothing for a player until they next open the game.
// This fills on/<id> from the visit log (every page load records the device's REST uid and the time; the 10-minute
// stats job keeps it in .rb2p/rbstats-cache/<day>.json): the last time each rated player opened the game. A newer
// value already there (the player was online since) is kept.
//   node tools/seen-backfill.js          dry run: how many, a sample
//   node tools/seen-backfill.js --write  write them (the owner's admin token)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const CACHE = path.join(RB2P, 'rbstats-cache'), STATE = path.join(RB2P, 'elo', 'state.json');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const WRITE = process.argv.includes('--write');

async function ownerToken() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}

(async () => {
    const last = {};   // 8 characters -> the last visit
    for (const f of fs.readdirSync(CACHE).filter(x => /^\d{4}-\d\d-\d\d\.json$/.test(x))) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8')); } catch (e) { continue; }
        for (const v of Object.values((j && j.recs) || {})) {
            const u = String((v && v.uid) || ''), t = Number(v && v.ts) || 0;
            if (u.length >= 8 && t > (last[u.slice(0, 8)] || 0)) last[u.slice(0, 8)] = t;
        }
    }
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const rated = Object.keys(st.players || {}).map(u => u.slice(0, 8));
    const tok = await ownerToken();
    const cur = (await (await fetch(DB + 'on.json?access_token=' + encodeURIComponent(tok))).json()) || {};
    const put = {};
    for (const p of rated) if (last[p] && !(Number(cur[p]) >= last[p])) put[p] = last[p];
    console.log(rated.length + ' rated players; ' + Object.keys(last).length + ' devices in the visit log; ' + Object.keys(put).length + ' to set (' +
                rated.filter(p => !last[p]).length + ' never seen in the log, ' + rated.filter(p => Number(cur[p]) >= (last[p] || 0) && cur[p]).length + ' already newer)');
    Object.entries(put).slice(0, 5).forEach(([p, t]) => console.log('  ' + p + ' ' + new Date(t).toISOString()));
    if (!WRITE) { console.log('(dry run — --write to set them)'); return; }
    const r = await fetch(DB + 'on.json?access_token=' + encodeURIComponent(tok), { method: 'PATCH', body: JSON.stringify(put) });
    console.log('written: ' + r.status);
})().catch(e => { console.error('FATAL', e && e.message || e); process.exit(2); });
