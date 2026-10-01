#!/bin/bash
# tools/freeze-watch/install.sh — schedule the freeze-watch run at 9:00, 12:00, 15:00 and 18:00 (local time) every day.
# The LaunchAgent runs the copy of run.sh in the MAIN tree (~/rb2p/two-player-rb), which always holds the live
# commit. Re-run to update; `launchctl unload ~/Library/LaunchAgents/com.rb2p.freeze-watch.plist` to stop.
set -e
LABEL="com.rb2p.freeze-watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUN="$HOME/rb2p/two-player-rb/tools/freeze-watch/run.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/rb2p/freeze-watch/logs"
slot() { echo "    <dict><key>Hour</key><integer>$1</integer><key>Minute</key><integer>0</integer></dict>"; }
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$RUN</string></array>
  <key>StartCalendarInterval</key><array>
$(slot 9)
$(slot 12)
$(slot 15)
$(slot 18)
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$HOME/rb2p/freeze-watch/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/rb2p/freeze-watch/logs/launchd.err.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed $LABEL: 9:00, 12:00, 15:00, 18:00 -> $RUN"
