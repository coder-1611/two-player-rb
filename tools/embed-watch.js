#!/usr/bin/env node
// tools/embed-watch.js — keep the Google Sites embed on the deployed build, always.
//
// The embed serves whatever /embedcode/selfcontained holds in Firebase; the
// deployed game is whatever two-player-rb.vercel.app serves. Every 2 minutes
// this compares the two build labels. When they differ, it makes sure this
// repo is at the deployed commit (git pull --ff-only) and runs
// tools/embed-publish.sh, which builds, stores and VERIFIES. So a push that
// deploys is in the Google Sites page within a few minutes, with no one
// remembering to do anything. Installed as a LaunchAgent by
// tools/install-embed-watch.sh; logs to ~/rb2p/embed-watch.log.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const LIVE = 'https://two-player-rb.vercel.app/';
const META = 'https://realretrobowl2p-default-rtdb.firebaseio.com/embedcode/meta.json';
const POLL_MS = 2 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;      // after a failed publish, wait before trying the same label again
const log = (m) => console.log(new Date().toISOString() + ' ' + m);
let lastFailedVer = null, lastFailedAt = 0;

async function text(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(url + ' -> ' + r.status);
    return r.text();
}
const label = (html) => { const m = /GAME — (V\d+)/.exec(html || ''); return m ? m[1] : null; };
const localLabel = () => { try { return label(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')); } catch (e) { return null; } };

async function tick() {
    const deployed = label(await text(LIVE));
    let embed = null;
    try { embed = JSON.parse(await text(META)); } catch (e) {}
    const embedVer = embed && embed.ver;
    if (!deployed) { log('could not read the deployed label'); return; }
    if (embedVer === deployed) return;                               // in step
    if (lastFailedVer === deployed && Date.now() - lastFailedAt < RETRY_MS) return;
    log('deployed ' + deployed + ', embed ' + (embedVer || 'unknown') + ' — updating the embed');
    if (localLabel() !== deployed) {
        log('local tree is ' + localLabel() + ' — pulling');
        try { execFileSync('git', ['-C', REPO, 'pull', '--ff-only', '-q'], { encoding: 'utf8', timeout: 120000 }); }
        catch (e) { log('git pull failed: ' + String(e.message).split('\n')[0]); }
        if (localLabel() !== deployed) { log('local tree is still ' + localLabel() + ' — will retry'); lastFailedVer = deployed; lastFailedAt = Date.now(); return; }
    }
    try {
        const out = execFileSync('/bin/bash', [path.join(REPO, 'tools', 'embed-publish.sh')], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
        log(out.trim().split('\n').pop());
    } catch (e) {
        lastFailedVer = deployed; lastFailedAt = Date.now();
        log('publish FAILED: ' + ((e.stdout || '') + (e.stderr || '')).trim().split('\n').slice(-3).join(' | '));
    }
}

(async () => {
    log('embed-watch started (repo ' + REPO + ')');
    for (;;) {
        try { await tick(); } catch (e) { log('tick error: ' + (e && e.message)); }
        await new Promise(r => setTimeout(r, POLL_MS));
    }
})();
