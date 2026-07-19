import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addFavorite, deleteConversation, fetchConversation, removeFavorite } from "../../lib/api";
import { ChatPanel } from "../components/chat-panel";
import { ChatSafetyPanel } from "../components/chat-safety-panel";
import { GiftActions } from "../components/gift-actions";
import { ProfileAvatar } from "../components/profile-avatar";

export function ChatPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (!params.conversationId) {
    return (
      <main className="content-section">
        <div className="panel">
          <p className="error-message">Conversation not found.</p>
        </div>
      </main>
    );
  }

  const conversationQuery = useQuery({
    queryKey: ["conversation", params.conversationId],
    queryFn: () => fetchConversation(params.conversationId!),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({
      profileId,
      nextState,
    }: {
      profileId: string;
      nextState: boolean;
    }) => (nextState ? addFavorite(profileId) : removeFavorite(profileId)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["conversation", params.conversationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["profiles"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["favorites"],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConversation(params.conversationId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["conversations"],
      });
      navigate("/conversations");
    },
  });

  const conversation = conversationQuery.data?.conversation;
  const otherProfile = conversation?.otherProfile;
  const initialDraft = searchParams.get("draft") ?? "";

  if (conversationQuery.isLoading) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="status-message">Loading conversation...</p>
        </section>
      </main>
    );
  }

  if (conversationQuery.error) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="error-message">
            {conversationQuery.error instanceof Error
              ? conversationQuery.error.message
              : "Unable to load this conversation."}
          </p>
          <div className="action-row">
            <Link className="secondary-button" to="/conversations">
              Back to conversations
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!conversation || !otherProfile) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="status-message">
            This conversation is no longer available.
          </p>
          <div className="action-row">
            <Link className="secondary-button" to="/conversations">
              Back to conversations
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="content-section">
      <section className="panel chat-shell">
        <div className="chat-topbar">
          <Link className="secondary-button chat-back-link" to="/conversations">
            Back to conversations
          </Link>
          <div className="chat-topbar-profile">
            <ProfileAvatar
              personalityType={otherProfile.personalityType}
              identity={otherProfile.identity}
              size="small"
            />
            <div className="profile-head">
              <h2>{otherProfile.displayName}</h2>
              <p>@{otherProfile.username}</p>
            </div>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={favoriteMutation.isPending}
            onClick={() =>
              favoriteMutation.mutate({
                profileId: otherProfile.id,
                nextState: !conversation.isFavorited,
              })
            }
          >
            {favoriteMutation.isPending
              ? "Saving..."
              : conversation.isFavorited
                ? "Unfavorite"
                : "Favorite"}
          </button>
        </div>
        <div className="chip-row">
          <span className={conversation.isFavorited ? "chip" : "chip chip-muted"}>
            {conversation.isFavorited ? "Favorited" : "Not favorited"}
          </span>
          {conversation.unread ? <span className="chip">Unread activity</span> : null}
        </div>

        <ChatPanel
          conversationId={params.conversationId}
          otherProfile={otherProfile}
          initialDraft={initialDraft}
        />

        <details className="panel chat-tools-panel">
          <summary>Conversation options</summary>
          <div className="content-section">
            <section className="meta-group">
              <span className="meta-title">Support this profile</span>
              <GiftActions profileId={otherProfile.id} />
            </section>

            <section className="action-row">
              <button
                className="danger-button"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Delete this conversation from your inbox?")) {
                    deleteMutation.mutate();
                  }
                }}
              >
                {deleteMutation.isPending ? "Removing..." : "Remove from inbox"}
              </button>
            </section>

            <ChatSafetyPanel
              conversationId={params.conversationId}
              targetProfileId={otherProfile.id}
            />
          </div>
        </details>
      </section>

      {deleteMutation.error ? (
        <p className="form-error">
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : "Unable to delete conversation."}
        </p>
      ) : null}
    </main>
  );
}
