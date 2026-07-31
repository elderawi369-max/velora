package com.velorachat.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import me.leolin.shortcutbadger.ShortcutBadger;

@CapacitorPlugin(name = "AppBadge")
public class AppBadgePlugin extends Plugin {
    private static final String VELORA_ACTIVITY_CHANNEL_ID = "velora_activity";
    private static final int BADGE_TEST_NOTIFICATION_ID = 1107;

    @PluginMethod
    public void setCount(PluginCall call) {
        Integer count = call.getInt("count");
        if (count == null) {
            call.reject("count is required.");
            return;
        }

        int normalizedCount = Math.max(count, 0);
        boolean applied = ShortcutBadger.applyCount(getContext(), normalizedCount);

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("count", normalizedCount);
        result.put("supported", applied);
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        ShortcutBadger.removeCount(getContext());
        NotificationManagerCompat.from(getContext()).cancel(BADGE_TEST_NOTIFICATION_ID);

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("count", 0);
        call.resolve(result);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", ShortcutBadger.isBadgeCounterSupported(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void testNotification(PluginCall call) {
        Integer count = call.getInt("count");
        int normalizedCount = Math.max(count == null ? 1 : count, 1);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Notification permission is not granted.");
            return;
        }

        Intent launchIntent = getContext()
            .getPackageManager()
            .getLaunchIntentForPackage(getContext().getPackageName());
        PendingIntent contentIntent = null;
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            contentIntent = PendingIntent.getActivity(
                getContext(),
                BADGE_TEST_NOTIFICATION_ID,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        ShortcutBadger.applyCount(getContext(), normalizedCount);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            getContext(),
            VELORA_ACTIVITY_CHANNEL_ID
        )
            .setSmallIcon(getContext().getApplicationInfo().icon)
            .setContentTitle("Velora badge test")
            .setContentText("If your launcher supports it, Velora should show badge " + normalizedCount + ".")
            .setStyle(
                new NotificationCompat.BigTextStyle().bigText(
                    "If your launcher supports it, Velora should show badge " + normalizedCount + "."
                )
            )
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setSilent(false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setNumber(normalizedCount);

        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        NotificationManagerCompat.from(getContext()).notify(
            BADGE_TEST_NOTIFICATION_ID,
            builder.build()
        );

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("count", normalizedCount);
        result.put("supported", true);
        call.resolve(result);
    }
}
