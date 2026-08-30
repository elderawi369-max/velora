UPDATE ai_companion_visual_identities
SET locked_traits_json = json_set(
  locked_traits_json,
  '$.build',
  'slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size'
),
updated_at = unixepoch() * 1000
WHERE json_extract(locked_traits_json, '$.identity') = 'woman';
