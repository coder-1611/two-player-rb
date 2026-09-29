#!/usr/bin/env node
// tools/signup-quota.js — keep Firebase's per-IP sign-up quota raised (owner request 2026-09-29).
//
// Anonymous sign-ups are limited per IP address per hour (the project default was the
// unset value, about 100). A whole school shares one IP, and every new device signs in
// anonymously, so a busy class could hit the limit and then nobody new could start a
// game (writes need auth). Firebase only lets the quota be raised for a window (7 days), so
// this re-applies it whenever less than 2 days are left. tools/audit-watch.js runs it
// every 6 hours.
//
//   node tools/signup-quota.js           show, and renew if needed
//   node tools/signup-quota.js --show    show only
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const PROJECT = 'realretrobowl2p';
const QUOTA = '1000';                 // sign-ups per IP per hour
const WINDOW_S = 7 * 24 * 3600;       // the longest window Firebase accepts
const RENEW_BELOW_MS = 2 * 24 * 3600 * 1000;
const API = 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + PROJECT + '/config';

async function ownerToken() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}

(async () => {
    const tok = await ownerToken();
    const headers = { Authorization: 'Bearer ' + tok, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };
    const cur = (await (await fetch(API, { headers })).json()).quota || {};
    const q = cur.signUpQuotaConfig || null;
    const endMs = q ? Date.parse(q.startTime) + parseInt(String(q.quotaDuration || '0'), 10) * 1000 : 0;
    const left = endMs - Date.now();
    console.log('sign-up quota: ' + (q ? q.quota + '/IP/hour until ' + new Date(endMs).toISOString() + ' (' + (left / 3600000).toFixed(1) + ' h left)' : 'default (not raised)'));
    if (process.argv.includes('--show')) return;
    if (q && Number(q.quota) >= Number(QUOTA) && left > RENEW_BELOW_MS) return;
    const payload = { quota: { signUpQuotaConfig: { quota: QUOTA, startTime: new Date(Date.now() + 60000).toISOString(), quotaDuration: WINDOW_S + 's' } } };
    const r = await fetch(API + '?updateMask=quota.signUpQuotaConfig', { method: 'PATCH', headers, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) throw new Error('renew failed ' + r.status + ' ' + JSON.stringify(j.error || j).slice(0, 200));
    console.log('renewed: ' + JSON.stringify(j.quota && j.quota.signUpQuotaConfig));
})().catch(e => { console.error(e.message || e); process.exit(1); });
