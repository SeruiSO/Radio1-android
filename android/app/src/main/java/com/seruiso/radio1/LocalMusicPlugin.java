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
        JSObject r = new JSObject();
        r.put("granted", true);
        call.resolve(r);
    }

    @PermissionCallback
    private void permDone(PluginCall call) {
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) {
            ok = getPermissionState("audio") == PermissionState.GRANTED;
        } else {
            ok = getPermissionState("storage") == PermissionState.GRANTED;
        }
        JSObject r = new JSObject();
        r.put("granted", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void listTracks(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("audio") != PermissionState.GRANTED) {
                call.reject("Permission denied");
                return;
            }
        } else {
            if (getPermissionState("storage") != PermissionState.GRANTED) {
                call.reject("Permission denied");
                return;
            }
        }

        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA
        };
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sort = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";

        List<JSObject> tracks = new ArrayList<>();
        try (Cursor c = getContext().getContentResolver().query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection, selection, null, sort)) {
            if (c != null) {
                int idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int albumIdCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                int durCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                while (c.moveToNext()) {
                    long id = c.getLong(idCol);
                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                    JSObject t = new JSObject();
                    t.put("id", String.valueOf(id));
                    t.put("uri", contentUri.toString());
                    t.put("title", c.getString(titleCol) != null ? c.getString(titleCol) : "Unknown");
                    t.put("artist", c.getString(artistCol) != null ? c.getString(artistCol) : "Unknown");
                    t.put("album", c.getString(albumCol) != null ? c.getString(albumCol) : "");
                    t.put("albumId", c.getLong(albumIdCol));
                    t.put("durationMs", c.getLong(durCol));
                    tracks.add(t);
                }
            }
        } catch (Exception e) {
            call.reject("listTracks failed: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("tracks", new JSArray(tracks));
        call.resolve(result);
    }

    @PluginMethod
    public void getArt(PluginCall call) {
        long albumId = call.getLong("albumId", 0L);
        if (albumId <= 0) {
            call.resolve(new JSObject().put("base64", ""));
            return;
        }
        try {
            Uri artUri = ContentUris.withAppendedId(
                Uri.parse("content://media/external/audio/albumart"), albumId);
            InputStream is = getContext().getContentResolver().openInputStream(artUri);
            if (is == null) {
                call.resolve(new JSObject().put("base64", ""));
                return;
            }
            Bitmap bmp = BitmapFactory.decodeStream(is);
            is.close();
            if (bmp == null) {
                call.resolve(new JSObject().put("base64", ""));
                return;
            }
            // scale down
            int max = 256;
            if (bmp.getWidth() > max || bmp.getHeight() > max) {
                float scale = Math.min((float) max / bmp.getWidth(), (float) max / bmp.getHeight());
                bmp = Bitmap.createScaledBitmap(bmp,
                    Math.round(bmp.getWidth() * scale),
                    Math.round(bmp.getHeight() * scale), true);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 80, baos);
            String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            call.resolve(new JSObject().put("base64", b64));
        } catch (Exception e) {
            call.resolve(new JSObject().put("base64", ""));
        }
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        String mode = call.getString("mode", "radio");
        if (!"local".equals(mode)) mode = "radio";
        prefs().edit().putString(KEY_MODE, mode).apply();
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
        JSArray uris = call.getArray("uris");
        JSArray titles = call.getArray("titles");
        JSArray artists = call.getArray("artists");
        JSArray albumIds = call.getArray("albumIds");
        int index = call.getInt("index", 0);
        if (uris == null) {
            call.reject("uris required");
            return;
        }
        try {
            SharedPreferences.Editor ed = prefs().edit();
            ed.putString(KEY_LOCAL_URIS, uris.toString());
            ed.putString(KEY_LOCAL_TITLES, titles != null ? titles.toString() : "[]");
            ed.putString(KEY_LOCAL_ARTISTS, artists != null ? artists.toString() : "[]");
            ed.putString(KEY_LOCAL_ALBUM_IDS, albumIds != null ? albumIds.toString() : "[]");
            ed.putInt(KEY_LOCAL_INDEX, index);
            ed.putString(KEY_MODE, "local");
            ed.apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("saveLocalQueue: " + e.getMessage());
        }
    }

    @PluginMethod
    public void playTrack(PluginCall call) {
        String uri = call.getString("uri");
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        long albumId = call.getLong("albumId", 0L);
        if (uri == null || uri.isEmpty()) {
            call.reject("uri required");
            return;
        }
        // Ensure mode local
        prefs().edit().putString(KEY_MODE, "local").apply();

        Intent svc = new Intent(getContext(), RadioWatchService.class);
        svc.setAction(RadioWatchService.ACTION_PLAY);
        svc.putExtra(RadioWatchService.EXTRA_URL, uri);
        svc.putExtra(RadioWatchService.EXTRA_TITLE, title);
        svc.putExtra(RadioWatchService.EXTRA_ARTIST, artist);
        svc.putExtra(RadioWatchService.EXTRA_ALBUM_ID, albumId);
        if (Build.VERSION.SDK_INT >= 26) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        long pos = call.getLong("positionMs", 0L);
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
