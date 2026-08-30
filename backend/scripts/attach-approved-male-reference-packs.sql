-- Attach the approved six-image reference packs to the six private male catalog identities.
-- Reference 01 is each previously approved canonical portrait; 02–06 are the controlled
-- reference views stored in the private object catalog.

UPDATE ai_companion_appearance_catalog
SET reference_object_keys_json = json_array(
  'catalog/private/drafts/men-v1/samir/canonical.png',
  'catalog/private/drafts/men-v1/samir/references/02-front.png',
  'catalog/private/drafts/men-v1/samir/references/03-three-quarter.png',
  'catalog/private/drafts/men-v1/samir/references/04-profile.png',
  'catalog/private/drafts/men-v1/samir/references/05-full-body.png',
  'catalog/private/drafts/men-v1/samir/references/06-seated.png'
), updated_at = unixepoch() * 1000
WHERE id = 'appearance_male_samir_v1';

UPDATE ai_companion_appearance_catalog
SET reference_object_keys_json = json_array(
  'catalog/private/drafts/men-v1/malik/canonical.png',
  'catalog/private/drafts/men-v1/malik/references/02-front.png',
  'catalog/private/drafts/men-v1/malik/references/03-three-quarter.png',
  'catalog/private/drafts/men-v1/malik/references/04-profile.png',
  'catalog/private/drafts/men-v1/malik/references/05-full-body.png',
  'catalog/private/drafts/men-v1/malik/references/06-seated.png'
), updated_at = unixepoch() * 1000
WHERE id = 'appearance_male_malik_v1';

UPDATE ai_companion_appearance_catalog
SET reference_object_keys_json = json_array(
  'catalog/private/drafts/men-v1/kenji/canonical.png',
  'catalog/private/drafts/men-v1/kenji/references/02-front.png',
  'catalog/private/drafts/men-v1/kenji/references/03-three-quarter.png',
  'catalog/private/drafts/men-v1/kenji/references/04-profile.png',
  'catalog/private/drafts/men-v1/kenji/references/05-full-body.png',
  'catalog/private/drafts/men-v1/kenji/references/06-seated.png'
), updated_at = unixepoch() * 1000
WHERE id = 'appearance_male_kenji_v1';

UPDATE ai_companion_appearance_catalog
SET reference_object_keys_json = json_array(
  'catalog/private/drafts/men-v1/diego/canonical.png',
  'catalog/private/drafts/men-v1/diego/references/02-front.png',
  'catalog/private/drafts/men-v1/diego/references/03-three-quarter.png',
  'catalog/private/drafts/men-v1/diego/references/04-profile.png',
  'catalog/private/drafts/men-v1/diego/references/05-full-body.png',
  'catalog/private/drafts/men-v1/diego/references/06-seated.png'
), updated_at = unixepoch() * 1000
WHERE id = 'appearance_male_diego_v1';

UPDATE ai_companion_appearance_catalog
SET reference_object_keys_json = json_array(
  'catalog/private/drafts/men-v1/arjun/canonical.png',
  'catalog/private/drafts/men-v1/arjun/references/02-front.png',
  'catalog/private/drafts/men-v1/arjun/references/03-three-quarter.png',
  'catalog/private/drafts/men-v1/arjun/references/04-profile.png',
  'catalog/private/drafts/men-v1/arjun/references/05-full-body.png',
  'catalog/private/drafts/men-v1/arjun/references/06-seated.png'
), updated_at = unixepoch() * 1000
WHERE id = 'appearance_male_arjun_v1';

UPDATE ai_companion_appearance_catalog
SET reference_object_keys_json = json_array(
  'catalog/private/drafts/men-v1/oliver/canonical.png',
  'catalog/private/drafts/men-v1/oliver/references/02-front.png',
  'catalog/private/drafts/men-v1/oliver/references/03-three-quarter.png',
  'catalog/private/drafts/men-v1/oliver/references/04-profile.png',
  'catalog/private/drafts/men-v1/oliver/references/05-full-body.png',
  'catalog/private/drafts/men-v1/oliver/references/06-seated.png'
), updated_at = unixepoch() * 1000
WHERE id = 'appearance_male_oliver_v1';

UPDATE ai_companion_visual_identities
SET reference_object_keys_json = (
  SELECT reference_object_keys_json
  FROM ai_companion_appearance_catalog
  WHERE id = 'appearance_male_samir_v1'
), updated_at = unixepoch() * 1000
WHERE companion_id = 'aic_male_catalog_draft_samir_v1';

UPDATE ai_companion_visual_identities
SET reference_object_keys_json = (
  SELECT reference_object_keys_json
  FROM ai_companion_appearance_catalog
  WHERE id = 'appearance_male_malik_v1'
), updated_at = unixepoch() * 1000
WHERE companion_id = 'aic_male_catalog_draft_malik_v1';

UPDATE ai_companion_visual_identities
SET reference_object_keys_json = (
  SELECT reference_object_keys_json
  FROM ai_companion_appearance_catalog
  WHERE id = 'appearance_male_kenji_v1'
), updated_at = unixepoch() * 1000
WHERE companion_id = 'aic_male_catalog_draft_kenji_v1';

UPDATE ai_companion_visual_identities
SET reference_object_keys_json = (
  SELECT reference_object_keys_json
  FROM ai_companion_appearance_catalog
  WHERE id = 'appearance_male_diego_v1'
), updated_at = unixepoch() * 1000
WHERE companion_id = 'aic_male_catalog_draft_diego_v1';

UPDATE ai_companion_visual_identities
SET reference_object_keys_json = (
  SELECT reference_object_keys_json
  FROM ai_companion_appearance_catalog
  WHERE id = 'appearance_male_arjun_v1'
), updated_at = unixepoch() * 1000
WHERE companion_id = 'aic_male_catalog_draft_arjun_v1';

UPDATE ai_companion_visual_identities
SET reference_object_keys_json = (
  SELECT reference_object_keys_json
  FROM ai_companion_appearance_catalog
  WHERE id = 'appearance_male_oliver_v1'
), updated_at = unixepoch() * 1000
WHERE companion_id = 'aic_male_catalog_draft_oliver_v1';
