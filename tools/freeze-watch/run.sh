#!/bin/bash
# tools/freeze-watch/run.sh — one scheduled freeze-watch run (LaunchAgent com.rb2p.freeze-watch: 9:00, 12:00, 15:00,
# 18:00). See tools/freeze-watch/README.md.
#
#   run.sh            what the schedule runs (18:00 adds the daily sweep)
#   run.sh --force    run the model even if the precheck finds nothing new
#   run.sh --daily    include the daily sweep at any hour
#   run.sh --dry      precheck only: write the brief, start nothing
#
# Runtime files (not in the repo): ~/Projects/two-player-rb/.rb2p/freeze-watch/{state.json, logs/, runs/<id>/, reports/, lock}
# V428: ~/.local/bin first — the native, self-updating Claude Code. /usr/local/bin held an old npm copy (2.1.247) that
# the API refused for this model on 2026-10-01 ("version 2.1.280 or newer is required"): the 9:00 and 12:00 runs died.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
CLAUDE="${FW_CLAUDE:-$HOME/.local/bin/claude}"; [ -x "$CLAUDE" ] || CLAUDE="$(command -v claude)"   # FW_CLAUDE: a test seam
FW="$HOME/Projects/two-player-rb/.rb2p/freeze-watch"; WT="$HOME/Projects/two-player-rb/.rb2p/wt-auto"; MAIN="$HOME/Projects/two-player-rb"
MODEL="claude-opus-5-5"; EFFORT="xhigh"
mkdir -p "$FW/logs" "$FW/runs" "$FW/reports"
RUN_ID="$(date +%Y%m%d-%H%M)"; RUN_DIR="$FW/runs/$RUN_ID"; mkdir -p "$RUN_DIR"
exec >> "$FW/logs/$RUN_ID.log" 2>&1
echo "=== freeze-watch run $RUN_ID ($(date)) ==="
DAILY=""; FORCE=""; DRY=""
[ "$(date +%H)" -ge 18 ] && DAILY="--daily"
for a in "$@"; do case "$a" in --daily) DAILY="--daily";; --force) FORCE=1;; --dry) DRY=1;; esac; done

# one run at a time (a lock older than 6 h is a crashed run)
if ! mkdir "$FW/lock" 2>/dev/null; then
  if [ $(( $(date +%s) - $(stat -f %m "$FW/lock") )) -gt 21600 ]; then rm -rf "$FW/lock"; mkdir "$FW/lock"; else echo "another run holds the lock — exit"; exit 0; fi
fi
trap 'rm -rf "$FW/lock"' EXIT

# the run's own worktree, on the live commit (an unpushed commit left by a run that a live game blocked is kept)
git -C "$MAIN" fetch -q origin
if [ ! -d "$WT/.git" ] && [ ! -f "$WT/.git" ]; then
  git -C "$MAIN" worktree add -B auto "$WT" origin/main || { echo "worktree add failed"; exit 1; }
fi
[ -e "$WT/e2e/node_modules" ] || ln -s "$HOME/.cache/two-player-rb-e2e/node_modules" "$WT/e2e/node_modules"
AHEAD=$(git -C "$WT" rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$AHEAD" -gt 0 ]; then
  echo "kept $AHEAD unpushed commit(s) from the last run; rebasing onto origin/main"
  git -C "$WT" stash -q 2>/dev/null; git -C "$WT" rebase -q origin/main || { git -C "$WT" rebase --abort; echo "rebase conflict — dropped them (the report of that run has the analysis)"; git -C "$WT" reset -q --hard origin/main; }
else
  git -C "$WT" checkout -q -B auto origin/main && git -C "$WT" reset -q --hard origin/main && git -C "$WT" clean -qfd -e e2e/node_modules
fi
echo "worktree at $(git -C "$WT" log --oneline -1)"
# the test ports serve the right trees: 8801 this run's worktree, 8802 the live build (the main tree)
bash "$WT/tools/freeze-watch/own-port.sh" 8801 "$WT"; bash "$WT/tools/freeze-watch/own-port.sh" 8802 "$MAIN"

# what happened since the last run
BRIEF="$RUN_DIR/brief.md"
(cd "$WT" && node tools/freeze-watch/precheck.js --out "$BRIEF" $DAILY); PC=$?
[ "$PC" -ne 0 ] && [ "$PC" -ne 3 ] && { echo "precheck failed ($PC)"; osascript -e 'display notification "precheck failed — see the log" with title "Retro Bowl freeze-watch"' ; exit 1; }
mark_run() { node -e "const f='$FW/state.json',fs=require('fs');let s={};try{s=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){};s.lastRun=$1;s.handled=s.handled||{};fs.writeFileSync(f,JSON.stringify(s,null,1))"; }
if [ -n "$DRY" ]; then echo "dry run — brief at $BRIEF"; exit 0; fi
if [ "$PC" -eq 3 ] && [ -z "$FORCE" ]; then
  echo "nothing new — the model is not started"; mark_run "$(node -e 'console.log(Date.now())')"; exit 0
fi

# the model, with a time budget (the next run is 3 h later; the 6 pm run may go to 23:00)
BUDGET=$((2 * 3600 + 40 * 60)); [ -n "$DAILY" ] && BUDGET=$((5 * 3600))
END=$(( $(date +%s) + BUDGET ))
PROMPT="Freeze-watch run $RUN_ID. Read your standing instructions first, completely: $WT/tools/freeze-watch/PROMPT.md. This run's brief: $BRIEF. Work in $WT (test port 8801; the live build for comparisons: the main tree on 8802). Run id for reports/$RUN_ID.md and runs/$RUN_ID/status.json: $RUN_ID.$( [ -n "$DAILY" ] && echo ' This is the 6 pm run: do the daily sweep too.') Write the report, state.json and status.json by $(date -r $END +%H:%M) at the latest."
ask() {   # ask <n> <prompt> [session] — one claude turn, killed at END
  local n=$1 p=$2 sid=$3
  local args=(-p "$p" --model "$MODEL" --effort "$EFFORT" --permission-mode bypassPermissions --add-dir "$HOME/Projects/two-player-rb" --output-format json)
  [ -n "$sid" ] && args=(--resume "$sid" "${args[@]}")
  (cd "$HOME/Projects" && "$CLAUDE" "${args[@]}" > "$RUN_DIR/result-$n.json" 2> "$RUN_DIR/stderr-$n.txt") &
  local pid=$!
  while kill -0 $pid 2>/dev/null; do
    sleep 20
    if [ "$(date +%s)" -ge "$END" ]; then echo "time budget reached — stopping turn $n"; pkill -TERM -P $pid 2>/dev/null; kill -TERM $pid 2>/dev/null; sleep 5; break; fi
  done
  wait $pid 2>/dev/null
  node -e "try{const j=JSON.parse(require('fs').readFileSync('$RUN_DIR/result-$n.json','utf8'));console.log('turn $n: '+(j.subtype||j.stop_reason||'?')+' cost \$'+(j.total_cost_usd||0).toFixed(2)+' session '+j.session_id)}catch(e){console.log('turn $n: no result')}"
}
# V428: an error from the model itself (API refusal, auth, quota) ends the run at once, with the reason — resuming the
# session cannot fix it, and a run that quietly did nothing looks like a quiet day
err_of() { node -e "try{const j=JSON.parse(require('fs').readFileSync('$RUN_DIR/result-$1.json','utf8'));if(j.is_error)console.log(String(j.result||j.subtype||'error').slice(0,300))}catch(e){console.log('no result from the model (see stderr-$1.txt)')}"; }
fail_run() {
  echo "MODEL ERROR: $1"
  printf '# Freeze-watch %s — the run could not work\n\nThe model call failed: %s\n\nNothing was analysed or changed. CLI: %s (%s).\n' "$RUN_ID" "$1" "$CLAUDE" "$("$CLAUDE" --version 2>/dev/null)" > "$FW/reports/$RUN_ID.md"
  osascript -e "display notification \"$(echo "$1" | cut -c1-150 | sed 's/"/\\"/g')\" with title \"Retro Bowl freeze-watch FAILED $RUN_ID\"" 2>/dev/null
  echo "=== end $(date) ==="; exit 1
}
sid_of() { node -e "try{console.log(JSON.parse(require('fs').readFileSync('$RUN_DIR/result-$1.json','utf8')).session_id||'')}catch(e){console.log('')}"; }
done_of() { node -e "try{const s=JSON.parse(require('fs').readFileSync('$RUN_DIR/status.json','utf8'));console.log(s.done===true?'yes':'no: '+(s.why||''))}catch(e){console.log('no: no status.json written')}"; }

ask 1 "$PROMPT" ""
E=$(err_of 1); [ -n "$E" ] && [ "$(date +%s)" -lt "$END" ] && fail_run "$E"
# the /goal loop: until the run's own completion condition holds (status.json done), or time is up, or 4 turns
for n in 2 3 4; do
  D=$(done_of); [ "$D" = "yes" ] && break
  [ "$(date +%s)" -ge $((END - 600)) ] && { echo "not done ($D) and under 10 min left — stopping"; break; }
  SID=$(sid_of $((n - 1))); [ -z "$SID" ] && { echo "no session to resume"; break; }
  echo "not done ($D) — resuming the session (turn $n)"
  ask $n "The run's completion condition is not met yet (status: $D). Re-read the 'Done when' section of $WT/tools/freeze-watch/PROMPT.md and continue from where you are. Remember the gates and quiet.js before any push. Write the report, state.json and status.json by $(date -r $END +%H:%M)." "$SID"
  E=$(err_of $n); [ -n "$E" ] && [ "$(date +%s)" -lt "$END" ] && fail_run "$E"
done

REPORT="$FW/reports/$RUN_ID.md"
SUMMARY=$( [ -f "$REPORT" ] && grep -v '^\s*$' "$REPORT" | grep -v '^#' | head -2 | cut -c1-180 | tr '\n' ' ' || echo "no report written — see the log" )
echo "status: $(done_of)"; echo "report: $REPORT"
osascript -e "display notification \"$(echo "$SUMMARY" | sed 's/"/\\"/g')\" with title \"Retro Bowl freeze-watch $RUN_ID\"" 2>/dev/null
echo "=== end $(date) ==="
