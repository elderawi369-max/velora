import { ConversationList } from "../components/conversation-list";

export function ConversationsPage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Reconnect</p>
        <h1>Your recurring conversations live here.</h1>
        <p className="intro">
          This list is the retention engine. If Velora works, users will come
          back here often because certain profiles will matter to them.
        </p>
      </section>

      <ConversationList />
    </main>
  );
}

