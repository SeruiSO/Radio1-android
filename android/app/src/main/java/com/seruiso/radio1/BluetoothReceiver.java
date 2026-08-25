package com.seruiso.radio1;

import android.bluetooth.BluetoothA2dp;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHeadset;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

public class BluetoothReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        Boolean connected = null;
        boolean isA2dp = false;

        if (BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED.equals(action)) {
            int state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, BluetoothProfile.STATE_DISCONNECTED);
            if (state == BluetoothProfile.STATE_CONNECTED) {
                connected = true;
                isA2dp = true;
            } else if (state == BluetoothProfile.STATE_DISCONNECTED) {
                connected = false;
            }
        } else if (BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED.equals(action)) {
            // не стартуємо play лише по headset — чекаємо A2DP
            int state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, BluetoothProfile.STATE_DISCONNECTED);
            if (state == BluetoothProfile.STATE_DISCONNECTED) {
                connected = false;
            }
        } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
            connected = false;
        } else if (BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED.equals(action)) {
            int state = intent.getIntExtra(BluetoothAdapter.EXTRA_CONNECTION_STATE, BluetoothAdapter.STATE_DISCONNECTED);
            if (state == BluetoothAdapter.STATE_DISCONNECTED) {
                connected = false;
            }
        }
        // ACL_CONNECTED навмисно ігноруємо для PLAY — щоб не грати в динамік до готовності A2DP

        if (connected == null) return;

        if (connected && isA2dp) {
            // невелика затримка, поки профіль стабілізується
            final Context appCtx = context.getApplicationContext();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                Intent svc = new Intent(appCtx, RadioWatchService.class);
                svc.setAction(RadioWatchService.ACTION_BT);
                if (Build.VERSION.SDK_INT >= 26) {
                    appCtx.startForegroundService(svc);
                } else {
                    appCtx.startService(svc);
                }
            }, 800);
        } else if (!connected) {
            Intent svc = new Intent(context, RadioWatchService.class);
            svc.setAction(RadioWatchService.ACTION_STOP);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
        }
    }
}
