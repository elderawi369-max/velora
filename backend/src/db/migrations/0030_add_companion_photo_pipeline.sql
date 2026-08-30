CREATE TABLE ai_companion_visual_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  visual_identity_version INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ai_companion_visual_candidates_owner_version_idx
  ON ai_companion_visual_candidates(user_id, companion_id, visual_identity_version, sort_order);

CREATE TABLE ai_companion_visual_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  conversation_id TEXT NOT NULL REFERENCES ai_companion_conversations(id),
  state_json TEXT NOT NULL,
  source_message_id TEXT REFERENCES ai_companion_messages(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, companion_id, conversation_id)
);

CREATE TABLE ai_companion_photo_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  visual_identity_version INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  generation_source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ai_companion_photo_assets_lookup_idx
  ON ai_companion_photo_assets(companion_id, visual_identity_version, status, updated_at DESC);

CREATE TABLE ai_companion_photo_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  photo_asset_id TEXT NOT NULL REFERENCES ai_companion_photo_assets(id),
  request_message_id TEXT REFERENCES ai_companion_messages(id),
  billing_period TEXT NOT NULL,
  delivered_at INTEGER NOT NULL
);

CREATE INDEX ai_companion_photo_deliveries_recent_idx
  ON ai_companion_photo_deliveries(user_id, companion_id, delivered_at DESC);

CREATE TABLE ai_companion_photo_usage (
  user_id TEXT NOT NULL REFERENCES users(id),
  billing_period TEXT NOT NULL,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, billing_period)
);
