cat tools/local-patch/lm/*.b64 | tr -d '\n' | base64 -d > www/local-music.js
cp www/local-music.js local-music.js 2>/dev/null || true
md5sum www/local-music.js
# expected md5: 7d4ea220d9c58dd86faed74d0a6795f0
