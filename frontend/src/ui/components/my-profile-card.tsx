import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatIdentityLabel,
  formatLookingForLabel,
  formatTrustLevelLabel,
  personalityTypeDescriptions,
  platformRules,
} from "../../config";
import { activateBoost, fetchBoostCatalog, fetchOwnProfile } from "../../lib/api";
import { BoostStatus } from "./boost-status";
import { GiftEffectStatus } from "./gift-effect-status";
import { ProfileAvatar } from "./profile-avatar";

export function MyProfileCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
  });
  const boostCatalogQuery = useQuery({
    queryKey: ["boostCatalog"],
    queryFn: fetchBoostCatalog,
  });
  const boostMutation = useMutation({
    mutationFn: (boostType: string) => activateBoost(boostType),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });

  if (isLoading) {
    return <p className="status-message">Loading your profile...</p>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error-message">
          {error instanceof Error ? error.message : "Unable to load your profile."}
        </p>
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div className="panel empty-state">
        <h2>No profile yet.</h2>
        <p>Create one to shape how people find and return to you.</p>
      </div>
    );
  }

  const profile = data.profile;
  const visiblePreferences = profile.boundaries.filter(
    (item) => !platformRules.includes(item as (typeof platformRules)[number]),
  );

  return (
    <article className="panel profile-card">
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
      <div className="meta-group">
        <span className="meta-title">Profile boost</span>
        <div className="chip-row">
          {profile.boostEffect.activeLabel ? (
            <span className="chip">{profile.boostEffect.activeLabel}</span>
          ) : null}
          <span className="chip chip-muted">
            {profile.boostEffect.totalPurchased} boost
            {profile.boostEffect.totalPurchased === 1 ? "" : "s"} used
          </span>
        </div>
        <BoostStatus
          activeLabel={profile.boostEffect.activeLabel}
          activeExpiresAt={profile.boostEffect.activeExpiresAt}
          totalPurchased={profile.boostEffect.totalPurchased}
        />
        <div className="gift-row">
          {(boostCatalogQuery.data?.boosts ?? []).map((boost) => (
            <button
              key={boost.key}
              className="secondary-button"
              type="button"
              disabled={boostMutation.isPending}
              onClick={() => boostMutation.mutate(boost.key)}
            >
              {boostMutation.isPending
                ? "Activating..."
                : `Activate ${boost.label} · ${boost.durationHours}h`}
            </button>
          ))}
        </div>
        {boostMutation.error ? (
          <p className="form-error">
            {boostMutation.error instanceof Error
              ? boostMutation.error.message
              : "Unable to activate boost."}
          </p>
        ) : null}
      </div>
      {profile.giftEffect.totalReceived > 0 ? (
        <div className="meta-group">
          <span className="meta-title">Gift effects</span>
          <div className="chip-row">
            {profile.giftEffect.activeLabel ? (
              <span className="chip" key={profile.giftEffect.activeLabel}>
                {profile.giftEffect.activeLabel}
              </span>
            ) : null}
            <span className="chip chip-muted">
              {profile.giftEffect.totalReceived} gift
              {profile.giftEffect.totalReceived === 1 ? "" : "s"} received
            </span>
          </div>
          <GiftEffectStatus
            activeLabel={profile.giftEffect.activeLabel}
            activeExpiresAt={profile.giftEffect.activeExpiresAt}
            totalReceived={profile.giftEffect.totalReceived}
          />
        </div>
      ) : null}
      <p className="profile-bio">{profile.bio}</p>

      {profile.promptEntries.length > 0 ? (
        <div className="meta-group">
          <span className="meta-title">Profile prompts</span>
          <div className="content-section">
            {profile.promptEntries.map((entry) => (
              <div className="panel form-panel" key={entry.question}>
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
  );
}
