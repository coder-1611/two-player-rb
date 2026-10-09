#!/usr/bin/env node
// tools/acct.js — V530 ACCOUNTS, the owner's side (the accounts are Firebase sign-ins with a username as
// <username>@realretrobowl2p.firebaseapp.com — no real email, so a forgotten password comes to the owner):
//   node tools/acct.js list                       every account: username, id, made, last sign-in
//   node tools/acct.js find <username>            one account: its id and its rating record
//   node tools/acct.js reset <username> <password> a new password (6+ characters) — tell the player; their other devices
//                                                 stay signed in
// The owner's admin sign-in on this Mac (the firebase CLI's login), as tools/elo.js.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const P = 'realretrobowl2p', DOM = '@realretrobowl2p.firebaseapp.com', IT = 'https://identitytoolkit.googleapis.com/v1/projects/' + P + '/';
async function ownerToken() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}
const when = ms => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace('T', ' ') : '-');
(async () => {
    const [cmd, user, pw] = process.argv.slice(2), tok = await ownerToken();
    const H = { Authorization: 'Bearer ' + tok, 'content-type': 'application/json', 'x-goog-user-project': P };
    const post = async (ep, b) => { const r = await fetch(IT + ep, { method: 'POST', headers: H, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(ep + ': ' + JSON.stringify(j.error || j).slice(0, 200)); return j; };
    const lookup = async u => { const j = await post('accounts:lookup', { email: [String(u).toLowerCase() + DOM] }); return (j.users || [])[0] || null; };
    if (cmd === 'list') {
        let next = '', all = [];
        do {
            const r = await fetch(IT + 'accounts:batchGet?maxResults=1000' + (next ? '&nextPageToken=' + encodeURIComponent(next) : ''), { headers: H });
            const j = await r.json(); if (!r.ok) throw new Error('batchGet: ' + JSON.stringify(j.error || j).slice(0, 200));
            all = all.concat((j.users || []).filter(u => u.email && u.email.endsWith(DOM)));
            next = j.nextPageToken || '';
        } while (next);
        all.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
        console.log(all.length + ' accounts');
        for (const u of all) console.log('  @' + u.email.slice(0, -DOM.length).padEnd(17) + u.localId.slice(0, 8) + '  made ' + when(u.createdAt) + '  last in ' + when(u.lastLoginAt));
    } else if (cmd === 'find' && user) {
        const u = await lookup(user); if (!u) { console.log('no account @' + user.toLowerCase()); return; }
        const rec = await (await fetch('https://' + P + '-default-rtdb.firebaseio.com/embedcode/elo/r/' + u.localId + '.json')).json();
        console.log('@' + user.toLowerCase() + '  id ' + u.localId + '  made ' + when(u.createdAt) + '  last in ' + when(u.lastLoginAt));
        console.log('  rating ' + (rec ? Math.round(rec.r) + ' (' + rec.w + '-' + rec.l + (rec.d ? '-' + rec.d : '') + ', ' + rec.n + ' games) as ' + (rec.nm || '?') : 'none yet'));
    } else if (cmd === 'reset' && user && pw) {
        if (String(pw).length < 6) throw new Error('the password needs at least 6 characters');
        const u = await lookup(user); if (!u) { console.log('no account @' + user.toLowerCase()); process.exit(1); }
        await post('accounts:update', { localId: u.localId, password: String(pw) });
        console.log('@' + user.toLowerCase() + ': new password set');
    } else {
        console.log('node tools/acct.js list | find <username> | reset <username> <new password>');
    }
})().catch(e => { console.error('FATAL', e && e.message || e); process.exit(2); });
