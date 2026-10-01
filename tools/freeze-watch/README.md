# freeze-watch — the scheduled "why did games freeze?" run

Four times a day (9:00, 12:00, 15:00, 18:00, Mac local time) a LaunchAgent runs `run.sh`:

1. **precheck** (`precheck.js`, no model): real games since the last run → a brief with every frozen game not yet
   handled (R-FREEZE, last 3 days), the independent stuck measure (`tools/stuck-scan.js`) for the checker to be
   questioned against, players' bug reports, releases not yet audited against real games, and at 18:00 the day's
   noticeable non-freeze problems. Nothing new → the model is not started.
2. **the model** (Claude Opus 5.5, effort xhigh, unattended — `--permission-mode bypassPermissions`) follows
   `PROMPT.md`: audit the last release first, check the detector, ask "why" five times per freeze, fix the root in its
   own worktree `~/rb2p/wt-auto`, prove it (a test that fails on the live build and passes on the fix, the full
   regression `gate.sh`, the latch check), ship only when `quiet.js` says no real game is live, verify every door,
   write a report.
3. **the /goal loop**: if the run's `status.json` is not `done`, the same session is resumed (up to 4 turns) until it
   is or the time budget ends (2 h 40 min; the 18:00 run 5 h).
4. A macOS notification with the report's first lines.

Files (not in the repo): `~/rb2p/freeze-watch/`
- `reports/<run>.md` — what froze, why, what changed, the proof, what was not fixed
- `runs/<run>/` — the brief, the model's results (cost, session), status.json
- `logs/<run>.log` — the runner's log; `state.json` — lastRun, handled freezes, lastReleaseAudited

In the repo: `PROMPT.md` (the standing instructions), `OPEN.md` (known roots not fixed yet — the 6 pm run works the
top one when nothing new happened), `suites.txt` (the regression), `precheck.js`, `firings.js`, `quiet.js`, `gate.sh`.

Commands:
- run now: `bash ~/rb2p/two-player-rb/tools/freeze-watch/run.sh --force` (`--daily` adds the sweep, `--dry` = brief only)
- stop: `launchctl unload ~/Library/LaunchAgents/com.rb2p.freeze-watch.plist`; start/update: `tools/freeze-watch/install.sh`
- is a game live: `node tools/freeze-watch/quiet.js`; did a fix fire / help / harm: `node tools/freeze-watch/firings.js --pattern '…' --since …`

Safety: one run at a time (lock); never pushes while a real game is live (it waits up to 2 h, else leaves the commit
for the next run); new code that moves the ball / score / possession ships in shadow first; every release is audited
against real games by the next run; never deletes or writes a real room.
