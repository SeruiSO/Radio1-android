package com.seruiso.radio1;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.widget.RemoteViews;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class RadioAppWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            updateOne(context, mgr, id, null);
        }
    }

    public static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, RadioAppWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            updateOne(context, mgr, id, null);
        }
    }

    public static void updateAll(Context context, Bitmap icon) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, RadioAppWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            updateOne(context, mgr, id, icon);
        }
    }

    private static void updateOne(Context context, AppWidgetManager mgr, int id, Bitmap icon) {
        SharedPreferences p = context.getSharedPreferences(
            BluetoothAutoPlayPlugin.PREFS, Context.MODE_PRIVATE);
        String name = p.getString(BluetoothAutoPlayPlugin.KEY_NAME, "Radio S O");
        String genre = p.getString(BluetoothAutoPlayPlugin.KEY_GENRE, "");
        String country = p.getString(BluetoothAutoPlayPlugin.KEY_COUNTRY, "");
        String track = p.getString(BluetoothAutoPlayPlugin.KEY_TRACK, "");
        // лише isPlaying — actuallyPlaying інколи «залипає»
        boolean playing = p.getBoolean(BluetoothAutoPlayPlugin.KEY_IS_PLAYING, false);

        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_radio);
        rv.setTextViewText(R.id.widget_app_name, "Radio S O");
        rv.setTextViewText(R.id.widget_station, name != null && !name.isEmpty() ? name : "Radio S O");

        String meta = "";
        if (genre != null && !genre.isEmpty()) meta = genre;
        if (country != null && !country.isEmpty()) {
            meta = meta.isEmpty() ? country : (meta + " · " + country);
        }
        rv.setTextViewText(R.id.widget_meta, meta);

        if (track != null && !track.isEmpty()) {
            rv.setTextViewText(R.id.widget_track, track);
        } else {
            rv.setTextViewText(R.id.widget_track, playing ? "▶ відтворення…" : "⏸ пауза");
        }

        rv.setImageViewResource(R.id.widget_play_pause,
            playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        rv.setTextColor(R.id.widget_playing_dot, playing ? 0xFF4CAF50 : 0xFF666666);
        rv.setTextViewText(R.id.widget_playing_dot, playing ? "● грає" : "○ пауза");

        if (icon != null) {
            rv.setImageViewBitmap(R.id.widget_icon, icon);
        } else {
            rv.setImageViewResource(R.id.widget_icon, R.mipmap.ic_launcher);
        }

        // кліки
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        rv.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
            context, 100, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        rv.setOnClickPendingIntent(R.id.widget_prev, svcPi(context, 101, RadioWatchService.ACTION_NOTIF_PREV));
        rv.setOnClickPendingIntent(R.id.widget_next, svcPi(context, 102, RadioWatchService.ACTION_NOTIF_NEXT));
        if (playing) {
            rv.setOnClickPendingIntent(R.id.widget_play_pause, svcPi(context, 103, RadioWatchService.ACTION_NOTIF_PAUSE));
        } else {
            rv.setOnClickPendingIntent(R.id.widget_play_pause, svcPi(context, 104, RadioWatchService.ACTION_NOTIF_PLAY));
        }

        mgr.updateAppWidget(id, rv);
    }

    private static PendingIntent svcPi(Context ctx, int req, String action) {
        Intent i = new Intent(ctx, RadioWatchService.class);
        i.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        if (Build.VERSION.SDK_INT >= 26) {
            return PendingIntent.getForegroundService(ctx, req, i, flags);
        }
        return PendingIntent.getService(ctx, req, i, flags);
    }
}
