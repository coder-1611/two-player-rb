#!/bin/bash
# tools/install-rbstats.sh — the owner, 8 Oct: 2rbstats.vercel.app "should update every 10 minutes". One LaunchAgent:
#   com.rb2p.rbstats   every 10 minutes: tools/rbstats.js — the game's visit log -> embedcode/rbstats/v1 (public), the
#                      numbers the site reads (visitors, page views, distinct devices; per door and period)
# Install from the MAIN tree (~/Projects/two-player-rb). Re-run to update; `launchctl unload ~/Library/LaunchAgents/com.rb2p.rbstats.plist` stops it.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
RB2P="$HOME/Projects/two-player-rb/.rb2p"
mkdir -p "$HOME/Library/LaunchAgents" "$RB2P"
LABEL=com.rb2p.rbstats
cat > "$HOME/Library/LaunchAgents/$LABEL.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$REPO/tools/rbstats.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>600</integer>
  <key>StandardOutPath</key><string>$RB2P/rbstats.log</string>
  <key>StandardErrorPath</key><string>$RB2P/rbstats.log</string>
</dict></plist>
PL
launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "installed $LABEL -> $RB2P/rbstats.log"
