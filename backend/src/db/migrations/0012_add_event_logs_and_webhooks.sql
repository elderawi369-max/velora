CREATE TABLE event_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  profile_id TEXT REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE payment_webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  payload TEXT NOT NULL,
  processed_at INTEGER,
  created_at INTEGER NOT NULL
);
