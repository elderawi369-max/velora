CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL,
  avatar_preset TEXT NOT NULL,
  boundaries TEXT NOT NULL,
  vibe_tags TEXT NOT NULL,
  suspended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  profile_a_id TEXT NOT NULL,
  profile_b_id TEXT NOT NULL,
  last_message_at INTEGER NOT NULL,
  last_message_preview TEXT NOT NULL,
  last_message_sender_profile_id TEXT NOT NULL,
  last_read_at_a INTEGER NOT NULL,
  last_read_at_b INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_a_id) REFERENCES profiles(id),
  FOREIGN KEY (profile_b_id) REFERENCES profiles(id),
  FOREIGN KEY (last_message_sender_profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  sender_profile_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  target_profile_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (target_profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  target_profile_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (target_profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_profile_id TEXT NOT NULL,
  target_profile_id TEXT NOT NULL,
  conversation_id TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (reporter_profile_id) REFERENCES profiles(id),
  FOREIGN KEY (target_profile_id) REFERENCES profiles(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY NOT NULL,
  sender_profile_id TEXT NOT NULL,
  target_profile_id TEXT NOT NULL,
  gift_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (sender_profile_id) REFERENCES profiles(id),
  FOREIGN KEY (target_profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles(username);
CREATE INDEX IF NOT EXISTS conversations_profile_a_idx ON conversations(profile_a_id);
CREATE INDEX IF NOT EXISTS conversations_profile_b_idx ON conversations(profile_b_id);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS favorites_profile_idx ON favorites(profile_id);
CREATE INDEX IF NOT EXISTS blocks_profile_idx ON blocks(profile_id);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_profile_id);
CREATE INDEX IF NOT EXISTS gifts_target_idx ON gifts(target_profile_id);
