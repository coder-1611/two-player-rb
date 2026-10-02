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
// the archive is gitignored and lives in the main tree; a worktree reads that one
const AUDITS = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/rb2p/two-player-rb/audits';

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
    const dir = AUDITS;
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

// V426 (infra): this ran every 10 minutes and downloaded the whole visits and solo trees TWICE per run (once for
// the day list, once per day) — ~4.6 MB a run, ~0.66 GB a day on a free plan allowed 10 GB a month. Days before
// yesterday (UTC keys) never change: they are kept on this Mac and read from the database once.
const DAY_CACHE = path.join(os.homedir(), 'rb2p', 'stats-day-cache.json');
let dayCache = null;
async function dayReader() {
    const tok = await require('./fb-auth.js').token();
    if (!dayCache) { try { dayCache = JSON.parse(fs.readFileSync(DAY_CACHE, 'utf8')); } catch (e) { dayCache = {}; } }
    const settled = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);   // this day and earlier are final
    const getQ = async (p, q) => { const r = await fetch(DB + p + '.json?' + (q ? q + '&' : '') + 'auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; };
    return {
        days: async tree => Object.keys(await getQ(tree, 'shallow=true') || {}).sort(),
        day: async (tree, d) => {
            const c = (dayCache[tree] = dayCache[tree] || {});
            if (d <= settled && c[d]) return c[d];
            const v = await getQ(tree + '/' + d) || {};
            if (d <= settled) { c[d] = v; try { fs.writeFileSync(DAY_CACHE, JSON.stringify(dayCache)); } catch (e) {} }
            return v;
        }
    };
}
async function fromDb() {
    const rd = await dayReader();
    const out = { visits: 0, devices: new Set(), firstVisit: null, solo: { visits: 0, devices: new Set(), sessions: 0, played: 0, hours: 0, matchHours: 0, matches: 0 } };
    const days = await rd.days('visits');
    for (const d of days) {
        const v = await rd.day('visits', d);
        for (const k in v) { const r = v[k]; if (!r || isTest(r)) continue;
            if (r.src === 'solo') { out.solo.visits++; if (r.uid) out.solo.devices.add(r.uid); }
            else { out.visits++; if (r.uid) out.devices.add(r.uid); if (!out.firstVisit || r.ts < out.firstVisit) out.firstVisit = r.ts; } }
    }
    for (const d of await rd.days('solo')) {
        const s = await rd.day('solo', d);
        for (const k in s) { const r = s[k]; if (!r || isTest(r)) continue;
            out.solo.sessions++; out.solo.hours += (Number(r.dur) || 0) / 3600; out.solo.matchHours += (Number(r.inMatchSec) || 0) / 3600;
            if (r.played === true || Number(r.inMatchSec) >= 20) out.solo.played++; out.solo.matches += Number(r.matches) || 0; }
    }
    return { visits: out.visits, devices: out.devices.size, firstVisit: out.firstVisit,
             solo: { visits: out.solo.visits, devices: out.solo.devices.size, sessions: out.solo.sessions, played: out.solo.played, hours: out.solo.hours, matchHours: out.solo.matchHours, matches: out.solo.matches } };
}

// V419 (NEVER-FREEZE): the freeze counter. Every recorded game since the can-act monitor
// shipped (its 'act' entries) is scored by the checker's R-FREEZE: the seconds a phone that
// had to act, on screen and online, could not. Harness rooms are left out.
function freezeCounter() {
    const R = require('./audit-rules.js');
    const dir = AUDITS;
    const now = Date.now(), dayMs = 86400000;
    // V424: every frozen game is TEMPORARY (the game went on after it) or PERMANENT (it never did — a
    // game with any permanent freeze counts as permanent); archives are re-aligned with today's rules
    const out = { measuredGames: 0, frozenGames: 0, frozenSec: 0, temporaryGames: 0, permanentGames: 0,
                  today: { games: 0, frozen: 0, sec: 0, temporary: 0, permanent: 0 }, week: { games: 0, frozen: 0, sec: 0, temporary: 0, permanent: 0 }, since: null, recent: [] };
    const todayKey = localDay(now);
    // V433 (the owner: "reset the freeze counter … to just last 24 hours"): the counter the page shows is the last 24
    // hours, rolling — games played in it, the freezes that STARTED in it (temporary / permanent), their seconds, and
    // the list of them. The older totals stay in the record for the tools that read them.
    const cut24 = now - dayMs;
    out.last24 = { from: cut24, games: 0, frozen: 0, sec: 0, temporary: 0, permanent: 0, recent: [] };
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
        let tl0 = j.timeline || []; try { tl0 = R.realign(tl0); } catch (e) {}
        const tl = tl0.slice().sort((a, b) => a.t - b.t);
        const binds = tl.filter(e => e.k === 'bind');
        if (!tl.length || !tl.some(e => e.k === 'act') || (binds.length && binds.every(b => isTest(b)))) continue;
        let res; try { res = R.audit(tl, {}); } catch (e) { continue; }
        if (!res.frozen || !res.frozen.measured) continue;
        const games = Math.max(1, res.games || 1), sec = res.frozen.sec || 0, t = tl[0].t;
        const kind = sec > 0 ? ((res.frozen.permanent && res.frozen.permanent.n > 0) ? 'permanent' : 'temporary') : null;
        out.measuredGames += games; if (sec > 0) { out.frozenGames++; out.frozenSec += sec; out[kind + 'Games']++; }
        if (!out.since || t < out.since) out.since = t;
        const bucket = b => { b.games += games; if (sec > 0) { b.frozen++; b.sec += sec; b[kind]++; } };
        if (localDay(t) === todayKey) bucket(out.today);
        // the last 24 hours: games with a play in it; freezes that began in it
        {
            const starts = (typeof R.gameStarts === 'function') ? R.gameStarts(tl) : [];
            const played = tl.some(e => e.k === 'snap' && e.t >= cut24);
            if (played) out.last24.games += Math.max(1, starts.filter(x => x >= cut24).length);
            const ivs = (res.frozen.intervals || []).filter(x => x.kind && x.from >= cut24);
            if (ivs.length) {
                const perm = ivs.some(x => x.kind === 'permanent'), s24 = ivs.reduce((a, x) => a + Math.round(x.ms / 1000), 0);
                out.last24.frozen++; out.last24.sec += s24; out.last24[perm ? 'permanent' : 'temporary']++;
                const iv0 = ivs.find(x => x.kind === 'permanent') || ivs[0];
                out.last24.recent.push({ room: f.replace(/\.json$/, ''), t: iv0.from, sec: s24, kind: perm ? 'permanent' : 'temporary', why: iv0.why || '', resumedBy: iv0.resumedBy || '' });
            }
        }
        if (now - t < 7 * dayMs) bucket(out.week);
        if (sec > 0) {
            const iv = res.frozen.intervals.find(x => x.kind === 'permanent') || res.frozen.intervals.find(x => x.kind) || {};
            out.recent.push({ room: f.replace(/\.json$/, ''), t, sec, kind, why: iv.why || '', resumedBy: iv.resumedBy || '' });
        }
    }
    out.recent = out.recent.sort((a, b) => b.t - a.t).slice(0, 10);
    out.last24.recent = out.last24.recent.sort((a, b) => b.t - a.t).slice(0, 25);
    return out;
}

// V412: the weekly check — weekday traffic this week vs the same weekdays last week, and every door up
const localDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
async function weekly() {
    const tok = await require('./fb-auth.js').token();
    const get = async p => { const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; };
    const rd = await dayReader();
    const now = new Date(), perDay = {};
    for (let i = 16; i >= -1; i--) {
        const k = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
        const v = await rd.day('visits', k);
        for (const id in v) { const r = v[id]; if (!r || !r.ts || isTest(r) || r.src === 'solo') continue; const d = localDay(r.ts); (perDay[d] = perDay[d] || { visits: 0, devices: new Set() }).visits++; if (r.uid) perDay[d].devices.add(r.uid); }
    }
    // games per local day from the archives
    const dir = AUDITS, gamesDay = {};
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
        const tl = j.timeline || []; if (tl.filter(e => e.k === 'snap').length < 3) continue;
        const d = localDay(Math.min(...tl.map(e => e.t))); gamesDay[d] = (gamesDay[d] || 0) + 1;
    }
    // weekdays so far this week (Mon..yesterday, plus today if after 3 PM) vs the same weekdays a week earlier
    const today = new Date(); const dow = (today.getDay() + 6) % 7;   // Mon=0
    const days = []; for (let i = dow; i >= 0; i--) { const d = new Date(today.getTime() - i * 86400000); if (i === 0 && today.getHours() < 15) continue; if (d.getDay() === 0 || d.getDay() === 6) continue; days.push(d); }
    const sum = (list, shift) => list.reduce((a, d) => { const k = localDay(d.getTime() - shift * 86400000); const p = perDay[k]; return { visits: a.visits + (p ? p.visits : 0), games: a.games + (gamesDay[k] || 0), days: a.days + 1 }; }, { visits: 0, games: 0, days: 0 });
    const thisWeek = sum(days, 0), lastWeek = sum(days, 7);
    const doors = {};
    for (const [name, u] of [['vercel', 'https://two-player-rb.vercel.app/'], ['pages', 'https://coder-1611.github.io/two-player-rb/'], ['firebase', 'https://realretrobowl2p.web.app/']]) {
        try { const r = await fetch(u + '?cb=' + Date.now(), { cache: 'no-store' }); const t = await r.text(); doors[name] = { status: r.status, ver: (t.match(/GAME — (V\d+)/) || [])[1] || '' }; } catch (e) { doors[name] = { status: 0, ver: '' }; }
    }
    const warnings = [];
    if (lastWeek.games >= 20 && thisWeek.games < lastWeek.games * 0.5) warnings.push('weekday games are down ' + Math.round(100 - 100 * thisWeek.games / lastWeek.games) + '% on the same weekdays last week — check whether the site is blocked at school');
    if (lastWeek.visits >= 100 && thisWeek.visits < lastWeek.visits * 0.5) warnings.push('weekday visits are down ' + Math.round(100 - 100 * thisWeek.visits / lastWeek.visits) + '% on the same weekdays last week — check whether the site is blocked at school');
    const vers = new Set(Object.values(doors).map(d => d.ver));
    for (const [n, d] of Object.entries(doors)) if (d.status !== 200) warnings.push(n + ' door is down (HTTP ' + d.status + ')');
    if (vers.size > 1) warnings.push('the doors serve different versions: ' + Object.entries(doors).map(([n, d]) => n + ' ' + d.ver).join(', '));
    const last14 = []; for (let i = 13; i >= 0; i--) { const k = localDay(now.getTime() - i * 86400000); last14.push({ day: k, visits: perDay[k] ? perDay[k].visits : 0, devices: perDay[k] ? perDay[k].devices.size : 0, games: gamesDay[k] || 0 }); }
    return { thisWeek, lastWeek, weekdays: days.map(d => localDay(d.getTime())), doors, warnings, last14 };
}

(async () => {
    const a = fromArchives();
    const d = await fromDb();
    const stats = { updatedAt: Date.now(),
        two: { games: a.games, complete: a.complete, phoneSessions: a.phones, personHours: Math.round(a.personHours * 10) / 10, gameHours: Math.round(a.gameHours * 10) / 10, since: a.since, until: a.until,
               visits: d.visits, devices: d.devices, visitsSince: d.firstVisit },
        solo: { visits: d.solo.visits, devices: d.solo.devices, sessions: d.solo.sessions, played: d.solo.played, hours: Math.round(d.solo.hours * 10) / 10, matchHours: Math.round(d.solo.matchHours * 10) / 10, matches: d.solo.matches, since: Date.parse('2026-09-21T13:55:00Z') },
        weekly: await weekly(),
        freeze: freezeCounter(),
        notes: 'two-player games and hours from the audit archives (recorded games since 2026-09-02, idle gaps over 5 min excluded); visits/devices since the visit beacon (2026-09-14); solo since 2026-09-21' };
    console.log(JSON.stringify(stats, null, 1));
    if (dry) return;
    const tok = await ownerToken();
    const r = await fetch(DB + 'stats/alltime.json?access_token=' + tok, { method: 'PUT', body: JSON.stringify(stats) });
    console.log('published stats/alltime: ' + r.status);
})().catch(e => { console.error(e); process.exit(1); });
