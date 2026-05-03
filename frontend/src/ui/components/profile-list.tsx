import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatIdentityLabel,
  formatLookingForLabel,
  identityOptions,
  lookingForOptions,
  personalityTypeDescriptions,
  personalityTypeOptions,
  platformRules,
  preferenceOptions,
  vibeOptions,
} from "../../config";
import {
  addFavorite,
  createConversation,
  fetchGiftCatalog,
  fetchProfiles,
  removeFavorite,
  sendGift,
} from "../../lib/api";
import { GiftEffectStatus } from "./gift-effect-status";
import { ProfileAvatar } from "./profile-avatar";

export function ProfileList() {
  const filterStorageKey = "velora-browse-filters";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [giftSuccess, setGiftSuccess] = useState<string>("");
  const savedFilters =
    typeof window !== "undefined"
      ? JSON.parse(window.localStorage.getItem(filterStorageKey) ?? "{}")
      : {};
  const [searchTerm, setSearchTerm] = useState(savedFilters.searchTerm ?? "");
  const [selectedVibe, setSelectedVibe] = useState<string>(savedFilters.selectedVibe ?? "all");
  const [selectedPreference, setSelectedPreference] = useState<string>(
    savedFilters.selectedPreference ?? "all",
  );
  const [selectedIdentity, setSelectedIdentity] = useState<string>(
    savedFilters.selectedIdentity ?? "all",
  );
  const [selectedPersonalityType, setSelectedPersonalityType] = useState<string>(
    savedFilters.selectedPersonalityType ?? "all",
  );
  const [selectedLookingFor, setSelectedLookingFor] = useState<string>(
    savedFilters.selectedLookingFor ?? "all",
  );
  const [sortMode, setSortMode] = useState<"newest" | "name" | "favorited">(
    savedFilters.sortMode ?? "newest",
  );
  const [favoritesOnly, setFavoritesOnly] = useState(Boolean(savedFilters.favoritesOnly));
  const [recommendedOnly, setRecommendedOnly] = useState(
    Boolean(savedFilters.recommendedOnly),
  );
  const { data, isLoading, error } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });
  const giftCatalogQuery = useQuery({
    queryKey: ["giftCatalog"],
    queryFn: fetchGiftCatalog,
  });

  useEffect(() => {
    window.localStorage.setItem(
      filterStorageKey,
      JSON.stringify({
        searchTerm,
        selectedVibe,
        selectedPreference,
        selectedIdentity,
        selectedPersonalityType,
        selectedLookingFor,
        sortMode,
        favoritesOnly,
        recommendedOnly,
      }),
    );
  }, [
    favoritesOnly,
    recommendedOnly,
    searchTerm,
    selectedIdentity,
    selectedPersonalityType,
    selectedLookingFor,
    selectedPreference,
    selectedVibe,
    sortMode,
  ]);

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

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProfiles = [...data.profiles]
    .filter((profile) => {
      const visiblePreferences = profile.boundaries.filter(
        (item) => !platformRules.includes(item as (typeof platformRules)[number]),
      );
      const matchesSearch =
        normalizedSearch.length === 0 ||
        profile.displayName.toLowerCase().includes(normalizedSearch) ||
        profile.username.toLowerCase().includes(normalizedSearch) ||
        profile.bio.toLowerCase().includes(normalizedSearch);
      const matchesVibe =
        selectedVibe === "all" || profile.vibeTags.includes(selectedVibe);
      const matchesPreference =
        selectedPreference === "all" ||
        visiblePreferences.includes(selectedPreference);
      const matchesIdentity =
        selectedIdentity === "all" || profile.identity === selectedIdentity;
      const matchesPersonalityType =
        selectedPersonalityType === "all" ||
        profile.personalityType === selectedPersonalityType;
      const matchesLookingFor =
        selectedLookingFor === "all" || profile.lookingFor === selectedLookingFor;
      const matchesFavorite = !favoritesOnly || profile.isFavorited;
      const matchesRecommended = !recommendedOnly || profile.recommended;

      return (
        matchesSearch &&
        matchesVibe &&
        matchesPreference &&
        matchesIdentity &&
        matchesPersonalityType &&
        matchesLookingFor &&
        matchesFavorite &&
        matchesRecommended
      );
    })
    .sort((left, right) => {
      if (sortMode === "name") {
        return left.displayName.localeCompare(right.displayName);
      }

      if (sortMode === "favorited") {
        if (left.isFavorited === right.isFavorited) {
          return right.createdAt - left.createdAt;
        }

        return left.isFavorited ? -1 : 1;
      }

      return right.createdAt - left.createdAt;
    });

  return (
    <section className="content-section">
      <div className="panel filter-panel">
        <div className="filter-panel-head">
          <div>
            <h2>Find the right tone faster.</h2>
            <p className="status-message">
              Filter by vibe, communication style, or the profiles you already like.
            </p>
          </div>
          <span className="chip">
            {filteredProfiles.length} of {data.profiles.length} profiles
          </span>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Search</span>
            <input
              placeholder="Name, @username, or bio"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Vibe</span>
            <select
              value={selectedVibe}
              onChange={(event) => setSelectedVibe(event.target.value)}
            >
              <option value="all">All vibes</option>
              {vibeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Preference</span>
            <select
              value={selectedPreference}
              onChange={(event) => setSelectedPreference(event.target.value)}
            >
              <option value="all">All preferences</option>
              {preferenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Identity</span>
            <select
              value={selectedIdentity}
              onChange={(event) => setSelectedIdentity(event.target.value)}
            >
              <option value="all">All identities</option>
              {identityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Personality</span>
            <select
              value={selectedPersonalityType}
              onChange={(event) => setSelectedPersonalityType(event.target.value)}
            >
              <option value="all">All personality types</option>
              {personalityTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Open to chatting with</span>
            <select
              value={selectedLookingFor}
              onChange={(event) => setSelectedLookingFor(event.target.value)}
            >
              <option value="all">Any preference</option>
              {lookingForOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Sort by</span>
            <select
              value={sortMode}
              onChange={(event) =>
                setSortMode(event.target.value as "newest" | "name" | "favorited")
              }
            >
              <option value="newest">Newest first</option>
              <option value="favorited">Favorited first</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <div className="action-row">
          <button
            className={favoritesOnly ? "tag-button tag-active" : "tag-button"}
            type="button"
            onClick={() => setFavoritesOnly((current) => !current)}
          >
            {favoritesOnly ? "Showing favorites only" : "Favorites only"}
          </button>
          <button
            className={recommendedOnly ? "tag-button tag-active" : "tag-button"}
            type="button"
            onClick={() => setRecommendedOnly((current) => !current)}
          >
            {recommendedOnly ? "Showing recommended only" : "Recommended only"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setSearchTerm("");
              setSelectedVibe("all");
              setSelectedPreference("all");
              setSelectedIdentity("all");
              setSelectedPersonalityType("all");
              setSelectedLookingFor("all");
              setSortMode("newest");
              setFavoritesOnly(false);
              setRecommendedOnly(false);
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {filteredProfiles.length === 0 ? (
        <div className="panel empty-state">
          <h2>No profiles match those filters yet.</h2>
          <p>Try a broader vibe, fewer restrictions, or clear the filters.</p>
        </div>
      ) : null}

      <section className="card-grid">
      {filteredProfiles.map((profile) => {
        const visiblePreferences = profile.boundaries.filter(
          (item) => !platformRules.includes(item as (typeof platformRules)[number]),
        );

        return (
        <article className="card profile-card" key={profile.id}>
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
          {profile.giftEffect.totalReceived > 0 ? (
            <div className="meta-group">
              <span className="meta-title">Gift effects</span>
              <div className="chip-row">
                {profile.giftEffect.activeLabel ? (
                  <span className="chip" key={`${profile.id}-${profile.giftEffect.activeLabel}`}>
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
      )})}
      </section>
    </section>
  );
}
