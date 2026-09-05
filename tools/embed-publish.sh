#!/bin/bash
# tools/embed-publish.sh — put THIS tree's game into the Google Sites embed.
#
# The Google Sites page holds a 1.7 KB bootstrap that fetches ONE document,
# rooms-less and public-read, from Firebase RTDB:
#   https://realretrobowl2p-default-rtdb.firebaseio.com/embedcode/selfcontained.json
# and shows it in an iframe (srcdoc). Replacing that document updates the live
# site on its next load — no Sites edit, no re-paste, no publish.
#
# This script builds the self-contained HTML from the repo it lives in (engine,
# every html5game asset and the images inlined), stores it, stamps
# /embedcode/meta {ver, commit, ts}, and then VERIFIES by reading the stored
# document back and finding the build label in it. Exit 0 only when the label
# in Firebase is the label in index.html.
#
# Needs the firebase CLI logged in as the project owner (it is, on this Mac).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
PROJECT="realretrobowl2p"
DB="https://realretrobowl2p-default-rtdb.firebaseio.com"
VER="$(grep -o 'GAME — V[0-9]*' index.html | head -1 | grep -o 'V[0-9]*')"
[ -n "$VER" ] || { echo "no build label in index.html"; exit 2; }
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "[embed] building $VER ($COMMIT) from $REPO"
mkdir -p build
python3 tools/build-selfcontained.py "$REPO" build/GSITES-SELFCONTAINED.html
python3 - <<EOF
import json, time
html = open('build/GSITES-SELFCONTAINED.html', encoding='utf-8').read()
assert 'GAME — $VER' in html, 'built document does not carry the label $VER'
open('build/sc.json', 'w').write(json.dumps(html))
open('build/meta.json', 'w').write(json.dumps({'ver': '$VER', 'commit': '$COMMIT', 'ts': int(time.time() * 1000),
                                               'bytes': len(html.encode('utf-8'))}))
print('[embed] %.1f MB, label ok' % (len(html) / 1048576))
EOF
echo "[embed] storing /embedcode/selfcontained"
firebase database:set /embedcode/selfcontained build/sc.json --project "$PROJECT" --force >/dev/null
firebase database:set /embedcode/meta build/meta.json --project "$PROJECT" --force >/dev/null
echo "[embed] verifying what Firebase now serves"
STORED="$(curl -fsS "$DB/embedcode/selfcontained.json" | grep -o 'GAME — V[0-9]*' | head -1 | grep -o 'V[0-9]*')"
META="$(curl -fsS "$DB/embedcode/meta/ver.json" | tr -d '"')"
if [ "$STORED" = "$VER" ] && [ "$META" = "$VER" ]; then
    echo "[embed] OK — the Google Sites embed now serves $VER"
else
    echo "[embed] FAILED — stored=$STORED meta=$META wanted=$VER"; exit 1
fi
