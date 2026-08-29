CREATE TABLE ai_companion_visual_identities (
  companion_id TEXT PRIMARY KEY REFERENCES ai_companions(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending_storage',
  locked_traits_json TEXT NOT NULL,
  canonical_object_key TEXT,
  reference_object_keys_json TEXT NOT NULL DEFAULT '[]',
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ai_companion_photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  visual_identity_version INTEGER NOT NULL,
  request_message_id TEXT REFERENCES ai_companion_messages(id),
  scene_json TEXT NOT NULL,
  prompt TEXT NOT NULL,
  object_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  identity_score REAL,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  generation_attempt INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ai_companion_photos_owner_companion_created_idx
  ON ai_companion_photos(user_id, companion_id, created_at DESC);
