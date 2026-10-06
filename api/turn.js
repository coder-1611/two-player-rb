// api/turn.js — V497 (the owner: "The offense mirroring is REALLY slow, maybe 3 fps, fix"). The opponent's screen goes phone
// to phone over WebRTC, and school networks block the direct path: the link opened in 84% of weekend games but 30-43% of
// school-day games, and every other game fell back to Firebase at 3 frames a second. A relay carries the same link when no
// direct path opens: Cloudflare's TURN (the key mac-remote already uses; 1,000 GB a month free). This hands out its
// short-lived credentials (24 h each); the CDN keeps one answer for an hour, so Cloudflare is asked about once an hour.
// Vercel env (production, sensitive): CF_TURN_KEY_ID, CF_TURN_API_TOKEN — never in the repo.
'use strict';
const TTL = 86400;
module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    const fail = (code, why) => { res.statusCode = code; res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ error: why })); };
    const key = process.env.CF_TURN_KEY_ID, tok = process.env.CF_TURN_API_TOKEN;
    if (!key || !tok) return fail(503, 'not configured');
    try {
        const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(key) + '/credentials/generate-ice-servers', {
            method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl: TTL }), signal: AbortSignal.timeout(8000) });
        if (!r.ok) return fail(502, 'relay service ' + r.status);
        const j = await r.json();
        res.statusCode = 200;
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
        res.end(JSON.stringify({ iceServers: j.iceServers || [], exp: Date.now() + TTL * 1000 }));
    } catch (e) { fail(502, 'relay service unreachable'); }
};
