// e2e/faults.js — the faults of NEVER-FREEZE-PROMPT.md Phase 3, each one real and each one PROVEN
// to have taken effect (a fault that silently didn't apply makes its green cell meaningless).
//
// Every fault returns { applied: bool, evidence: {...}, undo: async () => evidence } where
// `applied` is judged from OUTSIDE the page where it can be (the server's hb/live/outcomes
// timestamps over REST, the page's own visibilityState and frame count).
//
// Install page seams BEFORE the game loads (they must wrap WebSocket/Date before the SDK and the
// engine read them):  await F.installSeams(page)   (evaluateOnNewDocument)
'use strict';
const TP = require('./two-player');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- seams (before load)
async function installSeams(page, opts) {
    opts = opts || {};
    await page.evaluateOnNewDocument(skewMs => {
        // (1) a WebSocket black hole: the socket stays OPEN, but nothing goes out and nothing comes
        // in while window.__rbWsBlackhole is set — the half-open shape of room MSZT, which the SDK
        // does not notice (goOffline is the friendly, announced case).
        try {
            const WS = window.WebSocket;
            const Wrapped = function (url, protocols) {
                const ws = protocols === undefined ? new WS(url) : new WS(url, protocols);
                const realSend = ws.send.bind(ws);
                ws.send = function (d) { if (window.__rbWsBlackhole) return; return realSend(d); };
                const realAdd = ws.addEventListener.bind(ws);
                ws.addEventListener = function (type, fn, o) {
                    if (type === 'message') return realAdd(type, function (ev) { if (window.__rbWsBlackhole) return; return fn.call(this, ev); }, o);
                    return realAdd(type, fn, o);
                };
                let onmsg = null;
                Object.defineProperty(ws, 'onmessage', { configurable: true, get: () => onmsg,
                    set: fn => { onmsg = fn; ws.addEventListener('message', ev => { if (onmsg) onmsg.call(ws, ev); }); } });
                return ws;
            };
            Wrapped.prototype = WS.prototype; Object.assign(Wrapped, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
            window.WebSocket = Wrapped;
        } catch (e) {}
        // (2) clock skew: this phone's Date runs skewMs off the real one (phones in the wild
        // were off by up to 40s — OEYK)
        if (skewMs) {
            try {
                const RD = Date, off = skewMs;
                const SD = function (...a) { return a.length ? new RD(...a) : new RD(RD.now() + off); };
                SD.now = () => RD.now() + off; SD.parse = RD.parse; SD.UTC = RD.UTC; SD.prototype = RD.prototype;
                window.Date = SD; window.__rbSkewMs = off;
            } catch (e) {}
        }
    }, opts.skewMs || 0);
}

// ---------------------------------------------------------------- evidence
async function serverView(code, role) {
    const [hb, live, out] = await Promise.all([TP.fbGet('rooms/' + code + '/hb/' + role), TP.fbGet('rooms/' + code + '/live/' + role), TP.fbGet('rooms/' + code + '/outcomes/' + role)]);
    return { hbTs: hb && hb.ts, hbVis: hb && hb.vis, liveTs: live && live.ts, outTs: out && out.ts, outType: out && out.type };
}
async function pageView(page) {
    try {
        return await page.evaluate(() => new Promise(res => {
            const n0 = window.__rbRafMono || 0; const t0 = Date.now();
            setTimeout(() => res({ vis: document.visibilityState, frames: (window.__rbRafMono || 0) - n0, ms: Date.now() - t0 }), 600);
        }));
    } catch (e) { return { vis: 'unreachable', frames: 0, err: String(e.message).slice(0, 60) }; }
}

// ---------------------------------------------------------------- faults
// Screen off, phone lock: the page is frozen by the browser (Page.setWebLifecycleState) — it
// stops running and is hidden. Undo unfreezes and explicitly RE-SHOWS it (active alone leaves it
// hidden), then waits until visibilityState is 'visible'.
async function screenOff(page) {
    const cdp = await page.target().createCDPSession();
    const before = await pageView(page);
    await page.evaluate(() => { try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) {} }).catch(() => {});
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(1200);
    const during = await Promise.race([pageView(page), sleep(2500).then(() => ({ vis: 'frozen (no answer)', frames: 0 }))]);
    return {
        applied: during.frames === 0,
        evidence: { before, during },
        undo: async () => {
            await cdp.send('Page.setWebLifecycleState', { state: 'active' });
            try { await page.bringToFront(); } catch (e) {}
            let v = null; for (let i = 0; i < 20; i++) { v = await pageView(page); if (v.vis === 'visible' && v.frames > 0) break; await sleep(250); }
            return { after: v };
        }
    };
}

// Network off on BOTH paths: CDP offline (REST, fetch) + the SDK told to go offline.
async function networkOff(page, code, role) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.evaluate(() => { try { window._rb2p_FB.goOffline(window._rb2p_db); } catch (e) {} });
    const s0 = await serverView(code, role); await sleep(7000); const s1 = await serverView(code, role);
    return {
        applied: s0.hbTs === s1.hbTs,                           // nothing from this phone reached the server
        evidence: { s0, s1 },
        undo: async () => {
            await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            await page.evaluate(() => { try { window._rb2p_FB.goOnline(window._rb2p_db); } catch (e) {} });
            await sleep(6000); return { after: await serverView(code, role) };
        }
    };
}

// The SDK socket half-open (open, silent) while REST works — MSZT.
async function sdkHalfOpen(page, code, role) {
    const s0 = await serverView(code, role);
    await page.evaluate(() => { window.__rbWsBlackhole = true; });
    await sleep(6000);
    const s1 = await serverView(code, role);
    return {
        applied: s1.hbTs !== s0.hbTs,                           // REST still lands (the heartbeat moved) while the socket is silent
        evidence: { s0, s1 },
        undo: async () => { await page.evaluate(() => { window.__rbWsBlackhole = false; }); await sleep(3000); return { after: await serverView(code, role) }; }
    };
}

// REST dead while the SDK works: every *.json request to the database fails.
async function restDead(page, code, role) {
    await page.setRequestInterception(true);
    const onReq = req => { try { if (/firebaseio\.com\/.*\.json/.test(req.url())) return req.abort('failed'); return req.continue(); } catch (e) {} };
    page.on('request', onReq);
    const s0 = await serverView(code, role); await sleep(7000); const s1 = await serverView(code, role);
    return {
        applied: s1.hbTs === s0.hbTs,                           // the REST heartbeat stopped landing
        evidence: { s0, s1 },
        undo: async () => { page.off('request', onReq); try { await page.setRequestInterception(false); } catch (e) {} await sleep(6000); return { after: await serverView(code, role) }; }
    };
}

async function cpuThrottle(page, rate) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: rate || 6 });
    return { applied: true, evidence: { rate: rate || 6 }, undo: async () => { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); return {}; } };
}

// A hand-off (the outcome record) delayed, duplicated or held back while heartbeats and live
// pushes keep flowing.
async function handoffTrouble(page, kind, ms) {
    await page.evaluate((kind, ms) => {
        const real = window._twoPlayer.send; window.__rbRealSend = real; window.__rbHandoffLog = [];
        window._twoPlayer.send = function (o) {
            window.__rbHandoffLog.push({ type: o && o.type, at: Date.now(), kind });
            const self = this, args = arguments;
            if (kind === 'delay') { setTimeout(() => real.apply(self, args), ms); return; }
            if (kind === 'duplicate') { real.apply(self, args); setTimeout(() => real.apply(self, args), ms || 1500); return; }
            return real.apply(self, args);
        };
    }, kind, ms || 0);
    return {
        applied: true, evidence: { kind, ms },
        undo: async () => { const log = await page.evaluate(() => { window._twoPlayer.send = window.__rbRealSend || window._twoPlayer.send; return window.__rbHandoffLog || []; }); return { sends: log }; }
    };
}

// Engine faults
async function rafStops(page) {
    await page.evaluate(() => { window.__rbRealRaf = window.requestAnimationFrame; window.requestAnimationFrame = function () { return 0; }; });
    const v = await pageView(page);
    return { applied: v.frames === 0, evidence: v, undo: async () => { await page.evaluate(() => { window.requestAnimationFrame = window.__rbRealRaf; }); return { after: await pageView(page) }; } };
}
async function strayGameEnd(page) {
    const r = await page.evaluate(() => { try { _5B(); return 'called'; } catch (e) { return 'threw: ' + e.message; } });
    return { applied: r === 'called', evidence: { r }, undo: async () => ({}) };
}
async function webglLost(page) {
    const r = await page.evaluate(() => { try { const c = document.getElementById('canvas'); const gl = c.getContext('webgl') || c.getContext('experimental-webgl') || c.getContext('webgl2'); const x = gl && gl.getExtension('WEBGL_lose_context'); if (!x) return 'no extension'; x.loseContext(); window.__rbLoseCtx = x; return 'lost'; } catch (e) { return 'threw: ' + e.message; } });
    return { applied: r === 'lost', evidence: { r }, undo: async () => { await page.evaluate(() => { try { window.__rbLoseCtx && window.__rbLoseCtx.restoreContext(); } catch (e) {} }); return {}; } };
}

// Input faults (touch pages)
async function touchNeverEnds(page, x, y) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    // the finger lifts where only the document hears it — the engine's canvas never gets the end
    await page.evaluate(() => { try { document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [], bubbles: true })); } catch (e) {} });
    const held = await page.evaluate(() => { try { return _Bo2[0]; } catch (e) { return null; } });
    return { applied: held !== null && held !== -1 && held !== undefined, evidence: { held },
             undo: async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return {}; } };
}

// Layout faults
async function rotate(page, to) {
    const v = to === 'landscape' ? { width: 874, height: 402, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 402, height: 874, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    await page.setViewport(v);
    await sleep(800);
    const rot = await page.evaluate(() => document.documentElement.classList.contains('rb-rot90'));
    return { applied: rot === (to !== 'landscape'), evidence: { rot }, undo: async () => ({}) };
}

module.exports = { installSeams, serverView, pageView, screenOff, networkOff, sdkHalfOpen, restDead, cpuThrottle, handoffTrouble, rafStops, strayGameEnd, webglLost, touchNeverEnds, rotate };
