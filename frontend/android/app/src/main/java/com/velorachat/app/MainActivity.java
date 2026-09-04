package com.velorachat.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    private static final String VELORA_ACTIVITY_CHANNEL_ID = "velora_activity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppBadgePlugin.class);
        registerPlugin(GooglePlayBillingPlugin.class);
        super.onCreate(savedInstanceState);

        ensureNotificationChannel();

        // Apply the same edge-to-edge behavior on older Android versions as
        // Android 15+ while the listener below keeps controls clear of bars,
        // gesture areas, and display cutouts.
        WindowCompat.enableEdgeToEdge(getWindow());

        View contentView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contentView, (view, windowInsets) -> {
            Insets systemBarsInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(
                systemBarsInsets.left,
                systemBarsInsets.top,
                systemBarsInsets.right,
                systemBarsInsets.bottom
            );
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(contentView);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel existing = manager.getNotificationChannel(VELORA_ACTIVITY_CHANNEL_ID);
        if (existing != null) {
            existing.setShowBadge(true);
            manager.createNotificationChannel(existing);
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            VELORA_ACTIVITY_CHANNEL_ID,
            getString(R.string.velora_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.velora_notification_channel_description));
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }
}
