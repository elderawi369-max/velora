import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

function describeNotification(item: NotificationItem) {
  if (item.type === "starter_credit_reward") {
    return "Velora added 2 Challenge Credits to your account.";
  }

  if (item.type === "streak_reward") {
    return "Velora added 1 Challenge Credit for your consistency streak.";
  }

  if (item.type === "gift") {
    const label =
      item.giftType === "rose"
        ? "Rose Aura"
        : item.giftType === "starlight"
          ? "Starlight Ring"
          : item.giftType === "crown"
            ? "Velora Crown"
            : "a gift";

    return `sent you ${label}.`;
  }

  if (item.type === "challenge") {
    return "sent you a challenge.";
  }

  if (item.type === "challenge_result") {
    return "finished your challenge. Your result is ready.";
  }

  return "favorited your profile.";
}

function getNotificationLabel(item: NotificationItem) {
  if (item.type === "starter_credit_reward") {
    return "Reward";
  }

  if (item.type === "streak_reward") {
    return "Reward";
  }

  if (item.type === "gift") {
    return "Gift";
  }

  if (item.type === "challenge" || item.type === "challenge_result") {
    return "Challenge";
  }

  return "Favorite";
}

function getNotificationLink(item: NotificationItem) {
  if (item.type === "starter_credit_reward" || item.type === "streak_reward") {
    return "/challenges";
  }

  if ((item.type === "challenge" || item.type === "challenge_result") && item.challengeSessionId) {
    return `/challenges/${item.challengeSessionId}`;
  }

  return `/browse/${item.actorProfile.username}`;
}

function getNotificationActionLabel(item: NotificationItem) {
  if (item.type === "starter_credit_reward" || item.type === "streak_reward") {
    return "Use credits";
  }

  if (item.type === "challenge") {
    return "Open challenge";
  }

  if (item.type === "challenge_result") {
    return "See result";
  }

  return "View profile";
}

export function NotificationsList() {
  const queryClient = useQueryClient();
  const autoMarkedRef = useRef(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 8000,
  });

  const markOneMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (isLoading) {
    return <p className="status-message">Loading activity...</p>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error-message">
          {error instanceof Error ? error.message : "Unable to load activity."}
        </p>
      </div>
    );
  }

  if (!data || data.notifications.length === 0) {
    return (
      <div className="panel empty-state">
        <h2>No activity yet.</h2>
        <p>Favorites, gifts, and challenge activity you receive will show up here.</p>
        <div className="action-row">
          <Link className="primary-button" to="/browse">
            Explore profiles
          </Link>
        </div>
      </div>
    );
  }

  const unreadCount = data.notifications.filter((item) => !item.readAt).length;

  useEffect(() => {
    if (!data) {
      autoMarkedRef.current = false;
      return;
    }

    if (unreadCount === 0) {
      autoMarkedRef.current = false;
      return;
    }

    if (document.visibilityState !== "visible" || autoMarkedRef.current) {
      return;
    }

    autoMarkedRef.current = true;
    markAllMutation.mutate();
  }, [data, markAllMutation, unreadCount]);

  return (
    <div className="content-section">
      <div className="action-row">
        <span className={unreadCount > 0 ? "chip" : "chip chip-muted"}>
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </span>
        <button
          className="secondary-button"
          type="button"
          disabled={markAllMutation.isPending || unreadCount === 0}
          onClick={() => markAllMutation.mutate()}
        >
          {markAllMutation.isPending ? "Saving..." : "Mark all as read"}
        </button>
      </div>

      <div className="conversation-list">
        {data.notifications.map((item) => (
          <div
            className={item.readAt ? "conversation-item" : "conversation-item unread-item"}
            key={item.id}
          >
            <ProfileAvatar
              personalityType={item.actorProfile.personalityType}
              identity={item.actorProfile.identity}
              size="small"
            />
            <div className="conversation-copy">
              <h2>{item.actorProfile.displayName}</h2>
              <p>@{item.actorProfile.username}</p>
              <p className="conversation-preview">{describeNotification(item)}</p>
              <div className="conversation-meta">
                <span className={item.readAt ? "chip chip-muted" : "chip"}>
                  {item.readAt ? "Read" : "New"}
                </span>
                <span className="chip chip-muted">{getNotificationLabel(item)}</span>
              </div>
            </div>
            <Link className="secondary-button" to={getNotificationLink(item)}>
              {getNotificationActionLabel(item)}
            </Link>
            {!item.readAt ? (
              <button
                className="secondary-button"
                type="button"
                disabled={markOneMutation.isPending}
                onClick={() => markOneMutation.mutate(item.id)}
              >
                Mark read
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
