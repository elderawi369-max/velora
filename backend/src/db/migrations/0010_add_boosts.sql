CREATE TABLE boosts (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  boost_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
