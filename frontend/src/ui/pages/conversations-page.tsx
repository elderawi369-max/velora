import { ConversationList } from "../components/conversation-list";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSession } from "../../lib/api";

export function ConversationsPage() {
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: fetchSession, retry: false });

  if (sessionQuery.data?.authenticated && !sessionQuery.data.hasProfile) {
    return <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Conversations</p>
        <h1>Your AI companion does not require a public profile.</h1>
        <p>Create a public profile only when you want to browse people, join challenges, or start human conversations.</p>
      </section>
      <div className="panel empty-state">
        <h2>People features are optional.</h2>
        <p>Your private AI companion remains available from the first tab.</p>
        <div className="action-row"><Link className="secondary-button" to="/create-profile">Create a public profile</Link><Link className="primary-button" to="/">Return to AI Companion</Link></div>
      </div>
    </main>;
  }

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Reconnect</p>
        <h1>Your recurring conversations live here.</h1>
      </section>

      <nav className="conversation-hub" aria-label="Conversation tools">
        <Link className="conversation-hub-link" to="/challenges">
          <span aria-hidden="true">✦</span>
          <strong>Challenges</strong>
          <small>Break the ice and see your open challenges.</small>
        </Link>
        <Link className="conversation-hub-link" to="/activity">
          <span aria-hidden="true">♡</span>
          <strong>Activity</strong>
          <small>See favorites, gifts, and challenge updates.</small>
        </Link>
        <Link className="conversation-hub-link" to="/favorites">
          <span aria-hidden="true">★</span>
          <strong>Favorites</strong>
          <small>Return to the profiles you saved.</small>
        </Link>
      </nav>

      <ConversationList />
    </main>
  );
}
