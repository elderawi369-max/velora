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

  return <ProfileForm />;
}
