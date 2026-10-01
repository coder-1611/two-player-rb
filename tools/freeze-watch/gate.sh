#!/bin/bash
# tools/freeze-watch/gate.sh PORT [OUTDIR] — the full regression in THIS worktree: every suite in suites.txt (4 at a
# time) and e2e/run.js. Prints a summary; exit 0 only if every suite passed and run.js is 15/15 (or its N/N).
# A failure is re-run once on its own (a parallel-load flake must not pass silently, and must not block a good build):
# both results are printed.
PORT=${1:-8801}
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT=${2:-$HOME/rb2p/freeze-watch/gate-$(date +%Y%m%d-%H%M)}
mkdir -p "$OUT"; cd "$REPO" || exit 2
bash tools/freeze-watch/own-port.sh "$PORT" "$REPO" || { echo "GATE RED — port $PORT is not usable"; exit 1; }
SUITES=$(grep -v '^#' tools/freeze-watch/suites.txt | grep -v '^\s*$')
n=0
for s in $SUITES; do
  [ -f "e2e/$s.js" ] || { echo "$s | MISSING" >> "$OUT/_missing.txt"; continue; }
  (RB_E2E_PORT=$PORT node "e2e/$s.js" > "$OUT/$s.log" 2>&1) &
  n=$((n+1)); [ $((n % 4)) -eq 0 ] && wait
done
wait
RB_E2E_PORT=$PORT node e2e/run.js > "$OUT/run.log" 2>&1
ok=1
for s in $SUITES; do
  r=$(grep -E '=== [0-9]+ passed, [0-9]+ failed' "$OUT/$s.log" 2>/dev/null | tail -1)
  if ! echo "$r" | grep -q ' 0 failed'; then
    RB_E2E_PORT=$PORT node "e2e/$s.js" > "$OUT/$s.rerun.log" 2>&1
    r2=$(grep -E '=== [0-9]+ passed, [0-9]+ failed' "$OUT/$s.rerun.log" | tail -1)
    echo "$s | FIRST: ${r:-no result} | ALONE: ${r2:-no result}"
    echo "$r2" | grep -q ' 0 failed' || ok=0
    grep -h "FAIL" "$OUT/$s.log" "$OUT/$s.rerun.log" | cut -c1-300 | sed 's/^/    /'
  fi
done
rj=$(grep -E 'passed' "$OUT/run.log" | tail -1); echo "run.js | $rj"
echo "$rj" | awk '{ if (match($0, /[0-9]+\/[0-9]+ passed/)) { split(substr($0, RSTART, RLENGTH), p, /[\/ ]/); exit !(p[1] == p[2] && p[1] > 0) } exit 1 }' || ok=0
[ -f "$OUT/_missing.txt" ] && { cat "$OUT/_missing.txt"; ok=0; }
cnt=$(echo "$SUITES" | wc -l | tr -d ' ')
[ $ok = 1 ] && echo "GATE GREEN ($cnt suites + run.js) — logs in $OUT" || echo "GATE RED — logs in $OUT"
[ $ok = 1 ]
