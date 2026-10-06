#!/usr/bin/env node
// tools/fb-backup.js — V491 (the owner: "have a backup for firebase in case it is disabled due to overuse, e.g. store the
// data somewhere else as well"): the database, downloaded in pieces (Firebase sends at most 256 MB in one response) with
// this Mac's admin login (the Firebase CLI's), into .rb2p/firebase-backup/<date>/<node>/NNNN.json.gz, with a manifest:
// what takes the space, by top-level node and by the parts of a room (audit, plays, rtc, ...).
//   node tools/fb-backup.js            everything but the play recordings (tools/plays-archive.js already keeps those on
//                                      this Mac) — about 560 MB downloaded; --with-plays adds them (about 1.1 GB)
//   node tools/fb-backup.js --small    everything but rooms / diag / taps (the small, precious nodes) — cheap
//   node tools/fb-backup.js --recent 2 the small nodes + the rooms active in the last 2 days (the audit watcher's list)
//   node tools/fb-backup.js --auto     what the LaunchAgent com.rb2p.fb-backup runs at 3:30 am: --recent 1.25, and a full
//                                      backup on the 1st of the month; then --copy-to (iCloud Drive) and --prune
//   --copy-to DIR   copy this backup to DIR (off this Mac: iCloud Drive) and keep the newest 7 there
//   --prune         here: keep the newest 14 daily backups and 3 full ones
// A restore is `firebase database:set /<node>/<key> <file>` per piece (each file is {key: value, ...} for that node).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { execFileSync } = require('child_process');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const REPO = path.resolve(__dirname, '..');
const RB2P = fs.existsSync(path.join(REPO, '.rb2p')) ? path.join(REPO, '.rb2p') : path.resolve(REPO, '..', '..', '.rb2p');
const FIREBASE = fs.existsSync('/opt/homebrew/bin/firebase') ? '/opt/homebrew/bin/firebase' : 'firebase';
const args = process.argv.slice(2), has = f => args.includes(f), opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const AUTO = has('--auto'), SMALL = has('--small'), RECENT = AUTO ? (new Date().getDate() === 1 ? null : '1.25') : opt('--recent', null), WITH_PLAYS = has('--with-plays');   // a daily run covers the 30 h since the last
const BIG = new Set(['rooms', 'diag', 'taps']);
const day = new Date().toISOString().slice(0, 10);
const OUT = opt('--out', path.join(RB2P, 'firebase-backup', day + (SMALL ? '-small' : RECENT ? '-recent' : '')));
const log = m => console.log(new Date().toTimeString().slice(0, 8) + ' ' + m);

// the Firebase CLI's login (this Mac's): an OAuth token with the cloud-platform scope reads the whole database
function adminToken(force) {
    const p = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
    let j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (force || !j.tokens || Date.now() > Number(j.tokens.expires_at || 0) - 5 * 60e3) {
        try { execFileSync(FIREBASE, ['projects:list', '--json'], { stdio: 'ignore', timeout: 90000 }); } catch (e) {}
        j = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return j.tokens.access_token;
}
let TOK = adminToken();
async function get(p, q) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const r = await fetch(DB + p + '.json?access_token=' + TOK + (q ? '&' + q : ''), { cache: 'no-store' });
        if (r.status === 401 && attempt === 0) { TOK = adminToken(true); continue; }
        const t = await r.text();
        if (r.ok) return { json: JSON.parse(t), bytes: Buffer.byteLength(t) };
        if (r.status === 400 || r.status === 413) { const e = new Error('too big'); e.tooBig = true; e.detail = t.slice(0, 160); throw e; }
        if (attempt === 3) throw new Error('GET ' + p + ' -> ' + r.status + ' ' + t.slice(0, 160));
        await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
    }
}
const enc = encodeURIComponent, qk = k => enc(JSON.stringify(k));

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const t0 = Date.now(), manifest = { at: new Date().toISOString(), mode: SMALL ? 'small' : RECENT ? 'recent ' + RECENT + 'd' : 'full', nodes: {}, roomParts: {}, biggestRooms: [], errors: [] };
    const top = Object.keys((await get('', 'shallow=true')).json || {});
    let downloaded = 0, files = 0;
    // the rooms that may hold play recordings (active in the last 2 days, or in the play archive's list) are read part by
    // part without `plays`; the rest (no recordings left) in ranges of 20
    const st = (() => { try { return JSON.parse(fs.readFileSync(path.join(RB2P, 'audit-watch-state.json'), 'utf8')); } catch (e) { return {}; } })();
    const led = (() => { try { return JSON.parse(fs.readFileSync(path.join(RB2P, 'plays-archive', 'ledger.json'), 'utf8')); } catch (e) { return {}; } })();
    const activeSince = days => Object.entries(st.rooms || {}).filter(([c, v]) => v && Number(v.act) >= Date.now() - days * 86400e3).map(([c]) => c);
    const playRooms = new Set(activeSince(2).concat(Object.keys(led.rooms || {})));
    let recentRooms = null;
    if (RECENT) { recentRooms = [...new Set(activeSince(Number(RECENT)).concat(['~potd', '~lfg']))]; log('recent rooms: ' + recentRooms.length); }
    const roomSizes = [];
    async function saveBatch(node, keys, idx) {   // {key: value} for these keys, split until each response fits
        let res;
        try { res = keys.length === 1 ? await get(node + '/' + enc(keys[0])) : await get(node, 'orderBy=' + qk('$key') + '&startAt=' + qk(keys[0]) + '&endAt=' + qk(keys[keys.length - 1])); }
        catch (e) {
            if (!e.tooBig) throw e;
            if (keys.length > 1) { const h = Math.ceil(keys.length / 2); await saveBatch(node, keys.slice(0, h), idx + 'a'); await saveBatch(node, keys.slice(h), idx + 'b'); return; }
            // one key too big for one response: its children one by one
            const kids = Object.keys((await get(node + '/' + enc(keys[0]), 'shallow=true')).json || {});
            log(node + '/' + keys[0] + ' is too big for one response — ' + kids.length + ' parts');
            for (let i = 0; i < kids.length; i += 1) await saveBatch(node + '/' + enc(keys[0]), [kids[i]], idx + '-' + i);
            return;
        }
        const obj = keys.length === 1 ? { [keys[0]]: res.json } : (res.json || {});
        downloaded += res.bytes;
        const f = path.join(OUT, node.replace(/[^\w~%-]+/g, '_'), String(idx).padStart(4, '0') + '.json.gz');
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(obj)));
        files++;
        const top1 = node.split('/')[0];
        const m = manifest.nodes[top1] || (manifest.nodes[top1] = { keys: 0, bytes: 0 });
        for (const [k, v] of Object.entries(obj)) {
            const b = Buffer.byteLength(JSON.stringify(v)); m.keys++; m.bytes += b;
            if (node === 'rooms' && v && typeof v === 'object') {
                roomSizes.push([k, b]);
                for (const [part, pv] of Object.entries(v)) { const pb = Buffer.byteLength(JSON.stringify(pv)); const r = manifest.roomParts[part] || (manifest.roomParts[part] = { rooms: 0, bytes: 0 }); r.rooms++; r.bytes += pb; }
            }
        }
    }
    for (const node of top) {
        if (SMALL && BIG.has(node)) continue;
        if (RECENT && (node === 'diag' || node === 'taps')) continue;
        let keys;
        if (RECENT && node === 'rooms') keys = recentRooms.slice().sort();
        else keys = Object.keys((await get(node, 'shallow=true')).json || {}).sort();
        log(node + ': ' + keys.length + ' keys');
        const per = node === 'rooms' ? 20 : node === 'diag' || node === 'taps' ? 50 : 200;
        const partWise = node === 'rooms' && !WITH_PLAYS ? keys.filter(k => playRooms.has(k) || RECENT) : [];
        const ranged = node === 'rooms' && !WITH_PLAYS ? keys.filter(k => !partWise.includes(k)) : keys;
        const batches = []; for (let i = 0; i < ranged.length; i += per) batches.push(ranged.slice(i, i + per));
        // a room read part by part, without its play recordings: one file per room
        for (let i = 0; i < partWise.length; i += 4) await Promise.all(partWise.slice(i, i + 4).map(async (code, j) => {
            try {
                const parts = Object.keys((await get('rooms/' + enc(code), 'shallow=true')).json || {}).filter(p => p !== 'plays');
                const room = {};
                for (const part of parts) { const r = await get('rooms/' + enc(code) + '/' + enc(part)); room[part] = r.json; downloaded += r.bytes; }
                const f = path.join(OUT, 'rooms', 'p' + String(i + j).padStart(5, '0') + '.json.gz');
                fs.mkdirSync(path.dirname(f), { recursive: true });
                fs.writeFileSync(f, zlib.gzipSync(JSON.stringify({ [code]: room }))); files++;
                const b = Buffer.byteLength(JSON.stringify(room)), m = manifest.nodes.rooms || (manifest.nodes.rooms = { keys: 0, bytes: 0 });
                m.keys++; m.bytes += b; roomSizes.push([code, b]);
                for (const [part, pv] of Object.entries(room)) { const pb = Buffer.byteLength(JSON.stringify(pv)); const r = manifest.roomParts[part] || (manifest.roomParts[part] = { rooms: 0, bytes: 0 }); r.rooms++; r.bytes += pb; }
            } catch (e) { manifest.errors.push('rooms/' + code + ': ' + e.message); log('ERROR rooms/' + code + ': ' + e.message); }
        }));
        if (partWise.length) log('rooms read part by part (no play recordings): ' + partWise.length);
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
            while (next < batches.length) {
                const i = next++;
                try { await saveBatch(node, batches[i], i); }
                catch (e) { manifest.errors.push(node + ' batch ' + i + ': ' + e.message); log('ERROR ' + node + ' batch ' + i + ': ' + e.message); }
                if (i % 25 === 24) log(node + ' ' + (i + 1) + '/' + batches.length + ' · ' + (downloaded / 1e6).toFixed(0) + ' MB so far');
            }
        }));
    }
    roomSizes.sort((x, y) => y[1] - x[1]); manifest.biggestRooms = roomSizes.slice(0, 25);
    manifest.downloadedBytes = downloaded; manifest.files = files; manifest.seconds = Math.round((Date.now() - t0) / 1000);
    manifest.plays = WITH_PLAYS ? 'included' : 'left out (tools/plays-archive.js keeps them on this Mac)';
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
    log('done: ' + files + ' files, ' + (downloaded / 1e6).toFixed(1) + ' MB downloaded in ' + manifest.seconds + ' s → ' + OUT + (manifest.errors.length ? ' · ' + manifest.errors.length + ' ERRORS' : ''));
    // newest first; the backup folders are named YYYY-MM-DD[-small|-recent]
    const newest = (dir, re) => { try { return fs.readdirSync(dir).filter(n => re.test(n)).sort().reverse(); } catch (e) { return []; } };
    const copyTo = opt('--copy-to', null);
    if (copyTo && !manifest.errors.length) {
        try {
            fs.mkdirSync(copyTo, { recursive: true });
            fs.cpSync(OUT, path.join(copyTo, path.basename(OUT)), { recursive: true });
            for (const n of newest(copyTo, /^\d{4}-\d\d-\d\d(-small|-recent)?$/).slice(7)) fs.rmSync(path.join(copyTo, n), { recursive: true, force: true });
            log('copied to ' + copyTo + ' (the newest 7 kept there)');
        } catch (e) { log('ERROR copying to ' + copyTo + ': ' + e.message); }
    }
    if (has('--prune')) {
        const root = path.dirname(OUT);
        for (const n of newest(root, /^\d{4}-\d\d-\d\d-(small|recent)$/).slice(14)) fs.rmSync(path.join(root, n), { recursive: true, force: true });
        for (const n of newest(root, /^\d{4}-\d\d-\d\d$/).slice(3)) fs.rmSync(path.join(root, n), { recursive: true, force: true });
    }
    process.exit(manifest.errors.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
