import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { fetchProfiles, type PublicProfile } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

const browseFilterStorageKey = "velora-browse-filters";
const browseScrollStorageKey = "velora-browse-scroll-y";
const browseBatchSize = 20;

function readSavedBrowseFilters() {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(browseFilterStorageKey);
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
  const savedFilters = readSavedBrowseFilters();
  const [searchInput, setSearchInput] = useState(savedFilters.searchTerm ?? "");
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
  const [loadMoreError, setLoadMoreError] = useState("");
  const didRestoreScroll = useRef(false);

  const filters = {
    searchTerm,
    selectedVibe,
    selectedPreference,
    selectedIdentity,
    selectedPersonalityType,
    selectedLookingFor,
    sortMode,
    favoritesOnly,
    recommendedOnly,
  } as const;

  const profilesQuery = useInfiniteQuery({
    queryKey: [
      "profiles",
      searchTerm,
      selectedVibe,
      selectedPreference,
      selectedIdentity,
      selectedPersonalityType,
      selectedLookingFor,
      sortMode,
      favoritesOnly,
      recommendedOnly,
    ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchProfiles({
        ...filters,
        limit: browseBatchSize,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchTerm(searchInput);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    window.localStorage.setItem(
      browseFilterStorageKey,
      JSON.stringify(filters),
    );
  }, [
    favoritesOnly,
    recommendedOnly,
    searchInput,
    selectedIdentity,
    selectedLookingFor,
    selectedPersonalityType,
    selectedPreference,
    selectedVibe,
    sortMode,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleScroll = () => {
      window.sessionStorage.setItem(browseScrollStorageKey, String(window.scrollY));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (didRestoreScroll.current || !profilesQuery.data?.pages.length) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const savedY = Number(window.sessionStorage.getItem(browseScrollStorageKey) ?? "0");
    didRestoreScroll.current = true;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Number.isFinite(savedY) ? savedY : 0, behavior: "auto" });
    });
  }, [profilesQuery.data?.pages.length]);

  const seenProfileIds = new Set<string>();
  const loadedProfiles: PublicProfile[] = [];
  for (const page of profilesQuery.data?.pages ?? []) {
    for (const profile of page.profiles) {
      if (seenProfileIds.has(profile.id)) {
        continue;
      }

      seenProfileIds.add(profile.id);
      loadedProfiles.push(profile);
    }
  }

  const lastPage = profilesQuery.data?.pages[profilesQuery.data.pages.length - 1];
  const totalProfiles = lastPage?.totalProfiles ?? 0;
  const filteredCount = lastPage?.filteredCount ?? 0;
  const hasMore = Boolean(lastPage?.hasMore);

  if (profilesQuery.isLoading) {
    return <p className="status-message">Loading profiles...</p>;
  }

  if (profilesQuery.error) {
    return (
      <div className="panel empty-state">
        <h2>Unable to load profiles right now.</h2>
        <p className="error-message">
          {profilesQuery.error instanceof Error
            ? profilesQuery.error.message
            : "Please try again."}
        </p>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={() => profilesQuery.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profilesQuery.data || totalProfiles === 0) {
    return (
      <div className="panel empty-state">
        <h2>No profiles yet.</h2>
        <p>The first profiles created in beta will define the tone of Velora.</p>
      </div>
    );
  }

  async function handleLoadMore() {
    setLoadMoreError("");

    try {
      await profilesQuery.fetchNextPage();
    } catch (error) {
      setLoadMoreError(
        error instanceof Error ? error.message : "Unable to load more profiles.",
      );
    }
  }

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
            {loadedProfiles.length} of {filteredCount} profiles
          </span>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Search</span>
            <input
              placeholder="Name, @username, or bio"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
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
              setSearchInput("");
              setSelectedVibe("all");
              setSelectedPreference("all");
              setSelectedIdentity("all");
              setSelectedPersonalityType("all");
              setSelectedLookingFor("all");
              setSortMode("recommended");
              setFavoritesOnly(false);
              setRecommendedOnly(false);
              setLoadMoreError("");
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
                window.sessionStorage.setItem(browseScrollStorageKey, "0");
              }
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {filteredCount === 0 ? (
        <div className="panel empty-state">
          <h2>No profiles match those filters yet.</h2>
          <p>Try a broader vibe, fewer restrictions, or clear the filters.</p>
        </div>
      ) : null}

      {loadedProfiles.length > 0 ? (
        <section className="card-grid">
          {loadedProfiles.map((profile) => {
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
      ) : null}

      {filteredCount > 0 ? (
        <section className="panel browse-footer-panel">
          {hasMore ? (
            <div className="browse-footer-copy">
              <p className="status-message">
                Showing {loadedProfiles.length} of {filteredCount} matching profiles.
              </p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={profilesQuery.isFetchingNextPage}
                  onClick={() => void handleLoadMore()}
                >
                  {profilesQuery.isFetchingNextPage ? "Loading more..." : "Load more profiles"}
                </button>
              </div>
              {loadMoreError ? <p className="error-message">{loadMoreError}</p> : null}
            </div>
          ) : (
            <p className="status-message">
              {filteredCount === loadedProfiles.length
                ? "You’ve reached the end of these profiles."
                : `Showing ${loadedProfiles.length} of ${filteredCount} matching profiles.`}
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}
