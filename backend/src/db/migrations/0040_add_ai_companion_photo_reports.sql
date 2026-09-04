CREATE TABLE IF NOT EXISTS ai_companion_photo_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  photo_id TEXT NOT NULL REFERENCES ai_companion_photos(id),
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_companion_photo_reports_created_at_idx
  ON ai_companion_photo_reports(created_at);

CREATE INDEX IF NOT EXISTS ai_companion_photo_reports_photo_idx
  ON ai_companion_photo_reports(photo_id);
