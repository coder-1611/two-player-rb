// tools/latch-registry.js — the latch registry (NEVER-FREEZE Phase 2, property 1). Checked by
// tools/latch-check.js on every run of the suite.
//
// BLOCKING: state that can hold up a snap (or a drive being staged), a hand-off, a conversion (the
// 1 PT / 2 PT modal or the try) or the stats screen. Two kinds, never mixed up (the v2 review #17):
//   guard       a lock or a window that protects something; it may be cleared by a recovery, and it has
//               a deadline after which it gives way on its own
//   obligation  something owed to the game (a held hand-off, an owed conversion, the final); it is
//               never reset — it resolves only by being done (or by the rule that settles it)
// Every blocking entry says who owns it, where it is set and cleared, its longest legitimate life, and
// what happens past that. `open` marks a deadline that is decided but not yet enforced in the code.
//
// NON-BLOCKING: everything else the check finds, each with its own reason (no blanket entries).
//
// Keys: window._rb2p_X (window state), var:X (a closure variable), storage:X (session/local storage key,
// or its literal prefix), room:X (rooms/{code}/X in the database), derived:/queue: (not a single name).
'use strict';
const e = (kind, owner, set, clear, max, expiry, open) => ({ kind, owner, set, clear, max, expiry, open: open || null });

const blocking = {
    // ---------------------------------------------------------------- hand-offs
    'queue:_twoPlayer.pending': e('obligation', 'hand-off receive', 'receive() queues an inbound hand-off (SDK or REST)', 'the drain while parked; PICK6 while live; the moot purge at my own hand-off; the played-past purge',
        'until applied or resolved as moot', 'V422 recovery authority APPLY at T_ACT (4s) when parked'),
    'window._rb2p_deferredOutcome': e('obligation', 'hand-off receive', 'a hand-off that arrived while the page could not stage (hidden, fps 0)', 'drained when frames return; TURN-RESCUE drain; the authority APPLY',
        'while the page cannot stage', 'drained 400ms after visible; the authority APPLY at T_ACT'),
    'window._rb2p_deferredOutcomeSinceMs': e('obligation', 'hand-off receive', 'with _rb2p_deferredOutcome', 'with _rb2p_deferredOutcome', '25s screen-on', 'the drain wall (V363)'),
    'window._rb2p_pendingTurnoverOutcome': e('obligation', 'hand-off send', 'every drive end is held 4s (the pick-six upgrade window)', 'the hold timer sends it; the PICK6 upgrade cancels it',
        '4s, up to 12s while a TD replay may upgrade it', 'the timer ships it', 'a reload inside the hold loses it (the v2 review #7): persist it'),
    'window._rb2p_pendingTurnoverSendTimer': e('obligation', 'hand-off send', 'with the hold', 'at the send or the upgrade', '12s', 'fires the send'),
    'window._rb2p_pendingTurnoverHeldMs': e('obligation', 'hand-off send', 'with the hold', 'at the send', '12s', 'the delivery watchdog (V354)'),
    'window._rb2p_lastSentOutcome': e('obligation', 'hand-off send', 'every send', 'the delivery watchdog clears it once the server has it', '90s', 'the DELIVERY re-send (same ts)'),
    'window._rb2p_lastSentOutcomeMs': e('guard', 'hand-off send', 'every send', 'overwritten by the next', '90s (TURN-RESCUE stand-down), 10s (field check), 15s (wall stand-down)', 'the windows lapse'),
    'window._rb2p_userOutcomeSendInProgress': e('guard', 'hand-off send', 'at my drive end, with WAIT', 'my next staging (forceUserOffenseDrive), an apply, the laws',
        'the opponent\'s whole possession while parked; 20s while this phone has the ball', 'V419 latch-expired: cleared, audited'),
    'window._rb2p_userIsWaitingForOpponent': e('guard', 'possession', 'every hand-off I send; the laws; a park', 'every hand-off I apply; my staging; the laws',
        'the opponent\'s possession', 'V422 authority: RESTAGE when the chain says the ball is mine and both are parked (T_ACT 4s); PARK when it is theirs'),
    'window._rb2p_lastOpponentOutcomeApplyMs': e('guard', 'hand-off receive', 'every apply', 'overwritten', '2s (drive-end cooldown) to 10s (field check)', 'the windows lapse'),
    'window._rb2p_lastTurnoverHandoffMs': e('guard', 'hand-off receive', 'my INT/OTHER/PUNT send', 'overwritten', '8s', 'the V208 phantom window lapses; a rejection is recorded in the flow chain (V422)'),
    'window._rb2p_kickoffGraceUntil': e('guard', 'pick-six', 'after the post-pick-six kickoff', 'lapses', '7s', 'lapses'),
    'var:isApplyingOpponentOutcome': e('guard', 'hand-off receive', 'during applyOpponentOutcome', 'at its end (synchronous)', 'synchronous', 'n/a'),
    'var:outcomePollBusy': e('guard', 'hand-off receive (REST poll)', 'before the REST poll', 'the poll settles', '10s (V419)', 'cleared, the next 3s tick polls again'),
    'var:_fbTokInFlight': e('guard', 'REST auth', 'a token refresh in flight', 'it settles', '10s (V419 fetchT)', 'the fetch aborts; the next call retries'),
    'room:outcomes': e('obligation', 'hand-off transport', 'every send (SDK, REST after 1.5s)', 'overwritten by the next send; removed at a new game', 'until the receiver stages it',
        'V422 authority APPLY fetches it over REST, bypassing the per-session dedupe'),
    'room:turnover': e('obligation', 'interception safety', 'the moment an INT flips possession', 'resolved when the INT hand-off ships', '25s (thrower) / 120s (receiver) freshness', 'resume re-sends or stages it'),
    'storage:rb2p_pendingInt': e('obligation', 'interception safety', 'with room:turnover', 'resolved with it', '120s', 'resume'),
    'window._rb2p_heldStampTs': e('guard', 'hand-off receive', 'a held inbound hand-off is stamped once on its record', 'overwritten', 'per record', 'n/a (dedupes one PATCH)'),
    // ---------------------------------------------------------------- the flow chain (V421/V422)
    'room:flow': e('guard', 'flow chain', 'each phone every change (<=1/s) and every 5s', 'overwritten; the partner\'s only by the partner', 'facts stay until superseded; presence decays at 15s',
        'no trusted record -> the older rescuers decide; an epoch change or a horn -> the laws decide'),
    'var:putBusy': e('guard', 'flow chain', 'a flow PUT in flight', 'it settles', '8s (fetchT)', 'cleared, re-sent on the next tick'),
    'var:restored': e('guard', 'flow chain', 'install (a reload)', 'my own record read back, or a new game', 'until REST answers (retried every 2s)', 'nothing is published before; no action is blocked by it'),
    'storage:rb2p_flow_': e('guard', 'flow chain', 'every change of my record', 'overwritten', 'this tab', 'restores the chain after a reload'),
    'window._rb2p_recoverStats': e('guard', 'recovery authority', 'each recovery', 'never', 'page life', 'counters only (read by tests)'),
    'window._rb2p_lastForceRefusal': e('guard', 'flow chain guard', 'the force-drive guard refuses a drive the chain gives to the partner', 'overwritten', '500ms (the resume reads it within one tick)', 'the resume parks instead of retrying'),
    'window._rb2p_p6ForceN': e('guard', 'P6-WATCH', 'each forced drive after a PAT_RESULT', 'a real drive runs; retirement', '8 forces (32s)', 'P6-WATCH retires (F28)'),
    'var:rb2pPendingIntSeen': e('obligation', 'interception safety (resume)', 'the resume reads the local interception backup', 'the page life ends', 'this page life (the backup itself is 25s-fresh)', 'a retried resume still re-sends the interception'),
    'var:qrpSince': e('guard', 'quarter keep deadline', 'the keep flag seen set on screen', 'the flag clears; the deadline', '30s', 'the keep flag expires (F28)'),
    // ---------------------------------------------------------------- conversions
    'derived:patOwed': e('obligation', 'conversion', 'S1-S5: pending try, cascade scorer, down 6, modal up, duty record', 'the try resolves', '35s screen-on; 90s while the choice is on screen; +20s for a launched try',
        'the wall: MISSED (pick six: the synthetic PAT_RESULT; a touchdown: the kickoff, V422 — never a down reset)'),
    'window._rb2p_patOwedSinceMs': e('guard', 'conversion wall', 'while a conversion is owed and the screen is on', 'resolved or hidden', '35s', 'the wall resolves the try as MISSED'),
    'window._rb2p_patPlayPending': e('obligation', 'pick-six conversion', 'the PICK6 apply on the scorer', 'the try resolves; the wall; the clobber breaker; field-owe', '35s wall', 'MISSED and the PAT_RESULT ships'),
    'window._rb2p_patPlayResolved': e('guard', 'pick-six conversion', 'the try resolved', 'the PAT_RESULT ships; the guardian clears it', '5s', 'a synthetic PAT_RESULT ships'),
    'window._rb2p_p6ScorerOwes': e('obligation', 'pick-six conversion', 'the PICK6 apply on the scorer', 'the PAT_RESULT ships', 'the wall / field-owe (9.5s with no conversion on screen)', 'MISSED and the PAT_RESULT ships'),
    'window._rb2p_pickSixPatCascadeActive': e('guard', 'pick-six', 'pick-six detected (thrower) / PICK6 applied (scorer)', 'the PAT_RESULT; the Q3 law; the OT kickoff; the wall', '30s popup killer, 60s watcher, 300s fallback', 'those watchdogs'),
    'window._rb2p_pickSixThisDeviceIsThrower': e('guard', 'pick-six', 'with the cascade on the thrower', 'with the cascade', 'with the cascade', 'with the cascade'),
    'window._rb2p_pick6SentThisPossession': e('guard', 'pick-six', 'the PICK6 send', 'the thrower\'s next forced drive; the PAT_RESULT apply', 'the thrower\'s parked time', 'cleared at its next drive'),
    'window._rb2p_p6AwaitDriveMs': e('guard', 'pick-six (P6-WATCH)', 'PAT_RESULT applied on the thrower', 'a real drive runs; the retire conditions', 're-arms every 4s', 'force-drives the thrower', 'no maximum count (F28): bound it'),
    'window._rb2p_p6Id': e('guard', 'pick-six ledger', 'each pick six', 'the next', 'per pick six', 'the 300s fallback keys on it'),
    'room:p6': e('obligation', 'pick-six ledger', 'each step of a pick six', 'removed at a new game', '300s', 'the fallback'),
    'window._rb2p_patDutyMine': e('guard', 'conversion (S5)', 'every conversion offer', 'retired 3s after the last strong signal', '120s age', 'retired (PAT-INV duty retired)'),
    'room:patDuty': e('guard', 'conversion (S5)', 'with _rb2p_patDutyMine', 'with it', '10 min honored on resume, 3 min without live records', 'ignored past that'),
    'window._rb2p_patStrongSignalMs': e('guard', 'conversion (S5)', 'every strong conversion signal', 'overwritten', '3s', 'S5 retires'),
    'window._rb2p_userPatPopupRefs': e('guard', 'pick-six modal', 'the scorer\'s authorized modal', 'with the cascade', 'with the cascade', 'with the cascade'),
    'var:patFixTicks': e('guard', 'conversion modal', 'a modal off the 2', 'reset', '1s', 'the modal is killed'),
    'var:patWrongModalTicks': e('guard', 'conversion modal', 'a wrong-team modal', 'reset', '1s', 'the modal is killed'),
    'window._rb2p_lastConvModalMs': e('guard', 'conversion', 'every conversion offer', 'overwritten', '20s-120s windows (duplicate, empty field, post-conversion hand-off, the final hold)', 'the windows lapse'),
    'window._rb2p_convTrySnappedMs': e('guard', 'conversion', 'a snapped try', 'overwritten', '20s (the wall deferral)', 'lapses'),
    'window._rb2p_patPlaySnappedMs': e('guard', 'conversion', 'a snapped pick-six try', 'overwritten', '20s', 'lapses'),
    'window._rb2p_patPlayDiedMs': e('guard', 'conversion', 'a dead try', 'overwritten', 'miss detection window', 'lapses'),
    'window._rb2p_postConvHandoffFor': e('guard', 'post-conversion hand-off', 'one hand-off per offer', 'the next offer', 'per offer', 'n/a (dedupe)'),
    'derived:conversion-gate': e('guard', 'conversion modal', 'R1-R4 refusals', 'per offer', 'per offer', 'a refused modal is never built'),
    // ---------------------------------------------------------------- quarters, halftime, overtime
    'window._rb2p_q3LawApplied': e('guard', 'halftime law', 'the law ran', 'a new match', 'the half', 'V422: a failed staging re-arms it (100 x 200ms, the same stored draw)'),
    'window._rb2p_q3ForceTries': e('guard', 'halftime law', 'a failed staging', 'a successful one', '20s', 'the law stops retrying'),
    'window._rb2p_q3KickoffPending': e('guard', 'halftime law', 'the halftime park', 'the law', '20s', 'released'),
    'window._rb2p_quarterResumePending': e('guard', 'quarter keep', 'a quarter change with the ball', 'a snap, a clock tick, a send, an apply, a law', 'the break', 'the keep', 'no time bound (F28): bound it'),
    'window._rb2p_keepN': e('guard', 'quarter keep', 'each keep', 'per quarter', 'keep #4+ refused', 'heal only'),
    'window._rb2p_qSnappedThisQuarter': e('guard', 'quarter keep', 'the first snap of a quarter', 'per quarter', 'the quarter', 'refuses keeps'),
    'var:qkResumeHoldActive': e('guard', 'quarter keep', 'a kp=2 hold loop', 'its end', '1.4s', 'ends'),
    'var:qkPlayHoldStartMs': e('guard', 'quarter keep', 'the ball live at the horn', 'the play ends', '12s', 'the keep proceeds'),
    'window._rb2p_otResumeHoldActive': e('guard', 'overtime', 'a kp=2 hold loop', 'its end', '1.4s', 'ends'),
    'window._rb2p_otKickoffPending': e('guard', 'overtime', 'OT init', 'the flip applied', '20s', 'released'),
    'window._rb2p_otKickoffPendingMs': e('guard', 'overtime', 'with it', 'with it', '20s', 'released'),
    'window._rb2p_otForceTries': e('guard', 'overtime', 'a failed OT staging', 'a successful one', '20s', 'stops retrying'),
    'var:otInitedPeriod': e('obligation', 'overtime flip', 'OT init requests the flip', 'a new match', 'the period', 'none', 'the flip is SDK-only and never retried (F24)'),
    'var:otAppliedPeriods': e('guard', 'overtime flip', 'the flip is applied', 'a new match', 'the period', 'V422: a failed staging retries (40 x 500ms)'),
    'room:ot': e('obligation', 'overtime flip', 'the host seeds the flip', 'purged at match start', 'the period', 'none', 'SDK-only, single writer (F24)'),
    'window._rb2p_inOvertime': e('obligation', 'overtime', 'OT starts', 'OT ends by rounds', 'OT rounds', 'football (equal possessions)'),
    'window._rb2p_otMyPoss': e('guard', 'overtime', 'my OT possession ends', 'OT ends', 'OT', 'counts only'),
    'window._rb2p_otOppPoss': e('guard', 'overtime', 'the partner\'s OT possession ends', 'OT ends', 'OT', 'counts only'),
    'window._rb2p_otWasWaiting': e('guard', 'overtime', 'the waiting edge', 'each edge', 'OT', 'counts only'),
    'storage:rb2p_otPoss': e('guard', 'overtime', 'OT possession counts', 'a new match', 'OT', 'restored on reload'),
    'var:otTd': e('guard', 'overtime touchdown', 'an OT touchdown', 'the conversion is offered and handed off', '30s, 60s with the modal up', 'hands off'),
    'window._rb2p_pastRegSeenMs': e('guard', 'the final', 'regulation seen over', 'a new match', '5s / 20s', 'the FINAL'),
    // ---------------------------------------------------------------- the final
    'window._rb2p_gameOverReported': e('obligation', 'the final', 'the game is decided', 'a new match', 'until the next match', 'the stats render retries (V419)'),
    'room:final': e('obligation', 'the final', 'each phone\'s report (SDK + REST, V422)', 'a new match', 'until read', 'V422: read over REST when the partner\'s flow record says final'),
    'var:gameOverConfirmTicks': e('guard', 'the final', 'the horn', 'reset', '1.2s', 'the FINAL'),
    'var:gameOverPlayWaitTicks': e('guard', 'the final', 'a live ball or an owed conversion at the horn', 'reset', '12s / 120s', 'the FINAL'),
    'window._rb2p_oppEndDeferMs': e('guard', 'the final', 'the partner\'s final while I owe a conversion', 'resolved', '30s', 'the FINAL'),
    'derived:Ky-refusal': e('guard', 'the final', 'a decided horn', 'a new match', 'the game', 'n/a (the game is over)'),
    // ---------------------------------------------------------------- staging and the field
    'window._rb2p_allowOffenseSpawn': e('guard', 'the spawn gate', 'bridge-authorised spawns', 'per spawn', 'per spawn', 'n/a'),
    'window._rb2p_kickoffSweepGen': e('guard', 'kickoff sweeper', 'each staging', 'the next', '60s', 'the sweeper retires'),
    'var:emptySinceMs': e('guard', 'empty-field law', 'an empty field', 'reset', '2.5s', 'restages or hands off'),
    'var:emptyLastMs': e('guard', 'empty-field law', 'each action', 'overwritten', '8s', 'the law may act again'),
    'var:stuckEngineFsmStage': e('guard', 'stuck-drive watchdog', 'a dead FSM stage', 'reset', '0.8s / 1.5s dwell', 'hands off / keeps'),
    'var:engineFsmStageStuckSinceMs': e('guard', 'stuck-drive watchdog', 'with it', 'with it', '0.8s', 'acts'),
    'var:holdTicks': e('guard', 'resume', 'the resume poll', 'resumed', 'while in the match room', 'retries', 'no maximum while in the match room (F28)'),
    'storage:rb2p_gl_reload': e('guard', 'WebGL loss', 'a context loss reload', 'lapses', '45s', 'one reload per 45s', 'reloads are banned (V279): the owner decides'),
    // ---------------------------------------------------------------- detectors (their own clocks)
    'var:turnRescueTicks': e('guard', 'TURN-RESCUE', 'both parked', 'reset', '8s + 8s visible', 'V422: defers to the authority when the chain answers'),
    'var:turnConflictTicks': e('guard', 'TURN-HEAL', 'a double offense', 'reset', '1.5s', 'V422: defers to the authority when the chain answers'),
    'var:fieldEmptyChecks': e('guard', 'field check', 'nobody on the field', 'reset', '9.5s', 'V422: defers to the authority when the chain answers'),
    'var:fieldDoubleChecks': e('guard', 'field check', 'both on the field', 'reset', '9.5s', 'V422: defers to the authority'),
    'var:fieldOweChecks': e('guard', 'field check', 'an owed result with no conversion on screen', 'reset', '9.5s', 'ships MISSED'),
    'var:fieldDisagreeChecks': e('guard', 'field check', 'both parked, views disagree', 'reset', '3 x 5s', 'the turn record decides (old builds)'),
    'window._rb2p_rescueWokeMs': e('guard', 'TURN-RESCUE', 'the screen came back', 'lapses', '8s', 'the rescue may act'),
    // ---------------------------------------------------------------- presence and old ownership views
    'window._rb2p_turnRec': e('guard', 'turn record (old)', 'the SDK turn record', 'overwritten', '4s-15s reader windows', 'V422: superseded by the flow chain when trusted'),
    'room:turn': e('guard', 'turn record (old)', 'hand-offs, laws, restores', 'overwritten', 'reader windows', 'V422: superseded by the flow chain when trusted'),
    'window._rb2p_oppLiveRx': e('guard', 'presence', 'the partner\'s live push', 'overwritten', '3-5s freshness', 'lapses'),
    'window._rb2p_oppLiveRxAt': e('guard', 'presence', 'with it', 'with it', '3-5s', 'lapses'),
    'window._rb2p_oppHb': e('guard', 'presence', 'the partner\'s heartbeat', 'overwritten', 'hidden 12s, left 15 min', 'the honest status'),
    'room:hb': e('guard', 'presence', 'each phone every 5s and on hide', 'removed at match start', '12s', 'the honest status'),
    // ---------------------------------------------------------------- resume
    'storage:rb_room': e('guard', 'resume', 'entering a room', 'leaving it', 'the match', 'n/a', 'tryRestore\'s catch-all deletes it on any error (F26)'),
    'storage:rb_role_': e('guard', 'resume', 'with rb_room', 'with it', 'the match', 'n/a', 'F26'),
    'storage:rb2p_skipResumeOnce': e('guard', 'resume', 'a deliberate leave', 'consumed by tryRestore', 'one reload', 'consumed', 'survives a throwing tryRestore (F26)'),
    'storage:rb2p_matchLive': e('guard', 'resume', 'match start', 'the final / leaving', 'the match', 'the monitor reports "resume did not re-enter the match" after 8s'),
    'room:players': e('guard', 'seats', 'joining', 'leaving', 'the room', 'n/a (seat ownership)'),
    'storage:rb2p_sid': e('guard', 'seats', 'first visit', 'never', 'the tab', 'n/a (seat identity)'),
};

// The rest of the blocking set, found by the classification pass (evidence: LATCH-BLOCKING.md — set/clear
// sites, the gating lines, and each one's bound as the code has it today; `open` marks no bound yet).
const extra = require('./latch-blocking-extra.json');
for (const k of Object.keys(extra)) if (!blocking[k]) blocking[k] = extra[k];

// Filled in by the classification pass; every entry carries its own reason.
const nonBlocking = require('./latch-nonblocking.json');

module.exports = { blocking, nonBlocking };
