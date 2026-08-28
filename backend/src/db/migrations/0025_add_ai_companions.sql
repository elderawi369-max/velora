CREATE TABLE ai_companions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  identity TEXT NOT NULL,
  persona_key TEXT NOT NULL,
  traits_json TEXT NOT NULL,
  backstory TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ai_companions_owner_name_idx ON ai_companions(user_id, name);

CREATE TABLE ai_companion_conversations (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  trial_replies_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ai_companion_conversations_owner_companion_idx
  ON ai_companion_conversations(user_id, companion_id);

CREATE TABLE ai_companion_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_companion_conversations(id),
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'allowed',
  created_at INTEGER NOT NULL
);

CREATE INDEX ai_companion_messages_conversation_created_idx
  ON ai_companion_messages(conversation_id, created_at);

CREATE TABLE ai_companion_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ai_companion_memories_owner_companion_idx
  ON ai_companion_memories(user_id, companion_id, pinned, updated_at);

CREATE TABLE ai_companion_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  message_id TEXT NOT NULL REFERENCES ai_companion_messages(id),
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE ai_entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'free',
  source TEXT,
  expires_at INTEGER,
  message_limit INTEGER NOT NULL DEFAULT 15,
  photo_limit INTEGER NOT NULL DEFAULT 0,
  companion_limit INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ai_trial_daily_usage (
  day_number INTEGER PRIMARY KEY,
  replies_used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
