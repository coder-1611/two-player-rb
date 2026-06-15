// V123: a turnover must hand the receiver the ball on the CORRECT yard line.
// The engine's _1c1 mirrors _6F into the new possessor's frame (a._6F=-a._6F),
// and buildUserDriveEndOutcome captures that post-flip value — so the sent
// yardLine IS the receiver's spot and must be applied AS-IS. This test fires a
// bare-_1c1 turnover from a known _6F and asserts the sent yardLine equals the
// engine's own post-flip placement (so as-is is right; the old negate was wrong).
module.exports = {
    name: 'turnover hands the receiver the correct yard line (V123)',
    browser: true,
    match: true,
    async run({ page }) {
        const r = await page.evaluate(() => {
            window.__sent = null;
            if (window._twoPlayer) {
                const orig = window._twoPlayer.send;
                window._twoPlayer.send = function (x) { if (x && x.type === 'INT') window.__sent = x; try { return orig.apply(this, arguments); } catch (e) {} };
            }
            const em = RB.engineState();
            em.enginePossessingTeamIdx = em.engineUserTeamIdx;
            em.engineYardLineSigned = -20;                 // thrower at opp ~20
            em.engineDriveFsmStage = 2; em.enginePriorFsmStage = 8;   // INT
            window._rb2p_userOutcomeSendInProgress = false;
            window._rb2p_userIsWaitingForOpponent = false;
            window._rb2p_lastOpponentOutcomeApplyMs = 0;
            const before6F = em.engineYardLineSigned;
            try { _1c1(em.rawEngineMatch, _Sc2); } catch (e) { return { err: e.message }; }
            const after6F = RB.engineState().engineYardLineSigned;     // engine's new-possessor placement
            const pending = window._rb2p_pendingTurnoverOutcome;       // held send (set before the 4s hold)
            const sentYard = pending ? pending.yardLine : (window.__sent ? window.__sent.yardLine : null);
            return { before6F, after6F, sentYard };
        });
        // _1c1 flips the sign; the sent yardLine must equal the engine's post-flip
        // _6F (the receiver's spot). Applied AS-IS that lands the receiver there;
        // the old negate would land them at -after6F (the wrong, thrower-frame spot).
        const flipped = (r.after6F === -r.before6F);
        const sentMatchesPlacement = (r.sentYard === r.after6F);
        const asIsCorrect = (r.sentYard === r.after6F);          // apply as-is → receiver _6F = after6F ✓
        const negateWrong = (-r.sentYard !== r.after6F);         // apply negate → wrong (unless 0)
        const pass = flipped && sentMatchesPlacement && asIsCorrect && negateWrong;
        return { pass, detail: 'before=' + r.before6F + ' afterFlip=' + r.after6F +
                               ' sent=' + r.sentYard + ' (as-is→' + r.sentYard + ', negate→' + (-r.sentYard) + ')' };
    }
};
