import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  addFavorite,
  createChallenge,
  createConversation,
  fetchProfileByUsername,
  fetchOwnProfile,
  removeFavorite,
} from "../../lib/api";
import {
  formatIdentityLabel,
  formatLookingForLabel,
  formatTrustLevelLabel,
  personalityTypeDescriptions,
  platformRules,
} from "../../config";
import { GiftActions } from "../components/gift-actions";
import { ProfileAvatar } from "../components/profile-avatar";

function getSuggestedOpener(profile: {
  displayName: string;
  personalityType: string;
  promptEntries: Array<{ question: string; answer: string }>;
  vibeTags: string[];
}) {
  const prompt = profile.promptEntries.find((entry) => entry.answer.trim().length > 0);
  if (prompt) {
    return `${profile.displayName}, your profile mentioned "${prompt.answer}". What makes that stand out for you?`;
  }

  const vibe = profile.vibeTags[0];
  if (vibe) {
    return `Your ${vibe} vibe caught my eye. What kind of conversation feels best for you here?`;
  }

  return `What kind of ${profile.personalityType} energy are you hoping for tonight?`;
}

export function ProfileDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const username = params.username ?? "";
  const profileQuery = useQuery({
    queryKey: ["profile", username],
    queryFn: () => fetchProfileByUsername(username),
    enabled: Boolean(username),
  });
  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
  });

  const createConversationMutation = useMutation({
    mutationFn: ({ initialDraft }: { initialDraft?: string }) =>
      createConversation(profileQuery.data?.profile.id ?? "").then((result) => ({
        ...result,
        initialDraft,
      })),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      const encodedDraft = result.initialDraft
        ? `?draft=${encodeURIComponent(result.initialDraft)}`
        : "";
      navigate(`/chat/${result.conversation.id}${encodedDraft}`);
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ profileId, nextState }: { profileId: string; nextState: boolean }) =>
      nextState ? addFavorite(profileId) : removeFavorite(profileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile", username] });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const vibeCheckMutation = useMutation({
    mutationFn: () =>
      createChallenge({
        targetProfileId: profileQuery.data?.profile.id ?? "",
        type: "compatibility",
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      navigate(`/challenges/${result.challenge.id}`);
    },
  });

  const triviaMutation = useMutation({
    mutationFn: () =>
      createChallenge({
        targetProfileId: profileQuery.data?.profile.id ?? "",
        type: "trivia",
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      navigate(`/challenges/${result.challenge.id}`);
    },
  });

  if (profileQuery.isLoading) {
    return (
      <main className="content-section">
        <p className="status-message">Loading profile...</p>
      </main>
    );
  }

  if (profileQuery.error || !profileQuery.data?.profile) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="error-message">
            {profileQuery.error instanceof Error
              ? profileQuery.error.message
              : "Unable to load this profile."}
          </p>
        </section>
      </main>
    );
  }

  const profile = profileQuery.data.profile;
  const visiblePreferences = profile.boundaries.filter(
    (item) => !platformRules.includes(item as (typeof platformRules)[number]),
  );
  const suggestedOpener = getSuggestedOpener(profile);
  const creditBalance = ownProfileQuery.data?.profile?.challengeCredits ?? 0;

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Profile</p>
        <h1>See the full profile before you decide how to start.</h1>
      </section>

      <article className="panel profile-card profile-detail-card">
        <ProfileAvatar
          personalityType={profile.personalityType}
          identity={profile.identity}
          dominantGiftType={profile.giftEffect.dominantGiftType}
          size="large"
        />

        <div className="profile-head">
          <h2>{profile.displayName}</h2>
          <p>@{profile.username}</p>
        </div>

        <div className="chip-row">
          {profile.recommended ? <span className="chip">Recommended match</span> : null}
          {profile.compatibilityScore > 0 ? (
            <span className="chip chip-muted">Match score {profile.compatibilityScore}</span>
          ) : null}
          {profile.activityBadge ? <span className="chip">{profile.activityBadge}</span> : null}
          <span className="chip chip-muted">{formatTrustLevelLabel(profile.trustLevel)}</span>
          <span className="chip">{profile.personalityType}</span>
          <span className="chip chip-muted">{formatIdentityLabel(profile.identity)}</span>
          <span className="chip chip-muted">{formatLookingForLabel(profile.lookingFor)}</span>
          {profile.trustSignals.map((signal) => (
            <span className="chip" key={signal}>
              {signal}
            </span>
          ))}
        </div>

        <p className="status-message">
          {
            personalityTypeDescriptions[
              profile.personalityType as keyof typeof personalityTypeDescriptions
            ]
          }
        </p>

        {profile.matchReasons.length > 0 ? (
          <div className="meta-group">
            <span className="meta-title">Why this matches</span>
            <div className="chip-row">
              {profile.matchReasons.map((reason) => (
                <span className="chip chip-muted" key={`${profile.id}-${reason}`}>
                  {reason}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className="profile-bio">{profile.bio}</p>

        <div className="meta-group">
          <span className="meta-title">Suggested opener</span>
          <p className="status-message">{suggestedOpener}</p>
        </div>

        <div className="meta-group">
          <span className="meta-title">Break the ice</span>
          <p className="status-message">
            Pick a challenge that fits the mood. Vibe Check compares chemistry, while
            Trivia turns the first interaction into a light competition.
          </p>
          <div className="chip-row">
            <span className="chip">{creditBalance} credit{creditBalance === 1 ? "" : "s"} available</span>
            <span className="chip chip-muted">Each challenge costs 1 credit</span>
          </div>
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              disabled={
                vibeCheckMutation.isPending || triviaMutation.isPending || creditBalance < 1
              }
              onClick={() => vibeCheckMutation.mutate()}
            >
              {vibeCheckMutation.isPending ? "Starting..." : "Start Vibe Check"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={
                vibeCheckMutation.isPending || triviaMutation.isPending || creditBalance < 1
              }
              onClick={() => triviaMutation.mutate()}
            >
              {triviaMutation.isPending ? "Starting..." : "Send Trivia Challenge"}
            </button>
          </div>
          {creditBalance < 1 ? (
            <p className="status-message">
              You need a challenge credit before sending one. You can add packs from your profile.
            </p>
          ) : null}
          {vibeCheckMutation.error instanceof Error ? (
            <p className="error-message">{vibeCheckMutation.error.message}</p>
          ) : null}
          {triviaMutation.error instanceof Error ? (
            <p className="error-message">{triviaMutation.error.message}</p>
          ) : null}
          <p className="status-message">
            Both challenge types stay inside Velora and can lead straight into chat
            after the result is revealed.
          </p>
        </div>

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            disabled={createConversationMutation.isPending}
            onClick={() => createConversationMutation.mutate({ initialDraft: suggestedOpener })}
          >
            {createConversationMutation.isPending ? "Opening..." : "Start with opener"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={createConversationMutation.isPending}
            onClick={() => createConversationMutation.mutate({})}
          >
            {createConversationMutation.isPending ? "Opening..." : "Open blank chat"}
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
            {favoriteMutation.isPending
              ? "Saving..."
              : profile.isFavorited
                ? "Unfavorite"
                : "Favorite"}
          </button>
        </div>

        <GiftActions profileId={profile.id} />

        {profile.promptEntries.length > 0 ? (
          <div className="meta-group">
            <span className="meta-title">Prompts</span>
            <div className="content-section">
              {profile.promptEntries.map((entry) => (
                <div className="panel form-panel" key={`${profile.id}-${entry.question}`}>
                  <span className="meta-title">{entry.question}</span>
                  <p>{entry.answer}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
          <span className="meta-title">Preferences</span>
          {visiblePreferences.length > 0 ? (
            <div className="chip-row">
              {visiblePreferences.map((tag) => (
                <span className="chip chip-muted" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="status-message">No extra preferences listed.</p>
          )}
        </div>
      </article>
    </main>
  );
}
