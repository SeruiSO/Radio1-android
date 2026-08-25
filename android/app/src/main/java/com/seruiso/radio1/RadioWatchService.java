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
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
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
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean noisyRegistered = false;

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
        player = new ExoPlayer.Builder(this).build();

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
                notifyForeground();
            }
        });
        registerNoisy();
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
                if (player.isPlaying()) player.pause();
                notifyForeground();
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                player.setVolume(0.3f);
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                player.setVolume(1f);
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
            if (player != null) player.pause();
            notifyForeground();
            return START_STICKY;
        }

        if (ACTION_PLAY.equals(action) || ACTION_BT.equals(action) || ACTION_NOTIF_PLAY.equals(action)) {
            playLast();
            return START_STICKY;
        }

        if (ACTION_PLAY_URL.equals(action) && intent != null) {
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
                if (!player.isPlaying() && player.getPlayWhenReady() == false
                        && player.getPlaybackState() != Player.STATE_IDLE) {
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
            player.setMediaItem(MediaItem.fromUri(url));
            player.prepare();
            player.setPlayWhenReady(true);
            notifyForeground();
        } catch (Exception e) {
            android.util.Log.e("RadioWatch", "playUrl failed: " + url, e);
            try {
                if (player != null) player.stop();
            } catch (Exception ignored) {}
            notifyForeground();
        }
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
            .setContentText(playing ? ("Грає: " + currentName) : "На паузі / стежить за BT")
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
