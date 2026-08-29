// e2e/v364-transport.js — the handoff and the score survive a dead socket.
//
// Room MSZT, read from the room's own records: at the instant of a touchdown
// (18:05:12) every Firebase SDK write from phone b stopped landing — the live
// pushes carrying the new score, the KICKOFF handoff, the turn record — while
// b's REST writes (the heartbeat, the diag mirror) kept landing for another
// 47 seconds. A half-open websocket: the SDK never errored, it queued, and the
// queue died with the tab. Result: the score never changed on the other phone
// and BOTH phones sat in WAIT, forever.
//
// T1  sender's SDK half-open: the handoff still reaches the receiver (REST)
// T2  sender's SDK half-open: the receiver's scoreboard still updates (REST live)
// T3  receiver's SDK dead: the handoff is picked up by the REST poll
// T4  the record vanishes after send: the delivery watchdog re-sends it
const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

// A half-open socket, as seen from the page: FB.set returns a promise that
// never settles. Nothing errors. That is exactly MSZT.
const halfOpen = page => page.evaluate(() => {
    if (!window.__realSet) window.__realSet = window._rb2p_FB.set;
    window._rb2p_FB.set = function () { return new Promise(function () {}); };
});
const heal = page => page.evaluate(() => { if (window.__realSet) window._rb2p_FB.set = window.__realSet; });

const sendHandoff = (page, extra) => page.evaluate((extra) => {
    const em = RB.engineState();
    const o = Object.assign({
        type: 'OTHER', yardLine: -30, ownSide: false, turnover: false,
        message: 'Possession change. On your 20 yard line',
        quarter: Number(em.engineQuarter) || 1, minutesLeft: 0, secondsLeft: 30,
        scoreUser: Number(em.userScore) || 0, scoreOpp: Number(em.opponentScore) || 0,
        fromTeam: 'X', toTeam: 'Y', ts: Date.now()
    }, extra || {});
    window._twoPlayer.send(o);
    // The real drive-end path PARKS this device before it calls send (the
    // bridge's base send only logs). The REST poll and the delivery watchdog
    // both run only while parked, exactly like a real sender — so park here.
    window._rb2p_userIsWaitingForOpponent = true;
    return o.ts;
}, extra);

(async () => {
    console.log('=== V364 THE HANDOFF SURVIVES A DEAD SOCKET (room MSZT) ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    let off = aWait ? g.b : g.a;
    let def = aWait ? g.a : g.b;
    console.log('  offense = ' + off.role + ', receiver = ' + def.role);

    // ---- T1: sender half-open, handoff still lands ----
    await halfOpen(off.page);
    const ts1 = await sendHandoff(off.page);
    await sleep(5000);
    const rec1 = await TP.fbGet('rooms/' + g.code + '/outcomes/' + off.role);
    const t1 = await def.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        yard: Number(RB.engineState().engineYardLineSigned)
    }));
    console.log('  T1: server ts=' + (rec1 && rec1.ts) + ' sent=' + ts1 + ' ack=' + (rec1 && rec1.ack) +
                ' receiver=' + JSON.stringify(t1));
    check('T1 with the sender\'s socket half-open, the handoff still reaches the server and the receiver',
          rec1 && Number(rec1.ts) === ts1 && rec1.ack === def.role && t1.waiting === false,
          JSON.stringify({ rec: rec1 && rec1.ts, ack: rec1 && rec1.ack, t1 }));
    const offDiag = await off.page.evaluate(() => (window._rb2p_readDiagLog ? window._rb2p_readDiagLog() : ''));
    check('T1 the stall was named in the log', /FB-STALL send/.test(String(offDiag)),
          String(offDiag).slice(-200));

    // Possession has swapped: the former receiver is now on offense.
    await heal(off.page);
    [off, def] = [def, off];
    await sleep(1500);

    // ---- T2: sender half-open, the SCORE still crosses ----
    await halfOpen(off.page);
    const before2 = await def.page.evaluate(() => Number(RB.engineState().opponentScore));
    await off.page.evaluate(() => { const em = RB.engineState(); em.setUserScore(Number(em.userScore || 0) + 7); });
    await sleep(6000);
    const after2 = await def.page.evaluate(() => Number(RB.engineState().opponentScore));
    const srvLive2 = await TP.fbGet('rooms/' + g.code + '/live/' + off.role);
    const defWaiting2 = await def.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    console.log('  T2: receiver saw opponent score ' + before2 + ' -> ' + after2 +
                '  (server live/' + off.role + ' myScore=' + (srvLive2 && srvLive2.myScore) +
                ', receiver parked=' + defWaiting2 + ')');
    check('T2 with the sender\'s socket half-open, the receiver\'s scoreboard still updates',
          after2 === before2 + 7, before2 + ' -> ' + after2);
    await heal(off.page);

    // ---- T3: RECEIVER's socket dead, the REST poll delivers ----
    await def.page.evaluate(() => window._rb2p_FB.goOffline(window._rb2p_db));
    await sleep(800);
    const ts3 = await sendHandoff(off.page);
    await sleep(7000);   // the poll runs every 3s while parked in WAIT
    const t3 = await def.page.evaluate(() => ({
        waiting: window._rb2p_userIsWaitingForOpponent === true,
        diag: window._rb2p_readDiagLog ? String(window._rb2p_readDiagLog()).slice(-300) : ''
    }));
    await def.page.evaluate(() => window._rb2p_FB.goOnline(window._rb2p_db));
    console.log('  T3: receiver waiting=' + t3.waiting + '  diag tail: ' + t3.diag.replace(/\n/g, ' | '));
    check('T3 with the RECEIVER\'s socket dead, the handoff is applied from the REST poll',
          t3.waiting === false && /rest-poll/.test(t3.diag), JSON.stringify(t3));
    [off, def] = [def, off];
    await sleep(1500);

    // ---- T4: the record disappears after a send; the watchdog re-sends ----
    const ts4 = await sendHandoff(off.page);
    await sleep(600);
    await TP.fbDelete('rooms/' + g.code + '/outcomes/' + off.role);   // the SDK "ate" it
    // the receiver already applied it live — put it back in WAIT so the
    // watchdog's re-send has something to deliver to, and so the sender is
    // the one parked (the watchdog only runs while waiting)
    await sleep(14000);   // watchdog: >8s old, checked every 4s
    const rec4 = await TP.fbGet('rooms/' + g.code + '/outcomes/' + off.role);
    const diag4 = await off.page.evaluate(() => (window._rb2p_readDiagLog ? String(window._rb2p_readDiagLog()).slice(-300) : ''));
    console.log('  T4: server record ts=' + (rec4 && rec4.ts) + ' sent=' + ts4 + '  diag: ' + diag4.replace(/\n/g, ' | '));
    check('T4 a handoff that vanished from the server is re-sent by the delivery watchdog',
          rec4 && Number(rec4.ts) === ts4 && /DELIVERY re-send/.test(diag4),
          JSON.stringify({ rec: rec4 && rec4.ts, sent: ts4 }));

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
