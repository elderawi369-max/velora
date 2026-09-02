import { ConversationList } from "../components/conversation-list";
import { Link } from "react-router-dom";

export function ConversationsPage() {
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
