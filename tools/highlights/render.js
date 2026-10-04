// tools/highlights/render.js — V458: recorded plays drawn by the game's own replay renderer (the opponent's-screen
// renderer: the page's engine supplies the art and the team colours), in a headless page of the e2e harness:
//   sheet(play, moments, file)   a contact sheet — the play's key moments in a grid, each captioned (what the judge sees)
//   video(play, file, opts)      an MP4 at 60 fps, gliding between the stored frames the way the live replay does
// Used by tools/play-video.js and tools/highlights/daily.js. The harness serves the repo this file is in (RB_E2E_PORT).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const H = require(path.join(__dirname, '..', '..', 'e2e', 'harness'));

async function openRenderer() {
    const server = await H.ensureServer();   // 'reused' | 'started' (the caller stops only a server it started)
    const browser = await H.launchBrowser();
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_news_v387', '1'); localStorage.setItem('rb2p_a2hs_v457', '1'); } catch (e) {} });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => { try { return window.__rbEngineBooted === true && !!window._rb2p_view && typeof _Y !== 'undefined' && _Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2.length > 0; } catch (e) { return false; } }, { timeout: 180000, polling: 500 });
    await H.sleep(3000);   // the texture pages finish loading
    let closed = false;
    return {
        page, browser, server, stopServer: () => H.stopServer(),
        sheet: (play, moments, file, opts) => sheet(page, play, moments, file, opts),
        video: (play, file, opts) => video(page, play, file, opts),
        close: async () => { if (closed) return; closed = true; try { await browser.close(); } catch (e) {} }
    };
}

// moments: [{t, label}] (ms from the play's start). A grid of cols × rows cells, cellW px wide, the phone's aspect.
async function sheet(page, play, moments, file, opts) {
    opts = opts || {};
    const aspect = (play.cw && play.ch) ? play.cw / play.ch : 16 / 9;
    const cellW = opts.cellW || 640, cellH = Math.round(cellW / aspect), cols = opts.cols || 3;
    const b64 = await page.evaluate(async (pl, moments, cellW, cellH, cols, head) => {
        const V = window._rb2p_view;
        const frames = await V.decodePlay(pl);
        const cell = document.createElement('canvas'); cell.width = cellW; cell.height = cellH;
        const R = new V.Renderer(cell, true);
        const rows = Math.ceil(moments.length / cols), headH = head ? 44 : 0, gap = 6;
        const sh = document.createElement('canvas'); sh.width = cols * cellW + (cols - 1) * gap; sh.height = headH + rows * cellH + (rows - 1) * gap;
        const x = sh.getContext('2d');
        x.fillStyle = '#111'; x.fillRect(0, 0, sh.width, sh.height);
        if (head) { x.fillStyle = '#fff'; x.font = 'bold 24px Helvetica, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText(head, 12, headH / 2, sh.width - 24); }
        const fit = (s, w) => { if (x.measureText(s).width <= w) return s; while (s.length > 4 && x.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
        moments.forEach((m, i) => {
            let k = 0; while (k + 1 < frames.length && frames[k + 1].t <= m.t) k++;
            const A = frames[k], B = frames[k + 1];
            if (!B || B.t <= A.t) R.draw(A.f, null);
            else { const a = Math.min(1, Math.max(0, (m.t - A.t) / (B.t - A.t))); R.draw(V.lerpFrame(A.f, B.f, a), V.lerpPositions(A.f, B.f, a)); }
            const cx = (i % cols) * (cellW + gap), cy = headH + Math.floor(i / cols) * (cellH + gap);
            x.drawImage(cell, cx, cy);
            // the caption: the moment's number, its time and what happened
            x.font = 'bold 17px Helvetica, Arial, sans-serif';
            const words = (i + 1) + '  ·  ' + (m.t / 1000).toFixed(1) + ' s' + (m.label ? '  ·  ' + m.label : '');
            const line = fit(words, cellW - 16);
            x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(cx, cy + cellH - 30, cellW, 30);
            x.fillStyle = m.label ? '#ffe14d' : '#ddd'; x.textBaseline = 'middle'; x.fillText(line, cx + 8, cy + cellH - 15);
        });
        return sh.toDataURL('image/jpeg', 0.86).split(',')[1];
    }, play, moments, cellW, cellH, cols, opts.head || '');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    return file;
}

// opts: { height (1080), fps (60), caption: a line shown over the first seconds, toMs: end the video there, log }
async function video(page, play, file, opts) {
    opts = opts || {};
    const FPS = opts.fps || 60, HEIGHT = opts.height || 1080, log = opts.log || (() => {});
    const aspect = (play.cw && play.ch) ? play.cw / play.ch : 16 / 9;
    const W = Math.round(HEIGHT * aspect / 2) * 2, Ht = Math.round(HEIGHT / 2) * 2;
    const info = await page.evaluate(async (pl, W, Ht, caption) => {
        const V = window._rb2p_view;
        const frames = await V.decodePlay(pl);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = Ht;
        let out = cv, x = null;
        if (caption) { out = document.createElement('canvas'); out.width = W; out.height = Ht; x = out.getContext('2d'); }
        window.__pv = { frames, cv, out, x, caption, R: new V.Renderer(cv, true), V };
        return { n: frames.length, lastT: frames[frames.length - 1].t };
    }, play, W, Ht, opts.caption || '');
    const endT = opts.toMs ? Math.min(info.lastT, opts.toMs) : info.lastT;
    const total = Math.max(1, Math.floor(endT / (1000 / FPS)) + 1);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    log('Rendering ' + total + ' frames at ' + W + 'x' + Ht + ', ' + FPS + ' fps -> ' + file);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
                                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => { ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))); ff.on('error', rej); });
    try {
        for (let k = 0; k < total; k++) {
            const jpeg = await page.evaluate((t) => {
                const P = window.__pv, fr = P.frames;
                let i = 0; while (i + 1 < fr.length && fr[i + 1].t <= t) i++;
                const A = fr[i], B = fr[i + 1];
                if (!B || B.t <= A.t) P.R.draw(A.f, null);
                else { const a = Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))); P.R.draw(P.V.lerpFrame(A.f, B.f, a), P.V.lerpPositions(A.f, B.f, a)); }
                if (P.x) {   // the caption, over the first 3.5 s (fading out over the last half second)
                    const W = P.out.width, Hh = P.out.height, x = P.x;
                    x.drawImage(P.cv, 0, 0);
                    const alpha = t < 3000 ? 1 : Math.max(0, 1 - (t - 3000) / 500);
                    if (alpha > 0) {
                        const fz = Math.round(Hh * 0.045);
                        x.font = 'bold ' + fz + 'px Helvetica, Arial, sans-serif';
                        let s = P.caption; while (s.length > 4 && x.measureText(s).width > W * 0.9) s = s.slice(0, -2);
                        const w = x.measureText(s).width + fz * 1.2, h = fz * 1.9, bx = Math.round(W * 0.04), by = Math.round(Hh - h - Hh * 0.1);   // above the game's own name tag
                        x.globalAlpha = alpha * 0.78; x.fillStyle = '#000'; x.fillRect(bx, by, w, h);
                        x.globalAlpha = alpha; x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(s, bx + fz * 0.6, by + h / 2);
                        x.globalAlpha = 1;
                    }
                }
                return P.out.toDataURL('image/jpeg', 0.95).split(',')[1];
            }, k * 1000 / FPS);
            if (!ff.stdin.write(Buffer.from(jpeg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
            if (k % 120 === 0) log('  ' + Math.round(100 * k / total) + '%');
        }
    } finally {
        try { ff.stdin.end(); } catch (e) {}
    }
    await done;
    return { file, frames: total, width: W, height: Ht };
}

module.exports = { openRenderer };
