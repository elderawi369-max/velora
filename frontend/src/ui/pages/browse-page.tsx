import { ProfileList } from "../components/profile-list";

export function BrowsePage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Discovery</p>
        <h1>Browse profiles designed for recurring conversations.</h1>
        <p className="intro">
          This is where the app starts becoming real: profiles with clear tones,
          memorable bios, and boundaries that keep the experience healthy.
        </p>
      </section>

      <ProfileList />
    </main>
  );
}

