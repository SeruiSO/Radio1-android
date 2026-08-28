package com.seruiso.radio1;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final BroadcastReceiver skipReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null) return;
            boolean fromNative = intent.getBooleanExtra("fromNativeSkip", true);
            if (RadioWatchService.ACTION_MEDIA_NEXT.equals(intent.getAction())) {
                runJs(fromNative
                    ? "window.dispatchEvent(new CustomEvent('media-next-sync'))"
                    : "window.dispatchEvent(new CustomEvent('media-next'))");
            } else if (RadioWatchService.ACTION_MEDIA_PREV.equals(intent.getAction())) {
                runJs(fromNative
                    ? "window.dispatchEvent(new CustomEvent('media-prev-sync'))"
                    : "window.dispatchEvent(new CustomEvent('media-prev'))");
            } else if (RadioWatchService.ACTION_TRACK_META.equals(intent.getAction())) {
                String track = intent.getStringExtra(RadioWatchService.EXTRA_TRACK);
                if (track != null && !track.isEmpty()) {
                    String safe = track.replace("\\", "\\\\")
                        .replace("'", "\\'")
                        .replace("\n", " ")
                        .replace("\r", " ");
                    runJs("window.dispatchEvent(new CustomEvent('track-meta',{detail:{title:'" + safe + "'}}))");
                }
            } else if (RadioWatchService.ACTION_PLAYBACK_UI.equals(intent.getAction())) {
                boolean playing = intent.getBooleanExtra("playing", false);
                runJs("window.dispatchEvent(new CustomEvent('native-playback',{detail:{playing:" + playing + "}}))");
            } else if (RadioWatchService.ACTION_STATUS_UI.equals(intent.getAction())) {
                String st = intent.getStringExtra("status");
                int attempt = intent.getIntExtra("attempt", 0);
                if (st == null) st = "";
                String safe = st.replace("\\", "\\\\").replace("'", "\\'");
                runJs("window.dispatchEvent(new CustomEvent('native-status',{detail:{status:'" + safe + "',attempt:" + attempt + "}}))");
            }
        }
    };
    private boolean skipRegistered = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothAutoPlayPlugin.class);
        super.onCreate(savedInstanceState);
        allowAutoplay();
        handleMediaIntent(getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        allowAutoplay();
        maybeAutoplayFromIntent();
        handleMediaIntent(getIntent());
        registerSkipReceiver();
    }

    @Override
    public void onStop() {
        unregisterSkipReceiver();
        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        maybeAutoplayFromIntent();
        handleMediaIntent(intent);
    }

    private void registerSkipReceiver() {
        if (skipRegistered) return;
        IntentFilter f = new IntentFilter();
        f.addAction(RadioWatchService.ACTION_MEDIA_NEXT);
        f.addAction(RadioWatchService.ACTION_MEDIA_PREV);
        f.addAction(RadioWatchService.ACTION_TRACK_META);
        f.addAction(RadioWatchService.ACTION_PLAYBACK_UI);
        f.addAction(RadioWatchService.ACTION_STATUS_UI);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(skipReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(skipReceiver, f);
        }
        skipRegistered = true;
    }

    private void unregisterSkipReceiver() {
        if (!skipRegistered) return;
        try { unregisterReceiver(skipReceiver); } catch (Exception ignored) {}
        skipRegistered = false;
    }

    private void allowAutoplay() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }

    private void maybeAutoplayFromIntent() {
        if (getIntent() != null && getIntent().getBooleanExtra("autoplay", false)
                && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('bt-autoplay'))",
                null
            );
        }
    }

    private void handleMediaIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        boolean fromNative = intent.getBooleanExtra("fromNativeSkip", false);
        intent.setAction(null);
        setIntent(intent);

        if (RadioWatchService.ACTION_MEDIA_NEXT.equals(action)) {
            runJs(fromNative
                ? "window.dispatchEvent(new CustomEvent('media-next-sync'))"
                : "window.dispatchEvent(new CustomEvent('media-next'))");
        } else if (RadioWatchService.ACTION_MEDIA_PREV.equals(action)) {
            runJs(fromNative
                ? "window.dispatchEvent(new CustomEvent('media-prev-sync'))"
                : "window.dispatchEvent(new CustomEvent('media-prev'))");
        }
    }

    private void runJs(String js) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(js, null);
        } else {
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            }, 400);
        }
    }
}
