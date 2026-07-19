import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchSession } from "../../lib/api";
import { ProfileForm } from "../components/profile-form";

export function CreateProfilePage() {
  const navigate = useNavigate();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.data?.authenticated === false) {
      navigate("/login");
      return;
    }

    if (sessionQuery.data?.hasProfile) {
      navigate("/my-profile");
    }
  }, [navigate, sessionQuery.data]);

  if (!sessionQuery.data?.authenticated) {
    return null;
  }

  return (
    <>
      <section className="panel onboarding-panel">
        <div className="section-copy compact-copy">
          <p className="eyebrow">Fast start</p>
          <h2>You can enter Browse with just the essentials.</h2>
          <p className="status-message">
            Profile prompts, vibe tags, and preferences are optional during setup. You can skip them now and improve the profile later from My Profile.
          </p>
        </div>
      </section>
      <ProfileForm />
    </>
  );
}
