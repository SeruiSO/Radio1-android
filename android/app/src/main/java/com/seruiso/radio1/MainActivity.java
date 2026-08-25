package com.seruiso.radio1;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        maybeAutoplayFromIntent();
        handleMediaIntent(intent);
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
        // Скидаємо action щоб onStart не повторив
        intent.setAction(null);
        setIntent(intent);

        if (RadioWatchService.ACTION_MEDIA_NEXT.equals(action)) {
            String js = fromNative
                ? "window.dispatchEvent(new CustomEvent('media-next-sync'))"
                : "window.dispatchEvent(new CustomEvent('media-next'))";
            runJs(js);
        } else if (RadioWatchService.ACTION_MEDIA_PREV.equals(action)) {
            String js = fromNative
                ? "window.dispatchEvent(new CustomEvent('media-prev-sync'))"
                : "window.dispatchEvent(new CustomEvent('media-prev'))";
            runJs(js);
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
