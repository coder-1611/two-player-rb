// tools/fb-auth.js — one anonymous Firebase identity for every tool on this Mac.
//
// Firebase rate-limits anonymous sign-up per IP (TOO_MANY_ATTEMPTS_TRY_LATER).
// Minting a fresh user per audit and per watcher tick tripped it and took the
// e2e harness down with it. The phones never had this problem: they cache the
// token and refresh it. So do the tools now — one identity in ~/rb2p/.fbtok.json,
// refreshed through securetoken when it is within 5 minutes of expiry, and a
// brand-new sign-up only when there is no refresh token at all.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0';
const FILE = path.join(os.homedir(), 'rb2p', '.fbtok.json');

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return null; } }
function save(t) { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(t)); } catch (e) {} }

async function token() {
    let t = load();
    const now = Date.now();
    if (t && t.id && t.exp && now < t.exp - 300000) return t.id;
    if (t && t.refresh) {
        const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + KEY, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(t.refresh)
        });
        if (r.ok) {
            const d = await r.json();
            t = { id: d.id_token, refresh: d.refresh_token, exp: now + (parseInt(d.expires_in, 10) || 3600) * 1000 };
            save(t); return t.id;
        }
    }
    const r2 = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
    if (!r2.ok) throw new Error('auth failed ' + r2.status + ' ' + (await r2.text()).slice(0, 120));
    const d2 = await r2.json();
    t = { id: d2.idToken, refresh: d2.refreshToken, exp: now + (parseInt(d2.expiresIn, 10) || 3600) * 1000 };
    save(t); return t.id;
}
module.exports = { token, KEY };
