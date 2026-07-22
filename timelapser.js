// timelapser — paste into the browser console during a 2P match.
// Jumps the clock to Q4 with 0:02 left; run one play to end the 3rd quarter.
//
// For a full situation (score + field position + a live drive) use scenario.js.
(function () {
  var m = RB.engineState();
  // The V295 quarter governor clamps any jump beyond (last stable + 1), so a
  // bare `engineQuarter = 4` from Q1 lands in Q2. Move its baselines too, the
  // same way a wire-authoritative quarter write does.
  window._rb2p_lastStableQuarter = 4;
  window._rb2p_wireQuarter       = 4;
  window._rb2p_qGovPrevQ         = 4;
  m.engineQuarter      = 4;
  m.engineMinutesLeft  = 0;
  m.engineSecondsLeft  = 2;
  m.engineTickAllowance = 0;
  console.log('clock set → Q' + m.engineQuarter + ' ' +
              m.engineMinutesLeft + ':' + ('0' + m.engineSecondsLeft).slice(-2) +
              ' (run one play to end Q4)');
})();
