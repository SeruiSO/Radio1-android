package com.seruiso.radio1;

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
    public static final String ACTION_TRACK_META = "com.seruiso.radio1.TRACK_META";
    public static final String ACTION_PLAYBACK_UI = "com.seruiso.radio1.PLAYBACK_UI";
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
    private boolean pausedByFocusLoss = false;
    private String lastTrackTitle = "";
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean noisyRegistered = false;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkCallbackRegistered = false;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                if (player != null && player.isPlaying()) {
                    player.pause();
                    notifyForeground();
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
                notifyForeground();
                notifyUiPlayback(isPlaying);
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
                scheduleReconnect();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED || state == Player.STATE_IDLE) {
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
                // ConnectivityThread → усі звернення до player тільки на main
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    SharedPreferences sp = getSharedPreferences(
                        BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                    if (!sp.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)) return;
                    if (player != null && player.isPlaying()) {
                        reconnectAttempt = 0;
                        return;
                    }
                    android.util.Log.i("RadioWatch", "network available → reconnect");
                    reconnectAttempt = 0;
                    if (reconnectHandler != null) {
                        reconnectHandler.removeCallbacksAndMessages(null);
                    }
                    lastPlayedUrl = "";
                    lastPlayMs = 0;
                    // невелика пауза поки мережа стабілізується
                    if (reconnectHandler == null) {
                        reconnectHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                    }
                    reconnectHandler.postDelayed(() -> {
                        String url = sp.getString(BluetoothAutoPlayPlugin.KEY_URL, "");
                        if (url != null && !url.isEmpty()) {
                            playUrl(url);
                        } else {
                            scheduleReconnect();
                        }
                    }, 700);
                });
            }

            @Override
            public void onLost(Network network) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() ->
                    android.util.Log.i("RadioWatch", "network lost")
                );
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
                        String url = sp.getString(BluetoothAutoPlayPlugin.KEY_URL, "");
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
        String urlsJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_URLS, "[]");
        String namesJson = p.getString(BluetoothAutoPlayPlugin.KEY_QUEUE_NAMES, "[]");
        int index = p.getInt(BluetoothAutoPlayPlugin.KEY_QUEUE_INDEX, 0);

        try {
            JSONArray urls = new JSONArray(urlsJson);
            JSONArray names = new JSONArray(namesJson);
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
            if (url.isEmpty()) return;

            p.edit()
                .putInt(BluetoothAutoPlayPlugin.KEY_QUEUE_INDEX, index)
                .putString(BluetoothAutoPlayPlugin.KEY_URL, url)
                .putString(BluetoothAutoPlayPlugin.KEY_NAME, name)
                .putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true)
                .apply();

            currentName = name;
            playUrl(url);
            notifyUiSkip(next);
        } catch (Exception e) {
            notifyUiSkip(next);
        }
    }



    private void writePlayingFlag(boolean playing) {
        getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
            .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, playing).apply();
    }

    private void applySessionMetadata(String station, String track) {
        if (player == null) return;
        try {
            String title = (track != null && !track.isEmpty()) ? track : (station != null ? station : "Radio S O");
            String artist = (station != null && !station.isEmpty()) ? station : "Radio S O";
            MediaMetadata md = new MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setDisplayTitle(title)
                .setSubtitle(artist)
                .build();
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
                .putBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, false).apply();
            if (player != null) player.pause();
            notifyForeground();
            notifyUiPlayback(false);
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

        if (ACTION_PLAY_URL.equals(action) && intent != null) {
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit().putBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, true).apply();
            String url = intent.getStringExtra(EXTRA_URL);
            String name = intent.getStringExtra(EXTRA_NAME);
            if (name != null && !name.isEmpty()) currentName = name;
            playUrl(url);
            return START_STICKY;
        }

        return START_STICKY;
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
            boolean sameUrl = url.equals(currentUri) || url.equals(lastPlayedUrl);
            if (sameUrl && (player.isPlaying()
                    || player.getPlayWhenReady()
                    || (now - lastPlayMs < 1500))) {
                android.util.Log.d("RadioWatch", "playUrl skip duplicate: " + url);
                SharedPreferences spDup = getSharedPreferences(
                    BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE);
                if (!player.isPlaying() && !player.getPlayWhenReady()
                        && player.getPlaybackState() != Player.STATE_IDLE
                        && spDup.getBoolean(BluetoothAutoPlayPlugin.KEY_PLAY, false)) {
                    player.setPlayWhenReady(true);
                }
                notifyForeground();
                return;
            }
            if (!requestFocus()) {
                android.util.Log.w("RadioWatch", "audio focus not granted");
            }
            lastPlayMs = now;
            lastPlayedUrl = url;
            lastTrackTitle = "";
            getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                .edit().putString(BluetoothAutoPlayPlugin.KEY_TRACK, "").apply();
            MediaItem item = new MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(new MediaMetadata.Builder()
                    .setTitle(currentName != null ? currentName : "Radio S O")
                    .setArtist(currentName != null ? currentName : "Radio S O")
                    .setDisplayTitle(currentName != null ? currentName : "Radio S O")
                    .setSubtitle("Radio S O")
                    .build())
                .build();
            player.setMediaItem(item);
            player.prepare();
            player.setPlayWhenReady(true);
            reconnectAttempt = 0;
            writePlayingFlag(true);
            notifyForeground();
        } catch (Exception e) {
            android.util.Log.e("RadioWatch", "playUrl failed: " + url, e);
            try {
                if (player != null) player.stop();
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

    private void scheduleReconnect() {
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
            String url = p.getString(BluetoothAutoPlayPlugin.KEY_URL, "");
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

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Radio S O")
            .setContentText(playing
                ? ((lastTrackTitle != null && !lastTrackTitle.isEmpty())
                    ? (currentName + " · " + lastTrackTitle) : ("Грає: " + currentName))
                : (getSharedPreferences(BluetoothAutoPlayPlugin.PREFS, MODE_PRIVATE)
                        .getBoolean(BluetoothAutoPlayPlugin.KEY_BT_WATCH, true)
                    ? "На паузі · BT стеження увімк"
                    : "На паузі · BT стеження вимк"))
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setShowActionsInCompactView(0));

        if (playing) {
            b.addAction(android.R.drawable.ic_media_pause, "Пауза", pausePi);
        } else {
            b.addAction(android.R.drawable.ic_media_play, "Грати", playPi);
        }
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
