import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuthToken, fetchConversations, fetchNotifications, fetchOwnProfile, fetchSession, hasStoredAuthToken, logout } from "../lib/api";
import { useEffect, useState } from "react";
import { syncPushNotificationsIfGranted } from "../lib/push";
import { VeloraLogo } from "./components/velora-logo";

export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    setShowAdmin(Boolean(window.localStorage.getItem("velora-admin-key")));
    function handleAdminKeyUpdate() {
      setShowAdmin(Boolean(window.localStorage.getItem("velora-admin-key")));
    }

    window.addEventListener("velora-admin-key-updated", handleAdminKeyUpdate);
    return () => window.removeEventListener("velora-admin-key-updated", handleAdminKeyUpdate);
  }, []);

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

    void syncPushNotificationsIfGranted().catch(() => undefined);
  }, [sessionQuery.data?.authenticated]);

  const conversationUnreadCount =
    conversationsQuery.data?.conversations.reduce(
      (sum, conversation) =>
        sum + (conversation.unreadCount ?? (conversation.unread ? 1 : 0)),
      0,
    ) ?? 0;
  const notificationUnreadCount =
    notificationsQuery.data?.notifications.filter((item) => !item.readAt).length ?? 0;
  const hasProfile = Boolean(sessionQuery.data?.hasProfile);
  const isLoggedIn = Boolean(sessionQuery.data?.authenticated);
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      clearAuthToken();
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      navigate("/login");
    },
  });

  const navItems = [
    { to: "/", label: "Home" },
    { to: "/browse", label: "Browse" },
    { to: "/conversations", label: "Conversations" },
    { to: "/activity", label: "Activity" },
    { to: "/favorites", label: "Favorites" },
    ...(showAdmin ? [{ to: "/admin", label: "Admin" }] : []),
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
