#!/bin/bash
# tools/install-plays-archive.sh — V458: run tools/plays-archive.js every hour on this Mac (LaunchAgent
# com.rb2p.plays-archive): recorded plays move from Firebase to ~/Projects/two-player-rb/.rb2p/plays-archive after
# 24 h, archived plays are deleted after 30 days, and the recording guard (embedcode/playrec) is published — the
# phones record only while it is fresh, so unloading this agent stops the recording within 26 h.
# Re-run to update; `launchctl unload ~/Library/LaunchAgents/com.rb2p.plays-archive.plist` to stop.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
FIREBASE_BIN="$(command -v firebase)"
LABEL="com.rb2p.plays-archive"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Projects/two-player-rb/.rb2p/plays-archive.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Projects/two-player-rb/.rb2p"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$REPO/tools/plays-archive.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
    <key>FIREBASE_BIN</key><string>$FIREBASE_BIN</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed $LABEL (every hour) -> $LOG"
sleep 8
tail -n 3 "$LOG" 2>/dev/null || true
