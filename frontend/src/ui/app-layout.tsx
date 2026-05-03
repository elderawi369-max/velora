import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchConversations, fetchNotifications, fetchOwnProfile } from "../lib/api";

export function AppLayout() {
  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
    retry: false,
  });
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    retry: false,
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    retry: false,
  });

  const conversationUnreadCount =
    conversationsQuery.data?.conversations.reduce(
      (sum, conversation) =>
        sum + (conversation.unreadCount ?? (conversation.unread ? 1 : 0)),
      0,
    ) ?? 0;
  const notificationUnreadCount =
    notificationsQuery.data?.notifications.filter((item) => !item.readAt).length ?? 0;
  const hasProfile = Boolean(ownProfileQuery.data?.profile);
  const navItems = [
    { to: "/", label: "Home" },
    { to: "/browse", label: "Browse" },
    { to: "/conversations", label: "Conversations" },
    { to: "/activity", label: "Activity" },
    { to: "/favorites", label: "Favorites" },
    { to: "/admin", label: "Admin" },
    { to: hasProfile ? "/my-profile" : "/create-profile", label: hasProfile ? "My Profile" : "Create Profile" },
    { to: "/support", label: "Support" },
    { to: "/login", label: "Login" },
  ];

  return (
    <div className="page-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          Velora
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
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
