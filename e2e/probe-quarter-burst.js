// e2e/probe-quarter-burst.js — drive the real engine into the pick-6-at-0:00
// quarter boundary and observe whether the quarter bursts past +1 and/or the
// drive freezes. Runs both variants: engine-alone and pinClock (mimics the
// cross-device live-sync writing the opponent's 0:00 clock back onto us).
const H = require('./harness');

(async () => {
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        const { page } = await H.openPage(browser, {
            match: true, oppUid: 11,
            onConsole: t => { if (/\[2P REPRO\]/.test(t)) console.log('  ' + t); }
        });
        await H.sleep(800);

        const variants = [
            { label: 'engine-alone',        opts: {} },
            { label: 'pinClock',            opts: { pinClock: true } },
            { label: 'staleOpp (2-device)', opts: { staleOpp: true } }
        ];
        for (const v of variants) {
            console.log('\n===== variant: ' + v.label + ' =====');
            const res = await page.evaluate(async (opts) => {
                if (typeof window._rb2p_reproQuarterBurst !== 'function') return { err: 'helper missing' };
                return await window._rb2p_reproQuarterBurst(opts);
            }, v.opts);
            console.log('  >> ' + JSON.stringify(res));
            await H.sleep(600);
        }
    } finally {
        await browser.close();
    }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
