import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { fetchOwnProfile } from "../../lib/api";
import { AccountSettingsPanel } from "../components/account-settings-panel";
import { BlockedUsersList } from "../components/blocked-users-list";
import { ProfileForm } from "../components/profile-form";
import { MyProfileCard } from "../components/my-profile-card";
import { SupportForm } from "../components/support-form";

export function MyProfilePage() {
  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
  });

  useEffect(() => {
    if (location.hash !== "#support") return;
    const frame = window.requestAnimationFrame(() => document.getElementById("support")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">My profile</p>
        <h1>This is the identity other people keep coming back to.</h1>
      </section>

      <div className="action-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() => setIsEditing((current) => !current)}
        >
          {isEditing ? "Back to profile view" : "Edit profile"}
        </button>
      </div>

      {isEditing ? (
        <ProfileForm mode="edit" initialProfile={ownProfileQuery.data?.profile ?? null} />
      ) : (
        <MyProfileCard />
      )}

      <section className="section-copy">
        <p className="eyebrow">Blocked users</p>
        <h2>Undo a block if you change your mind.</h2>
      </section>

      <BlockedUsersList />

      <section className="section-copy" id="support">
        <p className="eyebrow">Support</p>
        <h2>Tell us what went wrong.</h2>
      </section>

      <SupportForm />

      <AccountSettingsPanel />
    </main>
  );
}
