// e2e/v410-lobby.js — the four complaints of 2026-09-23.
//
//   T1  a host whose seat dropped (connection blink) still has a room: the friend's code joins as B, and the seat keeper restores A
//   T2  the host's waiting line names the code, says how to use it, and offers an invite link
//   T3  an invite link (?join=CODE) opens straight into the friend's room
//   (T4/T5 replaced by the V411 field check: e2e/v411-field-check.js)
//   T6  a try snapped before the horn: the drive left at the 2 is handed off at once (no 3s window to snap it)
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V410 LOBBY + SILENT OPPONENT ===');
    await H.ensureServer();
    const browser = await H.launchBrowser();

    // ---- T1 + T2 ----
    const code1 = TP.randomCode(); await TP.deleteRoom(code1);
    const A = await TP.openLobbyPage(browser, 'A');
    const B = await TP.openLobbyPage(browser, 'B');
    const roleA = await TP.hostRoom('A', A.page, code1);
    await sleep(1500);
    await TP.fbDelete('rooms/' + code1 + '/players/a');          // the blink: onDisconnect removed the host's seat
    const roleB = await TP.joinRoom('B', B.page, code1);
    let seatBack = null;
    for (let i = 0; i < 12 && !(seatBack && seatBack.a); i++) { await sleep(1000); seatBack = await TP.fbGet('rooms/' + code1 + '/players'); }
    check('T1 after the host\'s seat dropped, the friend joins as B (not "No room", not the host\'s seat) and the host\'s seat comes back',
          roleA === 'a' && roleB === 'b' && seatBack && seatBack.a && seatBack.b, JSON.stringify({ roleA, roleB, seatBack }));

    const code2 = TP.randomCode(); await TP.deleteRoom(code2);
    const C = await TP.openLobbyPage(browser, 'C');
    await TP.hostRoom('C', C.page, code2);
    await sleep(1200);
    const t2 = await C.page.evaluate(() => { const s = document.getElementById('rb-status'); return { text: s ? s.textContent : '', btn: !!document.getElementById('rb-copy-link') }; });
    check('T2 the host\'s waiting line names the code, explains CODE + JOIN, and offers an invite link', t2.text.indexOf(code2) >= 0 && /CODE box/.test(t2.text) && /JOIN/.test(t2.text) && t2.btn, JSON.stringify(t2));

    // ---- T3: invite link ----
    const D = await browser.newPage(); await D.setViewport({ width: 900, height: 560 });
    await D.evaluateOnNewDocument(() => { try { localStorage.setItem('rb2p_name', 'Bot D'); localStorage.setItem('rb2p_news_v387', '1'); } catch (e) {} });
    await D.goto(H.url() + '&join=' + code2, { waitUntil: 'domcontentloaded' });
    let inRoom = false;
    for (let i = 0; i < 40 && !inRoom; i++) { await sleep(1000); inRoom = await D.evaluate(() => { const l = document.getElementById('rb-lobby'); return !!(l && l.getAttribute('data-active') === 'room'); }).catch(() => false); }
    const dRole = inRoom ? await D.evaluate(() => (document.getElementById('rb-you-role') || {}).textContent) : null;
    check('T3 an invite link (?join=CODE) opens straight into the friend\'s room as B', inRoom && /b/i.test(String(dRole)), JSON.stringify({ inRoom, dRole }));
    for (const p of [A.page, B.page, C.page, D]) { try { await p.close(); } catch (e) {} }
    await TP.deleteRoom(code1); await TP.deleteRoom(code2);

    // ---- T4-T6 in a real game ----
    const g = await TP.startTwoPlayerGame({ browser });
    await sleep(6000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a, def = aWait ? g.a : g.b;

    const t6 = await off.page.evaluate(async () => {
        window._rb2p_diagLog('T6-START');
        const em = RB.engineState();
        const sent = []; const real = window._twoPlayer.send; window._twoPlayer.send = o => { sent.push(o.type); return real.call(window._twoPlayer, o); };
        window._rb2p_lastConvModalMs = Date.now() - 12000; window._rb2p_lastSnapDown = 6; window._rb2p_lastSnapMs = Date.now() - 8000;
        window._rb2p_quarterChangedToMs = Date.now() - 1000;
        window._rb2p_patPlayPending = true;               // the duty has not retired yet — the old code waited here
        window._rb2p_userIsWaitingForOpponent = false; window._rb2p_userOutcomeSendInProgress = false; window._rb2p_kickoffGraceUntil = 0;
        em.enginePossessingTeamIdx = em.engineUserTeamIdx; em.engineYardLineSigned = 48; em.engineDownNumber = 1;
        const t0 = Date.now(); while (Date.now() - t0 < 6000 && !sent.length) await new Promise(r => setTimeout(r, 100));
        window._twoPlayer.send = real;
        const d = String(window._rb2p_readDiagLog()); const tail = d.slice(d.lastIndexOf('T6-START'));
        window._rb2p_lastConvModalMs = 0; window._rb2p_patPlayPending = false;
        return { sent, logged: /POST-CONV the try crossed the horn/.test(tail), ms: Date.now() - t0 };
    });
    check('T6 a try snapped before the horn: the drive at the 2 is handed off at once, even before the duty retires', t6.logged && t6.sent.includes('TD'), JSON.stringify(t6));

    await g.cleanup();
    try { await browser.close(); } catch (e) {}
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
