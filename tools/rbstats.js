#!/usr/bin/env node
// tools/rbstats.js — the numbers behind 2rbstats.vercel.app (the owner, 8 Oct: "create a website called 2rbstats.vercel.app
// that gives all the stats of people on it, but the ui needs to be 100% like vercel analytics ... This should add google
// sites, web.app and the vercel. with visitors, views, and distinct devices ... It should update every 10 minutes").
// Run every 10 minutes by the LaunchAgent com.rb2p.rbstats (tools/install-rbstats.sh).
//
// The source is the game's own visit log: visits/{day}/{ts_rand} — one record per page load of the game (V388: host, src
// = the door, uid = the device's anonymous id, ua, platform, touch, screen, time zone, referrer). Finished days are cached
// on this Mac (.rb2p/rbstats-cache/{day}.json); today and yesterday are read again, only the records after the last one
// cached (orderBy $key), so a run downloads a few KB.
//   · a page view = a visit record; a visitor = a device on a day (Vercel's daily unique visitor), summed over the days
//   · a distinct device = a device id, once over the whole period
//   · the doors: vercel (two-player-rb.vercel.app), webapp (realretrobowl2p.web.app), sites (the Google Sites embed),
//     pages (coder-1611.github.io), all = the four. The single-player site (src solo) and test runs are left out.
//   · a period's change is against the period before it, of the same length — only when the log covers it (from 16 Sep)
//   · countries come from the device's time zone (the log has no IP); devices / browsers / OS from its user agent
// Publishes embedcode/rbstats/v1 (public read): meta { at, online, doors }, and {door}/{range} for the ranges 24h (hourly),
// 7d, 30d, 90d (daily, ending today), each { from, to, bucket, series [[t, visitors, views, devices]], partial, total, prev,
// panels { pages, hostnames, referrers, countries, devices, browsers, os } — [label, visitors] best first }.
//   node tools/rbstats.js            build and publish (what the LaunchAgent runs)
//   node tools/rbstats.js --dry      build and print, publish nothing
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const DP = require('./device-profiles.js');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const DRY = process.argv.includes('--dry');
const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const CACHE = path.join(RB2P, 'rbstats-cache');
const FIRST_DAY = '2026-09-16';
const TZ = 'America/Chicago';
const log = m => console.log(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + m);

// ---- the owner's login on this Mac (admin), as tools/elo.js ----
async function ownerToken() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    if (!r.ok) throw new Error('owner token ' + r.status);
    return (await r.json()).access_token;
}

// ---- days in Central time ----
const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
function dayStart(day) {   // ms of 00:00 Central on that day
    const [y, m, d] = day.split('-').map(Number), guess = Date.UTC(y, m - 1, d, 6);
    for (const h of [5, 6, 7]) { const t = Date.UTC(y, m - 1, d, h); if (dayOf(t) === day && dayOf(t - 3600e3) !== day) return t; }
    return guess;
}
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// ---- the log ----
async function loadVisits(tok) {
    fs.mkdirSync(CACHE, { recursive: true });
    const today = dayOf(Date.now()), out = {};
    for (let d = FIRST_DAY; d <= addDays(today, 1); d = addDays(d, 1)) {
        const file = path.join(CACHE, d + '.json');
        let have = null; try { have = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
        const done = d < addDays(today, -1);   // a day two or more days back no longer grows (all time zones are past it)
        if (have && done && have.final) { out[d] = have.recs; continue; }
        const recs = (have && have.recs) || {};
        const keys = Object.keys(recs).sort(), last = keys[keys.length - 1];
        const q = last ? '&orderBy=%22%24key%22&startAt=' + encodeURIComponent(JSON.stringify(last)) : '';
        const r = await fetch(DB + 'visits/' + d + '.json?access_token=' + encodeURIComponent(tok) + q, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error('visits/' + d + ' ' + r.status);
        const got = (await r.json()) || {};
        for (const k of Object.keys(got)) recs[k] = slim(got[k]);
        fs.writeFileSync(file + '.tmp', JSON.stringify({ final: done, recs })); fs.renameSync(file + '.tmp', file);
        out[d] = recs;
    }
    return out;
}
function slim(r) {   // what the board needs, nothing else
    return { ts: Number(r.ts) || 0, uid: String(r.uid || ''), src: String(r.src || ''), host: String(r.host || ''), ref: String(r.ref || ''), tz: String(r.tz || ''),
             ua: String(r.ua || ''), platform: String(r.platform || ''), touch: r.touch === true };
}

// ---- what a record is ----
const DOORS = { vercel: 'two-player-rb.vercel.app', webapp: 'realretrobowl2p.web.app', sites: 'Google Sites', pages: 'coder-1611.github.io' };
function doorOf(r) {
    if (r.src === 'vercel' || r.host === 'two-player-rb.vercel.app') return 'vercel';
    if (/realretrobowl2p\.(web\.app|firebaseapp\.com)/.test(r.src + ' ' + r.host)) return 'webapp';
    if (r.src === 'sites') return 'sites';
    if (r.src === 'pages' || /github\.io/.test(r.host)) return 'pages';
    return '';   // the single-player site, local runs
}
const isTest = r => /localhost|127\.0\.0\.1/.test(r.host) || /HeadlessChrome/.test(r.ua) || r.src === 'local';
const OWN = /(^|\.)(two-player-rb\.vercel\.app|realretrobowl2p\.(web\.app|firebaseapp\.com)|coder-1611\.github\.io|main-retro-bowl\.vercel\.app|localhost|127\.0\.0\.1)$/;
function referrerOf(r) {
    let h = ''; try { h = new URL(r.ref).hostname; } catch (e) { return ''; }
    if (!h || OWN.test(h)) return '';
    h = h.replace(/^www\./, '');
    if (/(^|\.)googleusercontent\.com$/.test(h) || /^sites\.google\.com$/.test(h)) return h;   // the Google Sites embed's own frames
    return h;
}
function deviceOf(r) {
    const k = DP.kindOf({ ua: r.ua, platform: r.platform, touch: r.touch });
    return /iPhone|Android phone/.test(k) ? 'Mobile' : /iPad|Android tablet/.test(k) ? 'Tablet' : 'Desktop';
}
function osName(r) {
    const k = DP.kindOf({ ua: r.ua, platform: r.platform, touch: r.touch });
    if (k === 'iPad') return 'iOS';   // an iPad asking for desktop sites says Mac
    const o = DP.osOf(r.ua);
    return /^ChromeOS/.test(o) ? 'Chrome OS' : /^(iOS|iPadOS)/.test(o) ? 'iOS' : /^Android/.test(o) ? 'Android' : /^Windows/.test(o) ? 'Windows' : /^macOS/.test(o) ? 'Mac' : o === 'Linux' ? 'Linux' : 'Unknown';
}
const browserName = r => String(DP.browserOf(r.ua) || 'Unknown').replace(/ \d+$/, '');
const TZC = { 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US', 'America/Detroit': 'US', 'America/Indianapolis': 'US', 'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US', 'America/Menominee': 'US',
    'America/Puerto_Rico': 'PR', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Regina': 'CA',
    'America/St_Johns': 'CA', 'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX', 'America/Cancun': 'MX', 'America/Guatemala': 'GT', 'America/El_Salvador': 'SV',
    'America/Tegucigalpa': 'HN', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL',
    'America/Caracas': 'VE', 'America/Jamaica': 'JM', 'America/Santo_Domingo': 'DO', 'America/Havana': 'CU', 'Pacific/Saipan': 'MP', 'Pacific/Guam': 'GU', 'Pacific/Auckland': 'NZ',
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
    'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
    'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Moscow': 'RU', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Manila': 'PH', 'Asia/Singapore': 'SG',
    'Asia/Jakarta': 'ID', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Jerusalem': 'IL', 'Asia/Tehran': 'IR', 'Australia/Sydney': 'AU',
    'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Nairobi': 'KE',
    'Indian/Chagos': 'IO' };
const COUNTRY = { US: 'United States of America', PR: 'Puerto Rico', CA: 'Canada', MX: 'Mexico', GT: 'Guatemala', SV: 'El Salvador', HN: 'Honduras', CO: 'Colombia', PE: 'Peru', BR: 'Brazil',
    AR: 'Argentina', CL: 'Chile', VE: 'Venezuela', JM: 'Jamaica', DO: 'Dominican Republic', CU: 'Cuba', MP: 'Northern Mariana Islands', GU: 'Guam', NZ: 'New Zealand', GB: 'United Kingdom',
    IE: 'Ireland', FR: 'France', DE: 'Germany', ES: 'Spain', IT: 'Italy', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
    FI: 'Finland', PL: 'Poland', CZ: 'Czechia', PT: 'Portugal', GR: 'Greece', TR: 'Türkiye', UA: 'Ukraine', RU: 'Russia', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', CN: 'China',
    HK: 'Hong Kong', JP: 'Japan', KR: 'South Korea', PH: 'Philippines', SG: 'Singapore', ID: 'Indonesia', TH: 'Thailand', VN: 'Vietnam', AE: 'United Arab Emirates', SA: 'Saudi Arabia',
    IL: 'Israel', IR: 'Iran', AU: 'Australia', NG: 'Nigeria', EG: 'Egypt', ZA: 'South Africa', KE: 'Kenya', IO: 'British Indian Ocean Territory' };
function countryOf(r) {
    let c = TZC[r.tz];
    if (!c && /^America\/(Indiana|Kentucky|North_Dakota)\//.test(r.tz)) c = 'US';
    return c ? c + '|' + COUNTRY[c] : 'XX|Unknown';
}

// ---- the numbers ----
function build(visits, now) {
    const recs = [];
    for (const d of Object.keys(visits)) for (const r of Object.values(visits[d])) {
        if (!r || !r.ts || !r.uid || isTest(r)) continue;
        const door = doorOf(r); if (!door) continue;
        recs.push({ ts: r.ts, uid: r.uid, door, day: dayOf(r.ts), host: DOORS[door], ref: referrerOf(r), country: countryOf(r), device: deviceOf(r), browser: browserName(r), os: osName(r) });
    }
    recs.sort((a, b) => a.ts - b.ts);
    const firstMs = dayStart(FIRST_DAY), today = dayOf(now);
    const ranges = {
        '24h': { from: Math.floor(now / 3600e3) * 3600e3 - 23 * 3600e3, to: now, bucket: 'hour' },
        '7d': { from: dayStart(addDays(today, -7)), to: now, bucket: 'day' },
        '30d': { from: dayStart(addDays(today, -30)), to: now, bucket: 'day' },
        '90d': { from: dayStart(addDays(today, -90)), to: now, bucket: 'day' }
    };
    const out = { meta: { at: now, from: firstMs, doors: DOORS, online: {} }, all: {}, vercel: {}, webapp: {}, sites: {}, pages: {} };
    for (const door of ['all', 'vercel', 'webapp', 'sites', 'pages']) {
        const mine = door === 'all' ? recs : recs.filter(r => r.door === door);
        out.meta.online[door] = new Set(mine.filter(r => now - r.ts < 10 * 60000).map(r => r.uid)).size;   // devices that loaded the game in the last 10 minutes
        for (const [name, R] of Object.entries(ranges)) out[door][name] = rangeOf(mine, R, now, firstMs);
    }
    return out;
}
function totals(list) {
    const daySets = {}, all = new Set();
    for (const r of list) { (daySets[r.day] || (daySets[r.day] = new Set())).add(r.uid); all.add(r.uid); }
    return { visitors: Object.values(daySets).reduce((s, x) => s + x.size, 0), views: list.length, devices: all.size };
}
function panel(list, key, n) {   // [label, visitors] best first (visitors: a device on a day, as the totals)
    const m = {};
    for (const r of list) { const v = r[key]; if (!v) continue; ((m[v] || (m[v] = {}))[r.day] || (m[v][r.day] = new Set())).add(r.uid); }
    return Object.entries(m).map(([k, days]) => [k, Object.values(days).reduce((s, x) => s + x.size, 0)]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n || 50);
}
function rangeOf(mine, R, now, firstMs) {
    const list = mine.filter(r => r.ts >= R.from && r.ts <= R.to);
    // the buckets: hours, or days (00:00 Central)
    const starts = [];
    if (R.bucket === 'hour') for (let t = R.from; t <= now; t += 3600e3) starts.push(t);
    else for (let d = dayOf(R.from); d <= dayOf(now); d = addDays(d, 1)) starts.push(dayStart(d));
    const series = starts.map((t0, i) => {
        const t1 = i + 1 < starts.length ? starts[i + 1] : now + 1;
        const b = list.filter(r => r.ts >= t0 && r.ts < t1), devs = new Set(b.map(r => r.uid));
        return [t0, devs.size, b.length, devs.size];
    });
    const len = R.to - R.from, prevList = mine.filter(r => r.ts >= R.from - len && r.ts < R.from);
    const prev = R.from - len >= firstMs ? totals(prevList) : null;   // only a period the log covers
    return {
        from: R.from, to: R.to, bucket: R.bucket, series, partial: true, total: totals(list), prev,
        panels: {
            pages: list.length ? [['/', totals(list).visitors]] : [],
            hostnames: panel(list, 'host'), referrers: panel(list, 'ref', 30),
            countries: panel(list, 'country'), devices: panel(list, 'device'), browsers: panel(list, 'browser'), os: panel(list, 'os')
        }
    };
}

(async () => {
    const t0 = Date.now(), tok = await ownerToken();
    const visits = await loadVisits(tok);
    const out = build(visits, Date.now());
    const t = out.all['7d'].total;
    log('built: 7 days ' + t.visitors + ' visitors, ' + t.views + ' views, ' + t.devices + ' devices; online ' + out.meta.online.all + ' (' + (Date.now() - t0) + ' ms)');
    if (DRY) { console.log(JSON.stringify(out.all['7d'], null, 1).slice(0, 3000)); return; }
    const body = JSON.stringify(out);
    const r = await fetch(DB + 'embedcode/rbstats/v1.json?print=silent&access_token=' + encodeURIComponent(tok), { method: 'PUT', body, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('publish ' + r.status + ' ' + (await r.text()).slice(0, 120));
    log('published embedcode/rbstats/v1 (' + Math.round(body.length / 1024) + ' KB)');
})().catch(e => { log('FATAL ' + (e && e.message || e)); process.exit(2); });
