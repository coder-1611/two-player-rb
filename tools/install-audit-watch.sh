#!/bin/bash
# tools/install-audit-watch.sh — run the game auditor forever on this Mac.
# Installs a LaunchAgent (KeepAlive) that runs tools/audit-watch.js, the way
# the token dashboard is installed. Re-run to update; `launchctl unload` to stop.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LABEL="com.rb2p.audit-watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/rb2p/audit-watch.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/rb2p"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$REPO/tools/audit-watch.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed $LABEL -> $LOG"
sleep 2
tail -n 3 "$LOG" 2>/dev/null || true
