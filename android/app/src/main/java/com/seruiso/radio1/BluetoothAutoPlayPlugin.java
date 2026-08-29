package com.seruiso.radio1;

import android.Manifest;
import org.json.JSONObject;
import org.json.JSONArray;
import android.provider.MediaStore;
import android.net.Uri;
import android.database.Cursor;
import android.content.ContentUris;
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
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "media13", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
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
    public static final String KEY_QUEUE_FAVICONS = "queueFavicons";
    public static final String KEY_QUEUE_GENRES = "queueGenres";
    public static final String KEY_QUEUE_COUNTRIES = "queueCountries";
    public static final String KEY_BT_WATCH = "btWatchEnabled";
    public static final String KEY_ACTUALLY_PLAYING = "actuallyPlaying";
    public static final String KEY_IS_PLAYING = "isPlaying";
    public static final String KEY_TRACK = "lastTrackTitle";
    public static final String KEY_FAVICON = "lastStationFavicon";
    public static final String KEY_GENRE = "lastStationGenre";
    public static final String KEY_COUNTRY = "lastStationCountry";
    public static final String KEY_SOURCE = "playbackSource"; // radio | local

    @PluginMethod
    public void saveStation(PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "");
        String favicon = call.getString("favicon", "");
        String genre = call.getString("genre", "");
        String country = call.getString("country", "");
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = p.edit()
            .putString(KEY_URL, url)
            .putString(KEY_NAME, name);
        if (favicon != null) ed.putString(KEY_FAVICON, favicon);
        if (genre != null) ed.putString(KEY_GENRE, genre);
        if (country != null) ed.putString(KEY_COUNTRY, country);
        ed.apply();
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
        String favicons = call.getString("favicons", "[]");
        String genres = call.getString("genres", "[]");
        String countries = call.getString("countries", "[]");
        int index = call.getInt("index", 0);
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit()
            .putString(KEY_QUEUE_URLS, urls)
            .putString(KEY_QUEUE_NAMES, names)
            .putString(KEY_QUEUE_FAVICONS, favicons != null ? favicons : "[]")
            .putString(KEY_QUEUE_GENRES, genres != null ? genres : "[]")
            .putString(KEY_QUEUE_COUNTRIES, countries != null ? countries : "[]")
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
            SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor ed = p.edit()
                .putString(KEY_URL, url)
                .putBoolean(KEY_PLAY, true);
            if (name != null && !name.isEmpty()) {
                ed.putString(KEY_NAME, name);
            }
            String favicon = call.getString("favicon", null);
            String genre = call.getString("genre", null);
            String country = call.getString("country", null);
            if (favicon != null) ed.putString(KEY_FAVICON, favicon);
            if (genre != null) ed.putString(KEY_GENRE, genre);
            if (country != null) ed.putString(KEY_COUNTRY, country);
            boolean isLocal = url.startsWith("content://") || url.startsWith("file://");
            ed.putString(KEY_SOURCE, isLocal ? "local" : "radio");
            // commit: сервіс має бачити URL ДО startForegroundService
            ed.commit();
            svc.setAction(RadioWatchService.ACTION_PLAY_URL);
            svc.putExtra(RadioWatchService.EXTRA_URL, url);
            if (name != null) svc.putExtra(RadioWatchService.EXTRA_NAME, name);
        } else {
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_PLAY, true).commit();
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
        o.put("favicon", p.getString(KEY_FAVICON, ""));
        o.put("genre", p.getString(KEY_GENRE, ""));
        o.put("country", p.getString(KEY_COUNTRY, ""));
        o.put("queueIndex", p.getInt(KEY_QUEUE_INDEX, 0));
        o.put("queueUrls", p.getString(KEY_QUEUE_URLS, "[]"));
        o.put("queueNames", p.getString(KEY_QUEUE_NAMES, "[]"));
        o.put("source", p.getString(KEY_SOURCE, "radio"));
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


    @PluginMethod
    public void requestMediaPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("media13") != PermissionState.GRANTED) {
                requestPermissionForAlias("media13", call, "mediaPermDone");
                return;
            }
        } else {
            if (getPermissionState("storage") != PermissionState.GRANTED) {
                requestPermissionForAlias("storage", call, "mediaPermDone");
                return;
            }
        }
        JSObject o = new JSObject();
        o.put("granted", true);
        call.resolve(o);
    }

    @PermissionCallback
    private void mediaPermDone(PluginCall call) {
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) {
            ok = getPermissionState("media13") == PermissionState.GRANTED;
        } else {
            ok = getPermissionState("storage") == PermissionState.GRANTED;
        }
        JSObject o = new JSObject();
        o.put("granted", ok);
        call.resolve(o);
    }

    @PluginMethod
    public void listLocalTracks(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                if (getPermissionState("media13") != PermissionState.GRANTED) {
                    call.reject("NO_PERMISSION");
                    return;
                }
            } else {
                if (getPermissionState("storage") != PermissionState.GRANTED) {
                    call.reject("NO_PERMISSION");
                    return;
                }
            }

            String[] projection = new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.ALBUM_ID
            };
            String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
            String sort = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

            JSONArray arr = new JSONArray();
            Cursor c = getContext().getContentResolver().query(
                collection, projection, selection, null, sort);
            if (c != null) {
                int iId = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int iTitle = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int iArtist = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int iAlbum = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int iDur = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int iAlbumId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                int limit = 5000;
                int n = 0;
                while (c.moveToNext() && n < limit) {
                    long id = c.getLong(iId);
                    String title = c.getString(iTitle);
                    String artist = c.getString(iArtist);
                    String album = c.getString(iAlbum);
                    long dur = c.getLong(iDur);
                    long albumId = c.getLong(iAlbumId);
                    if (title == null || title.trim().isEmpty()) title = "Unknown";
                    if (artist == null || artist.trim().isEmpty() || "<unknown>".equalsIgnoreCase(artist))
                        artist = "Unknown";
                    if (album == null) album = "";
                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                    String art = "";
                    if (albumId > 0) {
                        art = ContentUris.withAppendedId(
                            Uri.parse("content://media/external/audio/albumart"), albumId).toString();
                    }
                    JSONObject tr = new JSONObject();
                    tr.put("id", String.valueOf(id));
                    tr.put("url", contentUri.toString());
                    tr.put("name", title);
                    tr.put("artist", artist);
                    tr.put("album", album);
                    tr.put("duration", dur);
                    tr.put("favicon", art);
                    arr.put(tr);
                    n++;
                }
                c.close();
            }
            JSObject out = new JSObject();
            out.put("tracks", arr);
            out.put("count", arr.length());
            call.resolve(out);
        } catch (Exception e) {
            call.reject("LIST_FAILED: " + e.getMessage());
        }
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
