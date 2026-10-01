#!/bin/bash
# tools/freeze-watch/own-port.sh PORT DIR — make sure the test server on PORT serves DIR. The e2e harness REUSES any
# server already on its port, so a server left by another worktree's run would make the tests run THAT tree's files
# (V427: after the V426 gate, port 8801 still served ~/rb2p/wt-fw). A test server (python http.server) on PORT whose
# working directory is not DIR is stopped; the harness then starts its own. Nothing else is ever touched.
PORT=$1; DIR=$(cd "$2" && pwd -P)
for pid in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); do
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
  [ "$(cd "$cwd" 2>/dev/null && pwd -P)" = "$DIR" ] && continue
  if ps -o command= -p "$pid" | grep -q "http.server $PORT"; then
    kill "$pid" && echo "port $PORT was served from $cwd — stopped it (tests here must serve $DIR)"
  else
    echo "port $PORT is held by something that is not a test server ($(ps -o comm= -p "$pid")) — not touching it"; exit 1
  fi
done
exit 0
