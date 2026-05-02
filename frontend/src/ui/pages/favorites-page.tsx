import { FavoritesList } from "../components/favorites-list";

export function FavoritesPage() {
  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Favorites</p>
        <h1>Keep track of the profiles you want to return to.</h1>
        <p className="intro">
          Favorites are one of the simplest retention signals in the product.
          They help us learn which profiles create repeat interest.
        </p>
      </section>

      <FavoritesList />
    </main>
  );
}

