#!/bin/bash
# tools/install-fb-watch.sh — V491 (the owner: "have a backup for firebase in case it is disabled due to overuse, e.g.
# store the data somewhere else as well and make sure I find out about any outages"). Two LaunchAgents on this Mac:
#   com.rb2p.fb-watch   every 10 minutes: tools/fb-watch.js — the database answering, Firebase's usage meters, alerts
#                       (a macOS notification + the GitHub workflow firebase-watch.yml, which opens an issue that emails)
#   com.rb2p.fb-backup  3:30 am: tools/fb-backup.js --auto — the day's rooms + the small nodes (a full backup on the 1st)
#                       into .rb2p/firebase-backup/, a copy to iCloud Drive ("Retro Bowl 2P backups"), old ones pruned
# GitHub's own 15-minute check (.github/workflows/firebase-watch.yml) needs nothing installed.
# Re-run to update; `launchctl unload ~/Library/LaunchAgents/com.rb2p.fb-watch.plist` (or fb-backup) to stop one.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
RB2P="$HOME/Projects/two-player-rb/.rb2p"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Retro Bowl 2P backups"
mkdir -p "$HOME/Library/LaunchAgents" "$RB2P"
plist() {   # label, schedule xml, log, args...
  local LABEL="$1" SCHED="$2" LOG="$3"; shift 3
  local ARGS=""; for a in "$@"; do ARGS="$ARGS    <string>$a</string>
"; done
  cat > "$HOME/Library/LaunchAgents/$LABEL.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
$ARGS  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
$SCHED
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
  launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null || true
  launchctl load "$HOME/Library/LaunchAgents/$LABEL.plist"
  echo "installed $LABEL -> $LOG"
}
plist com.rb2p.fb-watch "  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>600</integer>" "$RB2P/fb-watch.log" "$NODE" "$REPO/tools/fb-watch.js"
plist com.rb2p.fb-backup "  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>" \
  "$RB2P/fb-backup.log" "$NODE" "$REPO/tools/fb-backup.js" --auto --copy-to "$ICLOUD" --prune
sleep 10
tail -n 2 "$RB2P/fb-watch.log" 2>/dev/null || true
