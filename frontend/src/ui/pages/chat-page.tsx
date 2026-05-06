import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addFavorite, deleteConversation, fetchConversation, removeFavorite } from "../../lib/api";
import { ChatPanel } from "../components/chat-panel";
import { ChatSafetyPanel } from "../components/chat-safety-panel";
import { GiftActions } from "../components/gift-actions";
import { ProfileAvatar } from "../components/profile-avatar";

export function ChatPage() {
  const params = useParams();
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

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Chat</p>
        <h1>Stay inside the app and let the tone build over time.</h1>
      </section>

      {otherProfile ? (
        <div className="panel conversation-header">
          <ProfileAvatar
            personalityType={otherProfile.personalityType}
            identity={otherProfile.identity}
            size="medium"
          />
          <div className="profile-head">
            <h2>{otherProfile.displayName}</h2>
            <p>@{otherProfile.username}</p>
          </div>
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              disabled={favoriteMutation.isPending}
              onClick={() =>
                favoriteMutation.mutate({
                  profileId: otherProfile.id,
                  nextState: !conversation?.isFavorited,
                })
              }
            >
              {favoriteMutation.isPending
                ? "Saving..."
                : conversation?.isFavorited
                  ? "Unfavorite"
                  : "Favorite"}
            </button>
            <button
              className="secondary-button danger-button"
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
            <span className={conversation?.isFavorited ? "chip" : "chip chip-muted"}>
              {conversation?.isFavorited ? "Favorited" : "Not favorited"}
            </span>
          </div>
          <GiftActions profileId={otherProfile.id} />
        </div>
      ) : null}

      <ChatPanel conversationId={params.conversationId} />

      {deleteMutation.error ? (
        <p className="form-error">
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : "Unable to delete conversation."}
        </p>
      ) : null}

      {otherProfile ? (
        <ChatSafetyPanel
          conversationId={params.conversationId}
          targetProfileId={otherProfile.id}
        />
      ) : null}
    </main>
  );
}
