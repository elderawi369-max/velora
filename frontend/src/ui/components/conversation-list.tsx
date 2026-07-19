import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { deleteConversation, fetchConversations } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

function getConversationStatusLabel(conversation: {
  unread: boolean;
  unreadCount?: number;
  awaitingReply?: boolean;
  needsTheirReply?: boolean;
  isFavorited: boolean;
}) {
  const unreadCount = conversation.unreadCount ?? (conversation.unread ? 1 : 0);

  if (conversation.awaitingReply && unreadCount > 0) {
    return `${unreadCount} new ${unreadCount === 1 ? "message" : "messages"} waiting`;
  }

  if (conversation.awaitingReply) {
    return "Reply now";
  }

  if (conversation.needsTheirReply) {
    return "Waiting on them";
  }

  if (conversation.isFavorited) {
    return "Favorited";
  }

  return "Read";
}

export function ConversationList() {
  const queryClient = useQueryClient();
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    refetchInterval: 8000,
  });

  const deleteMutation = useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: async () => {
      setPendingDeleteConversationId("");
      setDeleteErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      setDeleteErrorMessage(
        error instanceof Error ? error.message : "Unable to delete conversation.",
      );
    },
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
        <div className="action-row">
          <Link className="primary-button" to="/browse">
            Browse profiles
          </Link>
        </div>
      </div>
    );
  }

  const orderedConversations = [...data.conversations].sort((left, right) => {
    const leftAwaitingReply = Boolean(left.awaitingReply);
    const rightAwaitingReply = Boolean(right.awaitingReply);
    if (leftAwaitingReply !== rightAwaitingReply) {
      return leftAwaitingReply ? -1 : 1;
    }

    const leftUnread = left.unreadCount ?? (left.unread ? 1 : 0);
    const rightUnread = right.unreadCount ?? (right.unread ? 1 : 0);
    if (rightUnread !== leftUnread) {
      return rightUnread - leftUnread;
    }

    const leftNeedsTheirReply = Boolean(left.needsTheirReply);
    const rightNeedsTheirReply = Boolean(right.needsTheirReply);
    if (leftNeedsTheirReply !== rightNeedsTheirReply) {
      return leftNeedsTheirReply ? 1 : -1;
    }

    return right.lastMessageAt - left.lastMessageAt;
  });

  return (
    <div className="conversation-list">
      {orderedConversations.map((conversation) => (
        (() => {
          const unreadCount = conversation.unreadCount ?? (conversation.unread ? 1 : 0);
          const statusLabel = getConversationStatusLabel(conversation);

          return (
            <article
              className={conversation.unread ? "conversation-item unread-item" : "conversation-item"}
              key={conversation.id}
            >
              <Link className="conversation-link" to={`/chat/${conversation.id}`}>
                <ProfileAvatar
                  personalityType={conversation.otherProfile?.personalityType}
                  identity={conversation.otherProfile?.identity}
                  size="small"
                />
                <div className="conversation-copy">
                  <div className="conversation-row">
                    <h2>{conversation.otherProfile?.displayName ?? "Unknown profile"}</h2>
                    {unreadCount > 0 ? <div className="unread-bubble">{unreadCount}</div> : null}
                  </div>
                  <p className="conversation-handle">
                    @{conversation.otherProfile?.username ?? "missing-profile"}
                  </p>
                  <p className="conversation-preview">
                    {conversation.lastMessagePreview || "No messages yet."}
                  </p>
                  <div className="conversation-row conversation-row-muted">
                    <span className={conversation.unread || conversation.awaitingReply ? "conversation-status conversation-status-active" : "conversation-status"}>
                      {statusLabel}
                    </span>
                    {conversation.isFavorited ? <span className="conversation-status">Favorited</span> : null}
                  </div>
                </div>
              </Link>
              <div className="conversation-actions">
                <button
                  className="text-button conversation-remove-button"
                  type="button"
                  disabled={deleteMutation.isPending && pendingDeleteConversationId === conversation.id}
                  onClick={() => {
                    if (window.confirm("Delete this conversation from your inbox?")) {
                      setDeleteErrorMessage("");
                      setPendingDeleteConversationId(conversation.id);
                      deleteMutation.mutate(conversation.id);
                    }
                  }}
                >
                  {deleteMutation.isPending && pendingDeleteConversationId === conversation.id
                    ? "Removing..."
                    : "Remove"}
                </button>
              </div>
              {deleteErrorMessage && pendingDeleteConversationId === conversation.id ? (
                <p className="form-error">
                  {deleteErrorMessage}
                </p>
              ) : null}
            </article>
          );
        })()
      ))}
    </div>
  );
}
