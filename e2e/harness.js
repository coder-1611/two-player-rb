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

async function launchBrowser() {
    return puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
               '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=900,560']
    });
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
