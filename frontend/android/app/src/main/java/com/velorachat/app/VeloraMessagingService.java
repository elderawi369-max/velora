package com.velorachat.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import me.leolin.shortcutbadger.ShortcutBadger;

public class VeloraMessagingService extends MessagingService {
    private static final String VELORA_ACTIVITY_CHANNEL_ID = "velora_activity";
    private static final int BADGE_NOTIFICATION_ID = 1106;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        int badgeCount = extractBadgeCount(remoteMessage);
        String title = extractText(remoteMessage, "title", "Velora");
        String body = extractText(remoteMessage, "body", "Open Velora to see what's new.");

        if (badgeCount < 0) {
            return;
        }

        if (badgeCount == 0) {
            ShortcutBadger.removeCount(getApplicationContext());
            NotificationManagerCompat.from(getApplicationContext()).cancel(BADGE_NOTIFICATION_ID);
            return;
        }

        ShortcutBadger.applyCount(getApplicationContext(), badgeCount);
        showBadgeNotification(title, body, badgeCount);
    }

    private int extractBadgeCount(RemoteMessage remoteMessage) {
        String badgeValue = remoteMessage.getData().get("badgeCount");
        if (badgeValue == null || badgeValue.trim().isEmpty()) {
            return -1;
        }

        try {
            return Math.max(Integer.parseInt(badgeValue.trim()), 0);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private String extractText(RemoteMessage remoteMessage, String key, String fallback) {
        String value = remoteMessage.getData().get(key);
        if (value != null && !value.trim().isEmpty()) {
            return value.trim();
        }

        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification == null) {
            return fallback;
        }

        if ("title".equals(key) && notification.getTitle() != null && !notification.getTitle().trim().isEmpty()) {
            return notification.getTitle().trim();
        }

        if ("body".equals(key) && notification.getBody() != null && !notification.getBody().trim().isEmpty()) {
            return notification.getBody().trim();
        }

        return fallback;
    }

    private void showBadgeNotification(String title, String body, int badgeCount) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(
                getApplicationContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = null;
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            contentIntent = PendingIntent.getActivity(
                getApplicationContext(),
                BADGE_NOTIFICATION_ID,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            getApplicationContext(),
            VELORA_ACTIVITY_CHANNEL_ID
        )
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setSilent(false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setNumber(Math.max(badgeCount, 1));

        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        NotificationManagerCompat.from(getApplicationContext()).notify(
            BADGE_NOTIFICATION_ID,
            builder.build()
        );
    }
}
