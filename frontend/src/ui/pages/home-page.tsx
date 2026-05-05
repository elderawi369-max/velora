import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchOwnProfile } from "../../lib/api";

const pillars = [
  "Persistent profiles that people can return to",
  "Text-only companionship without meetups or off-app contact",
  "Safety-first boundaries and lightweight anti-spam rules",
];

export function HomePage() {
  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
    retry: false,
  });
  const hasProfile = Boolean(ownProfileQuery.data?.profile);

  return (
    <main className="content-section">
      <section className="hero hero-wide">
        <div className="section-copy">
          <p className="eyebrow">Human-powered companionship</p>
          <h1>Velora feels like AI chat, but there is a real person behind the profile.</h1>
        </div>

        <div className="hero-actions">
          <Link className="primary-button" to={hasProfile ? "/my-profile" : "/signup"}>
            {hasProfile ? "My profile" : "Create account"}
          </Link>
          <Link className="secondary-button" to="/browse">
            Browse profiles
          </Link>
        </div>
      </section>

      <section className="card-grid">
        {pillars.map((item) => (
          <article className="card" key={item}>
            <h2>{item}</h2>
          </article>
        ))}
      </section>
    </main>
  );
}
