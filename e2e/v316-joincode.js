// e2e/v316-joincode.js — a typed JOIN code must reference an EXISTING room.
//
// Device report: "if you type an invalid code it just creates a new game."
// Root cause: claimSlot's A-slot transaction committed into the null slot of a
// non-existent room, so any typed code created a fresh room with the typer as
// host A. V316: claimSlot first checks that /players exists and returns
// 'notfound' otherwise; joinByCode surfaces a "No room" message.
//
// T1  joining a NON-existent code is rejected (message shown, stays in lobby)
// T2  joining a non-existent code does NOT create the room in Firebase
// T3  a hosted room (PLAY 2P) CAN still be joined by its code (positive control)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

async function typeJoin(page, code) {
    await page.evaluate(c => {
        const i = document.getElementById('rb-room-input');
        if (i) { i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); }
    }, code);
    await page.evaluate(() => { const j = document.getElementById('rb-join'); if (j) j.click(); });
}
const inRoom = page => page.evaluate(() => {
    const l = document.getElementById('rb-lobby');
    return !!(l && l.getAttribute('data-active') === 'room');
});
const entryMsg = page => page.evaluate(() =>
    ((document.getElementById('rb-entry-msg') || {}).textContent || '').trim());

(async () => {
    console.log('=== V316 JOIN CODE MUST REFERENCE AN EXISTING ROOM ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();
    try {
        // ---- T1 + T2: a random, never-created code must be rejected ----
        const ghost = TP.randomCode();
        await TP.deleteRoom(ghost);   // ensure it truly does not exist
        const a = await TP.openLobbyPage(browser, 'A', {});
        await typeJoin(a.page, ghost);
        await sleep(2500);            // allow the FB existence read + UI update
        const stayed = !(await inRoom(a.page));
        const msg = await entryMsg(a.page);
        check('T1 joining a non-existent code stays in the lobby (no room entered)',
              stayed, 'unexpectedly entered a room for ghost code ' + ghost);
        check('T1 a "No room" message is shown',
              /no room/i.test(msg), 'entry message was: "' + msg + '"');
        const roomAfter = await TP.fbGet('rooms/' + ghost);
        check('T2 the ghost code did NOT create a room in Firebase',
              roomAfter == null || roomAfter.players == null,
              'room was created: ' + JSON.stringify(roomAfter));

        // ---- T3: a properly HOSTED room can still be joined ----
        const real = TP.randomCode();
        await TP.deleteRoom(real);
        const host = await TP.openLobbyPage(browser, 'HOST', {});
        const hostRole = await TP.hostRoom('HOST', host.page, real);
        const joiner = await TP.openLobbyPage(browser, 'JOIN', {});
        const joinRole = await TP.joinRoom('JOIN', joiner.page, real);
        check('T3 a hosted room is joinable by its code (host=a, joiner=b)',
              hostRole === 'a' && joinRole === 'b',
              'hostRole=' + hostRole + ' joinRole=' + joinRole);
        await TP.deleteRoom(real);
    } finally {
        await browser.close();
        console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(fail ? 1 : 0);
    }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
