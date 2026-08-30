package com.seruiso.radio1;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Metadata;
import androidx.media3.common.Player;
import androidx.media3.extractor.metadata.icy.IcyInfo;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import org.json.JSONArray;

public class RadioWatchService extends Service implements AudioManager.OnAudioFocusChangeListener {
    public static final String ACTION_BT = "com.seruiso.radio1.BT_CONNECTED";
    public static final String ACTION_START = "com.seruiso.radio1.START_WATCH";
    public static final String ACTION_STOP = "com.seruiso.radio1.STOP";
    public static final String ACTION_PLAY = "com.seruiso.radio1.PLAY";
    public static final String ACTION_PAUSE = "com.seruiso.radio1.PAUSE";
    public static final String ACTION_PLAY_URL = "com.seruiso.radio1.PLAY_URL";
    public static final String ACTION_MEDIA_NEXT = "com.seruiso.radio1.MEDIA_NEXT";
    public static final String ACTION_MEDIA_PREV = "com.seruiso.radio1.MEDIA_PREV";
    public static final String ACTION_NOTIF_PLAY = "com.seruiso.radio1.NOTIF_PLAY";
    public static final String ACTION_NOTIF_PAUSE = "com.seruiso.radio1.NOTIF_PAUSE";
    public static final String ACTION_NOTIF_NEXT = "com.seruiso.radio1.NOTIF_NEXT";
    public static final String ACTION_NOTIF_PREV = "com.seruiso.radio1.NOTIF_PREV";
    public static final String ACTION_STATUS_UI = "com.seruiso.radio1.STATUS_UI";
    public static final String ACTION_TRACK_META = "com.seruiso.radio1.TRACK_META";
    public static final String ACTION_PLAYBACK_UI = "com.seruiso.radio1.PLAYBACK_UI";
    public static final String ACTION_SEEK = "com.seruiso.radio1.SEEK";
    public static final String EXTRA_POSITION_MS = "positionMs";
    public static final String EXTRA_TRACK = "track";

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_NAME = "name";

    private static final String CHANNEL = "radio_playback";
    private static final int NOTIF_ID = 42;

    private ExoPlayer player;
    private MediaSession mediaSession;
    private String currentName = "Radio S O";
    private long lastSkipMs = 0;
    private long lastPlayMs = 0;
    private String lastPlayedUrl = "";
    /** URL що реально грає зараз — source of truth для reconnect */
    private String currentPlayUrl = "";
    private boolean pausedByFocusLoss = false;
    private String lastTrackTitle = "";
    private Bitmap stationArt = null;
    private String stationArtUrl = "";
    private int artGen = 0;
    private final java.util.Map<String, Bitmap> artCache = new java.util.LinkedHashMap<String, Bitmap>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, Bitmap> e) {
            return size() > 24;
        }
    };
    private static final int ART_MAX_BYTES = 512 * 1024;
    private Runnable widgetUpdateRunnable;
    private final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean noisyRegistered = false;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkCallbackRegistered = false;
    private long networkLostAtMs = 0L;
    private android.os.Handler silenceHandler;
    private Runnable silenceCheck;
    private int bufferingTicks = 0;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                if (player != null && player.isPlaying()) {
                    player.pause();
                    writeActuallyPlaying(false);
                    notifyForeground();
                    notifyUiPlayback(false);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    30_000,  /* minBufferMs — запас при коротких обривах */
                    120_000, /* maxBufferMs */
                    2_500,   /* bufferForPlaybackMs */
                    5_000    /* bufferForPlaybackAfterRebufferMs */
                )
                .build();
        player = new ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .build();

        Player sessionPlayer = new ForwardingPlayer(player) {
            @Override
            public boolean isCommandAvailable(int command) {
                if (command == Player.COMMAND_SEEK_TO_NEXT
                        || command == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
                        || command == Player.COMMAND_SEEK_TO_PREVIOUS
                        || command == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
                    return true;
                }
                return super.isCommandAvailable(command);
            }

            @Override
            public Player.Commands getAvailableCommands() {
                return super.getAvailableCommands().buildUpon()
                        .add(Player.COMMAND_SEEK_TO_NEXT)
                        .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .build();
            }

            private boolean allowSessionPlay() {
                SharedPreferences sp = getSharedPreferences(
                    BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                boolean want = sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false);
                if (want) return true;
                boolean watch = sp.getBoolean(BluetoothAutoPlayPlugin.KEY_BT_WATCH, true);
                long lastBt = sp.getLong("lastA2dpConnectMs", 0L);
                long ago = System.currentTimeMillis() - lastBt;
                // Авто-resume від системи одразу після BT — блокуємо, якщо не intended
                if (ago >= 0 && ago < 4000) {
                    android.util.Log.i("RadioWatch", "session play blocked after A2DP (watch="+watch+" want="+want+")");
                    return false;
                }
                // поза вікном підключення — play з керма/шторки OK
                return true;
            }

            @Override
            public void play() {
                if (!allowSessionPlay()) return;
                getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                    .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true).apply();
                super.play();
            }

            @Override
            public void setPlayWhenReady(boolean playWhenReady) {
                if (playWhenReady && !allowSessionPlay()) {
                    super.setPlayWhenReady(false);
                    return;
                }
                if (playWhenReady) {
                    getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                        .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true).apply();
                }
                super.setPlayWhenReady(playWhenReady);
            }

            @Override
            public void seekToNext() { skip(true); }

            @Override
            public void seekToNextMediaItem() { skip(true); }

            @Override
            public void seekToPrevious() { skip(false); }

            @Override
            public void seekToPreviousMediaItem() { skip(false); }
        };

        mediaSession = new MediaSession.Builder(this, sessionPlayer).build();
        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                writePlayingFlag(isPlaying);
                writeActuallyPlaying(isPlaying);
                writeLocalPosition();
                notifyForeground();
                notifyUiPlayback(isPlaying);
                try { scheduleWidgetUpdate(); } catch (Exception ignored) {}
            }

            @Override
            public void onMediaMetadataChanged(MediaMetadata mediaMetadata) {
                if (mediaMetadata == null) return;
                CharSequence title = mediaMetadata.title;
                if (title == null || title.length() == 0) title = mediaMetadata.displayTitle;
                if (title != null && title.length() > 0) {
                    publishTrack(title.toString());
                }
            }

            @Override
            public void onMetadata(Metadata metadata) {
                if (metadata == null) return;
                for (int i = 0; i < metadata.length(); i++) {
                    Metadata.Entry e = metadata.get(i);
                    if (e instanceof IcyInfo) {
                        String title = ((IcyInfo) e).title;
                        if (title != null && !title.trim().isEmpty()) {
                            publishTrack(title.trim());
                            return;
                        }
                    }
                }
            }

            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                android.util.Log.w("RadioWatch", "player error: " + error.getMessage());
                if (isLocalMode()) return;
                scheduleReconnect();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    if (isLocalMode()) {
                        handleLocalEnded();
                        return;
                    }
                    SharedPreferences sp = getSharedPreferences(
                        BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                    if (sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)
                            && !pausedByFocusLoss) {
                        scheduleReconnect();
                    }
                } else if (state == Player.STATE_IDLE) {
                    if (isLocalMode()) return;
                    SharedPreferences sp = getSharedPreferences(
                        BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                    if (sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)
                            && !pausedByFocusLoss) {
                        scheduleReconnect();
                    }
                }
            }
        });
        registerNoisy();
        registerNetworkCallback();
    }

    private void registerNetworkCallback() {
        if (networkCallbackRegistered) return;
        connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    try {
                        long lostAgo = networkLostAtMs > 0
                            ? (System.currentTimeMillis() - networkLostAtMs) : Long.MAX_VALUE;
                        networkLostAtMs = 0L;
                        SharedPreferences sp = getSharedPreferences(
                            BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                        if (!sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)) return;
                        if (isLocalMode()) return;
                        if (player != null && player.isPlaying()) {
                            reconnectAttempt = 0;
                            notifyUiStatus("playing", 0);
                            return;
                        }
                        // короткий обрив (<2с) і ще buffering — почекати, не форсувати
                        if (lostAgo < 2000 && player != null
                                && player.getPlayWhenReady()) {
                            android.util.Log.i("RadioWatch", "brief network gap, wait");
                            return;
                        }
                        android.util.Log.i("RadioWatch", "network available → reconnect");
                        notifyUiStatus("reconnecting", reconnectAttempt + 1);
                        reconnectAttempt = 0;
                        if (reconnectHandler != null) {
                            reconnectHandler.removeCallbacksAndMessages(null);
                        }
                        lastPlayedUrl = "";
                        lastPlayMs = 0;
                        if (reconnectHandler == null) {
                            reconnectHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                        }
                        reconnectHandler.postDelayed(() -> {
                            try {
                                String url = resolveReconnectUrl();
                                if (url != null && !url.isEmpty()) playUrl(url);
                                else scheduleReconnect();
                            } catch (Exception e) {
                                android.util.Log.e("RadioWatch", "reconnect", e);
                            }
                        }, 700);
                    } catch (Exception e) {
                        android.util.Log.e("RadioWatch", "onAvailable", e);
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    networkLostAtMs = System.currentTimeMillis();
                    android.util.Log.i("RadioWatch", "network lost (grace)");
                    // не стопаємо плеєр — короткий gap у місті
                });
            }
        };
        try {
            NetworkRequest req = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            connectivityManager.registerNetworkCallback(req, networkCallback);
            networkCallbackRegistered = true;
        } catch (Exception e) {
            android.util.Log.e("RadioWatch", "registerNetworkCallback", e);
        }
    }

    private void registerNoisy() {
        if (noisyRegistered) return;
        IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(noisyReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(noisyReceiver, f);
        }
        noisyRegistered = true;
    }

    private boolean requestFocus() {
        if (audioManager == null) return true;
        int result;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build())
                        .setOnAudioFocusChangeListener(this)
                        .setAcceptsDelayedFocusGain(true)
                        .build();
            }
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = audioManager.requestAudioFocus(this,
                    AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
                || result == AudioManager.AUDIOFOCUS_REQUEST_DELAYED;
    }

    private void abandonFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            audioManager.abandonAudioFocus(this);
        }
    }

    @Override
    public void onAudioFocusChange(int focusChange) {
        if (player == null) return;
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                // відео / дзвінок / інший плеєр — пауза; resume на GAIN якщо intendedPlaying
                if (player.isPlaying() || player.getPlayWhenReady()) {
                    pausedByFocusLoss = true;
                    player.pause();
                    notifyForeground();
                }
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                player.setVolume(1f);
                if (!pausedByFocusLoss) break;
                // невелика затримка: інший додаток ще відпускає focus
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    if (player == null) return;
                    pausedByFocusLoss = false;
                    SharedPreferences sp = getSharedPreferences(
                        BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                    boolean wantPlay = sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false);
                    if (!wantPlay) return;
                    int state = player.getPlaybackState();
                    if (state == Player.STATE_IDLE || state == Player.STATE_ENDED
                            || player.getCurrentMediaItem() == null) {
                        String url = resolveReconnectUrl();
                        if (url != null && !url.isEmpty()) playUrl(url);
                    } else {
                        if (!requestFocus()) {
                            android.util.Log.w("RadioWatch", "focus re-request failed");
                        }
                        player.setPlayWhenReady(true);
                    }
                    notifyForeground();
                }, 400);
                break;
        }
    }

    private void skip(boolean next) {
        long now = System.currentTimeMillis();
        if (now - lastSkipMs < 600) return;
        lastSkipMs = now;

        SharedPreferences p = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);

        if (isLocalMode()) {
            try {
                org.json.JSONArray uris = new org.json.JSONArray(p.getString(LocalMusicPlugin.KEY_LOCAL_URIS, "[]"));
                org.json.JSONArray titles = new org.json.JSONArray(p.getString(LocalMusicPlugin.KEY_LOCAL_TITLES, "[]"));
                org.json.JSONArray artists = new org.json.JSONArray(p.getString(LocalMusicPlugin.KEY_LOCAL_ARTISTS, "[]"));
                org.json.JSONArray albumIds = new org.json.JSONArray(p.getString(LocalMusicPlugin.KEY_LOCAL_ALBUM_IDS, "[]"));
                int n = uris.length();
                if (n == 0) return;
                int idx = p.getInt(LocalMusicPlugin.KEY_LOCAL_INDEX, 0);
                boolean shuffle = p.getBoolean(LocalMusicPlugin.KEY_LOCAL_SHUFFLE, false);
                String repeat = p.getString(LocalMusicPlugin.KEY_LOCAL_REPEAT, "off");
                if (shuffle && n > 1) {
                    int nidx = idx;
                    int guard = 0;
                    while (nidx == idx && guard++ < 20) nidx = (int) (Math.random() * n);
                    idx = nidx;
                } else {
                    idx = next ? (idx + 1) : (idx - 1);
                    if (idx < 0) idx = "all".equals(repeat) ? n - 1 : 0;
                    if (idx >= n) {
                        if ("all".equals(repeat)) idx = 0;
                        else {
                            if (player != null) player.pause();
                            p.edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)
                                .putBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, false).apply();
                            notifyUiPlayback(false);
                            notifyForeground();
                            return;
                        }
                    }
                }
                String uri = uris.getString(idx);
                String title = idx < titles.length() ? titles.optString(idx, "Local") : "Local";
                String artist = idx < artists.length() ? artists.optString(idx, "") : "";
                String albumId = idx < albumIds.length() ? albumIds.optString(idx, "0") : "0";
                p.edit()
                    .putInt(LocalMusicPlugin.KEY_LOCAL_INDEX, idx)
                    .putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true)
                    .putString(BluetoothAutoPlayPlugin.KEY_URL, uri)
                    .putString(BluetoothAutoPlayPlugin.KEY_NAME, title)
                    .putString(BluetoothAutoPlayPlugin.KEY_TRACK, artist)
                    .putString(BluetoothAutoPlayPlugin.KEY_GENRE, artist)
                    .putString(BluetoothAutoPlayPlugin.KEY_FAVICON, albumId)
                    .commit();
                currentName = title;
                lastTrackTitle = artist != null ? artist : "";
                loadLocalAlbumArt(albumId);
                playUrl(uri);
                notifyUiSkip(next);
                notifyForeground();
                try { scheduleWidgetUpdate(); } catch (Exception ignored) {}
            } catch (Exception e) {
                android.util.Log.w("RadioWatch", "local skip", e);
            }
            return;
        }

        String urlsJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_URLS, "[]");
        String namesJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_NAMES, "[]");
        String favsJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_FAVICONS, "[]");
        String genresJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_GENRES, "[]");
        String countriesJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_COUNTRIES, "[]");
        int index = p.getInt(BluetoothAutoPlayPlugin.KEY_QUEUE_INDEX, 0);

        try {
            JSONArray urls = new JSONArray(urlsJson);
            JSONArray names = new JSONArray(namesJson);
            JSONArray favs = new JSONArray(favsJson);
            JSONArray genres = new JSONArray(genresJson);
            JSONArray countries = new JSONArray(countriesJson);
            if (urls.length() == 0) {
                notifyUiSkip(next);
                return;
            }
            if (next) {
                index = (index + 1) % urls.length();
            } else {
                index = (index - 1 + urls.length()) % urls.length();
            }
            String url = urls.optString(index, "");
            String name = names.optString(index, "Radio S O");
            String fav = favs.optString(index, "");
            String genre = genres.optString(index, "");
            String country = countries.optString(index, "");
            if (url.isEmpty()) return;

            p.edit()
                .putInt(BluetoothAutoPlayPlugin.KEY_QUEUE_INDEX, index)
                .putString(BluetoothAutoPlayPlugin.KEY_URL, url)
                .putString(BluetoothAutoPlayPlugin.KEY_NAME, name)
                .putString(BluetoothAutoPlayPlugin.KEY_FAVICON, fav != null ? fav : "")
                .putString(BluetoothAutoPlayPlugin.KEY_GENRE, genre != null ? genre : "")
                .putString(BluetoothAutoPlayPlugin.KEY_COUNTRY, country != null ? country : "")
                .putString(BluetoothAutoPlayPlugin.KEY_TRACK, "")
                .putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true)
                .commit(); // commit: reconnect має бачити новий URL одразу

            currentName = name;
            lastTrackTitle = "";
            // скинути кеш іконки щоб форсовано перезавантажити
            stationArt = null;
            stationArtUrl = "";
            artGen++;
            playUrl(url);
            loadStationArtAsync();
            notifyUiSkip(next);
        } catch (Exception e) {
            notifyUiSkip(next);
        }
    }



    private void writePlayingFlag(boolean playing) {
        getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
            .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, playing).apply();
    }



    private void scheduleWidgetUpdate() {
        if (widgetUpdateRunnable != null) {
            mainHandler.removeCallbacks(widgetUpdateRunnable);
        }
        widgetUpdateRunnable = () -> {
            try {
                RadioAppWidget.updateAll(RadioWatchService.this, stationArt);
            } catch (Exception ignored) {}
            widgetUpdateRunnable = null;
        };
        mainHandler.postDelayed(widgetUpdateRunnable, 180);
    }

    private void loadStationArtAsync() {
        SharedPreferences sp = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
        final String fav = sp.getString(BluetoothAutoPlayPlugin.KEY_FAVICON, "");
        if (fav == null || fav.isEmpty()) {
            stationArt = null;
            stationArtUrl = "";
            artGen++;
            return;
        }
        // memory cache hit
        synchronized (artCache) {
            Bitmap cached = artCache.get(fav);
            if (cached != null && !cached.isRecycled()) {
                stationArt = cached;
                stationArtUrl = fav;
                applySessionMetadata(currentName, lastTrackTitle);
                notifyForeground();
                scheduleWidgetUpdate();
                return;
            }
        }
        if (fav.equals(stationArtUrl) && stationArt != null) return;

        final int gen = ++artGen;
        stationArtUrl = fav;
        new Thread(() -> {
            Bitmap bmp = null;
            HttpURLConnection conn = null;
            try {
                URL u = new URL(fav);
                conn = (HttpURLConnection) u.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();
                int code = conn.getResponseCode();
                if (code == 200) {
                    int cl = conn.getContentLength();
                    if (cl > ART_MAX_BYTES) {
                        android.util.Log.w("RadioWatch", "art too large by CL: " + cl);
                    } else {
                        InputStream is = conn.getInputStream();
                        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                        byte[] buf = new byte[4096];
                        int n, total = 0;
                        boolean tooBig = false;
                        while ((n = is.read(buf)) != -1) {
                            total += n;
                            if (total > ART_MAX_BYTES) { tooBig = true; break; }
                            bos.write(buf, 0, n);
                        }
                        is.close();
                        if (!tooBig) {
                            byte[] data = bos.toByteArray();
                            Bitmap raw = BitmapFactory.decodeByteArray(data, 0, data.length);
                            if (raw != null) {
                                int max = 256;
                                int w = raw.getWidth(), h = raw.getHeight();
                                if (w > max || h > max) {
                                    float s = Math.min((float) max / w, (float) max / h);
                                    bmp = Bitmap.createScaledBitmap(raw, Math.round(w * s), Math.round(h * s), true);
                                    if (bmp != raw) raw.recycle();
                                } else {
                                    bmp = raw;
                                }
                            }
                        } else {
                            android.util.Log.w("RadioWatch", "art too large while reading");
                        }
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("RadioWatch", "art load fail: " + e.getMessage());
            } finally {
                if (conn != null) try { conn.disconnect(); } catch (Exception ignored) {}
            }
            final Bitmap result = bmp;
            mainHandler.post(() -> {
                // застаріла відповідь — ігноруємо
                if (gen != artGen) {
                    if (result != null) {
                        try { result.recycle(); } catch (Exception ignored) {}
                    }
                    return;
                }
                if (result != null) {
                    synchronized (artCache) {
                        artCache.put(fav, result);
                    }
                }
                stationArt = result;
                applySessionMetadata(currentName, lastTrackTitle);
                notifyForeground();
                scheduleWidgetUpdate();
            });
        }).start();
    }

    private void applySessionMetadata(String station, String track) {
        if (player == null) return;
        try {
            String title = (track != null && !track.isEmpty()) ? track : (station != null ? station : "Radio S O");
            String artist = (station != null && !station.isEmpty()) ? station : "Radio S O";
            MediaMetadata.Builder mdb = new MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setDisplayTitle(title)
                .setSubtitle(artist)
                .setAlbumTitle("Radio S O");
            if (stationArt != null) {
                try {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    stationArt.compress(Bitmap.CompressFormat.PNG, 90, baos);
                    mdb.setArtworkData(baos.toByteArray(), MediaMetadata.PICTURE_TYPE_FRONT_COVER);
                } catch (Exception ignored) {}
            }
            MediaMetadata md = mdb.build();
            MediaItem current = player.getCurrentMediaItem();
            if (current == null) return;
            int idx = player.getCurrentMediaItemIndex();
            if (idx < 0) idx = 0;
            MediaItem updated = current.buildUpon().setMediaMetadata(md).build();
            player.replaceMediaItem(idx, updated);
        } catch (Exception e) {
            android.util.Log.w("RadioWatch", "applySessionMetadata", e);
        }
    }

    private void notifyUiStatus(String status, int attempt) {
        try {
            Intent i = new Intent(ACTION_STATUS_UI);
            i.setPackage(getPackageName());
            i.putExtra("status", status == null ? "" : status);
            i.putExtra("attempt", attempt);
            sendBroadcast(i);
        } catch (Exception ignored) {}
    }

    private void armSilenceWatch() {
        if (silenceHandler == null) {
            silenceHandler = new android.os.Handler(android.os.Looper.getMainLooper());
        }
        if (silenceCheck != null) silenceHandler.removeCallbacks(silenceCheck);
        silenceCheck = new Runnable() {
            @Override public void run() {
                try {
                    if (player == null) return;
                    SharedPreferences sp = getSharedPreferences(
                        BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                    if (!sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)) {
                        bufferingTicks = 0;
                        return;
                    }
                    int st = player.getPlaybackState();
                    boolean playing = player.isPlaying();
                    // «тиша» / довгий buffering при intended play
                    if (!playing && (st == Player.STATE_BUFFERING
                            || st == Player.STATE_IDLE
                            || st == Player.STATE_ENDED)) {
                        bufferingTicks++;
                        if (bufferingTicks == 1) {
                            notifyUiStatus("buffering", reconnectAttempt);
                        }
                        if (bufferingTicks >= 8) { // ~8 * 3s ≈ 24s
                            android.util.Log.w("RadioWatch", "silence/buffer timeout → reconnect");
                            notifyUiStatus("reconnecting", reconnectAttempt + 1);
                            bufferingTicks = 0;
                            lastPlayedUrl = "";
                            lastPlayMs = 0;
                            scheduleReconnect();
                            return;
                        }
                    } else if (playing) {
                        if (bufferingTicks > 0) notifyUiStatus("playing", 0);
                        bufferingTicks = 0;
                    }
                } catch (Exception e) {
                    android.util.Log.w("RadioWatch", "silenceCheck", e);
                }
                if (silenceHandler != null && silenceCheck != null) {
                    silenceHandler.postDelayed(silenceCheck, 3000);
                }
            }
        };
        silenceHandler.postDelayed(silenceCheck, 3000);
    }

    private void writeActuallyPlaying(boolean playing) {
        try {
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(BluetoothAutoPlayPlugin.KEY_ACTUALLY_PLAYING, playing)
                .apply();
        } catch (Exception ignored) {}
    }

    private void notifyUiPlayback(boolean playing) {
        Intent i = new Intent(ACTION_PLAYBACK_UI);
        i.setPackage(getPackageName());
        i.putExtra("playing", playing);
        sendBroadcast(i);
    }

    private void notifyUiSkip(boolean next) {
        // Не піднімаємо Activity з фону — лише sticky broadcast для живої UI
        Intent i = new Intent(next ? ACTION_MEDIA_NEXT : ACTION_MEDIA_PREV);
        i.setPackage(getPackageName());
        i.putExtra("fromNativeSkip", true);
        sendBroadcast(i);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        notifyForeground();
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            pausedByFocusLoss = false;
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)
                .putBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, false).apply();
            if (player != null) {
                player.stop();
                player.clearMediaItems();
            }
            abandonFocus();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PAUSE.equals(action) || ACTION_NOTIF_PAUSE.equals(action)) {
            pausedByFocusLoss = false; // пауза від користувача — не resume
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)
                .putBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, false)
                .putBoolean(BluetoothAutoPlayPlugin.KEY_ACTUALLY_PLAYING, false)
                .commit();
            if (player != null) player.pause();
            writeActuallyPlaying(false);
            notifyForeground();
            notifyUiPlayback(false);
            try { scheduleWidgetUpdate(); } catch (Exception ignored) {}
            return START_STICKY;
        }

        if (ACTION_BT.equals(action)) {
            SharedPreferences spBt = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
            if (!spBt.getBoolean(BluetoothAutoPlayPlugin.KEY_BT_WATCH, true)) {
                android.util.Log.i("RadioWatch", "ACTION_BT ignored — BT watch off");
                notifyForeground();
                return START_STICKY;
            }
            spBt.edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true).apply();
            playLast();
            return START_STICKY;
        }

        if (ACTION_PLAY.equals(action) || ACTION_NOTIF_PLAY.equals(action)) {
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true).apply();
            playLast();
            return START_STICKY;
        }

        if (ACTION_NOTIF_NEXT.equals(action)) {
            skip(true);
            return START_STICKY;
        }
        if (ACTION_NOTIF_PREV.equals(action)) {
            skip(false);
            return START_STICKY;
        }

        if (ACTION_PLAY_URL.equals(action) && intent != null) {
            String url = intent.getStringExtra(EXTRA_URL);
            String name = intent.getStringExtra(EXTRA_NAME);
            SharedPreferences.Editor ed = getSharedPreferences(
                BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE).edit()
                .putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true);
            if (url != null && !url.isEmpty()) {
                ed.putString(BluetoothAutoPlayPlugin.KEY_URL, url);
            }
            if (name != null && !name.isEmpty()) {
                currentName = name;
                ed.putString(BluetoothAutoPlayPlugin.KEY_NAME, name);
            }
            ed.commit();
            if (isLocalMode()) {
                String albumId = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                    .getString(BluetoothAutoPlayPlugin.KEY_FAVICON, "0");
                loadLocalAlbumArt(albumId);
            }
            playUrl(url);
            return START_STICKY;
        }

        if (ACTION_SEEK.equals(action) && intent != null) {
            long pos = intent.getLongExtra(EXTRA_POSITION_MS, 0L);
            if (player != null && isLocalMode()) {
                player.seekTo(Math.max(0, pos));
                writeLocalPosition();
            }
            return START_STICKY;
        }

        return START_STICKY;
    }

    private boolean isLocalMode() {
        try {
            return "local".equals(getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .getString(LocalMusicPlugin.KEY_MODE, "radio"));
        } catch (Exception e) {
            return false;
        }
    }

    private void writeLocalPosition() {
        if (player == null || !isLocalMode()) return;
        try {
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE).edit()
                .putLong("localPositionMs", Math.max(0, player.getCurrentPosition()))
                .putLong("localDurationMs", Math.max(0, player.getDuration() > 0 ? player.getDuration() : 0))
                .apply();
        } catch (Exception ignored) {}
    }

    private void loadLocalAlbumArt(String albumIdStr) {
        try {
            long albumId = 0;
            try { albumId = Long.parseLong(albumIdStr); } catch (Exception ignored) {}
            if (albumId <= 0) { stationArt = null; return; }
            android.net.Uri artUri = android.content.ContentUris.withAppendedId(
                android.net.Uri.parse("content://media/external/audio/albumart"), albumId);
            try (java.io.InputStream is = getContentResolver().openInputStream(artUri)) {
                if (is != null) {
                    Bitmap bmp = BitmapFactory.decodeStream(is);
                    if (bmp != null) { stationArt = bmp; stationArtUrl = artUri.toString(); }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("RadioWatch", "local art", e);
        }
    }

    private void handleLocalEnded() {
        SharedPreferences sp = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
        String repeat = sp.getString(LocalMusicPlugin.KEY_LOCAL_REPEAT, "off");
        if ("one".equals(repeat) && player != null) {
            player.seekTo(0); player.play(); return;
        }
        skip(true);
    }

    private void playLast() {
        SharedPreferences p = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, Context.MODE_PRIVATE);
        String url = p.getString(BluetoothAutoPlayPlugin.KEY_URL, "");
        String name = p.getString(BluetoothAutoPlayPlugin.KEY_NAME, "Radio S O");
        if (name != null && !name.isEmpty()) currentName = name;
        playUrl(url);
    }

    private void playUrl(String url) {
        if (url == null || url.isEmpty() || player == null) return;
        // НЕ форсуємо https — багато потоків лише http
        try {
            long now = System.currentTimeMillis();
            // той самий URL уже грає / щойно стартував — не перезапускати (BT double-play)
            String currentUri = null;
            if (player.getCurrentMediaItem() != null
                    && player.getCurrentMediaItem().localConfiguration != null) {
                currentUri = player.getCurrentMediaItem().localConfiguration.uri.toString();
            }
            // Дубль лише якщо ЦЕЙ САМИЙ uri уже в плеєрі і реально грає/стартує.
            // lastPlayedUrl НЕ порівнюємо — інакше швидкий A→B→A або зміна
            // під час буфера блокує новий play.
            boolean sameAsCurrent = currentUri != null && url.equals(currentUri);
            if (sameAsCurrent
                    && (player.isPlaying() || player.getPlayWhenReady())
                    && (now - lastPlayMs < 500)) {
                android.util.Log.d("RadioWatch", "playUrl skip duplicate: " + url);
                currentPlayUrl = url;
                try {
                    getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                        .edit().putString(BluetoothAutoPlayPlugin.KEY_URL, url).commit();
                } catch (Exception ignored) {}
                notifyForeground();
                return;
            }

            // Скасувати відкладений reconnect старого URL (головне при швидкому skip)
            if (reconnectHandler != null) {
                reconnectHandler.removeCallbacksAndMessages(null);
            }
            reconnectAttempt = 0;

            if (!requestFocus()) {
                android.util.Log.w("RadioWatch", "audio focus not granted");
            }
            lastPlayMs = now;
            lastPlayedUrl = url;
            currentPlayUrl = url;
            lastTrackTitle = "";
            // Критично: те що граємо = source of truth для reconnect (skip/UI/BT)
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit()
                .putString(BluetoothAutoPlayPlugin.KEY_URL, url)
                .putString(BluetoothAutoPlayPlugin.KEY_TRACK, "")
                .commit();
            MediaItem item = new MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(new MediaMetadata.Builder()
                    .setTitle(currentName != null ? currentName : "Radio S O")
                    .setArtist(currentName != null ? currentName : "Radio S O")
                    .setDisplayTitle(currentName != null ? currentName : "Radio S O")
                    .setSubtitle("Radio S O")
                    .build())
                .build();
            // Заміна потоку без stop()/clear — ExoPlayer сам кине попередній load
            player.setMediaItem(item, /* resetPosition= */ true);
            player.prepare();
            player.setPlayWhenReady(true);
            writePlayingFlag(true);
            loadStationArtAsync();
            try { writeActuallyPlaying(true); } catch (Exception ignored) {}
            notifyUiStatus("connecting", 0);
            bufferingTicks = 0;
            notifyForeground();
        } catch (Exception e) {
            android.util.Log.e("RadioWatch", "playUrl failed: " + url, e);
            try {
                if (player != null) player.setPlayWhenReady(false);
            } catch (Exception ignored) {}
            notifyForeground();
        }
    }


    private void publishTrack(String title) {
        if (title == null) return;
        title = title.replace("StreamTitle=", "").replace("'", "").trim();
        if (title.isEmpty() || title.equalsIgnoreCase(currentName)) return;
        if (title.equals(lastTrackTitle)) return;
        lastTrackTitle = title;
        getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
            .edit().putString(BluetoothAutoPlayPlugin.KEY_TRACK, title).apply();
        Intent i = new Intent(ACTION_TRACK_META);
        i.setPackage(getPackageName());
        i.putExtra(EXTRA_TRACK, title);
        sendBroadcast(i);
        applySessionMetadata(currentName, title);
        notifyForeground();
    }

    private android.os.Handler reconnectHandler;
    private int reconnectAttempt = 0;
    private static final int RECONNECT_MAX = 20;


    /** URL для reconnect: спочатку те що грали, інакше prefs */
    private String resolveReconnectUrl() {
        try {
            if (player != null && player.getCurrentMediaItem() != null
                    && player.getCurrentMediaItem().localConfiguration != null) {
                String u = player.getCurrentMediaItem().localConfiguration.uri.toString();
                if (u != null && !u.isEmpty()) return u;
            }
        } catch (Exception ignored) {}
        if (currentPlayUrl != null && !currentPlayUrl.isEmpty()) return currentPlayUrl;
        try {
            String u = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .getString(BluetoothAutoPlayPlugin.KEY_URL, "");
            if (u != null && !u.isEmpty()) return u;
        } catch (Exception ignored) {}
        return "";
    }

    private void scheduleReconnect() {
        if (isLocalMode()) return;
        SharedPreferences sp = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
        if (!sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)) return;
        if (reconnectHandler == null) {
            reconnectHandler = new android.os.Handler(android.os.Looper.getMainLooper());
        }
        reconnectHandler.removeCallbacksAndMessages(null);
        long delay = Math.min(45000L, 1000L * (1L << Math.min(reconnectAttempt, 5)));
        // 1s, 2s, 4s, 8s, 16s, 30s...
        final int attempt = reconnectAttempt;
        reconnectHandler.postDelayed(() -> {
            if (player == null) return;
            SharedPreferences p = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
            if (!p.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)) return;
            if (player.isPlaying()) {
                reconnectAttempt = 0;
                return;
            }
            String url = resolveReconnectUrl();
            android.util.Log.i("RadioWatch", "reconnect attempt " + attempt + " url=" + url);
            if (url != null && !url.isEmpty()) {
                reconnectAttempt = attempt + 1;
                if (reconnectAttempt > RECONNECT_MAX) reconnectAttempt = RECONNECT_MAX;
                // скинути duplicate-guard щоб playUrl реально перепідключив
                lastPlayedUrl = "";
                lastPlayMs = 0;
                playUrl(url);
                if (!player.isPlaying()) {
                    scheduleReconnect();
                } else {
                    reconnectAttempt = 0;
                }
            }
        }, delay);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL, "Radio S O", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Відтворення радіо та стеження за Bluetooth");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void notifyForeground() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, n);
        }
        try { scheduleWidgetUpdate(); } catch (Exception ignored) {}
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        boolean playing = player != null && player.isPlaying();

        Intent pauseI = new Intent(this, RadioWatchService.class);
        pauseI.setAction(ACTION_NOTIF_PAUSE);
        PendingIntent pausePi = PendingIntent.getService(
            this, 1, pauseI,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent playI = new Intent(this, RadioWatchService.class);
        playI.setAction(ACTION_NOTIF_PLAY);
        PendingIntent playPi = PendingIntent.getService(
            this, 2, playI,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent prevI = new Intent(this, RadioWatchService.class);
        prevI.setAction(ACTION_NOTIF_PREV);
        PendingIntent prevPi = PendingIntent.getService(
            this, 3, prevI,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent nextI = new Intent(this, RadioWatchService.class);
        nextI.setAction(ACTION_NOTIF_NEXT);
        PendingIntent nextPi = PendingIntent.getService(
            this, 4, nextI,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String body;
        if (playing) {
            if (lastTrackTitle != null && !lastTrackTitle.isEmpty())
                body = currentName + " · " + lastTrackTitle;
            else
                body = "Грає: " + currentName;
        } else {
            body = getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                    .getBoolean(BluetoothAutoPlayPlugin.KEY_BT_WATCH, true)
                ? "На паузі · BT стеження увімк"
                : "На паузі · BT стеження вимк";
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle(currentName != null ? currentName : "Radio S O")
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setColor(0xFF121212);
        if (stationArt != null) {
            b.setLargeIcon(stationArt);
        }
        androidx.media.app.NotificationCompat.MediaStyle style =
            new androidx.media.app.NotificationCompat.MediaStyle()
                .setShowActionsInCompactView(0, 1, 2);
        try {
            if (mediaSession != null) {
                style.setMediaSession(mediaSession.getSessionCompatToken());
            }
        } catch (Exception ignored) {}
        b.setStyle(style);

        b.addAction(android.R.drawable.ic_media_previous, "Назад", prevPi);
        if (playing) {
            b.addAction(android.R.drawable.ic_media_pause, "Пауза", pausePi);
        } else {
            b.addAction(android.R.drawable.ic_media_play, "Грати", playPi);
        }
        b.addAction(android.R.drawable.ic_media_next, "Далі", nextPi);
        return b.build();
    }

    @Override
    public void onDestroy() {
        if (noisyRegistered) {
            try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
            noisyRegistered = false;
        }
        if (networkCallbackRegistered && connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
            networkCallbackRegistered = false;
        }
        if (reconnectHandler != null) {
            reconnectHandler.removeCallbacksAndMessages(null);
        }
        abandonFocus();
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
