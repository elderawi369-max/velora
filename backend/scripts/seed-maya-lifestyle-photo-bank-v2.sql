-- Reviewed Maya lifestyle-photo pilot: three request-aware scenes derived from
-- the approved canonical identity. These remain private R2 assets.
INSERT INTO ai_companion_photo_assets (id, user_id, companion_id, visual_identity_version, object_key, metadata_json, generation_source, status, created_at, updated_at, appearance_catalog_id, scene_fingerprint)
VALUES
  ('aiphoto_asset_bank_maya_cozy_v1', NULL, 'aic_499671aa-9c64-4246-817a-d3f0d493079e', 1, 'catalog/bank/v1/catalog-maya/cozy-evening/02-lifestyle-v2.png', json_object('approved', true, 'scene', 'cozy-evening', 'syntheticProvenance', 'imagegen', 'identityReference', 'catalog/approved/v1/maya/canonical.png', 'reviewNote', 'replacement approved after anatomy review'), 'imagegen-approved-v2', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-maya', 'bank-cozy-evening-v1'),
  ('aiphoto_asset_bank_maya_date_v1', NULL, 'aic_499671aa-9c64-4246-817a-d3f0d493079e', 1, 'catalog/bank/v1/catalog-maya/date-night/03-lifestyle.png', json_object('approved', true, 'scene', 'date-night', 'syntheticProvenance', 'imagegen', 'identityReference', 'catalog/approved/v1/maya/canonical.png'), 'imagegen-approved-v2', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-maya', 'bank-date-night-v1'),
  ('aiphoto_asset_bank_maya_outdoor_v1', NULL, 'aic_499671aa-9c64-4246-817a-d3f0d493079e', 1, 'catalog/bank/v1/catalog-maya/outdoor-daytime/04-lifestyle.png', json_object('approved', true, 'scene', 'outdoor-daytime', 'syntheticProvenance', 'imagegen', 'identityReference', 'catalog/approved/v1/maya/canonical.png'), 'imagegen-approved-v2', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-maya', 'bank-outdoor-daytime-v1')
ON CONFLICT(id) DO UPDATE SET
  object_key = excluded.object_key,
  metadata_json = excluded.metadata_json,
  generation_source = excluded.generation_source,
  status = excluded.status,
  updated_at = excluded.updated_at,
  appearance_catalog_id = excluded.appearance_catalog_id,
  scene_fingerprint = excluded.scene_fingerprint;
