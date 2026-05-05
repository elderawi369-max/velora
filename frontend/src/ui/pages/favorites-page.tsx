import { FavoritesList } from "../components/favorites-list";

export function FavoritesPage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Favorites</p>
        <h1>Keep track of the profiles you want to return to.</h1>
      </section>

      <FavoritesList />
    </main>
  );
}
