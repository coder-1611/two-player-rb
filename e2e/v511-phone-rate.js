// e2e/v511-phone-rate.js — V511 (the owner: "if it's a phone do 30 fps, if desktop or laptop do 60 fps"): the opponent's
// screen goes out 30 times a second from a phone or a tablet, every frame (60) from a computer.
//   P1  the device check on real players' user agents (7 Oct): Chromebooks (touch screen or not), a Mac, a Windows PC are
//       computers; an iPhone, an Android phone (also when it asks for the desktop site), an iPad (which asks for desktop
//       sites), an Android tablet are phones
//   P2  a real game, the player with the ball on a phone: 25-32 frames a second through a real down, and the waiting phone
//       still shows every one (under 10% late redraws)
//   P3  the same player on a computer: 45+ frames a second
const L = require('./horn-lib');
const TP = L.TP, sleep = L.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V511 PHONES SEND 30 A SECOND, COMPUTERS 60 ===');
    const g = await TP.startTwoPlayerGame({});
    try {
        const cases = await g.a.page.evaluate(() => {
            const f = window._rb2p_deviceIsPhone;
            const C = [
                [false, 'Chromebook', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', 'Linux x86_64', 0],
                [false, 'Chromebook with a touch screen', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 'Linux x86_64', 10],
                [false, 'Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'MacIntel', 0],
                [false, 'Windows PC (touch)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 'Win32', 10],
                [true, 'iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'iPhone', 5],
                [true, 'Android phone', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', 'Linux armv8l', 5],
                [true, 'Android phone, desktop site', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', 'Linux armv8l', 5],
                [true, 'iPad (desktop site)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15', 'MacIntel', 5],
                [true, 'Android tablet', 'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 'Linux aarch64', 10]
            ];
            return C.map(c => ({ what: c[1], want: c[0], got: f(c[2], c[3], c[4]) }));
        });
        check('P1 computers (Chromebooks with or without touch, a Mac, a Windows PC) send every frame; phones and tablets (iPhone, Android, desktop-site Android, iPad, Android tablet) 30 a second',
              cases.every(c => c.want === c.got), JSON.stringify(cases.filter(c => c.want !== c.got)));
        for (const [label, phone, ok] of [['P2', true, (fps) => fps >= 25 && fps <= 32], ['P3', false, (fps) => fps >= 45]]) {
            const o = await L.offense(g, 45000);
            if (!o.ok) { check(label, false, 'nobody has the ball'); continue; }
            const OFF = o.off, DEF = OFF === g.a ? g.b : g.a;
            await OFF.page.evaluate((p) => { window._rb2p_viewPhone = p; }, phone);
            await sleep(1500);
            const s0 = await OFF.page.evaluate(() => window._rb2p_view.stats()), r0 = await DEF.page.evaluate(() => window._rb2p_view.stats()), t0 = Date.now();
            try { await L.realDown(OFF.page, { buttons: true, pass: false }); } catch (e) {}
            await sleep(1000);
            const s1 = await OFF.page.evaluate(() => window._rb2p_view.stats()), r1 = await DEF.page.evaluate(() => window._rb2p_view.stats());
            const secs = (Date.now() - t0) / 1000, fps = (s1.snd.sent - s0.snd.sent) / secs;
            const drawn = r1.rcv.drawn - r0.rcv.drawn, late = r1.rcv.starved - r0.rcv.starved, rx = r1.rcv.rx - r0.rcv.rx;
            const d = { secs: +secs.toFixed(1), sentPerSec: +fps.toFixed(1), capInt: s1.snd.capInt, mode: r1.rcv.mode, received: rx, drawn, latePct: drawn ? Math.round(100 * late / drawn) : null };
            console.log('  ' + label + ' ' + JSON.stringify(d));
            if (phone) check('P2 the player with the ball on a phone: 25-32 frames a second (every 33 ms), and the waiting phone shows them with under 10% late redraws',
                             ok(fps) && s1.snd.capInt === 33 && r1.rcv.mode === 'p2p' && rx > 0 && drawn > 0 && late / drawn < 0.10, JSON.stringify(d));
            else check('P3 the same player on a computer: every frame (45+ a second)', ok(fps) && s1.snd.capInt === 16, JSON.stringify(d));
            await OFF.page.evaluate(() => { window._rb2p_viewPhone = null; });
        }
    } finally { try { await g.cleanup(); } catch (e) {} }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
