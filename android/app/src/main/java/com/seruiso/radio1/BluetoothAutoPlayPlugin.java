package com.seruiso.radio1;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BluetoothAutoPlay",
    permissions = {
        @Permission(alias = "bt", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class BluetoothAutoPlayPlugin extends Plugin {

    public static final String PREFS = "radio_autoplay";
    public static final String KEY_URL = "lastStationUrl";
    public static final String KEY_NAME = "lastStationName";
    public static final String KEY_PLAY = "intendedPlaying";
    public static final String KEY_QUEUE_URLS = "queueUrls";
    public static final String KEY_QUEUE_NAMES = "queueNames";
    public static final String KEY_QUEUE_INDEX = "queueIndex";
    public static final String KEY_BT_WATCH = "btWatchEnabled";
    public static final String KEY_ACTUALLY_PLAYING = "actuallyPlaying";
    public static final String KEY_IS_PLAYING = "isPlaying";
    public static final String KEY_TRACK = "lastTrackTitle";

    @PluginMethod
    public void saveStation(PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "");
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putString(KEY_URL, url).putString(KEY_NAME, name).apply();
        call.resolve();
    }

    @PluginMethod
    public void setIntendedPlaying(PluginCall call) {
        boolean value = Boolean.TRUE.equals(call.getBoolean("value", false));
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean(KEY_PLAY, value).apply();
        call.resolve();
    }


    @PluginMethod
    public void saveQueue(PluginCall call) {
        String urls = call.getString("urls", "[]");
        String names = call.getString("names", "[]");
        int index = call.getInt("index", 0);
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit()
            .putString(KEY_QUEUE_URLS, urls)
            .putString(KEY_QUEUE_NAMES, names)
            .putInt(KEY_QUEUE_INDEX, index)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url", null);
        String name = call.getString("name", null);
        Intent svc = new Intent(getContext(), RadioWatchService.class);
        if (url != null && !url.isEmpty()) {
            if (name != null) {
                SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                p.edit().putString(KEY_URL, url).putString(KEY_NAME, name).apply();
            }
            svc.setAction(RadioWatchService.ACTION_PLAY_URL);
            svc.putExtra(RadioWatchService.EXTRA_URL, url);
            if (name != null) svc.putExtra(RadioWatchService.EXTRA_NAME, name);
        } else {
            svc.setAction(RadioWatchService.ACTION_PLAY);
        }
        startSvc(svc);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(RadioWatchService.ACTION_PAUSE);
        startSvc(svc);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(RadioWatchService.ACTION_STOP);
        startSvc(svc);
        call.resolve();
    }



    @PluginMethod
    public void setBtWatch(PluginCall call) {
        boolean value = Boolean.TRUE.equals(call.getBoolean("value", true));
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean(KEY_BT_WATCH, value).commit();
        try {
            Intent svc = new Intent(getContext(), RadioWatchService.class);
            svc.setAction(RadioWatchService.ACTION_START);
            startSvc(svc);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void getBtWatch(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject o = new JSObject();
        o.put("value", p.getBoolean(KEY_BT_WATCH, true));
        call.resolve(o);
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject o = new JSObject();
        o.put("url", p.getString(KEY_URL, ""));
        o.put("name", p.getString(KEY_NAME, ""));
        o.put("intendedPlaying", p.getBoolean(KEY_PLAY, false));
        o.put("isPlaying", p.getBoolean(KEY_IS_PLAYING, false));
        o.put("track", p.getString(KEY_TRACK, ""));
        o.put("queueIndex", p.getInt(KEY_QUEUE_INDEX, 0));
        o.put("queueUrls", p.getString(KEY_QUEUE_URLS, "[]"));
        o.put("queueNames", p.getString(KEY_QUEUE_NAMES, "[]"));
        call.resolve(o);
    }

    @PluginMethod
    public void requestReady(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("bt") != PermissionState.GRANTED) {
            requestPermissionForAlias("bt", call, "permDone");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") != PermissionState.GRANTED) {
            requestPermissionForAlias("notify", call, "permDone");
            return;
        }
        startWatchService();
        call.resolve();
    }

    @PermissionCallback
    private void permDone(PluginCall call) {
        requestReady(call);
    }

    private void startWatchService() {
        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(RadioWatchService.ACTION_START);
        startSvc(svc);
    }

    private void startSvc(Intent svc) {
        if (Build.VERSION.SDK_INT >= 26) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }
    }
}
