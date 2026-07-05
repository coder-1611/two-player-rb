# WebKit testing environment (the phone-analog)

Real Safari engine (Playwright WebKit) + iPhone viewport + real Firebase 2P
flow. Built V244-era to reproduce the phone GET READY stall without a phone.
Playwright lives in the session scratchpad `pw/` (npm i playwright && npx
playwright install webkit if missing).

- `pw-2p.js`      — full 2P match (two WebKit pages, join/ready/match), then
                    judges stuck-vs-plays. NOTE: judge with DRAGS not taps —
                    taps NEVER snap (that false-positived once).
- `pw-resume.js`  — phase 1 fresh-match drags; phase 2 reload→resume→drags.
- `pw-zombie.js`  — _Y41 all-crash sim (the 'shielded x22' phone log) + drags.
- `pw-input-dbg2.js` — input-pipeline autopsy (re-registers engine listeners).

## Eliminated as root cause (all play CLEAN in this env)
- WebKit input path (drags snap fine; engine handlers fire; slot-0 correct)
- zombie players from shielded _Y41 crashes (plays fine even all-crashing)
- resume-after-reload flow (plays clean)
- WebGL context loss (V242 telemetry: gl:ok during device stall)
- engine loop death (V241 telemetry: eng:60 during device stall)

## Not yet tried (escalation queue)
- touch-gesture CANCELLATION (iOS stealing drags: pointercancel mid-drag —
  needs realistic touch-drag dispatch; check CSS touch-action coverage on the
  rotated body chain)
- visualViewport/toolbar resize events mid-match (stale __rbVirt remap)
- fresh-storage boot (welcome popup) racing the 2P match start
- CPU-hog (main-thread stalls) DURING match-room construction in the 2P flow
- GPU/memory pressure; back-to-back matches in one session; second match after
  a completed one

## pw-phone.js — phone-fidelity env (V246 era)

Observation-only (NO input ever — per user directive: "the GET READY screen
being there itself means it doesn't work"). Dials, combinable:

- `HOG=0..95` + `SLICE=ms` — main-thread CPU starvation from boot (big SLICE
  = long janky freezes). `HOG=0` = healthy baseline.
- `BG=1` — iOS screen-lock sim after READY: rAF suspended + intervals ~1Hz +
  document.hidden faked, 20s, then foreground.
- `NET=1` — network dropped for the same 20s window (radio off on lock).
- `FRESH=1` — localStorage/IndexedDB wiped at boot (iOS evicts site data).

Verdict = does the offense side still show GET READY/staging at t+30s
(engine state + diag box + screenshot) vs the recorded healthy baseline
(play field, banner clears ~3s, btn:0).

### Results (all CLEAN — none reproduced the stall)
HOG=70 · HOG=90/SLICE=250 (12fps) · BG=1 (fps:0 + watchdog kicks, exactly the
phone's telemetry signature, then full recovery) · BG=1+NET=1 · FRESH+HOG=70.

### Root-cause conclusion (V246)
Everything engine-side is eliminated; the one device fact no env can copy is
the phone GPU compositor. Device evidence: eng:60 fps:60 gl:ok ball:1 while
the user sees frozen staging panels, AND the canvas-readback telemetry
snapshot differed from what the user reported seeing → the game renders,
the SCREEN doesn't update: the compositor froze the canvas layer. Trigger
setup: WebGL canvas inside the rotate(-90deg) transformed <body> (rb-rot90),
poked by the engine's Application Surface resize at match entry.
V246 fix: own compositor layer for the canvas (will-change + translateZ(0),
layout() no longer sets transform:none), display-flip layer rebuild at
match entry, identity-transform nudge every diag tick. Headless cannot
verify the fix (no phone compositor) — device confirmation pending.

## THE GET READY HANG — REPRODUCED + ROOT CAUSE + FIX (V249)

Repro: `node pw-hang4.js --w 0 --h 0` (pre-V249 build) — deterministic,
3/3 runs: >36s frozen frame over a live drive (state: inMatch, ball:1,
kp:2, clk parked; watchdog kicks climbing) after a resize event lands
while window.innerWidth/innerHeight are degenerate (phone lock /
app-switch / toolbar transition), which the __bg lock gate + __glitch
injector simulate. pw-hang.js (lock-only), pw-hang2.js (duplicate tab),
pw-hang3.js (pixel-verdict + hog) are the eliminated escalations.

ROOT CAUSE (caught by instrumentation, hang4 state dump):
  css:"0px/0px"  virt:"NaNxNaN"  — the mobile bootstrap's layout()
consumed the degenerate dims and wrote 0px canvas CSS + a zeroed/NaN
__rbVirt. Screen = stale composited frame (the GET READY staging screen
on a phone); input = NaN tap mapping (device telemetry's gui-mouse
pinned at 0,24). Engine/logic/Firebase healthy throughout — which is
why every engine-side theory (compositor, loops, GL, WebKit input,
zombies) tested clean. layout() was event-driven with no validation and
no retry, so one poisoned resize was permanent until the user refreshed.

FIX (V249, verified in this env — same glitch now plays green 36s):
  1. layout() rejects dims < 100 and self-retries (index.html).
  2. _tI2/_uI2 clamp to last-good dims (retrobowl.js) — engine-side hole
     where innerWidth=0 passed the "is a number" check into canvas.width.
  3. Heartbeat self-heal: degenerate canvas buffer, collapsed element
     rect, or non-finite __rbVirt → re-run layout() (index.html).
Regressions green: pw-resume both phases, pw-phone baseline, pick-6 37/37.
