#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.." || cd ~/Radio1
mkdir -p /tmp/radio1-patch
for i in 00 01 02 03 04; do
  if [ -f "tools/local-patch/part${i}.b64" ]; then
    cp "tools/local-patch/part${i}.b64" "/tmp/radio1-patch/part${i}.b64"
  else
    git show "HEAD:tools/local-patch/part${i}.b64" > "/tmp/radio1-patch/part${i}.b64"
  fi
done
cat /tmp/radio1-patch/part00.b64 /tmp/radio1-patch/part01.b64 /tmp/radio1-patch/part02.b64 /tmp/radio1-patch/part03.b64 /tmp/radio1-patch/part04.b64 | base64 -d > /tmp/radio1-local-1.1.28.zip
python3 - <<'PY2'
import zipfile
from pathlib import Path
z = zipfile.ZipFile('/tmp/radio1-local-1.1.28.zip')
root = Path.cwd()
for name in z.namelist():
    data = z.read(name)
    dest = root / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print('wrote', name, len(data))
print('DONE')
PY2
cp -f script.js www/script.js
cp -f styles.css www/styles.css
cp -f index.html www/index.html
echo "patch applied"
