import { MyProfileCard } from "../components/my-profile-card";

export function MyProfilePage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">My profile</p>
        <h1>This is the identity other people keep coming back to.</h1>
        <p className="intro">
          Once a profile exists, it should feel like a real home for your tone,
          preferences, and recurring conversations.
        </p>
      </section>

      <MyProfileCard />
    </main>
  );
}
