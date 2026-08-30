ALTER TABLE ai_companion_visual_identities ADD COLUMN appearance_catalog_id TEXT REFERENCES ai_companion_appearance_catalog(id);

UPDATE ai_companion_visual_identities
SET appearance_catalog_id = (
  SELECT catalog.id
  FROM ai_companion_appearance_catalog AS catalog
  WHERE catalog.source_companion_id = ai_companion_visual_identities.companion_id
)
WHERE EXISTS (
  SELECT 1
  FROM ai_companion_appearance_catalog AS catalog
  WHERE catalog.source_companion_id = ai_companion_visual_identities.companion_id
);

ALTER TABLE ai_companion_photo_assets ADD COLUMN appearance_catalog_id TEXT REFERENCES ai_companion_appearance_catalog(id);
ALTER TABLE ai_companion_photo_assets ADD COLUMN scene_fingerprint TEXT;
ALTER TABLE ai_companion_photos ADD COLUMN photo_asset_id TEXT REFERENCES ai_companion_photo_assets(id);
ALTER TABLE ai_companion_photo_deliveries ADD COLUMN photo_id TEXT REFERENCES ai_companion_photos(id);

CREATE INDEX ai_companion_photo_assets_catalog_scene_idx
  ON ai_companion_photo_assets(appearance_catalog_id, scene_fingerprint, status, updated_at DESC);

CREATE UNIQUE INDEX ai_companion_photo_deliveries_photo_idx
  ON ai_companion_photo_deliveries(photo_id)
  WHERE photo_id IS NOT NULL;
