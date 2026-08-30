#!/bin/bash
set -e
cd "$(dirname "$0")/../.." || cd ~/Radio1
cat tools/local-patch/lm/m0.js tools/local-patch/lm/m1.js tools/local-patch/lm/m2.js > www/local-music.js
cp -f www/local-music.js local-music.js 2>/dev/null || true
wc -c www/local-music.js
grep -q local-music.js www/index.html || sed -i 's|<script src="script.js"></script>|<script src="script.js"></script>\n  <script src="local-music.js"></script>|' www/index.html
echo JOINED_OK
