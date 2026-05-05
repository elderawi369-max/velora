import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFavorites } from "../../lib/api";
import { ProfileAvatar } from "./profile-avatar";

export function FavoritesList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["favorites"],
    queryFn: fetchFavorites,
  });

  if (isLoading) {
    return <p className="status-message">Loading favorites...</p>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error-message">
          {error instanceof Error ? error.message : "Unable to load favorites."}
        </p>
      </div>
    );
  }

  if (!data || data.favorites.length === 0) {
    return (
      <div className="panel empty-state">
        <h2>No favorites yet.</h2>
        <p>Favorite the profiles you want to come back to later.</p>
        <div className="action-row">
          <Link className="primary-button" to="/browse">
            Find profiles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="card-grid">
      {data.favorites.map((favorite) => (
        <article className="card profile-card" key={favorite.id}>
          <ProfileAvatar
            personalityType={favorite.personalityType}
            identity={favorite.identity}
            size="medium"
          />
          <div className="profile-head">
            <h2>{favorite.displayName}</h2>
            <p>@{favorite.username}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
