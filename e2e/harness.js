// e2e/harness.js — shared headless-browser harness for two-player-rb.
//
// This is the boilerplate every test needs: locate Chrome, make sure a static
// server is serving the project, launch a headless page, load the engine, and
// drive it into a live match. Tests import this so they only contain the
// behavior they actually verify.
//
// Run a single test:   node e2e/run.js <name-substring>
// Run all tests:        node e2e/run.js
//
// Requires puppeteer-core (see e2e/package.json). System Google Chrome is used
// (no bundled Chromium download). Override the binary with CHROME_PATH=.

const http = require('http');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let puppeteer;
try {
    puppeteer = require('puppeteer-core');
} catch (e) {
    console.error('\n[harness] puppeteer-core is not installed.\n' +
                  '          cd e2e && npm install   (one time)\n');
    process.exit(2);
}

const PROJECT_DIR = path.resolve(__dirname, '..');   // two-player-rb/
const PORT = Number(process.env.RB_E2E_PORT || 8790);
const CHROME = process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// The engine boots asynchronously; these are the dwell times the manual tests
// converged on. Override via env if a slower machine needs more.
const ENGINE_BOOT_MS = Number(process.env.RB_E2E_BOOT_MS || 9000);
const MATCH_SETTLE_MS = Number(process.env.RB_E2E_SETTLE_MS || 5000);

// A KNOWN pre-existing, benign load-race error (an early interval reads
// _Sc2._GL2 before the engine assigns it). Filtered so it doesn't fail tests.
const KNOWN_BENIGN_ERR = /_GL2/;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function url() { return 'http://127.0.0.1:' + PORT + '/index.html?cb=' + Date.now(); }

function httpOk(u) {
    return new Promise(resolve => {
        const req = http.get(u, res => { res.resume(); resolve(res.statusCode === 200); });
        req.on('error', () => resolve(false));
        req.setTimeout(1500, () => { req.destroy(); resolve(false); });
    });
}

// Ensure a static server is serving the PROJECT dir on PORT. Reused across
// runs if already up; started (detached) otherwise. Not auto-killed so repeated
// single-test runs stay fast — `node e2e/run.js --stop-server` to stop it.
async function ensureServer() {
    if (await httpOk('http://127.0.0.1:' + PORT + '/index.html')) return 'reused';
    spawn('python3', ['-m', 'http.server', String(PORT)],
          { cwd: PROJECT_DIR, detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40; i++) {
        await sleep(250);
        if (await httpOk('http://127.0.0.1:' + PORT + '/index.html')) return 'started';
    }
    throw new Error('static server did not come up on port ' + PORT);
}

function stopServer() {
    try { execSync("pkill -f 'http.server " + PORT + "'"); } catch (e) {}
}

// V419: persistent browser profiles, one per parallel slot. Every fresh profile signed up
// new anonymous Firebase accounts (REST + SDK), and a day of test runs exhausted the
// per-IP sign-up quota (TOO_MANY_ATTEMPTS_TRY_LATER) — hosts then failed on BOTH builds.
// A kept profile reuses its accounts. RB_E2E_FRESH=1 restores the old throwaway profile.
const os = require('os');
const PROFILE_ROOT = path.join(os.homedir(), '.cache', 'two-player-rb-e2e', 'profiles');
function claimProfileSlot() {
    fs.mkdirSync(PROFILE_ROOT, { recursive: true });
    for (let i = 0; i < 32; i++) {
        const dir = path.join(PROFILE_ROOT, 'slot-' + i), lock = dir + '.lock';
        try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); }
        catch (e) {
            let alive = false;
            try { process.kill(Number(fs.readFileSync(lock, 'utf8')), 0); alive = true; } catch (e2) {}
            if (alive) continue;
            try { fs.writeFileSync(lock, String(process.pid)); } catch (e3) { continue; }
        }
        fs.mkdirSync(dir, { recursive: true });
        for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} }
        return { dir, lock };
    }
    return null;
}
async function launchBrowser() {
    // HEADFUL=1: a visible window (to watch the bots play); otherwise headless.
    const headful = process.env.HEADFUL === '1';
    const slot = process.env.RB_E2E_FRESH === '1' ? null : claimProfileSlot();
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        userDataDir: slot ? slot.dir : undefined,
        headless: headful ? false : 'new',
        defaultViewport: headful ? null : undefined,
        // headless: software GL so it runs anywhere; headful: the REAL GPU (swiftshader on screen = lag)
        args: ['--no-sandbox'].concat(headful ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']).concat([
               '--mute-audio', headful ? '--window-size=1000,640' : '--window-size=900,560',
               headful ? '--window-position=40,40' : '--window-position=0,0',
               // Two-player sim opens two tabs; a backgrounded tab gets its
               // rAF/timer loop throttled by Chrome, which freezes the engine's
               // room transition mid-launch. These keep BOTH tabs running at
               // full speed (harmless for the single-page tests).
               '--disable-background-timer-throttling',
               '--disable-backgrounding-occluded-windows',
               '--disable-renderer-backgrounding'])
    });
    if (slot) {
        const release = () => { try { fs.unlinkSync(slot.lock); } catch (e) {} };
        browser.on('disconnected', release); process.on('exit', release);
        // a kept profile keeps the game's localStorage too: clear everything but the sign-in
        // token, so every run starts from default settings (the SDK's account lives in IndexedDB)
        try {
            await ensureServer();
            const p = await browser.newPage();
            await p.goto('http://127.0.0.1:' + PORT + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== 'fbAnonTok:realretrobowl2p') localStorage.removeItem(k); });
            await p.close();
        } catch (e) {}
    }
    return browser;
}

// Open a page, load the engine + bridge, and (optionally) drive into a live
// match vs KC with the user on offense. Returns { page, errors } where errors
// is the list of NON-benign pageerrors seen so far.
async function openPage(browser, opts) {
    opts = opts || {};
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 560 });
    const errors = [];
    page.on('pageerror', e => { if (!KNOWN_BENIGN_ERR.test(e.message)) errors.push(e.message); });
    if (opts.onConsole) page.on('console', m => opts.onConsole(m.text()));
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Harness'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });   // V387
    await page.goto(url(), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await sleep(ENGINE_BOOT_MS);
    if (opts.match) await enterMatch(page, opts.oppUid);
    return { page, errors };
}

// Click through the home screen into rm_match, then launch a single match vs KC
// with the bridge hooks installed and the user forced onto offense.
async function enterMatch(page, oppUid) {
    for (let q = 0; q < 12; q++) {
        const rm = await page.evaluate(() => { try { return _ft._gt(); } catch (e) { return -1; } });
        if (rm === 14) break;                     // rm_home
        await page.mouse.click(450, 300);
        await sleep(900);
    }
    await page.evaluate(uid => {
        window._rb2p_oppTeamUid = uid;
        const l = document.getElementById('rb-lobby'); if (l) l.style.display = 'none';
        try { window.s_play_one_game_vs_KC(); } catch (e) {}
    }, oppUid == null ? 11 : oppUid);
    await sleep(MATCH_SETTLE_MS);
}

module.exports = {
    puppeteer, PROJECT_DIR, PORT, CHROME, sleep, url,
    ensureServer, stopServer, launchBrowser, openPage, enterMatch,
    KNOWN_BENIGN_ERR
};
