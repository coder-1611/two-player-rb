#!/bin/bash
# tools/install-elo.sh — V500 (the owner: "create an elo system ... like chess elo"). One LaunchAgent on this Mac:
#   com.rb2p.elo   every minute (V510; was 2): tools/elo.js — rates the finished games the phones noted (rooms/~elo/q) and publishes
#                  embedcode/elo (the board, each player, each game's change); its truth is .rb2p/elo/state.json
# Install from the MAIN tree (~/Projects/two-player-rb). Re-run to update; `launchctl unload ~/Library/LaunchAgents/com.rb2p.elo.plist` stops it.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
RB2P="$HOME/Projects/two-player-rb/.rb2p"
mkdir -p "$HOME/Library/LaunchAgents" "$RB2P/elo"
LABEL=com.rb2p.elo
cat > "$HOME/Library/LaunchAgents/$LABEL.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$REPO/tools/elo.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$RB2P/elo.log</string>
  <key>StandardErrorPath</key><string>$RB2P/elo.log</string>
</dict></plist>
PL
launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "installed $LABEL -> $RB2P/elo.log"
