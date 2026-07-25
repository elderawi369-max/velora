import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchConversations, fetchNotifications, fetchOwnProfile, fetchSession } from "../../lib/api";

const pillars = [
  "Persistent profiles that people can return to",
  "Text-only companionship without meetups or off-app contact",
  "Safety-first boundaries and lightweight anti-spam rules",
];

function getProfileCompletionPercent(profile: NonNullable<Awaited<ReturnType<typeof fetchOwnProfile>>["profile"]>) {
  let completed = 0;

  if (profile.bio.trim().length >= 20) {
    completed += 1;
  }
  if (profile.promptEntries.length >= 1) {
    completed += 1;
  }
  if (profile.vibeTags.length >= 1) {
    completed += 1;
  }
  if (profile.boundaries.length >= 1) {
    completed += 1;
  }

  return Math.round((completed / 4) * 100);
}

export function HomePage() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
    refetchInterval: 15000,
  });
  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
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
  const hasProfile = Boolean(ownProfileQuery.data?.profile);
  const ownProfile = ownProfileQuery.data?.profile ?? null;
  const isLoggedIn = Boolean(sessionQuery.data?.authenticated) ||
    (typeof window !== "undefined" && Boolean(window.localStorage.getItem("velora-auth-token")));
  const conversationCount = conversationsQuery.data?.conversations.length ?? 0;
  const awaitingReplyCount =
    conversationsQuery.data?.conversations.filter((conversation) => conversation.awaitingReply).length ?? 0;
  const needsTheirReplyCount =
    conversationsQuery.data?.conversations.filter((conversation) => conversation.needsTheirReply).length ?? 0;
  const notificationCount = notificationsQuery.data?.notifications.filter((item) => !item.readAt).length ?? 0;
  const profileCompletionPercent = ownProfile ? getProfileCompletionPercent(ownProfile) : 0;
  const loginStreak = sessionQuery.data?.loginStreak ?? null;

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

        <a
          className="home-web-link"
          href="https://app.velorachat.com"
          target="_blank"
          rel="noreferrer"
        >
          app.velorachat.com
        </a>
      </section>

      {isLoggedIn ? (
        <section className="panel onboarding-panel">
          <div className="section-copy compact-copy">
            <p className="eyebrow">Next steps</p>
            <h2>{hasProfile ? "Keep the momentum going." : "Finish setup and start chatting."}</h2>
          </div>
          <div className="card-grid onboarding-grid">
            <article className="card streak-card">
              <h2>Consistency challenge</h2>
              <p>
                Open Velora 5 days in a row to earn 1 free Challenge Credit.
              </p>
              <div className="streak-track" aria-label="Consistency challenge progress">
                {Array.from({ length: loginStreak?.targetDays ?? 5 }, (_, index) => {
                  const filled = index < (loginStreak?.currentDays ?? 0);
                  const rewardStep = index === (loginStreak?.targetDays ?? 5) - 1;
                  return (
                    <span
                      className={filled ? "streak-step streak-step-active" : "streak-step"}
                      key={`streak-step-${index + 1}`}
                    >
                      {rewardStep ? "🎁" : index + 1}
                    </span>
                  );
                })}
              </div>
              <p className="streak-status">
                {loginStreak?.rewardEarnedToday
                  ? "Reward unlocked today. Your next streak starts with tomorrow's visit."
                  : loginStreak?.checkedInToday
                    ? `Checked in for day ${loginStreak.currentDays} of ${loginStreak.targetDays}. ${loginStreak.daysRemaining} day${loginStreak.daysRemaining === 1 ? "" : "s"} left.`
                    : loginStreak
                      ? `${loginStreak.currentDays > 0 ? `You are on day ${loginStreak.currentDays} of ${loginStreak.targetDays}.` : "Your streak starts with today's visit."} Open Velora daily so you do not lose momentum.`
                      : "Create your profile and keep showing up so the reward can start stacking for you."}
              </p>
              <Link className="secondary-button" to={hasProfile ? "/challenges" : "/create-profile"}>
                {hasProfile ? "Use challenges" : "Finish profile"}
              </Link>
            </article>
            <article className="card">
              <h2>{hasProfile ? "Profile strength" : "Create your profile"}</h2>
              <p>
                {hasProfile
                  ? `Your profile is ${profileCompletionPercent}% complete. Richer profiles get better visibility and easier conversation starts.`
                  : "Pick your personality and go live fast, then fill in the extra details later."}
              </p>
              <Link className="secondary-button" to={hasProfile ? "/my-profile" : "/create-profile"}>
                {hasProfile ? "Improve profile" : "Create profile"}
              </Link>
            </article>
            <article className="card">
              <h2>
                {awaitingReplyCount > 0
                  ? "People are waiting on you"
                  : conversationCount > 0
                    ? "Conversations active"
                    : "Start your first chat"}
              </h2>
              <p>
                {awaitingReplyCount > 0
                  ? `${awaitingReplyCount} conversation${awaitingReplyCount === 1 ? "" : "s"} have unread messages. Fast replies are the biggest lever for better retention right now.`
                  : conversationCount > 0
                    ? `${conversationCount} recurring conversation${conversationCount === 1 ? "" : "s"} waiting for you. ${needsTheirReplyCount > 0 ? `${needsTheirReplyCount} are now waiting on the other person.` : ""}`
                    : "Browse and open a conversation with someone who fits your vibe."}
              </p>
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
