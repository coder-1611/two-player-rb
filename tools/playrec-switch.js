// tools/playrec-switch.js — V545 (the owner on 10 Oct: "just record everything for now until an issue arises, what issues
// could possibly arise? Then turn it off"): the play recorder's OFF switch. There is no download budget any more: the
// phones record every play until something goes wrong — then the recording turns itself off (a HOLD, kept in
// .rb2p/playrec-hold.json) and stays off until the owner turns it back on:
//   node tools/plays-archive.js --record on            clear the hold and publish the switch at once
//   node tools/plays-archive.js --record off [why]     set one
// What sets the hold (tools/fb-watch.js every 10 minutes, tools/plays-archive.js every hour):
//   · Firebase switches the database off for overages (either "disabled for overages" flag) — the free plan's downloads
//     were already at 465% of its limit on 10 Oct from the game itself, without that happening
//   · storage past 125% of the plan's limit (101% on 10 Oct; the plays waiting in Firebase are ~2 h of recording)
//   · this Mac's free disk under 5 GB (9.5 GB free on 10 Oct; the archive keeps 30 days at ~0.5 GB a day)
//   · the archive moving more than 1.5 GB of plays in one day (about 3x a busy day: something recording far too much)
// The phones also stop by themselves when the switch has not been refreshed for 3 hours (this Mac off or the job dead).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const HOLD = process.env.PLAYREC_HOLD || path.join(RB2P, 'playrec-hold.json');
const DISK_MIN = (Number(process.env.PLAYS_DISK_MIN_GB) || 5) * 1e9;
const STORE_X = Number(process.env.PLAYS_STORE_X) || 1.25;
const DAY_CEILING = (Number(process.env.PLAYS_DAY_CEILING_MB) || 1500) * 1048576;

function hold() { try { return JSON.parse(fs.readFileSync(HOLD, 'utf8')); } catch (e) { return null; } }
function setHold(reason, by) {
    const h = { reason: String(reason), by: String(by || ''), at: Date.now() };
    fs.mkdirSync(path.dirname(HOLD), { recursive: true });
    fs.writeFileSync(HOLD + '.tmp', JSON.stringify(h, null, 1)); fs.renameSync(HOLD + '.tmp', HOLD);
    return h;
}
function clearHold() { try { fs.unlinkSync(HOLD); return true; } catch (e) { return false; } }
function diskFree() { try { const s = fs.statfsSync(RB2P); return s.bavail * s.bsize; } catch (e) { return null; } }
function diskIssue() {
    const f = diskFree();
    return f != null && f < DISK_MIN ? 'this Mac has ' + (f / 1e9).toFixed(1) + ' GB of disk left (the recording stops under ' + DISK_MIN / 1e9 + ' GB)' : '';
}
// Firebase's own numbers, as tools/fb-watch.js reads them: { stored, storedLimit, disabledNet, disabledStore }
function firebaseIssues(u) {
    const out = [];
    if (!u) return out;
    if (u.disabledNet) out.push('Firebase switched the database\'s downloads off for overages');
    if (u.disabledStore) out.push('Firebase switched the database\'s storage off for overages');
    if (u.stored && u.storedLimit && u.stored > u.storedLimit * STORE_X)
        out.push('Firebase storage at ' + Math.round(100 * u.stored / u.storedLimit) + '% of the free plan (the recording stops past ' + Math.round(100 * STORE_X) + '%)');
    return out;
}
module.exports = { HOLD, DISK_MIN, STORE_X, DAY_CEILING, hold, setHold, clearHold, diskFree, diskIssue, firebaseIssues };
