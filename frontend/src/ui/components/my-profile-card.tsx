import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  formatIdentityLabel,
  formatLookingForLabel,
  formatTrustLevelLabel,
  personalityTypeDescriptions,
  platformRules,
} from "../../config";
import {
  createBoostCheckout,
  createChallengeCreditCheckout,
  fetchBoostCatalog,
  fetchChallengeCreditCatalog,
  fetchOwnProfile,
  savePendingCheckoutId,
} from "../../lib/api";
import {
  completeGooglePlayPurchase,
  isNativeAndroidApp,
  shouldUseGooglePlayBilling,
} from "../../lib/google-play-billing";
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
  const challengeCreditCatalogQuery = useQuery({
    queryKey: ["challengeCreditCatalog"],
    queryFn: fetchChallengeCreditCatalog,
  });

  const boostMutation = useMutation({
    mutationFn: async (boostType: string) => {
      if (await shouldUseGooglePlayBilling()) {
        return completeGooglePlayPurchase({
          productKind: "boost",
          itemKey: boostType,
        });
      }

      if (isNativeAndroidApp()) {
        throw new Error("This Android build should use Google Play Billing, not web checkout.");
      }

      const checkout = await createBoostCheckout(boostType);
      return { mode: "checkout" as const, ...checkout };
    },
    onSuccess: async (result) => {
      if ("mode" in result) {
        savePendingCheckoutId(result.checkoutId);
        window.location.href = result.checkoutUrl;
        return;
      }

      if (!result.cancelled) {
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      }
    },
  });

  const challengeCreditMutation = useMutation({
    mutationFn: async (packKey: string) => {
      if (await shouldUseGooglePlayBilling()) {
        return completeGooglePlayPurchase({
          productKind: "challenge_credit_pack",
          itemKey: packKey,
        });
      }

      if (isNativeAndroidApp()) {
        throw new Error("This Android build should use Google Play Billing, not web checkout.");
      }

      const checkout = await createChallengeCreditCheckout(packKey);
      return { mode: "checkout" as const, ...checkout };
    },
    onSuccess: async (result) => {
      if ("mode" in result) {
        savePendingCheckoutId(result.checkoutId);
        window.location.href = result.checkoutUrl;
        return;
      }

      if (!result.cancelled) {
        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      }
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
        <div className="action-row">
          <Link className="primary-button" to="/create-profile">
            Create profile
          </Link>
        </div>
      </div>
    );
  }

  const profile = data.profile;
  const identityLabel = formatIdentityLabel(profile.identity);
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
        {identityLabel ? <span className="chip chip-muted">{identityLabel}</span> : null}
        <span className="chip chip-muted">{formatLookingForLabel(profile.lookingFor)}</span>
        {profile.trustSignals.map((signal) => (
          <span className="chip" key={signal}>
            {signal}
          </span>
        ))}
      </div>
      <p className="profile-reward-note">
        Complete profiles may unlock occasional challenge credit rewards.
      </p>
      <p className="status-message">
        {
          personalityTypeDescriptions[
            profile.personalityType as keyof typeof personalityTypeDescriptions
          ]
        }
      </p>

      <div className="meta-group">
        <span className="meta-title">Challenge credits</span>
        <div className="chip-row">
          <span className="chip">
            {profile.challengeCredits} credit{profile.challengeCredits === 1 ? "" : "s"} ready
          </span>
          <span className="chip chip-muted">1 credit per challenge sent</span>
        </div>
        <p className="status-message">
          Credits are only used when you send a challenge. If you cancel while it is still pending,
          the credit returns to your balance automatically.
        </p>
        <div className="gift-row">
          {(challengeCreditCatalogQuery.data?.packs ?? []).map((pack) => (
            <button
              key={pack.key}
              className="secondary-button"
              type="button"
              disabled={challengeCreditMutation.isPending}
              onClick={() => challengeCreditMutation.mutate(pack.key)}
            >
              {challengeCreditMutation.isPending
                ? "Opening checkout..."
                : `Buy ${pack.label} · $${(pack.priceCents / 100).toFixed(2)}`}
            </button>
          ))}
        </div>
        {challengeCreditMutation.error ? (
          <p className="form-error">
            {challengeCreditMutation.error instanceof Error
              ? challengeCreditMutation.error.message
              : "Unable to open challenge credit checkout."}
          </p>
        ) : null}
      </div>

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
                ? "Opening checkout..."
                : `Buy ${boost.label} · ${boost.durationHours}h · $${(boost.priceCents / 100).toFixed(2)}`}
            </button>
          ))}
        </div>
        {boostMutation.error ? (
          <p className="form-error">
            {boostMutation.error instanceof Error
              ? boostMutation.error.message
              : "Unable to open boost checkout."}
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
