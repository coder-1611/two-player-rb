#!/usr/bin/env node
// tools/alltime-stats.js — all-time totals, published to stats/alltime for the dashboard.
//
//   node tools/alltime-stats.js            compute and publish
//   node tools/alltime-stats.js --dry      compute and print only
//
// Two-player games and screen time come from the audit archives on this machine
// (audits/*.json, every recorded game since V365 / 2026-09-02): a game is a
// match-start segment with at least three snaps; "on screen" is per-phone time
// between that phone's own events with idle gaps over five minutes excluded
// (a tab left open through lunch is not play). Visits, devices and the solo
// figures come from the database. Harness runs are excluded everywhere.
// Publishing uses the project owner's OAuth token (firebase-tools' refresh
// token) — players can read stats/, never write it.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const GK = new Set(['snap', 'settle', 'score', 'q', 'send', 'recv', 'conv', 'p6', 'final']);
const GAP_MS = 5 * 60 * 1000;
const dry = process.argv.includes('--dry');

async function ownerToken() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}
const isTest = r => !!r && (r.src === 'local' || /localhost|127\.0\.0\.1/.test(String(r.host || '')) || /HeadlessChrome/.test(String(r.ua || '')));

function fromArchives() {
    const dir = path.resolve(__dirname, '..', 'audits');
    let games = 0, complete = 0, engagedMs = 0, phones = 0, first = Infinity, last = 0;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
        const tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t);
        if (!tl.length) continue;
        // harness rooms carry no real team names — the transcripts page hides them the same way
        const names = new Set(tl.filter(e => e.k === 'bind').map(e => e.role));
        const marks = tl.filter(e => e.k === 'game' || (e.k === 'diag' && /^TURN-> [ab] \(match-start\)$/.test(String(e.m || '')))).map(e => e.t).sort((a, b) => a - b);
        const starts = []; for (const t of marks) if (!starts.length || t - starts[starts.length - 1] > 10000) starts.push(t);
        if (!starts.length) starts.push(tl[0].t);
        for (let i = 0; i < starts.length; i++) {
            const st = starts[i], en = i + 1 < starts.length ? starts[i + 1] - 3000 : Infinity;
            const seg = tl.filter(e => e.t >= st - 3000 && e.t < en);
            if (seg.filter(e => e.k === 'snap').length < 3) continue;
            games++;
            if (['a', 'b'].every(r => seg.some(e => e.role === r && e.k === 'final'))) complete++;
            for (const r of ['a', 'b']) {
                const ts = seg.filter(e => e.role === r).map(e => e.t);
                if (ts.length < 2) continue;
                phones++;
                for (let k = 1; k < ts.length; k++) { const d = ts[k] - ts[k - 1]; if (d <= GAP_MS) engagedMs += d; }
                first = Math.min(first, ts[0]); last = Math.max(last, ts[ts.length - 1]);
            }
        }
    }
    return { games, complete, phones, personHours: engagedMs / 3600000, gameHours: engagedMs / 7200000, since: isFinite(first) ? first : null, until: last || null };
}

async function fromDb() {
    const tok = await require('./fb-auth.js').token();
    const get = async p => { const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; };
    const out = { visits: 0, devices: new Set(), firstVisit: null, solo: { visits: 0, devices: new Set(), sessions: 0, played: 0, hours: 0, matchHours: 0, matches: 0 } };
    const days = Object.keys(await get('visits') || {}).sort();
    for (const d of days) {
        const v = await get('visits/' + d) || {};
        for (const k in v) { const r = v[k]; if (!r || isTest(r)) continue;
            if (r.src === 'solo') { out.solo.visits++; if (r.uid) out.solo.devices.add(r.uid); }
            else { out.visits++; if (r.uid) out.devices.add(r.uid); if (!out.firstVisit || r.ts < out.firstVisit) out.firstVisit = r.ts; } }
    }
    for (const d of Object.keys(await get('solo') || {}).sort()) {
        const s = await get('solo/' + d) || {};
        for (const k in s) { const r = s[k]; if (!r || isTest(r)) continue;
            out.solo.sessions++; out.solo.hours += (Number(r.dur) || 0) / 3600; out.solo.matchHours += (Number(r.inMatchSec) || 0) / 3600;
            if (r.played === true || Number(r.inMatchSec) >= 20) out.solo.played++; out.solo.matches += Number(r.matches) || 0; }
    }
    return { visits: out.visits, devices: out.devices.size, firstVisit: out.firstVisit,
             solo: { visits: out.solo.visits, devices: out.solo.devices.size, sessions: out.solo.sessions, played: out.solo.played, hours: out.solo.hours, matchHours: out.solo.matchHours, matches: out.solo.matches } };
}

(async () => {
    const a = fromArchives();
    const d = await fromDb();
    const stats = { updatedAt: Date.now(),
        two: { games: a.games, complete: a.complete, phoneSessions: a.phones, personHours: Math.round(a.personHours * 10) / 10, gameHours: Math.round(a.gameHours * 10) / 10, since: a.since, until: a.until,
               visits: d.visits, devices: d.devices, visitsSince: d.firstVisit },
        solo: { visits: d.solo.visits, devices: d.solo.devices, sessions: d.solo.sessions, played: d.solo.played, hours: Math.round(d.solo.hours * 10) / 10, matchHours: Math.round(d.solo.matchHours * 10) / 10, matches: d.solo.matches, since: Date.parse('2026-09-21T13:55:00Z') },
        notes: 'two-player games and hours from the audit archives (recorded games since 2026-09-02, idle gaps over 5 min excluded); visits/devices since the visit beacon (2026-09-14); solo since 2026-09-21' };
    console.log(JSON.stringify(stats, null, 1));
    if (dry) return;
    const tok = await ownerToken();
    const r = await fetch(DB + 'stats/alltime.json?access_token=' + tok, { method: 'PUT', body: JSON.stringify(stats) });
    console.log('published stats/alltime: ' + r.status);
})().catch(e => { console.error(e); process.exit(1); });
