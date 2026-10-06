#!/usr/bin/env node
// tools/fb-watch.js — V491 (the owner: "have a backup for firebase in case it is disabled due to overuse ... and make sure I
// find out about any outages"): run every 10 minutes by the LaunchAgent com.rb2p.fb-watch.
//   · is the database answering? a public read (embedcode/potd/date) — two failures in a row = DOWN
//   · Firebase's own numbers (Cloud Monitoring, this Mac's Firebase CLI login): bytes stored vs the plan's limit, bytes
//     downloaded this cycle vs its limit, the two "disabled for overages" flags, the busiest minute's connections (the
//     free plan allows 100 at once), and the downloads of the last hour
//   · an alert when something changes for the worse (and once a day while it stays bad): a macOS notification, and the
//     GitHub workflow firebase-watch.yml run with a message — it opens an issue @-mentioning the owner (an email and
//     a push from GitHub's app; GitHub's own 15-minute check does the same when this Mac is off)
//   · .rb2p/fb-watch-state.json keeps the last status and an hourly history (downloads per hour, to find the heavy hours)
//   node tools/fb-watch.js            one check (what the LaunchAgent runs)
//   node tools/fb-watch.js --report   the numbers, no alerts
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const PROJECT = 'realretrobowl2p', DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const REPO = path.resolve(__dirname, '..');
const RB2P = fs.existsSync(path.join(REPO, '.rb2p')) ? path.join(REPO, '.rb2p') : path.resolve(REPO, '..', '..', '.rb2p');
const STATE = path.join(RB2P, 'fb-watch-state.json');
const FIREBASE = fs.existsSync('/opt/homebrew/bin/firebase') ? '/opt/homebrew/bin/firebase' : 'firebase';
const GH = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'].find(p => fs.existsSync(p)) || 'gh';
const REPORT = process.argv.includes('--report');
const log = m => console.log(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + m);
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } };

function adminToken(force) {
    const p = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
    let j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (force || !j.tokens || Date.now() > Number(j.tokens.expires_at || 0) - 5 * 60e3) {
        try { execFileSync(FIREBASE, ['projects:list', '--json'], { stdio: 'ignore', timeout: 90000 }); } catch (e) {}
        j = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return j.tokens.access_token;
}
async function probe() {   // the database answering a public read (the plays of the day's date — a few bytes)
    const t0 = Date.now();
    try {
        const r = await fetch(DB + 'embedcode/potd/date.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const t = await r.text();
        return { ok: r.ok && /^"\d{4}-\d\d-\d\d/.test(t), status: r.status, ms: Date.now() - t0, body: r.ok ? '' : t.slice(0, 160) };
    } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, body: String(e.message || e).slice(0, 160) }; }
}
async function usage() {   // Firebase's own meters for the database
    const tok = adminToken();
    const q = async (metric, minutes, aligner, period) => {
        const end = new Date(), start = new Date(end.getTime() - minutes * 60e3);
        const p = new URLSearchParams({ filter: 'metric.type="firebasedatabase.googleapis.com/' + metric + '"', 'interval.startTime': start.toISOString(), 'interval.endTime': end.toISOString() });
        if (aligner) { p.set('aggregation.alignmentPeriod', period); p.set('aggregation.perSeriesAligner', aligner); }
        const r = await fetch('https://monitoring.googleapis.com/v3/projects/' + PROJECT + '/timeSeries?' + p, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(metric + ' -> ' + r.status);
        const pts = ((await r.json()).timeSeries || []).flatMap(s => s.points || []);
        return pts.map(pt => Number(pt.value.int64Value || pt.value.doubleValue || (pt.value.boolValue ? 1 : 0)));
    };
    const latest = async m => (await q(m, 24 * 60))[0];
    const [sent, sentLimit, stored, storedLimit, offNet, offStore, conns, lastHour] = await Promise.all([
        latest('network/monthly_sent'), latest('network/monthly_sent_limit'), latest('storage/total_bytes'), latest('storage/limit'),
        latest('network/disabled_for_overages'), latest('storage/disabled_for_overages'),
        q('network/active_connections', 60, 'ALIGN_MAX', '3600s'), q('network/sent_bytes_count', 60, 'ALIGN_SUM', '3600s')]);
    return { sent, sentLimit, stored, storedLimit, disabledNet: !!offNet, disabledStore: !!offStore, peakConns: Math.max(0, ...conns), lastHourBytes: lastHour[0] || 0 };
}
const GB = b => (b / 1e9).toFixed(2) + ' GB', pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '?';
function notifyMac(title, text) {
    try { execFileSync('osascript', ['-e', 'display notification ' + JSON.stringify(text) + ' with title ' + JSON.stringify(title) + ' sound name "Submarine"'], { timeout: 10000 }); } catch (e) {}
}
function notifyGitHub(kind, title, body) {   // the workflow (as github-actions) opens or updates the issue — GitHub emails the owner
    try { execFileSync(GH, ['workflow', 'run', 'firebase-watch.yml', '-R', 'coder-1611/two-player-rb', '-f', 'kind=' + kind, '-f', 'title=' + title, '-f', 'body=' + body], { stdio: 'pipe', timeout: 60000 }); return true; }
    catch (e) { log('github alert failed: ' + String(e.stderr || e.message).slice(0, 200)); return false; }
}

(async () => {
    const st = load(), now = Date.now();
    const pr = await probe();
    let u = null, uErr = '';
    try { u = await usage(); } catch (e) { uErr = e.message; }
    const fails = pr.ok ? 0 : (st.fails || 0) + 1;
    const down = fails >= 2 || !!(u && (u.disabledNet || u.disabledStore));
    // the levels worth telling: each is a short key; an alert goes out when one appears (or a day after the last one)
    const issues = [];
    if (down) issues.push(['down', u && (u.disabledNet || u.disabledStore) ? 'Firebase has DISABLED the database for overuse (' + (u.disabledNet ? 'downloads' : 'storage') + ') — the game cannot run'
                                                                          : 'The database is not answering (HTTP ' + pr.status + (pr.body ? ' — ' + pr.body : '') + ')']);
    if (u) {
        const s = u.stored / u.storedLimit, d = u.sent / u.sentLimit;
        if (s >= 1) issues.push(['store100', 'Storage is OVER the free limit: ' + GB(u.stored) + ' of ' + GB(u.storedLimit) + ' (' + pct(u.stored, u.storedLimit) + ')']);
        else if (s >= 0.9) issues.push(['store90', 'Storage is at ' + pct(u.stored, u.storedLimit) + ' of the free limit (' + GB(u.stored) + ' of ' + GB(u.storedLimit) + ')']);
        if (d >= 1) issues.push(['sent100', 'Downloads this cycle are OVER the free limit: ' + GB(u.sent) + ' of ' + GB(u.sentLimit) + ' (' + pct(u.sent, u.sentLimit) + ')']);
        else if (d >= 0.8) issues.push(['sent80', 'Downloads this cycle are at ' + pct(u.sent, u.sentLimit) + ' of the free limit (' + GB(u.sent) + ' of ' + GB(u.sentLimit) + ')']);
        if (u.peakConns >= 80) issues.push(['conn80', 'Connections peaked at ' + u.peakConns + ' this hour — the free plan refuses new ones at 100']);
    }
    const prev = st.alerted || {}, alerted = {};
    const fresh = issues.filter(([k]) => !prev[k] || now - prev[k] > 24 * 3600e3);
    issues.forEach(([k]) => { alerted[k] = fresh.find(f => f[0] === k) ? now : prev[k]; });
    const recovered = st.down && !down;
    // the record: the last hour's downloads, kept for 14 days
    const hist = (st.hourly || []).filter(h => now - h.t < 14 * 86400e3);
    if (u && (!hist.length || now - hist[hist.length - 1].t >= 55 * 60e3)) hist.push({ t: now, bytes: u.lastHourBytes, conns: u.peakConns, stored: u.stored, sent: u.sent });
    const summary = u ? 'stored ' + GB(u.stored) + '/' + GB(u.storedLimit) + ' (' + pct(u.stored, u.storedLimit) + ') · downloaded ' + GB(u.sent) + '/' + GB(u.sentLimit) + ' this cycle (' + pct(u.sent, u.sentLimit) + ') · last hour ' + GB(u.lastHourBytes) + ' · peak connections ' + u.peakConns + (u.disabledNet || u.disabledStore ? ' · DISABLED' : '')
                      : 'usage unavailable (' + uErr + ')';
    log((pr.ok ? 'UP ' + pr.ms + ' ms' : 'NO ANSWER (' + pr.status + ') x' + fails) + ' · ' + summary);
    if (!REPORT) {
        if (fresh.length) {
            const title = down ? 'Firebase is DOWN' : 'Firebase usage warning';
            const body = fresh.map(f => '- ' + f[1]).join('\n') + '\n\nNow: ' + summary + '\n\nChecked from the Mac at ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' (Central).';
            notifyMac(title, fresh.map(f => f[1]).join(' · '));
            notifyGitHub(down ? 'down' : 'usage', title, body);
            log('ALERT: ' + fresh.map(f => f[0]).join(', '));
        }
        if (recovered) {
            notifyMac('Firebase is back', 'The database answers again. ' + summary);
            notifyGitHub('up', 'Firebase is back', 'The database answers again.\n\nNow: ' + summary);
            log('RECOVERED');
        }
    }
    fs.writeFileSync(STATE, JSON.stringify({ at: now, fails, down, alerted, probe: pr, usage: u, hourly: hist }, null, 1));
})().catch(e => { log('FATAL ' + e.message); process.exit(2); });
