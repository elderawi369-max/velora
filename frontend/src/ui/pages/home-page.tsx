import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchConversations, fetchNotifications, fetchOwnProfile } from "../../lib/api";

const pillars = [
  "Persistent profiles that people can return to",
  "Text-only companionship without meetups or off-app contact",
  "Safety-first boundaries and lightweight anti-spam rules",
];

export function HomePage() {
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
  const hasProfile = Boolean(ownProfileQuery.data?.profile);
  const isLoggedIn = ownProfileQuery.data?.profile !== null || typeof window !== "undefined" && Boolean(window.localStorage.getItem("velora-auth-token"));
  const conversationCount = conversationsQuery.data?.conversations.length ?? 0;
  const notificationCount = notificationsQuery.data?.notifications.filter((item) => !item.readAt).length ?? 0;

  return (
    <main className="content-section">
      <section className="hero hero-wide">
        <div className="section-copy">
          <p className="eyebrow">Human-powered companionship</p>
          <h1>Velora feels like AI chat, but there is a real person behind the profile.</h1>
        </div>

        <div className="hero-actions">
          <Link className="primary-button" to={isLoggedIn ? (hasProfile ? "/my-profile" : "/create-profile") : "/signup"}>
            {isLoggedIn ? (hasProfile ? "My profile" : "Finish profile") : "Create account"}
          </Link>
          <Link className="secondary-button" to="/browse">
            Browse profiles
          </Link>
        </div>
      </section>

      {isLoggedIn ? (
        <section className="panel onboarding-panel">
          <div className="section-copy compact-copy">
            <p className="eyebrow">Next steps</p>
            <h2>{hasProfile ? "Keep the momentum going." : "Finish setup and start chatting."}</h2>
          </div>
          <div className="card-grid onboarding-grid">
            <article className="card">
              <h2>{hasProfile ? "Profile ready" : "Create your profile"}</h2>
              <p>{hasProfile ? "Your identity is live and discoverable." : "Pick your personality, prompts, and preferences."}</p>
              <Link className="secondary-button" to={hasProfile ? "/my-profile" : "/create-profile"}>
                {hasProfile ? "View profile" : "Create profile"}
              </Link>
            </article>
            <article className="card">
              <h2>{conversationCount > 0 ? "Conversations active" : "Start your first chat"}</h2>
              <p>{conversationCount > 0 ? `${conversationCount} recurring conversation${conversationCount === 1 ? "" : "s"} waiting for you.` : "Browse and open a conversation with someone who fits your vibe."}</p>
              <Link className="secondary-button" to={conversationCount > 0 ? "/conversations" : "/browse"}>
                {conversationCount > 0 ? "Open conversations" : "Browse profiles"}
              </Link>
            </article>
            <article className="card">
              <h2>{notificationCount > 0 ? "New activity" : "Check your activity"}</h2>
              <p>{notificationCount > 0 ? `${notificationCount} unread update${notificationCount === 1 ? "" : "s"} on your profile.` : "Favorites, gifts, and profile attention land here."}</p>
              <Link className="secondary-button" to="/activity">
                Open activity
              </Link>
            </article>
          </div>
        </section>
      ) : null}

      <section className="card-grid">
        {pillars.map((item) => (
          <article className="card" key={item}>
            <h2>{item}</h2>
          </article>
        ))}
      </section>
    </main>
  );
}
