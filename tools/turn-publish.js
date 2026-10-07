#!/usr/bin/env node
// tools/turn-publish.js — V503 (the owner: "i was able to watch 1 game but after that none of them are loading"). The
// relay's credentials (V497) came only from two-player-rb.vercel.app/api/turn — and the players on the backup door
// realretrobowl2p.web.app (vercel.app is blocked at their school) could not reach it: every web.app page logged
// "VIEW no relay (unreachable)", its link to the other phone fell back to Firebase (5 frames a second), and a watcher's link
// could never open (no direct path, no relay). The relay itself works there (the vercel.app players' links opened through
// it). This publishes the credentials in the game's own database, which every door reaches: embedcode/turn = { iceServers,
// exp, at } (Cloudflare TURN, the mac-remote key, 48 h each; minted again when under 24 h are left).
// Run by the LaunchAgent com.rb2p.turn every 30 minutes (tools/install-turn.sh: the key comes from its own environment).
//   node tools/turn-publish.js            mint + publish when due
//   node tools/turn-publish.js --force    mint + publish now
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const TTL = 172800, REMINT_MS = 24 * 3600e3;
const log = m => console.log(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + m);
async function ownerToken() {   // the firebase CLI's login on this Mac (admin), as tools/elo.js
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}
(async () => {
    const key = process.env.CF_TURN_KEY_ID, tok = process.env.CF_TURN_API_TOKEN;
    if (!key || !tok) throw new Error('CF_TURN_KEY_ID / CF_TURN_API_TOKEN not set');
    const owner = await ownerToken();
    const cur = await (await fetch(DB + 'embedcode/turn.json?access_token=' + encodeURIComponent(owner), { cache: 'no-store' })).json().catch(() => null);
    if (!process.argv.includes('--force') && cur && Number(cur.exp) - Date.now() > REMINT_MS) return;   // still good for a day
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(key) + '/credentials/generate-ice-servers', {
        method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: TTL }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('mint ' + r.status);
    const j = await r.json();
    const ice = (j.iceServers || []).map(s => ({ urls: [].concat(s.urls || []).filter(u => /^turns?:/.test(u) && !/:53\b/.test(u)), username: s.username, credential: s.credential }))
        .filter(s => s.urls.length && s.username);
    if (!ice.length) throw new Error('no TURN server in the answer');
    const rec = { iceServers: ice, exp: Date.now() + TTL * 1000, at: Date.now() };
    const w = await fetch(DB + 'embedcode/turn.json?print=silent&access_token=' + encodeURIComponent(owner), { method: 'PUT', body: JSON.stringify(rec) });
    if (!w.ok) throw new Error('publish ' + w.status);
    log('published embedcode/turn (' + ice[0].urls.length + ' TURN urls, good for ' + Math.round(TTL / 3600) + ' h)');
})().catch(e => { log('FATAL ' + (e && e.message || e)); process.exit(2); });
