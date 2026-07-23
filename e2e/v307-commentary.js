// e2e/v307-commentary.js — the WAIT screen shows live spectator commentary.
//
// Feature: while the opponent is on offense, the waiting (defense) device shows
// a play-by-play ticker driven entirely by data already on the wire —
//   • base line   : down & distance + field position, from live/ (real)
//   • result line : a per-play "QB -> RCV · N YDS" with REAL names, from a new
//                    additive feed/ node written by the offense ball observer
//   • big blast   : TOUCHDOWN / INTERCEPTION / FUMBLE / PICK SIX, from outcomes/,
//                    held >= 1s so the moment lands
// and the cover is now OPAQUE. None of it touches game logic — it only renders
// on the defense device from data the offense already publishes.
//
// T1  the wait cover is fully opaque (no engine bleed-through)
// T2  the base line renders down/distance + field position from the wire
// T3  the feed controller renders real passer/receiver/yards
// T4  the big-blast fires for TD/INT/PICK6 and holds >= 1s
// T5  field-position formatting is correct from the defense POV (both halves)
// T6  the offense's live push now carries ballKp (the action hint)

const H = require('./harness');
const TP = require('./two-player');
const sleep = H.sleep;

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n))
                                : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };

(async () => {
    console.log('=== V307 WAIT-SCREEN LIVE COMMENTARY ===');
    const g = await TP.startTwoPlayerGame({});
    await sleep(5000);
    const aWait = await g.a.page.evaluate(() => window._rb2p_userIsWaitingForOpponent === true);
    const off = aWait ? g.b : g.a;   // on offense
    const def = aWait ? g.a : g.b;   // waiting / defense — the device we inspect

    // Make sure the wait cover is actually shown on the defense device.
    await def.page.evaluate(() => {
        const w = document.getElementById('rb-waiting');
        if (w) w.style.display = 'flex';
    });

    // ---- T1: opaque cover
    const t1 = await def.page.evaluate(() => {
        const w = document.getElementById('rb-waiting');
        const bg = getComputedStyle(w).backgroundColor;
        // Parse alpha (rgb(...) => opaque; rgba(...,a) => a).
        const mm = bg.match(/rgba?\(([^)]+)\)/);
        let alpha = 1;
        if (mm) { const parts = mm[1].split(',').map(s => s.trim()); if (parts.length === 4) alpha = parseFloat(parts[3]); }
        return { bg, alpha };
    });
    check('T1 the wait cover is fully opaque', t1.alpha === 1, 'bg=' + t1.bg + ' alpha=' + t1.alpha);

    // ---- T2: base line renders down & distance (from the wire). The real live/
    // push drives it every 500ms, so just assert it looks like a valid situation.
    await sleep(700);
    const t2 = await def.page.evaluate(() => document.getElementById('rb-wait-situation').textContent);
    console.log('  base line (live): "' + t2 + '"');
    check('T2 base line shows down & distance + a field spot',
          /(1ST|2ND|3RD|4TH) & (\d+|GOAL)/.test(t2) && /[A-Z]{2,3} \d+|MIDFIELD/.test(t2),
          'got "' + t2 + '"');

    // ---- T5: field-position formatting from the defense POV (both halves).
    // Test the pure formatter directly — the live push would otherwise clobber a
    // synthetic base value mid-assertion (which is the feature working).
    const t5 = await def.page.evaluate(() => ({
        myAbbr:  window._rb2p_teamAbbr(window._rb2p_myTeamUid),
        oppAbbr: window._rb2p_teamAbbr(window._rb2p_oppTeamUid),
        ownHalf: window._rb2p_fieldSpot(-23),   // offense on their own 27
        myHalf:  window._rb2p_fieldSpot(32),    // offense driven into my 18
        mid:     window._rb2p_fieldSpot(0)
    }));
    console.log('  fieldSpot(-23)=' + t5.ownHalf + '  fieldSpot(32)=' + t5.myHalf + '  fieldSpot(0)=' + t5.mid);
    check('T5 offense in MY half names my team (50-32 = 18)',
          t5.myHalf === t5.myAbbr + ' 18', 'got "' + t5.myHalf + '"');
    check('T5 offense in their OWN half names the offense (50-23 = 27)',
          t5.ownHalf === t5.oppAbbr + ' 27', 'got "' + t5.ownHalf + '"');
    check('T5 midfield renders as MIDFIELD', t5.mid === 'MIDFIELD', 'got "' + t5.mid + '"');

    // ---- T3: the feed result renders real names.
    const t3 = await def.page.evaluate(() => {
        window._rb2p_waitFeedResult({ k: 'pass', qb: 'PURDY', rcv: 'EVANS', yds: 23 });
        return null;
    });
    await sleep(200);
    const t3head = await def.page.evaluate(() => document.getElementById('rb-wait-headline').textContent);
    console.log('  headline: "' + t3head + '"');
    check('T3 result line shows "QB -> RCV · N YDS"',
          /PURDY/.test(t3head) && /EVANS/.test(t3head) && /23 YDS/.test(t3head),
          'got "' + t3head + '"');
    // Every result variant renders with the right label.
    const variant = async (evt) => {
        await def.page.evaluate((e) => window._rb2p_waitFeedResult(e), evt);
        await sleep(180);
        return def.page.evaluate(() => document.getElementById('rb-wait-headline').textContent);
    };
    const incTxt = await variant({ k: 'incomplete', qb: 'PURDY' });
    check('T3 incomplete renders as "INCOMPLETE PASS"', /INCOMPLETE PASS/.test(incTxt), 'got "' + incTxt + '"');
    const runTxt = await variant({ k: 'run', rb: 'COOK', yds: 7 });
    check('T3 RB run renders with name + "RUN"', /COOK/.test(runTxt) && /RUN/.test(runTxt) && /7 YDS/.test(runTxt), 'got "' + runTxt + '"');
    const qbRunTxt = await variant({ k: 'run', rb: 'ALLEN', yds: 3 });
    check('T3 QB run renders identically to an RB run (name + "RUN")',
          /ALLEN/.test(qbRunTxt) && /RUN/.test(qbRunTxt) && !/SCRAMBLE/.test(qbRunTxt), 'got "' + qbRunTxt + '"');
    // A "receiver" that resolves to the QB himself is a QB rush, not a scramble.
    const qbCatchTxt = await variant({ k: 'pass', qb: 'PURDY', rcv: 'PURDY', yds: 4 });
    check('T3 QB-as-nearest renders as a QB rush (not SCRAMBLES)',
          /PURDY/.test(qbCatchTxt) && /RUN/.test(qbCatchTxt) && !/SCRAMBLE/.test(qbCatchTxt), 'got "' + qbCatchTxt + '"');
    const sackTxt = await variant({ k: 'sack', qb: 'PURDY', yds: -8 });
    check('T3 sack renders with the loss', /SACKED/.test(sackTxt) && /-8/.test(sackTxt), 'got "' + sackTxt + '"');
    const fumTxt = await variant({ k: 'fumble', by: 'COOK' });
    check('T3 fumble renders "FUMBLE! LOST BY <name>"', /FUMBLE/.test(fumTxt) && /COOK/.test(fumTxt), 'got "' + fumTxt + '"');
    const lossTxt = await variant({ k: 'run', rb: 'COOK', yds: -2 });
    check('T3 a run for a loss keeps the minus sign', /-2 YDS/.test(lossTxt), 'got "' + lossTxt + '"');

    // ---- T4: the big blast fires and holds >= 1s.
    const startBlast = Date.now();
    await def.page.evaluate(() => window._rb2p_waitFeedBig('TD', 'Touchdown.'));
    await sleep(150);
    const blastOn = await def.page.evaluate(() => {
        const b = document.getElementById('rb-wait-blast');
        return { shown: getComputedStyle(b).display !== 'none',
                 text: document.getElementById('rb-wait-blast-text').textContent };
    });
    check('T4 TD blast is visible', blastOn.shown && /TOUCHDOWN/.test(blastOn.text),
          'shown=' + blastOn.shown + ' text=' + blastOn.text);
    // Still visible at ~900ms (proves the >=1s hold).
    await sleep(800);
    const blastMid = await def.page.evaluate(() =>
        getComputedStyle(document.getElementById('rb-wait-blast')).display !== 'none');
    check('T4 blast still held ~900ms later (>= 1s hold)', blastMid,
          'blast cleared before 1s (held ' + (Date.now() - startBlast) + 'ms)');
    // Gone well after the hold window (TD holds ~2.4s in the arena design).
    await sleep(2100);
    const blastGone = await def.page.evaluate(() =>
        getComputedStyle(document.getElementById('rb-wait-blast')).display === 'none');
    check('T4 blast clears after its hold window', blastGone, 'blast never cleared');
    // INT and PICK6 map to the defense-favourable colour/text. The blast text is
    // repainted on the 120ms render loop, so wait a tick before reading the DOM.
    // Clear any fumble stamp from the T3 variants first (a fumble within 5s would
    // legitimately re-label an INT as FUMBLE — tested separately below).
    await def.page.evaluate(() => { window._rb2p_lastFumbleMs = 0; });
    await def.page.evaluate(() => window._rb2p_waitFeedBig('INT', 'Intercepted.'));
    await sleep(200);
    const intBlast = await def.page.evaluate(() => document.getElementById('rb-wait-blast-text').textContent);
    check('T4 INT maps to an INTERCEPTED blast', /INTERCEPT/.test(intBlast), 'got "' + intBlast + '"');
    await def.page.evaluate(() => window._rb2p_waitFeedBig('PICK6', 'Pick six.'));
    await sleep(200);
    const p6Blast = await def.page.evaluate(() => document.getElementById('rb-wait-blast-text').textContent);
    check('T4 PICK6 maps to a PICK 6 blast', /PICK ?6/.test(p6Blast), 'got "' + p6Blast + '"');
    // A fumble ships as an INT-typed outcome; a recent fumble feed must re-label
    // that blast FUMBLE (not INTERCEPTED).
    const fumBlast = await def.page.evaluate(() => {
        window._rb2p_waitFeedResult({ k: 'fumble', by: 'COOK' });   // stamps lastFumbleMs
        window._rb2p_waitFeedBig('INT', 'Interception.');           // the bucketed turnover
        return document.getElementById('rb-wait-blast-text').textContent;
    });
    await sleep(200);
    const fumBlast2 = await def.page.evaluate(() => document.getElementById('rb-wait-blast-text').textContent);
    check('T4 a turnover just after a fumble blasts FUMBLE, not INTERCEPTED',
          /FUMBLE/.test(fumBlast2), 'got "' + fumBlast2 + '"');

    // ---- T6: the offense's live push now carries ballKp.
    // Read the offense device's own live payload shape via the wire.
    await sleep(1200);   // let a live push happen
    const live = await TP.fbGet('rooms/' + g.code + '/live/' + off.role);
    console.log('  offense live payload keys: ' + (live ? Object.keys(live).join(',') : 'null'));
    check('T6 live push includes ballKp', live && typeof live.ballKp === 'number',
          'ballKp=' + (live && live.ballKp));

    // ---- Integration sanity: the offense QB name resolves from the roster.
    const qb = await off.page.evaluate(() => window._rb2p_offQbName());
    console.log('  offense QB surname: ' + qb);
    check('offense QB name resolves (not the fallback)', qb && qb !== 'QB', 'got "' + qb + '"');

    // ---- V326 CLASSIFIER UNIT TESTS: _rb2p_classifyPlay is pure — it decides
    // the play TYPE purely from the box-stat deltas passed in. Drive it directly
    // with synthetic signals (no engine needed) to prove every branch.
    const cls = await off.page.evaluate(() => {
        const C = window._rb2p_classifyPlay;
        const base = { qbName: 'PURDY' };
        const j = o => JSON.stringify(C(Object.assign({}, base, o)));
        return {
            sack:        j({ sawSack: true }),
            passBoth:    j({ qbPassDelta: 11, rcvName: 'EVANS' }),         // QB threw, receiver caught
            passRcvOnly: j({ qbPassDelta: 0,  rcvName: 'COOK' }),          // only the receiver got credited
            passQbOnly:  j({ qbPassDelta: 6,  rcvName: '', catchName: '' }),// only QB passing moved
            passQbCatch: j({ qbPassDelta: 6,  rcvName: '', catchName: 'PURDY' }), // catch name IS the QB
            passShort:   j({ qbPassDelta: 0.4, rcvName: 'AIYUK' }),        // tiny gain, still a pass
            runRB:       j({ runName: 'COOK' }),                           // a handoff
            runQB:       j({ qbRushAttDelta: 1 }),                         // a scramble
            incomplete:  j({ threw: true }),                              // thrown, no credit
            nothing:     j({})                                            // dead-ball fallback
        };
    });
    console.log('  classifyPlay: ' + JSON.stringify(cls, null, 0));
    check('U1 a sack is a sack', /"k":"sack"/.test(cls.sack), cls.sack);
    check('U2 QB passing + receiver credit = pass to that receiver',
          /"k":"pass"/.test(cls.passBoth) && /"rcv":"EVANS"/.test(cls.passBoth), cls.passBoth);
    check('U3 receiver receiving-yards alone = pass to that receiver',
          /"k":"pass"/.test(cls.passRcvOnly) && /"rcv":"COOK"/.test(cls.passRcvOnly), cls.passRcvOnly);
    check('U4 QB passing alone (no named catcher) = pass with empty rcv (renders COMPLETE)',
          /"k":"pass"/.test(cls.passQbOnly) && /"rcv":""/.test(cls.passQbOnly), cls.passQbOnly);
    check('U5 a QB-valued catch name is NEVER the receiver (no pass QB→QB)',
          /"k":"pass"/.test(cls.passQbCatch) && !/"rcv":"PURDY"/.test(cls.passQbCatch), cls.passQbCatch);
    check('U6 a SHORT completion (tiny receiving gain) is still a pass',
          /"k":"pass"/.test(cls.passShort) && /"rcv":"AIYUK"/.test(cls.passShort), cls.passShort);
    check('U7 a non-QB carry is a run named for that back',
          /"k":"run"/.test(cls.runRB) && /"rb":"COOK"/.test(cls.runRB), cls.runRB);
    check('U8 a QB carry is a run named for the QB (a scramble)',
          /"k":"run"/.test(cls.runQB) && /"rb":"PURDY"/.test(cls.runQB), cls.runQB);
    check('U9 a thrown ball with no catch credit is incomplete',
          /"k":"incomplete"/.test(cls.incomplete), cls.incomplete);
    check('U10 nothing credited + no throw falls back to a QB keep (run)',
          /"k":"run"/.test(cls.nothing) && /"rb":"PURDY"/.test(cls.nothing), cls.nothing);

    // A shared page-side helper: baseline EVERY roster slot's box stats into
    // _rb2p_feedStat0 (what the V326 snap latch captures), arm the settle flags,
    // and set the yard/down snap so the next _6F/_t11 move settles the play.
    // Returns the rawEngineMatch + roster handle + count so each test can bump
    // specific stats. Registered on window so every evaluate can call it.
    await off.page.evaluate(() => {
        window.__v307setup = function () {
            window._rb2p_userIsWaitingForOpponent = false;
            var m = RB.engineState().rawEngineMatch;
            var to = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
            var n = _wi(to._Ln);
            var s0 = {};
            for (var j = 0; j < n; j++) { var pj = _zi(to._Ln, j); if (pj) s0[j] = {
                pos: Number(_Ai(pj, 'position')) || 0,
                py:  Number(_Ai(pj, 'stat_yards')) || 0,
                ra:  Number(_Ai(pj, 'stat_rush_attempts')) || 0 }; }
            window._rb2p_feedStat0 = s0;
            window._rb2p_feedThrew = false; window._rb2p_feedSawSack = false;
            window._rb2p_feedWasLive = true; window._rb2p_feedEmitted = false;
            window._rb2p_feedCatchName = '';
            window._rb2p_feedYard0 = Number(m._6F); window._rb2p_feedDown0 = Number(m._t11);
            return { m: m, to: to, n: n };
        };
    });

    // ---- T7: an RB carry names the RB, not the QB. The reported bug ("RB runs
    // show up as QB runs") came from the ball-holder wearing the QB struct at the
    // tackle. V326 classifies off the box-stat delta: the non-QB whose rush
    // attempt bumped is the carrier. Bump a real RB's carry stat and confirm.
    const t7 = await off.page.evaluate(async () => {
        var ctx = window.__v307setup(), m = ctx.m, to = ctx.to, n = ctx.n;
        var rp = null, name = '';
        for (var i = 0; i < n; i++) {
            var p = _zi(to._Ln, i);
            if (p && Number(_Ai(p, 'position')) === 2) { rp = p; name = String(_Ai(p, 'lname') || '').toUpperCase(); break; }
        }
        if (!rp) return { err: 'no RB in roster' };
        _Yi(rp, 'stat_rush_attempts', (Number(_Ai(rp, 'stat_rush_attempts')) || 0) + 1);   // the RB carried
        m._6F = Number(m._6F) + 4; m._t11 = Number(m._t11) + 1;                            // gained 4, down advances
        await new Promise(function (r) { setTimeout(r, 700); });
        return { name: name, qb: window._rb2p_offQbName() };
    });
    if (t7.err) {
        check('T7 stat-driven RB run naming', false, t7.err);
    } else {
        const feed = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
        console.log('  RB=' + t7.name + ' QB=' + t7.qb + '  feed=' + JSON.stringify(feed));
        check('T7 a carry is emitted as a run for the RB (not the QB)',
              feed && feed.k === 'run' && feed.rb === t7.name && feed.rb !== t7.qb && Number(feed.yds) === 4,
              'feed=' + JSON.stringify(feed) + ' (RB should be ' + t7.name + ', not QB ' + t7.qb + ')');
    }

    // ---- T7b: the RB is named even when the QB's ABSOLUTE carry count is higher
    // (the reported "after a QB run, even RB runs show as QB"). The delta is per-
    // play against the snap baseline, so a QB elevated by an EARLIER scramble
    // (baked into the baseline) can't win a later RB carry.
    const t7b = await off.page.evaluate(async () => {
        window._rb2p_userIsWaitingForOpponent = false;
        var to0 = (function () { var c = _si(64); for (var k in c) if (c.hasOwnProperty(k)) return c[k]; })();
        var n0 = _wi(to0._Ln), rbP = null, qbP = null, rbName = '', qbName = '';
        for (var i = 0; i < n0; i++) {
            var p = _zi(to0._Ln, i); if (!p) continue;
            var pos = Number(_Ai(p, 'position'));
            if (pos === 1 && !qbP) { qbP = p; qbName = String(_Ai(p, 'lname') || '').toUpperCase(); }
            if (pos === 2 && !rbP) { rbP = p; rbName = String(_Ai(p, 'lname') || '').toUpperCase(); }
        }
        if (!rbP || !qbP) return { err: 'need both QB and RB' };
        // QB elevated by a prior scramble BEFORE the baseline is taken.
        var rbC = Number(_Ai(rbP, 'stat_rush_attempts')) || 0;
        _Yi(qbP, 'stat_rush_attempts', rbC + 5);
        var m = window.__v307setup().m;   // baseline now captures the QB's elevated count
        _Yi(rbP, 'stat_rush_attempts', rbC + 1);   // this play: only the RB carries (+1 vs baseline)
        m._6F = Number(m._6F) + 6; m._t11 = Number(m._t11) + 1;
        await new Promise(function (r) { setTimeout(r, 700); });
        return { rbName: rbName, qbName: qbName };
    });
    if (t7b.err) {
        check('T7b RB run named RB despite QB having a higher total', false, t7b.err);
    } else {
        const feed = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
        console.log('  QB(higher total)=' + t7b.qbName + ' RB(carried)=' + t7b.rbName + '  feed=' + JSON.stringify(feed));
        check('T7b RB run named RB despite QB having a higher total carry count',
              feed && feed.k === 'run' && feed.rb === t7b.rbName && feed.rb !== t7b.qbName,
              'feed=' + JSON.stringify(feed) + ' (should name RB ' + t7b.rbName + ', not QB ' + t7b.qbName + ')');
    }

    // ---- T7c: a completion the fork failed to credit a receiver for (only the
    // QB's passing yards moved) must render "<QB> COMPLETE" — NEVER "pass QB→QB"
    // (the VJYC bug the renderer turned into "Purdy runs"). Bump ONLY the QB's
    // passing stat and set the catch name to the QB himself.
    const t7c = await off.page.evaluate(async () => {
        var ctx = window.__v307setup(), m = ctx.m, to = ctx.to, n = ctx.n;
        var qb = window._rb2p_offQbName(), qbP = null;
        for (var i = 0; i < n; i++) { var p = _zi(to._Ln, i); if (p && Number(_Ai(p, 'position')) === 1) { qbP = p; break; } }
        _Yi(qbP, 'stat_yards', (Number(_Ai(qbP, 'stat_yards')) || 0) + 9);   // QB threw for 9, receiver uncredited
        window._rb2p_feedCatchName = qb;                                     // nearest-at-catch resolved to the QB
        m._6F = Number(m._6F) + 9; m._t11 = Number(m._t11) + 1;
        await new Promise(function (r) { setTimeout(r, 700); });
        return { qb: qb };
    });
    {
        const feed = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
        console.log('  QB=' + t7c.qb + '  feed=' + JSON.stringify(feed));
        check('T7c a QB-passing-only completion is a PASS with no QB receiver (never pass QB→QB)',
              feed && feed.k === 'pass' && feed.rcv !== t7c.qb,
              'feed=' + JSON.stringify(feed) + ' (must be a pass, rcv != ' + t7c.qb + ')');
    }

    // ---- T9: a completion — the receiver's RECEIVING yards (stat_yards on a
    // non-QB) go up — is a PASS named QB→receiver, with the _6F-delta yardage.
    const t9 = await off.page.evaluate(async () => {
        var ctx = window.__v307setup(), m = ctx.m, to = ctx.to, n = ctx.n;
        var qbP = null, rcv = null;
        for (var i = 0; i < n; i++) {
            var p = _zi(to._Ln, i); if (!p) continue;
            if (Number(_Ai(p, 'position')) === 1 && !qbP) qbP = p;
            else if (Number(_Ai(p, 'position')) !== 1 && !rcv) rcv = p;
        }
        var rcvName = String(_Ai(rcv, 'lname') || '').toUpperCase();
        _Yi(qbP, 'stat_yards', (Number(_Ai(qbP, 'stat_yards')) || 0) + 7);   // QB passing +7
        _Yi(rcv, 'stat_yards', (Number(_Ai(rcv, 'stat_yards')) || 0) + 7);   // receiver receiving +7
        m._6F = Number(m._6F) + 7; m._t11 = Number(m._t11) + 1;
        await new Promise(function (r) { setTimeout(r, 700); });
        return { rcv: rcvName };
    });
    {
        const feed = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
        console.log('  rcv=' + t9.rcv + '  feed=' + JSON.stringify(feed));
        check('T9 a completion (receiver yards up) is a PASS named QB→receiver with _6F-delta yards',
              feed && feed.k === 'pass' && feed.rcv === t9.rcv && Number(feed.yds) === 7,
              'feed=' + JSON.stringify(feed) + ' (expect pass → ' + t9.rcv + ', yds 7)');
    }

    // ---- T9b: a SHORT completion — the receiver right next to the QB, tiny gain
    // — is still a PASS, not a run. This is THE reported bug: "short passes to
    // receivers count as QB runs." Only the receiver's receiving yards move (+2);
    // the old nearest-player heuristic saw the QB at the catch and said "QB run."
    const t9b = await off.page.evaluate(async () => {
        var ctx = window.__v307setup(), m = ctx.m, to = ctx.to, n = ctx.n;
        var qbP = null, rcv = null;
        for (var i = 0; i < n; i++) {
            var p = _zi(to._Ln, i); if (!p) continue;
            if (Number(_Ai(p, 'position')) === 1 && !qbP) qbP = p;
            else if (Number(_Ai(p, 'position')) !== 1 && !rcv) rcv = p;
        }
        var rcvName = String(_Ai(rcv, 'lname') || '').toUpperCase();
        _Yi(qbP, 'stat_yards', (Number(_Ai(qbP, 'stat_yards')) || 0) + 2);   // QB passing +2
        _Yi(rcv, 'stat_yards', (Number(_Ai(rcv, 'stat_yards')) || 0) + 2);   // receiver receiving +2
        window._rb2p_feedCatchName = window._rb2p_offQbName();               // QB was nearest at the (short) catch
        m._6F = Number(m._6F) + 2; m._t11 = Number(m._t11) + 1;
        await new Promise(function (r) { setTimeout(r, 700); });
        return { rcv: rcvName };
    });
    {
        const feed = await TP.fbGet('rooms/' + g.code + '/feed/' + off.role);
        console.log('  short-completion rcv=' + t9b.rcv + '  feed=' + JSON.stringify(feed));
        check('T9b a SHORT completion (receiver next to the QB) is still a PASS, not a QB run',
              feed && feed.k === 'pass' && feed.rcv === t9b.rcv,
              'feed=' + JSON.stringify(feed) + ' (must be pass → ' + t9b.rcv + ', not a run)');
    }

    // ---- T8: the big-event blast is a STANDALONE overlay (not a child of the
    // wait cover), so an interception's blast survives the flip to offense.
    const t8 = await def.page.evaluate(() => {
        const blast = document.getElementById('rb-wait-blast');
        const wait = document.getElementById('rb-waiting');
        return {
            childOfWait: !!(blast && wait && wait.contains(blast)),
            fixed: blast ? getComputedStyle(blast).position : null,
            passThrough: blast ? getComputedStyle(blast).pointerEvents : null
        };
    });
    check('T8 the blast is NOT nested inside the wait cover', t8.childOfWait === false,
          'blast is a child of the wait overlay (would vanish on the possession flip)');
    check('T8 the blast is a fixed, click-through overlay',
          t8.fixed === 'fixed' && t8.passThrough === 'none',
          'position=' + t8.fixed + ' pointer-events=' + t8.passThrough);
    // Fire an INT blast, then HIDE the wait cover (what an interception does), and
    // confirm the blast is still visible.
    const t8b = await def.page.evaluate(async () => {
        window._rb2p_lastFumbleMs = 0;
        window._rb2p_waitFeedBig('INT', 'Intercepted.');
        document.getElementById('rb-waiting').style.display = 'none';   // flip to offense
        await new Promise(r => setTimeout(r, 250));
        const b = document.getElementById('rb-wait-blast');
        return { shown: getComputedStyle(b).display !== 'none',
                 text: document.getElementById('rb-wait-blast-text').textContent };
    });
    check('T8 the INT blast still shows after the wait cover hides',
          t8b.shown && /INTERCEPT/.test(t8b.text),
          'shown=' + t8b.shown + ' text="' + t8b.text + '" (the pick blast must survive the flip)');

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
