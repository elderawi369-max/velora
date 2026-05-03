import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchConversations } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

export function ConversationList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });

  if (isLoading) {
    return <p className="status-message">Loading conversations...</p>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error-message">
          {error instanceof Error ? error.message : "Unable to load conversations."}
        </p>
      </div>
    );
  }

  if (!data || data.conversations.length === 0) {
    return (
      <div className="panel empty-state">
        <h2>No conversations yet.</h2>
        <p>Start with a profile you like, then the reconnect loop begins here.</p>
      </div>
    );
  }

  return (
    <div className="conversation-list">
      {data.conversations.map((conversation) => (
        (() => {
          const unreadCount =
            conversation.unreadCount ?? (conversation.unread ? 1 : 0);

          return (
        <Link
          className={
            conversation.unread
              ? "conversation-item unread-item"
              : "conversation-item"
          }
          key={conversation.id}
          to={`/chat/${conversation.id}`}
        >
          <ProfileAvatar
            personalityType={conversation.otherProfile?.personalityType}
            identity={conversation.otherProfile?.identity}
            size="small"
          />
          <div className="conversation-copy">
            <h2>{conversation.otherProfile?.displayName ?? "Unknown profile"}</h2>
            <p>@{conversation.otherProfile?.username ?? "missing-profile"}</p>
            <p className="conversation-preview">
              {conversation.lastMessagePreview || "No messages yet."}
            </p>
            <div className="conversation-meta">
              <span className={conversation.unread ? "chip" : "chip chip-muted"}>
                {conversation.unread
                  ? `${unreadCount} new`
                  : "Read"}
              </span>
              <span className={conversation.isFavorited ? "chip" : "chip chip-muted"}>
                {conversation.isFavorited ? "Favorited" : "Not favorited"}
              </span>
            </div>
          </div>
          {unreadCount > 0 ? (
            <div className="unread-bubble">{unreadCount}</div>
          ) : null}
        </Link>
          );
        })()
      ))}
    </div>
  );
}
