// e2e/v530-accounts.js — V530 ACCOUNTS (the owner: "create an account system, where users have a username and password so
// they can open their account from anywhere, so next time they open their device they are FORCED to create an account
// with username and password so they can unify their devices. Figure out the best way to force this while not looking
// too disruptive and it looking like it is for THEIR good"). Real pages, real Firebase sign-ins (test usernames zz…,
// deleted at the end); the rating paths are a test copy (window._rb2p_eloPath / _rb2p_eloQueue).
//   A1  a device with no account opens on the account screen: MAKE YOUR ACCOUNT, the username filled in from its name,
//       no way to the game behind it
//   A2  a taken username and a short password are refused with plain words; then SAVED — the same id as before (nothing
//       lost), a password sign-in, the name kept with the account, the database connection signed in as the account too,
//       and the lobby comes back with @USERNAME
//   A3  a reload keeps the account (no screen)
//   A4  a second device that has its own record: SAVE YOUR ACCOUNT says its rating and wins; I HAVE ONE says its games
//       join; a wrong password is refused; the right one switches the page to the account (its id, its name), without a
//       reload, and leaves both halves of the merge and the note for the Mac's job
//   A5  the Mac's job merges that device's record into the account
//   A6  LOG OUT (two taps): the page is anonymous again and the account screen is back
//   A7  never in a room of this session (a refresh's resume): the screen waits until the player is out of it
//   A8  a sideways phone: the title, both fields and the button on one screen
const H = require('./harness');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/', KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0', DOM = '@realretrobowl2p.firebaseapp.com';
const RUN = Date.now().toString(36), TROOT = 'rooms/~elotest/a' + RUN, STATE = path.join(os.tmpdir(), 'elo-acct-' + RUN + '.json');
const U1 = 'zz' + RUN + 'a', TAKEN = 'zz' + RUN + 't', PW = 'pw' + RUN.slice(-6);
let OWN = null;
async function owner() {
    if (OWN) return OWN;
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi', refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    return (OWN = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token);
}
const aGet = async p => (await fetch(DB + p + '.json?access_token=' + encodeURIComponent(await owner()))).json();
const aPut = async (p, v) => fetch(DB + p + '.json?access_token=' + encodeURIComponent(await owner()), { method: 'PUT', body: JSON.stringify(v) });
const aDel = async p => fetch(DB + p + '.json?access_token=' + encodeURIComponent(await owner()), { method: 'DELETE' });
const delUser = async uid => fetch('https://identitytoolkit.googleapis.com/v1/projects/realretrobowl2p/accounts:delete', { method: 'POST', headers: { Authorization: 'Bearer ' + (await owner()), 'content-type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
const itk = async (ep, b) => (await fetch('https://identitytoolkit.googleapis.com/v1/' + ep + '?key=' + KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();

async function open(browser, opts) {
    opts = opts || {};
    const ctx = opts.ctx || await browser.createBrowserContext(), page = await ctx.newPage();
    if (opts.ua) await page.setUserAgent(opts.ua);
    await page.setViewport(opts.vp || { width: 1280, height: 800 });
    await page.evaluateOnNewDocument((o) => {
        try {
            localStorage.setItem('rb2p_a2hs_v457', '1'); localStorage.setItem('rb2p_news_v387', '1'); localStorage.setItem('rb2p_ann_refresh_v1', '1');
            if (o.name && !localStorage.getItem('rb2p_name_set_' + o.run)) { localStorage.setItem('rb2p_name', o.name); localStorage.setItem('rb2p_name_set_' + o.run, '1'); }
            if (o.tok && !localStorage.getItem('rb2p_tok_set_' + o.run)) { localStorage.setItem('fbAnonTok:realretrobowl2p', JSON.stringify(o.tok)); localStorage.setItem('rb2p_tok_set_' + o.run, '1'); }
            if (o.room) sessionStorage.setItem('rb_room', o.room);
        } catch (e) {}
        window._rb2p_acctForce = true; window._rb2p_eloQueue = o.troot + '/q'; window._rb2p_eloPath = o.troot + '/pub';
    }, { name: opts.name || '', tok: opts.tok || null, room: opts.room || '', run: RUN, troot: TROOT });
    await page.goto(H.url(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!(window._rb2p_acct && document.getElementById('rb-lobby')), { timeout: 90000, polling: 300 });
    return { ctx, page };
}
const look = page => page.evaluate(() => {
    const t = id => { const e = document.getElementById(id); return e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
    const st = window._rb2p_acct.state(), entry = document.querySelector('#rb-lobby .rb-screen[data-view="entry"]');
    return { st, view: document.getElementById('rb-lobby').dataset.active, rest: window._rb2p_restUid ? window._rb2p_restUid() : '', user: window._rb2p_acctUser ? window._rb2p_acctUser() : '',
             sdk: window._rb2p_sdkUid ? window._rb2p_sdkUid() : null, title: t('rb-acct-title'), why: t('rb-acct-why'), msg: t('rb-acct-msg'), uval: (document.getElementById('rb-acct-user') || {}).value,
             playing: t('rb-playing-as'), entryShown: !!(entry && getComputedStyle(entry).display !== 'none'), name: localStorage.getItem('rb2p_name') || '' };
});
async function until(page, fn, ms) { const t0 = Date.now(); let v = null; while (Date.now() - t0 < ms) { v = await look(page); if (fn(v)) return v; await sleep(300); } return v; }
async function submit(page, user, pw) {
    await page.evaluate((u, p) => { const a = document.getElementById('rb-acct-user'), b = document.getElementById('rb-acct-pw'); a.value = u; b.value = p; }, user, pw);
    await page.click('#rb-acct-go');
}

(async () => {
    console.log('=== V530 ACCOUNTS (' + RUN + ') ===');
    await H.ensureServer();
    const made = [];   // sign-ins to delete
    // a taken username (another player's) and the second device's own sign-in, with a record
    const tk = await itk('accounts:signUp', { returnSecureToken: true }); made.push(tk.localId);
    await itk('accounts:signUp', { idToken: tk.idToken, email: TAKEN + DOM, password: 'whatever1', returnSecureToken: true });
    const d2 = await itk('accounts:signUp', { returnSecureToken: true }); made.push(d2.localId);
    const OLD2 = d2.localId;
    await aPut(TROOT + '/pub/r/' + OLD2, { r: 1100, n: 10, w: 7, l: 3, d: 0, nm: 'Old Device', peak: 1100 });
    const browser = await H.launchBrowser();
    let uid0 = '';
    try {
        // A1
        const D1 = await open(browser, { name: 'Acct Tester' });
        const a1 = await until(D1.page, v => v.view === 'acct' && /ACCOUNT/.test(v.title) && !!v.rest, 15000);   // the device's own (anonymous) id, before
        uid0 = a1.rest; if (uid0) made.push(uid0);
        check('A1 no account: the account screen first — MAKE YOUR ACCOUNT, the username from the name, the game behind it',
              a1.view === 'acct' && /MAKE YOUR ACCOUNT/.test(a1.title) && a1.uval === 'acct_tester' && !a1.entryShown && a1.st.needed && !a1.user, JSON.stringify(a1));
        // A2
        await submit(D1.page, TAKEN, PW);
        const taken = await until(D1.page, v => /TAKEN/.test(v.msg), 15000);
        await submit(D1.page, U1, '123');
        const short = await until(D1.page, v => /6 CHARACTERS/.test(v.msg), 5000);
        await submit(D1.page, U1, PW);
        const saved = await until(D1.page, v => /SAVED/.test(v.msg), 15000);
        const back = await until(D1.page, v => v.view === 'entry', 6000);
        const sdk1 = await until(D1.page, v => v.sdk && !v.sdk.anon, 10000);
        const prof = await aGet('acct/' + uid0);
        check('A2 TAKEN and a short password refused in plain words; SAVED: the same id (nothing lost), a password sign-in, the name kept with the account, the connection signed in too, back to the lobby with @USERNAME',
              /TAKEN/.test(taken.msg) && /6 CHARACTERS/.test(short.msg) && /SAVED/.test(saved.msg) && saved.user === U1 && saved.rest === uid0 && back.view === 'entry' &&
              back.playing.indexOf('@' + U1.toUpperCase()) >= 0 && back.name === 'Acct Tester' && prof && prof.u === U1 && prof.nm === 'Acct Tester' && sdk1.sdk && sdk1.sdk.uid === uid0 && !sdk1.sdk.anon,
              JSON.stringify({ taken: taken.msg, short: short.msg, saved: saved.msg, user: saved.user, same: saved.rest === uid0, view: back.view, playing: back.playing, prof, sdk: sdk1.sdk }));
        // A3
        await D1.page.reload({ waitUntil: 'domcontentloaded' });
        await D1.page.waitForFunction(() => !!window._rb2p_acct, { timeout: 90000, polling: 300 });
        await sleep(5000);
        const a3 = await until(D1.page, v => v.sdk, 8000);
        check('A3 a reload keeps the account — no screen, the same id, the connection still the account', a3.view !== 'acct' && a3.user === U1 && a3.rest === uid0 && a3.sdk && a3.sdk.uid === uid0,
              JSON.stringify({ view: a3.view, user: a3.user, rest: a3.rest === uid0, sdk: a3.sdk }));
        // A4
        const D2 = await open(browser, { tok: { t: d2.idToken, r: d2.refreshToken, e: Date.now() + 3000000 } });
        const a4a = await until(D2.page, v => v.view === 'acct' && /rating 1100/.test(v.why), 12000);
        try { fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true }); await D2.page.screenshot({ path: path.join(__dirname, 'shots', 'v530-desktop-save.png') }); } catch (e) {}
        await D2.page.click('#rb-acct-tab-in');
        const a4b = await until(D2.page, v => /LOG IN/.test(v.title), 3000);
        await submit(D2.page, U1, 'wrong999');
        const wrong = await until(D2.page, v => /WRONG USERNAME OR PASSWORD/.test(v.msg), 15000);
        await submit(D2.page, U1.toUpperCase(), PW);
        const inn = await until(D2.page, v => /WELCOME BACK/.test(v.msg), 15000);
        const in2 = await until(D2.page, v => v.view === 'entry' && v.sdk && !v.sdk.anon, 10000);
        const into = await aGet('acct/' + OLD2 + '/into'), from = await aGet('acct/' + uid0 + '/from/' + OLD2), note = await aGet(TROOT + '/q/merge_' + OLD2);
        check('A4 a second device: SAVE YOUR ACCOUNT names its 1100 and 7 wins; I HAVE ONE says its 10 games join; a wrong password refused; the right one (any case) switches the page to the account, its name, both merge halves and the note',
              /SAVE YOUR ACCOUNT/.test(a4a.title) && /7 wins/.test(a4a.why) && /10 games/.test(a4b.why) && /WRONG/.test(wrong.msg) && /WELCOME BACK/.test(inn.msg) && inn.rest === uid0 && inn.user === U1 &&
              in2.name === 'Acct Tester' && in2.sdk.uid === uid0 && into === uid0 && typeof from === 'number' && note && note.merge && note.merge.from === OLD2 && note.merge.into === uid0,
              JSON.stringify({ t: a4a.title, why: a4a.why, inWhy: a4b.why, wrong: wrong.msg, inn: inn.msg, rest: inn.rest === uid0, name: in2.name, sdk: in2.sdk, into: into === uid0, from, note }));
        // A5
        fs.writeFileSync(STATE, JSON.stringify({ kept: true, players: { [OLD2]: { r: 1100, n: 10, w: 7, l: 3, d: 0, nm: 'Old Device', fd: {}, peak: 1100 } }, games: {} }));
        const out = await new Promise(res => { const p = spawn('node', [path.join(__dirname, '..', 'tools', 'elo.js'), '--include-test', '--queue', TROOT + '/q', '--pub', TROOT + '/pub', '--state', STATE]); let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', () => res(o)); });
        const st5 = JSON.parse(fs.readFileSync(STATE, 'utf8')), pubOld = await aGet(TROOT + '/pub/r/' + OLD2), pubNew = await aGet(TROOT + '/pub/r/' + uid0), q5 = await aGet(TROOT + '/q');
        check('A5 the Mac\'s job merges it: the account has the device\'s 10 games at 1100; the device\'s record is gone; the note done',
              st5.players[uid0] && st5.players[uid0].n === 10 && Math.round(st5.players[uid0].r) === 1100 && !st5.players[OLD2] && st5.alias && st5.alias[OLD2] === uid0 && pubOld === null && pubNew && pubNew.n === 10 && !q5 && /MERGED/.test(out),
              JSON.stringify({ acc: st5.players[uid0], pubOld, pubNew, q5, out: out.trim().split('\n').slice(-2) }));
        // A6
        await D2.page.click('#rb-acct-out');
        const arm = await D2.page.evaluate(() => (document.getElementById('rb-acct-out') || {}).textContent);
        await Promise.all([D2.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}), D2.page.click('#rb-acct-out')]);
        await D2.page.waitForFunction(() => !!window._rb2p_acct, { timeout: 90000, polling: 300 });
        const a6 = await until(D2.page, v => v.view === 'acct' && v.rest, 15000);
        if (a6.rest) made.push(a6.rest);
        check('A6 LOG OUT takes two taps; then the page is no one\'s (a new anonymous id) and the account screen is back', /TAP AGAIN/.test(arm) && a6.view === 'acct' && !a6.user && a6.rest && a6.rest !== uid0 && !a6.name,
              JSON.stringify({ arm, view: a6.view, user: a6.user, rest: a6.rest && a6.rest.slice(0, 8), name: a6.name }));
        // A7
        const D3 = await open(browser, { name: 'Room Tester', room: 'ZQ9Q' });
        await sleep(6000);
        const a7a = await look(D3.page);
        await D3.page.evaluate(() => { sessionStorage.removeItem('rb_room'); });
        const a7b = await until(D3.page, v => v.view === 'acct', 4000);
        if (a7b.rest) made.push(a7b.rest);
        check('A7 in a room of this session (a refresh\'s resume): no account screen; out of it: the screen', a7a.view !== 'acct' && a7b.view === 'acct', JSON.stringify({ inRoom: a7a.view, after: a7b.view }));
        // A8
        const D4 = await open(browser, { name: 'Phone Tester', vp: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
            ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
        await until(D4.page, v => v.view === 'acct', 10000);
        await sleep(800);
        const a8 = await D4.page.evaluate(() => {
            const on = id => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; };
            const sc = document.querySelector('#rb-lobby .rb-screen[data-view="acct"]');
            return { title: on('rb-acct-title'), tabs: on('rb-acct-tab-in'), user: on('rb-acct-user'), pw: on('rb-acct-pw'), go: on('rb-acct-go'), scroll: sc ? sc.scrollTop : -1, rest: window._rb2p_restUid() };
        });
        if (a8.rest) made.push(a8.rest);
        check('A8 a sideways phone: the title, the tabs, both fields and the button on one screen', a8.title && a8.tabs && a8.user && a8.pw && a8.go && a8.scroll === 0, JSON.stringify(a8));
        try { fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true }); await D1.page.screenshot({ path: path.join(__dirname, 'shots', 'v530-lobby-account.png') }); await D4.page.screenshot({ path: path.join(__dirname, 'shots', 'v530-phone-account.png') }); } catch (e) {}
    } finally {
        try { await browser.close(); } catch (e) {}
        for (const u of new Set(made.filter(Boolean))) { await delUser(u).catch(() => {}); await aDel('acct/' + u).catch(() => {}); await aDel('on/' + u.slice(0, 8)).catch(() => {}); await aDel('sid/' + u.slice(0, 8)).catch(() => {}); }
        await aDel(TROOT).catch(() => {}); try { fs.unlinkSync(STATE); } catch (e) {}
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
