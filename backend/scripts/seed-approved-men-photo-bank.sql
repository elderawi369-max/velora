-- ZIP-approved male lifestyle photo bank, one immediate fallback asset per catalog identity.
INSERT INTO ai_companion_photo_assets (id, user_id, companion_id, visual_identity_version, object_key, metadata_json, generation_source, status, created_at, updated_at, appearance_catalog_id, scene_fingerprint)
VALUES
  ('aiphoto_asset_bank_samir_v1', NULL, 'aic_male_catalog_draft_samir_v1', 1, 'catalog/bank/v1/appearance_male_samir_v1/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'rooftop-cafe', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'appearance_male_samir_v1', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_malik_v1', NULL, 'aic_male_catalog_draft_malik_v1', 1, 'catalog/bank/v1/appearance_male_malik_v1/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'cafe', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'appearance_male_malik_v1', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_kenji_v1', NULL, 'aic_male_catalog_draft_kenji_v1', 1, 'catalog/bank/v1/appearance_male_kenji_v1/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'record-store', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'appearance_male_kenji_v1', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_diego_v1', NULL, 'aic_male_catalog_draft_diego_v1', 1, 'catalog/bank/v1/appearance_male_diego_v1/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'evening-street', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'appearance_male_diego_v1', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_arjun_v1', NULL, 'aic_male_catalog_draft_arjun_v1', 1, 'catalog/bank/v1/appearance_male_arjun_v1/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'terrace', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'appearance_male_arjun_v1', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_oliver_v1', NULL, 'aic_male_catalog_draft_oliver_v1', 1, 'catalog/bank/v1/appearance_male_oliver_v1/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'beach-boardwalk', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'appearance_male_oliver_v1', 'seed-lifestyle-v1')
ON CONFLICT(id) DO UPDATE SET
  object_key = excluded.object_key,
  metadata_json = excluded.metadata_json,
  generation_source = excluded.generation_source,
  status = excluded.status,
  updated_at = excluded.updated_at,
  appearance_catalog_id = excluded.appearance_catalog_id,
  scene_fingerprint = excluded.scene_fingerprint;
