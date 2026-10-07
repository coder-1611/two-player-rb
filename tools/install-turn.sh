#!/bin/bash
# tools/install-turn.sh — V503: the LaunchAgent com.rb2p.turn (every 30 minutes: tools/turn-publish.js publishes the relay's
# credentials in the database, embedcode/turn, for the doors that cannot reach vercel.app). The Cloudflare key is copied
# from mac-remote's LaunchAgent (com.macremote.turnrefresh) into this one's environment by plistlib — never printed, never in
# the repo. Install from the MAIN tree; re-run to update; `launchctl unload ~/Library/LaunchAgents/com.rb2p.turn.plist` stops it.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
RB2P="$HOME/Projects/two-player-rb/.rb2p"
mkdir -p "$HOME/Library/LaunchAgents" "$RB2P"
LABEL=com.rb2p.turn
REPO="$REPO" NODE="$NODE" RB2P="$RB2P" LABEL="$LABEL" python3 - <<'PY'
import os, plistlib
src = plistlib.load(open(os.path.expanduser('~/Library/LaunchAgents/com.macremote.turnrefresh.plist'), 'rb'))
env = src.get('EnvironmentVariables', {})
if not env.get('CF_TURN_KEY_ID') or not env.get('CF_TURN_API_TOKEN'): raise SystemExit('the mac-remote plist has no Cloudflare key')
p = {
    'Label': os.environ['LABEL'],
    'ProgramArguments': [os.environ['NODE'], os.environ['REPO'] + '/tools/turn-publish.js'],
    'EnvironmentVariables': { 'PATH': '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', 'HOME': os.path.expanduser('~'),
                              'CF_TURN_KEY_ID': env['CF_TURN_KEY_ID'], 'CF_TURN_API_TOKEN': env['CF_TURN_API_TOKEN'] },
    'WorkingDirectory': os.environ['REPO'], 'RunAtLoad': True, 'StartInterval': 1800,
    'StandardOutPath': os.environ['RB2P'] + '/turn.log', 'StandardErrorPath': os.environ['RB2P'] + '/turn.log',
}
path = os.path.expanduser('~/Library/LaunchAgents/' + os.environ['LABEL'] + '.plist')
with open(path, 'wb') as f: plistlib.dump(p, f)
os.chmod(path, 0o600)
PY
launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "installed $LABEL -> $RB2P/turn.log"
