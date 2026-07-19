import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatIdentityLabel,
  formatLookingForLabel,
  formatTrustLevelLabel,
  identityOptions,
  lookingForOptions,
  personalityTypeDescriptions,
  personalityTypeOptions,
  platformRules,
  preferenceOptions,
  vibeOptions,
} from "../../config";
import { fetchProfiles } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

function readSavedBrowseFilters(storageKey: string) {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function ProfileList() {
  const filterStorageKey = "velora-browse-filters";
  const savedFilters = readSavedBrowseFilters(filterStorageKey);
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
  const [sortMode, setSortMode] = useState<"recommended" | "newest" | "name" | "favorited">(
    savedFilters.sortMode ?? "recommended",
  );
  const [favoritesOnly, setFavoritesOnly] = useState(Boolean(savedFilters.favoritesOnly));
  const [recommendedOnly, setRecommendedOnly] = useState(
    Boolean(savedFilters.recommendedOnly),
  );
  const { data, isLoading, error } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
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
      const matchesVibe = selectedVibe === "all" || profile.vibeTags.includes(selectedVibe);
      const matchesPreference =
        selectedPreference === "all" || visiblePreferences.includes(selectedPreference);
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

      if (sortMode === "newest") {
        return right.createdAt - left.createdAt;
      }

      return 0;
    });

  return (
    <section className="content-section">
      <div className="panel filter-panel">
        <div className="filter-panel-head">
          <div>
            <h2>Find the right tone faster.</h2>
            <p className="status-message">
              Scan quickly here, then open a full profile when someone catches your attention.
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
                setSortMode(event.target.value as "recommended" | "newest" | "name" | "favorited")
              }
            >
              <option value="recommended">Recommended</option>
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
              setSortMode("recommended");
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
          const visiblePreferences = profile.boundaries
            .filter((item) => !platformRules.includes(item as (typeof platformRules)[number]))
            .slice(0, 2);
          const bioPreview =
            profile.bio.length > 140 ? `${profile.bio.slice(0, 137)}...` : profile.bio;

          return (
            <article className="card profile-card profile-preview-card" key={profile.id}>
              <div className="profile-preview-head">
                <ProfileAvatar
                  personalityType={profile.personalityType}
                  identity={profile.identity}
                  dominantGiftType={profile.giftEffect.dominantGiftType}
                  size="medium"
                />
                <div className="profile-head">
                  <h2>{profile.displayName}</h2>
                  <p>@{profile.username}</p>
                </div>
              </div>

              <div className="chip-row">
                {profile.recommended ? <span className="chip">Recommended</span> : null}
                {profile.activityBadge ? <span className="chip">{profile.activityBadge}</span> : null}
                <span className="chip chip-muted">{formatTrustLevelLabel(profile.trustLevel)}</span>
                <span className="chip">{profile.personalityType}</span>
                <span className="chip chip-muted">{formatIdentityLabel(profile.identity)}</span>
                <span className="chip chip-muted">{formatLookingForLabel(profile.lookingFor)}</span>
              </div>

              <p className="status-message">
                {
                  personalityTypeDescriptions[
                    profile.personalityType as keyof typeof personalityTypeDescriptions
                  ]
                }
              </p>

              <p className="profile-bio">{bioPreview}</p>

              <div className="chip-row">
                {profile.vibeTags.slice(0, 3).map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
                {visiblePreferences.map((tag) => (
                  <span className="chip chip-muted" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>

              {profile.matchReasons.length > 0 ? (
                <div className="chip-row">
                  {profile.matchReasons.slice(0, 2).map((reason) => (
                    <span className="chip chip-muted" key={`${profile.id}-${reason}`}>
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="action-row">
                <Link className="primary-button" to={`/browse/${profile.username}`}>
                  View profile
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}
