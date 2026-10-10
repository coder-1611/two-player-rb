#!/usr/bin/env node
// tools/plays-archive.js — V458: the play recorder's Mac side. The owner: "store the numerical representation of every
// play for 24 hours then take it out of firebase and store just the numerical representation in local file somewhere
// and then delete it every 30 days" — with a guard so the free plan's downloads never run out.
//
// Every hour (LaunchAgent com.rb2p.plays-archive — tools/install-plays-archive.sh):
//   1. MOVES each play older than 24 h from Firebase (rooms/{code}/plays/{role}/p{ms}) to
//      ~/Projects/two-player-rb/.rb2p/plays-archive/{YYYY-MM-DD}/{CODE}/{role}-p{ms}.json — written, read back, and only
//      then deleted from Firebase (only that play's node). Rooms checked: the ones active since 26 h before this job's
//      last run (the audit watcher's state: a play is recorded at a snap, which the audit sees — so a Mac that was off
//      looks back over the gap), the live list, and every room this job has seen plays in until it is empty;
//   2. deletes archived plays older than 30 days (whole day folders);
//   3. publishes the guard, embedcode/playrec {on, at, usedMB, budgetMB}: the phones record only while it is on and
//      fresh (< 26 h) — off once this month's play downloads reach the budget (default 3000 MB of the plan's 10 GB),
//      and a Mac that stops running this job stops the recording by itself.
//
//   node tools/plays-archive.js                       one pass (what the LaunchAgent runs)
//   node tools/plays-archive.js --dry                 say what would move / be deleted; touch nothing, publish nothing
//   node tools/plays-archive.js --room CODE --min-age-ms 0 --no-flag     (tests) only this room, any age
//   node tools/plays-archive.js --record on | off [why]   V545: the recorder's switch (tools/playrec-switch.js) — publish only
// Env: PLAYS_BUDGET_MB (none since V545), PLAYS_KEEP_DAYS (30), PLAYS_ARCHIVE (the folder), FIREBASE_BIN (firebase).
// V545 (the owner on 10 Oct: "just record everything for now until an issue arises ... Then turn it off"): no budget —
// the 3,000 MB one stopped the recording on 8 Oct and the 10/10 plays of the day were 2 plays. The recording is on unless
// tools/playrec-switch.js holds it off (Firebase's overage flags or storage, this Mac's disk, a day over 1.5 GB of plays).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const ARCH = process.env.PLAYS_ARCHIVE || path.join(RB2P, 'plays-archive');
const LEDGER = path.join(ARCH, 'ledger.json');
const BUDGET = Number(process.env.PLAYS_BUDGET_MB) > 0 ? Number(process.env.PLAYS_BUDGET_MB) * 1048576 : Infinity;   // V545: none unless set
const SW = require('./playrec-switch.js');
const KEEP_DAYS = Number(process.env.PLAYS_KEEP_DAYS) || 30;
const FIREBASE = process.env.FIREBASE_BIN || 'firebase';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes('--dry'), NOFLAG = DRY || args.includes('--no-flag');
const ONLY = opt('--room', null);
// V496 (the owner: "we reached the firebase ... the least effect on the actual system"): plays move to this Mac after 2 h,
// not 24 — a day of recordings (~550 MB) was half the database's storage, over the free plan's 1 GB. Nothing reads them in
// Firebase but this job (the 5 am highlights read this archive too), so nothing else changes.
const MIN_AGE = Number(opt('--min-age-ms', 2 * 3600 * 1000));
const log = m => console.log(new Date().toISOString() + ' ' + m);
const auth = () => require('./fb-auth.js').token();

async function get(tok, p, shallow) {
    const r = await fetch(DB + p + '.json?auth=' + tok + (shallow ? '&shallow=true' : ''), { cache: 'no-store' });
    const t = await r.text();
    if (!r.ok) throw new Error('GET ' + p + ' -> ' + r.status);
    return { json: JSON.parse(t), bytes: Buffer.byteLength(t) };
}
async function del(tok, p) {
    const r = await fetch(DB + p + '.json?auth=' + tok, { method: 'DELETE' });
    if (!r.ok) throw new Error('DELETE ' + p + ' -> ' + r.status);
}
const loadJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const pad = n => String(n).padStart(2, '0');
const monthKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

function candidateRooms(ledger) {
    if (ONLY) return [ONLY];
    const set = new Set(Object.keys(ledger.rooms || {}));
    const since = Math.min(Date.now(), Number(ledger.lastRun) || 0) - 26 * 3600e3;   // ~470 rooms on a busy day
    const st = loadJson(path.join(RB2P, 'audit-watch-state.json'), {});
    for (const [code, v] of Object.entries((st && st.rooms) || {})) if (v && Number(v.act) >= since) set.add(code);
    const live = loadJson(path.join(RB2P, 'live-rooms.json'), {});
    for (const r of (live.rooms || [])) if (r && r.code) set.add(r.code);
    return [...set].filter(c => /^[A-Z0-9]{4}$/.test(c));
}

// V545: the switch the phones read — embedcode/playrec {on, at, usedMB, budgetMB, plays, month, hold}; on unless held off
// (or past a budget given in PLAYS_BUDGET_MB). Returns { flag, reason, error }.
function publishFlag(ledger, now) {
    const hl = loadJson(path.join(ARCH, 'ledger-highlights.json'), {});
    const used = ledger.bytes + (hl.month === ledger.month ? Number(hl.bytes) || 0 : 0);
    const h = SW.hold(), overBudget = used >= BUDGET;
    const reason = h ? h.reason : overBudget ? 'budget reached' : '';
    const flag = { on: !reason, at: now, usedMB: Math.round(used / 1048576), budgetMB: isFinite(BUDGET) ? Math.round(BUDGET / 1048576) : 0,
                   plays: ledger.plays, month: ledger.month, hold: reason };
    let error = '';
    if (!NOFLAG) {
        try {
            const tmp = path.join(os.tmpdir(), 'playrec-' + process.pid + '.json');
            fs.writeFileSync(tmp, JSON.stringify(flag));
            execFileSync(FIREBASE, ['database:set', '/embedcode/playrec', tmp, '--project', 'realretrobowl2p', '--force'], { stdio: 'pipe', timeout: 90000 });
            fs.unlinkSync(tmp);
        } catch (e) { error = String(e.message || e).split('\n')[0]; }
    }
    return { flag, reason, error };
}
function alertOff(why) {   // V545: the owner hears about it (a macOS notification; tools/fb-watch.js also files a GitHub issue)
    try { execFileSync('osascript', ['-e', 'display notification ' + JSON.stringify('Play recording turned OFF: ' + why + '. Back on: node tools/plays-archive.js --record on') + ' with title "Retro Bowl 2P" sound name "Submarine"'], { timeout: 10000 }); } catch (e) {}
}

(async () => {
    fs.mkdirSync(ARCH, { recursive: true });
    const now = Date.now();
    const ledger = loadJson(LEDGER, null) || { month: monthKey(now), bytes: 0, plays: 0, rooms: {} };
    if (ledger.month !== monthKey(now)) Object.assign(ledger, { month: monthKey(now), bytes: 0, plays: 0 });
    if (ledger.day !== dayKey(now)) Object.assign(ledger, { day: dayKey(now), dayBytes: 0 });   // V545: a day's play downloads
    const rec = opt('--record', null);
    if (rec === 'on' || rec === 'off') {   // V545: the switch, by hand — published at once, nothing archived
        if (rec === 'on') { const had = SW.hold(); SW.clearHold(); log('recording switched ON by hand' + (had ? ' (the hold was: ' + had.reason + ')' : '')); }
        else SW.setHold(args.slice(args.indexOf('--record') + 2).filter(a => !/^--/.test(a)).join(' ') || 'turned off by hand', 'hand');
        const r = publishFlag(ledger, now);
        log('recording ' + (r.flag.on ? 'ON' : 'OFF (' + r.reason + ')') + (NOFLAG ? ' (the switch not published: --no-flag)' : r.error ? ' — the switch was NOT published: ' + r.error : ' — published'));
        process.exit(r.error ? 1 : 0);
    }
    ledger.rooms = ledger.rooms || {};
    const tok = await auth();
    let moved = 0, movedBytes = 0, listBytes = 0, scanned = 0, waiting = 0, errors = 0;
    for (const code of candidateRooms(ledger)) {
        scanned++;
        let top = null;
        try { const r = await get(tok, 'rooms/' + code + '/plays', true); top = r.json; listBytes += r.bytes; }
        catch (e) { errors++; log('list ' + code + ': ' + e.message); continue; }
        if (!top) { delete ledger.rooms[code]; continue; }
        let left = 0;
        for (const role of Object.keys(top).filter(r => /^[ab]$/.test(r))) {
            let ids = [];
            try { const r = await get(tok, 'rooms/' + code + '/plays/' + role, true); ids = r.json ? Object.keys(r.json) : []; listBytes += r.bytes; }
            catch (e) { errors++; left++; log('list ' + code + '/' + role + ': ' + e.message); continue; }
            for (const id of ids) {
                const ms = Number(String(id).replace(/^p/, ''));
                if (!(ms > 0)) continue;
                if (now - ms < MIN_AGE) { left++; waiting++; continue; }
                if (DRY) { log('would move ' + code + '/' + role + '/' + id + ' (' + Math.round((now - ms) / 3600e3) + ' h old)'); left++; continue; }
                try {
                    const dir = path.join(ARCH, dayKey(ms), code), file = path.join(dir, role + '-' + id + '.json');
                    // the daily highlights may have read it already (tools/highlights/daily.js keeps its copy here): a play
                    // is written once and never changes, so that copy is the play
                    const kept = loadJson(file, null);
                    let bytes = 0;
                    if (!(kept && kept.z && Number(kept.at) === ms)) {
                        const r = await get(tok, 'rooms/' + code + '/plays/' + role + '/' + id, false);
                        const play = r.json; bytes = r.bytes;
                        if (play && play.z) {
                            fs.mkdirSync(dir, { recursive: true });
                            fs.writeFileSync(file, JSON.stringify(play));
                            const back = loadJson(file, null);
                            if (!back || back.z !== play.z) throw new Error('the local copy did not read back');
                        }
                    }
                    await del(tok, 'rooms/' + code + '/plays/' + role + '/' + id);
                    moved++; movedBytes += bytes; ledger.bytes += bytes; ledger.plays++; ledger.dayBytes = (ledger.dayBytes || 0) + bytes;
                } catch (e) { errors++; left++; log('move ' + code + '/' + role + '/' + id + ': ' + e.message); }
            }
        }
        if (left) ledger.rooms[code] = now; else delete ledger.rooms[code];
    }
    ledger.bytes += listBytes;
    // V472: the play-of-the-day comments (rooms/~potd) are copied here every run and only ever ADDED to — the first day's
    // were deleted on 5 Oct by an old game build's room sweep and could not be recovered (no Firebase backups on Spark).
    // `node tools/potd-replies.js --restore DATE` puts back any that are missing.
    try {
        const c = (await get(tok, 'rooms/~potd/c')).json || {};
        const bf = path.join(RB2P, 'potd-comments-backup.json'), bk = loadJson(bf, {});
        let added = 0;
        for (const [d, list] of Object.entries(c)) for (const [k, v] of Object.entries(list || {})) { bk[d] = bk[d] || {}; if (!bk[d][k]) { bk[d][k] = v; added++; } }
        if (added) { fs.writeFileSync(bf + '.tmp', JSON.stringify(bk, null, 1)); fs.renameSync(bf + '.tmp', bf); log('play-of-the-day comments: ' + added + ' new, backed up'); }
    } catch (e) { log('comments backup: ' + e.message); }
    // 2. the 30-day local retention (whole day folders)
    let purged = 0;
    const cutoff = now - KEEP_DAYS * 86400e3;
    for (const day of fs.readdirSync(ARCH)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        if (new Date(day + 'T00:00:00').getTime() + 86400e3 < cutoff) {
            if (DRY) log('would delete the archive day ' + day);
            else fs.rmSync(path.join(ARCH, day), { recursive: true, force: true });
            purged++;
        }
    }
    // 3. the switch the phones read. V545: on unless held off (tools/playrec-switch.js) — this job holds it for this Mac's
    // disk and for a day of plays far over a busy day's; tools/fb-watch.js for Firebase's own numbers
    if (!DRY && !ONLY && !SW.hold()) {
        const why = SW.diskIssue() || ((ledger.dayBytes || 0) > SW.DAY_CEILING ? 'the archive moved ' + Math.round((ledger.dayBytes || 0) / 1048576) + ' MB of plays today (the recording stops past ' + Math.round(SW.DAY_CEILING / 1048576) + ' MB)' : '');
        if (why) { SW.setHold(why, 'plays-archive'); log('recording turned OFF: ' + why); alertOff(why); }
    }
    const pub = publishFlag(ledger, now);
    const on = pub.flag.on;
    if (pub.error) { errors++; log('flag: ' + pub.error); }
    if (!DRY) { if (!ONLY && !errors) ledger.lastRun = now; fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); }
    log('rooms ' + scanned + ', moved ' + moved + ' plays (' + Math.round(movedBytes / 1024) + ' KB), ' + waiting + ' under 24 h, ' +
        purged + ' day(s) past ' + KEEP_DAYS + ' d, errors ' + errors + ' | month ' + ledger.month + ': ' + flag.usedMB + ' of ' + flag.budgetMB +
        ' MB, recording ' + (on ? 'ON' : 'OFF (' + pub.reason + ')') + (NOFLAG ? ' (flag not published)' : ''));
    process.exit(errors ? 1 : 0);
})().catch(e => { log('FATAL ' + (e && e.stack || e)); process.exit(2); });
