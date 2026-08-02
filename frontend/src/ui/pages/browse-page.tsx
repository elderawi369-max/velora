import { ProfileList } from "../components/profile-list";

export function BrowsePage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Discovery</p>
        <h1>Browse profiles designed for recurring conversations.</h1>
        <p className="intro browse-roleplay-callout">
          Try a playful role, lean into fantasy, or test the chemistry fast. Velora hits harder when people bring a clear vibe and let the conversation feel a little cinematic.
        </p>
      </section>

      <ProfileList />
    </main>
  );
}
