// scenario — paste into the browser console during a 2P match, on the device
// that is ON OFFENSE. Builds a specific game situation: quarter, clock, score,
// and field position, with a live drive spawned and ready to snap.
//
//   rb2pScenario()                       // default: the onside-kick test setup
//   rb2pScenario({ oppYard: 1 })         // 1st & goal at the opponent's 1
//   rb2pScenario({ ownYard: 20, down: 3, toGo: 7, q: 2, min: 1, sec: 30 })
//   rb2pScenario({ myScore: 14, oppScore: 21 })
//
// Options (all optional):
//   q        quarter (default 4)
//   min,sec  clock remaining (default 1:00)
//   myScore, oppScore   scoreboard — see the SCORES note below
//   oppYard  yards from the OPPONENT's goal line  (1 = their 1, about to score)
//   ownYard  yards from YOUR OWN goal line        (25 = your own 25)
//   down, toGo          default 1st & goal-to-go / 1st & 10
//
// FIELD POSITION: the engine stores _6F as the SIGNED distance from midfield —
// your own 25 is -25, the opponent's 2 is +48. This converts for you, so you can
// think in yard lines.
//
// SCORES: the live mirror rejects score REGRESSIONS (a score never goes down in
// football), so LOWERING your score here will be undone by the opponent's next
// push. To create a deficit, RAISE the opponent's score instead of lowering
// yours. The script warns if you ask for a decrease.
//
// DEFAULT PRESET — reproduces the exact situation the onside-kick modal used to
// appear in (removed in V299), so you can confirm on a real device that scoring
// now just proceeds to a normal kickoff:
//   Q4, 1:00 left, you trail 13-21, 1st & goal at the opponent's 1.
//   Punch it in -> 19, PAT -> 20, still losing with under 100s: the old build
//   popped "ONSIDE KICK?" here and broke the match.
(function () {
    function scenario(opts) {
        opts = opts || {};
        var m = RB.engineState();
        if (!m || m.engineUserTeamIdx == null) {
            console.warn('[scenario] not in a match yet');
            return;
        }

        // ---- quarter + clock ----
        var q   = opts.q   != null ? opts.q   : 4;
        var min = opts.min != null ? opts.min : 1;
        var sec = opts.sec != null ? opts.sec : 0;
        // The V295 quarter governor clamps any jump beyond (last stable + 1) to
        // stop burst rolls from eating a quarter. Declare this jump as intended
        // by moving its baselines too, the same way a wire-authoritative quarter
        // write does — otherwise asking for Q4 from Q1 lands you in Q2.
        window._rb2p_lastStableQuarter = q;
        window._rb2p_wireQuarter       = q;
        window._rb2p_qGovPrevQ         = q;
        m.engineQuarter       = q;
        m.engineMinutesLeft   = min;
        m.engineSecondsLeft   = sec;
        m.engineTickAllowance = 0;

        // ---- scoreboard ----
        var myScore  = opts.myScore  != null ? opts.myScore  : 13;
        var oppScore = opts.oppScore != null ? opts.oppScore : 21;
        if (myScore < m.userScore || oppScore < m.opponentScore) {
            console.warn('[scenario] asking to LOWER a score (' +
                         m.userScore + '-' + m.opponentScore + ' -> ' +
                         myScore + '-' + oppScore + '). The live mirror rejects ' +
                         'regressions, so the opponent will push it back. Raise ' +
                         'the other side instead.');
        }
        m.setUserScore(myScore);
        m.setOpponentScore(oppScore);
        // Keep the pick-6 score watcher from reading this as a defensive TD.
        if (window._rb2p_notePick6BaselineSync) window._rb2p_notePick6BaselineSync();

        // ---- field position ----
        // _6F is the signed distance from midfield: opponent's N = 50 - N,
        // your own N = -(50 - N).
        var yard;
        if (opts.ownYard != null)      yard =  -(50 - Number(opts.ownYard));
        else if (opts.oppYard != null) yard =    50 - Number(opts.oppYard);
        else                           yard =    49;          // opponent's 1
        if (yard < -50) yard = -50;
        if (yard >  50) yard =  50;

        // ---- take possession and spawn a live drive at that spot ----
        window._rb2p_userIsWaitingForOpponent  = false;
        window._rb2p_userOutcomeSendInProgress = false;
        window._rb2p_lastOpponentOutcomeApplyMs = Date.now();
        var spawned = true;
        if (typeof window._rb2p_forceUserOffenseDrive === 'function') {
            spawned = window._rb2p_forceUserOffenseDrive(yard) !== false;
        } else {
            m.enginePossessingTeamIdx = m.engineUserTeamIdx;
            m.engineYardLineSigned    = yard;
            m.engineDriveFsmStage     = 2;
            m.engineControllerState   = 2;
        }

        // ---- down & distance ----
        // Inside the 10 it is goal-to-go, so the default distance is the
        // distance to the goal line, not 10.
        var toGoal = 50 - Math.abs(yard);
        var isOppHalf = yard > 0;
        var down = opts.down != null ? opts.down : 1;
        var toGo = opts.toGo != null ? opts.toGo
                 : (isOppHalf && toGoal < 10 ? toGoal : 10);
        m.engineDownNumber = down;
        m.engineYardsToGo  = toGo;

        // ---- V298: re-sync the PIXEL scrimmage + first-down marker ----
        // The engine scores each play as (ballX - _B01)/20 and only refreshes
        // _B01/_vb1 inside s_set_up_play. Down & distance were written after the
        // spawn, so without this the very first snap would invent yardage
        // (the "1st & 10 -> incomplete pass -> 2nd & 2" bug).
        if (typeof window._rb2p_resyncScrimmage === 'function') {
            window._rb2p_resyncScrimmage(m, 'scenario');
        }

        var where = isOppHalf ? ("opponent's " + toGoal) : ('own ' + toGoal);
        console.log('[scenario] Q' + q + ' ' + min + ':' + ('0' + sec).slice(-2) +
                    '  ' + myScore + '-' + oppScore +
                    '  ' + down + ' & ' + toGo + ' at the ' + where +
                    '  (_6F ' + yard + ')' +
                    (spawned ? '' : '  — WARNING: drive spawn failed, re-run'));
        return { q: q, min: min, sec: sec, myScore: myScore, oppScore: oppScore,
                 yard: yard, down: down, toGo: toGo, spawned: spawned };
    }

    window.rb2pScenario = scenario;
    scenario();   // run the default preset immediately on paste
})();
