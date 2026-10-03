// tools/device-profiles.js — one profile for every device that ever opened the game (V438, the owner: "create a profile
// for EVERY device that ever plays this so we can identify how many distinct devices have played and see device stats").
//
// A device = the browser's anonymous Firebase uid (one per browser profile, kept across visits — V392). Built on this
// Mac from what is already recorded, nothing new is collected:
//   - visits/{day}/{id} (V388): the device's user agent, screen, time zone, language, touch, and which door it came in by;
//   - the audit archive (audits/*.json): each game's 'bind' entries name the device (uid) behind role a / b, so a
//     device's games, finished games and results (its own 'final' entry: su / so) are counted.
// No names, no IPs: a profile is keyed by the anonymous uid and shown by its first 6 characters. Devices from before the
// uid existed (before 2026-09-16) cannot be told apart and are not counted. Harness runs are excluded.
//
//   build(visitDays, auditsDir, isTest) -> { summary, list }   (used by tools/alltime-stats.js, published to
//                                                               stats/alltime.devices and stats/devices)
//   node tools/device-profiles.js            print the summary (reads the database's visits with the day cache)
'use strict';
const fs = require('fs');
const path = require('path');

const localDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };

// what kind of device, from the user agent the browser sends with every request
function kindOf(r) {
    const ua = String(r.ua || ''), plat = String(r.platform || ''), touch = r.touch === true;
    if (/CrOS/.test(ua)) return 'Chromebook';
    if (/iPhone|iPod/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch) || (/MacIntel/.test(plat) && touch)) return 'iPad';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
    if (/Linux|X11/.test(ua)) return 'Linux PC';
    return 'Other';
}
function browserOf(ua) {
    ua = String(ua || '');
    const v = re => { const m = re.exec(ua); return m ? ' ' + m[1] : ''; };
    if (/Edg\//.test(ua)) return 'Edge' + v(/Edg\/(\d+)/);
    if (/SamsungBrowser/.test(ua)) return 'Samsung Internet' + v(/SamsungBrowser\/(\d+)/);
    if (/OPR\//.test(ua)) return 'Opera' + v(/OPR\/(\d+)/);
    if (/CriOS/.test(ua)) return 'Chrome' + v(/CriOS\/(\d+)/);
    if (/FxiOS/.test(ua)) return 'Firefox' + v(/FxiOS\/(\d+)/);
    if (/Firefox\//.test(ua)) return 'Firefox' + v(/Firefox\/(\d+)/);
    if (/Chrome\//.test(ua)) return 'Chrome' + v(/Chrome\/(\d+)/);
    if (/Safari\//.test(ua)) return 'Safari' + v(/Version\/(\d+)/);
    return 'Other';
}
function osOf(ua) {
    ua = String(ua || '');
    let m;
    if ((m = /CrOS \S+ ([\d.]+)/.exec(ua))) return 'ChromeOS ' + m[1].split('.')[0];
    if ((m = /OS (\d+)[_\d]* like Mac OS X/.exec(ua))) return (/iPad/.test(ua) ? 'iPadOS ' : 'iOS ') + m[1];
    if ((m = /Android (\d+)/.exec(ua))) return 'Android ' + m[1];
    if ((m = /Windows NT ([\d.]+)/.exec(ua))) return 'Windows ' + ({ '10.0': '10/11', '6.3': '8.1', '6.1': '7' }[m[1]] || m[1]);
    if ((m = /Mac OS X (\d+)[_.](\d+)/.exec(ua))) return 'macOS ' + m[1] + '.' + m[2];
    if (/Linux/.test(ua)) return 'Linux';
    return '';
}
const screenClass = (w, h) => { const s = Math.min(w, h), l = Math.max(w, h); if (!s) return ''; return s < 500 ? 'phone' : s < 800 ? (l < 1100 ? 'tablet' : 'small laptop') : l < 1500 ? 'laptop' : 'desktop'; };
// the door a device came in by, in plain words (visits' src: vercel / pages / sites / solo, or a bare host)
const doorName = src => ({ vercel: 'Vercel', pages: 'GitHub Pages', sites: 'Google Sites', solo: 'solo game', local: 'local' }[src] || (/web\.app|firebaseapp/.test(src) ? 'Firebase' : String(src)));
const verNum = v => Number(String(v || '').replace(/\D/g, '')) || 0;

// V444 (the owner: "a separate tab in game transcripts where each device is named after its first ever username … click on a
// device profile you see the games played, the complaints and all the usernames"): extra = { names: {ROOM: {a, b}} (the
// rooms' rooms/CODE/names — the name each seat typed), complaints: {id: rec} }. Every game's names come from the bind
// entry when it carries one (V444 on), else the room's names record (the last name each seat wrote — exact for a one-game
// room, the room's latest name for a rematch room). A complaint belongs to the device that sat in its room's seat at the
// time (V444 on: its own uid).
const ID_LEN = 8;
function build(visitDays, auditsDir, isTest, extra) {
    extra = extra || {};
    const roomNames = extra.names || {}, complaints = extra.complaints || {};
    const dev = {};
    const get = uid => (dev[uid] = dev[uid] || { uid, visits: 0, solo: 0, days: new Set(), doors: new Set(), first: Infinity, last: 0, ua: '', platform: '', touch: false,
                                                  sw: 0, sh: 0, dpr: 0, tz: '', lang: '', games: 0, complete: 0, won: 0, lost: 0, tied: 0, rooms: new Set(), vmin: 0, vmax: 0,
                                                  names: {}, gameList: [], complaints: [] });
    const nameSeen = (d, nm, t) => { nm = String(nm || '').trim(); if (!nm || nm === '?') return; const e = (d.names[nm] = d.names[nm] || { n: 0, first: Infinity, last: 0 }); e.n++; if (t < e.first) e.first = t; if (t > e.last) e.last = t; };
    // 1. visits: one record per page load
    for (const day of Object.keys(visitDays)) {
        const v = visitDays[day] || {};
        for (const k in v) {
            const r = v[k]; if (!r || !r.uid || isTest(r)) continue;
            const d = get(r.uid);
            if (r.src === 'solo') d.solo++; else d.visits++;
            const ts = Number(r.ts) || 0;
            if (ts) { d.days.add(localDay(ts)); if (ts < d.first) d.first = ts; }
            if (ts >= d.last) { d.last = ts; d.ua = r.ua || d.ua; d.platform = r.platform || d.platform; d.touch = r.touch === true; d.sw = Number(r.sw) || d.sw; d.sh = Number(r.sh) || d.sh;
                                d.dpr = Number(r.dpr) || d.dpr; d.tz = r.tz || d.tz; d.lang = r.lang || d.lang; }
            if (r.src) d.doors.add(doorName(r.src));
        }
    }
    // 2. games: the archive's bind entries say which device played which role; a game counts for a device when its
    //    role snapped in it (a game = a match-start segment with at least 3 snaps, as tools/alltime-stats.js counts)
    const R = require('./audit-rules.js');
    const bindsByRoom = {};
    for (const f of fs.readdirSync(auditsDir).filter(x => x.endsWith('.json'))) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(auditsDir, f), 'utf8')); } catch (e) { continue; }
        const tl = (j.timeline || []).slice().sort((a, b) => a.t - b.t); if (!tl.length) continue;
        const binds = tl.filter(e => e.k === 'bind');
        if (!binds.some(b => b.uid) || binds.every(b => isTest(b))) continue;
        const room = f.replace(/\.json$/, '');
        bindsByRoom[room] = binds;
        let starts = []; try { starts = (typeof R.gameStarts === 'function') ? R.gameStarts(tl) : []; } catch (e) { starts = []; }
        if (!starts.length) starts = [tl[0].t];
        for (let i = 0; i < starts.length; i++) {
            const a = starts[i], b = i + 1 < starts.length ? starts[i + 1] : Infinity;
            const seg = tl.filter(e => e.t >= a - 1000 && e.t < b);
            if (seg.filter(e => e.k === 'snap').length < 3) continue;
            const seat = {};
            for (const role of ['a', 'b']) seat[role] = binds.filter(e => e.role === role && e.uid && e.t < b).pop() || null;
            const nameOf = role => { const bd = seat[role]; return String((bd && bd.name) || (roomNames[room] && roomNames[room][role]) || '').trim(); };
            for (const role of ['a', 'b']) {
                const bd = seat[role]; if (!bd) continue;
                if (!seg.some(e => e.role === role && e.k === 'snap')) continue;
                const other = role === 'a' ? 'b' : 'a';
                const d = get(bd.uid);
                d.games++; d.rooms.add(room);
                const v = verNum(bd.ver); if (v) { d.vmin = d.vmin ? Math.min(d.vmin, v) : v; d.vmax = Math.max(d.vmax, v); }
                const fin = seg.filter(e => e.role === role && e.k === 'final').pop();
                const sc = fin || seg.filter(e => e.role === role && e.k === 'score').pop();
                let res = '';
                if (fin) { d.complete++; const su = Number(fin.su), so = Number(fin.so); if (su > so) { d.won++; res = 'W'; } else if (su < so) { d.lost++; res = 'L'; } else { d.tied++; res = 'T'; } }
                if (seg[0] && seg[0].t < d.first) d.first = seg[0].t;
                const segLast = seg[seg.length - 1].t; if (segLast > d.last) d.last = segLast;
                if (!d.ua) { d.ua = bd.ua || ''; }
                if (bd.src) d.doors.add(doorName(bd.src));
                const me = nameOf(role); nameSeen(d, me, seg[0].t);
                d.gameList.push({ r: room, t: seg[0].t, role, me, opp: nameOf(other), od: seat[other] && seat[other].uid ? seat[other].uid.slice(0, ID_LEN) : '',
                                  su: sc ? Number(sc.su) || 0 : null, so: sc ? Number(sc.so) || 0 : null, res, fin: !!fin,
                                  q: Math.max(0, ...seg.filter(e => e.role === role && e.k === 'snap').map(e => Number(e.q) || 0)), v: bd.ver || '' });
            }
        }
    }
    // 3. complaints: the device that sat in the room's seat when it was sent (V444 on: its own uid)
    const byPrefix = {}; for (const uid of Object.keys(dev)) byPrefix[uid] = dev[uid];
    const unlinked = [];
    for (const id of Object.keys(complaints)) {
        const c = complaints[id]; if (!c) continue;
        if (isTest({ ua: c.ua })) continue;
        let uid = c.uid && dev[c.uid] ? c.uid : null;
        if (!uid && c.room && c.role && bindsByRoom[c.room]) {
            const bs = bindsByRoom[c.room].filter(e => e.role === c.role && e.uid);
            const bd = bs.filter(e => e.t <= (Number(c.ts) || Infinity)).pop() || bs[bs.length - 1];
            if (bd) uid = bd.uid;
        }
        const rec = { id, t: Number(c.ts) || 0, text: String(c.text || '').slice(0, 600), ch: Array.isArray(c.choices) ? c.choices.slice(0, 12) : [], r: c.room || '', v: c.ver || '', name: c.name || '' };
        if (uid) { const d = get(uid); d.complaints.push(rec); nameSeen(d, c.name, rec.t); } else unlinked.push(rec);
    }
    // 4. the list, the profiles and the summary
    const now = Date.now(), today = localDay(now), wk = now - 7 * 86400000;
    const all = Object.values(dev).filter(d => d.visits || d.games || d.solo);
    const namesOf = d => Object.entries(d.names).map(([nm, e]) => [nm, e.n, e.first, e.last]).sort((x, y) => x[2] - y[2]);
    const info = d => ({
        id: d.uid.slice(0, ID_LEN), kind: kindOf(d), browser: browserOf(d.ua), os: (kindOf(d) === 'iPad' && /Macintosh/.test(d.ua)) ? 'iPadOS' : osOf(d.ua), screen: d.sw && d.sh ? d.sw + 'x' + d.sh : '', screenClass: screenClass(d.sw, d.sh),
        dpr: d.dpr || null, touch: d.touch, tz: d.tz, lang: d.lang, doors: [...d.doors].sort(), first: isFinite(d.first) ? d.first : d.last, last: d.last, days: d.days.size,
        visits: d.visits, solo: d.solo, games: d.games, complete: d.complete, won: d.won, lost: d.lost, tied: d.tied, rooms: d.rooms.size,
        builds: d.vmin ? (d.vmin === d.vmax ? 'V' + d.vmax : 'V' + d.vmin + '–V' + d.vmax) : '' });
    const list = all.map(d => { const ns = namesOf(d); return Object.assign(info(d), { name: ns.length ? ns[0][0] : '', names: ns.length, reports: d.complaints.length }); }).sort((x, y) => y.last - x.last);
    const profiles = {};
    for (const d of all) {
        const ns = namesOf(d);
        profiles[d.uid.slice(0, ID_LEN)] = Object.assign(info(d), { name: ns.length ? ns[0][0] : '', names: ns,
            gameList: d.gameList.sort((x, y) => y.t - x.t), complaints: d.complaints.sort((x, y) => y.t - x.t) });
    }
    const tally = (key, filter) => { const o = {}; for (const p of list.filter(filter || (() => true))) { const k = (typeof key === 'function' ? key(p) : p[key]) || 'unknown'; o[k] = (o[k] || 0) + 1; } return Object.entries(o).sort((a, b) => b[1] - a[1]); };   // [name, count] pairs: database keys cannot hold '/' or '.' (time zones, hosts)
    const played = p => p.games > 0;
    const summary = {
        devices: list.length, played: list.filter(played).length, visitedOnly: list.filter(p => !p.games && p.visits).length, soloOnly: list.filter(p => !p.games && !p.visits && p.solo).length,
        named: list.filter(p => p.name).length,
        newToday: list.filter(p => localDay(p.first) === today).length, new7d: list.filter(p => p.first >= wk).length,
        activeToday: list.filter(p => localDay(p.last) === today).length, active7d: list.filter(p => p.last >= wk).length,
        returning: list.filter(p => p.days >= 2).length,
        byKind: tally('kind'), byKindPlayed: tally('kind', played), byBrowser: tally(p => p.browser.replace(/ \d+$/, '')), byOs: tally(p => p.os.replace(/ [\d./]+$/, '') || 'unknown'),
        byDoor: tally(p => p.doors.join('+') || 'unknown'), byTz: tally('tz'), byScreen: tally('screenClass'), touch: list.filter(p => p.touch).length,
        deviceGames: list.reduce((a, p) => a + p.games, 0), since: list.length ? Math.min(...list.map(p => p.first)) : null, reportsUnlinked: unlinked.length };
    return { summary, list, profiles, unlinked };
}

// the rooms' names and the complaints, cached on this Mac (~/Projects/two-player-rb/.rb2p/device-cache.json): a room's names are fetched again
// only when its archive file changed since; complaints are write-once — only new ids are fetched
async function loadExtras(auditsDir, tok) {
    const os = require('os');
    const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
    const CACHE = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p', 'device-cache.json');
    let c = {}; try { c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { c = {}; }
    c.names = c.names || {}; c.complaints = c.complaints || {};
    const getJ = async p => { const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; };
    const todo = [];
    for (const f of fs.readdirSync(auditsDir).filter(x => x.endsWith('.json'))) {
        const room = f.replace(/\.json$/, ''); if (/[0-9]/.test(room)) continue;   // harness rooms
        let mt = 0; try { mt = fs.statSync(path.join(auditsDir, f)).mtimeMs; } catch (e) { continue; }
        if (!c.names[room] || c.names[room].at < mt) todo.push([room, mt]);
    }
    let i = 0;
    await Promise.all(Array.from({ length: 8 }, async () => { while (i < todo.length) { const [room, mt] = todo[i++]; try { const v = await getJ('rooms/' + room + '/names'); c.names[room] = { v: v || {}, at: Math.max(mt, Date.now()) }; } catch (e) {} } }));
    try {
        const ids = Object.keys(await getJ('complaints', 'shallow') || {});
        const sh = await (await fetch(DB + 'complaints.json?shallow=true&auth=' + tok)).json() || {};
        for (const id of Object.keys(sh)) if (!c.complaints[id]) { const rec = await getJ('complaints/' + id); if (rec) { delete rec.diag; c.complaints[id] = rec; } }
        void ids;
    } catch (e) {}
    try { fs.writeFileSync(CACHE, JSON.stringify(c)); } catch (e) {}
    const names = {}; for (const room of Object.keys(c.names)) names[room] = c.names[room].v || {};
    return { names, complaints: c.complaints, fetchedNames: todo.length };
}

module.exports = { build, loadExtras, kindOf, browserOf, osOf };

if (require.main === module) {
    (async () => {
        const os = require('os');
        const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
        const tok = await require('./fb-auth.js').token();
        const cache = (() => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p', 'stats-day-cache.json'), 'utf8')).visits || {}; } catch (e) { return {}; } })();
        const days = Object.keys(await (await fetch(DB + 'visits.json?shallow=true&auth=' + tok)).json() || {}).sort();
        const visitDays = {};
        for (const d of days) visitDays[d] = cache[d] || await (await fetch(DB + 'visits/' + d + '.json?auth=' + tok)).json() || {};
        const isTest = r => !!r && (r.src === 'local' || /localhost|127\.0\.0\.1/.test(String(r.host || '')) || /HeadlessChrome/.test(String(r.ua || '')));
        const AUD = fs.existsSync(path.resolve(__dirname, '..', 'audits')) ? path.resolve(__dirname, '..', 'audits') : '/Users/sohamsthitpragya/Projects/two-player-rb/audits';
        const ex = await loadExtras(AUD, tok);
        const out = build(visitDays, AUD, isTest, ex);
        console.log(JSON.stringify(out.summary, null, 1).slice(0, 1500) + ' …');
        console.log('names fetched this run: ' + ex.fetchedNames + '; complaints ' + Object.keys(ex.complaints).length + ' (unlinked ' + out.unlinked.length + ')');
        console.log('profiles JSON ' + Math.round(JSON.stringify(out.profiles).length / 1024) + ' KB; list ' + Math.round(JSON.stringify(out.list).length / 1024) + ' KB');
        console.log('top 12 by games: ' + out.list.slice().sort((a, b) => b.games - a.games).slice(0, 12).map(p => (p.name || '(no name)') + ' [' + p.id + '] ' + p.kind + ' ' + p.games + 'g ' + p.won + '-' + p.lost + (p.names > 1 ? ' +' + (p.names - 1) + ' names' : '')).join(' | '));
    })().catch(e => { console.error(e); process.exit(1); });
}
