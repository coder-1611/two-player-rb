#!/bin/bash
# tools/install-highlights.sh — V458: the daily highlights on this Mac (LaunchAgent com.rb2p.highlights): V469 (the owner:
# "make the sonnet run every morning at 5 am") every day at 5 am, tools/highlights/daily.js has Claude Sonnet 5.5 choose
# the five most incredible plays since the last run (24 h) and writes them as videos to
# ~/Projects/two-player-rb/highlight plays/YYYY-MM-DD/ (with README.md); the top 3 go on the front page. 5:30 and 7 am are
# second chances (a day already done and judged exits at once; one whose judge failed is tried again); a Mac asleep at
# 5 am runs it when it wakes.
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
    <dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>Nice</key><integer>5</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
plutil -lint "$PLIST" >/dev/null
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed $LABEL: every day at 05:00 (and 05:30, 07:00) -> $LOG"
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|program =|Hour|Minute|path =" | head -12 || true
if [ "$1" = "--now" ]; then launchctl kickstart "gui/$(id -u)/$LABEL" && echo "started one run now"; fi
