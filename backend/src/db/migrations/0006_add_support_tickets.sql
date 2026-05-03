CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT REFERENCES profiles(id),
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
