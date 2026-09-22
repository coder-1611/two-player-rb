#!/usr/bin/env node
// tools/players-report.js — who is playing, two-player AND solo, per day.
//
//   node tools/players-report.js            last 7 days
//   node tools/players-report.js 14         last 14 days
//   node tools/players-report.js --json     machine-readable
//
// Sources (Firebase RTDB realretrobowl2p):
//   visits/{day}/{id}   one record per page load, src = vercel|pages|sites|local|solo, uid = the browser's anonymous id
//   solo/{day}/{id}     the solo session, updated every 30s: dur (seconds visible), taps, played, matches, inMatchSec
//   rooms/{code}/audit  the two-player games (a 'game' entry per match start since V398, bind entries with uid)
'use strict';
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const auth = () => require('./fb-auth.js').token();
const args = process.argv.slice(2);
const json = args.includes('--json');
const days = Math.max(1, parseInt(args.find(a => /^\d+$/.test(a)) || '7', 10));

async function get(tok, p, q) {
    const r = await fetch(DB + p + '.json?auth=' + tok + (q ? '&' + q : ''), { cache: 'no-store' });
    return r.ok ? r.json() : null;
}
const dayStr = d => d.toISOString().slice(0, 10);
const median = xs => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function main() {
    const tok = await auth();
    const today = new Date();
    const list = [];
    for (let i = days - 1; i >= 0; i--) list.push(dayStr(new Date(today.getTime() - i * 86400000)));
    const seenBefore = { two: new Set(), solo: new Set() };
    // devices seen on days before the window, for "returning"
    try {
        const all = await get(tok, 'visits', 'shallow=true') || {};
        for (const d of Object.keys(all)) {
            if (d >= list[0]) continue;
            const v = await get(tok, 'visits/' + d) || {};
            for (const k in v) { const r = v[k]; if (!r || !r.uid) continue; (r.src === 'solo' ? seenBefore.solo : seenBefore.two).add(r.uid); }
        }
    } catch (e) {}
    const rows = [];
    for (const d of list) {
        const [v, s] = await Promise.all([get(tok, 'visits/' + d), get(tok, 'solo/' + d)]);
        const two = { visits: 0, devices: new Set(), bySrc: {}, newDevices: 0 };
        const solo = { visits: 0, devices: new Set(), sessions: 0, played: 0, playedDevices: new Set(), matches: 0, durs: [], newDevices: 0, tz: {} };
        const isTest = r => r && (r.src === 'local' || /localhost|127\.0\.0\.1/.test(String(r.host || '')) || /HeadlessChrome/.test(String(r.ua || '')));
        for (const k in (v || {})) {
            const r = v[k]; if (!r || isTest(r)) continue;
            if (r.src === 'solo') { solo.visits++; if (r.uid) { if (!solo.devices.has(r.uid) && !seenBefore.solo.has(r.uid)) solo.newDevices++; solo.devices.add(r.uid); } if (r.tz) solo.tz[r.tz] = (solo.tz[r.tz] || 0) + 1; }
            else { two.visits++; two.bySrc[r.src || '?'] = (two.bySrc[r.src || '?'] || 0) + 1; if (r.uid) { if (!two.devices.has(r.uid) && !seenBefore.two.has(r.uid)) two.newDevices++; two.devices.add(r.uid); } }
        }
        for (const k in (s || {})) {
            const r = s[k]; if (!r || isTest(r)) continue;
            solo.sessions++;
            const dur = Number(r.dur) || 0; solo.durs.push(dur);
            if (r.played === true || Number(r.inMatchSec) >= 20) { solo.played++; if (r.uid) solo.playedDevices.add(r.uid); }
            solo.matches += Number(r.matches) || 0;
        }
        for (const u of two.devices) seenBefore.two.add(u);
        for (const u of solo.devices) seenBefore.solo.add(u);
        rows.push({ day: d,
            two: { visits: two.visits, devices: two.devices.size, newDevices: two.newDevices, bySrc: two.bySrc },
            solo: { visits: solo.visits, devices: solo.devices.size, newDevices: solo.newDevices, sessions: solo.sessions, played: solo.played, playedDevices: solo.playedDevices.size,
                    matches: solo.matches, medianDurSec: median(solo.durs), topTz: Object.entries(solo.tz).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0] + ' ' + x[1]) } });
    }
    if (json) { console.log(JSON.stringify(rows, null, 1)); return; }
    console.log('WHO IS PLAYING — last ' + days + ' day' + (days === 1 ? '' : 's') + ' (devices = distinct browsers by anonymous id; "new" = never seen before that day)\n');
    console.log('day         | TWO-PLAYER visits devices new  doors                 | SOLO visits devices new  played(dev)  matches  median-min');
    for (const r of rows) {
        const doors = Object.entries(r.two.bySrc).map(x => x[0] + ':' + x[1]).join(' ') || '-';
        console.log(r.day + '  | ' + String(r.two.visits).padStart(6) + String(r.two.devices).padStart(8) + String(r.two.newDevices).padStart(5) + '  ' + doors.padEnd(22) +
                    '| ' + String(r.solo.visits).padStart(6) + String(r.solo.devices).padStart(8) + String(r.solo.newDevices).padStart(5) + '  ' + (r.solo.played + '(' + r.solo.playedDevices + ')').padStart(11) +
                    String(r.solo.matches).padStart(9) + String((r.solo.medianDurSec / 60).toFixed(1)).padStart(12) + (r.solo.topTz.length ? '   ' + r.solo.topTz.join(', ') : ''));
    }
    const tot = rows.reduce((a, r) => ({ tv: a.tv + r.two.visits, sv: a.sv + r.solo.visits, sp: a.sp + r.solo.played, sm: a.sm + r.solo.matches }), { tv: 0, sv: 0, sp: 0, sm: 0 });
    console.log('\ntotals: two-player visits ' + tot.tv + ' · solo visits ' + tot.sv + ' · solo sessions that played ' + tot.sp + ' · solo matches started ' + tot.sm);
    console.log('note: solo records exist only from the beacon deploy on 2026-09-21; "played" = a match was on the field (22 sprites) for 20s+.');
}
main().catch(e => { console.error(e); process.exit(1); });
