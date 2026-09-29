# Blocking candidates found by the registry classification (evidence for tools/latch-blocking-extra.json)

> Line numbers refer to the snapshot of index.html the classification read (V422 work in progress, 19,798 lines); they drift as the file changes — the gating lines are quoted so they can be found again.


Read-only research. No file was edited apart from this file and `latch-nonblocking-draft.json`.

## Scope and conventions

- Line numbers refer to `scratchpad/latch-index-snapshot.html` (19,798 lines).
- Of the 225 keys in `latch-unclassified.txt`:
  - 82 are listed here as blocking, or as "can't rule out";
  - 143 are in `latch-nonblocking-draft.json`, each with its reason.
- "Holds up" uses the task's four outcomes:
  - (1) a snap, or a drive being staged or played;
  - (2) a hand-off (sending or applying a drive-end outcome);
  - (3) a conversion (the 1 PT / 2 PT modal, or the try);
  - (4) the final / stats screen.
- Entries are grouped by how directly they hold up play, so the registry can decide per group:
  - **A. Direct:** the value sits in a condition that refuses, drops, defers or waits, or that makes a watchdog stand down.
  - **B. Deadline clocks and companions:** the timestamps and timers that bound latches already in the registry.
  - **C. Upstream inputs:** they decide when a registered latch is set or cleared, or route a drive-end into one.
  - **D. Weak:** included only because they cannot be strictly ruled out. Each entry gives the argument for reclassifying it as non-blocking.
- `var:` locals are re-evaluated on every call or tick. Their "set" line is where they are computed.

---

## A. Direct gates and holds (50)

### `window._rb2p_diagFps`
- **Set:** 15523, from the rAF counter every 1s. **Cleared:** never; it is overwritten each second.
- **Gates:**
  - `17497: if (window._rb2p_diagFpsSeen === true && Number(window._rb2p_diagFps) === 0)`
  - `17498: return 'the engine is not drawing frames (fps 0)';`
    - This feeds `17519: var applyBlocked = window._rb2p_outcomeApplyBlocked();`, then `17522: window._rb2p_deferredOutcome = val;`. The hand-off is held and not applied.
  - `3016: if (document.hidden || (window._rb2p_diagFpsSeen === true && Number(window._rb2p_diagFps) === 0)) { emptySinceMs = 0; return; }`
    - The EMPTY-FIELD re-stage law stands down.
  - It is also read at 18762 and 18769 (can-act audit only) and 15050 (heartbeat payload).
- **Holds up:** (2) applying a hand-off; (1) the empty-field re-stage.
- **Bound:**
  - Re-sampled every 1s, so it clears as soon as frames return.
  - The held record drains past the 25s screen-on wall: `17695: if (blocked && heldMs < 25000) return blocked;`.

### `window._rb2p_diagFpsSeen`
- **Set:** 15524, `true` after the first 1s sample. **Cleared:** never.
- **Gates:** 17497 and 3016, as for `_rb2p_diagFps`. It arms the fps==0 test.
- **Holds up:** (2), (1), as above.
- **Bound:** stays set for the life of the page. The hold itself lasts only while fps is 0 (see above).

### `window._rb2p_anyPlayRun`
- **Set:** true at 4591 (ball kp 4/5). **Cleared:** 19406 (startMatch).
- **Gates:**
  - `15300: var atStaging = inMH && !waiting && !patPlay && koAny && plOF >= 1 &&`
  - `15301: window._rb2p_anyPlayRun !== true &&`
  - Once it is set, the STUCK@staging healer stands down for the rest of the match. That healer neutralises kickoff buttons, presses Kick Off and re-forces the drive.
- **Holds up:** (1) staging the drive (the GET READY / Kick Off freeze healer).
- **Bound:** none within a match. It is a one-way latch by design (V320), reset only by startMatch.

### `window._rb2p_convAuthMs`
- **Set:** 11263 (PICK6 apply, just before its `_wm` pop) and 13619 (OT touchdown conversion offer). **Cleared:** never; it ages out.
- **Gates:**
  - `9526: if (now - (Number(window._rb2p_convAuthMs) || 0) < 3000)`
  - `9527: return 'L2 pick-6 (bridge-authorized)';`
  - With no licence the gate refuses: `9604: var lic = window._rb2p_conversionLicence();`, then `9605: if (!lic)`, then `9606: return 'R2 no touchdown licence — no TD, no pick-6, no live conversion';`.
- **Holds up:** (3) the conversion modal is refused and never constructed.
- **Bound:** 3s window.

### `window._rb2p_convScorePrev`
- **Set:** 9508 (null), 9512 (null outside the match), 9520 (every 40ms). **Cleared:** 9512.
- **Gates:**
  - `9532: var pv = window._rb2p_convScorePrev;`
  - `9538: if (pv && u - pv.u >= 6) return 'L1 touchdown (+6 this instant)';`
  - It also drives 9516, which stamps `_rb2p_lastTd6Ms`.
- **Holds up:** (3) the conversion licence (R2 refusal at 9606).
- **Bound:** resampled every 40ms.

### `window._rb2p_lastTd6Ms`
- **Set:** 9509 (0) and 9516. **Cleared:** 9509.
- **Gates:**
  - `9539: if (now - (Number(window._rb2p_lastTd6Ms) || 0) < 3000)`
  - `9540: return 'L1 touchdown (+6 within 3s)';`
- **Holds up:** (3) the conversion licence.
- **Bound:** 3s.

### `window._rb2p_scoreAtLastSnap`
- **Set:** 4681, on every snap edge. **Cleared:** never; it is overwritten.
- **Gates:**
  - `9553: var sas = Number(window._rb2p_scoreAtLastSnap);`
  - `9554: if (isFinite(sas) && u - sas >= 6 && now - (Number(window._rb2p_lastSnapMs) || 0) < 30000)`
  - `9555: return 'L1c touchdown (+6 since the snap)';`
- **Holds up:** (3) the conversion licence.
- **Bound:** counts only within 30s of the last snap.

### `window._rb2p_lastSnapMs`
- **Set:** 4681, every snap edge. **Cleared:** never; it is overwritten.
- **Gates:**
  - `2959: var trySnapped = Number(window._rb2p_lastSnapDown) === 6 && Number(window._rb2p_lastSnapMs) > offer && Number(window._rb2p_lastSnapMs) < qc;`
    - If it is false, the post-conversion hand-off waits: `2961: if (typeof window._rb2p_patOwed === 'function' && window._rb2p_patOwed()) return;` and `2962: if (window._rb2p_patPlayPending === true) return;`.
  - `12365: if (o && o._rxMs && Number(window._rb2p_lastSnapMs) > Number(o._rxMs) + 1000 && Date.now() - Number(o._rxMs) > 20000) {`
    - Then `12368: return;`. The queued hand-off is purged as "played past it".
  - 9554 (the L1c licence, above).
  - 18794 (the can-act 'soft' signature, telemetry only).
- **Holds up:**
  - (2) a queued hand-off is dropped;
  - (2) the post-conversion TD-kickoff hand-off waits on the conversion duty;
  - (3) the L1c licence.
- **Bound:**
  - Overwritten every snap.
  - The purge needs a record at least 20s old.
  - The post-conversion watcher gives up 90s after the offer (2951).

### `window._rb2p_lastSnapDown`
- **Set:** 4681. **Cleared:** never; it is overwritten.
- **Gates:** 2959–2962, quoted above. The post-conversion hand-off is released early only when the last snap was the down-6 try.
- **Holds up:** (2) the post-conversion hand-off (TD kickoff).
- **Bound:** overwritten each snap; the watcher's 90s offer window.

### `window._rb2p_quarterChangedToMs`
- **Set:** 7878 (0 at load) and 8132 (each quarter increment). **Cleared:** 7878.
- **Gates:**
  - `3236: if (koAny > 0 && plOF === 0 && !ballSeenEver && Date.now() - (Number(window._rb2p_quarterChangedToMs) || 0) > 3000 && ticks % 4 === 0) {`
    - The kickoff sweeper does not re-force a drive within 3s.
  - `12943: var q4ActiveMs = Date.now() - (window._rb2p_quarterChangedToMs || 0);`, then `12947: q4ActiveMs > 5000);`
    - regulationOver, so the FINAL, waits until Q4 is more than 5s old.
  - `2950: var offer = Number(window._rb2p_lastConvModalMs) || 0, qc = Number(window._rb2p_quarterChangedToMs) || 0, now = Date.now();`, then `2951: if (!offer || now - offer > 90000 || qc <= offer || window._rb2p_postConvHandoffFor === offer) return;`
    - The post-conversion hand-off fires only after a later quarter change.
  - `2992: var halftimeJust = Number(em && em.engineQuarter) === 3 && Date.now() - (Number(window._rb2p_quarterChangedToMs) || 0) < 10000;`
    - This decides whether an empty field re-stages or hands off.
  - `9185: var keepEpoch = Number(window._rb2p_quarterChangedToMs) || 0;`
    - The keep counter's scope; keep #3 gets a fresh spawn and #4+ are refused.
  - `9424: var crossedR = Number(window._rb2p_quarterChangedToMs) > (Number(window._rb2p_lastConvModalMs) || 0) && (qR === 3 || qR >= 5);`
    - The 35s wall's kickoff hand-off is skipped across the halftime or regulation horn.
  - `4926` / `4927: if (clkQ > 0 && clkQ < fullQ - 0.5 && sinceQ > 1500) window._rb2p_noteQuarterPlayed(...)`
    - A settle marks the quarter played only after 1.5s.
  - `381: if (Date.now() - (Number(window._rb2p_quarterChangedToMs) || 0) < 8000) return '';`
    - This suspends the LIVE-refusal rule for 8s.
- **Holds up:**
  - (1) sweeper re-force and keep counting;
  - (2) the post-conversion and 35s-wall hand-offs;
  - (4) the regulation FINAL maturity.
- **Bound:** each window is 1.5–10s after the stamp. The stamp is overwritten at every quarter change.

### `window._rb2p_matchStartMs`
- **Set:** 16567 (resume anchor) and 19425 (startMatch). **Cleared:** never.
- **Gates:**
  - `17641: if (val.ts < (Number(window._rb2p_matchStartMs) || 0)) return;`
    - A REST-polled hand-off older than the anchor is ignored.
  - `17104: var startMs = Number(window._rb2p_matchStartMs) || 0;`, then `17109: var staleF = (typeof rep.srv === 'number' && gSrv) ? (!startMs || rep.srv < gSrv - 15000) : (!rep.ts || !startMs || rep.ts < startMs);`, then `17116: FB.remove(... '/final/' + oppRole) ...` and `17117: return;`
    - The partner's FINAL is ignored and deleted.
  - `17139: if (oppFinalReport || !window._rb2p_matchStartMs || typeof window._rb2p_flowVerdict !== 'function') return;`
    - No REST fetch of the partner's FINAL.
  - `17204: var otAnchor = Number(window._rb2p_matchStartMs) || 0;`, then `17210: if (typeof entry.ts !== 'number' || entry.ts < otAnchor) {`, then `17214`–`17215`
    - The OT coin flip is ignored and purged.
  - `385: Date.now() - (Number(window._rb2p_matchStartMs) || 0) > 15000)`
    - The LIVE-refusal rule 2 applies only after 15s.
- **Holds up:** (2) a REST-delivered hand-off; (4) the partner's FINAL; (1) OT kickoff routing.
- **Bound:** fixed per match with no expiry. A wrong anchor persists for the page life.

### `storage:rb2p_matchStartMs`
- **Set:** 19430 (startMatch). **Cleared:** never; the next startMatch overwrites it.
- **Gates:**
  - `16566: try { anchoredMs = Number(sessionStorage.getItem('rb2p_matchStartMs')) || 0; } catch (eAM) {}`
  - `16567: window._rb2p_matchStartMs = anchoredMs || Date.now();`
  - This makes it the reload anchor for every gate listed under `_rb2p_matchStartMs`. It is also read at 16322 (box-record staleness).
- **Holds up:** same as `_rb2p_matchStartMs`, after a reload.
- **Bound:** tab lifetime.

### `window._rb2p_lastVisibleMs`
- **Set:** 18355 (visibilitychange → visible); 18354 (test seam that ages it). **Cleared:** never.
- **Gates:**
  - `18277: if (Date.now() - (Number(window._rb2p_lastVisibleMs) || 0) < 8000) { fieldEmptyChecks = fieldDoubleChecks = 0; return 'my screen just came back'; }`
- **Holds up:** (1) the field check's restore of a drive, and its park, stand down.
- **Bound:** 8s.

### `window._rb2p_lastGood`
- **Set:** 18230 (every 1s while the field is healthy) and 18238 (loaded from sessionStorage). **Cleared:** 18197 (null at load).
- **Gates:**
  - It is read into `rightfulOwner` at `18237` and `18240: var r = lg ? { owner: lg.owner, ...`. The field check then acts on it:
    - `18323: if (ro.owner === myRole) {` leads to `18326: return fieldRestoreMine(ro, state);`
    - `18328: if (ro.owner === otherRole) {` leads to `18345: return state + ' — the ball is theirs (' + ro.why + '); their check restores them';`
  - It decides whether this phone restores its drive, parks, or waits for the partner.
- **Holds up:** (1) staging a drive, and possession.
- **Bound:**
  - Superseded by any later send, apply or turn record (18242–18248).
  - The 30s disagreement fallback (18340–18343).

### `storage:rb2p_lastGood`
- **Set:** 18231, at most every 5s. **Cleared:** never.
- **Gates:**
  - `18238: if (!lg) { try { var sv = JSON.parse(sessionStorage.getItem('rb2p_lastGood') || 'null'); if (sv && sv.room === myRoom) lg = window._rb2p_lastGood = sv; } catch (e) {} }`
  - After a reload it feeds the same field-check decision.
- **Holds up:** (1), as above.
- **Bound:** as above. After a reload, the re-read turn record usually supersedes it.

### `window._rb2p_resumeState`
- **Set:** 16199, then edited at 16223, 16232–16235 and 16243. **Cleared:** 5418 (consumed once).
- **Gates:**
  - `5416: if (window._rb2p_resumeState) {`
  - `5458: if (rs.iHaveBall) {` stages my drive. Otherwise:
    - `5485: } else if (window._rb2p_resumePatDuty) {` re-pops the conversion;
    - `5604: } else {` and `5606: window._rb2p_userIsWaitingForOpponent = true;` park the phone.
- **Holds up:**
  - (1) after a reload the phone parks in WAIT when `iHaveBall` is false;
  - (3) it routes to the conversion re-pop.
- **Bound:** consumed once. The resume force retries every 50ms while in the match (`5475: if (!resumeForceOk) return;`).

### `window._rb2p_resumePatDuty`
- **Set:** 16429 and 16435. **Cleared:** 5494 (consumed) and 19445 (startMatch).
- **Gates:**
  - `16243: if (window._rb2p_resumePatDuty) window._rb2p_resumeState.iHaveBall = false;`
  - `5485: } else if (window._rb2p_resumePatDuty) {`, which leads to the modal re-pop loop (up to 12 tries, 1.6s apart).
- **Holds up:** (1) forces WAIT on resume; (3) the conversion re-pop.
- **Bound:** consumed once.

### `room:live`
- **Written:** 17991 (SDK, every 500ms) and 18004 (REST mirror). **Removed:** 19457 (startMatch).
- **Read:**
  - 19207–19223, the mirror that sets `_rb2p_oppLiveRx` and `_rb2p_oppLiveRxAt` (both registered BLK);
  - 16282 and 16288 (resume).
- **Gates:**
  - Through `_rb2p_oppLiveRx`:
    - `382`–`384` (the possession LIVE-refusal);
    - `19092: var bothParked = ...` and `19093: olR && Date.now() - (Number(olR.at) || 0) < 4000 &&` (TURN-RESCUE);
    - `18219`, `18307: var oppHas = !!(ol && now - (Number(ol.at) || 0) < 5000 && ol.iHaveBall === true);` (field check);
    - `19175`–`19177` (TURN-HEAL).
  - On resume:
    - `16205: iHaveBall: (typeof myLive.iHaveBall === 'boolean')`
    - `16450: var oppFresh = oppLive && (Date.now() - (Number(oppLive.ts) || 0) < 25000);`
    - `16502: var inProgress = oppFresh || myFresh || ...`
- **Holds up:** (1) and (2) possession, the rescuers, and whether and how a reload resumes.
- **Bound:** 3–5s freshness windows at the readers; 25s on resume.

### `room:snap`
- **Written:** 17839 (between plays). **Removed:** 19458.
- **Read:** 16296 and 16298.
- **Gates:**
  - `16301: if (mySnap  && (Date.now() - (Number(mySnap.ts)  || 0) < SNAP_FRESH)) myLive  = mySnap;`
  - `16302: if (oppSnap && (Date.now() - (Number(oppSnap.ts) || 0) < SNAP_FRESH)) oppLive = oppSnap;`
  - These feed `16205` (iHaveBall) and `16502` (inProgress).
- **Holds up:** (1) resume possession (WAIT or drive).
- **Bound:** 25s freshness.

### `window._rb2p_myFirebaseRole`
- **Set:** 5329 (startTwoPlayerMatch). **Cleared:** never.
- **Gates:**
  - `13267: var role = window._rb2p_myFirebaseRole;`
  - `13268: if (role !== 'a' && role !== 'b') return;   // need the authoritative A/B identity`
    - Without it the Q3 law never stages B or parks A.
  - `13456: : ((window._rb2p_myFirebaseRole === 'a' || window._rb2p_myFirebaseRole === 'b')`
    - This is the OT receiver-routing fallback (13454–13458).
- **Holds up:** (1) second-half staging and OT kickoff routing.
- **Bound:** set once per match; no expiry.

### `window._rb2p_wireQuarter`
- **Set:** 5445, 8448, 11086, 11438 and 19346–19347 (all take the max); clamped at 6867. **Cleared:** 13081 and 19413.
- **Gates:**
  - `13277: var wireQ = Number(window._rb2p_wireQuarter) || 0;` feeds `13279: (role === 'a' && q === 2 && wireQ >= 3 &&` and `13281: if (!q3Reached || window._rb2p_q3LawApplied === true) return;`
  - `13305: if (Number(window._rb2p_lastStableQuarter || 1) < 2 &&` and `13306: Number(window._rb2p_wireQuarter || 0) < 3) return;`
  - It is also the governor's floor and clamp (6878–6902).
- **Holds up:** (1) the Q3 law refuses, so there is no second-half staging.
- **Bound:** monotonic within a match; reset at match start.

### `window._rb2p_lastStableQuarter`
- **Set:** 8097–8098 (clock running while driving). **Cleared:** 7876, 13084 and 19411 (reset to 1).
- **Gates:**
  - `13280: Number(window._rb2p_lastStableQuarter || 1) >= 2);`
  - `13305` / `13306`, as above.
  - Also the governor base at 6878.
- **Holds up:** (1) the Q3 law.
- **Bound:** monotonic per match.

### `window._rb2p_qGovToppedQ`
- **Set:** 6920. **Cleared:** 7611, 7630, 7891, 13083 and 13312.
- **Gates:**
  - `7473: if ((halfClockExpired || window._rb2p_qGovToppedQ === halfQ) &&`
  - The between-quarters keep at the Vy=13 park runs only when the clock expired or this marker names the quarter.
- **Holds up:** (1) restaging the drive at a quarter boundary.
- **Bound:** consumed by the keep, by a settled play (7891) or by the Q3 law.

### `window._rb2p_otFlipSeenPeriod`
- **Set:** 17226. **Cleared:** 13096.
- **Gates:**
  - `13173: var otLegit = otTied ||` and `13174: Number(window._rb2p_otFlipSeenPeriod)       === q ||`
  - When set, OT is armed; otherwise 13193 returns.
  - With OT armed, the FINAL detector stands down: `12862: if (q >= 5 && window._rb2p_inOvertime) return;`.
  - It also names the flow epoch (18450).
- **Holds up:** (4) the regulation FINAL; (1) the OT epoch and routing.
- **Bound:** per period; reset at a fresh match.

### `window._rb2p_otKickoffAppliedPeriod`
- **Set:** 13543. **Cleared:** 13095.
- **Gates:**
  - `13175: Number(window._rb2p_otKickoffAppliedPeriod) === q;` (otLegit, then FINAL hands-off)
  - `13224: if (window._rb2p_otKickoffAppliedPeriod !== q) {` (the watchdog re-park)
  - `13962: if (window._rb2p_otKickoffAppliedPeriod === period) {`, then `13964: return;`. The host never re-seeds the coin flip for that period.
- **Holds up:** (1) OT kickoff routing; (4) through OT arming.
- **Bound:** per match.

### `window._rb2p_p6ResultAppliedMs`
- **Set:** 8477. **Cleared:** 6653 (pick-six cascade entry).
- **Gates:**
  - `495: if (window._rb2p_p6ResultAppliedMs) return;`
  - This skips `498: if (typeof window._rb2p_pollOutcomeNow === 'function') window._rb2p_pollOutcomeNow(true);`, the P6-WATCH forced REST poll for a PAT_RESULT the ledger says was sent.
- **Holds up:** (2) applying the PAT_RESULT hand-off; this watchdog stands down.
- **Bound:** until the next cascade entry. It only matters while the thrower's cascade flag is up (489).

### `window._rb2p_patResolvedMs`
- **Set:** 8734, 8784, 8820, 9376, 9399, 18291 and 19134. **Cleared:** never; it is overwritten.
- **Gates:**
  - `8850: if (Date.now() - (window._rb2p_patResolvedMs || 0) > 5000) {`
  - `8851: window._rb2p_shipSyntheticPatResult('kickoff _1c1 never fired');`
- **Holds up:** (2) and (3). The synthetic PAT_RESULT waits 5s after resolution.
- **Bound:** 5s.

### `window._rb2p_patUserScoreAtStart`
- **Set:** 11230 (PICK6 apply). **Cleared:** never.
- **Gates:**
  - `6354`/`6355` (patDelta), then `6360: if (!isPostPatKickoff) {` and `6368: return;`. The post-PAT `_1c1` is swallowed and no PAT_RESULT is sent.
  - `8665: var userDelta = em.userScore - (window._rb2p_patUserScoreAtStart || 0);` and `8680: if (userDelta >= 1) {` (made-detection)
  - `9368: var wallDelta = ...`, which the wall uses to resolve the try as MADE.
- **Holds up:** (3) resolving the pick-six try; (2) sending the PAT_RESULT.
- **Bound:** the 35s wall (`9336`) and the loop breaker.

### `window._rb2p_patOppScoreAtStart`
- **Set:** 11231. **Cleared:** never.
- **Gates:**
  - `8666: var oppDelta  = em.opponentScore - (window._rb2p_patOppScoreAtStart || 0);`
  - `8669: if (oppDelta >= 6) {`, then `8678: return;`. The guardian repairs and does not resolve that tick.
- **Holds up:** (3).
- **Bound:** the 35s wall.

### `window._rb2p_patClobberCount`
- **Set:** 8801 (++) and 11229 (0). **Cleared:** 11229.
- **Gates:**
  - `8816: if (window._rb2p_patClobberCount >= 12 &&`
  - `8817: Date.now() - (window._rb2p_patPlayStartMs || 0) > 8000) {`
  - Below 12 the loop breaker does not resolve the looping try.
- **Holds up:** (3).
- **Bound:** the 35s wall.

### `window._rb2p_patPlayStartMs`
- **Set:** 11226. **Cleared:** never.
- **Gates:** `8817`, above. The loop breaker waits 8s from the start.
- **Holds up:** (3).
- **Bound:** 8s minimum; the 35s wall.

### `window._rb2p_patResultSentMs`
- **Set:** 6380 and 8631. **Cleared:** never.
- **Gates:**
  - `19170: if (Date.now() - (Number(window._rb2p_patResultSentMs) || 0) < 8000 ||`, then `19172: turnConflictTicks = 0; return;`
    - TURN-HEAL, the double-offense demotion, stands down.
    - Hand-offs queued for this phone apply only while it is parked: `12359: if (window._rb2p_userIsWaitingForOpponent === true && !scorerPlayingPat) {`.
  - 8929 (pick-six monitor verdict, diagnostic).
- **Holds up:** (2) applying a queued hand-off while a double offense is not demoted.
- **Bound:** 8s.

### `window._rb2p_opponentScoreAtDriveStart`
- **Set:** 2494, 8382 and 8396. **Cleared:** never.
- **Gates:**
  - `6672: var oppAtDriveStart = window._rb2p_opponentScoreAtDriveStart || 0;`, `6677: var plus6Landed = (em2.opponentScore - oppAtDriveStart) >= 6;` and `6679: if (!plus6Landed && !timedOut) return;`
    - The PICK6 send waits.
  - `6255: var oppStart = ...`, then `6277: var heuristicSignal = (outcome.type === 'INT' && oppDelta >= 6);`, then `6304: return;   // skip normal INT-send, do NOT enter waiting`
    - It diverts the drive-end into the pick-six cascade.
  - 8884 (monitor).
- **Holds up:** (2) the PICK6 hand-off is delayed; the normal hand-off is replaced by the cascade.
- **Bound:** the 8s send deadline (`6671: var sendDeadline = Date.now() + 8000;`).

### `window._rb2p_lastTdReplayMs`
- **Set:** 6129 (`_Ak1` hook). **Cleared:** 6635 (cascade entry) and 7534 (quarter keep).
- **Gates:**
  - `6496: var ak1Ms  = window._rb2p_lastTdReplayMs || 0;`
  - `6499: if (ak1Ms && ak1Opp && (Date.now() - holdStartMs) < 12000) {`
  - `6500: window._rb2p_pendingTurnoverSendTimer = setTimeout(fireHeldSend, 1000);`
    - The held drive-end is kept for another second, repeatedly.
  - `6272`/`6273` (the 8s ak1 window), then `6278: var isPick6 = ak1Signal || heuristicSignal;` and `6304`, which diverts into the cascade.
- **Holds up:** (2) sending the drive-end hand-off.
- **Bound:** 12s from hold start. 6496 does not age the stamp itself: any non-zero value extends every hold up to 12s until it is consumed.

### `window._rb2p_lastTdScoringTeamIdx`
- **Set:** 6130. **Cleared:** 6636 and 7535 (undefined).
- **Gates:**
  - `6497: var ak1Opp = window._rb2p_lastTdScoringTeamIdx !== undefined &&`
  - `6498: window._rb2p_lastTdScoringTeamIdx !== window._rb2p_lastTdUserTeamIdx;`
  - Also 6274–6275.
- **Holds up:** (2), as above.
- **Bound:** 12s per hold.

### `window._rb2p_lastTdUserTeamIdx`
- **Set:** 6131. **Cleared:** never.
- **Gates:** `6498`, above.
- **Holds up:** (2).
- **Bound:** 12s per hold.

### `window._rb2p_quarterChangedTo`
- **Set:** 8136. **Cleared:** 7880 (0).
- **Gates:**
  - `7691: var qTo = window._rb2p_quarterChangedTo;`
  - `7699: ? window._rb2p_qEndSpot(qTo) : null;`
    - This picks the capture that the V345 void compares: `7707: ? window._rb2p_scoredSinceCapture(engineMatch, !!qEndD) : null;`, then `7708: if (qrScored) {` and `7713: return;`.
  - `7743: if (typeof window._rb2p_keepGate === 'function' && !window._rb2p_keepGate(Number(qTo), keepYard, keepDown, keepToGo)) {`
    - The keep-count scope: #3 gets a fresh spawn and #4+ are refused.
- **Holds up:** (1) the dead-Vy quarter-keep resume.
- **Bound:** overwritten each quarter.

### `window._rb2p_preRolloverScore`
- **Set:** 8034. **Cleared:** 6457, 7900, 7958, 11202, 11394 and 13340.
- **Gates:**
  - `7941: var cap = usedQEnd ? window._rb2p_qEndLatchScore : window._rb2p_preRolloverScore;`
  - `7943: if (typeof cap === 'number' && (Number(em.userScore) || 0) !== cap) return 'score ' + cap + '->' + em.userScore;`
  - This leads to the void: 7606–7614 (Vy=13 keep) and 7706–7713 (dead-Vy resume).
- **Holds up:** (1) the quarter keep is voided.
- **Bound:** refreshed while driving; voided at any hand-off.

### `window._rb2p_preRolloverMs`
- **Set:** 8035. **Cleared:** 7901 (0).
- **Gates:**
  - `7942: var capMs = usedQEnd ? window._rb2p_qEndLatchMs : window._rb2p_preRolloverMs;`
  - `7947: if (capMs && window._rb2p_vyTdSeenMs > capMs) return 'Vy=9/14 seen after capture';`
- **Holds up:** (1), as above.
- **Bound:** as above.

### `window._rb2p_qEndLatchScore`
- **Set:** 8078. **Cleared:** 7909 and 7960.
- **Gates:** `7941` / `7943`, above.
- **Holds up:** (1).
- **Bound:** latched once per quarter; voided with the captures.

### `window._rb2p_qEndLatchMs`
- **Set:** 8079. **Cleared:** 7910 (0).
- **Gates:**
  - `7942` / `7947` (the void).
  - `2819: var latchMs   = Number(window._rb2p_qEndLatchMs) || 0;` and `2821: if (!a.upgraded && latchMs > a.ms &&` (ball-gate anchor upgrade; placement only).
- **Holds up:** (1).
- **Bound:** once per quarter.

### `window._rb2p_vyTdSeenMs`
- **Set:** 8125 (Vy 9/14 sighting). **Cleared:** 7911 (0).
- **Gates:** `7947`, above.
- **Holds up:** (1) the quarter keep is voided.
- **Bound:** only compared against the current capture time.

### `window._rb2p_qEndLatchQ`
- **Set:** 8074. **Cleared:** 7631, 7766, 7891, 7905, 7959 and 13098.
- **Gates:**
  - `7914: if (window._rb2p_qEndLatchQ == null || Number(window._rb2p_qEndLatchQ) !== Number(q)) return null;`
    - qEndSpot decides `usedQEnd`, which is the capture the void compares (7607/7707).
  - `8069: window._rb2p_qEndLatchQ !== qNow &&` (latch once per quarter).
- **Holds up:** (1).
- **Bound:** consumed by the keep or a settled play.

### `window._rb2p_qEndLatchYard`
- **Set:** 8075. **Cleared:** 7906.
- **Gates:**
  - `7915: if (typeof window._rb2p_qEndLatchYard !== 'number') return null;` (capture choice for the void).
  - `2820: var latchYard = Number(window._rb2p_qEndLatchYard);` (anchor upgrade, placement).
- **Holds up:** (1).
- **Bound:** once per quarter.

### `var:fOwed`
- **Set:** 2382, on each forceUserOffenseDrive call. **Cleared:** local.
- **Gates:**
  - `2382: var fOwed = window._rb2p_patOwed();`
  - `2383: if (fOwed) {`, then `2387: return false;`
  - Every forced drive is refused: rescues, resume, laws, the field check.
- **Holds up:** (1).
- **Bound:** synchronous. It is an alias of `derived:patOwed`, bounded by the 35s screen-on wall.

### `var:v352Owed`
- **Set:** 11365. **Cleared:** local.
- **Gates:**
  - `11365: var v352Owed = (typeof window._rb2p_patOwed === 'function')`
  - `11367: if (v352Owed) {`, then `11375: return true;   // consumed, nothing applied`
- **Holds up:** (2) a generic hand-off is consumed and dropped while a conversion is owed.
- **Bound:** synchronous; the `patOwed` wall.

### `var:v346PatHold`
- **Set:** 12995. **Cleared:** local.
- **Gates:**
  - `12995: var v346PatHold = Number(em.engineDownNumber) === 6 ||`, including `12999: (typeof window._rb2p_flowPartnerConv === 'function' && window._rb2p_flowPartnerConv());`
  - `13003: if ((rb2pPlayInProgress() || v346PatHold) &&`
  - `13004: ++gameOverPlayWaitTicks < (v346PatHold ? 400 : 40)) {`, then `13007: return;`
- **Holds up:** (4) the FINAL.
- **Bound:** 400 ticks × 300ms = 120s.

### `var:patPending`
- **Set:** 7220. **Cleared:** local.
- **Gates:**
  - `7220: var patPending = window._rb2p_patPlayPending === true &&`
  - `7222: if (patPending) return origEb1.apply(this, arguments);`
  - `7227: return;   // no post-PAT drive spawn on the scorer`
- **Holds up:** (1) `s_set_up_play` is blocked on the pick-six scorer unless its try is pending. That includes the try's own goal-line snap.
- **Bound:** synchronous; the 35s wall on `patPlayPending`.

### `var:applyBlocked`
- **Set:** 17519. **Cleared:** local.
- **Gates:**
  - `17519: var applyBlocked = window._rb2p_outcomeApplyBlocked();`
  - `17520: if (applyBlocked) {`, then `17522: window._rb2p_deferredOutcome = val;` and `17540: return;`
- **Holds up:** (2) the hand-off is held, not consumed or acked.
- **Bound:** the 25s screen-on drain wall (17695).

### `var:handoffInFlight`
- **Set:** 19073. **Cleared:** local.
- **Gates:**
  - `19073: var handoffInFlight = !!(lsoR && lsoR.ts && Date.now() - (Number(window._rb2p_lastSentOutcomeMs) || 0) < 90000);`
  - `19092: var bothParked = !handoffInFlight && !oppHiddenR && tR && tR.owner === myRole &&`
  - TURN-RESCUE stands down.
- **Holds up:** (1) the both-parked rescue of a drive.
- **Bound:** 90s. The delivery watchdog clears `_rb2p_lastSentOutcome` on ack (17665).

---

## B. Deadline clocks and companions of registered latches (11)

### `window._rb2p_q3KickoffPendingMs`
- **Companion of:** `_rb2p_q3KickoffPending` (registered, max 20s).
- **Set:** 7463. **Cleared:** never.
- **Gates:**
  - `7371: if (window._rb2p_q3KickoffPending === true &&`
  - `7372: (Date.now() - (window._rb2p_q3KickoffPendingMs || 0)) < 20000) return;`
  - The drive-end watchdog is parked.
- **Holds up:** (1) and (2) the stuck-drive hand-off at halftime.
- **Bound:** 20s from the stamp.

### `window._rb2p_pickSixPatCascadeRaisedMs`
- **Deadline clock of:** `_rb2p_pickSixPatCascadeActive`.
- **Set:** 6645 (thrower), 11169 (scorer) and 10517 (console self-test only). **Cleared:** never; it is re-stamped.
- **Gates:**
  - `8354: var elapsedSinceFlagRaised = Date.now() -` and `8355: (window._rb2p_pickSixPatCascadeRaisedMs || 0);`, then `8371: if (elapsedSinceFlagRaised < 3000) return;` and `8377: if (elapsedSinceFlagRaised >= 60000) {`
  - `9925: var raisedMs = window._rb2p_pickSixPatCascadeRaisedMs || 0;`, then `9931: if (raisedMs && (Date.now() - raisedMs) > PICK6_CASCADE_MAX_MS &&` and `9936: window._rb2p_pickSixPatCascadeActive = false;`
- **Holds up:** (1), (2) and (3), through the cascade flag it bounds.
- **Bound:** 30s for the popup killer; 3s minimum and 60s maximum for the completion watcher. Re-stamping extends both.

### `var:elapsedSinceFlagRaised`
- **Set:** 8354–8355 (local).
- **Gates:** `8371` and `8377`, above.
- **Holds up / Bound:** as for `_rb2p_pickSixPatCascadeRaisedMs` (3s / 60s).

### `window._rb2p_keepQ`
- **Scope key of:** `_rb2p_keepN` (registered: keep #4+ refused).
- **Set:** 9186. **Cleared:** 7879 (null).
- **Gates:**
  - `9186: if (window._rb2p_keepQ !== q || window._rb2p_keepEpoch !== keepEpoch) { window._rb2p_keepQ = q; window._rb2p_keepEpoch = keepEpoch; window._rb2p_keepN = 0; }`
  - Then `9196: if (window._rb2p_keepN === 3) {` and `9204: return false;`, and `9206: if (window._rb2p_keepN >= 3) {` and `9212: return false;`.
- **Holds up:** (1) the quarter keep is refused.
- **Bound:** resets at every quarter-change stamp.

### `window._rb2p_keepEpoch`
- **Scope key of:** `_rb2p_keepN`.
- **Set:** 9186. **Cleared:** never; it is overwritten.
- **Gates:** `9186` onward, above.
- **Holds up:** (1).
- **Bound:** as above.

### `window._rb2p_oppEndDeferTimer`
- **Retry timer of:** `_rb2p_oppEndDeferMs` (registered, max 30s).
- **Set:** 14136. **Cleared:** 14137.
- **Gates:**
  - `14135: if (!window._rb2p_oppEndDeferTimer) {`
  - `14136: window._rb2p_oppEndDeferTimer = setTimeout(function () {`
  - `14138: try { endGameFromOpponentDeclaration(oppRep); } catch (eR) {}`
  - While it is set, no second retry chain starts.
- **Holds up:** (4) applying the partner's FINAL while this phone owes a conversion (`14122`).
- **Bound:** 400ms per timer; the deferral itself is at most 30s.

### `var:liveSince`
- **Deadline clock of:** `_rb2p_userOutcomeSendInProgress`.
- **Set:** 18647. **Cleared:** 18649 and 18653.
- **Gates:**
  - `18646: if (window._rb2p_userOutcomeSendInProgress === true && window._rb2p_userIsWaitingForOpponent !== true) {`
  - `18648: else if (Date.now() - liveSince > 20000) {`
  - `18649: window._rb2p_userOutcomeSendInProgress = false; liveSince = 0;`
- **Holds up:** (2). My drive-ends are swallowed until it expires.
- **Bound:** 20s.

### `var:outcomePollSince`
- **Deadline clock of:** `var:outcomePollBusy`.
- **Set:** 17635. **Cleared:** never; it is overwritten.
- **Gates:**
  - `17634: if (outcomePollBusy && Date.now() - outcomePollSince < 10000) return;`
- **Holds up:** (2) the REST receive poll for a hand-off.
- **Bound:** 10s.

### `var:pConvSince`
- **Deadline clock of:** the partner-conversion FINAL hold.
- **Set:** 18504. **Cleared:** 18503.
- **Gates:**
  - `18505: return Date.now() - pConvSince < 120000;`
  - This feeds `12915` (convLiveF) and `12999` (v346PatHold).
- **Holds up:** (4) the FINAL.
- **Bound:** 120s from first sight.

### `var:onsideSeenSinceMs`
- **Set:** 7307. **Cleared:** 7297 (init).
- **Gates:**
  - `7310: if (Date.now() - onsideSeenSinceMs < 3000) return;   // let it settle`
  - The onside safety net waits before returning a stale-engine onside stage to the kickoff.
- **Holds up:** (1) the kickoff and drive.
- **Bound:** 3s.

### `var:stuckMs`
- **Derived from:** `window.__rbStagingStuckSince`.
- **Set:** 15305. **Cleared:** local.
- **Gates:**
  - `15312: if (stuckMs > 1500) {`
  - The STUCK@staging neutralise-and-proceed waits.
- **Holds up:** (1).
- **Bound:** 1.5s. The >6s branch only logs now (reload disabled in V279).

---

## C. Upstream inputs: they set or clear registered latches, or route into them (14)

The feed family below decides when a play "settles" on the offense phone. A settle does three things:

1. It calls `_rb2p_noteQuarterPlayed` (4922 / 4927). That sets the registered `_rb2p_qSnappedThisQuarter`, which refuses quarter keeps (`7474`, `7547`), and clears `_rb2p_quarterResumePending`.
2. It records the flow `settle` spot (4932 → 18416–18419, `F.spot`). A spot with d=6 makes the recovery authority refuse RESTAGE (18912–18916).
3. It publishes the box. That part is content only.

All feed values are play-scoped: they reset at every snap (4658–4665) and at every dead ball after an emit (4718–4727).

### `window._rb2p_feedWasLive`
- **Set:** true at 4756. **Cleared:** 4663 and 4719.
- **Gates:**
  - `4772: var settledNow = window._rb2p_feedWasLive && !window._rb2p_feedEmitted &&`
  - `4796: if (settledNow) {`
- **Holds up:** (1) through the keep refusal and the RESTAGE spot.
- **Bound:** one play.

### `window._rb2p_feedEmitted`
- **Set:** true at 4856, 4868, 4959, 4963 and 4992. **Cleared:** 4664 and 4720.
- **Gates:**
  - `4772`, above.
  - `4718: if (bkp === 0 && window._rb2p_feedEmitted === true) {` (re-arm).
- **Holds up:** (1).
- **Bound:** one play. If it sticks true, settles stop until the next dead ball or snap.

### `window._rb2p_feedDown0`
- **Set:** 4660 and 4726. **Cleared:** never; it is overwritten.
- **Gates:** `4773: ((Number(fem.engineDownNumber) !== Number(window._rb2p_feedDown0)) ||`
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_feedYard0`
- **Set:** 4658 and 4724. **Cleared:** never; it is overwritten.
- **Gates:** `4774: (Math.abs(Number(fem.engineYardLineSigned) - Number(window._rb2p_feedYard0)) >= 0.5));`
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_feedIsKick`
- **Set:** 4659 and 4725. **Cleared:** never; it is overwritten.
- **Gates:**
  - `4854: var feedKick = window._rb2p_feedIsKick === true || (fem.rawEngineMatch && fem.rawEngineMatch._T11 === 1);`
  - `4855: if (feedKick) {`
  - A kick settle never marks the quarter played or records a spot.
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_feedSawSack`
- **Set:** true at 4740. **Cleared:** 4662 and 4722.
- **Gates:**
  - `4858: } else if (!(window._rb2p_feedSawSack === true ||` (the no-stat master gate)
  - The classification to 'sack' then passes the 4922 regex.
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_feedThrew`
- **Set:** true at 4738. **Cleared:** 4661 and 4721.
- **Gates:**
  - `4859: (window._rb2p_feedThrew === true && qbAttDelta > 0) ||`
  - Classification to 'incomplete'.
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_feedStat0`
- **Set:** 4671 and 4727 (per-player box baseline). **Cleared:** never; it is rebuilt.
- **Gates:**
  - `4807: var s0 = window._rb2p_feedStat0 || {};` feeds the deltas used by the master gate at 4858–4862.
  - `4922: if (window._rb2p_noteQuarterPlayed && /^(run|pass|incomplete|sack)$/.test(String(evt.k))) {`
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_offFumbleTotal`
- **Set:** 4997. **Cleared:** never.
- **Gates:**
  - `4974: var prevF = Number(window._rb2p_offFumbleTotal);`
  - `4975: if (isFinite(prevF) && totF > prevF) {`, then `4992: window._rb2p_feedEmitted = true;`
  - A fumble marks the play emitted, so that play never settles.
- **Holds up:** (1).
- **Bound:** one play.

### `window._rb2p_driveIntBase`
- **Set:** 4487. **Cleared:** never.
- **Gates:**
  - `4466: var iB = Number(window._rb2p_driveIntBase), fB = Number(window._rb2p_driveFumBase);` and `4467: if (!isFinite(iB) || !isFinite(fB)) return { known: false, intDelta: 0, fumDelta: 0 };`
  - This decides the drive-end type: `6023: if (dLic.known && dLic.intDelta + dLic.fumDelta === 0) return 'OTHER';`
    - An INT type arms the INT refresh-safety obligation (6293–6294 `_rb2p_saveTurnover`).
    - It also arms the pick-six heuristic: `6277: var heuristicSignal = (outcome.type === 'INT' && oppDelta >= 6);`, then `6304: return;   // skip normal INT-send`.
  - It sets the forced-end Vy: `7851: endVy = (v351Td && v351Td.known &&` and `7852: (v351Td.intDelta + v351Td.fumDelta) > 0) ? 8 : 23;`.
- **Holds up:** (2) it routes a drive-end into the cascade and the INT obligation, both registered.
- **Bound:** re-baselined at every WAIT→LIVE edge.

### `window._rb2p_driveFumBase`
- **Set:** 4488. **Cleared:** never.
- **Gates:** `4466` / `4467`, as above.
- **Holds up:** (2).
- **Bound:** as above.

### `window._rb2p_driveBasePrevWait`
- **Set:** 4490. **Cleared:** never.
- **Gates:**
  - `4484: if (!v350Wait && (window._rb2p_driveBasePrevWait !== false ||`
  - `4485: window._rb2p_driveIntBase == null)) {`
  - It decides when the two baselines above are refreshed.
- **Holds up:** (2), indirect.
- **Bound:** every 16ms tick.

### `var:rb2pIntLatch`
- **Set:** true at 5140. **Cleared:** 5104 and 5118.
- **Gates:**
  - `5121: if (rb2pIntLatch) return;   // already saved this play` (one provisional INT save per play)
  - `5114: if (rb2pIntLatch && userHasBall && typeof window._rb2p_resolveTurnover === 'function') {`, then `5115: window._rb2p_resolveTurnover(false);`
  - It gates writing and clearing the registered `storage:rb2p_pendingInt` / `room:turnover` obligation (5148–5151). After a reload that obligation parks the thrower and re-sends the INT.
- **Holds up:** (2).
- **Bound:** one play. It resets whenever the play is not live.

### `window._rb2p_lastAppliedOutcomeTs`
- **Set:** 17544, 17582 and 17699. **Cleared:** never.
- **Gates:**
  - `19215: if (opponentLivePayload.iHaveBall === true &&`
  - `19216: Number(opponentLivePayload.ts) < (Number(window._rb2p_lastAppliedOutcomeTs) || 0)) return;`
  - It drops the partner's live pushes before they reach `_rb2p_oppLiveRx` / `_rb2p_oppLiveRxAt` (registered).
  - A too-high value hides a live partner. TURN-HEAL (19175) and the field check's double-offense test (18307) then stand down, and hand-offs queued for this phone apply only once it is parked (12359).
- **Holds up:** (2).
- **Bound:** it is the partner's own clock, so every push sent after that hand-off passes.

---

## D. Weak: included only because they cannot be strictly ruled out (7)

### `window._rb2p_quarterMins`
- **Set:** 14370, 14382 and 19487. **Cleared:** never.
- **Gates:**
  - `6835: var qAg = Number(window._rb2p_quarterMins);` in `_rb2p_agreedQuarterSec`.
  - That becomes `4925: var fullQ = ...`, then `4927: if (clkQ > 0 && clkQ < fullQ - 0.5 && sinceQ > 1500) window._rb2p_noteQuarterPlayed(...)`.
  - It is the full-quarter threshold of the V394 "quarter played" rule. That rule sets `_rb2p_qSnappedThisQuarter`, which refuses quarter keeps.
  - Its other uses set clock values only: 5370, 7526, 13319 and 17957.
- **Holds up:** (1), only if it desyncs from the clock it is compared with.
- **Bound:** constant within a match unless `rooms/{code}/config/quarterMins` changes mid-match.
- **Case for non-blocking:** the governor top-up (6915) and the engine's `_Ws` (5370) use the same value, so the threshold matches the clock it is compared with.

### `room:config`
- **Written:** 14299, 14344, 14349, 14393, 17026, 17049 and 17072. **Removed:** never.
- **Read:** 16570 (resume) and the subscriptions at 17016–17075.
- **Gates:**
  - `17020: if (v === 1 || v === 2 || v === 3) {`
  - `17021: applyLengthLocal(v);`, which sets `14382: window._rb2p_quarterMins = mins;`
  - The subscription stays live during the match. This makes it the transport of the D-listed `_rb2p_quarterMins`. `diffMode` and `sharedDifficulty` only change difficulty.
- **Holds up:** (1), as for `_rb2p_quarterMins`.
- **Bound:** none.
- **Case for non-blocking:** as for `_rb2p_quarterMins`.

### `storage:fbAnonTok:realretrobowl2p`
- **Set:** 38 (`_fbSaveTok`, called at 75 and 88). **Loaded:** 35. **Cleared:** never.
- **Gates:**
  - `62: if (_fbTok && _fbTok.t && now < _fbTok.e - 300000) return _fbTok.t;`
  - `98: return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + t;`
  - Every REST call uses this token: hand-off REST send and re-send, the REST receive poll, acks, the flow chain and the heartbeat.
  - Nothing refreshes it on a 401, so a rejected but unexpired token fails every REST leg until its own expiry.
- **Holds up:** (2) hand-off delivery when the SDK socket is also dead.
- **Bound:** the token's `e`, at most about 55 minutes.

### `var:rearmPending`
- **Set:** true at 15842. **Cleared:** 15844 (in its own setTimeout).
- **Gates:**
  - `15841: if (!rearmPending) {`
  - `15845: if (Date.now() - lastRunMs > 250) hardened(cb);`
  - While it is set, a second frame-chain re-arm after a throwing frame is not scheduled.
- **Holds up:** (1). The engine frame loop plays every snap.
- **Bound:** 300ms; it clears itself.

### `window._rb2p_liveRestMs`
- **Set:** 17998. **Cleared:** never.
- **Gates:**
  - `17997: if (now - (Number(window._rb2p_liveRestMs) || 0) < 2000) return;`
  - This skips the REST mirror of the live push (`18004`) when the SDK did not confirm it.
  - The partner's `_rb2p_oppLiveRx` freshness windows (3–5s) are fed by this record.
- **Holds up:** (1) and (2), through the partner's freshness-gated rescuers.
- **Bound:** 2s.

### `window._rb2p_qAnchor`
- **Set:** 2766 (`_rb2p_armBallAnchor`, called from 8152). **Cleared:** retired at 2792 (7892, 8221, 8233); never deleted.
- **Gates:**
  - `2128: set engineYardLineSigned(v)     { m._6F = (typeof window._rb2p_ballGate === 'function') ? window._rb2p_ballGate(v) : v; },`
    - Every yard write passes the ball gate. When the gate does not stand down (2799–2803, 2856–2857), it returns `2874: return a.yard;`.
  - If that ever caught a conversion placement, the conversion gate would refuse: `9634: if (Math.abs(Number(em.engineYardLineSigned) - window._rb2p_CONV_SPOT_2PT) > 0.5)`, then `9635: return 'R3 the ball could not be placed on the 2 (at ' +`.
- **Holds up:** (3), in principle.
- **Bound:** 15s window (2801); retired at the first snap of the quarter.
- **Case for non-blocking:** E2 (2835, 2837) and E3 (2839) exempt every conversion placement path, so otherwise it only moves the spot.

### `window._rb2p_convPlacementMs`
- **Set:** 9626 and 9875, immediately before each conversion pin write. **Cleared:** never.
- **Gates:**
  - `2835: if (Date.now() - (Number(window._rb2p_convPlacementMs) || 0) < 1500)`
  - `2836: return 'E2 conversion placing the ball';`
  - This is the licence that stops the ball gate holding a conversion placement, which would be the R3 refusal above.
- **Holds up:** (3), in principle.
- **Bound:** 1.5s.
- **Case for non-blocking:** it is always stamped synchronously just before the write it licenses, so its value is never stale at the gate.

---

## Notes outside the classification

- **Unbounded awaits in `tryRestore`.** These are transport, not a key's value, so they did not change any classification. `tryRestore` (16271 onward) awaits these SDK `FB.get` reads with no timeout:
  - `live`, `snap`, `box`, `final`, `turnover`, `patDuty`, `outcomes` and `players`;
  - then `config` and `teams` (16570, 16577).

  A half-open socket there stalls the resume. This matches the inventory's note about `rb2p_skipResumeOnce`.
- **The can-act monitor is telemetry only.** Its timers are `emptySince`, `wedgeSince`, `statsSince`, `outSince` and `flowMineSince`. Its comment says "the recovery authority keys on it", but `_rb2p_canActState` is only called by its own 1s audit interval (18803). `_rb2p_recoverTick` never reads it, so those five timers are in the non-blocking list.
