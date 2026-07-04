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
