CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  actor_profile_id TEXT NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL,
  gift_type TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
