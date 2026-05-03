import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchConversations, fetchNotifications } from "../lib/api";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/browse", label: "Browse" },
  { to: "/conversations", label: "Conversations" },
  { to: "/activity", label: "Activity" },
  { to: "/favorites", label: "Favorites" },
  { to: "/admin", label: "Admin" },
  { to: "/create-profile", label: "Create Profile" },
  { to: "/login", label: "Login" },
];

export function AppLayout() {
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
