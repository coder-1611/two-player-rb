// e2e/play-rec.js — V458: every play is recorded as the opponent's-screen numbers and stored for the Mac to archive.
// The owner: "store the numerical representation of every play for 24 hours then take it out of firebase and store just
// the numerical representation in local file somewhere and then delete it every 30 days" (with a guard on the free
// plan's downloads). A real two-player game, real downs (the QB bot):
//   P1  a real down on the phone with the ball is stored at rooms/{code}/plays/{role}/p{ms} AFTER the play, with the
//       snap's facts (quarter, clock, down, spot) and its result (type, player, yards)
//   P2  it is the whole play at ~15 frames a second: from the snap to past the settle, and every frame decodes
//   P3  it replays: the last frame drawn by the replay renderer is a real picture (not blank)
//   P4  it is small: under 250 KB stored
//   P5  the guard: with recording off (no fresh flag — a test run never reads it as on), a down stores nothing
//   P6  the live opponent's screen kept working through the recorded play
//   P7  the video tool (tools/play-video.js) turns the stored play into an MP4 of its length at 60 fps
const L = require('./horn-lib');
const TP = L.TP;
const sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const rec = page => page.evaluate(() => window._rb2p_view && window._rb2p_view.rec()).catch(() => null);

(async () => {
    console.log('=== V458 THE PLAY RECORDER ===');
    const g = await TP.startTwoPlayerGame({});
    try {
        await sleep(6000);
        const o = await L.offense(g, 40000); if (!o.ok) { console.log('  FAIL  setup: nobody has the ball'); fail++; return; }
        const OFF = o.off, DEF = OFF === g.a ? g.b : g.a, code = g.code;
        // ---- P5 first: recording off (a test run never takes the flag as on) — a real down stores nothing ----
        const r0 = await rec(OFF.page);
        const d0 = await L.realDown(OFF.page, { buttons: true });
        await sleep(5000);
        const r1 = await rec(OFF.page), plays0 = await TP.fbGet('rooms/' + code + '/plays');
        console.log('  recording off: ' + JSON.stringify({ down: d0 && d0.result, rec: r1 && { enabled: r1.enabled, plays: r1.plays, uploads: r1.uploads }, stored: plays0 ? Object.keys(plays0) : null }));
        check('P5 with recording off (no fresh flag; a test run), a real down stores nothing', !!r0 && r0.enabled === false && r1.plays === 0 && !plays0,
              JSON.stringify({ r0, r1, plays0: !!plays0 }));
        // ---- recording on (the test's own switch), one real down ----
        for (const P of [g.a, g.b]) await P.page.evaluate(() => { window._rb2p_recForce = true; });
        const o2 = await L.offense(g, 30000); const OF2 = o2.ok ? o2.off : OFF, DF2 = OF2 === g.a ? g.b : g.a;
        const showingBefore = await DF2.page.evaluate(() => !!(window._rb2p_view && window._rb2p_view.stats().rcv.showing)).catch(() => null);
        const tSnap = Date.now();
        const d1 = await L.realDown(OF2.page, { buttons: true, pass: true });
        const showingDuring = await DF2.page.evaluate(() => { const s = window._rb2p_view && window._rb2p_view.stats().rcv; return s ? { showing: s.showing, drawn: s.drawn } : null; }).catch(() => null);
        const stored = await L.until(async () => { const r = await rec(OF2.page); return { ok: !!(r && r.uploads >= 1), r }; }, 30000, 500);
        const rr = stored.r || {};
        console.log('  one recorded down: ' + JSON.stringify({ down: d1 && { result: d1.result, gain: d1.gainYds }, rec: rr }));
        const path = rr.last && rr.last.path;
        const play = path ? await TP.fbGet(path) : null;
        const au = await L.audit(code, OF2.role);
        // the play's end: its settle, or the hand-off it ended with (a turnover, a punt, a score)
        const settle = au.filter(e => (e.k === 'settle' || e.k === 'send') && e.t >= tSnap - 1000)[0];
        const tStored = play && play.srv;
        console.log('  stored: ' + JSON.stringify(play && { path, q: play.q, clk: play.clk, d: play.d, y: play.y, via: play.via, n: play.n, ms: play.ms, fps: play.fps, end: play.end, res: play.res, enc: play.enc, raw: play.raw, kb: Math.round(play.z.length / 1024), afterSettleMs: settle && tStored ? tStored - settle.t : null }));
        check('P1 the down is stored under the room, after the play, with the snap\'s facts and its result (the settle, or the hand-off it ended with)',
              !!play && /\/plays\/[ab]\/p\d+$/.test(path) && play.q >= 1 && play.d >= 1 && play.d <= 4 && typeof play.y === 'number' && !!play.res && !!play.res.type &&
              !!settle && tStored > settle.t + 1000,
              JSON.stringify({ path, q: play && play.q, d: play && play.d, res: play && play.res, settleT: settle && settle.t, storedT: tStored }));
        // ---- decode it in the page, check its frames, draw its last one ----
        const dec = play ? await OF2.page.evaluate(async (pl) => {
            const fr = await window._rb2p_view.decodePlay(pl);
            const ts = fr.map(x => x.t), gaps = ts.slice(1).map((t, i) => t - ts[i]);
            const cv = document.createElement('canvas'); cv.width = 480; cv.height = 270;
            const R = new window._rb2p_view.Renderer(cv, true); R.draw(fr[fr.length - 1].f, null);
            const c2 = document.createElement('canvas'); c2.width = 120; c2.height = 68; const x = c2.getContext('2d'); x.drawImage(cv, 0, 0, 120, 68);
            const d = x.getImageData(0, 0, 120, 68).data; const colors = new Set(); for (let i = 0; i < d.length; i += 16) colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
            return { n: fr.length, firstT: ts[0], lastT: ts[ts.length - 1], medianGap: gaps.sort((a, b) => a - b)[gaps.length >> 1], lastOps: fr[fr.length - 1].f.ops.length, colors: colors.size };
        }, play).catch(e => ({ err: String(e) })) : null;
        console.log('  decoded: ' + JSON.stringify(dec));
        const settleRel = settle && play ? settle.t - play.at : null;
        check('P2 the whole play at ~15 frames a second: from the snap to past the settle, every frame decodes',
              !!dec && !dec.err && dec.n === play.n && dec.n >= 30 && dec.medianGap >= 55 && dec.medianGap <= 110 && settleRel !== null && dec.lastT >= settleRel - 300,
              JSON.stringify({ dec, settleRel }));
        check('P3 it replays: the last frame, drawn by the replay renderer, is a real picture', !!dec && dec.lastOps > 20 && dec.colors >= 8, JSON.stringify(dec));
        check('P4 small: under 250 KB stored', !!play && play.z.length < 250 * 1024, JSON.stringify({ kb: play && Math.round(play.z.length / 1024) }));
        check('P6 the live opponent\'s screen kept working through the recorded play', showingBefore === true && !!showingDuring && showingDuring.showing === true && showingDuring.drawn > 0,
              JSON.stringify({ showingBefore, showingDuring }));
        // ---- P7: the video tool turns the stored numbers into an MP4 of the play's length (360p here, for speed) ----
        if (play) {
            const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'play-video-')), pf = path.join(tmp, 'play.json');
            fs.writeFileSync(pf, JSON.stringify(play));
            let vout = '', probe = null;
            try {
                vout = execFileSync('node', [path.join(__dirname, '..', 'tools', 'play-video.js'), '--file', pf, '--height', '360'],
                                    { env: Object.assign({}, process.env, { HIGHLIGHTS: tmp }), encoding: 'utf8', timeout: 300000 });
                const mp4 = fs.readdirSync(tmp).find(f => /\.mp4$/.test(f));
                if (mp4) probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,duration', '-of', 'json', path.join(tmp, mp4)], { encoding: 'utf8' });
            } catch (e) { vout += String(e.stdout || '') + String(e.stderr || e.message || ''); }
            const st = probe ? JSON.parse(probe).streams[0] : null;
            console.log('  video: ' + JSON.stringify(st) + (st ? '' : ' ' + vout.slice(-300)));
            check('P7 the video tool makes an MP4 of the play: 60 fps, its length, 360 px tall',
                  !!st && st.height === 360 && st.r_frame_rate === '60/1' && Math.abs(Number(st.duration) - play.ms / 1000) <= 0.25, JSON.stringify({ st, ms: play.ms }));
            try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
        }
    } finally {
        await g.cleanup();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
