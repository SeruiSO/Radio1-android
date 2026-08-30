package com.seruiso.radio1;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;

@CapacitorPlugin(
    name = "LocalMusic",
    permissions = {
        @Permission(alias = "audio", strings = {
            Manifest.permission.READ_MEDIA_AUDIO
        }),
        @Permission(alias = "storage", strings = {
            Manifest.permission.READ_EXTERNAL_STORAGE
        })
    }
)
public class LocalMusicPlugin extends Plugin {

    public static final String KEY_MODE = "playbackMode";
    public static final String KEY_LOCAL_URIS = "localQueueUris";
    public static final String KEY_LOCAL_TITLES = "localQueueTitles";
    public static final String KEY_LOCAL_ARTISTS = "localQueueArtists";
    public static final String KEY_LOCAL_ALBUM_IDS = "localQueueAlbumIds";
    public static final String KEY_LOCAL_INDEX = "localQueueIndex";
    public static final String KEY_LOCAL_SHUFFLE = "localShuffle";
    public static final String KEY_LOCAL_REPEAT = "localRepeat"; // off | all | one
    public static final String KEY_LOCAL_FAVS = "localFavorites"; // JSON array of media ids

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("audio") != PermissionState.GRANTED) {
                requestPermissionForAlias("audio", call, "permDone");
                return;
            }
        } else {
            if (getPermissionState("storage") != PermissionState.GRANTED) {
                requestPermissionForAlias("storage", call, "permDone");
                return;
            }
        }
        JSObject o = new JSObject();
        o.put("granted", true);
        call.resolve(o);
    }

    @PermissionCallback
    private void permDone(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = getPermissionState("audio") == PermissionState.GRANTED;
        } else {
            granted = getPermissionState("storage") == PermissionState.GRANTED;
        }
        JSObject o = new JSObject();
        o.put("granted", granted);
        call.resolve(o);
    }

    @PluginMethod
    public void listTracks(PluginCall call) {
        try {
            JSArray tracks = new JSArray();
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DISPLAY_NAME
            };
            String selection = MediaStore.Audio.Media.IS_MUSIC + "!=0";
            String sort = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
            try (Cursor c = getContext().getContentResolver().query(
                    collection, projection, selection, null, sort)) {
                if (c != null) {
                    int idI = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int titleI = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistI = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int albumI = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                    int albumIdI = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                    int durI = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    while (c.moveToNext()) {
                        long id = c.getLong(idI);
                        Uri contentUri = ContentUris.withAppendedId(
                            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                        JSObject t = new JSObject();
                        t.put("id", String.valueOf(id));
                        t.put("uri", contentUri.toString());
                        String title = c.getString(titleI);
                        if (title == null || title.trim().isEmpty()) {
                            title = c.getString(c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME));
                        }
                        t.put("title", title != null ? title : "Unknown");
                        String artist = c.getString(artistI);
                        t.put("artist", artist != null && !artist.equals("<unknown>") ? artist : "Unknown");
                        String album = c.getString(albumI);
                        t.put("album", album != null ? album : "");
                        t.put("albumId", String.valueOf(c.getLong(albumIdI)));
                        t.put("duration", c.getLong(durI));
                        tracks.put(t);
                    }
                }
            }
            JSObject out = new JSObject();
            out.put("tracks", tracks);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("listTracks failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getArt(PluginCall call) {
        String albumIdStr = call.getString("albumId", "0");
        long albumId = 0;
        try { albumId = Long.parseLong(albumIdStr); } catch (Exception ignored) {}
        if (albumId <= 0) {
            JSObject o = new JSObject();
            o.put("base64", "");
            call.resolve(o);
            return;
        }
        try {
            Uri artUri = ContentUris.withAppendedId(
                Uri.parse("content://media/external/audio/albumart"), albumId);
            InputStream is = getContext().getContentResolver().openInputStream(artUri);
            if (is == null) {
                JSObject o = new JSObject();
                o.put("base64", "");
                call.resolve(o);
                return;
            }
            Bitmap bmp = BitmapFactory.decodeStream(is);
            is.close();
            if (bmp == null) {
                JSObject o = new JSObject();
                o.put("base64", "");
                call.resolve(o);
                return;
            }
            int max = 256;
            if (bmp.getWidth() > max || bmp.getHeight() > max) {
                float scale = Math.min((float) max / bmp.getWidth(), (float) max / bmp.getHeight());
                bmp = Bitmap.createScaledBitmap(bmp,
                    Math.max(1, (int) (bmp.getWidth() * scale)),
                    Math.max(1, (int) (bmp.getHeight() * scale)), true);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 80, baos);
            String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            JSObject o = new JSObject();
            o.put("base64", "data:image/jpeg;base64," + b64);
            call.resolve(o);
        } catch (Exception e) {
            JSObject o = new JSObject();
            o.put("base64", "");
            call.resolve(o);
        }
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        String mode = call.getString("mode", "radio");
        if (!"local".equals(mode)) mode = "radio";
        prefs().edit().putString(KEY_MODE, mode).commit();
        call.resolve();
    }

    @PluginMethod
    public void getMode(PluginCall call) {
        JSObject o = new JSObject();
        o.put("mode", prefs().getString(KEY_MODE, "radio"));
        call.resolve(o);
    }

    @PluginMethod
    public void saveLocalQueue(PluginCall call) {
        String uris = call.getString("uris", "[]");
        String titles = call.getString("titles", "[]");
        String artists = call.getString("artists", "[]");
        String albumIds = call.getString("albumIds", "[]");
        int index = call.getInt("index", 0);
        prefs().edit()
            .putString(KEY_LOCAL_URIS, uris)
            .putString(KEY_LOCAL_TITLES, titles)
            .putString(KEY_LOCAL_ARTISTS, artists)
            .putString(KEY_LOCAL_ALBUM_IDS, albumIds)
            .putInt(KEY_LOCAL_INDEX, index)
            .putString(KEY_MODE, "local")
            .commit();
        call.resolve();
    }

    @PluginMethod
    public void playTrack(PluginCall call) {
        String uri = call.getString("uri", "");
        String title = call.getString("title", "Local");
        String artist = call.getString("artist", "");
        String albumId = call.getString("albumId", "0");
        if (uri == null || uri.isEmpty()) {
            call.reject("uri required");
            return;
        }
        SharedPreferences.Editor ed = prefs().edit()
            .putString(KEY_MODE, "local")
            .putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true)
            .putString(BluetoothAutoPlayPlugin.KEY_URL, uri)
            .putString(BluetoothAutoPlayPlugin.KEY_NAME, title != null ? title : "Local")
            .putString(BluetoothAutoPlayPlugin.KEY_TRACK, artist != null ? artist : "")
            .putString(BluetoothAutoPlayPlugin.KEY_GENRE, artist != null ? artist : "")
            .putString(BluetoothAutoPlayPlugin.KEY_COUNTRY, "")
            .putString(BluetoothAutoPlayPlugin.KEY_FAVICON, albumId != null ? albumId : "0");
        ed.commit();

        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(RadioWatchService.ACTION_PLAY_URL);
        svc.putExtra(RadioWatchService.EXTRA_URL, uri);
        svc.putExtra(RadioWatchService.EXTRA_NAME, title);
        if (Build.VERSION.SDK_INT >= 26) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        long pos = 0;
        try {
            Double d = call.getDouble("positionMs");
            if (d != null) pos = d.longValue();
        } catch (Exception ignored) {}
        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(RadioWatchService.ACTION_SEEK);
        svc.putExtra(RadioWatchService.EXTRA_POSITION_MS, pos);
        if (Build.VERSION.SDK_INT >= 26) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }
        call.resolve();
    }

    @PluginMethod
    public void getPosition(PluginCall call) {
        // Prefer live values written by service
        SharedPreferences p = prefs();
        JSObject o = new JSObject();
        o.put("positionMs", p.getLong("localPositionMs", 0L));
        o.put("durationMs", p.getLong("localDurationMs", 0L));
        o.put("isPlaying", p.getBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, false));
        call.resolve(o);
    }

    @PluginMethod
    public void setShuffle(PluginCall call) {
        boolean v = Boolean.TRUE.equals(call.getBoolean("value", false));
        prefs().edit().putBoolean(KEY_LOCAL_SHUFFLE, v).apply();
        call.resolve();
    }

    @PluginMethod
    public void setRepeat(PluginCall call) {
        String r = call.getString("value", "off");
        if (!"all".equals(r) && !"one".equals(r)) r = "off";
        prefs().edit().putString(KEY_LOCAL_REPEAT, r).apply();
        call.resolve();
    }

    @PluginMethod
    public void getPlaybackOptions(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject o = new JSObject();
        o.put("shuffle", p.getBoolean(KEY_LOCAL_SHUFFLE, false));
        o.put("repeat", p.getString(KEY_LOCAL_REPEAT, "off"));
        o.put("mode", p.getString(KEY_MODE, "radio"));
        call.resolve(o);
    }

    @PluginMethod
    public void getFavorites(PluginCall call) {
        JSObject o = new JSObject();
        o.put("ids", prefs().getString(KEY_LOCAL_FAVS, "[]"));
        call.resolve(o);
    }



    @PluginMethod
    public void getQueueState(PluginCall call) {
        android.content.SharedPreferences p = prefs();
        JSObject o = new JSObject();
        o.put("index", p.getInt(KEY_LOCAL_INDEX, 0));
        o.put("title", p.getString(BluetoothAutoPlayPlugin.KEY_NAME, ""));
        o.put("artist", p.getString(BluetoothAutoPlayPlugin.KEY_TRACK, ""));
        o.put("uri", p.getString(BluetoothAutoPlayPlugin.KEY_URL, ""));
        o.put("albumId", p.getString(BluetoothAutoPlayPlugin.KEY_FAVICON, "0"));
        o.put("mode", p.getString(KEY_MODE, "radio"));
        call.resolve(o);
    }

    @PluginMethod
    public void skip(PluginCall call) {
        boolean next = Boolean.TRUE.equals(call.getBoolean("next", true));
        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(next ? RadioWatchService.ACTION_NOTIF_NEXT : RadioWatchService.ACTION_NOTIF_PREV);
        if (Build.VERSION.SDK_INT >= 26) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }
        call.resolve();
    }

    @PluginMethod
    public void setFavorites(PluginCall call) {
        String ids = call.getString("ids", "[]");
        prefs().edit().putString(KEY_LOCAL_FAVS, ids != null ? ids : "[]").apply();
        call.resolve();
    }
}
