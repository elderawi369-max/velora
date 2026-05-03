import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOwnProfile } from "../../lib/api";
import { BlockedUsersList } from "../components/blocked-users-list";
import { ProfileForm } from "../components/profile-form";
import { MyProfileCard } from "../components/my-profile-card";

export function MyProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const ownProfileQuery = useQuery({
    queryKey: ["ownProfile"],
    queryFn: fetchOwnProfile,
  });

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
    </main>
  );
}
