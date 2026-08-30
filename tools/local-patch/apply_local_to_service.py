#!/usr/bin/env python3
"""Patch RadioWatchService.java (radio-only) with local music mode support."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2] if (Path(__file__).parent.name == "local-patch") else Path.cwd()
TARGET = ROOT / "android/app/src/main/java/com/seruiso/radio1/RadioWatchService.java"

if not TARGET.exists():
    print("NOT FOUND:", TARGET)
    sys.exit(1)

src = TARGET.read_text(encoding="utf-8")
if "isLocalMode()" in src and "ACTION_SEEK" in src:
    print("Already patched")
    sys.exit(0)

def must_replace(old, new, label):
    global src
    if old not in src:
        print("FAIL:", label)
        sys.exit(1)
    src = src.replace(old, new, 1)
    print("OK:", label)

def maybe_replace(old, new, label):
    global src
    if old not in src:
        print("WARN:", label)
        return
    src = src.replace(old, new, 1)
    print("OK:", label)

must_replace(
    '    public static final String ACTION_PLAYBACK_UI = "com.seruiso.radio1.PLAYBACK_UI";',
    '    public static final String ACTION_PLAYBACK_UI = "com.seruiso.radio1.PLAYBACK_UI";\n'
    '    public static final String ACTION_SEEK = "com.seruiso.radio1.SEEK";\n'
    '    public static final String EXTRA_POSITION_MS = "positionMs";',
    "constants",
)

must_replace(
    '            public void onPlayerError(androidx.media3.common.PlaybackException error) {\n'
    '                android.util.Log.w("RadioWatch", "player error: " + error.getMessage());\n'
    '                scheduleReconnect();\n'
    '            }',
    '            public void onPlayerError(androidx.media3.common.PlaybackException error) {\n'
    '                android.util.Log.w("RadioWatch", "player error: " + error.getMessage());\n'
    '                if (isLocalMode()) return;\n'
    '                scheduleReconnect();\n'
    '            }',
    "onPlayerError",
)

print("partial push - download full from instructions")
