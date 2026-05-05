import { NotificationsList } from "../components/notifications-list";

export function NotificationsPage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Activity</p>
        <h1>See who noticed you and what landed on your profile.</h1>
      </section>

      <NotificationsList />
    </main>
  );
}
