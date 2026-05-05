import { ProfileList } from "../components/profile-list";

export function BrowsePage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Discovery</p>
        <h1>Browse profiles designed for recurring conversations.</h1>
      </section>

      <ProfileList />
    </main>
  );
}
