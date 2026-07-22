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
    check('T3 QB run renders with the QB name + "RUN"', /ALLEN/.test(qbRunTxt) && /RUN/.test(qbRunTxt), 'got "' + qbRunTxt + '"');
    const scrTxt = await variant({ k: 'scramble', qb: 'PURDY', yds: 12 });
    check('T3 scramble renders', /PURDY/.test(scrTxt) && /SCRAMBLES/.test(scrTxt), 'got "' + scrTxt + '"');
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
    // Gone well after the hold window.
    await sleep(1400);
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
    check('T4 PICK6 maps to a PICK SIX blast', /PICK SIX/.test(p6Blast), 'got "' + p6Blast + '"');
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

    await g.cleanup();
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
