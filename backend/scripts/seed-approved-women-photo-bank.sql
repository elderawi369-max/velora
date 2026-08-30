-- Approved women lifestyle photo bank, one immediate fallback asset per catalog identity.
INSERT INTO ai_companion_photo_assets (id, user_id, companion_id, visual_identity_version, object_key, metadata_json, generation_source, status, created_at, updated_at, appearance_catalog_id, scene_fingerprint)
VALUES
  ('aiphoto_asset_bank_alexa_v1', NULL, 'aic_4562251e-b22c-4fb0-98c5-f5ecb8a73e94', 1, 'catalog/bank/v1/catalog-alexa/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'bookstore', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-alexa', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_lisa_v1', NULL, 'aic_c2052139-b98b-4933-ad59-75b22380bcd1', 1, 'catalog/bank/v1/catalog-lisa/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'cafe', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-lisa', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_lora_v1', NULL, 'aic_5270f5c3-a983-41a1-8ef5-4ccd3027c769', 1, 'catalog/bank/v1/catalog-lora/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'rooftop', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-lora', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_maya_v1', NULL, 'aic_499671aa-9c64-4246-817a-d3f0d493079e', 1, 'catalog/bank/v1/catalog-maya/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'flower-market', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-maya', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_monica_v1', NULL, 'aic_6c99a138-52b4-475d-ad7d-5d832ab89f77', 1, 'catalog/bank/v1/catalog-monica/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'coast', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-monica', 'seed-lifestyle-v1'),
  ('aiphoto_asset_bank_sarah_v1', NULL, 'aic_d0a68b1d-0ad9-46c6-a103-54dc71e8214d', 1, 'catalog/bank/v1/catalog-sarah/seed-lifestyle/01-lifestyle.png', json_object('approved', true, 'scene', 'kitchen', 'syntheticProvenance', 'imagegen'), 'imagegen-approved-v1', 'approved', unixepoch() * 1000, unixepoch() * 1000, 'catalog-sarah', 'seed-lifestyle-v1')
ON CONFLICT(id) DO UPDATE SET
  object_key = excluded.object_key,
  metadata_json = excluded.metadata_json,
  generation_source = excluded.generation_source,
  status = excluded.status,
  updated_at = excluded.updated_at,
  appearance_catalog_id = excluded.appearance_catalog_id,
  scene_fingerprint = excluded.scene_fingerprint;
