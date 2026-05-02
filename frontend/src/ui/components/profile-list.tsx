import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addFavorite,
  createConversation,
  fetchGiftCatalog,
  fetchProfiles,
  removeFavorite,
  sendGift,
} from "../../lib/api";

export function ProfileList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [giftSuccess, setGiftSuccess] = useState<string>("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });
  const giftCatalogQuery = useQuery({
    queryKey: ["giftCatalog"],
    queryFn: fetchGiftCatalog,
  });

  const createConversationMutation = useMutation({
    mutationFn: (targetProfileId: string) => createConversation(targetProfileId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/chat/${result.conversation.id}`);
    },
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ profileId, nextState }: { profileId: string; nextState: boolean }) =>
      nextState ? addFavorite(profileId) : removeFavorite(profileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
  const giftMutation = useMutation({
    mutationFn: ({ profileId, giftType }: { profileId: string; giftType: string }) =>
      sendGift(profileId, giftType),
    onSuccess: (_, variables) => {
      const gift = giftCatalogQuery.data?.gifts.find((item) => item.key === variables.giftType);
      setGiftSuccess(gift ? `${gift.label} sent.` : "Gift sent.");
    },
  });

  if (isLoading) {
    return <p className="status-message">Loading profiles...</p>;
  }

  if (error) {
    return (
      <p className="status-message error-message">
        {error instanceof Error ? error.message : "Unable to load profiles."}
      </p>
    );
  }

  if (!data || data.profiles.length === 0) {
    return (
      <div className="panel empty-state">
        <h2>No profiles yet.</h2>
        <p>The first profiles created in beta will define the tone of Velora.</p>
      </div>
    );
  }

  return (
    <section className="card-grid">
      {data.profiles.map((profile) => (
        <article className="card profile-card" key={profile.id}>
          <div className="avatar-pill">{profile.avatarPreset}</div>
          <div className="profile-head">
            <h2>{profile.displayName}</h2>
            <p>@{profile.username}</p>
          </div>
          <p className="profile-bio">{profile.bio}</p>

          <div className="meta-group">
            <span className="meta-title">Vibe</span>
            <div className="chip-row">
              {profile.vibeTags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="meta-group">
            <span className="meta-title">Boundaries</span>
            <div className="chip-row">
              {profile.boundaries.map((tag) => (
                <span className="chip chip-muted" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              disabled={createConversationMutation.isPending}
              onClick={() => createConversationMutation.mutate(profile.id)}
            >
              {createConversationMutation.isPending ? "Opening..." : "Start chat"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={favoriteMutation.isPending}
              onClick={() =>
                favoriteMutation.mutate({
                  profileId: profile.id,
                  nextState: !profile.isFavorited,
                })
              }
            >
              {profile.isFavorited ? "Unfavorite" : "Favorite"}
            </button>
          </div>

          <div className="gift-row">
            {(giftCatalogQuery.data?.gifts ?? []).map((gift) => (
              <button
                key={gift.key}
                className="gift-button"
                type="button"
                disabled={giftMutation.isPending}
                onClick={() => {
                  setGiftSuccess("");
                  giftMutation.mutate({ profileId: profile.id, giftType: gift.key });
                }}
              >
                {giftMutation.isPending ? "Sending..." : `Send ${gift.label}`}
              </button>
            ))}
          </div>

          {giftMutation.error ? (
            <p className="form-error">
              {giftMutation.error instanceof Error
                ? giftMutation.error.message
                : "Unable to send gift."}
            </p>
          ) : null}

          {giftSuccess ? <p className="success-message">{giftSuccess}</p> : null}
        </article>
      ))}
    </section>
  );
}
