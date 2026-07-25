import { ProfileList } from "../components/profile-list";

export function BrowsePage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Discovery</p>
        <h1>Browse profiles designed for recurring conversations.</h1>
        <p className="intro">
          Complete profiles and active tones usually turn into better replies, so this page is built to help people find momentum faster.
        </p>
      </section>

      <ProfileList />
    </main>
  );
}
