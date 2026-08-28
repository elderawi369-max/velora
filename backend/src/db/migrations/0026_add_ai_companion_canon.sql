CREATE TABLE ai_companion_canons (
  companion_id TEXT PRIMARY KEY REFERENCES ai_companions(id),
  facts_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
