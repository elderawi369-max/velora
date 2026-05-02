import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/browse", label: "Browse" },
  { to: "/conversations", label: "Conversations" },
  { to: "/favorites", label: "Favorites" },
  { to: "/admin", label: "Admin" },
  { to: "/create-profile", label: "Create Profile" },
  { to: "/login", label: "Login" },
];

export function AppLayout() {
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
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
