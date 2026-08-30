#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
cat tools/local-patch/lm/m0.js tools/local-patch/lm/m1.js tools/local-patch/lm/m2.js tools/local-patch/lm/m3.js tools/local-patch/lm/m4.js > www/local-music.js
cp -f www/local-music.js local-music.js 2>/dev/null || true
wc -c www/local-music.js
echo "joined OK"
