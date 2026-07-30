package com.velorachat.app;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import me.leolin.shortcutbadger.ShortcutBadger;

public class VeloraMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        int badgeCount = extractBadgeCount(remoteMessage);
        if (badgeCount < 0) {
            return;
        }

        if (badgeCount == 0) {
            ShortcutBadger.removeCount(getApplicationContext());
            return;
        }

        ShortcutBadger.applyCount(getApplicationContext(), badgeCount);
    }

    private int extractBadgeCount(RemoteMessage remoteMessage) {
        String badgeValue = remoteMessage.getData().get("badgeCount");
        if (badgeValue == null || badgeValue.trim().isEmpty()) {
            RemoteMessage.Notification notification = remoteMessage.getNotification();
            if (notification == null || notification.getNotificationCount() == null) {
                return -1;
            }
            return Math.max(notification.getNotificationCount(), 0);
        }

        try {
            return Math.max(Integer.parseInt(badgeValue.trim()), 0);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }
}
