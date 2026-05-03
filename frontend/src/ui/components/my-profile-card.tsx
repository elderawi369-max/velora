import { useQuery } from "@tanstack/react-query";
import { personalityTypeDescriptions, platformRules } from "../../config";
import { fetchOwnProfile } from "../../lib/api";

function getGiftEffectClass(giftType: "rose" | "starlight" | "crown" | null) {
  if (!giftType) {
    return "";
  }

  return `avatar-pill-${giftType}`;
}

export function MyProfileCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
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
  const giftEffectClass = getGiftEffectClass(profile.giftEffect.dominantGiftType);

  return (
    <article className="panel profile-card">
      <div className={`avatar-pill ${giftEffectClass}`.trim()}>{profile.avatarPreset}</div>
      <div className="profile-head">
        <h2>{profile.displayName}</h2>
        <p>@{profile.username}</p>
      </div>
      <div className="chip-row">
        <span className="chip">{profile.personalityType}</span>
        <span className="chip chip-muted">I am {profile.identity}</span>
        <span className="chip chip-muted">Open to {profile.lookingFor}</span>
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
      {profile.giftEffect.totalReceived > 0 ? (
        <div className="meta-group">
          <span className="meta-title">Gift effects</span>
          <div className="chip-row">
            {profile.giftEffect.highlights.map((highlight) => (
              <span className="chip" key={highlight}>
                {highlight}
              </span>
            ))}
            <span className="chip chip-muted">
              {profile.giftEffect.totalReceived} gift
              {profile.giftEffect.totalReceived === 1 ? "" : "s"} received
            </span>
          </div>
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
