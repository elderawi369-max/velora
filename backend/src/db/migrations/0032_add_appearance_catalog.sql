CREATE TABLE IF NOT EXISTS ai_companion_appearance_catalog (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_companion_id TEXT NOT NULL,
  locked_traits_json TEXT NOT NULL,
  canonical_object_key TEXT NOT NULL,
  reference_object_keys_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_companion_appearance_catalog_source_idx
  ON ai_companion_appearance_catalog(source_companion_id);
