import { ConversationList } from "../components/conversation-list";

export function ConversationsPage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Reconnect</p>
        <h1>Your recurring conversations live here.</h1>
      </section>

      <ConversationList />
    </main>
  );
}
