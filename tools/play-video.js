#!/usr/bin/env node
// tools/play-video.js — V458: a recorded play as an MP4, drawn exactly as the phone that played it showed it.
//
//   node tools/play-video.js CODE [--q 2] [--clk 50] [--name KITTLE] [--role a] [--id p1791...] [--height 1080]
//   node tools/play-video.js --file path/to/a-p1791....json
//
// Finds the play in the local archive (.rb2p/plays-archive, kept 30 days) or, under 24 h old, in Firebase
// (rooms/CODE/plays). --clk matches the clock when the play ended (as the transcripts show it) or at its snap, within
// 6 s. The game's own replay renderer draws it (the page's engine supplies the art and the team colours), gliding between
// the stored frames at 60 fps the way the live opponent's screen does; ffmpeg encodes H.264. The video goes to
// ~/Projects/two-player-rb/highlight plays/ (git-ignored, never deployed).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const ARCH = process.env.PLAYS_ARCHIVE || path.join(os.homedir(), 'Projects', 'two-player-rb', '.rb2p', 'plays-archive');
const OUTDIR = process.env.HIGHLIGHTS || path.join(os.homedir(), 'Projects', 'two-player-rb', 'highlight plays');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CODE = (args[0] && !args[0].startsWith('--')) ? args[0].toUpperCase() : null;
const Q = opt('--q', null), CLK = opt('--clk', null), NAME = opt('--name', null), ROLE = opt('--role', null), ID = opt('--id', null), FILE = opt('--file', null);
const HEIGHT = Number(opt('--height', 1080));
const FPS = 60;
const log = m => console.log(m);

async function candidates() {
    if (FILE) return [{ play: JSON.parse(fs.readFileSync(FILE, 'utf8')), src: FILE }];
    if (!CODE) throw new Error('usage: node tools/play-video.js CODE [--q N] [--clk S] [--name NAME] [--role a|b] [--id pMS] | --file F');
    const out = [];
    // the local archive (free to read)
    if (fs.existsSync(ARCH)) for (const day of fs.readdirSync(ARCH)) {
        const dir = path.join(ARCH, day, CODE);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) if (/\.json$/.test(f)) {
            try { out.push({ play: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), src: path.join(dir, f), id: f.replace(/^[ab]-/, '').replace(/\.json$/, '') }); } catch (e) {}
        }
    }
    // Firebase (a play under 24 h old has not moved yet)
    try {
        const tok = await require('./fb-auth.js').token();
        const get = async p => { const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; };
        for (const role of ['a', 'b']) {
            if (ROLE && role !== ROLE) continue;
            const all = await get('rooms/' + CODE + '/plays/' + role);
            for (const [id, play] of Object.entries(all || {})) if (play && play.z) out.push({ play, src: 'firebase rooms/' + CODE + '/plays/' + role + '/' + id, id });
        }
    } catch (e) { log('(Firebase not read: ' + e.message + ')'); }
    return out;
}
function pick(list) {
    let c = list;
    if (ROLE) c = c.filter(x => x.play.role === ROLE);
    if (ID) c = c.filter(x => x.id === ID || ('p' + x.play.at) === ID);
    if (Q) c = c.filter(x => Number(x.play.q) === Number(Q));
    if (NAME) c = c.filter(x => String((x.play.res && x.play.res.name) || '').toUpperCase().includes(NAME.toUpperCase()));
    if (CLK != null) {
        const want = Number(CLK), dist = x => Math.min(Math.abs(Number(x.play.clk) - want), x.play.res && x.play.res.clk != null ? Math.abs(Number(x.play.res.clk) - want) : 1e9);
        c = c.filter(x => dist(x) <= 6).sort((a, b) => dist(a) - dist(b));
    }
    return c;
}
const mmss = s => Math.floor(s / 60) + '.' + String(s % 60).padStart(2, '0');
function title(p) {
    const r = p.res || {};
    return [p.room, 'Q' + p.q, mmss(r.clk != null ? r.clk : p.clk), r.name || '', r.type === 'handoff' ? (r.handoff || 'handoff') : (r.type || ''), r.gain != null ? Math.round(r.gain) + 'yd' : '']
        .filter(Boolean).join(' ').replace(/[\/\\:]/g, '-');
}

(async () => {
    const list = await candidates();
    const found = pick(list);
    if (!found.length) {
        log('No recorded play matches. Plays recorded for ' + (CODE || FILE) + ': ' + list.length);
        for (const x of list.slice(0, 40)) log('  ' + title(x.play) + '   (' + x.src + ')');
        process.exit(1);
    }
    if (found.length > 1) { log('Several plays match — taking the closest:'); for (const x of found.slice(0, 8)) log('  ' + title(x.play) + '   (' + x.src + ')'); }
    const { play, src } = found[0];
    log('Play: ' + title(play) + ' — ' + play.n + ' frames, ' + (play.ms / 1000).toFixed(1) + ' s, from ' + src);
    fs.mkdirSync(OUTDIR, { recursive: true });
    const out = path.join(OUTDIR, title(play) + '.mp4');

    // the game's own renderer, in a page whose engine has the art loaded (tools/highlights/render.js)
    const R = await require('./highlights/render.js').openRenderer();
    try {
        await R.video(play, out, { height: HEIGHT, fps: FPS, log: m => process.stdout.write(m + (/%$/.test(m) ? '\r' : '\n')) });
        log('Saved: ' + out);
    } finally {
        await R.close();
    }
    process.exit(0);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
