import { NotificationsList } from "../components/notifications-list";

export function NotificationsPage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Activity</p>
        <h1>See who noticed you and what landed on your profile.</h1>
        <p className="intro">
          When someone favorites you or sends a gift, it should feel visible. This
          feed is the first layer of that feedback loop.
        </p>
      </section>

      <NotificationsList />
    </main>
  );
}
