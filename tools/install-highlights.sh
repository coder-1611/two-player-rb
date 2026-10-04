#!/bin/bash
# tools/install-highlights.sh — V458: the daily highlights on this Mac (LaunchAgent com.rb2p.highlights): every day at
# 6 pm, tools/highlights/daily.js has Claude Sonnet 5.5 choose the five most incredible plays of the last 24 hours and
# writes them as videos to ~/Projects/two-player-rb/highlight plays/YYYY-MM-DD/ (with README.md). 6:30 pm is a second
# chance (a day already done exits at once); a Mac asleep at 6 pm runs it when it wakes.
#
#   bash tools/install-highlights.sh            install (or update) and print the schedule launchd now holds
#   bash tools/install-highlights.sh --now      also start one run right away (it will not redo a finished day)
# Stop: launchctl unload ~/Library/LaunchAgents/com.rb2p.highlights.plist   Log: ~/Projects/two-player-rb/.rb2p/highlights.log
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LABEL="com.rb2p.highlights"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Projects/two-player-rb/.rb2p/highlights.log"
CLAUDE_BIN="$HOME/.local/bin/claude"; [ -x "$CLAUDE_BIN" ] || CLAUDE_BIN="$(command -v claude)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Projects/two-player-rb/.rb2p"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$REPO/tools/highlights/daily.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
    <key>HL_CLAUDE</key><string>$CLAUDE_BIN</string>
    <key>RB_E2E_PORT</key><string>8803</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>Nice</key><integer>5</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
plutil -lint "$PLIST" >/dev/null
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed $LABEL: every day at 18:00 (and 18:30) -> $LOG"
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|program =|Hour|Minute|path =" | head -12 || true
if [ "$1" = "--now" ]; then launchctl kickstart "gui/$(id -u)/$LABEL" && echo "started one run now"; fi
