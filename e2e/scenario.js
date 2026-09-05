// e2e/scenario.js — a "director" for the two-player sim. It drives the live
// engine on either bot page into a chosen state DETERMINISTICALLY, so scenarios
// you'd otherwise have to wait for (and that the bots can't reliably produce —
// end-of-quarter possession, turnovers, touchdowns, overtime) become one-liners.
//
// Everything operates on a puppeteer `page` (use game.a.page / game.b.page from
// two-player.js). The director reads/writes through the same RB.engineState()
// façade the bridge uses, and fires the REAL possession-change path (_1c1) so it
// exercises the actual bridge outcome pipeline rather than faking results.
//
// Typical use:
//   const TP = require('./two-player'), D = require('./scenario');
//   const game = await TP.startTwoPlayerGame();
//   const off  = await D.offensePage(game);          // whichever bot has the ball
//   await D.setClock(off, { q: 1, min: 0, sec: 3 }); // <-- manually choose a time
//   await D.forceTurnover(off);                       // hand it to the other bot
//   ... assert with D.state(...) ...
//   await game.cleanup();

const H = require('./harness');

// ---- Read: a rich, side-effect-free snapshot of one device's game state. ----
async function state(page) {
    return page.evaluate(() => {
        let s = {};
        try { s = RB.engineState() || {}; } catch (e) {}
        const inst = (typeof _Sc2 !== 'undefined' && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
        let ball = 0, players = 0, buttons = 0;
        for (const x of inst) {
            if (!x || x._HL2 || !x._eE2 || !x._eE2._fE2) continue;
            const n = x._eE2._fE2;
            if (n === 'obj_ball') ball++;
            else if (n === 'obj_player') players++;
            if (/btn|button/.test(n)) buttons++;
        }
        const fin = document.getElementById('rb-final');
        return {
            inMatch: (() => { try { return RB.isEngineInMatchRoom() === true; } catch (e) { return false; } })(),
            role: ((document.getElementById('rb-you-role') || {}).textContent || '').trim().toLowerCase(),
            quarter: s.engineQuarter, min: s.engineMinutesLeft, sec: s.engineSecondsLeft,
            down: s.engineDownNumber, toGo: s.engineYardsToGo, yard: Math.round(Number(s.engineYardLineSigned)),
            kp: s.engineControllerState, vy: s.engineDriveFsmStage,
            userScore: s.userScore, oppScore: s.opponentScore,
            possByUser: s.enginePossessingTeamIdx === s.engineUserTeamIdx,
            waiting: window._rb2p_userIsWaitingForOpponent === true,
            inOvertime: window._rb2p_inOvertime === true,
            gameOver: window._rb2p_gameOverReported === true,
            finalShown: !!(fin && fin.style.display !== 'none'),
            ball, players, buttons
        };
    });
}

// ---- Pick the page that currently has the ball (offense) / is waiting. ----
async function offensePage(game, timeoutMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const a = await state(game.a.page), b = await state(game.b.page);
        if (a.inMatch && b.inMatch) {
            if (!a.waiting) return game.a.page;
            if (!b.waiting) return game.b.page;
        }
        await H.sleep(400);
    }
    throw new Error('no offense page within timeout');
}
function otherPage(game, page) { return page === game.a.page ? game.b.page : game.a.page; }

// ---- Write: manually choose the time / score / ball spot. ----
async function setClock(page, { q, min, sec } = {}) {
    return page.evaluate(({ q, min, sec }) => {
        const s = RB.engineState(); if (!s) return false;
        if (window._rb2p_clockLicence) window._rb2p_clockLicence('scenario setClock');   // V382: a director's write is licensed
        if (q != null) s.engineQuarter = q;
        if (min != null) s.engineMinutesLeft = min;
        if (sec != null) s.engineSecondsLeft = sec;
        s.engineTickAllowance = 0;
        return true;
    }, { q, min, sec });
}
async function setScore(page, { user, opp } = {}) {
    return page.evaluate(({ user, opp }) => {
        const s = RB.engineState(); if (!s) return false;
        if (user != null && s.setUserScore) s.setUserScore(user);
        if (opp != null && s.setOpponentScore) s.setOpponentScore(opp);
        return true;
    }, { user, opp });
}
async function setBall(page, { yard, down, toGo } = {}) {
    return page.evaluate(({ yard, down, toGo }) => {
        const s = RB.engineState(); if (!s) return false;
        if (yard != null) s.engineYardLineSigned = yard;
        if (down != null) s.engineDownNumber = down;
        if (toGo != null) s.engineYardsToGo = toGo;
        return true;
    }, { yard, down, toGo });
}

// ---- Scenario triggers (fire the REAL bridge paths). ----
// Drive-end types map to the engine's priorFsmStage the bridge classifies:
//   INT/DOWNS/FUMBLE -> 8 (turnover)   TD -> 9   FG -> 14   PUNT -> 12
const DRIVE_END_VY = { INT: 8, DOWNS: 8, FUMBLE: 8, TURNOVER: 8, TD: 9, FG: 14, PUNT: 12 };

// Force the page that has the ball to end its drive as `type`, firing the engine's
// bare _1c1 (s_change_possession) so the bridge builds + sends the real outcome
// and possession transfers to the other device.
async function forceDriveEnd(page, type = 'INT') {
    const vy = DRIVE_END_VY[String(type).toUpperCase()] || 8;
    return page.evaluate((vy) => {
        const s = RB.engineState(); if (!s) return 'no state';
        s.enginePossessingTeamIdx = s.engineUserTeamIdx;     // we must hold the ball to give it up
        s.engineDriveFsmStage = 2; s.enginePriorFsmStage = vy;
        window._rb2p_userOutcomeSendInProgress = false;
        window._rb2p_userIsWaitingForOpponent = false;
        window._rb2p_lastOpponentOutcomeApplyMs = 0;          // bypass the post-receive cooldown
        try { _1c1(s.rawEngineMatch, _Sc2); return true; }
        catch (e) { return String(e); }
    }, vy);
}
const forceTurnover = (page) => forceDriveEnd(page, 'INT');

// Add points to one side (deterministic scenario setup — NOT shipped behavior).
// side: 'user' | 'opp'. Pairs with setClock for "tie at end of Q4 -> OT" setups.
async function addPoints(page, side, points) {
    return page.evaluate(({ side, points }) => {
        const s = RB.engineState(); if (!s) return false;
        if (side === 'user') s.setUserScore((Number(s.userScore) || 0) + points);
        else s.setOpponentScore((Number(s.opponentScore) || 0) + points);
        return true;
    }, { side, points });
}

// Jump to the end of the current quarter (the active play then rolls it over).
async function endOfQuarter(page, sec = 2) { return setClock(page, { min: 0, sec }); }

// Freeze / unfreeze the in-page autoplay bot so it doesn't snap and undo a
// scenario while the director is setting it up. Pause BOTH pages around any
// multi-step setup, then resume.
async function pauseBot(page)  { return page.evaluate(() => { window._rb2p_botPaused = true; }); }
async function resumeBot(page) { return page.evaluate(() => { window._rb2p_botPaused = false; }); }
async function pauseBoth(game)  { await pauseBot(game.a.page); await pauseBot(game.b.page); }
async function resumeBoth(game) { await resumeBot(game.a.page); await resumeBot(game.b.page); }

// ---- Wait for a condition on a page (predicate runs in the page). ----
async function waitFor(page, pred, ms = 15000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        let v = false;
        try { v = await page.evaluate(pred); } catch (e) {}
        if (v) return true;
        await H.sleep(300);
    }
    return false;
}
// Convenience: wait until `state(page)` satisfies fn(s).
async function waitForState(page, fn, ms = 15000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        const s = await state(page);
        try { if (fn(s)) return s; } catch (e) {}
        await H.sleep(400);
    }
    return null;
}

module.exports = {
    state, offensePage, otherPage,
    setClock, setScore, setBall,
    forceDriveEnd, forceTurnover, addPoints, endOfQuarter,
    pauseBot, resumeBot, pauseBoth, resumeBoth,
    waitFor, waitForState, DRIVE_END_VY
};
