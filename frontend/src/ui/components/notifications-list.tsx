import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

function describeNotification(item: NotificationItem) {
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

  return "favorited your profile.";
}

export function NotificationsList() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 15000,
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
        <p>Favorites and gifts you receive will show up here.</p>
      </div>
    );
  }

  const unreadCount = data.notifications.filter((item) => !item.readAt).length;

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
                <span className="chip chip-muted">
                  {item.type === "gift" ? "Gift" : "Favorite"}
                </span>
              </div>
            </div>
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
