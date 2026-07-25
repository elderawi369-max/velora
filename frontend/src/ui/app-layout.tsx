import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuthToken, fetchConversations, fetchNotifications, fetchOwnProfile, fetchSession, hasStoredAuthToken, logout } from "../lib/api";
import { useEffect, useState } from "react";
import { clearNativeAppBadgeCount, syncNativeAppBadgeCount } from "../lib/app-badge";
import { ensureNativeAndroidPushPromptedOnce, syncPushNotificationsIfGranted } from "../lib/push";
import { VeloraLogo } from "./components/velora-logo";

const starterCreditsNoticeKeyPrefix = "velora-starter-credits-notice";
const streakRewardNoticeKeyPrefix = "velora-streak-reward-notice";

export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [starterCreditsNotice, setStarterCreditsNotice] = useState<{
    credits: number;
    grantedAt: number;
  } | null>(null);
  const [streakRewardNotice, setStreakRewardNotice] = useState<{
    credits: number;
    grantedAt: number;
    streakDays: number;
  } | null>(null);

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
    retry: false,
    refetchInterval: 8000,
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
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
  }, [sessionQuery.data]);

  useEffect(() => {
    const grant = sessionQuery.data?.loginStreakRewardGrant;
    const userId = sessionQuery.data?.user?.id;

    if (!grant || !userId || typeof window === "undefined") {
      return;
    }

    const storageKey = `${streakRewardNoticeKeyPrefix}:${userId}`;
    const seenGrantAt = Number(window.localStorage.getItem(storageKey) ?? "0");
    if (seenGrantAt >= grant.grantedAt) {
      return;
    }

    setStreakRewardNotice(grant);
    window.localStorage.setItem(storageKey, String(grant.grantedAt));
  }, [sessionQuery.data]);

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
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      clearAuthToken();
      await clearNativeAppBadgeCount();
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      navigate("/login");
    },
  });

  useEffect(() => {
    if (!isLoggedIn) {
      void clearNativeAppBadgeCount();
      return;
    }

    void syncNativeAppBadgeCount(totalAppBadgeCount);
  }, [isLoggedIn, totalAppBadgeCount]);

  const navItems = [
    { to: "/", label: "Home" },
    { to: "/browse", label: "Browse" },
    { to: "/challenges", label: "Challenges" },
    { to: "/conversations", label: "Conversations" },
    { to: "/activity", label: "Activity" },
    { to: "/favorites", label: "Favorites" },
    { to: hasProfile ? "/my-profile" : "/create-profile", label: hasProfile ? "My Profile" : "Create Profile" },
    { to: "/support", label: "Support" },
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
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              <span>{item.label}</span>
              {item.to === "/conversations" && conversationUnreadCount > 0 ? (
                <span className="nav-badge">{conversationUnreadCount}</span>
              ) : null}
              {item.to === "/activity" && notificationUnreadCount > 0 ? (
                <span className="nav-badge">{notificationUnreadCount}</span>
              ) : null}
            </NavLink>
          ))}
          {isLoggedIn ? (
            <button
              className="nav-link nav-button-link"
              type="button"
              onClick={() => logoutMutation.mutate()}
            >
              <span>{logoutMutation.isPending ? "Logging out..." : "Logout"}</span>
            </button>
          ) : (
            <NavLink to="/login" className="nav-link">
              <span>Login</span>
            </NavLink>
          )}
        </nav>
      </header>

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

      {streakRewardNotice ? (
        <section className="starter-credits-banner" aria-live="polite">
          <div>
            <p className="eyebrow">Consistency reward</p>
            <h2>
              Day {streakRewardNotice.streakDays} complete. We&apos;ve added{" "}
              {streakRewardNotice.credits} Challenge Credit.
            </h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setStreakRewardNotice(null)}
          >
            Dismiss
          </button>
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
