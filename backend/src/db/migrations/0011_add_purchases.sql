CREATE TABLE purchases (
  id TEXT PRIMARY KEY NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  buyer_profile_id TEXT NOT NULL,
  target_profile_id TEXT,
  product_kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  fulfilled_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (buyer_profile_id) REFERENCES profiles(id),
  FOREIGN KEY (target_profile_id) REFERENCES profiles(id)
);
