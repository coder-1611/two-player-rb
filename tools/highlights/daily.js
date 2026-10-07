#!/usr/bin/env node
// tools/highlights/daily.js — V458: the day's five most incredible plays, chosen by Claude Sonnet 5.5 (at 5 am since V469; 6 pm before). The owner:
// "I want everyday at 6 pm a sonnet 5.5 to look at all the plays that happened in the 24 hr period and choose the top 5
// most impressive, and no I don't just want normal 50 yard touch downs, the plays need to be incredible like juking a
// bunch of players, stiff arms breaking tackles, last moment hail marys, etc, I want an intelligent agent to see the plays
// and be really good at choosing incredible plays. Also make sure it actually runs"
//
//  1. every play recorded in the 24 h (the phones' recorder, index.html V458): the local archive, and — under 24 h old —
//     Firebase; a play read from Firebase is kept in the archive, so the hourly mover need not download it again
//  2. measured from the engine's own frame-by-frame record (features.js): tackles broken, defenders who dove and missed
//     or were left behind, stiff arms, hurdles, yards after contact, a pass's air yards and hang time, the clock and the
//     score; short-listed (up to 24: the best of each kind, then the highest score)
//  3. drawn: a contact sheet of each short-listed play's key moments, exactly as the phone showed it (render.js)
//  4. judged: Claude Sonnet 5.5 (claude -p, JUDGE.md) reads every play's numbers and story, looks at every sheet, and
//     writes its five with the reasons. A judge that fails or writes something invalid is asked once more; then the
//     measured order stands, and the README says so
//  5. the five as MP4s (1080p, 60 fps, the headline over the first seconds) in
//     ~/Projects/two-player-rb/highlight plays/YYYY-MM-DD/, with README.md; a notification on the Mac
//
//   node tools/highlights/daily.js            what the LaunchAgent runs at 05:00 (05:30 and 07:00: a day already done and
//                                             judged exits; one the judge failed is tried again)
//   --force                 run again even if today's highlights exist
//   --until MS / --hours N  the window (default: the 24 h up to now)
//   --archive DIR --out DIR --runs DIR --no-firebase --no-video --height N --include-test   (tests, proofs)
//   --judge-cmd "CMD"       (tests) run CMD with the bundle folder as its last argument instead of Claude
//   --publish-only [--dif ID=max,...] [--to DEVICE]   publish a finished day's top 3 again (V468: --dif corrects a play's
//                           difficulty; V471: --to sends its top 5 to one device's inbox instead)
//   --preview [--to DEVICE] [--tag NAME] [--weights difficulty=30,spectacular=40,situation=20,impact=10]
//                           the top 5 so far, not published (V471: --to sends them to that device's inbox; V479: --tag a
//                           second preview's folders, --weights this run's judging weights)
// Env: HL_CLAUDE (the claude CLI), HL_MODEL (claude-sonnet-5-5), HL_EFFORT (high), HL_JUDGE_MIN (25), RB_E2E_PORT (8803)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = k => args.includes(k);
process.env.RB_E2E_PORT = process.env.RB_E2E_PORT || '8803';   // the render page's server (before render.js loads the harness)
const RB2P = path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p');
const ARCH = opt('--archive', process.env.PLAYS_ARCHIVE || path.join(RB2P, 'plays-archive'));
const OUT = opt('--out', process.env.HIGHLIGHTS || path.join(os.homedir(), 'Projects', 'two-player-rb', 'highlight plays'));
const RUNS = opt('--runs', path.join(RB2P, 'highlights', 'runs'));
const CLAUDE = process.env.HL_CLAUDE || (fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'claude')) ? path.join(os.homedir(), '.local', 'bin', 'claude') : 'claude');
const MODEL = process.env.HL_MODEL || 'claude-sonnet-5-5';
const EFFORT = process.env.HL_EFFORT || 'high';
const JUDGE_MS = (Number(process.env.HL_JUDGE_MIN) || 25) * 60000;
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const UNTIL = Number(opt('--until', Date.now()));
// V469 (the run moved from 6 pm to 5 am): a window starts where the last judged run ended, never re-judging its plays —
// the first 5 am run after the 6 pm ones covers 6 pm -> 5 am; then 24 h (--hours N: exactly N hours, the tests)
function lastRunUntil() {
    try {
        const days = fs.readdirSync(RUNS).filter(d => /^\d{4}-\d\d-\d\d$/.test(d)).sort().reverse();
        for (const d of days) {
            let st = null; try { st = JSON.parse(fs.readFileSync(path.join(RUNS, d, 'status.json'), 'utf8')); } catch (e) {}
            if (st && Number(st.until) < UNTIL - 3600e3 && (st.ok || (st.picks && st.picks.length))) return Number(st.until);
        }
    } catch (e) {}
    return 0;
}
const SINCE = has('--hours') ? UNTIL - Number(opt('--hours', 24)) * 3600e3 : Math.max(UNTIL - 24 * 3600e3, lastRunUntil());
const NOFB = has('--no-firebase'), NOVIDEO = has('--no-video'), FORCE = has('--force'), INCLUDE_TEST = has('--include-test');
// V470: --preview — the owner's look at "the top 5 so far": judged and rendered like a real run, never published, in its
// own folder ("YYYY-MM-DD preview"; runs/YYYY-MM-DD-preview), and not a day's run (the next real run still judges its plays)
const PREVIEW = has('--preview');
// V481: --formula points — the owner's points formula (features.js points()): the judge scores only "spectacularness"
// (0-16) for every candidate; the code adds the measured points and ranks by the total (x1.2 in overtime)
const FORMULA = opt('--formula', 'points');   // V484 (the owner: "I like this formula"): the standard from 6 Oct; --formula weights: JUDGE.md's 40/30/20/10
const ptsText = p => 'difficulty ' + p.difficulty + ' + TD ' + p.td + ' + first down ' + p.firstDown + ' + 4th-down ' + p.fourth + ' + yards ' + p.yards +
    ' + situation ' + p.situation + ' + moves ' + p.moves + ' (' + p.stiffArms + ' stiff arm' + (p.stiffArms === 1 ? '' : 's') + ', ' + p.jukes + ' juke' + (p.jukes === 1 ? '' : 's') + ') = ' + p.base + (p.ot ? ', OVERTIME x1.2' : '');
const HEIGHT = Number(opt('--height', 1080));
const JUDGE_CMD = opt('--judge-cmd', null);
const SHORT_MAX = 24;
const F = require('./features.js');

const pad = n => String(n).padStart(2, '0');
const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const monthKey = ms => dayKey(ms).slice(0, 7);
const DATE = dayKey(UNTIL);
const log = m => console.log(new Date().toTimeString().slice(0, 8) + ' ' + m);
const loadJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeAtomic = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); };
const clock = s => Math.floor(s / 60) + ':' + pad(Math.max(0, Math.round(s)) % 60);
const isTestRoom = code => /\d/.test(code);   // the harness's room codes carry a digit; players' rooms are letters

// ---------- 1. the plays ----------
function localPlays() {
    const out = new Map();
    if (!fs.existsSync(ARCH)) return out;
    for (const day of fs.readdirSync(ARCH)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        const t = new Date(day + 'T00:00:00').getTime();
        if (t > UNTIL || t + 2 * 86400e3 < SINCE) continue;
        for (const code of fs.readdirSync(path.join(ARCH, day))) {
            const dir = path.join(ARCH, day, code);
            if (!fs.statSync(dir).isDirectory()) continue;
            for (const f of fs.readdirSync(dir)) {
                const m = /^([ab])-p(\d+)\.json$/.exec(f); if (!m) continue;
                const at = Number(m[2]); if (at < SINCE || at >= UNTIL) continue;
                const play = loadJson(path.join(dir, f), null);
                if (play && play.z) out.set(code + '/' + m[1] + '/p' + at, play);
            }
        }
    }
    return out;
}
function candidateRooms() {
    const set = new Set();
    const ledger = loadJson(path.join(ARCH, 'ledger.json'), {});
    for (const c of Object.keys(ledger.rooms || {})) set.add(c);
    const st = loadJson(path.join(RB2P, 'audit-watch-state.json'), {});
    for (const [code, v] of Object.entries((st && st.rooms) || {})) if (v && Number(v.act) >= SINCE - 86400e3) set.add(code);
    const live = loadJson(path.join(RB2P, 'live-rooms.json'), {});
    for (const r of (live.rooms || [])) if (r && r.code) set.add(r.code);
    return [...set].filter(c => /^[A-Z0-9]{4}$/.test(c));
}
async function firebasePlays(have) {
    const tok = await require(path.join(REPO, 'tools', 'fb-auth.js')).token();
    const get = async (p, shallow) => {
        const r = await fetch(DB + p + '.json?auth=' + tok + (shallow ? '&shallow=true' : ''), { cache: 'no-store' });
        const t = await r.text(); if (!r.ok) throw new Error('GET ' + p + ' -> ' + r.status);
        return { json: JSON.parse(t), bytes: Buffer.byteLength(t) };
    };
    let bytes = 0, fetched = 0, rooms = 0;
    for (const code of candidateRooms()) {
        let top; try { const r = await get('rooms/' + code + '/plays', true); top = r.json; bytes += r.bytes; } catch (e) { log('list ' + code + ': ' + e.message); continue; }
        if (!top) continue;
        rooms++;
        for (const role of Object.keys(top).filter(r => /^[ab]$/.test(r))) {
            let ids = [];
            try { const r = await get('rooms/' + code + '/plays/' + role, true); ids = Object.keys(r.json || {}); bytes += r.bytes; } catch (e) { log('list ' + code + '/' + role + ': ' + e.message); continue; }
            for (const id of ids) {
                const at = Number(String(id).replace(/^p/, '')); if (!(at >= SINCE && at < UNTIL)) continue;
                const key = code + '/' + role + '/' + id; if (have.has(key)) continue;
                try {
                    const r = await get('rooms/' + code + '/plays/' + role + '/' + id, false); bytes += r.bytes;
                    const play = r.json; if (!play || !play.z) continue;
                    // kept in the archive where the hourly mover will look (it then only deletes the Firebase node)
                    writeAtomic(path.join(ARCH, dayKey(at), code, role + '-' + id + '.json'), JSON.stringify(play));
                    have.set(key, play); fetched++;
                } catch (e) { log('fetch ' + key + ': ' + e.message); }
            }
        }
    }
    // this month's downloads, for the recording guard (tools/plays-archive.js adds them to its own)
    const lf = path.join(ARCH, 'ledger-highlights.json'), lg = loadJson(lf, {});
    const m = monthKey(Date.now()), led = lg.month === m ? lg : { month: m, bytes: 0 };
    led.bytes += bytes; writeAtomic(lf, JSON.stringify(led));
    log('Firebase: ' + rooms + ' room(s) with plays, ' + fetched + ' play(s) fetched, ' + Math.round(bytes / 1024) + ' KB');
}

// ---------- 2. the short list ----------
function shortlist(feats) {
    const pool = feats.filter(f => !f.kick || f.td);
    if (pool.length <= SHORT_MAX) return pool.slice().sort((a, b) => b.score - a.score);
    const pick = new Map();
    const add = f => { if (f && !pick.has(f.id) && pick.size < SHORT_MAX) pick.set(f.id, f); };
    const top = (key, n) => pool.filter(f => key(f) > 0).sort((a, b) => key(b) - key(a) || b.score - a.score).slice(0, n).forEach(add);
    top(f => (f.tacklesBroken || 0) + (f.stiffArms || 0) + (f.hurdles || 0), 3);
    top(f => (f.missedTackles || 0) + (f.beaten || 0), 3);
    top(f => (f.pass && (f.pass.caught || f.pass.intercepted)) ? (f.pass.airYds || 0) : 0, 3);
    top(f => f.yardsAfterContact || 0, 2);
    top(f => (f.lateInHalf && (f.td || (f.gain || 0) >= 15)) ? (f.td ? 2 : 1) : 0, 3);
    top(f => f.defensiveTd ? 1 : 0, 2);
    top(f => (f.leadChange && f.q >= 4) ? 1 : 0, 2);
    pool.slice().sort((a, b) => b.score - a.score).forEach(add);
    return [...pick.values()].sort((a, b) => b.score - a.score);
}
const downText = f => f.down >= 1 && f.down <= 4 ? ['', '1st', '2nd', '3rd', '4th'][f.down] + ' & ' + (f.toGo < 0.5 ? 'inches' : Math.max(1, Math.round(f.toGo))) : '';
const TSV_MAX = 400;   // a busy day: the judge reads the 400 best measured (every short-listed play among them)
function tsv(allFeats, short) {
    const S = new Set(short.map(f => f.id));
    const feats = allFeats.length <= TSV_MAX ? allFeats
        : allFeats.filter(f => S.has(f.id)).concat(allFeats.filter(f => !S.has(f.id)).sort((a, b) => b.score - a.score).slice(0, TSV_MAX - S.size)).sort((a, b) => a.at - b.at);
    const cols = ['id', 'game', 'quarter', 'clock', 'down', 'difficulty', 'carrier', 'result', 'gain', 'td', 'broken_tackles', 'stiff_arms', 'hurdles',
                  'dove_and_missed', 'left_behind', 'yds_after_contact', 'air_yds', 'hang_s', 'catch', 'defenders_at_catch', 'late_in_half',
                  'lead_change', 'score_before', 'measured_score', 'short_listed'].concat(FORMULA === 'points' ? ['base_points', 'points_breakdown', 'overtime'] : []);
    const rows = feats.map(f => [f.id, f.room, f.q >= 5 ? 'OT' : f.q, clock(f.clk || 0), downText(f), String(f.dif || '').toUpperCase(), f.hero + (f.heroPos ? ' (' + f.heroPos + ')' : ''),
        f.kick ? 'kick' : f.sack ? 'sack' : f.pass ? (f.pass.intercepted ? 'interception' : f.pass.incomplete ? 'incomplete' : 'pass') : (f.fumble ? 'fumble' : 'run'),
        f.gain == null ? '' : Math.round(f.gain), f.td ? (f.defensiveTd ? 'DEF TD' : 'TD') : '', f.tacklesBroken || 0, f.stiffArms || 0, f.hurdles || 0,
        f.missedTackles || 0, f.beaten || 0, f.yardsAfterContact || 0, f.pass ? (f.pass.airYds == null ? '' : Math.round(f.pass.airYds)) : '',
        f.pass && f.pass.hangS != null ? f.pass.hangS : '', f.pass ? (f.pass.caught ? 'caught' : f.pass.intercepted ? 'picked' : 'no') : '',
        f.pass && f.pass.contested != null ? f.pass.contested : '', f.lateInHalf ? 'yes' : '', f.leadChange ? 'yes' : '',
        f.scoreBefore ? f.scoreBefore.join('-') : '', f.score, S.has(f.id) ? 'yes' : ''].concat(FORMULA === 'points' && f.points ? [f.points.base, ptsText(f.points), f.points.ot ? 'yes' : ''] : []).join('\t'));
    return (allFeats.length > feats.length ? '# ' + allFeats.length + ' plays in the 24 hours: the ' + feats.length + ' with the highest measured scores are listed (the rest were routine by the numbers).\n' : '') +
        '# Every play of the 24 hours. carrier = who had the ball at the end; gain in yards for the offense; broken_tackles = a\n' +
        '# defender engaged him and he kept going; dove_and_missed = a defender dove at him and he got away; left_behind = a free\n' +
        '# defender came within 1.5 yd and he got 3+ yd past him untouched; air_yds and hang_s = the pass in the air; late_in_half =\n' +
        '# snapped with 10 s or less left in the 2nd/4th quarter or OT; score_before = offense-defense; measured_score = the\n' +
        '# short-list filter (not a verdict).\n' + cols.join('\t') + '\n' + rows.join('\n') + '\n';
}
function candidateText(f) {
    const nums = [];
    if (f.tacklesBroken) nums.push('broken tackles ' + f.tacklesBroken + ' (' + f.brokenBy.join(', ') + ')');
    if (f.stiffArms) nums.push('stiff arms ' + f.stiffArms);
    if (f.hurdles) nums.push('hurdles ' + f.hurdles);
    if (f.missedTackles) nums.push('dove and missed ' + f.missedTackles + ' (' + f.missedBy.join(', ') + ')');
    if (f.beaten) nums.push('left behind ' + f.beaten + ' (' + f.beatenWho.join(', ') + ')');
    if (f.yardsAfterContact) nums.push('yards after first contact ' + f.yardsAfterContact);
    if (f.pass) nums.push(f.pass.incomplete ? 'pass incomplete' : ('pass ' + Math.round(f.pass.airYds) + ' air yards, ' + f.pass.hangS + ' s in the air' + (f.pass.contested ? ', ' + f.pass.contested + ' around the catch' : '')));
    if (f.topSpeed) nums.push('top speed ' + f.topSpeed + ' yd/s');
    return '## ' + f.id + ' — ' + F.title(f) + '\n' +
        'Game ' + f.room + ' · Q' + (f.q >= 5 ? 'OT' : f.q) + ' ' + clock(f.clk || 0) + (downText(f) ? ' · ' + downText(f) : '') +
        (f.scoreBefore ? ' · score before (offense-defense) ' + f.scoreBefore.join('-') : '') + (f.leadChange ? ' · LEAD CHANGE' : '') + (f.lateInHalf ? ' · LATE IN THE HALF' : '') +
        ' · defense difficulty ' + (String(f.dif || '').toUpperCase() || 'not recorded') +
        ' · measured score ' + f.score + ' · sheet: sheets/' + f.id + '.jpg\n' +
        'Numbers: ' + (nums.length ? nums.join(' · ') : 'nothing special measured') + '\n' +
        'Story: ' + f.story + '\n';
}

// ---------- 4. the judge ----------
function runJudge(bundle, prompt, resume) {
    return new Promise(resolve => {
        let cmd, cargs;
        if (JUDGE_CMD) { cmd = '/bin/sh'; cargs = ['-c', JUDGE_CMD + ' "$0"', bundle]; }
        else {
            cmd = CLAUDE;
            cargs = ['-p', prompt, '--model', MODEL, '--effort', EFFORT, '--permission-mode', 'bypassPermissions', '--tools', 'Read,Write,Glob,Grep',
                     '--strict-mcp-config', '--add-dir', bundle, '--output-format', 'json'];
            if (resume) cargs = ['--resume', resume].concat(cargs);
        }
        const t0 = Date.now();
        const ch = spawn(cmd, cargs, { cwd: bundle, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '', killed = false;
        ch.stdout.on('data', d => { out += d; }); ch.stderr.on('data', d => { err += d; });
        const timer = setTimeout(() => { killed = true; try { ch.kill('SIGTERM'); } catch (e) {} setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 5000); }, JUDGE_MS);
        ch.on('error', e => { err += String(e); });
        ch.on('close', code => {
            clearTimeout(timer);
            let j = null; try { j = JSON.parse(out); } catch (e) {}
            resolve({ code, killed, json: j, out: out.slice(-4000), err: err.slice(-4000), ms: Date.now() - t0 });
        });
    });
}
function checkTop5(file, ids, want) {
    let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { ok: false, why: 'top5.json is missing or not valid JSON (' + e.message.slice(0, 100) + ')' }; }
    if (!j || !Array.isArray(j.picks)) return { ok: false, why: 'top5.json has no "picks" array' };
    const seen = new Set(), picks = [];
    for (const p of j.picks) {
        if (!p || !ids.has(p.id)) return { ok: false, why: 'a pick has an id that is not a play of the day: ' + JSON.stringify(p && p.id) };
        if (seen.has(p.id)) return { ok: false, why: 'the play ' + p.id + ' is picked twice' };
        if (typeof p.headline !== 'string' || !p.headline.trim() || typeof p.why !== 'string' || !p.why.trim()) return { ok: false, why: 'the pick ' + p.id + ' needs a headline and a why' };
        seen.add(p.id); picks.push(p);
    }
    if (picks.length < want) return { ok: false, why: picks.length + ' picks; ' + want + ' are needed' };
    picks.sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99));
    return { ok: true, picks: picks.slice(0, want).map((p, i) => ({ rank: i + 1, id: p.id, headline: p.headline.trim().slice(0, 90), why: p.why.trim(),
                                                                    fan: typeof p.fan === 'string' ? p.fan.trim().slice(0, 300) : '', raw: p.raw })), notes: String(j.notes || '').trim(), scores: j.scores || null };
}

// ---------- 6. the play of the day (V465): the #1 on the game's front page ----------
// embedcode/potd (a ~1 KB summary every lobby reads), embedcode/potdIndex/{date} (the archive list) and
// embedcode/potdPlays/{date} (the play's numbers, fetched on WATCH). The player credited: the offense's for an offensive
// play (the phone that recorded it), the defense's for a defender's (a pick or a fumble returned) — his name from the
// room, his device (anonymous uid) from that phone's latest bind; that device gets the congrats.
const FIREBASE = process.env.FIREBASE_BIN || 'firebase';
// A play's difficulty (the defense its offense faced): the recorder's own (V465+), else its game's record (V470+:
// rooms/{code}/games/{start}.difs/{role}, or a SAME game's .dif — the game is the newest record started by the play),
// else unknown. Never the room's config: it holds only the LATEST setting (a rematch overwrites it), and was wrong for
// both WKAI's first game and VOHK on 4 Oct. A wrong one is corrected with --publish-only --dif ID=level.
async function fillDifficulty(plays) {
    const rooms = [...new Set(plays.filter(p => p && !p.dif && p.room).map(p => String(p.room)))];
    if (!rooms.length) return 0;
    const tok = await require(path.join(REPO, 'tools', 'fb-auth.js')).token();
    const games = {};
    for (const r of rooms) { try { const res = await fetch(DB + 'rooms/' + encodeURIComponent(r) + '/games.json?auth=' + tok, { cache: 'no-store' }); games[r] = res.ok ? await res.json() || {} : {}; } catch (e) { games[r] = {}; } }
    let n = 0;
    for (const p of plays) {
        if (!p || p.dif) continue;
        const gs = games[String(p.room)] || {}, at = Number(p.at) + 5000;
        const key = Object.keys(gs).map(Number).filter(k => Number.isFinite(k) && k <= at).sort((x, y) => y - x)[0];
        const g = key != null ? gs[key] : null, d = g && ((g.difs && g.difs[p.role]) || (g.mode === 'same' && g.dif));
        if (d) { p.dif = String(d); n++; }
    }
    return n;
}

// ---------- 4b. the PLAY OF THE DAY (V465) and the top 3 (V467) on the front page ----------
// top: [{ pick, f, play }] in rank order (the first three). #1 keeps its V465 places — embedcode/potd's top level,
// potdPlays/{date}, potdIndex/{date}'s top level — so a page still on V465 shows it; `top` lists all three, and #2/#3's
// replays are potdPlays/{date}~2 and ~3 (fetched only on WATCH). Only #1's device uid is published (its congrats, its flair).
async function buildEntries(top, n, keyOf) {   // the published words + numbers for each play (rank order)
    top = (top || []).filter(t => t && t.pick && t.f && t.play).slice(0, n);
    let CEN = null; try { CEN = require('./censor.js'); } catch (e) { log('the slur filter did not load (' + e.message + '): no names published'); }
    const tok = await require(path.join(REPO, 'tools', 'fb-auth.js')).token();
    const get = async p => { try { const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; } catch (e) { return null; } };
    // the front page's words: the judge's fan line, else its reason without the contact sheet's frame numbers — a
    // sentence or two (the page has room for about three lines)
    const noFrames = t => String(t || '').replace(/\s*\((?:see )?frames? [^)]*\)/gi, '').replace(/\b(?:in )?frames? \d+(?:\s*[-–]\s*\d+)? (show|shows)\b/gi, 'the replay shows').replace(/\b(?:in |by )?frames? \d+(?:\s*[-–]\s*\d+)?(?: and \d+)?,?\s*/gi, '')
                                         .replace(/\s+([,.])/g, '$1').replace(/\s{2,}/g, ' ').replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();
    const short = t => { const s0 = String(t || '').trim(); if (s0.length <= 230) return s0;
        // a sentence ends at . ! or ? (and a closing quote) before a capital — not at the ! inside "Stiff Arm!" label
        let out = ''; for (const x of s0.split(/(?<=[.!?]["'\u201d)\]]?)\s+(?=["'\u201c(\[]?[A-Z0-9])/)) { if ((out + ' ' + x.trim()).trim().length > 230) break; out = (out + ' ' + x.trim()).trim(); }
        return out || s0.slice(0, 227).replace(/\s+\S*$/, '') + '…'; };
    const entries = [], bodies = [];
    for (let i = 0; i < top.length; i++) {
        const { pick, f, play } = top[i];
        const credRole = f.heroSide === 'D' ? (play.role === 'a' ? 'b' : 'a') : play.role;
        const names = await get('rooms/' + play.room + '/names') || {};
        let name = names[credRole] || '', uid = '';
        const au = await get('rooms/' + play.room + '/audit/' + credRole) || {};
        const binds = Object.values(au).filter(e => e && e.k === 'bind' && Number(e.t) <= Number(play.at) + 120000).sort((a, b) => a.t - b.t);
        if (binds.length) { uid = binds[binds.length - 1].uid || ''; if (!name) name = binds[binds.length - 1].name || ''; }
        const ends = f.events.filter(e => e.kind === 'td' || e.kind === 'end').map(e => e.t);
        const toMs = Math.round((ends.length ? Math.max(...ends) : Math.max(0, ...f.events.map(e => e.t))) + 2500);
        // V485 (the owner: "censor the slur"): the page's slur filter on the name and the judge's words (no filter, no name)
        const e = { rank: i + 1, key: keyOf(i), id: pick.id, at: play.at, room: play.room, side: credRole === play.role ? 'offense' : 'defense',
                    name: CEN ? CEN.censorName(String(name).slice(0, 40)) : '', hero: f.hero || '', headline: CEN ? CEN.censor(pick.headline) : pick.headline,
                    why: CEN ? CEN.censor(short(pick.fan || noFrames(pick.why))) : short(pick.fan || noFrames(pick.why)), q: play.q, clk: play.clk,
                    dif: play.dif || '', toMs };
        e.uid = uid;   // V473: each of the top 3's makers gets the congrats (only #1's before)
        entries.push(e);
        const body = {}; for (const k of Object.keys(play)) if (k !== 'zt' && k !== 'encT') body[k] = play[k];
        bodies.push(body);
    }
    return { entries, bodies };
}
const setPath = (p, v) => { const tmp = path.join(os.tmpdir(), 'potd-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
        fs.writeFileSync(tmp, JSON.stringify(v)); try { execFileSync(FIREBASE, ['database:set', p, tmp, '--project', 'realretrobowl2p', '--force'], { stdio: 'pipe', timeout: 90000 }); } finally { try { fs.unlinkSync(tmp); } catch (e) {} } };
async function publishPotd(top, judged) {
    if (process.env.HL_NO_PUBLISH === '1' || has('--no-publish')) return 'skipped (--no-publish)';
    const { entries, bodies } = await buildEntries(top, 3, i => DATE + (i ? '~' + (i + 1) : ''));
    if (!entries.length) return 'nothing to publish';
    const one = entries[0], at = { date: DATE, judged: !!judged, ts: Date.now() };
    // the replays first: WATCH works the moment the summary appears
    entries.forEach((e, i) => setPath('/embedcode/potdPlays/' + e.key, Object.assign({}, e, at, { play: bodies[i] })));
    const card = e => ({ rank: e.rank, key: e.key, side: e.side, name: e.name, hero: e.hero, headline: e.headline, why: e.why, q: e.q, clk: e.clk, dif: e.dif, toMs: e.toMs, uid: e.uid || '' });
    setPath('/embedcode/potdIndex/' + DATE, { headline: one.headline, why: one.why, name: one.name, side: one.side, hero: one.hero, uid: one.uid, q: one.q, clk: one.clk, dif: one.dif, top: entries.map(card) });
    setPath('/embedcode/potd', Object.assign({}, one, at, { top: entries.map(card) }));
    return 'published the top ' + entries.length + ': ' + entries.map(e => '#' + e.rank + ' ' + e.side + ' — ' + (e.name || '?') + (e.dif ? ' (' + e.dif + ')' : '')).join(', ') + (one.uid ? '' : ' (#1: no device found)');
}

// V471 (the owner: "at 12:15 pm submit to me the top 5 so far ... send it to the chromebook named soham"): a message to ONE
// device — embedcode/inbox/{id} (id = the first 8 characters of its anonymous uid, as in the device profiles: "KrwziFQu"
// is the Chromebook named soham) with the top 5's words, and each play's numbers at embedcode/inboxPlays/{id}/{rank}
// (fetched on WATCH). The game on that device shows it in a popup (index.html, V471 inbox).
async function publishInbox(top, to, judged) {
    if (process.env.HL_NO_PUBLISH === '1' || has('--no-publish')) return 'skipped (--no-publish)';
    if (!/^[A-Za-z0-9]{6,12}$/.test(String(to || ''))) return 'no device id';
    // V481: --keep-pools keeps what is in the device's inbox as the earlier pool(s) (their plays' numbers stay where they
    // are) and adds this run as the next pool, its plays keyed b1..b5 (c1.. after that); --pool names it
    let pools = [];
    if (has('--keep-pools')) {
        try { const old = await (await fetch(DB + 'embedcode/inbox/' + to + '.json', { cache: 'no-store' })).json();
              if (old) pools = Array.isArray(old.pools) ? old.pools : (Array.isArray(old.plays) ? [{ title: opt('--pool-a', 'POOL A'), plays: old.plays }] : []); } catch (e) {}
    }
    const letter = pools.length ? String.fromCharCode(97 + pools.length) : '';
    const { entries, bodies } = await buildEntries(top, 5, i => letter + String(i + 1));
    if (!entries.length) return 'nothing to send';
    entries.forEach(e => { delete e.uid; });
    const tops = (top || []).filter(t => t && t.pick && t.f && t.play);
    entries.forEach((e, i) => setPath('/embedcode/inboxPlays/' + to + '/' + e.key, Object.assign({}, e, { play: bodies[i] })));
    const cards = entries.map((e, i) => { const pk = tops[i] && tops[i].pick || {};
        return Object.assign({ rank: e.rank, key: e.key, side: e.side, name: e.name, hero: e.hero, headline: e.headline, why: e.why, dif: e.dif, toMs: e.toMs },
                             pk.total != null ? { total: pk.total, raw: pk.raw, base: pk.base, breakdown: pk.breakdown } : {}); });
    pools.push({ title: opt('--pool', pools.length ? 'POOL ' + letter.toUpperCase() : 'THE TOP ' + entries.length), plays: cards });
    const msg = { ts: Date.now(), date: DATE, since: SINCE, until: UNTIL, judged: !!judged, from: 'Soham',
        title: pools.length > 1 ? 'TWO POOLS — THE TOP 5 SO FAR' : (PREVIEW ? 'THE TOP ' + entries.length + ' SO FAR' : 'THE TOP ' + entries.length + ' PLAYS'),
        note: PREVIEW ? 'A preview: the plays since ' + new Date(SINCE).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' — not on the front page.' : '',
        plays: pools[0].plays };
    if (pools.length > 1) msg.pools = pools;
    setPath('/embedcode/inbox/' + to, msg);
    return 'sent the top ' + entries.length + ' to device ' + to + (pools.length > 1 ? ' as pool ' + pools.length + ' of ' + pools.length : '');
}

// ---------- 5. the output ----------
const safeName = s => String(s).replace(/[\/\\:*?"<>|\n\r\t]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
function notify(title, msg) {
    try { execFileSync('osascript', ['-e', 'display notification "' + String(msg).replace(/["\\]/g, '').slice(0, 180) + '" with title "' + String(title).replace(/["\\]/g, '') + '"'], { stdio: 'ignore', timeout: 10000 }); } catch (e) {}
}
async function guardState() {
    try { const r = await fetch(DB + 'embedcode/playrec.json', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

(async () => {
    if (has('--publish-only')) {   // V465/V467: publish a finished day's top 3 (its run folder's top5.json/status.json, the archived plays)
        const st = loadJson(path.join(RUNS, DATE, 'status.json'), null), t5 = loadJson(path.join(RUNS, DATE, 'top5.json'), null);
        const TO = opt('--to', '');   // V471: --to ID sends the day's top 5 to that device's inbox instead of the front page
        const ids = (st && st.picks || []).slice(0, TO ? 5 : 3); if (!ids.length) { log('no finished day ' + DATE + ' in ' + RUNS); process.exit(1); }
        const top = [];
        for (const id of ids) {
            const pick = (t5 && t5.picks || []).find(p => p.id === id) || { id, headline: id, why: '' };
            const m = /^([A-Z0-9]+)-([ab])-p(\d+)$/.exec(id), play = m ? loadJson(path.join(ARCH, dayKey(Number(m[3])), m[1], m[2] + '-p' + m[3] + '.json'), null) : null;
            if (!play) { log('the play ' + id + ' is not in the archive'); process.exit(1); }
            top.push({ pick, play });
        }
        if (!NOFB) { try { await fillDifficulty(top.map(t => t.play)); } catch (e) { log('difficulty not read: ' + e.message); } }
        // --dif ID=max,ID=hard: the owner's correction of a play's difficulty (V468)
        for (const kv of String(opt('--dif', '')).split(',').filter(Boolean)) { const [id, d] = kv.split('='); const t = top.find(x => x.pick.id === id); if (t && d) t.play.dif = d.toLowerCase(); }
        top.forEach(t => { t.f = F.features(t.play); });
        if (TO) log('inbox ' + DATE + ' ' + await publishInbox(top, TO, /sonnet|test/.test(String(st.judge))));
        else log('plays of the day ' + DATE + ' ' + await publishPotd(top, /sonnet|test/.test(String(st.judge))));
        process.exit(0);
    }
    // V470: the owner can pause the run (".rb2p/highlights/skip-until.json": {"until": ms, "why": ...}) — "don't run sonnet
    // tmrw morning at all, start it day after": a run before `until` does nothing (--force runs anyway)
    const skip = loadJson(path.join(RUNS, '..', 'skip-until.json'), null);
    if (!FORCE && !PREVIEW && skip && Date.now() < Number(skip.until)) { log('paused until ' + new Date(Number(skip.until)).toLocaleString() + ' (' + (skip.why || 'the owner') + ') — nothing to do'); process.exit(0); }
    const t0 = Date.now();
    const TAG = String(opt('--tag', '')).replace(/[^\w -]/g, '').trim();   // V479: a second preview of a day, in its own folders
    const dayDir = path.join(OUT, DATE + (PREVIEW ? ' preview' + (TAG ? ' ' + TAG : '') : '')), runDir = path.join(RUNS, DATE + (PREVIEW ? '-preview' + (TAG ? '-' + TAG.replace(/ /g, '-') : '') : ''));
    log('=== highlights ' + DATE + (PREVIEW ? ' (PREVIEW: not published)' : '') + ': the plays from ' + new Date(SINCE).toLocaleString() + ' to ' + new Date(UNTIL).toLocaleString() + ' ===');
    // a day is done when its README is written and judged (a day the judge failed — a usage limit, say — gets its
    // second and third chances at 18:30 and 20:00)
    const prev = loadJson(path.join(runDir, 'status.json'), null);
    const judgedBefore = prev && prev.ok && !/FAILED/.test(String(prev.judge));
    if (!FORCE && fs.existsSync(path.join(dayDir, 'README.md')) && (judgedBefore || !prev)) { log('today\'s highlights are already there — nothing to do (' + dayDir + ')'); process.exit(0); }
    if (!FORCE && prev && !judgedBefore) log('the earlier run today was not judged (' + prev.judge + ') — trying again');
    // one run at a time (a lock older than 3 h is a crashed run)
    const lock = path.join(RUNS, '..', 'lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    try { fs.mkdirSync(lock); } catch (e) {
        if (Date.now() - fs.statSync(lock).mtimeMs > 3 * 3600e3) { fs.rmSync(lock, { recursive: true, force: true }); fs.mkdirSync(lock); }
        else { log('another highlights run holds the lock — exit'); process.exit(0); }
    }
    const unlock = () => { try { fs.rmSync(lock, { recursive: true, force: true }); } catch (e) {} };
    process.on('exit', unlock);
    fs.mkdirSync(runDir, { recursive: true });
    const status = { date: DATE, since: SINCE, until: UNTIL, ok: false, plays: 0, games: 0, shortlisted: 0, judge: null, picks: [], videos: [], errors: [] };
    const saveStatus = () => writeAtomic(path.join(runDir, 'status.json'), JSON.stringify(status, null, 1));
    let renderer = null, work = null;
    try {
        // 1. the plays
        const plays = localPlays();
        log('archive: ' + plays.size + ' play(s) in the window');
        if (!NOFB) { try { await firebasePlays(plays); } catch (e) { status.errors.push('Firebase: ' + e.message); log('Firebase not read: ' + e.message); } }
        let all = [...plays.values()].filter(p => INCLUDE_TEST || !isTestRoom(String(p.room || '')));
        if (!NOFB) { try { const n = await fillDifficulty(all); if (n) log('difficulty from the game records: ' + n + ' play(s)'); } catch (e) { log('difficulty not read: ' + e.message); } }
        // 2. measured
        const byId = new Map();
        const feats = all.map(p => { try { const f = F.features(p); if (FORMULA === 'points') { f.points = F.points(f); f.score = f.points.base; } byId.set(f.id, { f, play: p }); return f; } catch (e) { log('features ' + p.room + '/' + p.at + ': ' + e.message); return null; } })
                         .filter(Boolean).sort((a, b) => a.at - b.at);
        status.plays = feats.length; status.games = new Set(feats.map(f => f.room)).size;
        log(feats.length + ' play(s) in ' + status.games + ' game(s)');
        fs.mkdirSync(dayDir, { recursive: true });
        if (!feats.length) {
            const g = await guardState();
            const gtxt = !g ? 'the recording guard could not be read' :
                'the recording guard (embedcode/playrec) says ' + (g.on ? 'ON' : 'OFF') + ', last published ' + new Date(Number(g.at) || 0).toLocaleString() +
                (Date.now() - Number(g.at) > 26 * 3600e3 ? ' — STALE: the phones stop recording when it is older than 26 h (is com.rb2p.plays-archive running?)' : '') +
                ' (' + g.usedMB + ' of ' + g.budgetMB + ' MB used this month)';
            writeAtomic(path.join(dayDir, 'README.md'), '# Top 5 plays — ' + new Date(UNTIL).toDateString() + '\n\nNo plays were recorded in the 24 hours to ' +
                new Date(UNTIL).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '. Recording: ' + gtxt + '.\n');
            status.ok = true; status.judge = 'none (no plays)'; saveStatus();
            notify('Retro Bowl 2P highlights', 'No plays were recorded in the last 24 hours.');
            log('no plays — README written'); return;
        }
        const short = shortlist(feats);
        status.shortlisted = short.length;
        // 3. the bundle the judge reads, outside ~/Projects (no project instructions get in its way)
        work = fs.mkdtempSync(path.join(os.tmpdir(), 'rb2p-highlights-' + DATE + '-'));
        fs.copyFileSync(path.join(__dirname, 'JUDGE.md'), path.join(work, 'JUDGE.md'));
        // V479 (the owner: "find a better top 5, 30% difficulty 40% spectacularness 20% situation and 10% impact"): --weights
        // puts this run's weighting at the top of the brief, over the equal weighting below
        if (FORMULA === 'points') {
            const head = ['# THIS RUN\'S SCORING — the owner\'s points formula (it replaces the weighting below)', '',
                'Every play\'s BASE points are already computed from the game\'s own numbers (`base_points` and `points_breakdown` in plays.tsv; the breakdown under each candidate in candidates.md):', '',
                '- Difficulty (the defense beaten): MAX 45, HARD 8, MED 2, EASY 0 (not recorded: 2); a DEFENSIVE play (a pick, a fumble return) gets a flat 10 instead',
                '- Touchdown +20; first down +5 (a converted 4th down gets it too); a converted 4th down +10 + the yards needed (4th & 19 converted: +29, plus the +5)',
                '- Yardage: +1/3 point per yard',
                '- Situation: a game-winner (a go-ahead score) in the last 20 s of the 4th quarter, or any go-ahead score in overtime, +20; a game-tyer in the last 20 s +12; a go-ahead or tying score earlier in the 4th +6; a score as the clock hits 0:00 +5; a blowout (a 21+ point margin before the play) -5',
                '- Moves: +4 per stiff arm and per juke (a defender who dove and missed, or was left behind)', '',
                '**Your part: a raw SPECTACULARNESS score from 0 to 16 for every short-listed play** — how incredible it looks in the frames: jukes, broken tackles, stiff arms that put a defender down, hurdles, a catch in traffic, a ball that hangs.', '',
                '**TOTAL = (base points + your raw score), x1.2 if the play is in overtime.** Pick the five with the highest TOTAL (interceptions only if EXTREMELY impressive, as below).', '',
                'In top5.json give each pick a `"raw"` (your 0-16) and a `"total"`, and add `"scores": { "<id>": <raw>, ... }` with your raw score for EVERY short-listed play.', '',
                'Everything else in this brief (looking at every sheet, the output format, the headline, the fan line) still applies.', '', '---', ''].join('\n');
            fs.writeFileSync(path.join(work, 'JUDGE.md'), head + fs.readFileSync(path.join(work, 'JUDGE.md'), 'utf8'));
            log('judging by the points formula');
        }
        const WEIGHTS = opt('--weights', '');
        if (WEIGHTS) {
            const w = {}; WEIGHTS.split(',').forEach(kv => { const [k, v] = kv.split('='); if (k && v) w[k.trim().toLowerCase()] = Number(v); });
            const line = (k, label, what) => (w[k] != null ? '- **' + label + ' — ' + w[k] + '%.** ' + what : '');
            const head = ['# THIS RUN\'S WEIGHTING — it replaces the weighting below', '',
                'The owner asked for this weighting for this run. Score every candidate 0-10 on each of the four, multiply by these weights, and rank by the weighted total:', '',
                line('spectacular', 'Spectacularness', 'the moves no one saw coming: jukes (defenders who dove and missed or were left behind), broken tackles, stiff arms that put a defender down, hurdles, a catch in traffic, a deep ball that hangs, a pick returned all the way.'),
                line('difficulty', 'Difficulty mode', 'the defense the player beat (`difficulty` in plays.tsv): MAX highest, then HARD, MED, EASY.'),
                line('situation', 'Game situation', 'the clock, the score, the down and distance.'),
                line('impact', 'Impact', 'sheer yardage: how far the play moved the ball.'),
                '', 'Everything else in this brief (how to look at the sheets, the output format, the fan line) still applies.', '', '---', ''].filter(x => x !== null).join('\n');
            fs.writeFileSync(path.join(work, 'JUDGE.md'), head + fs.readFileSync(path.join(work, 'JUDGE.md'), 'utf8'));
            log('judge weighting for this run: ' + WEIGHTS);
        }
        fs.writeFileSync(path.join(work, 'plays.tsv'), tsv(feats, short));
        fs.writeFileSync(path.join(work, 'candidates.md'), '# The short list: ' + short.length + ' of ' + feats.length + ' plays (best measured first)\n\n' +
            short.map(f => candidateText(f) + (FORMULA === 'points' && f.points ? '\n**Base points (measured):** ' + ptsText(f.points) + '\n' : '')).join('\n'));
        log('short list: ' + short.length + ' — drawing the contact sheets');
        const { openRenderer } = require('./render.js');
        try { execFileSync('bash', [path.join(REPO, 'tools', 'freeze-watch', 'own-port.sh'), process.env.RB_E2E_PORT, REPO], { stdio: 'pipe' }); } catch (e) {}
        try { renderer = await openRenderer(); } catch (e) { status.errors.push('renderer: ' + e.message); log('the renderer did not start (' + e.message + ') — the judge gets the numbers only, and there are no videos'); }
        if (renderer) for (const f of short) {
            try { await renderer.sheet(byId.get(f.id).play, F.keyMoments(f, 9), path.join(work, 'sheets', f.id + '.jpg'), { head: F.title(f) + '  ·  ' + f.room + ' Q' + (f.q >= 5 ? 'OT' : f.q) + ' ' + clock(f.clk || 0) }); }
            catch (e) { log('sheet ' + f.id + ': ' + e.message); }
        }
        // 4. the judge
        const want = Math.min(5, feats.length), ids = new Set(feats.map(f => f.id));
        const prompt = 'You are the highlights editor for Retro Bowl 2P. Everything you need is in this folder (' + work + '). Read JUDGE.md in it first and do exactly what it says: ' +
            'read plays.tsv and candidates.md, look at every image in sheets/, then write top5.json here. Today is ' + new Date(UNTIL).toDateString() + '; the plays are from the 24 hours before ' +
            new Date(UNTIL).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ': ' + feats.length + ' plays in ' + status.games + ' games, ' + short.length + ' short-listed. ' +
            'Pick ' + want + '.';
        let verdict = null, judgeNote = '';
        log('the judge: ' + (JUDGE_CMD ? 'test command' : MODEL + ' (' + EFFORT + ')'));
        let r = await runJudge(work, prompt, null);
        fs.writeFileSync(path.join(work, 'judge-1.json'), JSON.stringify({ code: r.code, killed: r.killed, ms: r.ms, json: r.json, err: r.err }, null, 1));
        verdict = checkTop5(path.join(work, 'top5.json'), ids, want);
        if (!verdict.ok) {
            const why = r.killed ? 'it ran out of time' : (r.json && r.json.is_error ? String(r.json.result || r.json.subtype).slice(0, 200) : verdict.why);
            log('judge, first try: ' + why);
            const sid = r.json && r.json.session_id;
            if (!r.killed && !(r.json && r.json.is_error && /auth|login|credit|quota|limit|model/i.test(String(r.json.result || '')))) {
                r = await runJudge(work, 'top5.json is not right yet: ' + verdict.why + '. Re-read the Output section of JUDGE.md and write a valid top5.json with ' + want + ' picks.', JUDGE_CMD ? null : sid);
                fs.writeFileSync(path.join(work, 'judge-2.json'), JSON.stringify({ code: r.code, killed: r.killed, ms: r.ms, json: r.json, err: r.err }, null, 1));
                verdict = checkTop5(path.join(work, 'top5.json'), ids, want);
            }
            if (!verdict.ok) judgeNote = (r.json && r.json.is_error ? String(r.json.result || r.json.subtype).slice(0, 200) : (r.killed ? 'it ran out of time' : verdict.why));
        }
        let picks, notes = '';
        const judged = verdict.ok;
        if (judged) {
            picks = verdict.picks; notes = verdict.notes;
            if (FORMULA === 'points') {   // V481: the total decides the order (the judge's raw score + the measured points)
                const sc = verdict.scores || {};
                picks.forEach(p => { const e = byId.get(p.id); const pt = e && e.f.points; if (!pt) return;
                    const raw = p.raw != null ? Number(p.raw) : Number(sc[p.id]); p.raw = Math.max(0, Math.min(16, isFinite(raw) ? raw : 0)); p.base = pt.base; p.total = F.pointsTotal(pt, p.raw); p.breakdown = ptsText(pt); });
                picks.sort((a, b) => (b.total || 0) - (a.total || 0)); picks.forEach((p, i) => { p.rank = i + 1; });
                log('by the points: ' + picks.map(p => p.id + ' ' + p.total + ' (' + p.base + ' + ' + p.raw + ')').join(', '));
            }
            status.judge = JUDGE_CMD ? 'test command' : MODEL;
            if (r.json) { status.judgeCostUsd = r.json.total_cost_usd; status.judgeMs = r.json.duration_ms; status.judgeSession = r.json.session_id; }
            log('the judge picked: ' + picks.map(p => p.id).join(', '));
        } else {
            const order = short.concat(feats.filter(f => !short.includes(f)).sort((a, b) => b.score - a.score));
            picks = order.slice(0, want).map((f, i) => ({ rank: i + 1, id: f.id, headline: F.title(f), why: 'Measured, not judged: ' + f.story }));
            status.judge = 'FAILED — the measured order'; status.errors.push('judge: ' + judgeNote);
            log('the judge failed (' + judgeNote + ') — the measured top ' + want + ' stands');
        }
        status.picks = picks.map(p => p.id);
        // 5. the videos and the README
        const lines = ['# Top ' + picks.length + ' plays' + (PREVIEW ? ' so far (a preview, ' + new Date(UNTIL).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ')' : '') + ' — ' + new Date(UNTIL).toDateString(), '',
            'The 24 hours to ' + new Date(UNTIL).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ': **' + feats.length + ' plays** in **' + status.games + ' game' + (status.games === 1 ? '' : 's') + '**. ' +
            (judged ? 'Picked by Claude ' + (JUDGE_CMD ? '(test judge)' : 'Sonnet 5.5') + ', which read every play\'s numbers and looked at the frames of the ' + short.length + ' short-listed ones.'
                    : '**The judge failed (' + judgeNote + '), so these are the five with the highest measured score, unjudged.**'), ''];
        for (const p of picks) {
            const f = byId.get(p.id).f;
            let vname = '';
            if (!NOVIDEO && renderer) {
                vname = p.rank + ' - ' + safeName(p.headline) + '.mp4';
                try {
                    // from the snap to two seconds past the whistle (a recording runs on a little after the play)
                    const ends = f.events.filter(e => e.kind === 'td' || e.kind === 'end').map(e => e.t);
                    const toMs = (ends.length ? Math.max(...ends) : Math.max(0, ...f.events.map(e => e.t))) + 2500;
                    await renderer.video(byId.get(p.id).play, path.join(dayDir, vname), { height: HEIGHT, caption: '#' + p.rank + '  ' + p.headline, toMs, difficulty: (byId.get(p.id).play || {}).dif || f.dif });
                    status.videos.push(vname); log('video ' + p.rank + ': ' + vname);
                } catch (e) { status.errors.push('video ' + p.id + ': ' + e.message); log('video ' + p.id + ' failed: ' + e.message); vname = ''; }
            }
            lines.push('## ' + p.rank + '. ' + p.headline, '',
                (vname ? '**Video:** `' + vname + '` · ' : '') + 'game ' + f.room + ' · Q' + (f.q >= 5 ? 'OT' : f.q) + ' ' + clock(f.clk || 0) + ' · ' + F.title(f), '',
                p.why, '', '*What the engine recorded:* ' + f.story, '');
        }
        if (notes) lines.push('---', '', '**The day:** ' + notes, '');
        lines.push('---', '', '<sub>Every play\'s numbers, the short list and the contact sheets the judge saw: `' + runDir + '`. Run ' + Math.round((Date.now() - t0) / 1000) + ' s.</sub>', '');
        writeAtomic(path.join(dayDir, 'README.md'), lines.join('\n'));
        status.ok = NOVIDEO || status.videos.length === picks.length;
        if (PREVIEW) {
            status.potd = 'preview: not published';
            if (opt('--to', '')) {   // V471: the owner's look, on his own device
                try { status.inbox = await publishInbox(picks.slice(0, 5).map(p => byId.get(p.id) && { pick: p, f: byId.get(p.id).f, play: byId.get(p.id).play }), opt('--to', ''), judged); log('inbox: ' + status.inbox); }
                catch (e) { status.inbox = 'FAILED: ' + String(e.message || e).split('\n')[0].slice(0, 160); status.errors.push('inbox: ' + status.inbox); log('inbox ' + status.inbox); }
            }
        }
        else try { status.potd = await publishPotd(picks.slice(0, 3).map(p => byId.get(p.id) && { pick: p, f: byId.get(p.id).f, play: byId.get(p.id).play }), judged); log('plays of the day ' + status.potd); }
        catch (e) { status.potd = 'FAILED: ' + String(e.message || e).split('\n')[0].slice(0, 160); status.errors.push('potd: ' + status.potd); log('play of the day ' + status.potd); }
        notify(PREVIEW ? 'Retro Bowl 2P — the top ' + picks.length + ' so far (preview)' : 'Retro Bowl 2P — today\'s top ' + picks.length, (judged ? '' : '(unjudged) ') + picks.map(p => p.rank + '. ' + p.headline).join('  ').slice(0, 170));
        log('done: ' + dayDir);
    } catch (e) {
        status.errors.push('FATAL ' + (e && e.message || e)); log('FATAL ' + (e && e.stack || e));
        notify('Retro Bowl 2P highlights FAILED', String(e && e.message || e));
        process.exitCode = 1;
    } finally {
        if (renderer) { await renderer.close(); if (renderer.server === 'started') renderer.stopServer(); }
        if (work) { try { fs.cpSync(work, runDir, { recursive: true }); fs.rmSync(work, { recursive: true, force: true }); } catch (e) { log('bundle copy: ' + e.message); } }
        status.ms = Date.now() - t0; saveStatus();
        // the judge's working files are kept 30 days, like the plays (the videos and READMEs are the product: kept)
        try { for (const d of fs.readdirSync(RUNS)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00').getTime() < Date.now() - 31 * 86400e3) fs.rmSync(path.join(RUNS, d), { recursive: true, force: true }); } catch (e) {}
        log('=== end (' + Math.round(status.ms / 1000) + ' s) ===');
        process.exit(process.exitCode || 0);
    }
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
