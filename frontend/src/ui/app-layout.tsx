import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuthToken, fetchConversations, fetchNotifications, fetchOwnProfile, fetchSession, hasStoredAuthToken } from "../lib/api";
import { useEffect, useState } from "react";
import { clearNativeAppBadgeCount, syncNativeAppBadgeCount } from "../lib/app-badge";
import { recoverGooglePlayPurchases } from "../lib/google-play-billing";
import { ensureNativeAndroidPushPromptedOnce, syncPushNotificationsIfGranted } from "../lib/push";
import { canPromptForAndroidRating, openVeloraPlayStoreRating } from "../lib/rate-app";
import { VeloraLogo } from "./components/velora-logo";

const starterCreditsNoticeKeyPrefix = "velora-starter-credits-notice";
const streakDailyNoticeKeyPrefix = "velora-streak-daily-notice";
const appRatingCompletedKeyPrefix = "velora-app-rating-completed";
const dayMs = 1000 * 60 * 60 * 24;

function getUtcDayNumber(timestamp = Date.now()) {
  return Math.floor(timestamp / dayMs);
}

function getAppRatingCompletedKey(userId: string) {
  return `${appRatingCompletedKeyPrefix}:${userId}`;
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [starterCreditsNotice, setStarterCreditsNotice] = useState<{
    credits: number;
    grantedAt: number;
  } | null>(null);
  const [streakDailyNotice, setStreakDailyNotice] = useState<{
    currentDays: number;
    targetDays: number;
    daysRemaining: number;
    rewardCredits: number;
    rewardEarnedToday: boolean;
  } | null>(null);
  const [ratingPrompt, setRatingPrompt] = useState<{
    credits: number;
    source: "starter" | "streak";
  } | null>(null);
  const [browseBlockedNotice, setBrowseBlockedNotice] = useState(false);

  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
    retry: false,
    refetchInterval: 15000,
  });
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
    refetchInterval: 15000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    enabled: Boolean(sessionQuery.data?.authenticated && sessionQuery.data.hasProfile),
    retry: false,
    refetchInterval: 8000,
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled: Boolean(sessionQuery.data?.authenticated && sessionQuery.data.hasProfile),
    retry: false,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (sessionQuery.data?.authenticated === false && hasStoredAuthToken()) {
      clearAuthToken();
      void queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
    }
  }, [queryClient, sessionQuery.data]);

  useEffect(() => {
    if (!sessionQuery.data?.authenticated) {
      return;
    }

    void ensureNativeAndroidPushPromptedOnce().catch(() => undefined);
    void syncPushNotificationsIfGranted().catch(() => undefined);
  }, [sessionQuery.data?.authenticated]);

  useEffect(() => {
    if (!sessionQuery.data?.authenticated) {
      return;
    }

    let cancelled = false;

    const runRecovery = async () => {
      try {
        const result = await recoverGooglePlayPurchases();
        if (cancelled || !result.recoveredCount) {
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
        await queryClient.invalidateQueries({ queryKey: ["conversations"] });
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });
        await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
        await queryClient.invalidateQueries({ queryKey: ["ai-companion"] });
        await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice"] });
      } catch {
        return;
      }
    };

    void runRecovery();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runRecovery();
      }
    };

    const handleFocus = () => {
      void runRecovery();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [queryClient, sessionQuery.data?.authenticated]);

  useEffect(() => {
    const grant = sessionQuery.data?.starterCreditGrant;
    const userId = sessionQuery.data?.user?.id;

    if (!grant || !userId || typeof window === "undefined") {
      return;
    }

    const storageKey = `${starterCreditsNoticeKeyPrefix}:${userId}`;
    const seenGrantAt = Number(window.localStorage.getItem(storageKey) ?? "0");
    if (seenGrantAt >= grant.grantedAt) {
      return;
    }

    setStarterCreditsNotice(grant);
    window.localStorage.setItem(storageKey, String(grant.grantedAt));

    if (
      canPromptForAndroidRating() &&
      window.localStorage.getItem(getAppRatingCompletedKey(userId)) !== "true"
    ) {
      setRatingPrompt({
        credits: grant.credits,
        source: "starter",
      });
    }
  }, [sessionQuery.data]);

  useEffect(() => {
    const streak = sessionQuery.data?.loginStreak;
    const userId = sessionQuery.data?.user?.id;

    if (!streak || !userId || typeof window === "undefined") {
      return;
    }

    const storageKey = `${streakDailyNoticeKeyPrefix}:${userId}`;
    const todayDay = getUtcDayNumber();
    const seenDay = Number(window.localStorage.getItem(storageKey) ?? "-1");
    if (seenDay >= todayDay) {
      return;
    }

    setStreakDailyNotice({
      currentDays: streak.currentDays,
      targetDays: streak.targetDays,
      daysRemaining: streak.daysRemaining,
      rewardCredits: streak.rewardCredits,
      rewardEarnedToday: streak.rewardEarnedToday,
    });
    window.localStorage.setItem(storageKey, String(todayDay));

    if (
      streak.rewardEarnedToday &&
      canPromptForAndroidRating() &&
      window.localStorage.getItem(getAppRatingCompletedKey(userId)) !== "true"
    ) {
      setRatingPrompt({
        credits: streak.rewardCredits,
        source: "streak",
      });
    }
  }, [sessionQuery.data]);

  useEffect(() => {
    if (!location.state || typeof location.state !== "object") {
      return;
    }

    if (!("browseBlocked" in location.state) || !location.state.browseBlocked) {
      return;
    }

    setBrowseBlockedNotice(true);
    navigate(location.pathname, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!browseBlockedNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setBrowseBlockedNotice(false);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [browseBlockedNotice]);

  const conversationUnreadCount =
    conversationsQuery.data?.conversations.reduce(
      (sum, conversation) =>
        sum + (conversation.unreadCount ?? (conversation.unread ? 1 : 0)),
      0,
    ) ?? 0;
  const notificationUnreadCount =
    notificationsQuery.data?.notifications.filter((item) => !item.readAt).length ?? 0;
  const totalAppBadgeCount = conversationUnreadCount + notificationUnreadCount;
  const hasProfile = Boolean(sessionQuery.data?.hasProfile);
  const isLoggedIn = Boolean(sessionQuery.data?.authenticated);
  useEffect(() => {
    if (!isLoggedIn) {
      void clearNativeAppBadgeCount();
      return;
    }

    void syncNativeAppBadgeCount(totalAppBadgeCount);
  }, [isLoggedIn, totalAppBadgeCount]);

  const navItems = [
    { to: "/", label: "AI Companion" },
    { to: "/browse", label: "Browse" },
    { to: "/conversations", label: "Conversations" },
    { to: "/my-profile", label: "My Profile" },
  ];

  return (
    <div className="page-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <VeloraLogo />
        </NavLink>
        <nav className="topnav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={(event) => {
                if (item.to === "/browse" && isLoggedIn && !hasProfile) {
                  event.preventDefault();
                  setBrowseBlockedNotice(true);
                  navigate("/create-profile");
                }
              }}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              <span>{item.label}</span>
              {item.to === "/conversations" && totalAppBadgeCount > 0 ? (
                <span className="nav-badge">{totalAppBadgeCount}</span>
              ) : null}
            </NavLink>
          ))}
          {!isLoggedIn ? (
            <NavLink to="/login" className="nav-link">
              <span>Login</span>
            </NavLink>
          ) : null}
        </nav>
      </header>

      {browseBlockedNotice ? (
        <section className="starter-credits-banner" aria-live="polite">
          <div>
            <p className="eyebrow">Profile required</p>
            <h2>Please create a profile first.</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setBrowseBlockedNotice(false)}
          >
            Dismiss
          </button>
        </section>
      ) : null}

      {starterCreditsNotice ? (
        <section className="starter-credits-banner" aria-live="polite">
          <div>
            <p className="eyebrow">Reward unlocked</p>
            <h2>We&apos;ve added {starterCreditsNotice.credits} Challenge Credits.</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setStarterCreditsNotice(null)}
          >
            Dismiss
          </button>
        </section>
      ) : null}

      {streakDailyNotice ? (
        <section className="starter-credits-banner streak-daily-banner" aria-live="polite">
          <div>
            <p className="eyebrow">Consistency challenge</p>
            <h2>
              {streakDailyNotice.rewardEarnedToday
                ? `Day ${streakDailyNotice.targetDays} complete. We added ${streakDailyNotice.rewardCredits} Challenge Credit.`
                : `Day ${streakDailyNotice.currentDays} of ${streakDailyNotice.targetDays} is locked in.`}
            </h2>
            <p className="streak-banner-copy">
              {streakDailyNotice.rewardEarnedToday
                ? "Your next streak starts with tomorrow's visit."
                : `${streakDailyNotice.daysRemaining} day${streakDailyNotice.daysRemaining === 1 ? "" : "s"} left until your free Challenge Credit.`}
            </p>
            <div className="streak-banner-track" aria-label="Consistency challenge progress">
              {Array.from({ length: streakDailyNotice.targetDays }, (_, index) => {
                const completed = index < streakDailyNotice.currentDays;
                return (
                  <span
                    className={
                      completed
                        ? "streak-banner-step streak-banner-step-complete"
                        : "streak-banner-step"
                    }
                    key={`streak-banner-step-${index + 1}`}
                  >
                    {completed ? "✓" : ""}
                  </span>
                );
              })}
              <span className="streak-banner-gift">🎁</span>
            </div>
          </div>
          <div className="streak-banner-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setStreakDailyNotice(null)}
            >
              Dismiss
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setStreakDailyNotice(null);
                navigate("/challenges");
              }}
            >
              Open challenges
            </button>
          </div>
        </section>
      ) : null}

      {ratingPrompt ? (
        <section className="rate-app-overlay" aria-live="polite" role="dialog" aria-modal="true">
          <div className="rate-app-modal">
            <p className="eyebrow">Quick favor</p>
            <h2>Enjoying Velora so far?</h2>
            <p className="rate-app-copy">
              {ratingPrompt.source === "starter"
                ? `You just unlocked ${ratingPrompt.credits} free Challenge Credits.`
                : `You earned ${ratingPrompt.credits} free Challenge Credit from your consistency challenge.`}{" "}
              If Velora feels good so far, rating the app on Google Play would really help.
            </p>
            <div className="rate-app-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setRatingPrompt(null)}
              >
                Maybe later
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  const userId = sessionQuery.data?.user?.id;
                  if (typeof window !== "undefined" && userId) {
                    window.localStorage.setItem(getAppRatingCompletedKey(userId), "true");
                  }
                  setRatingPrompt(null);
                  openVeloraPlayStoreRating();
                }}
              >
                Rate on Google Play
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <Outlet />

      <footer className="site-footer">
        <div className="footer-links">
          <NavLink to="/privacy" className="footer-link">
            Privacy
          </NavLink>
          <NavLink to="/child-safety" className="footer-link">
            Child Safety
          </NavLink>
          <NavLink to="/terms" className="footer-link">
            Terms
          </NavLink>
          <NavLink to="/guidelines" className="footer-link">
            Community Guidelines
          </NavLink>
        </div>
      </footer>
    </div>
  );
}
