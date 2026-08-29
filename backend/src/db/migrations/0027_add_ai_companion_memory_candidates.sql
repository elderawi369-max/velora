CREATE TABLE ai_companion_memory_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  source_message_id TEXT NOT NULL REFERENCES ai_companion_messages(id),
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE INDEX ai_companion_memory_candidates_review_idx
  ON ai_companion_memory_candidates(user_id, companion_id, status, created_at);
